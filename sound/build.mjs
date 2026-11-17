// Genera la librería propia a WAV y su manifiesto (clave, función, sha256, duración y licencia).
// Uso:  node sound/build.mjs <carpeta de salida>
// El manifiesto es lo que se guarda como dato junto a cada archivo: `license: 'propia'`, sin atribución.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { RATE, wav } from './synth.mjs';
import { LIBRARY, RECIPE_VERSION, renderSound } from './library.mjs';

const out = process.argv[2];
if (!out) { console.error('uso: node sound/build.mjs <carpeta>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const manifest = [];
for (const s of LIBRARY) {
  const [l, r] = renderSound(s.key);
  const bytes = wav(l, r);
  const file = `${s.key}.wav`;
  writeFileSync(join(out, file), bytes);
  manifest.push({ key: s.key, fn: s.fn, description: s.description, file,
    sha256: createHash('sha256').update(bytes).digest('hex'), duration_ms: Math.round(l.length / RATE * 1000),
    license: 'propia', attribution: null, source: `voicelab/sound/library.mjs@v${RECIPE_VERSION}` });
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ recipe_version: RECIPE_VERSION, rate: RATE, sounds: manifest }, null, 2) + '\n');
console.log(manifest.map((m) => `${m.key}  ${m.duration_ms} ms  ${m.sha256.slice(0, 12)}`).join('\n'));
