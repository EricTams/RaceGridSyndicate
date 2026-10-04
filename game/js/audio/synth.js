// The synth: every sound is made live with Web Audio (no files, no library). One AudioContext, a bus per layer so the
// sequencer can fade layers in and out, a shared echo, a reverb, a drive (distortion) send, and a master filter + compressor.
// Voices read their sound from SYNTH, which a style (audio/styles.js) overwrites, so one song can be re-voiced live.
// Browsers only start audio after a click, so nothing is created until audioCtx() is first called from one.
'use strict';

const AUDIO = {ctx: null, master: null, duck: null, sfx: null, sfxVerb: null, vol: {music: 1, sfx: 1}, filter: null, verb: null, echo: null, echoFb: null, echoTone: null, echoWet: null, drive: null, bus: {}, pump: {}, sends: {}, noise: null, acid: null};
const LAYERS = ['lead', 'arp', 'bass', 'pad', 'kick', 'snare', 'hat', 'clap', 'fx'];

// The default voicing ("classic"); every style starts from a copy of this.
const SYNTH_BASE = {
  lead: {wave: 'sawtooth', detune: [-8, 8], cut: 1400, peak: 3800, q: 4, gain: 0.16, rel: 0.12},
  arp: {wave: 'square', cut: 3200, gain: 0.10, decay: 0.14},
  bass: {wave: 'sawtooth', q: 9, from: 2200, to: 260, gain: 0.30, sub: 1, hold: 0.25, detune: [0]},
  pad: {wave: 'sawtooth', detune: [-12, 0, 12], cut: 1300, gain: 0.06, att: 0.25, rel: 0.6},
  kick: {from: 150, to: 45, drop: 0.12, decay: 0.38, gain: 0.9, click: 0},
  snare: {tone: 190, cut: 2500, decay: 0.18, gain: 0.45},
  hat: {cut: 7500, decay: 0.045, gain: 0.22},
  acid: {q: 14, gain: 0.2, sub: 0.5, lo: 180, hi: 1400},   // the mono acid bass (cut sweeps lo..hi)
  echo: {steps: 3, fb: 0.38, tone: 2600, wet: 0.5},
  send: {lead: 0.22, arp: 0.45, pad: 0.25, clap: 0.15, snare: 0.1},   // how much of each layer feeds the echo
  verb: {},                                                          // ... and the reverb
  drive: {bass: 0, lead: 0},                                         // how much goes through the distortion
  dry: {},                                                           // direct level per layer (default 1)
};
let SYNTH = JSON.parse(JSON.stringify(SYNTH_BASE));

