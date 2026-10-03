// Per-frame visual updates: car transforms, particles, traffic, occluder fades.
'use strict';

function updateVisuals(dt,now){
  updateTrails(dt);
  for(const c of cars)if(c.boost&&dt>0&&c.state==='race'&&(c.trailT=(c.trailT||0)-dt)<=0){c.trailT=0.05;dropTrail(c,c.boost);}
  for(const c of cars){
    const s=mod(c.d,L),f=s/DS,i0=Math.floor(f)%N,i1=(i0+1)%N,u=f-Math.floor(f);
    const px=P[i0].x+(P[i1].x-P[i0].x)*u,pz=P[i0].z+(P[i1].z-P[i0].z)*u;
    c.pos.set(px+NRM[i0].x*c.lat,0,pz+NRM[i0].z*c.lat);
    c.root.position.copy(c.pos);
    const yaw=Math.atan2(-T[i0].z,T[i0].x)+c.spinA,step=Math.PI*2/HEADINGS;
    c.yawG.rotation.y=Math.round(yaw/step)*step;
    c.flash=Math.max(0,c.flash-dt*8);c.body.uniforms.uFlash.value=c.flash;c.trim.uniforms.uFlash.value=c.flash;
    const smoking=c.state==='wreck'||c.dur<35;
    if(smoking&&Math.random()<dt*(c.state==='wreck'?14:8)){
      const p=pick(smoke,p=>p.life<=0);p.life=p.max=rand(1,1.6);p.m.visible=true;
      p.m.position.set(c.pos.x+rand(-0.6,0.6),1.4,c.pos.z+rand(-0.6,0.6));p.vx=rand(-0.3,0.3);p.vz=rand(-0.3,0.3);}
  }
  for(const p of smoke){if(p.life<=0)continue;p.life-=dt;
    if(p.life<=0){p.m.visible=false;continue;}
    const k=p.life/p.max;p.m.position.y+=dt*1.8;p.m.position.x+=p.vx*dt;p.m.position.z+=p.vz*dt;p.m.scale.setScalar(0.2+0.8*k);}
  for(const s of sparks){if(s.life<=0)continue;s.life-=dt;if(s.life<=0)s.m.visible=false;}
  for(const t of tracers){if(t.life<=0)continue;t.life-=dt;if(t.life<=0)t.l.visible=false;}
  for(const m of mines)if(m.active)m.m.visible=Math.floor(now*6)%2===0||m.arm>0;
  for(const g of glints){const u=g.userData;if(!g.visible)continue;g.position.x+=u.f.drift[0]*u.v*dt;g.position.z+=u.f.drift[1]*u.v*dt;
    if(!inFeature(u.f,g.position.x,g.position.z))placeGlint(g);}
  for(const d of traffic){const ud=d.userData;ud.s=mod(ud.s+ud.v*dt,ud.rd.len);const p=fwAt(ud.rd,ud.s);
    d.position.set(p.x-p.dz*ud.lane,p.y+0.55,p.z+p.dx*ud.lane);d.rotation.y=-Math.atan2(p.dz,p.dx);d.visible=p.f>0.5;}
  // The Bellagio fountain show: a new routine every 7 seconds (sweep, pulse, alternate, burst from the middle, finale),
  // with a second of rest between.
  const show=Math.floor(now/7)%5,ph=now%7;
  for(const j of FOUNTAINS){const {t,i}=j.userData;let h=0;
    if(ph<6){if(show===0)h=11*Math.max(0,Math.sin((t*2-ph*0.6)*Math.PI));
      else if(show===1)h=12*Math.abs(Math.sin(ph*Math.PI/1.5));
      else if(show===2)h=i%2===Math.floor(ph*2)%2?11:1.5;
      else if(show===3)h=13*Math.max(0,1-Math.abs(Math.abs(t-0.5)*2-(ph%3)/2.5)*3);
      else h=ph<4.5?9+5*Math.sin(now*9+i):14*(1-(ph-4.5)/1.5);}
    j.visible=h>0.4;j.scale.y=Math.max(h,0.01);j.position.y=0.3+h/2;}
  for(const n of NEON)n.visible=(Math.floor(now*3)+n.userData.k)%4!==0;   // the Strip's chasing neon
  // Screen-door any overpass span or tower that stands between the camera and one of your cars (rivals don't fade it).
  for(const o of occluders){
    let hide=false;
    for(const c of mine){const R=c.pos.dot(RIGHT),U=c.pos.dot(UP)+0.8,D=c.pos.dot(DIR);
      if(o.maxD<=D+1)continue;
      if(o.seg){const[a,b,c2,d]=o.seg,ex=c2-a,ey=d-b,t=Math.max(0,Math.min(1,((R-a)*ex+(U-b)*ey)/(ex*ex+ey*ey)));
        if(Math.hypot(R-a-ex*t,U-b-ey*t)<3.2){hide=true;break;}}
      else if(R>o.minR-1&&R<o.maxR+1&&U>o.minU-1&&U<o.maxU+1){hide=true;break;}}
    for(const m of o.mats)m.uniforms.uOpacity.value=hide?0.5:1;
  }
}
