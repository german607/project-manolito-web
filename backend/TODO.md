# TODO — Backend

## Fase 1 — Catálogo
- [ ] Base de datos: SQLite (un archivo, sin servidor)
- [ ] Tablas `productos` (nombre, precio, colores, foto, activo) y `boxes` (con sus productos)
- [ ] Script de carga inicial con los productos que hoy están en `frontend/js/main.js`
- [ ] `GET /api/productos` y `GET /api/boxes`

## Fase 2 — Pedidos
- [ ] `POST /api/pedidos`: calcular el precio en el servidor (incluye $20 por letra extra del portachupete), nunca confiar en el del navegador
- [ ] Validar el body (ej. `zod`)
- [ ] Tabla `pedidos` con estado: pendiente → pagado → enviado → entregado

## Fase 3 — Cobro
- [ ] Transferencia bancaria: marcar pedido como pagado a mano
- [ ] Mercado Pago Checkout Pro (crear preferencia de pago)
- [ ] Webhook de Mercado Pago que marca el pedido como pagado, verificando la firma
- [ ] Costo de envío por zona (cadetería Montevideo / pick-up Cordón / interior)

## Fase 4 — Notificaciones
- [ ] Mail al cliente: pedido confirmado y enviado (Resend o similar)
- [ ] Aviso a Manolito de cada pedido nuevo (mail o Telegram)

## Fase 5 — Admin (API)
- [ ] Login de un único usuario con cookie de sesión
- [ ] Endpoints de pedidos: listar, filtrar por estado, cambiar estado
- [ ] Endpoints de productos: editar precio, stock, activo/inactivo
- [ ] Subida de fotos de productos

## Fase 6 — Producción
- [ ] Hosting con disco persistente para SQLite (Railway / Render / Fly.io)
- [ ] Dominio propio con HTTPS (ej. `manolito.com.uy`)
- [ ] Variables de entorno en `.env` (Mercado Pago, mail, contraseña del admin)
- [ ] Backup diario del archivo de la base

## Fase 7 — Legal
- [ ] Ver con el contador la facturación electrónica (CFE)

## Más adelante (solo si hace falta)
- Cuentas de usuario e historial de compras
- Cupones de descuento
- Control de stock automático
