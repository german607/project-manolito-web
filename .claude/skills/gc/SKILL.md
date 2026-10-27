---
name: gc
description: Garbage collector de la conversación. Resume lo importante de los últimos prompts (hasta 15) en .claude/memory.md, borra los días viejos y deja todo listo para limpiar el contexto con /clear. Usalo cuando el hook avise "[gc]", cuando el usuario escriba /gc, o cuando la conversación se haga larga.
---

# gc — resumir y liberar contexto

Objetivo: que después de un `/clear` no se pierda nada importante. La memoria vive en `.claude/memory.md`
(la carga `CLAUDE.md` en cada sesión) y solo guarda los últimos 4 días.

## Pasos

1. **Tomá los prompts desde el último resumen** (como máximo los últimos 15) y lo que se hizo en cada uno.
2. **Quedate solo con lo importante:**
   - cambios hechos (qué y en qué archivo o pantalla, en una línea);
   - decisiones y preferencias del usuario ("no tocar X", "siempre Y");
   - pendientes o cosas a medio hacer, marcadas con **Pendiente:**;
   - datos que costó averiguar (causas de errores, pasos en paneles externos).

   Descartá: pruebas que salieron bien, capturas, comandos, explicaciones, y lo que ya está en el código o en git.
3. **Escribí en `.claude/memory.md`** bajo `## AAAA-MM-DD` con la fecha de hoy (hora de Uruguay: `TZ=America/Montevideo date +%F`):
   - si el día ya existe, sumá las viñetas ahí (sin repetir; si algo cambió, reemplazá la viñeta vieja);
   - si no, creá el bloque arriba de todo, debajo de la cabecera;
   - viñetas cortas, en español, una idea por viñeta.
4. **Reglas que tienen que durar más de 4 días** (convenciones, "nunca hagas X"): no van en la memoria. Proponé
   agregarlas a `CLAUDE.md` y hacelo solo si el usuario dice que sí.
5. **Borrá los días viejos:** `node .claude/hooks/podar-memoria.mjs`.
6. **Cerrá con un mensaje corto:** qué guardaste (2–4 viñetas) y pedile al usuario que ejecute **`/clear`**.
   Claude no puede limpiar el contexto por sí mismo; `/clear` lo hace y en la sesión nueva la memoria se carga sola.
   Si el usuario prefiere conservar un resumen automático de la conversación, puede usar `/compact` en lugar de `/clear`.

## Ajustes

En `.claude/settings.json` → `env`:
- `GC_PROMPTS`: cada cuántos prompts avisa el hook (15).
- `GC_PORCENTAJE`: porcentaje de contexto usado que dispara el aviso (50).
- `GC_CONTEXTO_MAX`: tamaño de la ventana de contexto del modelo en tokens (1.000.000; 200.000 para modelos con ventana estándar).
