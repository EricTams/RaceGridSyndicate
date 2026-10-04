// Crew lab (runs inside the game page): measures what each staff skill does. For each role its two skills are set
// LOW/HIGH in a 2x2 (neither, A only, B only, both) and measured WOWY style: A's effect with B and without B, and the
// same for B. Every run holds all four variants, rotated between the grid's slots over 4 runs that share a seed, so
// each variant sees every slot (car, drivers, manager, pit box, rival crews) equally and the slots cancel out.
//
//   mode 'season' (default): whole seasons played by the game's own code: the Night Tune, qualifying and the race,
//     then settleRace() (sponsor fees and short-term deals, prize money, morale and raises, parts in development,
//     the Design Studio, AI garages, the regulation review, fixer calls), sponsors signed and settled as AI teams do,
//     payroll every season, and between seasons measureCarry()/buildNewCars() (carry-over, regulations, next-year
//     levels, the design meeting). Only the field, the staff and the drivers are held still: no promotion, no
//     contracts ending, no aging. Your team plays as an AI team; your-team-only systems (events, the Backer, HQ,
//     the driver market) are left out.
//     grid 'real' (default): every slot is a team as the game makes them at a career start (its seed's car level,
//       cash, manager, reputation and drivers, and a background crew drawn like the staff pool), so rival crews
//       have a real spread of skills. grid 'flat': identical teams with every other skill at `base`.
//   mode 'race': single races on fresh, equal cars, every track (race-day effects only).
//   mode 'random': season runs (as above, real grid) where every team's crew has ALL 16 skills (4 roles × 4
//     skills, off-role ones included) rolled at random 1-5. Then a least-squares fit per metric, controlling for
//     each grid slot: what one point of each skill is worth, with its standard error. Lit (primary) skills are
//     marked *. Settings: runs (default 60), seasons.
//
// Run it with: node tools/headless-shot.mjs out.png "$(cat tools/crew-lab.js)"
// Settings: window.CREW_LAB = {mode:'season', grid:'real', seasons:2, roles:['fixer','chief','pit','techdir'], lo:1,
// hi:5, reps:10} before the script. reps: rotations of 4 runs (seasons, or races per track in race mode).
// Random mode: window.CREW_LAB = {mode:'random', runs:60, seasons:2}.
(() => {
  const CFG = Object.assign({mode: 'season', grid: 'real', seasons: 2, roles: STAFF_ROLES.map(r => r.id), lo: 1, hi: 5, reps: 10, base: 3, tracks: null, runs: 60},
    window.CREW_LAB || {});
  const DRV = {pace: 70, racecraft: 70, tires: 70, fuel: 70, gunnery: 70, composure: 70, feedback: 70, fame: 50};
  const realRandom = Math.random;
  let seed = 1;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  document.querySelectorAll('.result').forEach(e => e.hidden = true);
  const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  const se = xs => xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - mean(xs)) ** 2, 0) / (xs.length - 1) / xs.length) : NaN;
  const avgLevel = t => PARTS.reduce((a, p) => a + t.parts[p.id].level, 0) / PARTS.length;
  const staffList = skills => staffPrice({id: 0, skills});

  // Counters: pit seconds in the box, garage spending, fixer deals and the fixer's net money.
  const _startService = startService, _rebuildPart = rebuildPart, _developPart = developPart, _answerFixer = answerFixer, _settleFixer = settleFixer;
  startService = c => { _startService(c); c.labPit = (c.labPit || 0) + c.pit.total; };
  rebuildPart = (t, c, id) => { const m = t.cash; _rebuildPart(t, c, id); if (t.lab) { t.lab.rebuilds++; t.lab.spent += m - t.cash; } };
  developPart = (t, id) => { const m = t.cash; _developPart(t, id); if (t.lab) { t.lab.devs++; t.lab.spent += m - t.cash; } };
  answerFixer = (i, t = TEAMS[0], target = null) => { if (i != null && t.lab) t.lab.deals++; _answerFixer(i, t, target); };
  const _settleShortDeals = settleShortDeals, _raiseDemand = raiseDemand;   // short-term sponsor bonuses, and raises paid
  settleShortDeals = order => { const c0 = TEAMS.map(t => t.cash), r = _settleShortDeals(order); TEAMS.forEach((t, i) => { if (t.lab) t.lab.short += t.cash - c0[i]; }); return r; };
  raiseDemand = c => { const m = c.team.cash, r = _raiseDemand(c); if (c.team.lab) c.team.lab.raises += m - c.team.cash; return r; };
  settleFixer = order => { const c0 = TEAMS.map(t => t.cash); _settleFixer(order); TEAMS.forEach((t, i) => { if (t.lab) t.lab.fixerCash += t.cash - c0[i]; }); };

  // Your team and cars play as an AI team.
  mine.forEach(c => c.you = false); TEAMS[0].you = false;
  cars.forEach(c => { c.team.drvs[c.slot] = c.drv; });
  const ROSTER = TEAMS.map(t => ({plan: t.plan, guns: t.guns, mines: t.mines, armor: t.armor, pace: t.pace, seed: t.seed === 'you' ? 'lower' : t.seed}));
  const VARIANTS = ['neither', 'A only', 'B only', 'both'];
  const person = skills => ({name: 'LAB', skills, yearsLeft: 9});

  // Staff: the tested role gets the variant's skills; every other seat gets the slot's background crew (grid 'real':
  // drawn like the staff pool for the slot's seed; 'flat': every skill at base). Contracts are signed fixer first.
  function crewFor(roleId, v, bg) {
    const [A, B] = roleById(roleId).skills, flat = {mechanical: CFG.base, design: CFG.base, people: CFG.base, nerve: CFG.base};
    const sk = {...(bg ? bg[roleId] : flat)};
    sk[A] = v === 1 || v === 3 ? CFG.hi : CFG.lo;
    sk[B] = v === 2 || v === 3 ? CFG.hi : CFG.lo;
    return Object.fromEntries(STAFF_ROLES.map(r => [r.id, person(r.id === roleId ? sk : {...(bg ? bg[r.id] : flat)})]));
  }
  // Random mode: every skill of every role rolled 1-5 (Math.random is the run's seeded rng by then).
  const randomCrew = () => Object.fromEntries(STAFF_ROLES.map(r => [r.id, person(Object.fromEntries(STAFF_SKILLS.map(([k]) => [k, 1 + Math.floor(Math.random() * 5)])))]));
  function hireCrew(t, staff) {
    t.staff = {};
    STAFF_ROLES.forEach(r => { const p = staff[r.id]; p.salary = contractFor(t, staffList(p.skills)); t.staff[r.id] = p; });   // the fixer is hired first
  }
  // A slot's background: what the game gives a team of this seed at a career start.
  function slotProfile(i) {
    const ro = ROSTER[i], sd = SEEDS[ro.seed];
    const base = TIER_BASE[0] + sd.lvl + (ro.pace || 0) * 5 + rand(-2, 2);
    return {seed: ro.seed, parts: Object.fromEntries(PARTS.map(p => [p.id, Math.round(base + rand(-2, 2))])),
      cash: rand(...sd.cash) * TIER_MONEY[0], mgr: {business: choice(sd.mgr), tactics: choice(sd.mgr)},
      rep: clampRep(35 + (ro.pace || 0) * 15 + sd.rep + rand(-5, 5)),
      drivers: [0, 1].map(() => rollDriver({tier: 0, pace: (ro.pace || 0) + (sd.drv || 0)}))};
  }
  // Every slot's background crew, hired the way a career starts: a fresh pool like the game's, and the game's own
  // AI hiring (best-seeded first, a round per role, each manager picking by their business rating).
  function hireBackgrounds(profiles) {
    const keep = league.staffPool;
    league.staffPool = Array.from({length: 60}, () => makePerson(STAFF_Q[0] + rand(-0.6, 0.8)));
    TEAMS.forEach((t, i) => { t.staff = {}; t.mgr = {...profiles[i].mgr}; t.cash = profiles[i].cash; });
    aiHireStaff(TEAMS.slice().sort((a, b) => SEED_ORDER.indexOf(profiles[TEAMS.indexOf(a)].seed) - SEED_ORDER.indexOf(profiles[TEAMS.indexOf(b)].seed)));
    TEAMS.forEach((t, i) => profiles[i].crew = Object.fromEntries(STAFF_ROLES.map(r => [r.id, {...t.staff[r.id].skills}])));
    league.staffPool = keep;
  }
  const setRep = (t, rep) => { if (t === TEAMS[0]) { t.street = rep; t.corp = rep; } else t.rep = rep; };

  // One race weekend at league.race on the calendar: Night Tune, qualifying, race. Parts keep their condition.
  // Flat grid: drivers are reset to the same stats (fame carries, for raises) and, if resetMorale, morale.
  function weekend(resetMorale) {
    cars.forEach(c => {
      if (CFG.grid === 'flat' || CFG.mode === 'race') { Object.assign(c.drv.stats, DRV, {fame: CFG.mode === 'race' ? DRV.fame : c.drv.stats.fame}); c.drv.abilities = []; }
      if (resetMorale) c.drv.morale = MORALE_BASE;
      c.condStart = {...c.cond}; c.labPit = 0;
    });
    startNightTune(); $('tuneOv').hidden = true;
    ntStage = 'quali'; startQualifying();
    for (let i = 0; i < 60 * 600 && !race.over; i++) stepSim(1 / 60);
    const grid = standings();
    $('tuneOv').hidden = true; $('qualiOv').hidden = true;
    goToGrid(); race.ready = true;
    cars.forEach(c => c.labPit = 0);
    for (let i = 0; i < 60 * 1500 && !race.over; i++) stepSim(1 / 60);
    return {order: standings(), grid};
  }
  const carRow = (c, order, grid) => {
    const pos = order.indexOf(c) + 1, grades = GAUGES.map(g => 'SABCD'.indexOf(c.tune.grades[g.id]));
    return {pos, pts: POINTS[pos - 1] || 0, grid: grid.indexOf(c) + 1, gap: c.state === 'done' ? c.finishT - order[0].finishT : null,
      dnf: c.state === 'wreck' ? 1 : 0, golds: grades.filter(x => x === 0).length, grade: grades.reduce((a, b) => a + b, 0) / grades.length,
      pit: c.labPit, stops: c.stops, cond: PARTS.reduce((a, p) => a + c.cond[p.id], 0) / PARTS.length,
      startCond: PARTS.reduce((a, p) => a + c.condStart[p.id], 0) / PARTS.length, fails: Object.keys(c.failed || {}).length, morale: c.drv.morale};
  };

  // ---- race mode: one race on fresh, equal cars ----
  function raceRun(track, raceSeed, roleId, rotation) {
    TEAMS.forEach((t, i) => { const v = (i + rotation) % 4; t.labVariant = v; hireCrew(t, crewFor(roleId, v, null));
      Object.assign(t, {plan: 'std', guns: 'std', mines: 1, armor: 1, pace: 0, mgr: {business: 'pro', tactics: 'pro'}});
      PARTS.forEach(p => { t.parts[p.id].level = 55; t.parts[p.id].dev = 0; }); });
    cars.forEach(c => PARTS.forEach(p => c.cond[p.id] = 100));
    league.calendar = [track.id]; league.race = 1; league.calendarSeason = league.season; league.weather = Array(40).fill('clear');
    if (TRACK !== track) loadTrack(track); else applyWeather();
    seed = raceSeed; Math.random = rng;
    const {order, grid} = weekend(true);
    Math.random = realRandom;
    return cars.map(c => ({v: c.team.labVariant, ...carRow(c, order, grid)}));
  }

  // ---- season mode: CFG.seasons years, from the first design meeting to the last race ----
  function seasonRun(runSeed, roleId, rotation) {
    seed = runSeed; Math.random = rng;
    const profiles = CFG.grid === 'real' ? TEAMS.map((_, i) => slotProfile(i)) : null;   // drawn first: the same for every rotation
    if (profiles) hireBackgrounds(profiles);
    league.season = 1; league.race = 1; league.review = null; league.regPick = null; league.stats = {}; league.event = null;
    closeFixerSeason();
    TEAMS.forEach((t, i) => {
      const v = (i + rotation) % 4, pf = profiles && profiles[i];
      t.labVariant = v;
      t.lab = {rebuilds: 0, devs: 0, spent: 0, deals: 0, fixerCash: 0, payroll: 0, sponsors: 0, bonus: 0, short: 0, prize: 0, raises: 0, cashStart: [], fee1: [], feeN: [], noShort: [], rows: Array.from({length: CFG.seasons}, () => []), pts: [], designed: [], level: [], cash: []};
      if (pf) Object.assign(t, ROSTER[i], {mgr: {...pf.mgr}, cash: pf.cash, seed: pf.seed});
      else Object.assign(t, {plan: 'std', guns: 'std', mines: 1, armor: 1, pace: 0, mgr: {business: 'pro', tactics: 'pro'}, cash: 3.5 * tierMoney(), seed: 'lower'});
      setRep(t, pf ? pf.rep : 40); t.lastPos = undefined;
      Object.assign(t, {studio: [], nextYear: {}, carry: null, sponsors: {main: null, short: null}, offers: {}, skipped: {}});
      PARTS.forEach(p => Object.assign(t.parts[p.id], {level: pf ? pf.parts[p.id] : tierBaseline(0), dev: 0, count: 0}));
      hireCrew(t, roleId ? crewFor(roleId, v, pf && pf.crew) : randomCrew());
      // drivers: the slot's own (real) or the same pair for everyone (flat); signed at list less the fixer's bargain
      t.drvs.forEach((d, k) => {
        const src = pf ? pf.drivers[k] : {stats: {...DRV}, abilities: []};
        Object.assign(d, {stats: {...src.stats}, abilities: [...src.abilities], age: 26, talent: 0});
        initDriverCareer(d, contractFor(t, driverPrice(d))); d.raisedIn = null;
      });
    });
    cars.forEach(c => { PARTS.forEach(p => c.cond[p.id] = 100); c.moodNotes = []; });
    // A career start, in the game's load order: the staff paid on hiring (staff.js), sponsors signed (tiers.js), the
    // design meeting (newcar.js), then the draft (one seat signed and paid; the other driver is paid from next season).
    TEAMS.forEach(t => { const pay = staffSalaries(t); t.cash -= pay; t.lab.payroll += pay; });
    TEAMS.forEach(aiSignSponsors);
    TEAMS.forEach(aiDesignMeeting);
    TEAMS.forEach(t => { const pay = t.drvs[1].salary; t.cash -= pay; t.lab.payroll += pay; });
    for (let s = 0; s < CFG.seasons; s++) {
      if (s > 0) {
        // Season end, as nextRace() does it (minus promotion, contracts ending and aging): regulations, carry-over,
        // sponsor bonuses, reputation from the standings, then next season's cars and their design meetings.
        const regId = league.review ? (league.regPick || choice(league.review)) : null;
        measureCarry(regId); closeFixerSeason();
        teamStandings().forEach((t, i) => { setRep(t, clampRep(0.6 * t.rep + 0.4 * (100 - i * 10))); t.lastPos = i + 1; });
        league.season++; league.race = 1; league.review = null; league.regPick = null; league.stats = {};
      }
      // Later seasons, as nextRace() orders it: salaries (in promoteAndRelegate), the new cars, then sponsors.
      if (s > 0) {
        TEAMS.forEach(t => { const pay = t.drvs.reduce((a, d) => a + d.salary, 0) + staffSalaries(t); t.cash -= pay; t.lab.payroll += pay; });
        buildNewCars();
        TEAMS.forEach(t => t.sponsors = {main: null, short: null});
        TEAMS.forEach(aiSignSponsors);
      }
      TEAMS.forEach(t => t.lab.designed.push(avgLevel(t)));
      makeCalendar();
      TEAMS.forEach(t => t.lab.cashStart.push(t.cash));
      for (let r = 1; r <= racesThisSeason(); r++) {
        league.race = r;
        const {order, grid} = weekend(false);
        cars.forEach(c => c.team.lab.rows[s].push(carRow(c, order, grid)));
        order.forEach((c, k) => { if (c.state === 'done' && k < RACE_PAY.length) c.team.lab.prize += RACE_PAY[k] * tierMoney(); });
        TEAMS.forEach(t => { t.lab.sponsors += sponsorPerRace(t); if (r === 1) t.lab.fee1[s] = sponsorPerRace(t); t.lab.feeN[s] = sponsorPerRace(t); t.lab.noShort[s] = (t.lab.noShort[s] || 0) + (t.sponsors.short ? 0 : 1); });
        settleRace(order);
        league.event = null; league.devFrozen = false;
        TEAMS.forEach(aiSignSponsors);   // a free short-term slot is refilled, as nextRace() does
      }
      // the season sponsor's bonus for the final placement (closeSponsorSeason, as at every season end)
      { const c0 = TEAMS.map(t => t.cash); closeSponsorSeason(); TEAMS.forEach((t, i) => t.lab.bonus += t.cash - c0[i]); }
      TEAMS.forEach(t => { const L = t.lab; L.pts.push(seasonStat(t).points / 2); L.level.push(avgLevel(t)); L.cash.push(t.cash);
        (L.snap || (L.snap = [])).push({rebuilds: L.rebuilds, devs: L.devs, spent: L.spent, deals: L.deals, sponsors: L.sponsors, payroll: L.payroll, bonus: L.bonus, short: L.short, prize: L.prize, raises: L.raises, fixerCash: L.fixerCash}); });
    }
    Math.random = realRandom;
    return TEAMS.map(t => {
      const all = t.lab.rows.flat(), m = k => mean(all.filter(x => x[k] != null).map(x => x[k])), L = t.lab;
      const row = {v: t.labVariant, slot: TEAMS.indexOf(t), skills: STAFF_ROLES.flatMap(r => STAFF_SKILLS.map(([k]) => t.staff[r.id].skills[k])), pts: L.pts.reduce((a, b) => a + b, 0), pos: m('pos'), grid: m('grid'), golds: m('golds'), grade: m('grade'),
        pit: m('pit'), startCond: m('startCond'), morale: m('morale'), fails: all.reduce((a, x) => a + x.fails, 0) / 2, dnf: m('dnf'),
        devs: L.devs, rebuilds: L.rebuilds, spent: L.spent, payroll: L.payroll, sponsors: L.sponsors + L.short + L.bonus, deals: L.deals, fixerCash: L.fixerCash, cash: t.cash};
      L.pts.forEach((p, s) => { row['pts' + (s + 1)] = p; row['lvl' + (s + 1)] = L.designed[s]; row['end' + (s + 1)] = L.level[s]; });
      // the grid summary, per season, in the grid reference's terms (tools/grid-reference.js)
      row.grid = L.pts.map((p, s) => { const rs = L.rows[s], a = L.snap[s], b = s ? L.snap[s - 1] : {rebuilds: 0, devs: 0, spent: 0, deals: 0, sponsors: 0, payroll: 0, bonus: 0, short: 0, prize: 0, raises: 0, fixerCash: 0};
        return {'pts/car': p, 'car lvl': L.designed[s], 'lvl end': L.level[s], 'golds/race': mean(rs.map(x => x.golds)), morale: mean(rs.map(x => x.morale)),
          'pit s/race': mean(rs.map(x => x.pit)), 'fails/car': rs.reduce((a, x) => a + x.fails, 0) / 2, 'DNF %': 100 * mean(rs.map(x => x.dnf)),
          'parts built': a.devs - b.devs, rebuilds: a.rebuilds - b.rebuilds, 'garage M': a.spent - b.spent, 'payroll M': a.payroll - b.payroll,
          'cash start': L.cashStart[s], 'fees r1': L.fee1[s], 'fees last': L.feeN[s], 'no short': L.noShort[s], 'sponsors M': a.sponsors - b.sponsors, 'short M': a.short - b.short, 'prize M': a.prize - b.prize, 'fixer M net': a.fixerCash - b.fixerCash, 'raises M': a.raises - b.raises, 'bonus M': a.bonus - b.bonus, 'fixer deals': a.deals - b.deals, 'cash end': L.cash[s],
          'crew skill': mean(STAFF_ROLES.map(r => (t.staff[r.id].skills[r.skills[0]] + t.staff[r.id].skills[r.skills[1]]) / 2))}; });
      return row;
    });
  }

  const RACE_METRICS = [['pos', 'finish', 2], ['pts', 'points', 2], ['grid', 'grid', 2], ['gap', 'gap s', 1], ['dnf', 'DNF %', 1, 100],
    ['golds', 'golds', 2], ['grade', 'grade 0=S', 2], ['pit', 'pit s', 1], ['stops', 'stops', 2], ['cond', 'end cond', 1], ['fails', 'fails', 2]];
  const perSeason = Array.from({length: CFG.seasons}, (_, s) => [[`pts${s + 1}`, `pts S${s + 1}`, 1], [`lvl${s + 1}`, `car lvl S${s + 1}`, 2], [`end${s + 1}`, `lvl end S${s + 1}`, 2]]).flat();
  const SEASON_METRICS = [['pts', 'pts/car all', 1], ...perSeason, ['pos', 'avg finish', 2], ['grid', 'avg grid', 2],
    ['golds', 'golds/race', 2], ['grade', 'grade 0=S', 2], ['morale', 'morale', 1], ['pit', 'pit s/race', 2],
    ['startCond', 'start cond', 1], ['fails', 'fails/car', 2], ['dnf', 'DNF %', 1, 100], ['devs', 'parts built', 2],
    ['rebuilds', 'rebuilds', 2], ['spent', 'garage M', 2], ['payroll', 'payroll M', 2], ['sponsors', 'sponsors M', 2],
    ['deals', 'fixer deals', 2], ['fixerCash', 'fixer M net', 2], ['cash', 'cash at end', 2]];
  const f = (x, d) => isNaN(x) ? '-' : (x >= 0 ? '+' : '') + x.toFixed(d);
  const out = [], t0 = performance.now(), tracks = CFG.tracks ? TRACKS.filter(t => CFG.tracks.includes(t.id)) : TRACKS;
  const season = CFG.mode === 'season', METRICS = season ? SEASON_METRICS : RACE_METRICS;
  out.push(season ? `CREW LAB · ${CFG.seasons} SEASON${CFG.seasons > 1 ? 'S' : ''} A RUN · ${CFG.grid === 'real' ? 'a real grid (slots rotate)' : `identical teams (others ${CFG.base})`} · skills LOW ${CFG.lo} / HIGH ${CFG.hi} · ${4 * CFG.reps} runs of ${racesThisSeason()} races a season per role`
    : `CREW LAB · RACES · identical teams · skills LOW ${CFG.lo} / HIGH ${CFG.hi} (others ${CFG.base}) · ${tracks.length} tracks × ${4 * CFG.reps} races`);
  // ---- random mode: least squares over every team-run, skills plus a dummy per grid slot ----
  if (CFG.mode === 'random') {
    const rows = [];
    for (let r = 0; r < CFG.runs; r++) rows.push(...seasonRun(9000 + r * 131, null, 0));
    const names = STAFF_ROLES.flatMap(role => STAFF_SKILLS.map(([k, ab]) => ({label: `${roleShort(role.id)} ${ab}`, lit: role.skills.includes(k)})));
    const nS = names.length, nT = TEAMS.length, nX = nS + nT;
    const X = rows.map(row => [...row.skills.map(x => x - 3), ...TEAMS.map((_, i) => row.slot === i ? 1 : 0)]);
    // (X'X)^-1 once, by Gauss-Jordan; the same for every metric
    const A = Array.from({length: nX}, (_, i) => [...Array.from({length: nX}, (_, j) => X.reduce((a, x) => a + x[i] * x[j], 0)), ...Array.from({length: nX}, (_, j) => i === j ? 1 : 0)]);
    for (let c = 0; c < nX; c++) {
      let p = c; for (let r = c + 1; r < nX; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; const d = A[c][c]; for (let j = 0; j < 2 * nX; j++) A[c][j] /= d;
      for (let r = 0; r < nX; r++) if (r !== c && A[r][c]) { const m = A[r][c]; for (let j = 0; j < 2 * nX; j++) A[r][j] -= m * A[c][j]; }
    }
    const inv = A.map(r => r.slice(nX));
    const RM = [['pts', 'pts/car', 2], ...Array.from({length: CFG.seasons}, (_, s) => [`lvl${s + 1}`, `car lvl S${s + 1}`, 2]), [`pts${CFG.seasons}`, `pts S${CFG.seasons}`, 2], ['pos', 'avg finish', 2], ['golds', 'golds/race', 2],
      ['pit', 'pit s/race', 2], ['fails', 'fails/car', 2], ['morale', 'morale', 1], ['sponsors', 'sponsors M', 2], ['cash', 'cash end', 2]];
    const fits = RM.map(([k]) => {
      const ok = rows.map((row, i) => [row[k], X[i]]).filter(([y]) => y != null && !isNaN(y));
      const xty = Array.from({length: nX}, (_, j) => ok.reduce((a, [y, x]) => a + x[j] * y, 0));
      const b = inv.map(r => r.reduce((a, v, j) => a + v * xty[j], 0));
      const sse = ok.reduce((a, [y, x]) => a + (y - x.reduce((s, v, j) => s + v * b[j], 0)) ** 2, 0), s2 = sse / Math.max(1, ok.length - nX);
      return b.map((v, j) => [v, Math.sqrt(s2 * inv[j][j])]);
    });
    out.length = 0;
    out.push(`CREW LAB · RANDOM SKILLS · ${CFG.runs} runs × ${nT} teams × ${CFG.seasons} season${CFG.seasons > 1 ? 's' : ''} · each cell: change per skill point ± standard error · * primary (lit) skill · ! = 2+ SE from zero`);
    out.push('skill'.padEnd(8) + RM.map(([, l]) => l.padStart(14)).join(''));
    names.forEach((n, j) => out.push(`${n.label}${n.lit ? '*' : ' '}`.padEnd(8) + RM.map(([, , d], m) => {
      const [v, e] = fits[m][j], sig = Math.abs(v) >= 2 * e ? '!' : ' ';
      return `${f(v, d)}±${e.toFixed(d)}${sig}`.padStart(14);
    }).join('')));
    out.push('', 'field average: ' + Array.from({length: CFG.seasons}, (_, s) => `car lvl S${s + 1} ${mean(rows.map(r => r['lvl' + (s + 1)])).toFixed(1)} → end ${mean(rows.map(r => r['end' + (s + 1)])).toFixed(1)}`).join(' · '));
    out.push(`(${rows.length} team-runs · ${Math.round((performance.now() - t0) / 1000)}s)`);
    const text = out.join('\n');console.log(text);return text;
  }
  for (const roleId of CFG.roles) {
    const role = roleById(roleId), [A, B] = role.skills;
    // The unit is a group of 4 runs that rotate the variants through every slot: each variant's mean over the group,
    // so slot differences (car, drivers, manager, rival crews, pit box) cancel and effects are measured inside it.
    const runs = [], gridRows = [];
    let group = [];
    const add = rows => {
      group.push(...rows);
      if (group.length < 4 * (season ? TEAMS.length : cars.length)) return;   // season rows are per team, race rows per car
      if (season) group.forEach(x => x.grid.forEach((g, s) => (gridRows[s] || (gridRows[s] = [])).push(g)));
      runs.push(VARIANTS.map((_, v) => Object.fromEntries(METRICS.map(([k]) => {
        const xs = group.filter(x => x.v === v && x[k] != null).map(x => x[k]); return [k, mean(xs)];
      }))));
      group = [];
    };
    if (season) for (let s = 0; s < 4 * CFG.reps; s++) add(seasonRun(5000 + Math.floor(s / 4) * 131, roleId, s % 4));
    else tracks.forEach((track, ti) => { for (let r = 0; r < 4 * CFG.reps; r++) add(raceRun(track, 1000 + ti * 97 + r, roleId, r % 4)); });
    out.push('', `${role.label} · A = ${A.toUpperCase()} (${role.what[0]}) · B = ${B.toUpperCase()} (${role.what[1]}) · ${runs.length} groups of 4 ${season ? 'runs' : 'races'}`);
    out.push('metric'.padEnd(13) + VARIANTS.map(v => v.padStart(9)).join('') + '     A w/o B    A with B     B w/o A    B with A');
    for (const [k, label, d, scale = 1] of METRICS) {
      const col = v => mean(runs.map(r => r[v][k]).filter(x => !isNaN(x))) * scale;
      const diff = (hi, lo) => { const xs = runs.map(r => (r[hi][k] - r[lo][k]) * scale).filter(x => !isNaN(x)); return `${f(mean(xs), d)}±${se(xs).toFixed(d)}`; };
      out.push(label.padEnd(13) + VARIANTS.map((_, v) => col(v).toFixed(d).padStart(9)).join('') +
        '  ' + [diff(1, 0), diff(3, 2), diff(2, 0), diff(3, 1)].map(s => s.padStart(11)).join(' '));
    }
    // The whole grid, every team and variant, per season: compare with tools/grid-reference.js on a real career.
    const DIG = {'pts/car': 1, 'car lvl': 1, 'lvl end': 1, 'golds/race': 2, morale: 0, 'pit s/race': 1, 'fails/car': 2, 'DNF %': 1, 'parts built': 1,
      rebuilds: 1, 'garage M': 2, 'payroll M': 2, 'cash start': 2, 'fees r1': 2, 'fees last': 2, 'no short': 1, 'sponsors M': 2, 'short M': 2, 'prize M': 2, 'fixer M net': 2, 'raises M': 2, 'bonus M': 2, 'fixer deals': 1, 'cash end': 2, 'crew skill': 1};
    gridRows.forEach((rows, s) => out.push(`GRID S${s + 1}: ` + Object.keys(DIG).map(k => `${k} ${mean(rows.map(r => r[k]).filter(x => !isNaN(x))).toFixed(DIG[k])}`).join(' · ')));
  }
  out.push('', `(±: standard error across groups · ${Math.round((performance.now() - t0) / 1000)}s)`);
  const text = out.join('\n');
  console.log(text);
  return text;
})()
