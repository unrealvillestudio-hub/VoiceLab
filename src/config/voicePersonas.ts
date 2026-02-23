import { VoicePersona } from '../core/types';

export const VOICE_PERSONAS: Record<string, VoicePersona> = {
  diamond_details: {
    id: 'vp_diamond',
    label: 'Diamond Details - Executive',
    brandId: 'diamond_details',
    language: 'es-ES',
    voiceId: 'male_01',
    emotion: 'authoritative',
    speed: 1.0
  },
  d7herbal: {
    id: 'vp_d7herbal',
    label: 'D7Herbal - Natural',
    brandId: 'd7herbal',
    language: 'es-ES',
    voiceId: 'female_01',
    emotion: 'warm',
    speed: 0.95
  },
  vivose_mask: {
    id: 'vp_vivose',
    label: 'Vivosé - Zen',
    brandId: 'vivose_mask',
    language: 'es-ES',
    voiceId: 'female_02',
    emotion: 'calm',
    speed: 0.9
  },
  vizos_cosmetics: {
    id: 'vp_vizos',
    label: 'Vizos - Professional',
    brandId: 'vizos_cosmetics',
    language: 'es-ES',
    voiceId: 'female_03',
    emotion: 'authoritative',
    speed: 1.0
  },
  patricia_osorio: {
    id: 'vp_patricia',
    label: 'Patricia Osorio - Dynamic',
    brandId: 'patricia_osorio',
    language: 'es-FL',
    voiceId: 'female_04',
    emotion: 'energetic',
    speed: 1.05
  }
};
