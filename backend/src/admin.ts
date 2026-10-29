import express, { Router } from 'express';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { q, q1, tx, productos, boxes, registrar, diferencias } from './db.js';
import { HttpError } from './errores.js';
import { ESTADOS, VENDIDOS, cambiarEstado, reclamarComprobante, RecargoMp, leerRecargoMp, guardarRecargoMp, Retiro, leerRetiro, guardarRetiro } from './pedidos.js';
import { HOY_UY, ZONA_UY } from './publico.js';
import { soloAdmin } from './auth.js';
import { guardarImagen, leerPrivado } from './imagenes.js';
import { AjustesPagos, guardarAjustesPagos, leerAjustesPagos } from './pagosManuales.js';
import { NuevoCupon, listarCupones } from './cupones.js';

export const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url));

export const adminRouter = Router();

// El login es el de todos (/api/auth): acá solo entra una sesión con rol admin
adminRouter.use(soloAdmin);

// Para configurar TRUST_PROXY: "ip" tiene que ser la IP real de quien navega (comparala con https://ifconfig.me)
adminRouter.get('/diagnostico', (req, res) => {
  res.json({ ip: req.ip, xForwardedFor: req.headers['x-forwarded-for'] ?? null, trustProxy: req.app.get('trust proxy') });
});

// ---------- Métricas ----------

