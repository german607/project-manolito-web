import { Router } from 'express';
import { z } from 'zod';
import { q, q1, tx, productos, boxes, registrar, STOCK_SQL, type Autor, type Producto, type Box } from './db.js';
import { HttpError } from './errores.js';
import { enviarMail } from './mail.js';
import { crearPreferencia, firmaValida, obtenerPago } from './mercadopago.js';

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
  color?: string; nombreBebe?: string; modelo?: string; armado?: string; precioUnitario: number; total: number;
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
  input: { items: z.infer<typeof Item>[]; pago: z.infer<typeof Pago> },
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
      // La box no cobra letras extra en el portachupete (confirmado con Manolito): solo el portachupete suelto
      for (const c of b.componentes) {
        if (c.stock !== null && c.stock < c.cantidad * it.cantidad) throw new HttpError(409, `${b.nombre}: no queda stock de ${c.nombre}`);
      }
      lineas.push({ tipo: 'box', id: b.id, nombre: b.nombre, cantidad: it.cantidad, nombreBebe: it.nombreBebe, precioUnitario: b.precio, total: b.precio * it.cantidad,
        componentes: b.componentes.map(c => ({ id: c.id, cantidad: c.cantidad * it.cantidad })) });
      continue;
    }
    const p = await buscarProducto(it.id);
    if (!p?.activo) throw new HttpError(400, `El producto "${it.id}" no existe`);
    // Los productos se compran armando una box; solo el portachupete se vende suelto (desde su sección)
    if (!it.armado && !p.personalizable) throw new HttpError(400, `${p.nombre} se compra desde "Armá tu box" (mínimo ${MIN_ARMADO} productos)`);
    if (it.color && !p.colores?.includes(it.color)) throw new HttpError(400, `Color "${it.color}" no disponible para ${p.nombre}`);
    if (it.nombreBebe && !p.personalizable) throw new HttpError(400, `${p.nombre} no lleva nombre`);
    if (!it.nombreBebe && p.personalizable) throw new HttpError(400, `Falta el nombre del bebé para ${p.nombre}`);
    if (p.stock !== null && p.stock < it.cantidad) throw new HttpError(409, p.stock ? `Quedan solo ${p.stock} de ${p.nombre}` : `${p.nombre} está sin stock`);
    const extra = p.personalizable ? Math.max(0, letras(it.nombreBebe) - LETRAS_INCLUIDAS) * PRECIO_LETRA_EXTRA : 0;
    const unit = p.precio + extra;
    lineas.push({ tipo: 'producto', id: p.id, nombre: p.nombre, cantidad: it.cantidad, color: it.color, nombreBebe: it.nombreBebe, modelo: p.personalizable ? it.modelo : undefined, armado: it.armado, precioUnitario: unit, total: unit * it.cantidad,
      componentes: [{ id: p.id, cantidad: it.cantidad }] });
  }
  return { lineas, ...totales(lineas, input.pago) };
}

function totales(lineas: Linea[], pago: z.infer<typeof Pago>) {
  const subtotal = lineas.reduce((s, l) => s + l.total, 0);
  const recargo = pago === 'mercadopago' ? Math.round(subtotal * RECARGO_MERCADOPAGO) : 0;
  return { subtotal, recargo, total: subtotal + recargo };
}

export type Pedido = {
  id: number; creado: Date; estado: (typeof ESTADOS)[number]; nombre: string; telefono: string;
  email: string; direccion: string | null; entrega: string; pago: string; items: Linea[];
  subtotal: number; recargo: number; total: number; mp_payment_id: string | null; usuario_id: number | null;
};

// bloquear = trabar la fila hasta el fin de la transacción (para cambios de estado simultáneos)
export const buscarPedido = (id: number, bloquear = false) =>
  q1<Pedido>(`SELECT * FROM pedidos WHERE id = $1 ${bloquear ? 'FOR UPDATE' : ''}`, [id]);

// Los armados se numeran en el orden en que aparecen ("Armado 1", "Armado 2"): cada uno se empaca como una box
export const numerarArmados = (items: Linea[]) => [...new Set(items.map(l => l.armado).filter(Boolean))] as string[];

