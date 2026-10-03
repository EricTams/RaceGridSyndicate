"""Monte Carlo simulation of the team economy across several seasons.

Money only moves in big tickets (per the design rules):
  in:  sponsor per-race payments, sponsor placement bonuses (paid per car), season prize money
  out: driver contracts, staff contracts (paid once per season), part development and rebuilds, HQ upgrades

Contracts can never be broken. Driver and sponsor deals run 1-3 seasons with terms fixed at signing.

Each off-season every team:
  1. fills open sponsor slots, picking one of 3 offers per slot
  2. fills open driver seats from the driver market (better business managers shop first and
     can read a driver's trajectory), then signs a staff crew for the season
  3. spends what's left (above a reserve) on HQ upgrades and new parts
During the season every part (engine, chassis, aero, weapons) wears each race, costing speed and
reliability. After each race a manager chooses per part: leave it, pay for a rebuild (fresh condition,
same level), or develop a new part (pricier, takes a few races, arrives better and fresh).
Business events also land between races: 2 options with known outcomes; the manager picks one.
After the season drivers age and parts lose ground as the field catches up.

Every AI team is run by one AI manager (the rival counterpart of the player, not a paid hire),
rated rookie/pro/elite on business (off-track calls) and tactics (on-track edge).
All amounts are in millions of QT (quint-tokens).

Usage: python3 sim/season_econ_sim.py [--runs N] [--seed S] [--curve X] [--catch-up X]
"""

import argparse
import math
import random
import statistics
from dataclasses import dataclass, field

TEAMS, CARS_PER_TEAM = 10, 2
RACES, SEASONS = 16, 6
POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
RACE_NOISE, DNF_RATE = 8.0, 0.06

# Livery slots and their share of a sponsor's value.
SLOTS = [("Main", 1.0), ("Side", 0.5), ("Side", 0.5), ("Minor", 0.25), ("Minor", 0.25), ("Minor", 0.25)]

SPONSOR_CURVE = 1.018                 # how much faster sponsor money grows with reputation
CATCH_UP = 0.07                       # development discount per place below champion (F1-style sliding scale)
HQ_COSTS = [2, 4, 8, 16, 32]          # levels 1-5; each level cuts development cost by 8%
DRIVER_SHARE, STAFF_SHARE = 0.37, 0.08  # share of projected income a team plans to spend on each


def prize(pos):                       # end-of-season prize money by constructors' position (1-based)
    return 22 - 2 * pos


def sponsor_value(rep):               # per-race value of a full-weight slot at a given reputation
    return 0.15 * SPONSOR_CURVE ** rep


def driver_cost(skill):               # season salary asked at signing; always the biggest contract
    return 0.5 * 1.075 ** (skill - 40)


def staff_cost(skill):                # season contract for the whole crew (they bring a team)
    return 0.2 * 1.06 ** (skill - 40)


def skill_for(budget, cost_fn):       # best skill a budget can sign (staff market is continuous)
    lo, hi = 20.0, 99.0
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if cost_fn(mid) <= budget else (lo, mid)
    return lo


PARTS = ["engine", "chassis", "aero", "weapons"]
WEAR_PER_RACE = (4.0, 7.0)            # condition lost per race
DEV_STEP, DEV_RACES = 6, 3            # a new part is DEV_STEP levels better and takes DEV_RACES races to build


REBUILD_SHARE = 0.6                   # a rebuild re-machines/recasts the whole part: 60% of a new one


def rebuild_cost(level):              # back to 100% condition, same level
    base_new_part = sum(0.05 * 1.07 ** (level + k - 40) / len(PARTS) for k in range(DEV_STEP))
    return REBUILD_SHARE * base_new_part


def condition_factor(cond):           # a worn part gives up to 15% of its performance
    return 0.85 + 0.15 * cond / 100


def dnf_rate(parts):                  # worn parts break
    return DNF_RATE + 0.002 * (100 - statistics.mean(p.cond for p in parts))


@dataclass
class Part:
    level: float
    cond: float = 100.0
    dev_eta: int = -1                 # races until a new part arrives (-1 = nothing in development)


