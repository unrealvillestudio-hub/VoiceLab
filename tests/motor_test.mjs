// MOTOR DE VOICELAB — contrato, consentimiento, presets por dato y marca N+1 (docs/CONTRACT.md v1).
//
// Ejecuta `api/execute.ts` TAL COMO SE DESPLIEGA (Node ≥ 22.18, type-stripping nativo) con un `fetch`
// de fixture: ni red, ni credenciales, ni proveedor real. Lo único que se sustituye es `fetch` y las
// variables de entorno.
// Ejecutar:  node tests/motor_test.mjs

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'api', 'execute.ts'), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'voicelab-'));
const file = join(dir, 'execute.mts');
writeFileSync(file, SRC, 'utf8');
process.env.SUPABASE_URL = 'https://db.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
process.env.ELEVENLABS_API_KEY = 'x';
const M = await import(pathToFileURL(file).href);

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// MP3 sintético: N tramas MPEG-1 Layer III, 128 kbps, 44.1 kHz (417 bytes c/u, 1152 muestras).
function mp3(frames) {
  const len = 417, b = new Uint8Array(frames * len);
  for (let f = 0; f < frames; f++) { b[f * len] = 0xff; b[f * len + 1] = 0xfb; b[f * len + 2] = 0x90; b[f * len + 3] = 0x64; }
  return b;
}
const AUDIO = mp3(100); // 100 × 1152 / 44100 = 2612 ms

function world(over = {}) {
  return {
    person_blueprints: [
      { id: U(1), brand_id: 'MarcaA', voicelab_ref: U(11) },   // persona real con consentimiento
      { id: U(2), brand_id: 'MarcaA', voicelab_ref: U(12) },   // persona real sin consentimiento
      { id: U(3), brand_id: 'MarcaB', voicelab_ref: U(13) },   // avatar sintético
      { id: U(4), brand_id: 'MarcaA', voicelab_ref: null },    // sin voz
      { id: U(5), brand_id: 'MarcaA', voicelab_ref: U(15) },   // voz TBD
      { id: U(6), brand_id: 'MarcaA', voicelab_ref: U(16) },   // voz sin tipo declarado
    ],
    voicelab_params: [
      { id: U(11), voice_id: 'vid-real-1', voice_kind: 'clone', stability: 0.5, clarity: 0.8, style_exaggeration: 0.1, speed: 1.0, format_default: 'mp3_44100_128' },
      { id: U(12), voice_id: 'vid-real-2', voice_kind: 'clone' },
      { id: U(13), voice_id: 'vid-sint-3', voice_kind: 'synthetic', stability: 0.4 },
      { id: U(15), voice_id: 'TBD_algo', voice_kind: 'synthetic' },
      { id: U(16), voice_id: 'vid-x', voice_kind: null },
    ],
    person_consents: [
      { id: U(21), person_blueprint_id: U(1), scope: 'voice', authorized: true, revoked_at: null },
      { id: U(22), person_blueprint_id: U(2), scope: 'image', authorized: true, revoked_at: null },
    ],
    ops_lab_models: [
      { lab: 'voicelab', role: 'tts', active: true, model_id: 'modelo-voz-dato', provider: 'p', generation_params: { max_chars: 200 } },
      { lab: 'voicelab', role: 'music', active: true, model_id: 'modelo-musica-dato', provider: 'p', generation_params: {} },
    ],
    ops_lab_rates: [
      { id: U(31), lab: 'voicelab', model_id: 'modelo-voz-dato', unit_type: 'per_1k_chars', rate_usd: 0.5, service_id: 'svc', status: 'vigente', active: true },
      { id: U(32), lab: 'voicelab', model_id: 'modelo-musica-dato', unit_type: 'per_second', rate_usd: 0.01, service_id: 'svc', status: 'vigente', active: true },
    ],
    voicelab_music_presets: [{ id: U(41), brand_id: 'MarcaB', name: 'base', style_prompt: 'calm piano', duration_s: 20, instrumental: true, active: true }],
    voicelab_music_bank: [{ id: U(51), brand_id: 'MarcaB', preset_id: U(41), storage_path: 'voicelab/MarcaB/x.mp3', duration_ms: 20000, model_id: 'modelo-musica-dato', uses: 2, loudness_lufs: null }],
    ...over,
  };
}

