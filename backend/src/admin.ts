import express, { Router } from 'express';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { q, q1, productos, boxes } from './db.js';
import { HttpError } from './errores.js';
import { ESTADOS, cambiarEstado } from './pedidos.js';
import { HOY_UY, ZONA_UY } from './publico.js';
import { soloAdmin } from './auth.js';

export const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url));

export const adminRouter = Router();

// El login es el de todos (/api/auth): acá solo entra una sesión con rol admin
adminRouter.use(soloAdmin);

// ---------- Métricas ----------

adminRouter.get('/resumen', async (req, res) => {
  const dias = z.coerce.number().int().min(1).max(365).catch(30).parse(req.query.dias);
  const { d: desde } = (await q1<{ d: string }>(`SELECT (${HOY_UY} - $1::int)::text AS d`, [dias - 1]))!;
  const suma = (tipo: string, limite = 10) => q(
    'SELECT ref, SUM(n)::int AS n FROM eventos WHERE tipo = $1 AND dia >= $2 GROUP BY ref ORDER BY n DESC LIMIT $3', [tipo, desde, limite]);

  // Todos los días del rango, aunque no haya visitas
  const porDia = new Map((await q<{ dia: string; n: number }>("SELECT dia, SUM(n)::int AS n FROM eventos WHERE tipo = 'visita' AND dia >= $1 GROUP BY dia", [desde])).map(r => [r.dia, r.n]));
  const visitasPorDia = Array.from({ length: dias }, (_, i) => {
    const d = new Date(desde + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    const dia = d.toISOString().slice(0, 10);
    return { dia, n: porDia.get(dia) ?? 0 };
  });

  const totales = Object.fromEntries((await q<{ tipo: string; n: number }>('SELECT tipo, SUM(n)::int AS n FROM eventos WHERE dia >= $1 GROUP BY tipo', [desde])).map(r => [r.tipo, r.n]));

  const pedidos = await q(`SELECT estado, COUNT(*)::int AS cantidad, SUM(total)::int AS total FROM pedidos
    WHERE (creado AT TIME ZONE '${ZONA_UY}')::date >= $1 GROUP BY estado`, [desde]);

  res.json({
    dias, desde, visitasPorDia, totales, pedidos,
    paginas: await suma('visita'),
    boxesVistas: await suma('box_ver'),
    productosAgregados: await suma('arma_agregar'),
    stockBajo: await q('SELECT id, nombre, COALESCE(stock, 0) AS stock FROM productos WHERE activo AND controla_stock AND COALESCE(stock, 0) <= 3 ORDER BY 3'),
  });
});

// ---------- Catálogo ----------

adminRouter.get('/productos', async (_req, res) => {
  res.json(await productos.todos(false));
});

adminRouter.get('/boxes', async (_req, res) => {
  res.json(await boxes.todas(false));
});

const Precio = z.number().int().min(0).max(1_000_000);

// Las columnas salen de los esquemas zod de cada ruta (.strict()), nunca del body directo
async function actualizar(tabla: 'productos' | 'boxes', id: string, cambios: Record<string, unknown>) {
  const campos = Object.entries(cambios).filter(([, v]) => v !== undefined);
  if (!campos.length) throw new HttpError(400, 'No hay cambios');
  const set = campos.map(([k], i) => `${k} = $${i + 1}`).join(', ');
  const r = await q(`UPDATE ${tabla} SET ${set} WHERE id = $${campos.length + 1} RETURNING id`, [...campos.map(([, v]) => v), id]);
  if (!r.length) throw new HttpError(404, 'No encontrado');
}

adminRouter.patch('/productos/:id', async (req, res) => {
  const { controlaStock, ...cambios } = z.object({
    precio: Precio.optional(),
    stock: z.number().int().min(0).nullable().optional(),
    controlaStock: z.boolean().optional(), // false = "Ignorar stock"
    activo: z.boolean().optional(),
  }).strict().parse(req.body);
  const actual = await productos.uno(req.params.id);
  if (!actual) throw new HttpError(404, 'No encontrado');
  if ((controlaStock ?? actual.controlaStock) && (cambios.stock === undefined ? actual.stockCargado : cambios.stock) === null) {
    throw new HttpError(400, 'Cargá la cantidad de stock, o activá "Ignorar stock"');
  }
  await actualizar('productos', req.params.id, { ...cambios, controla_stock: controlaStock });
  res.json(await productos.uno(req.params.id));
});

adminRouter.patch('/boxes/:id', async (req, res) => {
  const cambios = z.object({ precio: Precio.optional(), activo: z.boolean().optional() }).strict().parse(req.body);
  await actualizar('boxes', req.params.id, cambios);
  res.json(await boxes.una(req.params.id));
});

// Se reconoce el formato por los primeros bytes del archivo, no por lo que dice el navegador
function tipoDeImagen(b: Buffer): string | undefined {
  if (b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
}

// Body = la imagen tal cual. Se guarda en la base (tabla fotos) y se sirve en /api/fotos/:id
adminRouter.put('/productos/:id/foto', express.raw({ type: 'image/*', limit: '5mb' }), async (req, res) => {
  const p = await productos.uno(req.params.id);
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  const tipo = Buffer.isBuffer(req.body) ? tipoDeImagen(req.body) : undefined;
  if (!tipo) throw new HttpError(400, 'Mandá una imagen JPG, PNG o WebP');

  await q(`INSERT INTO fotos (producto_id, tipo, datos) VALUES ($1, $2, $3)
    ON CONFLICT (producto_id) DO UPDATE SET tipo = $2, datos = $3`, [p.id, tipo, req.body]);
  // Ruta relativa (sin "/" inicial) como las demás fotos; ?v= hace que el navegador no use la vieja
  await actualizar('productos', p.id, { foto: `api/fotos/${p.id}?v=${Date.now()}` });
  res.json(await productos.uno(p.id));
});

// ---------- Pedidos ----------

adminRouter.get('/pedidos', async (req, res) => {
  const estado = z.enum(ESTADOS).optional().catch(undefined).parse(req.query.estado);
  res.json(await q(`SELECT * FROM pedidos ${estado ? 'WHERE estado = $1' : ''} ORDER BY id DESC LIMIT 200`, estado ? [estado] : []));
});

adminRouter.patch('/pedidos/:id', async (req, res) => {
  const { estado } = z.object({ estado: z.enum(ESTADOS) }).parse(req.body);
  res.json(await cambiarEstado(Number(req.params.id), estado));
});
