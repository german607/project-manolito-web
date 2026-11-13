# Memoria reciente (últimos 4 días)

Resumen de los cambios importantes, un bloque por día (`## AAAA-MM-DD`, el más nuevo arriba).
Los días con más de 4 días de antigüedad se borran solos al empezar cada sesión (`.claude/hooks/podar-memoria.mjs`).
Lo que tiene que durar más va en `CLAUDE.md`, no acá. Lo actualiza el skill `gc`.

## 2026-11-12
- **Promo 10%** (migración 14): `precio_anterior` en productos y boxes (precio de antes, se ve tachado en gris en la web cuando es mayor). Precios bajados 10% redondeado a 10. Admin → Productos/Boxes: columna "Precio anterior"; vaciarla termina la promo. Se cobra siempre `precio`; cupones se suman.
- **Mercado Pago cuotas:** hasta **12 sin interés** (`MAX_CUOTAS` en `mercadopago.ts`, brick `maxInstallments:12`); el usuario las activó en su cuenta (Visa hasta 10, Master 6, OCA/Amex 12). La clave pública de prod se corrigió (la vieja era inválida).
- Preferencia de MP manda `notification_url` (`/api/mercadopago/webhook?source_news=webhooks`); el webhook sigue exigiendo firma. **Pendiente:** verificar en MP → Webhooks que respondan 200 (si da 401, decidir con el usuario si aceptar avisos sin firma; el clasificador de permisos lo bloqueó).
- Numeración de pedidos con un 1 adelante (migración 13; después del 15 vino el 116). La referencia de pago usa el número (MANOLITO-116).
- Admin → Pedidos: filtro por entrega (interior / cadetería / pick-up) además del de estado. Resumen: gráfico "Montos recibidos por día" (pedidos pagados, por día del pedido) y lista "Errores al confirmar el pedido" (evento `checkout_error`).
- Railway → Data → Query agrega `LIMIT` al final: una consulta por vez, sin `;`, y los UPDATE/DELETE como `WITH x AS (... RETURNING ...) SELECT * FROM x`. Las credenciales de prod no están acá: las consultas a prod las corre el usuario.
- Vigente de días anteriores: vencimiento 18:00 del día siguiente (reclamo da 4 h sin acortar); estado "pronto" (retiro) con dirección de Ajustes; interior → enviado exige rastreo DAC; entregado no manda mail; carrito abandonado por mail a las 24 h, una vez por carrito; el usuario no quiere WhatsApp ni precios de envío en el checkout. **Pendiente:** FAQ "¿Cómo compro?" dice "2 horas" (no tocar sin que lo pidan); compra de prueba real en celular; pendientes de seguridad (backups de Postgres, `npm audit fix`, 2FA admin, CSP, captcha).
