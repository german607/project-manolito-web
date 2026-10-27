// SessionStart: borra de .claude/memory.md los días (## AAAA-MM-DD) con más de DIAS días de antigüedad
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIAS = 4;
const archivo = fileURLToPath(new URL('../memory.md', import.meta.url));
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' }); // AAAA-MM-DD
const limite = new Date(Date.parse(hoy) - DIAS * 86_400_000).toISOString().slice(0, 10);

const texto = readFileSync(archivo, 'utf8');
const [cabecera, ...dias] = texto.split(/^(?=## \d{4}-\d{2}-\d{2})/m);
const quedan = dias.filter(d => d.slice(3, 13) >= limite);
if (quedan.length !== dias.length) {
  writeFileSync(archivo, cabecera + quedan.join(''));
  console.log(`Memoria: se borraron ${dias.length - quedan.length} día(s) anteriores a ${limite}.`);
}
