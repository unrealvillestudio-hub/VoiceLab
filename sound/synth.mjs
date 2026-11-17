// SINTETIZADOR PROPIO DE VOICELAB (F0 de sonido, 2026-11-17).
//
// Cada sonido de la librería sale de una fórmula de este archivo: osciladores, ruido con semilla fija, filtros y
// envolventes. Nada se descarga ni se licencia: el sonido es nuestro y no paga regalías a nadie (decisión de Sam,
// 2026-11-17: «nuestro motor y librería propia good enough sin royalties a nadie»).
//
// Determinista: misma receta → mismas muestras. No lee reloj, ni azar del sistema, ni red. El ruido sale de un
// generador con semilla (mulberry32). Las funciones matemáticas de JavaScript (Math.sin, Math.exp) no dependen del
// procesador en V8, así que el WAV sale igual en cualquier máquina; de todos modos, la librería se genera UNA vez y
// se guarda con su sha256: el render usa el archivo, no la receta.

export const RATE = 48000;

/** Generador de números con semilla (mulberry32). Devuelve una función que da valores en [0, 1). PURO. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un buffer mono de `seconds` segundos, en ceros. */
export const buffer = (seconds) => new Float64Array(Math.max(1, Math.round(seconds * RATE)));

/** Envolvente ataque–caída exponencial: sube en `attack` s y cae con constante `decay` s. */
export function envAD(i, attack, decay) {
  const t = i / RATE;
  if (t < attack) return attack > 0 ? t / attack : 1;
  return Math.exp(-(t - attack) / decay);
}

/** Envolvente de campana (sube y baja con un seno) entre 0 y `len` s, con el pico en `peak` (0–1). */
export function envBell(i, len, peak = 0.5) {
  const t = i / RATE / len;
  if (t <= 0 || t >= 1) return 0;
  return t < peak ? Math.sin((t / peak) * Math.PI / 2) ** 2 : Math.cos(((t - peak) / (1 - peak)) * Math.PI / 2) ** 2;
}

/** Filtro bicuadrático (RBJ). `type`: 'lowpass' | 'highpass' | 'bandpass'. Se puede mover la frecuencia muestra a muestra. */
export function biquad(type) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, freq, q = 0.707) => {
    const w = 2 * Math.PI * Math.min(freq, RATE * 0.45) / RATE;
    const cw = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/** Pico absoluto de un buffer. */
export const peak = (buf) => buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** Escala el buffer para que su pico quede en `db` dBFS (sin recortar). */
export function normalizePeak(buf, db = -1) {
  const p = peak(buf);
  if (p === 0) return buf;
  const g = 10 ** (db / 20) / p;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

/** WAV PCM de 16 bits, estéreo, a RATE. `left`/`right`: Float64Array en [-1, 1]. Devuelve un Buffer. */
export function wav(left, right = left) {
  const n = Math.min(left.length, right.length);
  const data = Buffer.alloc(n * 4);
  const s16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < n; i++) { data.writeInt16LE(s16(left[i]), i * 4); data.writeInt16LE(s16(right[i]), i * 4 + 2); }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/**
 * Cuerda pulsada (Karplus-Strong): una ráfaga de ruido con semilla que recorre una línea de retardo con un filtro
 * promediador. Da timbres de guitarra, arpa o marimba según `damp` (0–1, cuánto se apaga cada vuelta) y `bright`
 * (0–1, cuánto brillo conserva). Determinista: mismo `seed`, misma cuerda. Devuelve muestras mono de `seconds` s.
 */
export function pluck(freq, seconds, { seed = 1, damp = 0.996, bright = 0.5 } = {}) {
  const out = buffer(seconds);
  const n = Math.max(2, Math.round(RATE / freq));
  const line = new Float64Array(n), rnd = seeded(seed);
  // Excitación suavizada: el ruido inicial pasa por un paso bajo de un polo (más suave cuanto menos brillo). Sin esto, el
  // ataque es un chasquido de banda completa (medido en los espectrogramas de la F1).
  const c = 0.35 + 0.6 * (1 - bright);
  let lp = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { lp = c * lp + (1 - c) * (pass ? line[i] : rnd() * 2 - 1); line[i] = lp; }
  let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(line[i]));
  for (let i = 0; i < n; i++) line[i] /= mx || 1;
  let prev = 0, k = 0;
  for (let i = 0; i < out.length; i++) {
    const cur = line[k];
    const avg = bright * cur + (1 - bright) * 0.5 * (cur + prev);
    line[k] = avg * damp;
    prev = cur;
    out[i] = cur;
    k = (k + 1) % n;
  }
  return out;
}

/** Suma `src` dentro de `dst` desde la muestra `at`, con ganancia `g` (lo que se pasa del final se descarta). */
export function mixInto(dst, src, at, g = 1) {
  for (let i = 0; i < src.length && at + i < dst.length; i++) if (at + i >= 0) dst[at + i] += src[i] * g;
  return dst;
}

/**
 * Bucle sin costura: se renderiza `loop + tail` segundos y la cola (lo que suena después del final del bucle) se
 * pliega sobre el principio. Al repetir el archivo, las notas que cruzan el corte siguen sonando en vez de cortarse.
 */
export function foldLoop(buf, loopSeconds) {
  const n = Math.round(loopSeconds * RATE);
  const out = buf.slice(0, n);
  for (let i = n; i < buf.length; i++) out[(i - n) % n] += buf[i];
  return out;
}
