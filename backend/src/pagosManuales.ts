// Pagos manuales: transferencia bancaria, giro Abitab / Red Pagos y Prex / Mi Dinero.
// El cliente ve los datos para pagar, sube el comprobante (opcional) y el admin confirma con un click.
import express, { Router } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { q, q1, tx, registrar } from './db.js';
import { HttpError } from './errores.js';
import { guardarPrivado } from './imagenes.js';
import { enviarMail } from './mail.js';
import { buscarPedido, VENCE_HORAS, type Pedido } from './pedidos.js';

// ---------- Datos para pagar (se editan en el admin → Ajustes) ----------

export const AjustesPagos = z.object({
  transferencia: z.object({
    banco: z.string().trim().max(60),
    tipoCuenta: z.string().trim().max(40),
    cuenta: z.string().trim().max(60),
    titular: z.string().trim().max(80),
    documento: z.string().trim().max(30), // RUT o CI del titular (opcional)
  }),
  abitab_redpagos: z.object({ texto: z.string().trim().max(500) }), // ej. a nombre de quién y CI
  prex_midinero: z.object({ texto: z.string().trim().max(500) }),   // ej. número de cuenta Prex
});
export type AjustesPagos = z.infer<typeof AjustesPagos>;

const VACIO: AjustesPagos = {
  transferencia: { banco: '', tipoCuenta: 'Caja de ahorro en pesos', cuenta: '', titular: '', documento: '' },
  abitab_redpagos: { texto: '' },
  prex_midinero: { texto: '' },
};

export async function leerAjustesPagos(): Promise<AjustesPagos> {
  const r = await q1<{ valor: AjustesPagos }>("SELECT valor FROM ajustes WHERE clave = 'pagos'");
  return { ...VACIO, ...r?.valor };
}
export async function guardarAjustesPagos(valor: AjustesPagos, autor: string) {
  await tx(async () => {
    await q(`INSERT INTO ajustes (clave, valor) VALUES ('pagos', $1) ON CONFLICT (clave) DO UPDATE SET valor = $1`, [JSON.stringify(valor)]);
    await registrar(autor, 'ajustes', 'pagos', 'editar', { datosDePago: [null, 'actualizados'] });
  });
}

export const MANUALES = ['transferencia', 'abitab_redpagos', 'prex_midinero'] as const;
export const referencia = (id: number) => `MANOLITO-${id}`;

// Lo que ve el cliente para pagar: campos copiables + texto libre
export type DatosPago = { titulo: string; campos: { etiqueta: string; valor: string }[]; texto?: string };
export async function datosDePago(p: Pick<Pedido, 'id' | 'pago' | 'total'>): Promise<DatosPago | null> {
  const a = await leerAjustesPagos();
  const comunes = [{ etiqueta: 'Monto', valor: `$${p.total}` }, { etiqueta: 'Referencia (ponela en el concepto)', valor: referencia(p.id) }];
  if (p.pago === 'transferencia') {
    const t = a.transferencia;
    if (!t.cuenta) return null; // sin datos cargados: se coordina por mail/Instagram
    return {
      titulo: 'Datos para la transferencia',
      campos: [
        { etiqueta: 'Banco', valor: t.banco }, { etiqueta: 'Tipo de cuenta', valor: t.tipoCuenta },
        { etiqueta: 'Número de cuenta', valor: t.cuenta }, { etiqueta: 'Titular', valor: t.titular },
        ...(t.documento ? [{ etiqueta: 'RUT / CI', valor: t.documento }] : []), ...comunes,
      ].filter(c => c.valor),
    };
  }
  const texto = p.pago === 'abitab_redpagos' ? a.abitab_redpagos.texto : p.pago === 'prex_midinero' ? a.prex_midinero.texto : '';
  if (!texto) return null;
  return { titulo: p.pago === 'abitab_redpagos' ? 'Pago por Abitab / Red Pagos' : 'Pago por Prex / Mi Dinero', campos: comunes, texto };
}

// Texto para el mail de confirmación del pedido
export function datosEnTexto(d: DatosPago | null) {
  if (!d) return process.env.PAGO_INSTRUCCIONES ?? 'Te vamos a escribir para coordinar el pago y la entrega.';
  return [d.titulo + ':', ...(d.texto ? [d.texto] : []), ...d.campos.map(c => `${c.etiqueta}: ${c.valor}`)].join('\n');
}