adminRouter.get('/resumen', async (req, res) => {
  const dias = z.coerce.number().int().min(1).max(365).catch(30).parse(req.query.dias);
  const { d: desde } = (await q1<{ d: string }>(`SELECT (${HOY_UY} - $1::int)::text AS d`, [dias - 1]))!;
  const suma = (tipo: string, limite = 10) => q(
    'SELECT ref, SUM(n)::int AS n FROM eventos WHERE tipo = $1 AND dia >= $2 GROUP BY ref ORDER BY n DESC LIMIT $3', [tipo, desde, limite]);

  // Todos los días del rango, aunque no haya visitas
  const porDia = new Map((await q<{ dia: string; n: number }>("SELECT dia, SUM(n)::int AS n FROM eventos WHERE tipo = 'visita' AND dia >= $1 GROUP BY dia", [desde])).map(r => [r.dia, r.n]));
  const visitasPorDia = Array.from({ length: dias }, (_, i) => {
    const d = new Date(desde + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    const dia = d.toISOString().slice(0, 10);
    return { dia, n: porDia.get(dia) ?? 0 };
  });

  const totales = Object.fromEntries((await q<{ tipo: string; n: number }>('SELECT tipo, SUM(n)::int AS n FROM eventos WHERE dia >= $1 GROUP BY tipo', [desde])).map(r => [r.tipo, r.n]));

  const pedidos = await q(`SELECT estado, COUNT(*)::int AS cantidad, SUM(total)::int AS total FROM pedidos
    WHERE (creado AT TIME ZONE '${ZONA_UY}')::date >= $1 GROUP BY estado`, [desde]);

  // ---- Ventas: pedidos pagados (o ya enviados/entregados) del período ----
  const VENDIDO = `estado IN ${VENDIDOS} AND (creado AT TIME ZONE '${ZONA_UY}')::date >= $1`;
  const ventas = {
    resumen: await q1(`SELECT COUNT(*)::int AS pedidos, COALESCE(SUM(total), 0)::int AS total,
      COALESCE(ROUND(AVG(total)), 0)::int AS ticket FROM pedidos WHERE ${VENDIDO}`, [desde]),
    // Cada línea del pedido (producto o box) con sus unidades y lo facturado
    masVendidos: await q(`SELECT l->>'nombre' AS ref, SUM((l->>'cantidad')::int)::int AS unidades, SUM((l->>'total')::int)::int AS n
      FROM pedidos, jsonb_array_elements(items) l WHERE ${VENDIDO} GROUP BY 1 ORDER BY n DESC LIMIT 10`, [desde]),
    porPago: await q(`SELECT pago AS ref, COUNT(*)::int AS pedidos, SUM(total)::int AS n FROM pedidos WHERE ${VENDIDO} GROUP BY 1 ORDER BY n DESC`, [desde]),
    porEntrega: await q(`SELECT entrega AS ref, COUNT(*)::int AS n FROM pedidos WHERE ${VENDIDO} GROUP BY 1 ORDER BY n DESC`, [desde]),
  };

  // ---- Embudo: de la visita al pago (los primeros pasos son eventos anónimos) ----
  const creados = await q1<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pedidos WHERE (creado AT TIME ZONE '${ZONA_UY}')::date >= $1`, [desde]);
  const embudo = [
    { paso: 'Visitas', n: totales.visita ?? 0 },
    { paso: 'Agregaron al carrito', n: totales.carrito_agregar ?? 0 },
    { paso: 'Llegaron al checkout', n: totales.checkout ?? 0 },
    { paso: 'Empezaron a llenar sus datos', n: totales.checkout_datos ?? 0 },
    { paso: 'Hicieron el pedido', n: creados!.n },
    { paso: 'Pagaron', n: ventas.resumen!.pedidos },
  ];

  // ---- Para vender más ----
  // Período anterior, del mismo largo, para comparar
  const anterior = await q1(`SELECT COUNT(*)::int AS pedidos, COALESCE(SUM(total), 0)::int AS total, COALESCE(ROUND(AVG(total)), 0)::int AS ticket,
      (SELECT COALESCE(SUM(n), 0)::int FROM eventos WHERE tipo = 'visita' AND dia >= $1::date - $2::int AND dia < $1::date) AS visitas
    FROM pedidos WHERE estado IN ${VENDIDOS}
      AND (creado AT TIME ZONE '${ZONA_UY}')::date >= $1::date - $2::int AND (creado AT TIME ZONE '${ZONA_UY}')::date < $1::date`, [desde, dias]);

  // Cuántas veces se vio cada box y cuántas se vendieron
  const conversionBoxes = await q(`SELECT b.nombre AS ref, COALESCE(v.vistas, 0)::int AS vistas, COALESCE(c.vendidas, 0)::int AS vendidas
    FROM boxes b
    LEFT JOIN (SELECT ref, SUM(n) AS vistas FROM eventos WHERE tipo = 'box_ver' AND dia >= $1 GROUP BY ref) v ON v.ref = b.nombre
    LEFT JOIN (SELECT l->>'id' AS id, SUM((l->>'cantidad')::int) AS vendidas FROM pedidos, jsonb_array_elements(items) l
      WHERE ${VENDIDO} AND l->>'tipo' = 'box' GROUP BY 1) c ON c.id = b.id
    WHERE b.activo ORDER BY vistas DESC, b.nombre`, [desde]);

  // Cuándo se hacen los pedidos (todos los creados: muestra cuándo compra la gente, pague o no)
  const CREADO = `(creado AT TIME ZONE '${ZONA_UY}')`;
  const porDiaSemana = await q(`SELECT EXTRACT(ISODOW FROM ${CREADO})::int AS dia, COUNT(*)::int AS n FROM pedidos WHERE ${CREADO}::date >= $1 GROUP BY 1`, [desde]);
  const porHora = await q(`SELECT EXTRACT(HOUR FROM ${CREADO})::int AS hora, COUNT(*)::int AS n FROM pedidos WHERE ${CREADO}::date >= $1 GROUP BY 1`, [desde]);

  const cupones = await q(`SELECT cupon AS ref, COUNT(*)::int AS pedidos, SUM(descuento)::int AS descuento, SUM(total)::int AS n
    FROM pedidos WHERE ${VENDIDO} AND cupon IS NOT NULL GROUP BY 1 ORDER BY n DESC`, [desde]);
  const porOrigen = await q(`SELECT COALESCE(origen, 'sin dato') AS ref, campana, COUNT(*)::int AS pedidos, SUM(total)::int AS n
    FROM pedidos WHERE ${VENDIDO} GROUP BY 1, 2 ORDER BY n DESC LIMIT 15`, [desde]);

  // ---- Clientes (por email, pedidos pagados) ----
  const clientes = await q1(`WITH c AS (SELECT lower(email) AS email, MIN(creado) AS primera FROM pedidos
      WHERE estado IN ${VENDIDOS} GROUP BY 1)
    SELECT COUNT(*) FILTER (WHERE (primera AT TIME ZONE '${ZONA_UY}')::date >= $1)::int AS nuevos,
      COUNT(*) FILTER (WHERE (primera AT TIME ZONE '${ZONA_UY}')::date < $1 AND email IN (SELECT lower(email) FROM pedidos WHERE ${VENDIDO}))::int AS vuelven
    FROM c`, [desde]);
  const mejoresClientes = await q(`SELECT MAX(nombre) AS nombre, lower(email) AS email, COUNT(*)::int AS pedidos, SUM(total)::int AS n
    FROM pedidos WHERE estado IN ${VENDIDOS} GROUP BY 2 ORDER BY n DESC LIMIT 10`);

  res.json({
    dias, desde, visitasPorDia, totales, pedidos, ventas, embudo,
    anterior, conversionBoxes, porDiaSemana, porHora, cupones, porOrigen, clientes, mejoresClientes,
    paginas: await suma('visita'),
    boxesVistas: await suma('box_ver'),
    productosAgregados: await suma('arma_agregar'),
    stockBajo: await q('SELECT id, nombre, COALESCE(stock, 0) AS stock FROM productos WHERE activo AND controla_stock AND COALESCE(stock, 0) <= 3 ORDER BY 3'),
  });
});

// ---------- Catálogo ----------

adminRouter.get('/productos', async (_req, res) => {
  res.json(await productos.todos(false));
});

adminRouter.get('/boxes', async (_req, res) => {
  res.json(await boxes.todas(false));
});

const Precio = z.number().int().min(0).max(1_000_000);

// Las columnas salen de los esquemas zod de cada ruta (.strict()), nunca del body directo
async function actualizar(tabla: 'productos' | 'boxes', id: string, cambios: Record<string, unknown>) {
  const campos = Object.entries(cambios).filter(([, v]) => v !== undefined);
  if (!campos.length) throw new HttpError(400, 'No hay cambios');
  const set = campos.map(([k], i) => `${k} = $${i + 1}`).join(', ');
  const r = await q(`UPDATE ${tabla} SET ${set} WHERE id = $${campos.length + 1} RETURNING id`, [...campos.map(([, v]) => v), id]);
  if (!r.length) throw new HttpError(404, 'No encontrado');
}

adminRouter.patch('/productos/:id', async (req, res) => {
  const { controlaStock, ...cambios } = z.object({
    precio: Precio.optional(),
    stock: z.number().int().min(0).nullable().optional(),
    controlaStock: z.boolean().optional(), // false = "Ignorar stock"
    activo: z.boolean().optional(),
  }).strict().parse(req.body);
  const actual = await productos.uno(req.params.id);
  if (!actual) throw new HttpError(404, 'No encontrado');
  if ((controlaStock ?? actual.controlaStock) && (cambios.stock === undefined ? actual.stockCargado : cambios.stock) === null) {
    throw new HttpError(400, 'Cargá la cantidad de stock, o activá "Ignorar stock"');
  }
  const nuevo = await tx(async () => {
    await actualizar('productos', req.params.id, { ...cambios, controla_stock: controlaStock });
    const nuevo = (await productos.uno(req.params.id))!;
    const d = diferencias(actual, nuevo, ['precio', 'stockCargado', 'controlaStock', 'activo']);
    if (Object.keys(d).length) await registrar(res.locals.usuario.email, 'producto', actual.id, 'editar', d);
    return nuevo;
  });
  res.json(nuevo);
});

adminRouter.patch('/boxes/:id', async (req, res) => {
  const cambios = z.object({ precio: Precio.optional(), activo: z.boolean().optional() }).strict().parse(req.body);
  const antes = await boxes.una(req.params.id);
  if (!antes) throw new HttpError(404, 'No encontrado');
  const nueva = await tx(async () => {
    await actualizar('boxes', req.params.id, cambios);
    const nueva = (await boxes.una(req.params.id))!;
    const d = diferencias(antes, nueva, ['precio', 'activo']);
    if (Object.keys(d).length) await registrar(res.locals.usuario.email, 'box', antes.id, 'editar', d);
    return nueva;
  });
  res.json(nueva);
});

// Se reconoce el formato por los primeros bytes del archivo, no por lo que dice el navegador
function tipoDeImagen(b: Buffer): string | undefined {
  if (b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Body = la imagen tal cual. Va al bucket (o al disco en desarrollo) con el mismo nombre que las demás fotos
adminRouter.put('/productos/:id/foto', express.raw({ type: 'image/*', limit: '5mb' }), async (req, res) => {
  const p = await productos.uno(req.params.id);
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  const tipo = Buffer.isBuffer(req.body) ? tipoDeImagen(req.body) : undefined;
  if (!tipo) throw new HttpError(400, 'Mandá una imagen JPG, PNG o WebP');

  const ruta = `arma-tu-box/producto-${p.id}.${EXT[tipo]}`; // el id ya existe en la base: no hay rutas raras
  await guardarImagen(ruta, req.body, tipo);
  // ?v= hace que el navegador no muestre la foto vieja que tenía guardada
  const foto = `assets/img/${ruta}?v=${Date.now()}`;
  await tx(async () => {
    await actualizar('productos', p.id, { foto });
    await registrar(res.locals.usuario.email, 'producto', p.id, 'foto', { foto: [p.foto, foto] });
  });
  res.json(await productos.uno(p.id));
});

// Comprobante de pago subido por el cliente (archivo privado: solo lo ve el admin)
adminRouter.get('/pedidos/:id/comprobante', async (req, res) => {
  const p = await q1<{ comprobante: string | null; comprobante_tipo: string }>('SELECT comprobante, comprobante_tipo FROM pedidos WHERE id = $1', [Number(req.params.id)]);
  if (!p?.comprobante) throw new HttpError(404, 'Este pedido no tiene comprobante');
  res.set({ 'Content-Type': p.comprobante_tipo, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' }).send(await leerPrivado(p.comprobante));
});

// ---------- Ajustes ----------

adminRouter.get('/ajustes/pagos', async (_req, res) => {
  res.json(await leerAjustesPagos());
});
adminRouter.put('/ajustes/pagos', async (req, res) => {
  const valor = AjustesPagos.parse(req.body);
  await guardarAjustesPagos(valor, res.locals.usuario.email);
  res.json(valor);
});

// ---------- Cupones (códigos de descuento) ----------

adminRouter.get('/cupones', async (_req, res) => {
  res.json(await listarCupones());
});
adminRouter.post('/cupones', async (req, res) => {
  const c = NuevoCupon.parse(req.body);
  await tx(async () => {
    const r = await q(`INSERT INTO cupones (codigo, tipo, valor, minimo, usos_max, vence) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (codigo) DO NOTHING RETURNING codigo`, [c.codigo, c.tipo, c.valor, c.minimo, c.usosMax, c.vence]);
    if (!r.length) throw new HttpError(409, `Ya existe el código ${c.codigo}`);
    await registrar(res.locals.usuario.email, 'cupon', c.codigo, 'crear',
      { descuento: [null, c.tipo === 'porcentaje' ? `${c.valor}%` : `$${c.valor}`], minimo: [null, c.minimo], usosMax: [null, c.usosMax], vence: [null, c.vence] });
  });
  res.status(201).json(c);
});
// Se pausa / reactiva; no se borra (los pedidos guardan qué código usaron)
adminRouter.patch('/cupones/:codigo', async (req, res) => {
  const { activo } = z.object({ activo: z.boolean() }).strict().parse(req.body);
  await tx(async () => {
    const antes = await q1<{ activo: boolean }>('SELECT activo FROM cupones WHERE codigo = $1 FOR UPDATE', [req.params.codigo]);
    if (!antes) throw new HttpError(404, 'No encontrado');
    await q('UPDATE cupones SET activo = $1 WHERE codigo = $2', [activo, req.params.codigo]);
    if (antes.activo !== activo) await registrar(res.locals.usuario.email, 'cupon', req.params.codigo, 'editar', { activo: [antes.activo, activo] });
  });
  res.json({ ok: true });
});

// ---------- Notificaciones (campanita) ----------
// Cambios en pedidos que no hizo este admin: pedidos nuevos, comprobantes, pagos de Mercado Pago, vencimientos,
// cambios de otro admin. Salen del historial; "nueva" = posterior a la última vez que abrió la campanita.

export async function notificaciones(usuario: { id: number; email: string }) {
  const vistas = (await q1<{ v: Date | null }>('SELECT notif_vistas AS v FROM usuarios WHERE id = $1', [usuario.id]))?.v ?? new Date(0);
  const items = await q(`SELECT h.id, h.cuando, h.autor, h.accion, h.entidad_id AS pedido, h.cambios, h.cuando > $2 AS nueva,
      p.nombre, p.total, p.pago, p.estado
    FROM historial h LEFT JOIN pedidos p ON p.id::text = h.entidad_id
    WHERE h.entidad = 'pedido' AND h.autor <> $1 ORDER BY h.cuando DESC, h.id DESC LIMIT 30`, [usuario.email, vistas]);
  const { n } = (await q1<{ n: number }>(`SELECT COUNT(*)::int AS n FROM historial
    WHERE entidad = 'pedido' AND autor <> $1 AND cuando > $2`, [usuario.email, vistas]))!;
  return { noLeidas: n, items };
}

adminRouter.get('/notificaciones', async (_req, res) => {
  res.json(await notificaciones(res.locals.usuario));
});
adminRouter.post('/notificaciones/vistas', async (_req, res) => {
  await q('UPDATE usuarios SET notif_vistas = now() WHERE id = $1', [res.locals.usuario.id]);
  res.json({ ok: true });
});

// ---------- Ajustes: dirección de retiro ----------

adminRouter.get('/ajustes/retiro', async (_req, res) => {
  res.json(await leerRetiro());
});
adminRouter.put('/ajustes/retiro', async (req, res) => {
  const valor = Retiro.parse(req.body);
  await guardarRetiro(valor, res.locals.usuario.email);
  res.json(valor);
});

// ---------- Ajustes: recargo de Mercado Pago ----------

adminRouter.get('/ajustes/recargo-mp', async (_req, res) => {
  res.json(await leerRecargoMp());
});
adminRouter.put('/ajustes/recargo-mp', async (req, res) => {
  const valor = RecargoMp.parse(req.body);
  await guardarRecargoMp(valor, res.locals.usuario.email);
  res.json(valor);
});

// ---------- Historial ----------

adminRouter.get('/historial', async (req, res) => {
  const { entidad, id } = z.object({
    entidad: z.enum(['producto', 'box', 'pedido', 'ajustes', 'cupon']).optional().catch(undefined),
    id: z.string().max(60).optional().catch(undefined),
  }).parse(req.query);
  const filtros: string[] = [], params: unknown[] = [];
  if (entidad) { params.push(entidad); filtros.push(`entidad = $${params.length}`); }
  if (id) { params.push(id); filtros.push(`entidad_id = $${params.length}`); }
  res.json(await q(`SELECT * FROM historial ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''} ORDER BY cuando DESC, id DESC LIMIT 300`, params));
});

// ---------- Pedidos ----------

adminRouter.get('/pedidos', async (req, res) => {
  const estado = z.enum(ESTADOS).optional().catch(undefined).parse(req.query.estado);
  const filas = await q(`SELECT * FROM pedidos ${estado ? 'WHERE estado = $1' : ''} ORDER BY id DESC LIMIT 200`, estado ? [estado] : []);
  res.json(filas.map(({ token_pago: _t, ...p }) => p));
});

adminRouter.post('/pedidos/:id/reclamar-comprobante', async (req, res) => {
  await reclamarComprobante(Number(req.params.id), res.locals.usuario.email);
  res.json({ ok: true });
});

adminRouter.patch('/pedidos/:id', async (req, res) => {
  const { estado, rastreo } = z.object({ estado: z.enum(ESTADOS), rastreo: z.string().trim().max(60).optional() }).parse(req.body);
  res.json(await cambiarEstado(Number(req.params.id), estado, undefined, res.locals.usuario.email, rastreo));
});
