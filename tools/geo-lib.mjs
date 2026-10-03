// Shared helpers for the geo tools (geo-place.mjs, geo-fit.mjs): read a track's ctrl points, and map real places
// (lat,lon) to world units and sketch frame units (data/waters.js, turn 0) under a placement.
// A placement is {lat, lon, mpu, deg}: the real spot at the circuit's bounding-box centre, metres per world unit, and
// how far the map is turned (degrees, clockwise as seen on a north-up map). World x runs east and z south when deg is 0.
import fs from 'fs';

export function ctrlOf(id) {
  const src = fs.readFileSync(new URL('../game/js/data/tracks.js', import.meta.url), 'utf8');
  const m = src.match(new RegExp(`id:'${id}'[\\s\\S]*?ctrl:(\\[\\[.*?\\]\\])`));
  if (!m) throw new Error(`no track ${id}`);
  return JSON.parse(m[1]);
}

// The ctrl points' bounding box: its centre and half-sizes (frame units put it at [-1,1] on both axes).
export function frameOf(ctrl) {
  const xs = ctrl.map(p => p[0]), zs = ctrl.map(p => p[1]);
  return {cx: (Math.min(...xs) + Math.max(...xs)) / 2, cz: (Math.min(...zs) + Math.max(...zs)) / 2,
    rx: (Math.max(...xs) - Math.min(...xs)) / 2, rz: (Math.max(...zs) - Math.min(...zs)) / 2};
}

const R = 6371000, rad = Math.PI / 180;
// Metres east and north of (lat0, lon0).
export const toMetres = (lat0, lon0) => ([lat, lon]) => [(lon - lon0) * rad * R * Math.cos(lat0 * rad), (lat - lat0) * rad * R];

export function placer(ctrl, pl) {
  const f = frameOf(ctrl), m = toMetres(pl.lat, pl.lon), c = Math.cos(pl.deg * rad), s = Math.sin(pl.deg * rad);
  const world = ll => {const [x, y] = m(ll), u = x / pl.mpu, v = -y / pl.mpu;return [f.cx + c * u - s * v, f.cz + s * u + c * v];};
  const frame = ([x, z]) => [+((x - f.cx) / f.rx).toFixed(3), +((z - f.cz) / f.rz).toFixed(3)];
  // world -> metres east/north of the placement's spot
  const metres = ([x, z]) => {const dx = x - f.cx, dz = z - f.cz, u = c * dx + s * dz, v = -s * dx + c * dz;return [u * pl.mpu, -v * pl.mpu];};
  return {world, frame: ll => frame(world(ll)), metres, f};
}

// The circuit as dense world points (about one per unit), for clearance checks.
export function densePath(ctrl) {
  const out = [];
  for (let i = 0; i < ctrl.length; i++) {
    const a = ctrl[i], b = ctrl[(i + 1) % ctrl.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}
