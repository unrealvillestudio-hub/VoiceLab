/**
 * api/execute.ts — motor de VoiceLab (contrato: docs/CONTRACT.md v1).
 *
 * POST /api/execute  { brandId, stage: { mode: 'voice' | 'music' }, params, previousOutputs, parent_job_id?, ledger_by_caller? }
 *
 * Todo lo que distingue una marca, una persona o un proveedor es DATO:
 *   voz y estilo → public.voicelab_params (vía person_blueprints.voicelab_ref)
 *   consentimiento → public.person_consents (scope = 'voice')
 *   modelo → public.ops_lab_models (lab = 'voicelab', role = 'tts' | 'music')
 *   tarifa → public.ops_lab_rates (el costo lo calcula ops_log_generation)
 *   música → public.voicelab_music_presets / public.voicelab_music_bank
 * En este archivo no hay ni un id de marca, ni un id de modelo, ni un precio.
 *
 * Variables de entorno (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY.
 */

export const config = { maxDuration: 300 };

// ── VOICELAB-CORE:BEGIN ── (puro: sin red ni entorno; lo extraen los tests)

export const LAB = 'voicelab';
export const STORAGE_BUCKET = 'unrlvl-media';
export const STORAGE_PREFIX = 'voicelab';
export const DEFAULT_FORMAT = 'mp3_44100_128';
export const MUSIC_MAX_SECONDS = 300;

export type Mode = 'voice' | 'music';

export class LabError extends Error {
  status: number; label: string; providerCalled: boolean;
  constructor(status: number, label: string, message: string, providerCalled = false) {
    super(message);
    this.status = status; this.label = label; this.providerCalled = providerCalled;
  }
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export interface VoiceRequest {
  mode: 'voice'; brandId: string; script: string; language: string;
  personId: string | null; voiceRef: string | null; preset: string | null; format: string | null;
  parentJobId: string | null; ledgerByCaller: boolean;
}
export interface MusicRequest {
  mode: 'music'; brandId: string; preset: string | null; durationS: number | null;
  source: 'bank' | 'generate'; instrumental: boolean; format: string | null;
  parentJobId: string | null; ledgerByCaller: boolean;
}
export type ParsedRequest = VoiceRequest | MusicRequest;

/** Valida el cuerpo del contrato §1–§3. Lanza LabError 400 INVALID_REQUEST; nunca llama a nadie. */
export function parseRequest(body: unknown): ParsedRequest {
  if (!isObj(body)) throw new LabError(400, 'INVALID_REQUEST', 'el cuerpo debe ser un objeto JSON');
  const params = isObj(body.params) ? body.params : {};
  const stage = isObj(body.stage) ? body.stage : {};
  const mode = str(stage.mode) ?? str(params.mode);
  const brandId = str(body.brandId);
  if (!brandId) throw new LabError(400, 'INVALID_REQUEST', 'falta brandId');
  if (mode !== 'voice' && mode !== 'music') throw new LabError(400, 'INVALID_REQUEST', "stage.mode debe ser 'voice' o 'music'");
  const parentJobId = body.parent_job_id == null ? null : (isUuid(body.parent_job_id) ? body.parent_job_id : null);
  if (body.parent_job_id != null && !parentJobId) throw new LabError(400, 'INVALID_REQUEST', 'parent_job_id no es un uuid');
  const ledgerByCaller = body.ledger_by_caller === true;
  const format = str(params.format);

  if (mode === 'voice') {
    if (typeof params.script !== 'string' || !params.script.trim()) throw new LabError(400, 'INVALID_REQUEST', 'falta params.script');
    const language = str(params.language);
    if (!language || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language)) throw new LabError(400, 'INVALID_REQUEST', 'params.language debe ser BCP-47');
    const personId = params.person_id == null ? null : params.person_id;
    const voiceRef = params.voice_ref == null ? null : params.voice_ref;
    if (personId != null && !isUuid(personId)) throw new LabError(400, 'INVALID_REQUEST', 'params.person_id no es un uuid');
    if (voiceRef != null && !isUuid(voiceRef)) throw new LabError(400, 'INVALID_REQUEST', 'params.voice_ref no es un uuid');
    if (!personId && !voiceRef) throw new LabError(400, 'INVALID_REQUEST', 'falta params.person_id o params.voice_ref');
    // El guion viaja LITERAL: no se recorta ni se normaliza (contrato §2).
    return { mode, brandId, script: params.script, language, personId, voiceRef, preset: str(params.preset), format, parentJobId, ledgerByCaller };
  }

