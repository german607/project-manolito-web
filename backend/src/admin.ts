import express, { Router, type RequestHandler } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { db, productos, boxes } from './db.js';
import { HttpError } from './errores.js';
import { ESTADOS, buscarPedido, cambiarEstado } from './pedidos.js';
import { HOY_UY } from './publico.js';

export const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url));

// ---------- Sesión: un único usuario con ADMIN_PASSWORD ----------

const DURACION = 7 * 24 * 3600 * 1000;
// ponytail: sesiones en memoria, reiniciar el server cierra la sesión; pasar a una tabla si molesta
const sesiones = new Map<string, number>(); // token -> vence
const intentos = new Map<string, { n: number; hasta: number }>(); // ip -> fallos

const sha = (s: string) => createHash('sha256').update(s).digest();
const leerCookie = (header = '', nombre: string) => header.match(new RegExp(`(?:^|;\\s*)${nombre}=([^;]+)`))?.[1];

export const soloAdmin: RequestHandler = (req, _res, next) => {
  const token = leerCookie(req.headers.cookie, 'admin');
  const vence = token && sesiones.get(token);
  if (!vence || vence < Date.now()) throw new HttpError(401, 'Iniciá sesión');
  next();
};

export const adminRouter = Router();

adminRouter.post('/login', (req, res) => {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) throw new HttpError(503, 'Falta configurar ADMIN_PASSWORD');

  const ip = req.ip ?? '';
  const f = intentos.get(ip);
  if (f && f.n >= 5 && f.hasta > Date.now()) throw new HttpError(429, 'Demasiados intentos, probá en 15 minutos');

  const { password } = z.object({ password: z.string() }).parse(req.body);
  if (!timingSafeEqual(sha(password), sha(pass))) {
    intentos.set(ip, { n: (f && f.hasta > Date.now() ? f.n : 0) + 1, hasta: Date.now() + 15 * 60 * 1000 });
    throw new HttpError(401, 'Contraseña incorrecta');
  }
  intentos.delete(ip);

  const token = randomBytes(32).toString('hex');
  sesiones.set(token, Date.now() + DURACION);
  res.cookie('admin', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: DURACION, path: '/api/admin' });
  res.json({ ok: true });
});

adminRouter.post('/logout', (req, res) => {
  const token = leerCookie(req.headers.cookie, 'admin');
  if (token) sesiones.delete(token);
  res.clearCookie('admin', { path: '/api/admin' }).json({ ok: true });
});

adminRouter.use(soloAdmin);

adminRouter.get('/yo', (_req, res) => {
  res.json({ ok: true });
});

// ---------- Métricas ----------

