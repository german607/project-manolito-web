import { Router } from 'express';
import { z } from 'zod';
import { db, productos, boxes, STOCK_SQL, type Producto, type Box } from './db.js';
import { HttpError } from './errores.js';
import { enviarMail } from './mail.js';
import { crearPreferencia, firmaValida, obtenerPago } from './mercadopago.js';

export const ESTADOS = ['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'] as const;
const LETRAS_INCLUIDAS = 5;
const PRECIO_LETRA_EXTRA = 20;
const RECARGO_MERCADOPAGO = 0.10;
export const VENCE_HORAS = 2; // pedidos sin pagar se cancelan solos y liberan el stock
const AVISO_VENCE = `Tenés ${VENCE_HORAS} horas para hacer el pago; si no, el pedido se cancela automáticamente.`; // "Mercado Pago (con 10% adicional)" según las preguntas frecuentes

export const Item = z.object({
  tipo: z.enum(['producto', 'box']),
  id: z.string(),
  cantidad: z.number().int().min(1).max(20).default(1),
  color: z.string().optional(),
  nombreBebe: z.string().trim().max(20).optional(),
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
}).refine(p => p.entrega === 'pickup' || !!p.cliente.direccion, {
  message: 'La dirección es obligatoria salvo para pick-up', path: ['cliente', 'direccion'],
});
export type PedidoInput = z.infer<typeof PedidoInput>;

export const CarritoInput = z.object({
  items: z.array(Item).max(30),
  pago: Pago.default('transferencia'),
});

// componentes = stock que mueve la línea. Pedidos viejos no lo tienen: ver stockDe()
export type Linea = {
  tipo: 'producto' | 'box'; id: string; nombre: string; cantidad: number;
  color?: string; nombreBebe?: string; precioUnitario: number; total: number;
  componentes?: { id: string; cantidad: number }[];
};

export const letras = (s = '') => s.replace(/\s+/g, '').length;

// Precio siempre calculado acá con los datos de la base: nunca se confía en el precio que manda el navegador
export function calcular(
  input: { items: z.infer<typeof Item>[]; pago: z.infer<typeof Pago> },
  buscarProducto: (id: string) => Producto | undefined,
  buscarBox: (id: string) => Box | undefined,
) {
  const lineas: Linea[] = input.items.map(it => {
    if (it.tipo === 'box') {
      const b = buscarBox(it.id);
      if (!b?.activo) throw new HttpError(400, `La box "${it.id}" no existe`);
      if (!it.nombreBebe && b.items.some(i => /portachupete/i.test(i))) throw new HttpError(400, `Falta el nombre del bebé para el portachupete de ${b.nombre}`);
      // ponytail: la box no cobra letras extra en el portachupete; confirmar con Manolito si corresponde
      for (const c of b.componentes) {
        if (c.stock !== null && c.stock < c.cantidad * it.cantidad) throw new HttpError(409, `${b.nombre}: no queda stock de ${c.nombre}`);
      }
      return { tipo: 'box', id: b.id, nombre: b.nombre, cantidad: it.cantidad, nombreBebe: it.nombreBebe, precioUnitario: b.precio, total: b.precio * it.cantidad,
        componentes: b.componentes.map(c => ({ id: c.id, cantidad: c.cantidad * it.cantidad })) };
    }
    const p = buscarProducto(it.id);
    if (!p?.activo) throw new HttpError(400, `El producto "${it.id}" no existe`);
    if (it.color && !p.colores?.includes(it.color)) throw new HttpError(400, `Color "${it.color}" no disponible para ${p.nombre}`);
    if (it.nombreBebe && !p.personalizable) throw new HttpError(400, `${p.nombre} no lleva nombre`);
    if (!it.nombreBebe && p.personalizable) throw new HttpError(400, `Falta el nombre del bebé para ${p.nombre}`);
    if (p.stock !== null && p.stock < it.cantidad) throw new HttpError(409, p.stock ? `Quedan solo ${p.stock} de ${p.nombre}` : `${p.nombre} está sin stock`);
    const extra = p.personalizable ? Math.max(0, letras(it.nombreBebe) - LETRAS_INCLUIDAS) * PRECIO_LETRA_EXTRA : 0;
    const unit = p.precio + extra;
    return { tipo: 'producto', id: p.id, nombre: p.nombre, cantidad: it.cantidad, color: it.color, nombreBebe: it.nombreBebe, precioUnitario: unit, total: unit * it.cantidad,
      componentes: [{ id: p.id, cantidad: it.cantidad }] };
  });
  return { lineas, ...totales(lineas, input.pago) };
}

function totales(lineas: Linea[], pago: z.infer<typeof Pago>) {
  const subtotal = lineas.reduce((s, l) => s + l.total, 0);
  const recargo = pago === 'mercadopago' ? Math.round(subtotal * RECARGO_MERCADOPAGO) : 0;
  return { subtotal, recargo, total: subtotal + recargo };
}

