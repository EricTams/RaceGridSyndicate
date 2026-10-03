// Showcase: your car turning on a display stand, for the office screens where the car is built (the new car and the
// design meeting). It has its own small WebGL canvas and renderer: the race canvas is hidden behind the office screens
// and must never be drawn into (that crashes Chrome's GPU process), and this one only draws while its screen is open.
// Like the race view it renders small and is scaled up with hard pixels. One canvas, made once and moved into
// whichever screen shows it.
'use strict';

const SHOW={W:160,H:90,renderer:null,scene:null,cam:null,car:null,canvas:null,raf:0,last:0,flash:0};
function showcaseInit(){
  const canvas=document.createElement('canvas');canvas.width=SHOW.W;canvas.height=SHOW.H;
  const r=new THREE.WebGLRenderer({canvas,antialias:false});r.setPixelRatio(1);r.setSize(SHOW.W,SHOW.H,false);r.setClearColor(0x120a24,1);
  const s=new THREE.Scene();
  // the stand: a dark disc with a neon rim
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(2.0,2.2,0.25,24),litMat('#2a1f45',0.2));disc.position.y=-0.13;s.add(disc);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(2.1,0.05,4,48),emitMat('#ff2e88'));rim.rotation.x=Math.PI/2;s.add(rim);
  // your car, built like the race cars (shared parts, its own paint), off the race scene; no headlight beams
  const car=buildCar(TEAMS[0]);scene.remove(car.root);s.add(car.root);
  car.root.traverse(o=>{if(o.material===coneMat)o.visible=false;});
  // a low three-quarter view, framed on the car
  const cam=new THREE.OrthographicCamera(-1,1,1,-1,0.1,100),pitch=THREE.MathUtils.degToRad(22),half=3.1;
  cam.position.set(0,Math.sin(pitch)*20,Math.cos(pitch)*20);cam.lookAt(0,0.4,0);
  Object.assign(cam,{left:-half,right:half,top:half*SHOW.H/SHOW.W,bottom:-half*SHOW.H/SHOW.W});cam.updateProjectionMatrix();
  // outlines about a pixel thick, as in the race view
  const p=2*half/SHOW.W/CAR_SCALE;car.outlines.forEach(o=>o.h.scale.set(1+2*p/o.dx,1+2*p/o.dy,1+2*p/o.dz));
  Object.assign(SHOW,{renderer:r,scene:s,cam,car,canvas});
}
// Put the turning car into host (an element on an office screen). It keeps turning until that screen closes.
function showcase(host){
  if(!SHOW.renderer)showcaseInit();
  host.appendChild(SHOW.canvas);
  if(!SHOW.raf){SHOW.last=performance.now();SHOW.raf=requestAnimationFrame(showcaseFrame);}
}
// A design-meeting pick lands: the car flashes.
function showcaseFlash(){SHOW.flash=1;}
function showcaseFrame(now){
  const scr=SHOW.canvas.closest('.result');
  if(!SHOW.canvas.isConnected||!scr||scr.hidden){SHOW.raf=0;return;}   // its screen closed: stop drawing
  const dt=Math.min(0.05,(now-SHOW.last)/1000),{car}=SHOW,me=TEAMS[0];SHOW.last=now;
  car.root.rotation.y+=dt*0.7;
  SHOW.flash=Math.max(0,SHOW.flash-dt*2.5);
  car.body.uniforms.uColor.value.set(me.body);car.trim.uniforms.uColor.value.set(mainColor()||me.trim);   // your colours, and the season sponsor's
  car.body.uniforms.uFlash.value=car.trim.uniforms.uFlash.value=SHOW.flash*0.8;
  SHOW.renderer.render(SHOW.scene,SHOW.cam);
  SHOW.raf=requestAnimationFrame(showcaseFrame);
}
