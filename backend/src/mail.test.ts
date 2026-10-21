import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enviarMail, plantilla } from './mail.js';

test('mails: "responder a" va a la casilla de Manolito, salvo que se indique otra (ej. el cliente)', async () => {
  const enviados: any[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => { enviados.push(JSON.parse(String(init.body))); return new Response('{}'); }) as typeof fetch;
  Object.assign(process.env, { RESEND_API_KEY: 're_test', MAIL_FROM: 'Manolito <pedidos@manolitouy.com>', MAIL_REPLY_TO: 'hola@manolitouy.com' });
  try {
    await enviarMail('cliente@example.com', 'Recibimos tu pedido', 'texto');
    await enviarMail('hola@manolitouy.com', 'Nuevo pedido', 'texto', 'cliente@example.com');
    await enviarMail('comprobantes@manolitouy.com', 'Comprobante recibido', 'texto', 'cliente@example.com', [{ nombre: 'comprobante-pedido-7.png', datos: Buffer.from('png') }]);
  } finally {
    globalThis.fetch = real; delete process.env.RESEND_API_KEY;
  }
  assert.equal(enviados[0].from, 'Manolito <pedidos@manolitouy.com>');
  assert.equal(enviados[0].reply_to, 'hola@manolitouy.com', 'el cliente responde a la casilla de Manolito');
  assert.equal(enviados[1].reply_to, 'cliente@example.com', 'la dueña responde directo al cliente');
  assert.deepEqual(enviados[2].attachments, [{ filename: 'comprobante-pedido-7.png', content: Buffer.from('png').toString('base64') }], 'el comprobante va adjunto');
  assert.equal(enviados[0].attachments, undefined, 'los demás mails no llevan adjuntos');
});

test('mails al cliente: van con HTML (plantilla de la web) y texto; lo que escribe el cliente se escapa', async () => {
  const enviados: any[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => { enviados.push(JSON.parse(String(init.body))); return new Response('{}'); }) as typeof fetch;
  process.env.RESEND_API_KEY = 're_test';
  try {
    await enviarMail('cliente@example.com', 'Pago', { texto: 'Hola <b>Ana</b>', html: plantilla({ titulo: '¡Pago confirmado!', intro: 'Hola <script>x</script>' }) });
  } finally {
    globalThis.fetch = real; delete process.env.RESEND_API_KEY;
  }
  assert.equal(enviados[0].text, 'Hola <b>Ana</b>');
  assert.match(enviados[0].html, /¡Pago confirmado!/);
  assert.match(enviados[0].html, /Hola &lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(enviados[0].html, /<script>/);
});
