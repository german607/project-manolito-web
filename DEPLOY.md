# Entornos y deploy

| | Staging | Producción |
|---|---|---|
| Rama de git | `develop` | `main` |
| Web (Vercel) | previews de Vercel / `manolito-dev.vercel.app` | `manolitouy.com` y `www.manolitouy.com` |
| API (Railway) | `project-manolito-web-staging.up.railway.app` | `project-manolito-web-production.up.railway.app` |
| Base de datos | Postgres propio de staging | Postgres propio de producción |
| Imágenes | bucket `manolito-img-storage-76u0au` | bucket `manolito-img-storage-dzycai` |
| Admin (`ADMIN_EMAIL`) | `admin.staging@manolitouy.com` | `admin@manolitouy.com` |
| Comprobantes | a `admin.staging@` (sin `COMPROBANTES_EMAIL`) | `comprobantes@manolitouy.com` |

**Cómo Vercel elige el backend** (`frontend/vercel.json`): según el **dominio** desde el que se entra.
`manolitouy.com` → backend de producción; **cualquier otro dominio** → staging.
`www.manolitouy.com` redirige a `manolitouy.com` (un solo dominio para Google). Todo dominio que no sea
`manolitouy.com` lleva `X-Robots-Tag: noindex`, así staging y los previews no aparecen en buscadores.
Así, un preview o un dominio nuevo nunca toca datos reales. Si se suma otro dominio de producción, hay que agregarlo
ahí; si no, va a usar staging (con su base de prueba y el Mercado Pago de prueba).

Cada entorno tiene **su propia base y su propio bucket**: nunca apuntar staging a la base de producción (ni copiar
la base de staging a producción: tiene pedidos y usuarios de prueba). Al arrancar, el log dice a qué base está
conectado: `Entorno: production · Base: <host>/railway`.

## Crear producción desde cero (Railway)

1. **New Environment → production** (vacío, o duplicando staging y después cambiando lo que se indica abajo).
2. En ese entorno: **+ New → Database → PostgreSQL** y **+ New → Bucket**.
3. Servicio web → **Settings → Source**: rama `main`. Root Directory igual que en staging.
4. Servicio web → **Variables**:
   - `DATABASE_URL` = referencia al Postgres **de producción** (`${{Postgres.DATABASE_URL}}`)
   - Bucket: preset "AWS SDK" del bucket **de producción** (`AWS_S3_BUCKET_NAME`, `AWS_ENDPOINT_URL`, …)
   - `ADMIN_EMAIL=admin@manolitouy.com`, `ADMIN_PASSWORD` (16+ caracteres; distinta de la de staging)
   - `COMPROBANTES_EMAIL=comprobantes@manolitouy.com`
   - `TRUST_PROXY=2`, `BASE_URL` y `FRONTEND_URL` = dominio de producción
   - `RESEND_API_KEY`, `MAIL_FROM`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PAGO_INSTRUCCIONES`
5. Subir las imágenes al bucket: `./scripts/subir-imagenes.sh produccion`.
6. Deploy. En el primer arranque se crean solas las tablas, el catálogo (desde `backend/src/seed.ts`) y la cuenta de admin.
7. Activar los **backups** del Postgres de producción en Railway.

**Verificar:** el log dice `Entorno: production` y `Imágenes: desde el bucket manolito-img-storage-dzycai`;
`/api/health` responde; se puede ingresar al admin; una compra de prueba aparece en Pedidos y en Historial.

## Mercado Pago

1. En [Mercado Pago Developers](https://www.mercadopago.com.uy/developers) → **Tus integraciones → Crear aplicación**
   (producto: **Checkout Pro**). La cuenta tiene que ser de Uruguay (cobra en pesos, UYU).
2. **Credenciales** (Railway → servicio web → Variables): `MP_ACCESS_TOKEN` (Access Token) y `MP_PUBLIC_KEY` (Public Key).
   - **Staging:** las **"Credenciales de prueba" de tu cuenta real** (Tus integraciones → tu aplicación → Credenciales de prueba).
     No las de un vendedor de prueba: con esas, el pago con tarjeta en la web da "Unauthorized use of live credentials".
   - **Producción:** las **credenciales de producción**. Pegarlas directo en Railway, nunca en un chat ni en el repo.
   - Sin `MP_PUBLIC_KEY`, el checkout manda al cliente a la página de Mercado Pago (Checkout Pro) en vez de mostrar la tarjeta en la web.
3. **Webhook** (sin esto los pagos no se confirman solos): en la aplicación → **Webhooks → Configurar notificaciones**:
   - URL: `https://<dominio>/api/mercadopago/webhook` (modo prueba con el dominio de staging, modo producción con el de producción)
   - Evento: **Pagos**. Guardar → copiar la **clave secreta** → Railway: `MP_WEBHOOK_SECRET`.
