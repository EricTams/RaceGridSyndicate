// Sound effects. Interface, radio and race-info sounds are synthesized here like the music (a recipe per sound);
// physical ones (guns, hits, wrecks, the pit air gun, stamps) can also play recorded samples from game/sfx/
// (sources in assets/sfx/SOURCES.md), run through a little lowpass and drive so they sit with the synth and the
// pixel look. Every sample sound has a synth version too, used until its files load and selectable in ?sfx.
// One entry point: sfx(id, {car, pan, gain, dur}). Each sound has a minimum gap and a voice cap in real time, so
// 4× sim speed gives a capped stream rather than 4× the noise. The race is sparse on purpose: mostly your cars.
'use strict';

const SFX = {
  blocked: (q => ['music', 'tracks', 'bake'].some(k => q.has(k)) || q.has('autoplay') && !q.has('watch'))(new URLSearchParams(location.search)),
  last: {}, voices: {}, lastAt: 0, buffers: {}, loading: false,
  variant: {},   // id → 'synth' to force the synth version of a sample sound (the ?sfx page sets it)
};

// [minimum gap in seconds, most at once]; anything unlisted gets SFX_RATE_DEFAULT.
const SFX_RATE_DEFAULT = [0.04, 3];
const SFX_RATE = {
  gun: [0.12, 3], hit: [0.1, 3], radio: [0.35, 1], radioYou: [0.2, 1], radioBad: [0.3, 1], posUp: [0.6, 1], posDown: [1.2, 1],
  wreckFar: [0.4, 2], click: [0.03, 2], pill: [0.05, 1], airgun: [0.3, 2],
};

// ---- building blocks ----
// A sound's output: gain → stereo pan → the SFX bus, plus an optional reverb send.
function sfxOut(o) {
  const ctx = AUDIO.ctx, g = ctx.createGain(), p = ctx.createStereoPanner();
  g.gain.value = o.gain ?? 1; p.pan.value = Math.max(-1, Math.min(1, o.pan || 0));
  g.connect(p); p.connect(AUDIO.sfx);
  if (o.verb) { const v = ctx.createGain(); v.gain.value = o.verb; p.connect(v); v.connect(AUDIO.sfxVerb); }
  return g;
}
// One oscillator note: hz (gliding to `to`), a fast attack and an exponential decay, through an optional filter.
function sTone(out, t, p) {
  const ctx = AUDIO.ctx, dur = p.dur, g = ctx.createGain(), o = osc(p.wave || 'square', p.hz, t, t + dur + 0.02, p.detune || 0);
  if (p.to) o.frequency.exponentialRampToValueAtTime(p.to, t + (p.glide || dur));
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p.gain, t + (p.a || 0.004));
  if (p.hold) g.gain.setValueAtTime(p.gain, t + (p.a || 0.004) + p.hold);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  let node = o;
  if (p.cut) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.cut; f.Q.value = p.q || 0.7; o.connect(f); node = f; }
  node.connect(g); g.connect(out);
  return t + dur;
}
// Filtered noise with a decay; the filter can sweep from f to `to`.
function sNoise(out, t, p) {
  const ctx = AUDIO.ctx, dur = p.dur, g = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = p.type || 'bandpass'; f.Q.value = p.q || 1;
  f.frequency.setValueAtTime(p.f, t); if (p.to) f.frequency.exponentialRampToValueAtTime(p.to, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p.gain, t + (p.a || 0.002));
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  noiseSrc(t, t + dur).connect(f); f.connect(g); g.connect(out);
  return t + dur;
}
// A metal ping: a few inharmonic partials ringing down.
function sMetal(out, t, hz, gain, dur, ratios = [1, 1.47, 2.09, 2.56]) {
  ratios.forEach((r, k) => sTone(out, t, {wave: 'sine', hz: hz * r, dur: dur / (1 + k * 0.4), gain: gain / (1 + k * 0.6)}));
  return t + dur;
}
// A thump: a sine falling fast in pitch (a kick drum's body).
const sThump = (out, t, from, to, dur, gain) => sTone(out, t, {wave: 'sine', hz: from, to, glide: dur * 0.4, dur, gain, a: 0.002});
const sNote = midiHz;   // notes by MIDI number: 69 = A4

