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

## Fase 6 — Producción
- [ ] Hosting con disco persistente para SQLite (Railway / Render / Fly.io)
- [ ] Dominio propio con HTTPS (ej. `manolito.com.uy`)
- [x] Variables de entorno en `.env` (Mercado Pago, mail, contraseña del admin)
- [ ] Backup diario del archivo de la base

## Fase 7 — Legal
- [ ] Ver con el contador la facturación electrónica (CFE)

## Más adelante (solo si hace falta)
- Cuentas de usuario e historial de compras
- Cupones de descuento
- Control de stock automático
