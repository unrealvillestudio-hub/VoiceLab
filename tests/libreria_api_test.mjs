// GET /api/sound-library (sonido F2, 2026-11-17): la librería que ve una marca, para escuchar y elegir.
// Ejecutar:  node tests/libreria_api_test.mjs

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'voicelab-lib-'));
const file = join(dir, 'sound-library.mts');
writeFileSync(file, readFileSync(join(ROOT, 'api', 'sound-library.ts'), 'utf8'), 'utf8');
const M = await import(pathToFileURL(file).href);

let fallos = 0;
const caso = async (nombre, fn) => {
  try { await fn(); console.log(`  ok  ${nombre}`); } catch (e) { fallos++; console.log(`  FALLA ${nombre}: ${e.message}`); }
};

const MARCA = 'marca_prueba', OTRA = 'otra_marca', BASE = 'https://db.example.invalid';
const fila = (sound_key, fn, extra = {}) => ({ sound_key, fn, description: `d ${sound_key}`, duration_ms: 100, loudness_lufs: '-18.5',
  license: 'propia', attribution: null, storage_path: `voicelab/sound-library/v2/${sound_key}.wav`, sha256: 'a'.repeat(64), brand_id: null, active: true, ...extra });

await caso('lista sistema + marca, la marca gana, la otra marca no se ve, sin inactivos', () => {
  const rows = [
    fila('sfx_digit_tick', 'digit_land'),
    fila('bed_soft_pulse', 'music_bed'),
    fila('sfx_digit_tick', 'digit_land', { brand_id: MARCA, description: 'propio de la marca' }),
    fila('sfx_cut_swish', 'shot_cut', { brand_id: OTRA }),
    fila('sfx_word_pop', 'word_pop', { active: false }),
    fila('sfx_block_entry_whoosh', 'block_entry'),
  ];
  const out = M.libraryFromRows(rows, MARCA, BASE);
  assert.deepEqual(out.map((s) => s.sound_key), ['sfx_block_entry_whoosh', 'sfx_digit_tick', 'bed_soft_pulse']);
  const tick = out.find((s) => s.sound_key === 'sfx_digit_tick');
  assert.equal(tick.description, 'propio de la marca');
  assert.equal(tick.brand_id, MARCA);
  assert.equal(tick.url, `${BASE}/storage/v1/object/public/unrlvl-media/voicelab/sound-library/v2/sfx_digit_tick.wav`);
  assert.equal(tick.loudness_lufs, -18.5);
});

await caso('filtro por función', () => {
  const rows = [fila('sfx_digit_tick', 'digit_land'), fila('bed_soft_pulse', 'music_bed'), fila('bed_lofi_keys', 'music_bed')];
  assert.deepEqual(M.libraryFromRows(rows, MARCA, BASE, 'music_bed').map((s) => s.sound_key), ['bed_lofi_keys', 'bed_soft_pulse']);
});

await caso('consulta: falta brandId o fn desconocida → 400', () => {
  assert.throws(() => M.parseQuery({}), (e) => e.status === 400 && e.label === 'INVALID_REQUEST');
  assert.throws(() => M.parseQuery({ brandId: MARCA, fn: 'otra_cosa' }), (e) => e.status === 400);
  assert.deepEqual(M.parseQuery({ brandId: ` ${MARCA} `, fn: 'cta' }), { brandId: MARCA, fn: 'cta' });
});

await caso('handler: GET responde con la lista; POST es 405', async () => {
  process.env.SUPABASE_URL = BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  const orig = globalThis.fetch;
  let pedido = null;
  globalThis.fetch = async (u) => { pedido = String(u); return new Response(JSON.stringify([fila('sfx_cta_chime', 'cta')]), { status: 200 }); };
  const res = () => { const r = { code: 0, body: null, headers: {} };
    r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.end = () => r; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
  try {
    const r1 = res();
    await M.default({ method: 'GET', query: { brandId: MARCA } }, r1);
    assert.equal(r1.code, 200);
    assert.equal(r1.body.sounds[0].sound_key, 'sfx_cta_chime');
    assert.ok(pedido.includes('voicelab_sound_library?active=is.true'));
    assert.ok(pedido.includes(`brand_id.eq.${MARCA}`));
    const r2 = res();
    await M.default({ method: 'POST', query: {} }, r2);
    assert.equal(r2.code, 405);
  } finally { globalThis.fetch = orig; }
});

console.log(fallos ? `libreria_api: ${fallos} en rojo` : 'libreria_api: todo en verde');
if (fallos) process.exit(1);
