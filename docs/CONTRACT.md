# VoiceLab — contrato del lab (v1, 2026-11-07)

**Estado:** borrador, PR 1 del lanzamiento. Decisiones de Sam del 2026-11-07: llamada **síncrona** con registro del job,
audio en `unrlvl-media` bajo `voicelab/`, una sola tabla de consentimiento `person_consents`, modelo y tarifa como dato.

VoiceLab es dueño de su motor (ElevenLabs hoy). Quien lo usa (el carril, VideoLab) lo llama por el `api_endpoint` de
`public.lab_configs` (fila `LAB-VOL`) y nunca llama al proveedor directamente.

---

## 1. Llamada

`POST {api_endpoint}/api/execute` — el mismo cuerpo que ya envía `execLab` del carril:

```json
{
  "brandId": "ForumPHs",
  "stage": { "mode": "voice" },
  "params": { "...": "ver §2 y §3" },
  "previousOutputs": {},
  "parent_job_id": "uuid opcional (job padre en lab_jobs)",
  "ledger_by_caller": false
}
```

- `stage.mode` (o `params.mode`): `voice` | `music`.
- Responde **en la misma llamada** (`maxDuration` 300 s). Timeout recomendado al llamador: 120 s para `voice`,
  290 s para `music`.
- Cada llamada deja una fila en `public.lab_jobs` (`lab = 'voicelab'`, `parent_job_id` si viene) con el resultado en
  `output_parsed`. Consulta posterior: `GET {api_endpoint}/api/jobs/{job_id}` → la misma forma de §4.
- `ledger_by_caller: true` sólo si el llamador asienta el costo; si no, asienta VoiceLab (§6). Nunca los dos.

## 2. `mode: "voice"`

| Campo | Tipo | Obligatorio | Nota |
|---|---|---|---|
| `script` | string | sí | texto final a locutar; VoiceLab no lo reescribe |
| `language` | string BCP-47 (`es-PA`, `en-US`, …) | sí | |
| `person_id` | uuid de `person_blueprints` | uno de los dos | la voz se resuelve por `person_blueprints.voicelab_ref` → `voicelab_params` |
| `voice_ref` | uuid de `voicelab_params` | uno de los dos | explícito; se valida contra la misma regla de consentimiento |
| `preset` | string | no | variante de estilo de esa voz; por defecto la fila activa |
| `format` | string | no | por defecto `voicelab_params.format_default` (hoy `mp3_44100_128`) |

**Resolución por dato, nunca por código:** voz, estabilidad, claridad, estilo, velocidad y formato salen de
`voicelab_params`; el modelo, de `ops_lab_models` (`lab = 'voicelab'`, `role = 'tts'`, activo); la tarifa, de
`ops_lab_rates`. Una marca o un idioma nuevos son filas, no cambios de código.

**Consentimiento:** si la voz es de una persona real (`voicelab_params` marcada como clon), debe existir en
`public.person_consents` una fila `scope = 'voice'`, `authorized = true`, `revoked_at is null` para esa persona.
Si no existe, el lab responde `403 VOICE_NOT_AUTHORIZED` **sin llamar al proveedor**. Las voces sintéticas
(diseñadas) no requieren consentimiento.

El audio de voz sale **siempre limpio, sin música**: sirve tal cual para avatares (HeyGen) y para la mezcla.

## 3. `mode: "music"`

| Campo | Tipo | Obligatorio | Nota |
|---|---|---|---|
| `preset` | string | no | estilo musical de la marca (`voicelab_music_presets`); por defecto el activo de la marca |
| `duration_s` | number | no | por defecto el del preset; máximo 300 |
| `source` | `bank` \| `generate` | no | por defecto `bank`: rota una pista del banco de la marca; `generate` crea una nueva y la añade al banco |
| `instrumental` | boolean | no | por defecto `true` |

## 4. Respuesta (`200`)

```json
{
  "success": true,
  "job_id": "uuid",
  "mode": "voice",
  "audio_url": "https://…/storage/v1/object/public/unrlvl-media/voicelab/<brand_id>/<job_id>.mp3",
  "storage_path": "voicelab/<brand_id>/<job_id>.mp3",
  "format": "mp3_44100_128",
  "duration_ms": 31840,
  "alignment": { "words": [ { "text": "Hola", "start_ms": 0, "end_ms": 310 } ] },
  "voice": { "voice_ref": "uuid", "voice_id": "…", "person_id": "uuid", "kind": "clone|synthetic", "consent_ref": "uuid|null" },
  "music": null,
  "model_id": "…",
  "cost_usd": 0.0251,
  "ledger_id": "uuid|null"
}
```

- `duration_ms` se mide sobre el archivo generado.
- `alignment` sólo en `voice` (marcas por palabra del proveedor, agregadas de caracteres a palabras).
- En `music`, `voice` y `alignment` van `null` y `music` lleva:
  `{ "preset": "…", "origin": "bank|generated", "instrumental": true, "loudness_lufs": null, "license": { "provider": "elevenlabs", "plan": "starter", "commercial": true } }`.
  `loudness_lufs` es `null` si no se pudo medir.

## 5. Errores

Cuerpo: `{ "success": false, "error_label": "…", "error": "detalle", "job_id": "uuid|null" }`.

| HTTP | `error_label` | Cuándo | ¿Se llamó al proveedor? |
|---|---|---|---|
| 400 | `INVALID_REQUEST` | faltan campos o tipos inválidos | no |
| 403 | `VOICE_NOT_AUTHORIZED` | voz de persona real sin consentimiento vigente | no |
| 404 | `VOICE_NOT_ASSIGNED` | la persona no tiene voz asignada | no |
| 404 | `PRESET_NOT_FOUND` | no hay preset de música activo para la marca | no |
| 422 | `MODEL_NOT_CONFIGURED` | falta la fila activa en `ops_lab_models` | no |
| 422 | `RATE_NOT_CONFIGURED` | falta la tarifa vigente en `ops_lab_rates` | no |
| 402 | `PROVIDER_QUOTA` | el proveedor rechaza por créditos | sí (asiento `NOT_BILLED`) |
| 502 | `PROVIDER_ERROR` | el proveedor falla | sí (asiento `NOT_BILLED`) |

## 6. Costo

Cada llamada al proveedor se asienta en `public.ops_generation_ledger` (`lab = 'voicelab'`, `provider`, `model_id`,
`voice_id`, `unit_type`, unidades, `cost_usd`, `rate_source = 'ops_lab_rates:<id>'`, `job_id`). Voz en
`per_1k_chars`; música en `per_second`. Cero literales de precio y de modelo en el código.

## 7. Lo que no hace

- No escribe guiones (eso es CopyLab).
- No mezcla voz y música (eso es VideoLab).
- No publica (eso es SocialLab).