function audioCtx() {
  if (AUDIO.ctx) { if (AUDIO.ctx.state !== 'running') AUDIO.ctx.resume(); return AUDIO.ctx; }   // (iOS: 'interrupted' too)
  // iPhones mute Web Audio with the ringer switch unless the page says it is playing media (Safari 17+).
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  const ctx = AUDIO.ctx = new (window.AudioContext || window.webkitAudioContext)();
  // A silent blip started inside the tap: older iOS only unlocks a context that plays something during the gesture.
  const blip = ctx.createBufferSource(); blip.buffer = ctx.createBuffer(1, 1, 22050); blip.connect(ctx.destination); blip.start(0);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  AUDIO.master = ctx.createGain(); AUDIO.master.gain.value = 0.6;
  AUDIO.filter = ctx.createBiquadFilter(); AUDIO.filter.type = 'lowpass'; AUDIO.filter.frequency.value = 18000;
  const limit = ctx.createDynamicsCompressor();   // a last brick wall so loud styles never clip
  limit.threshold.value = -4; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.1;
  // Music: filter → compressor → master (the music volume) → duck (dipped under big sound effects) → limiter.
  AUDIO.duck = ctx.createGain();
  AUDIO.filter.connect(comp); comp.connect(AUDIO.master); AUDIO.master.connect(AUDIO.duck); AUDIO.duck.connect(limit); limit.connect(ctx.destination);
  // Sound effects (audio/sfx.js) skip the music's filter, which the music's intensity sweeps: sfx (the SFX volume) →
  // a gentle compressor → the same limiter, with a reverb send of their own (the music's echo is timed to the song).
  const sComp = ctx.createDynamicsCompressor();
  sComp.threshold.value = -10; sComp.ratio.value = 3; sComp.attack.value = 0.003; sComp.release.value = 0.15;
  AUDIO.sfx = ctx.createGain(); AUDIO.sfx.connect(sComp); sComp.connect(limit);
  // Echo: a filtered feedback delay, timed to the song tempo by the sequencer.
  const d = AUDIO.echo = ctx.createDelay(2), fb = AUDIO.echoFb = ctx.createGain();
  const tone = AUDIO.echoTone = ctx.createBiquadFilter(), wet = AUDIO.echoWet = ctx.createGain();
  d.delayTime.value = 0.35; tone.type = 'lowpass';
  d.connect(tone); tone.connect(fb); fb.connect(d); tone.connect(wet); wet.connect(AUDIO.filter);
  // Drive: a soft-clipping waveshaper with a tone filter after it.
  const shaper = ctx.createWaveShaper(), curve = new Float32Array(1024), dTone = ctx.createBiquadFilter();
  for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 6) / Math.tanh(6); }
  shaper.curve = curve; shaper.oversample = '2x'; dTone.type = 'lowpass'; dTone.frequency.value = 5000;
  shaper.connect(dTone); dTone.connect(AUDIO.filter); AUDIO.drive = shaper;
  // Reverb: a convolver over a generated 2.8 s decaying-noise impulse, wide in stereo.
  const len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  const verb = AUDIO.verb = ctx.createConvolver(), vTone = ctx.createBiquadFilter();
  verb.buffer = ir; vTone.type = 'lowpass'; vTone.frequency.value = 3500; verb.connect(vTone); vTone.connect(AUDIO.filter);
  const sVerb = AUDIO.sfxVerb = ctx.createConvolver(), sTone = ctx.createBiquadFilter();
  sVerb.buffer = ir; sTone.type = 'lowpass'; sTone.frequency.value = 4000; sVerb.connect(sTone); sTone.connect(AUDIO.sfx);
  for (const k of LAYERS) {
    // bus (layer level) → pump (sidechain ducking) → dry / echo / drive / reverb
    const g = AUDIO.bus[k] = ctx.createGain(), pu = AUDIO.pump[k] = ctx.createGain();
    const dry = ctx.createGain(), s = ctx.createGain(), dr = ctx.createGain(), rv = ctx.createGain();
    g.gain.value = 0; g.connect(pu);
    pu.connect(dry); dry.connect(AUDIO.filter); pu.connect(s); s.connect(d); pu.connect(dr); dr.connect(shaper); pu.connect(rv); rv.connect(verb);
    AUDIO.sends[k] = {dry, echo: s, drive: dr, verb: rv};
  }
  const n = ctx.sampleRate, buf = ctx.createBuffer(1, n, n), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
  AUDIO.noise = buf;
  applySynthRouting(); applyVolumes();
  return ctx;
}

// The two volume sliders (0..1). The music's 0.6 is its old fixed level; squared so the slider feels even to the ear.
function applyVolumes() {
  if (!AUDIO.ctx) return;
  const t = AUDIO.ctx.currentTime, v = AUDIO.vol;
  AUDIO.master.gain.setTargetAtTime(0.6 * v.music * v.music, t, 0.03);
  AUDIO.sfx.gain.setTargetAtTime(2.5 * v.sfx * v.sfx, t, 0.03);   // 2.5: effects sit level with the music
}
// Dip the music under a big sound effect: down by `db` at once, back over `back` seconds.
function duckMusic(db = 4, hold = 0.25, back = 0.8) {
  if (!AUDIO.ctx) return;
  const g = AUDIO.duck.gain, t = AUDIO.ctx.currentTime, low = Math.pow(10, -db / 20);
  g.cancelScheduledValues(t); g.setValueAtTime(Math.min(g.value, 1), t);
  g.linearRampToValueAtTime(low, t + 0.03); g.setValueAtTime(low, t + 0.03 + hold); g.linearRampToValueAtTime(1, t + 0.03 + hold + back);
}

