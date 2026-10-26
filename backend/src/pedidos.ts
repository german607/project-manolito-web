import { Router } from 'express';
import { z } from 'zod';
import { q, q1, tx, productos, boxes, registrar, STOCK_SQL, type Autor, type Producto, type Box } from './db.js';
import { HttpError } from './errores.js';
import { aplicarCupon, usarCupon, sumarUso, Codigo } from './cupones.js';
import { enviarMail, plantilla, parrafo, caja, esc } from './mail.js';
import { crearPreferencia, firmaValida, MOTIVOS_RECHAZO, obtenerPago, pagarConTarjeta, type PagoMP } from './mercadopago.js';
import { crearToken, datosDePago, datosEnTexto, linkComprobante, MANUALES, pedidoConToken } from './pagosManuales.js';

export const ESTADOS = ['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'] as const;
const LETRAS_INCLUIDAS = 5;
const PRECIO_LETRA_EXTRA = 20;
const RECARGO_MERCADOPAGO = 0.10; // "Mercado Pago (con 10% adicional)" según las preguntas frecuentes
export const VENCE_HORAS = 2; // pedidos sin pagar se cancelan solos y liberan el stock
const AVISO_VENCE = `Tenés ${VENCE_HORAS} horas para hacer el pago; si no, el pedido se cancela automáticamente.`;

export const Item = z.object({
  tipo: z.enum(['producto', 'box']),
  id: z.string(),
  cantidad: z.number().int().min(1).max(20).default(1),
  color: z.string().optional(),
  nombreBebe: z.string().trim().max(20).optional(),
  estampado: z.string().trim().max(60).optional(), // qué estampado quiere (solo con color "Estampada")
  modelo: z.string().trim().max(120).optional(), // modelo de portachupete elegido (material, lámina, detalle)
  armado: z.string().trim().min(1).max(40).optional(), // id del armado de "Armá tu box" al que pertenece (lo genera el navegador)
});

const Pago = z.enum(['transferencia', 'abitab_redpagos', 'prex_midinero', 'mercadopago']);

export const PedidoInput = z.object({
  cliente: z.object({
    nombre: z.string().trim().min(2).max(80),
    telefono: z.string().trim().min(6).max(30),
    email: z.email().max(120),
    direccion: z.string().trim().max(200).optional(),
  }),
  entrega: z.enum(['cadeteria', 'pickup', 'interior']),
  pago: Pago,
  items: z.array(Item).min(1).max(30),
  cupon: Codigo.optional(),
}).refine(p => p.entrega === 'pickup' || !!p.cliente.direccion, {
  message: 'La dirección es obligatoria salvo para pick-up', path: ['cliente', 'direccion'],
});
export type PedidoInput = z.infer<typeof PedidoInput>;

export const CarritoInput = z.object({
  items: z.array(Item).max(30),
  pago: Pago.default('transferencia'),
  cupon: z.string().max(40).optional(), // se valida al aplicarlo: un código mal escrito se informa, no rompe la cotización
});

// componentes = stock que mueve la línea. Pedidos viejos no lo tienen: ver stockDe()
export type Linea = {
  tipo: 'producto' | 'box'; id: string; nombre: string; cantidad: number;
  color?: string; estampado?: string; nombreBebe?: string; modelo?: string; babero?: string /* pedidos viejos: color/modelo del babero de la box */; armado?: string; precioUnitario: number; total: number;
  componentes?: { id: string; cantidad: number }[];
};

export const letras = (s = '') => s.replace(/\s+/g, '').length;

// "Armá tu box": cada armado necesita al menos MIN_ARMADO productos distintos (pedido por la dueña).
// Devuelve los armados que no llegan, para rechazar el pedido o marcar esas líneas en el carrito.
export const MIN_ARMADO = 2;
const AVISO_ARMADO = `Cada armado de "Armá tu box" necesita al menos ${MIN_ARMADO} productos distintos`;
export function armadosIncompletos(items: z.infer<typeof Item>[]) {
  const porArmado = new Map<string, Set<string>>();
  for (const it of items) {
    if (it.tipo === 'producto' && it.armado) porArmado.set(it.armado, (porArmado.get(it.armado) ?? new Set()).add(it.id));
  }
  return new Set([...porArmado].filter(([, ids]) => ids.size < MIN_ARMADO).map(([a]) => a));
}