export type Pedido = {
  id: number; creado: string; estado: (typeof ESTADOS)[number]; nombre: string; telefono: string;
  email: string; direccion: string | null; entrega: string; pago: string; items: Linea[];
  subtotal: number; recargo: number; total: number; mp_payment_id: string | null;
};

export function buscarPedido(id: number): Pedido | undefined {
  const r: any = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  return r && { ...r, items: JSON.parse(r.items) };
}

const resumen = (p: Pedido) => [
  ...p.items.map(l => `- ${l.cantidad} x ${l.nombre}${l.color ? ` (${l.color})` : ''}${l.nombreBebe ? ` "${l.nombreBebe}"` : ''}: $${l.total}`),
  p.recargo ? `Recargo Mercado Pago: $${p.recargo}` : '',
  `Total: $${p.total}`,
  `Entrega: ${p.entrega}${p.direccion ? ` — ${p.direccion}` : ''} (el envío se coordina aparte)`,
].filter(Boolean).join('\n');

// Qué stock mueve cada línea. Pedidos anteriores a este cambio no guardaban `componentes`:
// sus productos sueltos sí descontaban, sus boxes no (y por eso tampoco devuelven nada).
const stockDe = (l: Linea) => l.componentes ?? (l.tipo === 'producto' ? [{ id: l.id, cantidad: l.cantidad }] : []);

function descontarStock(lineas: Linea[]) {
  for (const c of lineas.flatMap(stockDe)) {
    const p = db.prepare(`SELECT nombre, ${STOCK_SQL} AS stock FROM productos WHERE id = ?`).get(c.id) as { nombre: string; stock: number | null } | undefined;
    if (!p || p.stock === null) continue; // "Ignorar stock": no se mira ni se toca la cantidad
    if (p.stock < c.cantidad) throw new HttpError(409, `No hay stock suficiente de ${p.nombre}`);
    db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?').run(c.cantidad, c.id);
  }
}
function devolverStock(lineas: Linea[]) {
  for (const c of lineas.flatMap(stockDe)) {
    db.prepare('UPDATE productos SET stock = COALESCE(stock, 0) + ? WHERE id = ? AND controla_stock = 1').run(c.cantidad, c.id);
  }
}

// Cancelar devuelve el stock; reactivar un cancelado lo vuelve a descontar (409 si ya no hay)
const actualizarEstado = db.transaction((id: number, estado: Pedido['estado'], mpPaymentId?: string) => {
  const antes = buscarPedido(id);
  if (!antes) throw new HttpError(404, 'Pedido no encontrado');
  if (estado === 'cancelado' && antes.estado !== 'cancelado') devolverStock(antes.items);
  if (antes.estado === 'cancelado' && estado !== 'cancelado') descontarStock(antes.items);
  db.prepare('UPDATE pedidos SET estado = ?, mp_payment_id = COALESCE(?, mp_payment_id) WHERE id = ?').run(estado, mpPaymentId ?? null, id);
});

export function cambiarEstado(id: number, estado: Pedido['estado'], mpPaymentId?: string) {
  actualizarEstado(id, estado, mpPaymentId);
  const p = buscarPedido(id)!;
  if (estado === 'enviado') enviarMail(p.email, `Tu pedido Manolito #${p.id} está en camino`, `¡Hola ${p.nombre}! Tu pedido ya salió.\n\n${resumen(p)}`);
  return p;
}

export const insertar = db.transaction((input: PedidoInput, c: ReturnType<typeof calcular>) => {
  descontarStock(c.lineas);
  const { cliente } = input;
  const r = db.prepare(`INSERT INTO pedidos (nombre, telefono, email, direccion, entrega, pago, items, subtotal, recargo, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    cliente.nombre, cliente.telefono, cliente.email, cliente.direccion ?? null, input.entrega, input.pago,
    JSON.stringify(c.lineas), c.subtotal, c.recargo, c.total);
  return Number(r.lastInsertRowid);
});

// Cancela los pedidos pendientes de pago con más de VENCE_HORAS y avisa al cliente. Corre cada 5 min (server.ts)
export function vencerPedidos() {
  const vencidos = db.prepare("SELECT id FROM pedidos WHERE estado = 'pendiente' AND creado <= datetime('now', ?)")
    .all(`-${VENCE_HORAS} hours`) as { id: number }[];
  for (const { id } of vencidos) {
    const p = cambiarEstado(id, 'cancelado');
    enviarMail(p.email, `Tu pedido Manolito #${id} se canceló`,
      `¡Hola ${p.nombre}! Pasaron ${VENCE_HORAS} horas sin que recibiéramos el pago, así que el pedido se canceló.\n\n${resumen(p)}\n\nSi todavía lo querés, podés hacerlo de nuevo en la web o escribirnos por Instagram.`);
  }
  return vencidos.length;
}