def dev_cost_per_point(equip, hq, last_pos=5):
    """Development gets steeply pricier the better the car already is. With CATCH_UP, last season's
    lower-placed teams develop cheaper and the champion pays more (like F1's wind-tunnel sliding scale)."""
    scale = 1 - CATCH_UP * (last_pos - 5.5)
    return 0.05 * 1.07 ** (equip - 40) * 0.92 ** hq * scale / len(PARTS)   # per level of one part


def equip_decay(equip):               # the field catches up; the best cars have the most to lose
    return 4 + 0.08 * max(0, equip - 40)


# ---------------------------------------------------------------- drivers

def expected_growth(age):
    """Average skill change over the next season at a given age."""
    if age < 24:
        return 3.0
    if age < 30:
        return 0.5
    if age < 34:
        return -1.5
    return -4.0


@dataclass
class Driver:
    skill: float
    age: int
    talent: float                     # hidden per-driver offset to growth (a late bloomer vs a flop)
    salary: float = 0.0
    years_left: int = 0

    def true_trend(self):
        return expected_growth(self.age) + self.talent

    def age_one_season(self, rng):
        self.skill = min(99.0, max(20.0, self.skill + self.true_trend() + rng.gauss(0, 1.5)))
        self.age += 1


def new_driver(rng, skill, age=None):
    return Driver(skill=skill, age=age if age is not None else rng.randint(19, 35), talent=rng.gauss(0, 1.5))


# ---------------------------------------------------------------- AI managers and the player

# Each AI team is run by one AI manager with two ratings, each rookie / pro / elite:
#   business - off track: sponsor picks and lengths, driver market timing and judgement, HQ timing
#   tactics  - on track: Night Tune grades and race calls, shown as a rating edge
TIERS = ["rookie", "pro", "elite"]
# rebuild_at: condition at which a part gets rebuilt. Elite also skips a rebuild when a new part is
# about to arrive and prefers a new part over a rebuild when the part is behind the rest of the car.
BUSINESS = {
    "rookie": dict(market_order=2, reserve=0.5, hq_mult=6, rebuild_at=30),
    "pro":    dict(market_order=1, reserve=2.0, hq_mult=3, rebuild_at=50),
    "elite":  dict(market_order=0, reserve=2.0, hq_mult=2, rebuild_at=60),
}
TACTICS_EDGE = {"rookie": -3.0, "pro": 0.0, "elite": 3.0}
MANAGER_EVENT_CHANCE = 0.08           # managers only change through events (poached, retire, scandal)

# The player's team is described by a policy string: business rating + tactics edge.
PLAYER_POLICIES = {
    "pro":          ("pro", 0.0),
    "biz_rookie":   ("rookie", 0.0),
    "biz_elite":    ("elite", 0.0),
    "tac_elite":    ("pro", 3.0),
    "both_elite":   ("elite", 3.0),
    "expert":       ("elite", 6.0),
}


@dataclass
class Team:
    idx: int
    parts: dict                      # name -> Part
    rep: float
    cash: float
    hq: int = 0
    drivers: list = field(default_factory=list)   # contracted Drivers (up to 2)
    staff: float = 50.0
    deals: list = field(default_factory=lambda: [None] * len(SLOTS))
    last_pos: int = 5
    bankrupt: bool = False
    business: str = "pro"
    tactics_edge: float = 0.0
    is_player: bool = False

    event_edge: float = 0.0          # temporary on-track effect from an event, for the next race
    prize_mult: float = 1.0          # season prize money multiplier (events can sell it off)

    def equip(self):                 # effective car level: part levels scaled by their condition
        return statistics.mean(p.level * condition_factor(p.cond) for p in self.parts.values())

    def avg_level(self):
        return statistics.mean(p.level for p in self.parts.values())

    def ratings(self):
        seats = sorted((d.skill for d in self.drivers), reverse=True) + [40.0] * CARS_PER_TEAM
        base = 0.55 * self.equip() + 0.10 * self.staff + self.tactics_edge + self.event_edge
        return [base + 0.35 * s for s in seats[:CARS_PER_TEAM]]


