import './test-setup.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calcular, insertar, buscarPedido, cambiarEstado, vencerPedidos, PedidoInput } from './pedidos.js';
import { crearToken, datosDePago, guardarAjustesPagos, leerAjustesPagos, pedidoConToken, subirComprobante } from './pagosManuales.js';
import { leerPrivado } from './imagenes.js';
import { productos, boxes, q } from './db.js';

after(() => rmSync(fileURLToPath(new URL('../data/privado/comprobantes', import.meta.url)), { recursive: true, force: true }));

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const PDF = Buffer.from('%PDF-1.7\n...');

async function pedido(pago = 'transferencia') {
  const input = PedidoInput.parse({
    cliente: { nombre: 'Ana', telefono: '099123456', email: 'ana@test.com' }, entrega: 'pickup', pago,
    items: [{ tipo: 'producto', id: 'porta', nombreBebe: 'Lola' }],
  });
  const id = await insertar(input, await calcular(input, productos.uno, boxes.una));
  return { id, token: await crearToken(id) };
}

test('datos para transferir: sin cargar no se inventan; cargados incluyen monto y referencia', async () => {
  const { id } = await pedido();
  const p = (await buscarPedido(id))!;
  assert.equal(await datosDePago(p), null, 'sin datos cargados: se coordina aparte');

  const a = await leerAjustesPagos();
  a.transferencia = { banco: 'BROU', tipoCuenta: 'Caja de ahorro en pesos', cuenta: '001234567-00001', titular: 'Manolito', documento: '' };
  await guardarAjustesPagos(a, 'admin@test.com');
  const d = (await datosDePago(p))!;
  const campo = (e: string) => d.campos.find(c => c.etiqueta.startsWith(e))?.valor;
  assert.equal(campo('Número de cuenta'), '001234567-00001');
  assert.equal(campo('Monto'), `$${p.total}`);
  assert.equal(campo('Referencia'), `MANOLITO-${id}`);
  assert.equal(campo('RUT'), undefined, 'los campos vacíos no se muestran');
});

test('el token del pedido: solo con el correcto se ven los datos y se sube el comprobante', async () => {
  const { id, token } = await pedido();
  assert.equal((await pedidoConToken(id, token)).id, id);
  await assert.rejects(pedidoConToken(id, 'f'.repeat(48)), /no encontrado/);
  const otro = await pedido();
  await assert.rejects(pedidoConToken(id, otro.token), /no encontrado/, 'el token de otro pedido no sirve');
  const fila = await q<{ token_pago: string }>('SELECT token_pago FROM pedidos WHERE id = $1', [id]);
  assert.notEqual(fila[0].token_pago, token, 'en la base queda el hash, no el token');
});

test('comprobante: se guarda privado, el pedido no vence mientras se revisa y el admin confirma', async () => {
  const { id, token } = await pedido();
  await assert.rejects(subirComprobante(id, token, Buffer.from('no soy un comprobante')), /foto.*PDF/);

  await subirComprobante(id, token, PNG);
  const p = (await buscarPedido(id))!;
  assert.ok(p.comprobante?.startsWith('comprobantes/'), 'clave privada, fuera de assets/img');
  assert.deepEqual(await leerPrivado(p.comprobante!), PNG);
  await subirComprobante(id, token, PDF); // puede reemplazarlo
  assert.equal((await buscarPedido(id))!.comprobante_tipo, 'application/pdf');

  await q("UPDATE pedidos SET creado = now() - interval '5 hours' WHERE id = $1", [id]);
  await vencerPedidos();
  assert.equal((await buscarPedido(id))!.estado, 'pendiente', 'con comprobante no vence');

  await cambiarEstado(id, 'pagado', undefined, 'admin@test.com');
  await assert.rejects(subirComprobante(id, token, PNG), /ya está confirmado/);
  const h = await q("SELECT accion FROM historial WHERE entidad = 'pedido' AND entidad_id = $1 ORDER BY id", [String(id)]);
  assert.deepEqual(h.map(x => x.accion), ['crear', 'comprobante', 'comprobante', 'estado']);
});

test('comprobante: no aplica a pedidos de Mercado Pago', async () => {
  const { id, token } = await pedido('mercadopago');
  await assert.rejects(subirComprobante(id, token, PNG), /Mercado Pago/);
});
