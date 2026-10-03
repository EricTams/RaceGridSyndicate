// Fuel and tire maths, AI race strategy, pit stops, radio warnings.
'use strict';

// Fuel left at the flag if the car keeps its current fuel order (negative = runs dry).
function fuelBurn(c,mode=c.orders.fuel){
  return ORDERS.fuel.opts[mode].burn*statMul(c.drv.stats.fuel,-0.006)*(mode==='lean'&&has(c,'miser')?0.85:1);
}
function tireWear(c,mode=c.orders.tires,cmp=c.compound){
  return ORDERS.tires.opts[mode].wear*cmpWear(cmp)*statMul(c.drv.stats.tires,-0.01)*(mode==='push'&&has(c,'tirewhisper')?0.65:1);
}
// Laps a fresh set of a compound lasts for this driver on this track.
const tireLifeLaps=(c,cmp,mode='std')=>100/(TIRE_PER_UNIT*avgLoad*L*tireWear(c,mode,cmp));
// Weather and compounds: on acid rain slicks lose grip and WETs keep it; on a dry night WETs overheat.
const cmpGrip=cmp=>COMPOUNDS[cmp].grip*(isRain()?(cmp==='wet'?1:0.88):(cmp==='wet'?0.9:1));
const cmpWear=cmp=>COMPOUNDS[cmp].wear*(cmp==='wet'&&!isRain()?2:1);
const compoundsNow=()=>isRain()?['wet',...CMP_ORDER]:CMP_ORDER;
// AI (and the default suggestion): WETs in the rain; otherwise the softest compound that reaches the flag, or hards.
function bestCompound(c){
  if(isRain())return 'wet';
  const lapsLeft=Math.max(0,LAPS*L-c.d)/L;
  return CMP_ORDER.find(k=>tireLifeLaps(c,k,c.orders.tires)>=lapsLeft*1.05)||'hard';
}
function fuelAtFlag(c){return c.fuel-Math.max(0,LAPS*L-c.d)*FUEL_PER_UNIT*fuelBurn(c);}
// AI strategies: HEXADYNE attacks on RICH/PUSH with one stop, JACKALS one-stop on STD, KOBRA stretches it with no stop.
// Tire % a car will still use before the flag on a given tire order.
const tireNeed=(c,mode)=>Math.max(0,LAPS*L-c.d)*TIRE_PER_UNIT*avgLoad*tireWear(c,mode);
// AI strategies come from each team's plan (see TEAMS). Everyone boxes when fuel or tires can't reach the flag.
function aiOrders(c){
  const remain=LAPS*L-c.d;
  if(c.team.plan==='attack'){c.orders.fuel='rich';c.orders.tires='push';}
  else if(c.team.plan==='stretch'){
    const need=Math.max(0,remain)*FUEL_PER_UNIT;
    // Stretch only when the tank can reach the flag on LEAN; otherwise run STD and stop.
    const canStretch=c.fuel>=need*ORDERS.fuel.opts.lean.burn;
    c.orders.fuel=!canStretch?'std':c.fuel<need*1.01?'lean':c.fuel>need*ORDERS.fuel.opts.rich.burn+3?'rich':'std';
    c.orders.tires=c.tire>=tireNeed(c,'save')&&c.tire<tireNeed(c,'std')*1.05?'save':'std';
  }
  if(c.boxReq||c.pit||remain<L)return;
  const lapFuel=L*FUEL_PER_UNIT*fuelBurn(c);
  if((fuelAtFlag(c)<0&&c.fuel<lapFuel*1.4)||(c.tire<25&&c.tire<tireNeed(c,c.orders.tires))){c.boxReq=true;c.pitCompound=bestCompound(c);}
}
// Refuel adds enough to reach the flag on RICH (+3%), so a stop buys the right to push.
const fuelTarget=c=>Math.min(100,Math.max(0,LAPS*L-c.d)*FUEL_PER_UNIT*fuelBurn(c,'rich')+3);
function enterPit(c){
  c.pit={phase:'lane',box:boxRel(c.team,c.slot),t:0,total:0,add:0};
  if(race.mode!=='quali'&&c.you)say(`${c.name} in the pit lane.`,'you');   // rivals' stops show in the timing tower
}
function startService(c){
  c.pit.add=c.pitFuel?Math.max(0,fuelTarget(c)-c.fuel):0;
  c.pit.t=c.pit.total=(1+c.pit.add/15+(c.pitCompound!=='none'?1.5:0))*(has(c,'pitwhisper')?0.7:1)*pitMulFor(skillOf(c.team,'pit','nerve'))+sabotageSecs(c.team);   // the pit boss's NERVE (and a bribed crew)
  if(has(c,'pitwhisper'))c.abOn.pitwhisper=2;
  c.pit.phase='stop';c.v=0;if(c.you&&race.mode!=='quali')sfx('airgun',{car:c,dur:c.pit.t});
}
function finishService(c){
  c.fuel+=c.pit.add;if(c.pitCompound!=='none'){c.tire=100;c.compound=c.pitCompound;}
  // the pit boss's MECHANICAL: the crew patches up the most worn part while the car is in
  const worst=PARTS.map(p=>p.id).reduce((a,b)=>c.cond[b]<c.cond[a]?b:a),fix=Math.min(100-c.cond[worst],pitRepairFor(skillOf(c.team,'pit','mechanical')));
  c.cond[worst]+=fix;c.pit.fixed=fix>=1?{id:worst,fix}:null;
  c.pit.phase='out';c.boxReq=false;c.warn={};c.stops++;if(c.you)sfx('pitOut',{car:c});
  if(c.you){const did=[c.pit.add>0.5?`+${Math.round(c.pit.add)}% fuel`:'',c.pitCompound!=='none'?`fresh ${COMPOUNDS[c.pitCompound].label.toLowerCase()}s`:'',
      c.pit.fixed?`${PARTS.find(p=>p.id===c.pit.fixed.id).label.toLowerCase()} +${Math.round(c.pit.fixed.fix)}%`:''].filter(Boolean).join(', ')||'no service';
    say(`${c.name}: ${c.pit.total.toFixed(1)}s stop, ${did}. Go!`,'you');}
}
function radioWarnings(c){
  const w=c.warn,dry=fuelAtFlag(c)<0;
  if(dry&&!w.fuel)say(`${c.name}: fuel won't make the flag on ${ORDERS.fuel.opts[c.orders.fuel].label}.`,'bad');
  w.fuel=dry;
  if(c.tire<30&&!w.tire){w.tire=true;say(`${c.name}: tires are going off, grip's fading.`,'bad');}
  if(c.ammo<=0&&!w.ammo){w.ammo=true;say(`${c.name}: guns dry, out of rounds.`,'bad');}
  if(c.fuel<=0&&!w.empty){w.empty=true;say(`${c.name}: tank's empty! Crawling home.`,'bad');}
}
