import './test-setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { firmaValida, type PagoMP } from './mercadopago.js';
import { calcular, insertar, buscarPedido, cambiarEstado, procesarPago, PedidoInput } from './pedidos.js';
import { productos, boxes, q } from './db.js';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { pedidosRouter } from './pedidos.js';
import { crearToken } from './pagosManuales.js';
import { manejarErrores } from './errores.js';

// ---- API de Mercado Pago simulada: GET /v1/payments/:id devuelve lo que haya en `pagos` ----
const pagos = new Map<string, Partial<PagoMP>>();
// POST /v1/payments (pago con tarjeta): se guarda lo que mandó el servidor y se responde con `respuestaTarjeta`
let enviado: { body: any; idempotencia?: string } | undefined;
let respuestaTarjeta: Partial<PagoMP> = {};
let proximoId = 9000;
const fetchReal = globalThis.fetch;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  if (/api\.mercadopago\.com\/v1\/payments$/.test(String(url)) && init?.method === 'POST') {
    const body = JSON.parse(String(init.body));
    enviado = { body, idempotencia: (init.headers as Record<string, string>)['X-Idempotency-Key'] };
    const pago = { id: ++proximoId, currency_id: 'UYU', external_reference: body.external_reference, transaction_amount: body.transaction_amount, ...respuestaTarjeta };
    pagos.set(String(pago.id), pago);
    return new Response(JSON.stringify(pago), { status: 201 });
  }
  const m = String(url).match(/api\.mercadopago\.com\/v1\/payments\/(\d+)/);
  if (!m) return fetchReal(url, init);
  const p = pagos.get(m[1]);
  return new Response(JSON.stringify(p ?? { message: 'not found' }), { status: p ? 200 : 404 });
}) as typeof fetch;
process.env.MP_ACCESS_TOKEN = 'TEST-token';

beforeEach(() => pagos.clear());

async function pedidoMP() {
  const input = PedidoInput.parse({
    cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago: 'mercadopago',
    items: [{ tipo: 'producto', id: 'porta', nombreBebe: 'Lola' }],
  });
  const id = await insertar(input, await calcular(input, productos.uno, boxes.una));
  return (await buscarPedido(id))!;
}
const pago = (id: string, p: Partial<PagoMP>) => pagos.set(id, { id: Number(id), currency_id: 'UYU', ...p });

test('webhook: firma válida e inválida', () => {
  process.env.MP_WEBHOOK_SECRET = 'secreto-de-prueba';
  const req = (firma: string) => ({
    header: (n: string) => ({ 'x-signature': firma, 'x-request-id': 'req-1' } as Record<string, string>)[n],
    query: { 'data.id': '123' },
  }) as unknown as Request;
  const ts = '1704908010';
  const v1 = createHmac('sha256', 'secreto-de-prueba').update(`id:123;request-id:req-1;ts:${ts};`).digest('hex');
  assert.equal(firmaValida(req(`ts=${ts},v1=${v1}`)), true);
  assert.equal(firmaValida(req(`ts=${ts},v1=${'0'.repeat(64)}`)), false, 'firma falsa');
  assert.equal(firmaValida(req(`ts=9999999999,v1=${v1}`)), false, 'firma de otro momento');
});

test('pago aprobado en UYU por el total: el pedido pasa a pagado (una sola vez)', async () => {
  const p = await pedidoMP();
  pago('1001', { status: 'approved', external_reference: String(p.id), transaction_amount: p.total });
  const r = await procesarPago('1001');
  assert.equal(r.pedido!.estado, 'pagado');
  assert.equal(r.pedido!.mp_payment_id, '1001');
  await procesarPago('1001'); // Mercado Pago suele avisar más de una vez
  const h = await q("SELECT autor FROM historial WHERE entidad = 'pedido' AND entidad_id = $1 AND accion = 'estado'", [String(p.id)]);
  assert.deepEqual(h.map(x => x.autor), ['mercadopago']);
});

test('pago aprobado con otra moneda o menos plata: NO se marca como pagado', async () => {
  const p1 = await pedidoMP();
  pago('2001', { status: 'approved', external_reference: String(p1.id), transaction_amount: p1.total, currency_id: 'USD' });
  assert.equal((await procesarPago('2001')).pedido!.estado, 'pendiente');
  const p2 = await pedidoMP();
  pago('2002', { status: 'approved', external_reference: String(p2.id), transaction_amount: p2.total - 1 });
  assert.equal((await procesarPago('2002')).pedido!.estado, 'pendiente');
});

