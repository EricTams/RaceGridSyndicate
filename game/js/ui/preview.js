// Track preview: every race weekend opens on the circuit itself, before the Night Tune, so you see where you're
// racing before you tune for it. It's the race view with a small info card where the timing tower sits, not an
// office screen: the race canvas stays visible (WebGL must never draw into a canvas hidden by office screens).
'use strict';

// What a track or night does for your drivers' abilities (tags come from the track's shape, see loadTrack).
const TAG_ABILITY={tight:'streetrat',straights:'boulevard'},WEATHER_ABILITY={rain:'raindancer',blackout:'tunnel'};
const TAG_LABEL={tight:'TIGHT CORNERS',straights:'LONG STRAIGHTS'};

function openTrackPreview(then){
  prepRaceTrack();resetRace();race.ready=false;setView('full');
  ui.preview=true;document.body.classList.add('previewing');
  const w=WEATHER[weatherId()],wid=weatherId();
  const perks=mine.flatMap(c=>[...TRACK.tags.map(t=>TAG_ABILITY[t]),WEATHER_ABILITY[wid]].filter(id=>id&&has(c,id))
    .map(id=>`<li><b>${c.name}</b> · ${ABILITIES[id].label}</li>`));
  const box=$('trackPreview');
  box.innerHTML=`<p class="tp-kick">SEASON ${league.season} · RACE ${league.race} OF ${racesThisSeason()}</p>
    <h2>${TRACK.name.toUpperCase()}</h2>
    <p class="tp-sub">Inspired by ${TRACK.inspired} · ${LAPS} laps</p>
    <dl>
      <dt>TRACK</dt><dd>${TRACK.tags.map(t=>TAG_LABEL[t]||t.toUpperCase()).join(' · ')||'BALANCED'}</dd>
      <dt>NIGHT</dt><dd>${w.label}${wid==='clear'?'':`<span class="tp-tip">${w.tip.replace(/^[^:]*: /,'')}</span>`}</dd>
    </dl>
    ${perks.length?`<p class="tp-h">WORKS FOR YOU HERE</p><ul>${perks.join('')}</ul>`:''}
    <button id="tpGo" title="Enter">TO THE NIGHT TUNE</button>`;
  box.hidden=false;
  let gone=false;
  const go=()=>{if(gone)return;gone=true;removeEventListener('keydown',key);box.hidden=true;ui.preview=false;document.body.classList.remove('previewing');then();};
  const key=e=>{if(e.key==='Enter'){e.preventDefault();go();}};
  $('tpGo').addEventListener('click',go);addEventListener('keydown',key);
}
// A race weekend: the track preview, then the Night Tune.
function startWeekend(){openTrackPreview(startNightTune);}
