// Genera la librería propia a WAV y su manifiesto (clave, función, sha256, duración y licencia).
// Uso:  node sound/build.mjs <carpeta de salida>
// El manifiesto es lo que se guarda como dato junto a cada archivo: `license: 'propia'`, sin atribución.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { RATE, wav } from './synth.mjs';
import { LIBRARY, RECIPE_VERSION, renderSound } from './library.mjs';

const out = process.argv[2];
if (!out) { console.error('uso: node sound/build.mjs <carpeta>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const manifest = [];
/** Sonoridad integrada (LUFS) con ffmpeg si está; null si no (dato informativo para el preset de sonido). */
function loudness(path) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-']);
  const m = r.status === 0 ? String(r.stderr).slice(String(r.stderr).lastIndexOf('Summary:')).match(/I:\s+(-?[\d.]+) LUFS/) : null;
  // La norma no mide por debajo de 0,4 s: ahí ffmpeg da −70, que no es una sonoridad. Se guarda null.
  return m && Number(m[1]) > -69 ? Number(m[1]) : null;
}
for (const s of LIBRARY) {
  const [l, r] = renderSound(s.key);
  const bytes = wav(l, r);
  const file = `${s.key}.wav`;
  writeFileSync(join(out, file), bytes);
  manifest.push({ key: s.key, fn: s.fn, description: s.description, file,
    sha256: createHash('sha256').update(bytes).digest('hex'), duration_ms: Math.round(l.length / RATE * 1000),
    loudness_lufs: loudness(join(out, file)),
    storage_path: `voicelab/sound-library/v${RECIPE_VERSION}/${file}`,
    license: 'propia', attribution: null, source: `voicelab/sound/library.mjs@v${RECIPE_VERSION}` });
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ recipe_version: RECIPE_VERSION, rate: RATE, sounds: manifest }, null, 2) + '\n');
console.log(manifest.map((m) => `${m.key}  ${m.duration_ms} ms  ${m.sha256.slice(0, 12)}`).join('\n'));
