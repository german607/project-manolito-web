import { Router } from 'express';
import { z } from 'zod';
import { db, productos, boxes, type Producto, type Box } from './db.js';
import { HttpError } from './errores.js';
import { enviarMail } from './mail.js';
import { crearPreferencia, firmaValida, obtenerPago } from './mercadopago.js';

export const ESTADOS = ['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'] as const;
const LETRAS_INCLUIDAS = 5;
const PRECIO_LETRA_EXTRA = 20;
const RECARGO_MERCADOPAGO = 0.10; // "Mercado Pago (con 10% adicional)" según las preguntas frecuentes

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

export type Linea = {
  tipo: 'producto' | 'box'; id: string; nombre: string; cantidad: number;
  color?: string; nombreBebe?: string; precioUnitario: number; total: number;
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
      return { tipo: 'box', id: b.id, nombre: b.nombre, cantidad: it.cantidad, nombreBebe: it.nombreBebe, precioUnitario: b.precio, total: b.precio * it.cantidad };
    }
    const p = buscarProducto(it.id);
    if (!p?.activo) throw new HttpError(400, `El producto "${it.id}" no existe`);
    if (it.color && !p.colores?.includes(it.color)) throw new HttpError(400, `Color "${it.color}" no disponible para ${p.nombre}`);
    if (it.nombreBebe && !p.personalizable) throw new HttpError(400, `${p.nombre} no lleva nombre`);
    if (!it.nombreBebe && p.personalizable) throw new HttpError(400, `Falta el nombre del bebé para ${p.nombre}`);
    if (p.stock !== null && p.stock < it.cantidad) throw new HttpError(409, p.stock ? `Quedan solo ${p.stock} de ${p.nombre}` : `${p.nombre} está sin stock`);
    const extra = p.personalizable ? Math.max(0, letras(it.nombreBebe) - LETRAS_INCLUIDAS) * PRECIO_LETRA_EXTRA : 0;
    const unit = p.precio + extra;
    return { tipo: 'producto', id: p.id, nombre: p.nombre, cantidad: it.cantidad, color: it.color, nombreBebe: it.nombreBebe, precioUnitario: unit, total: unit * it.cantidad };
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

export function cambiarEstado(id: number, estado: Pedido['estado'], mpPaymentId?: string) {
  const r = db.prepare('UPDATE pedidos SET estado = ?, mp_payment_id = COALESCE(?, mp_payment_id) WHERE id = ?').run(estado, mpPaymentId ?? null, id);
  if (!r.changes) throw new HttpError(404, 'Pedido no encontrado');
  const p = buscarPedido(id)!;
  if (estado === 'enviado') enviarMail(p.email, `Tu pedido Manolito #${p.id} está en camino`, `¡Hola ${p.nombre}! Tu pedido ya salió.\n\n${resumen(p)}`);
  return p;
}

const insertar = db.transaction((input: PedidoInput, c: ReturnType<typeof calcular>) => {
  for (const l of c.lineas) {
    if (l.tipo !== 'producto') continue;
    const { stock } = db.prepare('SELECT stock FROM productos WHERE id = ?').get(l.id) as { stock: number | null };
    if (stock === null) continue; // sin límite
    if (stock < l.cantidad) throw new HttpError(409, `No hay stock suficiente de ${l.nombre}`);
    db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?').run(l.cantidad, l.id);
  }
  const { cliente } = input;
  const r = db.prepare(`INSERT INTO pedidos (nombre, telefono, email, direccion, entrega, pago, items, subtotal, recargo, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    cliente.nombre, cliente.telefono, cliente.email, cliente.direccion ?? null, input.entrega, input.pago,
    JSON.stringify(c.lineas), c.subtotal, c.recargo, c.total);
  return Number(r.lastInsertRowid);
});

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
    pagoUrl = await crearPreferencia({ id, total: p.total, email: p.email }).catch(e => { console.error(e); return undefined; });
  }
  const instrucciones = pagoUrl ? undefined : (process.env.PAGO_INSTRUCCIONES ?? 'Te vamos a escribir para coordinar el pago y la entrega.');

  enviarMail(p.email, `Recibimos tu pedido Manolito #${id}`,
    `¡Gracias ${p.nombre}! Recibimos tu pedido.\n\n${resumen(p)}\n\n` +
    (pagoUrl ? 'Si no completaste el pago, podés hacerlo desde el link que te mostramos en la web.' : instrucciones));
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
    if (pago.status === 'approved' && p?.estado === 'pendiente' && pago.transaction_amount >= p.total) {
      cambiarEstado(p.id, 'pagado', String(req.query['data.id']));
    }
  }
  res.sendStatus(200);
});
