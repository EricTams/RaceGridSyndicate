// WebGL renderer, isometric orthographic camera and pixel-snapped placement.
'use strict';

const glCanvas=$('gl'),ov=$('ov'),og=ov.getContext('2d');
// If Chrome won't give us WebGL (usually after its GPU process crashed a few times), say so plainly instead of
// letting every later script fail on a missing renderer.
const renderer=(()=>{try{return new THREE.WebGLRenderer({canvas:glCanvas,antialias:false});}catch(e){
  document.body.insertAdjacentHTML('afterbegin','<div style="position:fixed;inset:0;z-index:999;display:grid;place-items:center;background:#0b0716;color:#f4ecff;font:22px VT323,monospace;text-align:center;padding:16px">3D graphics are unavailable in this browser session.<br>Quit and reopen Chrome (⌘Q), then load the game again.</div>');
  throw e;}})();
renderer.setPixelRatio(1);renderer.setScissorTest(true);
// Context-loss recorder: each loss (and restore) is logged with what was going on, and kept in localStorage under
// 'glLosses' so it survives a reload. Recent resizes are noted too (a resized canvas reallocates its GPU buffers).
{const resizes=[],t0=Date.now(),note=kind=>{const m=renderer.info.memory,e={kind,at:new Date().toTimeString().slice(0,8),up:Math.round((Date.now()-t0)/1000)+'s',
    where:window.autoplayProgress||(typeof league!=='undefined'?`season ${league.season}, race ${league.race}`:''),track:typeof TRACK!=='undefined'&&TRACK?TRACK.name:'',
    geo:m.geometries,tex:m.textures,canvas:`${glCanvas.width}x${glCanvas.height}`,dpr:devicePixelRatio,hidden:document.hidden,
    // what the game was doing: session, race clock, screen open, sim speed
    phase:typeof race!=='undefined'?`${race.mode} t${Math.round(race.t)}${race.over?' over':''}${race.ready?'':' notready'}`:'',
    screen:[...document.querySelectorAll('.result')].filter(e=>!e.hidden).map(e=>e.id==='result'?'garage:'+garageTab:e.id).join(',')||'track',
    speed:typeof ui!=='undefined'?`${ui.speed}x${ui.paused?' paused':''} view ${ui.view}`:'',
    resizes:resizes.filter(r=>Date.now()-r.t<60000).map(r=>r.s)};
    console.warn('[glLoss]',JSON.stringify(e));
    try{const all=JSON.parse(localStorage.getItem('glLosses')||'[]');all.push(e);localStorage.setItem('glLosses',JSON.stringify(all.slice(-50)));}catch{}};
  addEventListener('resize',()=>resizes.push({t:Date.now(),s:`${innerWidth}x${innerHeight}@${devicePixelRatio}`}));
  glCanvas.addEventListener('webglcontextlost',()=>note('lost'));glCanvas.addEventListener('webglcontextrestored',()=>note('restored'));}
const scene=new THREE.Scene();
const PITCH=THREE.MathUtils.degToRad(30),YAW=THREE.MathUtils.degToRad(45);
const DIR=new THREE.Vector3(Math.cos(PITCH)*Math.sin(YAW),Math.sin(PITCH),Math.cos(PITCH)*Math.cos(YAW));
const cam=new THREE.OrthographicCamera(-1,1,1,-1,0.1,1400);
cam.position.copy(DIR);cam.lookAt(0,0,0);cam.updateMatrixWorld();
const RIGHT=new THREE.Vector3(1,0,0).applyQuaternion(cam.quaternion);
const UP=new THREE.Vector3(0,1,0).applyQuaternion(cam.quaternion);
// Place the camera so (R,U) in screen-basis is centred, snapped to whole pixels to stop shimmer.
function setCam(R,U,halfH,vw,vh){
  const s=2*halfH/vh;
  // lights out: the view shakes for a moment as the field launches
  if(typeof race!=='undefined'&&race.mode==='race'&&race.t>=0&&race.t<0.4){const k=(0.4-race.t)/0.4*3*s;R+=(Math.random()-0.5)*2*k;U+=(Math.random()-0.5)*2*k;}
  EDGE_W.value=Math.max(0.45,2.2*s);   // world units per pixel, doubled for the tilted ground
  R=Math.round(R/s)*s;U=Math.round(U/s)*s;
  const halfW=halfH*vw/vh;
  cam.left=-halfW;cam.right=halfW;cam.top=halfH;cam.bottom=-halfH;cam.updateProjectionMatrix();
  cam.position.copy(RIGHT).multiplyScalar(R).addScaledVector(UP,U).addScaledVector(DIR,600);
  cam.updateMatrixWorld();
  return s;
}
