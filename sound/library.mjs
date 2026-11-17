// LIBRERÍA PROPIA DE SONIDOS DE VOICELAB (F0, 2026-11-17) — recetas por FUNCIÓN, nunca por marca.
//
// Cada entrada es una receta del sintetizador (sound/synth.mjs). La clave dice lo que el sonido HACE en el video
// (entrada de bloque, golpe de cifra, corte de toma...), no a quién se le hizo: cualquier marca la usa igual y su
// volumen en la mezcla es dato del preset de sonido. Licencia: `propia` (sintetizada por código, sin terceros).
//
// RECIPE_VERSION sube cuando cambia una receta: el archivo generado cambia y su sha256 también.

import { RATE, seeded, buffer, envAD, envBell, biquad, normalizePeak } from './synth.mjs';

export const RECIPE_VERSION = 1;

const TAU = 2 * Math.PI;

/** Ruido barrido por un pasabanda: el «whoosh». `from`→`to` Hz a lo largo de `len` s. */
function sweptNoise({ len, from, to, q, peakAt, seed, curve = 1 }) {
  const out = buffer(len), rnd = seeded(seed), f = biquad('bandpass');
  for (let i = 0; i < out.length; i++) {
    const p = (i / out.length) ** curve;
    const fr = from * (to / from) ** p;
    out[i] = f(rnd() * 2 - 1, fr, q) * envBell(i, len, peakAt);
  }
  return out;
}