# ---------------------------------------------------------------- sponsors

def rep_expected_pos(rep):            # where sponsors *think* a team finishes, from reputation alone
    return 1 + (100 - rep) / 100 * (TEAMS * CARS_PER_TEAM - 1)


def sponsor_hit_belief(target, rep):  # sponsor's estimate of P(one car finishes <= target)
    return 1 / (1 + math.exp(-(target - rep_expected_pos(rep)) / 3))


def make_offers(team, weight, rng):
    """Three offers for one slot: safe (mostly guaranteed), balanced, bonus-heavy, each 1-3 seasons.
    Priced from reputation, so a team outperforming its reputation finds bonus deals cheap to hit."""
    star = max((d.skill for d in team.drivers), default=50)
    fame = 1 + max(0.0, star - 60) / 100                    # a star driver raises every offer
    v = sponsor_value(team.rep) * weight * fame
    exp_pos = rep_expected_pos(team.rep)
    offers = []
    for kind, pay_share, shift, premium in (("safe", 0.8, 4, 1.0), ("balanced", 0.5, 0, 1.05), ("bonus", 0.2, -4, 1.15)):
        target = int(min(19, max(1, round(exp_pos + shift))))
        per_race = v * pay_share
        bonus = (v * premium - per_race) / (CARS_PER_TEAM * sponsor_hit_belief(target, team.rep))
        offers.append(dict(kind=kind, per_race=per_race, target=target, bonus=bonus, years_left=rng.randint(1, 3)))
    return offers


def median_pos(cdf_row):
    return next(p for p in range(1, len(cdf_row)) if cdf_row[p] >= 0.5)


def choose_offer(team, offers, cdf_row, rng):
    ev = lambda o: o["per_race"] + o["bonus"] * CARS_PER_TEAM * cdf_row[o["target"]]
    if team.business == "rookie":
        return rng.choice(offers)
    if team.business == "pro":
        return max(offers, key=ev)                # best deal this season, ignores length
    # Elite also reads the trend: a team beating its reputation will see its rep (and offers) rise,
    # so lock bonus targets in long and keep guaranteed-pay deals short. Falling teams do the opposite.
    trend = rep_expected_pos(team.rep) - median_pos(cdf_row)          # + = outperforming reputation
    def score(o):
        direction = -1 if o["kind"] == "safe" else 1
        return ev(o) * (1 + 0.04 * trend * direction * (o["years_left"] - 1))
    return max(offers, key=score)


# ---------------------------------------------------------------- races

def race(teams, rng):
    """Returns list of (team_idx, position) for every car that finished (DNFs omitted)."""
    scores = []
    for t in teams:
        dnf = dnf_rate(t.parts.values())
        for r in t.ratings():
            if rng.random() > dnf:
                scores.append((r + rng.gauss(0, RACE_NOISE), t.idx))
    scores.sort(reverse=True)
    return [(t_idx, pos + 1) for pos, (_, t_idx) in enumerate(scores)]


def position_dists(teams, rng, samples=200):
    """Per-team P(car finishes <= p) table, estimated by simulating races with current ratings."""
    counts = {t.idx: [0] * (TEAMS * CARS_PER_TEAM + 1) for t in teams}
    for _ in range(samples):
        for t_idx, pos in race(teams, rng):
            counts[t_idx][pos] += 1
    cdf = {}
    for idx, c in counts.items():
        acc, row = 0, [0.0]
        for p in range(1, len(c)):
            acc += c[p]
            row.append(acc / (samples * CARS_PER_TEAM))
        cdf[idx] = row
    return cdf


# ---------------------------------------------------------------- the driver market

def judged_value(team, d, years, rng):
    """How good a manager thinks a driver will be, averaged over a contract of `years` seasons."""
    if team.business == "rookie":
        return d.skill                                          # current form only; ignores age
    trend = d.true_trend() if team.business == "elite" else expected_growth(d.age) + rng.gauss(0, 1.5)
    return d.skill + trend * (years - 1) / 2


