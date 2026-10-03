"""Monte Carlo simulation of a whole 10-season career across the three tiers.

Builds on sim/season_econ_sim.py (drivers, sponsors, parts, rebuilds, events, AI managers) and adds:
  - 3 tiers x 10 teams: Gutter Circuit (8 races), Sprawl League (10), Corporate Grand Circuit (12),
    2 up / 2 down each season; money and car levels scale with the tier
  - a regulation change every season in every tier (the "equipment change trick")
  - driver morale over the season and raise demands from winning drivers
  - bargain options for teams in trouble: bargain-bin drivers, budget staff, patch-job rebuilds
  - Backer emergency loans when cash runs out (no game over: the career always runs 10 seasons)

The player starts near the bottom of the Gutter Circuit. A career "wins" with at least one Corporate
Grand Circuit title in 10 seasons. All amounts are in millions of QT.

Usage: python3 sim/career_sim.py [--runs N] [--seed S]
"""

import argparse
import random
import statistics
from dataclasses import dataclass, field

import season_econ_sim as E

SEASONS = 10
TIERS = [  # index 0 = bottom tier
    dict(name="Gutter Circuit", races=8, money=0.35, base=45),
    dict(name="Sprawl League", races=10, money=0.75, base=60),
    dict(name="Corporate Grand Circuit", races=12, money=1.4, base=75),
]
TEAMS_PER_TIER, UP_DOWN = 10, 2
LOAN_INTEREST, LOAN_REPAY_SHARE = 0.10, 0.3
PATCH_SHARE, PATCH_COND = 0.25, 55.0          # patch job: 25% of a rebuild, back to 55% condition only
BARGAIN_DRIVERS = 8                           # cheap, poor drivers always on the market

PLAYER_PROFILES = {                           # business rating, tactics edge
    "rookie":  ("rookie", -3.0),
    "average": ("pro", 0.0),
    "skilled": ("elite", 3.0),
    "expert":  ("elite", 6.0),
}


@dataclass
class Team:
    idx: int
    tier: int
    parts: dict
    rep: float
    cash: float
    business: str = "pro"
    tactics_edge: float = 0.0
    is_player: bool = False
    drivers: list = field(default_factory=list)
    staff: float = 50.0
    deals: list = field(default_factory=lambda: [None] * len(E.SLOTS))
    hq: int = 0
    last_pos: int = 5
    debt: float = 0.0
    prize_mult: float = 1.0
    event_edge: float = 0.0
    bankrupt: bool = False                    # never set; the market helper expects it

    def equip(self):
        return statistics.mean(p.level * E.condition_factor(p.cond) for p in self.parts.values())

    def avg_level(self):
        return statistics.mean(p.level for p in self.parts.values())

    def ratings(self):
        seats = sorted(self.drivers, key=lambda d: -d.skill)
        base = 0.55 * self.equip() + 0.10 * self.staff + self.tactics_edge + self.event_edge
        out = [base + 0.35 * d.skill + 0.05 * (getattr(d, "morale", 60) - 60) for d in seats[:2]]
        return out + [base + 0.35 * 40] * (2 - len(out))


def fresh_driver(rng, skill, age=None):
    d = E.new_driver(rng, skill, age)
    d.morale, d.wins, d.podiums = 60.0, 0, 0
    return d


def bargain_driver(rng):
    return fresh_driver(rng, rng.uniform(33, 48), rng.randint(19, 37))


# ---------------------------------------------------------------- season pieces

def contracts(teams, pool, cdf, rng):
    budgets = {}
    for t in teams:
        tier = TIERS[t.tier]
        proj = sum(tier["races"] * (d["per_race"] + d["bonus"] * 2 * cdf[t.idx][d["target"]]) for d in t.deals)
        budget = max(0.0, t.cash * 0.3 + proj)
        split = E.BUSINESS[t.business]
        budgets[t.idx] = budget * E.DRIVER_SHARE
        t.staff = max(25.0, E.skill_for(budget * E.STAFF_SHARE, E.staff_cost))   # budget crew at worst
    E.run_market(teams, pool, budgets, rng)
    for t in teams:
        for d in t.drivers:
            if not hasattr(d, "morale"):
                d.morale, d.wins, d.podiums = 60.0, 0, 0
        t.cash -= sum(d.salary for d in t.drivers) + E.staff_cost(t.staff)


