import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { adminRouter } from './admin.js';
import { manejarErrores } from './errores.js';
import { calcular, insertar, buscarPedido, vencerPedidos, PedidoInput } from './pedidos.js';
import { productos, boxes, q } from './db.js';

async function api(metodo: string, ruta: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.usuario = { id: 1, email: 'admin@test.com', rol: 'admin' }; next(); });
  app.use('/api/admin', adminRouter);
  app.use(manejarErrores);
  const srv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/admin${ruta}`,
      { method: metodo, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: r.status, d: await r.json() as any };
  } finally { srv.close(); }
}
const stock = async (id: string) => (await productos.uno(id))!.stock;
const BOX = { tipo: 'box', id: 'esencial', color: 'Rosa', nombreBebe: 'Ema', modelo: 'Silicona N° 1' };
const ARMADO = [{ tipo: 'producto', id: 'babero', color: 'Rosa', armado: 'a1' }, { tipo: 'producto', id: 'manta', color: 'Beige', armado: 'a1' }];
const PORTA = { tipo: 'producto', id: 'porta', nombreBebe: 'Lola', modelo: 'Madera N° 2' };

test('pedido cargado en el admin: box, armado y portachupete; sin mails, no vence, y se edita devolviendo el stock', async () => {
  await q("UPDATE productos SET controla_stock = true, stock = 10");
  const enviados: unknown[] = [];
  const real = globalThis.fetch;
  process.env.RESEND_API_KEY = 're_test';
  try {
    // Solo el nombre es obligatorio; el precio lo calcula el servidor
    const fetchMail = (async (u: string, init: RequestInit) => { if (String(u).includes('resend')) { enviados.push(init.body); return new Response('{}'); } return real(u, init); }) as typeof fetch;
    globalThis.fetch = fetchMail;
    const r = await api('POST', '/pedidos', { cliente: { nombre: 'Clienta de Instagram' }, entrega: 'pickup', pago: 'transferencia', estado: 'pendiente',
      fuente: 'Instagram', items: [BOX, ...ARMADO, PORTA] });
    assert.equal(r.status, 201);
    const p = (await buscarPedido(r.d.id))!;
    assert.deepEqual([p.manual, p.email, p.telefono, p.origen, p.estado], ['admin@test.com', null, null, 'instagram', 'pendiente']);
    assert.equal(p.items.length, 4);
    assert.equal(await stock('babero'), 9);
    assert.equal(enviados.length, 0, 'no se manda ningún mail');
    await q("UPDATE pedidos SET creado = now() - interval '5 days' WHERE id = $1", [p.id]);
    await vencerPedidos();
    assert.equal((await buscarPedido(p.id))!.estado, 'pendiente', 'no vence solo');

    // Mismas reglas que la web
    assert.equal((await api('POST', '/pedidos', { cliente: { nombre: 'Xx' }, entrega: 'pickup', pago: 'transferencia', items: [ARMADO[0]] })).status, 400, 'armado de 1 producto');

    // Editar: sale el armado, queda la box y el portachupete; el stock vuelve
    const e = await api('PUT', `/pedidos/${p.id}`, { cliente: { nombre: 'Clienta de Instagram', telefono: '099123456' }, entrega: 'interior', envio: 'agencia',
      pago: 'mercadopago', fuente: 'instagram', items: [BOX, PORTA]});
    assert.equal(e.status, 400, 'interior sin dirección');
    const ok = await api('PUT', `/pedidos/${p.id}`, { cliente: { nombre: 'Clienta de Instagram', telefono: '099123456', direccion: 'Salto' }, entrega: 'interior',
      envio: 'agencia', pago: 'transferencia', fuente: 'instagram', items: [BOX, PORTA] });
    assert.equal(ok.status, 200);
    const editado = (await buscarPedido(p.id))!;
    assert.deepEqual([editado.items.length, editado.direccion, editado.telefono], [2, 'Agencia DAC: Salto', '099123456']);
    assert.equal(await stock('babero'), 10, 'el stock del armado que salió volvió');

    // Pagado al crear: cuenta para Finanzas desde ya
    const pagado = await api('POST', '/pedidos', { cliente: { nombre: 'Otra', email: 'otra@test.com' }, entrega: 'pickup', pago: 'mercadopago', items: [PORTA] });
    const pp = (await buscarPedido(pagado.d.id))!;
    assert.equal(pp.estado, 'pagado');
    assert.ok(pp.pagado);

    // Un pedido de la web no se edita
    const web = PedidoInput.parse({ cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago: 'transferencia', items: [PORTA] });
    const idWeb = await insertar(web, await calcular(web, productos.uno, boxes.una));
    assert.equal((await api('PUT', `/pedidos/${idWeb}`, { cliente: { nombre: 'Ana' }, entrega: 'pickup', pago: 'transferencia', items: [PORTA] })).status, 409);
  } finally {
    globalThis.fetch = real; delete process.env.RESEND_API_KEY;
    await q("UPDATE productos SET controla_stock = false");
  }
});

test('producción: solo los pedidos pagados, el más viejo primero; el estado interno se cambia y queda en el historial', async () => {
  await q('UPDATE productos SET controla_stock = false');
  const nuevo = async (estado: string) => (await api('POST', '/pedidos', { cliente: { nombre: 'Ana' }, entrega: 'pickup', pago: 'transferencia', estado, items: [PORTA] })).d.id;
  const viejo = await nuevo('pagado'), reciente = await nuevo('pagado'), sinPagar = await nuevo('pendiente');
  await q("UPDATE pedidos SET pagado = now() - interval '2 days' WHERE id = $1", [viejo]);

  const lista = async () => (await api('GET', '/produccion')).d as any[];
  const ids = (await lista()).map(p => p.id);
  assert.ok(ids.indexOf(viejo) < ids.indexOf(reciente), 'el que pagó primero, primero');
  assert.ok(!ids.includes(sinPagar), 'los que no pagaron no están');
  assert.equal((await lista()).find(p => p.id === viejo).taller, 'pendiente');

  assert.equal((await api('PATCH', `/pedidos/${viejo}/taller`, { taller: 'trabajando' })).status, 200);
  assert.equal((await api('PATCH', `/pedidos/${viejo}/taller`, { taller: 'listo' })).status, 400);
  assert.equal((await lista()).find(p => p.id === viejo).taller, 'trabajando');
  const h = await q("SELECT cambios FROM historial WHERE entidad_id = $1 AND accion = 'taller'", [String(viejo)]);
  assert.deepEqual(h[0].cambios.taller, ['pendiente', 'trabajando']);

  await q("UPDATE pedidos SET estado = 'pronto' WHERE id = $1", [viejo]);
  assert.ok(!(await lista()).some(p => p.id === viejo), 'pronto para retirar: sale de la lista');
});
