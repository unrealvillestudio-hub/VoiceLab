// LIBRERÍA PROPIA DE SONIDOS (F0, 2026-11-17): determinista, nombrada por función y sin marcas.
// Ejecutar:  node tests/sonido_test.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { RATE, seeded, wav } from '../sound/synth.mjs';
import { LIBRARY, renderSound } from '../sound/library.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fallos = 0;
const caso = (n, fn) => { try { fn(); console.log(`  ok  ${n}`); } catch (e) { fallos++; console.error(`  MAL ${n}\n      ${e.message}`); } };
console.log('librería de sonidos — propia y determinista');

const sha = (key) => { const [l, r] = renderSound(key); return createHash('sha256').update(wav(l, r)).digest('hex'); };

caso('el ruido con semilla es el mismo en cada corrida', () => {
  const a = seeded(7), b = seeded(7);
  for (let i = 0; i < 1000; i++) assert.equal(a(), b());
});
caso('cada receta da el mismo WAV dos veces, sin recortar (pico ≤ 0 dBFS) y con sonido (no silencio)', () => {
  for (const s of LIBRARY) {
    assert.equal(sha(s.key), sha(s.key), s.key);
    const [l, r] = renderSound(s.key);
    let p = 0; for (let i = 0; i < l.length; i++) p = Math.max(p, Math.abs(l[i]), Math.abs(r[i]));
    assert.ok(p > 0.05 && p <= 1, `${s.key}: pico ${p}`);
  }
});
caso('el WAV es PCM 16 bits estéreo a 48 kHz', () => {
  const b = wav(new Float64Array(10));
  assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.readUInt16LE(22), 2); assert.equal(b.readUInt32LE(24), RATE); assert.equal(b.readUInt16LE(34), 16);
});
caso('claves por función (sfx_ o bed_), funciones conocidas y sin marcas', () => {
  const marcas = /neurone|nscf|forum|fphs|lucien|unrealville|unrlvl|vivose|vizos|diamond|ivette|patricia|irja|sam_moreno/i;
  const FN = ['block_entry', 'digit_land', 'impact', 'shot_cut', 'cta', 'word_pop', 'music_bed'];
  for (const s of LIBRARY) { assert.match(s.key, /^(sfx|bed)_[a-z_]+$/); assert.ok(FN.includes(s.fn), s.fn); }
  for (const f of ['sound/synth.mjs', 'sound/library.mjs', 'sound/build.mjs']) {
    assert.ok(!marcas.test(readFileSync(join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '')), `${f} nombra una marca`);
  }
});
caso('librería v2: 25 sonidos, cada función con variantes y 6 camas en bucle', () => {
  assert.equal(LIBRARY.length, 25);
  const por = LIBRARY.reduce((m, s) => ({ ...m, [s.fn]: (m[s.fn] ?? 0) + 1 }), {});
  for (const fn of ['block_entry', 'digit_land', 'impact', 'shot_cut', 'cta', 'word_pop']) assert.ok(por[fn] >= 2, `${fn}: ${por[fn]}`);
  assert.equal(por.music_bed, 6);
});
caso('la librería no descarga nada: ni fetch ni URLs en las recetas', () => {
  for (const f of ['sound/synth.mjs', 'sound/library.mjs']) assert.ok(!/fetch\(|https?:\/\//.test(readFileSync(join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '')), f);
});

if (fallos) { console.error(`\n${fallos} caso(s) MAL`); process.exit(1); }
console.log('\nsonido: todo en verde');
