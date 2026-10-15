import './env.js';
import express from 'express';
import { adminRouter, FRONTEND } from './admin.js';
import { manejarErrores } from './errores.js';
import { pedidosRouter } from './pedidos.js';
import { publicoRouter } from './publico.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1); // detrás del proxy del hosting, para que req.ip sea la IP real
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api', publicoRouter);
app.use('/api', pedidosRouter);
app.use('/api/admin', adminRouter);
app.use('/api', (_req, res) => { res.status(404).json({ error: 'No existe' }); });
app.use(manejarErrores);

// Monolito: el mismo proceso sirve la API y el sitio estático
app.use(express.static(FRONTEND));

app.listen(PORT, () => {
  console.log(`Manolito en http://localhost:${PORT}`);
});
