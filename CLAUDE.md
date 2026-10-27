# Manolito — tienda web de regalos para bebés (Uruguay)

- `frontend/`: sitio estático (Vercel, manolitouy.com). JS del sitio en ES5 (`var`, `function`); el admin (`frontend/admin/`) en JS moderno.
- `backend/`: monolito Express 5 + TypeScript + Postgres (Railway). Staging = rama `develop`, producción = `main`. Ver `DEPLOY.md`.
- Local: `docker compose up -d` (Postgres en 5434) · `cd backend && npm run dev` (http://localhost:3000) · `npm test` (esquema `test`).
- Pendientes: `backend/TODO.md` y `frontend/TODO.md`.

## Reglas
- No hacer commit ni push: los hace el usuario.
- Precios, descuentos, stock y validaciones siempre en el servidor (`backend/src/pedidos.ts → calcular`). El frontend solo ayuda.
- Cambios de catálogo en bases existentes: migración al final de `MIGRACIONES` (`backend/src/db.ts`); `seed.ts` solo sirve para bases vacías.
- Cada cambio de lógica deja un test (`backend/src/*.test.ts`).
- Textos para el cliente en español rioplatense. No tocar las preguntas frecuentes si no lo piden.
- Los números de modelo de portachupete ("Silicona N° 4") son internos: el cliente ve material + foto.
- Credenciales nunca en el repo ni en el chat: van directo a Railway.

## Memoria reciente
@.claude/memory.md
