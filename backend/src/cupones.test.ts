import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular, insertar, cambiarEstado, PedidoInput } from './pedidos.js';
import { productos, boxes, q, q1 } from './db.js';

const porta = { tipo: 'producto', id: 'porta', nombreBebe: 'Ema' }; // $790
const pedido = (cupon?: string, pago = 'transferencia') => PedidoInput.parse({
  cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago, items: [porta], cupon,
});
const cotizar = (cupon?: string, pago?: string) => calcular(pedido(cupon, pago), productos.uno, boxes.una);
const crear = (codigo: string, tipo: string, valor: number, extra: Record<string, unknown> = {}) =>
  q(`INSERT INTO cupones (codigo, tipo, valor, minimo, usos_max, vence) VALUES ($1, $2, $3, $4, $5, $6)`,
    [codigo, tipo, valor, extra.minimo ?? 0, extra.usosMax ?? null, extra.vence ?? null]);
const usos = async (codigo: string) => (await q1<{ usos: number }>('SELECT usos FROM cupones WHERE codigo = $1', [codigo]))!.usos;

test('cupones: porcentaje y monto fijo; el recargo de Mercado Pago va sobre lo descontado', async () => {
  await crear('BIENVENIDA10', 'porcentaje', 10);
  await crear('MENOS200', 'monto', 200);
  const c = await cotizar('bienvenida10'); // no importan las mayúsculas
  assert.deepEqual([c.subtotal, c.descuento, c.total, c.cupon], [790, 79, 711, 'BIENVENIDA10']);
  const mp = await cotizar('MENOS200', 'mercadopago');
  assert.deepEqual([mp.descuento, mp.recargo, mp.total], [200, 59, 790 - 200 + 59]);
});

test('cupones: inexistente, pausado, vencido, compra mínima y tope de usos', async () => {
  await assert.rejects(cotizar('NOEXISTE'), /no existe/);
  await crear('PAUSADO', 'monto', 100); await q("UPDATE cupones SET activo = false WHERE codigo = 'PAUSADO'");
  await assert.rejects(cotizar('PAUSADO'), /no existe/);
  await crear('VIEJO', 'monto', 100, { vence: '2020-01-01' });
  await assert.rejects(cotizar('VIEJO'), /venció/);
  await crear('GRANDE', 'monto', 100, { minimo: 2000 });
  await assert.rejects(cotizar('GRANDE'), /desde \$2000/);

  await crear('UNO', 'monto', 100, { usosMax: 1 });
  const id = await insertar(pedido('UNO'), await cotizar('UNO'));
  assert.equal(await usos('UNO'), 1);
  await assert.rejects(cotizar('UNO'), /todas las veces/);
  await cambiarEstado(id, 'cancelado');
  assert.equal(await usos('UNO'), 0, 'pedido cancelado: el uso vuelve a estar disponible');
  assert.equal((await cotizar('UNO')).descuento, 100);
});

test('cupones: si dos pedidos se llevan el último uso, el segundo se rechaza', async () => {
  await crear('ULTIMO', 'monto', 50, { usosMax: 1 });
  const c1 = await cotizar('ULTIMO'), c2 = await cotizar('ULTIMO'); // los dos cotizaron con el cupón disponible
  await insertar(pedido('ULTIMO'), c1);
  await assert.rejects(insertar(pedido('ULTIMO'), c2), /ya no está disponible/);
  assert.equal(await usos('ULTIMO'), 1);
});
