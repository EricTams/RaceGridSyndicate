// The city's elevated freeways: scenery only, so they never cross the circuit or its pits. Each city gets a small
// network from its style (def.roads, from the dressing sheet in sim/build_tracks.py):
//   {kind:'line', dir}        a freeway beside the circuit, a branch splitting off toward the map edge and an exit
//                             ramp dropping to ground near the circuit
//   {kind:'stack', dir, dir2} two freeways crossing at a stack interchange, one flying over the other, with curved
//                             connector ramps between them
//   {kind:'shore', side}      a viaduct along the water's edge nearest the circuit (on compass side 'N','S','E','W'
//                             if given), with an exit ramp
//   {kind:'bridge'}           a freeway running out across the nearest water, with an exit ramp
//   {kind:'frame', skew}      an elevated ring road framing the circuit as a parallelogram (its cross sides lean east by
//                             skew per unit north), with spurs off its two southern corners; sides:['S'] keeps only the
//                             south side, running just south of the circuit only as far as the land does
//   {kind:'span'}             the freeway crosses the water on the city's landmark bridge (the Golden Gate), no piers
//                             under the suspended stretch
// A road is {pts:[[x,z],...], ys:[height,...]}, sampled every few units.
'use strict';

const FW_EXTENT=380,FW_CLEAR=HW+10;   // how far roads run from the middle; how far they keep from the road's centreline
let FW_ROADS=[],FW_FOCUS=[];   // FW_FOCUS: junction points the full-track camera should include

// A freeway along d beside the circuit, on side (+1/-1) of it: it follows the circuit's outline just clear of the
// road and pits, smoothed into long curves, and bends away from the circuit past its ends.
function fwBeside(d,side,dry){
  const o=[-d[1]*side,d[0]*side],us=[],far=Math.max(...dry.map(([x,z])=>x*o[0]+z*o[1]));
  for(let u=-FW_EXTENT;u<=FW_EXTENT;u+=6)us.push(u);
  const need=us.map(u=>{let m=-1e9;for(const [x,z] of dry)if(Math.abs(x*d[0]+z*d[1]-u)<30)m=Math.max(m,x*o[0]+z*o[1]);
    return m>-1e9?m+FW_CLEAR:far+FW_CLEAR+40;});
  const h=smoothArr(need.slice(),8,10);for(let pass=0;pass<3;pass++){for(let i=0;i<h.length;i++)h[i]=Math.max(h[i],need[i]);smoothArr(h,4,3);}
  for(let i=0;i<h.length;i++)h[i]=Math.max(h[i],need[i]);
  return fwClear(us.map((u,i)=>[u*d[0]+h[i]*o[0],u*d[1]+h[i]*o[1]]),dry);
}
// Pushed clear of the circuit, then smoothed so the pushing leaves long bends, not kinks; a smoothed point is kept
// only where it stays clear.
function fwClear(pts,dry){
  let p=repel(pts,dry,FW_CLEAR).pts;
  for(let pass=0;pass<4;pass++){
    const xs=smoothArr(p.map(q=>q[0]),3,2),zs=smoothArr(p.map(q=>q[1]),3,2);
    p=p.map((q,i)=>fwDry(xs[i],zs[i],dry)>=FW_CLEAR-1?[xs[i],zs[i]]:q);
  }
  return p;
}
const fwWet=pts=>pts.filter(([x,z])=>inWater(x,z)).length/pts.length;
const fwFlat=(pts,y=FW_Y)=>({pts,ys:pts.map(()=>y)});
const fwNorm=v=>{const l=Math.hypot(v[0],v[1])||1;return [v[0]/l,v[1]/l];};
const fwDry=(x,z,dry)=>{let m=1e9;for(const [a,b] of dry){const d=(a-x)**2+(b-z)**2;if(d<m)m=d;}return Math.sqrt(m);};
const fwInView=([x,z])=>Math.abs(x)<220&&Math.abs(z)<170;

// A smooth curve from a (heading ta) to b (arriving heading tb), sampled every ~4 units.
function fwCurve(a,ta,b,tb,round=0.45){
  const L=Math.hypot(b[0]-a[0],b[1]-a[1]),k=L*round,pts=[];
  const c1=[a[0]+ta[0]*k,a[1]+ta[1]*k],c2=[b[0]-tb[0]*k,b[1]-tb[1]*k],n=Math.max(4,Math.round(L/4));
  for(let i=0;i<=n;i++){const t=i/n,u=1-t;
    pts.push([u*u*u*a[0]+3*u*u*t*c1[0]+3*u*t*t*c2[0]+t*t*t*b[0],u*u*u*a[1]+3*u*u*t*c1[1]+3*u*t*t*c2[1]+t*t*t*b[1]]);}
  return pts;
}
const fwTan=(pts,i)=>fwNorm([pts[Math.min(pts.length-1,i+1)][0]-pts[Math.max(0,i-1)][0],pts[Math.min(pts.length-1,i+1)][1]-pts[Math.max(0,i-1)][1]]);

