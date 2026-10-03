// Reads a Standard MIDI File and turns it into song data for game/js/audio/songs/. Only for public-domain sources
// (see assets/music/src/SOURCES.md).
// usage: node tools/midi2song.mjs x.mid                  summary: tracks, note counts, ranges, tempo, grid fit
//        node tools/midi2song.mjs x.mid --json           every track as [step, len, midiNote] triples
//        node tools/midi2song.mjs x.mid --emit id "Name" [options] > game/js/audio/songs/id.js
// options: --div N    steps per quarter note (4 = 16ths, the default; 3 = 8th triplets; 8 = 32nds)
//          --rate R   score steps per beat 16th when played (default div/4: the score at the beat's own tempo;
//                     smaller = slower against the drums)
//          --meter 3  quarter notes per bar (default 4; 3 = 3/4, 4.5 = 9/8), played over the styles' matching drums
//          --lead N --arp N --bass N  take these parts from these tracks (0-based) instead of guessing; other
//                     tracks not skipped go to the pad
//          --bars a-b keep only these bars (1-based)          --skip 2,3  leave out these tracks (0-based)
//          --note "…" a line about the piece for the file's header   --tr 12,12,12,12  fixed lead,arp,bass,pad shifts
// --emit splits the parts: the highest track gives the lead (its top note at each step) and the arp (the rest),
// the lowest gives the bass (its bottom note) and, with any middle tracks, the pad. Each part is shifted by whole
// octaves into a register that suits its synth voice.
import {readFileSync} from 'node:fs';
const args = process.argv.slice(2), file = args[0];
const opt = k => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const b = readFileSync(file);
let p = 0;
const u32 = () => (p += 4, b.readUInt32BE(p - 4)), u16 = () => (p += 2, b.readUInt16BE(p - 2));
const vlq = () => { let v = 0, c; do { c = b[p++]; v = (v << 7) | (c & 127); } while (c & 128); return v; };
if (b.toString('ascii', 0, 4) !== 'MThd') throw new Error('not a MIDI file');
p = 8; const format = u16(), ntrk = u16(), ppq = u16(); p = 8 + b.readUInt32BE(4);
const tracks = [], tempos = [], meters = [];
for (let t = 0; t < ntrk; t++) {
  if (b.toString('ascii', p, p + 4) !== 'MTrk') throw new Error('bad track ' + t);
  p += 4; const end = u32() + p; let tick = 0, run = 0, name = '';
  const notes = [], open = new Map();
  while (p < end) {
    tick += vlq();
    let st = b[p];
    if (st & 128) p++; else st = run;   // running status
    if (st === 0xff) {
      const type = b[p++], len = vlq();
      if (type === 3) name = b.toString('latin1', p, p + len);
      if (type === 0x51) tempos.push({tick, bpm: Math.round(60e6 / b.readUIntBE(p, 3))});
      if (type === 0x58) meters.push({tick, sig: `${b[p]}/${2 ** b[p + 1]}`});
      p += len; continue;
    }
    if (st === 0xf0 || st === 0xf7) { p += vlq(); continue; }
    run = st; const hi = st & 0xf0, ch = st & 15;
    if (hi === 0xc0 || hi === 0xd0) { p++; continue; }
    const d1 = b[p++], d2 = b[p++];
    const key = ch * 128 + d1;
    if (hi === 0x90 && d2 > 0) open.set(key, {tick, vel: d2});
    else if (hi === 0x80 || hi === 0x90) {
      const o = open.get(key);
      if (o) { notes.push({ch, note: d1, start: o.tick, end: tick, vel: o.vel}); open.delete(key); }
    }
  }
  p = end;
  if (notes.length) tracks.push({name, notes: notes.sort((a, c) => a.start - c.start || a.note - c.note)});
}
const div = +opt('--div') || 4, q = ppq / div;   // ticks per step
const step = x => Math.round(x / q);
const offGrid = (d, ns) => ns.filter(n => { const x = n.start / (ppq / d); return Math.abs(x - Math.round(x)) > 0.05; }).length / ns.length;

