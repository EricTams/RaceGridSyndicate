// Buttons, keyboard, picture-in-picture clicks and stage resizing.
'use strict';

// Debug controls (race length, restart) only show with ?dev in the URL.
if(new URLSearchParams(location.search).has('dev'))document.body.classList.add('dev');
function setView(k){ui.view=k;['full','c1','c2'].forEach(x=>$('v-'+x).setAttribute('aria-pressed',String(x===k)));}
function setLaps(n){LAPS_PRESET=n;LAPS=lapsFor();[4,6,10,15].forEach(x=>$('l'+x).setAttribute('aria-pressed',String(x===n)));resetRace();}
[4,6,10,15].forEach(n=>$('l'+n).addEventListener('click',()=>setLaps(n)));
function setSpeed(n){ui.speed=n;[1,2,4].forEach(x=>$('s'+x).setAttribute('aria-pressed',String(x===n)));}
function togglePip(){ui.pip=!ui.pip;$('pip').setAttribute('aria-pressed',String(ui.pip));}
function setPaused(v){ui.paused=v;$('pause').setAttribute('aria-pressed',String(v));}
function togglePause(){setPaused(!ui.paused);}
['full','c1','c2'].forEach(k=>$('v-'+k).addEventListener('click',()=>setView(k)));
[1,2,4].forEach(n=>$('s'+n).addEventListener('click',()=>setSpeed(n)));
$('pip').addEventListener('click',togglePip);$('pause').addEventListener('click',togglePause);
$('restart').addEventListener('click',resetRace);
addEventListener('keydown',e=>{
  if(e.target.closest&&e.target.closest('button')&&e.key===' ')return;
  if(e.key==='1')setView('full');else if(e.key==='2')setView('c1');else if(e.key==='3')setView('c2');
  else if(e.key==='p'||e.key==='P')togglePip();else if(e.key===' '){e.preventDefault();togglePause();}
});
ov.addEventListener('click',e=>{
  const r=ov.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H;
  const hit=layout().find(v=>!v.main&&x>=v.x&&x<v.x+v.w&&y>=v.y&&y<v.y+v.h);if(hit)setView(hit.key);
});

// The stage's frame (outline + drop shadow) needs 3px on the top/left and 7px on the bottom/right.
const FRAME_TL=0,FRAME_BR=0;   // the track runs edge to edge
function resize(){
  const box=$('box'),fill=getComputedStyle($('wrap')).getPropertyValue('--fill').trim()==='1';
  if(!box.clientWidth)return;   // hidden behind an office screen
  const bw=box.clientWidth-FRAME_TL-FRAME_BR;
  let bh;
  if(fill){box.style.height='';bh=box.clientHeight-FRAME_TL-FRAME_BR;}else bh=Math.round(bw*9/16);
  // Keep the internal render near 560x360 or smaller so pixels stay chunky at any window size.
  PX=Math.max(1,Math.ceil(Math.max(bw/560,bh/360)));
  const nW=Math.max(160,Math.floor(bw/PX)),nH=Math.max(90,Math.floor(bh/PX));
  if(!fill)box.style.height=nH*PX+FRAME_TL+FRAME_BR+'px';
  const st=$('stage');
  st.style.left=FRAME_TL+Math.floor((bw-nW*PX)/2)+'px';st.style.top=FRAME_TL+Math.floor((bh-nH*PX)/2)+'px';
  if(nW===W&&nH===H&&glCanvas.style.width===nW*PX+'px')return;
  W=nW;H=nH;
  renderer.setSize(W,H,false);ov.width=W;ov.height=H;
  for(const el of[glCanvas,ov,st]){el.style.width=W*PX+'px';el.style.height=H*PX+'px';}
}
new ResizeObserver(resize).observe($('box'));addEventListener('resize',resize);resize();