// ---------- Token del pedido: permite ver los datos de pago y subir el comprobante ----------
// Se manda una sola vez (respuesta del pedido y link del mail); en la base queda solo su hash.

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export async function crearToken(id: number) {
  const token = randomBytes(24).toString('hex');
  await q('UPDATE pedidos SET token_pago = $1 WHERE id = $2', [sha(token), id]);
  return token;
}
export async function pedidoConToken(id: number, token: string) {
  const p = await buscarPedido(id);
  const ok = !!p?.token_pago && token.length > 0 &&
    timingSafeEqual(Buffer.from(p.token_pago), Buffer.from(sha(token)));
  if (!p || !ok) throw new HttpError(404, 'Pedido no encontrado'); // mismo error: no revela si el pedido existe
  return p;
}
export const linkComprobante = (id: number, token: string) =>
  `${process.env.BASE_URL ?? 'http://localhost:3000'}/checkout.html?pedido=${id}&t=${token}`;

// ---------- Comprobante ----------

const TIPOS: [string, string, (b: Buffer) => boolean][] = [
  ['image/jpeg', 'jpg', b => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))],
  ['image/png', 'png', b => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))],
  ['image/webp', 'webp', b => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'],
  ['application/pdf', 'pdf', b => b.toString('latin1', 0, 5) === '%PDF-'],
];

export async function subirComprobante(id: number, token: string, datos: Buffer) {
  const p = await pedidoConToken(id, token);
  if (!(MANUALES as readonly string[]).includes(p.pago)) throw new HttpError(400, 'Este pedido se paga por Mercado Pago');
  if (p.estado !== 'pendiente') throw new HttpError(409, p.estado === 'cancelado' ? 'El pedido venció o se canceló' : 'El pago de este pedido ya está confirmado');
  const tipo = TIPOS.find(([, , es]) => es(datos));
  if (!tipo) throw new HttpError(400, 'Subí una foto (JPG, PNG, WebP) o un PDF del comprobante');

  const clave = `comprobantes/pedido-${id}-${Date.now()}.${tipo[1]}`;
  await guardarPrivado(clave, datos, tipo[0]);
  await tx(async () => {
    await q('UPDATE pedidos SET comprobante = $1, comprobante_tipo = $2, comprobante_subido = now() WHERE id = $3', [clave, tipo[0], id]);
    await registrar('cliente', 'pedido', id, 'comprobante', { comprobante: [p.comprobante ? 'anterior' : null, 'subido'] });
  });
  if (process.env.ADMIN_EMAIL) {
    enviarMail(process.env.ADMIN_EMAIL, `Comprobante recibido: pedido #${id} — $${p.total}`,
      `${p.nombre} subió el comprobante de ${p.pago} del pedido #${id} ($${p.total}, referencia ${referencia(id)}).\n` +
      `Revisalo en el admin → Pedidos y, si la plata entró, tocá "Confirmar pago".`);
  }
}

// ---------- Rutas públicas (con el token del pedido) ----------

export const pagosManualesRouter = Router();
const Params = z.object({ id: z.coerce.number().int().positive() });
const Token = z.object({ t: z.string().regex(/^[a-f0-9]{48}$/) });

// Datos para pagar y estado del pedido (pantalla de gracias y link del mail)
pagosManualesRouter.get('/pedidos/:id/pago', async (req, res) => {
  const { id } = Params.parse(req.params);
  const { t } = Token.parse(req.query);
  const p = await pedidoConToken(id, t);
  res.json({
    id: p.id, total: p.total, pago: p.pago, estado: p.estado, comprobante: !!p.comprobante,
    vence: new Date(new Date(p.creado).getTime() + VENCE_HORAS * 3600_000), datos: await datosDePago(p),
  });
});

pagosManualesRouter.put('/pedidos/:id/comprobante', express.raw({ type: ['image/*', 'application/pdf'], limit: '5mb' }), async (req, res) => {
  const { id } = Params.parse(req.params);
  const { t } = Token.parse(req.query);
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Subí una foto o un PDF del comprobante');
  await subirComprobante(id, t, req.body);
  res.json({ ok: true });
});
