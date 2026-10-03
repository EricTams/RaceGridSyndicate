// Water around a circuit: atmosphere only, so it never crosses the road or touches the pits.
// A city with a sketch in data/waters.js gets a caricature of its real water (see there). Otherwise def.water:
//   {kind:'coast', side}          sea filling one side of the map, its shore following the circuit's edge
//   {kind:'lake', side}           the same, with a shore that bows away in a long curve
//   {kind:'river', dir, bend, w}  a band w wide running along dir beside the circuit
//   {kind:'canals', dir, n}       n thin parallel channels beside the circuit
// Directions are compass points: north is -z, east is +x.
// Everything becomes features: {poly} (a closed shape) or {band, w} (a path w wide), each water or land (an island
// or a pier drawn over the water), with a drift direction for the glints on it.
'use strict';

const WATER_EDGE=600;   // the ground (and every water shape) runs this far out from the middle
const WATER_CLEAR=HW+7; // a shore stays at least this far from the road's centreline (the pit lane fits inside)
const COMPASS={N:[0,-1],S:[0,1],E:[1,0],W:[-1,0]};
const WATER_DIRS={'E-W':[1,0],'N-S':[0,1],'NE-SW':[Math.SQRT1_2,-Math.SQRT1_2],'NW-SE':[Math.SQRT1_2,Math.SQRT1_2]};

