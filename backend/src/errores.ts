import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const manejarErrores: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Datos inválidos', detalles: err.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
  } else if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.expose ? err.message : 'Error interno' });
  }
};
