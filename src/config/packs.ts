import { VoicePackSpec } from '../core/types';

export const VOICE_PACKS: Record<string, VoicePackSpec> = {
  ad_spot_15s: {
    id: 'ad_spot_15s',
    label: 'Ad Spot 15s',
    packType: 'commercial',
    total_estimated_seconds: 15,
    blocks: [
      { id: 'b1', type: 'hook', text: '' },
      { id: 'b2', type: 'cta', text: '' }
    ]
  },
  ad_spot_30s: {
    id: 'ad_spot_30s',
    label: 'Ad Spot 30s',
    packType: 'commercial',
    total_estimated_seconds: 30,
    blocks: [
      { id: 'b1', type: 'hook', text: '' },
      { id: 'b2', type: 'body', text: '' },
      { id: 'b3', type: 'cta', text: '' }
    ]
  },
  narration_60s: {
    id: 'narration_60s',
    label: 'Narration 60s',
    packType: 'narration',
    total_estimated_seconds: 60,
    blocks: [
      { id: 'b1', type: 'intro', text: '' },
      { id: 'b2', type: 'body', text: '' },
      { id: 'b3', type: 'body', text: '' },
      { id: 'b4', type: 'outro', text: '' }
    ]
  },
  podcast_intro: {
    id: 'podcast_intro',
    label: 'Podcast Intro',
    packType: 'podcast',
    total_estimated_seconds: 20,
    blocks: [
      { id: 'b1', type: 'hook', text: '' },
      { id: 'b2', type: 'presentation', text: '' },
      { id: 'b3', type: 'cta', text: '' }
    ]
  },
  cta_short: {
    id: 'cta_short',
    label: 'CTA Short',
    packType: 'social',
    total_estimated_seconds: 8,
    blocks: [
      { id: 'b1', type: 'cta', text: '' }
    ]
  },
  video_podcast_script_15s: {
    id: 'video_podcast_script_15s',
    label: 'VideoPodcast 15s',
    packType: 'videopodcast',
    total_estimated_seconds: 15,
    blocks: [
      { id: 'b1', type: 'hook', speaker: 'HOST', text: '' },
      { id: 'b2', type: 'cta', speaker: 'HOST', text: '' }
    ]
  },
  video_podcast_script_30s: {
    id: 'video_podcast_script_30s',
    label: 'VideoPodcast 30s',
    packType: 'videopodcast',
    total_estimated_seconds: 30,
    blocks: [
      { id: 'b1', type: 'hook', speaker: 'HOST', text: '' },
      { id: 'b2', type: 'body', speaker: 'HOST', text: '' },
      { id: 'b3', type: 'cta', speaker: 'HOST', text: '' }
    ]
  },
  video_podcast_script_5min: {
    id: 'video_podcast_script_5min',
    label: 'VideoPodcast 5min',
    packType: 'videopodcast',
    total_estimated_seconds: 300,
    blocks: [
      { id: 'b1', type: 'intro', speaker: 'HOST', text: '' },
      { id: 'b2', type: 'question', speaker: 'HOST', text: '' },
      { id: 'b3', type: 'answer', speaker: 'GUEST', text: '' },
      { id: 'b4', type: 'question', speaker: 'HOST', text: '' },
      { id: 'b5', type: 'answer', speaker: 'GUEST', text: '' },
      { id: 'b6', type: 'question', speaker: 'HOST', text: '' },
      { id: 'b7', type: 'answer', speaker: 'GUEST', text: '' },
      { id: 'b8', type: 'takeaway', speaker: 'HOST', text: '' },
      { id: 'b9', type: 'cta', speaker: 'HOST', text: '' }
    ]
  },
  video_podcast_script_10min: {
    id: 'video_podcast_script_10min',
    label: 'VideoPodcast 10min',
    packType: 'videopodcast',
    total_estimated_seconds: 600,
    blocks: [
      { id: 'b1', type: 'intro', speaker: 'HOST', text: '' },
      { id: 'b2', type: 'question', speaker: 'HOST', text: '' },
      { id: 'b3', type: 'answer', speaker: 'GUEST', text: '' },
      { id: 'b4', type: 'question', speaker: 'HOST', text: '' },
      { id: 'b5', type: 'answer', speaker: 'GUEST', text: '' },
      { id: 'b6', type: 'question', speaker: 'HOST', text: '' },
      { id: 'b7', type: 'answer', speaker: 'GUEST', text: '' },
      { id: 'b8', type: 'question', speaker: 'HOST', text: '' },
      { id: 'b9', type: 'answer', speaker: 'GUEST', text: '' },
      { id: 'b10', type: 'question', speaker: 'HOST', text: '' },
      { id: 'b11', type: 'answer', speaker: 'GUEST', text: '' },
      { id: 'b12', type: 'question', speaker: 'HOST', text: '' },
      { id: 'b13', type: 'answer', speaker: 'GUEST', text: '' },
      { id: 'b14', type: 'takeaway', speaker: 'HOST', text: '' },
      { id: 'b15', type: 'cta', speaker: 'HOST', text: '' }
    ]
  }
};
