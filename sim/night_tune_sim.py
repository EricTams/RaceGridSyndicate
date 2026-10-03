"""Monte Carlo simulation of the Night Tune mini-game.

Models a race-night tuning session: five gauges start at 0, each has a hidden
target, and each practice run the player gets driver feedback and then picks
one of the crew chief's adjustment cards. A greedy "reasonable player" AI
makes the picks. We measure how often gauges land in the golden window as a
function of crew chief skill (1-5).

Usage: python3 sim/night_tune_sim.py [--trials N] [--seed S]
"""

import argparse
import random
import statistics
from dataclasses import dataclass

GAUGES = ["Engine", "Handling", "Aero", "Weapons", "Armor"]
N = len(GAUGES)

TARGET_MIN, TARGET_MAX = 25, 90
GOLDEN = 5
GRADES = [("S", 5), ("A", 10), ("B", 18), ("C", 28), ("D", 999)]


@dataclass
class Config:
    runs: int = 6                 # practice runs = cards picked per night
    phases: tuple = ()            # picks per tune phase, e.g. (4, 3, 3); a flying lap
                                  # (driver feedback) happens between phases. Overrides runs.
    move_lo: int = 8              # primary move magnitude range on a normal card
    move_hi: int = 16
    driver_sigma: float = 15.0    # noise on a single driver feedback reading
    negative_card_rate: float = 0.2


def chief_params(skill):
    """How crew chief skill (1-5) shapes the card offers."""
    s = skill - 1  # 0..4
    return dict(
        fourth_card=0.15 * s,        # chance of a 4th card offered
        tradeoff=0.8 - 0.12 * s,     # chance a card carries a penalty on another gauge
        smart=0.1 + 0.15 * s,        # chance a card targets the gauge that needs it most
        fine_trim=0.03 * s,          # chance a card is a Fine Trim (+/-4 on any gauge)
        rerolls=1 if skill >= 4 else 0,
        move_bonus=s,                # better chiefs find slightly bigger gains
    )


def grade(dist):
    for g, limit in GRADES:
        if dist <= limit:
            return g
    return "D"


class Belief:
    """Player's estimate of each hidden target: uniform prior + noisy readings,
    combined as a normal approximation."""

    PRIOR_MU = (TARGET_MIN + TARGET_MAX) / 2
    PRIOR_VAR = (TARGET_MAX - TARGET_MIN) ** 2 / 12

    def __init__(self):
        self.readings = [[] for _ in range(N)]

    def add(self, i, r):
        self.readings[i].append(r)

    def estimate(self, i, sigma):
        rs = self.readings[i]
        prec = 1 / self.PRIOR_VAR + len(rs) / sigma**2
        mu = (self.PRIOR_MU / self.PRIOR_VAR + sum(rs) / sigma**2) / prec
        return min(max(mu, TARGET_MIN), TARGET_MAX)


def cost(value, mu):
    # Undershooting is cheaper than overshooting: most cards push gauges up,
    # so an overshoot is harder to walk back.
    return (mu - value) if value <= mu else 1.5 * (value - mu)


