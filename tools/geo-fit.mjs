// Geo fit: find where a circuit sits best in a real city, before any scenery is drawn. Give it the city's real water
// (rings of lat,lon) and freeways (lines of lat,lon) and it tries positions, map scales and angles, keeping the circuit
// on land and clear of the freeways, near a chosen spot, with a chosen direction laid along the wide screen.
// Prints the best placements; pass one to geo-place.mjs to turn traced points into sketch units.
// geo.json: {"water": [[[lat,lon],...], ...], "roads": {"name": [[lat,lon],...], ...}}
// Run: node tools/geo-fit.mjs detroit geo.json --near 42.3315,-83.0465 --along 42.323,-83.060:42.335,-83.020
//        [--mpu 9:14] [--radius 600] [--water 12] [--road 10] [--deg 150:210] (only map turns in that range)
import fs from 'fs';
import {ctrlOf, placer, densePath, toMetres} from './geo-lib.mjs';

const [id, file, ...rest] = process.argv.slice(2);
const opt = {};for (let i = 0; i < rest.length; i += 2) opt[rest[i].slice(2)] = rest[i + 1];
const geo = JSON.parse(fs.readFileSync(file, 'utf8')), ctrl = ctrlOf(id), path = densePath(ctrl).filter((_, i) => i % 2 === 0);
const [nLat, nLon] = opt.near.split(',').map(Number), m = toMetres(nLat, nLon);
const [mpuLo, mpuHi] = (opt.mpu || '9:14').split(':').map(Number), radius = +(opt.radius || 600);
const needW = +(opt.water || 12), needR = +(opt.road || 10);

// Distance fields in metres round the chosen spot, 8 m cells: to the nearest shore (negative inside water) and to the
// nearest freeway.
const cell = 8, half = radius + 1500, n = Math.ceil(2 * half / cell);
const water = geo.water.map(r => r.map(m)), roads = Object.values(geo.roads).map(l => l.map(m));
const segDist = (px, py, a, b) => {const ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * ex + (py - a[1]) * ey) / (ex * ex + ey * ey || 1)));
  return Math.hypot(px - a[0] - ex * t, py - a[1] - ey * t);};
const inside = (px, py, r) => {let c = false;for (let i = 0, j = r.length - 1; i < r.length; j = i++) {const [xi, yi] = r[i], [xj, yj] = r[j];
  if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c;}return c;};
const WF = new Float32Array(n * n), RF = new Float32Array(n * n);
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
  const px = -half + (i + 0.5) * cell, py = -half + (j + 0.5) * cell;let dw = 1e9, dr = 1e9, wet = false;
  for (const r of water) {for (let k = 0; k < r.length; k++) dw = Math.min(dw, segDist(px, py, r[k], r[(k + 1) % r.length]));if (inside(px, py, r)) wet = true;}
  for (const l of roads) for (let k = 0; k + 1 < l.length; k++) dr = Math.min(dr, segDist(px, py, l[k], l[k + 1]));
  WF[j * n + i] = wet ? -dw : dw;RF[j * n + i] = dr;
}
const look = (F, x, y) => {const i = Math.floor((x + half) / cell), j = Math.floor((y + half) / cell);return i < 0 || j < 0 || i >= n || j >= n ? 1e9 : F[j * n + i];};

// The wide screen runs along world (1,-1) (the camera looks from +x+z).
let along = null;if (opt.along) along = opt.along.split(':').map(s => s.split(',').map(Number));
const results = [];
const [degLo, degHi] = (opt.deg || '0:355').split(':').map(Number);
for (let mpu = mpuLo; mpu <= mpuHi + 1e-9; mpu += 0.5) for (let deg = degLo; deg <= degHi; deg += 5) {
  let skew = 0;
  if (along) {const P = placer(ctrl, {lat: nLat, lon: nLon, mpu, deg}), a = P.world(along[0]), b = P.world(along[1]);
    const ang = Math.abs(((Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.atan2(-1, 1)) * 180 / Math.PI % 180 + 180) % 180);
    skew = Math.min(ang, 180 - ang);if (skew > 25) continue;}
  for (let oy = -radius; oy <= radius; oy += 40) for (let ox = -radius; ox <= radius; ox += 40) {
    if (Math.hypot(ox, oy) > radius) continue;
    const P = placer(ctrl, {lat: nLat, lon: nLon, mpu, deg});let w = 1e9, r = 1e9;
    for (const p of path) {const [x, y] = P.metres(p);w = Math.min(w, look(WF, x + ox, y + oy));r = Math.min(r, look(RF, x + ox, y + oy));}
    w /= mpu;r /= mpu;
    const ok = w >= needW && r >= needR, lat = nLat + oy / 111194.9, lon = nLon + ox / (111194.9 * Math.cos(nLat * Math.PI / 180));
    results.push({ok, slack: Math.min(w - needW, r - needR), cost: Math.hypot(ox, oy) + skew * 12 + Math.abs(mpu - (mpuLo + mpuHi) / 2) * 20,
      pl: {lat: +lat.toFixed(5), lon: +lon.toFixed(5), mpu, deg}, water: +w.toFixed(1), road: +r.toFixed(1), skew});
  }
}
const ok = results.filter(r => r.ok).sort((a, b) => a.cost - b.cost);
const best = ok.length ? ok : results.sort((a, b) => b.slack - a.slack);
console.log(ok.length ? `${ok.length} placements clear everything; best:` : 'nothing clears everything; closest:');
for (const r of best.slice(0, 6)) console.log(JSON.stringify(r.pl), `shore ${r.water}u, freeway ${r.road}u, ${Math.round(Math.hypot(...m([r.pl.lat, r.pl.lon])))} m from the spot, ${r.skew.toFixed(0)}° off the wide screen`);
