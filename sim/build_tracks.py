"""Build game tracks from real circuit outlines: same shape, shrunk to game size.

Each outline (MIT-licensed GeoJSON from github.com/bacinger/f1-circuits) is converted to metres, smoothed,
rotated so the start straight heads +x, shrunk uniformly to a target lap length, and decimated into control
points. It also works out what the game needs to place the track:
  mPerUnit  real metres per world unit (the sim corners at real size: see loadTrack's physics scale)
  pitSide   which side of the start straight is outside the loop (the pit lane goes there)
  (tracks never cross themselves; parts of the lap that pass close by are nudged apart to two road widths)
  landmark  the infield point furthest from the road

usage: python3 sim/build_tracks.py f1-circuits.geojson > tracks.json
"""
import json, math, sys

TRACK_SCALE = 1.35     # game: world units per control-point unit
HW = 4.3               # game: track half-width (world units)
CTRL_STEP = 6.0        # world units between control points (dense enough that the game curve matches)

# id, source circuit, target lap length (world units), game name, tags, tiers, city dressing
PLAN = [
    # tiers: 0 Gutter, 1 Sprawl, 2 Corporate. Every tier mixes power, flowing and tight circuits; only the extreme
    # ones (Monaco, Marina Bay, Jeddah, Imola) are held back for the top.
    ('hongkong', 'Circuit de Monaco', 560, 'Victoria Harbour Streets', ['tight'], [2],
     {'canal': True, 'freeway': False, 'landmark': 'tower', 'color': '#ff2e88', 'rain': 0.25}),
    ('singapore', 'Marina Bay Street Circuit', 620, 'Marina Nightline', ['tight', 'tunnels'], [2],
     {'canal': True, 'freeway': True, 'landmark': 'wheel', 'color': '#ffd23f', 'rain': 0.3}),
    ('tokyo', 'Shanghai International Circuit', 660, 'Shinjuku Spiral', ['straights', 'tunnels'], [0],
     {'canal': False, 'freeway': True, 'landmark': 'antenna', 'color': '#ff3b3b', 'rain': 0.2}),
    ('seattle', 'Circuit de Spa-Francorchamps', 720, 'Rain City Ring', ['straights', 'tunnels'], [1, 2],
     {'canal': True, 'freeway': True, 'landmark': 'antenna', 'color': '#7dffea', 'rain': 0.45}),
    ('newyork', 'Autodromo Nazionale Monza', 680, 'Five Boroughs Speedway', ['straights', 'tunnels'], [0, 1],
     {'canal': True, 'freeway': True, 'landmark': 'tower', 'color': '#c86bff', 'rain': 0.2}),
    ('vegas', 'Las Vegas Street Circuit', 680, 'Neon Strip', ['straights'], [1, 2],
     {'canal': False, 'freeway': True, 'landmark': 'dome', 'color': '#ff9a3c', 'rain': 0.05}),
    # batch 1 (2026-09-24): fills out the Gutter and Sprawl pools
    ('detroit', 'Red Bull Ring', 600, 'Motor City Drop', ['straights'], [0],
     {'canal': False, 'freeway': True, 'landmark': 'stack', 'color': '#ff5e3a', 'rain': 0.2}),
    ('dubai', 'Bahrain International Circuit', 650, 'Mirage Circuit', ['straights'], [0],
     {'canal': False, 'freeway': True, 'landmark': 'dome', 'color': '#ffc86b', 'rain': 0.02}),
    ('amsterdam', 'Circuit Zandvoort', 600, 'Amstel Bank', ['tight'], [0],
     {'canal': True, 'freeway': False, 'landmark': 'crane', 'color': '#3cf0ff', 'rain': 0.35}),
    ('seoul', 'Hungaroring', 610, 'Gangnam Twist', ['tight'], [0, 1],
     {'canal': True, 'freeway': True, 'landmark': 'antenna', 'color': '#ff4fd8', 'rain': 0.2}),
    ('lagos', 'Circuit Gilles-Villeneuve', 610, 'Lagoon Island Run', ['straights'], [0, 1],
     {'canal': True, 'freeway': False, 'landmark': 'crane', 'color': '#8cff5a', 'rain': 0.3}),
    ('mumbai', 'Autódromo José Carlos Pace - Interlagos', 600, 'Monsoon Bowl', ['tight'], [0, 1],
     {'canal': False, 'freeway': True, 'landmark': 'stack', 'color': '#ffe14d', 'rain': 0.4}),
    ('london', 'Silverstone Circuit', 680, 'Thames Barrier Circuit', ['straights'], [1, 2],
     {'canal': True, 'freeway': True, 'landmark': 'tower', 'color': '#5a8cff', 'rain': 0.35}),
    ('berlin', 'Circuit de Barcelona-Catalunya', 620, 'Spree Nights', ['straights'], [1],
     {'canal': True, 'freeway': True, 'landmark': 'antenna', 'color': '#b4ff3c', 'rain': 0.2}),
    ('cairo', 'Baku City Circuit', 680, 'Citadel Streets', ['straights', 'tight'], [1, 2],
     {'canal': False, 'freeway': True, 'landmark': 'dome', 'color': '#ffb03c', 'rain': 0.02}),
    ('losangeles', 'Autódromo Hermanos Rodríguez', 600, 'Sunset Interchange', ['straights'], [1, 2],
     {'canal': False, 'freeway': True, 'landmark': 'tower', 'color': '#ff6fa0', 'rain': 0.05}),
    # batch 2 (2026-09-24): fills out the Corporate pool and widens the Gutter
    ('rio', 'Jeddah Corniche Circuit', 690, 'Copacabana Rush', ['straights'], [2],
     {'canal': True, 'freeway': True, 'landmark': 'tower', 'color': '#3cffb0', 'rain': 0.3}),
    ('prague', 'Autodromo Enzo e Dino Ferrari', 630, 'Vltava Ring', ['tight'], [2],
     {'canal': True, 'freeway': False, 'landmark': 'tower', 'color': '#ff8a3c', 'rain': 0.3}),
    ('chicago', 'Circuit of the Americas', 660, 'Lakeshore Grand', ['straights'], [1, 2],
     {'canal': False, 'freeway': True, 'landmark': 'antenna', 'color': '#4fd1ff', 'rain': 0.25}),
    ('bangkok', 'Intercity Istanbul Park', 650, 'Chao Phraya Circuit', ['straights'], [1, 2],
     {'canal': True, 'freeway': True, 'landmark': 'stack', 'color': '#ff3cc8', 'rain': 0.35}),
    ('jakarta', 'Sepang International Circuit', 660, 'Batavia Docks', ['straights'], [0],
     {'canal': True, 'freeway': False, 'landmark': 'crane', 'color': '#ffd84d', 'rain': 0.4}),
    ('phoenix', 'Losail International Circuit', 655, 'Sunburn Speedway', ['straights'], [0],
     {'canal': False, 'freeway': True, 'landmark': 'dome', 'color': '#ff7a3c', 'rain': 0.02}),
    ('sanfrancisco', 'Autódromo Internacional do Algarve', 620, 'Fog City Coaster', ['tight'], [0],
     {'canal': True, 'freeway': True, 'landmark': 'antenna', 'color': '#9d7dff', 'rain': 0.25}),
    ('sydney', 'Albert Park Circuit', 650, 'Opal Park Circuit', ['straights'], [1, 2],
     {'canal': True, 'freeway': False, 'landmark': 'wheel', 'color': '#5affc8', 'rain': 0.2}),
    ('havana', 'Miami International Autodrome', 655, 'Malecon Neon', ['straights'], [2],
     {'canal': True, 'freeway': True, 'landmark': 'dome', 'color': '#ff5ab4', 'rain': 0.15}),
]


