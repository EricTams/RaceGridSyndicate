// Bakes each track's scenery placements into game/js/data/scenery.js: the water sketch's quarter turn, the landmark's
// spot, and the finished freeways. It runs the full placement search in headless Chrome (the game opened with ?bake,
// which ignores the saved file), then merges the results into the file, leaving tracks marked locked:true alone.
// usage: node tools/bake-scenery.mjs [id ...] [--force] [--nolm]   (--nolm: landmarks hidden, so they don't bend roads)     (with ./play.sh serving on :8000)
//   no ids: every unlocked track; ids: just those (locked ones only with --force)
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const FILE = 'game/js/data/scenery.js';
const args = process.argv.slice(2), force = args.includes('--force'), nolm = args.includes('--nolm'), only = args.filter(a => !a.startsWith('--'));
const src = readFileSync(FILE, 'utf8');
const saved = new Function(src.replace("'use strict';", '') + ';return SCENERY;')();
const header = src.slice(0, src.indexOf('const SCENERY='));

// In the page: load each track with the full search and read back what it chose.
const capture = `(() => {
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, out = {};
  const ids = ${JSON.stringify(only)}.length ? ${JSON.stringify(only)} : TRACKS.map(t => t.id);
  const locked = ${JSON.stringify(Object.keys(saved).filter(id => saved[id].locked))};
  for (const id of ids) {
    if (locked.includes(id) && !${force}) continue;
    loadTrack(TRACKS.find(t => t.id === id));
    const lm = placeLandmark(TRACK), e = {};
    if (WATER_SKETCHES[id]) e.turn = WATER_TURN;
    e.landmark = {x: r1(lm.x), z: r1(lm.z), rot: r2(lm.rot || 0), ...(lm.span ? {span: lm.span} : {})};
    e.focus = FW_FOCUS.map(p => p.map(r1));
    e.roads = FW_ROADS.map(r => ({pts: r.pts.map(p => p.map(r1)), ys: r.ys.map(r2),
      ...(r.ramps ? {ramps: r.ramps} : {}), ...(r.fades ? {fades: r.fades} : {}), ...(r.arch ? {arch: true} : {}), ...(r.oneway ? {oneway: 1} : {}), ...(r.suspended ? {suspended: r.suspended} : {})}));
    out[id] = e;
  }
  return JSON.stringify(out);
})()`;

const tmp = mkdtempSync(join(tmpdir(), 'rgs-bake-'));
const raw = execFileSync('node', ['tools/headless-shot.mjs', join(tmp, 'x.png'), capture, nolm ? 'bake&nolm' : 'bake', '9444'],
  {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000});
const line = raw.trim().split('\n').find(l => l.startsWith('{'));
if (!line) { console.error('bake failed:\n' + raw); process.exit(1); }
const baked = JSON.parse(line);

const merged = {...saved};
for (const [id, e] of Object.entries(baked)) merged[id] = {...(saved[id] && saved[id].locked ? {locked: true} : {locked: false}), ...e};
// one track per line, so a diff shows which tracks changed
const body = Object.keys(merged).map(id => `  ${id}:${JSON.stringify(merged[id])},`).join('\n');
writeFileSync(FILE, header + 'const SCENERY={\n' + body + '\n};\n');
console.log(`baked ${Object.keys(baked).length} track(s): ${Object.keys(baked).join(', ') || 'none'}`);
const skipped = Object.keys(saved).filter(id => saved[id].locked && !baked[id]);
if (skipped.length) console.log(`left locked: ${skipped.join(', ')}`);
