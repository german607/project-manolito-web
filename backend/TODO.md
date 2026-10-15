# TODO — Backend

## Fase 1 — Catálogo
- [x] Base de datos: SQLite (un archivo, sin servidor)
- [x] Tablas `productos` (nombre, precio, colores, foto, activo) y `boxes` (con sus productos)
- [x] Script de carga inicial con los productos que hoy están en `frontend/js/main.js`
- [x] `GET /api/productos` y `GET /api/boxes`

## Fase 2 — Pedidos
- [x] `POST /api/pedidos`: calcular el precio en el servidor (incluye $20 por letra extra del portachupete), nunca confiar en el del navegador
- [x] Validar el body (ej. `zod`)
- [x] Tabla `pedidos` con estado: pendiente → pagado → enviado → entregado

## Fase 3 — Cobro
- [x] Transferencia bancaria: marcar pedido como pagado a mano
- [x] Mercado Pago Checkout Pro (crear preferencia de pago)
- [x] Webhook de Mercado Pago que marca el pedido como pagado, verificando la firma
- [x] Costo de envío: no se cobra en la web, lo paga el cliente a la cadetería (según las preguntas frecuentes)

## Fase 4 — Notificaciones
- [x] Mail al cliente: pedido confirmado y enviado (Resend o similar)
- [x] Aviso a Manolito de cada pedido nuevo (mail o Telegram)

## Fase 5 — Admin (API)
- [x] Métricas de uso anónimas (`/api/eventos`) y resumen para el panel
- [x] Login de un único usuario con cookie de sesión
- [x] Endpoints de pedidos: listar, filtrar por estado, cambiar estado
- [x] Endpoints de productos: editar precio, stock, activo/inactivo
- [x] Subida de fotos de productos

## Seguridad

Verificado contra el servidor el 2026-10-14. Sin vulnerabilidades conocidas en dependencias (`npm audit`: 0).
Ya cubierto: consultas SQL con parámetros, precios calculados en el servidor, escape de HTML en el admin y el carrito,
cookie de sesión `httpOnly` + `SameSite=Strict`, firma del webhook de Mercado Pago, `.env` nunca subido a git,
la base no se puede descargar desde la web.

### Alta — antes de salir a producción
- [x] **El límite de intentos del login se saltea**: `trust proxy` confía en `X-Forwarded-For`, así que cambiando ese header se prueban contraseñas sin bloqueo (probado: 7 intentos, ningún 429). Configurar `trust proxy` según el proxy real del hosting (variable de entorno, por defecto desactivado)
- [x] Contraseña del admin fuerte: que el server no arranque en producción si `ADMIN_PASSWORD` falta o tiene menos de 16 caracteres (la de desarrollo es `manolito-dev`)
- [x] Límite de requests por IP en los endpoints públicos que escriben: `POST /api/pedidos` (pedidos en loop vacían el stock y mandan mails a cualquier dirección), `/api/eventos` y `/api/carrito`
- [x] No servir archivos internos: hoy `/TODO.md` e `/index-diseno.html` son públicos (probado). Servir solo una lista de lo publicable o mover esos archivos fuera de `frontend/`
- [x] Cookie del admin `secure` siempre en producción: hoy depende de que `NODE_ENV=production` esté seteado; si se olvida, la sesión viaja sin HTTPS
- [x] HSTS en producción. La redirección http→https queda a cargo del hosting (activarla al configurarlo)

### Exceso de requests (server chico)
- [x] Límite por IP para todo el sitio (1500/min) y para la API (300/min), además de los de pedidos, carrito y eventos
- [x] Tope de 50 requests a la API procesándose a la vez: si se llega, responde 503 "ocupado" en vez de caerse
- [x] Tope de IPs en memoria (100.000) para que un ataque desde muchas IPs no agote la RAM
- [x] Conexiones lentas (slowloris): 10 s para los headers, 30 s por request, 5 s de inactividad; máximo 500 conexiones
- [x] Requests JSON de hasta 20 KB (antes 100 KB)
- [x] Fotos guardadas 1 día en el navegador: las visitas repetidas no las vuelven a pedir
- [ ] **Cloudflare (plan gratis) delante del server**: es lo único que frena un ataque desde miles de IPs (DDoS) y además sirve las fotos desde su caché, sin gastar el ancho de banda del server. Con Cloudflare + proxy del hosting, `TRUST_PROXY=2`
- [ ] Achicar las fotos (hoy 3,7 MB por página completa): con un server chico, el ancho de banda se agota antes que la CPU

