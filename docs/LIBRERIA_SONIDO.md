# Librería propia de sonidos — F0 (2026-11-17)

VoiceLab es dueño de la librería de sonidos del ecosistema (reparto validado por Sam el 2026-11-17). VideoLab la consume:
coloca cada sonido en su fotograma y mezcla. Diseño completo, licencias, medidas y propuesta de tablas en VideoLab
`docs/MOTOR_SONIDO.md`; aquí sólo lo que vive en este repo.

- `sound/synth.mjs`: sintetizador determinista (osciladores, ruido con semilla, filtros, envolventes, WAV 16 bits/48 kHz).
- `sound/library.mjs`: recetas por FUNCIÓN (`sfx_block_entry_whoosh`, `sfx_digit_tick`, `sfx_stamp_impact`, `sfx_cut_swish`,
  `sfx_cta_chime`, `sfx_word_pop`, `bed_soft_pulse`). Licencia `propia`, sin atribución, sin regalías.
- `sound/build.mjs <carpeta>`: genera los WAV y `manifest.json` (clave, función, sha256, duración, licencia, receta).
  Medido: 1,6 s y dos generaciones con los mismos sha256.
- `tests/sonido_test.mjs`: determinismo, formato, claves por función, sin marcas y sin descargas.

**Pendiente (F1, con el sí de Sam):** tabla `voicelab_sound_library`, subida de los archivos al almacenamiento y modo
`sound` en `/api/execute`, que devuelve el manifiesto que VideoLab descarga y verifica por sha256.