// Precio siempre calculado acá con los datos de la base: nunca se confía en el precio que manda el navegador
export async function calcular(
  input: { items: z.infer<typeof Item>[]; pago: z.infer<typeof Pago>; cupon?: string },
  buscarProducto: (id: string) => Promise<Producto | undefined>,
  buscarBox: (id: string) => Promise<Box | undefined>,
) {
  const lineas: Linea[] = [];
  for (const it of input.items) {
    if (it.tipo === 'box') {
      const b = await buscarBox(it.id);
      if (!b?.activo) throw new HttpError(400, `La box "${it.id}" no existe`);
      if (it.armado) throw new HttpError(400, 'Las boxes no van dentro de un armado');
      if (!it.nombreBebe && b.items.some(i => /portachupete/i.test(i))) throw new HttpError(400, `Falta el nombre del bebé para el portachupete de ${b.nombre}`);
      if (b.colores?.length && !it.color) throw new HttpError(400, `Elegí el color de ${b.nombre}`);
      if (it.color && !b.colores?.includes(it.color)) throw new HttpError(400, `Color "${it.color}" no disponible para ${b.nombre}`);
      // El babero de la box va del mismo color que la box
      const conPorta = b.componentes.some(c => c.id === 'porta');
      if (conPorta && !it.modelo) throw new HttpError(400, `Elegí el modelo del portachupete de ${b.nombre}`);
      if (it.modelo && !conPorta) throw new HttpError(400, `${b.nombre} no trae portachupete`);
      // La box no cobra letras extra en el portachupete (confirmado con Manolito): solo el portachupete suelto
      for (const c of b.componentes) {
        if (c.stock !== null && c.stock < c.cantidad * it.cantidad) throw new HttpError(409, `${b.nombre}: no queda stock de ${c.nombre}`);
      }
      lineas.push({ tipo: 'box', id: b.id, nombre: b.nombre, cantidad: it.cantidad, color: it.color, nombreBebe: it.nombreBebe, modelo: it.modelo, precioUnitario: b.precio, total: b.precio * it.cantidad,
        componentes: b.componentes.map(c => ({ id: c.id, cantidad: c.cantidad * it.cantidad })) });
      continue;
    }
    const p = await buscarProducto(it.id);
    if (!p?.activo) throw new HttpError(400, `El producto "${it.id}" no existe`);
    // Los productos se compran armando una box; solo el portachupete se vende suelto (desde su sección)
    if (!it.armado && !p.personalizable) throw new HttpError(400, `${p.nombre} se compra desde "Armá tu box" (mínimo ${MIN_ARMADO} productos)`);
    if (it.color && !p.colores?.includes(it.color)) throw new HttpError(400, `Color "${it.color}" no disponible para ${p.nombre}`);
    if (it.color === 'Estampada' && !it.estampado) throw new HttpError(400, `Falta contar qué estampado querés para ${p.nombre}`);
    if (it.estampado && it.color !== 'Estampada') throw new HttpError(400, `El estampado solo va con el color Estampada`);
    if (it.nombreBebe && !p.personalizable) throw new HttpError(400, `${p.nombre} no lleva nombre`);
    if (!it.nombreBebe && p.personalizable) throw new HttpError(400, `Falta el nombre del bebé para ${p.nombre}`);
    if (p.stock !== null && p.stock < it.cantidad) throw new HttpError(409, p.stock ? `Quedan solo ${p.stock} de ${p.nombre}` : `${p.nombre} está sin stock`);
    const extra = p.personalizable ? Math.max(0, letras(it.nombreBebe) - LETRAS_INCLUIDAS) * PRECIO_LETRA_EXTRA : 0;
    const unit = p.precio + extra;
    lineas.push({ tipo: 'producto', id: p.id, nombre: p.nombre, cantidad: it.cantidad, color: it.color, estampado: it.estampado, nombreBebe: it.nombreBebe, modelo: p.personalizable ? it.modelo : undefined, armado: it.armado, precioUnitario: unit, total: unit * it.cantidad,
      componentes: [{ id: p.id, cantidad: it.cantidad }] });
  }
  const subtotal = lineas.reduce((s, l) => s + l.total, 0);
  const { cupon, descuento } = input.cupon ? await aplicarCupon(input.cupon, subtotal) : { cupon: undefined, descuento: 0 };
  return { lineas, cupon, ...totales(subtotal, descuento, input.pago) };
}

