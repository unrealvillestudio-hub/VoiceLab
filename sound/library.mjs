// LIBRERÍA PROPIA DE SONIDOS DE VOICELAB — recetas por FUNCIÓN, nunca por marca.
//
// F0 (2026-11-17): 7 recetas. F1 (2026-11-17, encargo de Sam: «supongo que tendremos una buena librería de sonidos y
// efectos»): 25 recetas, con variantes por función para que el carril pueda rotarlas como rota los estilos de texto, y
// 6 camas musicales de caracteres distintos en bucle sin costura.
//
// Cada entrada es una receta del sintetizador (sound/synth.mjs). La clave dice lo que el sonido HACE en el video y su
// carácter; el volumen en la mezcla es dato del preset de sonido. Licencia: `propia` (sintetizada por código, sin
// terceros, sin atribución, sin regalías).
//
// RECIPE_VERSION sube cuando cambia una receta: el archivo generado cambia y su sha256 también.

import { RATE, seeded, buffer, envAD, envBell, biquad, normalizePeak, pluck, mixInto, foldLoop } from './synth.mjs';

export const RECIPE_VERSION = 2;

const TAU = 2 * Math.PI;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const at = (s) => Math.round(s * RATE);

/** Ruido barrido por un pasabanda: el «whoosh». `from`→`to` Hz a lo largo de `len` s. */
function sweptNoise({ len, from, to, q, peakAt, seed, curve = 1 }) {
  const out = buffer(len), rnd = seeded(seed), f = biquad('bandpass');
  for (let i = 0; i < out.length; i++) {
    const p = (i / out.length) ** curve;
    out[i] = f(rnd() * 2 - 1, from * (to / from) ** p, q) * envBell(i, len, peakAt);
  }
  return out;
}
const stereo = (mono, db) => { normalizePeak(mono, db); return [mono, mono]; };
const pair = (L, R, db) => { let p = 0; for (let i = 0; i < L.length; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i])); const g = 10 ** (db / 20) / (p || 1); for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; } return [L, R]; };

/** Campana de parciales inarmónicos (frecuencia base, duración, brillo 0–1). */
function bell(base, len, bright = 1) {
  const out = buffer(len);
  const parts = [[1, 1, 0.9], [2.756, 0.5 * bright, 0.5], [5.404, 0.3 * bright, 0.3], [8.933, 0.15 * bright, 0.15]];
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    let v = 0;
    for (const [r, a, dc] of parts) v += a * Math.sin(TAU * base * r * t) * Math.exp(-t / dc);
    out[i] = v * Math.min(1, t / 0.002);
  }
  return out;
}

/** Bombo suave: seno con caída de tono. */
function kick(len = 0.4, { from = 95, to = 48, decay = 0.14 } = {}) {
  const out = buffer(len);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    ph += TAU * (to + (from - to) * Math.exp(-t / 0.03)) / RATE;
    out[i] = Math.sin(ph) * Math.exp(-t / decay);
  }
  return out;
}
/** Platillo cerrado: ruido agudo muy corto. */
function hat(seed, len = 0.06, cut = 7500) {
  const out = buffer(len), rnd = seeded(seed), hp = biquad('highpass');
  for (let i = 0; i < out.length; i++) out[i] = hp(rnd() * 2 - 1, cut) * envAD(i, 0.0005, 0.015);
  return out;
}
/** Caja suave: ruido de banda media con cuerpo. */
function snare(seed, len = 0.25) {
  const out = buffer(len), rnd = seeded(seed), bp = biquad('bandpass');
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] = bp(rnd() * 2 - 1, 1800, 0.8) * envAD(i, 0.001, 0.06) + 0.4 * Math.sin(TAU * 190 * t) * envAD(i, 0.001, 0.04);
  }
  return out;
}

/** Colchón de acordes (sierras sumadas con armónicos, voces desafinadas, abiertas en estéreo, paso bajo). */
function padInto(L, R, notes, start, dur, { cut = 1100, attack = 0.35, release = 0.6, gain = 0.05, det = [-0.06, 0, 0.07] } = {}) {
  const s0 = at(start), n = at(dur + release);
  const lpL = biquad('lowpass'), lpR = biquad('lowpass');
  for (let i = 0; i < n && s0 + i < L.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / attack) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / release));
    let l = 0, r = 0;
    for (const m of notes) {
      det.forEach((d, k) => {
        const f = hz(m + d), pan = (k + 0.5) / det.length;
        let s = 0;
        for (let h = 1; h <= 10; h++) s += Math.sin(TAU * f * h * (start + t)) / h;
        l += s * (1 - pan); r += s * pan;
      });
    }
    L[s0 + i] += lpL(l, cut) * env * gain;
    R[s0 + i] += lpR(r, cut) * env * gain;
  }
}

