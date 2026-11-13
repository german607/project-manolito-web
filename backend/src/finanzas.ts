import { Router } from 'express';
import { z } from 'zod';
import { q, q1, tx, registrar } from './db.js';
import { HttpError } from './errores.js';
import { VENDIDOS } from './pedidos.js';

// Finanzas: cortes de caja. Cada retiro de plata se registra como un cierre; el contador muestra lo cobrado desde el
// último cierre, separado por medio de pago (la plata está en lugares distintos: banco, Mercado Pago, Abitab, Prex).
// Cuenta la fecha en que se confirmó el pago (pedidos.pagado), no la del pedido. Montos brutos (sin comisiones).

type Cierre = { id: number; hasta: Date; total: number; pedidos: number; por_pago: PorPago[]; nota: string | null; autor: string; creado: Date };
type PorPago = { pago: string; total: number; pedidos: number };

const PAGADO = 'COALESCE(pagado, creado)'; // pedidos pagados antes de guardar la fecha de pago: la del pedido
const ultimo = () => q1<Cierre>('SELECT * FROM cierres ORDER BY hasta DESC LIMIT 1');

// Lo cobrado en (desde, hasta]: total, por medio de pago y la lista de pedidos
async function periodo(desde: Date | null, hasta: Date) {
  const params = [hasta, desde ?? new Date(0)];
  const donde = `estado IN ${VENDIDOS} AND ${PAGADO} <= $1 AND ${PAGADO} > $2`;
  const porPago = await q<PorPago>(`SELECT pago, SUM(total)::int AS total, COUNT(*)::int AS pedidos FROM pedidos WHERE ${donde} GROUP BY pago ORDER BY 2 DESC`, params);
  const lista = await q(`SELECT id, nombre, total, pago, ${PAGADO} AS pagado FROM pedidos WHERE ${donde} ORDER BY ${PAGADO} DESC`, params);
  return { total: porPago.reduce((s, p) => s + p.total, 0), pedidos: lista.length, porPago, lista };
}

export const finanzasRouter = Router();

finanzasRouter.get('/', async (_req, res) => {
  const u = await ultimo();
  res.json({
    actual: { desde: u?.hasta ?? null, ...(await periodo(u?.hasta ?? null, new Date())) },
    cierres: await q('SELECT * FROM cierres ORDER BY hasta DESC'),
  });
});

// Cierre: por defecto ahora; se puede poner una fecha pasada (ej. el retiro fue el 11), nunca antes del cierre anterior
finanzasRouter.post('/cierres', async (req, res) => {
  const { hasta, nota } = z.object({
    hasta: z.iso.datetime({ offset: true }).optional(),
    nota: z.string().trim().max(200).optional(),
  }).strict().parse(req.body);
  const corte = hasta ? new Date(hasta) : new Date();
  if (corte.getTime() > Date.now() + 60_000) throw new HttpError(400, 'El cierre no puede ser en el futuro');
  const autor = res.locals.usuario.email;
  const cierre = await tx(async () => {
    await q('LOCK TABLE cierres IN EXCLUSIVE MODE'); // dos cierres a la vez no pueden pisarse
    const u = await ultimo();
    if (u && corte <= new Date(u.hasta)) throw new HttpError(400, 'El cierre tiene que ser después del cierre anterior');
    const p = await periodo(u?.hasta ?? null, corte);
    const c = (await q1<Cierre>(`INSERT INTO cierres (hasta, total, pedidos, por_pago, nota, autor) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [corte, p.total, p.pedidos, JSON.stringify(p.porPago), nota || null, autor]))!;
    await registrar(autor, 'cierre', c.id, 'crear', { total: [null, c.total], hasta: [null, corte.toISOString()] });
    return c;
  });
  res.status(201).json(cierre);
});

// Deshacer: solo el último cierre (por si se hizo por error); lo cobrado vuelve al contador
finanzasRouter.delete('/cierres/:id', async (req, res) => {
  const autor = res.locals.usuario.email;
  await tx(async () => {
    await q('LOCK TABLE cierres IN EXCLUSIVE MODE');
    const u = await ultimo();
    if (!u || u.id !== Number(req.params.id)) throw new HttpError(409, 'Solo se puede deshacer el último cierre');
    await q('DELETE FROM cierres WHERE id = $1', [u.id]);
    await registrar(autor, 'cierre', u.id, 'borrar', { total: [u.total, null] });
  });
  res.json({ ok: true });
});