// PostgREST mínimo: filtros eq / is.true / is.null / in.(…) sobre las filas del mundo.
function filterRows(rows, params) {
  return rows.filter(r => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit'].includes(k)) continue;
      const col = r[k];
      if (v.startsWith('eq.')) { if (String(col) !== decodeURIComponent(v.slice(3))) return false; }
      else if (v === 'is.true') { if (col === false) return false; }
      else if (v === 'is.null') { if (col != null) return false; }
      else if (v.startsWith('in.(')) { if (!v.slice(4, -1).split(',').includes(String(col))) return false; }
      else if (v.startsWith('lte.')) { /* fechas: todas vigentes en el fixture */ }
    }
    return true;
  });
}

async function call(body, { w = world(), providerStatus = 200 } = {}) {
  const log = { provider: [], uploads: [], ledger: [], jobs: [], patches: [] };
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://api.elevenlabs.io/')) {
      if (u.endsWith('/v1/user/subscription')) return new Response(JSON.stringify({ tier: 'starter' }), { status: 200 });
      log.provider.push({ url: u, body: JSON.parse(init.body) });
      if (providerStatus !== 200) return new Response('{"detail":"boom"}', { status: providerStatus });
      if (u.includes('/text-to-speech/')) {
        const text = JSON.parse(init.body).text;
        const chars = [...text];
        return new Response(JSON.stringify({
          audio_base64: Buffer.from(AUDIO).toString('base64'),
          alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.05), character_end_times_seconds: chars.map((_, i) => i * 0.05 + 0.05) },
        }), { status: 200 });
      }
      return new Response(AUDIO, { status: 200 });
    }
    if (u.includes('/storage/v1/object/')) { log.uploads.push(u); return new Response('{}', { status: 200 }); }
    const m = u.match(/\/rest\/v1\/([^?]+)\??(.*)$/);
    if (!m) throw new Error('fetch inesperado: ' + u);
    const [, table, qs] = m;
    const params = new URLSearchParams(qs);
    const method = init.method ?? 'GET';
    if (table === 'rpc/ops_resolve_rate') {
      const a = JSON.parse(init.body);
      const r = (w.ops_lab_rates ?? []).find(x => x.lab === a.p_lab && x.model_id === a.p_model_id && x.unit_type === a.p_unit_type && x.status === 'vigente' && x.active !== false);
      return new Response(JSON.stringify(r ? [{ rate_usd: r.rate_usd, rate_id: r.id, effective_from: '2026-11-07' }] : [{ rate_usd: null, rate_id: null, effective_from: null }]), { status: 200 });
    }
    if (table === 'ops_lab_rates') throw new Error('el motor no debe leer ops_lab_rates directamente (42501 en producción)');
    if (table === 'rpc/ops_log_generation') {
      const b = JSON.parse(init.body);
      // Los 11 parámetros sin defecto de la función real: si falta uno, PostgREST no la encuentra (PGRST202).
      for (const k of ['p_lab','p_brand_id','p_job_id','p_piece_id','p_output_type','p_platform','p_provider','p_model_id','p_unit_type','p_input_units','p_output_units'])
        if (!(k in b)) return new Response(JSON.stringify({ code: 'PGRST202', message: `falta ${k}` }), { status: 404 });
      log.ledger.push(b); return new Response(JSON.stringify(U(99)), { status: 200 }); }
    if (table === 'lab_jobs' && method === 'POST') { log.jobs.push(JSON.parse(init.body)); return new Response(JSON.stringify([{ id: U(90) }]), { status: 201 }); }
    if (method === 'PATCH') { log.patches.push({ table, body: JSON.parse(init.body) }); return new Response(null, { status: 204 }); }
    if (method === 'POST') { log.patches.push({ table, body: JSON.parse(init.body) }); return new Response('', { status: 201 }); }
    return new Response(JSON.stringify(filterRows(w[table] ?? [], params)), { status: 200 });
  };
  let status = 0, json = null;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; } };
  try { await M.default({ method: 'POST', body }, res); } finally { globalThis.fetch = real; }
  return { status, json, log };
}

