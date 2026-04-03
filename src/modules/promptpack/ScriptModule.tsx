import React, { useState, useEffect, useMemo } from 'react';
import {
  Mic, Play, Save, RefreshCw, Clock, Type, AlertCircle,
  CheckCircle2, Users, User, ArrowRightLeft, Download, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VOICE_PACKS } from '../../config/packs';
import { useVoiceLab } from '../../context/VoiceLabContext';
import {
  VoiceLabBrand,
  VoicePersonaDB,
  getPersonasByBrand,
  getBlueprintsByBrandId,
} from '../../services/voiceLabLoader';
import {
  generateVoiceScript,
  estimateReadTime,
  buildElevenLabsPayload,
} from '../../services/voiceEngine';
import { useSessionOutputsStore } from '../../store/useSessionOutputsStore';
import { ScriptBlock, VoicePackSpec, AudioOutput } from '../../core/types';

export default function ScriptModule() {
  // --- SUPABASE DATA ---
  const { brands, voicePersonas, personBlueprints, isLoading, source } = useVoiceLab();

  // --- STATE ---
  const [selectedBrand, setSelectedBrand] = useState<VoiceLabBrand | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string>('');
  const [mode, setMode] = useState<'single' | 'podcast'>('single');

  const [hostPersonaId, setHostPersonaId] = useState<string>('');
  const [guestPersonaId, setGuestPersonaId] = useState<string>('');
  const [swapRoles, setSwapRoles] = useState(false);

  const [productContext, setProductContext] = useState('');
  const [keywords, setKeywords] = useState('');

  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const pushOutput = useSessionOutputsStore(state => state.push);

  // --- INIT: first brand after load ---
  useEffect(() => {
    if (brands.length > 0 && !selectedBrand) {
      setSelectedBrand(brands[0]);
    }
  }, [brands]);

  // --- DERIVED: personas for selected brand ---
  const brandPersonas = useMemo(() => {
    if (!selectedBrand) return [];
    return getPersonasByBrand(voicePersonas, selectedBrand.id);
  }, [voicePersonas, selectedBrand?.id]);

  // --- DERIVED: blueprints for selected brand (podcast HOST/GUEST) ---
  const brandBlueprints = useMemo(() => {
    if (!selectedBrand) return [];
    return getBlueprintsByBrandId(personBlueprints, selectedBrand.id);
  }, [personBlueprints, selectedBrand?.id]);

  // --- AUTO-SELECT persona when brand changes ---
  useEffect(() => {
    if (!selectedBrand) return;
    // Reset script on brand change
    setScriptBlocks([]);
    setGenerateError(null);

    if (brandPersonas.length > 0) {
      setHostPersonaId(brandPersonas[0].id);
      setGuestPersonaId(brandPersonas[1]?.id || brandPersonas[0].id);
    } else {
      setHostPersonaId('');
      setGuestPersonaId('');
    }
  }, [selectedBrand?.id, brandPersonas]);

  // --- FILTERED PACKS by mode ---
  const filteredPacks = useMemo(() => {
    return Object.values(VOICE_PACKS).filter(pack =>
      mode === 'podcast' ? pack.packType === 'videopodcast' : pack.packType !== 'videopodcast'
    );
  }, [mode]);

  // --- AUTO-SELECT pack when mode changes ---
  useEffect(() => {
    if (!filteredPacks.find(p => p.id === selectedPackId)) {
      setSelectedPackId(filteredPacks[0]?.id || '');
    }
  }, [filteredPacks]);

  const currentPack = useMemo(
    () => VOICE_PACKS[selectedPackId] || filteredPacks[0],
    [selectedPackId, filteredPacks]
  );

  // The active host persona object
  const hostPersona = useMemo(
    () => brandPersonas.find(p => p.id === hostPersonaId) || brandPersonas[0] || null,
    [brandPersonas, hostPersonaId]
  );

  const guestPersona = useMemo(
    () => brandPersonas.find(p => p.id === guestPersonaId) || null,
    [brandPersonas, guestPersonaId]
  );

  // --- METRICS ---
  const totalWords = scriptBlocks.reduce(
    (acc, b) => acc + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0),
    0
  );
  const totalDuration = scriptBlocks.reduce(
    (acc, b) => acc + (b.estimated_seconds || 0),
    0
  );
  const isCompliant = currentPack
    ? totalDuration <= currentPack.total_estimated_seconds * 1.1
    : true;

  // --- HANDLERS ---
  const handleBrandChange = (brandId: string) => {
    const brand = brands.find(b => b.id === brandId);
    if (brand) setSelectedBrand(brand);
  };

  const handleGenerate = async () => {
    if (!selectedBrand || !hostPersona || !currentPack) return;

    setIsGenerating(true);
    setGenerateError(null);
    setScriptBlocks([]);

    try {
      const kwArray = keywords.split(',').map(k => k.trim()).filter(k => k);

      // If swapRoles, pass guest as host and vice versa
      const effectiveHost = swapRoles ? (guestPersona || hostPersona) : hostPersona;
      const effectiveGuest = swapRoles ? hostPersona : guestPersona;

      const blocks = await generateVoiceScript({
        mode,
        brand: selectedBrand,
        persona: effectiveHost,
        ...(mode === 'podcast' && effectiveGuest ? { guestPersona: effectiveGuest } : {}),
        pack: currentPack,
        productContext: productContext || `${selectedBrand.displayName} — producto/servicio premium`,
        keywords: kwArray.length > 0 ? kwArray : ['calidad', 'profesional'],
      });

      setScriptBlocks(blocks);
    } catch (err: any) {
      setGenerateError(err.message || 'Error generando script');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBlockChange = (id: string, text: string) => {
    setScriptBlocks(prev => prev.map(block =>
      block.id === id
        ? { ...block, text, estimated_seconds: estimateReadTime(text, hostPersona?.speed || 1.0) }
        : block
    ));
  };

  const saveToSession = () => {
    if (scriptBlocks.length === 0 || !hostPersona || !selectedBrand) return;

    const output: AudioOutput = {
      id: crypto.randomUUID(),
      label: `${currentPack?.label || 'Script'} — ${selectedBrand.displayName}`,
      script: scriptBlocks,
      voice: {
        id: hostPersona.id,
        label: hostPersona.personaName,
        brandId: hostPersona.brandId,
        language: hostPersona.language,
        voiceId: hostPersona.voiceId,
        emotion: hostPersona.emotionBase as any,
        speed: hostPersona.speed as any,
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        totalDuration,
        mode,
      },
    };
    pushOutput(output);
  };

  const exportJson = () => {
    if (!selectedBrand) return;
    const dataStr = 'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(scriptBlocks, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `script_${selectedBrand.id}_${selectedPackId}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // ElevenLabs preview payload
  const elevenLabsPayload = useMemo(() => {
    if (scriptBlocks.length === 0 || !hostPersona || mode !== 'single') return null;
    return buildElevenLabsPayload(scriptBlocks, hostPersona);
  }, [scriptBlocks, hostPersona, mode]);

  // --- LOADING ---
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 opacity-40">
          <Mic size={36} strokeWidth={1} className="animate-pulse" />
          <p className="text-xs font-mono uppercase tracking-widest">Loading voice data...</p>
        </div>
      </div>
    );
  }

  // --- RENDER ---
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

      {/* Configuration Panel */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-500" />
              Configuración
            </h3>
            {/* DB source badge */}
            {source && (
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                source === 'supabase'
                  ? 'bg-green-950 text-green-500 border-green-900'
                  : 'bg-yellow-950 text-yellow-600 border-yellow-900'
              }`}>
                {source === 'supabase' ? '● DB' : '● LOCAL'}
              </span>
            )}
          </div>

          {/* Mode Toggle */}
          <div className="flex p-1 bg-zinc-950 border border-white/5 rounded-xl">
            <button
              onClick={() => setMode('single')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                mode === 'single' ? 'bg-emerald-500 text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <User className="w-3 h-3" />
              Single Voice
            </button>
            <button
              onClick={() => setMode('podcast')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                mode === 'podcast' ? 'bg-emerald-500 text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Users className="w-3 h-3" />
              VideoPodcast
            </button>
          </div>

          <div className="space-y-4">
            {/* Brand selector — uses canonical brand.id */}
            <div>
              <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">Marca</label>
              <select
                value={selectedBrand?.id || ''}
                onChange={(e) => handleBrandChange(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.displayName}</option>
                ))}
              </select>
            </div>

            {/* Persona display */}
            {mode === 'single' ? (
              <div>
                <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">Voz</label>
                {brandPersonas.length === 0 ? (
                  <p className="text-[10px] text-zinc-700 italic">
                    Sin personas configuradas para esta marca.
                  </p>
                ) : (
                  <>
                    <select
                      value={hostPersonaId}
                      onChange={(e) => setHostPersonaId(e.target.value)}
                      className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {brandPersonas.map(p => (
                        <option key={p.id} value={p.id}>{p.personaName}</option>
                      ))}
                    </select>
                    {hostPersona && (
                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <Mic className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-emerald-500 font-medium uppercase tracking-wider">Persona de Voz</p>
                          <p className="text-sm font-medium truncate">{hostPersona.personaName}</p>
                          <p className="text-[10px] text-zinc-500">
                            {hostPersona.emotionBase} • {hostPersona.speed}x • {hostPersona.language}
                            {hostPersona.voiceId.startsWith('TBD') && (
                              <span className="ml-2 text-amber-600">⚠ Voice ID pendiente</span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <div className="p-3 bg-zinc-950 border border-white/5 rounded-xl">
                    <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">Host (Persona A)</label>
                    <select
                      value={hostPersonaId}
                      onChange={(e) => setHostPersonaId(e.target.value)}
                      className="w-full bg-transparent text-sm focus:outline-none"
                    >
                      {brandPersonas.map(p => (
                        <option key={p.id} value={p.id}>{p.personaName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="p-3 bg-zinc-950 border border-white/5 rounded-xl">
                    <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">Guest (Persona B)</label>
                    <select
                      value={guestPersonaId}
                      onChange={(e) => setGuestPersonaId(e.target.value)}
                      className="w-full bg-transparent text-sm focus:outline-none"
                    >
                      {brandPersonas.map(p => (
                        <option key={p.id} value={p.id}>{p.personaName}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => setSwapRoles(!swapRoles)}
                  className={`w-full flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wider border rounded-lg transition-all ${
                    swapRoles
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                      : 'border-white/5 text-zinc-500 hover:border-white/10'
                  }`}
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  Intercambiar Roles
                </button>
              </div>
            )}

            {/* Pack selector */}
            <div>
              <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">Pack de Voz</label>
              <select
                value={selectedPackId}
                onChange={(e) => setSelectedPackId(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {filteredPacks.map(pack => (
                  <option key={pack.id} value={pack.id}>
                    {pack.label} ({pack.total_estimated_seconds}s)
                  </option>
                ))}
              </select>
            </div>

            {/* Product context */}
            <div>
              <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">Contexto del Producto</label>
              <textarea
                value={productContext}
                onChange={(e) => setProductContext(e.target.value)}
                placeholder="Ej: Un nuevo serum con ácido hialurónico para cabello dañado..."
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Keywords */}
            <div>
              <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">Keywords (separadas por coma)</label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Ej: hidratación, brillo, natural"
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Error */}
            {generateError && (
              <div className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{generateError}</p>
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !currentPack || !hostPersona}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
            >
              {isGenerating ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Zap className="w-5 h-5 fill-current" />
              )}
              {isGenerating ? 'Generando con Claude...' : 'Generar Script'}
            </button>
          </div>
        </div>

        {/* Realtime Metrics */}
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-mono text-zinc-500 uppercase">Métricas en Tiempo Real</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-zinc-950 rounded-xl border border-white/5">
              <div className="flex items-center gap-2 text-zinc-500 mb-1">
                <Type className="w-3 h-3" />
                <span className="text-[10px] uppercase font-bold">Palabras</span>
              </div>
              <p className="text-xl font-mono">{totalWords}</p>
            </div>
            <div className="p-3 bg-zinc-950 rounded-xl border border-white/5">
              <div className="flex items-center gap-2 text-zinc-500 mb-1">
                <Clock className="w-3 h-3" />
                <span className="text-[10px] uppercase font-bold">Duración</span>
              </div>
              <p className={`text-xl font-mono ${isCompliant ? 'text-emerald-500' : 'text-amber-500'}`}>
                {totalDuration.toFixed(1)}s
              </p>
            </div>
          </div>
          <div className={`flex items-center gap-2 p-3 rounded-xl border ${
            isCompliant
              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500'
              : 'bg-amber-500/5 border-amber-500/20 text-amber-500'
          }`}>
            {isCompliant ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-xs font-medium">
              {isCompliant ? 'Cumple con el tiempo objetivo' : 'Excede el tiempo del pack'}
            </span>
          </div>
        </div>
      </div>

      {/* Editor Panel */}
      <div className="lg:col-span-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-light tracking-tight flex items-center gap-3">
            Script Editor
            {scriptBlocks.length > 0 && (
              <span className="text-xs font-mono bg-zinc-800 text-zinc-400 px-2 py-1 rounded">
                {scriptBlocks.length} Bloques
              </span>
            )}
          </h2>
          <div className="flex items-center gap-4">
            {scriptBlocks.length > 0 && (
              <>
                <button
                  onClick={exportJson}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Exportar JSON
                </button>
                <button
                  onClick={saveToSession}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Guardar en Sesión
                </button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {scriptBlocks.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-96 border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-zinc-600 space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center">
                  <Mic className="w-8 h-8" />
                </div>
                <p className="text-sm">Configura los parámetros y genera un script para comenzar</p>
              </motion.div>
            ) : (
              scriptBlocks.map((block, index) => (
                <motion.div
                  key={block.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className={`group relative bg-zinc-900 border rounded-2xl overflow-hidden transition-all ${
                    block.speaker === 'HOST'
                      ? 'border-emerald-500/20 focus-within:border-emerald-500/50'
                      : block.speaker === 'GUEST'
                      ? 'border-blue-500/20 focus-within:border-blue-500/50'
                      : 'border-white/5 focus-within:border-white/20'
                  }`}
                >
                  <div className={`flex items-center justify-between px-4 py-2 border-b border-white/5 ${
                    block.speaker === 'HOST'
                      ? 'bg-emerald-500/10'
                      : block.speaker === 'GUEST'
                      ? 'bg-blue-500/10'
                      : 'bg-zinc-950/50'
                  }`}>
                    <div className="flex items-center gap-2">
                      {block.speaker && (
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          block.speaker === 'HOST'
                            ? 'bg-emerald-500 text-black'
                            : 'bg-blue-500 text-black'
                        }`}>
                          {block.speaker}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-zinc-500 uppercase bg-zinc-900 px-2 py-0.5 rounded">
                        {block.type}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-600">
                        BLOQUE {index + 1}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500">
                      ~{block.estimated_seconds?.toFixed(1)}s
                    </div>
                  </div>
                  <textarea
                    value={block.text}
                    onChange={(e) => handleBlockChange(block.id, e.target.value)}
                    className="w-full bg-transparent p-4 text-lg leading-relaxed resize-none focus:outline-none min-h-[100px]"
                  />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* ElevenLabs Payload Preview */}
        {elevenLabsPayload && (
          <div className="mt-12 p-8 rounded-3xl bg-zinc-950 border border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-mono text-zinc-500 uppercase">ElevenLabs Payload Preview</h3>
              <div className="flex items-center gap-2">
                {elevenLabsPayload.voice_id.startsWith('TBD') ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[10px] font-bold text-amber-500 uppercase">Voice ID Pendiente</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-500 uppercase">Ready for Synthesis</span>
                  </>
                )}
              </div>
            </div>
            <div className="bg-black/40 rounded-2xl p-6 font-mono text-xs text-zinc-400 overflow-x-auto">
              <pre>{JSON.stringify(elevenLabsPayload, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
