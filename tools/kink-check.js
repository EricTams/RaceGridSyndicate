// Kink check (runs inside the game page): on every track, rawFolds counts where the plain road edge folds over
// itself because a corner is tighter than the road is wide; folds lists where the edge the game actually draws
// crosses itself or doubles back in a spike (should be none). Also the tightest radius on the lap (world units; HW 4.3).
// overlaps lists where two stretches of road more than 30 units apart along the lap come closer than a road width plus
// a little (2 × HW + 0.4): their surfaces overlap (should be none). The track builder keeps close passes apart but
// treats anything within about 33 units along the lap as the same corner, so a hairpin's two legs can slip through.
// Run it with: node tools/headless-shot.mjs out.png "$(cat tools/kink-check.js)" (set window.KINK_TRACKS = [track defs] first to
// check just those, e.g. while trying control-point edits).
(() => {
  const out = [];
  for (const t of (window.KINK_TRACKS || TRACKS)) {   // window.KINK_TRACKS = [defs] checks just those
    loadTrack(t);
    // raw: the plain offset (centreline + normal * HW), which folds wherever a corner is tighter than the road is
    // wide (it runs backwards against the direction of travel).
    const rawFolds = [];
    for (const sign of [1, -1]) {
      const E = P.map((p, i) => [p.x + NRM[i].x * sign * HW, p.z + NRM[i].z * sign * HW]);
      let run = null;
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N, back = (E[j][0] - E[i][0]) * T[i].x + (E[j][1] - E[i][1]) * T[i].z < 0;
        if (back) { if (!run) run = {at: i, len: 0}; run.len++; } else if (run) { rawFolds.push(run); run = null; }
      }
      if (run) rawFolds.push(run);
    }
    // drawn: the edge the game draws (EDGE, see clippedEdge). It draws wrong where it crosses itself nearby, or
    // doubles back in a spike (a turn sharper than 135 degrees onto a short stub).
    const folds = [], W = Math.round(30 / DS);
    const cross = (a, b, c, d) => { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
    for (const sign of [1, -1]) {
      const E = EDGE[sign], side = sign > 0 ? 'right' : 'left';
      // the edge with repeated points (a clipped apex) removed
      const pts = [];
      for (let i = 0; i < N; i++) { const e = E[i], q = pts[pts.length - 1]; if (!q || Math.hypot(e[0] - q.p[0], e[1] - q.p[1]) > 1e-3) pts.push({p: e, i}); }
      const M = pts.length;
      // turn at point a, measured to the points at least `span` units away along the edge on either side
      const turnAt = (a, span) => {
        let b = a, c = a, d = 0;
        while (d < span && b > a - M) { const q = pts[(b - 1 + M) % M].p, r = pts[(b + M) % M].p; d += Math.hypot(r[0] - q[0], r[1] - q[1]); b--; }
        d = 0;
        while (d < span && c < a + M) { const q = pts[c % M].p, r = pts[(c + 1) % M].p; d += Math.hypot(r[0] - q[0], r[1] - q[1]); c++; }
        const p0 = pts[(b + M) % M].p, p1 = pts[a].p, p2 = pts[c % M].p, u = [p1[0] - p0[0], p1[1] - p0[1]], v = [p2[0] - p1[0], p2[1] - p1[1]];
        return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1)))) * 180 / Math.PI;
      };
      for (let a = 0; a < M; a++) {
        const p1 = pts[a].p, p2 = pts[(a + 1) % M].p;
        // a sharp apex stays sharp seen from 2 units away (the inside of a hairpin, fine); a spike is sharp up close
        // but the edge around it runs smoothly
        const near = turnAt(a, 0.01);
        if (near > 135 && turnAt(a, 2) < 60) folds.push({pos: +(pts[a].i / N).toFixed(3), kind: 'spike', turn: Math.round(near), side});
        for (let b = a + 2; b < a + W && b < a + M - 1; b++)
          if (cross(p1, p2, pts[b % M].p, pts[(b + 1) % M].p)) { folds.push({pos: +(pts[a].i / N).toFixed(3), kind: 'crossing', side}); break; }
      }
    }
    // tightest radius, over a small window so single-sample noise doesn't count
    let maxK = 0, at = 0;
    for (let i = 0; i < N; i++) { let a = 0; for (let k = -2; k <= 2; k++) a += Math.abs(K[(i + k + N) % N]); a /= 5; if (a > maxK) { maxK = a; at = i; } }
    // overlaps: runs of the lap that come within a road width of another stretch (from, to, the other stretch, closest)
    const gap = Math.round(30 / DS), lim = 2 * HW + 0.4, overlaps = [];
    for (let i = 0; i < N; i += 2) {
      let best = 1e9, bj = 0;
      for (let j = 0; j < N; j += 2) {
        const dd = Math.min(Math.abs(i - j), N - Math.abs(i - j)); if (dd < gap) continue;
        const d = Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z); if (d < best) { best = d; bj = j; }
      }
      if (best >= lim) continue;
      const r = overlaps[overlaps.length - 1];
      if (r && i / N - r.to < 0.01) { r.to = +(i / N).toFixed(3); if (best < r.closest) { r.closest = +best.toFixed(1); r.other = +(bj / N).toFixed(3); } }
      else overlaps.push({from: +(i / N).toFixed(3), to: +(i / N).toFixed(3), other: +(bj / N).toFixed(3), closest: +best.toFixed(1)});
    }
    out.push({id: t.id, name: t.name, N, minR: +(1 / maxK).toFixed(2), minRat: +(at / N).toFixed(3), rawFolds: rawFolds.length,
      folds, overlaps});
  }
  return JSON.stringify({HW, out});
})()