def run_market(teams, pool, budgets, rng):
    """Seats are filled one per team per round. Better business managers get to the market first."""
    order = sorted((t for t in teams if not t.bankrupt),
                   key=lambda t: (BUSINESS[t.business]["market_order"], rng.random()))
    while True:
        signed_any = False
        for t in order:
            if len(t.drivers) >= CARS_PER_TEAM or not pool:
                continue
            committed = sum(d.salary for d in t.drivers)
            open_seats = CARS_PER_TEAM - len(t.drivers)
            # lead seat gets the bigger share when both are open
            cap = (budgets[t.idx] - committed) * (0.65 if open_seats == 2 else 1.0)
            best = None
            for d in pool:
                ask = driver_cost(d.skill)
                if ask > cap:
                    continue
                for years in (1, 2, 3):
                    if t.business == "rookie" and years != 2:
                        continue                                # rookies sign whatever the default is
                    v = judged_value(t, d, years, rng) - 4 * ask / max(cap, 0.1)
                    if best is None or v > best[0]:
                        best = (v, d, years)
            if best is None:                                    # can't afford anyone: take the cheapest
                d = min(pool, key=lambda d: driver_cost(d.skill))
                best = (0, d, 1)
            _, d, years = best
            pool.remove(d)
            d.salary, d.years_left = driver_cost(d.skill), years
            t.drivers.append(d)
            signed_any = True
        if not signed_any:
            return


# ---------------------------------------------------------------- parts: rebuild or develop new

def dev_cost(team, part):
    return sum(dev_cost_per_point(part.level + k, team.hq, team.last_pos) for k in range(DEV_STEP))


def start_development(team, part):
    team.cash -= dev_cost(team, part)
    part.dev_eta = DEV_RACES


def part_decisions(team, rng, races_left):
    """After each race: for each part, leave it, rebuild it, or develop a new one."""
    cfg = BUSINESS[team.business]
    avg = team.avg_level()
    for name in PARTS:
        p = team.parts[name]
        spare = team.cash - cfg["reserve"]
        if team.business == "rookie":
            # develops whenever there's cash, even late in the season; rebuilds only when nearly broken,
            # even if a new part is about to arrive (wasted money)
            if p.dev_eta < 0 and spare > dev_cost(team, p) and rng.random() < 0.3:
                start_development(team, p)
            elif p.cond < cfg["rebuild_at"] and spare > rebuild_cost(p.level):
                team.cash -= rebuild_cost(p.level)
                p.cond = 100.0
            continue
        worn = p.cond < cfg["rebuild_at"]
        arriving_soon = 0 <= p.dev_eta <= (3 if team.business == "elite" else 1)
        if team.business == "elite":
            # a lagging part is worth replacing; a new part also arrives fresh, so it replaces a rebuild
            behind = p.level < avg - 2
            if p.dev_eta < 0 and races_left > DEV_RACES + 2 and (behind or worn) and \
                    spare - 2 * rebuild_cost(p.level) > dev_cost(team, p):
                start_development(team, p)
                continue
        if worn and not arriving_soon and spare > rebuild_cost(p.level):
            team.cash -= rebuild_cost(p.level)
            p.cond = 100.0


def tick_parts(team, rng):
    for p in team.parts.values():
        p.cond = max(0.0, p.cond - rng.uniform(*WEAR_PER_RACE))
        if p.dev_eta > 0:
            p.dev_eta -= 1
            if p.dev_eta == 0:
                p.level += DEV_STEP
                p.cond, p.dev_eta = 100.0, -1


