import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular, insertar, PedidoInput } from './pedidos.js';
import { productos, boxes, q } from './db.js';

test('numeración: los pedidos siguen con un 1 adelante (base vacía: el 0 pasa a ser 10, el primero es el 11)', async () => {
  await q('UPDATE productos SET controla_stock = false');
  const input = PedidoInput.parse({ cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago: 'transferencia',
    items: [{ tipo: 'producto', id: 'porta', nombreBebe: 'Ema' }] });
  assert.equal(await insertar(input, await calcular(input, productos.uno, boxes.una)), 11);
  assert.equal(await insertar(input, await calcular(input, productos.uno, boxes.una)), 12);
});