  let durationS: number | null = null;
  if (params.duration_s != null) {
    const d = Number(params.duration_s);
    if (!Number.isFinite(d) || d <= 0 || d > MUSIC_MAX_SECONDS) throw new LabError(400, 'INVALID_REQUEST', `params.duration_s debe estar entre 1 y ${MUSIC_MAX_SECONDS}`);
    durationS = Math.round(d);
  }
  const source = params.source == null ? 'bank' : params.source;
  if (source !== 'bank' && source !== 'generate') throw new LabError(400, 'INVALID_REQUEST', "params.source debe ser 'bank' o 'generate'");
  const instrumental = params.instrumental == null ? true : params.instrumental === true;
  return { mode, brandId, preset: str(params.preset), durationS, source, instrumental, format, parentJobId, ledgerByCaller };
}

/** Consentimiento (contrato §2). Falla cerrado: un tipo de voz desconocido no pasa. */
export function consentDecision(
  voiceKind: string | null | undefined,
  consents: Array<{ id: string; authorized: boolean; revoked_at: string | null; scope: string }>,
): { ok: true; consentRef: string | null } | { ok: false; label: 'VOICE_NOT_AUTHORIZED' | 'VOICE_NOT_ASSIGNED' } {
  if (voiceKind === 'synthetic') return { ok: true, consentRef: null };
  if (voiceKind !== 'clone') return { ok: false, label: 'VOICE_NOT_ASSIGNED' };
  const vigente = consents.find(c => c.scope === 'voice' && c.authorized === true && !c.revoked_at);
  return vigente ? { ok: true, consentRef: vigente.id } : { ok: false, label: 'VOICE_NOT_AUTHORIZED' };
}

/** Una voz está asignada si tiene id de proveedor real (no el marcador TBD de la siembra antigua). */
export const voiceAssigned = (voiceId: unknown): voiceId is string =>
  typeof voiceId === 'string' && voiceId.trim() !== '' && !/^TBD/i.test(voiceId.trim());

/** Ajustes de voz desde voicelab_params (dato). Sólo se envían los que la fila define. */
export function voiceSettingsFrom(row: Record<string, any>): Record<string, number> {
  const out: Record<string, number> = {};
  const put = (k: string, v: unknown) => { const n = Number(v); if (v != null && Number.isFinite(n)) out[k] = n; };
  put('stability', row.stability);
  put('similarity_boost', row.clarity);
  put('style', row.style_exaggeration);
  put('speed', row.speed);
  return out;
}

/** Modelo efectivo de una voz: el propio de la voz si lo declara (voicelab_params.model_id), si no el del lab. */
export function modelForVoice<T extends { model_id: string }>(vp: Record<string, any>, labModel: T): T {
  const own = str(vp?.model_id);
  return own ? { ...labModel, model_id: own, generation_params: {} } : labModel;
}

/** Límite de caracteres del modelo, si el dato lo declara (ops_lab_models.generation_params.max_chars). */
export function scriptFits(script: string, generationParams: unknown): boolean {
  const max = isObj(generationParams) ? Number(generationParams.max_chars) : NaN;
  return !Number.isFinite(max) || max <= 0 || script.length <= max;
}

/** Marcas por carácter del proveedor → palabras con ms (contrato §4 `alignment`). */
export function wordsFromAlignment(al: unknown): Array<{ text: string; start_ms: number; end_ms: number }> {
  if (!isObj(al)) return [];
  const ch: string[] = Array.isArray(al.characters) ? al.characters : [];
  const st: number[] = Array.isArray(al.character_start_times_seconds) ? al.character_start_times_seconds : [];
  const en: number[] = Array.isArray(al.character_end_times_seconds) ? al.character_end_times_seconds : [];
  const words: Array<{ text: string; start_ms: number; end_ms: number }> = [];
  let cur: { text: string; start_ms: number; end_ms: number } | null = null;
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (/\s/.test(c)) { if (cur) { words.push(cur); cur = null; } continue; }
    const s = Math.round((st[i] ?? 0) * 1000), e = Math.round((en[i] ?? st[i] ?? 0) * 1000);
    if (!cur) cur = { text: c, start_ms: s, end_ms: e };
    else { cur.text += c; cur.end_ms = e; }
  }
  if (cur) words.push(cur);
  return words;
}