// A small seeded generator, so a city's water is the same every time its track loads.
function waterRng(id){let s=0;for(const ch of id)s=(s*31+ch.charCodeAt(0))>>>0;
  return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

function smoothArr(a,r,passes){
  for(let p=0;p<passes;p++){const b=a.slice();
    for(let i=0;i<a.length;i++){let t=0,n=0;for(let d=-r;d<=r;d++){const j=i+d;if(j>=0&&j<a.length){t+=b[j];n++;}}a[i]=t/n;}}
  return a;
}

// The pit lane and its garage pads, which water must never touch.
function pitPoints(){
  const n=Math.round((PIT_HALF+PIT_RAMP+6)/DS),out=[];
  for(let k=-n;k<=n;k++){const i=mod(k,N);for(const lat of [PIT_LAT,PIT_LAT+PIT_SIDE*3])out.push([P[i].x+NRM[i].x*lat,P[i].z+NRM[i].z*lat]);}
  return out;
}
const dryPoints=()=>P.filter((_,i)=>i%2===0).map(p=>[p.x,p.z]).concat(pitPoints());

// A line beside the circuit, sampled along direction a and pushed out along o just past the road and pits: at each
// point along it, how far out (h) it must sit. It hugs the circuit loosely and never cuts into it.
function shoreCurve(o,a){
  const us=[],dry=dryPoints();
  for(let u=-WATER_EDGE;u<=WATER_EDGE;u+=6)us.push(u);
  const far=Math.max(...dry.map(([x,z])=>x*o[0]+z*o[1]));
  const need=us.map(u=>{let m=-1e9;for(const [x,z] of dry){if(Math.abs(x*a[0]+z*a[1]-u)<WATER_CLEAR*2)m=Math.max(m,x*o[0]+z*o[1]);}
    return m>-1e9?m+WATER_CLEAR:far+WATER_CLEAR+25;});
  const h=smoothArr(need.slice(),4,6).map((v,i)=>Math.max(v,need[i]));
  smoothArr(h,2,2);for(let i=0;i<h.length;i++)h[i]=Math.max(h[i],need[i]);
  return {us,h,need,far};
}
const at=(u,d,a,o)=>[u*a[0]+d*o[0],u*a[1]+d*o[1]];

// Sea or lake filling one side of the map (a lake's shore bows away in a long curve).
function shorePolygon(o,lake,rng){
  const a=[-o[1],o[0]],{us,h}=shoreCurve(o,a),ph=rng()*6.28,bow=lake?55:0,E=WATER_EDGE-10;
  const shore=us.map((u,i)=>at(u,h[i]+Math.sin(u/23+ph)*1.5+bow*(u/WATER_EDGE)**2,a,o));
  return shore.concat([at(E,E,a,o),at(-E,E,a,o)]);
}
// A channel w wide whose near bank hugs the circuit on side o (Victoria Harbour, the Malecon).
function hugBand(o,w,rng){
  const a=[-o[1],o[0]],{us,h}=shoreCurve(o,a),ph=rng()*6.28;
  const near=us.map((u,i)=>at(u,h[i]+Math.sin(u/23+ph)*1.5,a,o)),far=us.map((u,i)=>at(u,h[i]+w+Math.sin(u/31+ph)*4,a,o));
  return near.concat(far.reverse());
}

// Bands running along direction a beside the circuit: the first one's near bank follows the circuit's edge,
// each further one sits `gap` beyond the last. Bends only ever swing away from the circuit.
function besideBands(a,widths,gap,amp,rng){
  const sides=[[-a[1],a[0]],[a[1],-a[0]]].map(o=>{const c=shoreCurve(o,a);
    return {o,c,slack:c.h.reduce((t,v)=>t+v,0)/c.h.length-c.far};});
  const {o,c}=sides[0].slack<=sides[1].slack?sides[0]:sides[1];
  const ph=rng()*6.28,out=[];let off=0;
  const bank=c.us.map((u,i)=>Math.max(c.need[i],c.h[i]+amp*(1+Math.sin(u/70+ph))/2));
  for(const w of widths){
    const near=c.us.map((u,i)=>at(u,bank[i]+off,a,o)),farB=c.us.map((u,i)=>at(u,bank[i]+off+w,a,o));
    out.push(near.concat(farB.reverse()));off+=w+gap;
  }
  return out;
}

// A smooth path through control points (open for a band, closed for a shape).
function smoothPath(pts,closed){
  if(pts.length<3)return pts;
  const c=new THREE.CatmullRomCurve3(pts.map(([x,z])=>new THREE.Vector3(x,0,z)),closed,'centripetal');
  let len=0;for(let i=1;i<pts.length;i++)len+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
  return c.getPoints(Math.max(8,Math.round(len/3))).map(v=>[v.x,v.z]);
}

// A city sketch (data/waters.js) placed on the circuit: frame units put the circuit's bounding box at [-1,1] on
// both axes (so shapes stretch with the circuit), turned by `turn` quarter turns. Widths stay in world units.
// Any water that lands too near the road or pits is pushed back out (see repel), so sketches can be loose.
function sketchFeatures(sketch,turn,rng,dry){
  const xs=P.map(p=>p.x),zs=P.map(p=>p.z),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2;
  let rx=(Math.max(...xs)-Math.min(...xs))/2,rz=(Math.max(...zs)-Math.min(...zs))/2;
  if(sketch.some(s=>s.uniform))rx=rz=Math.min(rx,rz);
  const rot=([x,y])=>{for(let k=0;k<turn;k++)[x,y]=[-y,x];return [x,y];};
  const place=pt=>{const [x,y]=rot(pt);return [cx+x*rx,cz+y*rz];};
  const out=[];let moved=0,anchor=null,bridge=null;const props=[],roads=[],focus=[];
  const repelled=(pts,need)=>{const r=repel(pts,dry,need);moved+=r.moved;return r.pts;};
  for(const s of sketch){
    if(s.uniform||s.turn!==undefined)continue;
    if(s.road){const r=smoothPath(s.road.map(place),false);if(s.join)r.join=true;roads.push(r);continue;}   // join: starts on another road
    if(s.reclaim){   // land round the circuit: its outline pushed out by the margin, drawn as land over any water
      const hull=[],pts=dry.filter((_,i)=>i%3===0),mx=pts.reduce((t,p)=>t+p[0],0)/pts.length,mz=pts.reduce((t,p)=>t+p[1],0)/pts.length;
      for(let k=0;k<64;k++){const a=k*Math.PI/32,dx=Math.cos(a),dz=Math.sin(a);let far=0;
        for(const [x,z] of pts){const t=(x-mx)*dx+(z-mz)*dz,off=Math.abs(-(x-mx)*dz+(z-mz)*dx);if(off<12&&t>far)far=t;}
        hull.push([mx+dx*(far+s.reclaim),mz+dz*(far+s.reclaim)]);}
      out.push({poly:hull,land:true,drift:[0,0]});continue;}
    if(s.bridge){bridge=s.bridge.map(place);continue;}
    if(s.focus){focus.push(...s.focus.map(place));continue;}
    if(s.prop){const [x,z]=place(s.at),h=rot(s.heading||[1,0]);props.push({lm:s.prop,x,z,rot:-Math.atan2(h[1]*rz,h[0]*rx)});continue;}
    if(s.landmark){const h=rot(s.heading||[1,0]);anchor=[...place(s.landmark),-Math.atan2(h[1]*rz,h[0]*rx)];
      if(s.pad){   // land under the landmark: a rounded rectangle, long side along its heading
        const [L,W]=s.pad,a=-anchor[2],u=[Math.cos(a),Math.sin(a)],v=[-u[1],u[0]],rr=Math.min(L,W)*0.3,pts=[];
        for(const [cx,cz,a0] of[[L/2-rr,W/2-rr,0],[-(L/2-rr),W/2-rr,90],[-(L/2-rr),-(W/2-rr),180],[L/2-rr,-(W/2-rr),270]])
          for(let d=0;d<=90;d+=30){const t=(a0+d)*Math.PI/180,px=cx+Math.cos(t)*rr,pz=cz+Math.sin(t)*rr;
            pts.push([anchor[0]+u[0]*px+v[0]*pz,anchor[1]+u[1]*px+v[1]*pz]);}
        out.push({poly:pts,land:true,drift:[0,0]});}
      continue;}
    const land=!!s.land,drift=s.drift?rot(s.drift):[0.2,0];
    if(s.hug){const o=rot(COMPASS[s.hug]);
      out.push({poly:s.w?hugBand(o,s.w,rng):shorePolygon(o,false,rng),land,drift:s.drift?drift:[-o[1]*0.3,o[0]*0.3]});}
    else if(s.band||s.arc){let pts;
      if(s.arc){const [ax,ay,r,a0,a1]=s.arc;pts=[];
        for(let d=a0;d<=a1+1e-6;d+=(a1-a0)/24){const t=d*Math.PI/180;pts.push(place([ax+r*Math.cos(t),ay+r*Math.sin(t)]));}}
      else pts=s.band.map(place);
      pts=smoothPath(pts,false);if(!land)pts=repelled(pts,s.w/2+WATER_CLEAR);
      out.push({band:pts,w:s.w,land,drift});}
    else if(s.poly){
      // straight:true keeps long edges straight (only the corners round off): without it a shape of a few far-apart
      // corners is smoothed into a curve that bulges out between them
      let src=s.poly;if(s.straight){src=[];s.poly.forEach((p,i)=>{const q=s.poly[(i+1)%s.poly.length],n=Math.max(1,Math.ceil(Math.hypot(q[0]-p[0],q[1]-p[1])/0.25));
        for(let k=0;k<n;k++)src.push([p[0]+(q[0]-p[0])*k/n,p[1]+(q[1]-p[1])*k/n]);});}
      let pts=smoothPath(src.map(place),true);if(!land)pts=repelled(pts,WATER_CLEAR);out.push({poly:pts,land,drift});}
  }
  return {feats:out,moved,anchor,bridge,props,roads,focus};
}

// Push each point at least `need` from every dry point (road and pits), then smooth the path a little so the
// pushed stretch bends away instead of kinking. Returns the points and how far they moved in total.
function repel(pts,dry,need){
  const out=pts.map(p=>p.slice());let moved=0;
  for(let it=0;it<6;it++){let any=false;
    for(const p of out){let best=1e9,q=null;
      for(const d of dry){const dx=p[0]-d[0],dz=p[1]-d[1],dd=dx*dx+dz*dz;if(dd<best){best=dd;q=d;}}
      const dist=Math.sqrt(best);
      if(dist<need){const k=(need-dist+0.5)/(dist||1);p[0]+=(p[0]-q[0])*k;p[1]+=(p[1]-q[1])*k;moved+=need-dist;any=true;}}
    if(!any)break;
    const xs=smoothArr(out.map(p=>p[0]),1,1),zs=smoothArr(out.map(p=>p[1]),1,1);out.forEach((p,i)=>{p[0]=xs[i];p[1]=zs[i];});
  }
  return {pts:out,moved};
}

function inPoly(x,z,poly){let c=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,zi]=poly[i],[xj,zj]=poly[j];
    if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)c=!c;}
  return c;}