const RECIPES = {
  // Entrada de un bloque de texto (gancho, título clave): un soplo que sube y se abre.
  sfx_block_entry_whoosh: {
    fn: 'block_entry', description: 'Soplo de aire que sube y se abre (0,45 s), para la entrada de un bloque de texto.',
    render() {
      const L = sweptNoise({ len: 0.45, from: 350, to: 3200, q: 1.1, peakAt: 0.62, seed: 11 });
      const R = sweptNoise({ len: 0.45, from: 380, to: 3000, q: 1.1, peakAt: 0.62, seed: 12 });
      return [normalizePeak(L, -3), normalizePeak(R, -3)];
    },
  },
  // Cifra que cae en su valor (rodillo): un tic corto y seco.
  sfx_digit_tick: {
    fn: 'digit_land', description: 'Tic corto y seco (50 ms) cuando una cifra cae en su valor.',
    render() {
      const out = buffer(0.05), rnd = seeded(21), hp = biquad('highpass');
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        const tone = Math.sin(TAU * 2200 * t) + 0.4 * Math.sin(TAU * 3350 * t);
        out[i] = tone * envAD(i, 0.0005, 0.008) + 0.5 * hp(rnd() * 2 - 1, 4000) * envAD(i, 0.0002, 0.003);
      }
      normalizePeak(out, -6);
      return [out, out];
    },
  },
  // Sello o golpe (título que cae): un golpe grave con un chasquido encima.
  sfx_stamp_impact: {
    fn: 'impact', description: 'Golpe grave con chasquido (0,5 s), para un título que cae como sello.',
    render() {
      const out = buffer(0.5), rnd = seeded(31), lp = biquad('lowpass');
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        ph += TAU * (45 + 65 * Math.exp(-t / 0.04)) / RATE;
        out[i] = Math.sin(ph) * envAD(i, 0.002, 0.12) + 0.6 * lp(rnd() * 2 - 1, 900) * envAD(i, 0.001, 0.03);
      }
      normalizePeak(out, -1);
      return [out, out];
    },
  },
  // Corte de toma: un roce breve y agudo, discreto.
  sfx_cut_swish: {
    fn: 'shot_cut', description: 'Roce breve y agudo (0,25 s), discreto, en un corte de toma.',
    render() {
      const L = sweptNoise({ len: 0.25, from: 6500, to: 1800, q: 0.9, peakAt: 0.3, seed: 41 });
      const R = sweptNoise({ len: 0.25, from: 6000, to: 1700, q: 0.9, peakAt: 0.3, seed: 42 });
      return [normalizePeak(L, -6), normalizePeak(R, -6)];
    },
  },
  // Llamada a la acción: dos notas de campana (tónica y quinta).
  sfx_cta_chime: {
    fn: 'cta', description: 'Dos notas de campana (1,6 s), tónica y quinta, para la llamada a la acción.',
    render() {
      const out = buffer(1.6);
      const bell = (base, delay, amp) => {
        const parts = [[1, 1, 0.9], [2.756, 0.5, 0.5], [5.404, 0.3, 0.3], [8.933, 0.15, 0.15]];
        const d0 = Math.round(delay * RATE);
        for (let i = d0; i < out.length; i++) {
          const t = (i - d0) / RATE;
          let v = 0;
          for (const [r, a, dc] of parts) v += a * Math.sin(TAU * base * r * t) * Math.exp(-t / dc);
          out[i] += amp * v * Math.min(1, t / 0.002);
        }
      };
      bell(880, 0, 1); bell(1318.5, 0.12, 0.8);
      normalizePeak(out, -3);
      return [out, out];
    },
  },
  // Palabra que salta: un «pop» corto.
  sfx_word_pop: {
    fn: 'word_pop', description: 'Pop corto (0,12 s) para una palabra o tarjeta que salta.',
    render() {
      const out = buffer(0.12);
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        ph += TAU * (300 + 300 * Math.exp(-t / 0.015)) / RATE;
        out[i] = Math.sin(ph) * envAD(i, 0.001, 0.03);
      }
      normalizePeak(out, -6);
      return [out, out];
    },
  },
  // Cama musical: 4 compases a 100 ppm (9,6 s, se repite), La menor – Fa – Do – Sol, colchón suave y pulso grave.
  bed_soft_pulse: {
    fn: 'music_bed', description: 'Cama musical en bucle de 9,6 s (100 ppm): colchón cálido La menor–Fa–Do–Sol y pulso grave suave.',
    render() {
      const len = 9.6, beat = 0.6, bar = 2.4;
      const L = buffer(len), R = buffer(len), rnd = seeded(71);
      const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // MIDI: Am, F, C, G
      const hz = (m) => 440 * 2 ** ((m - 69) / 12);
      const lpL = biquad('lowpass'), lpR = biquad('lowpass'), hpS = biquad('highpass');
      for (let i = 0; i < L.length; i++) {
        const t = i / RATE, ci = Math.floor(t / bar), tc = t - ci * bar;
        // Colchón: tres voces por nota, levemente desafinadas, con armónicos de sierra hasta el 10.º, abiertos en estéreo.
        const env = Math.min(1, tc / 0.35) * Math.min(1, (bar - tc) / 0.25 + 0.25);
        let l = 0, r = 0;
        for (const m of chords[ci % 4]) {
          for (const [det, pan] of [[-0.06, 0.8], [0, 0.5], [0.07, 0.2]]) {
            const f = hz(m + det);
            let s = 0;
            for (let k = 1; k <= 10; k++) s += Math.sin(TAU * f * k * t) / k;
            l += s * pan; r += s * (1 - pan);
          }
        }
        l = lpL(l, 1100) * env; r = lpR(r, 1100) * env;
        // Pulso grave en cada tiempo.
        const tb = t % beat;
        const kick = Math.sin(TAU * (50 + 40 * Math.exp(-tb / 0.03)) * tb) * Math.exp(-tb / 0.14) * 0.9;
        // Brillo apenas audible a contratiempo.
        const off = (t + beat / 2) % beat;
        const sh = hpS(rnd() * 2 - 1, 7000) * Math.exp(-off / 0.02) * 0.025;
        L[i] = l * 0.05 + kick * 0.5 + sh; R[i] = r * 0.05 + kick * 0.5 + sh;
      }
      let g = 0;
      for (let i = 0; i < L.length; i++) g = Math.max(g, Math.abs(L[i]), Math.abs(R[i]));
      const k = 10 ** (-6 / 20) / g;
      for (let i = 0; i < L.length; i++) { L[i] *= k; R[i] *= k; }
      return [L, R];
    },
  },
};

/** Las recetas de la librería: [{ key, fn, description }]. */
export const LIBRARY = Object.freeze(Object.entries(RECIPES).map(([key, r]) => ({ key, fn: r.fn, description: r.description })));

/** Renderiza una receta: [izquierda, derecha] en Float64Array. */
export function renderSound(key) {
  const r = RECIPES[key];
  if (!r) throw new Error(`receta desconocida: ${key}`);
  return r.render();
}
