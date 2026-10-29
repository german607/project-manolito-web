import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { abandonosRouter, recuperarCarritos } from './abandonos.js';
import { manejarErrores } from './errores.js';
import { calcular, insertar, PedidoInput } from './pedidos.js';
import { productos, boxes, q } from './db.js';

async function api(metodo: string, ruta: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api', abandonosRouter);
  app.use(manejarErrores);
  const srv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api${ruta}`,
      { method: metodo, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: r.status, body: r.status === 204 ? null : await r.json() as any };
  } finally { srv.close(); }
}
const BOX = { tipo: 'box', id: 'esencial', color: 'Rosa', nombreBebe: '<b>Hola</b>', modelo: 'Silicona N° 1' };
const atrasar = (email: string, horas: number) =>
  q(`UPDATE carritos_abandonados SET actualizado = now() - make_interval(hours => $2) WHERE email = $1`, [email, horas]);

test('carrito abandonado: un mail con fotos y link que devuelve el carrito; no si compró, ni dos veces', async () => {
  const enviados: any[] = [];
  const real = globalThis.fetch;
  process.env.RESEND_API_KEY = 're_test';
  try {
    assert.equal((await api('POST', '/carritos-abandonados', { email: 'Deja@Test.com', items: [BOX] })).status, 204);
    assert.equal((await api('POST', '/carritos-abandonados', { email: 'compra@test.com', items: [BOX] })).status, 204);
    assert.equal((await api('POST', '/carritos-abandonados', { email: 'mal', items: [BOX] })).status, 400);

    globalThis.fetch = (async (_u: string, init: RequestInit) => { enviados.push(JSON.parse(String(init.body))); return new Response('{}'); }) as typeof fetch;
    await recuperarCarritos();
    await atrasar('deja@test.com', 23);
    await recuperarCarritos();
    assert.equal(enviados.length, 0, 'antes de las 24 h no se manda');

    // Una de las dos hace el pedido
    const input = PedidoInput.parse({ cliente: { nombre: 'Ana', telefono: '099123456', email: 'Compra@test.com' }, entrega: 'pickup', pago: 'transferencia', items: [BOX] });
    await q("UPDATE productos SET controla_stock = false");
    await insertar(input, await calcular(input, productos.uno, boxes.una));
    await atrasar('deja@test.com', 25); await atrasar('compra@test.com', 25);
    await q("UPDATE pedidos SET creado = now() - interval '20 hours' WHERE lower(email) = 'compra@test.com'");

    await recuperarCarritos();
    assert.equal(enviados.length, 1, 'solo a quien no compró');
    const m = enviados[0];
    assert.equal(m.to, 'deja@test.com');
    assert.ok(m.html.includes((await boxes.una('esencial'))!.foto!), 'foto de la box');
    assert.doesNotMatch(m.html + m.text, /Hola<|&lt;b&gt;Hola/, 'sin el texto libre del carrito');
    const token = (m.text.match(/carrito=([a-f0-9]{48})/) ?? [])[1];
    assert.match(m.text, /utm_source=mail&utm_campaign=carrito-abandonado/);

    globalThis.fetch = real;
    const r = await api('GET', `/carritos-abandonados/${token}`);
    assert.deepEqual(r.body.items[0].id, 'esencial');
    assert.equal((await api('GET', '/carritos-abandonados/nada')).status, 404);

    // Vuelve con el mismo carrito (ej. desde el link) y lo deja otra vez: no se repite (una única vez por carrito)
    await api('POST', '/carritos-abandonados', { email: 'deja@test.com', items: [BOX] });
    await atrasar('deja@test.com', 25);
    globalThis.fetch = (async (_u: string, init: RequestInit) => { enviados.push(JSON.parse(String(init.body))); return new Response('{}'); }) as typeof fetch;
    await recuperarCarritos();
    assert.equal(enviados.length, 1);
    // Arma otro carrito y también lo deja: ese sí lleva su mail
    globalThis.fetch = real;
    await api('POST', '/carritos-abandonados', { email: 'deja@test.com', items: [BOX, { ...BOX, color: 'Celeste' }] });
    await atrasar('deja@test.com', 25);
    globalThis.fetch = (async (_u: string, init: RequestInit) => { enviados.push(JSON.parse(String(init.body))); return new Response('{}'); }) as typeof fetch;
    await recuperarCarritos();
    assert.equal(enviados.length, 2);
  } finally {
    globalThis.fetch = real; delete process.env.RESEND_API_KEY;
  }
});