// El recargo de Mercado Pago va sobre lo que se paga, ya con el descuento
function totales(subtotal: number, descuento: number, pago: z.infer<typeof Pago>) {
  const recargo = pago === 'mercadopago' ? Math.round((subtotal - descuento) * RECARGO_MERCADOPAGO) : 0;
  return { subtotal, descuento, recargo, total: subtotal - descuento + recargo };
}

export type Pedido = {
  id: number; creado: Date; estado: (typeof ESTADOS)[number]; nombre: string; telefono: string;
  email: string; direccion: string | null; entrega: string; pago: string; items: Linea[];
  subtotal: number; descuento: number; cupon: string | null; recargo: number; total: number; mp_payment_id: string | null; usuario_id: number | null;
  token_pago: string | null; comprobante: string | null; comprobante_tipo: string | null; comprobante_subido: Date | null;
};

// bloquear = trabar la fila hasta el fin de la transacción (para cambios de estado simultáneos)
export const buscarPedido = (id: number, bloquear = false) =>
  q1<Pedido>(`SELECT * FROM pedidos WHERE id = $1 ${bloquear ? 'FOR UPDATE' : ''}`, [id]);

// Los armados se numeran en el orden en que aparecen ("Armado 1", "Armado 2"): cada uno se empaca como una box
export const numerarArmados = (items: Linea[]) => [...new Set(items.map(l => l.armado).filter(Boolean))] as string[];

// Modelo de portachupete: "Silicona N° 4 — detalle". El número es interno (admin y aviso a Manolito);
// el cliente ve el material y la foto del modelo
export const fotoModelo = (m?: string) => {
  const r = /^(Silicona|Madera) N° (\d+)/.exec(m ?? '');
  return r ? `assets/img/portachupetes/modelos/${r[1].toLowerCase()}-${r[2]}.jpg` : null;
};
const modeloPublico = (m: string) => m.replace(/ N° \d+/, '');

// interno = con el número de modelo (aviso a Manolito)
const resumen = (p: Pedido, interno = false) => [
  ...p.items.map(l => `- ${l.cantidad} x ${l.nombre}${l.color ? ` (${l.color}${l.estampado ? `: ${l.estampado}` : ''})` : ''}${l.nombreBebe ? ` "${l.nombreBebe}"` : ''}${l.modelo ? ` [Modelo: ${interno ? l.modelo : modeloPublico(l.modelo)}]` : ''}${l.babero ? ` [Babero: ${l.babero}]` : ''}${l.armado ? ` (Armado ${numerarArmados(p.items).indexOf(l.armado) + 1})` : ''}: $${l.total}`),
  p.descuento ? `Descuento (${p.cupon}): -$${p.descuento}` : '',
  p.recargo ? `Recargo Mercado Pago: $${p.recargo}` : '',
  `Total: $${p.total}`,
  `Entrega: ${p.entrega}${p.direccion ? ` — ${p.direccion}` : ''} (el envío se coordina aparte)`,
].filter(Boolean).join('\n');