// ---- the synth recipes: (start time, output node, options) → end time ----
const SFX_SYNTH = {
  // Interface
  click: (t, out) => { sTone(out, t, {hz: 1800, dur: 0.035, gain: 0.07, cut: 4000}); return sNoise(out, t, {type: 'highpass', f: 6000, dur: 0.012, gain: 0.05}); },
  pill: (t, out) => sTone(out, t, {hz: 1500, dur: 0.03, gain: 0.07, cut: 3500}),
  tab: (t, out) => sTone(out, t, {wave: 'triangle', hz: 1100, to: 1500, dur: 0.06, gain: 0.14}),
  bannerIn: (t, out) => sNoise(out, t, {f: 350, to: 2600, q: 1.5, dur: 0.3, gain: 0.45, a: 0.12}),    // the race title card flying in...
  bannerOut: (t, out) => sNoise(out, t, {f: 2600, to: 300, q: 1.5, dur: 0.3, gain: 0.3, a: 0.04}),   // ...and out
  cashIn: (t, out) => { sTone(out, t, {hz: sNote(88), dur: 0.07, gain: 0.07, cut: 6000}); return sTone(out, t + 0.07, {hz: sNote(93), dur: 0.22, gain: 0.07, cut: 6000}); },
  cashOut: (t, out) => { sTone(out, t, {wave: 'sawtooth', hz: sNote(81), dur: 0.08, gain: 0.07, cut: 2500}); return sTone(out, t + 0.08, {wave: 'sawtooth', hz: sNote(76), dur: 0.2, gain: 0.07, cut: 1800}); },
  card: (t, out) => { sNoise(out, t, {f: 2400, to: 700, q: 1.2, dur: 0.12, gain: 0.12}); return sTone(out, t + 0.06, {hz: 1300, dur: 0.04, gain: 0.07, cut: 3500}); },
  lock: (t, out) => { sThump(out, t, 190, 60, 0.18, 0.22); sNoise(out, t, {type: 'highpass', f: 3000, dur: 0.02, gain: 0.12}); return sTone(out, t + 0.05, {hz: sNote(64), dur: 0.15, gain: 0.06, cut: 2000}); },
  arrive: (t, out) => { sTone(out, t, {wave: 'triangle', hz: sNote(76), dur: 0.35, gain: 0.12}); return sTone(out, t + 0.12, {wave: 'triangle', hz: sNote(83), dur: 0.6, gain: 0.12}); },
  // Stingers (in A minor, which most of the race playlist sits near)
  perfect: (t, out) => { [69, 73, 76, 81, 85].forEach((m, k) => sTone(out, t + k * 0.06, {wave: 'sawtooth', hz: sNote(m), dur: k === 4 ? 0.7 : 0.18, gain: 0.07, cut: 3200, detune: k % 2 ? 7 : -7}));
    return sNoise(out, t + 0.24, {type: 'highpass', f: 5000, dur: 0.9, gain: 0.06}) + 0.2; },
  promo: (t, out) => { sNoise(out, t, {f: 300, to: 6000, q: 3, dur: 0.6, gain: 0.12, a: 0.55});
    [57, 64, 69, 72, 76].forEach(m => sTone(out, t + 0.6, {wave: 'sawtooth', hz: sNote(m), dur: 1.4, gain: 0.05, cut: 2600, hold: 0.3, detune: m % 2 ? 8 : -8}));
    return sNoise(out, t + 0.6, {type: 'highpass', f: 4500, dur: 1.6, gain: 0.08}); },
  releg: (t, out) => { [64, 60, 57, 52].forEach((m, k) => sTone(out, t + k * 0.16, {wave: 'sawtooth', hz: sNote(m), to: sNote(m) * 0.97, dur: k === 3 ? 1.1 : 0.3, gain: 0.07, cut: 1200}));
    return sThump(out, t + 0.48, 90, 35, 0.9, 0.3); },
  season: (t, out) => { [45, 52, 57, 60, 64].forEach(m => sTone(out, t, {wave: 'sawtooth', hz: sNote(m), dur: 1.8, gain: 0.045, cut: 1800, a: 0.4, hold: 0.4, detune: m % 2 ? 9 : -9}));
    return sNoise(out, t, {f: 500, to: 3000, q: 2, dur: 1.8, gain: 0.05, a: 0.6}); },
  // Race start and finish
  light: (t, out) => sTone(out, t, {hz: sNote(70), dur: 0.22, gain: 0.12, cut: 2200, hold: 0.1}),
  lightsOut: (t, out) => { sThump(out, t, 130, 38, 0.7, 0.9); sNoise(out, t, {type: 'lowpass', f: 4000, to: 250, dur: 0.8, gain: 0.35});
    sTone(out, t, {wave: 'sawtooth', hz: sNote(81), dur: 0.35, gain: 0.08, cut: 3000, detune: 9}); return sTone(out, t, {wave: 'sawtooth', hz: sNote(76), dur: 0.35, gain: 0.08, cut: 3000, detune: -9}); },
  lastLap: (t, out) => { sMetal(out, t, 1320, 0.09, 1.2, [1, 2.76, 5.4]); return sMetal(out, t + 0.28, 1320, 0.09, 1.6, [1, 2.76, 5.4]); },
  flag: (t, out) => { [69, 72, 76, 81].forEach((m, k) => sTone(out, t + k * 0.07, {wave: 'sawtooth', hz: sNote(m), dur: 1.2 - k * 0.07, gain: 0.06, cut: 2800, hold: 0.25, detune: k % 2 ? 8 : -8}));
    sThump(out, t, 110, 40, 0.5, 0.6); return sNoise(out, t, {type: 'highpass', f: 4500, dur: 1.8, gain: 0.1}); },
  finish: (t, out) => sTone(out, t, {wave: 'triangle', hz: sNote(76), to: sNote(83), glide: 0.06, dur: 0.3, gain: 0.14}),
  // Radio and race info
  radio: (t, out) => sNoise(out, t, {f: 1800, q: 3, dur: 0.05, gain: 0.15}),
  radioYou: (t, out) => { sNoise(out, t, {f: 2200, q: 2, dur: 0.04, gain: 0.07}); sTone(out, t + 0.03, {hz: 1400, dur: 0.04, gain: 0.05, cut: 3000}); return sTone(out, t + 0.08, {hz: 1870, dur: 0.05, gain: 0.05, cut: 3500}); },
  radioBad: (t, out) => { sNoise(out, t, {f: 1500, q: 2, dur: 0.05, gain: 0.08}); sTone(out, t + 0.04, {hz: 330, dur: 0.1, gain: 0.08, cut: 1500}); return sTone(out, t + 0.15, {hz: 247, dur: 0.16, gain: 0.08, cut: 1200}); },
  armor: (t, out) => { let e = t; for (let k = 0; k < 4; k++) e = sTone(out, t + k * 0.09, {hz: k % 2 ? 660 : 880, dur: 0.08, gain: 0.09, cut: 2500, hold: 0.05}); return e; },
  posUp: (t, out) => sTone(out, t, {wave: 'triangle', hz: sNote(79), to: sNote(86), glide: 0.08, dur: 0.2, gain: 0.13}),
  posDown: (t, out) => sTone(out, t, {wave: 'triangle', hz: sNote(64), to: sNote(57), glide: 0.1, dur: 0.18, gain: 0.08}),
  save: (t, out) => sTone(out, t, {hz: sNote(91), to: sNote(96), glide: 0.04, dur: 0.12, gain: 0.07, cut: 5000}),
  box: (t, out) => { sTone(out, t, {hz: 660, dur: 0.06, gain: 0.08, cut: 3000}); return sTone(out, t + 0.08, {hz: 990, dur: 0.1, gain: 0.08, cut: 3000}); },
  boxCancel: (t, out) => { sTone(out, t, {hz: 990, dur: 0.06, gain: 0.08, cut: 3000}); return sTone(out, t + 0.08, {hz: 660, dur: 0.1, gain: 0.08, cut: 3000}); },
  spin: (t, out) => sNoise(out, t, {f: 3200, to: 260, q: 2, dur: 0.55, gain: 0.18}),
  // Qualifying
  qOut: (t, out) => sTone(out, t, {wave: 'sawtooth', hz: 220, to: 440, dur: 0.18, gain: 0.08, cut: 1600}),
  qIn: (t, out) => sTone(out, t, {wave: 'sawtooth', hz: 440, to: 220, dur: 0.18, gain: 0.08, cut: 1600}),
  qLap: (t, out) => { sTone(out, t, {hz: sNote(84), dur: 0.05, gain: 0.07, cut: 4000}); return sTone(out, t + 0.08, {hz: sNote(84), dur: 0.08, gain: 0.07, cut: 4000}); },
  qBest: (t, out) => { [84, 88, 91, 96].forEach((m, k) => sTone(out, t + k * 0.05, {hz: sNote(m), dur: k === 3 ? 0.4 : 0.08, gain: 0.06, cut: 5000})); return t + 0.6; },
  // Physical sounds: the synth versions (samples replace them once loaded, see SFX_SAMPLES)
  gun: (t, out) => { let e = t; for (let k = 0; k < 4; k++) { const tk = t + k * 0.055; sNoise(out, tk, {f: 1400, q: 0.8, dur: 0.045, gain: 0.32}); e = sThump(out, tk, 160, 70, 0.05, 0.25); } return e; },
  hit: (t, out) => { sNoise(out, t, {type: 'highpass', f: 2500, dur: 0.03, gain: 0.25}); return sMetal(out, t, 1150 * (0.9 + Math.random() * 0.2), 0.12, 0.22); },
  jam: (t, out) => { sNoise(out, t, {f: 3000, q: 4, dur: 0.012, gain: 0.4}); return sNoise(out, t + 0.07, {f: 2400, q: 4, dur: 0.015, gain: 0.4}); },
  mineDrop: (t, out) => { sThump(out, t, 260, 120, 0.1, 0.35); return sMetal(out, t + 0.01, 640, 0.05, 0.12); },
  mineHit: (t, out) => { sThump(out, t, 110, 32, 0.6, 0.8); return sNoise(out, t, {type: 'lowpass', f: 1800, to: 200, dur: 0.5, gain: 0.5}); },
  wreck: (t, out) => { sThump(out, t, 90, 28, 1.0, 0.8); sNoise(out, t, {type: 'lowpass', f: 2500, to: 150, dur: 1.4, gain: 0.5});
    for (let k = 0; k < 5; k++) sMetal(out, t + 0.05 + k * 0.09 + Math.random() * 0.05, 500 + Math.random() * 900, 0.06, 0.25); return t + 1.4; },
  wreckFar: (t, out) => { sThump(out, t, 80, 35, 0.45, 0.35); return sNoise(out, t, {type: 'lowpass', f: 600, to: 150, dur: 0.4, gain: 0.12}); },
  engineBlow: (t, out) => { sNoise(out, t, {type: 'lowpass', f: 3000, to: 300, dur: 0.35, gain: 0.5}); return sTone(out, t, {wave: 'sawtooth', hz: 120, to: 35, dur: 0.8, gain: 0.25, cut: 600}); },
  bodyTear: (t, out) => { sNoise(out, t, {f: 900, to: 4500, q: 2, dur: 0.35, gain: 0.25}); return sMetal(out, t + 0.2, 700, 0.06, 0.3); },
  airgun: (t, out, o) => { const dur = Math.min(2.4, o.dur || 1.6); let e = t;
    for (let w = 0; w < 4; w++) for (let k = 0; k < 6; k++) e = sNoise(out, t + w * dur / 4 + k * 0.035, {f: 2600, q: 1.5, dur: 0.03, gain: 0.25}); return e; },
  launch: (t, out) => { [-10, 0, 10].forEach(d => sTone(out, t, {wave: 'sawtooth', hz: 55, to: 160, glide: 1.4, dur: 1.8, gain: 0.12, cut: 900, a: 0.08, detune: d})); return t + 1.8; },
  pitOut: (t, out) => { [-8, 8].forEach(d => sTone(out, t, {wave: 'sawtooth', hz: 70, to: 140, glide: 0.35, dur: 0.8, gain: 0.12, cut: 800, a: 0.05, detune: d})); return t + 0.8; },
  stamp: (t, out) => { sThump(out, t, 160, 55, 0.14, 0.35); return sNoise(out, t, {type: 'lowpass', f: 900, dur: 0.09, gain: 0.2}); },
  clank: (t, out) => { sMetal(out, t, 520, 0.1, 0.35); return sMetal(out, t + 0.14, 780, 0.08, 0.3); },
};