// An exit ramp: leaves the main road heading the same way, drifts toward the circuit and comes down to ground,
// ending clear of the circuit. Tries points along the main road (in view) until one fits.
function fwExit(main,dry,others=[]){
  const cx=0,cz=0;
  for(let tries=0;tries<main.length;tries+=3){
    const i=Math.floor(main.length/2)+((tries/3)%2?1:-1)*Math.floor(tries/2);if(i<2||i>main.length-3||!fwInView(main[i]))continue;
    const t=fwTan(main,i),toward=fwNorm([cx-main[i][0],cz-main[i][1]]),n=[-t[1],t[0]],s0=Math.sign(n[0]*toward[0]+n[1]*toward[1])||1;
    for(const s of[s0,-s0]){   // toward the circuit first, then the other side
      const end=[main[i][0]+t[0]*70+n[0]*s*12,main[i][1]+t[1]*70+n[1]*s*12];
      const pts=fwCurve(main[i],t,end,t),n1=pts.length-1;
      if(pts.slice(2).some(([x,z])=>fwDry(x,z,dry)<FW_CLEAR-2))continue;
      if(!fwLandsDry(pts,Math.floor(n1/2),n1))continue;   // comes down over land, never into the water
      if(others.some(o=>o&&o.pts!==main&&fwCrosses(pts.slice(4),o.pts)))continue;   // never across another road
      const e=t=>t*t*(3-2*t);return {pts,ys:pts.map((_,k)=>0.25+(FW_Y-0.25)*(1-e(k/n1))),ramps:[false,false],fades:[false,true],at:i,side:s,oneway:1};
    }
  }
  return null;
}
// A road may only come down on dry land: every point of its low stretch (from index a to b), deck edges included,
// must be off the water. Over water, roads stay up as bridges and viaducts.
function fwLandsDry(pts,a,b){
  for(let i=Math.max(0,a);i<=Math.min(pts.length-1,b);i++){const [x,z]=pts[i],t=fwTan(pts,i);
    if(inWater(x,z)||inWater(x-t[1]*3,z+t[0]*3)||inWater(x+t[1]*3,z-t[0]*3))return false;}
  return true;
}
// The on-ramp that pairs with an exit: on the same side, a little past where the exit lands, climbing from the
// ground to rejoin the main road heading the same way (a diamond interchange). Its ground end dithers in.
// An exit and its on-ramp, or neither: a lone exit reads as a road to nowhere.
function fwDiamond(main,dry,others){
  const ex=fwExit(main,dry,others),on=fwOnRamp(main,dry,ex,others);
  if(!ex||!on)return [];
  FW_FOCUS.push(ex.pts[ex.pts.length-1]);return [ex,on];
}
function fwOnRamp(main,dry,ex,others=[]){
  if(!ex)return null;
  const cum=[0];for(let k=1;k<main.length;k++)cum.push(cum[k-1]+Math.hypot(main[k][0]-main[k-1][0],main[k][1]-main[k-1][1]));
  for(const side of[ex.side,-ex.side])for(const ahead of[170,200,230]){
    const j=cum.findIndex(c=>c>=cum[ex.at]+ahead);if(j<2||j>main.length-3)continue;
    const t=fwTan(main,j),n=[-t[1],t[0]],start=[main[j][0]-t[0]*70+n[0]*side*12,main[j][1]-t[1]*70+n[1]*side*12];
    const pts=fwCurve(start,t,main[j],t);
    if(pts.slice(0,-2).some(([x,z])=>fwDry(x,z,dry)<FW_CLEAR-2))continue;
    if(!fwLandsDry(pts,0,Math.floor((pts.length-1)/2)))continue;   // climbs from dry land, never out of the water
    if(others.some(o=>o&&fwCrosses(pts.slice(0,-4),o.pts)))continue;   // never across another road at the same height
    const n1=pts.length-1,e=u=>u*u*(3-2*u);
    return {pts,ys:pts.map((_,k)=>0.25+(FW_Y-0.25)*e(k/n1)),ramps:[false,false],fades:[true,false],oneway:1};
  }
  return null;
}
// Whether two paths cross (in plan).
function fwCrosses(p,q){
  for(let i=1;i<p.length;i++)for(let j=1;j<q.length;j++){const a=p[i-1],b=p[i],c=q[j-1],d=q[j];
    const den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);if(!den)continue;
    const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den,u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)return true;}
  return false;
}
// A branch splitting off the main road at a shallow angle, away from the circuit, and running to the map edge.
function fwBranch(main,dry){
  const i=fwNearEnd(main,dry,1),t=fwTan(main,i),n=[-t[1],t[0]];FW_FOCUS.push(main[i]);
  const s=Math.sign(n[0]*main[i][0]+n[1]*main[i][1])||1,away=fwNorm([t[0]+n[0]*s*0.5,t[1]+n[1]*s*0.5]);
  const end=[main[i][0]+away[0]*260,main[i][1]+away[1]*260];
  const pts=fwClear(fwCurve(main[i],t,end,away),dry);
  return {...fwFlat(pts),ramps:[false,true],reach:140};   // joined to the main road at its start; runs further out
}

