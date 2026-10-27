// UserPromptSubmit: cuenta los prompts de la sesión y mide el contexto usado.
// Cada GC_PROMPTS prompts, o si el contexto pasa GC_PORCENTAJE % de GC_CONTEXTO_MAX, le pide a Claude correr el skill `gc`.
// Lo que se imprime acá Claude lo recibe como contexto junto con el prompt.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROMPTS = Number(process.env.GC_PROMPTS ?? 15);
const PORCENTAJE = Number(process.env.GC_PORCENTAJE ?? 50);
const CONTEXTO_MAX = Number(process.env.GC_CONTEXTO_MAX ?? 200_000);
const ESTADO = fileURLToPath(new URL('../.gc-estado.json', import.meta.url)); // en .gitignore

const entrada = JSON.parse(readFileSync(0, 'utf8') || '{}');
const estado = existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, 'utf8')) : {};
const s = (estado[entrada.session_id] ??= { prompts: 0, ultimoAviso: 0 });
s.prompts++;

// Contexto actual = tokens de entrada de la última respuesta (incluye lo cacheado)
let usados = 0;
try {
  const lineas = readFileSync(entrada.transcript_path, 'utf8').trim().split('\n');
  for (let i = lineas.length - 1; i >= 0 && !usados; i--) {
    const u = JSON.parse(lineas[i]).message?.usage;
    if (u) usados = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  }
} catch { /* sin transcript todavía */ }
const pct = Math.round((usados / CONTEXTO_MAX) * 100);

const desdeAviso = s.prompts - s.ultimoAviso;
const porPrompts = desdeAviso >= PROMPTS;
const porContexto = pct >= PORCENTAJE && (s.ultimoAviso === 0 || desdeAviso >= 5); // después del primer aviso, no insistir en cada prompt
if (porPrompts || porContexto) {
  s.ultimoAviso = s.prompts;
  console.log(`[gc] ${porPrompts ? `Van ${desdeAviso} prompts desde el último resumen` : `El contexto está al ${pct}% (${usados} tokens)`}. ` +
    'Después de responder lo que pide el usuario, corré el skill `gc`: resumí lo importante en .claude/memory.md ' +
    'y pedile al usuario que ejecute /clear para liberar el contexto.');
}
writeFileSync(ESTADO, JSON.stringify(estado));
