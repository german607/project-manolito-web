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
  assert.throws(() => calcular(pedido([{ tipo: 'box', id: 'bienvenida' }]), productos.uno, boxes.una), /nombre del bebé/);
  assert.doesNotThrow(() => calcular(pedido([{ tipo: 'box', id: 'bienvenida', nombreBebe: 'Ema' }]), productos.uno, boxes.una));
});

test('un pedido sin pagar vence a las 2 horas, devuelve el stock y se puede reactivar', async () => {
  const { insertar, vencerPedidos, cambiarEstado, buscarPedido } = await import('./pedidos.js');
  const { db } = await import('./db.js');
  db.prepare("UPDATE productos SET controla_stock = 1, stock = 3 WHERE id = 'babero'").run();
  const stock = () => productos.uno('babero')!.stock;
  const input = pedido([{ tipo: 'producto', id: 'babero', cantidad: 2 }]);
  const id = insertar(input, calcular(input, productos.uno, boxes.una));
  assert.equal(stock(), 1);

  assert.equal(vencerPedidos(), 0, 'recién creado no vence');
  db.prepare("UPDATE pedidos SET creado = datetime('now', '-121 minutes') WHERE id = ?").run(id);
  assert.equal(vencerPedidos(), 1);
  assert.equal(buscarPedido(id)!.estado, 'cancelado');
  assert.equal(stock(), 3, 'cancelar devuelve el stock');

  cambiarEstado(id, 'pagado'); // pago que llega tarde
  assert.equal(stock(), 1, 'reactivar vuelve a descontar');
  db.prepare("UPDATE productos SET controla_stock = 1, stock = 0 WHERE id = 'babero'").run();
  cambiarEstado(id, 'cancelado');
  assert.equal(stock(), 2);
  db.prepare("UPDATE productos SET controla_stock = 1, stock = 1 WHERE id = 'babero'").run();
  assert.throws(() => cambiarEstado(id, 'pagado'), /stock suficiente/, 'sin stock no se reactiva');
  assert.equal(buscarPedido(id)!.estado, 'cancelado');
});

test('las boxes descuentan y devuelven el stock de los productos que traen', async () => {
  const { insertar, cambiarEstado, buscarPedido } = await import('./pedidos.js');
  const { db } = await import('./db.js');
  const stock = (id: string) => productos.uno(id)!.stock;
  db.prepare("UPDATE productos SET controla_stock = 1, stock = 5 WHERE id IN ('babero', 'porta')").run();

  // Mini box (babero + portachupete) x2 y un portachupete suelto: el portachupete baja 3
  const input = pedido([{ tipo: 'box', id: 'mini-box', cantidad: 2, nombreBebe: 'Ema' }, { tipo: 'producto', id: 'porta', nombreBebe: 'Leo' }]);
  const id = insertar(input, calcular(input, productos.uno, boxes.una));
  assert.deepEqual([stock('babero'), stock('porta')], [3, 2]);

  cambiarEstado(id, 'cancelado');
  assert.deepEqual([stock('babero'), stock('porta')], [5, 5]);

  // Sin stock de un producto, la box figura agotada y no se puede comprar
  db.prepare("UPDATE productos SET controla_stock = 1, stock = 0 WHERE id = 'babero'").run();
  assert.equal(boxes.una('mini-box')!.agotada, true);
  assert.throws(() => calcular(pedido([{ tipo: 'box', id: 'mini-box', nombreBebe: 'Ema' }]), productos.uno, boxes.una), /no queda stock de Babero/);
  assert.equal(boxes.una('bienvenida')!.agotada, false, 'la Bienvenida no trae babero');

  // Pedido viejo (sin `componentes`) de una box: al cancelarlo no inventa stock
  db.prepare("UPDATE productos SET controla_stock = 1, stock = 5 WHERE id = 'babero'").run();
  const viejo = db.prepare(`INSERT INTO pedidos (nombre, telefono, email, entrega, pago, items, subtotal, total)
    VALUES ('Ana', '099', 'a@a.com', 'pickup', 'transferencia', ?, 890, 890)`)
    .run(JSON.stringify([{ tipo: 'box', id: 'mini-box', nombre: 'Mini box', cantidad: 1, precioUnitario: 890, total: 890 }]));
  cambiarEstado(Number(viejo.lastInsertRowid), 'cancelado');
  assert.equal(stock('babero'), 5);
  assert.equal(buscarPedido(id)!.estado, 'cancelado');
});

test('"Ignorar stock": se vende sin mirar ni tocar la cantidad, y al volver a controlar sigue la misma', async () => {
  const { insertar } = await import('./pedidos.js');
  const { db } = await import('./db.js');
  db.prepare("UPDATE productos SET controla_stock = 0, stock = 0 WHERE id = 'mordillo'").run();
  const p = productos.uno('mordillo')!;
  assert.deepEqual([p.stock, p.stockCargado, p.controlaStock], [null, 0, false]);

  const input = pedido([{ tipo: 'producto', id: 'mordillo', cantidad: 4 }, { tipo: 'box', id: 'esencial', nombreBebe: 'Ema' }]);
  insertar(input, calcular(input, productos.uno, boxes.una)); // con stock 0 igual se vende
  assert.equal(productos.uno('mordillo')!.stockCargado, 0, 'no se descontó');
  assert.equal(boxes.una('esencial')!.agotada, false);

  db.prepare("UPDATE productos SET controla_stock = 1 WHERE id = 'mordillo'").run();
  assert.equal(productos.uno('mordillo')!.stock, 0);
  assert.equal(boxes.una('esencial')!.agotada, true);
});