// El mismo resumen, como tabla para los mails HTML
const ENTREGA: Record<string, string> = { pickup: 'Retiro', envio: 'Envío' };
const resumenHtml = (p: Pedido) => {
  const armados = numerarArmados(p.items);
  const fila = (izq: string, der: string, fuerte = false) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #F3E6E0;font-size:14px;line-height:1.45;color:#3F3A34;${fuerte ? 'font-weight:700;font-size:16px;border-bottom:0' : ''}">${izq}</td>` +
    `<td align="right" valign="top" style="padding:10px 0 10px 12px;border-bottom:1px solid #F3E6E0;font-size:14px;white-space:nowrap;color:#3F3A34;font-weight:700;${fuerte ? 'font-size:16px;border-bottom:0' : ''}">${der}</td></tr>`;
  const detalle = (l: Linea) => [l.armado ? `Armado ${armados.indexOf(l.armado) + 1}` : '', l.color ? (l.estampado ? `Estampada: ${l.estampado}` : l.color) : '',
    l.nombreBebe ? `“${l.nombreBebe}”` : '', l.modelo ? `Modelo: ${modeloPublico(l.modelo)}` : '', l.babero ? `Babero: ${l.babero}` : ''].filter(Boolean).join(' · ');
  const web = process.env.FRONTEND_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';
  const foto = (l: Linea) => fotoModelo(l.modelo) ? `<br><img src="${esc(web)}/${fotoModelo(l.modelo)}" width="64" height="64" alt="Modelo elegido" style="display:block;margin-top:6px;border-radius:10px;object-fit:cover;border:0">` : '';
  return `<div style="font-family:'Baloo 2','Trebuchet MS',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#3F3A34;margin:8px 0 2px">Tu pedido #${p.id}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
${p.items.map(l => fila(`<b>${l.cantidad > 1 ? `${l.cantidad} × ` : ''}${esc(l.nombre)}</b>${detalle(l) ? `<br><span style="color:#7A6F62;font-size:13px">${esc(detalle(l))}</span>` : ''}${foto(l)}`, `$${l.total}`)).join('')}
${p.descuento ? fila(`Descuento (${esc(p.cupon)})`, `-$${p.descuento}`) : ''}
${p.recargo ? fila('Recargo Mercado Pago', `$${p.recargo}`) : ''}
${fila('Total', `$${p.total}`, true)}
</table>
<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#7A6F62">Entrega: ${esc(ENTREGA[p.entrega] ?? p.entrega)}${p.direccion ? ` — ${esc(p.direccion)}` : ''} (el envío se coordina aparte)</p>`;
};
// Mail al cliente: texto (como antes) + HTML con la plantilla de la web
const mailCliente = (p: Pedido, m: { titulo: string; intro: string; antes?: string; despues?: string; textoExtra?: string; boton?: { texto: string; url: string } }) => ({
  texto: `${m.intro}\n\n${resumen(p)}${m.textoExtra ? `\n\n${m.textoExtra}` : ''}${m.boton ? `\n\n${m.boton.texto}: ${m.boton.url}` : ''}`,
  html: plantilla({ titulo: m.titulo, intro: m.intro, cuerpo: (m.antes ?? '') + resumenHtml(p) + (m.despues ?? ''), boton: m.boton }),
});

// Qué stock mueve cada línea. Pedidos anteriores a guardar `componentes`:
// sus productos sueltos sí descontaban, sus boxes no (y por eso tampoco devuelven nada).
const stockDe = (l: Linea) => l.componentes ?? (l.tipo === 'producto' ? [{ id: l.id, cantidad: l.cantidad }] : []);

// FOR UPDATE: dos compras simultáneas de la última unidad no pueden pasar las dos
async function descontarStock(lineas: Linea[]) {
  for (const c of lineas.flatMap(stockDe)) {
    const p = await q1<{ nombre: string; stock: number | null }>(`SELECT nombre, ${STOCK_SQL} AS stock FROM productos WHERE id = $1 FOR UPDATE`, [c.id]);
    if (!p || p.stock === null) continue; // "Ignorar stock": no se mira ni se toca la cantidad
    if (p.stock < c.cantidad) throw new HttpError(409, `No hay stock suficiente de ${p.nombre}`);
    await q('UPDATE productos SET stock = stock - $1 WHERE id = $2', [c.cantidad, c.id]);
  }
}
async function devolverStock(lineas: Linea[]) {
  for (const c of lineas.flatMap(stockDe)) {
    await q('UPDATE productos SET stock = COALESCE(stock, 0) + $1 WHERE id = $2 AND controla_stock', [c.cantidad, c.id]);
  }
}

