import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { adminRouter } from './admin.js';
import { manejarErrores } from './errores.js';
import { calcular, PedidoInput } from './pedidos.js';
import { productos, boxes, q, q1 } from './db.js';

async function patch(ruta: string, body: unknown) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.usuario = { id: 1, email: 'admin@test.com', rol: 'admin' }; next(); });
  app.use('/api/admin', adminRouter);
  app.use(manejarErrores);
  const srv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/admin${ruta}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, d: await r.json() as any };
  } finally { srv.close(); }
}

test('promo: el 10% de la migración se redondea a 10', async () => {
  const r = await q1<{ a: number; b: number; c: number }>('SELECT (ROUND(1590 * 0.9 / 10) * 10)::int AS a, (ROUND(990 * 0.9 / 10) * 10)::int AS b, (ROUND(790 * 0.9 / 10) * 10)::int AS c');
  assert.deepEqual(r, { a: 1430, b: 890, c: 710 });
});

test('promo: el precio anterior se edita en el admin, queda en el historial y no cambia lo que se cobra', async () => {
  const r = await patch('/boxes/esencial', { precio: 1430, precioAnterior: 1590 });
  assert.equal(r.status, 200);
  assert.deepEqual([r.d.precio, r.d.precioAnterior], [1430, 1590]);
  assert.equal((await boxes.una('esencial'))!.precioAnterior, 1590);
  const h = await q("SELECT cambios FROM historial WHERE entidad = 'box' AND entidad_id = 'esencial' ORDER BY id DESC LIMIT 1");
  assert.deepEqual(h[0].cambios.precioAnterior, [null, 1590]);

  const input = PedidoInput.parse({ cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago: 'transferencia',
    items: [{ tipo: 'box', id: 'esencial', color: 'Rosa', nombreBebe: 'Ema', modelo: 'Silicona N° 1' }] });
  assert.equal((await calcular(input, productos.uno, boxes.una)).total, 1430, 'se cobra el precio actual');

  // Vaciarlo termina la promo
  assert.equal((await patch('/boxes/esencial', { precioAnterior: null })).d.precioAnterior, null);
  assert.equal((await patch('/productos/porta', { precioAnterior: 890 })).d.precioAnterior, 890);
});
