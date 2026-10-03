// The circuit on screen: geometry, curvature, pit lane and city hints, rebuilt by loadTrack() for each race.
// Everything here is a `let` so the rest of the game always reads the current track.
'use strict';

// ---- current track state (read everywhere) ----
let TRACK=null,L=0,N=0,DS=0,P=[],T=[],NRM=[],K=[],KA=[],avgLoad=1,WATER=[],EDGE={};
let PIT_IN=0;
const MIN_LAP=460;   // world units: the smallest lap that fits a pit lane on a calm stretch
const PIT_HALF=42,PIT_LEN=2*PIT_HALF,PIT_SPEED=20,FW_Y=5,SPAN=14;
// The pit lane runs on the outside of the start straight: -lateral on counter-clockwise tracks, +lateral on clockwise ones.
let PIT_SIDE=-1,PIT_LAT=-(HW+4.2);
// Slip roads: the entry ramp is the first PIT_RAMP units of the lane, the exit ramp the PIT_RAMP units after it.
// Cars follow pitLatAt exactly while pitting, and the same curve draws the road, so they never leave tarmac.
let PIT_JOIN=-(HW-1.5);const PIT_RAMP=14;   // PIT_JOIN: where on the track a car leaves and rejoins
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const pitLatAt=rel=>rel<PIT_RAMP?PIT_JOIN+(PIT_LAT-PIT_JOIN)*smooth(rel/PIT_RAMP):
  rel<PIT_LEN?PIT_LAT:PIT_LAT+(PIT_JOIN-PIT_LAT)*smooth((rel-PIT_LEN)/PIT_RAMP);
const PIT_PADS=[],occluders=[],glints=[],traffic=[],FOUNTAINS=[],NEON=[];
const FIT={minR:1e9,maxR:-1e9,minU:1e9,maxU:-1e9};
let trackGroup=null,DARK=[],SLOWZ=[],STRAIGHT=[],TRACK_SHAPE={slow:0,straight:0};
const SLOW_K=0.13,STRAIGHT_K=0.02;   // effective curvature: slow corner above, straight below
const SECTOR_MATS=[];
// Tank range and tire life are fixed distances measured in reference laps (CANAL_LAP, the length of the retired
// Canal District), so a longer track needs fewer laps per tank and a twistier one wears tires faster (corner load
// is compared with REF_LOAD, the Canal's average corner load).
let FUEL_PER_UNIT=0,TIRE_PER_UNIT=0;
const REF_LOAD=1.537;
const cornerLoad=i=>1+Math.min(1.5,KA[i]*15);
const GRIP_M=8;   // real-shaped tracks: metres of real track per unit of the sim's cornering (see loadTrack)
const boxRel=(team,slot)=>PIT_HALF+(TEAMS.indexOf(team)-(TEAMS.length-1)/2)*5.2-slot*2.4;
// Race distance: the LAPS buttons pick a length in reference laps; each track converts it.
let LAPS_PRESET=6;
const lapsFor=()=>Math.max(2,Math.round(LAPS_PRESET*CANAL_LAP/L));

// The drawn road edge on one side (sign +1 or -1). Real-shaped tracks have hairpins tighter than the road is wide,
// where the plain offset (centreline + normal * HW) folds back into a little loop; each loop is cut where the edge
// crosses itself, so the inside of the corner draws as one sharp apex. Drawing only: the sim still uses P and NRM.
function clippedEdge(sign){
  const E=P.map((p,i)=>[p.x+NRM[i].x*sign*HW,p.z+NRM[i].z*sign*HW]),W=Math.round(30/DS);
  const cross=(a,b,c,d)=>{const r=[b[0]-a[0],b[1]-a[1]],q=[d[0]-c[0],d[1]-c[1]],den=r[0]*q[1]-r[1]*q[0];if(!den)return null;
    const t=((c[0]-a[0])*q[1]-(c[1]-a[1])*q[0])/den,u=((c[0]-a[0])*r[1]-(c[1]-a[1])*r[0])/den;
    return t>=0&&t<=1&&u>=0&&u<=1?[a[0]+r[0]*t,a[1]+r[1]*t]:null;};
  const cutLoops=()=>{for(let i=0;i<N;i++)for(let j=i+2;j<=i+W;j++){
    const x=cross(E[i],E[mod(i+1,N)],E[mod(j,N)],E[mod(j+1,N)]);
    if(x){for(let k=i+1;k<=j;k++)E[mod(k,N)]=x;i=j-1;break;}
  }};
  cutLoops();
  // A hairpin sharper than a U can instead fold into a spike that never crosses itself: bridge each stretch where
  // the edge runs backwards with a straight line between the good points either side (a flat inside to the hairpin).
  const back=i=>{const a=E[i],b=E[mod(i+1,N)];return (b[0]-a[0])*T[i].x+(b[1]-a[1])*T[i].z<0;};
  for(let i=0;i<N;i++)if(back(i)){
    let b=i;while(b-i<W&&back(mod(b,N)))b++;
    const A=E[i],B=E[mod(b,N)];
    for(let k=i+1;k<b;k++){const f=(k-i)/(b-i);E[mod(k,N)]=[A[0]+(B[0]-A[0])*f,A[1]+(B[1]-A[1])*f];}
    i=b;
  }
  // Round off the inside of tight corners so they draw as a curved kerb, not a hard crease or a thin spike: smooth
  // the edge wherever the corner is tighter than 2 road half-widths on this side (plus a margin either side), cutting
  // any loop the smoothing makes, then smooth the cuts lightly too.
  const tight=new Array(N).fill(false),R=Math.round(6/DS);
  for(let i=0;i<N;i++){let k=0;for(let d=-2;d<=2;d++)k+=K[mod(i+d,N)];k/=5;
    if(k*sign>0&&k*sign*HW>1/2)for(let d=-R;d<=R;d++)tight[mod(i+d,N)]=true;}
  const smooth=passes=>{for(let pass=0;pass<passes;pass++){
    const S=E.map(e=>e.slice());
    for(let i=0;i<N;i++)if(tight[i]){let x=0,z=0;for(let d=-2;d<=2;d++){const e=S[mod(i+d,N)];x+=e[0];z+=e[1];}E[i]=[x/5,z/5];}
  }};
  smooth(30);cutLoops();smooth(6);cutLoops();
  return E;
}
// Where lateral offset o sits at sample i: inside the road it's measured toward the clipped edge, so fills and
// markings stop at the apex too; beyond the road (pit lane, walls) it's the plain offset.
function lateralAt(i,o){
  const p=P[i];
  if(o&&Math.abs(o)<=HW+1e-6){const e=EDGE[o>0?1:-1][i],f=Math.abs(o)/HW;return [p.x+(e[0]-p.x)*f,p.z+(e[1]-p.z)*f];}
  return [p.x+NRM[i].x*o,p.z+NRM[i].z*o];
}
function ribbon(i0,i1,o0,o1,y){
  const pos=[],idx=[],nor=[];let n=0;
  for(let k=i0;k<=i1;k++){const i=mod(k,N),a=lateralAt(i,o0),b=lateralAt(i,o1);
    pos.push(a[0],y,a[1],b[0],y,b[1]);nor.push(0,1,0,0,1,0);
    if(n>0){const a=(n-1)*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}n++;}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setIndex(idx);return g;
}
// A neon edge line along one side of the track (sign +1 or -1), widened inward by the edge shader.
function edgeRibbon(i0,i1,sign){
  const pos=[],inw=[],side=[],idx=[];let n=0;
  const E=EDGE[sign];
  for(let k=i0;k<=i1;k++){const i=mod(k,N),[x,z]=E[i];
    // Widen square to the drawn edge's own direction, toward the road. On a plain edge that's along the normal; at a
    // clipped apex the edge runs its own way (the normal would lie along it and squash the line to nothing).
    let a=i,b=i;const same=(j,q)=>Math.abs(E[j][0]-q[0])+Math.abs(E[j][1]-q[1])<1e-4;
    while(i-a<N&&same(mod(a,N),E[i]))a--;while(b-i<N&&same(mod(b,N),E[i]))b++;
    const ea=E[mod(a,N)],eb=E[mod(b,N)];let dx=-(eb[1]-ea[1]),dz=eb[0]-ea[0];const d=Math.hypot(dx,dz)||1;dx/=d;dz/=d;
    if(dx*-NRM[i].x*sign+dz*-NRM[i].z*sign<0){dx=-dx;dz=-dz;}
    pos.push(x,0.05,z,x,0.05,z);inw.push(dx,0,dz,dx,0,dz);side.push(0,1);
    if(n>0){const a=(n-1)*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}n++;}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('inward',new THREE.Float32BufferAttribute(inw,3));
  g.setAttribute('side',new THREE.Float32BufferAttribute(side,1));g.setIndex(idx);return g;
}
// The start index whose pit window (the lane, its ramps and a margin) turns least and stays clear of other road.
function bestStart(){
  const pre=Math.round((PIT_HALF+8)/DS),post=Math.round((PIT_HALF+PIT_RAMP+8)/DS),lat=(TRACK.pitSide||-1)*(HW+4.2);
  const turning=s=>{let a=0;for(let k=-pre;k<=post;k++)a+=Math.abs(K[mod(s+k,N)])*(1+Math.abs(K[mod(s+k,N)])*20);return a;};
  const clear=s=>{let m=1e9;for(let k=-pre;k<=post;k+=4){const i=mod(s+k,N),q=P[i].clone().addScaledVector(NRM[i],lat);
    for(let j=0;j<N;j+=3){const g=Math.min(Math.abs(j-i),N-Math.abs(j-i));if(g*DS>=40)m=Math.min(m,q.distanceTo(P[j]));}}return m;};
  const cands=[];for(let s=0;s<N;s+=4)cands.push([turning(s),s]);cands.sort((a,b)=>a[0]-b[0]);
  const keep=cands[0][0]*1.001>=turning(0)?[[turning(0),0]]:[];   // stay put if the real start is already the calmest
  for(const [,s] of keep.concat(cands.slice(0,24)))if(clear(s)>=HW+2.2+3)return s;
  return 0;
}
// A road band that follows a lateral path: centre(rel) ± half, for rel from r0 to r1 past the pit entry.
function slipRoad(r0,r1,half,y){
  const pos=[],idx=[],nor=[];let n=0;
  for(let r=r0;r<=r1+1e-6;r+=DS){const i=mod(Math.round((PIT_IN+r)/DS),N),p=P[i],m=NRM[i],o=pitLatAt(r);
    pos.push(p.x+m.x*(o-half),y,p.z+m.z*(o-half),p.x+m.x*(o+half),y,p.z+m.z*(o+half));nor.push(0,1,0,0,1,0);
    if(n>0){const a=(n-1)*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}n++;}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setIndex(idx);return g;
}
// Water here: read from the painted water (once it's painted), else worked out from the features.
function inWater(x,z){
  if(!WATER_MASK)return isWater(WATER,x,z);
  const S=WATER_TEX_HALF*2*WATER_TEX_PX,px=Math.floor((x+WATER_TEX_HALF)*WATER_TEX_PX),pz=Math.floor((z+WATER_TEX_HALF)*WATER_TEX_PX);
  return px>=0&&pz>=0&&px<S&&pz<S&&WATER_MASK[pz*S+px]===1;
}
// A glint somewhere on its water near the circuit (open water, not under land or the road's verge).
function placeGlint(m){const f=m.userData.f;
  for(let t=0;t<60;t++){const x=rand(-260,260),z=rand(-200,200);
    if(inFeature(f,x,z)&&inWater(x,z)&&!nearTrack(x,z,HW+4)){m.position.set(x,-0.27,z);return;}}
  m.visible=false;}
