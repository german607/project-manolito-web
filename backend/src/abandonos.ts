import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { q, q1, productos, boxes } from './db.js';
import { HttpError } from './errores.js';
import { enviarMail, plantilla, parrafo, esc } from './mail.js';
import { Item, fotoModelo } from './pedidos.js';

// Carritos abandonados: el checkout guarda el carrito apenas el cliente escribe su email. Si a las 24 h no hizo el pedido,
// le llega un mail con las fotos de lo que eligió y un link que le devuelve el carrito. Una única vez por carrito:
// si vuelve con el mismo carrito no se repite; si lo cambia, es otro carrito
// El mail no lleva texto libre del carrito (nombre del bebé, estampado): cualquiera puede escribir un email ajeno
export const ESPERA_HORAS = 24;

const Guardar = z.object({ email: z.email().max(120).transform(e => e.toLowerCase()), items: z.array(Item).min(1).max(30) });

export const abandonosRouter = Router();

abandonosRouter.post('/carritos-abandonados', async (req, res) => {
  const { email, items } = Guardar.parse(req.body);
  await q(`INSERT INTO carritos_abandonados (email, items, token) VALUES ($1, $2, $3)
    ON CONFLICT (email) DO UPDATE SET items = $2, actualizado = now(),
      enviado = CASE WHEN carritos_abandonados.items = $2::jsonb THEN carritos_abandonados.enviado END`,
  [email, JSON.stringify(items), randomBytes(24).toString('hex')]);
  res.sendStatus(204);
});

// Link del mail: devuelve el carrito para cargarlo de nuevo en el navegador
abandonosRouter.get('/carritos-abandonados/:token', async (req, res) => {
  const r = await q1<{ items: unknown }>('SELECT items FROM carritos_abandonados WHERE token = $1', [req.params.token]);
  if (!r) throw new HttpError(404, 'Este link ya no está disponible');
  res.json({ items: r.items });
});

// Corre cada 5 min (server.ts). Entre las 24 y las 72 h: si el server estuvo caído, uno más viejo ya no se reclama
export async function recuperarCarritos() {
  const web = process.env.FRONTEND_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';
  const pendientes = await q<{ email: string; items: z.infer<typeof Item>[]; token: string }>(`SELECT c.email, c.items, c.token FROM carritos_abandonados c
    WHERE c.enviado IS NULL AND c.actualizado <= now() - make_interval(hours => $1) AND c.actualizado > now() - make_interval(hours => $1 + 48)
      AND NOT EXISTS (SELECT 1 FROM pedidos p WHERE lower(p.email) = c.email AND p.creado >= c.actualizado - interval '1 hour')`, [ESPERA_HORAS]);
  for (const c of pendientes) {
    // Se marca antes de mandar: si el mail falla no se reintenta (mejor uno de menos que dos)
    await q('UPDATE carritos_abandonados SET enviado = now() WHERE email = $1', [c.email]);
    const filas: string[] = [];
    for (const it of c.items) {
      const item = it.tipo === 'box' ? await boxes.una(it.id) : await productos.uno(it.id);
      if (!item?.activo) continue;
      const foto = (it.tipo === 'producto' && fotoModelo(it.modelo)) || item.foto; // portachupete suelto: la foto del modelo elegido
      filas.push(`<tr><td width="76" style="padding:8px 12px 8px 0">${foto ? `<img src="${esc(web)}/${esc(foto.replace(/^\//, ''))}" width="64" height="64" alt="" style="display:block;border-radius:12px;object-fit:cover;border:0">` : ''}</td>` +
        `<td style="font-size:15px;color:#3F3A34"><b>${esc(item.nombre)}</b>${it.color ? `<br><span style="color:#7A6F62;font-size:13px">${esc(it.color)}</span>` : ''}</td></tr>`);
    }
    if (!filas.length) continue;
    const link = `${web}/checkout.html?carrito=${c.token}&utm_source=mail&utm_campaign=carrito-abandonado`;
    const intro = '¡Hola! Vimos que estuviste eligiendo algo muy especial para un bebé, y te quedó solo un pasito para que sea tuyo.';
    const guardado = 'Guardamos tu carrito tal cual lo dejaste, así lo retomás cuando quieras. Nosotros nos encargamos de prepararlo con todo nuestro cariño para que llegue perfecto.';
    const fin = '¿Te quedó alguna duda? Respondé este mail y te ayudamos.'; // en el HTML ya lo dice el pie de la plantilla
    await enviarMail(c.email, 'Te falta solo el último paso 💛', {
      texto: `${intro}\n\n${guardado}\n\nTerminar mi compra: ${link}\n\n${fin}`,
      html: plantilla({ titulo: 'Te falta solo el último paso', intro,
        cuerpo: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${filas.join('')}</table>${parrafo(guardado)}`,
        boton: { texto: 'Terminar mi compra', url: link } }),
    });
  }
  return pendientes.length;
}
