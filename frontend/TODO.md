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

## Cuentas
- [x] Página `login.html` con Ingresar / Crear cuenta; el admin ingresa por acá y va directo al panel
- [x] Link "Ingresar" en el header (en el celular, dentro del menú ☰) que muestra el nombre cuando hay sesión
- [x] El checkout completa nombre y email si hay sesión
- [ ] "¿Olvidaste tu contraseña?" (cuando exista en el backend)
- [ ] Página "Mis pedidos"

## Seguridad
- [ ] Sacar los 4 `onclick=` inline de `index.html` (flechas de los carruseles) y pasarlos a `js/main.js`, para poder activar una Content-Security-Policy estricta
- [ ] Regla para todo código nuevo: nunca meter datos del servidor o del usuario con `innerHTML` sin escapar (usar `textContent` o `esc()`, como en el carrito y el admin)
- [x] La página de "¡Pago recibido!" consulta el estado real del pago al servidor (no confía en la URL)
- [ ] Opcional: servir las fuentes desde el propio sitio en vez de Google Fonts (CSP más simple y no se comparte la IP de los visitantes con Google)

## Fase 6 — Producción
- [ ] Optimizar imágenes a WebP y bajar resolución (hoy 3,7 MB)

## Fase 7 — Legal y confianza
- [ ] Página de términos y condiciones y política de cambios/devoluciones (Ley 17.250)
- [ ] Página de política de privacidad (Ley 18.331)

## Más adelante (solo si hace falta)
- Cuentas de usuario e historial de compras
- Cupones de descuento
- SEO por producto y analítica (Plausible o Google Analytics)
