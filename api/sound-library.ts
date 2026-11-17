/**
 * api/sound-library.ts — la librería propia de sonidos, para escuchar y elegir (contrato docs/CONTRACT.md v1.2 §3 ter).
 *
 * GET /api/sound-library?brandId=…[&fn=…]
 *   → { status: 'ok', brandId, sounds: [{ sound_key, fn, description, duration_ms, loudness_lufs, license, attribution, url, sha256 }] }
 *
 * Sonido F2 (2026-11-17), decisión de Sam: la ventana de Controles de Sonido da «acceso a librería» para el fondo y para
 * los efectos, donde «se listarán todos los disponibles». VoiceLab es el dueño de la librería y la lista; la ventana la
 * pide por el `api_endpoint` de VoiceLab. Sólo lectura: no crea jobs, no llama a ningún proveedor y no tiene costo.
 *
 * Todo es dato (`public.voicelab_sound_library`): los sonidos de sistema (brand_id NULL) más los de la marca, y la fila
 * de la marca gana sobre la de sistema con la misma clave. En este archivo no hay ni un id de marca ni una clave de sonido.
 *
 * Variables de entorno (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

export const config = { maxDuration: 15 };

// ── SOUND-LIBRARY-CORE:BEGIN ── (puro: sin red ni entorno; lo extraen los tests)

export const STORAGE_BUCKET = 'unrlvl-media';
/** Funciones de un sonido en el video (eje del sistema; mismo CHECK que la tabla). */
export const SOUND_FNS = ['block_entry', 'digit_land', 'impact', 'shot_cut', 'cta', 'word_pop', 'music_bed'] as const;

export class LibraryError extends Error {
  status: number; label: string;
  constructor(status: number, label: string, message: string) { super(message); this.status = status; this.label = label; }
}

/** Valida la consulta. Lanza LibraryError 400 INVALID_REQUEST. PURO. */
export function parseQuery(query: Record<string, unknown> | null | undefined): { brandId: string; fn: string | null } {
  const brandId = typeof query?.brandId === 'string' ? query.brandId.trim() : '';
  if (!brandId) throw new LibraryError(400, 'INVALID_REQUEST', 'falta brandId');
  const fn = typeof query?.fn === 'string' && query.fn.trim() ? query.fn.trim() : null;
  if (fn != null && !(SOUND_FNS as readonly string[]).includes(fn)) throw new LibraryError(400, 'INVALID_REQUEST', `fn debe ser una de: ${SOUND_FNS.join(', ')}`);
  return { brandId, fn };
}

/**
 * Lo que ve una marca: los sonidos activos de sistema más los suyos, la fila de la marca sobre la de sistema con la
 * misma clave, nunca la fila de otra marca. Orden: función (en el orden de SOUND_FNS) y luego clave. PURO.
 */
export function libraryFromRows(rows: any[], brandId: string, baseUrl: string, fn: string | null = null) {
  const pick = new Map<string, any>();
  for (const r of rows ?? []) {
    if (!r || r.active === false || typeof r.sound_key !== 'string') continue;
    if (r.brand_id != null && r.brand_id !== brandId) continue;
    if (fn != null && r.fn !== fn) continue;
    const prev = pick.get(r.sound_key);
    if (!prev || (prev.brand_id == null && r.brand_id != null)) pick.set(r.sound_key, r);
  }
  const order = (f: string) => { const i = (SOUND_FNS as readonly string[]).indexOf(f); return i < 0 ? SOUND_FNS.length : i; };
  return [...pick.values()]
    .sort((a, b) => order(a.fn) - order(b.fn) || String(a.sound_key).localeCompare(String(b.sound_key)))
    .map((r) => ({
      sound_key: r.sound_key, fn: r.fn, description: r.description ?? null, duration_ms: r.duration_ms,
      loudness_lufs: r.loudness_lufs == null ? null : Number(r.loudness_lufs), license: r.license, attribution: r.attribution ?? null,
      url: `${baseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${r.storage_path}`, sha256: r.sha256,
      brand_id: r.brand_id ?? null,
    }));
}

// ── SOUND-LIBRARY-CORE:END ──

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ status: 'error', error_label: 'METHOD_NOT_ALLOWED', error: 'usa GET' });
  try {
    const { brandId, fn } = parseQuery(req.query);
    const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!url || !key) throw new LibraryError(500, 'ENV_MISSING', 'faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    const q = encodeURIComponent;
    const r = await fetch(`${url}/rest/v1/voicelab_sound_library?active=is.true&or=(brand_id.is.null,brand_id.eq.${q(brandId)})` +
      `&select=sound_key,fn,description,duration_ms,loudness_lufs,license,attribution,storage_path,sha256,brand_id,active`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const txt = await r.text();
    if (!r.ok) throw new LibraryError(502, 'DB_ERROR', `voicelab_sound_library ${r.status}: ${txt.slice(0, 200)}`);
    const sounds = libraryFromRows(txt ? JSON.parse(txt) : [], brandId, url, fn);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ status: 'ok', brandId, fn, sounds });
  } catch (err) {
    const le = err instanceof LibraryError ? err : new LibraryError(500, 'INTERNAL_ERROR', (err as Error)?.message ?? String(err));
    return res.status(le.status).json({ status: 'error', error_label: le.label, error: le.message });
  }
}