// Cancelar devuelve el stock; reactivar un cancelado lo vuelve a descontar (409 si ya no hay)
// autor: quién lo cambia (queda en el historial): email del admin, 'mercadopago' o 'sistema' (vencimiento)
export async function cambiarEstado(id: number, estado: Pedido['estado'], mpPaymentId?: string, autor: Autor = 'sistema') {
  const p = await tx(async () => {
    const antes = await buscarPedido(id, true);
    if (!antes) throw new HttpError(404, 'Pedido no encontrado');
    if (estado === 'cancelado' && antes.estado !== 'cancelado') { await devolverStock(antes.items); if (antes.cupon) await sumarUso(antes.cupon, -1); }
    if (antes.estado === 'cancelado' && estado !== 'cancelado') { await descontarStock(antes.items); if (antes.cupon) await sumarUso(antes.cupon, 1); }
    if (antes.estado !== estado) await registrar(autor, 'pedido', id, 'estado', { estado: [antes.estado, estado] });
    return (await q1<Pedido>('UPDATE pedidos SET estado = $1, mp_payment_id = COALESCE($2, mp_payment_id) WHERE id = $3 RETURNING *',
      [estado, mpPaymentId ?? null, id]))!;
  });
  if (estado === 'enviado') enviarMail(p.email, `Tu pedido Manolito #${p.id} está en camino`,
    mailCliente(p, { titulo: '¡Tu pedido está en camino!', intro: `¡Hola ${p.nombre}! Tu pedido ya salió. Esperamos que lo disfruten mucho.` }));
  // Pago confirmado: por Mercado Pago o marcado a mano por el admin (transferencia, Abitab, Prex)
  if (estado === 'pagado') enviarMail(p.email, `Recibimos el pago de tu pedido Manolito #${p.id}`,
    mailCliente(p, { titulo: '¡Pago confirmado!', intro: `¡Hola ${p.nombre}! Ya está confirmado el pago. Ahora preparamos tu pedido con mucho cariño y te avisamos cuando lo enviemos.` }));
  return p;
}

export const insertar = (input: PedidoInput, c: Awaited<ReturnType<typeof calcular>>, usuarioId: number | null = null, autor: Autor = 'cliente') => tx(async () => {
  await descontarStock(c.lineas);
  if (c.cupon) await usarCupon(c.cupon);
  const { cliente } = input;
  const r = await q1<{ id: number }>(`INSERT INTO pedidos (nombre, telefono, email, direccion, entrega, pago, items, subtotal, descuento, cupon, recargo, total, usuario_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`, [
    cliente.nombre, cliente.telefono, cliente.email, cliente.direccion ?? null, input.entrega, input.pago,
    JSON.stringify(c.lineas), c.subtotal, c.descuento, c.cupon ?? null, c.recargo, c.total, usuarioId]);
  await registrar(autor, 'pedido', r!.id, 'crear', { total: [null, c.total], pago: [null, input.pago], ...(c.cupon ? { cupon: [null, c.cupon] } : {}) });
  return r!.id;
});

// Cancela los pedidos pendientes de pago con más de VENCE_HORAS y avisa al cliente. Corre cada 5 min (server.ts)
export async function vencerPedidos() {
  // Con comprobante subido no vence: queda en revisión hasta que el admin confirme (o cancele) el pago
  const vencidos = await q<{ id: number }>("SELECT id FROM pedidos WHERE estado = 'pendiente' AND comprobante IS NULL AND creado <= now() - make_interval(hours => $1)", [VENCE_HORAS]);
  for (const { id } of vencidos) {
    const p = await cambiarEstado(id, 'cancelado', undefined, 'sistema (venció sin pago)');
    const fin = 'Si todavía lo querés, podés hacerlo de nuevo en la web o escribirnos por Instagram.';
    enviarMail(p.email, `Tu pedido Manolito #${id} se canceló`, mailCliente(p, {
      titulo: 'Tu pedido se canceló', intro: `¡Hola ${p.nombre}! Pasaron ${VENCE_HORAS} horas sin que recibiéramos el pago, así que el pedido se canceló.`,
      textoExtra: fin, despues: parrafo(fin), boton: { texto: 'Volver a la tienda', url: process.env.FRONTEND_URL ?? process.env.BASE_URL ?? 'http://localhost:3000' },
    }));
  }
  return vencidos.length;
}