/** Duración real de un MP3 recorriendo sus tramas (MPEG-1/2/2.5 Layer III). Sin dependencias. */
export function mp3DurationMs(buf: Uint8Array): number | null {
  const BR = {
    v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  };
  const SR: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let i = 0;
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    i = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  }
  let samples = 0, rate = 0, frames = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3, layer = (buf[i + 1] >> 1) & 3;
    const bri = (buf[i + 2] >> 4) & 15, sri = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; }
    const kbps = (ver === 3 ? BR.v1 : BR.v2)[bri];
    const sr = SR[ver][sri];
    const spf = ver === 3 ? 1152 : 576;
    const len = Math.floor((spf / 8) * kbps * 1000 / sr) + pad;
    if (len <= 4) { i++; continue; }
    samples += spf; rate = sr; frames++; i += len;
  }
  return frames && rate ? Math.round(samples * 1000 / rate) : null;
}

/** Unidades del libro según la unidad de la tarifa (el precio lo pone la base). */
export function ledgerUnits(unitType: string, chars: number, seconds: number): number {
  if (unitType === 'per_1k_chars') return Math.round((chars / 1000) * 1e6) / 1e6;
  if (unitType === 'per_second') return Math.round(seconds * 1000) / 1000;
  throw new LabError(422, 'RATE_NOT_CONFIGURED', `unidad de tarifa no soportada por VoiceLab: ${unitType}`);
}

export const costOf = (units: number, rateUsd: number) => Math.round(units * rateUsd * 1e6) / 1e6;

export const storagePath = (brandId: string, jobId: string, ext = 'mp3') =>
  `${STORAGE_PREFIX}/${brandId.replace(/[^A-Za-z0-9_-]/g, '_')}/${jobId}.${ext}`;

export const extFor = (format: string) => (format.startsWith('pcm') || format.startsWith('wav') ? 'wav' : 'mp3');
export const mimeFor = (ext: string) => (ext === 'wav' ? 'audio/wav' : 'audio/mpeg');

/** Licencia de música según el plan del proveedor (contrato §4). Uso comercial desde el plan de pago. */
export const licenseFor = (tier: string | null) => ({ provider: 'elevenlabs', plan: tier, commercial: !!tier && tier !== 'free' });

// ── VOICELAB-CORE:END ──

// ── Red ──────────────────────────────────────────────────────────────────────────────────────────

const PROVIDER_BASE = 'https://api.elevenlabs.io';

function env() {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const xi = process.env.ELEVENLABS_API_KEY ?? '';
  if (!url || !key || !xi) throw new LabError(500, 'ENV_MISSING', 'faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o ELEVENLABS_API_KEY');
  return { url, key, xi };
}

type Env = ReturnType<typeof env>;

