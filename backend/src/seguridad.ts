import type { RequestHandler } from 'express';
import { basename, extname } from 'node:path';

export const DEV = process.env.NODE_ENV === 'development';

// Falla al arrancar en vez de quedar expuesto con una configuración insegura
export function revisarConfig() {
  const pass = process.env.ADMIN_PASSWORD ?? '';
  if (!DEV && pass.length < 16) {
    console.error('ADMIN_PASSWORD falta o tiene menos de 16 caracteres. En producción es obligatoria.');
    process.exit(1);
  }
  if (!DEV && !process.env.ADMIN_EMAIL) {
    console.error('Falta ADMIN_EMAIL: es el usuario con el que el admin ingresa.');
    process.exit(1);
  }
}

// "trust proxy" solo si el hosting lo indica: si no, cualquiera inventa su IP con X-Forwarded-For
// y se saltea los límites por IP. TRUST_PROXY = cantidad de proxies delante (ej. 1)
export function trustProxy(): number | string | false {
  const v = process.env.TRUST_PROXY;
  if (!v) return false;
  return Number.isNaN(Number(v)) ? v : Number(v);
}

// ponytail: contadores en memoria y por proceso; si algún día hay varias instancias, pasar a la base o a Redis
const contadores = new Map<string, { n: number; hasta: number }>();
setInterval(() => {
  const ahora = Date.now();
  for (const [k, v] of contadores) if (v.hasta < ahora) contadores.delete(k);
}, 60_000).unref();

// Tope de IPs distintas en memoria: si un ataque desde muchas IPs llena la tabla, se rechaza
// en vez de dejar que la memoria crezca hasta tirar el server (~100 bytes por entrada → ~10 MB)
const MAX_CLAVES = 100_000;

const ocupado = (res: Parameters<RequestHandler>[1], segundos: number) => {
  res.setHeader('Retry-After', segundos);
  res.status(503).json({ error: 'El sitio está con mucho tráfico, probá de nuevo en unos segundos' });
};

export function limitar(nombre: string, max: number, ventanaMs: number): RequestHandler {
  return (req, res, next) => {
    const clave = `${nombre}:${req.ip}`;
    const ahora = Date.now();
    const c = contadores.get(clave);
    if (!c || c.hasta < ahora) {
      if (!c && contadores.size >= MAX_CLAVES) return ocupado(res, 60);
      contadores.set(clave, { n: 1, hasta: ahora + ventanaMs });
      return next();
    }
    if (++c.n > max) {
      res.setHeader('Retry-After', Math.ceil((c.hasta - ahora) / 1000));
      res.status(429).json({ error: 'Demasiados pedidos seguidos, probá de nuevo en unos minutos' });
      return;
    }
    next();
  };
}

// Si hay demasiados requests a la API procesándose a la vez, se responde "ocupado" en vez de
// acumular trabajo hasta quedarse sin memoria. Con SQLite cada request tarda milisegundos:
// llegar al tope significa que algo anda mal (ataque o lentitud), no tráfico normal.
const MAX_EN_VUELO = 50;
let enVuelo = 0;
export const limitarConcurrencia: RequestHandler = (_req, res, next) => {
  if (enVuelo >= MAX_EN_VUELO) return ocupado(res, 5);
  enVuelo++;
  res.on('close', () => { enVuelo--; });
  next();
};

// Solo se sirve lo que es parte de la web; el resto de frontend/ (TODO.md, vista de diseño...) no sale
const PUBLICABLE = new Set(['', '.html', '.css', '.js', '.jpg', '.jpeg', '.png', '.webp', '.svg', '.ico']);
const INTERNOS = new Set(['index-diseno.html']);
export const soloPublicable: RequestHandler = (req, res, next) => {
  // Decodificado y en minúsculas: el disco de macOS/Windows no distingue mayúsculas (/INDEX-DISENO.HTML) y %2D = "-"
  let ruta: string;
  try { ruta = decodeURIComponent(req.path).toLowerCase(); } catch { ruta = ''; }
  if (!ruta || !PUBLICABLE.has(extname(ruta)) || INTERNOS.has(basename(ruta))) {
    res.status(404).send('No existe');
    return;
  }
  next();
};

// HSTS: el navegador recuerda usar siempre HTTPS. La redirección http→https la hace el hosting.
export const hsts: RequestHandler = (_req, res, next) => {
  if (!DEV) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
};
