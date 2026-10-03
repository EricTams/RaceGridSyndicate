// Grid reference (runs inside an autoplay page): records what the real AI teams on your grid do over the seasons an
// autoplay career plays, averaged per team per season, as a baseline for the crew lab's grid (tools/crew-lab.js
// prints the same numbers as its GRID lines). It waits for the autoplay report, then returns the table.
// Run it with: node tools/headless-shot.mjs out.png "$(cat tools/grid-reference.js)" "autoplay=1&seasons=2&wait=4"
// (&wait holds autoplay back until the hooks are in, so the first race is counted).
(() => {
  const S = {};   // season -> team id -> stats
  const ai = () => TEAMS.filter(t => !t.you);
  const rec = t => { const s = S[league.season] || (S[league.season] = {}); return s[t.id] || (s[t.id] = {races: 0, pts: 0, dnf: 0, golds: 0, morale: 0, pit: 0,
    rebuilds: 0, devs: 0, spent: 0, sponsors: 0, short: 0, prize: 0, fixerNet: 0, raises: 0, deals: 0, fails: 0, cars: 0}); };
  const wrap = (name, f) => { const g = window[name]; window[name] = function (...a) { return f(g, ...a); }; };
  wrap('rebuildPart', (g, t, c, id) => { const m = t.cash, r = g(t, c, id); if (!t.you) { rec(t).rebuilds++; rec(t).spent += m - t.cash; } return r; });
  wrap('developPart', (g, t, id) => { const m = t.cash, r = g(t, id); if (!t.you) { rec(t).devs++; rec(t).spent += m - t.cash; } return r; });
  wrap('answerFixer', (g, i, t = TEAMS[0], tg = null) => { if (i != null && !t.you) rec(t).deals++; return g(i, t, tg); });
  wrap('startService', (g, c) => { const r = g(c); if (!c.you && race.mode === 'race') rec(c.team).pit += c.pit.total; return r; });
  wrap('settleShortDeals', (g, order) => { const c0 = TEAMS.map(t => t.cash), r = g(order); TEAMS.forEach((t, i) => { if (!t.you) rec(t).short += t.cash - c0[i]; }); return r; });
  wrap('settleFixer', (g, order) => { const c0 = TEAMS.map(t => t.cash), r = g(order); TEAMS.forEach((t, i) => { if (!t.you) rec(t).fixerNet += t.cash - c0[i]; }); return r; });
  wrap('raiseDemand', (g, c) => { const m = c.team.cash, r = g(c); if (!c.you) rec(c.team).raises += m - c.team.cash; return r; });
  wrap('settleRace', (g, order) => {
    ai().forEach(t => { const r = rec(t); if (r.crew) return; r.cashStart = t.cash; r.lvlStart = PARTS.reduce((a, p) => a + t.parts[p.id].level, 0) / PARTS.length;
      r.payroll = t.drvs.reduce((a, d) => a + d.salary, 0) + staffSalaries(t);
      r.crew = STAFF_ROLES.map(x => t.staff[x.id] ? (t.staff[x.id].skills[x.skills[0]] + t.staff[x.id].skills[x.skills[1]]) / 2 : 1); });
    order.forEach((c, k) => { if (c.you) return; const r = rec(c.team); if (c.state === 'done' && k < RACE_PAY.length) r.prize += RACE_PAY[k] * tierMoney();
      r.cars++; r.pts += POINTS[k] || 0; r.dnf += c.state === 'wreck' ? 1 : 0; r.fails += Object.keys(c.failed || {}).length; r.morale += c.drv.morale;
      r.golds += GAUGES.filter(g => c.tune.grades && c.tune.grades[g.id] === 'S').length; });
    ai().forEach(t => { const r = rec(t); r.races++; r.sponsors += sponsorPerRace(t); if (league.race === 1) r.fee1 = sponsorPerRace(t); r.feeN = sponsorPerRace(t); r.noShort = (r.noShort || 0) + (t.sponsors && t.sponsors.short ? 0 : 1); });
    const out = g(order);
    if (league.race >= racesThisSeason()) ai().forEach(t => { const r = rec(t); r.lvlEnd = PARTS.reduce((a, p) => a + t.parts[p.id].level, 0) / PARTS.length; r.cash = t.cash; });
    return out;
  });
  const avg = (rows, f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
  return new Promise(done => { const iv = setInterval(() => {
    if (!document.getElementById('autoplayReport')) return;
    clearInterval(iv);
    const lines = ['GRID REFERENCE · real AI teams on your grid, per team per season'];
    Object.entries(S).forEach(([s, teams]) => { const rows = Object.values(teams).filter(r => r.races);
      lines.push(`S${s}: ` + [['pts/car', r => r.pts / 2, 1], ['car lvl', r => r.lvlStart, 1], ['lvl end', r => r.lvlEnd, 1], ['golds/race', r => r.golds / r.cars, 2],
        ['morale', r => r.morale / r.cars, 0], ['pit s/race', r => r.pit / r.cars, 1], ['fails/car', r => r.fails / 2, 2], ['DNF %', r => 100 * r.dnf / r.cars, 1],
        ['parts built', r => r.devs, 1], ['rebuilds', r => r.rebuilds, 1], ['garage M', r => r.spent, 2], ['payroll M', r => r.payroll, 2],
        ['cash start', r => r.cashStart, 2], ['fees r1', r => r.fee1, 2], ['fees last', r => r.feeN, 2], ['no short', r => r.noShort, 1], ['sponsors M', r => r.sponsors, 2], ['short M', r => r.short, 2], ['prize M', r => r.prize, 2],
        ['fixer M net', r => r.fixerNet, 2], ['raises M', r => r.raises, 2], ['fixer deals', r => r.deals, 1], ['cash end', r => r.cash, 2], ['crew skill', r => r.crew.reduce((a, b) => a + b, 0) / 4, 1]]
        .map(([n, f, d]) => `${n} ${avg(rows.filter(r => !isNaN(f(r))), f).toFixed(d)}`).join(' · '));
    });
    done(lines.join('\n'));
  }, 2000); });
})()