export const pedidosRouter = Router();

// Cotiza el carrito sin crear el pedido. Cada ítem se valida por separado para poder marcar
// cuál falla (sin stock, desactivado...) sin perder el resto del carrito.
pedidosRouter.post('/carrito', async (req, res) => {
  const { items, pago, cupon } = CarritoInput.parse(req.body);
  const lineas: (Linea & { i: number; foto: string | null })[] = [];
  const avisos: { i: number; nombre?: string; error: string }[] = [];
  const incompletos = armadosIncompletos(items);
  for (const [i, it] of items.entries()) {
    const item = it.tipo === 'box' ? await boxes.una(it.id) : await productos.uno(it.id);
    try {
      if (it.armado && incompletos.has(it.armado)) throw new HttpError(400, `${AVISO_ARMADO}: agregá otro o quitá este`);
      lineas.push({ i, foto: item?.foto ?? null, ...(await calcular({ items: [it], pago }, productos.uno, boxes.una)).lineas[0] });
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      avisos.push({ i, nombre: item?.nombre, error: e.message });
    }
  }
  const subtotal = lineas.reduce((s, l) => s + l.total, 0);
  let descuento = 0, cuponError: string | undefined;
  if (cupon) {
    try { ({ descuento } = await aplicarCupon(cupon, subtotal)); } catch (e) { if (!(e instanceof HttpError)) throw e; cuponError = e.message; }
  }
  res.json({ lineas, avisos, ...totales(subtotal, descuento, pago), cupon: cupon && !cuponError ? cupon.trim().toUpperCase() : undefined, cuponError, mercadopago: !!process.env.MP_ACCESS_TOKEN, mpPublicKey: process.env.MP_PUBLIC_KEY ?? null });
});

pedidosRouter.post('/pedidos', async (req, res) => {
  const input = PedidoInput.parse(req.body);
  if (armadosIncompletos(input.items).size) throw new HttpError(400, AVISO_ARMADO);
  if (input.pago === 'mercadopago' && !process.env.MP_ACCESS_TOKEN) throw new HttpError(400, 'Mercado Pago no está disponible, elegí otro medio de pago');
  const usuario = res.locals.usuario as { id: number; email: string } | null;
  const id = await insertar(input, await calcular(input, productos.uno, boxes.una), usuario?.id ?? null, usuario?.email ?? 'cliente');
  const p = (await buscarPedido(id))!;

  let pagoUrl: string | undefined;
  if (p.pago === 'mercadopago') {
    // El pedido ya está guardado: si Mercado Pago falla no se pierde, queda pendiente para coordinar a mano.
    // Mercado Pago deja de aceptar el pago al mismo tiempo que vence el pedido
    const vence = new Date(Date.now() + VENCE_HORAS * 3600_000);
    pagoUrl = await crearPreferencia({ id, total: p.total, email: p.email, nombre: p.nombre, vence }).catch(e => { console.error(e); return undefined; });
  }
  // Pago manual (transferencia, Abitab, Prex): datos para pagar y token para subir el comprobante
  const manual = (MANUALES as readonly string[]).includes(p.pago);
  // Token del pedido: para ver los datos de pago y subir el comprobante (manual) o pagar con tarjeta acá mismo (Mercado Pago)
  const token = await crearToken(id);
  const datos = manual ? await datosDePago(p) : null;
  const instrucciones = pagoUrl ? undefined : `${datosEnTexto(datos)}\n\n${AVISO_VENCE}`;

  const link = linkComprobante(id, token);
  enviarMail(p.email, `Recibimos tu pedido Manolito #${id}`, p.pago === 'mercadopago'
    ? mailCliente(p, {
      titulo: '¡Gracias por tu pedido!', intro: `¡Hola ${p.nombre}! Recibimos tu pedido. Si todavía no completaste el pago, podés hacerlo con tarjeta desde el botón.`,
      textoExtra: AVISO_VENCE, despues: parrafo(AVISO_VENCE), boton: { texto: 'Pagar con tarjeta', url: link },
    })
    : mailCliente(p, {
      titulo: '¡Gracias por tu pedido!', intro: `¡Hola ${p.nombre}! Recibimos tu pedido. Te dejamos los datos para hacer el pago.`,
      textoExtra: `${instrucciones}${manual ? '\n\nCuando pagues, subí el comprobante (así el pedido no vence mientras lo revisamos)' : ''}`,
      despues: (datos ? caja(datos.titulo, datos.campos, datos.texto) : parrafo(datosEnTexto(null))) + parrafo(AVISO_VENCE) +
        (manual ? parrafo('Cuando pagues, subí el comprobante desde el botón: así el pedido no vence mientras lo revisamos.') : ''),
      boton: manual ? { texto: 'Subir comprobante', url: link } : undefined,
    }));
  if (process.env.ADMIN_EMAIL) {
    enviarMail(process.env.ADMIN_EMAIL, `Nuevo pedido #${id} — $${p.total}`,
      `${p.nombre} · ${p.telefono} · ${p.email}\nPago: ${p.pago}\n\n${resumen(p, true)}`, p.email); // "Responder" le escribe al cliente
  }

  res.status(201).json({ id, subtotal: p.subtotal, recargo: p.recargo, total: p.total, pagoUrl, instrucciones, token, datos });
});

