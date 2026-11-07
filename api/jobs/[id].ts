/**
 * GET /api/jobs/{job_id} — consulta de un job de VoiceLab (docs/CONTRACT.md §1).
 * Devuelve output_parsed si terminó, o el estado y el error si no.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error_label: 'METHOD_NOT_ALLOWED', error: 'usa GET', job_id: null });
  const id = String(req.query?.id ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ success: false, error_label: 'INVALID_REQUEST', error: 'job_id no es un uuid', job_id: null });
  }
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return res.status(500).json({ success: false, error_label: 'ENV_MISSING', error: 'faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY', job_id: id });
  const r = await fetch(`${url}/rest/v1/lab_jobs?id=eq.${id}&lab=eq.voicelab&select=id,status,output_parsed,error_msg,created_at,completed_at`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return res.status(502).json({ success: false, error_label: 'DB_ERROR', error: `lab_jobs ${r.status}`, job_id: id });
  const row = (await r.json())?.[0];
  if (!row) return res.status(404).json({ success: false, error_label: 'JOB_NOT_FOUND', error: 'no existe ese job de VoiceLab', job_id: id });
  if (row.status === 'completed' && row.output_parsed) return res.status(200).json(row.output_parsed);
  const [label, ...rest] = String(row.error_msg ?? '').split(': ');
  return res.status(row.status === 'failed' ? 200 : 202).json({
    success: false, status: row.status, job_id: id,
    error_label: row.status === 'failed' ? (label || 'FAILED') : null, error: row.status === 'failed' ? rest.join(': ') || null : null,
  });
}