async function db(e: Env, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${e.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: e.key, Authorization: `Bearer ${e.key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const txt = await res.text();
  if (!res.ok) throw new LabError(502, 'DB_ERROR', `${path.split('?')[0]} ${res.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}
const q = encodeURIComponent;

async function activeModel(e: Env, role: string) {
  const rows = await db(e, `ops_lab_models?lab=eq.${LAB}&role=eq.${q(role)}&active=is.true&select=model_id,provider,generation_params&limit=1`);
  if (!rows?.length) throw new LabError(422, 'MODEL_NOT_CONFIGURED', `no hay modelo activo para ${LAB}/${role}`);
  return rows[0] as { model_id: string; provider: string; generation_params: any };
}

// La tarifa se lee con public.ops_resolve_rate (SECURITY DEFINER, ejecutable por service_role): la tabla
// ops_lab_rates no se abre a la llave de servicio (medido 2026-11-07: 42501 permission denied). Es la misma
// vía por la que el libro resuelve el precio, así que el costo que devuelve el lab y el del asiento coinciden.
async function activeRate(e: Env, modelId: string, unitType: string) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db(e, 'rpc/ops_resolve_rate', {
    method: 'POST', body: JSON.stringify({ p_lab: LAB, p_model_id: modelId, p_unit_type: unitType, p_at: today }),
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || row.rate_id == null || row.rate_usd == null) throw new LabError(422, 'RATE_NOT_CONFIGURED', `no hay tarifa vigente para ${modelId} (${unitType})`);
  return { id: String(row.rate_id), rate: Number(row.rate_usd), unitType };
}

async function upload(e: Env, path: string, bytes: Uint8Array, mime: string) {
  const res = await fetch(`${e.url}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: e.key, Authorization: `Bearer ${e.key}`, 'Content-Type': mime, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!res.ok) throw new LabError(502, 'STORAGE_ERROR', `subida ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `${e.url}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

async function ledger(e: Env, a: {
  brandId: string; jobId: string; outputType: string; modelId: string; unitType: string; units: number;
  status: string; durationMs: number; voiceId?: string | null; errorMsg?: string | null; rateSource?: string | null;
}): Promise<string | null> {
  try {
    const id = await db(e, 'rpc/ops_log_generation', {
      method: 'POST',
      body: JSON.stringify({
        p_lab: LAB, p_brand_id: a.brandId, p_job_id: a.jobId, p_output_type: a.outputType, p_provider: 'elevenlabs',
        p_model_id: a.modelId, p_unit_type: a.unitType, p_output_units: a.units,
        p_status: a.status, p_duration_ms: a.durationMs, p_voice_id: a.voiceId ?? null, p_source_app: LAB,
        p_error_msg: a.errorMsg ?? null, p_rate_source: a.rateSource ?? null,
      }),
    });
    return typeof id === 'string' ? id : null;
  } catch (err) {
    console.error(`[VoiceLab][LIBRO] asiento no escrito job=${a.jobId}: ${(err as Error).message}`);
    return null;
  }
}

async function provider(e: Env, path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${PROVIDER_BASE}${path}`, {
    method: 'POST', headers: { 'xi-api-key': e.xi, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    const label = res.status === 401 || res.status === 402 || /quota|credits/i.test(detail) ? 'PROVIDER_QUOTA' : 'PROVIDER_ERROR';
    throw new LabError(label === 'PROVIDER_QUOTA' ? 402 : 502, label, `ElevenLabs ${res.status}: ${detail}`, true);
  }
  return res;
}

async function subscriptionTier(e: Env): Promise<string | null> {
  try {
    const r = await fetch(`${PROVIDER_BASE}/v1/user/subscription`, { headers: { 'xi-api-key': e.xi } });
    return r.ok ? ((await r.json())?.tier ?? null) : null;
  } catch { return null; }
}

// ── Modos ────────────────────────────────────────────────────────────────────────────────────────

async function runVoice(e: Env, r: VoiceRequest, jobId: string, t0: number) {
  // 1 · Voz por dato
  let personIds: string[] = [];
  let voiceRef = r.voiceRef;
  if (r.personId) {
    const pb = await db(e, `person_blueprints?id=eq.${r.personId}&select=id,voicelab_ref`);
    if (!pb?.length) throw new LabError(404, 'VOICE_NOT_ASSIGNED', 'la persona no existe');
    personIds = [pb[0].id];
    voiceRef = voiceRef ?? pb[0].voicelab_ref;
  }
  if (!voiceRef) throw new LabError(404, 'VOICE_NOT_ASSIGNED', 'la persona no tiene voz asignada');
  const vp = (await db(e, `voicelab_params?id=eq.${voiceRef}&select=*`))?.[0];
  if (!vp || !voiceAssigned(vp.voice_id)) throw new LabError(404, 'VOICE_NOT_ASSIGNED', 'la voz no tiene id de proveedor');
  if (!personIds.length) personIds = ((await db(e, `person_blueprints?voicelab_ref=eq.${voiceRef}&select=id`)) ?? []).map((p: any) => p.id);

  // 2 · Consentimiento (antes de cualquier llamada al proveedor)
  const consents = personIds.length
    ? await db(e, `person_consents?person_blueprint_id=in.(${personIds.join(',')})&scope=eq.voice&select=id,authorized,revoked_at,scope`)
    : [];
  const c = consentDecision(vp.voice_kind, consents ?? []);
  if (!c.ok) throw new LabError(c.label === 'VOICE_NOT_AUTHORIZED' ? 403 : 404, c.label, c.label === 'VOICE_NOT_AUTHORIZED'
    ? 'voz de persona real sin consentimiento vigente' : 'la voz no declara si es clon o sintética');

  // 3 · Modelo, tarifa y límite por dato
  // Una voz puede declarar su propio modelo (voicelab_params.model_id): manda sobre el del lab.
  // Es dato, y su tarifa se exige igual que la del modelo del lab (sin tarifa → RATE_NOT_CONFIGURED).
  const labModel = await activeModel(e, 'tts');
  const model = modelForVoice(vp, labModel);
  const rate = await activeRate(e, model.model_id, 'per_1k_chars');
  if (!scriptFits(r.script, model.generation_params)) throw new LabError(400, 'SCRIPT_TOO_LONG', `el guion excede el límite de ${model.model_id}`);

  // 4 · Proveedor
  const format = r.format ?? vp.format_default ?? DEFAULT_FORMAT;
  const fmt = /^(mp3|pcm|wav)_/.test(format) ? format : DEFAULT_FORMAT;
  const lang = r.language.split('-')[0].toLowerCase();
  let out: any;
  try {
    const res = await provider(e, `/v1/text-to-speech/${encodeURIComponent(vp.voice_id)}/with-timestamps?output_format=${q(fmt)}`, {
      text: r.script, model_id: model.model_id, language_code: lang, voice_settings: voiceSettingsFrom(vp),
    });
    out = await res.json();
  } catch (err) {
    if (err instanceof LabError && err.providerCalled && !r.ledgerByCaller) {
      await ledger(e, { brandId: r.brandId, jobId, outputType: 'voice', modelId: model.model_id, unitType: rate.unitType, units: 0,
        status: 'error', durationMs: Date.now() - t0, voiceId: vp.voice_id, errorMsg: err.message,
        rateSource: `NOT_BILLED:${err.label}` });
    }
    throw err;
  }
  const bytes = Uint8Array.from(Buffer.from(String(out?.audio_base64 ?? ''), 'base64'));
  if (!bytes.length) throw new LabError(502, 'PROVIDER_ERROR', 'ElevenLabs no devolvió audio', true);
  const ext = extFor(fmt);
  const durationMs = ext === 'mp3' ? mp3DurationMs(bytes) : null;

  // 5 · Storage, libro y respuesta
  const path = storagePath(r.brandId, jobId, ext);
  const audioUrl = await upload(e, path, bytes, mimeFor(ext));
  const units = ledgerUnits(rate.unitType, r.script.length, 0);
  const ledgerId = r.ledgerByCaller ? null : await ledger(e, {
    brandId: r.brandId, jobId, outputType: 'voice', modelId: model.model_id, unitType: rate.unitType, units,
    status: 'success', durationMs: Date.now() - t0, voiceId: vp.voice_id,
  });
  return {
    success: true, job_id: jobId, mode: 'voice', audio_url: audioUrl, storage_path: path, format: fmt,
    duration_ms: durationMs, alignment: { words: wordsFromAlignment(out?.alignment) },
    voice: { voice_ref: vp.id, voice_id: vp.voice_id, person_id: r.personId, kind: vp.voice_kind, consent_ref: c.consentRef },
    music: null, model_id: model.model_id, cost_usd: costOf(units, rate.rate), ledger_id: ledgerId,
  };
}

async function runMusic(e: Env, r: MusicRequest, jobId: string, t0: number) {
  const presetFilter = r.preset ? `&name=eq.${q(r.preset)}` : '';
  const preset = (await db(e, `voicelab_music_presets?brand_id=eq.${q(r.brandId)}&active=is.true${presetFilter}&select=*&order=created_at.asc&limit=1`))?.[0];
  if (!preset) throw new LabError(404, 'PRESET_NOT_FOUND', 'no hay preset de música activo para la marca');
  const tier = await subscriptionTier(e);

  if (r.source === 'bank') {
    const track = (await db(e, `voicelab_music_bank?preset_id=eq.${preset.id}&retired_at=is.null&select=*&order=uses.asc,last_used_at.asc.nullsfirst&limit=1`))?.[0];
    if (!track) throw new LabError(404, 'MUSIC_BANK_EMPTY', 'el banco de la marca no tiene pistas vigentes para el preset');
    await db(e, `voicelab_music_bank?id=eq.${track.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ uses: Number(track.uses ?? 0) + 1, last_used_at: new Date().toISOString() }),
    });
    return {
      success: true, job_id: jobId, mode: 'music', audio_url: `${e.url}/storage/v1/object/public/${STORAGE_BUCKET}/${track.storage_path}`,
      storage_path: track.storage_path, format: DEFAULT_FORMAT, duration_ms: track.duration_ms, alignment: null, voice: null,
      music: { preset: preset.name, origin: 'bank', instrumental: preset.instrumental, loudness_lufs: track.loudness_lufs ?? null, license: licenseFor(tier) },
      model_id: track.model_id, cost_usd: 0, ledger_id: null,
    };
  }

  const model = await activeModel(e, 'music');
  const rate = await activeRate(e, model.model_id, 'per_second');
  const seconds = r.durationS ?? preset.duration_s;
  let bytes: Uint8Array;
  try {
    const res = await provider(e, `/v1/music?output_format=${DEFAULT_FORMAT}`, {
      prompt: preset.style_prompt, music_length_ms: seconds * 1000, model_id: model.model_id,
      force_instrumental: r.instrumental && preset.instrumental,
    });
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    if (err instanceof LabError && err.providerCalled && !r.ledgerByCaller) {
      await ledger(e, { brandId: r.brandId, jobId, outputType: 'music', modelId: model.model_id, unitType: rate.unitType, units: 0,
        status: 'error', durationMs: Date.now() - t0, errorMsg: err.message, rateSource: `NOT_BILLED:${err.label}` });
    }
    throw err;
  }
  if (!bytes.length) throw new LabError(502, 'PROVIDER_ERROR', 'ElevenLabs no devolvió audio', true);
  const durationMs = mp3DurationMs(bytes) ?? seconds * 1000;
  const path = storagePath(r.brandId, jobId, 'mp3');
  const audioUrl = await upload(e, path, bytes, mimeFor('mp3'));
  await db(e, 'voicelab_music_bank', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ brand_id: r.brandId, preset_id: preset.id, storage_path: path, duration_ms: durationMs, model_id: model.model_id, job_id: jobId, uses: 1, last_used_at: new Date().toISOString() }),
  });
  const units = ledgerUnits(rate.unitType, 0, durationMs / 1000);
  const ledgerId = r.ledgerByCaller ? null : await ledger(e, {
    brandId: r.brandId, jobId, outputType: 'music', modelId: model.model_id, unitType: rate.unitType, units,
    status: 'success', durationMs: Date.now() - t0,
  });
  return {
    success: true, job_id: jobId, mode: 'music', audio_url: audioUrl, storage_path: path, format: DEFAULT_FORMAT,
    duration_ms: durationMs, alignment: null, voice: null,
    music: { preset: preset.name, origin: 'generated', instrumental: r.instrumental && preset.instrumental, loudness_lufs: null, license: licenseFor(tier) },
    model_id: model.model_id, cost_usd: costOf(units, rate.rate), ledger_id: ledgerId,
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error_label: 'METHOD_NOT_ALLOWED', error: 'usa POST', job_id: null });
  const t0 = Date.now();
  let jobId: string | null = null;
  let e: Env | null = null;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const r = parseRequest(body);
    e = env();
    const created = await db(e, 'lab_jobs', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ lab: LAB, brand_id: r.brandId, job_type: r.mode, status: 'processing', payload: body,
        parent_job_id: r.parentJobId, claimed_at: new Date().toISOString(), created_by: LAB,
        language: r.mode === 'voice' ? r.language : null }),
    });
    jobId = created?.[0]?.id ?? null;
    if (!jobId) throw new LabError(502, 'DB_ERROR', 'lab_jobs no devolvió id');
    const result = r.mode === 'voice' ? await runVoice(e, r, jobId, t0) : await runMusic(e, r, jobId, t0);
    await db(e, `lab_jobs?id=eq.${jobId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'completed', output_parsed: result, completed_at: new Date().toISOString() }) });
    return res.status(200).json(result);
  } catch (err) {
    const le = err instanceof LabError ? err : new LabError(500, 'INTERNAL_ERROR', (err as Error)?.message ?? String(err));
    if (e && jobId) {
      try {
        await db(e, `lab_jobs?id=eq.${jobId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'failed', error_msg: `${le.label}: ${le.message}`.slice(0, 500), completed_at: new Date().toISOString() }) });
      } catch { /* el error original es el que se devuelve */ }
    }
    console.error(`[VoiceLab] ${le.label} job=${jobId ?? '∅'}: ${le.message}`);
    return res.status(le.status).json({ success: false, error_label: le.label, error: le.message, job_id: jobId });
  }
}