// The index along a road just past the circuit's end (dir +1: the road's forward end, -1: its start).
function fwNearEnd(pts,dry,dir){
  const t=fwNorm([pts[pts.length-1][0]-pts[0][0],pts[pts.length-1][1]-pts[0][1]]);
  const end=dir>0?Math.max(...dry.map(([x,z])=>x*t[0]+z*t[1]))+25:Math.min(...dry.map(([x,z])=>x*t[0]+z*t[1]))-25;
  let best=0,bd=1e9;pts.forEach(([x,z],i)=>{const d=Math.abs(x*t[0]+z*t[1]-end);if(d<bd){bd=d;best=i;}});
  return Math.max(2,Math.min(pts.length-3,best));
}
// A stack interchange: b flies over a where they cross, and two curved connectors link them in the outer quadrants.
function fwStack(a,b){
  let X=null,ia=0,ib=0;
  for(let i=1;i<a.length&&!X;i++)for(let j=1;j<b.length;j++){const p=a[i-1],q=a[i],r=b[j-1],s=b[j];
    const d=(q[0]-p[0])*(s[1]-r[1])-(q[1]-p[1])*(s[0]-r[0]);if(!d)continue;
    const t=((r[0]-p[0])*(s[1]-r[1])-(r[1]-p[1])*(s[0]-r[0]))/d,u=((r[0]-p[0])*(q[1]-p[1])-(r[1]-p[1])*(q[0]-p[0]))/d;
    if(t>=0&&t<=1&&u>=0&&u<=1){X=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];ia=i;ib=j;break;}}
  const lift=([x,z])=>{if(!X)return FW_Y;const t=Math.max(0,1-Math.hypot(x-X[0],z-X[1])/90);return FW_Y+5*t*t*(3-2*t);};   // eases up over 90 units
  const A=fwFlat(a),B={pts:b,ys:b.map(lift),reach:220};   // B runs further out, so its ends come down well clear of the flyover
  if(!X)return [A,B];
  // connectors between the arms that point away from the circuit (the middle of the map)
  const arm=(pts,i,dir)=>{let k=i,l=0;while(k>0&&k<pts.length-1&&l<70){const nk=k+dir;l+=Math.hypot(pts[nk][0]-pts[k][0],pts[nk][1]-pts[k][1]);k=nk;}return k;};
  const out=(pts,k)=>Math.hypot(...pts[k])>Math.hypot(...X);
  const armsA=[arm(a,ia,-1),arm(a,ia,1)].filter(k=>out(a,k)),armsB=[arm(b,ib,-1),arm(b,ib,1)].filter(k=>out(b,k));
  const conns=[];
  if(armsA.length&&armsB.length){const ka=armsA[0],kb=armsB[0];
    const ta=fwNorm([a[ka][0]-X[0],a[ka][1]-X[1]]),tb=fwNorm([b[kb][0]-X[0],b[kb][1]-X[1]]);
    // a directional ramp: leaves A heading in toward the crossing, sweeps a quarter turn through the outer quadrant
    // and joins B heading out
    const up=fwCurve(a[ka],[-ta[0],-ta[1]],b[kb],tb,0.55);
    const n=up.length-1,y1=lift(b[kb]),e=t=>t*t*(3-2*t);conns.push({pts:up,ys:up.map((_,k)=>FW_Y+(y1-FW_Y)*e(k/n)+Math.sin(Math.PI*k/n)),ramps:[false,false],oneway:1});
  }
  return [A,B,...conns];
}

