# Memoria reciente (últimos 4 días)

Resumen de los cambios importantes, un bloque por día (`## AAAA-MM-DD`, el más nuevo arriba).
Los días con más de 4 días de antigüedad se borran solos al empezar cada sesión (`.claude/hooks/podar-memoria.mjs`).
Lo que tiene que durar más va en `CLAUDE.md`, no acá. Lo actualiza el skill `gc`.

## 2026-10-28
- Recargo de Mercado Pago configurable en admin → Ajustes (prender/apagar y porcentaje, 0–50%; ajuste `recargo_mp`, por defecto 10%). Queda en el Historial. El checkout muestra el % real. Los textos de la web (preguntas frecuentes) no mencionan el recargo: solo se ve en el checkout.

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

## 2026-10-22
- Favicon: pestaña = logo con nombre (`favicon.ico`); Google/Android = arcoíris solo (`icon-192.png`); iPhone = `apple-touch-icon.png`. En la raíz del frontend (Vercel), no en `/assets/img` (Railway).
- Caída de Railway (21–22/10): revocó las credenciales de los buckets y pausó los deploys → imágenes 502. Se arregla con redeploy. Pendiente: plan de resiliencia en `backend/TODO.md`.
- `backend/TODO.md` actualizado al estado real (secciones Resiliencia y Configuración pendiente).
- Search Console: página indexada; falta cargar `sitemap.xml` en una propiedad que coincida con `https://manolitouy.com/` (o de tipo Dominio).
- Mercado Pago en producción activo. Rotar credenciales: Tus integraciones → Credenciales de producción → ⋮ → Renovar; cargar `MP_ACCESS_TOKEN` + `MP_PUBLIC_KEY` juntas y redeploy.