// Where the landmark stands. Its footprint (radius r) stays clear of the road, pits, freeway and water, and it
// sits as near the circuit as that allows, by its rule (def.landmark.place):
//   infield  inside the loop, at the builder's spot (the default; falls back to open if that spot is blocked)
//   water    on the shore, next to the city's water (a riverside wheel, dock cranes); side:'N' etc. keeps it to
//            that side of the circuit (Hong Kong's skyline on Victoria Harbour, not the open sea)
//   point    on a headland, water on most sides (the opera house on Bennelong Point)
//   dry      away from the water (the pyramids, a hilltop statue)
//   open     anywhere clear, as near the road as possible
//   onwater  out over the water, one end on the shore (the suspension bridge; the deck runs along its x)
const LANDMARK_R={capitolio:14,ballpark:14,monas:8,watarun:12,willis:8,usbank:7,onepyramid:14,bigben:8,gateway:8,linkbridge:8,rencen:10,burj:9,rijks:16,lotte:7,liberty:9,brooklyn:8,onewtc:12,gasworks:8,palace:20,lattice:8,skyline:16,mbs:16,pyramid:22,statue:13,suspension:8,shell:14,castle:13,stupa:8,sphere:11,dome:11,wheel:10,supertall:8,spire:7};
const LANDMARK_LONG={skyline:true,mbs:true};   // landmarks laid out along x that should line up with the shore
function placeLandmark(def){
  const saved=savedScenery(def);if(saved&&saved.landmark)return saved.landmark;
  const lm=def.landmark,place=lm.place||'infield',r=(LANDMARK_R[lm.kind]||7)+(lm.hill?5:0);
  const dry=dryPoints(),grid=[];
  const xs=P.map(p=>p.x),zs=P.map(p=>p.z),x0=Math.min(...xs)-45,x1=Math.max(...xs)+45,z0=Math.min(...zs)-45,z1=Math.max(...zs)+45;
  const roadDist=(x,z)=>{let m=1e9;for(const [px,pz] of dry){const d=(px-x)**2+(pz-z)**2;if(d<m)m=d;}return Math.sqrt(m);};
  const fwDist=def.roads&&def.roads.kind==='span'?()=>1e9:freewayDist;   // a bridge carrying the freeway sits on it
  const ring=(x,z,rad)=>{const out=[[x,z]];for(let k=0;k<8;k++){const a=k*Math.PI/4;out.push([x+Math.cos(a)*rad,z+Math.sin(a)*rad]);}return out;};
  const wet=(x,z,rad)=>ring(x,z,rad).some(([a,b])=>inWater(a,b));
  const clear=(x,z)=>roadDist(x,z)>=r+HW+4&&fwDist(x,z)>=r+4;
  if(WATER_ANCHOR)return {x:WATER_ANCHOR[0],z:WATER_ANCHOR[1],rot:WATER_ANCHOR[2]||0};   // pinned by the city's water sketch
  if(place==='onwater')return placeBridge(r,roadDist,fwDist,[x0,x1,z0,z1])||{x:lm.x*TRACK_SCALE,z:lm.z*TRACK_SCALE,rot:0};
  if(place==='span')return placeSpan(roadDist,fwDist,[x0,x1,z0,z1])||placeBridge(r,roadDist,fwDist,[x0,x1,z0,z1])||{x:lm.x*TRACK_SCALE,z:lm.z*TRACK_SCALE,rot:0};
  if(place==='infield'){const x=lm.x*TRACK_SCALE,z=lm.z*TRACK_SCALE;if(clear(x,z)&&!wet(x,z,r))return {x,z,rot:0};}
  const waterNear=(x,z,rad)=>{for(let d=rad;d<=rad+14;d+=4)if(wet(x,z,d))return d;return 1e9;};
  let best=null,bestScore=1e9;
  for(let x=x0;x<=x1;x+=4)for(let z=z0;z<=z1;z+=4){
    if(!clear(x,z)||wet(x,z,r))continue;
    const d=roadDist(x,z);let score=d;
    if(place==='water'){const w=waterNear(x,z,r+2);if(w>1e8)continue;
      if(lm.side){const cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,o=COMPASS[lm.side];
        if((x-cx)*o[0]+(z-cz)*o[1]<0)continue;}   // on the side of the circuit its water is (lm.side)
      score=d*0.5+w;}
    else if(place==='point'){let wet=0;for(let k=0;k<16;k++){const a=k*Math.PI/8;if(inWater(x+Math.cos(a)*(r+8),z+Math.sin(a)*(r+8)))wet++;}
      if(wet<7)continue;score=d*0.4-wet*6;}   // water on most sides; the more the better
    else if(place==='dry')score=d+(waterNear(x,z,r+2)<1e8?60:0);
    if(score<bestScore){bestScore=score;best={x,z,rot:0};}
  }
  // a long landmark (a waterfront skyline) lines up along the shore: its long side square to the way the water lies
  if(best&&LANDMARK_LONG[lm.kind]){let wx=0,wz=0;
    for(let k=0;k<32;k++){const a=k*Math.PI/16;if(inWater(best.x+Math.cos(a)*(r+10),best.z+Math.sin(a)*(r+10))){wx+=Math.cos(a);wz+=Math.sin(a);}}
    if(wx||wz)best.rot=-Math.atan2(wx,-wz);}
  return best||{x:lm.x*TRACK_SCALE,z:lm.z*TRACK_SCALE,rot:0};
}
// A bridge reaching out into the water: its deck (along the landmark's x, 2*34 long) starts on the shore and runs
// out over water, its far end in open water well clear of any land, so it points out into the bay rather than
// along the coast. Clear of the road; the shore end as near the circuit as possible.
function placeBridge(r,roadDist,fwDist,[x0,x1,z0,z1]){
  const L=34;let best=null,bestD=1e9;
  const open=(x,z)=>{for(let k=0;k<8;k++){const a=k*Math.PI/4;if(!inWater(x+Math.cos(a)*20,z+Math.sin(a)*20))return false;}return inWater(x,z);};
  for(let x=x0-40;x<=x1+40;x+=6)for(let z=z0-40;z<=z1+40;z+=6){
    if(inWater(x,z))continue;                                  // (x,z): the shore end, on land
    for(let k=0;k<16;k++){const a=k*Math.PI/8,dx=Math.cos(a),dz=Math.sin(a);
      const pts=[];for(let t=0;t<=2*L;t+=4)pts.push([x+dx*t,z+dz*t]);
      if(pts.some(([a,b])=>roadDist(a,b)<HW+8||fwDist(a,b)<6))continue;
      if(pts.slice(2).some(([a,b])=>!inWater(a,b))||!open(...pts[pts.length-1]))continue;
      const d=roadDist(x,z);if(d<bestD){bestD=d;best={x:x+dx*L,z:z+dz*L,rot:-a};}}
  }
  return best;
}
// A bridge spanning a strait, like the real thing: square across the channel (along the narrowest way over the water
// at that spot), both ends on real land (not an islet), clear of the road and freeways; the nearest such crossing to
// the circuit wins, shorter ones preferred. Returns its middle, heading and half-length.
const SPAN_CLEAR=28;   // how far a spanning bridge keeps from the circuit's centreline
function placeSpan(roadDist,fwDist,[x0,x1,z0,z1]){
  const land=(x,z)=>!inWater(x,z);
  const reach=(x,z,dx,dz)=>{for(let t=0;t<=90;t+=1)if(land(x+dx*t,z+dz*t))return t;return 1e9;};
  let best=null,bestScore=1e9;
  for(let x=x0-80;x<=x1+80;x+=4)for(let z=z0-80;z<=z1+80;z+=4){
    if(land(x,z))continue;
    // the narrowest way across the water here: that's square to the channel
    let a=0,w=1e9;for(let k=0;k<32;k++){const t=k*Math.PI/32,dx=Math.cos(t),dz=Math.sin(t),ww=reach(x,z,dx,dz)+reach(x,z,-dx,dz*-1);if(ww<w){w=ww;a=t;}}
    if(w>130)continue;
    const dx=Math.cos(a),dz=Math.sin(a),f=reach(x,z,dx,dz),b=reach(x,z,-dx,-dz);
    if(Math.abs(f-b)>6)continue;                                   // keep to the middle of the channel
    const L=Math.max(20,w/2+8),cx=x+dx*(f-b)/2,cz=z+dz*(f-b)/2;
    if(!land(cx+dx*(L+24),cz+dz*(L+24))||!land(cx-dx*(L+24),cz-dz*(L+24)))continue;   // real land both ends
    let ok=true;
    for(let t=-L*0.5;t<=L*0.5&&ok;t+=4)for(const o of[-10,10])if(land(cx+dx*t-dz*o,cz+dz*t+dx*o))ok=false;   // a channel, not a shoreline
    // the whole bridge keeps well clear of the circuit: its towers are tall, and in this view they loom over the track
    for(let t=-L-6;t<=L+6&&ok;t+=4){const px=cx+dx*t,pz=cz+dz*t;if(roadDist(px,pz)<SPAN_CLEAR||fwDist(px,pz)<7)ok=false;}
    if(!ok)continue;
    const score=roadDist(cx,cz)+L*0.6;if(score<bestScore){bestScore=score;best={x:cx,z:cz,rot:-a,span:L};}
  }
  return best;
}
function nearTrack(x,z,r){for(let i=0;i<N;i+=2){const dx=P[i].x-x,dz=P[i].z-z;if(dx*dx+dz*dz<r*r)return true;}return false;}
function registerOccluder(group){
  group.updateMatrixWorld(true);
  const o={mats:[],minR:1e9,maxR:-1e9,minU:1e9,maxU:-1e9,maxD:-1e9},v=new THREE.Vector3();
  group.traverse(m=>{
    if(!m.isMesh)return;
    if(m.material.uniforms&&m.material.uniforms.uOpacity&&!o.mats.includes(m.material))o.mats.push(m.material);
    m.geometry.computeBoundingBox();const b=m.geometry.boundingBox;
    for(let c=0;c<8;c++){v.set(c&1?b.max.x:b.min.x,c&2?b.max.y:b.min.y,c&4?b.max.z:b.min.z).applyMatrix4(m.matrixWorld);
      const R=v.dot(RIGHT),U=v.dot(UP),D=v.dot(DIR);
      o.minR=Math.min(o.minR,R);o.maxR=Math.max(o.maxR,R);o.minU=Math.min(o.minU,U);o.maxU=Math.max(o.maxU,U);o.maxD=Math.max(o.maxD,D);}
  });
  occluders.push(o);return o;
}
function recolorPitBoxes(){PIT_PADS.forEach((pad,i)=>pad.material.uniforms.uColor.value.set(new THREE.Color(TEAMS[i]?TEAMS[i].body:'#000').multiplyScalar(0.35)));}