// Open water here: wet, and still wet a little further out (so a thin river or canal doesn't count as a shore).
const fwOpen=(x,z,o)=>inWater(x,z)&&inWater(x+o[0]*12,z+o[1]*12);
// A viaduct just offshore of the open water nearest the circuit on side o: march out from just past the circuit
// until the water starts, and stand the deck just beyond the shore, wholly over the water. (The water hugs the
// circuit more closely than freeways may, so there's no room for a road on the bank itself.)
function fwShore(d,o,dry,ph){
  const far=Math.max(...dry.map(([x,z])=>x*o[0]+z*o[1]))+FW_CLEAR,pts=[];
  for(let u=-FW_EXTENT;u<=FW_EXTENT;u+=6){let c=far;
    for(let s=far;s<far+160;s+=3){if(fwOpen(u*d[0]+s*o[0],u*d[1]+s*o[1],o)){c=s+5;break;}if(s>=far+157)c=far+5*(1+Math.sin(u/80+ph));}
    pts.push([u*d[0]+c*o[0],u*d[1]+c*o[1]]);}
  const xs=smoothArr(pts.map(p=>p[0]),2,3),zs=smoothArr(pts.map(p=>p[1]),2,3);
  const road=fwClear(pts.map((p,i)=>[xs[i],zs[i]]),dry);
  // keep the whole deck over the water: step any point whose deck touches land out to sea
  for(let pass=0;pass<2;pass++){
    road.forEach((p,i)=>{const t=fwTan(road,i),dryEdge=q=>!inWater(q[0]-t[1]*3,q[1]+t[0]*3)||!inWater(q[0]+t[1]*3,q[1]-t[0]*3);
      if(!inWater(p[0]+o[0]*20,p[1]+o[1]*20))return;   // no open water out there: leave this stretch on land
      for(let k=0;k<10&&dryEdge(p);k++){p[0]+=o[0]*1.5;p[1]+=o[1]*1.5;}});
    const sx=smoothArr(road.map(p=>p[0]),1,1),sz=smoothArr(road.map(p=>p[1]),1,1);road.forEach((p,i)=>{p[0]=sx[i];p[1]=sz[i];});
  }
  return road;
}

// The point of a road nearest the middle of the circuit (so the camera frames the road's closest stretch).
const fwClosest=pts=>pts.reduce((b,p)=>Math.hypot(...p)<Math.hypot(...b)?p:b);

// A freeway bridge like a real one: the narrowest proper crossing of the water near the circuit (square across a river
// or harbour, real land on both banks, a channel rather than a shoreline), as a straight road over it that carries on
// inland on both sides, bent clear of the circuit. Returns the road points and which of them are over the water.
function fwCrossing(dry){
  const land=(x,z)=>!inWater(x,z),reach=(x,z,dx,dz)=>{for(let t=0;t<=120;t+=1)if(land(x+dx*t,z+dz*t))return t;return 1e9;};
  const xs=dry.map(p=>p[0]),zs=dry.map(p=>p[1]),x0=Math.min(...xs)-70,x1=Math.max(...xs)+70,z0=Math.min(...zs)-70,z1=Math.max(...zs)+70;
  let best=null,bestScore=1e9;
  for(let x=x0;x<=x1;x+=5)for(let z=z0;z<=z1;z+=5){
    if(land(x,z)||fwDry(x,z,dry)<FW_CLEAR+10)continue;
    let a=0,w=1e9;for(let k=0;k<32;k++){const t=k*Math.PI/32,dx=Math.cos(t),dz=Math.sin(t),ww=reach(x,z,dx,dz)+reach(x,z,-dx,-dz);if(ww<w){w=ww;a=t;}}
    if(w>160)continue;
    const d=[Math.cos(a),Math.sin(a)],f=reach(x,z,d[0],d[1]),b=reach(x,z,-d[0],-d[1]);if(Math.abs(f-b)>6)continue;
    const c=[x+d[0]*(f-b)/2,z+d[1]*(f-b)/2],L=w/2;
    if(!land(c[0]+d[0]*(L+24),c[1]+d[1]*(L+24))||!land(c[0]-d[0]*(L+24),c[1]-d[1]*(L+24)))continue;
    let ok=true;for(let t=-L*0.5;t<=L*0.5&&ok;t+=4)for(const o of[-10,10])if(land(c[0]+d[0]*t-d[1]*o,c[1]+d[1]*t+d[0]*o))ok=false;
    for(let t=-L-20;t<=L+20&&ok;t+=4)if(fwDry(c[0]+d[0]*t,c[1]+d[1]*t,dry)<FW_CLEAR+2)ok=false;
    if(!ok)continue;
    const score=fwDry(c[0],c[1],dry)+w*0.3;if(score<bestScore){bestScore=score;best={c,d,L};}
  }
  if(WATER_BRIDGE){const [a,b]=WATER_BRIDGE,v=[b[0]-a[0],b[1]-a[1]],l=Math.hypot(...v);   // pinned by the water sketch
    best={c:[(a[0]+b[0])/2,(a[1]+b[1])/2],d:[v[0]/l,v[1]/l],L:l/2};}
  if(!best)return null;
  // straight across; on the far bank it runs on out of view, on the circuit's bank only until it nears the circuit,
  // where it lands (and fades) rather than cutting through
  const {c,L}=best,near=fwDry(c[0]+best.d[0]*(L+30),c[1]+best.d[1]*(L+30),dry)<fwDry(c[0]-best.d[0]*(L+30),c[1]-best.d[1]*(L+30),dry);
  const d=near?[-best.d[0],-best.d[1]]:best.d,pts=[];   // d points away from the circuit
  let t0=-L-24;while(t0>-L-160&&fwDry(c[0]+d[0]*(t0-6),c[1]+d[1]*(t0-6),dry)>=FW_CLEAR+6)t0-=6;   // at least onto the near bank
  for(let t=t0;t<=L+160;t+=6)pts.push([c[0]+d[0]*t,c[1]+d[1]*t]);
  FW_FOCUS.push(c);
  return fwClear(pts,dry);
}

