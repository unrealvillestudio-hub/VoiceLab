import { VoicePersona } from '../core/types';

export const VOICE_PERSONAS: Record<string, VoicePersona> = {
  DiamondDetails: {
    id: 'vp_diamond',
    label: 'Diamond Details - Executive',
    brandId: 'DiamondDetails',
    language: 'es-ES',
    voiceId: 'TBD_dd_voice_01',
    emotion: 'authoritative',
    speed: 1.0
  },
  D7Herbal: {
    id: 'vp_d7herbal',
    label: 'D7Herbal - Natural',
    brandId: 'D7Herbal',
    language: 'es-ES',
    voiceId: 'TBD_d7h_voice_01',
    emotion: 'warm',
    speed: 0.95
  },
  VivoseMask: {
    id: 'vp_vivose',
    label: 'Vivosé Mask - Zen',
    brandId: 'VivoseMask',
    language: 'es-ES',
    voiceId: 'TBD_vivose_voice_01',
    emotion: 'calm',
    speed: 0.9
  },
  VizosCosmetics: {
    id: 'vp_vizos',
    label: 'Vizos Cosmetics - Professional',
    brandId: 'VizosCosmetics',
    language: 'es-ES',
    voiceId: 'TBD_vizos_voice_01',
    emotion: 'authoritative',
    speed: 1.0
  },
  PatriciaOsorioPersonal: {
    id: 'vp_patricia_personal',
    label: 'Patricia Osorio - Marca Personal',
    brandId: 'PatriciaOsorioPersonal',
    language: 'es-FL',
    voiceId: 'TBD_po_patricia',
    emotion: 'energetic',
    speed: 1.05
  },
  PatriciaOsorioComunidad: {
    id: 'vp_patricia_comunidad',
    label: 'Patricia Osorio - Conectando',
    brandId: 'PatriciaOsorioComunidad',
    language: 'es-FL',
    voiceId: 'TBD_po_comunidad',
    emotion: 'friendly',
    speed: 1.0
  },
  PatriciaOsorioVizosSalon: {
    id: 'vp_patricia_salon',
    label: 'Patricia Osorio - Vizos Salón Miami',
    brandId: 'PatriciaOsorioVizosSalon',
    language: 'es-FL',
    voiceId: 'TBD_po_patricia',
    emotion: 'energetic',
    speed: 1.05
  }
};