def make_card(rng, cfg, cp, gauges, est):
    """A card is a list of (gauge_index, delta), or ('trim',) for Fine Trim."""
    if rng.random() < cp["fine_trim"]:
        return ("trim",)
    if rng.random() < cp["smart"]:
        needs = [est[i] - gauges[i] for i in range(N)]
        primary = max(range(N), key=lambda i: abs(needs[i]))
        sign = 1 if needs[primary] >= 0 else -1
    else:
        primary = rng.randrange(N)
        sign = -1 if rng.random() < cfg.negative_card_rate else 1
    mag = rng.randint(cfg.move_lo, cfg.move_hi + cp["move_bonus"])
    if sign < 0:
        mag = max(4, mag // 2)
    effects = [(primary, sign * mag)]
    if rng.random() < cp["tradeoff"]:
        other = rng.choice([i for i in range(N) if i != primary])
        effects.append((other, -rng.randint(3, 8)))
    return effects


def apply(gauges, effects):
    g = list(gauges)
    for i, d in effects:
        g[i] = min(100, max(0, g[i] + d))
    return g


def best_option(card, gauges, est):
    """Return (total_cost, resulting_gauges) for the best way to play a card."""
    if card == ("trim",):
        options = [[(i, d)] for i in range(N) for d in (4, -4)]
    else:
        options = [card]
    best = None
    for eff in options:
        g = apply(gauges, eff)
        c = sum(cost(g[i], est[i]) for i in range(N))
        if best is None or c < best[0]:
            best = (c, g)
    return best


def simulate_night(rng, cfg, skill):
    cp = chief_params(skill)
    targets = [rng.uniform(TARGET_MIN, TARGET_MAX) for _ in range(N)]
    gauges = [0] * N
    belief = Belief()
    rerolls = cp["rerolls"]

    # Each pick is flagged with whether a feedback lap precedes it.
    if cfg.phases:
        schedule = [k == 0 and p > 0 for p, n in enumerate(cfg.phases) for k in range(n)]
    else:
        schedule = [True] * cfg.runs

    for lap_first in schedule:
        if lap_first:
            # Flying lap: driver reports a noisy read on every gauge's target.
            for i in range(N):
                belief.add(i, targets[i] + rng.gauss(0, cfg.driver_sigma))
        est = [belief.estimate(i, cfg.driver_sigma) for i in range(N)]
        current = sum(cost(gauges[i], est[i]) for i in range(N))

        def offer():
            n = 4 if rng.random() < cp["fourth_card"] else 3
            return [make_card(rng, cfg, cp, gauges, est) for _ in range(n)]

        choices = [best_option(c, gauges, est) for c in offer()]
        best = min(choices, key=lambda x: x[0])
        # Spend a reroll if no card makes meaningful progress.
        if rerolls and current - best[0] < 5:
            rerolls -= 1
            choices = [best_option(c, gauges, est) for c in offer()]
            best = min(choices + [best], key=lambda x: x[0])
        # Skipping is allowed if every card makes things worse.
        if best[0] < current:
            gauges = best[1]

    return [grade(abs(gauges[i] - targets[i])) for i in range(N)]


def run(cfg, trials, seed, label):
    print(f"\n=== {label} ===")
    picks = "/".join(map(str, cfg.phases)) if cfg.phases else cfg.runs
    print(f"picks={picks}  move={cfg.move_lo}-{cfg.move_hi}  driver_sigma={cfg.driver_sigma}")
    header = f"{'Chief':>5} | {'avg S/5':>7} | {'>=1 S':>6} | {'>=3 S':>6} | {'5/5 S':>6} | {'S':>5} {'A':>5} {'B':>5} {'C':>5} {'D':>5}"
    print(header)
    print("-" * len(header))
    for skill in range(1, 6):
        rng = random.Random(seed + skill)
        golds, counts = [], {g: 0 for g, _ in GRADES}
        for _ in range(trials):
            grades = simulate_night(rng, cfg, skill)
            golds.append(grades.count("S"))
            for g in grades:
                counts[g] += 1
        total = trials * N
        pct = lambda k: 100 * sum(1 for x in golds if x >= k) / trials
        dist = " ".join(f"{100 * counts[g] / total:4.0f}%" for g, _ in GRADES)
        print(f"{skill:>5} | {statistics.mean(golds):7.2f} | {pct(1):5.0f}% | {pct(3):5.0f}% | {pct(5):5.1f}% | {dist}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, default=20000)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    # Baseline: feedback before every pick.
    run(Config(runs=10, move_lo=15, move_hi=35), args.trials, args.seed, "Feedback every pick, 10 picks")
    # Tune -> flying lap -> tune -> flying lap -> final tune.
    for phases in [(4, 3, 3), (3, 3, 4)]:
        for sigma, name in [(25, "poor"), (15, "average"), (8, "elite")]:
            run(Config(phases=phases, move_lo=15, move_hi=35, driver_sigma=sigma), args.trials,
                args.seed, f"3-phase {phases}, {name} driver")


if __name__ == "__main__":
    main()
