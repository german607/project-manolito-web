import './test-setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { adminRouter } from './admin.js';
import { manejarErrores } from './errores.js';
import { calcular, insertar, cambiarEstado, buscarPedido, PedidoInput } from './pedidos.js';
import { productos, boxes, q } from './db.js';

async function api(metodo: string, ruta: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.usuario = { id: 1, email: 'admin@test.com', rol: 'admin' }; next(); });
  app.use('/api/admin', adminRouter);
  app.use(manejarErrores);
  const srv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/admin/finanzas${ruta}`,
      { method: metodo, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: r.status, d: await r.json() as any };
  } finally { srv.close(); }
}
const pagar = async (pago: string) => {
  const input = PedidoInput.parse({ cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago,
    items: [{ tipo: 'producto', id: 'porta', nombreBebe: 'Ema' }] });
  const id = await insertar(input, await calcular(input, productos.uno, boxes.una));
  await cambiarEstado(id, 'pagado');
  return (await buscarPedido(id))!;
};

test('finanzas: el contador cuenta lo cobrado desde el último cierre, por medio de pago; el cierre guarda su período', async () => {
  await q('UPDATE productos SET controla_stock = false');
  const a = await pagar('transferencia');
  const b = await pagar('abitab_redpagos');
  assert.ok(a.pagado, 'al pasar a pagado se guarda cuándo');
  // El de Abitab se pagó "ayer": un cierre con fecha pasada lo deja afuera del contador... y adentro del cierre
  await q("UPDATE pedidos SET pagado = now() - interval '1 day' WHERE id = $1", [b.id]);

  let r = await api('GET', '');
  assert.equal(r.d.actual.desde, null);
  assert.equal(r.d.actual.total, a.total + b.total);
  assert.deepEqual(r.d.actual.porPago.map((p: any) => p.pago).sort(), ['abitab_redpagos', 'transferencia']);

  const hasta = new Date(Date.now() - 3600_000).toISOString(); // hace 1 h: después del de Abitab, antes del de transferencia
  const c = await api('POST', '/cierres', { hasta, nota: 'Retiro del banco' });
  assert.equal(c.status, 201);
  assert.deepEqual([c.d.total, c.d.pedidos, c.d.por_pago[0].pago], [b.total, 1, 'abitab_redpagos']);

  r = await api('GET', '');
  assert.equal(r.d.actual.total, a.total, 'el contador sigue con lo cobrado después del cierre');
  assert.equal(r.d.cierres.length, 1);

  assert.equal((await api('POST', '/cierres', { hasta: new Date(Date.now() - 2 * 3600_000).toISOString() })).status, 400, 'no antes del cierre anterior');
  assert.equal((await api('POST', '/cierres', { hasta: new Date(Date.now() + 3600_000).toISOString() })).status, 400, 'no en el futuro');

  // Un pago que se devuelve (cancelado) deja de contar; el cierre ya hecho no cambia
  await cambiarEstado(b.id, 'cancelado');
  assert.equal((await api('GET', '')).d.cierres[0].total, b.total);

  // Deshacer: solo el último; lo cobrado vuelve al contador
  const c2 = await api('POST', '/cierres', {});
  assert.equal((await api('DELETE', `/cierres/${c.d.id}`)).status, 409);
  assert.equal((await api('DELETE', `/cierres/${c2.d.id}`)).status, 200);
  assert.equal((await api('GET', '')).d.actual.total, a.total);
});