function nearPath(x,z,path,r){
  for(let i=1;i<path.length;i++){const [ax,az]=path[i-1],[bx,bz]=path[i],dx=bx-ax,dz=bz-az,l=dx*dx+dz*dz||1;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l)),ex=ax+dx*t-x,ez=az+dz*t-z;if(ex*ex+ez*ez<r*r)return true;}
  return false;}
const inFeature=(f,x,z)=>f.poly?inPoly(x,z,f.poly):nearPath(x,z,f.band,f.w/2);
// Water here: inside some water feature and not on land drawn over it.
function isWater(feats,x,z){return feats.some(f=>!f.land&&inFeature(f,x,z))&&!feats.some(f=>f.land&&inFeature(f,x,z));}

// This track's water features.
function waterFeatures(def){
  const rng=waterRng(def.id),sketch=typeof WATER_SKETCHES!=='undefined'&&WATER_SKETCHES[def.id];WATER_ANCHOR=null;WATER_BRIDGE=null;WATER_PROPS=[];WATER_ROADS=[];WATER_FOCUS=[];
  const saved=savedScenery(def);
  if(sketch&&saved&&saved.turn!==undefined){const {feats,anchor,bridge,props,roads,focus}=sketchFeatures(sketch,saved.turn,waterRng(def.id),dryPoints());
    WATER_TURN=saved.turn;WATER_ANCHOR=anchor;WATER_BRIDGE=bridge;WATER_PROPS=props;WATER_ROADS=roads;WATER_FOCUS=focus;return feats;}
  if(sketch){
    // the quarter turn that fits best: little water pushed away from the road (a sketch that fights the circuit
    // distorts), and as much water as possible around the circuit, where the camera sees it
    const dry=dryPoints(),xs=P.map(p=>p.x),zs=P.map(p=>p.z);
    const x0=Math.min(...xs)-40,x1=Math.max(...xs)+40,z0=Math.min(...zs)-40,z1=Math.max(...zs)+40;
    let best=null,bestScore=1e18;
    const fixed=sketch.find(s=>s.turn!==undefined);
    for(let turn=0;turn<4;turn++){if(fixed&&turn!==fixed.turn)continue;const {feats,moved,anchor,bridge,props,roads,focus}=sketchFeatures(sketch,turn,waterRng(def.id),dry);
      let vis=0,n=0;for(let x=x0;x<=x1;x+=8)for(let z=z0;z<=z1;z+=8){n++;if(isWater(feats,x,z))vis++;}
      const score=moved*0.05-100*vis/n;if(score<bestScore){bestScore=score;best=feats;WATER_TURN=turn;WATER_ANCHOR=anchor;WATER_BRIDGE=bridge;WATER_PROPS=props;WATER_ROADS=roads;WATER_FOCUS=focus;}}
    return best;
  }
  const w=def.water;if(!w)return [];
  if(w.kind==='coast'||w.kind==='lake'){const o=COMPASS[w.side];
    return [{poly:shorePolygon(o,w.kind==='lake',rng),drift:[-o[1]*0.3,o[0]*0.3]}];}
  const a=WATER_DIRS[w.dir]||[1,0];
  if(w.kind==='river'){const amp={none:0,slight:12,strong:30}[w.bend]||0;
    return besideBands(a,[w.w||16],0,amp,rng).map(poly=>({poly,drift:a}));}
  if(w.kind==='canals')
    return besideBands(a,Array(w.n||1).fill(5),9,6,rng).map(poly=>({poly,drift:[a[0]*0.5,a[1]*0.5]}));
  return [];
}

