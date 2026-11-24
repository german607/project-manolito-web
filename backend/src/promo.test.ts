import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { adminRouter } from './admin.js';
import { manejarErrores } from './errores.js';
import { calcular, insertar, cambiarEstado, PedidoInput } from './pedidos.js';
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

test('stock por color: el producto y las boxes que lo traen no se venden en ese color', async () => {
  await q("UPDATE productos SET controla_stock = false");
  const r = await patch('/productos/zapatitos', { stockColores: { Celeste: 0, Rosa: 2 } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.d.sinStock, ['Celeste'], 'en 0 = sin stock');
  assert.equal((await patch('/productos/zapatitos', { stockColores: { Violeta: 1 } })).status, 400, 'un color que el producto no tiene');

  // Las boxes con zapatitos pierden el celeste; las que no los traen, no
  assert.ok((await boxes.una('bienvenida'))!.coloresSinStock.includes('Celeste'));
  assert.deepEqual((await boxes.una('esencial'))!.coloresSinStock, []);
  assert.equal((await boxes.una('bienvenida'))!.agotada, false, 'quedan otros colores');

  const pedir = (items: unknown[]) => calcular(PedidoInput.parse({ cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago: 'transferencia', items }), productos.uno, boxes.una);
  const box = (color: string) => ({ tipo: 'box', id: 'bienvenida', color, nombreBebe: 'Ema', modelo: 'Silicona N° 1' });
  await assert.rejects(pedir([box('Celeste')]), /Bienvenida en celeste está sin stock/);
  await assert.doesNotReject(pedir([box('Rosa')]));
  await assert.rejects(pedir([{ tipo: 'producto', id: 'zapatitos', color: 'Celeste', armado: 'a' }, { tipo: 'producto', id: 'babero', color: 'Rosa', armado: 'a' }]), /Zapatitos tejidos en celeste/);

  // Cantidad por color: se descuenta al vender (suelto o dentro de una box) y vuelve al cancelar
  await assert.rejects(pedir([{ tipo: 'producto', id: 'zapatitos', color: 'Rosa', cantidad: 3, armado: 'b' }, { tipo: 'producto', id: 'babero', color: 'Rosa', armado: 'b' }]), /Quedan solo 2 de Zapatitos tejidos en rosa/);
  const venta = PedidoInput.parse({ cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago: 'transferencia', items: [box('Rosa')] });
  const id = await insertar(venta, await calcular(venta, productos.uno, boxes.una));
  assert.deepEqual((await productos.uno('zapatitos'))!.stockColores, { Celeste: 0, Rosa: 1 }, 'la box rosa descontó un zapatito rosa');
  await cambiarEstado(id, 'cancelado');
  assert.deepEqual((await productos.uno('zapatitos'))!.stockColores, { Celeste: 0, Rosa: 2 }, 'cancelar lo devuelve');

  // Sin ningún color: la box queda agotada
  await patch('/productos/zapatitos', { stockColores: { Rosa: 0, Celeste: 0, Beige: 0 } });
  assert.equal((await boxes.una('bienvenida'))!.agotada, true);
  await patch('/productos/zapatitos', { stockColores: null });
  const h = await q("SELECT count(*)::int AS n FROM historial WHERE entidad = 'producto' AND entidad_id = 'zapatitos'");
  await patch('/productos/zapatitos', { stockColores: null });
  assert.equal((await q("SELECT count(*)::int AS n FROM historial WHERE entidad = 'producto' AND entidad_id = 'zapatitos'"))[0].n, h[0].n, 'guardar lo mismo no ensucia el historial');
});