adminRouter.get('/resumen', (req, res) => {
  const dias = z.coerce.number().int().min(1).max(365).catch(30).parse(req.query.dias);
  const desde = (db.prepare(`SELECT date(${HOY_UY}, ?) AS d`).get(`-${dias - 1} days`) as { d: string }).d;
  const suma = (tipo: string, limite = 10) => db.prepare(
    'SELECT ref, SUM(n) AS n FROM eventos WHERE tipo = ? AND dia >= ? GROUP BY ref ORDER BY n DESC LIMIT ?').all(tipo, desde, limite);

  // Todos los días del rango, aunque no haya visitas
  const porDia = new Map((db.prepare("SELECT dia, SUM(n) AS n FROM eventos WHERE tipo = 'visita' AND dia >= ? GROUP BY dia").all(desde) as { dia: string; n: number }[]).map(r => [r.dia, r.n]));
  const visitasPorDia = Array.from({ length: dias }, (_, i) => {
    const d = new Date(desde + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    const dia = d.toISOString().slice(0, 10);
    return { dia, n: porDia.get(dia) ?? 0 };
  });

  const totales = Object.fromEntries((db.prepare('SELECT tipo, SUM(n) AS n FROM eventos WHERE dia >= ? GROUP BY tipo').all(desde) as { tipo: string; n: number }[]).map(r => [r.tipo, r.n]));

  const pedidos = db.prepare(`SELECT estado, COUNT(*) AS cantidad, SUM(total) AS total FROM pedidos
    WHERE date(creado, '-3 hours') >= ? GROUP BY estado`).all(desde);

  res.json({
    dias, desde, visitasPorDia, totales, pedidos,
    paginas: suma('visita'),
    boxesVistas: suma('box_ver'),
    productosAgregados: suma('arma_agregar'),
    stockBajo: db.prepare('SELECT id, nombre, stock FROM productos WHERE activo = 1 AND stock IS NOT NULL AND stock <= 3 ORDER BY stock').all(),
  });
});

// ---------- Catálogo ----------

adminRouter.get('/productos', (_req, res) => {
  res.json(productos.todos(false));
});

adminRouter.get('/boxes', (_req, res) => {
  res.json(boxes.todas(false));
});

const Precio = z.number().int().min(0).max(1_000_000);

function actualizar(tabla: 'productos' | 'boxes', id: string, cambios: Record<string, unknown>) {
  const campos = Object.entries(cambios).filter(([, v]) => v !== undefined);
  if (!campos.length) throw new HttpError(400, 'No hay cambios');
  const valores = campos.map(([, v]) => (typeof v === 'boolean' ? Number(v) : v)) as (string | number | null)[];
  const r = db.prepare(`UPDATE ${tabla} SET ${campos.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...valores, id);
  if (!r.changes) throw new HttpError(404, 'No encontrado');
}

adminRouter.patch('/productos/:id', (req, res) => {
  const cambios = z.object({
    precio: Precio.optional(),
    stock: z.number().int().min(0).nullable().optional(), // null = sin límite
    activo: z.boolean().optional(),
  }).strict().parse(req.body);
  actualizar('productos', req.params.id, cambios);
  res.json(productos.uno(req.params.id));
});

adminRouter.patch('/boxes/:id', (req, res) => {
  const cambios = z.object({ precio: Precio.optional(), activo: z.boolean().optional() }).strict().parse(req.body);
  actualizar('boxes', req.params.id, cambios);
  res.json(boxes.una(req.params.id));
});

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Body = la imagen tal cual (Content-Type: image/jpeg | image/png | image/webp)
adminRouter.put('/productos/:id/foto', express.raw({ type: Object.keys(EXT), limit: '5mb' }), (req, res) => {
  const p = productos.uno(req.params.id);
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  const ext = EXT[req.headers['content-type'] ?? ''];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Mandá una imagen JPG, PNG o WebP');

  const dir = `${FRONTEND}/assets/img/arma-tu-box`;
  const nombre = `producto-${p.id}`; // el id ya existe en la base: no hay riesgo de rutas raras
  for (const f of readdirSync(dir)) if (f.startsWith(nombre + '.')) unlinkSync(`${dir}/${f}`);
  writeFileSync(`${dir}/${nombre}.${ext}`, req.body);

  actualizar('productos', p.id, { foto: `assets/img/arma-tu-box/${nombre}.${ext}?v=${Date.now()}` });
  res.json(productos.uno(p.id));
});

// ---------- Pedidos ----------

adminRouter.get('/pedidos', (req, res) => {
  const estado = z.enum(ESTADOS).optional().catch(undefined).parse(req.query.estado);
  const rows = db.prepare(`SELECT id FROM pedidos ${estado ? 'WHERE estado = ?' : ''} ORDER BY id DESC LIMIT 200`)
    .all(...(estado ? [estado] : [])) as { id: number }[];
  res.json(rows.map(r => buscarPedido(r.id)));
});

adminRouter.patch('/pedidos/:id', (req, res) => {
  const { estado } = z.object({ estado: z.enum(ESTADOS) }).parse(req.body);
  res.json(cambiarEstado(Number(req.params.id), estado));
});