### Media
- [ ] Headers de seguridad (`X-Powered-By` ya está oculto): agregar `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors 'none'` / `X-Frame-Options: DENY` (evita que metan el admin en un iframe para engañar clicks)
- [ ] Content-Security-Policy: permitir solo scripts propios y Google Fonts. Requiere sacar los 4 `onclick=` inline del `index.html` (ver frontend/TODO.md)
- [ ] Fotos subidas: verificar que el archivo sea realmente una imagen (primeros bytes JPG/PNG/WebP), no solo el `Content-Type` que manda el navegador
- [ ] `/api/eventos` acepta cualquier `ref` (probado: crea una fila por cada texto distinto, la base puede crecer sin límite). Aceptar solo páginas, boxes y productos que existen
- [ ] Sin `RESEND_API_KEY` los mails, con nombre, teléfono y dirección del cliente, se escriben en la consola. En producción, fallar en vez de loguear datos personales
- [ ] Verificar el header `Origin` en los requests del admin que modifican datos (defensa extra además de `SameSite`)
- [ ] El registro de intentos de login crece sin límite en memoria: limpiar entradas vencidas
- [ ] Webhook: rechazar notificaciones con `ts` viejo (ej. más de 10 minutos)

### Baja
- [ ] La página de "¡Pago recibido!" cree lo que dice la URL (`?pago=ok`): consultar el estado real del pedido al servidor
- [ ] Revisar dependencias automáticamente (Dependabot o `npm audit` en CI)
- [ ] Backups de la base: guardarlos en un lugar privado, porque tienen datos personales de clientes
- [ ] Logs de producción sin datos personales (nombre, teléfono, email, dirección)

## Fase 5b — Pendientes detectados al revisar el código

### Antes de salir a producción
- [x] Cancelar un pedido devuelve el stock (hoy se descuenta al crear el pedido y nunca vuelve)
- [ ] Fotos subidas desde el admin en un disco persistente: hoy se guardan dentro de `frontend/assets` y se pierden en cada deploy

### Pagos
- [x] Pedidos sin pagar (cualquier medio) se cancelan solos a las 2 h, devuelven el stock y se avisa al cliente. Mercado Pago deja de aceptar el pago a la misma hora; si igual entra uno tarde, se reactiva el pedido o se avisa para devolver la plata
- [ ] Webhook: manejar reembolsos y contracargos (`refunded`, `charged_back`) y verificar que la moneda sea UYU
- [ ] Mail al cliente cuando el pago se confirma (hoy solo hay mail al crear y al enviar)
- [ ] Confirmar con Manolito si las boxes cobran $20 por letra extra en el portachupete (hoy no)

### Catálogo desde el admin
- [x] Interruptor "Ignorar stock" por producto: se vende sin mirar la cantidad y sin descontarla; la cantidad cargada se conserva
- [ ] Crear productos y boxes nuevos, y editar nombre, descripción, colores y contenido de las boxes (hoy solo precio, stock y activo)
- [ ] Que el frontend dibuje las boxes desde la API: hoy están en el HTML y una box nueva no aparecería
- [x] Las boxes descuentan (y al cancelar devuelven) el stock de los productos que traen (tabla `box_productos`). Si a una box le falta stock de algún producto, la web la muestra "Sin stock"
- [ ] Editar desde el admin qué productos trae cada box (hoy se carga del catálogo inicial)

### Mantenimiento
- [x] Migraciones de la base (`PRAGMA user_version`, lista `MIGRACIONES` en `db.ts`): para cambiar la estructura de una base que ya tiene datos, agregar una función al final de la lista
- [ ] Tests de lo sensible: firma del webhook, login del admin, descuento y devolución de stock
- [ ] Log de requests y errores (para saber qué pasó cuando algo falla en producción)
- [ ] Sesiones del admin en la base (hoy en memoria: reiniciar el server cierra la sesión)
- [ ] Fijar la versión de Node (`engines` en `package.json`), porque `better-sqlite3` se compila para cada versión

## Fase 6 — Producción
- [ ] Hosting con disco persistente para SQLite (Railway / Render / Fly.io)
- [ ] Dominio propio con HTTPS (ej. `manolito.com.uy`)
- [x] Variables de entorno en `.env` (Mercado Pago, mail, contraseña del admin)
- [ ] Backup diario del archivo de la base

## Fase 7 — Legal
- [ ] Ver con el contador la facturación electrónica (CFE)
- [ ] Datos personales (Ley 18.331): cuánto tiempo se guardan los datos de los pedidos y cómo borrarlos si un cliente lo pide

## Más adelante (solo si hace falta)
- Cuentas de usuario e historial de compras
- Cupones de descuento
- Control de stock automático
