// Resend (https://resend.com). Sin RESEND_API_KEY los mails se muestran en consola, útil en desarrollo.
// responderA: a dónde va la respuesta si el destinatario toca "Responder". Por defecto MAIL_REPLY_TO
// (la casilla de Outlook de Manolito): así los clientes contestan a una persona y no a pedidos@.
export type Adjunto = { nombre: string; datos: Buffer };
// Texto solo (avisos internos) o texto + HTML (mails al cliente, con plantilla()). El texto queda para los
// clientes de correo que no muestran HTML
export type Contenido = string | { texto: string; html: string };
export async function enviarMail(para: string, asunto: string, contenido: Contenido, responderA?: string, adjuntos: Adjunto[] = []) {
  const texto = typeof contenido === 'string' ? contenido : contenido.texto;
  const html = typeof contenido === 'string' ? undefined : contenido.html;
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
        from: process.env.MAIL_FROM, to: para, subject: asunto, text: texto, ...(html ? { html } : {}),
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

// ---------- Plantilla HTML (mismos colores y letras que la web) ----------
// Los clientes de correo ignoran <style> y CSS moderno: tablas y estilos en línea. Las fuentes de Google se ven
// en Apple Mail / iPhone; Gmail y Outlook usan las de respaldo.

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const C = { rosa: '#EAB3BE', rosaFuerte: '#C97D8D', rosaPalido: '#FBEDF0', crema: '#FFFBF3', tinta: '#3F3A34', suave: '#7A6F62' };
const LETRA = "'Nunito', 'Segoe UI', Helvetica, Arial, sans-serif";
const TITULO = "'Baloo 2', 'Trebuchet MS', Helvetica, Arial, sans-serif";

// Caja rosada con filas etiqueta / valor (ej. datos para transferir)
export const caja = (titulo: string, filas: { etiqueta: string; valor: string }[], nota = '') =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.rosaPalido};border-radius:16px;margin:0 0 20px">
<tr><td style="padding:18px 20px">
<div style="font-family:${TITULO};font-size:17px;font-weight:700;color:${C.tinta};margin:0 0 8px">${esc(titulo)}</div>
${nota ? `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:${C.tinta}">${esc(nota).replace(/\n/g, '<br>')}</p>` : ''}
${filas.map(f => `<div style="padding:6px 0;border-top:1px solid rgba(201,125,141,.25)"><div style="font-size:12px;color:${C.suave}">${esc(f.etiqueta)}</div><div style="font-size:15px;font-weight:700;color:${C.tinta}">${esc(f.valor)}</div></div>`).join('')}
</td></tr></table>`;

export const parrafo = (t: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${C.tinta}">${esc(t)}</p>`;

export function plantilla(m: { titulo: string; intro: string; cuerpo?: string; boton?: { texto: string; url: string } }) {
  const web = process.env.FRONTEND_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(m.titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Nunito:wght@400;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${C.crema}">
<div style="display:none;max-height:0;overflow:hidden">${esc(m.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.crema}"><tr><td align="center" style="padding:24px 12px;font-family:${LETRA}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:0 0 18px">
<a href="${esc(web)}" style="text-decoration:none"><img src="${esc(web)}/assets/img/marca/manolito.png" width="88" alt="Manolito" style="display:block;margin:0 auto;border:0;height:auto"></a></td></tr>
<tr><td style="background:#FFFFFF;border-radius:24px;padding:32px 28px;box-shadow:0 6px 24px rgba(63,58,52,.06)">
<div style="height:6px;width:56px;background:${C.rosa};border-radius:3px;margin:0 0 18px"></div>
<h1 style="margin:0 0 10px;font-family:${TITULO};font-size:26px;line-height:1.2;font-weight:700;color:${C.tinta}">${esc(m.titulo)}</h1>
${parrafo(m.intro)}
${m.cuerpo ?? ''}
${m.boton ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 4px"><tr><td style="background:${C.rosaFuerte};border-radius:999px">
<a href="${esc(m.boton.url)}" style="display:inline-block;padding:14px 30px;font-family:${TITULO};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none">${esc(m.boton.texto)}</a></td></tr></table>` : ''}
</td></tr>
<tr><td align="center" style="padding:22px 12px 0;font-size:13px;line-height:1.6;color:${C.suave}">
¿Dudas? Respondé este mail o escribinos por <a href="https://instagram.com/manolito_uy" style="color:${C.rosaFuerte};font-weight:700">Instagram</a>.<br>
Regalos hechos con amor para los más chiquitos · <a href="${esc(web)}" style="color:${C.suave}">manolitouy.com</a>
</td></tr></table></td></tr></table></body></html>`;
}
