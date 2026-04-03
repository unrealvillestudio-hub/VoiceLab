/**
 * VoiceLabContext.tsx
 * Loads all VoiceLab data from Supabase on mount.
 * Falls back to hardcoded config automatically if Supabase is unreachable.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  loadVoiceLabData,
  VoiceLabBrand,
  VoicePersonaDB,
  VoicePersonaBP,
  VoiceLabData,
  FALLBACK_DATA,
} from '../services/voiceLabLoader';

// ---------------------------------------------------------------------------
// CONTEXT SHAPE
// ---------------------------------------------------------------------------

interface VoiceLabContextValue {
  brands: VoiceLabBrand[];
  voicePersonas: VoicePersonaDB[];
  personBlueprints: VoicePersonaBP[];
  isLoading: boolean;
  error: string | null;
  source: 'supabase' | 'fallback' | null;
}

const VoiceLabContext = createContext<VoiceLabContextValue>({
  brands: [],
  voicePersonas: [],
  personBlueprints: [],
  isLoading: true,
  error: null,
  source: null,
});

// ---------------------------------------------------------------------------
// PROVIDER
// ---------------------------------------------------------------------------

export function VoiceLabProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<VoiceLabData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'supabase' | 'fallback' | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const loaded = await loadVoiceLabData();
        if (!cancelled) {
          setData(loaded);
          setSource('supabase');
          console.info(
            `[VoiceLabContext] Supabase loaded — ${loaded.brands.length} brands, ` +
            `${loaded.voicePersonas.length} personas, ${loaded.personBlueprints.length} blueprints`
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          console.warn('[VoiceLabContext] Supabase failed, using fallback:', err.message);
          setData(FALLBACK_DATA);
          setSource('fallback');
          setError(err.message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <VoiceLabContext.Provider value={{
      brands: data?.brands ?? [],
      voicePersonas: data?.voicePersonas ?? [],
      personBlueprints: data?.personBlueprints ?? [],
      isLoading,
      error,
      source,
    }}>
      {children}
    </VoiceLabContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

export function useVoiceLab(): VoiceLabContextValue {
  const ctx = useContext(VoiceLabContext);
  if (!ctx) throw new Error('useVoiceLab must be used inside <VoiceLabProvider>');
  return ctx;
}