// Recorded samples: id → files in game/sfx/ (one is picked at random each play), and how they're treated:
// lp = lowpass Hz, drive 0..1, gain. Built from assets/sfx/src by tools/sfx-build.mjs.
const SFX_SAMPLES = {
  gun: {files: ['gun-1.wav', 'gun-2.wav', 'gun-3.wav'], gain: 0.25, lp: 6500, drive: 0.25},
  hit: {files: ['hit-1.wav', 'hit-2.wav', 'hit-3.wav'], gain: 0.42, lp: 7000},
  jam: {files: ['jam-1.wav'], gain: 0.28},
  mineDrop: {files: ['minedrop-1.wav', 'minedrop-2.wav'], gain: 0.4},
  mineHit: {files: ['minehit-1.wav', 'minehit-2.wav'], gain: 1, drive: 0.2},
  wreck: {files: ['wreck-1.wav', 'wreck-2.wav'], gain: 0.7, lp: 6000, drive: 0.3},
  wreckFar: {files: ['wreck-1.wav', 'wreck-2.wav'], gain: 0.35, lp: 700},
  engineBlow: {files: ['engine-1.wav'], gain: 0.48},
  launch: {files: ['launch-1.wav'], gain: 0.85, lp: 6000, drive: 0.2},
  pitOut: {files: ['pitout-1.wav', 'pitout-2.wav', 'pitout-3.wav'], gain: 0.45, lp: 6000, drive: 0.15},
  airgun: {files: ['airgun-1.wav', 'airgun-2.wav'], gain: 0.5},
  stamp: {files: ['stamp-1.wav', 'stamp-2.wav'], gain: 0.5},
  click: {files: ['stamp-1.wav', 'stamp-2.wav'], gain: 0.12},   // buttons: the same thud, lighter
  tab: {files: ['stamp-1.wav', 'stamp-2.wav'], gain: 0.09, lp: 2500},
  clank: {files: ['build-1.wav', 'build-2.wav', 'build-3.wav'], gain: 0.3},   // air drill, then a clank
  card: {files: ['drill-1.wav', 'drill-2.wav', 'drill-3.wav'], gain: 0.22},   // the crew's air drill on a Night Tune pick
};
// Level trims per sound (× gain): the interface and info sounds sit about 10 dB up so they read over the music.
const SFX_TRIM = {click: 3, pill: 3, tab: 3, bannerIn: 2.5, bannerOut: 2.5, cashIn: 3, cashOut: 3, card: 3, lock: 2.5, arrive: 2.5,
  qOut: 3, qIn: 3, qLap: 3, qBest: 3, stamp: 1.3, clank: 2.5, radio: 2, radioYou: 2, radioBad: 2, box: 2.5, boxCancel: 2.5};
