export type VoiceEmotion = "warm" | "authoritative" | "energetic" | "calm" | "conversational";
export type VoiceSpeed = 0.8 | 0.85 | 0.9 | 0.95 | 1.0 | 1.05 | 1.1 | 1.15 | 1.2;
export type ScriptBlockType = "hook" | "body" | "cta" | "disclaimer" | "pause" | "intro" | "outro" | "presentation" | "question" | "answer" | "takeaway";

export interface ScriptBlock {
  id: string;
  type: ScriptBlockType;
  text: string;
  speaker?: "HOST" | "GUEST";
  estimated_seconds?: number;
}

export interface VoicePackSpec {
  id: string;
  label: string;
  packType: string;
  blocks: ScriptBlock[];
  total_estimated_seconds: number;
}

export interface VoicePersona {
  id: string;
  label: string;
  brandId: string;
  language: string;
  voiceId: string;
  emotion: VoiceEmotion;
  speed: VoiceSpeed;
}

export interface AudioOutput {
  id: string;
  label: string;
  audioUrl?: string;
  script: ScriptBlock[];
  voice: VoicePersona;
  metadata?: Record<string, any>;
}

// Generic Types (Common for UnrealVille Studio apps)
export interface BrandProfile {
  id: string;
  name: string;
  industry?: string;
  tone?: string;
  targetAudience?: string;
}

export interface Brand {
  id: string;
  name: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}