# ---------------------------------------------------------------- business events
# Each event offers two options with known outcomes (no dice on the result).
# Effects: cash (M QT), rep, edge (rating next race), cond (all parts), level (+ to weakest part),
# staff (crew skill), prize (season prize multiplier).
EVENTS = [
    ("Sponsor wants a publicity stunt the night before a race",
     [dict(cash=2.0, edge=-2.0), dict()]),
    ("Black-market fixer offers a hot part",
     [dict(cash=-1.5, level=4, rep=-4), dict()]),
    ("Garage fire",
     [dict(cash=-1.2), dict(cond=-25)]),
    ("Investor offers cash for a cut of this season's prize money",
     [dict(cash=5.0, prize=-0.3), dict()]),
    ("A rival tries to poach your crew chief",
     [dict(cash=-1.0), dict(staff=-8)]),
    ("Wind tunnel time for sale",
     [dict(cash=-1.0, level=2), dict()]),
    ("Street race exhibition: show up for a payday",
     [dict(cash=1.5, cond=-10), dict()]),
]
RATING_VALUE = 2.5                    # rough M QT value of +1 rating for a full season (used by elite)


def option_value(team, o, races_left):
    """How an elite manager prices an option: cash plus the season value of its performance effects."""
    frac = races_left / RACES
    perf = (o.get("edge", 0) / RACES
            + 0.55 * o.get("level", 0) / len(PARTS) * frac
            + 0.55 * 0.15 * o.get("cond", 0) / 100 * frac * 2   # worn parts also break more often
            + 0.10 * o.get("staff", 0) * frac)
    prize_loss = -o.get("prize", 0) * prize(max(1, team.last_pos)) if o.get("prize") else 0
    return o.get("cash", 0) + perf * RATING_VALUE - prize_loss + o.get("rep", 0) * 0.3


def resolve_event(team, rng, races_left):
    _, options = rng.choice(EVENTS)
    affordable = [o for o in options if team.cash + o.get("cash", 0) >= 0] or \
        [max(options, key=lambda o: o.get("cash", 0))]              # broke: take whatever costs least
    if team.business == "rookie":
        o = rng.choice(affordable)
    elif team.business == "pro":
        o = max(affordable, key=lambda o: o.get("cash", 0))       # takes the money, misses the costs
    else:
        o = max(affordable, key=lambda o: option_value(team, o, races_left))
    team.cash += o.get("cash", 0)
    team.rep = max(0.0, team.rep + o.get("rep", 0))
    team.event_edge = o.get("edge", 0)
    team.staff += o.get("staff", 0)
    team.prize_mult += o.get("prize", 0)
    for p in team.parts.values():
        p.cond = max(0.0, p.cond + o.get("cond", 0))
    if o.get("level"):
        min(team.parts.values(), key=lambda p: p.level).level += o["level"]


EVENT_CHANCE = 0.15                   # per team per race


# ---------------------------------------------------------------- the season