const SFX_DUCK = {lightsOut: 4, wreck: 4, flag: 3, perfect: 3, promo: 5, releg: 5, season: 4, mineHit: 2};

function sfxLoadSamples() {
  if (SFX.loading || !AUDIO.ctx) return;
  SFX.loading = true;
  for (const [id, s] of Object.entries(SFX_SAMPLES)) for (const f of s.files)
    fetch('sfx/' + f).then(r => r.arrayBuffer()).then(b => AUDIO.ctx.decodeAudioData(b))
      .then(buf => { (SFX.buffers[id] || (SFX.buffers[id] = [])).push(buf); })
      .catch(e => console.warn('[sfx] could not load', f, e));
}
let sfxCurve = null;
function sfxPlaySample(id, t, out) {
  const s = SFX_SAMPLES[id], bufs = SFX.buffers[id], ctx = AUDIO.ctx;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
  src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.1;   // ±5% so repeats don't sound stamped out
  g.gain.value = (s.gain ?? 1) * Math.pow(10, (Math.random() - 0.5) * 4 / 20);   // ±2 dB
  let node = src;
  if (s.drive) {
    if (!sfxCurve) { sfxCurve = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 255.5 - 1; sfxCurve[i] = Math.tanh(x * 3) / Math.tanh(3); } }
    const sh = ctx.createWaveShaper(), dry = ctx.createGain(), wet = ctx.createGain(), mix = ctx.createGain();
    sh.curve = sfxCurve; wet.gain.value = s.drive; dry.gain.value = 1 - s.drive * 0.5;
    node.connect(dry); node.connect(sh); sh.connect(wet); dry.connect(mix); wet.connect(mix); node = mix;
  }
  if (s.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = s.lp; node.connect(f); node = f; }
  node.connect(g); g.connect(out);
  src.start(t);
  return t + src.buffer.duration / src.playbackRate.value;
}

