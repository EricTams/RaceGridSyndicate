// OSM geo: fetch a city's real water and main roads from OpenStreetMap (Overpass API) for a box, simplified, as the
// geo.json that geo-fit.mjs and geo-place.mjs read:
//   {"water": [[[lat,lon],...], ...], "roads": {"name": [[lat,lon],...], ...}}
// Water is every lake, river, canal and basin (natural=water, waterway=riverbank) plus the sea (coastline, closed along
// the box on its water side), clipped to the box; pieces smaller than --minArea square metres are dropped. Roads are
// the motorways (and trunk roads with --trunk), one carriageway per named road, as the longest chain of its ways.
// Run: node tools/osm-geo.mjs <south,west,north,east> out.json [--minArea 2000] [--trunk] [--eps 12]
import fs from 'fs';

const [bboxArg, out, ...rest] = process.argv.slice(2);
const opt = {};for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) opt[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
const [S, W, N, E] = bboxArg.split(',').map(Number), minArea = +(opt.minArea || 2000), eps = +(opt.eps || 12);
const bb = `${S},${W},${N},${E}`, hw = opt.trunk ? 'motorway|trunk' : 'motorway';
const q = `[out:json][timeout:120];(way["natural"="water"](${bb});relation["natural"="water"](${bb});way["waterway"="riverbank"](${bb});
  relation["waterway"="riverbank"](${bb});way["natural"="coastline"](${bb});way["highway"~"^(${hw})$"](${bb}););out geom;`;
let res;
for (let tryN = 1; ; tryN++) {   // the public server is often busy: try a few times
  res = await fetch('https://overpass-api.de/api/interpreter', {method: 'POST', headers: {'User-Agent': 'RaceGridSyndicate-scenery/1.0',
    'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'}, body: 'data=' + encodeURIComponent(q)});
  if (res.ok) break;
  if (tryN >= 4) throw new Error(`overpass ${res.status}`);
  await new Promise(r => setTimeout(r, 5000 * tryN));
}
const els = (await res.json()).elements;

const lat0 = (S + N) / 2, K = Math.cos(lat0 * Math.PI / 180);
const m = ([a, o]) => [o * 111320 * K, a * 110540];
const key = p => p[0].toFixed(7) + ',' + p[1].toFixed(7);
// Join ways into chains by shared end points (reversing where needed).
function chains(ways) {
  ways = ways.map(w => w.slice());const outC = [];
  while (ways.length) {
    let c = ways.pop(), grew = true;
    while (grew && key(c[0]) !== key(c[c.length - 1])) {grew = false;
      for (let i = 0; i < ways.length; i++) {const w = ways[i];
        if (key(w[0]) === key(c[c.length - 1])) c = c.concat(w.slice(1));
        else if (key(w[w.length - 1]) === key(c[c.length - 1])) c = c.concat(w.slice(0, -1).reverse());
        else if (key(w[w.length - 1]) === key(c[0])) c = w.concat(c.slice(1));
        else if (key(w[0]) === key(c[0])) c = w.slice().reverse().concat(c.slice(1));
        else continue;
        ways.splice(i, 1);grew = true;break;}}
    outC.push(c);}
  return outC;
}
const geomOf = e => e.geometry.map(g => [g.lat, g.lon]);
const inBox = p => p[0] >= S && p[0] <= N && p[1] >= W && p[1] <= E;
// Clip a closed ring to the box (Sutherland-Hodgman).
function clipRing(r) {
  const edges = [p => p[0] - S, p => N - p[0], p => p[1] - W, p => E - p[1]];
  for (const f of edges) {const o = [];
    for (let i = 0; i < r.length; i++) {const a = r[(i + r.length - 1) % r.length], b = r[i], fa = f(a), fb = f(b);
      if (fb >= 0) {if (fa < 0) o.push(cut(a, b, fa, fb));o.push(b);} else if (fa >= 0) o.push(cut(a, b, fa, fb));}
    r = o;if (!r.length) break;}
  return r;
}
const cut = (a, b, fa, fb) => {const t = fa / (fa - fb);return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];};
const area = r => Math.abs(r.reduce((t, p, i) => {const [x0, y0] = m(p), [x1, y1] = m(r[(i + 1) % r.length]);return t + x0 * y1 - x1 * y0;}, 0)) / 2;
function rdp(p, e) {
  if (p.length < 3) return p;const [a, b] = [m(p[0]), m(p[p.length - 1])], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;let dm = 0, k = 0;
  for (let i = 1; i < p.length - 1; i++) {const [x, y] = m(p[i]), d = Math.abs((b[0] - a[0]) * (a[1] - y) - (a[0] - x) * (b[1] - a[1])) / L;if (d > dm) {dm = d;k = i;}}
  return dm > e ? [...rdp(p.slice(0, k + 1), e).slice(0, -1), ...rdp(p.slice(k), e)] : [p[0], p[p.length - 1]];
}
// A closed ring simplified: split at its farthest point from the start, so both halves are open lines.
function simpRing(r) {
  const [x0, y0] = m(r[0]);let k = 0, dm = -1;r.forEach((p, i) => {const [x, y] = m(p), d = (x - x0) ** 2 + (y - y0) ** 2;if (d > dm) {dm = d;k = i;}});
  return [...rdp(r.slice(0, k + 1), eps).slice(0, -1), ...rdp([...r.slice(k), r[0]], eps).slice(0, -1)];
}

