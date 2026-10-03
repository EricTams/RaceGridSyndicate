// Music styles: the same score re-voiced. Each style sets:
//   bpm; rate (score steps per beat step: 0.5 = melody at half speed over the drums);
//   drums: 16- or 32-step patterns per drum ('x' hit, 'o' soft, '.' rest; ohat = open hat);
//   drums12 / drums18: patterns for songs in 3/4 / 9/8 (one bar each), falling back to drums;
//   bass: {every: 16ths, oct: alternate octaves} = repeat the score's current bass note (null = play the score's bass);
//   acid: {line, bars} = a sliding acid bass line instead (see acidStep in sequencer.js);
//   lead: {sections: [on, off]} = melody only for `on` bars after every `off` bars without it;
//   build: a riser, snare roll and drop-out in the 2 bars before each melody entry, and a crash on it;
//   pump: {depth, release, layers} = sidechain ducking on every kick;
//   swing: how late every other 16th lands (fraction of a 16th); fill: {every, snare, snare12, snare18} = a snare fill every N bars;
//   padGate: a 16-step rhythm that chops the current chord into pad stabs;
//   tr: semitones per layer; mute: layers this style leaves out; bright: master filter at full intensity;
//   bassRange: [lo, hi] = midi notes the bass is folded into (default [33, 44], A1-G#2);
//   layerIn: {layer: [from, to]} = override where a layer fades in with intensity (see LAYER_IN in sequencer.js);
//   synth: overrides on SYNTH_BASE (audio/synth.js).
// Darksynth (melody in sections) is the chosen sound; the variants each try one way of building on it.
'use strict';

STYLES.darksynth = {name: 'Darksynth', bpm: 100, bass: {every: 1}, bright: 9000, mute: ['clap'],
  lead: {sections: [8, 16]},   // melody 8 bars in every 24; the bass and drums carry the rest
  drums: {kick: 'x.....x...x.....', snare: '........x.......', hat: '..x...x...x...x.'},
  drums12: {kick: 'x.....x.....', snare: '........x...', hat: '..x...x...x.'},   // 3/4: kick 1 and 2&, snare on 3
  drums18: {kick: 'x...........x.....', snare: '......x...........', hat: '...x.....x.....x..'},   // 9/8: kick 1 and 3, snare on 2
  synth: {
    bass: {detune: [-10, 10], q: 3, from: 900, to: 180, gain: 0.22, sub: 0.6, hold: 0.08},
    lead: {detune: [-12, 0, 12], cut: 1600, peak: 2600, q: 2, gain: 0.13, rel: 0.3},
    pad: {cut: 700, gain: 0.08, att: 0.6, rel: 1.2},
    kick: {from: 120, to: 40, decay: 0.5, gain: 1},
    snare: {tone: 160, cut: 1200, decay: 0.35, gain: 0.6},
    echo: {steps: 3, fb: 0.5, tone: 1500, wet: 0.55},
    send: {lead: 0.35, snare: 0.3, pad: 0.4},
    drive: {bass: 0.8, lead: 0.3}}};

const darkVariant = (id, extra) => { STYLES[id] = deepMerge(JSON.parse(JSON.stringify(STYLES.darksynth)), JSON.parse(JSON.stringify(extra))); };
const V = {
  pump: {pump: {depth: 0.75, release: 0.22, layers: ['bass', 'pad', 'lead', 'arp']}},
  acid: {acid: {line: 'a.nNsnaN.nAsn.sN', bars: 16}, synth: {acid: {q: 14, gain: 0.2, lo: 160, hi: 1500}}},
  build: {build: true},
  drums: {swing: 0.18, fill: {every: 8, snare: '........x.o.xoxx', snare12: '....x.o.xoxx', snare18: '..........x.o.xoxx'},
    drums: {kick: 'x.....x...x.....', snare: '...o....x....o..', hat: 'o.x.o.x.o.x.o.xo', ohat: '..............x.'},
    drums12: {kick: 'x.....x.....', snare: '...o....x..o', hat: 'o.x.o.x.o.xo', ohat: '..........x.'},
    drums18: {kick: 'x...........x.....', snare: '....o.x.......o...', hat: 'o..x.o.o.x.o.o.x.o', ohat: '................x.'},
    synth: {kick: {from: 140, to: 38, drop: 0.09, decay: 0.8, gain: 1, click: 0.35}, hat: {decay: 0.035}}},
  pad: {padGate: 'x.xx.x.xx.x.x.xx', synth: {pad: {att: 0.005, rel: 0.06, gain: 0.05, cut: 1100}, send: {pad: 0.3}}},
};
darkVariant('dark-pump', Object.assign({name: 'Darksynth · sidechain pump'}, V.pump));
darkVariant('dark-acid', Object.assign({name: 'Darksynth · acid bass'}, V.acid));
darkVariant('dark-build', Object.assign({name: 'Darksynth · builds & drops'}, V.build));
darkVariant('dark-drums', Object.assign({name: 'Darksynth · better drums'}, V.drums));
darkVariant('dark-pad', Object.assign({name: 'Darksynth · gated pad'}, V.pad));
darkVariant('dark-all', deepMerge(deepMerge(deepMerge(deepMerge(deepMerge({name: 'Darksynth · all of the above'},
  JSON.parse(JSON.stringify(V.pump))), JSON.parse(JSON.stringify(V.acid))), JSON.parse(JSON.stringify(V.build))),
  JSON.parse(JSON.stringify(V.drums))), JSON.parse(JSON.stringify(V.pad))));

// Chill: for menus. Slow and soft, with the melody gentle and the score's own bass and harmony, no big drums.
STYLES.chill = {name: 'Chill (menu)', bpm: 84, bright: 4200, mute: ['snare', 'clap', 'fx'],
  layerIn: {lead: [-1, 0]},   // the melody is the point here, so it's always in
  bassRange: [33, 55],        // room for the score's bass line to move
  drums: {kick: 'x.........x.....', hat: '....o.......o..o'},
  drums12: {kick: 'x...........', hat: '....o...o...', ohat: '..........o.'},   // 3/4 waltz: boom, tick, tick
  drums18: {kick: 'x.................', hat: '......o.....o.....'},   // 9/8: boom on 1, ticks on 2 and 3
  synth: {
    lead: {wave: 'triangle', detune: [-6, 6], cut: 1800, peak: 2200, q: 1, gain: 0.16, rel: 0.8},
    arp: {wave: 'sine', cut: 2500, gain: 0.09, decay: 0.5},
    bass: {wave: 'triangle', q: 0, from: 900, to: 500, gain: 0.32, sub: 0.4, hold: 0.8},
    pad: {cut: 900, gain: 0.06, att: 0.5, rel: 1.5},
    kick: {from: 90, to: 40, decay: 0.4, gain: 0.55},
    hat: {cut: 8000, decay: 0.03, gain: 0.1},
    echo: {steps: 6, fb: 0.4, tone: 1800, wet: 0.45},
    send: {lead: 0.3, arp: 0.5, pad: 0.3},
    verb: {lead: 0.5, arp: 0.6, pad: 0.6, bass: 0.1}}};
