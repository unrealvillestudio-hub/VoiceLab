import React, { useState, useEffect, useMemo } from 'react';
import { Mic, Play, Save, RefreshCw, Clock, Type, AlertCircle, CheckCircle2, ChevronRight, Users, User, ArrowRightLeft, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VOICE_PACKS } from '../../config/packs';
import { VOICE_PERSONAS } from '../../config/voicePersonas';
import { PERSON_BLUEPRINTS, getBlueprintsByBrand } from '../../config/personBlueprints';
import { buildVoiceScript, estimateReadTime } from '../../services/voiceEngine';
import { useSessionOutputsStore } from '../../store/useSessionOutputsStore';
import { ScriptBlock, VoicePersona, BrandProfile, VoicePackSpec, AudioOutput } from '../../core/types';

// Mock brands for selection
const BRANDS: BrandProfile[] = [
  { id: 'diamond_details', name: 'Diamond Details', industry: 'Automotive', tone: 'Executive' },
  { id: 'd7herbal', name: 'D7Herbal', industry: 'Health', tone: 'Natural' },
  { id: 'vivose_mask', name: 'Vivosé', industry: 'Beauty', tone: 'Zen' },
  { id: 'vizos_cosmetics', name: 'Vizos', industry: 'Beauty', tone: 'Professional' },
  { id: 'patricia_osorio', name: 'Patricia Osorio', industry: 'Personal Brand', tone: 'Dynamic' },
];