// ---- landmarks: one per track, built from boxes like everything else ----
function buildLandmark(g,lm){
  const m=litMat('#2c2452',0.3),glow=emitMat(lm.color),add=(geo,mat,x,y,z)=>{const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);g.add(o);return o;};
  const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  let top=30;
  if(lm.kind==='tower'){
    add(B(10,3,10),m,0,1.5,0);add(B(7,16,7),m,0,11,0);add(B(5,6,5),m,0,22,0);add(B(0.4,5,0.4),m,0,27.5,0);
    const win=emitMat('#2fb8d6');for(const o of[-2,0,2]){add(B(0.1,13,0.5),win,3.55,11,o);add(B(0.5,13,0.1),win,o,11,3.55);}
    const halo=add(new THREE.TorusGeometry(5.2,0.35,4,16),glow,0,20.5,0);halo.rotation.x=Math.PI/2;
    add(B(0.7,0.7,0.7),emitMat('#ffd23f'),0,30.2,0);
  }else if(lm.kind==='crane'){
    add(B(2,22,2),m,0,11,0);add(B(24,1.2,1.2),m,5,22.5,0);add(B(1,8,0.2),glow,15,18,0);add(B(3,3,3),m,-6,21,0);
    for(let x=-5;x<=17;x+=4)add(B(0.6,0.6,0.6),glow,x,23.4,0);           // warning lights along the jib
    for(let y=3;y<21;y+=4)add(B(2.2,0.3,2.2),glow,0,y,0);                 // lit bands up the mast
    add(B(2.4,2,2.4),emitMat('#ffd23f'),1.5,20.5,0);top=24;
  }else if(lm.kind==='stack'){
    [[0,0,12],[3,-2,10],[-2,3,9],[1,1,8]].forEach(([x,z,w],i)=>{add(B(w,5,w*0.8),m,x,2.5+i*5,z);add(B(w+0.2,0.4,0.2),glow,x,4.5+i*5,z+w*0.4);});top=21;
  }else if(lm.kind==='wheel'){
    add(B(1,12,1),m,-3,6,0);add(B(1,12,1),m,3,6,0);
    const rim=add(new THREE.TorusGeometry(9,0.4,4,20),glow,0,13,0);
    for(let a=0;a<6;a++){const s=add(B(0.3,18,0.3),glow,0,13,0);s.rotation.z=a*Math.PI/6;}
    add(B(1.6,1.6,1.6),emitMat('#ff2e88'),0,13,0);
    top=23;
  }else if(lm.kind==='antenna'){
    add(B(6,4,6),m,0,2,0);add(B(1.2,30,1.2),m,0,19,0);
    for(let y=6;y<34;y+=3)add(B(1.5,0.4,1.5),y%2?glow:emitMat('#f4ecff'),0,y,0);add(B(0.6,0.6,0.6),glow,0,34.5,0);
    for(const y of[12,20,28]){const r=add(new THREE.TorusGeometry(2,0.2,4,12),glow,0,y,0);r.rotation.x=Math.PI/2;}top=35;
  }else if(lm.kind==='lattice'){        // Tokyo: Tokyo Tower, four splayed legs in orange and white bands, two decks
    const ora=emitMat(lm.color),wht=emitMat('#f4ecff'),bands=[[0,9],[9,17],[17,24],[24,30],[30,36],[36,41]];
    const w=y=>6.5*Math.pow(1-y/44,1.6)+0.5;                        // half-width, flaring out to the base
    bands.forEach(([y0,y1],i)=>{for(const [sx,sz] of[[1,1],[1,-1],[-1,1],[-1,-1]])beam(sx*w(y0),y0,sz*w(y0),sx*w(y1),y1,sz*w(y1),0.7,i%2?wht:ora);});
    for(const y of[4,9,17,24])for(const [x0,z0,x1,z1] of[[1,1,1,-1],[1,-1,-1,-1],[-1,-1,-1,1],[-1,1,1,1]])
      beam(x0*w(y),y,z0*w(y),x1*w(y),y,z1*w(y),0.4,ora);            // cross girders
    add(B(5.4,2.2,5.4),m,0,14.5,0);add(B(5.6,0.4,5.6),wht,0,15.8,0);   // main deck
    add(B(2.4,1.6,2.4),m,0,30,0);add(B(2.6,0.3,2.6),wht,0,31,0);       // top deck
    add(B(0.35,8,0.35),ora,0,45,0);add(B(0.7,0.7,0.7),emitMat('#ffd23f'),0,49.2,0);top=49;
  }else if(lm.kind==='palace'){         // Tokyo: the Imperial Palace, white turrets with dark hipped roofs on a stone keep, in
    // wooded grounds, the Nijubashi's double arches running out along +x across the moat (the sketch sizes the moat)
    const stone=litMat('#6b6478',0.3),wall=litMat('#ffffff',0.5),roof=litMat('#26443f',0.4),tree=litMat('#2c5a3c',0.3),gold=emitMat('#ffd23f');
    const hip=(w,d,h,y,x=0,z=0)=>{const o=add(new THREE.CylinderGeometry(0.3,0.72,h,4),roof,x,y,z);o.rotation.y=Math.PI/4;o.scale.set(w,1,d);
      const e=w*0.72*Math.SQRT2/2+0.2,f=d*0.72*Math.SQRT2/2+0.2;        // a hipped roof with a lit eave line
      for(const s of[-1,1]){add(B(2*e,0.25,0.25),glow,x,y-h/2,z+s*f);add(B(0.25,0.25,2*f),glow,x+s*e,y-h/2,z);}};
    add(B(20,3,14),stone,0,1.5,0);
    add(B(10,3.4,6),wall,-3,4.7,-1);hip(12,8.5,2.2,7.5,-3,-1);           // the turret, two tiers
    add(B(6.5,2.6,4),wall,-3,9.9,-1);hip(8.5,6,1.8,12.1,-3,-1);add(B(0.5,0.9,0.5),gold,-3,13.4,-1);
    for(const x of[-6,-3,0])add(B(0.9,0.9,0.1),emitMat('#ffe9a8'),x,4.8,2.05);   // lit windows
    add(B(5,2.6,11),wall,6,4.3,-0.5);hip(7,14,1.6,6.4,6,-0.5);            // the long gate hall
    add(B(10,0.2,4),stone,15,0.1,0);                                     // the path out to the bridge
    add(B(20,0.8,3.6),stone,30,1,0);for(const x of[25,35])add(new THREE.TorusGeometry(2.2,0.4,4,10,Math.PI),stone,x,0.6,0);
    for(const z of[-1.9,1.9])add(B(20,0.5,0.25),glow,30,1.6,z);
    for(let i=0;i<46;i++){const x=((i*37)%47)-23.5,z=((i*29)%47)-23.5;   // the wooded grounds
      if(Math.abs(x)<12&&Math.abs(z)<9||Math.abs(z)<4&&x>0)continue;const h=2+(i%3);add(B(2.6,h,2.6),tree,x,h/2,z);}
    top=14;
  }else if(lm.kind==='gasworks'){       // Seattle: Gas Works Park, the old gasification towers rusting on a grassy point
    const rust=litMat('#9a4a2c',0.35),dark=litMat('#4a2a24',0.3),grass=litMat('#2f6a3e',0.3);
    add(new THREE.CylinderGeometry(7,8,1.2,12),grass,0,0.6,0);                        // the grassy knoll
    [[-2,-1,1.6,13],[1.6,-1.6,1.4,11],[2.2,1.8,1.5,12],[-1.4,2,1.2,9]].forEach(([x,z,r,h])=>{
      add(new THREE.CylinderGeometry(r,r,h,8),rust,x,1.2+h/2,z);add(new THREE.CylinderGeometry(r+0.25,r+0.25,0.3,8),glow,x,1.2+h*0.7,z);});
    beam(-2,9,-1,1.6,8,-1.6,0.35,dark);beam(1.6,8,-1.6,2.2,9,1.8,0.35,dark);beam(2.2,9,1.8,-1.4,7,2,0.35,dark);  // pipes between
    add(B(3,3,3),dark,4.5,2.7,-0.5);top=14;
  }else if(lm.kind==='liberty'){        // New York: the Statue of Liberty, copper green on her granite pedestal inside the
    // star-shaped fort, the torch raised in her right hand
    const granite=litMat('#8a86a8',0.35),copper=litMat('#5fc8a4',0.45),fort=litMat('#6b6478',0.3);
    for(const r of[0,Math.PI/4]){const o=add(B(14,2.2,14),fort,0,1.1,0);o.rotation.y=r;}   // the star fort
    add(B(7,9,7),granite,0,6.7,0);add(B(8,1,8),granite,0,11.6,0);                          // the pedestal
    add(new THREE.CylinderGeometry(1.6,2.8,10,8),copper,0,17.1,0);                         // her robes
    add(B(1.4,2.2,1.3),copper,0,23.2,0);                                                   // shoulders and head
    for(let k=0;k<7;k++){const a=-Math.PI/2+(k-3)*0.32,sp=add(B(0.25,1.6,0.25),copper,Math.sin(a)*0.8,24.6,Math.cos(a)*0.8);sp.rotation.z=Math.sin(a)*0.6;sp.rotation.x=Math.cos(a)*0.6;}
    beam(0.9,22.5,0,1.3,29,0.2,0.7,copper);                                                // the raised arm
    add(B(0.9,1,0.9),emitMat('#ffd23f'),1.35,29.7,0.2);add(B(0.5,0.9,0.5),emitMat('#fff2a8'),1.35,30.6,0.2);   // the torch
    add(B(1.2,1.6,0.4),copper,-1.2,20,0.9);ring(5,12.3);top=31;
  }else if(lm.kind==='brooklyn'){       // New York: the Brooklyn Bridge, granite towers with twin pointed arches, deck along
    // x (2*span long), the main cables and the web of diagonal stays in neon
    const L=lm.span||24,H=lm.h||24,W=3.3,stone=litMat('#b8a58a',0.4),dark=litMat('#1a1430',0.1),cab=emitMat(lm.color);
    if(!lm.carries)add(B(2*L,0.8,6),m,0,5,0);   // when it carries a freeway, the freeway draws the deck
    for(const x of[-L/2,L/2]){add(B(2.2,H,2*W+1.6),stone,x,H/2,0);add(B(2.6,1,2*W+2),stone,x,H+0.2,0);
      for(const z of[-W*0.5,W*0.5]){add(B(2.3,H*0.4,1.2),dark,x,H*0.5,z);}}   // slim towers, each with its twin arches
    const cable=(x0,y0,x1,y1,t=0.25)=>{for(const z of[-W,W]){const c=add(B(Math.hypot(x1-x0,y1-y0),t,t),cab,(x0+x1)/2,(y0+y1)/2,z);c.rotation.z=Math.atan2(y1-y0,x1-x0);}};
    const sag=x=>H-1-(H-7)*(1-(2*x/L)**2);
    for(let x=-L/2;x<L/2-1e-6;x+=L/8)cable(x,sag(x),x+L/8,sag(x+L/8));
    cable(-L,5.5,-L/2,H-1);cable(L/2,H-1,L,5.5);
    const stay=emitMat('#2f7f78'),stays=(x0,y0,x1,y1)=>{for(const z of[-W,W]){const c=add(B(Math.hypot(x1-x0,y1-y0),0.12,0.12),stay,(x0+x1)/2,(y0+y1)/2,z);c.rotation.z=Math.atan2(y1-y0,x1-x0);}};
    for(const sx of[-1,1])for(const dir of[-1,1])stays(sx*L/2,H-3,sx*L/2+dir*L*0.3,5.6);   // the diagonal stays, dim
    top=H+1;
  }else if(lm.kind==='onewtc'){         // New York: One World Trade Center, a tapering glass prism and its spire, with a few
    // Financial District towers round it
    const glass=litMat('#5a7ab8',0.5),tower=litMat('#3a3460',0.35),win=emitMat('#ffd23f');
    const o=add(new THREE.CylinderGeometry(2.6,5.6,44,4),glass,0,22,0);o.rotation.y=Math.PI/4;
    add(B(0.35,12,0.35),m,0,50,0);add(B(0.6,0.6,0.6),emitMat('#f4ecff'),0,56.3,0);
    for(let y=4;y<44;y+=5)add(B(0.2,0.2,5.6-(y/44)*3),win,4.2-(y/44)*1.9,y,0);
    [[-9,-3,5,16],[-6,7,6,24],[5,8,5,19],[9,-5,6,13],[-2,-10,5,21]].forEach(([x,z,w,h])=>{add(B(w,h,w),tower,x,h/2,z);add(B(0.3,h-3,w*0.7),win,x+w/2+0.05,h/2,z);});
    top=56;
  }else if(lm.kind==='dome'){
    add(new THREE.SphereGeometry(10,10,6,0,Math.PI*2,0,Math.PI/2),m,0,0,0);
    for(const [rad,y] of[[10.2,0.4],[8.7,5],[5,8.7]]){const r=add(new THREE.TorusGeometry(rad,0.35,4,24),glow,0,y,0);r.rotation.x=Math.PI/2;}
    add(B(1,6,1),m,0,12,0);add(B(0.8,0.8,0.8),emitMat('#ffd23f'),0,15.4,0);top=15;
  }else if(lm.kind==='needle'){          // Seattle: three pairs of legs spread at the base, pinched at the waist, a lit halo
    // ring low down, and the wide flying-saucer top house with its glass band, roof and spire
    const white=litMat('#e8e4f4',0.5);
    for(let k=0;k<3;k++)for(const d of[-0.22,0.22]){const a=k*Math.PI*2/3+d,c=Math.cos(a),s=Math.sin(a),c2=Math.cos(a-d*0.6),s2=Math.sin(a-d*0.6);
      beam(c*6.5,0,s*6.5,c2*1.3,17,s2*1.3,1.0,white);beam(c2*1.3,17,s2*1.3,c2*2.6,28,s2*2.6,1.0,white);}
    add(new THREE.CylinderGeometry(1.2,1.2,30,8),m,0,15,0);              // the lift core
    ring(3.6,11);ring(3.8,11.6);                                          // the halo ring
    add(new THREE.CylinderGeometry(8.5,4,2.2,16),white,0,29.2,0);         // the saucer's underside
    add(new THREE.CylinderGeometry(8.2,8.2,1.4,16),glow,0,31,0);          // the lit glass band
    add(new THREE.CylinderGeometry(3,8.4,1.6,16),white,0,32.5,0);         // the roof
    add(B(0.5,7,0.5),m,0,36.8,0);add(B(0.7,0.7,0.7),emitMat('#ffd23f'),0,40.6,0);top=41;
  }else if(lm.kind==='tvtower'){         // Berlin: the Fernsehturm, a tall pale shaft, the big silver ball with its lit band of
    // windows, and the red-and-white antenna
    const pale=litMat('#d8dcec',0.5),silver=litMat('#b8c0d8',0.6);
    add(B(6,3,6),m,0,1.5,0);add(new THREE.CylinderGeometry(1.1,1.9,34,10),pale,0,18,0);
    add(new THREE.SphereGeometry(5.2,14,10),silver,0,38,0);ring(5.25,38);ring(4.6,40.5);
    add(new THREE.CylinderGeometry(0.5,0.7,8,6),pale,0,46.5,0);
    for(let y=51;y<57;y+=2)add(new THREE.CylinderGeometry(0.35,0.35,1,6),y%4===3?emitMat('#ff3b3b'):emitMat('#f4ecff'),0,y,0);top=57;
  }else if(lm.kind==='sphere'){          // Las Vegas: the Sphere, its LED skin showing the giant eyeball, which always looks
    // at the camera (loadTrack turns the userData.faceCam group). lm.r sets its radius (Las Vegas: 7, its true size)
    const k=(lm.r||11)/11;
    add(new THREE.CylinderGeometry(6*k,7*k,2,12),m,0,1,0);add(new THREE.SphereGeometry(11*k,14,10),emitMat('#e8e0f4'),0,1+11*k,0);
    const eye=new THREE.Group();eye.position.set(0,1+11*k,0);eye.userData.faceCam=true;g.add(eye);
    for(const [r,c,x] of[[6,'#2f9fff',10.2],[4.2,'#1a5fd6',10.7],[2.4,'#0a0612',11.1]]){
      const o=new THREE.Mesh(new THREE.CylinderGeometry(r*k,r*k,0.6,14),emitMat(c));o.rotation.z=Math.PI/2;o.position.x=(x-r*r/40)*k;eye.add(o);}
    top=2+22*k;
  }else if(lm.kind==='bellagio'){        // Las Vegas: the Bellagio, a cream tower bowed round its lake (which lies on -z),
    // stepping up to the middle, warm window bands and a lit crown on each wing
    const cream=litMat('#e8d8b8',0.4),win=emitMat('#ffd27a'),R=22;
    [[-0.5,11],[-0.25,15],[0,19],[0.25,15],[0.5,11]].forEach(([a,h])=>{const x=R*Math.sin(a),z=-R+R*Math.cos(a)+R-R*Math.cos(0.5);
      const o=add(B(5.2,h,4),cream,x,h/2,z);o.rotation.y=a;
      for(let y=2;y<h-1;y+=2){const w=add(B(5.3,0.35,4.1),win,x,y,z);w.rotation.y=a;}
      const c=add(B(5.6,1,4.4),glow,x,h+0.5,z);c.rotation.y=a;});
    add(B(24,2.5,7),cream,0,1.25,-1.5);top=21;
  }else if(lm.kind==='luxor'){           // Las Vegas: the Luxor, a black glass pyramid with lit edges, its sky beam straight up
    // from the tip, and the sphinx out front on -z (the Strip side). top leaves the beam out, so it never shrinks the view
    const blackGlass=litMat('#0a0814',0.12),sand=litMat('#c8a868',0.35),H=13,r=11;
    const p=add(new THREE.ConeGeometry(r,H,4),blackGlass,0,H/2,0);p.rotation.y=Math.PI/4;
    for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2;beam(Math.cos(a)*r,0,Math.sin(a)*r,0,H,0,0.3,glow);}
    add(B(0.6,40,0.6),emitMat('#7a8ab8'),0,H+20,0);add(B(1.6,1,1.6),emitMat('#ffffff'),0,H+0.5,0);
    add(B(2,2,6),sand,0,1,-14);add(B(2,3,2),sand,0,2.5,-11.5);add(B(1.6,0.8,2.4),sand,0,0.4,-10);   // the sphinx
    top=H+1;
  }else if(lm.kind==='eiffel'){          // Las Vegas: the Paris casino's half-size Eiffel Tower, four splayed legs meeting under
    // the first deck, the tapering shaft and a lit tip
    const iron=litMat('#c8966a',0.5),lamp=emitMat('#ffd23f');
    for(const [x,z] of[[-4,-4],[4,-4],[4,4],[-4,4]]){beam(x,0,z,x*0.35,7,z*0.35,0.9,iron);beam(x*0.35,7,z*0.35,x*0.12,15,z*0.12,0.7,iron);
      for(const t of[0.25,0.5,0.75])add(B(0.5,0.5,0.5),lamp,x*(1-0.65*t),7*t,z*(1-0.65*t));   // gold lights up each leg
      for(const t of[0.33,0.66])add(B(0.45,0.45,0.45),lamp,x*(0.35-0.23*t),7+8*t,z*(0.35-0.23*t));}
    add(B(4.4,0.7,4.4),iron,0,7,0);rim(4.4,4.4,7.4);add(B(1.8,0.5,1.8),iron,0,15,0);
    beam(0,15,0,0,23,0,0.6,iron);add(B(0.6,0.6,0.6),emitMat('#fff2a8'),0,23.5,0);top=24;
  }else if(lm.kind==='caesars'){         // Las Vegas: Caesars Palace, a colonnaded temple front on -z (the Strip side) with its
    // pediment, out in front of the cream towers with their blue-lit crowns
    const marble=litMat('#ece4d4',0.4),win=emitMat('#9fd0ff');
    add(B(22,2.5,11),marble,0,1.25,-5.5);                                          // the forecourt, out toward the Strip
    for(let x=-9;x<=9;x+=2)add(new THREE.CylinderGeometry(0.5,0.5,7,6),marble,x,6,-10);  // the colonnade, out front
    add(B(21,1,2.4),marble,0,10,-10);const ped=add(new THREE.CylinderGeometry(0.1,4,21,3),marble,0,11.5,-10);ped.rotation.z=Math.PI/2;ped.scale.set(1,1,0.3);
    add(B(21.4,0.35,0.35),emitMat('#ffd23f'),0,10.6,-8.8);                         // gold trim under the pediment
    [[-6,13,6],[4,16,6],[11,11,5]].forEach(([x,h,w])=>{add(B(w,h,w*0.8),marble,x,h/2,3);for(let y=3;y<h-1;y+=2.2)add(B(w+0.1,0.3,w*0.8+0.1),win,x,y,3);
      add(B(w+0.4,1,w*0.8+0.4),glow,x,h+0.5,3);});
    top=17;
  }else if(lm.kind==='venetian'){        // Las Vegas: the Venetian, its red campanile and pink Doge's Palace out front on +z (the
    // Strip side), the tan hotel slab behind
    const brick=litMat('#b8584a',0.35),pink=litMat('#e8b8b0',0.4),stone=litMat('#ece4d4',0.4),tan=litMat('#c8b08a',0.35),win=emitMat('#ffd27a');
    add(B(16,18,4),tan,0,9,-5);for(let y=2;y<17;y+=2)add(B(16.1,0.3,4.1),win,0,y,-5);add(B(16.4,0.8,4.4),glow,0,18.4,-5);
    add(B(12,5,5),pink,-2,2.5,3);add(B(12.2,0.6,5.2),stone,-2,5.3,3);
    for(let x=-7.5;x<=3.5;x+=1.4)add(B(0.4,2.4,0.3),stone,x,1.2,5.6);            // the arcade
    add(B(2.6,15,2.6),brick,8,7.5,4);add(B(3,3,3),stone,8,16.5,4);add(B(3.2,0.5,3.2),glow,8,15.2,4);   // the campanile and belfry
    const cap=add(new THREE.ConeGeometry(2.1,4,4),litMat('#5fa878',0.4),8,20,4);cap.rotation.y=Math.PI/4;
    add(B(0.5,0.9,0.5),emitMat('#ffd23f'),8,22.4,4);top=23;
  }else if(lm.kind==='welcome'){         // Las Vegas: the Welcome to Fabulous Las Vegas sign, a white diamond on two posts with a
    // red neon rim and the gold star on top, always turned to the camera (userData.faceCam 'yaw')
    const face=new THREE.Group();face.userData.faceCam='yaw';g.add(face);
    const put=(geo,mat,x,y,z)=>{const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);face.add(o);return o;};
    for(const x of[-1.4,1.4])put(B(0.5,5,0.5),litMat('#8a86a8',0.3),x,2.5,0);
    const d=put(B(4.6,4.6,0.3),glow,0,7.4,-0.05);d.rotation.z=Math.PI/4;d.scale.x=1.45;
    const w=put(B(4,4,0.4),emitMat('#f4ecff'),0,7.4,0.05);w.rotation.z=Math.PI/4;w.scale.x=1.45;
    for(const x of[-1.6,0,1.6])put(B(0.9,0.7,0.1),emitMat('#ff3b5c'),x,7.4,0.3);   // the red letter blocks
    const st=put(B(1.3,1.3,0.3),emitMat('#ffd23f'),0,11.6,0);st.rotation.z=Math.PI/4;top=12.5;
  }else if(lm.kind==='neonrow'){         // Las Vegas: a row of low casino frontages along x (lm.len long) facing +z, each block with
    // a neon band along its front and a sign on the roof, some chasing (render/visuals.js blinks NEON); lm.low keeps them
    // short where they'd hide the road
    const cols=['#ff2e88','#2fe8ff','#ffd23f','#b86bff','#5dff8a','#ff7a2e'],L=lm.len||40;
    for(let i=0,x=-L/2;x<L/2-2;i++){const r=(i*37%11)/11,w=Math.min(4.5+(i*7%4),L/2-x),h=(lm.low?2:3.5)+r*(lm.low?1.5:4),c=cols[(i*5+(lm.seed||0))%cols.length],cx=x+w/2;
      add(B(w-0.4,h,5),litMat(i%2?'#3a3068':'#2c2452',0.3),cx,h/2,0);
      add(B(w-0.2,0.6,0.3),emitMat(c),cx,h*0.55,2.6);                                  // the neon band along the front
      const sg=add(B(Math.min(w-1,3.4),1.6+r,0.6),emitMat(cols[(i*5+(lm.seed||0)+2)%cols.length]),cx,h+1.2+r/2,1.8);   // the roof sign
      if(i%3===1){sg.userData.k=i;NEON.push(sg);}
      x+=w;}
    top=lm.low?6:11;
  }else if(lm.kind==='rencen'){          // Detroit: the Renaissance Center, a tall dark-glass cylinder ringed by four shorter
    // ones on a round podium, cyan window bands and a lit crown on each
    const glass=litMat('#34406a',0.5),win=emitMat('#2fe8ff');
    const tower=(x,z,r,h)=>{add(new THREE.CylinderGeometry(r,r,h,12),glass,x,1.5+h/2,z);
      for(let y=4;y<h-1;y+=3){const b=add(new THREE.CylinderGeometry(r+0.08,r+0.08,0.35,12),win,x,1.5+y,z);}
      add(new THREE.CylinderGeometry(r+0.15,r+0.15,1,12),glow,x,1.5+h+0.5,z);};
    add(new THREE.CylinderGeometry(10,10.5,3,16),m,0,1.5,0);
    tower(0,0,3.6,34);for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2;tower(Math.cos(a)*6.3,Math.sin(a)*6.3,2.2,20);}
    add(new THREE.CylinderGeometry(2.6,3.6,2,12),glass,0,37.5,0);add(B(0.4,5,0.4),m,0,41,0);add(B(0.6,0.6,0.6),emitMat('#ff3b3b'),0,43.7,0);top=44;
  }else if(lm.kind==='fist'){            // Detroit: the Joe Louis monument, a bronze forearm and fist along x hanging from a
    // four-legged pyramid frame, on a lit plinth
    const bronze=litMat('#b07a3c',0.5);
    add(B(8,0.6,8),m,0,0.3,0);rim(8,8,0.6);
    for(const [x,z] of[[-4,-4],[4,-4],[4,4],[-4,4]])beam(x,0.6,z,0,11,0,0.35,litMat('#8a86a8',0.3));
    beam(0,11,0,0,8.4,0,0.15,m);                                                     // the cables
    add(new THREE.CylinderGeometry(1.1,1.3,7,8),bronze,-1,7.6,0).rotation.z=Math.PI/2;   // the forearm
    add(B(3,2.8,2.6),bronze,3.6,7.6,0);add(B(1,1.2,2.4),bronze,5.2,7.2,0);       // the fist and its knuckles
    top=12;
  }else if(lm.kind==='burj'){            // Dubai: the Burj Khalifa, three silver wings round a core (its Y plan) that step back
    // one by one as it rises, lit seams up each wing, and the long spire
    const steel=litMat('#c8d0e8',0.55),seam=emitMat('#9fd8ff');
    add(new THREE.CylinderGeometry(1.2,1.8,48,6),steel,0,24,0);                     // the core
    for(let k=0;k<3;k++){const a=k*Math.PI*2/3,c=Math.cos(a),sn=Math.sin(a);
      for(let t=0;t<4;t++){const h=42-t*10-k*3,len=4.6-t*1.0;if(h<4||len<1)continue;
        const o=add(B(len,h,1.5),steel,c*(len/2+0.8),h/2,-sn*(len/2+0.8));o.rotation.y=a;
        add(B(0.3,h-1,0.3),seam,c*(len+0.8),h/2,-sn*(len+0.8));}}
    add(new THREE.CylinderGeometry(0.3,1.2,20,6),steel,0,58,0);add(B(0.5,0.5,0.5),emitMat('#ff3b3b'),0,68.3,0);top=68;
  }else if(lm.kind==='rijks'){           // Amsterdam: the Rijksmuseum, a long red-brick palace along x under slate roofs, corner
    // pavilions, the two central towers with their spires, warm windows and the lit passage through the middle
    const brick=litMat('#a8483a',0.35),slate=litMat('#3a3a5a',0.3),stone=litMat('#e0d4bc',0.35),win=emitMat('#ffd27a');
    add(B(32,7,11),brick,0,3.5,0);const roof=add(new THREE.CylinderGeometry(0.1,5.8,32,4),slate,0,9.4,0);roof.rotation.z=Math.PI/2;roof.scale.set(1,1,1);roof.rotation.x=Math.PI/4;
    for(const x of[-14,14]){add(B(5,9,12.5),brick,x,4.5,0);const c=add(new THREE.ConeGeometry(4,4,4),slate,x,11,0);c.rotation.y=Math.PI/4;}
    for(const x of[-3.2,3.2]){add(B(4,15,4),brick,x,7.5,0);add(B(4.4,0.6,4.4),stone,x,15.3,0);
      const sp=add(new THREE.ConeGeometry(2.4,6,4),slate,x,18.6,0);sp.rotation.y=Math.PI/4;add(B(0.4,1.6,0.4),emitMat('#ffd23f'),x,22.3,0);}
    add(B(4,4.5,11.4),emitMat('#ffe8b0'),0,2.25,0);                                  // the passage under the middle
    for(let x=-12;x<=12;x+=2)if(Math.abs(x)>3)for(const y of[2.2,4.8])add(B(0.9,1.3,11.2),win,x,y,0);
    top=23;
  }else if(lm.kind==='canalhouses'){     // Amsterdam: a row of narrow canal houses along x (lm.len long), fronts on +z, dark brick
    // in mixed shades with white stepped and bell gables and warm windows
    const cols=['#5a2a24','#2a2230','#6a4a38','#3a2a2a','#7a5a44'],trim=litMat('#e8e0d0',0.4),win=emitMat('#ffd27a'),L=lm.len||36;
    for(let i=0,x=-L/2;x<L/2-2;i++){const w=2.4+(i*7%4)*0.25,h=7+(i*5%4),cx=x+w/2,br=litMat(cols[i%cols.length],0.3);
      add(B(w-0.15,h,5),br,cx,h/2,0);
      if(i%2){add(B(w*0.7,1.2,4.8),br,cx,h+0.6,0.1);add(B(w*0.4,1,4.6),br,cx,h+1.7,0.2);add(B(w*0.72,0.25,0.3),trim,cx,h+1.25,2.55);}   // a stepped gable
      else{add(B(w*0.55,1.8,4.8),br,cx,h+0.9,0.1);add(B(w*0.6,0.3,0.3),trim,cx,h+1.9,2.55);}                                           // a bell gable
      add(B(w-0.1,0.25,0.3),trim,cx,h,2.55);
      for(let y=1.6;y<h-1;y+=1.8)for(const dx of[-w/4,w/4])for(const z of[2.55,-2.55])add(B(0.55,0.9,0.1),win,cx+dx,y,z);   // windows front and back
      x+=w;}
    top=13;
  }else if(lm.kind==='lotte'){           // Seoul: the Lotte World Tower, a smooth tapering silver-white spike, lit seams down its
    // four faces, and the open lattice crown at the top
    const pale=litMat('#dde4f4',0.55),seam=emitMat('#9fe8ff');
    const body=add(new THREE.CylinderGeometry(1.6,4.6,56,4),pale,0,28,0);body.rotation.y=Math.PI/4;
    for(let k=0;k<4;k++){const a=k*Math.PI/2;beam(Math.cos(a)*4.6,0,Math.sin(a)*4.6,Math.cos(a)*1.6,56,Math.sin(a)*1.6,0.3,seam);}
    for(let k=0;k<4;k++){const a=k*Math.PI/2;beam(Math.cos(a)*1.6,56,Math.sin(a)*1.6,Math.cos(a)*0.6,63,Math.sin(a)*0.6,0.35,glow);}
    add(B(0.5,0.5,0.5),emitMat('#ff3b3b'),0,63.4,0);top=64;
  }else if(lm.kind==='fairycastle'){     // Seoul: Lotte World's Magic Island castle, white walls and towers under tall blue cone
    // roofs round a taller keep with a pink roof, gold tips and warm windows
    const white=litMat('#f0ecf8',0.45),blue=litMat('#4a7aff',0.45),pink=litMat('#ff7ab8',0.45),gold=emitMat('#ffd23f'),win=emitMat('#ffd27a');
    add(B(9,3,7),white,0,1.5,0);
    const tower=(x,z,r,h,roof,rh)=>{add(new THREE.CylinderGeometry(r,r,h,8),white,x,h/2,z);add(new THREE.ConeGeometry(r*1.25,rh,8),roof,x,h+rh/2,z);
      add(B(0.3,0.9,0.3),gold,x,h+rh+0.4,z);add(B(0.5,0.8,0.1),win,x,h*0.7,z+r);};
    for(const [x,z] of[[-4.5,-3.5],[4.5,-3.5],[-4.5,3.5],[4.5,3.5]])tower(x,z,1.1,5,blue,4);
    tower(-1.8,0,1.4,8,blue,5);tower(1.8,0,1.4,8,blue,5);tower(0,0.5,1.8,11,pink,6);top=19;
  }else if(lm.kind==='linkbridge'){      // Lagos: the Lekki-Ikoyi Link Bridge, a deck along x (lm.len long) on piers over the
    // lagoon, its single white pylon in the middle and the fans of stay cables to the deck either side
    const white=litMat('#e8e4f4',0.5),L=lm.len||90,H=30;
    add(B(L,0.9,5),m,0,5,0);add(B(L,0.3,0.3),glow,0,5.6,2.4);add(B(L,0.3,0.3),glow,0,5.6,-2.4);
    for(let x=-L/2+6;x<L/2;x+=12)if(Math.abs(x)>4)add(B(1.2,5,1.2),m,x,2.5,0);
    add(B(2.2,H,2.2),white,0,H/2,0);add(B(2.8,1,2.8),glow,0,H+0.5,0);
    for(const sd of[-1,1])for(let k=1;k<=6;k++){const x=sd*k*5.5;beam(0,H-1-k*2.2,0,x,5.5,0,0.18,glow);}
    top=H+1;
  }else if(lm.kind==='lamprow'){         // Mumbai: the Queen's Necklace, Marine Drive's string of golden street lamps along x
    // (lm.len long) with the promenade wall under them
    const L=lm.len||60,head=emitMat('#ffc86b');add(B(L,0.8,1.2),litMat('#8a86a8',0.3),0,0.4,1.5);
    for(let x=-L/2;x<=L/2;x+=3.5){add(B(0.3,4,0.3),m,x,2,0);add(B(1,0.6,1),head,x,4.2,0);}
    top=5;
  }else if(lm.kind==='gateway'){         // Mumbai: the Gateway of India, a yellow basalt arch with four corner turrets, lit
    const stone=litMat('#d8b878',0.4),win=emitMat('#ffd27a');
    add(B(14,2,6),stone,0,1,0);
    for(const x of[-4.5,4.5])add(B(4,9,6),stone,x,6,0);add(B(5,3,6),stone,0,9.5,0);add(B(5,6.5,6.2),emitMat('#ffe8b0'),0,5,0);   // the arch, lit inside
    for(const [x,z] of[[-6,-2.6],[6,-2.6],[-6,2.6],[6,2.6]]){add(new THREE.CylinderGeometry(0.9,0.9,11,8),stone,x,6.5,z);add(new THREE.SphereGeometry(1,8,6,0,Math.PI*2,0,Math.PI/2),stone,x,12,z);}
    add(new THREE.SphereGeometry(2.2,10,6,0,Math.PI*2,0,Math.PI/2),stone,0,11,0);add(B(13,0.3,0.3),glow,0,11,3.1);top=14;
  }else if(lm.kind==='bigben'){          // London: the Elizabeth Tower (Big Ben), a gilded stone shaft with its four lit clock
    // faces, the belfry and the pointed spire, beside a stretch of the Palace of Westminster along x
    const stone=litMat('#c8b48a',0.45),clock=emitMat('#fff2c8'),gold=emitMat('#ffd23f');
    add(B(3.4,22,3.4),stone,0,11,0);for(let y=4;y<21;y+=3)add(B(3.5,0.3,3.5),litMat('#8a7a5a',0.35),0,y,0);
    add(B(4.2,4.2,4.2),stone,0,24,0);for(const [x,z] of[[2.15,0],[-2.15,0],[0,2.15],[0,-2.15]])add(B(x?0.1:3,3,z?0.1:3),clock,x,24,z);
    add(B(3.6,3,3.6),stone,0,27.6,0);const sp=add(new THREE.ConeGeometry(2.5,7,4),litMat('#4a4a6a',0.35),0,32.6,0);sp.rotation.y=Math.PI/4;
    add(B(0.4,1.6,0.4),gold,0,36.8,0);
    add(B(26,8,6),stone,-15,4,0);for(let x=-27;x<=-3;x+=3)add(B(0.8,10,0.8),stone,x,5,3.1);add(B(26,0.3,0.3),glow,-15,8,3.1);top=37;
  }else if(lm.kind==='brandenburg'){     // Berlin: the Brandenburg Gate, six pairs of pale columns along x under the attic, the
    // green copper quadriga on top, lit from below
    const stone=litMat('#e0d8c4',0.45),copper=litMat('#5fc8a4',0.45);
    add(B(16,1,5),stone,0,0.5,0);
    for(let k=0;k<6;k++){const x=-6.5+k*2.6;for(const z of[-1.6,1.6])add(new THREE.CylinderGeometry(0.45,0.5,7,8),stone,x,4.5,z);}
    add(B(16.6,1.6,5),stone,0,8.8,0);add(B(8,1.6,4),stone,0,10.4,0);add(B(16.6,0.3,0.3),glow,0,8,2.6);
    add(B(3,1.4,1.4),copper,0,11.9,0);for(const x of[-1.1,-0.4,0.4,1.1])add(B(0.35,1.6,1.8),copper,x,12.6,0.2);add(B(0.3,2.4,0.3),copper,0,13.8,-0.5);
    for(const x of[-7.5,-2.6,2.6,7.5])add(B(0.8,0.4,0.4),emitMat('#ffe8b0'),x,1.2,2.6);top=15;
  }else if(lm.kind==='onepyramid'){      // Cairo: one Giza pyramid, lm.s wide at the base (true to its size at the map's scale),
    // sandstone with neon edges and a lit capstone
    const S=lm.s||20,H=S*0.64,r=S/Math.SQRT2;
    const p=add(new THREE.ConeGeometry(r,H,4),litMat('#c8a868',0.35),0,H/2,0);p.rotation.y=Math.PI/4;
    for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2;beam(Math.cos(a)*r,0,Math.sin(a)*r,0,H,0,0.25,glow);}
    add(B(1,1,1),emitMat('#ffd23f'),0,H+0.3,0);top=H+1;
  }else if(lm.kind==='sphinx'){          // Cairo: the Great Sphinx, lying along x facing +x
    const sand=litMat('#c8a868',0.4);
    add(B(12,3,4),sand,-1,1.5,0);add(B(4,2,1.4),sand,6,1,1.3);add(B(4,2,1.4),sand,6,1,-1.3);
    add(B(3,4,3.4),sand,4,4.5,0);add(B(1.2,3,4.6),litMat('#3a5aa8',0.4),4,5,0);add(B(0.8,1.4,1.2),sand,5.8,4.5,0);top=7;
  }else if(lm.kind==='usbank'){          // Los Angeles: the US Bank Tower, a round glass tower with stepped setbacks near the top
    // and its lit glass crown
    const glass=litMat('#5a6a9a',0.5),win=emitMat('#9fd0ff');
    add(new THREE.CylinderGeometry(4.2,4.4,36,14),glass,0,18,0);for(let y=3;y<35;y+=3)add(new THREE.CylinderGeometry(4.28,4.28,0.3,14),win,0,y,0);
    for(let k=0;k<4;k++){const a=k*Math.PI/2;add(B(2.2,38-k*2,2.2),glass,Math.cos(a)*4.2,(38-k*2)/2,Math.sin(a)*4.2);}   // the stepped wings
    add(new THREE.CylinderGeometry(3.6,4.2,4,14),glass,0,38,0);add(new THREE.CylinderGeometry(3.2,3.6,4,14),glow,0,42,0);
    add(new THREE.CylinderGeometry(2.4,3.2,1,14),glass,0,44.5,0);top=45;
  }else if(lm.kind==='sugarloaf'){       // Rio: Sugarloaf Mountain, a steep rounded rock rising from the bay, the lower Morro da
    // Urca beside it along -x, and the cable car line between the two tops
    const rock=litMat('#3a5a4a',0.35),bare=litMat('#6a6a7a',0.35);
    const a=add(new THREE.SphereGeometry(10,12,10),rock,0,0,0);a.scale.set(1,2.6,1.1);
    const c=add(new THREE.SphereGeometry(6,10,8,0,Math.PI*2,0,Math.PI/2),bare,0,17,0);c.scale.set(1,1.4,1.1);   // the bare dome
    const b=add(new THREE.SphereGeometry(9,10,8),rock,-20,0,2);b.scale.set(1.2,1.1,1);
    beam(-20,10,2,0,26,0,0.2,glow);add(B(1.4,1.1,1.1),emitMat('#ffd23f'),-10,18.4,1);top=27;
  }else if(lm.kind==='willis'){          // Chicago: the Willis Tower, nine black square tubes bundled three by three that stop at
    // different heights, warm window bands, and the two white antennas
    const black=litMat('#1a1828',0.45),win=emitMat('#ffd27a'),hs=[[36,44,30],[50,50,40],[30,44,24]],w=3.4;
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){const h=hs[i][j],x=(i-1)*w,z=(j-1)*w;add(B(w,h,w),black,x,h/2,z);
      for(let y=3;y<h-1;y+=3)add(B(w+0.05,0.25,w+0.05),win,x,y,z);}
    for(const x of[-0.9,0.9]){add(B(0.4,12,0.4),litMat('#e8e4f4',0.5),x,56,0);add(B(0.5,0.5,0.5),emitMat('#ff3b3b'),x,62.3,0);}top=62;
  }else if(lm.kind==='watarun'){         // Bangkok: Wat Arun, the tall central prang in stepped white tiers studded with coloured
    // porcelain, ringed by four smaller prangs, on its terrace by the river
    const white=litMat('#ece4d8',0.45),dots=[emitMat('#ff7ab8'),emitMat('#5fe8ff'),emitMat('#ffd23f')];
    add(B(20,1.5,20),white,0,0.75,0);
    const prang=(x,z,s)=>{for(let k=0;k<6;k++){const r=(3.2-k*0.45)*s,h=3.2*s,y=1.5+k*h;add(new THREE.CylinderGeometry(r*0.85,r,h,8),white,x,y+h/2,z);
        add(new THREE.CylinderGeometry(r*0.9,r*0.9,0.25,8),dots[k%3],x,y+h*0.6,z);}
      add(new THREE.ConeGeometry(0.6*s,4*s,6),emitMat('#ffd23f'),x,1.5+6*3.2*s+2*s,z);};
    prang(0,0,1.4);for(const [x,z] of[[-7,-7],[7,-7],[7,7],[-7,7]])prang(x,z,0.6);top=34;
  }else if(lm.kind==='grandpalace'){     // Bangkok: the Grand Palace, white halls under stacked golden roofs with a tall gilded spire
    const white=litMat('#ece4d8',0.45),gold=litMat('#e8b83a',0.5),red=litMat('#c8403a',0.4);
    add(B(20,4,10),white,0,2,0);
    for(let k=0;k<3;k++){const r=add(new THREE.CylinderGeometry(0.1,7-k*1.6,3,4),k%2?red:gold,0,5.5+k*2.2,0);r.rotation.y=Math.PI/4;r.scale.set(1.6,1,0.9);}
    for(let k=0;k<5;k++)add(new THREE.CylinderGeometry(1.4-k*0.25,1.6-k*0.25,1.6,8),gold,0,11.5+k*1.6,0);add(new THREE.ConeGeometry(0.4,5,6),emitMat('#ffd23f'),0,22,0);top=24;
  }else if(lm.kind==='monas'){           // Jakarta: Monas, the National Monument, a white obelisk rising from its wide cup-shaped
    // platform, crowned with the gilded flame
    const white=litMat('#ece8f4',0.5),gold=emitMat('#ffd23f');
    add(B(14,2,14),white,0,1,0);add(new THREE.CylinderGeometry(8,4,3,4),white,0,3.5,0).rotation.y=Math.PI/4;rim(14,14,2);
    add(new THREE.CylinderGeometry(1.2,2.2,26,4),white,0,18,0).rotation.y=Math.PI/4;
    add(new THREE.CylinderGeometry(2.4,1.2,1.4,8),litMat('#8a86a8',0.4),0,31.7,0);
    add(new THREE.ConeGeometry(1.3,4,8),gold,0,34.4,0);add(B(1,1,1),gold,0,32.6,0);top=37;
  }else if(lm.kind==='istiqlal'){        // Jakarta: the Istiqlal Mosque, a great white dome on its square hall and the tall minaret
    const white=litMat('#ece8f4',0.5);
    add(B(18,7,18),white,0,3.5,0);add(new THREE.SphereGeometry(8,14,8,0,Math.PI*2,0,Math.PI/2),white,0,7,0);ring(8.1,7.3);
    add(B(0.4,2,0.4),glow,0,16,0);add(new THREE.CylinderGeometry(1,1.2,26,8),white,12,13,-8);add(new THREE.ConeGeometry(1.2,3,8),glow,12,27.5,-8);top=29;
  }else if(lm.kind==='ballpark'){        // Phoenix: Chase Field, a big brick-and-steel ballpark with its arched retractable roof in
    // panels, the lit outfield windows and light towers at the corners
    const brick=litMat('#a86a4a',0.35),steel=litMat('#8a90a8',0.5);
    add(B(26,9,22),brick,0,4.5,0);
    for(let k=0;k<4;k++){const r=add(new THREE.CylinderGeometry(11,11,6,16,1,false,0,Math.PI),steel,-9+k*6,9,0);r.rotation.z=Math.PI/2;r.rotation.y=Math.PI/2;r.scale.set(1,1,0.35);}
    add(B(18,3,0.2),emitMat('#9fe8a0'),0,5,11.1);add(B(26.4,0.4,0.4),glow,0,9,11.1);
    for(const [x,z] of[[-13,-11],[13,-11],[-13,11],[13,11]]){add(B(0.6,14,0.6),m,x,7,z);add(B(3,1.6,0.6),emitMat('#f4ecff'),x,14.5,z);}top=16;
  }else if(lm.kind==='capitolio'){       // Havana: El Capitolio, a long white colonnaded front along x and the tall dome on its
    // drum with the lantern on top
    const white=litMat('#ece4d4',0.45),win=emitMat('#ffd27a');
    add(B(30,6,10),white,0,3,0);for(let x=-13;x<=13;x+=2)add(B(0.6,5,0.6),white,x,3.5,5.3);add(B(30.4,0.3,0.3),glow,0,6.2,5.2);
    add(new THREE.CylinderGeometry(4.2,4.6,6,14),white,0,9,0);for(let k=0;k<12;k++){const a=k*Math.PI/6;add(B(0.5,4,0.5),win,Math.cos(a)*4.5,9,Math.sin(a)*4.5);}
    add(new THREE.SphereGeometry(4.2,14,8,0,Math.PI*2,0,Math.PI/2),white,0,12,0);ring(4.25,12.2);
    add(new THREE.CylinderGeometry(0.9,1.1,3,8),white,0,17,0);add(B(0.6,1.2,0.6),emitMat('#ffd23f'),0,19.2,0);top=20;
  }else if(lm.kind==='morro'){           // Havana: El Morro, a stone fortress on its rocky point at the harbour mouth, and the tall
    // lighthouse with its lamp
    const stone=litMat('#b8a888',0.4),rock=litMat('#4a4a5a',0.3);
    add(B(20,3,14),rock,0,1.5,0);for(const r of[0,Math.PI/4]){const o=add(B(13,4,13),stone,0,5,0);o.rotation.y=r;}
    add(new THREE.CylinderGeometry(1.5,1.9,16,10),litMat('#f0ecdc',0.45),5,11,0);add(new THREE.CylinderGeometry(1.7,1.7,2,10),emitMat('#fff2a8'),5,20,0);
    add(new THREE.ConeGeometry(1.8,2,10),rock,5,22,0);top=23;
  }else if(lm.kind==='fountains'){       // Las Vegas: the Fountains of Bellagio, a bowed line of jets along x that play a show
    // (render/visuals.js animates FOUNTAINS)
    const jet=emitMat('#dff4ff');
    for(let i=0;i<24;i++){const t=i/23,o=add(B(0.5,1,0.5),jet,-11+22*t,0.3,2*(1-(2*t-1)**2));o.userData.t=t;o.userData.i=i;o.visible=false;FOUNTAINS.push(o);}
    top=14;
  }else if(lm.kind==='stupa'){           // Bangkok: stepped terraces under a tall spire
    [[14,2],[10,2],[7,2]].forEach(([w,h],i)=>{add(B(w,h,w),m,0,1+i*2,0);rim(w,w,2+i*2);});
    add(new THREE.ConeGeometry(4.5,20,8),m,0,16,0);ring(3.4,10);ring(2.2,16);add(B(0.4,4,0.4),glow,0,28,0);top=30;
  }else if(lm.kind==='pyramid'){         // Cairo: three pyramids
    [[0,0,15],[-17,9,11],[-28,17,7]].forEach(([x,z,s])=>{const p=add(new THREE.ConeGeometry(s*0.75,s,4),litMat('#3a3050',0.3),x,s/2,z);
      p.rotation.y=Math.PI/4;add(B(1,1,1),emitMat('#ffd23f'),x,s+0.4,z);});
    add(B(30,0.3,0.3),glow,-10,0.2,12);top=16;
  }else if(lm.kind==='statue'){          // Rio: a statue with open arms on a hilltop
    add(new THREE.ConeGeometry(13,12,7),litMat('#1c1638',0.2),0,6,0);add(B(3,2,3),m,0,13,0);
    add(B(1.6,8,1.4),litMat('#d8d0f0',0.3),0,18,0);add(B(9,1.2,1.2),litMat('#d8d0f0',0.3),0,20.5,0);add(B(1.3,1.3,1.3),litMat('#d8d0f0',0.3),0,22.8,0);
    ring(2.4,14);add(B(0.6,0.6,0.6),glow,0,24.2,0);top=24;
  }else if(lm.kind==='suspension'){      // San Francisco: a suspension bridge in International Orange, deck along x,
    // 2*span long, towers at the thirds straddling a full road. When it carries the city's freeway (lm.carries), the
    // freeway draws the deck and the traffic; the bridge brings the towers and cables.
    const L=lm.span||34,H=28,W=3.3,orange=emitMat(lm.tint||'#d8472c'),cableMat=emitMat(lm.cable||'#ff6a3a');   // tint/cable: another city's paint   // flat, so the towers read International Orange from every side
    if(!lm.carries)add(B(2*L,0.8,5),m,0,5,0);
    for(const x of[-L/2,L/2]){for(const z of[-W,W])add(B(1.4,H,1.4),orange,x,H/2,z);
      for(const y of[H-1,H*0.62])add(B(1.2,1.2,2*W+1.4),orange,x,y,0);}   // portal beams
    // main cables: sag between the towers, run down to the deck ends; hangers down to the deck
    const cable=(x0,y0,x1,y1)=>{for(let t=0;t<1;t+=1/8){const xa=x0+(x1-x0)*t,xb=x0+(x1-x0)*(t+1/8),ya=y0+(y1-y0)*t,yb=y0+(y1-y0)*(t+1/8);
      for(const z of[-W,W]){const c=add(B(Math.hypot(xb-xa,yb-ya),0.35,0.35),cableMat,(xa+xb)/2,(ya+yb)/2,z);c.rotation.z=Math.atan2(yb-ya,xb-xa);}}};
    const sag=x=>H-0.5-(H-8)*(1-(2*x/L)**2);
    for(let x=-L/2;x<L/2-1e-6;x+=L/8)cable(x,sag(x),x+L/8,sag(x+L/8));
    for(let x=-L/2+L/8;x<L/2-1e-6;x+=L/8)for(const z of[-W,W]){const h=sag(x)-5.4;add(B(0.15,h,0.15),cableMat,x,5.4+h/2,z);}
    cable(-L,6,-L/2,H-0.5);cable(L/2,H-0.5,L,6);top=H+1;
  }else if(lm.kind==='shell'){           // Sydney: sail roofs on a podium at the water's edge
    add(B(26,2,12),m,0,1,0);rim(26,12,2);
    // each sail a pair of curved shells leaning back to back, like the real roofs
    const sailMat=litMat('#d8d0f0',0.3,THREE.DoubleSide);
    [[-7,9],[0,8],[6,6.5],[11,4.5]].forEach(([x,h])=>{for(const side of[-1,1]){
      const sail=add(new THREE.SphereGeometry(1,10,6,0,Math.PI,0,Math.PI/2),sailMat,x,2,0);
      sail.scale.set(h*0.55,h*1.3,3.2);sail.rotation.set(0,side>0?0:Math.PI,side*0.25);}});top=15;
  }else if(lm.kind==='windmill'){        // Amsterdam: a windmill by the canal
    add(new THREE.CylinderGeometry(2.6,4,13,8),m,0,6.5,0);add(new THREE.ConeGeometry(3.2,3.5,8),m,0,14.7,0);
    for(let k=0;k<4;k++){const sw=add(B(1.4,12,0.3),glow,0,14,3.4);sw.rotation.z=k*Math.PI/2+0.3;sw.translateY(6);}
    add(B(0.8,0.8,0.8),emitMat('#ffd23f'),0,14,3.6);ring(4.05,0.3);top=21;
  }else if(lm.kind==='castle'){          // Prague: Prague Castle, long pale palace wings along x with rows of warm windows under
    // green copper roofs, and St. Vitus Cathedral's dark gothic twin spires rising behind them
    const pale=litMat('#e0d8c8',0.4),copper=litMat('#5fa888',0.4),dark=litMat('#3a3450',0.35),win=emitMat('#ffd27a');
    add(B(32,7,7),pale,0,3.5,2);const r1=add(new THREE.CylinderGeometry(0.1,4.2,32,4),copper,0,8.2,2);r1.rotation.z=Math.PI/2;r1.rotation.x=Math.PI/4;r1.scale.set(1,1,0.8);
    for(let x=-14;x<=14;x+=2)for(const y of[2,4.6])add(B(0.9,1.1,0.1),win,x,y,5.55);
    add(B(12,10,7),dark,3,5,-5);for(const x of[5,8.5]){add(B(3,14,3),dark,x,7,-6);const sp=add(new THREE.ConeGeometry(2.2,8,4),dark,x,18,-6);sp.rotation.y=Math.PI/4;add(B(0.5,0.9,0.5),glow,x,22.4,-6);}
    add(B(2.4,18,2.4),dark,-1,9,-6);const sp2=add(new THREE.ConeGeometry(1.8,5,8),copper,-1,20.5,-6);add(B(12.4,0.3,0.3),glow,3,10,-1.4);top=23;
  }else if(lm.kind==='charlesbridge'){   // Prague: the Charles Bridge, a stone deck along x (lm.len long) on arches with lamps and
    // statues along both parapets and a gothic tower at each end
    const stone=litMat('#8a8098',0.35),L=lm.len||60,lamp=emitMat('#ffd27a');
    add(B(L,1,5),stone,0,4,0);for(let x=-L/2+4;x<L/2;x+=8)add(B(2.2,4,5),stone,x,2,0);
    for(let x=-L/2+3;x<L/2-2;x+=4)for(const z of[-2.3,2.3]){add(B(0.5,1.6,0.5),x%8?stone:litMat('#3a3450',0.3),x,5.3,z);if(x%8)add(B(0.4,0.4,0.4),lamp,x,6.3,z);}
    for(const x of[-L/2,L/2]){add(B(5,11,6),litMat('#4a4458',0.35),x,5.5,0);const r=add(new THREE.ConeGeometry(3.8,5,4),litMat('#2a2438',0.3),x,13.5,0);r.rotation.y=Math.PI/4;}
    top=16;

  }else if(lm.kind==='supertall'){       // Dubai / Chicago: a stepped supertall with a spire (or twin antennas)
    [[11,14],[9,12],[7,10],[5,8],[3,6]].reduce((y,[w,h])=>{add(B(w,h,w),m,0,y+h/2,0);rim(w,w,y+h);return y+h;},0);
    if(lm.antennas){for(const x of[-0.8,0.8])add(B(0.3,8,0.3),m,x,54,0);add(B(0.6,0.6,0.6),emitMat('#ff4060'),0.8,58.2,0);top=58;}
    else{add(new THREE.ConeGeometry(1.2,12,6),m,0,56,0);add(B(0.5,0.5,0.5),glow,0,62.2,0);top=62;}
    const win=emitMat('#2fb8d6');add(B(0.1,44,0.4),win,5.55,22,0);add(B(0.4,44,0.1),win,0,22,5.55);
  }else if(lm.kind==='mbs'){             // Singapore: Marina Bay Sands, three slab towers with the SkyPark deck balanced
    // across their tops and cantilevered out past the end one
    const win=emitMat('#ffd27a'),H=40;
    for(const x of[-11,0,11]){add(B(8,H,6),m,x,H/2,0);add(B(0.4,H,6.1),m,x,H/2,0);   // a slab, with the seam between its two halves
      for(let y=3;y<H-2;y+=3)add(B(8.1,0.35,6.1),win,x,y,0);rim(8,6,H);}
    add(B(38,1.6,7),m,5,H+1.2,0);rim(38,7,H+2);   // the SkyPark, overhanging the east end
    for(const x of[-10,-2,6,14,22])add(B(1.2,1.2,1.2),emitMat('#7dffea'),x,H+2.6,0);   // a few lights on the deck
    top=H+3;
  }else if(lm.kind==='skyline'){         // Hong Kong: a waterfront wall of towers along x, led by the Bank of China Tower
    // (stacked triangular prisms, neon edges) and IFC (tall, slim, a notched crown), with mixed towers between
    const win=emitMat('#2fb8d6'),warm=emitMat('#ffd27a');
    const prism=(x,z,r,y0,h)=>{const p=add(new THREE.CylinderGeometry(r,r,h,3),m,x,y0+h/2,z);p.rotation.y=Math.PI/6;
      for(let k=0;k<3;k++){const a=Math.PI/6+k*2*Math.PI/3,e=add(B(0.25,h,0.25),glow,x+Math.cos(a)*r,y0+h/2,z-Math.sin(a)*r);}};
    // Bank of China: a square base whose triangular shafts step back as they rise, twin masts on top
    add(B(9,4,9),m,0,2,0);rim(9,9,4);
    prism(0,0,5.2,4,20);prism(0.8,0.8,4.2,24,9);prism(-0.4,0.6,3.2,33,7);prism(0.4,-0.4,2.2,40,5);
    for(const x of[-0.6,0.6])add(B(0.3,7,0.3),m,x,48.5,0);add(B(0.5,0.5,0.5),emitMat('#ff4060'),0.6,52.2,0);
    // IFC: tall and slim, a little further along, with a notched crown
    add(B(6,40,6),m,13,20,0);for(let y=3;y<39;y+=2.5)add(B(6.1,0.35,6.1),win,13,y,0);
    for(const [dx,h] of[[-2,6],[0,8],[2,5]])add(B(1.6,h,5),m,13+dx,40+h/2,0);rim(6,6,40);
    // mixed towers either side
    [[-11,22,5],[-17,15,6],[-23,10,5],[22,24,5],[28,14,6],[-6,12,4],[7,16,4]].forEach(([x,h,w],i)=>{
      add(B(w,h,w),m,x,h/2,(i%2?2:-2));rim(w,w,h);
      for(let y=3;y<h-1;y+=3)add(B(w+0.1,0.4,w+0.1),i%3?win:warm,x,y,(i%2?2:-2));});   // window bands on every face
    top=52;
  }else if(lm.kind==='spire'){           // New York: the Empire State Building, a wide five-storey base, the tall shaft with
    // its lit window piers, stepped setbacks at the top, the floodlit crown and the mooring mast and antenna
    const stone=litMat('#8a86a8',0.4),win=emitMat('#ffd23f');
    add(B(16,5,12),stone,0,2.5,0);                                   // the base on Fifth Avenue
    add(B(11,30,8),stone,0,20,0);                                    // the shaft
    for(const o of[-4,-2,0,2,4])add(B(0.35,26,0.1),win,o,20,4.05);  // window piers, front
    for(const o of[-2.5,0,2.5])add(B(0.1,26,0.35),win,5.55,20,o);   // and side
    add(B(9,4,6.5),stone,0,37,0);add(B(7,3,5),stone,0,40.5,0);       // setbacks
    add(B(5.4,4,4.2),glow,0,44,0);add(B(3.6,2,3),glow,0,47,0);       // the floodlit crown
    add(new THREE.CylinderGeometry(1.1,1.5,4,8),stone,0,50,0);        // the mooring mast
    add(new THREE.CylinderGeometry(0.2,0.45,8,6),m,0,56,0);add(B(0.6,0.6,0.6),emitMat('#ff3b3b'),0,60.2,0);top=60;
  }
  if(lm.hill){                           // Seoul: whatever it is stands on a hill
    g.children.forEach(c=>c.position.y+=9);add(new THREE.ConeGeometry(14,10,7),litMat('#1c1638',0.2),0,4,0);top+=9;
  }
  return top;
  function ring(r,y){const t=add(new THREE.TorusGeometry(r,0.35,4,20),glow,0,y,0);t.rotation.x=Math.PI/2;return t;}
  // a glowing trim round the top edges of a w x d block at height y
  function rim(w,d,y){add(B(w+0.3,0.35,0.35),glow,0,y,d/2);add(B(w+0.3,0.35,0.35),glow,0,y,-d/2);
    add(B(0.35,0.35,d+0.3),glow,w/2,y,0);add(B(0.35,0.35,d+0.3),glow,-w/2,y,0);}
  // a beam of thickness t from one point to another
  function beam(x0,y0,z0,x1,y1,z1,t,mat=m){const a=new THREE.Vector3(x0,y0,z0),b=new THREE.Vector3(x1,y1,z1),o=add(B(t,a.distanceTo(b),t),mat,0,0,0);
    o.position.copy(a).add(b).multiplyScalar(0.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return o;}
}