// Every direction a road might run, as compass pairs.
const FW_DIRS={'E-W':[1,0],'N-S':[0,1],'NE-SW':[Math.SQRT1_2,-Math.SQRT1_2],'NW-SE':[Math.SQRT1_2,Math.SQRT1_2]};

function buildFreeways(def){
  const r=def.roads;FW_ROADS=[];FW_FOCUS=[];if(!r)return FW_ROADS;
  const saved=savedScenery(def);
  if(saved&&saved.roads){FW_FOCUS=saved.focus||[];FW_ROADS=saved.roads.map(fwFinish);return FW_ROADS;}
  const dry=dryPoints(),circuitDry=dry.slice(),ph=waterRng(def.id)()*6.28,roads=[];
  // a landmark pinned by the water sketch is ground the freeways keep clear of too (they're placed before it), unless the
  // landmarks are hidden (?nolm), when they don't bend the roads either
  const hideLm=new URLSearchParams(location.search).has('nolm');
  // (a bridge carrying a road isn't in its way)
  if(!hideLm)for(const p of WATER_PROPS){if(p.lm.carries)continue;const r=(LANDMARK_R[p.lm.kind]||7)+2;for(let k=0;k<24;k++){const a=k*Math.PI/12;for(const f of[0.3,0.7,1])dry.push([p.x+Math.cos(a)*r*f,p.z+Math.sin(a)*r*f]);}}
  if(WATER_ANCHOR&&!hideLm){const r=(LANDMARK_R[def.landmark.kind]||7)+2;for(let k=0;k<24;k++){const a=k*Math.PI/12;for(const f of[0.3,0.7,1])dry.push([WATER_ANCHOR[0]+Math.cos(a)*r*f,WATER_ANCHOR[1]+Math.sin(a)*r*f]);}}
  // of the two sides of the circuit a road along d could run, the one with less water under it (or more, for a bridge)
  const pickSide=d=>{const lines=[1,-1].map(side=>fwBeside(d,side,dry)),wets=lines.map(fwWet);return lines[wets[0]<=wets[1]?0:1];};
  if(WATER_ROADS.length){   // traced from the real city by the water sketch: kept clear of the circuit, ends on land
    // a later road flies over an earlier one it crosses (the Queensboro over the FDR), easing up 5 units over 70
    const cross=(a,b,c,d)=>{const o=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);return o(a,b,c)*o(a,b,d)<0&&o(c,d,a)*o(c,d,b)<0;};
    for(const path of WATER_ROADS){const pts=path.join?path.slice():fwClear(path,dry),X=[];
      for(const r of roads)for(let i=1;i<pts.length;i++)for(let j=1;j<r.pts.length;j++)if(cross(pts[i-1],pts[i],r.pts[j-1],r.pts[j]))X.push(pts[i]);
      if(path.join)X.length=0;   // a road that starts on another joins it level: nothing to fly over
      const lift=([x,z])=>{let t=0;for(const c of X)t=Math.max(t,1-Math.hypot(x-c[0],z-c[1])/70);return FW_Y+5*t*t*(3-2*t);};
      // the stretch on a sketch bridge that carries it (the Brooklyn Bridge) hangs from its cables: no pillars
      const hung=([x,z])=>WATER_PROPS.some(p=>{if(!p.lm.carries)return false;const c=Math.cos(p.rot),n=-Math.sin(p.rot),dx=x-p.x,dz=z-p.z;
        return Math.abs(dx*c+dz*n)<=(p.lm.span||24)*(p.lm.scale||1)&&Math.abs(-dx*n+dz*c)<4;});
      const sus=pts.map(p=>hung(p)?1:0);
      roads.push({pts,ys:pts.map(lift),reach:400,...(path.join?{ramps:[false,true]}:{}),...(sus.some(Boolean)?{suspended:sus}:{})});}
  }else if(r.kind==='line'){
    const main=pickSide(FW_DIRS[r.dir]||[1,0]);roads.push(fwFlat(main),fwBranch(main,dry));
    roads.push(...fwDiamond(main,dry,roads));
  }else if(r.kind==='stack'){
    const a=pickSide(FW_DIRS[r.dir]||[1,0]),i=fwNearEnd(a,dry,1),t=fwTan(a,i),X=a[i];
    const b=fwClear(Array.from({length:Math.round(2*FW_EXTENT/6)+1},(_,k)=>{const u=-FW_EXTENT+k*6;return [X[0]-t[1]*u,X[1]+t[0]*u];}),dry);
    FW_FOCUS.push(X);roads.push(...fwStack(a,b));roads.push(...fwDiamond(a,dry,roads));
  }else if(r.kind==='frame'){
    // a parallelogram: sides along d1 (east-west) and d2 (north, leaning east by skew), just clear of the circuit
    const d1=[1,0],d2=fwNorm([r.skew||0,-1]),n1=[-d1[1],d1[0]],n2=[-d2[1],d2[0]],m=FW_CLEAR+4;
    const ext=n=>{const v=circuitDry.map(([x,z])=>x*n[0]+z*n[1]);return [Math.min(...v)-m,Math.max(...v)+m];};   // the circuit alone
    const [a0,a1]=ext(n1),[b0,b1]=ext(n2);
    const corner=(a,b)=>{const det=n1[0]*n2[1]-n1[1]*n2[0];return [(a*n2[1]-b*n1[1])/det,(b*n1[0]-a*n2[0])/det];};
    if(r.sides&&r.sides.join()==='W,N,E'){
      // an upside-down U: down the west side, across the top, down the east side; each leg carries on south across
      // the water to the far shore (Hong Kong: two freeways off to the island, joined across the top of Kowloon)
      const NW=corner(a0,b0),NE=corner(a0,b1),SW=corner(a1,b0),SE=corner(a1,b1),south=[-d2[0],-d2[1]];
      const leg=c=>{let t=0,wet=false,dryRun=0;   // how far south until 30 units onto the far shore
        while(t<320){t+=3;const x=c[0]+south[0]*t,z=c[1]+south[1]*t,w=inWater(x,z);if(w)wet=true;else if(wet){dryRun+=3;if(dryRun>=30)break;}}
        return [c[0]+south[0]*t,c[1]+south[1]*t];};
      const cut=(u,v,d)=>{const k=fwNorm([v[0]-u[0],v[1]-u[1]]);return [u[0]+k[0]*d,u[1]+k[1]*d];};
      const ctl=[leg(SW),SW,cut(NW,SW,22),cut(NW,NE,22),cut(NE,NW,22),cut(NE,SE,22),SE,leg(SE)];
      const pts=fwClear(smoothPath(ctl,false),dry);
      roads.push({pts,ys:pts.map(()=>FW_Y),reach:400});
      FW_FOCUS.push(NW,NE);
    }else if(r.sides&&r.sides.join()==='S'){
      // the south side alone, just south of the circuit, running only along the land there (a waterfront road on a
      // peninsula stops where the peninsula does, rather than striking out over the water)
      const a=a1,line=[];for(let u=-FW_EXTENT;u<=FW_EXTENT;u+=6)line.push([d1[0]*u+n1[0]*a,d1[1]*u+n1[1]*a]);
      let mid=0,best=1e9;line.forEach(([x,z],i)=>{const d=Math.abs(x*d1[0]+z*d1[1]);if(d<best){best=d;mid=i;}});
      let i0=mid,i1=mid;while(i0>0&&!inWater(...line[i0-1]))i0--;while(i1<line.length-1&&!inWater(...line[i1+1]))i1++;
      const pts=fwClear(line.slice(i0,i1+1),dry);
      roads.push(fwFlat(pts));FW_FOCUS.push([n1[0]*a,n1[1]*a]);
      roads.push(...fwDiamond(pts,dry,roads));
    }else{
    const C=[corner(a0,b0),corner(a0,b1),corner(a1,b1),corner(a1,b0)];   // round the loop
    // straight sides with rounded corners: cut each corner back 18 units along both sides, then smooth the loop
    const ctl=[];C.forEach((c,i)=>{const p=C[(i+3)%4],q=C[(i+1)%4],cut=(u,v)=>{const d=fwNorm([v[0]-u[0],v[1]-u[1]]);return [u[0]+d[0]*18,u[1]+d[1]*18];};
      ctl.push(cut(c,p),c,cut(c,q));});
    let loop=smoothPath(ctl.filter((_,i)=>i%3!==1),true);loop.push(loop[0].slice());
    roads.push({pts:loop,ys:loop.map(()=>FW_Y),ramps:[false,false],fades:[false,false]});
    // spurs: from the two southern corners (largest n1, i.e. furthest south) off toward the mainland
    for(const c of C.filter(c=>c[0]*n1[0]+c[1]*n1[1]>(a0+a1)/2)){
      const pts=[];for(let t=0;t<=220;t+=6)pts.push([c[0]-d2[0]*t,c[1]-d2[1]*t]);
      roads.push({pts:fwClear(pts,dry),ys:pts.map(()=>FW_Y),ramps:[false,true],reach:200});}
    FW_FOCUS.push(...C);
    }
  }else if(r.kind==='span'){
    // over the landmark's crossing: straight across its deck, on into the far shore, and on the circuit's side only
    // until it nears the circuit
    const lm=placeLandmark(def),L=lm.span||34,d0=[Math.cos(-lm.rot),Math.sin(-lm.rot)],c=[lm.x,lm.z];
    const nearSide=fwDry(c[0]+d0[0]*(L+20),c[1]+d0[1]*(L+20),dry)<fwDry(c[0]-d0[0]*(L+20),c[1]-d0[1]*(L+20),dry);
    const d=nearSide?[-d0[0],-d0[1]]:d0,pts=[];   // d points away from the circuit
    let t0=-L-10;while(t0>-L-160&&fwDry(c[0]+d[0]*(t0-6),c[1]+d[1]*(t0-6),dry)>=FW_CLEAR+6)t0-=6;
    for(let t=t0;t<=L+170;t+=3)pts.push([c[0]+d[0]*t,c[1]+d[1]*t]);
    const road=fwClear(pts,dry),deck=([x,z])=>Math.abs((x-c[0])*d[0]+(z-c[1])*d[1])<=L;
    roads.push({pts:road,ys:road.map(()=>FW_Y),reach:200,suspended:road.map(p=>deck(p)?1:0)});
    FW_FOCUS.push([c[0]+d[0]*L,c[1]+d[1]*L],[c[0]-d[0]*L,c[1]-d[1]*L]);
    roads.push(...fwDiamond(road,dry,roads));
  }else if(r.kind==='shore'||r.kind==='bridge'){
    // the side of the circuit the water is on, and the direction along (shore) or across (bridge) it
    // the side where water comes closest to the circuit along most of its length: rays out from just past the
    // circuit, scored by how many find water and how soon
    let best=null;
    for(const d of Object.values(FW_DIRS))for(const side of[1,-1]){const o=[-d[1]*side,d[0]*side];
      if(r.side&&o[0]*COMPASS[r.side][0]+o[1]*COMPASS[r.side][1]<0.7)continue;   // only the side asked for
      const far=Math.max(...dry.map(([x,z])=>x*o[0]+z*o[1]));let wet=0;
      for(let u=-150;u<=150;u+=15)for(let s=far+FW_CLEAR;s<far+110;s+=5)if(fwOpen(u*d[0]+s*o[0],u*d[1]+s*o[1],o)){wet+=1-(s-far)/130;break;}
      if(!best||wet>best.wet)best={d,o,wet,side};}
    if(!best||!best.wet){roads.push(fwFlat(pickSide([1,0])));}
    else if(r.kind==='shore'){const main=fwShore(best.d,best.o,dry,ph);roads.push(fwFlat(main));FW_FOCUS.push(fwClosest(main));roads.push(...fwDiamond(main,dry,roads));}
    else{
      // across the water at its narrowest proper crossing, arched a little higher over the water; failing that,
      // out over it beside the circuit
      const side=fwCrossing(dry)||[1,-1].map(s=>fwBeside(best.o,s,dry)).sort((p,q)=>fwWet(q)-fwWet(p))[0];
      const wet=smoothArr(side.map(([x,z])=>inWater(x,z)?1:0),3,4);
      roads.push({pts:side,ys:wet.map(w=>FW_Y+2.5*w),arch:!!r.arch,reach:170});   // runs on past the far bank before it fadesroads.push(...fwDiamond(side,dry,roads));
    }
  }
  const done=roads.filter(Boolean).map(rd=>fwEnds(rd,dry)).filter(Boolean);
  fwSnapJoins(done);
  FW_ROADS=done.map(fwFinish);
  return FW_ROADS;
}
// A finished road, ready to draw: its running length along the way and how solid it is at each point (free ends
// dissolve, dithered, over their last FW_FADE units rather than stopping dead).
function fwFinish(rd){
  const cum=[0];for(let i=1;i<rd.pts.length;i++)cum.push(cum[i-1]+Math.hypot(rd.pts[i][0]-rd.pts[i-1][0],rd.pts[i][1]-rd.pts[i-1][1]));
  const len=cum[cum.length-1],[fs,fe]=rd.fades||rd.ramps||[true,true],ease=t=>Math.max(0,Math.min(1,t));
  const fade=cum.map(c=>Math.min(fs?ease(c/FW_FADE):1,fe?ease((len-c)/FW_FADE):1));
  return {...rd,cum,len,fade};
}

