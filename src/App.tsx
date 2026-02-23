/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BUILD_TAG, TITLE } from './constants';
import ScriptModule from './modules/promptpack/ScriptModule';
import { useSessionOutputsStore } from './store/useSessionOutputsStore';
import { Clock, History, Trash2, ChevronRight, Mic2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const { outputs, clear } = useSessionOutputsStore();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30 flex flex-col">
      <header className="border-b border-white/10 p-4 flex justify-between items-center sticky top-0 bg-zinc-950/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center font-bold text-black shadow-lg shadow-emerald-500/20">
            V
          </div>
          <h1 className="text-xl font-medium tracking-tight">{TITLE}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs font-mono text-zinc-500 bg-zinc-900 px-2 py-1 rounded border border-white/5">
            {BUILD_TAG}
          </div>
        </div>
      </header>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            <ScriptModule />
          </div>
        </main>

        {/* Sidebar History */}
        <aside className="w-80 border-l border-white/10 bg-zinc-900/30 flex flex-col hidden xl:flex">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-mono text-zinc-500 uppercase flex items-center gap-2">
              <History className="w-4 h-4" />
              Sesión Actual
            </h3>
            {outputs.length > 0 && (
              <button 
                onClick={clear}
                className="text-zinc-600 hover:text-red-400 transition-colors"
                title="Limpiar historial"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <AnimatePresence mode="popLayout">
              {outputs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-center p-8 space-y-4">
                  <Clock className="w-8 h-8 opacity-20" />
                  <p className="text-xs">No hay scripts guardados en esta sesión.</p>
                </div>
              ) : (
                outputs.map((output) => (
                  <motion.div
                    key={output.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-4 rounded-xl bg-zinc-900 border border-white/5 hover:border-emerald-500/30 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        {output.voice.brandId}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-600">
                        {output.metadata?.totalDuration?.toFixed(1)}s
                      </span>
                    </div>
                    <h4 className="text-sm font-medium text-zinc-200 mb-1 line-clamp-1 group-hover:text-emerald-400 transition-colors">
                      {output.label}
                    </h4>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <Mic2 className="w-3 h-3" />
                      {output.voice.label}
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </div>
  );
}

