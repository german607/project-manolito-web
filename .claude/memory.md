# Memoria reciente (últimos 4 días)

Resumen de los cambios importantes, un bloque por día (`## AAAA-MM-DD`, el más nuevo arriba).
Los días con más de 4 días de antigüedad se borran solos al empezar cada sesión (`.claude/hooks/podar-memoria.mjs`).
Lo que tiene que durar más va en `CLAUDE.md`, no acá. Lo actualiza el skill `gc`.

## 2026-10-28
- Conversión (48 h): 706 visitas → 25 al carrito (4%) → 21 checkout → 7 pedidos (33%) → 5 pagos. La caída grande es checkout → pedido. El usuario **no quiere** WhatsApp en el checkout ni precios de envío.
- **Carrito abandonado por mail** (`abandonos.ts`, tabla `carritos_abandonados`, migración 10): el checkout guarda el carrito al escribir el email; a las **24 h** sin pedido sale "Te falta solo el último paso 💛" con fotos y botón que restaura el carrito (`checkout.html?carrito=TOKEN`, utm `mail`/`carrito-abandonado`). **Una vez por carrito** (si cambia el carrito, cuenta como otro). Sin nombre del bebé ni estampado en el mail. Corre cada 5 min.
- Embudo del Resumen: nuevo paso "Empezaron a llenar sus datos" (evento `checkout_datos`). Checkout: notas bajo el email (aviso del mail de carrito) y bajo el botón ("Todavía no pagás nada…").
- Checkout: se borró "El envío se coordina aparte…". Interior: elegir **Agencia DAC** / **A domicilio** (`envio` en el pedido, obligatorio, validado en el servidor) y se guarda adelante de la dirección ("Agencia DAC: …"). **Pendiente:** los mails todavía dicen "(el envío se coordina aparte)" (`pedidos.ts` resumen); preguntar si se saca.
- **Pendiente:** si el usuario quiere, tarjeta en Resumen con mails de carrito enviados vs. recuperados; sumar el guardado del email a la política de privacidad.
- Recargo de Mercado Pago configurable en admin → Ajustes (prender/apagar y porcentaje, 0–50%; ajuste `recargo_mp`, por defecto 10%). Queda en el Historial. El checkout muestra el % real. Los textos de la web (preguntas frecuentes) no mencionan el recargo: solo se ve en el checkout.
- Vencimiento de pedidos sin pagar: **transferencia 4 h**, el resto (Abitab, Prex, Mercado Pago) 2 h (`venceHoras(pago)` en `pedidos.ts`; admin y checkout usan el mismo dato). **Pendiente:** la pregunta frecuente "¿Cómo compro?" sigue diciendo "2 horas" (no tocar sin que lo pidan).
- "Reclamar pago" también en pedidos **pagados** (manuales): el pedido vuelve a pendiente y se le saca el comprobante (el archivo queda; su clave va al Historial) para que pueda subir otro y venza si no paga.
- Admin → Pedidos: botón **"Reclamar pago"** (pendientes de transferencia/Abitab/Prex sin comprobante). Mail "Todavía no recibimos tu pago": datos para pagar + link nuevo (el anterior deja de valer), "necesitamos el comprobante antes de las HH:MM" y cierra con "Envianos el comprobante de pago para que podamos comenzar a preparar tu compra". **Da 4 h desde el mail** (`pedidos.vence`, migración 9; `vencimiento(p)` en `pedidos.ts`). Historial: `recordatorio`.
- Horas de vencimiento en 24 h y hora de Uruguay (mail, pantalla de pago, admin). El mail de cancelación ahora dice "Venció el plazo sin que recibiéramos el pago".
- Redirecciones 3xx revisadas: 308 http→https, www→sin www y /admin→/admin/ (Vercel); 301 dominio de Railway→manolitouy.com (`FRONTEND_URL`); 304 de imágenes. Sin cadenas.
- Análisis de seguridad (OWASP + pérdida de datos) hecho; no se aplicó ningún arreglo todavía. **Pendiente, por prioridad:** backups de Postgres (riesgo 8); `npm audit fix` por body-parser (7); aviso por mail al cambiar datos bancarios/recargo y login del admin; 2FA del admin (6); backup del bucket e imágenes desde Vercel (6); Cloudflare + verificar `TRUST_PROXY` (la API responde directo en Railway) (5); CSP y Permissions-Policy (4); no poner el nombre libre en los mails al cliente (5); reserva de stock con pedidos falsos / captcha (5).

## 2026-10-27
- Admin: campanita de notificaciones en el header (`/api/admin/notificaciones`, cada 30 s). Muestra cambios en pedidos que no hizo ese admin (salen del historial); "vistas" por admin en `usuarios.notif_vistas` (migración 7). Tocar una lleva al pedido en la pestaña Pedidos.
- Admin → Resumen: nuevas métricas "Para vender más" (comparación con el período anterior, conversión por box, días y horas de los pedidos, cupones, de dónde vienen las ventas) y "Clientes" (nuevos, que vuelven, mejores clientes). El origen sale de `?utm_source=…&utm_campaign=…` o del sitio de referencia (`main.js → origenVisita`, 30 días) y se guarda en `pedidos.origen/campana` (migración 8).
- Vercel Web Analytics agregado a las 4 páginas públicas (falta activarlo en Vercel → Analytics). El bounce rate da alto porque casi todo pasa en una sola página.
- Memoria del proyecto: `CLAUDE.md` + `.claude/memory.md` (4 días) + skill `gc` + hooks (`podar-memoria`, `gc-aviso`).

## 2026-10-26
- Botón "Agregar al carrito" (`.btn-add`): rosado claro mientras falta elegir algo; se oscurece (`.listo`) cuando ya se puede agregar. En la box, la sección Portachupetes y "Armá tu box".
- Boxes: se elige color de la box y **modelo del portachupete** (botones Silicona / Madera → ventana con fotos → OK). El babero de la box va **del mismo color que la box** (sin opción aparte). El servidor exige `modelo` en boxes con portachupete.
- Números de modelo ("Silicona N° 4"): **solo internos**. El cliente ve material + foto (web, carrito, mails); el admin ve número + foto del modelo; el mensaje de Instagram de "Armá tu box" lleva el número.
- "Armá tu box": babero solo en Rosa / Celeste / Verde, sin fotos ni estampado (migración 5). Sonajero: modelo "Conejito aro" / "Conejito bastón" (migración 6, va en el campo `color`).
- Celular: "Armá tu box" dentro del menú ☰ (el botón del header se oculta). Sin "Inicio" ni el texto "Ingresar" (ícono de persona a la derecha).
- Inicio: sin el círculo "Incluye sujetador personalizado"; botones "Ver portachupetes" / "Ver boxes". Sección Baberos eliminada.
- Las boxes no cobran letras extra: se sacó "hasta 5 letras" de la ventana de la box. **No tocar las preguntas frecuentes sin que lo pidan.**
- Textos: manta "Manta de muselina de algodón, liviana y suave. Para múltiples usos."; peine "de bamboo"; zapatitos sin "con carita"; estuche "libre de BPA".