// Freeways fade out rather than run off the map: each free end (not joined to another road) is cut back to a little
// past the circuit, on dry land, and comes down to ground on a ramp over its last stretch, as if joining the streets.
const FW_RAMP=64,FW_REACH=60,FW_FADE=40;
function fwEnds(rd,dry){
  const [rs,re]=rd.ramps||[true,true];if(!rs&&!re)return rd;
  const R=rd.reach||FW_REACH,xs=dry.map(p=>p[0]),zs=dry.map(p=>p[1]),x0=Math.min(...xs)-R,x1=Math.max(...xs)+R,z0=Math.min(...zs)-R,z1=Math.max(...zs)+R;
  const near=([x,z])=>x>x0&&x<x1&&z>z0&&z<z1;
  let i0=0,i1=rd.pts.length-1;
  // cut back to near the circuit (whether an end then comes down is decided below: only over dry land)
  let ds=rs,de=re;
  if(rs)while(i0<i1&&!near(rd.pts[i0]))i0++;
  if(re)while(i1>i0&&!near(rd.pts[i1]))i1--;
  const pts=rd.pts.slice(i0,i1+1),ys=rd.ys.slice(i0,i1+1),sus=rd.suspended&&rd.suspended.slice(i0,i1+1);if(pts.length<4)return null;
  const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const L=cum[cum.length-1],ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  // an end comes down only if its whole descent is over land; otherwise it stays up and just fades
  if(ds&&!fwLandsDry(pts,0,cum.findIndex(c=>c>=FW_RAMP)))ds=false;
  if(de&&!fwLandsDry(pts,cum.findIndex(c=>c>=L-FW_RAMP),pts.length-1))de=false;
  return {...rd,pts,...(sus?{suspended:sus}:{}),ys:ys.map((y,i)=>{let f=1;if(ds)f=Math.min(f,ease(cum[i]/FW_RAMP));if(de)f=Math.min(f,ease((L-cum[i])/FW_RAMP));return 0.25+(y-0.25)*f;})};
}