def season(teams, pool, rng, stats):
    alive = [t for t in teams if not t.bankrupt]
    cdf = position_dists(alive, rng)

    # 1. sponsors: only open slots get new offers; signed deals keep their terms
    for t in alive:
        for i, (_, w) in enumerate(SLOTS):
            if t.deals[i] is None:
                t.deals[i] = choose_offer(t, make_offers(t, w, rng), cdf[t.idx], rng)

    # 2. drivers and staff, budgeted from projected income
    budgets = {}
    for t in alive:
        proj = sum(RACES * (d["per_race"] + d["bonus"] * CARS_PER_TEAM * cdf[t.idx][d["target"]]) for d in t.deals)
        budgets[t.idx] = (t.cash * 0.3 + proj) * DRIVER_SHARE
        t.staff = skill_for((t.cash * 0.3 + proj) * STAFF_SHARE, staff_cost)
    run_market(alive, pool, budgets, rng)
    for t in alive:
        t.cash -= sum(d.salary for d in t.drivers) + staff_cost(t.staff)

    # 3. HQ and pre-season development. Pros and elites keep money back for in-season rebuilds;
    #    rookies spend it all now. Pre-season parts are ready for race 1.
    for t in alive:
        cfg = BUSINESS[t.business]
        t.prize_mult, t.event_edge = 1.0, 0.0
        if t.hq < len(HQ_COSTS) and t.cash - cfg["reserve"] > cfg["hq_mult"] * HQ_COSTS[t.hq]:
            t.cash -= HQ_COSTS[t.hq]
            t.hq += 1
        rebuild_fund = 0 if t.business == "rookie" else sum(rebuild_cost(p.level) for p in t.parts.values()) * 2
        while True:
            p = min(t.parts.values(), key=lambda p: p.level)
            if t.cash - cfg["reserve"] - rebuild_fund < dev_cost(t, p) or p.level > 110:
                break
            t.cash -= dev_cost(t, p)
            p.level += DEV_STEP
            p.cond = 100.0

    # 4. race the season
    points = {t.idx: 0 for t in alive}
    income = {t.idx: 0.0 for t in alive}
    for r in range(RACES):
        for t in alive:
            income[t.idx] += sum(d["per_race"] for d in t.deals)
            t.cash += sum(d["per_race"] for d in t.deals)
        for t_idx, pos in race(alive, rng):
            if pos <= len(POINTS):
                points[t_idx] += POINTS[pos - 1]
            for d in teams[t_idx].deals:
                if pos <= d["target"]:
                    income[t_idx] += d["bonus"]      # paid per car that hits the target
                    teams[t_idx].cash += d["bonus"]
        races_left = RACES - r - 1
        for t in alive:
            t.event_edge = 0.0
            tick_parts(t, rng)
            if rng.random() < EVENT_CHANCE:
                resolve_event(t, rng, races_left)
            part_decisions(t, rng, races_left)
    standings = sorted(alive, key=lambda t: -points[t.idx])

    # 5. off-season: money, reputation, contracts run down, drivers age, the field catches up
    for pos, t in enumerate(standings, 1):
        income[t.idx] += prize(pos) * t.prize_mult
        t.cash += prize(pos) * t.prize_mult          # race income was banked as it came in
        t.rep = 0.6 * t.rep + 0.4 * (100 - (pos - 1) * 10)
        t.last_pos = pos
        for p in t.parts.values():
            p.level = max(20, p.level - equip_decay(p.level))
        stats.append(dict(team=t.idx, pos=pos, income=income[t.idx], cash=t.cash, equip=t.equip(), hq=t.hq,
                          drivers=[(round(d.skill), d.age, d.years_left) for d in t.drivers], staff=t.staff))
        for i, d in enumerate(t.deals):
            d["years_left"] -= 1
            if d["years_left"] <= 0:
                t.deals[i] = None
        for d in t.drivers:
            d.years_left -= 1
        pool.extend(d for d in t.drivers if d.years_left <= 0)
        t.drivers = [d for d in t.drivers if d.years_left > 0]
        if t.cash < 0:
            t.bankrupt = True
        if not t.is_player and rng.random() < MANAGER_EVENT_CHANCE:
            t.business, t.tactics_edge = rng.choice(TIERS), TACTICS_EDGE[rng.choice(TIERS)]
    for d in [d for t in teams for d in t.drivers] + pool:
        d.age_one_season(rng)
    pool[:] = [d for d in pool if d.age < 38]                                   # retirements
    pool.extend(new_driver(rng, rng.uniform(40, 68), rng.randint(18, 21)) for _ in range(6))  # rookies arrive
    return standings


def new_league(test_idx, policy, rng):
    """Team 0 starts strongest, team 9 weakest. Every AI team gets a random AI manager."""
    teams = []
    for i in range(TEAMS):
        strength = 1 - i / (TEAMS - 1)                  # 1.0 .. 0.0
        t = Team(idx=i, parts={n: Part(level=45 + 35 * strength) for n in PARTS}, rep=20 + 70 * strength,
                 cash=3 + 17 * strength, last_pos=i + 1)
        for base in (60 + 22 * strength, 52 + 20 * strength):
            d = new_driver(rng, base + rng.gauss(0, 3))
            d.salary, d.years_left = driver_cost(d.skill), rng.randint(1, 3)
            t.drivers.append(d)
        if i == test_idx:
            t.business, t.tactics_edge = PLAYER_POLICIES[policy]
            t.is_player = True
        else:
            t.business, t.tactics_edge = rng.choice(TIERS), TACTICS_EDGE[rng.choice(TIERS)]
        teams.append(t)
    pool = [new_driver(rng, rng.uniform(40, 80)) for _ in range(14)]           # free agents
    return teams, pool