# City dressing sheet (DRAFT, 2026-09-24): the scenery hints that make each track feel like its city. The water
# column is superseded by the per-city sketches in game/js/data/waters.js (kept here only as the fallback written
# into tracks.js). The landmark column is wired in: each track's landmark in tracks.js has its kind and a placement
# rule (see placeLandmark in game/js/world/circuit.js). The road column is not used (freeways stay simple scenery). It evokes the CITY, not the circuit the shape came from (Citadel Streets is Baku's layout dressed as Cairo).
# Placement is loose: directions are map compass points (north = up in the full-track view) and the builder keeps
# everything clear of the road.
#   water:    ('coast', side)         sea filling one side of the map
#             ('river', dir, bend[, w]) a band crossing the map; bend = none / slight / strong; w wide (16)
#             ('canals', dir, n)      n thin parallel channels
#             ('lake', side)          a big body of water on one side, calmer shoreline than a coast
#             None
#   road:     ('freeway', dir)        one straight elevated line (today's freeway)
#             ('interchange', a, b)   two elevated freeways crossing
#             ('shore',)              elevated road following the water's edge
#             ('bridge',)             elevated road crossing the water
#             None
#   landmark: (kind, note)  existing kinds: tower, crane, stack, wheel, antenna, dome
#                           It sits inside the loop OR nearby outside it, wherever suits it best (a riverside
#                           wheel by the river, dock cranes on the shore, a statue on a hill beside the track).
#                           NEW kinds: pyramid, statue, suspension, shell (windmill optional)
CITY_DRESS = {
    'hongkong':     {'water': ('river', 'E-W', 'none', 34),   'road': ('shore',),              'landmark': ('tower', 'harbourfront skyscraper')},
    'singapore':    {'water': ('coast', 'S'),             'road': ('freeway', 'E-W'),      'landmark': ('wheel', 'observation wheel on the bay')},
    'tokyo':        {'water': None,                       'road': ('interchange', 'N-S', 'E-W'), 'landmark': ('antenna', 'lattice broadcast tower')},
    'seattle':      {'water': ('coast', 'W'),             'road': ('freeway', 'N-S'),      'landmark': ('antenna', 'needle with a saucer top (retuned antenna)')},
    'newyork':      {'water': ('river', 'N-S', 'none'),   'road': ('bridge',),             'landmark': ('tower', 'art deco spire')},
    'vegas':        {'water': None,                       'road': ('freeway', 'N-S'),      'landmark': ('dome', 'giant glowing sphere')},
    'detroit':      {'water': ('river', 'E-W', 'slight'), 'road': ('bridge',),             'landmark': ('stack', 'car-plant smokestacks')},
    'dubai':        {'water': ('coast', 'N'),             'road': ('freeway', 'NE-SW'),    'landmark': ('tower', 'needle-thin supertall (retuned tower)')},
    'amsterdam':    {'water': ('canals', 'E-W', 3),       'road': None,                    'landmark': ('windmill', 'optional; else harbour crane')},
    'seoul':        {'water': ('river', 'E-W', 'slight'), 'road': ('shore',),              'landmark': ('antenna', 'hilltop tower')},
    'lagos':        {'water': ('lake', 'S'),              'road': ('bridge',),             'landmark': ('crane', 'port cranes')},
    'mumbai':       {'water': ('coast', 'W'),             'road': ('shore',),              'landmark': ('dome', 'domed seafront hotel')},
    'london':       {'water': ('river', 'E-W', 'strong'), 'road': ('bridge',),             'landmark': ('wheel', 'riverside wheel')},
    'berlin':       {'water': ('river', 'E-W', 'slight'), 'road': ('freeway', 'N-S'),      'landmark': ('antenna', 'TV tower with a ball')},
    'cairo':        {'water': ('river', 'N-S', 'slight'), 'road': ('bridge',),             'landmark': ('pyramid', 'NEW')},
    'losangeles':   {'water': ('coast', 'W'),             'road': ('interchange', 'N-S', 'E-W'), 'landmark': ('tower', 'downtown glass tower')},
    'rio':          {'water': ('coast', 'S'),             'road': ('shore',),              'landmark': ('statue', 'NEW: hilltop statue')},
    'prague':       {'water': ('river', 'N-S', 'strong'), 'road': ('bridge',),             'landmark': ('tower', 'castle spires')},
    'chicago':      {'water': ('lake', 'E'),              'road': ('shore',),              'landmark': ('tower', 'black supertall')},
    'bangkok':      {'water': ('river', 'N-S', 'strong'), 'road': ('freeway', 'E-W'),      'landmark': ('dome', 'temple stupa with a spire')},
    'jakarta':      {'water': ('coast', 'N'),             'road': ('freeway', 'E-W'),      'landmark': ('crane', 'dock cranes')},
    'phoenix':      {'water': ('canals', 'E-W', 1),       'road': ('interchange', 'N-S', 'E-W'), 'landmark': ('dome', 'desert stadium')},
    'sanfrancisco': {'water': ('coast', 'N'),             'road': ('bridge',),             'landmark': ('suspension', 'NEW: the bridge itself, out over the bay')},
    'sydney':       {'water': ('coast', 'N'),             'road': ('bridge',),             'landmark': ('shell', 'NEW: sail-roofed opera house')},
    'havana':       {'water': ('coast', 'N'),             'road': ('shore',),              'landmark': ('dome', 'capitol dome')},
}


