import { Router, type RequestHandler, type Response } from 'express';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { q, q1 } from './db.js';
import { HttpError } from './errores.js';
import { DEV } from './seguridad.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type Usuario = { id: number; email: string; nombre: string; rol: 'cliente' | 'admin' };

// ---------- Contraseñas: scrypt con sal propia por usuario ----------

export async function hashear(password: string) {
  const sal = randomBytes(16);
  return `scrypt$${sal.toString('hex')}$${(await scrypt(password, sal, 64)).toString('hex')}`;
}
export async function verificar(password: string, guardado: string) {
  const [, sal, hash] = guardado.split('$');
  const calculado = await scrypt(password, Buffer.from(sal, 'hex'), 64);
  return timingSafeEqual(calculado, Buffer.from(hash, 'hex'));
}
// Para emails que no existen se verifica igual contra este hash: así la respuesta tarda lo mismo
// y no se puede averiguar qué emails tienen cuenta midiendo el tiempo
const HASH_FALSO = hashear(randomBytes(16).toString('hex'));

// ---------- Cuentas ----------

const porEmail = (email: string) =>
  q1<Usuario & { hash: string }>('SELECT * FROM usuarios WHERE lower(email) = lower($1)', [email]);
const publico = ({ id, email, nombre, rol }: Usuario): Usuario => ({ id, email, nombre, rol });

export async function registrar(nombre: string, email: string, password: string): Promise<Usuario> {
  const repetido = new HttpError(409, 'Ya hay una cuenta con ese email. Probá ingresar.');
  if (await porEmail(email)) throw repetido;
  try {
    const r = await q1<{ id: number }>('INSERT INTO usuarios (nombre, email, hash) VALUES ($1, $2, $3) RETURNING id', [nombre, email, await hashear(password)]);
    return { id: r!.id, email, nombre, rol: 'cliente' };
  } catch (e: any) {
    if (e.code === '23505') throw repetido; // dos registros simultáneos con el mismo email: el índice único frena el segundo
    throw e;
  }
}

export async function autenticar(email: string, password: string): Promise<Usuario> {
  const u = await porEmail(email);
  const ok = await verificar(password, u?.hash ?? await HASH_FALSO);
  if (!u || !ok) throw new HttpError(401, 'Email o contraseña incorrectos');
  return publico(u);
}

// La cuenta de admin sale de ADMIN_EMAIL + ADMIN_PASSWORD: se crea o actualiza al arrancar
export async function asegurarAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD;
  if (!email || !pass) {
    console.warn('Sin ADMIN_EMAIL y ADMIN_PASSWORD no hay cuenta de admin.');
    return;
  }
  const u = await porEmail(email);
  if (!u) {
    await q("INSERT INTO usuarios (nombre, email, hash, rol) VALUES ('Manolito', $1, $2, 'admin') ON CONFLICT DO NOTHING", [email, await hashear(pass)]);
  } else if (u.rol !== 'admin' || !(await verificar(pass, u.hash))) {
    await q("UPDATE usuarios SET rol = 'admin', hash = $1 WHERE id = $2", [await hashear(pass), u.id]);
    await q('DELETE FROM sesiones WHERE usuario_id = $1', [u.id]); // contraseña nueva: se cierran las sesiones viejas
  }
}

// ---------- Sesiones (en la base: reiniciar el server no desloguea a nadie) ----------

const COOKIE = 'sesion';
const DURACION = { cliente: 30 * 24 * 3600_000, admin: 12 * 3600_000 };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const leerCookie = (header = '', nombre: string) => header.match(new RegExp(`(?:^|;\\s*)${nombre}=([^;]+)`))?.[1];

async function iniciarSesion(res: Response, u: Usuario) {
  const token = randomBytes(32).toString('hex');
  const ms = DURACION[u.rol];
  // Se guarda el hash del token: si alguien lee la base, no puede usar las sesiones
  await q('INSERT INTO sesiones (token_hash, usuario_id, vence) VALUES ($1, $2, $3)', [sha(token), u.id, Date.now() + ms]);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: !DEV, maxAge: ms, path: '/' });
}

// Deja el usuario logueado (o null) en res.locals.usuario para todo /api
export const cargarUsuario: RequestHandler = async (req, res, next) => {
  const token = leerCookie(req.headers.cookie, COOKIE);
  res.locals.usuario = token ? await q1(`SELECT u.id, u.email, u.nombre, u.rol FROM sesiones s
    JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = $1 AND s.vence > $2`, [sha(token), Date.now()]) ?? null : null;
  next();
};

export const soloAdmin: RequestHandler = (_req, res, next) => {
  const u = res.locals.usuario as Usuario | null;
  if (!u) throw new HttpError(401, 'Iniciá sesión');
  if (u.rol !== 'admin') throw new HttpError(403, 'Solo para administradores');
  next();
};

export const borrarSesionesVencidas = () => q('DELETE FROM sesiones WHERE vence < $1', [Date.now()]);

// ---------- Rutas: /api/auth ----------

const Email = z.email('Email inválido').max(120).transform(e => e.trim().toLowerCase());
const Password = z.string().min(8, 'La contraseña tiene que tener al menos 8 caracteres').max(200);

export const authRouter = Router();

authRouter.post('/registro', async (req, res) => {
  const { nombre, email, password } = z.object({ nombre: z.string().trim().min(2, 'Escribí tu nombre').max(80), email: Email, password: Password }).parse(req.body);
  const u = await registrar(nombre, email, password);
  await iniciarSesion(res, u);
  res.status(201).json({ usuario: u });
});

// Límite por cuenta: el de IP no alcanza si alguien llega directo a Railway inventando su IP.
// ponytail: en memoria y por proceso; quien conozca el email puede bloquear esa cuenta 15 min (es el costo de frenar ataques)
const fallos = new Map<string, { n: number; hasta: number }>();
const MAX_FALLOS = 10, VENTANA = 15 * 60_000;

authRouter.post('/login', async (req, res) => {
  const { email, password } = z.object({ email: Email, password: z.string().max(200) }).parse(req.body);
  const ahora = Date.now();
  const f = fallos.get(email);
  if (f && f.hasta > ahora && f.n >= MAX_FALLOS) throw new HttpError(429, 'Demasiados intentos con esta cuenta. Probá de nuevo en 15 minutos.');
  try {
    const u = await autenticar(email, password);
    fallos.delete(email);
    await iniciarSesion(res, u);
    res.json({ usuario: u });
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) {
      if (fallos.size > 10_000) for (const [k, v] of fallos) if (v.hasta < ahora) fallos.delete(k);
      fallos.set(email, { n: (f && f.hasta > ahora ? f.n : 0) + 1, hasta: ahora + VENTANA });
    }
    throw e;
  }
});

authRouter.post('/logout', async (req, res) => {
  const token = leerCookie(req.headers.cookie, COOKIE);
  if (token) await q('DELETE FROM sesiones WHERE token_hash = $1', [sha(token)]);
  res.clearCookie(COOKIE, { path: '/' }).json({ ok: true });
});

// 200 siempre (con usuario o null): cada página lo consulta y un 401 llenaría la consola de errores
authRouter.get('/yo', (_req, res) => {
  res.json({ usuario: res.locals.usuario });
});