// ---------- Mercado Pago ----------
// Todo lo que llega (webhook o vuelta del cliente) se verifica consultando el pago a la API de Mercado Pago:
// nunca se confía en lo que dice la notificación o la URL.

const avisarAdmin = (asunto: string, texto: string) => { if (process.env.ADMIN_EMAIL) enviarMail(process.env.ADMIN_EMAIL, asunto, texto); };

export async function procesarPago(paymentId: string): Promise<{ pago: PagoMP; pedido?: Pedido }> {
  const pago = await obtenerPago(paymentId);
  const p = await buscarPedido(Number(pago.external_reference));
  if (!p) return { pago };
  const coincide = pago.currency_id === 'UYU' && pago.transaction_amount >= p.total;

  if (pago.status === 'approved' && !coincide) {
    avisarAdmin(`⚠ Pago con monto o moneda distinta en el pedido #${p.id}`,
      `Mercado Pago aprobó el pago ${paymentId} por ${pago.currency_id} ${pago.transaction_amount}, pero el pedido #${p.id} es de UYU ${p.total}. No se marcó como pagado: revisalo en Mercado Pago.`);
  } else if (pago.status === 'approved' && p.estado === 'pendiente') {
    await cambiarEstado(p.id, 'pagado', paymentId, 'mercadopago');
  } else if (pago.status === 'approved' && p.estado === 'cancelado') {
    // Pago que entró después de vencer: se reactiva si queda stock; si no, hay que devolver la plata
    try {
      await cambiarEstado(p.id, 'pagado', paymentId, 'mercadopago');
    } catch (e) {
      if (!(e instanceof HttpError) || e.status !== 409) throw e;
      if (p.mp_payment_id !== paymentId) { // avisar una sola vez (Mercado Pago puede notificar varias veces)
        await q('UPDATE pedidos SET mp_payment_id = $1 WHERE id = $2', [paymentId, p.id]);
        avisarAdmin(`⚠ Pago de pedido vencido #${p.id}: devolver $${p.total}`,
          `Mercado Pago aprobó el pago ${paymentId} del pedido #${p.id} (${p.nombre}, ${p.telefono}), pero el pedido ya estaba cancelado y no hay stock para reactivarlo: ${e.message}.\nHay que devolver el dinero desde Mercado Pago o coordinar con el cliente.`);
      }
    }
  } else if ((pago.status === 'refunded' || pago.status === 'charged_back') && p.mp_payment_id === paymentId && p.estado !== 'cancelado') {
    // Devolución o contracargo: si no se envió, se cancela (y vuelve el stock); si ya se envió, solo se avisa
    const motivo = pago.status === 'refunded' ? 'devolución' : 'contracargo';
    if (p.estado === 'pagado' || p.estado === 'pendiente') await cambiarEstado(p.id, 'cancelado', undefined, `mercadopago (${motivo})`);
    avisarAdmin(`⚠ ${motivo === 'devolución' ? 'Devolución' : 'Contracargo'} en el pedido #${p.id}`,
      `Mercado Pago informa ${motivo} del pago ${paymentId} del pedido #${p.id} (${p.nombre}, ${p.telefono}, $${p.total}). ` +
      (p.estado === 'enviado' || p.estado === 'entregado' ? 'El pedido ya estaba enviado: revisalo.' : 'El pedido se canceló y el stock volvió.'));
  }
  return { pago, pedido: await buscarPedido(p.id) };
}

