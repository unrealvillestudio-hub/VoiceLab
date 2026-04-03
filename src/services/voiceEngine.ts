/**
 * voiceEngine.ts
 * Core engine for VoiceLab.
 * generateVoiceScript() calls /api/generate-script (Claude server-side).
 * estimateReadTime() is a pure utility used for realtime metrics.
 */

import { ScriptBlock, VoicePackSpec } from '../core/types';
import { VoiceLabBrand, VoicePersonaDB } from './voiceLabLoader';

export type VoiceSpeed = number;

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

/**
 * Estimates the reading time of a text in seconds.
 * Base: 150 words/min, adjusted by voice speed multiplier.
 */
export function estimateReadTime(text: string, speed: VoiceSpeed): number {
  if (!text || text.trim().length === 0) return 0;
  const words = text.trim().split(/\s+/).length;
  const wordsPerMinute = 150;
  const durationMinutes = words / wordsPerMinute;
  const adjustedSeconds = (durationMinutes * 60) * (1 / speed);
  return Math.round(adjustedSeconds * 10) / 10;
}

// ---------------------------------------------------------------------------
// SCRIPT GENERATION — calls Claude via /api/generate-script
// ---------------------------------------------------------------------------

export interface GenerateScriptParams {
  mode: 'single' | 'podcast';
  brand: VoiceLabBrand;
  persona: VoicePersonaDB;
  guestPersona?: VoicePersonaDB;
  pack: VoicePackSpec;
  productContext: string;
  keywords: string[];
}

export async function generateVoiceScript(params: GenerateScriptParams): Promise<ScriptBlock[]> {
  const { mode, brand, persona, guestPersona, pack, productContext, keywords } = params;

  const requestBody = {
    mode,
    brand: {
      id: brand.id,
      displayName: brand.displayName,
      industry: brand.industry,
      complianceRules: brand.complianceRules,
    },
    persona: {
      personaName: persona.personaName,
      voiceId: persona.voiceId,
      language: persona.language,
      emotionBase: persona.emotionBase,
      speed: persona.speed,
      engine: persona.engine,
      notes: persona.notes,
    },
    ...(guestPersona && mode === 'podcast' ? {
      guestPersona: {
        personaName: guestPersona.personaName,
        voiceId: guestPersona.voiceId,
        language: guestPersona.language,
        emotionBase: guestPersona.emotionBase,
        speed: guestPersona.speed,
        notes: guestPersona.notes,
      }
    } : {}),
    pack: {
      id: pack.id,
      label: pack.label,
      packType: pack.packType,
      blocks: pack.blocks.map(b => ({ id: b.id, type: b.type, speaker: b.speaker })),
      total_estimated_seconds: pack.total_estimated_seconds,
    },
    productContext,
    keywords,
  };

  const res = await fetch('/api/generate-script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `API error ${res.status}`);
  }

  const data = await res.json();

  // Recalculate estimated_seconds client-side with actual speed for accuracy
  return (data.blocks as ScriptBlock[]).map(block => ({
    ...block,
    estimated_seconds: block.text
      ? estimateReadTime(block.text, persona.speed)
      : (block.estimated_seconds || 0),
  }));
}

// ---------------------------------------------------------------------------
// ELEVENLABS PAYLOAD BUILDER
// ---------------------------------------------------------------------------

export interface ElevenLabsPayload {
  voice_id: string;
  model_id: string;
  text: string;
  voice_settings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
}

/**
 * Builds the ElevenLabs API payload preview for a single-voice script.
 * Voice IDs with 'TBD_' prefix are shown as placeholders.
 */
export function buildElevenLabsPayload(
  blocks: ScriptBlock[],
  persona: VoicePersonaDB
): ElevenLabsPayload {
  return {
    voice_id: persona.voiceId,
    model_id: persona.engine === 'elevenlabs_turbo_v2'
      ? 'eleven_turbo_v2'
      : 'eleven_multilingual_v2',
    text: blocks.map(b => b.text).join(' '),
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.06,
      use_speaker_boost: true,
    },
  };
}
