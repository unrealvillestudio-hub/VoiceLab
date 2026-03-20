# VoiceLab — Unreal>ille Studio

Generador de scripts de voz y audio del ecosistema Unreal>ille Studio.

**Deploy:** Google AI Studio
**Contexto completo del ecosistema:** [`CoreProject/CONTEXT.md`](https://github.com/unrealvillestudio-hub/CoreProject/blob/main/CONTEXT.md)

---

## Rol en el ecosistema

VoiceLab produce scripts optimizados para locución, podcast, reel con narración, y audio branding. Calibra el output contra los parámetros de voz definidos en BP_PERSON.

```
BluePrints (BP_PERSON.voice) ──→ VoiceLab (scripts de voz)
                                        ↓
                               Producción de audio / Reels
```

**Pendiente:** Implementación de audio PO (requiere grabación de voz base para clonación).

---

## Stack

- React 18 + TypeScript + Vite + Tailwind
- AI: Gemini 2.0 Flash (Gemini API)
- Deploy: Google AI Studio

---

## Dependencias

| Consume | Provee |
|---------|--------|
| BP_PERSON (voice calibration) | Scripts de voz listos para locución |

---

## Changelog

| Fecha | Cambio |
|---|---|
| 2026-03-20 | README actualizado con arquitectura de ecosistema |

---

## Desarrollo local

```bash
npm install
cp .env.example .env.local  # añade GEMINI_API_KEY
npm run dev
```
