"""Measure what a racing circuit is made of, the same way for real F1 circuits and for our tracks.

Real circuits: the MIT-licensed GeoJSON outlines from github.com/bacinger/f1-circuits.
Ours: centreline samples exported from the game (loadTrack's P array), converted to metres with the car
as the ruler (our car is 2.4 units long, an F1 car about 5.5 m, so 1 unit is about 2.3 m).

usage: python3 sim/track_metrics.py f1-circuits.geojson [ours.json]
"""
import json, math, sys

STEP = 5.0            # resample spacing, metres
WIN = 30.0            # curvature is measured over this much track (smooths GPS noise)
R_CORNER = 400.0      # tighter than this radius counts as cornering (fast sweepers included)
SMOOTH = 40.0         # the centreline is smoothed over this much track first (GPS outlines are sparse)
R_STRAIGHT = 800.0    # gentler than this counts as straight
MIN_TURN = 15.0       # a corner has to turn at least this many degrees
CHICANE_GAP = 60.0    # opposite-hand corners closer than this form a chicane
UNIT_M = 5.5 / (1.7 * 1.4)   # metres per game unit (car length as the ruler)


def lonlat_to_m(coords):
    lat0 = math.radians(sum(c[1] for c in coords) / len(coords))
    return [(math.radians(x) * 6371000 * math.cos(lat0), math.radians(y) * 6371000) for x, y in coords]


def resample(pts):
    """Closed polyline resampled every STEP metres."""
    if pts[0] != pts[-1]:
        pts = pts + [pts[0]]
    out, carry = [pts[0]], 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        seg = math.hypot(x1 - x0, y1 - y0)
        d = STEP - carry
        while d <= seg:
            t = d / seg
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
            d += STEP
        carry = seg - (d - STEP)
    return out[:-1] if math.dist(out[-1], out[0]) < STEP / 2 else out


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def smooth(p):
    n, h = len(p), max(1, int(SMOOTH / STEP / 2))
    return [(sum(p[(i + j) % n][0] for j in range(-h, h + 1)) / (2 * h + 1),
             sum(p[(i + j) % n][1] for j in range(-h, h + 1)) / (2 * h + 1)) for i in range(n)]


def measure(pts):
    p = smooth(resample(pts))
    n = len(p)
    length = n * STEP
    head = [math.atan2(p[(i + 1) % n][1] - p[i][1], p[(i + 1) % n][0] - p[i][0]) for i in range(n)]
    w = max(1, int(WIN / STEP / 2))
    k = [wrap(head[(i + w) % n] - head[(i - w) % n]) / (2 * w * STEP) for i in range(n)]   # signed curvature, 1/m
    area = sum(p[i][0] * p[(i + 1) % n][1] - p[(i + 1) % n][0] * p[i][1] for i in range(n)) / 2

    # Corners: runs tighter than R_CORNER of one hand, turning at least MIN_TURN degrees.
    corner = [abs(x) > 1 / R_CORNER for x in k]
    start = next((i for i in range(n) if not corner[i]), 0)   # begin the scan on a non-corner sample
    corners, i = [], 0
    while i < n:
        j = (start + i) % n
        if corner[j]:
            run = []
            while i < n and corner[(start + i) % n] and (not run or (k[(start + i) % n] > 0) == (k[run[0]] > 0)):
                run.append((start + i) % n); i += 1
            turn = math.degrees(abs(sum(k[r] for r in run) * STEP))
            if turn >= MIN_TURN:
                ravg = len(run) * STEP / math.radians(turn)   # average radius: arc length over angle
                corners.append({'at': run[0], 'end': run[-1], 'turn': turn, 'r': ravg, 'left': k[run[0]] > 0})
        else:
            i += 1

    def kind(c):
        if c['turn'] >= 130 or c['r'] < 25: return 'hairpin'
        if c['r'] < 60: return 'slow'
        if c['r'] < 150: return 'medium'
        return 'fast'
    kinds = {x: sum(1 for c in corners if kind(c) == x) for x in ('hairpin', 'slow', 'medium', 'fast')}

    # Chicanes: consecutive corners of opposite hand close together.
    chicanes = 0
    for a, b in zip(corners, corners[1:] + corners[:1]):
        gap = ((b['at'] - a['end']) % n) * STEP
        if a['left'] != b['left'] and gap < CHICANE_GAP and a['turn'] > 20 and b['turn'] > 20:
            chicanes += 1

    # Straights: runs gentler than R_STRAIGHT.
    straight = [abs(x) < 1 / R_STRAIGHT for x in k]
    s0 = next((i for i in range(n) if not straight[i]), 0)
    runs, cur = [], 0
    for i in range(n):
        if straight[(s0 + i) % n]: cur += 1
        else:
            if cur: runs.append(cur)
            cur = 0
    if cur: runs.append(cur)
    longest = max(runs, default=0) * STEP

    return {
        'len_m': round(length), 'corners': len(corners), **kinds, 'chicanes': chicanes,
        'straight_pct': round(100 * sum(straight) / n), 'longest_m': round(longest),
        'longest_pct': round(100 * longest / length), 'per_km': round(len(corners) / length * 1000, 1),
        'left': sum(c['left'] for c in corners), 'right': sum(not c['left'] for c in corners),
        'dir': 'ccw' if area > 0 else 'cw',
    }


COLS = ['len_m', 'corners', 'per_km', 'hairpin', 'slow', 'medium', 'fast', 'chicanes', 'straight_pct', 'longest_m', 'longest_pct', 'left', 'right', 'dir']


def table(rows):
    print(f"{'circuit':34s} " + ' '.join(f'{c:>8s}' for c in COLS))
    for name, m in rows:
        print(f'{name[:34]:34s} ' + ' '.join(f'{str(m[c]):>8s}' for c in COLS))


if __name__ == '__main__':
    geo = json.load(open(sys.argv[1]))
    rows = [(f['properties']['Name'], measure(lonlat_to_m(f['geometry']['coordinates']))) for f in geo['features']]
    print('REAL CIRCUITS'); table(rows)
    if len(sys.argv) > 2:
        ours = json.load(open(sys.argv[2]))
        print('\nOUR TRACKS (1 unit = %.2f m)' % UNIT_M)
        table([(t['name'], measure([(x * UNIT_M, z * UNIT_M) for x, z in t['pts']])) for t in ours])