// Push SYNTH's echo and send levels into the audio graph (called after a style change).
function applySynthRouting() {
  if (!AUDIO.ctx) return;
  const t = AUDIO.ctx.currentTime, e = SYNTH.echo, set = (p, v) => p.setTargetAtTime(v, t, 0.05);
  set(AUDIO.echoFb.gain, e.fb); set(AUDIO.echoTone.frequency, e.tone); set(AUDIO.echoWet.gain, e.wet);
  for (const k of LAYERS) {
    const dr = SYNTH.drive[k] || 0;
    set(AUDIO.sends[k].echo.gain, SYNTH.send[k] || 0); set(AUDIO.sends[k].verb.gain, SYNTH.verb[k] || 0);
    set(AUDIO.sends[k].drive.gain, dr * 0.6); set(AUDIO.sends[k].dry.gain, (SYNTH.dry[k] ?? 1) * (1 - dr * 0.7));
  }
}

const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

// An attack/hold/release envelope on a gain node; ramps (never jumps) so notes don't click.
function env(g, t, peak, a, hold, r) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.linearRampToValueAtTime(0, t + a + hold + r);
  return t + a + hold + r;
}
function osc(type, hz, t, end, detune = 0) {
  const o = AUDIO.ctx.createOscillator(); o.type = type; o.frequency.value = hz; o.detune.value = detune;
  o.start(t); o.stop(end + 0.05); return o;
}
function noiseSrc(t, end) {
  const s = AUDIO.ctx.createBufferSource(); s.buffer = AUDIO.noise; s.loop = true;
  s.start(t, Math.random() * 0.5); s.stop(end + 0.05); return s;
}