// Where a car sits left/right in the view, -1..1 (gently, so nothing is hard in one ear).
function sfxPan(c) {
  if (!c || !c.pos || !cam.right) return 0;
  return Math.max(-1, Math.min(1, (c.pos.dot(RIGHT) - cam.position.dot(RIGHT)) / cam.right)) * 0.6;
}

// Ready to make sound: audio unlocked by a click, not a dev page or an unwatched autoplay, not muted.
const sfxLive = () => !SFX.blocked && AUDIO.ctx && AUDIO.ctx.state === 'running' && AUDIO.vol.sfx > 0 &&
  !(typeof DIRECTOR !== 'undefined' && DIRECTOR.muted);

function sfx(id, o = {}) {
  if (!sfxLive()) return;
  const ctx = AUDIO.ctx, now = ctx.currentTime, [gap, cap] = SFX_RATE[id] || SFX_RATE_DEFAULT;
  const v = (SFX.voices[id] || []).filter(e => e > now);
  if (now - (SFX.last[id] ?? -9) < gap || v.length >= cap) return;
  const t = now + 0.005, out = sfxOut({gain: (o.gain ?? 1) * (SFX_TRIM[id] || 1), pan: o.pan ?? sfxPan(o.car), verb: o.verb ?? 0.12});
  const sample = SFX_SAMPLES[id] && SFX.buffers[id] && SFX.buffers[id].length && SFX.variant[id] !== 'synth';
  const end = sample ? sfxPlaySample(id, t, out) : SFX_SYNTH[id](t, out, o);
  v.push(end); SFX.voices[id] = v; SFX.last[id] = now; SFX.lastAt = performance.now();
  if (SFX_DUCK[id]) duckMusic(SFX_DUCK[id]);
}