const voice = (params, brandId = 'MarcaA', extra = {}) => ({ brandId, stage: { mode: 'voice' }, params, previousOutputs: {}, ...extra });
const casos = [];
const test = (n, f) => casos.push([n, f]);

// ── Contrato ─────────────────────────────────────────────────────────────────────────────────────
test('400 INVALID_REQUEST sin brandId, sin modo o sin guion; sin tocar la base', async () => {
  for (const b of [{}, { brandId: 'X', stage: { mode: 'otro' } }, voice({ language: 'es' }), voice({ script: 'hola', language: 'es' })]) {
    const r = await call(b);
    assert.equal(r.status, 400); assert.equal(r.json.error_label, 'INVALID_REQUEST');
    assert.equal(r.log.jobs.length, 0); assert.equal(r.log.provider.length, 0);
  }
});

test('voz: 200 con la forma del contrato §4 y fila en lab_jobs', async () => {
  const r = await call(voice({ script: 'Hola mundo', language: 'es-PA', person_id: U(1) }, 'MarcaA', { parent_job_id: U(80) }));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const j = r.json;
  for (const k of ['success', 'job_id', 'mode', 'audio_url', 'storage_path', 'format', 'duration_ms', 'alignment', 'voice', 'music', 'model_id', 'cost_usd', 'ledger_id']) assert.ok(k in j, k);
  assert.equal(j.job_id, U(90)); assert.equal(j.mode, 'voice'); assert.equal(j.music, null);
  assert.equal(j.storage_path, `voicelab/MarcaA/${U(90)}.mp3`);
  assert.ok(j.audio_url.endsWith(`/storage/v1/object/public/unrlvl-media/voicelab/MarcaA/${U(90)}.mp3`));
  assert.equal(j.duration_ms, 2612);
  assert.deepEqual(j.alignment.words.map(x => x.text), ['Hola', 'mundo']);
  assert.equal(j.voice.consent_ref, U(21)); assert.equal(j.voice.kind, 'clone');
  assert.equal(r.log.jobs[0].lab, 'voicelab'); assert.equal(r.log.jobs[0].parent_job_id, U(80));
  assert.ok(r.log.patches.some(p => p.table.startsWith('lab_jobs') && p.body.status === 'completed'));
});

test('el guion viaja literal al proveedor (sin recortar ni normalizar)', async () => {
  const script = '  Hola,   Sam…  ¿todo bien?  ';
  const r = await call(voice({ script, language: 'es', person_id: U(1) }));
  assert.equal(r.status, 200); assert.equal(r.log.provider[0].body.text, script);
});

test('SCRIPT_TOO_LONG por el límite del dato, sin llamar al proveedor', async () => {
  const r = await call(voice({ script: 'a'.repeat(201), language: 'es', person_id: U(1) }));
  assert.equal(r.status, 400); assert.equal(r.json.error_label, 'SCRIPT_TOO_LONG'); assert.equal(r.log.provider.length, 0);
});

// ── Consentimiento ───────────────────────────────────────────────────────────────────────────────
test('403 VOICE_NOT_AUTHORIZED: clon sin consentimiento de voz (aunque tenga el de imagen), sin proveedor ni libro', async () => {
  const r = await call(voice({ script: 'hola', language: 'es', person_id: U(2) }));
  assert.equal(r.status, 403); assert.equal(r.json.error_label, 'VOICE_NOT_AUTHORIZED');
  assert.equal(r.log.provider.length, 0); assert.equal(r.log.ledger.length, 0);
  assert.ok(r.log.patches.some(p => p.body.status === 'failed'));
});

test('consentimiento revocado no autoriza', async () => {
  const w = world(); w.person_consents[0].revoked_at = '2026-11-07T00:00:00Z';
  const r = await call(voice({ script: 'hola', language: 'es', person_id: U(1) }), { w });
  assert.equal(r.status, 403); assert.equal(r.log.provider.length, 0);
});

test('voice_ref explícito de un clon también exige consentimiento', async () => {
  const r = await call(voice({ script: 'hola', language: 'es', voice_ref: U(12) }));
  assert.equal(r.status, 403); assert.equal(r.log.provider.length, 0);
});