test('pago pendiente o rechazado: el pedido sigue pendiente', async () => {
  const p = await pedidoMP();
  pago('3001', { status: 'in_process', external_reference: String(p.id), transaction_amount: p.total });
  assert.equal((await procesarPago('3001')).pedido!.estado, 'pendiente');
  pago('3002', { status: 'rejected', external_reference: String(p.id), transaction_amount: p.total });
  assert.equal((await procesarPago('3002')).pedido!.estado, 'pendiente');
});

test('devolución de un pedido pagado y no enviado: se cancela y vuelve el stock; si ya se envió, no se toca', async () => {
  await q("UPDATE productos SET controla_stock = true, stock = 5 WHERE id = 'porta'");
  const p = await pedidoMP();
  pago('4001', { status: 'approved', external_reference: String(p.id), transaction_amount: p.total });
  await procesarPago('4001');
  assert.equal((await productos.uno('porta'))!.stock, 4);
  pago('4001', { status: 'refunded', external_reference: String(p.id), transaction_amount: p.total });
  assert.equal((await procesarPago('4001')).pedido!.estado, 'cancelado');
  assert.equal((await productos.uno('porta'))!.stock, 5, 'el stock volvió');

  const enviado = await pedidoMP();
  pago('4002', { status: 'approved', external_reference: String(enviado.id), transaction_amount: enviado.total });
  await procesarPago('4002');
  await cambiarEstado(enviado.id, 'enviado');
  pago('4002', { status: 'charged_back', external_reference: String(enviado.id), transaction_amount: enviado.total });
  assert.equal((await procesarPago('4002')).pedido!.estado, 'enviado', 'ya enviado: solo se avisa al admin');
  await q("UPDATE productos SET controla_stock = false WHERE id = 'porta'");
});

// ---------- Pago con tarjeta dentro de la web (ruta real, servidor de prueba) ----------

async function servidor() {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.usuario = null; next(); });
  app.use('/api', pedidosRouter);
  app.use(manejarErrores);
  const srv = app.listen(0);
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/mercadopago/pagar`;
  const pagar = async (body: unknown) => { const r = await fetchReal(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, d: await r.json() }; };
  return { pagar, cerrar: () => srv.close() };
}
const tarjeta = (extra = {}) => ({ token: 'tok_' + Math.random().toString(36).slice(2), payment_method_id: 'master', installments: 1,
  payer: { email: 'comprador@example.com', identification: { type: 'CI', number: '12345678' } }, transaction_amount: 1, ...extra });

test('tarjeta: el monto sale del pedido (no del navegador) y el pedido queda pagado', async () => {
  const s = await servidor();
  try {
    const p = await pedidoMP(); const t = await crearToken(p.id);
    respuestaTarjeta = { status: 'approved', status_detail: 'accredited' };
    const r = await s.pagar({ pedido: p.id, t, formData: tarjeta({ transaction_amount: 1 }) });
    assert.equal(r.status, 200);
    assert.equal(enviado!.body.transaction_amount, p.total, 'se cobra el total del pedido, aunque el navegador mande $1');
    assert.equal(enviado!.body.external_reference, String(p.id));
    assert.ok(enviado!.idempotencia?.startsWith(`tarjeta-${p.id}-`));
    assert.deepEqual([r.d.estado, r.d.pago], ['pagado', 'approved']);
    assert.equal((await s.pagar({ pedido: p.id, t, formData: tarjeta() })).status, 409, 'un pedido pago no se cobra dos veces');
  } finally { s.cerrar(); }
});

test('tarjeta: sin el token del pedido no se puede pagar', async () => {
  const s = await servidor();
  try {
    const p = await pedidoMP();
    assert.equal((await s.pagar({ pedido: p.id, t: 'c'.repeat(48), formData: tarjeta() })).status, 404);
  } finally { s.cerrar(); }
});

test('tarjeta: rechazo con mensaje claro, y tope de intentos por pedido (tarjetas robadas en serie)', async () => {
  const s = await servidor();
  try {
    const p = await pedidoMP(); const t = await crearToken(p.id);
    respuestaTarjeta = { status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' };
    const r = await s.pagar({ pedido: p.id, t, formData: tarjeta() });
    assert.deepEqual([r.d.estado, r.d.pago, r.d.mensaje], ['pendiente', 'rejected', 'La tarjeta no tiene fondos suficientes.']);
    for (let i = 0; i < 4; i++) await s.pagar({ pedido: p.id, t, formData: tarjeta() });
    assert.equal((await s.pagar({ pedido: p.id, t, formData: tarjeta() })).status, 429, 'al 6.º intento se bloquea');
  } finally { s.cerrar(); }
});
