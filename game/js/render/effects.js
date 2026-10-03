// Pooled smoke, sparks, tracers and mines.
'use strict';

const smoke=[],smokeGeo=new THREE.BoxGeometry(1,1,1),smokeMats=[new THREE.MeshBasicMaterial({color:0x5a5470}),new THREE.MeshBasicMaterial({color:0x3d3850})];
for(let i=0;i<180;i++){const m=new THREE.Mesh(smokeGeo,smokeMats[i%2]);m.visible=false;scene.add(m);smoke.push({m,life:0,max:1});}
const sparks=[],sparkGeo=new THREE.BoxGeometry(0.6,0.6,0.6),sparkMats=[emitMat('#ffe066'),emitMat('#ff7a1f')];
for(let i=0;i<40;i++){const m=new THREE.Mesh(sparkGeo,sparkMats[i%2]);m.visible=false;scene.add(m);sparks.push({m,life:0});}
const tracers=[];
for(let i=0;i<60;i++){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,0],3));
  const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffe066}));l.visible=false;l.frustumCulled=false;scene.add(l);tracers.push({l,life:0});}
const mines=[],mineGeo=new THREE.BoxGeometry(0.8,0.35,0.8),mineMat=emitMat('#ff3b3b');
for(let i=0;i<48;i++){const m=new THREE.Mesh(mineGeo,mineMat);m.visible=false;scene.add(m);mines.push({m,active:false});}
const pick=(pool,test)=>pool.find(test)||pool[0];
// Ability trails: while a driver's ability is boosting them, glowing blocks in its colour drop behind the car.
const trails=[],trailGeo=new THREE.BoxGeometry(0.9,0.25,0.9),trailMats={};
for(let i=0;i<160;i++){const m=new THREE.Mesh(trailGeo,sparkMats[0]);m.visible=false;scene.add(m);trails.push({m,life:0});}
function dropTrail(c,col){
  const p=pick(trails,t=>t.life<=0);p.life=0.8;
  p.m.material=trailMats[col]||(trailMats[col]=emitMat(col));p.m.visible=true;p.m.position.copy(c.pos).setY(0.35*CAR_SCALE);p.m.scale.setScalar(1);
}
function updateTrails(dt){for(const p of trails){if(p.life<=0)continue;p.life-=dt;const k=Math.max(0,p.life/0.8);p.m.scale.setScalar(k);if(p.life<=0)p.m.visible=false;}}