// Webhook configurado en el panel de Mercado Pago (Tus integraciones → Webhooks → evento "Pagos")
pedidosRouter.post('/mercadopago/webhook', async (req, res) => {
  if (!firmaValida(req)) throw new HttpError(401, 'Firma inválida');
  const tipo = req.query.type ?? req.body?.type;
  if (tipo === 'payment') await procesarPago(String(req.query['data.id']));
  res.sendStatus(200);
});

// Pago con tarjeta dentro de nuestra web (Card Payment Brick). Requiere el token del pedido
const Tarjeta = z.object({
  pedido: z.coerce.number().int().positive(),
  t: z.string().regex(/^[a-f0-9]{48}$/),
  formData: z.object({
    token: z.string().min(10).max(200),
    payment_method_id: z.string().min(2).max(40),
    issuer_id: z.union([z.string().max(20), z.number()]).optional(),
    installments: z.coerce.number().int().min(1).max(24),
    payer: z.object({
      email: z.email().max(120),
      identification: z.object({ type: z.string().max(20), number: z.string().max(30) }).optional(),
    }),
  }),
});
// ponytail: tope de intentos rechazados por pedido en memoria (por proceso); frena a quien prueba tarjetas robadas en serie
const rechazos = new Map<number, number>();
const MAX_RECHAZOS = 5;

pedidosRouter.post('/mercadopago/pagar', async (req, res) => {
  const { pedido: id, t, formData } = Tarjeta.parse(req.body);
  const p = await pedidoConToken(id, t);
  if (p.pago !== 'mercadopago') throw new HttpError(400, 'Este pedido no se paga con Mercado Pago');
  if (p.estado !== 'pendiente') throw new HttpError(409, p.estado === 'cancelado' ? 'El pedido venció. Hacelo de nuevo.' : 'Este pedido ya está pago.');
  if ((rechazos.get(id) ?? 0) >= MAX_RECHAZOS) throw new HttpError(429, 'Demasiados intentos rechazados para este pedido. Probá otro medio de pago o escribinos.');

  let pago: PagoMP;
  try {
    pago = await pagarConTarjeta(p, formData);
  } catch (e) {
    console.error('Mercado Pago (tarjeta):', e);
    throw new HttpError(502, 'No pudimos procesar el pago. Probá de nuevo en un rato.');
  }
  if (pago.status === 'rejected') rechazos.set(id, (rechazos.get(id) ?? 0) + 1);
  if (pago.status !== 'approved') console.log(`Mercado Pago (tarjeta): pedido #${id} → pago ${pago.id} ${pago.status} (${pago.status_detail})`);
  const { pedido } = await procesarPago(String(pago.id)); // misma verificación que el webhook: moneda, monto, historial, mails
  res.json({
    estado: pedido?.estado ?? p.estado, pago: pago.status, detalle: pago.status_detail,
    mensaje: pago.status === 'rejected' ? MOTIVOS_RECHAZO[pago.status_detail ?? ''] ?? 'El pago fue rechazado. Probá con otra tarjeta.' : undefined,
  });
});

// Vuelta del cliente desde Mercado Pago: confirma al instante (sin esperar el webhook) y dice el estado real
pedidosRouter.post('/mercadopago/confirmar', async (req, res) => {
  const { paymentId } = z.object({ paymentId: z.string().regex(/^\d{1,20}$/) }).parse(req.body);
  const { pago, pedido } = await procesarPago(paymentId);
  res.json({ pedido: pedido?.id ?? null, estado: pedido?.estado ?? null, pago: pago.status });
});
