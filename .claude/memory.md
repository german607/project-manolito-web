# Memoria reciente (últimos 4 días)

Resumen de los cambios importantes, un bloque por día (`## AAAA-MM-DD`, el más nuevo arriba).
Los días con más de 4 días de antigüedad se borran solos al empezar cada sesión (`.claude/hooks/podar-memoria.mjs`).
Lo que tiene que durar más va en `CLAUDE.md`, no acá. Lo actualiza el skill `gc`.

## 2026-11-02
- Estado nuevo **"pronto"** (pronto para retirar, solo retiro; migración 11): manda mail con la **dirección de retiro** de admin → Ajustes (ajuste `retiro`). Retiro no puede pasar a "enviado" ni los envíos a "pronto".
- Interior → enviado exige **código de rastreo DAC** (recuadro en admin → Pedidos, `pedidos.rastreo`); el mail "en camino" lo lleva. Cadetería: mail de siempre. Entregado **no** manda mail (el usuario lo quiere así).
- Mails: la entrega se escribe "Retiro / Cadetería / Interior". "(el envío se coordina aparte)" sigue en los mails: el usuario pidió solo ortografía, no sacarlo.
- Botón de compra: rosado claro mientras falta algo, rosa oscuro (`.listo`) cuando se puede seguir, también "Finalizar compra" (carrito) y "Confirmar pedido". El botón del carrito dice "Finalizar compra".
- Checkout interior: texto dentro del recuadro "Dirección" (domicilio) / "Departamento, Localidad" (agencia).
- Métricas al 2026-11-02: 1.916 visitas → 57 carrito → 42 checkout → 9 pedidos (21%) → 6 pagos; checkout → pedido empeoró. Se agregó evento **`checkout_error`** (campo que falta o mensaje del servidor) y la lista "Errores al confirmar el pedido" en el Resumen. **Pendiente:** que el usuario haga una compra de prueba real en producción desde el celular (las 3 entregas).
- Los mails enviados se ven en el panel de Resend (no hay registro en el admin; el usuario no lo pidió todavía).
- Vencimiento de pedidos sin pagar: **18:00 hora de Uruguay del día siguiente al pedido**, cualquier medio de pago; se guarda en `pedidos.vence` al crear (`venceNormal`, migración 12). "Reclamar pago" da 4 h desde el mail pero **nunca acorta** el plazo (`GREATEST`). **Pendiente:** la pregunta frecuente "¿Cómo compro?" dice "2 horas" (no tocar sin que lo pidan).
- "Reclamar pago" (admin → Pedidos): pendientes manuales sin comprobante y también **pagados** (vuelve a pendiente y se saca el comprobante; el archivo queda).
- **Carrito abandonado por mail** (`abandonos.ts`, migración 10): se guarda al escribir el email en el checkout; a las **24 h** sin pedido sale "Te falta solo el último paso 💛" con fotos y link que restaura el carrito (utm `mail`/`carrito-abandonado`). **Una vez por carrito** (si cambia, es otro). Sin nombre del bebé ni estampado.
- Checkout: sin "El envío se coordina aparte…"; interior elige **Agencia DAC** / **A domicilio** (se guarda "Agencia DAC: …" en la dirección). El usuario **no quiere** WhatsApp ni precios de envío en el checkout.
- Recargo de Mercado Pago configurable en admin → Ajustes (por defecto 10%); las preguntas frecuentes no lo mencionan.
- **Pendiente (seguridad, 2026-10-28, sin aplicar):** backups de Postgres; `npm audit fix` (body-parser); aviso por mail al cambiar datos bancarios/recargo y login del admin; 2FA del admin; backup del bucket; Cloudflare + `TRUST_PROXY`; CSP; no poner el nombre libre en los mails; captcha contra pedidos falsos.

