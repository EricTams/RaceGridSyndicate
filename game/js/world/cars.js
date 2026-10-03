// Car models, the 20 cars, team part state and league state.
'use strict';

const GEO={chassis:new THREE.BoxGeometry(1.7,0.35,0.9),cabin:new THREE.BoxGeometry(0.6,0.28,0.7),stripe:new THREE.BoxGeometry(1.7,0.12,0.24),
  glass:new THREE.BoxGeometry(0.5,0.22,0.5),helm:new THREE.SphereGeometry(0.16,6,5),wing:new THREE.BoxGeometry(0.3,0.05,1.0),
  strut:new THREE.BoxGeometry(0.06,0.4,0.06),bumper:new THREE.BoxGeometry(0.5,0.2,0.3),wheel:new THREE.CylinderGeometry(0.28,0.28,0.24,8),
  gunBase:new THREE.BoxGeometry(0.26,0.14,0.26),barrel:new THREE.BoxGeometry(0.55,0.12,0.12),plate:new THREE.BoxGeometry(0.8,0.24,0.06),
  head:new THREE.BoxGeometry(0.05,0.1,0.14),tail:new THREE.BoxGeometry(0.05,0.1,0.18)};
Object.values(GEO).forEach(g=>g.computeBoundingBox());
const CAR_LIFT=0.8;   // how much brighter cars are lit than scenery, so team colours read
const SH={tyre:litMat('#2a2a2a'),dark:litMat('#1a1a1a'),gun:litMat('#6a6680',0.35,THREE.FrontSide,CAR_LIFT),glass:litMat('#9be0ff'),helm:litMat('#ffffff'),head:emitMat('#fff3b0'),tail:emitMat('#ff2040')};
const OL_BLACK=new THREE.MeshBasicMaterial({color:0x000000,side:THREE.BackSide});
const OL_YOU=new THREE.MeshBasicMaterial({color:0xc8fdff,side:THREE.BackSide});
const coneGeo=new THREE.BufferGeometry();
coneGeo.setAttribute('position',new THREE.Float32BufferAttribute([1.1,0.05,0.3,4.6,0.05,1.3,4.6,0.05,-1.3,1.1,0.05,0.3,4.6,0.05,-1.3,1.1,0.05,-0.3],3));
const coneMat=new THREE.MeshBasicMaterial({color:0xfff0a0,transparent:true,opacity:0.12,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});

function buildCar(team){
  const body=litMat(team.body,0.35,THREE.FrontSide,CAR_LIFT),trim=litMat(team.trim,0.35,THREE.FrontSide,CAR_LIFT),model=new THREE.Group(),outlines=[],olMat=team.you?OL_YOU:OL_BLACK;
  const add=(geo,mat,x,y,z,rx=0,ol=true)=>{
    const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.rotation.x=rx;model.add(o);
    if(ol){const h=new THREE.Mesh(geo,olMat);h.position.copy(o.position);h.rotation.copy(o.rotation);model.add(h);
      const b=geo.boundingBox;outlines.push({h,dx:b.max.x-b.min.x,dy:b.max.y-b.min.y,dz:b.max.z-b.min.z});}
  };
  // Only the silhouette parts are outlined: at race zoom, outlines on the small parts cover most of the body.
  add(GEO.chassis,body,0,0.42,0);add(GEO.cabin,body,-0.1,0.72,0);add(GEO.stripe,trim,0,0.62,0,0,false);
  add(GEO.glass,SH.glass,0.15,0.85,0,0,false);add(GEO.helm,SH.helm,-0.2,0.98,0,0,false);
  add(GEO.wing,body,-0.85,0.95,0);add(GEO.strut,SH.dark,-0.8,0.75,0.3,0,false);add(GEO.strut,SH.dark,-0.8,0.75,-0.3,0,false);
  add(GEO.bumper,trim,0.9,0.4,0,0,false);
  [[0.6,0.52],[0.6,-0.52],[-0.6,0.52],[-0.6,-0.52]].forEach(([x,z])=>add(GEO.wheel,SH.tyre,x,0.28,z,Math.PI/2));
  add(GEO.gunBase,SH.gun,-0.05,0.93,-0.28,0,false);add(GEO.barrel,SH.gun,0.28,0.98,-0.28,0,false);
  add(GEO.plate,trim,0.05,0.45,0.48,0,false);add(GEO.plate,trim,0.05,0.45,-0.48,0,false);
  add(GEO.head,SH.head,0.86,0.45,0.33,0,false);add(GEO.head,SH.head,0.86,0.45,-0.33,0,false);
  add(GEO.tail,SH.tail,-0.86,0.5,0.32,0,false);add(GEO.tail,SH.tail,-0.86,0.5,-0.32,0,false);
  model.add(new THREE.Mesh(coneGeo,coneMat));
  model.scale.setScalar(CAR_SCALE);
  const yawG=new THREE.Group();yawG.add(model);const root=new THREE.Group();root.add(yawG);scene.add(root);
  return {root,yawG,body,trim,outlines};
}

// Every team in every tier has persistent state: cash, parts, an AI manager, and its two drivers.
// Its pecking-order seed (SEEDS) sets where it starts; your two seats are placeholders until the opening draft.
ALL_TEAMS.forEach(t=>{
  const sd=SEEDS[t.seed];
  t.cash=t.you?START_CASH:rand(...sd.cash)*TIER_MONEY[t.tier];t.parts={};
  const base=TIER_BASE[t.tier]+sd.lvl+(t.pace||0)*5+(t.you?0:rand(-2,2));
  PARTS.forEach(p=>t.parts[p.id]={level:Math.round(base+(t.you?0:rand(-2,2))),dev:0});
  if(!t.you)t.mgr={business:choice(sd.mgr),tactics:choice(sd.mgr)};
  t.drvs=t.drivers.map(()=>{const d=rollDriver({tier:t.tier,pace:(t.pace||0)+(sd.drv||0)});
    initDriverCareer(d,t.you?0:0.3*Math.pow(1.05,d.stats.pace-60));return d;});
});
// The cars on track are the current tier's. Yours are built once; rivals are rebuilt on a tier change.
const cars=[];
function makeCar(team,k){
  const c={team,name:team.drivers[k],you:!!team.you,slot:k,...buildCar(team),pos:new THREE.Vector3(),drv:team.drvs[k],abOn:{}};
  c.cond={};PARTS.forEach(p=>c.cond[p.id]=100);c.condStart={...c.cond};
  return c;
}
function buildField(){
  cars.filter(c=>!c.you).forEach(c=>{scene.remove(c.root);disposeTree(c.root);});
  const yours=cars.filter(c=>c.you);
  cars.length=0;
  TEAMS.forEach(team=>team.drivers.forEach((_,k)=>cars.push(team.you&&yours[k]?yours[k]:makeCar(team,k))));
  if(typeof recolorPitBoxes==='function')recolorPitBoxes();
}
buildField();
const mine=[cars[0],cars[1]];
const league={season:1,race:1,review:null,lastReg:null,maxTier:0};
const fieldMedian=id=>{const v=TEAMS.map(t=>t.parts[id].level).sort((a,b)=>a-b);return (v[4]+v[5])/2;};
