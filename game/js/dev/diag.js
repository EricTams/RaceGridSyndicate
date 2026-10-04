// Diagnostics overlay for devices we can't inspect (phones): open game/?diag. A small panel shows the frame rate,
// the slowest frame, how many sim seconds pass per real second, the session clock, the audio state, WebGL context
// losses and any errors. Each finished session adds a line: how long it took on the sim clock and in real time.
'use strict';

(() => {
  if (!new URLSearchParams(location.search).has('diag')) return;
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;left:4px;top:4px;z-index:9999;margin:0;padding:4px 6px;background:rgba(0,0,0,.8);color:#7f7;' +
    'font:11px/1.25 monospace;pointer-events:none;white-space:pre-wrap;max-width:calc(100vw - 8px)';
  document.body.append(el);
  const errs = [], ends = [];
  addEventListener('error', e => errs.push((e.message || 'error') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  addEventListener('unhandledrejection', e => errs.push('promise: ' + (e.reason && e.reason.message || e.reason)));
  let losses = 0; glCanvas.addEventListener('webglcontextlost', () => losses++);
  let frames = 0, worst = 0, prev = performance.now(), simPrev = race.t, wall0 = performance.now(), fps = 0, rate = 0, worstShown = 0;
  let sess = null, wasOver = race.over;
  (function tick(now) {
    frames++; worst = Math.max(worst, now - prev); prev = now;
    // a session starts when the clock is reset, and ends when it's over
    const key = race.mode + (race.over ? ':over' : '');
    if (!sess && !race.over && race.ready) sess = {mode: race.mode, wall: now, t: race.t};
    if (sess && race.over && !wasOver) { ends.unshift(`${sess.mode}: ${(race.t - sess.t).toFixed(0)}s sim in ${((now - sess.wall) / 1000).toFixed(1)}s real`); ends.length = Math.min(ends.length, 4); sess = null; }
    if (sess && race.t < sess.t - 1) sess = null;   // reset mid-session
    wasOver = race.over;
    if (now - wall0 >= 1000) {
      const s = (now - wall0) / 1000;
      fps = frames / s; rate = (race.t - simPrev) / s; worstShown = worst;
      frames = 0; worst = 0; wall0 = now; simPrev = race.t;
      const ctx = typeof AUDIO !== 'undefined' && AUDIO.ctx;
      el.textContent = [
        `fps ${fps.toFixed(0)}  worst ${worstShown.toFixed(0)}ms  sim ${rate.toFixed(2)}s/s  speed ${ui.speed}x${ui.paused ? ' PAUSED' : ''}`,
        `${key} t ${race.t.toFixed(1)}  ready ${race.ready}  screen ${[...document.querySelectorAll('.result:not([hidden])')].map(e => e.id).join(',') || 'track'}`,
        `audio ${ctx ? ctx.state : 'none'}  music ${typeof MUSIC !== 'undefined' && MUSIC.playing ? 'on' : 'off'}  gl lost ${losses}  hidden ${document.hidden}`,
        ...ends, ...errs.slice(-4).map(e => 'ERR ' + e),
      ].join('\n');
    }
    requestAnimationFrame(tick);
  })(performance.now());
})();
