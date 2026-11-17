# Librería propia de sonidos — F1 (2026-11-17; base F0 del mismo día)

> **F1 (2026-11-17).** Encargo de Sam: «sí a la F1 de sonido… supongo que tendremos una buena librería de sonidos y
> efectos». La librería pasa de 7 a **25 sonidos** (recetas v2): **19 efectos** con variantes por función y **6 camas
> musicales** en bucle sin costura. El sintetizador suma una cuerda pulsada (Karplus-Strong) con excitación suavizada y
> el pliegue de cola para bucles. Se publica en `voicelab/sound-library/v2/` (archivos inmutables por versión) y se lee
> por el modo `sound` de `/api/execute` (contrato v1.1 §3 bis).
>
> | Función | Sonidos |
> |---|---|
> | `block_entry` | `sfx_block_entry_whoosh`, `sfx_block_entry_airy`, `sfx_block_entry_riser`, `sfx_block_entry_swipe` |
> | `digit_land` | `sfx_digit_tick`, `sfx_digit_click_wood`, `sfx_digit_blip` |
> | `impact` | `sfx_stamp_impact`, `sfx_impact_soft_thump`, `sfx_impact_deep_boom` |
> | `shot_cut` | `sfx_cut_swish`, `sfx_cut_air_puff` |
> | `cta` | `sfx_cta_chime`, `sfx_cta_sparkle`, `sfx_cta_rise_ding`, `sfx_cta_pluck_hook` |
> | `word_pop` | `sfx_word_pop`, `sfx_word_bubble`, `sfx_word_tap` |
> | `music_bed` | `bed_soft_pulse`, `bed_warm_pad`, `bed_pluck_bright`, `bed_marimba_light`, `bed_tension_pulse`, `bed_lofi_keys` |
>
> Medido: la librería se genera en 13 s; dos generaciones dan los mismos 25 sha256; los 25 archivos publicados son
> idénticos a los generados (sha256 de lo que sirve el almacenamiento).

---

# F0 (2026-11-17) — registro

VoiceLab es dueño de la librería de sonidos del ecosistema (reparto validado por Sam el 2026-11-17). VideoLab la consume:
coloca cada sonido en su fotograma y mezcla. Diseño completo, licencias, medidas y propuesta de tablas en VideoLab
`docs/MOTOR_SONIDO.md`; aquí sólo lo que vive en este repo.

- `sound/synth.mjs`: sintetizador determinista (osciladores, ruido con semilla, filtros, envolventes, WAV 16 bits/48 kHz).
- `sound/library.mjs`: recetas por FUNCIÓN (`sfx_block_entry_whoosh`, `sfx_digit_tick`, `sfx_stamp_impact`, `sfx_cut_swish`,
  `sfx_cta_chime`, `sfx_word_pop`, `bed_soft_pulse`). Licencia `propia`, sin atribución, sin regalías.
- `sound/build.mjs <carpeta>`: genera los WAV y `manifest.json` (clave, función, sha256, duración, licencia, receta).
  Medido: 1,6 s y dos generaciones con los mismos sha256.
- `tests/sonido_test.mjs`: determinismo, formato, claves por función, sin marcas y sin descargas.

**Pendiente de la F0, resuelto en la F1:** tabla `voicelab_sound_library`, subida de los archivos al almacenamiento y modo
`sound` en `/api/execute`, que devuelve el manifiesto que VideoLab descarga y verifica por sha256.