const resumen = (p: Pedido) => [
  ...p.items.map(l => `- ${l.cantidad} x ${l.nombre}${l.color ? ` (${l.color})` : ''}${l.nombreBebe ? ` "${l.nombreBebe}"` : ''}${l.modelo ? ` [Modelo: ${l.modelo}]` : ''}${l.armado ? ` (Armado ${numerarArmados(p.items).indexOf(l.armado) + 1})` : ''}: $${l.total}`),
  p.recargo ? `Recargo Mercado Pago: $${p.recargo}` : '',
  `Total: $${p.total}`,
  `Entrega: ${p.entrega}${p.direccion ? ` — ${p.direccion}` : ''} (el envío se coordina aparte)`,
].filter(Boolean).join('\n');

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
    if (estado === 'cancelado' && antes.estado !== 'cancelado') await devolverStock(antes.items);
    if (antes.estado === 'cancelado' && estado !== 'cancelado') await descontarStock(antes.items);
    if (antes.estado !== estado) await registrar(autor, 'pedido', id, 'estado', { estado: [antes.estado, estado] });
    return (await q1<Pedido>('UPDATE pedidos SET estado = $1, mp_payment_id = COALESCE($2, mp_payment_id) WHERE id = $3 RETURNING *',
      [estado, mpPaymentId ?? null, id]))!;
  });
  if (estado === 'enviado') enviarMail(p.email, `Tu pedido Manolito #${p.id} está en camino`, `¡Hola ${p.nombre}! Tu pedido ya salió.\n\n${resumen(p)}`);
  return p;
}

export const insertar = (input: PedidoInput, c: Awaited<ReturnType<typeof calcular>>, usuarioId: number | null = null, autor: Autor = 'cliente') => tx(async () => {
  await descontarStock(c.lineas);
  const { cliente } = input;
  const r = await q1<{ id: number }>(`INSERT INTO pedidos (nombre, telefono, email, direccion, entrega, pago, items, subtotal, recargo, total, usuario_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`, [
    cliente.nombre, cliente.telefono, cliente.email, cliente.direccion ?? null, input.entrega, input.pago,
    JSON.stringify(c.lineas), c.subtotal, c.recargo, c.total, usuarioId]);
  await registrar(autor, 'pedido', r!.id, 'crear', { total: [null, c.total], pago: [null, input.pago] });
  return r!.id;
});

// Cancela los pedidos pendientes de pago con más de VENCE_HORAS y avisa al cliente. Corre cada 5 min (server.ts)
export async function vencerPedidos() {
  const vencidos = await q<{ id: number }>("SELECT id FROM pedidos WHERE estado = 'pendiente' AND creado <= now() - make_interval(hours => $1)", [VENCE_HORAS]);
  for (const { id } of vencidos) {
    const p = await cambiarEstado(id, 'cancelado', undefined, 'sistema (venció sin pago)');
    enviarMail(p.email, `Tu pedido Manolito #${id} se canceló`,
      `¡Hola ${p.nombre}! Pasaron ${VENCE_HORAS} horas sin que recibiéramos el pago, así que el pedido se canceló.\n\n${resumen(p)}\n\nSi todavía lo querés, podés hacerlo de nuevo en la web o escribirnos por Instagram.`);
  }
  return vencidos.length;
}

export const pedidosRouter = Router();

// Cotiza el carrito sin crear el pedido. Cada ítem se valida por separado para poder marcar
// cuál falla (sin stock, desactivado...) sin perder el resto del carrito.
pedidosRouter.post('/carrito', async (req, res) => {
  const { items, pago } = CarritoInput.parse(req.body);
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
  res.json({ lineas, avisos, ...totales(lineas, pago), mercadopago: !!process.env.MP_ACCESS_TOKEN });
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
    const p = await buscarPedido(Number(pago.external_reference));
    const mpId = String(req.query['data.id']);
    if (pago.status === 'approved' && p && pago.transaction_amount >= p.total) {
      if (p.estado === 'pendiente') await cambiarEstado(p.id, 'pagado', mpId, 'mercadopago');
      // Pago que entró después de vencer: se reactiva si queda stock; si no, hay que devolver la plata
      else if (p.estado === 'cancelado') {
        try {
          await cambiarEstado(p.id, 'pagado', mpId, 'mercadopago');
        } catch (e) {
          if (!(e instanceof HttpError) || e.status !== 409) throw e;
          await q('UPDATE pedidos SET mp_payment_id = $1 WHERE id = $2', [mpId, p.id]);
          if (process.env.ADMIN_EMAIL) enviarMail(process.env.ADMIN_EMAIL, `⚠ Pago de pedido vencido #${p.id}: devolver $${p.total}`,
            `Mercado Pago aprobó el pago ${mpId} del pedido #${p.id} (${p.nombre}, ${p.telefono}), pero el pedido ya estaba cancelado y no hay stock para reactivarlo: ${e.message}.\nHay que devolver el dinero desde Mercado Pago o coordinar con el cliente.`);
        }
      }
    }
  }
  res.sendStatus(200);
});