def lonlat_to_m(coords):
    lat0 = math.radians(sum(c[1] for c in coords) / len(coords))
    # North is -z in the game (the camera looks with +z toward the viewer), so flip it or every track shows mirrored.
    return [(math.radians(x) * 6371000 * math.cos(lat0), -math.radians(y) * 6371000) for x, y in coords]


def resample(pts, step):
    if pts[0] != pts[-1]:
        pts = pts + [pts[0]]
    out, carry = [pts[0]], 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        seg = math.hypot(x1 - x0, y1 - y0)
        d = step - carry
        while d <= seg:
            t = d / seg
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
            d += step
        carry = seg - (d - step)
    return out[:-1] if math.dist(out[-1], out[0]) < step / 2 else out


def smooth(p, half):
    n = len(p)
    return [(sum(p[(i + j) % n][0] for j in range(-half, half + 1)) / (2 * half + 1),
             sum(p[(i + j) % n][1] for j in range(-half, half + 1)) / (2 * half + 1)) for i in range(n)]


def length(p):
    return sum(math.dist(p[i], p[(i + 1) % len(p)]) for i in range(len(p)))


def curvature(p, w):
    n = len(p)
    h = [math.atan2(p[(i + 1) % n][1] - p[i][1], p[(i + 1) % n][0] - p[i][0]) for i in range(n)]
    return [abs((h[(i + w) % n] - h[(i - w) % n] + math.pi) % (2 * math.pi) - math.pi) for i in range(n)]


