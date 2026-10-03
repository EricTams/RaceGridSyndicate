// Camera views, picture-in-picture, labels, HUD and the render pass.
'use strict';

const ui={view:'full',pip:false,speed:1,paused:false,preview:false};
let W=480,H=270,PX=2;
const VIEW_LABEL={full:'DRONE: FULL TRACK',get c1(){return `CAM 1: ${mine[0].name}`;},get c2(){return `CAM 2: ${mine[1].name}`;}};
const follow={};
function layout(){
  const views=[{key:ui.view,x:0,y:0,w:W,h:H,main:true}];
  if(ui.pip){
    const pw=Math.round(W*0.28),ph=Math.round(pw*0.62);
    ['full','c1','c2'].filter(k=>k!==ui.view).forEach((k,n)=>views.push({key:k,x:4,y:4+n*(ph+5),w:pw,h:ph,main:false}));
  }
  return views;
}
function setupView(v,dt){
  if(v.key==='full'){
    const pip=ui.pip&&v.main;
    // Keep the circuit clear of the standings box and car widget floating on the left (full-bleed layout).
    const left=innerWidth>=760?Math.ceil((ui.preview?280:225)/PX):4;   // (the track preview's card is a bit wider)
    const safe=pip?[Math.max(left,Math.round(W*0.28)+10),4,v.w-4,v.h-4]:[left,4,v.w-4,v.h-4];
    const s=Math.max((FIT.maxR-FIT.minR)/(safe[2]-safe[0]),(FIT.maxU-FIT.minU)/(safe[3]-safe[1]))*1.04;
    const cx=(safe[0]+safe[2])/2,cy=(safe[1]+safe[3])/2;
    return setCam((FIT.minR+FIT.maxR)/2-(cx-v.w/2)*s,(FIT.minU+FIT.maxU)/2+(cy-v.h/2)*s,s*v.h/2,v.w,v.h);
  }
  const c=v.key==='c1'?cars[0]:cars[1],id=v.key+(v.main?'m':'p');
  const R=c.pos.dot(RIGHT),U=c.pos.dot(UP)+1;
  const f=follow[id]||(follow[id]={R,U});
  const k=1-Math.exp(-8*dt);f.R+=(R-f.R)*k;f.U+=(U-f.U)*k;
  return setCam(f.R,f.U,v.main?15:10,v.w,v.h);
}
function durCol(d){return d>60?'#5cff8a':d>30?'#ffb03a':'#ff3b3b';}
const proj=new THREE.Vector3();
function drawLabels(v,order,now){
  og.save();og.beginPath();og.rect(v.x,v.y,v.w,v.h);og.clip();
  const lift=v.key==='full'?11:(v.main?30:20),taken=[];
  // Only your cars carry a label; rivals are identified in the timing tower.
  for(const c of order.filter(c=>c.you)){
    proj.copy(c.pos).setY(0.85*CAR_SCALE).project(cam);
    const sx=Math.round(v.x+(proj.x+1)/2*v.w),sy=Math.round(v.y+(1-proj.y)/2*v.h)-lift;
    const label=c.state==='wreck'?'X':String(order.indexOf(c)+1),tw=textW(label),w=tw+4,x=sx-(w>>1);
    const box=[x-1,sy-1,x+w+1,sy+(c.you?14:10)];
    if(!c.you&&taken.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1])){
      // No room: mark the car with a single team-colour pixel instead.
      og.fillStyle=c.team.body;og.fillRect(sx,sy+lift-4,1,1);continue;
    }
    taken.push(box);
    if(c.you){og.fillStyle='#c8fdff';og.fillRect(x-1,sy-1,w+2,11);}
    og.fillStyle=c.flash>0.3?'#ffffff':c.state==='wreck'?'#3a2a36':c.team.body;og.fillRect(x,sy,w,7);
    drawText(og,label,x+2,sy+1,'#0b0716');
    og.fillStyle='#1a1230';og.fillRect(x,sy+7,w,2);og.fillStyle=durCol(c.dur);og.fillRect(x,sy+7,Math.max(0,Math.round(w*c.dur/100)),2);
    if(c.you&&Math.floor(now*3)%2===0){og.fillStyle='#c8fdff';og.fillRect(sx-2,sy+11,5,1);og.fillRect(sx-1,sy+12,3,1);og.fillRect(sx,sy+13,1,1);}
  }
  og.restore();
  const t=VIEW_LABEL[v.key];
  if(!v.main){
    og.fillStyle='#2ef2ff';og.fillRect(v.x-1,v.y-1,v.w+2,1);og.fillRect(v.x-1,v.y+v.h,v.w+2,1);og.fillRect(v.x-1,v.y,1,v.h);og.fillRect(v.x+v.w,v.y,1,v.h);
    og.fillStyle='rgba(7,4,15,.8)';og.fillRect(v.x,v.y,textW(t)+5,8);drawText(og,t,v.x+2,v.y+1,'#2ef2ff');
  }
}
// Acid rain: falling pixel streaks; fog: a violet haze over the view.
// Raindrops: each has its own random spot and a fall speed within ±20%, so they scatter instead of lining up.
const RAIN=[];
function drawWeather(v,now){
  const w=weatherId();if(w!=='rain'&&w!=='fog')return;
  og.save();og.beginPath();og.rect(v.x,v.y,v.w,v.h);og.clip();
  if(w==='fog'){og.fillStyle='rgba(120,100,170,.22)';og.fillRect(v.x,v.y,v.w,v.h);}
  else{
    og.fillStyle='rgba(140,255,170,.45)';
    const n=Math.round(v.w*v.h/900),t=now*140;
    while(RAIN.length<n)RAIN.push([Math.random(),Math.random(),0.8+Math.random()*0.4]);
    for(let k=0;k<n;k++){const [rx,ry,sp]=RAIN[k],x=v.x+((rx*v.w+t*0.35*sp)%v.w),y=v.y+((ry*v.h+t*sp)%v.h);og.fillRect(Math.round(x),Math.round(y),1,4);}
  }
  og.restore();
}
function drawHud(now){
  if(ui.preview)return;   // the track preview: just the circuit
  const lead=leader(),lap=Math.min(LAPS,Math.max(1,Math.floor(Math.max(0,lead.d)/L)+1));
  const qLeft=Math.max(0,QUALI_SECONDS-race.t)/QUALI_SECONDS*QUALI_CLOCK;
  const t=race.mode==='quali'?(qLeft>0?`Q ${Math.floor(qLeft/60)}:${String(Math.floor(qLeft%60)).padStart(2,'0')}`:'CHEQUERED'):
    race.over?'FINISH':`LAP ${lap}/${LAPS}`;
  og.fillStyle='rgba(7,4,15,.7)';og.fillRect(W-textW(t,2)-10,4,textW(t,2)+6,14);drawText(og,t,W-textW(t,2)-7,6,'#ffd23f',2);
  if(race.mode==='race'&&race.ready&&race.t<1.2)drawStart(race.t);
  if(race.mode==='race'&&race.winner&&race.t-race.winAt<3.4)drawChequered(race.t-race.winAt);
  if(ui.paused){const p='PAUSED',sc=2;drawText(og,p,Math.round((W-textW(p,sc))/2),8,'#f4ecff',sc);}
}
// ---- the big moments on the overlay: lights out, and the chequered flag ----
const ease=x=>1-Math.pow(1-Math.max(0,Math.min(1,x)),3);
function shadowText(s,x,y,col,sc){drawText(og,s,x+sc,y+sc,'#07040f',sc);drawText(og,s,x,y,col,sc);}
const centreText=(s,y,col,sc)=>shadowText(s,Math.round((W-textW(s,sc))/2),y,col,sc);
// Before the start (race.t from −6.5 after qualifying): a title card slides through, then five red lights come on
// one by one (every 0.6s from −3); at 0 they go out: a white flash, LIGHTS OUT!, and the view shakes (setCam).
function drawStart(t){
  if(t<-3.4){
    const x=Math.round(-W*(1-ease((t+6.5)/0.35))+W*ease((t+3.75)/0.35)),y=Math.round(H/2-44);
    og.fillStyle='rgba(7,4,15,.88)';og.fillRect(x,y,W,88);og.fillStyle='#ffd23f';og.fillRect(x,y,W,2);og.fillRect(x,y+86,W,2);
    const w=WEATHER[weatherId()],me=mine.filter(c=>c.gridPos).map(c=>`${c.name} P${c.gridPos}`).join('   ');
    og.save();og.translate(x,0);
    centreText(`SEASON ${league.season} - RACE ${league.race} OF ${racesThisSeason()}`,y+8,'#ffd23f',2);
    centreText(TRACK.name.toUpperCase(),y+24,'#ff2e88',Math.min(4,Math.floor((W-20)/textW(TRACK.name,1))));
    centreText(`${w.label.toUpperCase()} - ${LAPS} LAPS`,y+52,'#f4ecff',2);
    if(me)centreText(me.toUpperCase(),y+68,'#2ef2ff',2);
    og.restore();return;
  }
  // the gantry
  const n=5,bw=16,gap=6,gw=n*bw+(n+1)*gap,gx=Math.round((W-gw)/2),gy=Math.round(H*0.22),lit=t<0?Math.max(0,Math.min(n,Math.floor((t+3)/0.6)+1)):0;
  if(t<0.9){og.fillStyle='#07040f';og.fillRect(gx,gy,gw,bw+2*gap);og.fillStyle='#3b2a66';og.fillRect(gx,gy,gw,2);
    for(let k=0;k<n;k++){og.fillStyle=k<lit?'#ff2e3a':'#2a0d18';og.fillRect(gx+gap+k*(bw+gap),gy+gap,bw,bw);}}
  if(t>=0){
    if(t<0.25){og.fillStyle=`rgba(255,255,255,${(0.25-t)/0.25*0.7})`;og.fillRect(0,0,W,H);}
    if(Math.floor(t/0.12)%2===0||t>0.5)centreText('LIGHTS OUT!',Math.round(H*0.42),'#5cff8a',Math.min(6,Math.floor(W/60)));
  }
}
// The winner crosses the line: a chequered band wipes across, then who won (pink if it's you).
function drawChequered(t){
  const bh=Math.round(H*0.2),y=Math.round(H/2-bh/2),w=Math.round(W*ease(t/0.45)),sq=6,fade=t>2.9?1-(t-2.9)/0.5:1;
  og.save();og.globalAlpha=Math.max(0,fade);
  for(let yy=0;yy<bh;yy+=sq)for(let xx=0;xx<w;xx+=sq){og.fillStyle=((xx+yy)/sq)%2?'#f4ecff':'#07040f';og.fillRect(xx,y+yy,Math.min(sq,w-xx),Math.min(sq,bh-yy));}
  if(t>0.45){const c=race.winner,you=c.you;
    og.fillStyle='rgba(7,4,15,.85)';og.fillRect(0,y+bh/2-18,W,36);
    centreText('CHEQUERED FLAG',Math.round(y+bh/2-14),'#ffd23f',2);
    centreText(`${c.name} WINS FOR ${c.team.name}`.toUpperCase(),Math.round(y+bh/2+1),you?'#ff2e88':'#f4ecff',Math.min(3,Math.floor((W-20)/textW(`${c.name} WINS FOR ${c.team.name}`,1))));}
  og.restore();
}
function render(dt,now){
  const order=standings();
  og.clearRect(0,0,W,H);
  for(const v of layout()){
    const s=setupView(v,dt),p=s/CAR_SCALE;
    for(const c of cars)for(const o of c.outlines)o.h.scale.set(1+2*p/o.dx,1+2*p/o.dy,1+2*p/o.dz);
    const gy=H-(v.y+v.h);
    renderer.setViewport(v.x,gy,v.w,v.h);renderer.setScissor(v.x,gy,v.w,v.h);
    renderer.setClearColor(0x07040f,1);renderer.render(scene,cam);
    drawWeather(v,now);
    if(!ui.preview)drawLabels(v,order,now);
  }
  drawHud(now);
}