test('404 VOICE_NOT_ASSIGNED: sin voz, voz TBD o tipo no declarado (falla cerrado)', async () => {
  for (const pid of [U(4), U(5), U(6)]) {
    const r = await call(voice({ script: 'hola', language: 'es', person_id: pid }));
    assert.equal(r.status, 404, pid); assert.equal(r.json.error_label, 'VOICE_NOT_ASSIGNED'); assert.equal(r.log.provider.length, 0);
  }
});

// ── Presets y modelo por dato ────────────────────────────────────────────────────────────────────
test('ajustes de voz, modelo e idioma salen del dato', async () => {
  const r = await call(voice({ script: 'hola', language: 'es-PA', person_id: U(1) }));
  const p = r.log.provider[0];
  assert.ok(p.url.includes('/text-to-speech/vid-real-1/with-timestamps'));
  assert.equal(p.body.model_id, 'modelo-voz-dato'); assert.equal(p.body.language_code, 'es');
  assert.deepEqual(p.body.voice_settings, { stability: 0.5, similarity_boost: 0.8, style: 0.1, speed: 1 });
});

test('422 MODEL_NOT_CONFIGURED y RATE_NOT_CONFIGURED sin llamar al proveedor', async () => {
  let r = await call(voice({ script: 'hola', language: 'es', person_id: U(1) }), { w: world({ ops_lab_models: [] }) });
  assert.equal(r.json.error_label, 'MODEL_NOT_CONFIGURED'); assert.equal(r.log.provider.length, 0);
  r = await call(voice({ script: 'hola', language: 'es', person_id: U(1) }), { w: world({ ops_lab_rates: [] }) });
  assert.equal(r.json.error_label, 'RATE_NOT_CONFIGURED'); assert.equal(r.log.provider.length, 0);
});

// ── Libro ────────────────────────────────────────────────────────────────────────────────────────
test('libro: unidades por 1.000 caracteres y costo de la tarifa del dato', async () => {
  const r = await call(voice({ script: 'x'.repeat(150), language: 'es', person_id: U(1) }));
  assert.equal(r.log.ledger.length, 1);
  const l = r.log.ledger[0];
  assert.equal(l.p_lab, 'voicelab'); assert.equal(l.p_unit_type, 'per_1k_chars'); assert.equal(l.p_output_units, 0.15);
  assert.equal(l.p_voice_id, 'vid-real-1'); assert.equal(l.p_job_id, U(90)); assert.equal(l.p_cost_usd, undefined);
  assert.equal(r.json.cost_usd, 0.075); assert.equal(r.json.ledger_id, U(99));
});

test('ledger_by_caller: VoiceLab no asienta', async () => {
  const r = await call(voice({ script: 'hola', language: 'es', person_id: U(1) }, 'MarcaA', { ledger_by_caller: true }));
  assert.equal(r.status, 200); assert.equal(r.log.ledger.length, 0); assert.equal(r.json.ledger_id, null);
});

test('fallo del proveedor: 502 PROVIDER_ERROR y asiento NOT_BILLED', async () => {
  const r = await call(voice({ script: 'hola', language: 'es', person_id: U(1) }), { providerStatus: 500 });
  assert.equal(r.status, 502); assert.equal(r.json.error_label, 'PROVIDER_ERROR');
  assert.equal(r.log.ledger[0].p_status, 'error'); assert.ok(r.log.ledger[0].p_rate_source.startsWith('NOT_BILLED:'));
});

// ── Música ───────────────────────────────────────────────────────────────────────────────────────
const music = (params, brandId = 'MarcaB') => ({ brandId, stage: { mode: 'music' }, params, previousOutputs: {} });

test('música desde el banco: sin proveedor, rota la pista menos usada', async () => {
  const r = await call(music({}));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.music.origin, 'bank'); assert.equal(r.json.voice, null); assert.equal(r.log.provider.length, 0);
  assert.deepEqual(r.json.music.license, { provider: 'elevenlabs', plan: 'starter', commercial: true });
  assert.ok(r.log.patches.some(p => p.table.startsWith('voicelab_music_bank') && p.body.uses === 3));
});