if (args.includes('--json')) {
  console.log(JSON.stringify({ppq, div, tempos, tracks: tracks.map(t => ({name: t.name,
    notes: t.notes.map(n => [step(n.start), Math.max(1, step(n.end) - step(n.start)), n.note])}))}));
} else if (args.includes('--emit')) {
  const i = args.indexOf('--emit'), id = args[i + 1], name = args[i + 2];
  const skip = (opt('--skip') || '').split(',').filter(Boolean).map(Number);
  const meter = +opt('--meter') || 4, [b0, b1] = (opt('--bars') || '').split('-').map(Number), barSteps = div * meter;
  const from = b0 ? (b0 - 1) * barSteps : 0, to = b1 ? b1 * barSteps : Infinity;
  const pick = k => opt(k) === null ? null : +opt(k);
  const ts = tracks.map((t, k) => ({...t, k})).filter(t => !skip.includes(t.k)).map(t => {
    const notes = t.notes.map(n => [step(n.start) - from, Math.max(1, step(n.end) - step(n.start)), n.note]).filter(n => n[0] >= 0 && n[0] < to - from);
    return {k: t.k, name: t.name, notes, mean: notes.reduce((s, n) => s + n[2], 0) / notes.length};
  }).filter(t => t.notes.length).sort((a, c) => c.mean - a.mean);
  // Per step, one note goes to the main part (the top note for the lead, the bottom for the bass), the rest aside.
  const split = (notes, top) => {
    const by = new Map();
    for (const n of notes) (by.get(n[0]) || by.set(n[0], []).get(n[0])).push(n);
    const main = [], rest = [];
    let held = null;   // the bass note still sounding: a chord above it (left hand: bass on 1, chord on 2) isn't bass
    for (const [s, g] of [...by.entries()].sort((x, y) => x[0] - y[0])) {
      g.sort((x, y) => top ? y[2] - x[2] : x[2] - y[2]);
      if (!top && held && s < held[0] + held[1] && g[0][2] > held[2]) { rest.push(...g); continue; }
      main.push(g[0]); rest.push(...g.slice(1));
      if (!top) held = g[0];
    }
    return [main, rest];
  };
  let lead, arp, bass, low, pad;
  if (pick('--lead') !== null) {   // parts chosen by hand (an orchestral score): lead, arp and bass tracks, the rest pad
    const tk = k => ts.find(t => t.k === k), used = [pick('--lead'), pick('--arp'), pick('--bass')];
    [lead, arp] = split(tk(used[0]).notes, true);
    if (used[1] !== null) arp = [...arp, ...tk(used[1]).notes];
    [bass, low] = used[2] !== null ? split(tk(used[2]).notes, false) : [[], []];
    pad = [...low, ...ts.filter(t => !used.includes(t.k)).flatMap(t => t.notes)];
  } else {
    [lead, arp] = split(ts[0].notes, true);
    [bass, low] = ts.length > 1 ? split(ts[ts.length - 1].notes, false) : [[], []];
    pad = [...low, ...ts.slice(1, -1).flatMap(t => t.notes)];
  }
  const median = ns => { const s = ns.map(n => n[2]).sort((a, c) => a - c); return s[s.length >> 1] || 60; };
  const oct = (ns, target) => 12 * Math.round((target - median(ns)) / 12);
  const tr = {lead: oct(lead, 72), arp: oct(lead, 72), bass: oct(bass, 50), pad: oct(pad.length ? pad : bass, 55)};
  if (opt('--tr')) { const [l, a, bs, pd] = opt('--tr').split(',').map(Number); Object.assign(tr, {lead: l, arp: a, bass: bs, pad: pd}); }
  const all = [...lead, ...arp, ...bass, ...pad];
  const steps = Math.ceil(Math.max(...all.map(n => n[0] + n[1])) / barSteps) * barSteps;
  const flat = a => a.sort((x, y) => x[0] - y[0] || x[2] - y[2]).map(n => n.join(',')).join(' ');
  const rate = +opt('--rate') || div / 4, note = opt('--note');
  const src = file.replace(/^.*assets\//, 'assets/');
  console.log(`// ${name}${note ? ': ' + note : ''}. Notes from the public-domain Mutopia MIDI
// (${src}, see SOURCES.md) via tools/midi2song.mjs: "step,len,midiNote", ${div} steps per quarter note.
// lead = top voice of the highest part, arp = the rest of it, bass = lowest voice of the lowest part, pad = the rest.
'use strict';
SONGS.${id}={name:'${name.replace(/'/g, "\\'")}',div:${div},rate:${rate},${meter !== 4 ? `meter:${meter},` : ''}steps:${steps},tr:${JSON.stringify(tr).replace(/"/g, '')},   // tr: semitones per layer
  lead:'${flat(lead)}',
  arp:'${flat(arp)}',
  bass:'${flat(bass)}',
  pad:'${flat(pad)}'};`);
} else {
  console.log(`format ${format}, ${ntrk} tracks, ppq ${ppq}; tempos:`, tempos.slice(0, 12).map(x => `${x.bpm}@${step(x.tick)}`).join(' '), tempos.length > 12 ? `… (${tempos.length})` : '');
  console.log('time signatures:', [...new Map(meters.map(m => [m.tick, m])).values()].slice(0, 10).map(m => `${m.sig}@bar~${(m.tick / ppq / 4 + 1).toFixed(1)}`).join(' '));
  tracks.forEach((t, k) => {
    const ns = t.notes.map(n => n.note), last = Math.max(...t.notes.map(n => n.end));
    console.log(`${k} "${t.name}": ${t.notes.length} notes, range ${Math.min(...ns)}-${Math.max(...ns)}, ${step(last)} steps (${(step(last) / div / 4).toFixed(1)} bars of 4/4)`);
  });
  const all = tracks.flatMap(t => t.notes);
  console.log('off the grid: ' + [[4, '16ths'], [8, '32nds'], [3, '8th triplets'], [6, '16th triplets']].map(([d, n]) => `${n} ${(offGrid(d, all) * 100).toFixed(1)}%`).join(', '));
}
