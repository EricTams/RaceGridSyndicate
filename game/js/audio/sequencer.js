// The music sequencer: plays a song from game/js/audio/songs/ on the synth, looping, in a style from audio/styles.js
// (tempo, drum patterns, bass treatment, sidechain, builds and drops, voicing).
// Lookahead scheduling: a timer every 25 ms books the notes due in the next 120 ms on the audio clock, so timing
// stays tight even when the main thread is busy. Intensity 0..1 builds the groove first: bass, then the kick
// (by 0.3), hats, snare and pad (by 0.5), and the top half adds extras: the melody, risers, claps, and the master
// filter opening from slightly dark to fully open.
'use strict';

const SONGS = {}, STYLES = {};
const MUSIC = {
  song: null, style: null, playing: false, intensity: 0.5, mute: {}, bpmScale: 1, accel: 0.12,
  beat: 0, pos: 0, mNext: 0, nextT: 0, timer: null, events: null, bassNote: 0, recent: [],
};
// Where each layer fades in, as [from, to] intensity (a style can override any with layerIn).
const LAYER_IN = {bass: [-1, 0], kick: [0.05, 0.3], hat: [0.3, 0.45], snare: [0.35, 0.5], pad: [0.3, 0.5], arp: [0.3, 0.5],
  lead: [0.5, 0.7], fx: [0.6, 0.8], clap: [0.7, 0.9]};
