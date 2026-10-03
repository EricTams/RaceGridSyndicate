// Geo place: for a track built from a real circuit, turn real map coordinates (lat,lon from Google Maps) into
// sketch frame units (data/waters.js, turn 0), so water, freeways and landmarks land where they really are.
// It fits the circuit's real outline (sim/f1-circuits.geojson) onto the track's ctrl points (turn, mirror, scale,
// shift) and reports how well it matched. Points go in a JSON file: {"name": [[lat,lon], ...], ...}.
// Run: node tools/geo-place.mjs vegas "Las Vegas Street Circuit" points.json
// For a track that isn't its city's own circuit, give a placement from geo-fit.mjs instead of the circuit's name:
//      node tools/geo-place.mjs detroit '{"lat":42.3325,"lon":-83.0467,"mpu":9,"deg":155}' points.json
import fs from 'fs';
import {ctrlOf, placer} from './geo-lib.mjs';

const [id, circuit, file] = process.argv.slice(2);
if (circuit.startsWith('{')) {
  const P = placer(ctrlOf(id), JSON.parse(circuit)), data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.water && data.roads) {
    // a geo.json from osm-geo.mjs: print sketch entries, keeping the water and road near the circuit (within 6 frame
    // units) and roads named on the command line after the file (all of them if none are)
    const near = p => Math.abs(p[0]) < 6 && Math.abs(p[1]) < 6, want = process.argv.slice(5);
    for (const r of data.water) {const f = r.map(P.frame);if (f.some(p => Math.abs(p[0]) < 4 && Math.abs(p[1]) < 4)) console.log(`    {poly:${JSON.stringify(f)},drift:[0.2,0.1]},`);}
    for (const [name, l] of Object.entries(data.roads)) {if (want.length && !want.includes(name)) continue;
      const dense = l.flatMap((p, i) => {if (!i) return [p];const q = l[i - 1], n = Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / 0.0005);
        return Array.from({length: n}, (_, k) => [q[0] + (p[0] - q[0]) * (k + 1) / n, q[1] + (p[1] - q[1]) * (k + 1) / n]);});   // ~50 m steps
      const f = dense.map(P.frame).filter(near).filter((p, i, a) => i === 0 || i === a.length - 1 || i % 4 === 0);if (f.length > 1) console.log(`    {road:${JSON.stringify(f)}},   // ${name}`);}
  } else for (const [name, pts] of Object.entries(data)) console.log(`${name}: ${JSON.stringify(pts.map(P.frame))}`);
  process.exit(0);
}
const src = fs.readFileSync(new URL('../game/js/data/tracks.js', import.meta.url), 'utf8');
const ctrl = JSON.parse(src.match(new RegExp(`id:'${id}'[\\s\\S]*?ctrl:(\\[\\[.*?\\]\\])`))[1]);
const geo = JSON.parse(fs.readFileSync(new URL('../sim/f1-circuits.geojson', import.meta.url), 'utf8'));
const feat = geo.features.find(f => f.properties.Name === circuit);
if (!feat) throw new Error(`no circuit named ${circuit}`);

// Same projection as sim/build_tracks.py: metres east, and north is -z.
const coords = feat.geometry.coordinates, lat0 = coords.reduce((t, c) => t + c[1], 0) / coords.length * Math.PI / 180;
const R = 6371000, toM = ([lon, lat]) => [lon * Math.PI / 180 * R * Math.cos(lat0), -lat * Math.PI / 180 * R];
const real = coords.map(toM);

// Similarity fit (optionally mirrored) by iterative closest points, from several starting turns; keep the best.
const mean = ps => ps.reduce((m, p) => [m[0] + p[0] / ps.length, m[1] + p[1] / ps.length], [0, 0]);
function solve(a, b) {   // best s,R,t with b ≈ s·R·a + t (2D Procrustes)
  const ma = mean(a), mb = mean(b);let sxx = 0, sxy = 0, n2 = 0;
  a.forEach((p, i) => {const ax = p[0] - ma[0], ay = p[1] - ma[1], bx = b[i][0] - mb[0], by = b[i][1] - mb[1];
    sxx += ax * bx + ay * by;sxy += ax * by - ay * bx;n2 += ax * ax + ay * ay;});
  const th = Math.atan2(sxy, sxx), s = Math.hypot(sxx, sxy) / n2, c = Math.cos(th), sn = Math.sin(th);
  return {s, th, f: ([x, y]) => [s * (c * (x - ma[0]) - sn * (y - ma[1])) + mb[0], s * (sn * (x - ma[0]) + c * (y - ma[1])) + mb[1]]};
}
const near = (p, ps) => ps.reduce((b, q) => {const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;return d < b[0] ? [d, q] : b;}, [1e18, null]);
let best = null;
for (const mir of [1, -1]) for (let k = 0; k < 12; k++) {
  const a0 = real.map(([x, y]) => [x * mir, y]);
  let T = solve(a0, a0);   // start: scale and turn by hand, centred on the ctrl points
  const mc = mean(ctrl), mr = mean(a0), s0 = 1 / 9, th = k * Math.PI / 6;
  T = {f: ([x, y]) => {const dx = (x - mr[0]) * s0, dy = (y - mr[1]) * s0;return [Math.cos(th) * dx - Math.sin(th) * dy + mc[0], Math.sin(th) * dx + Math.cos(th) * dy + mc[1]];}};
  for (let it = 0; it < 40; it++) {
    const moved = a0.map(T.f), pairs = moved.map(p => near(p, ctrl)[1]);
    T = solve(a0, pairs);
  }
  const rms = Math.sqrt(a0.map(T.f).reduce((t, p) => t + near(p, ctrl)[0], 0) / a0.length);
  if (!best || rms < best.rms) best = {rms, T, mir};
}
const place = ([lat, lon]) => {const [x, y] = toM([lon, lat]);return best.T.f([x * best.mir, y]);};

// Frame units: the ctrl points' bounding box is [-1,1] on both axes (water.js uses the smoothed road, close enough).
const xs = ctrl.map(p => p[0]), zs = ctrl.map(p => p[1]);
const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
const rx = (Math.max(...xs) - Math.min(...xs)) / 2, rz = (Math.max(...zs) - Math.min(...zs)) / 2;
const frame = ([x, z]) => [+((x - cx) / rx).toFixed(3), +((z - cz) / rz).toFixed(3)];
console.log(`fit: ${best.rms.toFixed(1)} units rms, ${best.mir < 0 ? 'mirrored, ' : ''}${(1 / best.T.s).toFixed(2)} m per unit, turned ${(best.T.th * 180 / Math.PI).toFixed(0)}°`);
console.log(`north is world [${[0, 1].map(i => (place([36.2, -115.17])[i] - place([36.1, -115.17])[i]).toFixed(0)).join(',')}] per 0.1° (frame half-size ${rx.toFixed(0)} x ${rz.toFixed(0)})`);
if (file) for (const [name, pts] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8'))))
  console.log(`${name}: ${JSON.stringify(pts.map(p => frame(place(p))))}`);