// Where a road starts or ends on another road (ramps false at that end), make it meet that road at exactly its
// height, easing the difference out over the first (or last) 60 units.
function fwSnapJoins(roads){
  for(const rd of roads){const [rs,re]=rd.ramps||[true,true];
    const cum=[0];for(let i=1;i<rd.pts.length;i++)cum.push(cum[i-1]+Math.hypot(rd.pts[i][0]-rd.pts[i-1][0],rd.pts[i][1]-rd.pts[i-1][1]));
    const L=cum[cum.length-1];
    for(const [joined,k] of [[!rs,0],[!re,rd.pts.length-1]]){if(!joined)continue;
      const [x,z]=rd.pts[k];let h=null,bd=4;
      for(const o of roads){if(o===rd)continue;o.pts.forEach(([a,b],i)=>{const d=Math.hypot(a-x,b-z);if(d<bd){bd=d;h=o.ys[i];}});}
      if(h===null)continue;const diff=h-rd.ys[k];
      rd.ys=rd.ys.map((y,i)=>{const d=k?L-cum[i]:cum[i],t=Math.max(0,1-d/60);return y+diff*t*t*(3-2*t);});}
  }
}

// A point s along a road: position (with height) and heading.
function fwAt(rd,s){
  s=Math.max(0,Math.min(rd.len,s));let lo=0,hi=rd.cum.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(rd.cum[m]<=s)lo=m;else hi=m;}
  const seg=rd.cum[hi]-rd.cum[lo]||1,t=(s-rd.cum[lo])/seg,a=rd.pts[lo],b=rd.pts[hi];
  return {x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,y:rd.ys[lo]+(rd.ys[hi]-rd.ys[lo])*t,dx:(b[0]-a[0])/seg,dz:(b[1]-a[1])/seg,
    f:rd.fade[lo]+(rd.fade[hi]-rd.fade[lo])*t};
}
// Distance from a point to the nearest freeway (for keeping the landmark clear).
function freewayDist(x,z){let m=1e9;
  for(const rd of FW_ROADS)for(let i=0;i<rd.pts.length;i+=2){const d=Math.hypot(rd.pts[i][0]-x,rd.pts[i][1]-z);if(d<m)m=d;}
  return m;}
