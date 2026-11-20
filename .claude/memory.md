# Memoria reciente (últimos 4 días)

Resumen de los cambios importantes, un bloque por día (`## AAAA-MM-DD`, el más nuevo arriba).
Los días con más de 4 días de antigüedad se borran solos al empezar cada sesión (`.claude/hooks/podar-memoria.mjs`).
Lo que tiene que durar más va en `CLAUDE.md`, no acá. Lo actualiza el skill `gc`.

## 2026-11-18
- **Admin reorganizado:** Resumen · Catálogo (productos + boxes en una pestaña) · Pedidos · **Producción** · Finanzas · Cupones · Historial · Ajustes.
- **Producción:** pedidos `pagado` (el que pagó primero, primero) con estado interno `pedidos.taller` pendiente (rojo) / trabajando (amarillo) / completado (verde), y "hace X días" desde el pago (migración 18). Al pasar a pronto/enviado sale de la lista.
- **Pedidos cargados a mano** (admin → Pedidos → "+ Nuevo pedido", migración 17): box, portachupete o armado; precio del servidor; sin mails, no vencen, email/teléfono opcionales; `pedidos.manual` = quién lo cargó; solo esos se editan (devuelve y descuenta stock/cupón).
- **Finanzas** (migraciones 15 y 16): `pedidos.pagado` (cuándo se confirmó el pago) y tabla `cierres` (cortes de caja con totales por medio de pago guardados). Primer cierre: 11/11 23:59. Se puede deshacer solo el último.
- **Stock por color** (migración 20): `productos.sin_stock` (colores que no hay). Una box no se vende en un color si a algún producto suyo le falta ese color; sin ningún color, agotada. Admin → Catálogo: botones por color.
- **Sin peine de bamboo** (migración 19): Bienvenida lleva zapatitos y Especial Manolito un sonajero, con una sola foto cada una (el color se elige igual). Las fotos de prod se sirven **solo del bucket**: subirlas con `scripts/subir-imagenes.sh` (o `aws s3 cp`) antes del deploy.
- Promo 10% (`precio_anterior`, migración 14), 12 cuotas sin interés en MP, numeración con un 1 adelante (migración 13), `notification_url` en la preferencia (**pendiente:** verificar webhooks 200 en MP).
- Railway → Data → Query agrega `LIMIT`: una consulta por vez, sin `;`, UPDATE/DELETE como `WITH x AS (... RETURNING ...) SELECT * FROM x`. Las consultas a prod las corre el usuario.
- Vigente: vencimiento 18:00 del día siguiente (reclamo 4 h sin acortar); estado "pronto" para retiro; rastreo DAC para interior; entregado sin mail; carrito abandonado por mail a las 24 h. **Pendiente:** FAQ "2 horas" (no tocar sin que lo pidan); seguridad (backups Postgres, `npm audit fix`, 2FA, CSP, captcha). Reporte de boxes (2026-11-13): ganadoras Bienvenida y Pequeño tesoro (traen trapito); Dulce sueños más cara que armarla.

