import { create } from 'zustand';
import { AudioOutput } from '../core/types';

interface SessionOutputsState {
  outputs: AudioOutput[];
  push: (output: AudioOutput) => void;
  clear: () => void;
}

export const useSessionOutputsStore = create<SessionOutputsState>((set) => ({
  outputs: [],
  push: (output) => set((state) => ({ outputs: [output, ...state.outputs] })),
  clear: () => set({ outputs: [] }),
}));
