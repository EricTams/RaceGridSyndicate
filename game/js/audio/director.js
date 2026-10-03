// The music director: picks the song and style for what's happening.
// Songs: the menu song through the new-career screens, then each race weekend gets the next song from the race
// playlist, starting with the first track preview and then whenever NEXT RACE (or END SEASON) is clicked.
// Styles: Chill, except while cars are out on track (qualifying runs or the race), which is Better drums, and from
// the leader's last lap to the end of the race, which is All of the above. Style changes keep the song's place.
// The SOUND button opens the music and SFX volume sliders; M (or MUTE there) silences both. All remembered in this
// browser. Audio can only start after a click or key press.
'use strict';

const MENU_SONG = 'moonlight';
const RACE_PLAYLIST = ['mountainking', 'bachprelude', 'revolutionary', 'dwarfs', 'toccata', 'baldmountain', 'diesirae', 'aase'];
const DIRECTOR = {on: false, muted: false, song: MENU_SONG, style: null, weekends: 0, btn: null};
const store = {   // per-browser conveniences; storage can be missing (private windows), so never rely on it
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// Each weekend takes the next playlist song; the place in the playlist is remembered between visits.
function nextRaceSong() {
  const n = RACE_PLAYLIST.length, k = ((+store.get('rgsMusicNext') || 0) % n + n) % n;
  store.set('rgsMusicNext', String(k + 1));
  return RACE_PLAYLIST[k];
}
function newWeekend() { DIRECTOR.weekends++; DIRECTOR.song = nextRaceSong(); directMusic(true); }

function musicStyle() {
  if (officeOpen()) return 'chill';
  if (race.mode === 'quali') return !race.over && cars.some(c => c.qMode && c.qMode !== 'garage') ? 'dark-drums' : 'chill';
  if (!race.ready || race.t < 0) return 'chill';
  if (race.over || leader().d >= (LAPS - 1) * L) return 'dark-all';   // last lap, then the flag playing out
  return 'dark-drums';
}

const musicOff = () => DIRECTOR.muted || AUDIO.vol.music <= 0;
function directMusic(newSong) {
  if (!DIRECTOR.on || musicOff()) return;
  const style = musicStyle();
  if (newSong === true || !MUSIC.playing) { DIRECTOR.style = style; playMusic(DIRECTOR.song, style); }
  else if (style !== DIRECTOR.style) { DIRECTOR.style = style; setStyle(style); }
}

function setMuted(m) {
  DIRECTOR.muted = m; store.set('rgsMuted', m ? '1' : '0');
  syncAudioUi();
  if (m) stopMusic(); else directMusic();   // unmuting plays the current song again
}
function setVolume(kind, v) {
  const wasOff = musicOff();
  AUDIO.vol[kind] = v; store.set(kind === 'music' ? 'rgsVolMusic' : 'rgsVolSfx', String(Math.round(v * 100)));
  applyVolumes();
  if (kind === 'music' && musicOff() !== wasOff) { if (musicOff()) stopMusic(); else directMusic(); }
  syncAudioUi();
}
function syncAudioUi() {
  const b = DIRECTOR.btn; if (!b) return;
  b.textContent = DIRECTOR.muted ? 'MUTED' : 'SOUND'; b.classList.toggle('off', DIRECTOR.muted);
  const pop = DIRECTOR.pop;
  pop.querySelector('[data-mute]').setAttribute('aria-pressed', String(DIRECTOR.muted));
  for (const k of ['music', 'sfx']) {
    pop.querySelector(`[data-vol=${k}]`).value = Math.round(AUDIO.vol[k] * 100);
    pop.querySelector(`[data-out=${k}]`).textContent = Math.round(AUDIO.vol[k] * 100);
  }
}

(() => {
  const q = new URLSearchParams(location.search);
  if (['music', 'sfx', 'tracks', 'bake'].some(k => q.has(k)) || q.has('autoplay') && !q.has('watch')) return;   // dev pages run their own way (a watched autoplay gets sound)
  const num = (k, d) => { const v = store.get(k); return v == null || isNaN(+v) ? d : Math.max(0, Math.min(100, +v)) / 100; };
  AUDIO.vol.music = num('rgsVolMusic', 1); AUDIO.vol.sfx = num('rgsVolSfx', 1);
  DIRECTOR.muted = (store.get('rgsMuted') ?? store.get('rgsMusicMuted')) === '1';   // (rgsMusicMuted: the old music-only switch)
  const btn = DIRECTOR.btn = document.createElement('button');
  btn.id = 'audioBtn'; btn.title = 'Music and sound volume (M mutes)';
  const pop = DIRECTOR.pop = document.createElement('div');
  pop.id = 'audioPop'; pop.hidden = true;
  pop.innerHTML = ['music', 'sfx'].map(k => `<label><span>${k === 'music' ? 'MUSIC' : 'SFX'}</span><input type="range" min="0" max="100" step="5" data-vol="${k}"><b data-out="${k}"></b></label>`).join('') +
    '<button data-mute title="Mute everything (M)">MUTE</button>';
  document.body.append(pop, btn);
  syncAudioUi();
  const start = () => { if (DIRECTOR.on) return; DIRECTOR.on = true; audioCtx(); sfxLoadSamples(); directMusic(); };
  btn.addEventListener('click', () => { start(); pop.hidden = !pop.hidden; });
  pop.addEventListener('input', e => { const k = e.target.dataset.vol; if (k) { start(); setVolume(k, e.target.value / 100); } });
  pop.querySelector('[data-mute]').addEventListener('click', () => { start(); setMuted(!DIRECTOR.muted); });
  addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) pop.hidden = true; }, true);
  // The first click or key anywhere unlocks audio and starts the music (M toggles mute).
  const isM = e => (e.key === 'm' || e.key === 'M') && !(e.target.closest && e.target.closest('input,textarea,select'));
  addEventListener('pointerdown', e => { if (e.target !== btn) start(); }, true);
  addEventListener('keydown', e => { start(); if (isM(e)) setMuted(!DIRECTOR.muted); });
  // A new weekend: the career's first race weekend (wrapped here, before main.js hands it to the career screens),
  // then every NEXT RACE / END SEASON click.
  const weekend = startWeekend;
  startWeekend = function () { if (!DIRECTOR.weekends) newWeekend(); return weekend.apply(this, arguments); };
  addEventListener('click', e => { if (e.target.closest && e.target.closest('#nextRace:not([disabled])')) newWeekend(); }, true);
  setInterval(directMusic, 250);
})();