def cover_debt(t):
    """Out of money: the Backer covers it with an emergency loan (no game over)."""
    if t.cash < 0:
        t.debt += -t.cash * (1 + LOAN_INTEREST)
        t.cash = 0.0


def patch_or_rebuild(t, rng, races_left):
    """Normal garage calls, plus a patch job on nearly-dead parts when a real rebuild is unaffordable."""
    E.part_decisions(t, rng, races_left)
    for p in t.parts.values():
        if p.cond < 25 and p.dev_eta < 0:
            cost = E.rebuild_cost(p.level) * PATCH_SHARE
            if t.cash > cost:
                t.cash -= cost
                p.cond = max(p.cond, PATCH_COND)


def morale_after_race(t, results):
    """results: list of positions for t's cars (None = DNF)."""
    expected = 5 + 10 * (1 - (t.rep - 20) / 70)        # rough expected finish from reputation
    for d, pos in zip(sorted(t.drivers, key=lambda d: -d.skill), results):
        if pos is None:
            d.morale -= 7
        elif pos == 1:
            d.morale += 12; d.wins += 1; d.podiums += 1
        elif pos <= 3:
            d.morale += 8; d.podiums += 1
        elif pos <= 10:
            d.morale += 3
        if pos is not None and pos > expected + 4:
            d.morale -= 3
        if min(p.cond for p in t.parts.values()) < 30:
            d.morale -= 1                                # "the car's falling apart"
        d.morale += (60 - d.morale) * 0.08               # drift back toward 60
        d.morale = max(0.0, min(100.0, d.morale))


def raise_demands(t, rng):
    """Winning drivers want more money. Pay = salary +40% for the rest of the deal and morale up;
    refuse = big morale hit; elites promise (small hit) when they can't afford it."""
    for d in t.drivers:
        if d.wins < 2 and d.podiums < 4:
            continue
        extra = d.salary * 0.4 * max(1, d.years_left)
        pay = {"elite": t.cash > 1.5 * extra, "pro": t.cash > extra, "rookie": rng.random() < 0.5}[t.business]
        if pay and t.cash > extra:
            t.cash -= d.salary * 0.4          # this season's share; later seasons show up as higher salary
            d.salary *= 1.4
            d.morale = min(100.0, d.morale + 10)
        elif t.business == "elite":
            d.morale -= 5
        else:
            d.morale -= 20
    for d in t.drivers:
        d.wins = d.podiums = 0


def regulation_change(tier_teams, rng):
    part = rng.choice(E.PARTS)
    levels = sorted(t.parts[part].level for t in tier_teams)
    cap = statistics.median(levels) + 2
    for t in tier_teams:
        p = t.parts[part]
        if p.level > cap:
            p.level = cap + (p.level - cap) * 0.35


def run_tier_season(tier_idx, teams, pool, rng):
    tier = TIERS[tier_idx]
    cdf = E.position_dists(teams, rng, samples=80)
    for t in teams:
        if t.debt > 0:                                   # loan repayments come off the top
            pay = min(t.debt, t.cash * LOAN_REPAY_SHARE)
            t.cash -= pay; t.debt -= pay
        for i, (_, w) in enumerate(E.SLOTS):
            if t.deals[i] is None:
                offer = E.choose_offer(t, E.make_offers(t, w, rng), cdf[t.idx], rng)
                offer["per_race"] *= tier["money"]; offer["bonus"] *= tier["money"]
                t.deals[i] = offer
    return cdf


def develop_preseason(t):
    cfg = E.BUSINESS[t.business]
    t.prize_mult, t.event_edge = 1.0, 0.0
    if t.hq < len(E.HQ_COSTS) and t.cash - cfg["reserve"] > cfg["hq_mult"] * E.HQ_COSTS[t.hq]:
        t.cash -= E.HQ_COSTS[t.hq]; t.hq += 1
    fund = 0 if t.business == "rookie" else sum(E.rebuild_cost(p.level) for p in t.parts.values()) * 2
    while True:
        p = min(t.parts.values(), key=lambda p: p.level)
        if t.cash - cfg["reserve"] - fund < E.dev_cost(t, p) or p.level > 115:
            break
        t.cash -= E.dev_cost(t, p); p.level += E.DEV_STEP; p.cond = 100.0