const water = [];
// lakes, rivers, canals: ways and multipolygon outers (inner islands are left as water: the sketch can add land)
const polys = [];
for (const e of els) {const t = e.tags || {};
  if (!(t.natural === 'water' || t.waterway === 'riverbank')) continue;
  if (e.type === 'way') polys.push(geomOf(e));
  else polys.push(...chains(e.members.filter(mb => mb.role === 'outer' && mb.geometry).map(mb => mb.geometry.map(g => [g.lat, g.lon]))));}
for (const r of polys) {if (key(r[0]) !== key(r[r.length - 1])) continue;const c = clipRing(r.slice(0, -1));if (c.length > 2 && area(c) >= minArea) water.push(simpRing(c));}
// the sea: coastline chains (land on the left, water on the right) cut to the box and closed round it clockwise
const coast = chains(els.filter(e => e.tags && e.tags.natural === 'coastline').map(geomOf));
const corners = [[N, E], [S, E], [S, W], [N, W]];   // clockwise from the north-east
const perim = p => {const [a, o] = p;   // position round the box, clockwise from the north-west corner
  if (Math.abs(a - N) < 1e-9) return (o - W) / (E - W);if (Math.abs(o - E) < 1e-9) return 1 + (N - a) / (N - S);
  if (Math.abs(a - S) < 1e-9) return 2 + (E - o) / (E - W);return 3 + (a - S) / (N - S);};
const cornerAt = [1, 2, 3, 4].map((t, i) => [t, corners[i]]);
// the runs of every coastline chain inside the box, each from where it enters the box to where it leaves (a chain
// wholly inside, an island, is left out: the sea round it is the box's)
const runs = [];
for (const c of coast) {
  let run = null;
  for (let i = 0; i < c.length; i++) {const p = c[i], inside = inBox(p);
    if (inside && !run) {if (i === 0) continue;run = [edgeHit(c[i - 1], p)];}
    if (!run) continue;
    if (inside) run.push(p);
    else {run.push(edgeHit(p, c[i - 1]));runs.push(run);run = null;}}
}
// Close the sea: from each run's exit, walk clockwise round the box to the next run's entry and carry on along that
// run, until back at the start (several runs make one sea when a creek or canal cuts the coast).
const cw = (from, to) => ((to - from) % 4 + 4) % 4;
const used = new Set();
for (let s = 0; s < runs.length; s++) {
  if (used.has(s)) continue;const ring = [];let k = s;
  for (let guard = 0; guard <= runs.length; guard++) {
    used.add(k);ring.push(...runs[k]);const a = perim(runs[k][runs[k].length - 1]);
    let next = -1, best = 5;
    runs.forEach((r, j) => {if (used.has(j) && j !== s) return;const d = cw(a, perim(r[0]));if (d < best) {best = d;next = j;}});
    for (const [ct, cp] of [...cornerAt, ...cornerAt.map(([t2, p]) => [t2 + 4, p])]) {const d = ct - a;if (d > 0 && d < best) ring.push(cp);}
    if (next === s || next < 0) break;k = next;}
  if (ring.length > 2 && area(ring) >= minArea) water.push(simpRing(ring));
}
function edgeHit(outP, inP) {   // where the segment from inside to outside crosses the box
  let t = 1;const d = [outP[0] - inP[0], outP[1] - inP[1]];
  for (const [v, lo, hi, dv] of [[inP[0], S, N, d[0]], [inP[1], W, E, d[1]]]) {
    if (dv > 0) t = Math.min(t, (hi - v) / dv);else if (dv < 0) t = Math.min(t, (lo - v) / dv);}
  return [inP[0] + d[0] * t, inP[1] + d[1] * t];
}

// roads: per name (or ref), the longest chain of its ways, clipped to the box and simplified
const byName = {};
for (const e of els) {const t = e.tags || {};if (!t.highway || !/^(motorway|trunk)$/.test(t.highway)) continue;
  const n = t['name:en'] || t.name || t.ref;if (!n) continue;(byName[n] = byName[n] || []).push(geomOf(e));}
const roads = {};
const len = c => c.reduce((s, p, i) => i ? s + Math.hypot(...[0, 1].map(k => m(p)[k] - m(c[i - 1])[k])) : 0, 0);
for (const [n, ws] of Object.entries(byName)) {
  const best = chains(ws).map(c => c.filter(inBox)).filter(c => c.length > 1).sort((a, b) => len(b) - len(a))[0];
  if (best && len(best) > 300) roads[n] = rdp(best, eps).map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]);}
// the same water can come twice (a canal mapped both as a basin and as coastline): keep one
const seenW = [];
for (let i = water.length - 1; i >= 0; i--) {const r = water[i], A = area(r), c = [0, 1].map(k => r.reduce((t, p) => t + p[k], 0) / r.length);
  if (seenW.some(([B, d]) => Math.abs(A - B) < 0.02 * A && Math.hypot(c[0] - d[0], c[1] - d[1]) < 5e-4)) water.splice(i, 1);else seenW.push([A, c]);}
fs.writeFileSync(out, JSON.stringify({water: water.map(r => r.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)])), roads}));
console.log(`water: ${water.length} pieces (${water.map(r => r.length).join(' ')} points); roads: ${Object.entries(roads).map(([n, r]) => `${n} (${r.length})`).join(', ')}`);