test('música generada: estilo y duración del preset, banco y libro por segundo', async () => {
  const r = await call(music({ source: 'generate' }));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const p = r.log.provider[0];
  assert.equal(p.body.prompt, 'calm piano'); assert.equal(p.body.music_length_ms, 20000); assert.equal(p.body.force_instrumental, true);
  assert.equal(p.body.model_id, 'modelo-musica-dato');
  assert.ok(r.log.patches.some(x => x.table === 'voicelab_music_bank' && x.body.preset_id === U(41)));
  assert.equal(r.log.ledger[0].p_unit_type, 'per_second'); assert.equal(r.log.ledger[0].p_output_units, 2.612);
});

test('404 PRESET_NOT_FOUND y MUSIC_BANK_EMPTY', async () => {
  let r = await call(music({}, 'MarcaSinPreset'));
  assert.equal(r.json.error_label, 'PRESET_NOT_FOUND');
  r = await call(music({}), { w: world({ voicelab_music_bank: [] }) });
  assert.equal(r.json.error_label, 'MUSIC_BANK_EMPTY');
});

// ── Marca N+1 ────────────────────────────────────────────────────────────────────────────────────
test('N+1: otra marca, otro idioma y otro modelo funcionan sólo con filas nuevas', async () => {
  const w = world();
  w.person_blueprints.push({ id: U(7), brand_id: 'MarcaNueva', voicelab_ref: U(17) });
  w.voicelab_params.push({ id: U(17), voice_id: 'vid-nueva', voice_kind: 'synthetic' });
  w.ops_lab_models[0] = { ...w.ops_lab_models[0], model_id: 'otro-modelo' };
  w.ops_lab_rates.push({ id: U(33), lab: 'voicelab', model_id: 'otro-modelo', unit_type: 'per_1k_chars', rate_usd: 0.2, service_id: 'svc', status: 'vigente', active: true });
  const r = await call(voice({ script: 'Guten Tag', language: 'de-DE', person_id: U(7) }, 'MarcaNueva'), { w });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.log.provider[0].body.model_id, 'otro-modelo'); assert.equal(r.log.provider[0].body.language_code, 'de');
  assert.equal(r.json.storage_path, `voicelab/MarcaNueva/${U(90)}.mp3`);
});


test('una voz con modelo propio (voicelab_params.model_id) lo usa y exige su tarifa', async () => {
  const w = world();
  w.voicelab_params[2] = { ...w.voicelab_params[2], model_id: 'modelo-propio' };
  let r = await call(voice({ script: 'hola', language: 'en', person_id: U(3) }, 'MarcaB'), { w });
  assert.equal(r.json.error_label, 'RATE_NOT_CONFIGURED'); assert.equal(r.log.provider.length, 0);
  w.ops_lab_rates.push({ id: U(34), lab: 'voicelab', model_id: 'modelo-propio', unit_type: 'per_1k_chars', rate_usd: 0.3, service_id: 'svc', status: 'vigente', active: true });
  r = await call(voice({ script: 'hola', language: 'en', person_id: U(3) }, 'MarcaB'), { w });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.log.provider[0].body.model_id, 'modelo-propio'); assert.equal(r.json.model_id, 'modelo-propio');
  r = await call(voice({ script: 'hola', language: 'es', person_id: U(1) }));
  assert.equal(r.log.provider[0].body.model_id, 'modelo-voz-dato');
});

// ── Puros ────────────────────────────────────────────────────────────────────────────────────────
test('mp3DurationMs mide tramas y salta ID3', () => {
  assert.equal(M.mp3DurationMs(mp3(100)), 2612);
  const id3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 10, ...new Array(10).fill(0)]);
  const both = new Uint8Array(id3.length + 417 * 10); both.set(id3); both.set(mp3(10), id3.length);
  assert.equal(M.mp3DurationMs(both), 261);
  assert.equal(M.mp3DurationMs(new Uint8Array(50)), null);
});

let ok = 0;
for (const [n, f] of casos) {
  try { await f(); console.log('  ok ', n); ok++; }
  catch (e) { console.log('  FALLA', n, '\n   ', e.message); }
}
console.log(`\nmotor: ${ok}/${casos.length}`);
if (ok !== casos.length) process.exit(1);
