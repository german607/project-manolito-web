import { Router } from 'express';
import { z } from 'zod';
import { q, q1, productos, boxes } from './db.js';

export const publicoRouter = Router();

publicoRouter.get('/productos', async (_req, res) => {
  res.json(await productos.todos());
});

publicoRouter.get('/boxes', async (_req, res) => {
  res.json(await boxes.todas());
});

// Fotos subidas desde el admin. Cada cambio de foto cambia la URL (?v=), así que se puede cachear para siempre
publicoRouter.get('/fotos/:id', async (req, res) => {
  const f = await q1<{ tipo: string; datos: Buffer }>('SELECT tipo, datos FROM fotos WHERE producto_id = $1', [req.params.id]);
  if (!f) { res.sendStatus(404); return; }
  res.type(f.tipo).set('Cache-Control', 'public, max-age=31536000, immutable').send(f.datos);
});

// "Hoy" en Uruguay, aunque el server corra en otra zona horaria (Railway usa UTC)
export const ZONA_UY = 'America/Montevideo';
export const HOY_UY = `(now() AT TIME ZONE '${ZONA_UY}')::date`;

const Evento = z.object({
  tipo: z.enum(['visita', 'instagram', 'box_ver', 'arma_agregar', 'arma_enviar']),
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