export const pedidosRouter = Router();

// Cotiza el carrito sin crear el pedido. Cada ítem se valida por separado para poder marcar
// cuál falla (sin stock, desactivado...) sin perder el resto del carrito.
pedidosRouter.post('/carrito', (req, res) => {
  const { items, pago } = CarritoInput.parse(req.body);
  const lineas: (Linea & { i: number; foto: string | null })[] = [];
  const avisos: { i: number; nombre?: string; error: string }[] = [];
  items.forEach((it, i) => {
    try {
      const foto = (it.tipo === 'box' ? boxes.una(it.id) : productos.uno(it.id))?.foto ?? null;
      lineas.push({ i, foto, ...calcular({ items: [it], pago }, productos.uno, boxes.una).lineas[0] });
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      avisos.push({ i, nombre: (it.tipo === 'box' ? boxes.una(it.id) : productos.uno(it.id))?.nombre, error: e.message });
    }
  });
  res.json({ lineas, avisos, ...totales(lineas, pago), mercadopago: !!process.env.MP_ACCESS_TOKEN });
});

pedidosRouter.post('/pedidos', async (req, res) => {
  const input = PedidoInput.parse(req.body);
  if (input.pago === 'mercadopago' && !process.env.MP_ACCESS_TOKEN) throw new HttpError(400, 'Mercado Pago no está disponible, elegí otro medio de pago');
  const id = insertar(input, calcular(input, productos.uno, boxes.una));
  const p = buscarPedido(id)!;

  let pagoUrl: string | undefined;
  if (p.pago === 'mercadopago') {
    // El pedido ya está guardado: si Mercado Pago falla no se pierde, queda pendiente para coordinar a mano
    // Mercado Pago deja de aceptar el pago al mismo tiempo que vence el pedido
    const vence = new Date(Date.now() + VENCE_HORAS * 3600_000);
    pagoUrl = await crearPreferencia({ id, total: p.total, email: p.email, vence }).catch(e => { console.error(e); return undefined; });
  }
  const instrucciones = pagoUrl ? undefined : `${process.env.PAGO_INSTRUCCIONES ?? 'Te vamos a escribir para coordinar el pago y la entrega.'}\n\n${AVISO_VENCE}`;

  enviarMail(p.email, `Recibimos tu pedido Manolito #${id}`,
    `¡Gracias ${p.nombre}! Recibimos tu pedido.\n\n${resumen(p)}\n\n` +
    (pagoUrl ? `Si no completaste el pago, podés hacerlo desde el link que te mostramos en la web. ${AVISO_VENCE}` : instrucciones));
  if (process.env.ADMIN_EMAIL) {
    enviarMail(process.env.ADMIN_EMAIL, `Nuevo pedido #${id} — $${p.total}`,
      `${p.nombre} · ${p.telefono} · ${p.email}\nPago: ${p.pago}\n\n${resumen(p)}`);
  }

  res.status(201).json({ id, subtotal: p.subtotal, recargo: p.recargo, total: p.total, pagoUrl, instrucciones });
});

pedidosRouter.post('/mercadopago/webhook', async (req, res) => {
  if (!firmaValida(req)) throw new HttpError(401, 'Firma inválida');
  const tipo = req.query.type ?? req.body?.type;
  if (tipo === 'payment') {
    const pago = await obtenerPago(req.query['data.id'] as string);
    const p = buscarPedido(Number(pago.external_reference));
    const mpId = String(req.query['data.id']);
    if (pago.status === 'approved' && p && pago.transaction_amount >= p.total) {
      if (p.estado === 'pendiente') cambiarEstado(p.id, 'pagado', mpId);
      // Pago que entró después de vencer: se reactiva si queda stock; si no, hay que devolver la plata
      else if (p.estado === 'cancelado') {
        try {
          cambiarEstado(p.id, 'pagado', mpId);
        } catch (e) {
          if (!(e instanceof HttpError) || e.status !== 409) throw e;
          db.prepare('UPDATE pedidos SET mp_payment_id = ? WHERE id = ?').run(mpId, p.id);
          if (process.env.ADMIN_EMAIL) enviarMail(process.env.ADMIN_EMAIL, `⚠ Pago de pedido vencido #${p.id}: devolver $${p.total}`,
            `Mercado Pago aprobó el pago ${mpId} del pedido #${p.id} (${p.nombre}, ${p.telefono}), pero el pedido ya estaba cancelado y no hay stock para reactivarlo: ${e.message}.\nHay que devolver el dinero desde Mercado Pago o coordinar con el cliente.`);
        }
      }
    }
  }
  res.sendStatus(200);
});
