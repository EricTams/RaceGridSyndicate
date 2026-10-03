// Track viewer: flips through every circuit in the full-track view, for checking shapes and scenery.
// Open game/?tracks to show each track for a second (game/?tracks=3 for 3 seconds each). Add &only=london,chicago
// to cycle just those tracks (by id). Add &drive (or &drive=N) to race the field live on each track and move on once
// the leader has done N laps (default 1), for watching how cars take the corners.
// Keys: left/right step, space pauses. The start screens are skipped; no race runs unless &drive.
'use strict';

(() => {
  const q = new URLSearchParams(location.search);
  if (!q.has('tracks')) return;
  const drive = q.has('drive') ? (+q.get('drive') || 1) : 0;
  const secs = +q.get('tracks') || 1, only = (q.get('only') || '').split(',').filter(Boolean);
  const list = only.length ? TRACKS.filter(t => only.includes(t.id)) : TRACKS;
  let k = 0, paused = false, timer = null;
  const label = document.createElement('div');
  Object.assign(label.style, {position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
    padding: '4px 10px', background: 'rgba(10,8,20,0.85)', border: '1px solid #ffd23f', color: '#ffd23f',
    font: '12px monospace', whiteSpace: 'nowrap'});
  document.body.appendChild(label);

  function show(i) {
    k = (i + list.length) % list.length;
    const t = list[k];
    document.querySelectorAll('[id$=Ov]').forEach(e => e.hidden = true);
    loadTrack(t); race.grid = null; resetRace(); setView('full');
    if (drive) { race.ready = true; setPaused(paused); }   // lights out after the usual countdown
    const tiers = t.tiers.map(n => TIER_NAMES[n].split(' ')[0]).join(' + ');
    label.textContent = `${k + 1}/${list.length}  ${t.name}  ·  from ${t.inspired}  ·  ${tiers}${drive ? `  ·  ${drive} lap${drive > 1 ? 's' : ''}` : ''}${paused ? '  ·  PAUSED' : ''}`;
  }
  // Timed flips, or with &drive the next track once the leader has done its laps (or everyone is out).
  function tick() { if (!paused && (!drive || race.over || leader().d >= drive * L)) show(k + 1); }

  addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') show(k + 1);
    else if (e.key === 'ArrowLeft') show(k - 1);
    else if (e.key === ' ') { paused = !paused; show(k); }
    else return;
    e.preventDefault();
    clearInterval(timer); timer = setInterval(tick, drive ? 250 : secs * 1000);   // a step restarts the clock
  });
  show(0);
  timer = setInterval(tick, drive ? 250 : secs * 1000);
})();
