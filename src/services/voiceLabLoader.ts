/// <reference types="vite/client" />
/**
 * voiceLabLoader.ts
 * Loads VoiceLab data from Supabase with automatic fallback to hardcoded config.
 * Pattern: identical to videoLabLoader.ts — raw fetch, no SDK, parallel queries.
 */

import { VOICE_PERSONAS } from '../config/voicePersonas';
import { BRANDS } from '../config/brands';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface VoiceLabBrand {
  id: string;           // canonical Supabase PK
  displayName: string;
  industry: string;
  complianceRules: string;
  // voicelab defaults from brands table
  voiceLabVoiceId: string | null;
  voiceLabLanguage: string | null;
  voiceLabSpeedDefault: number;
  voiceLabEmotionBase: string;
  voiceLabModelPreferred: string;
  voiceLabScriptStyle: string | null;
  voiceLabComplianceRules: string | null;
}

export interface VoicePersonaDB {
  id: string;           // UUID from Supabase
  brandId: string;
  personaName: string;  // display label
  voiceId: string;      // ElevenLabs voice ID (TBD_* until assigned)
  language: string;
  gender: string | null;
  ageRange: string | null;
  emotionBase: string;
  speed: number;
  pitch: number;
  scriptStyle: string | null;
  engine: string;
  formatDefault: string;
  status: string;       // 'pending' | 'active' | 'deprecated'
  notes: string | null;
}

export interface VoicePersonaBP {
  id: string;           // blueprint_id
  brandId: string;
  displayName: string;
  speakingStyle: string | null;
  expertise: string | null;
  compatibleArchetypes: string[];
}

export interface VoiceLabData {
  brands: VoiceLabBrand[];
  voicePersonas: VoicePersonaDB[];
  personBlueprints: VoicePersonaBP[];
}

// ---------------------------------------------------------------------------
// MAPPERS
// ---------------------------------------------------------------------------

function mapBrand(row: any): VoiceLabBrand {
  return {
    id: row.id,
    displayName: row.display_name,
    industry: row.industry || 'general',
    complianceRules: row.voicelab_compliance_rules || '',
    voiceLabVoiceId: row.voicelab_voice_id || null,
    voiceLabLanguage: row.voicelab_language || 'es-ES',
    voiceLabSpeedDefault: parseFloat(row.voicelab_speed_default) || 1.0,
    voiceLabEmotionBase: row.voicelab_emotion_base || 'warm',
    voiceLabModelPreferred: row.voicelab_model_preferred || 'elevenlabs_turbo_v2',
    voiceLabScriptStyle: row.voicelab_script_style || null,
    voiceLabComplianceRules: row.voicelab_compliance_rules || null,
  };
}

function mapVoicePersona(row: any): VoicePersonaDB {
  return {
    id: row.id,
    brandId: row.brand_id,
    personaName: row.persona_name,
    voiceId: row.voice_id || 'TBD',
    language: row.language || 'es-ES',
    gender: row.gender || null,
    ageRange: row.age_range || null,
    emotionBase: row.emotion_base || 'warm',
    speed: parseFloat(row.speed) || 1.0,
    pitch: parseFloat(row.pitch) || 1.0,
    scriptStyle: row.script_style || null,
    engine: row.engine || 'elevenlabs_turbo_v2',
    formatDefault: row.format_default || 'mp3_192',
    status: row.status || 'pending',
    notes: row.notes || null,
  };
}

function mapPersonBP(row: any): VoicePersonaBP {
  return {
    id: row.blueprint_id || row.id,
    brandId: row.brand_id,
    displayName: row.display_name,
    speakingStyle: row.speaking_style || null,
    expertise: row.expertise || null,
    compatibleArchetypes: row.compatible_archetypes || [],
  };
}

// ---------------------------------------------------------------------------
// SUPABASE FETCH
// ---------------------------------------------------------------------------

async function sbFetch(table: string, params: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`[VoiceLabLoader] ${table} fetch failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// MAIN LOADER
// ---------------------------------------------------------------------------

export async function loadVoiceLabData(): Promise<VoiceLabData> {
  const [brandsRaw, personasRaw, blueprintsRaw] = await Promise.all([
    // Brands that have voicelab configured
    sbFetch(
      'brands',
      [
        'select=id,display_name,industry',
        ',voicelab_voice_id,voicelab_language,voicelab_speed_default',
        ',voicelab_emotion_base,voicelab_model_preferred,voicelab_script_style',
        ',voicelab_compliance_rules',
        '&status=eq.active',
        '&id=neq.DEFAULT',
        '&order=display_name.asc',
      ].join('')
    ),
    // All voicelab_params (personas per brand)
    sbFetch(
      'voicelab_params',
      [
        'select=id,brand_id,persona_name,voice_id,language,gender,age_range',
        ',emotion_base,speed,pitch,script_style,engine,format_default,status,notes',
        '&order=brand_id.asc,persona_name.asc',
      ].join('')
    ),
    // Person blueprints (for podcast HOST/GUEST selection)
    sbFetch(
      'person_blueprints',
      [
        'select=id,blueprint_id,brand_id,display_name,speaking_style,expertise,compatible_archetypes',
        '&active=eq.true',
        '&order=brand_id.asc,display_name.asc',
      ].join('')
    ),
  ]);

  return {
    brands: brandsRaw.map(mapBrand),
    voicePersonas: personasRaw.map(mapVoicePersona),
    personBlueprints: blueprintsRaw.map(mapPersonBP),
  };
}

// ---------------------------------------------------------------------------
// FILTER HELPERS
// ---------------------------------------------------------------------------

export function getPersonasByBrand(personas: VoicePersonaDB[], brandId: string): VoicePersonaDB[] {
  return personas.filter(p => p.brandId === brandId);
}

export function getBlueprintsByBrandId(blueprints: VoicePersonaBP[], brandId: string): VoicePersonaBP[] {
  return blueprints.filter(b => b.brandId === brandId);
}

// ---------------------------------------------------------------------------
// FALLBACK DATA
// ---------------------------------------------------------------------------

function hardcodedBrandsToVoiceLab(): VoiceLabBrand[] {
  return BRANDS
    .filter(b => b.id !== 'new')
    .map(b => ({
      id: b.id,
      displayName: b.displayName,
      industry: b.industry,
      complianceRules: b.complianceRules,
      voiceLabVoiceId: null,
      voiceLabLanguage: 'es-ES',
      voiceLabSpeedDefault: 1.0,
      voiceLabEmotionBase: 'warm',
      voiceLabModelPreferred: 'elevenlabs_turbo_v2',
      voiceLabScriptStyle: null,
      voiceLabComplianceRules: b.complianceRules,
    }));
}

function hardcodedPersonasToDB(): VoicePersonaDB[] {
  return Object.values(VOICE_PERSONAS).map(p => ({
    id: p.id,
    brandId: p.brandId,
    personaName: p.label,
    voiceId: p.voiceId,
    language: p.language,
    gender: null,
    ageRange: null,
    emotionBase: p.emotion,
    speed: p.speed,
    pitch: 1.0,
    scriptStyle: null,
    engine: 'elevenlabs_turbo_v2',
    formatDefault: 'mp3_192',
    status: 'pending',
    notes: null,
  }));
}

export const FALLBACK_DATA: VoiceLabData = {
  brands: hardcodedBrandsToVoiceLab(),
  voicePersonas: hardcodedPersonasToDB(),
  personBlueprints: [],
};
