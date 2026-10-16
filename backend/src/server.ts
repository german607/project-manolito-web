import './env.js';
import express from 'express';
import { adminRouter, FRONTEND } from './admin.js';
import { manejarErrores } from './errores.js';
import { pedidosRouter, vencerPedidos } from './pedidos.js';
import { publicoRouter } from './publico.js';
import { hsts, limitar, limitarConcurrencia, revisarConfig, soloPublicable, trustProxy } from './seguridad.js';

revisarConfig();

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
app.use('/api/pedidos', limitar('pedidos', 5, 10 * MINUTO));
app.use('/api/carrito', limitar('carrito', 60, MINUTO));
app.use('/api/eventos', limitar('eventos', 120, MINUTO));
// 4. Global: tope de requests a la API procesándose a la vez
app.use('/api', limitarConcurrencia);

app.use(hsts);
app.use(express.json({ limit: '20kb' })); // un carrito de 30 ítems ocupa ~3 KB

app.use('/api', publicoRouter);
app.use('/api', pedidosRouter);
app.use('/api/admin', adminRouter);
app.use('/api', (_req, res) => { res.status(404).json({ error: 'No existe' }); });
app.use(manejarErrores);

// Monolito: el mismo proceso sirve la API y el sitio estático.
// Las fotos se guardan 1 día en el navegador: las visitas repetidas no las vuelven a pedir.
// (Las fotos subidas desde el admin llevan ?v=... así que un cambio se ve igual al instante.)
app.use(soloPublicable);
app.use('/assets', express.static(`${FRONTEND}/assets`, { maxAge: '1d' }));
app.use(express.static(FRONTEND));

const server = app.listen(PORT, () => {
  console.log(`Manolito en http://localhost:${PORT}`);
});

// Pedidos sin pagar: se revisan al arrancar y cada 5 minutos
vencerPedidos();
setInterval(vencerPedidos, 5 * MINUTO);

// Conexiones lentas a propósito (slowloris) ocupan sockets sin mandar nada: se cortan
server.headersTimeout = 10_000;   // 10 s para mandar los headers
server.requestTimeout = 30_000;   // 30 s para el request completo (alcanza para subir una foto de 5 MB)
server.keepAliveTimeout = 5_000;  // conexiones inactivas se cierran a los 5 s
server.maxConnections = 500;      // tope de conexiones abiertas a la vez
