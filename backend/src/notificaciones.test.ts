import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificaciones } from './admin.js';
import { calcular, insertar, cambiarEstado, PedidoInput } from './pedidos.js';
import { productos, boxes, q, q1 } from './db.js';

test('notificaciones: cambios en pedidos que no hizo el admin; las nuevas se cuentan hasta que las ve', async () => {
  const admin = (await q1<{ id: number; email: string }>(
    `INSERT INTO usuarios (email, nombre, hash, rol) VALUES ('notif@test.com', 'Admin', 'x', 'admin') RETURNING id, email`))!;
  const input = PedidoInput.parse({ cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago: 'transferencia',
    items: [{ tipo: 'producto', id: 'porta', nombreBebe: 'Lola', modelo: 'Silicona N° 1' }] });
  const id = await insertar(input, await calcular(input, productos.uno, boxes.una)); // autor: cliente
  await cambiarEstado(id, 'pagado', undefined, 'mercadopago');
  await cambiarEstado(id, 'enviado', undefined, admin.email);                         // lo hizo él: no le avisa

  const n = await notificaciones(admin);
  const deEste = n.items.filter((x: any) => x.pedido === String(id));
  assert.deepEqual(deEste.map((x: any) => x.accion), ['estado', 'crear']);
  assert.ok(deEste.every((x: any) => x.nueva && x.nombre === 'Ana'));
  assert.ok(n.noLeidas >= 2);

  await q('UPDATE usuarios SET notif_vistas = now() WHERE id = $1', [admin.id]);
  assert.equal((await notificaciones(admin)).noLeidas, 0, 'después de abrir la campanita no quedan nuevas');
});
