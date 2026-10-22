import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armadosIncompletos, calcular, cambiarEstado, buscarPedido, insertar, vencerPedidos, PedidoInput } from './pedidos.js';
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
  const c = await cotizar([{ tipo: 'producto', id: 'porta', nombreBebe: 'Ema', modelo: 'Silicona N° 2' }]);
  assert.equal(c.lineas[0].modelo, 'Silicona N° 2');
});

test('color Estampada pide contar qué estampado', async () => {
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'manta', armado: 'a1', color: 'Estampada' }]), /estampado/);
  const c = await cotizar([{ tipo: 'producto', id: 'manta', armado: 'a1', color: 'Estampada', estampado: 'Ositos' }]);
  assert.equal(c.lineas[0].estampado, 'Ositos');
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'manta', armado: 'a1', color: 'Rosa', estampado: 'Ositos' }]), /Estampada/);
});

test('suma productos, boxes y cantidades', async () => {
  const c = await cotizar([{ tipo: 'producto', id: 'babero', modelo: 'N° 1', armado: 'a1', cantidad: 2 }, { tipo: 'box', id: 'mini-box', babero: 'N° 2', color: 'Rosa', nombreBebe: 'Ema' }]);
  const [babero, mini] = [(await productos.uno('babero'))!.precio, (await boxes.una('mini-box'))!.precio]; // leídos de la base: no se rompe si cambian los precios
  assert.equal(c.subtotal, babero * 2 + mini);
});

test('Mercado Pago agrega 10%', async () => {
  const c = await cotizar([{ tipo: 'box', id: 'esencial', color: 'Rosa', nombreBebe: 'Ema' }], 'mercadopago');
  assert.deepEqual([c.subtotal, c.recargo, c.total], [1590, 159, 1749]);
});

test('rechaza color inexistente y producto desconocido', async () => {
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'trapito', armado: 'a1', color: 'Verde' }]), /Color/);
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'nada', armado: 'a1' }]));
});

test('el portachupete y las boxes que lo traen piden el nombre del bebé', async () => {
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'porta' }]), /nombre del bebé/);
  await assert.rejects(cotizar([{ tipo: 'box', id: 'mini-box', babero: 'N° 2', color: 'Rosa' }]), /nombre del bebé/);
  await assert.rejects(cotizar([{ tipo: 'box', id: 'bienvenida', color: 'Rosa' }]), /nombre del bebé/);
  await assert.doesNotReject(cotizar([{ tipo: 'box', id: 'bienvenida', color: 'Rosa', nombreBebe: 'Ema' }]));
});

test('las boxes no cobran letras extra en el portachupete', async () => {
  const c = await cotizar([{ tipo: 'box', id: 'mini-box', babero: 'N° 2', color: 'Rosa', nombreBebe: 'Maximiliano' }]);
  assert.equal(c.total, (await boxes.una('mini-box'))!.precio);
});

test('un pedido sin pagar vence a las 2 horas, devuelve el stock y se puede reactivar', async () => {
  await setStock(['babero'], 3);
  const id = await comprar([{ tipo: 'producto', id: 'babero', modelo: 'N° 1', armado: 'a1', cantidad: 2 }]);
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
  const id = await comprar([{ tipo: 'box', id: 'mini-box', babero: 'N° 2', color: 'Rosa', cantidad: 2, nombreBebe: 'Ema' }, { tipo: 'producto', id: 'porta', nombreBebe: 'Leo' }]);
  assert.deepEqual([await stock('babero'), await stock('porta')], [3, 2]);

  await cambiarEstado(id, 'cancelado');
  assert.deepEqual([await stock('babero'), await stock('porta')], [5, 5]);

  // Sin stock de un producto, la box figura agotada y no se puede comprar
  await setStock(['babero'], 0);
  assert.equal((await boxes.una('mini-box'))!.agotada, true);
  await assert.rejects(cotizar([{ tipo: 'box', id: 'mini-box', babero: 'N° 2', color: 'Rosa', nombreBebe: 'Ema' }]), /no queda stock de Babero/);
  assert.equal((await boxes.una('bienvenida'))!.agotada, false, 'la Bienvenida no trae babero');

  // Pedido viejo (sin `componentes`) de una box: al cancelarlo no inventa stock
  await setStock(['babero'], 5);
  const viejo = await q1<{ id: number }>(`INSERT INTO pedidos (nombre, telefono, email, entrega, pago, items, subtotal, total)
    VALUES ('Ana', '099', 'a@a.com', 'pickup', 'transferencia', $1, 890, 890) RETURNING id`,
    [JSON.stringify([{ tipo: 'box', id: 'mini-box', babero: 'N° 2', color: 'Rosa', nombre: 'Mini box', cantidad: 1, precioUnitario: 890, total: 890 }])]);
  await cambiarEstado(viejo!.id, 'cancelado');
  assert.equal(await stock('babero'), 5);
});