def crosses(a, b, c, d):
    def o(p, q, r): return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return o(a, b, c) * o(a, b, d) < 0 and o(c, d, a) * o(c, d, b) < 0


def inside(pt, poly):
    x, y, c = pt[0], pt[1], False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i], poly[i - 1]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0: c = not c
    return c


def gaps(p):
    """True self-crossings, and the closest approach between parts of the lap that don't cross."""
    n, cross = len(p), []
    q = p[::3]
    m = len(q)
    for i in range(m):
        for j in range(i + 20, m - (20 if i < 20 else 0)):
            if j >= m: break
            if crosses(q[i], q[(i + 1) % m], q[j], q[(j + 1) % m]): cross.append((i * 3, j * 3))
    near = 1e9
    for i in range(0, n, 2):
        for j in range(i + 60, n, 2):
            if (n - j) + i < 60: continue
            if any(abs(i - a) < 50 or abs(j - b) < 50 for a, b in cross): continue
            near = min(near, math.dist(p[i], p[j]))
    return cross, near


MIN_GAP = 2 * HW + 4.5   # parts of the lap that are not the same corner stay at least this far apart


def relax(p, iters=1500):
    """Nudge apart parts of the lap that pass closer than MIN_GAP (like Monaco's harbour section beside the start
    straight) as a relaxation: close non-neighbouring points repel, every point is pulled back toward the real
    outline, and a light smoothing keeps the road flowing. The start straight is pinned so the pit lane fits."""
    n, orig = len(p), [tuple(x) for x in p]
    pin = [0.6 if min(i, n - i) < 70 else 0.04 for i in range(n)]
    cell = MIN_GAP
    for _ in range(iters):
        grid = {}
        for i, (x, y) in enumerate(p):
            grid.setdefault((int(x // cell), int(y // cell)), []).append(i)
        out, worst = [], 0.0
        for i, (x, y) in enumerate(p):
            fx = fy = 0.0
            cx, cy = int(x // cell), int(y // cell)
            for gx in (cx - 1, cx, cx + 1):
                for gy in (cy - 1, cy, cy + 1):
                    for j in grid.get((gx, gy), ()):
                        g = min(abs(i - j), n - abs(i - j))
                        if g < 2.5 * MIN_GAP: continue            # the same stretch of road
                        dx, dy = x - p[j][0], y - p[j][1]
                        d = math.hypot(dx, dy)
                        if d >= MIN_GAP or d == 0: continue
                        worst = max(worst, MIN_GAP - d)
                        f = (MIN_GAP - d) * 0.25 / d
                        fx += dx * f; fy += dy * f
            a, b = p[i - 1], p[(i + 1) % n]
            fx += ((a[0] + b[0]) / 2 - x) * 0.2 + (orig[i][0] - x) * pin[i]
            fy += ((a[1] + b[1]) / 2 - y) * 0.2 + (orig[i][1] - y) * pin[i]
            out.append((x + fx, y + fy))
        p = out
        if worst < 0.05: break
    return p


def build(name, coords, target):
    # If nudging can't clear every close pass without crossing, give the track a little more room.
    for _ in range(8):
        t = build_at(name, coords, target)
        if not t['crosses'] and t['near'] >= 2 * HW + 1.5: return t   # clear of the other road with a margin
        target *= 1.1
    return t


def build_at(name, coords, target):
    p = lonlat_to_m(coords)
    p = smooth(resample(p, 5.0), 4)                     # 5 m steps, smoothed over ~45 m
    real = length(p)
    s = target / real                                   # world units per metre
    p = [(x * s, y * s) for x, y in p]
    p = resample(p, 1.0)                                # 1 world unit steps
    p = resample(relax(resample(p, 2.0)), 1.0)          # relax on a 2-unit spacing, then back to 1
    n = len(p)
    # Start: the outline's first point, unless it isn't on a straight; then the middle of the nearest straight run.
    k = curvature(p, 6)
    straight = [x < 0.05 for x in k]
    start = 0
    if not all(straight[(i) % n] for i in range(-30, 31)):
        best, bi = 0, 0
        for off in range(n):
            run = 0
            while run < n and straight[(off + run) % n]: run += 1
            if run > best: best, bi = run, off
        start = (bi + best // 2) % n
    p = p[start:] + p[:start]
    # Rotate so the start heads +x.
    a = math.atan2(p[8][1] - p[0][1], p[8][0] - p[0][0])
    ca, sa = math.cos(-a), math.sin(-a)
    p = [(x * ca - y * sa, x * sa + y * ca) for x, y in p]
    # Centre the bounding box on the origin.
    xs, ys = [x for x, _ in p], [y for _, y in p]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    p = [(x - cx, y - cy) for x, y in p]
    area = sum(p[i][0] * p[(i + 1) % n][1] - p[(i + 1) % n][0] * p[i][1] for i in range(n)) / 2
    pit_side = -1 if area > 0 else 1                    # ccw: infield on +z at the start, so the pits go on -z
    # Control points.
    step = int(CTRL_STEP)
    ctrl_idx = list(range(0, n, step))
    ctrl = [p[i] for i in ctrl_idx]
    cross, near = gaps(p)
    # Landmark: the grid point furthest from the road, inside the bounding box.
    best, lm = 0, (0, 0)
    for gx in range(int(min(xs) - cx), int(max(xs) - cx), 3):
        for gy in range(int(min(ys) - cy), int(max(ys) - cy), 3):
            if not inside((gx, gy), p[::3]): continue
            d = min(math.dist((gx, gy), q) for q in p[::3])
            if d > best: best, lm = d, (gx, gy)
    # City dressing, placed from the shape: a canal band across the circuit where little road crowds it,
    # and a freeway line (the game keeps only its direction and runs it beside the circuit, as scenery).
    ys = [y for _, y in p]
    lo, hi = min(ys), max(ys)
    canal = None
    best = 1e9
    for f in range(25, 76, 5):
        c = lo + (hi - lo) * f / 100
        crowd = sum(1 for _, y in p if abs(y - c) < 5)
        if 0 < crowd < best: best, canal = crowd, [round(c - 3, 1), round(c + 3, 1)]
    freeway, bestd = None, 1e9
    for ang in (12, 25, 38, -15, -28, -40, 0):
        dx, dy = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        for off in (-20, 0, 20):
            ox, oy = -dy * off, dx * off
            tun = sum(1 for x, y in p if abs((x - ox) * dy - (y - oy) * dx) < 4.5) / n
            if abs(tun - 0.06) < bestd: bestd, freeway = abs(tun - 0.06), [[round(ox - dx * 260), round(oy - dy * 260)], [round(ox + dx * 260), round(oy + dy * 260)]]
    return {
        'canal_band': canal, 'freeway_line': freeway,
        'ctrl': [[round(x / TRACK_SCALE, 1), round(y / TRACK_SCALE, 1)] for x, y in ctrl],
        'mPerUnit': round(real / length(p), 2), 'pitSide': pit_side,
        'landmark_at': [round(lm[0] / TRACK_SCALE, 1), round(lm[1] / TRACK_SCALE, 1)], 'landmark_clear': round(best, 1),
        'crosses': bool(cross), 'real_m': round(real), 'near': round(near, 1), 'length': round(length(p)), 'span': [round((max(xs) - min(xs))), round((max(ys) - min(ys)))],
    }


if __name__ == '__main__':
    geo = {f['properties']['Name']: f['geometry']['coordinates'] for f in json.load(open(sys.argv[1]))['features']}
    out = []
    for tid, src, target, name, tags, tiers, dress in PLAN:
        t = build(name, geo[src], target)
        out.append({'id': tid, 'name': name, 'source': src, 'tags': tags, 'tiers': tiers, **dress, **t})
        print(f"{tid:10s} {src[:30]:30s} real {t['real_m']}m  len {t['length']}  near {t['near']}  x{t['mPerUnit']} m/unit  ctrl {len(t['ctrl'])}  pits {t['pitSide']:+d}  "
              f"span {t['span']}  landmark clear {t['landmark_clear']}", file=sys.stderr)
    json.dump(out, sys.stdout)
