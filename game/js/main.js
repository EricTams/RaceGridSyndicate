// Boot and the main loop.
'use strict';

buildDriverCards();resetRace();openCredits(()=>openStaff(()=>openDraft(()=>openNewCar(()=>openMeeting(()=>openField(()=>openSponsors(()=>openBacker(()=>openSponsors(startWeekend,'race')))))))));   // a new career: the credits, then hire the staff, the driver draft, your first car and its design meeting, the field you'll race, the season sponsor, the Backer, the short-term sponsor, then the race weekend (track preview, Night Tune)
// Autoplay without &watch skips drawing the scene: nobody's looking, and it's most of the CPU (and heat).
const NO_RENDER=(q=>q.has('autoplay')&&!q.has('watch'))(new URLSearchParams(location.search));
let last=performance.now(),panelT=0;
// An office screen hides the whole race view (visibility:hidden, see .office in game.css). Don't draw into the hidden
// canvas meanwhile: Chrome's GPU process crashes (white screen) when a hidden WebGL canvas keeps producing frames.
const officeOpen=()=>!!document.querySelector('#office .result:not([hidden])');
function frame(now){
  const dt=Math.min(0.05,(now-last)/1000);last=now;
  if(!ui.paused&&race.ready){let rem=dt*ui.speed;while(rem>1e-6){const h=Math.min(rem,1/60);stepSim(h);rem-=h;}}
  updateVisuals(ui.paused?0:dt*ui.speed,now/1000);
  if(!NO_RENDER&&!officeOpen())render(dt,now/1000);
  panelT-=dt;if(panelT<=0){panelT=0.2;updatePanels();}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