4. `BASE_URL` tiene que ser el dominio público (Mercado Pago devuelve al cliente a `BASE_URL/checkout.html`).

**Probar en staging (tarjeta en la web):** hacer un pedido con Mercado Pago y pagar en el formulario con una
**tarjeta de prueba** (ej. Mastercard `5031 7557 3453 0604`, venc. `11/30`, CVV `123`). No hace falta iniciar sesión.
En el nombre del titular: `APRO` = aprobado, `OTHE` = rechazado, `CONT` = pendiente. El email del pagador puede ser
cualquiera, menos el de tu cuenta de Mercado Pago.

**Pagar con cuenta de Mercado Pago** (link "Prefiero pagar con mi cuenta"): ese medio sí va a la página de Mercado Pago.
Para probarlo hace falta un usuario comprador de prueba creado en Tus integraciones → Cuentas de prueba (se ingresa con su
usuario, contraseña y el código de verificación que muestra el panel), en una ventana de incógnito. Revisar que el pedido pase a **pagado** en el admin (pestaña Pedidos e
Historial, autor `mercadopago`) y que llegue el mail de pago confirmado.

El formulario de tarjeta (Card Payment Brick) es de Mercado Pago: los datos de la tarjeta nunca pasan por nuestro
servidor, solo un token. El monto lo pone el servidor desde el pedido. Hay tope de intentos por IP y por pedido.

Cómo funciona: el servidor **nunca cree** lo que dice el webhook ni la URL de vuelta; siempre consulta el pago a la API
de Mercado Pago y verifica moneda (UYU) y monto. Los pagos en efectivo dentro de Mercado Pago están desactivados
(no se pagan dentro de las 2 h que dura el pedido); Abitab y Red Pagos se ofrecen aparte en el checkout.

## Mails

- **Outlook (Microsoft 365, GoDaddy):** la casilla de Manolito (ej. `hola@manolitouy.com`) para leer y contestar.
  Sus registros DNS (MX, SPF `secureserver.net`, DKIM `selector1/2`, `_dmarc`, `autodiscover`) **no se tocan**.
- **Resend:** los mails automáticos de la web, desde `pedidos@manolitouy.com`.
  1. resend.com → Domains → Add Domain → `manolitouy.com` (región us-east-1).
  2. Cargar en GoDaddy los 3 registros que muestra (TXT `resend._domainkey`, MX y TXT en `send`). Van en el subdominio
     `send`, así que no chocan con los de Outlook.
  3. Railway (staging y producción): `RESEND_API_KEY`, `MAIL_FROM=Manolito <pedidos@manolitouy.com>`,
     `MAIL_REPLY_TO=hola@manolitouy.com`, `ADMIN_EMAIL` (staging: `admin.staging@manolitouy.com`; producción:
     `admin@manolitouy.com`). Es también el usuario con el que se ingresa al admin de cada entorno, y donde llegan los avisos.
- Si un cliente responde un mail automático, la respuesta llega al Outlook (`MAIL_REPLY_TO`). En los avisos de pedido
  nuevo y comprobante recibido, "Responder" le escribe directo al cliente.
- **Comprobantes de pago:** cuando un cliente sube un comprobante, el aviso va a `COMPROBANTES_EMAIL` **con el archivo
  adjunto**. Producción: `COMPROBANTES_EMAIL=comprobantes@manolitouy.com` (crear esa casilla o alias en Outlook).
  Staging: no configurarla, así van a `admin.staging@manolitouy.com` y no se mezclan pruebas con comprobantes reales.
- Sin `RESEND_API_KEY` los mails no salen: solo quedan en el log del servidor.

## Cambios de catálogo: `seed.ts` NO alcanza

`seed.ts` solo se usa cuando la base está **vacía**. Cambiar ahí un precio, un nombre o el contenido de una box
no actualiza staging ni producción. Según el caso:

- **Precio, stock, activo, foto:** desde el panel de admin (queda en el Historial).
- **Nombre, contenido de una box, box o producto nuevo:** cambiar `seed.ts` (para las bases nuevas) **y** agregar una
  migración al final de `MIGRACIONES` en `backend/src/db.ts` (para las que ya existen). Ver la migración 1 como ejemplo:
  solo cambia lo que sigue con el valor viejo, así no pisa lo editado en el admin.

## Desarrollo local

```bash
docker compose up -d          # Postgres en el puerto 5434
cd backend && npm run dev     # http://localhost:3000 (sin bucket: imágenes del disco)
npm test                      # usa el esquema "test", no toca los datos de desarrollo
```
