import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { adminRouter } from './admin.js';
import { manejarErrores } from './errores.js';
import { calcular, insertar, cambiarEstado, PedidoInput } from './pedidos.js';
import { productos, boxes, q } from './db.js';

async function resumen() {
  const app = express();
  app.use((_req, res, next) => { res.locals.usuario = { id: 1, email: 'admin@test.com', rol: 'admin' }; next(); });
  app.use('/api/admin', adminRouter);
  app.use(manejarErrores);
  const srv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/admin/resumen?dias=30`);
    return await r.json() as any;
  } finally { srv.close(); }
}
const comprar = async (email: string, extra: Record<string, unknown> = {}) => {
  const input = PedidoInput.parse({ cliente: { nombre: 'Ana', telefono: '099123456', email }, entrega: 'pickup', pago: 'transferencia',
    items: [{ tipo: 'box', id: 'esencial', color: 'Rosa', nombreBebe: 'Ema', modelo: 'Silicona N° 1' }], ...extra });
  const id = await insertar(input, await calcular(input, productos.uno, boxes.una));
  await cambiarEstado(id, 'pagado');
  return id;
};

test('resumen: origen de las ventas, cupones, conversión por box, clientes nuevos y que vuelven', async () => {
  await q("UPDATE productos SET controla_stock = false");
  await q("INSERT INTO cupones (codigo, tipo, valor) VALUES ('METRICA5', 'porcentaje', 5) ON CONFLICT DO NOTHING");
  await q("INSERT INTO eventos (dia, tipo, ref, n) VALUES (CURRENT_DATE, 'box_ver', 'Box Esencial', 10) ON CONFLICT (dia, tipo, ref) DO UPDATE SET n = 10");
  // Una clienta que ya había comprado antes del período y vuelve; otra nueva que llega de Instagram con cupón
  const viejo = await comprar('Vuelve@Test.com');
  await q("UPDATE pedidos SET creado = now() - interval '60 days' WHERE id = $1", [viejo]);
  await comprar('vuelve@test.com');
  await comprar('nueva@test.com', { cupon: 'METRICA5', origen: { fuente: 'Instagram', campana: 'Dia-Del-Padre' } });

  const r = await resumen();
  const ig = r.porOrigen.find((o: any) => o.ref === 'instagram');
  assert.equal(ig?.campana, 'dia-del-padre', 'el origen se guarda en minúsculas, con su campaña');
  assert.equal(r.cupones.find((c: any) => c.ref === 'METRICA5')?.pedidos, 1);
  const esencial = r.conversionBoxes.find((b: any) => b.ref === 'Box Esencial');
  assert.ok(esencial.vistas >= 10 && esencial.vendidas >= 2);
  assert.ok(r.clientes.nuevos >= 1 && r.clientes.vuelven >= 1);
  assert.ok(r.mejoresClientes.some((c: any) => c.email === 'vuelve@test.com' && c.pedidos === 2), 'el mismo email con distinta mayúscula es la misma clienta');
  assert.ok('total' in r.anterior && r.porHora.length && r.porDiaSemana.length);
});