// Each voice: (time, midi note, length in seconds, velocity 0..1) into its layer's bus.
const VOICES = {
  lead(t, m, len, v) {   // detuned oscillators through a lowpass that opens on each note
    const p = SYNTH.lead, ctx = AUDIO.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = p.q;
    f.frequency.setValueAtTime(p.cut * 0.6, t); f.frequency.linearRampToValueAtTime(p.peak, t + 0.02);
    f.frequency.setTargetAtTime(p.cut, t + 0.02, 0.12);
    const end = env(g, t, p.gain * v, 0.006, Math.max(0, len - 0.05), p.rel);
    for (const dt of p.detune) osc(p.wave, midiHz(m), t, end, dt).connect(f);
    f.connect(g); g.connect(AUDIO.bus.lead);
  },
  arp(t, m, len, v) {    // short pluck, mostly heard through the echo
    const p = SYNTH.arp, ctx = AUDIO.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = p.cut;
    const end = env(g, t, p.gain * v, 0.003, 0.02, p.decay);
    osc(p.wave, midiHz(m), t, end).connect(f); f.connect(g); g.connect(AUDIO.bus.arp);
  },
  bass(t, m, len, v) {   // resonant oscillator with a filter blip, plus a sine sub
    const p = SYNTH.bass, ctx = AUDIO.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = p.q;
    f.frequency.setValueAtTime(p.from, t); f.frequency.exponentialRampToValueAtTime(p.to, t + 0.14);
    const end = env(g, t, p.gain * v, 0.004, Math.min(len, p.hold), 0.06);
    for (const dt of p.detune) osc(p.wave, midiHz(m), t, end, dt).connect(f);
    if (p.sub) { const sg = ctx.createGain(); sg.gain.value = p.sub; osc('sine', midiHz(m - 12), t, end).connect(sg); sg.connect(g); }
    f.connect(g); g.connect(AUDIO.bus.bass);
  },
  pad(t, m, len, v) {    // slow, soft detuned oscillators
    const p = SYNTH.pad, ctx = AUDIO.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = p.cut;
    const end = env(g, t, p.gain * v, p.att, Math.max(0, len - p.att), p.rel);
    for (const dt of p.detune) osc(p.wave, midiHz(m), t, end, dt).connect(f);
    f.connect(g); g.connect(AUDIO.bus.pad);
  },
  kick(t, v = 1) {       // sine with a fast pitch drop, and optionally a noise click on the front
    const p = SYNTH.kick, ctx = AUDIO.ctx, g = ctx.createGain(), o = osc('sine', p.from, t, t + p.decay + 0.02);
    o.frequency.setValueAtTime(p.from, t); o.frequency.exponentialRampToValueAtTime(p.to, t + p.drop);
    g.gain.setValueAtTime(p.gain * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
    o.connect(g); g.connect(AUDIO.bus.kick);
    if (p.click) {
      const cg = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 2500;
      cg.gain.setValueAtTime(p.click * v, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
      noiseSrc(t, t + 0.012).connect(f); f.connect(cg); cg.connect(AUDIO.bus.kick);
    }
  },
  snare(t, v = 1) {      // a pitched body plus filtered noise
    const p = SYNTH.snare, ctx = AUDIO.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter(), tg = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = p.cut;
    g.gain.setValueAtTime(p.gain * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
    noiseSrc(t, t + p.decay).connect(f); f.connect(g);
    const o = osc('triangle', p.tone, t, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(p.tone * 0.6, t + 0.1);
    tg.gain.setValueAtTime(p.gain * v * 0.9, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(tg); tg.connect(AUDIO.bus.snare); g.connect(AUDIO.bus.snare);
  },
  hat(t, v = 1, open = false) {   // high-passed noise tick
    const p = SYNTH.hat, ctx = AUDIO.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter(), d = open ? p.decay * 4 : p.decay;
    f.type = 'highpass'; f.frequency.value = p.cut;
    g.gain.setValueAtTime(p.gain * v * (open ? 0.8 : 1), t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    noiseSrc(t, t + d).connect(f); f.connect(g); g.connect(AUDIO.bus.hat);
  },
  clap(t, v = 1) {       // three quick band-passed noise bursts, then a tail
    const ctx = AUDIO.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.2;
    g.gain.setValueAtTime(0, t);
    for (const k of [0, 0.011, 0.022]) { g.gain.setValueAtTime(0.5 * v, t + k); g.gain.exponentialRampToValueAtTime(0.05 * v, t + k + 0.01); }
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noiseSrc(t, t + 0.2).connect(f); f.connect(g); g.connect(AUDIO.bus.clap);
  },
  riser(t, dur) {        // noise swept up through a band-pass, swelling into a drop
    const ctx = AUDIO.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.3, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    noiseSrc(t, t + dur + 0.02).connect(f); f.connect(g); g.connect(AUDIO.bus.fx);
  },
  crash(t) {             // long bright noise wash on the drop
    const ctx = AUDIO.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 4500;
    g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    noiseSrc(t, t + 1.8).connect(f); f.connect(g); g.connect(AUDIO.bus.fx);
  },
};

// The acid bass: one oscillator that runs for the whole song (a mono synth), so notes can slide into each other.
function acidOn() {
  if (AUDIO.acid) return;
  const ctx = AUDIO.ctx, t = ctx.currentTime, o = ctx.createOscillator(), sub = ctx.createOscillator();
  const f = ctx.createBiquadFilter(), g = ctx.createGain(), sg = ctx.createGain();
  o.type = 'sawtooth'; sub.type = 'sine'; f.type = 'lowpass'; g.gain.value = 0; sg.gain.value = SYNTH.acid.sub;
  o.connect(f); f.connect(g); sub.connect(sg); sg.connect(g); g.connect(AUDIO.bus.bass);
  o.start(t); sub.start(t);
  AUDIO.acid = {o, sub, f, g};
}
function acidOff() {
  const a = AUDIO.acid; if (!a) return;
  const t = AUDIO.ctx.currentTime;
  a.g.gain.setTargetAtTime(0, t, 0.02); a.o.stop(t + 0.2); a.sub.stop(t + 0.2);
  AUDIO.acid = null;
}
// One acid step: slide = glide in from the previous note; hold = the next step slides, so don't close the gate.
function acidNote(t, m, len, accent, slide, hold, cut) {
  const a = AUDIO.acid, p = SYNTH.acid, hz = midiHz(m);
  if (slide) { a.o.frequency.setTargetAtTime(hz, t, 0.035); a.sub.frequency.setTargetAtTime(hz / 2, t, 0.035); }
  else { a.o.frequency.setValueAtTime(hz, t); a.sub.frequency.setValueAtTime(hz / 2, t); }
  a.g.gain.setTargetAtTime(p.gain * (accent ? 1.3 : 0.85), t, 0.003);
  if (!hold) a.g.gain.setTargetAtTime(0, t + len * 0.75, 0.015);
  a.f.Q.setValueAtTime(accent ? p.q * 1.4 : p.q, t);
  a.f.frequency.setValueAtTime(cut * (accent ? 4.5 : 2.2), t); a.f.frequency.setTargetAtTime(cut, t, accent ? 0.1 : 0.05);
}
