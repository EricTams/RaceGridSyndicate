// Music sandbox: open game/?music to audition songs on the synth without starting a career.
// game/?music=mountainking picks a song by id, &style=darksynth a style (audio/styles.js), switchable live. Enter plays/stops. The panel sets intensity, tempo, the
// accelerando and per-layer mutes; "log" prints the current settings to the console for copying into the song.
'use strict';

(() => {
  const q = new URLSearchParams(location.search);
  if (!q.has('music')) return;
  const ids = Object.keys(SONGS);
  MUSIC.intensity = 1;   // start with every layer in, so each style is heard whole
  let id = SONGS[q.get('music')] ? q.get('music') : ids[0];
  document.querySelectorAll('[id$=Ov]').forEach(e => e.hidden = true);
  $('result').hidden = true;

  const box = document.createElement('div');
  Object.assign(box.style, {position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
    padding: '6px 10px', background: 'rgba(10,8,20,0.92)', border: '1px solid #ffd23f', color: '#ffd23f',
    font: '12px monospace', display: 'grid', gap: '4px', minWidth: '320px'});
  const row = (...kids) => { const r = document.createElement('div'); Object.assign(r.style, {display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap'}); r.append(...kids); return r; };
  const el = (tag, props) => Object.assign(document.createElement(tag), props);
  const slider = (label, min, max, stepv, val, on) => {
    const out = el('span', {textContent: val}), s = el('input', {type: 'range', min, max, step: stepv, value: val});
    s.style.flex = '1';
    s.addEventListener('input', () => { out.textContent = s.value; on(+s.value); });
    return row(el('span', {textContent: label}), s, out);
  };

  const pick = el('select');
  for (const k of ids) pick.append(el('option', {value: k, textContent: SONGS[k].name, selected: k === id}));
  pick.addEventListener('change', () => { id = pick.value; if (MUSIC.playing) playMusic(id, style); });
  const styleIds = Object.keys(STYLES);
  let style = STYLES[q.get('style')] ? q.get('style') : styleIds[0];
  const stylePick = el('select');
  for (const k of styleIds) stylePick.append(el('option', {value: k, textContent: STYLES[k].name, selected: k === style}));
  stylePick.addEventListener('change', () => { style = stylePick.value; if (MUSIC.playing) setStyle(style); });   // switches live, keeps the place
  const play = el('button', {textContent: '▶ play'});
  const toggle = () => { if (MUSIC.playing) stopMusic(); else playMusic(id, style); play.textContent = MUSIC.playing ? '■ stop' : '▶ play'; };
  play.addEventListener('click', toggle);
  const restart = el('button', {textContent: '⏮'});
  restart.addEventListener('click', () => { playMusic(id, style); play.textContent = '■ stop'; });
  const log = el('button', {textContent: 'log'});
  log.addEventListener('click', () => console.log('[music]', JSON.stringify({song: id, style, intensity: MUSIC.intensity,
    bpm: Math.round(MUSIC.style ? MUSIC.style.bpm * MUSIC.bpmScale : 0), accel: MUSIC.accel, mute: MUSIC.mute})));
  const pos = el('span');

  const mutes = row(el('span', {textContent: 'layers'}), ...LAYERS.map(k => {
    const c = el('input', {type: 'checkbox', checked: true});
    c.addEventListener('change', () => { MUSIC.mute[k] = !c.checked; applyMix(0.1); });
    const l = el('label'); l.style.cssText = 'display:flex;gap:2px;align-items:center'; l.append(c, k);
    return l;
  }));

  box.append(
    row(pick, stylePick, play, restart, log, pos),
    slider('intensity', 0, 1, 0.05, MUSIC.intensity, v => setIntensity(v)),
    slider('tempo ×', 0.6, 1.4, 0.05, 1, v => MUSIC.bpmScale = v),
    slider('accel', 0, 0.4, 0.02, MUSIC.accel, v => MUSIC.accel = v),
    mutes);
  document.body.appendChild(box);

  addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); toggle(); } });
  setInterval(() => {
    pos.textContent = MUSIC.playing ? `bar ${1 + (MUSIC.step >> 4)}/${MUSIC.song.steps >> 4} · ${Math.round(musicBpm())} bpm` : '';
  }, 200);
})();
