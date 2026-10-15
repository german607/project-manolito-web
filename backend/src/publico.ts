import { Router } from 'express';
import { z } from 'zod';
import { db, productos, boxes } from './db.js';

export const publicoRouter = Router();

publicoRouter.get('/productos', (_req, res) => {
  res.json(productos.todos());
});

publicoRouter.get('/boxes', (_req, res) => {
  res.json(boxes.todas());
});

// Uruguay es UTC-3 todo el año (sin horario de verano desde 2015)
export const HOY_UY = "date('now', '-3 hours')";

const Evento = z.object({
  tipo: z.enum(['visita', 'instagram', 'box_ver', 'arma_agregar', 'arma_enviar']),
  ref: z.string().max(80).default(''),
});

// ponytail: cualquiera puede inflar los contadores; si importa, limitar por IP o filtrar bots
publicoRouter.post('/eventos', (req, res) => {
  const e = Evento.safeParse(req.body);
  if (e.success) {
    const ref = e.data.ref.replace(/\/index\.html$/, '/'); // "/" e "/index.html" son la misma página
    db.prepare(`INSERT INTO eventos (dia, tipo, ref, n) VALUES (${HOY_UY}, ?, ?, 1)
      ON CONFLICT (dia, tipo, ref) DO UPDATE SET n = n + 1`).run(e.data.tipo, ref);
  }
  res.sendStatus(204);
});