export default function ScriptModule() {
  const pushOutput = useSessionOutputsStore(state => state.push);
  
  const [mode, setMode] = useState<'single' | 'podcast'>('single');
  const [selectedBrandId, setSelectedBrandId] = useState(BRANDS[0].id);
  const [selectedPackId, setSelectedPackId] = useState(Object.keys(VOICE_PACKS)[0]);
  const [productContext, setProductContext] = useState('');
  const [keywords, setKeywords] = useState('');
  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Podcast specific state
  const [hostBlueprintId, setHostBlueprintId] = useState('');
  const [guestBlueprintId, setGuestBlueprintId] = useState('');
  const [swapRoles, setSwapRoles] = useState(false);

  // Filter blueprints by brand
  const brandBlueprints = useMemo(() => {
    // Map brand IDs to the ones used in blueprints if they differ
    const brandMap: Record<string, string> = {
      'diamond_details': 'DiamondDetails',
      'd7herbal': 'D7Herbal',
      'vivose_mask': 'VivoséMask', // Note: Blueprint uses PatriciaOsorio or others
      'vizos_cosmetics': 'VizosCosmetics',
      'patricia_osorio': 'PatriciaOsorio'
    };
    const mappedBrandId = brandMap[selectedBrandId] || selectedBrandId;
    return getBlueprintsByBrand(mappedBrandId);
  }, [selectedBrandId]);

  // Set default blueprints when brandBlueprints change
  useEffect(() => {
    if (brandBlueprints.length > 0) {
      setHostBlueprintId(brandBlueprints[0].id);
      setGuestBlueprintId(brandBlueprints[1]?.id || brandBlueprints[0].id);
    }
  }, [brandBlueprints]);

  // Auto-load persona when brand changes (for single mode)
  const currentPersona = useMemo(() => {
    const brandId = selectedBrandId;
    return Object.values(VOICE_PERSONAS).find(p => p.brandId === brandId) || VOICE_PERSONAS.diamond_details;
  }, [selectedBrandId]);

  // Filter packs based on mode
  const filteredPacks = useMemo(() => {
    return Object.values(VOICE_PACKS).filter(pack => 
      mode === 'podcast' ? pack.packType === 'videopodcast' : pack.packType !== 'videopodcast'
    );
  }, [mode]);

  // Update selected pack if it's not in the filtered list
  useEffect(() => {
    if (!filteredPacks.find(p => p.id === selectedPackId)) {
      setSelectedPackId(filteredPacks[0]?.id || '');
    }
  }, [filteredPacks, selectedPackId]);

  const currentPack = useMemo(() => VOICE_PACKS[selectedPackId] || filteredPacks[0], [selectedPackId, filteredPacks]);

  // Handle generation
  const handleGenerate = () => {
    setIsGenerating(true);
    const brand = BRANDS.find(b => b.id === selectedBrandId)!;
    const kwArray = keywords.split(',').map(k => k.trim()).filter(k => k);
    
    // In a real app, we'd use the selected blueprints to influence the persona
    // For now, we use the currentPersona for single mode
    const generatedBlocks = buildVoiceScript({
      pack: currentPack,
      brand,
      persona: currentPersona,
      productContext: productContext || 'Un producto revolucionario que cambia las reglas del juego.',
      keywords: kwArray.length > 0 ? kwArray : ['calidad', 'innovación']
    });

    // If swapRoles is true, swap HOST/GUEST in blocks
    const processedBlocks = swapRoles 
      ? generatedBlocks.map(b => ({
          ...b,
          speaker: b.speaker === 'HOST' ? 'GUEST' : b.speaker === 'GUEST' ? 'HOST' : b.speaker
        }))
      : generatedBlocks;

    setScriptBlocks(processedBlocks);
    setIsGenerating(false);
  };

  const handleBlockChange = (id: string, text: string) => {
    setScriptBlocks(prev => prev.map(block => 
      block.id === id 
        ? { ...block, text, estimated_seconds: estimateReadTime(text, currentPersona.speed) }
        : block
    ));
  };

  const saveToSession = () => {
    if (scriptBlocks.length === 0) return;
    
    const output: AudioOutput = {
      id: crypto.randomUUID(),
      label: `${currentPack.label} - ${BRANDS.find(b => b.id === selectedBrandId)?.name}`,
      script: scriptBlocks,
      voice: currentPersona,
      metadata: {
        generatedAt: new Date().toISOString(),
        totalDuration: totalDuration,
        mode
      }
    };
    
    pushOutput(output);
  };

  const exportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scriptBlocks, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `script_${selectedBrandId}_${selectedPackId}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // Metrics
  const totalWords = scriptBlocks.reduce((acc, b) => acc + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0);
  const totalDuration = scriptBlocks.reduce((acc, b) => acc + (b.estimated_seconds || 0), 0);
  const isCompliant = currentPack ? totalDuration <= currentPack.total_estimated_seconds * 1.1 : true;

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
          </div>

          {/* Mode Toggle */}
          <div className="flex p-1 bg-zinc-950 border border-white/5 rounded-xl">
            <button 
              onClick={() => setMode('single')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${mode === 'single' ? 'bg-emerald-500 text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <User className="w-3 h-3" />
              Single Voice
            </button>
            <button 
              onClick={() => setMode('podcast')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${mode === 'podcast' ? 'bg-emerald-500 text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Users className="w-3 h-3" />
              VideoPodcast
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">Marca</label>
              <select 
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {BRANDS.map(brand => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
            </div>

            {mode === 'single' ? (
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs text-emerald-500 font-medium uppercase tracking-wider">Persona de Voz</p>
                  <p className="text-sm font-medium">{currentPersona.label}</p>
                  <p className="text-[10px] text-zinc-500">{currentPersona.emotion} • {currentPersona.speed}x speed</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <div className="p-3 bg-zinc-950 border border-white/5 rounded-xl">
                    <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">Host (Persona A)</label>
                    <select 
                      value={hostBlueprintId}
                      onChange={(e) => setHostBlueprintId(e.target.value)}
                      className="w-full bg-transparent text-sm focus:outline-none"
                    >
                      {brandBlueprints.map(bp => (
                        <option key={bp.id} value={bp.id}>{bp.displayName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="p-3 bg-zinc-950 border border-white/5 rounded-xl">
                    <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1">Guest (Persona B)</label>
                    <select 
                      value={guestBlueprintId}
                      onChange={(e) => setGuestBlueprintId(e.target.value)}
                      className="w-full bg-transparent text-sm focus:outline-none"
                    >
                      {brandBlueprints.map(bp => (
                        <option key={bp.id} value={bp.id}>{bp.displayName}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button 
                  onClick={() => setSwapRoles(!swapRoles)}
                  className={`w-full flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wider border rounded-lg transition-all ${swapRoles ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'border-white/5 text-zinc-500 hover:border-white/10'}`}
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  Intercambiar Roles
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">Pack de Voz</label>
              <select 
                value={selectedPackId}
                onChange={(e) => setSelectedPackId(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {filteredPacks.map(pack => (
                  <option key={pack.id} value={pack.id}>{pack.label} ({pack.total_estimated_seconds}s)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-zinc-500 uppercase mb-2">Contexto del Producto</label>
              <textarea 
                value={productContext}
                onChange={(e) => setProductContext(e.target.value)}
                placeholder="Ej: Un nuevo serum facial con ácido hialurónico..."
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

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

            <button 
              onClick={handleGenerate}
              disabled={isGenerating || !currentPack}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
            >
              {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
              Generar Script
            </button>
          </div>
        </div>

        {/* Real-time Metrics */}
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
          
          <div className={`flex items-center gap-2 p-3 rounded-xl border ${isCompliant ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500' : 'bg-amber-500/5 border-amber-500/20 text-amber-500'}`}>
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
                  transition={{ delay: index * 0.05 }}
                  className={`group relative bg-zinc-900 border rounded-2xl overflow-hidden transition-all ${
                    block.speaker === 'HOST' ? 'border-emerald-500/20 focus-within:border-emerald-500/50' : 'border-white/5 focus-within:border-white/20'
                  }`}
                >
                  <div className={`flex items-center justify-between px-4 py-2 border-b border-white/5 ${
                    block.speaker === 'HOST' ? 'bg-emerald-500/10' : 'bg-zinc-950/50'
                  }`}>
                    <div className="flex items-center gap-2">
                      {block.speaker && (
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          block.speaker === 'HOST' ? 'bg-emerald-500 text-black' : 'bg-zinc-700 text-zinc-300'
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

        {/* Output Preview for ElevenLabs */}
        {scriptBlocks.length > 0 && mode === 'single' && (
          <div className="mt-12 p-8 rounded-3xl bg-zinc-950 border border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-mono text-zinc-500 uppercase">ElevenLabs Payload Preview</h3>
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                 <span className="text-[10px] font-bold text-emerald-500 uppercase">Ready for Synthesis</span>
              </div>
            </div>
            
            <div className="bg-black/40 rounded-2xl p-6 font-mono text-xs text-zinc-400 overflow-x-auto">
              <pre>
{`{
  "voice_id": "${currentPersona.voiceId}",
  "model_id": "eleven_multilingual_v2",
  "text": "${scriptBlocks.map(b => b.text).join(' ')}",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.06,
    "use_speaker_boost": true
  }
}`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
