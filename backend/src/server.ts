import './env.js';
import express from 'express';
import { adminRouter, FRONTEND } from './admin.js';
import { asegurarAdmin, authRouter, borrarSesionesVencidas, cargarUsuario } from './auth.js';
import { iniciarDb, pool } from './db.js';
import { imagenesRouter, revisarBucket } from './imagenes.js';
import { manejarErrores } from './errores.js';
import { pedidosRouter, vencerPedidos } from './pedidos.js';
import { abandonosRouter, recuperarCarritos } from './abandonos.js';
import { pagosManualesRouter } from './pagosManuales.js';
import { publicoRouter } from './publico.js';
import { hsts, limitar, limitarConcurrencia, revisarConfig, soloPublicable, trustProxy } from './seguridad.js';

revisarConfig();
await iniciarDb();
await asegurarAdmin();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MINUTO = 60_000;

app.set('trust proxy', trustProxy());
app.disable('x-powered-by');

// Antes de los límites: el chequeo del hosting tiene que responder siempre
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// ---- Barreras contra exceso de requests (de afuera hacia adentro) ----
// 1. Por IP, todo el sitio. Una página completa son ~70 requests (fotos), y varias personas
//    pueden compartir IP (wifi de oficina, datos móviles), así que el tope es generoso.
app.use(limitar('todo', 1500, MINUTO));
// 2. Por IP, solo la API (lo que usa CPU y base de datos)
app.use('/api', limitar('api', 300, MINUTO));
// 3. Por IP, lo público que escribe: pedidos en loop (stock, mails) y llenar la base
// Solo crear pedidos (POST /api/pedidos): ver los datos de pago o subir el comprobante no cuenta
const limitePedidos = limitar('pedidos', 5, 10 * MINUTO);
app.use('/api/pedidos', (req, res, next) => (req.method === 'POST' && req.path === '/' ? limitePedidos(req, res, next) : next()));
app.use('/api/pedidos/:id/comprobante', limitar('comprobantes', 10, 10 * MINUTO));
app.use('/api/mercadopago/pagar', limitar('tarjeta', 10, 10 * MINUTO)); // frena probar tarjetas robadas en serie
app.use('/api/carrito', limitar('carrito', 60, MINUTO));
app.use('/api/eventos', limitar('eventos', 120, MINUTO));
app.use('/api/carritos-abandonados', limitar('abandonos', 20, 10 * MINUTO));
// Frena probar contraseñas en serie. Solo login y registro: /api/auth/yo lo consulta cada página
const limiteAuth = limitar('auth', 20, 15 * MINUTO);
app.use('/api/auth/login', limiteAuth);
app.use('/api/auth/registro', limiteAuth);
// 4. Global: tope de requests a la API procesándose a la vez
app.use('/api', limitarConcurrencia);

app.use(hsts);
app.use(express.json({ limit: '20kb' })); // un carrito de 30 ítems ocupa ~3 KB
app.use('/api', cargarUsuario);

app.use('/api/auth', authRouter);
app.use('/api', publicoRouter);
app.use('/api', pedidosRouter);
app.use('/api', abandonosRouter);
app.use('/api', pagosManualesRouter);
app.use('/api/admin', adminRouter);
app.use('/api', (_req, res) => { res.status(404).json({ error: 'No existe' }); });
app.use(manejarErrores);

// Con el frontend en Vercel (FRONTEND_URL), quien entre al dominio de Railway va a la web de Vercel.
// /assets/img sigue acá: Vercel lo reenvía para servir las imágenes del bucket.
const FRONTEND_URL = process.env.FRONTEND_URL?.replace(/\/$/, '');
if (FRONTEND_URL) {
  app.use((req, res, next) => (req.path.startsWith('/assets/img/') ? next() : res.redirect(301, FRONTEND_URL + req.originalUrl)));
}

// Monolito: el mismo proceso sirve la API y el sitio estático.
// Las fotos se guardan 1 día en el navegador: las visitas repetidas no las vuelven a pedir.
// (Las fotos subidas desde el admin llevan ?v=... así que un cambio se ve igual al instante.)
app.use(soloPublicable);
app.use('/assets/img', imagenesRouter); // del bucket en producción (ver imagenes.ts)
app.use('/assets', express.static(`${FRONTEND}/assets`, { maxAge: '1d' }));
app.use(express.static(FRONTEND));

const server = app.listen(PORT, () => {
  console.log(`Manolito en http://localhost:${PORT}`);
  // A qué base está conectado (sin la contraseña): evita confundir staging con producción
  const db = new URL(process.env.DATABASE_URL!);
  console.log(`Entorno: ${process.env.RAILWAY_ENVIRONMENT_NAME ?? 'local'} · Base: ${db.hostname}${db.pathname}${process.env.DB_SCHEMA ? ` (esquema ${process.env.DB_SCHEMA})` : ''}`);
  // Qué variables de Mercado Pago ve (no sus valores): si falta alguna, el checkout no ofrece Mercado Pago
  const mp = ['MP_ACCESS_TOKEN', 'MP_PUBLIC_KEY', 'MP_WEBHOOK_SECRET'].map(v => `${v} ${process.env[v]?.trim() ? 'ok' : 'FALTA'}`);
  console.log(`Mercado Pago: ${mp.join(' · ')}`);
  revisarBucket();
});

// Tareas periódicas. Un error se loguea pero no tira el server (una promesa rechazada sin catch lo cerraría)
const cada = (ms: number, tarea: () => Promise<unknown>) => {
  const correr = () => tarea().catch(e => console.error('Tarea periódica falló:', e));
  correr();
  setInterval(correr, ms).unref();
};
cada(5 * MINUTO, vencerPedidos); // pedidos sin pagar
cada(5 * MINUTO, recuperarCarritos); // mail a quien dejó el carrito sin comprar
cada(60 * MINUTO, borrarSesionesVencidas);

// Railway frena el server viejo en cada deploy (SIGTERM): se terminan los requests en curso y se cierra la base
process.on('SIGTERM', () => {
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref(); // por si algo queda colgado
});

// Conexiones lentas a propósito (slowloris) ocupan sockets sin mandar nada: se cortan
server.headersTimeout = 10_000;   // 10 s para mandar los headers
server.requestTimeout = 30_000;   // 30 s para el request completo (alcanza para subir una foto de 5 MB)
server.keepAliveTimeout = 5_000;  // conexiones inactivas se cierran a los 5 s
server.maxConnections = 500;      // tope de conexiones abiertas a la vez
