# TODO — Backend

## Fase 1 — Catálogo
- [x] Base de datos: Postgres (Railway en producción, Docker en desarrollo: `docker compose up -d`). Antes era SQLite
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

## Reglas de compra (pedido por la dueña)
- [x] **Nombre del bebé obligatorio**: el servidor rechaza (400) el portachupete y las boxes que lo traen sin `nombreBebe` (vacío o solo espacios; máx. 20). Cubre los tres caminos (sección Portachupetes, "Armá tu box" y boxes, más la cotización del carrito), con tests de cada uno
- [x] **Mínimo de 2 productos en "Armá tu box"**: cada armado lleva un id (`armado`) que genera `arma.js`; el servidor exige 2 productos distintos por armado (cada armado por separado, no se suman entre sí) y rechaza productos sueltos que no sean el portachupete. El carrito marca el armado incompleto y `arma.js` avisa "Elegí al menos 2 productos". Con tests. En el admin y en los mails cada producto dice a qué armado pertenece ("Armado 1"), y el admin ahora también muestra el modelo del portachupete

## Pagos manuales (transferencia, Abitab, Prex) — Etapa 1
- [x] Datos para pagar editables en el admin (pestaña Ajustes); el cliente los ve con botones para copiar, monto y referencia `MANOLITO-<id>`
- [x] El cliente sube el comprobante (foto o PDF, verificado por sus primeros bytes) desde la pantalla de gracias o el link del mail. Se guarda en una carpeta privada del bucket (`privado/`), nunca en las imágenes públicas
- [x] Acceso con un token por pedido (en la base solo su hash). Token incorrecto o de otro pedido: 404
- [x] Con comprobante subido el pedido no vence: queda "en revisión". Aviso por mail al admin
- [x] En el admin: "Comprobante recibido" + "Ver comprobante" + botón "Confirmar pago" (mail al cliente, historial). Con tests
- [ ] Cargar los datos bancarios reales en el admin → Ajustes (staging y producción)
- [ ] Etapa 2 (con volumen): conciliar con el estado de cuenta del banco (CSV) por referencia y monto
- [ ] Etapa 3 (si hace falta): pago automático por transferencia instantánea / QR con un proveedor (ej. Toke)

## Trackeo
- [x] **Historial de cambios** (tabla `historial`, pestaña Historial del admin): precios, stock, activo y fotos de productos y boxes; creación y cambios de estado de pedidos. Guarda quién (email del admin, cliente, `mercadopago`, `sistema`, `migración`), cuándo y el antes → después. Se escribe en la misma transacción que el cambio
- [x] **Métricas de ventas** en el Resumen del admin: vendido, ticket promedio, más vendidos, medios de pago, formas de entrega y embudo visita → carrito → checkout → pedido → pago (carritos abandonados). Eventos anónimos nuevos: `carrito_agregar`, `checkout`
- [x] **Bases por entorno**: el log de arranque muestra entorno y base; procedimiento en `DEPLOY.md`
- [x] Migración 1: precios nuevos de las boxes y etiqueta PREMIUM (staging tenía los viejos porque `seed.ts` no actualiza bases existentes)
- [ ] Crear el entorno de producción siguiendo `DEPLOY.md`
- [ ] Historial: limpiar registros de más de 2 años si la tabla crece mucho (hoy no hace falta)

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
- [x] Fotos subidas: se verifica que el archivo sea realmente una imagen (primeros bytes JPG/PNG/WebP), no solo el `Content-Type` que manda el navegador
- [ ] `/api/eventos` acepta cualquier `ref` (probado: crea una fila por cada texto distinto, la base puede crecer sin límite). Aceptar solo páginas, boxes y productos que existen
- [ ] Sin `RESEND_API_KEY` los mails, con nombre, teléfono y dirección del cliente, se escriben en la consola. En producción, fallar en vez de loguear datos personales
- [ ] Verificar el header `Origin` en los requests del admin que modifican datos (defensa extra además de `SameSite`)
- [ ] El registro de intentos de login crece sin límite en memoria: limpiar entradas vencidas
- [ ] Webhook: rechazar notificaciones con `ts` viejo (ej. más de 10 minutos)

### Baja
- [x] La página de "¡Pago recibido!" ya no cree lo que dice la URL: `POST /api/mercadopago/confirmar` consulta el pago a Mercado Pago y devuelve el estado real
- [ ] Revisar dependencias automáticamente (Dependabot o `npm audit` en CI)
- [ ] Backups de la base: activar los backups de Postgres en Railway y que no sean públicos (tienen datos personales de clientes)
- [ ] Logs de producción sin datos personales (nombre, teléfono, email, dirección)

## Fase 5b — Pendientes detectados al revisar el código

### Antes de salir a producción
- [x] Cancelar un pedido devuelve el stock (hoy se descuenta al crear el pedido y nunca vuelve)
- [x] Imágenes del sitio y fotos subidas desde el admin en el bucket de Railway (`imagenes.ts`), servidas en las mismas rutas `/assets/img/...`. Sin bucket (desarrollo) salen del disco. La vista de diseño sigue usando las del repo
- [ ] Railway no hace backups de los buckets: guardar una copia de las imágenes (`aws s3 sync` del bucket a otro lado)

