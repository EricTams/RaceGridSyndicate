// SFX sandbox: open game/?sfx to audition every sound effect without starting a career.
// One button per sound, grouped; sounds with recorded samples get a synth/sample switch for A/B. The sliders are
// the game's own volumes (the music slider plays the menu song under the effects, to judge the mix).
// "measure" renders every sound offline (no compressor or limiter) and prints peak and loudness to the console and
// the page; sfxMeasure() does the same from the console or a headless run.
'use strict';

// Render one sound offline and measure it: {id, dur (s), peak (dBFS), rms (dBFS over the loud part)}.
async function sfxMeasureOne(id, sample) {
  const sr = 44100, ctx = new OfflineAudioContext(2, sr * 3, sr), saved = {...AUDIO};
  try {
    const n = ctx.createBuffer(1, sr, sr), ch = n.getChannelData(0);
    for (let i = 0; i < sr; i++) ch[i] = Math.random() * 2 - 1;
    Object.assign(AUDIO, {ctx, noise: n, sfx: ctx.createGain(), sfxVerb: ctx.createGain()});
    AUDIO.sfx.connect(ctx.destination); AUDIO.sfxVerb.gain.value = 0;   // dry only
    const out = sfxOut({gain: SFX_TRIM[id] || 1}), useSample = sample && SFX.buffers[id] && SFX.buffers[id].length;
    if (useSample) sfxPlaySample(id, 0.01, out); else SFX_SYNTH[id](0.01, out, {});
  } finally { Object.assign(AUDIO, saved); }
  const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0, last = 0, sum = 0, cnt = 0;
  for (let i = 0; i < L.length; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; if (a > 0.001) last = i; }
  for (let i = 0; i < L.length; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak * 0.1) { sum += L[i] * L[i]; cnt++; } }
  const db = x => x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -Infinity;
  return {id, kind: useSampleLabel(id, sample), dur: Math.round(last / sr * 100) / 100, peak: db(peak), rms: db(Math.sqrt(sum / Math.max(1, cnt)))};
}
const useSampleLabel = (id, sample) => sample && SFX.buffers[id] && SFX.buffers[id].length ? 'sample' : 'synth';
async function sfxMeasure(sample = true) {
  const rows = [];
  for (const id of Object.keys(SFX_SYNTH)) rows.push(await sfxMeasureOne(id, sample));
  console.table(rows);
  return rows;
}

(() => {
  const q = new URLSearchParams(location.search);
  if (!q.has('sfx')) return;
  document.querySelectorAll('[id$=Ov]').forEach(e => e.hidden = true);
  $('result').hidden = true;
  const GROUPS = {
    'Interface': ['click', 'pill', 'tab', 'cashIn', 'cashOut', 'stamp', 'clank', 'arrive'],
    'Night Tune & quali': ['card', 'lock', 'perfect', 'qOut', 'qIn', 'qLap', 'qBest'],
    'Stingers': ['promo', 'releg', 'season'],
    'Race start & finish': ['bannerIn', 'bannerOut', 'light', 'lightsOut', 'lastLap', 'flag', 'finish'],
    'Radio & info': ['radio', 'radioYou', 'radioBad', 'armor', 'posUp', 'posDown', 'save', 'box', 'boxCancel'],
    'Combat': ['gun', 'hit', 'jam', 'mineDrop', 'mineHit', 'spin', 'launch', 'pitOut', 'wreck', 'wreckFar', 'engineBlow', 'bodyTear', 'airgun'],
  };
  const el = (tag, props) => Object.assign(document.createElement(tag), props);
  const box = el('div');
  Object.assign(box.style, {position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, maxWidth: 'calc(100vw - 16px)',
    maxHeight: 'calc(100vh - 16px)', overflow: 'auto', padding: '6px 10px', background: 'rgba(10,8,20,0.94)', border: '1px solid #ffd23f',
    color: '#ffd23f', font: '12px monospace', display: 'grid', gap: '6px', width: '640px'});
  const row = (...kids) => { const r = el('div'); Object.assign(r.style, {display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap'}); r.append(...kids); return r; };
  const unlock = () => { audioCtx(); sfxLoadSamples(); };
  const pan = el('input', {type: 'range', min: -1, max: 1, step: 0.1, value: 0});
  const play = id => { unlock(); SFX.last[id] = -9; sfx(id, {pan: +pan.value, dur: 1.6}); };
  for (const [g, ids] of Object.entries(GROUPS)) {
    const kids = ids.map(id => {
      const b = el('button', {textContent: id}); b.style.fontSize = '8px';
      b.addEventListener('click', e => { e.stopPropagation(); play(id); });
      if (!SFX_SAMPLES[id]) return b;
      const s = el('select', {title: 'synth or recorded sample'});
      for (const v of ['sample', 'synth']) s.append(el('option', {value: v, textContent: v}));
      s.addEventListener('change', () => { SFX.variant[id] = s.value; });
      const w = el('span'); w.style.display = 'inline-flex'; w.append(b, s); return w;
    });
    box.append(row(el('b', {textContent: g + ':'}), ...kids));
  }
  const vol = (k, label) => {
    const s = el('input', {type: 'range', min: 0, max: 100, step: 5, value: AUDIO.vol[k] * 100});
    s.addEventListener('input', () => { unlock(); AUDIO.vol[k] = s.value / 100; applyVolumes(); });
    return [el('span', {textContent: label}), s];
  };
  const music = el('button', {textContent: '▶ menu music'});
  music.addEventListener('click', () => { unlock(); if (MUSIC.playing) stopMusic(); else playMusic(MENU_SONG, 'chill'); music.textContent = MUSIC.playing ? '■ music' : '▶ menu music'; });
  const raceMusic = el('button', {textContent: '▶ race music'});
  raceMusic.addEventListener('click', () => { unlock(); if (MUSIC.playing) stopMusic(); else playMusic(RACE_PLAYLIST[0], 'dark-drums'); raceMusic.textContent = MUSIC.playing ? '■ music' : '▶ race music'; });
  const report = el('pre'); report.style.margin = '0';
  const measure = el('button', {textContent: 'measure'});
  measure.addEventListener('click', async () => {
    unlock();
    const rows = await sfxMeasure();
    report.textContent = rows.map(r => `${r.id.padEnd(11)} ${r.kind.padEnd(6)} ${String(r.dur).padStart(5)}s  peak ${String(r.peak).padStart(6)}  rms ${String(r.rms).padStart(6)}`).join('\n');
  });
  box.append(row(...vol('music', 'music'), ...vol('sfx', 'sfx'), el('span', {textContent: 'pan'}), pan),
    row(music, raceMusic, measure), report);
  document.body.appendChild(box);
})();