/** Una cama de `bars` compases a `bpm`, en bucle sin costura: `fill(L, R, beat)` escribe en buffers con cola. */
function bed(bpm, bars, fill, tail = 2) {
  const beat = 60 / bpm, loop = bars * 4 * beat;
  const L = buffer(loop + tail), R = buffer(loop + tail);
  fill(L, R, beat);
  return pair(foldLoop(L, loop), foldLoop(R, loop), -6);
}

const RECIPES = {
  // ── Entrada de bloque ──────────────────────────────────────────────────────────────────────────
  sfx_block_entry_whoosh: { fn: 'block_entry', description: 'Soplo de aire que sube y se abre (0,45 s).',
    render: () => pair(sweptNoise({ len: 0.45, from: 350, to: 3200, q: 1.1, peakAt: 0.62, seed: 11 }), sweptNoise({ len: 0.45, from: 380, to: 3000, q: 1.1, peakAt: 0.62, seed: 12 }), -3) },
  sfx_block_entry_airy: { fn: 'block_entry', description: 'Soplo largo y aireado, más agudo (0,7 s).',
    render: () => pair(sweptNoise({ len: 0.7, from: 900, to: 6500, q: 0.8, peakAt: 0.7, seed: 13, curve: 0.8 }), sweptNoise({ len: 0.7, from: 950, to: 6000, q: 0.8, peakAt: 0.7, seed: 14, curve: 0.8 }), -4) },
  sfx_block_entry_riser: { fn: 'block_entry', description: 'Subida corta (0,6 s): ruido y tono que crecen hasta el golpe de entrada.',
    render() {
      const out = buffer(0.6), rnd = seeded(15), bp = biquad('bandpass');
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const p = i / out.length;
        ph += TAU * (220 * 2 ** (p * 2)) / RATE;
        out[i] = (0.6 * Math.sin(ph) + 0.8 * bp(rnd() * 2 - 1, 500 * 2 ** (p * 3), 1.4)) * p ** 2 * (p < 0.97 ? 1 : (1 - p) / 0.03);
      }
      return stereo(out, -4);
    } },
  sfx_block_entry_swipe: { fn: 'block_entry', description: 'Barrido rápido y limpio (0,18 s), para entradas que deslizan.',
    render: () => pair(sweptNoise({ len: 0.18, from: 1200, to: 7000, q: 1.6, peakAt: 0.5, seed: 16 }), sweptNoise({ len: 0.18, from: 1300, to: 6500, q: 1.6, peakAt: 0.5, seed: 17 }), -5) },

  // ── Cifra que cae (rodillo) ───────────────────────────────────────────────────────────────────
  sfx_digit_tick: { fn: 'digit_land', description: 'Tic corto y seco (50 ms).',
    render() {
      const out = buffer(0.05), rnd = seeded(21), hp = biquad('highpass');
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        out[i] = (Math.sin(TAU * 2200 * t) + 0.4 * Math.sin(TAU * 3350 * t)) * envAD(i, 0.0005, 0.008) + 0.5 * hp(rnd() * 2 - 1, 4000) * envAD(i, 0.0002, 0.003);
      }
      return stereo(out, -6);
    } },
  sfx_digit_click_wood: { fn: 'digit_land', description: 'Clic de madera (40 ms), cálido.',
    render() {
      const out = buffer(0.04), rnd = seeded(22), bp = biquad('bandpass');
      for (let i = 0; i < out.length; i++) out[i] = bp(rnd() * 2 - 1, 1150, 6) * envAD(i, 0.0003, 0.007);
      return stereo(out, -6);
    } },
  sfx_digit_blip: { fn: 'digit_land', description: 'Blip electrónico breve (35 ms).',
    render() {
      const out = buffer(0.035);
      for (let i = 0; i < out.length; i++) { const t = i / RATE; out[i] = (Math.sin(TAU * 1760 * t) + 0.3 * Math.sin(TAU * 2640 * t)) * envAD(i, 0.001, 0.01); }
      return stereo(out, -8);
    } },

  // ── Golpe / sello ─────────────────────────────────────────────────────────────────────────────
  sfx_stamp_impact: { fn: 'impact', description: 'Golpe grave con chasquido (0,5 s), de sello.',
    render() {
      const out = buffer(0.5), rnd = seeded(31), lp = biquad('lowpass');
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        ph += TAU * (45 + 65 * Math.exp(-t / 0.04)) / RATE;
        out[i] = Math.sin(ph) * envAD(i, 0.002, 0.12) + 0.6 * lp(rnd() * 2 - 1, 900) * envAD(i, 0.001, 0.03);
      }
      return stereo(out, -1);
    } },
  sfx_impact_soft_thump: { fn: 'impact', description: 'Golpe suave y redondo (0,35 s), sin chasquido.',
    render: () => stereo(kick(0.35, { from: 120, to: 60, decay: 0.09 }), -3) },
  sfx_impact_deep_boom: { fn: 'impact', description: 'Golpe profundo con cola (1,2 s), para un dato grande.',
    render() {
      const out = buffer(1.2), rnd = seeded(33), lp = biquad('lowpass');
      let ph = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        ph += TAU * (32 + 80 * Math.exp(-t / 0.06)) / RATE;
        out[i] = Math.sin(ph) * envAD(i, 0.003, 0.35) + 0.35 * lp(rnd() * 2 - 1, 400) * envAD(i, 0.002, 0.25);
      }
      return stereo(out, -1);
    } },

  // ── Corte de toma ─────────────────────────────────────────────────────────────────────────────
  sfx_cut_swish: { fn: 'shot_cut', description: 'Roce breve y agudo (0,25 s), discreto.',
    render: () => pair(sweptNoise({ len: 0.25, from: 6500, to: 1800, q: 0.9, peakAt: 0.3, seed: 41 }), sweptNoise({ len: 0.25, from: 6000, to: 1700, q: 0.9, peakAt: 0.3, seed: 42 }), -6) },
  sfx_cut_air_puff: { fn: 'shot_cut', description: 'Soplo grave y suave (0,18 s), casi imperceptible.',
    render: () => pair(sweptNoise({ len: 0.18, from: 900, to: 300, q: 0.7, peakAt: 0.35, seed: 43 }), sweptNoise({ len: 0.18, from: 850, to: 280, q: 0.7, peakAt: 0.35, seed: 44 }), -6) },

  // ── Llamada a la acción ───────────────────────────────────────────────────────────────────────
  sfx_cta_chime: { fn: 'cta', description: 'Dos notas de campana (1,6 s), tónica y quinta.',
    render() {
      const out = buffer(1.6);
      mixInto(out, bell(880, 1.6), 0, 1); mixInto(out, bell(1318.5, 1.5), at(0.12), 0.8);
      return stereo(out, -3);
    } },
  sfx_cta_sparkle: { fn: 'cta', description: 'Tres notas de campana que suben (1,4 s), brillantes.',
    render() {
      const L = buffer(1.4), R = buffer(1.4);
      [[1046.5, 0, 0.9, 0.3], [1318.5, 0.08, 0.8, 0.5], [1568, 0.16, 0.75, 0.7]].forEach(([f, d, g, pan]) => {
        const b = bell(f, 1.2, 0.8); mixInto(L, b, at(d), g * (1 - pan)); mixInto(R, b, at(d), g * pan);
      });
      return pair(L, R, -3);
    } },
  sfx_cta_rise_ding: { fn: 'cta', description: 'Subida breve que remata en una campana (1,4 s).',
    render() {
      const out = buffer(1.4), rnd = seeded(53), bp = biquad('bandpass');
      for (let i = 0; i < at(0.4); i++) { const p = i / at(0.4); out[i] += 0.5 * bp(rnd() * 2 - 1, 600 * 2 ** (p * 3), 1.2) * p ** 2; }
      mixInto(out, bell(1174.7, 1.0), at(0.4), 1);
      return stereo(out, -3);
    } },
  sfx_cta_pluck_hook: { fn: 'cta', description: 'Dos notas de cuerda pulsada (1,2 s), cálidas, como una guitarra.',
    render() {
      const out = buffer(1.2);
      mixInto(out, pluck(hz(64), 1.2, { seed: 54, damp: 0.995, bright: 0.4 }), 0, 1);
      mixInto(out, pluck(hz(71), 1.0, { seed: 55, damp: 0.995, bright: 0.4 }), at(0.16), 0.9);
      const lp = biquad('lowpass'); for (let i = 0; i < out.length; i++) out[i] = lp(out[i], 4500);
      return stereo(out, -3);
    } },

  // ── Palabra o tarjeta que salta ───────────────────────────────────────────────────────────────
  sfx_word_pop: { fn: 'word_pop', description: 'Pop corto (0,12 s).',
    render() {
      const out = buffer(0.12);
      let ph = 0;
      for (let i = 0; i < out.length; i++) { const t = i / RATE; ph += TAU * (300 + 300 * Math.exp(-t / 0.015)) / RATE; out[i] = Math.sin(ph) * envAD(i, 0.001, 0.03); }
      return stereo(out, -6);
    } },
  sfx_word_bubble: { fn: 'word_pop', description: 'Burbuja que sube (0,1 s), simpática.',
    render() {
      const out = buffer(0.1);
      let ph = 0;
      for (let i = 0; i < out.length; i++) { const p = i / out.length; ph += TAU * (400 + 900 * p ** 1.5) / RATE; out[i] = Math.sin(ph) * envBell(i, 0.1, 0.25); }
      return stereo(out, -6);
    } },
  sfx_word_tap: { fn: 'word_pop', description: 'Toque suave (30 ms), como un dedo en la pantalla.',
    render() {
      const out = buffer(0.03), rnd = seeded(63), lp = biquad('lowpass');
      for (let i = 0; i < out.length; i++) { const t = i / RATE; out[i] = 0.7 * Math.sin(TAU * 520 * t) * envAD(i, 0.0005, 0.006) + 0.5 * lp(rnd() * 2 - 1, 2500) * envAD(i, 0.0003, 0.003); }
      return stereo(out, -8);
    } },

  // ── Camas musicales (bucle de 4 compases, sin costura) ────────────────────────────────────────
  bed_soft_pulse: { fn: 'music_bed', description: 'Colchón cálido La menor–Fa–Do–Sol con pulso grave suave (100 ppm).',
    render: () => bed(100, 4, (L, R, beat) => {
      [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]].forEach((c, k) => padInto(L, R, c, k * 4 * beat, 4 * beat - 0.1));
      for (let b = 0; b < 16; b++) { mixInto(L, kick(), at(b * beat), 0.35); mixInto(R, kick(), at(b * beat), 0.35); }
      for (let b = 0; b < 16; b++) { const h = hat(700 + b, 0.05); mixInto(L, h, at((b + 0.5) * beat), 0.05); mixInto(R, h, at((b + 0.5) * beat), 0.05); }
    }) },
  bed_warm_pad: { fn: 'music_bed', description: 'Sólo colchón, sin ritmo: Re maj7–Si m7–Sol maj7–La, lento y cálido (70 ppm). Para testimonios y voces largas.',
    render: () => bed(70, 4, (L, R, beat) => {
      [[50, 54, 57, 61], [47, 50, 54, 57], [43, 47, 50, 54], [45, 49, 52, 57]].forEach((c, k) => padInto(L, R, c, k * 4 * beat, 4 * beat - 0.05, { cut: 1700, attack: 1.2, release: 1.5, gain: 0.035 }));
    }, 2.5) },
  bed_pluck_bright: { fn: 'music_bed', description: 'Arpegio de cuerda pulsada Do–Sol–La m–Fa con bombo y platillo suaves (110 ppm). Animada y clara.',
    render: () => bed(110, 4, (L, R, beat) => {
      const ch = [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]];
      ch.forEach((c, k) => {
        padInto(L, R, c.map((m) => m - 12), k * 4 * beat, 4 * beat - 0.05, { cut: 700, gain: 0.02 });
        for (let e = 0; e < 8; e++) {
          const p = pluck(hz(c[e % 4] + (e >= 4 ? 12 : 0)), 1.2, { seed: 800 + k * 8 + e, damp: 0.993, bright: 0.55 });
          const pan = 0.3 + 0.4 * (e % 2);
          mixInto(L, p, at((k * 4 + e / 2) * beat), 0.22 * (1 - pan)); mixInto(R, p, at((k * 4 + e / 2) * beat), 0.22 * pan);
        }
      });
      for (let b = 0; b < 16; b++) { if (b % 2 === 0) { mixInto(L, kick(), at(b * beat), 0.3); mixInto(R, kick(), at(b * beat), 0.3); } }
      for (let e = 0; e < 32; e++) { const h = hat(900 + e); mixInto(L, h, at(e * beat / 2), 0.04); mixInto(R, h, at(e * beat / 2), 0.04); }
    }) },
  bed_marimba_light: { fn: 'music_bed', description: 'Marimba en Fa mayor con un ritmo ligero (100 ppm). Amable, para consejos y datos útiles.',
    render: () => bed(100, 4, (L, R, beat) => {
      const pat = [65, 69, 72, 69, 67, 70, 74, 70, 65, 69, 72, 77, 72, 70, 67, 64];
      for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 8; s++) {
        const m = pat[(bar % 2) * 8 + s];
        const p = pluck(hz(m), 0.5, { seed: 1000 + bar * 8 + s, damp: 0.97, bright: 0.8 });
        const t = (bar * 4 + s / 2) * beat, pan = s % 2 ? 0.65 : 0.35;
        mixInto(L, p, at(t), 0.25 * (1 - pan)); mixInto(R, p, at(t), 0.25 * pan);
      }
      [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]].forEach((c, k) => padInto(L, R, c, k * 4 * beat, 4 * beat - 0.05, { cut: 800, gain: 0.02 }));
      for (let b = 0; b < 16; b++) { const h = hat(1100 + b, 0.08, 6000); mixInto(L, h, at((b + 0.5) * beat), 0.06); mixInto(R, h, at((b + 0.5) * beat), 0.06); }
    }) },
  bed_tension_pulse: { fn: 'music_bed', description: 'Tensión contenida: bordón grave en Re menor y un tic de reloj (90 ppm). Para cifras, alertas y cuentas.',
    render: () => bed(90, 4, (L, R, beat) => {
      padInto(L, R, [38, 45, 50], 0, 16 * beat + 1, { cut: 500, attack: 1, release: 1.5, gain: 0.05 });
      for (let s = 0; s < 64; s++) { const tk = hat(1200 + s, 0.03, s % 4 === 0 ? 3000 : 5000); mixInto(L, tk, at(s * beat / 4), s % 4 === 0 ? 0.12 : 0.05); mixInto(R, tk, at(s * beat / 4), s % 4 === 0 ? 0.12 : 0.05); }
      for (let b = 0; b < 16; b += 2) { const k = kick(0.5, { from: 70, to: 40, decay: 0.2 }); mixInto(L, k, at(b * beat), 0.3); mixInto(R, k, at(b * beat), 0.3); }
    }) },
  bed_lofi_keys: { fn: 'music_bed', description: 'Teclas cálidas Fa maj7–Mi m7–Re m7–Do maj7 con ritmo relajado (80 ppm). Cercana, para estilo de vida.',
    render: () => bed(80, 4, (L, R, beat) => {
      [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]].forEach((c, k) => {
        for (const [off, vel] of [[0, 0.22], [1.5, 0.14], [2.5, 0.16]]) c.forEach((m, j) => {
          const p = pluck(hz(m + 12), 1.6, { seed: 1300 + k * 40 + j + off * 10, damp: 0.996, bright: 0.25 });
          mixInto(L, p, at((k * 4 + off) * beat + j * 0.012), vel * (j % 2 ? 0.4 : 0.6)); mixInto(R, p, at((k * 4 + off) * beat + j * 0.012), vel * (j % 2 ? 0.6 : 0.4));
        });
      });
      for (let b = 0; b < 16; b++) {
        if (b % 4 === 0 || b % 4 === 2) { mixInto(L, kick(0.4, { from: 85, to: 50, decay: 0.12 }), at(b * beat), 0.3); mixInto(R, kick(0.4, { from: 85, to: 50, decay: 0.12 }), at(b * beat), 0.3); }
        if (b % 4 === 1 || b % 4 === 3) { const s = snare(1500 + b); mixInto(L, s, at(b * beat), 0.12); mixInto(R, s, at(b * beat), 0.12); }
      }
    }) },
};

/** Las recetas de la librería: [{ key, fn, description }]. */
export const LIBRARY = Object.freeze(Object.entries(RECIPES).map(([key, r]) => ({ key, fn: r.fn, description: r.description })));

/** Renderiza una receta: [izquierda, derecha] en Float64Array. */
export function renderSound(key) {
  const r = RECIPES[key];
  if (!r) throw new Error(`receta desconocida: ${key}`);
  return r.render();
}
