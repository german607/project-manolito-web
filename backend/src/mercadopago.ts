import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const API = 'https://api.mercadopago.com';

async function mp(path: string, init: RequestInit = {}) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('Falta MP_ACCESS_TOKEN');
  const r = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw new Error(`Mercado Pago ${r.status}: ${await r.text()}`);
  return r.json();
}

// Checkout Pro: el cliente paga en la página de Mercado Pago. Devuelve la URL a la que redirigir.
export async function crearPreferencia(p: { id: number; total: number; email: string; vence: Date }): Promise<string> {
  const base = process.env.BASE_URL ?? 'http://localhost:3000';
  const pref = await mp('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ title: `Pedido Manolito #${p.id}`, quantity: 1, unit_price: p.total, currency_id: 'UYU' }],
      payer: { email: p.email },
      external_reference: String(p.id),
      expires: true, // después de esta fecha Mercado Pago no acepta el pago
      expiration_date_to: p.vence.toISOString(),
      notification_url: `${base}/api/mercadopago/webhook`,
      back_urls: {
        success: `${base}/checkout.html?pedido=${p.id}&pago=ok`,
        pending: `${base}/checkout.html?pedido=${p.id}&pago=pendiente`,
        failure: `${base}/checkout.html?pedido=${p.id}&pago=error`,
      },
      auto_return: 'approved',
    }),
  });
  return pref.init_point;
}

export async function obtenerPago(id: string): Promise<{ status: string; external_reference: string; transaction_amount: number }> {
  return mp(`/v1/payments/${encodeURIComponent(id)}`);
}

// https://www.mercadopago.com.uy/developers/es/docs/your-integrations/notifications/webhooks
export function firmaValida(req: Request): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  const firma = req.header('x-signature');
  const requestId = req.header('x-request-id');
  const dataId = req.query['data.id'];
  if (!secret || !firma || !requestId || typeof dataId !== 'string') return false;

  const partes = Object.fromEntries(firma.split(',').map(p => p.trim().split('=') as [string, string]));
  if (!partes.ts || !partes.v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${partes.ts};`;
  const esperado = Buffer.from(createHmac('sha256', secret).update(manifest).digest('hex'));
  const recibido = Buffer.from(partes.v1);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
