import { Router } from 'express';
import { z } from 'zod';
import { q, productos, boxes } from './db.js';

export const publicoRouter = Router();

publicoRouter.get('/productos', async (_req, res) => {
  res.json(await productos.todos());
});

publicoRouter.get('/boxes', async (_req, res) => {
  res.json(await boxes.todas());
});

// "Hoy" en Uruguay, aunque el server corra en otra zona horaria (Railway usa UTC)
export const ZONA_UY = 'America/Montevideo';
export const HOY_UY = `(now() AT TIME ZONE '${ZONA_UY}')::date`;

const Evento = z.object({
  tipo: z.enum(['visita', 'instagram', 'box_ver', 'arma_agregar', 'arma_enviar', 'carrito_agregar', 'checkout', 'checkout_datos']),
  ref: z.string().max(80).default(''),
});

// ponytail: cualquiera puede inflar los contadores; si importa, limitar por IP o filtrar bots
publicoRouter.post('/eventos', async (req, res) => {
  const e = Evento.safeParse(req.body);
  if (e.success) {
    const ref = e.data.ref.replace(/\/index\.html$/, '/'); // "/" e "/index.html" son la misma página
    await q(`INSERT INTO eventos (dia, tipo, ref, n) VALUES (${HOY_UY}, $1, $2, 1)
      ON CONFLICT (dia, tipo, ref) DO UPDATE SET n = eventos.n + 1`, [e.data.tipo, ref]);
  }
  res.sendStatus(204);
});
