import './test-setup.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calcular, insertar, buscarPedido, cambiarEstado, vencerPedidos, reclamarComprobante, PedidoInput } from './pedidos.js';
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
  a.transferencia = { banco: 'BROU', sucursal: '115 Cordón', tipoCuenta: 'Caja de ahorro en pesos', cuenta: '001234567-00001', cuentaOtrosBancos: '00123456700001', titular: 'Manolito', documento: '' };
  await guardarAjustesPagos(a, 'admin@test.com');
  const d = (await datosDePago(p))!;
  const campo = (e: string) => d.campos.find(c => c.etiqueta.startsWith(e))?.valor;
  assert.equal(campo('Cuenta para transferir desde BROU'), '001234567-00001');
  assert.equal(campo('Cuenta para transferir desde otro banco'), '00123456700001');
  assert.equal(campo('Sucursal'), '115 Cordón');
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

test('ajustes guardados antes del campo "otro banco" siguen funcionando', async () => {
  await q(`INSERT INTO ajustes (clave, valor) VALUES ('pagos', $1) ON CONFLICT (clave) DO UPDATE SET valor = $1`, [JSON.stringify({
    transferencia: { banco: 'Itaú', tipoCuenta: 'Caja de ahorro', cuenta: '1234567', titular: 'Manolito', documento: '' },
    abitab_redpagos: { texto: '' }, prex_midinero: { texto: '' },
  })]);
  const a = await leerAjustesPagos();
  assert.equal(a.transferencia.cuentaOtrosBancos, '', 'el campo nuevo arranca vacío');
  const { id } = await pedido();
  const d = (await datosDePago((await buscarPedido(id))!))!;
  assert.ok(d.campos.some(c => c.etiqueta === 'Cuenta para transferir desde Itaú' && c.valor === '1234567'));
  assert.ok(!d.campos.some(c => c.etiqueta.includes('otro banco')), 'vacío: no se muestra');
  assert.ok(!d.campos.some(c => c.etiqueta === 'Sucursal'), 'sin sucursal cargada: no se muestra');
});

test('reclamar pago: manda el mail con un link nuevo; no aplica con comprobante, pagados ni Mercado Pago', async () => {
  const enviados: any[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: string, init: RequestInit) => { enviados.push(JSON.parse(String(init.body))); return new Response('{}'); }) as typeof fetch;
  process.env.RESEND_API_KEY = 're_test';
  try {
    const { id, token } = await pedido();
    await reclamarComprobante(id, 'admin@test.com');
    const m = enviados.at(-1);
    assert.equal(m.to, 'ana@test.com');
    assert.match(m.subject, /Todavía no recibimos el pago/);
    assert.match(m.text, /comprobante de pago antes de las .*se cancela automáticamente/);
    assert.match(m.text, /Envianos el comprobante de pago para que podamos comenzar a preparar tu compra\./);
    await assert.rejects(pedidoConToken(id, token), /no encontrado/, 'el link viejo deja de valer: va uno nuevo en el mail');
    const h = await q("SELECT autor, accion FROM historial WHERE entidad = 'pedido' AND entidad_id = $1 AND accion = 'recordatorio'", [String(id)]);
    assert.equal(h[0].autor, 'admin@test.com');

    const nuevo = (m.text.match(/t=([a-f0-9]{48})/) ?? [])[1];
    await subirComprobante(id, nuevo, PNG);
    await assert.rejects(reclamarComprobante(id, 'admin@test.com'), /ya tiene comprobante/);
    // Marcado como pagado pero la plata no entró: se puede reclamar igual; vuelve a pendiente, sin comprobante, y puede subir otro
    await cambiarEstado(id, 'pagado');
    await reclamarComprobante(id, 'admin@test.com');
    const p = (await buscarPedido(id))!;
    assert.equal(p.estado, 'pendiente');
    assert.equal(p.comprobante, null);
    await subirComprobante(id, (enviados.at(-1).text.match(/t=([a-f0-9]{48})/) ?? [])[1], PNG);
    await cambiarEstado(id, 'cancelado');
    await assert.rejects(reclamarComprobante(id, 'admin@test.com'), /pendientes o pagados/);
    const mp = await pedido('mercadopago');
    await assert.rejects(reclamarComprobante(mp.id, 'admin@test.com'), /Mercado Pago/);
  } finally {
    globalThis.fetch = real; delete process.env.RESEND_API_KEY;
  }
});

test('reclamar pago: el cliente tiene 4 h desde el mail, aunque el pedido ya estuviera por vencer', async () => {
  const { id } = await pedido(); // transferencia: vence a las 4 h de creado
  await q("UPDATE pedidos SET creado = now() - interval '3 hours 55 minutes' WHERE id = $1", [id]);
  await reclamarComprobante(id, 'admin@test.com');
  const p = (await buscarPedido(id))!;
  const horas = (new Date(p.vence!).getTime() - Date.now()) / 3600_000;
  assert.ok(horas > 3.9 && horas <= 4, `vence en ~4 h desde ahora (${horas.toFixed(2)})`);
  await q("UPDATE pedidos SET creado = now() - interval '6 hours' WHERE id = $1", [id]);
  await vencerPedidos();
  assert.equal((await buscarPedido(id))!.estado, 'pendiente', 'pasaron 6 h desde el pedido, pero el plazo nuevo sigue corriendo');
  await q("UPDATE pedidos SET vence = now() - interval '1 minute' WHERE id = $1", [id]);
  await vencerPedidos();
  assert.equal((await buscarPedido(id))!.estado, 'cancelado', 'vencido el plazo del reclamo, se cancela');
});
