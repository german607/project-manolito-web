# TODO — Frontend

## Fase 1 — Catálogo
- [ ] Unificar los productos que hoy están definidos dos veces en `js/main.js` (modal y "Armá tu box")
- [x] Leer productos y boxes desde `GET /api/productos` y `GET /api/boxes` en vez de tenerlos fijos en el código

## Fase 2 — Carrito y checkout
- [x] Carrito persistente en `localStorage`
- [x] Formulario de checkout: nombre, teléfono, email, dirección, forma de entrega (cadetería Montevideo / pick-up Cordón / interior)
- [x] Enviar el pedido a `POST /api/pedidos`
- [x] Página "¡Gracias por tu pedido!" con el número de pedido

## Fase 3 — Cobro
- [ ] Mostrar datos de la cuenta para transferencia bancaria
- [x] Botón de pago con Mercado Pago (redirige a Checkout Pro)
- [ ] Mostrar el costo de envío según la zona

## Fase 4 — Contacto
- [ ] Mantener el botón de Instagram / WhatsApp para consultas

## Fase 5 — Panel de administración
- [x] Pantalla de login
- [x] Lista de pedidos con filtro por estado y botón para cambiarlo
- [x] Editar productos (precio, stock, activo) y subir fotos

## Fase 6 — Producción
- [ ] Optimizar imágenes a WebP y bajar resolución (hoy 3,7 MB)

## Fase 7 — Legal y confianza
- [ ] Página de términos y condiciones y política de cambios/devoluciones (Ley 17.250)
- [ ] Página de política de privacidad (Ley 18.331)

## Más adelante (solo si hace falta)
- Cuentas de usuario e historial de compras
- Cupones de descuento
- SEO por producto y analítica (Plausible o Google Analytics)