// ---- build a track ----
function loadTrack(def){
  if(trackGroup){scene.remove(trackGroup);disposeTree(trackGroup);}
  trackGroup=new THREE.Group();scene.add(trackGroup);
  const add=o=>{trackGroup.add(o);return o;};
  TRACK=def;PIT_PADS.length=0;
  PIT_SIDE=def.pitSide||-1;PIT_LAT=PIT_SIDE*(HW+4.2);PIT_JOIN=PIT_SIDE*(HW-1.5);occluders.length=0;glints.length=0;traffic.length=0;FOUNTAINS.length=0;NEON.length=0;

  // centreline, tangents, normals and curvature
  // Small hand-built tracks grow to MIN_LAP so there's a stretch long enough for the pit lane (same shape, bigger);
  // their canal, freeway and landmark grow with them. Real-shaped tracks are already sized by build_tracks.py.
  const make=f=>new THREE.CatmullRomCurve3(def.ctrl.map(([x,z])=>new THREE.Vector3(x*TRACK_SCALE*f,0,z*TRACK_SCALE*f)),true,'centripetal');
  const grow=def.mPerUnit?1:Math.max(1,MIN_LAP/make(1).getLength());
  const curve=make(grow);
  L=curve.getLength();N=Math.round(L/0.5);DS=L/N;
  P=curve.getSpacedPoints(N);P.length=N;T=[];NRM=[];K=[];KA=[];
  for(let i=0;i<N;i++){const t=P[(i+1)%N].clone().sub(P[mod(i-1,N)]).normalize();T.push(t);NRM.push(new THREE.Vector3(-t.z,0,t.x));}
  for(let i=0;i<N;i++)K.push(T[(i+1)%N].clone().sub(T[i]).dot(NRM[i])/DS);   // signed: + turns toward +lateral
  // Start/finish (and the pit lane with it) goes on the calmest stretch of the lap: the least turning across the
  // pit window, with the lane clear of every other part of the circuit. The layout itself doesn't move.
  {const s=bestStart();if(s){const rot=a=>a.slice(s).concat(a.slice(0,s));P=rot(P);T=rot(T);NRM=rot(NRM);K=rot(K);}}
  EDGE={1:clippedEdge(1),'-1':clippedEdge(-1)};
  for(let i=0;i<N;i++){let a=0;for(let k=-4;k<=4;k++)a+=Math.abs(K[mod(i+k,N)]);KA.push(a/9);}
  // Physics scale: a track shrunk from a real circuit corners as if full size (speed and tire load come from
  // KA). The sim's grip is arcade-high for the tiny hand-built tracks; at real size that would take Monaco nearly
  // flat out, so real-shaped tracks corner as if 1 unit were GRIP_M metres: a hairpin runs near a fifth of top
  // speed, as in real life, while fast sweepers stay fast.
  const phys=def.mPerUnit?GRIP_M/def.mPerUnit:1;for(let i=0;i<N;i++)KA[i]*=phys;
  // Ability zones from the shape: slow corners (where corner speed, not top speed, sets the pace) plus the
  // 25 units of braking before them, and straights (gentle enough to run flat out).
  SLOWZ=KA.map(k=>k>SLOW_K);
  for(let i=0;i<N;i++)if(KA[i]>SLOW_K)for(let b=1;b<=Math.round(25/DS);b++)SLOWZ[mod(i-b,N)]=true;
  STRAIGHT=KA.map(k=>k<STRAIGHT_K);
  // Tags describe the measured shape (tight = lots of slow corner, straights = lots of straight).
  const share=a=>a.filter(Boolean).length/N;
  TRACK_SHAPE={slow:share(SLOWZ),straight:share(STRAIGHT)};
  avgLoad=KA.reduce((a,_,i)=>a+cornerLoad(i),0)/N;
  FUEL_PER_UNIT=100/(TANK_LAPS*CANAL_LAP);TIRE_PER_UNIT=100/(TIRE_LAPS*CANAL_LAP*REF_LOAD);
  PIT_IN=L-PIT_HALF;LAPS=lapsFor();

  // road, neon sector edges, centre dashes, start line
  add(new THREE.Mesh(ribbon(0,N,-HW,HW,0.02),litMat('#2e2652',0,THREE.DoubleSide)));
  for(let s=0;s<3;s++){
    const i0=Math.round(s*N/3),i1=Math.round((s+1)*N/3),m=edgeMat(SECTOR_COLORS[s]);SECTOR_MATS[s]=m;
    add(new THREE.Mesh(edgeRibbon(i0,i1,1),m));add(new THREE.Mesh(edgeRibbon(i0,i1,-1),m));
  }
  const dashMat=emitMat('#4a3d78',THREE.DoubleSide);
  for(let i=0;i<N;i+=12)add(new THREE.Mesh(ribbon(i,i+4,-0.1,0.1,0.04),dashMat));
  const chkW=emitMat('#f4ecff',THREE.DoubleSide),chkB=emitMat('#0b0716',THREE.DoubleSide);
  for(let r=0;r<2;r++)for(let c=0;c<8;c++){const o0=-HW+c*(2*HW/8);add(new THREE.Mesh(ribbon(r*2,r*2+2,o0,o0+2*HW/8,0.045),(r+c)%2?chkW:chkB));}

  // pit lane on the outside of the main straight, a box per team
  {
    const lane=litMat('#1d1834',0,THREE.DoubleSide);
    // entry ramp + lane + exit ramp as one road, drawn just under the track so the track stays on top where they meet
    add(new THREE.Mesh(slipRoad(0,PIT_LEN+PIT_RAMP,2.2,0.015),lane));
    const w0=Math.round((PIT_IN+PIT_RAMP+2)/DS),w1=Math.round((PIT_IN+PIT_LEN-2)/DS);
    add(new THREE.Mesh(ribbon(w0,w1,PIT_SIDE*(HW+0.8),PIT_SIDE*(HW+1.1),0.06),emitMat('#8a6a1a',THREE.DoubleSide)));   // pit wall
    TEAMS.forEach(t=>{const k=Math.round((PIT_IN+boxRel(t,0))/DS);
      PIT_PADS.push(add(new THREE.Mesh(ribbon(k-7,k+3,PIT_LAT-1.9,PIT_LAT+1.9,0.03),emitMat('#000000',THREE.DoubleSide))));});
    recolorPitBoxes();
  }

  // ground and the city's water (world/water.js), painted as one texture with its shores and the road's verge
  WATER=waterFeatures(def);WATER_MASK=null;
  const groundMat=litMat('#110b20',0),E=WATER_EDGE;
  // layers far enough apart for the depth buffer: ground top -0.4, water -0.3, road 0.02
  add(new THREE.Mesh(new THREE.BoxGeometry(2*E,1,2*E),groundMat)).position.set(0,-0.9,0);
  if(WATER.length){
    add(waterMesh(WATER));
    const glintGeo=new THREE.BoxGeometry(0.9,0.05,0.2),glintMat=emitMat('#2f95a8');
    for(const f of WATER){if(f.land)continue;
      const n=Math.min(70,Math.round((f.poly?80:f.band.length*f.w/60)));
      for(let i=0;i<n;i++){const m=add(new THREE.Mesh(glintGeo,glintMat));m.rotation.y=-Math.atan2(f.drift[1],f.drift[0]);
        m.userData={f,v:rand(0.6,1.6)};placeGlint(m);glints.push(m);}}
  }

  // elevated freeways beside the circuit (scenery only, see world/freeways.js): decks on pillars, span by span, one
  // occluder per span so only a span in front of a car fades; traffic lights run along every road
  buildFreeways(def);
  {const pillarGeo=new THREE.BoxGeometry(1,1,1);
    // one set of materials per fade level (16 dither steps), shared by every span at that level
    const matSets={},mats=f=>{const q=Math.round(f*16)/16;if(!matSets[q]){const set={slab:litMat('#3a3160',0.25),pillar:litMat('#2a2248',0.2),
      rail:emitMat('#d9822b'),dash:emitMat('#8a7fb0'),lamp:emitMat('#ffd27a'),shadow:emitMat('#07050d',THREE.DoubleSide)};
      for(const m of Object.values(set))m.uniforms.uFade.value=q;matSets[q]=set;}return matSets[q];};
    const dotGeo=new THREE.BoxGeometry(0.9,0.3,0.5),dotW=emitMat('#fff5d6'),dotR=emitMat('#ff4060');
    for(const rd of FW_ROADS){
      for(let u=0;u<rd.len-0.5;u+=SPAN){
        const a=fwAt(rd,u),b=fwAt(rd,Math.min(rd.len,u+SPAN)),g=new THREE.Group(),span=new THREE.Group();
        const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y,flat=Math.hypot(dx,dz);if(flat<0.5)continue;
        const f=fwAt(rd,Math.min(rd.len,u+SPAN/2)).f;if(f<0.03)continue;
        const {slab:slabMat,pillar:pillarMat,rail:railMat,dash:dashMat,lamp:lampMat,shadow:shadowMat}=mats(f);
        span.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);span.rotation.order='YZX';
        span.rotation.set(0,-Math.atan2(dz,dx),Math.atan2(dy,flat));
        const len=Math.hypot(flat,dy)+0.3;
        span.add(new THREE.Mesh(new THREE.BoxGeometry(len,0.7,5),slabMat));
        // Where this deck runs over another road's (a split or merge), leave out the rail, dash and lamp that would
        // cross it, so the two read as one wide deck dividing. lat: across this span, +1 = its local +z side.
        const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,my=(a.y+b.y)/2,nx=-dz/flat,nz=dx/flat;
        const overDeck=lat=>FW_ROADS.some(o=>o!==rd&&o.pts.some(([x,z],i)=>o.fade[i]>0.03&&Math.abs(o.ys[i]-my)<1.2&&Math.hypot(x-(mx+nx*lat),z-(mz+nz*lat))<2.7));
        for(const side of[-1,1])if(!overDeck(2.4*side)){const r=new THREE.Mesh(new THREE.BoxGeometry(len,0.3,0.25),railMat);r.position.set(0,0.5,2.4*side);span.add(r);}
        const shared=overDeck(0);
        if(!shared){const dash=new THREE.Mesh(new THREE.BoxGeometry(len*0.45,0.05,0.25),dashMat);dash.position.y=0.37;span.add(dash);}
        if(Math.round(u/SPAN)%2===0&&!overDeck(2.4)){const post=new THREE.Mesh(new THREE.BoxGeometry(0.2,2.4,0.2),pillarMat);post.position.set(0,1.5,2.4);span.add(post);
          const lamp=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.3,0.6),lampMat);lamp.position.set(0,2.75,2.1);span.add(lamp);}
        g.add(span);
        // a pillar, unless it would stand on a lower deck of another road
        const onDeck=FW_ROADS.some(o=>o!==rd&&o.pts.some(([x,z],i)=>o.ys[i]<a.y-1&&o.fade[i]>0.03&&Math.hypot(x-a.x,z-a.z)<3.5));
        const hung=rd.suspended&&rd.suspended[Math.min(rd.pts.length-1,rd.cum.findIndex(c=>c>=u))];   // hangs from a suspension bridge
        if(a.y>1.5&&!onDeck&&!hung){const p=new THREE.Mesh(pillarGeo,pillarMat);p.scale.set(1.2,a.y,1.2);p.position.set(a.x,a.y/2,a.z);g.add(p);}
        // its shadow on the ground (or water) below, for depth
        if(a.y>1){const sh=new THREE.Mesh(new THREE.PlaneGeometry(flat+0.3,5.5),shadowMat);sh.rotation.set(-Math.PI/2,0,-Math.atan2(dz,dx));   // lies flat, along the span
          sh.position.set((a.x+b.x)/2,-0.25,(a.z+b.z)/2);add(sh);}
        add(g);const o=registerOccluder(g),st=new THREE.Vector3(a.x,a.y,a.z),en=new THREE.Vector3(b.x,b.y,b.z);
        o.seg=[st.dot(RIGHT),st.dot(UP),en.dot(RIGHT),en.dot(UP)];
      }
      // an arch bridge (Sydney's Harbour Bridge): a steel arch over each long stretch of the road that crosses water,
      // hangers down to the deck, and a pylon at each end
      if(rd.arch){const archMat=litMat('#6a6090',0.3),glowMat=emitMat('#9fd8ff');let s0=null;
        for(let u=0;u<=rd.len;u+=2){const p=fwAt(rd,u),wet=inWater(p.x,p.z)&&p.f>0.5;
          if(wet&&s0===null)s0=u;
          if((!wet||u+2>rd.len)&&s0!==null){const s1=u,span=s1-s0;
            if(span>25){const a0=s0-6,a1=s1+6,H=Math.min(18,span*0.3);
              const at=t=>{const q=fwAt(rd,a0+(a1-a0)*t);return [q.x,q.y+0.4+H*4*t*(1-t),q.z,q];};
              for(let i=0;i<16;i++){const [x0,y0,z0,q]=at(i/16),[x1,y1,z1]=at((i+1)/16);
                for(const side of[-1,1]){const ox=-q.dz*2.7*side,oz=q.dx*2.7*side,a=new THREE.Vector3(x0+ox,y0,z0+oz),b=new THREE.Vector3(x1+ox,y1,z1+oz);
                  const rib=add(new THREE.Mesh(new THREE.BoxGeometry(0.7,a.distanceTo(b)+0.2,0.7),archMat));
                  rib.position.copy(a).add(b).multiplyScalar(0.5);rib.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());
                  if(i%2===0&&i>0){const h=y0-q.y;const hg=add(new THREE.Mesh(new THREE.BoxGeometry(0.2,h,0.2),glowMat));hg.position.set(x0+ox,q.y+h/2,z0+oz);}}}
              for(const t of[0,1]){const [x,,z,q]=at(t);const py=add(new THREE.Mesh(new THREE.BoxGeometry(4,q.y+7,7),archMat));py.position.set(x,(q.y+7)/2,z);
                py.rotation.y=-Math.atan2(q.dz,q.dx);}
            }
            s0=null;}}}
      // two-way on the main roads (driving on the right: white headlights coming, red tail lights going); ramps and
      // connectors are one-way, single file and quieter
      const one=!!rd.oneway,n=one?Math.max(1,Math.round(rd.len/90)):Math.max(2,Math.round(rd.len/30));
      for(let i=0;i<n;i++){const fwd=one||i%2===0,m=add(new THREE.Mesh(dotGeo,fwd?dotW:dotR));
        m.userData={rd,s:Math.random()*rd.len,v:(fwd?1:-1)*rand(14,22)*(one?0.8:1),lane:one?0:fwd?1.4:-1.4};traffic.push(m);}
    }
  }
  TRACK.tags=[...(TRACK_SHAPE.slow>0.3?['tight']:[]),...(TRACK_SHAPE.straight>0.5?['straights']:[])];

  // the landmark, placed by its rule (see placeLandmark)
  const spot=placeLandmark(def),lg=new THREE.Group(),top=buildLandmark(lg,{...def.landmark,span:spot.span,carries:def.roads&&def.roads.kind==='span'});
  const lmPos=new THREE.Vector3(spot.x,0,spot.z);
  const hideLm=new URLSearchParams(location.search).has('nolm');   // ?nolm hides the landmarks, for looking at the map alone
  lg.position.copy(lmPos);lg.rotation.y=spot.rot;lg.visible=!hideLm;add(lg);registerOccluder(lg);
  // models that face the camera: the Sphere's eye (turned and tilted), flat signs (turned only)
  const faceCam=(g,rot)=>g.traverse(o=>{const f=o.userData.faceCam;if(!f)return;
    if(f==='yaw')o.rotation.y=Math.atan2(DIR.x,DIR.z)-rot;else{o.rotation.y=Math.atan2(-DIR.z,DIR.x)-rot;o.rotation.z=PITCH;}});
  faceCam(lg,spot.rot);
  // extra landmark models the water sketch places (Hong Kong's wheel)
  const propFit=WATER_PROPS.map(p=>{const g=new THREE.Group(),t=buildLandmark(g,p.lm)*(p.lm.scale||1);g.scale.setScalar(p.lm.scale||1);g.position.set(p.x,0,p.z);g.rotation.y=p.rot;faceCam(g,p.rot);g.visible=!hideLm;add(g);if(p.lm.kind!=='neonrow')registerOccluder(g);   // low frontages never hide a car
    return new THREE.Vector3(p.x,t,p.z);});

  // what the full-track camera must fit: the circuit and the landmark (a bridge by both its ends)
  Object.assign(FIT,{minR:1e9,maxR:-1e9,minU:1e9,maxU:-1e9});
  const lmFit=[lmPos.clone().setY(top),...propFit];
  // the landmark's whole footprint, not just its middle (a long one like Marina Bay Sands would otherwise be cut off)
  {const rr=LANDMARK_R[def.landmark.kind]||7;for(let k=0;k<8;k++){const a=k*Math.PI/4;lmFit.push(lmPos.clone().add(new THREE.Vector3(Math.cos(a)*rr*1.8,0,Math.sin(a)*rr*1.8)));}}
  if(def.landmark.kind==='suspension')for(const t of[-(spot.span||34),spot.span||34])lmFit.push(lmPos.clone().add(new THREE.Vector3(Math.cos(-spot.rot)*t,5,Math.sin(-spot.rot)*t)));
  const fit=p=>{const R=p.dot(RIGHT),U=p.dot(UP);
    FIT.minR=Math.min(FIT.minR,R-HW);FIT.maxR=Math.max(FIT.maxR,R+HW);FIT.minU=Math.min(FIT.minU,U-HW);FIT.maxU=Math.max(FIT.maxU,U+HW);};
  P.filter((_,i)=>i%6===0).forEach(fit);
  // Freeway junctions only nudge the view: each may widen it by at most 12% of the circuit's size on its side, so the
  // circuit is never squeezed small to show scenery. The landmark is always shown whole.
  const cR=(FIT.maxR-FIT.minR)*0.12,cU=(FIT.maxU-FIT.minU)*0.12,box={...FIT};
  for(const [x,z] of FW_FOCUS){const p=new THREE.Vector3(x,FW_Y,z),R=p.dot(RIGHT),U=p.dot(UP);
    const R2=Math.max(box.minR-cR,Math.min(box.maxR+cR,R)),U2=Math.max(box.minU-cU,Math.min(box.maxU+cU,U));
    FIT.minR=Math.min(FIT.minR,R2);FIT.maxR=Math.max(FIT.maxR,R2);FIT.minU=Math.min(FIT.minU,U2);FIT.maxU=Math.max(FIT.maxU,U2);}
  lmFit.forEach(fit);
  for(const [x,z] of WATER_FOCUS)fit(new THREE.Vector3(x,0,z));
  applyWeather();
}
// The night's conditions on the track: a blackout darkens the middle sector's neon and its road.
function applyWeather(){
  const dark=weatherId()==='blackout';
  DARK=P.map((_,i)=>dark&&i>=N/3&&i<2*N/3);
  SECTOR_MATS.forEach((m,s)=>m.uniforms.uColor.value.set(SECTOR_COLORS[s]).multiplyScalar(dark&&s===1?0.12:1));
}
loadTrack(TRACKS[0]);