# ---------------------------------------------------------------- reports

def run(test_idx, policy, runs, seed):
    by_season = [[] for _ in range(SEASONS)]
    incomes = [[] for _ in range(SEASONS)]
    broke = 0
    for r in range(runs):
        rng = random.Random(seed * 1000 + r)
        teams, pool = new_league(test_idx, policy, rng)
        for s in range(SEASONS):
            stats = []
            season(teams, pool, rng, stats)
            me = next((x for x in stats if x["team"] == test_idx), None)
            if me:
                by_season[s].append(me["pos"])
                incomes[s].append(me["income"])
        broke += teams[test_idx].bankrupt
    return by_season, incomes, broke


def main():
    global SPONSOR_CURVE, CATCH_UP
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=100)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--curve", type=float, default=SPONSOR_CURVE, help="sponsor money growth per reputation point")
    ap.add_argument("--catch-up", type=float, default=CATCH_UP, help="dev discount per place, e.g. 0.07")
    args = ap.parse_args()
    SPONSOR_CURVE, CATCH_UP = args.curve, args.catch_up
    print(f"sponsor curve {SPONSOR_CURVE}, catch-up {CATCH_UP}")

    print("\nYour team from last place: average championship position by season (1 = champion, 10 = last)\n")
    cases = [
        ("pro", "Pro business, pro tactics"),
        ("biz_rookie", "Rookie business, pro tactics"),
        ("biz_elite", "Elite business, pro tactics"),
        ("tac_elite", "Pro business, elite tactics"),
        ("both_elite", "Elite business, elite tactics"),
        ("expert", "Elite business, expert tactics"),
    ]
    header = f"{'Player plays with':<32}" + "".join(f"  S{s+1:<4}" for s in range(SEASONS)) + "   income S1 -> S6   broke"
    print(header)
    print("-" * len(header))
    for policy, label in cases:
        pos, inc, broke = run(9, policy, args.runs, args.seed)
        cols = "".join(f"  {statistics.mean(p):5.1f}" if p else "    - " for p in pos)
        print(f"{label:<32}{cols}   {statistics.mean(inc[0]):6.1f} -> {statistics.mean(inc[-1]):5.1f}   "
              f"{100 * broke / args.runs:4.0f}%")

    # How the two AI manager ratings shape the league.
    combos = [(b, c) for b in TIERS for c in TIERS]
    moves, churn, champs = {k: [] for k in combos}, [], []
    for r in range(args.runs):
        rng = random.Random(args.seed * 7000 + r)
        teams, pool = new_league(9, "pro", rng)
        edge_tier = {v: k for k, v in TACTICS_EDGE.items()}
        start = {t.idx: (t.business, edge_tier[t.tactics_edge]) for t in teams if not t.is_player}
        prev, winners = {t.idx: t.idx + 1 for t in teams}, set()
        for s in range(SEASONS):
            stats = []
            standings = season(teams, pool, rng, stats)
            winners.add(standings[0].idx)
            churn.append(statistics.mean(abs(x["pos"] - prev[x["team"]]) for x in stats))
            prev = {x["team"]: x["pos"] for x in stats}
        for idx, combo in start.items():
            moves[combo].append((idx + 1) - prev[idx])       # positive = climbed
        champs.append(len(winners))
    print("\nAI teams: places gained over 6 seasons by their manager's ratings (+ = climbed)")
    print(f"{'business':<10}" + "".join(f"{c:>10}" for c in TIERS) + "   <- tactics")
    for b in TIERS:
        print(f"{b:<10}" + "".join(f"{statistics.mean(moves[(b, c)]):+10.1f}" for c in TIERS))
    print(f"Average places a team moves per season: {statistics.mean(churn):.1f}")
    print(f"Different champions over {SEASONS} seasons: {statistics.mean(champs):.1f}")


if __name__ == "__main__":
    main()