const fadeIn = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const deepMerge = (a, b) => { for (const k in b) a[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? deepMerge(a[k] || {}, b[k]) : b[k]; return a; };

// "step,len,note step,len,note ..." → events indexed by step: {layer: [[len, note], ...]}
function parseSong(song) {
  const ev = Array.from({length: song.steps}, () => ({}));
  for (const layer of ['lead', 'arp', 'bass', 'pad']) {
    const tr = (song.tr && song.tr[layer]) || 0;
    for (const tok of (song[layer] || '').split(' ').filter(Boolean)) {
      const [s, l, n] = tok.split(',').map(Number);
      (ev[s][layer] || (ev[s][layer] = [])).push([l, n + tr]);
    }
  }
  return ev;
}

// One bar of the beat in 16ths: 16 in 4/4, 12 in 3/4, 18 in 9/8 (song.meter = quarter notes per bar).
const barLen = () => (MUSIC.song.meter || 4) * 4;

// Score steps per beat 16th: the song's own rate (its steps may be triplets or 32nds) times the style's.
const musicRate = () => (MUSIC.song.rate || 1) * (MUSIC.style.rate || 1);

// The tempo creeps up through the piece (like Grieg's own accelerando) and drops back when it loops.
const musicBpm = () => MUSIC.style.bpm * MUSIC.bpmScale * (1 + MUSIC.accel * MUSIC.pos / MUSIC.song.steps);

function applyMix(ramp = 0.4) {
  if (!AUDIO.ctx || !MUSIC.style) return;
  const st = MUSIC.style, t = AUDIO.ctx.currentTime, x = MUSIC.intensity, off = st.mute || [], ins = Object.assign({}, LAYER_IN, st.layerIn);
  for (const k of LAYERS) AUDIO.bus[k].gain.setTargetAtTime(MUSIC.mute[k] || off.includes(k) ? 0 : fadeIn(...ins[k], x), t, ramp / 3);
  // The filter: dark to slightly dark over the groove half, then fully open over the extras half.
  const top = st.bright || 18000, e = x < 0.5 ? 0.7 * x / 0.5 : 0.7 + 0.3 * (x - 0.5) / 0.5;
  AUDIO.filter.frequency.setTargetAtTime(500 * Math.pow(top / 500, e), t, ramp / 3);
}

function setStyle(id) {
  MUSIC.style = STYLES[id];
  SYNTH = deepMerge(JSON.parse(JSON.stringify(SYNTH_BASE)), JSON.parse(JSON.stringify(MUSIC.style.synth || {})));
  applySynthRouting(); applyMix(0.1);
  if (!AUDIO.ctx) return;
  if (MUSIC.style.acid && MUSIC.playing) acidOn(); else if (!MUSIC.style.acid) acidOff();
  for (const k of LAYERS) { const g = AUDIO.pump[k].gain; g.cancelScheduledValues(AUDIO.ctx.currentTime); g.setTargetAtTime(1, AUDIO.ctx.currentTime, 0.02); }
}

// One melody step of the score: play (or just note down) what the style wants from it.
function scheduleMelody(i, t, sec) {
  const e = MUSIC.events[i], st = MUSIC.style, tr = st.tr || {};
  for (const layer in e) for (const [len, n0] of e[layer]) {
    const n = layer === 'bass' ? foldBass(n0 + (tr.bass || 0)) : n0 + (tr[layer] || 0);
    if (layer !== 'lead') MUSIC.recent.push([i, n]);
    if (layer === 'bass') { MUSIC.bassNote = n; if (st.bass || st.acid) continue; }
    if (layer === 'pad' && st.padGate) continue;
    if (layer === 'lead' && !leadOn()) continue;
    VOICES[layer](t, n, len * sec, 1);
  }
}

// Bass notes are folded by octaves into the style's bassRange (default A1-G#2, 55-104 Hz): a piano's left hand
// wanders up through a piece, a techno bass stays down low.
function foldBass(n) {
  const [lo, hi] = MUSIC.style.bassRange || [33, 44];
  while (n > hi) n -= 12;
  while (n < lo) n += 12;
  return n;
}

// Whether the lead plays now: styles with lead.sections [on, off] keep it out for `off` bars, then let it in for
// `on` bars, so the bass and drums carry most of the track. Counted in bars of the beat, whatever the song's grid.
function leadOn() {
  const sc = (MUSIC.style.lead || {}).sections;
  return !sc || Math.floor(MUSIC.beat / barLen()) % (sc[0] + sc[1]) >= sc[1];
}
// The pitch classes heard in the score's last half bar (bass, pad, inner voices): the current chord.
function recentChord() {
  const since = MUSIC.mNext - 2 * (MUSIC.song.div || 4);
  MUSIC.recent = MUSIC.recent.filter(([s]) => s >= since);
  return [...new Set(MUSIC.recent.map(([, n]) => n % 12))].sort((a, c) => a - c);
}
const hitVel = c => c === 'x' || c === 'X' ? 1 : c === 'o' ? 0.45 : 0;

// Where this step sits around a melody entry (styles with build + lead.sections): the 2 bars before it are the
// build (riser, snare roll, kick and hats out in the last bar), and the first step of the entry is the drop.
function buildPhase(b) {
  const st = MUSIC.style, sc = (st.lead || {}).sections;
  if (!st.build || !sc) return null;
  const n = barLen(), k = Math.floor(b / n) % (sc[0] + sc[1]), off = sc[1];
  if (k === off - 2) return {bar: 0, s: b % n};
  if (k === off - 1) return {bar: 1, s: b % n};
  if (k === off && b % n === 0) return {drop: true};
  return null;
}

// One 16th of the beat: drums from the style's patterns (drums12 / drums18 for songs in 3/4 / 9/8), the sidechain
// pump, the bass (repeated, or the acid line), the gated pad, and any build or drop.
const drumsFor = (st, n) => n === 16 ? st.drums : st['drums' + n] || st.drums;
function scheduleBeat(b, t, sec) {
  const st = MUSIC.style, n = barLen(), d = drumsFor(st, n), bp = buildPhase(b);
  const dt = b % 2 ? (st.swing || 0) * sec : 0;   // swing: every other 16th a little late
  const fill = st.fill && Math.floor(b / n) % st.fill.every === st.fill.every - 1;
  if (bp && bp.drop) VOICES.crash(t);
  if (bp && bp.s === 0 && bp.bar === 0) VOICES.riser(t, 2 * n * sec);
  for (const k of ['kick', 'snare', 'clap', 'hat', 'ohat']) {
    let pat = d[k];
    if (k === 'snare' && fill) pat = n === 16 ? st.fill.snare : st.fill['snare' + n] || pat;
    if (!pat) continue;
    if (bp && !bp.drop && (k === 'snare' || (bp.bar === 1 && k !== 'clap'))) continue;   // the build replaces these
    const v = hitVel(pat[b % pat.length]);
    if (!v) continue;
    const tt = k === 'kick' ? t : t + dt;
    if (k === 'ohat') VOICES.hat(tt, v, true); else VOICES[k](tt, v);
    if (k === 'kick' && st.pump) pump(tt);
  }
  if (bp && !bp.drop) {   // snare roll: quarters, then 8ths, then 16ths, getting louder
    const s = bp.s, every = bp.bar === 0 ? 4 : s < n / 2 ? 2 : 1;
    if (s % every === 0) VOICES.snare(t, 0.3 + 0.7 * (bp.bar * n + s) / (2 * n));
  }
  if (st.acid && MUSIC.bassNote) acidStep(b, t, sec);
  else if (st.bass && MUSIC.bassNote && b % st.bass.every === 0) {
    const up = st.bass.oct && (b / st.bass.every) % 2 === 1;
    VOICES.bass(t, MUSIC.bassNote + (up ? 12 : 0), st.bass.every * sec * 0.85, 1);
  }
  if (st.padGate && hitVel(st.padGate[b % st.padGate.length])) {
    for (const pc of recentChord().slice(0, 4)) VOICES.pad(t + dt, 48 + pc, sec * 0.7, 1);
  }
}

// Sidechain: duck the listed layers on each kick and let them swell back, so the mix breathes with the beat.
function pump(t) {
  const p = MUSIC.style.pump;
  for (const k of p.layers) {
    const g = AUDIO.pump[k].gain;
    g.setTargetAtTime(1 - p.depth, t, 0.004); g.setTargetAtTime(1, t + 0.03, p.release / 3);
  }
}

// The acid line: the score's bass note on a 16-step pattern. Letters: n note, a accent, s slide (lower case =
// the bass note, upper case = an octave up), '.' rest. The filter opens and closes over `bars` bars.
function acidStep(b, t, sec) {
  const ac = MUSIC.style.acid, line = ac.line, c = line[b % line.length];
  if (c === '.') return;
  const next = line[(b + 1) % line.length], l = c.toLowerCase();
  const cyc = 0.5 - 0.5 * Math.cos(2 * Math.PI * b / (ac.bars * 16)), p = SYNTH.acid;
  acidNote(t, MUSIC.bassNote + (c !== l ? 12 : 0), sec, l === 'a', l === 's', next.toLowerCase() === 's', p.lo + (p.hi - p.lo) * cyc);
}

function musicTick() {
  const ctx = AUDIO.ctx, rate = musicRate(), steps = MUSIC.song.steps;
  while (MUSIC.nextT < ctx.currentTime + 0.12) {
    const sec = 15 / musicBpm(), t = MUSIC.nextT;   // one 16th of the beat
    // The score can run slower than the beat (rate 0.5 = melody at half speed over the drums).
    while (MUSIC.mNext < MUSIC.pos + rate) {
      scheduleMelody(MUSIC.mNext % steps, t + (MUSIC.mNext - MUSIC.pos) / rate * sec, sec / rate);
      MUSIC.mNext++;
    }
    scheduleBeat(MUSIC.beat, t, sec);
    MUSIC.pos += rate; MUSIC.beat++; MUSIC.nextT += sec;
    if (MUSIC.pos >= steps) { MUSIC.pos -= steps; MUSIC.mNext -= steps; MUSIC.recent = []; }
    if (MUSIC.beat % barLen() === 0) AUDIO.echo.delayTime.setTargetAtTime(Math.min(1.9, sec * SYNTH.echo.steps), MUSIC.nextT, 0.05);
  }
}

function playMusic(id, style) {
  const ctx = audioCtx();
  stopMusic();
  if (style || !MUSIC.style) setStyle(style || Object.keys(STYLES)[0]);
  MUSIC.song = SONGS[id]; MUSIC.events = parseSong(MUSIC.song);
  if (MUSIC.style.acid) acidOn();
  MUSIC.beat = 0; MUSIC.pos = 0; MUSIC.mNext = 0; MUSIC.bassNote = 0; MUSIC.recent = [];
  MUSIC.nextT = ctx.currentTime + 0.08; MUSIC.playing = true;
  applyMix(0.05);
  MUSIC.timer = setInterval(musicTick, 25); musicTick();
}
function stopMusic() {
  if (!MUSIC.playing) return;
  clearInterval(MUSIC.timer); MUSIC.playing = false; acidOff();
  for (const k of LAYERS) AUDIO.bus[k].gain.setTargetAtTime(0, AUDIO.ctx.currentTime, 0.05);   // notes already booked fade out
}
function setIntensity(x, ramp) { MUSIC.intensity = x; applyMix(ramp); }