### Pagos
- [x] Pedidos sin pagar (cualquier medio) se cancelan solos a las 2 h, devuelven el stock y se avisa al cliente. Mercado Pago deja de aceptar el pago a la misma hora; si igual entra uno tarde, se reactiva el pedido o se avisa para devolver la plata
- [x] Pagos verificados siempre contra la API de Mercado Pago (moneda UYU y monto). Devoluciones y contracargos: si no se envió, se cancela y vuelve el stock; siempre se avisa al admin. Webhook configurado en el panel (firmado), sin `notification_url` en la preferencia. Sin pagos en efectivo dentro de Mercado Pago. Con tests (API simulada)
- [x] Pago de prueba de punta a punta en staging (pedido #7 aprobado por Mercado Pago y marcado pagado por el backend)
- [x] **Pago con tarjeta dentro de la web** (Card Payment Brick): `POST /api/mercadopago/pagar` con el token del pedido; monto desde la base; mensajes claros de rechazo; tope de 5 rechazos por pedido y 10 intentos/10 min por IP. Con tests sobre la ruta real. "Pagar con mi cuenta de Mercado Pago" sigue yendo a Checkout Pro
- [ ] Staging: cargar las "Credenciales de prueba" de la cuenta real (`MP_ACCESS_TOKEN` + `MP_PUBLIC_KEY`) y probar una tarjeta APRO en el formulario
- [ ] Producción: credenciales de producción + webhook en modo producción
- [ ] Si un banco exige 3DS (desafío de seguridad), sumar el Status Screen Brick para resolverlo (hoy no se pide 3DS)
- [x] Mail al cliente cuando el pago se confirma (por Mercado Pago o marcado a mano en el admin)
- [x] Las boxes no cobran $20 por letra extra en el portachupete (confirmado 2026-10-16); el recargo es solo para el portachupete suelto

### Catálogo desde el admin
- [x] Interruptor "Ignorar stock" por producto: se vende sin mirar la cantidad y sin descontarla; la cantidad cargada se conserva
- [ ] Crear productos y boxes nuevos, y editar nombre, descripción, colores y contenido de las boxes (hoy solo precio, stock y activo)
- [ ] Que el frontend dibuje las boxes desde la API: hoy están en el HTML y una box nueva no aparecería
- [x] Las boxes descuentan (y al cancelar devuelven) el stock de los productos que traen (tabla `box_productos`). Si a una box le falta stock de algún producto, la web la muestra "Sin stock"
- [ ] Editar desde el admin qué productos trae cada box (hoy se carga del catálogo inicial)

### Mantenimiento
- [x] Compras simultáneas de la última unidad: el stock se bloquea por fila (`SELECT ... FOR UPDATE`), con test
- [x] Migraciones de la base (tabla `migraciones`, lista `MIGRACIONES` en `db.ts`): para cambiar la estructura o el catálogo de una base que ya tiene datos, agregar una función al final de la lista
- [ ] Tests de lo sensible: firma del webhook, login del admin, descuento y devolución de stock
- [ ] Log de requests y errores (para saber qué pasó cuando algo falla en producción)
- [x] Sesiones en la base (tabla `sesiones`, token guardado como hash): reiniciar el server no desloguea a nadie
- [x] Versión de Node fijada (`engines` >=20.12). Con Postgres (`pg`) ya no hay módulos nativos que compilar

## Fase 6 — Producción
- [ ] Hosting en Railway: servicio web (este repo) + servicio Postgres. Config en `railway.json` y `package.json` de la raíz
- [x] Frontend en Vercel (`frontend/vercel.json`): reenvía `/api` y `/assets/img` a Railway. El dominio de Railway redirige a la web (`FRONTEND_URL`)
- [ ] Configurar `TRUST_PROXY` (probablemente 2: Vercel + Railway) y verificarlo en `/api/admin/diagnostico` comparando con https://ifconfig.me
- [ ] Quien le pegue directo a Railway puede inventar su IP y esquivar los límites por IP. El login ya tiene límite por cuenta; para pedidos y eventos, evaluar exigir un header secreto que solo ponga Vercel (Vercel Middleware)
- [ ] Dominio propio con HTTPS (ej. `manolito.com.uy`)
- [x] Variables de entorno en `.env` (Mercado Pago, mail, contraseña del admin)
- [ ] Backups automáticos del Postgres de Railway

## Fase 7 — Legal
- [ ] Ver con el contador la facturación electrónica (CFE)
- [ ] Datos personales (Ley 18.331): cuánto tiempo se guardan los datos de los pedidos y cómo borrarlos si un cliente lo pide

## Cuentas de usuario
- [x] Registro e ingreso de clientes (`/api/auth`), contraseñas con scrypt, mismo mensaje de error para email inexistente o clave incorrecta
- [x] El admin ingresa por el mismo login: su cuenta sale de `ADMIN_EMAIL` + `ADMIN_PASSWORD` y se crea o actualiza al arrancar
- [x] Los pedidos de clientes logueados quedan asociados a su cuenta (`pedidos.usuario_id`); comprar sin cuenta sigue permitido
- [ ] **Recuperar contraseña** por mail (link con token que vence): necesita Resend configurado. Hasta entonces, un cliente que olvida la clave no puede recuperarla
- [ ] Historial de pedidos del cliente (`GET /api/cuenta/pedidos`)
- [ ] Verificar el email al registrarse (hoy cualquiera puede registrarse con un email ajeno)

## Más adelante (solo si hace falta)
- Cupones de descuento
- Control de stock automático
