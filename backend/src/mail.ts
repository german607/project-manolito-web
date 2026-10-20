// Resend (https://resend.com). Sin RESEND_API_KEY los mails se muestran en consola, útil en desarrollo.
// responderA: a dónde va la respuesta si el destinatario toca "Responder". Por defecto MAIL_REPLY_TO
// (la casilla de Outlook de Manolito): así los clientes contestan a una persona y no a pedidos@.
export type Adjunto = { nombre: string; datos: Buffer };
export async function enviarMail(para: string, asunto: string, texto: string, responderA?: string, adjuntos: Adjunto[] = []) {
  const key = process.env.RESEND_API_KEY;
  const replyTo = responderA ?? process.env.MAIL_REPLY_TO;
  if (!key) {
    console.log(`\n[mail no enviado → ${para}${replyTo ? ` · responder a ${replyTo}` : ''}${adjuntos.length ? ` · ${adjuntos.length} adjunto(s)` : ''}] ${asunto}\n${texto}\n`);
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM, to: para, subject: asunto, text: texto,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(adjuntos.length ? { attachments: adjuntos.map(a => ({ filename: a.nombre, content: a.datos.toString('base64') })) } : {}),
      }),
    });
    if (!r.ok) console.error('Error enviando mail', r.status, await r.text());
  } catch (e) {
    // Un mail que falla no debe romper el pedido
    console.error('Error enviando mail', e);
  }
}
