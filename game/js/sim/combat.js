// Wrecks, damage, gunfire and mines.
'use strict';

function wreck(c,by,reason){
  c.state='wreck';c.dur=0;c.latT=Math.sign(c.lat||1)*(HW+1.4);if(by&&!reason)c.wreckedBy=by;   // (for the fixer's claims after the race)
  c.body.uniforms.uColor.value.set('#2a2030');c.trim.uniforms.uColor.value.set('#3a2a36');
  spark(c.pos,true);sfx(c.you?'wreck':'wreckFar',{car:c});
  if(by&&!reason){const s=seasonStat(by.team);s.kills=(s.kills||0)+1;}   // wrecking rivals builds Street Cred
  if(reason)moodNote(c,`${reason} DNF`,-10);else if(by)moodNote(c,`Wrecked by ${by.name}`,-6);else moodNote(c,'DNF',-4);
  if(reason)say(c.you?`${c.name}: ${reason}! Car's done. DNF.`:`${c.name} (${c.team.name}) out: ${reason.toLowerCase()}.`,c.you?'bad':'');
  else say(c.you?`${c.name}: I'm out, car's dead. DNF.`:`${c.name} (${c.team.name}) wrecked${by?` by ${by.name}`:''}.`,c.you?'bad':'');
}
function damage(c,amount,src,why){
  if(c.state==='wreck')return;
  // Body plating soaks damage: a better, fresher body means less harm; a torn-off body takes 30% more.
  const plating=partF(carPartLevel(c,'body'),c.cond.body,'body')*(c.failed.body?1/1.3:1);
  let nerve=statMul(composureOf(c),-0.008)*(why==='gun'&&has(c,'cool')?0.75:1)*(1+(1-tuneShare(c,'armor'))*0.67);
  // Golden armor tune: the first hit each lap does half damage.
  const lapNow=Math.floor(Math.max(0,c.d)/L);if(golden(c,'armor')&&c.armorLap!==lapNow){c.armorLap=lapNow;nerve*=0.5;}
  if(why==='gun'&&has(c,'cool'))c.abOn.cool=1;
  c.dur=Math.max(0,c.dur-amount*c.armor*nerve/plating);c.flash=1;
  // Hits also chew up a part: a mine hits the chassis, gunfire mostly hits the body.
  const part=why==='mine'?'chassis':Math.random()<0.6?'body':choice(PARTS).id;c.cond[part]=Math.max(0,c.cond[part]-amount*0.8);
  // The armor bar shows every hit; the radio only speaks up when armor crosses 50% and 25%.
  if(c.you){const th=c.dur<25?25:c.dur<50?50:0;
    if(th&&(c.armorWarn||101)>th){c.armorWarn=th;sfx('armor',{car:c});say(`${c.name}: armor under ${th}%${src&&why==='gun'?`, ${src.name} is shooting`:''}!`,'bad');}}
  if(c.dur<=0)wreck(c,src);
}
function fire(c,t){
  c.ammo=Math.max(0,c.ammo-BURST);c.cond.weapons=Math.max(0,c.cond.weapons-0.25);
  // A worn weapons package jams; a better one hits more often.
  if(!has(c,'deadeye')&&!golden(c,'weapons')&&c.cond.weapons<30&&Math.random()<(30-c.cond.weapons)/60){
    if(c.you&&race.t-(c.lastJam||-9)>6){c.lastJam=race.t;sfx('jam',{car:c});say(`${c.name}: guns jammed!`,'bad');}
    return;
  }
  const wF=partF(carPartLevel(c,'weapons'),c.cond.weapons,'weapons');
  const aim=statMul(c.drv.stats.gunnery,0.01)*(c.abOn.hunter?1.1:1)*(has(c,'deadeye')?1.05:1)*
    tuneShare(c,'weapons')*(golden(c,'weapons')?1.1:1);
  if(has(c,'deadeye'))c.abOn.deadeye=1;
  const from=c.pos.clone().setY(1.15*CAR_SCALE),hit=Math.random()<ORDERS.guns.opts[c.orders.guns].acc*wF*aim*(weatherId()==='fog'?0.75:1);
  const to=t.pos.clone().setY(0.65*CAR_SCALE);if(!hit)to.add(new THREE.Vector3(rand(-2.5,2.5),0,rand(-2.5,2.5)));
  tracer(from,to,c.you?'#2ef2ff':'#ffe066');if(c.you)sfx('gun',{car:c});
  if(hit){spark(to);if(t.you)sfx('hit',{car:t});damage(t,rand(1,2.2),c,'gun');}
}
function dropMine(c){
  const m=mines.find(m=>!m.active);if(!m)return;
  Object.assign(m,{active:true,arm:0.8,age:0,owner:c});m.m.visible=true;m.m.position.copy(c.pos).setY(0.2);
  c.mines--;if(c.you){sfx('mineDrop',{car:c});say(`${c.name}: mine's out.`,'you');}
}
