import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular, PedidoInput } from './pedidos.js';
import { productos, boxes } from './db.js';

const pedido = (items: unknown[], pago = 'transferencia') => PedidoInput.parse({
  cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago, items,
});

test('portachupete: 5 letras incluidas, $20 por letra extra', () => {
  const c = calcular(pedido([{ tipo: 'producto', id: 'porta', nombreBebe: 'Valentina' }]), productos.uno, boxes.una);
  assert.equal(c.total, 790 + 4 * 20);
});

test('suma productos, boxes y cantidades', () => {
  const c = calcular(pedido([{ tipo: 'producto', id: 'babero', cantidad: 2 }, { tipo: 'box', id: 'mini-box', nombreBebe: 'Ema' }]), productos.uno, boxes.una);
  assert.equal(c.subtotal, 190 * 2 + 890);
});

test('Mercado Pago agrega 10%', () => {
  const c = calcular(pedido([{ tipo: 'box', id: 'esencial', nombreBebe: 'Ema' }], 'mercadopago'), productos.uno, boxes.una);
  assert.deepEqual([c.subtotal, c.recargo, c.total], [1490, 149, 1639]);
});

test('rechaza color inexistente y producto desconocido', () => {
  assert.throws(() => calcular(pedido([{ tipo: 'producto', id: 'trapito', color: 'Verde' }]), productos.uno, boxes.una));
  assert.throws(() => calcular(pedido([{ tipo: 'producto', id: 'nada' }]), productos.uno, boxes.una));
});

test('el portachupete y las boxes que lo traen piden el nombre del bebé', () => {
  assert.throws(() => calcular(pedido([{ tipo: 'producto', id: 'porta' }]), productos.uno, boxes.una), /nombre del bebé/);
  assert.throws(() => calcular(pedido([{ tipo: 'box', id: 'mini-box' }]), productos.uno, boxes.una), /nombre del bebé/);
  assert.doesNotThrow(() => calcular(pedido([{ tipo: 'box', id: 'bienvenida' }]), productos.uno, boxes.una)); // no trae portachupete
});
