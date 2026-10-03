// Ability lab (runs inside the game page): a solo time trial on every track, a neutral test driver with and
// without each track-dependent ability, seeded so every run sees identical randomness.
// Run it with: node tools/headless-shot.mjs out.png "$(cat tools/ability-lab.js)"
(() => {
  const ABILITIES_TESTED = ['streetrat', 'boulevard', 'tunnel', 'raindancer'];
  const BASE = {pace: 70, racecraft: 70, tires: 70, fuel: 70, gunnery: 70, composure: 70, feedback: 70, fame: 50};
  const realRandom = Math.random;
  let seed = 1;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  document.querySelectorAll('.result').forEach(e => e.hidden = true);
  tuneDone = true;
  const car = mine[0], saved = car.drv;

  // Average flying lap (laps 2 and 3) for one driver setup on one track and night.
  function lapTime(track, ability, weather) {
    loadTrack(track); league.weather = Array(40).fill(weather); applyWeather();
    seed = 12345; Math.random = rng;
    car.drv = {...saved, stats: {...BASE}, abilities: ability ? [ability] : [], morale: MORALE_BASE};
    PARTS.forEach(p => car.condStart[p.id] = 100);
    resetRace(); race.ready = true; race.t = 0;
    cars.forEach(o => { if (o !== car) { o.state = 'wreck'; o.v = 0; o.d = -1e6; } });   // an empty track
    car.orders = {fuel: 'std', tires: 'std', guns: 'hold'};
    car.compound = isRain() ? 'wet' : 'medium';
    car.tune = {locked: true, grades: {engine: 'B', handling: 'B', aero: 'B', weapons: 'B', armor: 'B'}};
    let t1 = null, t3 = null;
    for (let i = 0; i < 60 * 900 && t3 === null; i++) {
      stepSim(1 / 60);
      if (t1 === null && car.d >= L) t1 = race.t;
      if (car.d >= 3 * L) t3 = race.t;
    }
    Math.random = realRandom;
    return (t3 - t1) / 2;
  }

  const rows = [];
  for (const track of TRACKS) {
    const night = 'clear', rainy = 'rain';
    const base = lapTime(track, null, night), baseRain = lapTime(track, null, rainy);
    const row = {track: track.id, tags: track.tags.join('+'), lap: +base.toFixed(2), slow: Math.round(100 * TRACK_SHAPE.slow), straight: Math.round(100 * TRACK_SHAPE.straight)};
    for (const ab of ABILITIES_TESTED) {
      const w = ab === 'raindancer' ? rainy : night, ref = ab === 'raindancer' ? baseRain : base;
      row[ab] = +(100 * (ref - lapTime(track, ab, w)) / ref).toFixed(2);   // % of lap time saved
    }
    rows.push(row);
  }
  car.drv = saved; loadTrack(TRACKS[0]);
  return JSON.stringify(rows);
})()