// A sound only if nothing else sounded around the same moment (radio chatter, button clicks): call it next to the
// code that might make a more specific sound, before or after.
function sfxUnless(id, o) {
  if (!sfxLive()) return;
  const at = performance.now();
  setTimeout(() => { if (SFX.lastAt < at - 30) sfx(id, o); }, 0);
}

// ---- watchers: things the game shows without a single moment in the code to hook ----
(() => {
  if (SFX.blocked) return;
  // The title card, the start lights and the last lap come from the race clock and distances.
  const w = {lit: 0, out: false, last: false, flag: false, cardIn: false, cardOut: false};
  setInterval(() => {
    if (typeof race === 'undefined' || race.mode !== 'race' || !race.ready) return;
    const t = race.t;
    // The title card before the start flies in (from −6.5) and out (from −3.75): a whoosh each way (render/views.js drawStart).
    if (t < (w.prev ?? t) - 0.01) w.cardIn = w.cardOut = false;   // the clock went back: a new race (or a restart)
    w.prev = t;
    if (!w.cardIn && t >= -6.5 && t < -6) { w.cardIn = true; sfx('bannerIn'); }
    if (!w.cardOut && t >= -3.75 && t < -3.4) { w.cardOut = true; sfx('bannerOut'); }
    if (t < -3) { w.lit = 0; w.out = false; w.last = false; w.flag = false; return; }
    const lit = t < 0 ? Math.min(5, Math.floor((t + 3) / 0.6) + 1) : 0;
    if (lit > w.lit) sfx('light');
    w.lit = lit;
    if (t >= 0 && !w.out) { w.out = true; if (t < 1) { sfx('lightsOut'); sfx('launch'); } }
    if (!w.last && !race.over && t > 0 && leader().d >= (LAPS - 1) * L) { w.last = true; sfx('lastLap'); }
    if (!w.flag && race.winner) { w.flag = true; sfx('flag'); }
  }, 30);
  // Any enabled button clicks, unless the click already made its own sound.
  addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button:not([disabled])');
    if (!b || b.id === 'audioBtn') return;
    const at = performance.now();
    setTimeout(() => { if (SFX.lastAt < at - 30) sfx(b.dataset.gtab ? 'tab' : 'click'); }, 0);
  }, true);
})();