# ---------------------------------------------------------------- a career

def new_world(profile, rng):
    teams, idx = [], 0
    for tier_idx, tier in enumerate(TIERS):
        for k in range(TEAMS_PER_TIER):
            strength = 1 - k / (TEAMS_PER_TIER - 1)
            lvl = tier["base"] - 5 + 10 * strength
            t = Team(idx=idx, tier=tier_idx, parts={n: E.Part(level=lvl + rng.uniform(-3, 3)) for n in E.PARTS},
                     rep=25 + 60 * strength, cash=(2 + 10 * strength) * tier["money"] * 2, last_pos=k + 1)
            t.business = rng.choice(E.TIERS)
            t.tactics_edge = E.TACTICS_EDGE[rng.choice(E.TIERS)]
            for base in (tier["base"] + 8 + 8 * strength, tier["base"] + 2 + 8 * strength):
                d = fresh_driver(rng, base + rng.gauss(0, 3))
                d.salary, d.years_left = E.driver_cost(d.skill), rng.randint(1, 3)
                t.drivers.append(d)
            teams.append(t)
            idx += 1
    # The player takes over one of the three weakest Gutter Circuit teams.
    me = teams[rng.randint(7, 9)]
    me.is_player = True
    me.business, me.tactics_edge = PLAYER_PROFILES[profile]
    pool = [fresh_driver(rng, rng.uniform(40, 80)) for _ in range(20)]
    return teams, pool, me


def career(profile, rng):
    teams, pool, me = new_world(profile, rng)
    history, champs = [], {0: [], 1: [], 2: []}
    for season in range(SEASONS):
        pool.extend(bargain_driver(rng) for _ in range(max(0, BARGAIN_DRIVERS - sum(d.skill < 50 for d in pool))))
        by_tier = {k: [t for t in teams if t.tier == k] for k in range(3)}
        cdfs = {k: run_tier_season(k, by_tier[k], pool, rng) for k in range(3)}
        merged = {i: row for c in cdfs.values() for i, row in c.items()}
        contracts(teams, pool, merged, rng)
        for t in teams:
            cover_debt(t)
            develop_preseason(t)

        season_points = {t.idx: 0 for t in teams}
        for k in range(3):
            tier = TIERS[k]
            for r in range(tier["races"]):
                res = E.race(by_tier[k], rng)
                finish = {t.idx: [] for t in by_tier[k]}
                for t in by_tier[k]:
                    t.cash += sum(d["per_race"] for d in t.deals)
                for t_idx, pos in res:
                    finish[t_idx].append(pos)
                    if pos <= len(E.POINTS):
                        season_points[t_idx] += E.POINTS[pos - 1]
                    for d in teams[t_idx].deals:
                        if pos <= d["target"]:
                            teams[t_idx].cash += d["bonus"]
                left = tier["races"] - r - 1
                for t in by_tier[k]:
                    pos = sorted(finish[t.idx]) + [None] * (2 - len(finish[t.idx]))
                    morale_after_race(t, pos)
                    t.event_edge = 0.0
                    E.tick_parts(t, rng)
                    if rng.random() < E.EVENT_CHANCE:
                        E.resolve_event(t, rng, left)
                    patch_or_rebuild(t, rng, left)

        # standings, prize money, promotion and relegation
        moves = {}
        for k in range(3):
            order = sorted(by_tier[k], key=lambda t: -season_points[t.idx])
            champs[k].append(order[0].idx)
            for pos, t in enumerate(order, 1):
                t.cash += E.prize(pos) * TIERS[k]["money"] * t.prize_mult
                t.rep = 0.6 * t.rep + 0.4 * (100 - (pos - 1) * 10)
                t.last_pos = pos
                if t.is_player:
                    history.append(dict(tier=k, pos=pos, debt=t.debt, cash=t.cash))
            if k < 2:
                for t in order[:UP_DOWN]:
                    moves[t.idx] = k + 1
            if k > 0:
                for t in order[-UP_DOWN:]:
                    moves[t.idx] = k - 1
        for t in teams:
            if t.idx in moves:
                up = moves[t.idx] > t.tier
                t.tier = moves[t.idx]
                t.rep = max(20.0, t.rep - 25) if up else min(90.0, t.rep + 25)

        # off-season: regulations, the field catching up, raises, contracts, ageing, manager events
        for k in range(3):
            regulation_change([t for t in teams if t.tier == k], rng)
        for t in teams:
            for p in t.parts.values():
                p.level = max(20, p.level - E.equip_decay(p.level))
            raise_demands(t, rng)
            cover_debt(t)
            for i, d in enumerate(t.deals):
                d["years_left"] -= 1
                if d["years_left"] <= 0:
                    t.deals[i] = None
            for d in t.drivers:
                d.years_left -= 1
            pool.extend(d for d in t.drivers if d.years_left <= 0)
            t.drivers = [d for d in t.drivers if d.years_left > 0]
            if not t.is_player and rng.random() < E.MANAGER_EVENT_CHANCE:
                t.business, t.tactics_edge = rng.choice(E.TIERS), E.TACTICS_EDGE[rng.choice(E.TIERS)]
        for d in [d for t in teams for d in t.drivers] + pool:
            d.age_one_season(rng)
        pool[:] = [d for d in pool if d.age < 38]
        pool.extend(fresh_driver(rng, rng.uniform(40, 68), rng.randint(18, 21)) for _ in range(6))
    return history, champs, teams


