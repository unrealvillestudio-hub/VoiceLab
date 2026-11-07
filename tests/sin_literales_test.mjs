// BARRERA: el motor de VoiceLab no lleva ids de modelo, precios ni marcas en el código
// (MULTIBRAND_RULE §1 y §11). Modelo → ops_lab_models; precio → ops_lab_rates; marca → el cuerpo.
// Se quitan los comentarios ANTES de buscar (CC_PROTOCOL §14.1).
// Ejecutar:  node tests/sin_literales_test.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVOS = ['api/execute.ts', 'api/jobs/[id].ts'];
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const PROHIBIDOS = [
  [/\beleven_[a-z0-9_]+\b/i, 'id de modelo de ElevenLabs'],
  [/\bmusic_v\d\b/i, 'id de modelo de música'],
  [/\bscribe_v\d\b/i, 'id de modelo de transcripción'],
  [/\b0\.0\d+\b(?![^']*')/, 'número con forma de tarifa'],
  [/\b(NeuroneSCF|ForumPHs|LucienSael|PatriciaOsorio\w*|IvetteFlores\w*|SamPublisher|UnrealvilleStudio|D7Herbal|DiamondDetails|VizosCosmetics|VivoseMask)\b/, 'id de marca'],
];

let fallos = 0;
for (const rel of ARCHIVOS) {
  const code = sinComentarios(readFileSync(join(ROOT, rel), 'utf8'));
  for (const [re, que] of PROHIBIDOS) {
    const m = code.match(re);
    if (m) { console.log(`  FALLA ${rel}: ${que} → «${m[0]}»`); fallos++; }
  }
}
console.log(fallos ? `sin_literales: ${fallos} en rojo` : 'sin_literales: todo en verde');
if (fallos) process.exit(1);