test('"Ignorar stock": se vende sin mirar ni tocar la cantidad, y al volver a controlar sigue la misma', async () => {
  await setStock(['mordillo'], 0, false);
  const p = (await productos.uno('mordillo'))!;
  assert.deepEqual([p.stock, p.stockCargado, p.controlaStock], [null, 0, false]);

  await comprar([{ tipo: 'producto', id: 'mordillo', armado: 'a1', cantidad: 4 }, { tipo: 'box', id: 'esencial', color: 'Rosa', nombreBebe: 'Ema' }]); // con stock 0 igual se vende
  assert.equal((await productos.uno('mordillo'))!.stockCargado, 0, 'no se descontó');
  assert.equal((await boxes.una('esencial'))!.agotada, false);

  await q("UPDATE productos SET controla_stock = true WHERE id = 'mordillo'");
  assert.equal(await stock('mordillo'), 0);
  assert.equal((await boxes.una('esencial'))!.agotada, true);
});

test('dos compras simultáneas de la última unidad: pasa una sola', async () => {
  await setStock(['zapatitos'], 1);
  const compra = () => comprar([{ tipo: 'producto', id: 'zapatitos', armado: 'a1' }]);
  const r = await Promise.allSettled([compra(), compra(), compra()]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(await stock('zapatitos'), 0, 'nunca queda negativo');
});

// ---------- Reglas de compra (pedidas por la dueña) ----------

test('nombre del bebé obligatorio en todos los caminos: sección Portachupetes, Armá tu box y boxes', async () => {
  // Sección Portachupetes: suelto, con modelo
  await assert.doesNotReject(cotizar([{ tipo: 'producto', id: 'porta', nombreBebe: 'Lola', modelo: 'Silicona N° 3' }]));
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'porta', modelo: 'Silicona N° 3' }]), /nombre del bebé/);
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'porta', nombreBebe: '   ', modelo: 'Silicona N° 3' }]), /nombre del bebé/, 'solo espacios cuenta como vacío');
  assert.throws(() => pedido([{ tipo: 'producto', id: 'porta', nombreBebe: 'x'.repeat(21) }]), 'más de 20 letras se rechaza');
  // Armá tu box: el portachupete dentro de un armado
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'porta', armado: 'a1' }, { tipo: 'producto', id: 'babero', modelo: 'N° 1', armado: 'a1' }]), /nombre del bebé/);
  // Boxes que traen portachupete
  await assert.rejects(cotizar([{ tipo: 'box', id: 'mini-box', babero: 'N° 2', color: 'Rosa', nombreBebe: '  ' }]), /nombre del bebé/);
});

test('Armá tu box: mínimo 2 productos distintos por armado', () => {
  const inc = (items: unknown[]) => [...armadosIncompletos(pedido(items).items)];
  assert.deepEqual(inc([{ tipo: 'producto', id: 'babero', modelo: 'N° 1', armado: 'a1' }]), ['a1'], 'un solo producto');
  assert.deepEqual(inc([{ tipo: 'producto', id: 'babero', modelo: 'N° 1', armado: 'a1', cantidad: 3 }]), ['a1'], 'cantidad no cuenta como distinto');
  assert.deepEqual(inc([{ tipo: 'producto', id: 'trapito', armado: 'a1', color: 'Rosa' }, { tipo: 'producto', id: 'trapito', armado: 'a1', color: 'Celeste' }]), ['a1'], 'dos colores del mismo producto no alcanzan');
  assert.deepEqual(inc([{ tipo: 'producto', id: 'babero', modelo: 'N° 1', armado: 'a1' }, { tipo: 'producto', id: 'manta', armado: 'a1' }]), [], 'dos distintos: ok');
  assert.deepEqual(inc([
    { tipo: 'producto', id: 'babero', modelo: 'N° 1', armado: 'a1' }, { tipo: 'producto', id: 'manta', armado: 'a1' },
    { tipo: 'producto', id: 'mordillo', armado: 'a2' },
  ]), ['a2'], 'cada armado se controla por separado: no se suman entre sí');
  assert.deepEqual(inc([{ tipo: 'producto', id: 'porta', nombreBebe: 'Lola' }, { tipo: 'box', id: 'esencial', color: 'Rosa', nombreBebe: 'Lola' }]), [], 'portachupete suelto y boxes no son armados');
});

