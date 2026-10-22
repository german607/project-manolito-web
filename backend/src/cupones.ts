// Códigos de descuento: se crean en el admin (pestaña Cupones) y el cliente los carga en el checkout.
// El descuento se calcula siempre acá; los usos se cuentan al crear el pedido y se devuelven si se cancela.
import { z } from 'zod';
import { q, q1 } from './db.js';
import { HttpError } from './errores.js';
import { HOY_UY } from './publico.js';

export const Codigo = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'El código lleva de 3 a 30 letras, números, - o _');

export const NuevoCupon = z.object({
  codigo: Codigo,
  tipo: z.enum(['porcentaje', 'monto']),
  valor: z.number().int().positive(),
  minimo: z.number().int().min(0).default(0),          // compra mínima (subtotal) para usarlo
  usosMax: z.number().int().positive().nullable().default(null), // null = sin límite
  vence: z.iso.date().nullable().default(null),           // último día en que sirve (hora de Uruguay)
}).refine(c => c.tipo === 'monto' || c.valor <= 100, { message: 'El porcentaje va de 1 a 100', path: ['valor'] });

export type Cupon = {
  codigo: string; tipo: 'porcentaje' | 'monto'; valor: number; minimo: number; usos_max: number | null;
  usos: number; vence: string | null; activo: boolean; creado: Date;
};

// Devuelve el descuento en pesos, o un error con el motivo (para mostrárselo al cliente)
export async function aplicarCupon(codigo: string, subtotal: number) {
  const c = await q1<Cupon & { vencido: boolean }>(
    `SELECT *, vence::text AS vence, (vence IS NOT NULL AND vence < ${HOY_UY}) AS vencido FROM cupones WHERE codigo = $1`, [codigo.trim().toUpperCase()]);
  if (!c || !c.activo) throw new HttpError(400, 'Ese código no existe');
  if (c.vencido) throw new HttpError(400, 'Ese código ya venció');
  if (c.usos_max !== null && c.usos >= c.usos_max) throw new HttpError(400, 'Ese código ya se usó todas las veces posibles');
  if (subtotal < c.minimo) throw new HttpError(400, `Ese código es para compras desde $${c.minimo}`);
  const descuento = c.tipo === 'porcentaje' ? Math.round(subtotal * c.valor / 100) : Math.min(c.valor, subtotal);
  return { cupon: c.codigo, descuento };
}

// Dentro de la transacción del pedido: si dos compras usan el último cupo a la vez, solo una pasa
export async function usarCupon(codigo: string) {
  const r = await q(`UPDATE cupones SET usos = usos + 1 WHERE codigo = $1 AND activo
    AND (usos_max IS NULL OR usos < usos_max) AND (vence IS NULL OR vence >= ${HOY_UY}) RETURNING codigo`, [codigo]);
  if (!r.length) throw new HttpError(409, 'El código de descuento ya no está disponible. Quitalo y probá de nuevo');
}
// Pedido cancelado: -1 (el uso vuelve a estar disponible). Pedido cancelado que se reactiva: +1
export const sumarUso = (codigo: string, delta: 1 | -1) =>
  q('UPDATE cupones SET usos = GREATEST(usos + $1, 0) WHERE codigo = $2', [delta, codigo]);

export const listarCupones = () => q<Cupon>('SELECT *, vence::text AS vence FROM cupones ORDER BY creado DESC');
