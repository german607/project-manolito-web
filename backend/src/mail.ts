// Resend (https://resend.com). Sin RESEND_API_KEY los mails se muestran en consola, útil en desarrollo.
export async function enviarMail(para: string, asunto: string, texto: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[mail no enviado → ${para}] ${asunto}\n${texto}\n`);
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: para, subject: asunto, text: texto }),
    });
    if (!r.ok) console.error('Error enviando mail', r.status, await r.text());
  } catch (e) {
    // Un mail que falla no debe romper el pedido
    console.error('Error enviando mail', e);
  }
}