def grade(history, player_idx_titles):
    titles = sum(1 for h in history if h["tier"] == 2 and h["pos"] == 1)
    top = max(h["tier"] for h in history)
    if titles >= 2:
        return "Legend (2+ Grand Circuit titles)"
    if titles == 1:
        return "Champion (1 Grand Circuit title)"
    if top == 2:
        return "Contender (reached the Grand Circuit)"
    if top == 1:
        return "Climber (reached the Sprawl League)"
    return "Stuck (never left the Gutter)"


GRADES = ["Legend (2+ Grand Circuit titles)", "Champion (1 Grand Circuit title)",
          "Contender (reached the Grand Circuit)", "Climber (reached the Sprawl League)", "Stuck (never left the Gutter)"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=60)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    print(f"{SEASONS}-season careers from the bottom of the Gutter Circuit, {args.runs} careers per player type\n")
    league_titles = []
    for profile in PLAYER_PROFILES:
        outcomes, reach2, reach3, debt_seasons, first_title = [], [], [], [], []
        for r in range(args.runs):
            rng = random.Random(args.seed * 10000 + r)
            history, champs, teams = career(profile, rng)
            outcomes.append(grade(history, None))
            tiers = [h["tier"] for h in history]
            if 1 in tiers or 2 in tiers:
                reach2.append(next(i for i, k in enumerate(tiers) if k >= 1) + 1)
            if 2 in tiers:
                reach3.append(tiers.index(2) + 1)
            titles = [i + 1 for i, h in enumerate(history) if h["tier"] == 2 and h["pos"] == 1]
            if titles:
                first_title.append(titles[0])
            debt_seasons.append(sum(1 for h in history if h["debt"] > 0))
            if profile == "average":
                league_titles.append(champs[2])
        won = sum(o.startswith(("Legend", "Champion")) for o in outcomes)
        print(f"== {profile.upper()} player ({PLAYER_PROFILES[profile][0]} business, tactics {PLAYER_PROFILES[profile][1]:+.0f})")
        for g in GRADES:
            n = outcomes.count(g)
            print(f"   {g:<40}{100 * n / len(outcomes):5.0f}%")
        fmt = lambda xs: f"season {statistics.mean(xs):.1f} ({100 * len(xs) / args.runs:.0f}% of careers)" if xs else "never"
        print(f"   Win rate (a Grand Circuit title):       {100 * won / args.runs:5.0f}%")
        print(f"   Reached the Sprawl League:              {fmt(reach2)}")
        print(f"   Reached the Grand Circuit:              {fmt(reach3)}")
        print(f"   First title:                            {fmt(first_title)}")
        print(f"   Seasons carrying Backer debt:           {statistics.mean(debt_seasons):.1f} of {SEASONS}\n")

    distinct = [len(set(c)) for c in league_titles]
    most = [max(c.count(x) for x in set(c)) for c in league_titles]
    print("Grand Circuit health (careers with an average player):")
    print(f"   Different champions in 10 seasons:      {statistics.mean(distinct):.1f}")
    print(f"   Most titles by a single team:           {statistics.mean(most):.1f}")


if __name__ == "__main__":
    main()
