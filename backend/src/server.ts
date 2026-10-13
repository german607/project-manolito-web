import express from 'express';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url));

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Monolito: el mismo proceso sirve la API y el sitio estático
app.use(express.static(FRONTEND));

app.listen(PORT, () => {
  console.log(`Manolito en http://localhost:${PORT}`);
});