// All the water painted into one texture, so overlapping features merge into one body with a single shore:
// water shapes and bands (round-ended) in, then land, islands and a verge along the road and pits cut out. Each
// water pixel is then shaded by how far it is from land: a bright bank at the edge, a band of shallows, then deep
// water. Drawn as one flat plane; land pixels are transparent, so the ground shows through.
const WATER_TEX_HALF=400,WATER_TEX_PX=2;   // world units covered either side of the middle; pixels per unit
// The painted water as a lookup (1 = water), so "is this water?" is one array read: see inWater.
let WATER_MASK=null;
// Saved placements for this track (data/scenery.js), unless the page was opened with ?bake to search afresh.
const BAKING=new URLSearchParams(location.search).has('bake');
const savedScenery=def=>!BAKING&&typeof SCENERY!=='undefined'&&SCENERY[def.id]||null;
let WATER_TURN=0;   // the quarter turn the sketch was placed with (saved by the scenery bake)
let WATER_ANCHOR=null;   // where the sketch pins the landmark (world x,z), if it does
let WATER_BRIDGE=null;
let WATER_PROPS=[];
let WATER_FOCUS=[];   // sketch points the full-track camera must show (a water feature the city is known by)
let WATER_ROADS=[];      // freeway paths the sketch traces (world points), used instead of generated ones      // extra landmark models the sketch places: {lm, x, z, rot}   // where the sketch pins the freeway bridge (two world points, bank to bank), if it does
function waterMesh(feats){
  const S=WATER_TEX_HALF*2*WATER_TEX_PX,cv=document.createElement('canvas');cv.width=cv.height=S;
  const g=cv.getContext('2d'),k=WATER_TEX_PX,X=x=>(x+WATER_TEX_HALF)*k;
  const path=(pts,closed)=>{g.beginPath();pts.forEach(([x,z],i)=>i?g.lineTo(X(x),X(z)):g.moveTo(X(x),X(z)));if(closed)g.closePath();};
  const draw=f=>{if(f.poly){path(f.poly,true);g.fill();}else{g.lineWidth=f.w*k;path(f.band,false);g.stroke();}};
  g.fillStyle=g.strokeStyle='#fff';g.lineCap=g.lineJoin='round';
  feats.filter(f=>!f.land).forEach(draw);
  g.globalCompositeOperation='destination-out';
  feats.filter(f=>f.land).forEach(draw);
  g.lineWidth=2*(HW+3)*k;path(P.map(p=>[p.x,p.z]),true);g.stroke();
  const n=Math.round((PIT_HALF+PIT_RAMP+6)/DS),pit=[];
  for(let j=-n;j<=n;j++){const i=mod(j,N),lat=PIT_SIDE*(HW+6);pit.push([P[i].x+NRM[i].x*lat,P[i].z+NRM[i].z*lat]);}
  g.lineWidth=2*7*k;path(pit,false);g.stroke();
  // distance (in pixels, chamfer) from each water pixel to the nearest land pixel
  const img=g.getImageData(0,0,S,S),a=img.data,D=new Float32Array(S*S),INF=1e9;
  for(let i=0;i<S*S;i++)D[i]=a[i*4+3]>127?INF:0;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=y*S+x;if(!D[i])continue;let d=D[i];
    if(x>0)d=Math.min(d,D[i-1]+1);if(y>0){d=Math.min(d,D[i-S]+1);if(x>0)d=Math.min(d,D[i-S-1]+1.41);if(x<S-1)d=Math.min(d,D[i-S+1]+1.41);}D[i]=d;}
  for(let y=S-1;y>=0;y--)for(let x=S-1;x>=0;x--){const i=y*S+x;if(!D[i])continue;let d=D[i];
    if(x<S-1)d=Math.min(d,D[i+1]+1);if(y<S-1){d=Math.min(d,D[i+S]+1);if(x<S-1)d=Math.min(d,D[i+S+1]+1.41);if(x>0)d=Math.min(d,D[i+S-1]+1.41);}D[i]=d;}
  const BANK=[0x1f,0x5e,0x6b],SHALLOW=[0x0e,0x31,0x3e],DEEP=[0x0a,0x25,0x30];
  for(let i=0;i<S*S;i++){const d=D[i];
    if(!d){a[i*4+3]=0;continue;}
    const c=d<=1*k?BANK:d<=3.5*k?SHALLOW:DEEP;a[i*4]=c[0];a[i*4+1]=c[1];a[i*4+2]=c[2];a[i*4+3]=255;}
  WATER_MASK=new Uint8Array(S*S);for(let i=0;i<S*S;i++)WATER_MASK[i]=D[i]?1:0;
  g.globalCompositeOperation='copy';g.putImageData(img,0,0);
  const tex=new THREE.CanvasTexture(cv);tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(2*WATER_TEX_HALF,2*WATER_TEX_HALF),new THREE.MeshBasicMaterial({map:tex,alphaTest:0.5}));
  m.rotation.x=-Math.PI/2;m.position.y=-0.3;
  return m;
}