test('Armá tu box: los productos no se venden sueltos (salvo el portachupete) y las boxes no van en un armado', async () => {
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'babero', modelo: 'N° 1' }]), /Armá tu box/, 'un babero sin armado se rechaza');
  await assert.doesNotReject(cotizar([{ tipo: 'producto', id: 'porta', nombreBebe: 'Lola' }]), 'el portachupete sí, desde su sección');
  await assert.rejects(cotizar([{ tipo: 'box', id: 'mini-box', babero: 'N° 2', color: 'Rosa', nombreBebe: 'Ema', armado: 'a1' }]), /no van dentro de un armado/);
});

// ---------- Historial ----------

test('historial: se registra quién creó el pedido y cada cambio de estado; lo que falla no queda registrado', async () => {
  const historial = async (id: number) => (await q<{ autor: string; accion: string; cambios: Record<string, unknown[]> }>(
    "SELECT autor, accion, cambios FROM historial WHERE entidad = 'pedido' AND entidad_id = $1 ORDER BY id", [String(id)]));
  await setStock(['sonajero', 'peine'], 1);
  const input = pedido([{ tipo: 'producto', id: 'sonajero', armado: 'h1' }, { tipo: 'producto', id: 'peine', armado: 'h1' }]);
  const id = await insertar(input, await calcular(input, productos.uno, boxes.una), null, 'cliente');
  await cambiarEstado(id, 'cancelado', undefined, 'admin@manolito.com');
  await cambiarEstado(id, 'cancelado', undefined, 'admin@manolito.com'); // mismo estado: no es un cambio
  await setStock(['sonajero'], 0);
  await assert.rejects(cambiarEstado(id, 'pagado', 'mp-1', 'mercadopago'), /stock suficiente/);

  const h = await historial(id);
  assert.deepEqual(h.map(x => [x.autor, x.accion]), [['cliente', 'crear'], ['admin@manolito.com', 'estado']]);
  assert.deepEqual(h[1].cambios, { estado: ['pendiente', 'cancelado'] });
});

test('boxes: hay que elegir uno de sus colores', async () => {
  await assert.rejects(cotizar([{ tipo: 'box', id: 'esencial', nombreBebe: 'Ema' }]), /Elegí el color de Box Esencial/);
  await assert.rejects(cotizar([{ tipo: 'box', id: 'esencial', color: 'Verde', nombreBebe: 'Ema' }]), /no disponible/, 'la Esencial no viene en verde');
  const c = await cotizar([{ tipo: 'box', id: 'mini-box', babero: 'N° 2', color: 'Verde', nombreBebe: 'Ema' }]);
  assert.equal(c.lineas[0].color, 'Verde', 'la Mini box sí, y el color queda en el pedido');
});

test('baberos: hay que elegir uno de los modelos (suelto en un armado o dentro de una box que lo trae)', async () => {
  const porta = { tipo: 'producto' as const, id: 'porta', armado: 'b1', nombreBebe: 'Ema', modelo: 'Silicona N° 1' };
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'babero', armado: 'b1' }, porta]), /Elegí el modelo de Babero/);
  await assert.rejects(cotizar([{ tipo: 'producto', id: 'babero', armado: 'b1', modelo: 'N° 99' }, porta]), /Elegí el modelo de Babero/);
  await assert.rejects(cotizar([{ tipo: 'box', id: 'mini-box', color: 'Rosa', nombreBebe: 'Ema' }]), /modelo de babero de Mini box/);
  await assert.rejects(cotizar([{ tipo: 'box', id: 'esencial', color: 'Rosa', nombreBebe: 'Ema', babero: 'N° 1' }]), /no disponible/, 'la Esencial no trae babero');
  const c = await cotizar([{ tipo: 'box', id: 'mini-box', color: 'Rosa', nombreBebe: 'Ema', babero: 'N° 4' }, { tipo: 'producto', id: 'babero', armado: 'b1', modelo: 'N° 6' }, porta]);
  assert.equal(c.lineas[0].babero, 'N° 4');
  assert.equal(c.lineas[1].modelo, 'N° 6');
});
