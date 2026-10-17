import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular, cambiarEstado, buscarPedido, insertar, vencerPedidos, PedidoInput } from './pedidos.js';
import { productos, boxes, q, q1 } from './db.js';

const pedido = (items: unknown[], pago = 'transferencia') => PedidoInput.parse({
  cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago, items,
});
const cotizar = (items: unknown[], pago?: string) => calcular(pedido(items, pago), productos.uno, boxes.una);
const comprar = async (items: unknown[]) => { const input = pedido(items); return insertar(input, await calcular(input, productos.uno, boxes.una)); };
const stock = async (id: string) => (await productos.uno(id))!.stock;
const setStock = (ids: string[], n: number, controla = true) =>
  q('UPDATE productos SET controla_stock = $1, stock = $2 WHERE id = ANY($3)', [controla, n, ids]);

test('portachupete: 5 letras incluidas, $20 por letra extra', async () => {
  assert.equal((await cotizar([{ tipo: 'producto', id: 'porta', nombreBebe: 'Valentina' }])).total, 790 + 4 * 20);
});

test('portachupete: guarda el modelo elegido en la línea', async () => {
  const c = await cotizar([{ tipo: 'producto', id: 'porta', nombreBebe: 'Ema', modelo: 'Silicona, foto 2' }]);
  assert.equal(c.lineas[0].modelo, 'Silicona, foto 2');
});

test('suma productos, boxes y cantidades', async () => {
  const c = await cotizar([{ tipo: 'producto', id: 'babero', cantidad: 2 }, { tipo: 'box', id: 'mini-box', nombreBebe: 'Ema' }]);
  assert.equal(c.subtotal, 190 * 2 + 890);
});

test('Mercado Pago agrega 10%', async () => {
  const c = await cotizar([{ tipo: 'box', id: 'esencial', nombreBebe: 'Ema' }], 'mercadopago');
  assert.deepEqual([c.subtotal, c.recargo, c.total], [1590, 159, 1749]);
});

test('rechaza color inexistente y producto desconocido', async () => {
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'trapito', color: 'Verde' }]));
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'nada' }]));
});

test('el portachupete y las boxes que lo traen piden el nombre del bebé', async () => {
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'porta' }]), /nombre del bebé/);
  await assert.rejects(cotizar([{ tipo: 'box', id: 'mini-box' }]), /nombre del bebé/);
  await assert.rejects(cotizar([{ tipo: 'box', id: 'bienvenida' }]), /nombre del bebé/);
  await assert.doesNotReject(cotizar([{ tipo: 'box', id: 'bienvenida', nombreBebe: 'Ema' }]));
});

test('las boxes no cobran letras extra en el portachupete', async () => {
  const c = await cotizar([{ tipo: 'box', id: 'mini-box', nombreBebe: 'Maximiliano' }]);
  assert.equal(c.total, (await boxes.una('mini-box'))!.precio);
});

test('un pedido sin pagar vence a las 2 horas, devuelve el stock y se puede reactivar', async () => {
  await setStock(['babero'], 3);
  const id = await comprar([{ tipo: 'producto', id: 'babero', cantidad: 2 }]);
  assert.equal(await stock('babero'), 1);

  assert.equal(await vencerPedidos(), 0, 'recién creado no vence');
  await q("UPDATE pedidos SET creado = now() - interval '121 minutes' WHERE id = $1", [id]);
  assert.equal(await vencerPedidos(), 1);
  assert.equal((await buscarPedido(id))!.estado, 'cancelado');
  assert.equal(await stock('babero'), 3, 'cancelar devuelve el stock');

  await cambiarEstado(id, 'pagado'); // pago que llega tarde
  assert.equal(await stock('babero'), 1, 'reactivar vuelve a descontar');
  await setStock(['babero'], 0);
  await cambiarEstado(id, 'cancelado');
  assert.equal(await stock('babero'), 2);
  await setStock(['babero'], 1);
  await assert.rejects(cambiarEstado(id, 'pagado'), /stock suficiente/, 'sin stock no se reactiva');
  assert.equal((await buscarPedido(id))!.estado, 'cancelado', 'y el pedido queda como estaba');
});

test('las boxes descuentan y devuelven el stock de los productos que traen', async () => {
  await setStock(['babero', 'porta'], 5);
  // Mini box (babero + portachupete) x2 y un portachupete suelto: el portachupete baja 3
  const id = await comprar([{ tipo: 'box', id: 'mini-box', cantidad: 2, nombreBebe: 'Ema' }, { tipo: 'producto', id: 'porta', nombreBebe: 'Leo' }]);
  assert.deepEqual([await stock('babero'), await stock('porta')], [3, 2]);

  await cambiarEstado(id, 'cancelado');
  assert.deepEqual([await stock('babero'), await stock('porta')], [5, 5]);

  // Sin stock de un producto, la box figura agotada y no se puede comprar
  await setStock(['babero'], 0);
  assert.equal((await boxes.una('mini-box'))!.agotada, true);
  await assert.rejects(cotizar([{ tipo: 'box', id: 'mini-box', nombreBebe: 'Ema' }]), /no queda stock de Babero/);
  assert.equal((await boxes.una('bienvenida'))!.agotada, false, 'la Bienvenida no trae babero');

  // Pedido viejo (sin `componentes`) de una box: al cancelarlo no inventa stock
  await setStock(['babero'], 5);
  const viejo = await q1<{ id: number }>(`INSERT INTO pedidos (nombre, telefono, email, entrega, pago, items, subtotal, total)
    VALUES ('Ana', '099', 'a@a.com', 'pickup', 'transferencia', $1, 890, 890) RETURNING id`,
    [JSON.stringify([{ tipo: 'box', id: 'mini-box', nombre: 'Mini box', cantidad: 1, precioUnitario: 890, total: 890 }])]);
  await cambiarEstado(viejo!.id, 'cancelado');
  assert.equal(await stock('babero'), 5);
});

test('"Ignorar stock": se vende sin mirar ni tocar la cantidad, y al volver a controlar sigue la misma', async () => {
  await setStock(['mordillo'], 0, false);
  const p = (await productos.uno('mordillo'))!;
  assert.deepEqual([p.stock, p.stockCargado, p.controlaStock], [null, 0, false]);

  await comprar([{ tipo: 'producto', id: 'mordillo', cantidad: 4 }, { tipo: 'box', id: 'esencial', nombreBebe: 'Ema' }]); // con stock 0 igual se vende
  assert.equal((await productos.uno('mordillo'))!.stockCargado, 0, 'no se descontó');
  assert.equal((await boxes.una('esencial'))!.agotada, false);

  await q("UPDATE productos SET controla_stock = true WHERE id = 'mordillo'");
  assert.equal(await stock('mordillo'), 0);
  assert.equal((await boxes.una('esencial'))!.agotada, true);
});

test('dos compras simultáneas de la última unidad: pasa una sola', async () => {
  await setStock(['zapatitos'], 1);
  const compra = () => comprar([{ tipo: 'producto', id: 'zapatitos' }]);
  const r = await Promise.allSettled([compra(), compra(), compra()]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(await stock('zapatitos'), 0, 'nunca queda negativo');
});
