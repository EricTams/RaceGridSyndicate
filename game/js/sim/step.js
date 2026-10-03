// The per-tick race simulation.
'use strict';

function stepSim(dt){
  race.t+=dt;
  if(race.t<0)return;
  const order=standings(),posOf=new Map(order.map((c,k)=>[c,k+1]));
  if(race.mode==='race'&&race.t>5&&order[0].state==='race')seasonStat(order[0].team).led=true;   // for 'lead a race' objectives
  for(const c of cars){
    const F=ORDERS.fuel.opts[c.orders.fuel],TI=ORDERS.tires.opts[c.orders.tires],G=ORDERS.guns.opts[c.orders.guns];
    // abOn: abilities active right now (value = seconds to keep the chip lit)
    for(const k in c.abOn)if((c.abOn[k]-=dt)<=0)delete c.abOn[k];
    if(c.state==='wreck'){c.v=Math.max(0,c.v-30*dt);c.lat+=(c.latT-c.lat)*Math.min(1,dt*2);c.d+=c.v*dt;continue;}
    const i=Math.floor(mod(c.d,L)/DS)%N,tp=c.team.parts;
    const engF=partF(carPartLevel(c,'engine'),c.cond.engine,'engine'),chF=partF(carPartLevel(c,'chassis'),c.cond.chassis,'chassis'),bdF=partF(carPartLevel(c,'body'),c.cond.body,'body');
    // ---- passive driver abilities ----
    const pos=posOf.get(c),lit=id=>{c.abOn[id]=Math.max(c.abOn[id]||0,0.3);return true;};
    let paceMul=1,gripMul=1,accMul=1,topMul=1;c.boost=null;
    // Track abilities work where the shape calls for them, and show a trail in their colour while they do.
    if(DARK[i]){if(has(c,'tunnel')){lit('tunnel');c.boost='#b36bff';}else paceMul*=0.96;}
    if(SLOWZ[i]&&has(c,'streetrat')&&lit('streetrat')){gripMul*=1.12;c.boost='#2ef2ff';}
    if(STRAIGHT[i]&&has(c,'boulevard')&&lit('boulevard')){topMul*=1.04;if(c.v>c.top*0.9)c.boost='#ff2e88';}
    if(isRain()&&has(c,'raindancer')&&lit('raindancer')){gripMul*=1.10;if(SLOWZ[i])c.boost='#39a8ff';}
    if(c.state==='race'){
      if(has(c,'front')&&pos<=3&&lit('front'))paceMul*=1.015;
      if(has(c,'comeback')&&pos>10&&lit('comeback'))paceMul*=1.01;
      if(has(c,'closer')&&c.d>=(LAPS-1)*L&&lit('closer'))paceMul*=1.03;
      if(has(c,'rocket')&&race.t<10&&lit('rocket')){paceMul*=1.08;accMul*=1.08;}
      // Hunter builds pressure while tucked in close behind a car (and drains when not);
      // at 2.5 seconds of pressure it switches on while there's still a car within 8 ahead.
      if(has(c,'hunter')){
        const gapAhead=o=>o!==c&&o.state==='race'&&o.d-c.d>0;
        const close=cars.some(o=>gapAhead(o)&&o.d-c.d<5&&Math.abs(o.lat-c.lat)<2.5);
        c.huntT=Math.min(4,close?(c.huntT||0)+dt:Math.max(0,(c.huntT||0)-dt));
        if(c.huntT>=2.5&&cars.some(o=>gapAhead(o)&&o.d-c.d<8)&&lit('hunter'))paceMul*=1.02;
      }
      if(has(c,'miser')&&c.orders.fuel==='lean')lit('miser');
      if(has(c,'tirewhisper')&&c.orders.tires==='push')lit('tirewhisper');
    }
    if(race.mode==='quali'){
      paceMul*=1-TRACK_EVO+TRACK_EVO*Math.min(1,race.t/QUALI_SECONDS);   // the track rubbers in
      if(c.qMode==='out')paceMul*=OUTLAP_PACE;else if(c.qMode==='in')paceMul*=INLAP_PACE;
      if(has(c,'qualifier')&&c.qMode==='flying'&&lit('qualifier'))paceMul*=1.02;
    }
    paceMul*=moralePace(c);
    const spd=c.orders.fuel==='lean'&&has(c,'miser')?1-(1-F.spd)/2:F.spd;
    // ---- Night Tune grades ----
    const tEng=tunePace(c,'engine'),tHnd=tunePace(c,'handling'),tAer=tunePace(c,'aero');
    if(golden(c,'engine'))paceMul*=1.015;
    paceMul*=tuneBonus(c);   // sweet spots: +1% each, Perfect Tune +3% more
    if(golden(c,'aero')&&c.state==='race'&&cars.some(o=>o!==c&&o.state==='race'&&o.d-c.d>0&&o.d-c.d<8))paceMul*=1.02;
    let vmax=c.top*topMul*spd*paceMul*tEng*Math.sqrt(tAer)*engF*Math.pow(bdF,0.3)*(0.82+0.18*c.dur/100);
    if(c.fuel<=0)vmax*=0.45; // running on fumes
    if(c.state==='done')vmax*=0.55;
    const grip=c.grip*gripMul*paceMul*tHnd*Math.sqrt(tAer)*TI.grip*cmpGrip(c.compound)*chF*Math.sqrt(bdF)*(c.failed.body?0.8:1)*(0.6+0.4*c.tire/100); // worn tires cost real corner speed
    let vt=vmax;
    for(let k=0;k<=70;k+=5){const vc=Math.sqrt(grip/Math.max(KA[(i+k)%N],1e-3));const ok=Math.sqrt(vc*vc+2*BRAKE*k*DS);if(ok<vt)vt=ok;}
    const rel=mod(mod(c.d,L)-PIT_IN,L);
    if(c.boxReq&&!c.pit&&c.state==='race'&&c.d>0&&rel<6)enterPit(c);
    let line;
    if(c.pit){
      // On the slip roads and in the lane the car follows the pit road exactly.
      line=pitLatAt(rel);c.lat=line;vt=Math.min(vt,PIT_SPEED);
      if(c.pit.phase==='lane'&&rel>=c.pit.box&&rel<PIT_LEN){if(race.mode==='quali')parkInBox(c);else startService(c);}
      if(c.pit.phase==='parked'){vt=0;c.v=0;}
      else if(c.pit.phase==='stop'){vt=0;c.v=0;c.pit.t-=dt;if(c.pit.t<=0)finishService(c);}
      else if(c.pit.phase==='out'&&rel>=PIT_LEN+PIT_RAMP&&rel<PIT_LEN+PIT_RAMP+20)c.pit=null;   // rejoined at the end of the exit road
    }else{
      line=Math.max(-1.6,Math.min(1.6,K[(i+16)%N]*30)); // drift to the inside of the next corner
      if(c.boxReq&&rel>L-60)line=PIT_JOIN;   // boxing: move over to the pit entry side
      let ahead=null,gap=1e9;
      for(const o of cars){if(o===c||o.state==='wreck'||o.pit)continue;const g=o.d-c.d;
        if(g>0&&g<6&&Math.abs(o.lat-c.lat)<1.7&&g<gap){gap=g;ahead=o;}}
      if(ahead){
        const rc=c.drv.stats.racecraft+(has(c,'comeback')&&pos>10?15:0),rcA=ahead.drv.stats.racecraft;
        const need=0.5-(rc-70)*0.015+(has(ahead,'wall')?1.5:0);   // speed edge needed to go for a pass
        if(vt>ahead.v+need&&c.passT<=0){c.passT=1.3;c.passSide=ahead.lat>0?-1:1;}
        else if(has(ahead,'wall')&&vt>ahead.v+0.5)ahead.abOn.wall=0.5;
        if(gap<2*CAR_SCALE)vt=Math.min(vt,ahead.v-0.3+(rc-rcA)*0.01);
      }
      if(c.passT>0){c.passT-=dt;line=c.passSide*2.1;}
    }
    c.latT=line;
    c.v+=Math.max(-BRAKE*dt,Math.min(c.acc*accMul*engF*dt,vt-c.v));
    if(c.spin>0){c.spin-=dt;c.spinA+=dt*18;c.v=Math.min(c.v,8);}else c.spinA=0;
    const dl=c.latT-c.lat;c.lat+=Math.sign(dl)*Math.min(Math.abs(dl),(c.pit?6:3*statMul(c.drv.stats.racecraft,0.01))*dt);
    const dist=Math.max(0,c.v)*dt;c.d+=dist;
    if(c.state==='race'){
      const q=race.mode==='quali';   // qualifying: no fuel use, half the tire and part wear
      if(!q)c.fuel=Math.max(0,c.fuel-dist*FUEL_PER_UNIT*fuelBurn(c));
      c.tire=Math.max(0,c.tire-dist*TIRE_PER_UNIT*tireWear(c)*cornerLoad(i)*(q?0.5:1));
      const w=dist/L*WEAR_PER_LAP*(q?0.5:1)*wearMulFor(skillOf(c.team,'pit','mechanical'));   // the pit boss's MECHANICAL saves wear
      c.cond.engine=Math.max(0,c.cond.engine-w*F.burn);          // RICH works the engine harder
      c.cond.chassis=Math.max(0,c.cond.chassis-w*Math.sqrt(TI.wear));
      c.cond.body=Math.max(0,c.cond.body-w);
      c.cond.weapons=Math.max(0,c.cond.weapons-w*0.5);
      // Parts below 20% can fail. Engine or chassis failure ends the race; losing the body costs grip and plating.
      for(const id of ['engine','chassis','body']){
        const cd=c.cond[id];if(cd>=20||c.failed[id]||Math.random()>=(20-cd)*0.002*dt)continue;
        c.failed[id]=true;
        if(c.you)sfx(id==='body'?'bodyTear':'engineBlow',{car:c});
        if(id==='body'){if(c.you)say(`${c.name}: bodywork's torn off, no plating left!`,'bad');}
        else{c.failedPart=id;wreck(c,null,id==='engine'?'Engine failure':'Chassis failure');break;}
      }
      if(c.state==='wreck')continue;
    }
    if(race.mode==='quali'){if(c.state==='race')qualiTick(c);continue;}   // no finish line, weapons or mines
    if(c.state==='race'&&c.d>=LAPS*L){c.state='done';c.finishT=race.t;
      const p=standings().indexOf(c)+1;if(p===1&&!race.winner){race.winner=c;race.winAt=race.t;}if(p===1)say(`${c.name} takes the flag for ${c.team.name}.`,c.you?'you':'');
      else if(c.you){sfx('finish');say(`${c.name} home in P${p}.`,'you');}}
    if(c.state!=='race')continue;
    if(c.you)radioWarnings(c);else aiOrders(c);
    if(c.pit)continue;
    c.fireCd-=dt;
    if(c.fireCd<=0&&(G.rate===0||c.ammo<=0))c.fireCd=0.25;
    else if(c.fireCd<=0){
      let tgt=null,tg=1e9;
      // No teammate rivalry: guns and mines are only for other teams.
      for(const o of cars){if(o.team===c.team||o.state!=='race'||o.pit)continue;const g=o.d-c.d;if(g>1&&g<11&&Math.abs(o.lat-c.lat)<3.2&&g<tg){tg=g;tgt=o;}}
      if(tgt){fire(c,tgt);c.fireCd=rand(1.8,3.4)/G.rate;}else c.fireCd=0.25;
    }
    if(c.mines>0)for(const o of cars){if(o.team===c.team||o.state!=='race'||o.pit)continue;const g=c.d-o.d;
      if(g>2&&g<7&&Math.abs(o.lat-c.lat)<2&&Math.random()<0.1*dt){dropMine(c);break;}}
  }
  for(const m of mines){if(!m.active)continue;m.age+=dt;m.arm-=dt;
    if(m.age>25){m.active=false;m.m.visible=false;continue;}
    if(m.arm>0)continue;
    for(const c of cars){if(c.state==='wreck'||c.pit)continue;
      if(c.pos.distanceToSquared(m.m.position)<1.7*1.7){
        m.active=false;m.m.visible=false;spark(m.m.position,true);
        // Golden handling tune shrugs off the first spin of the race.
        if(c.you)sfx('mineHit',{car:c});
        if(golden(c,'handling')&&!c.spinSaved){c.spinSaved=true;if(c.you){sfx('save',{car:c});say(`${c.name}: caught it! Car's planted.`,'you');}}
        else{c.spin=0.7*statMul(composureOf(c),-0.01);c.v*=0.35;if(c.you)sfx('spin',{car:c});}
        moodNote(c,'Mine hit',-2);
        if(c.you)say(`${c.name}: hit a mine! ${m.owner.name} left it.`,'bad');
        damage(c,rand(10,14),m.owner,'mine');break;}}
  }
  if(race.mode==='quali'){
    // (a car that broke down on its flying lap will never finish it)
    if(!race.over&&race.t>=QUALI_SECONDS&&!cars.some(c=>c.qMode==='flying'&&c.state!=='wreck')){race.over=true;race.overAt=race.t;aiFinishTunes();say('Chequered flag: qualifying is over.');}
  }else if(!race.over&&cars.every(c=>c.state!=='race')){race.over=true;race.overAt=race.t;}
}
