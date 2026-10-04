// Qualifying: one timed session. Cars start parked in their pit boxes; a run is out-lap, flying lap,
// in-lap. Weapons are off, the track gets faster, and cars on out- and in-laps get in the way.
'use strict';

// When AI cars start their two runs, as a fraction of the session, by their manager's tactics rating.
// Rookies sometimes leave the last run too late to start a flying lap before the flag.
const Q_PLANS={
  rookie:()=>[rand(0.02,0.15),rand(0.5,0.9)],
  pro:()=>[rand(0.08,0.2),rand(0.58,0.7)],
  elite:()=>[rand(0.25,0.35),rand(0.7,0.78)],
};
const fmtLap=t=>t==null?'NO TIME':t.toFixed(3);
// Your "wait for grip" timing: the track rubbers in, so later runs are quicker (like an elite manager's plan).
const Q_WAIT=[0.3,0.72];
const qWaitAt=c=>Q_WAIT.find(f=>f*QUALI_SECONDS>race.t+5);   // the next planned slot still ahead, if any
const qMin=t=>Math.round(t/QUALI_SECONDS*QUALI_CLOCK/60);   // sim seconds -> minutes on the session clock
// c.qWait: the grip slot a car is waiting for (its release time c.qGo is re-planned around it, see qualiPlan);
// c.qGo alone: a fixed release, e.g. GO NOW held back so your two cars don't leave nose to tail.
function qPlanRun(c,wait){
  if(wait){const f=qWaitAt(c);if(f!=null){c.qWait=f;c.qGo=f*QUALI_SECONDS;qualiPlanCar(c);say(`${c.name} will look for a gap around ${qMin(f*QUALI_SECONDS)} minutes in.`,'you');return;}}
  const mate=mine.find(x=>x!==c),gone=mate&&mate.qLeft!=null&&race.t-mate.qLeft<Q_STAGGER;
  if(gone){c.qWait=null;c.qGo=mate.qLeft+Q_STAGGER;return;}
  qSend(c,c.qCmp);
}

// Finding a gap. WAIT FOR GRIP aims for its slot, but picks the moment within a window around it that puts the
// car's flying lap in clear air (no slow out- or in-lap car to catch, and not on top of your other car's lap).
// The forecast is rough: every car laps at one average speed, scaled for its mode and the rubbering-in, and the
// AI teams leave when their plans say. Re-planned every half second, so it follows what really happens.
const Q_GAP_EARLY=8,Q_GAP_LATE=3,Q_GAP_STEP=0.5,Q_STAGGER=3,Q_FC_DT=0.25,Q_UNRUN=0.95,Q_CLOSE=0.6;
const qPace=m=>m==='out'?OUTLAP_PACE:m==='in'?INLAP_PACE:1;
const qEvo=t=>1-TRACK_EVO+TRACK_EVO*Math.min(1,t/QUALI_SECONDS);
const PIT_EXIT=()=>PIT_LEN+PIT_RAMP;   // where the exit road rejoins, measured from PIT_IN
// Average lapping speed: measured from the cars on track (time-averaged, so corners count), or a guess until then.
// Per car once it has done some running: over a minute's forecast, a few percent of pace is a car length or ten.
// Before a car has run, the field's speed scaled by its top speed against the cars measured so far, less a bit
// (Q_UNRUN: measured against real first runs, which this guess overrates).
function qBaseSpeed(c){
  if(c&&c.qVT>8)return c.qVS/c.qVT;
  const ran=cars.filter(x=>x.qVT>0),top=ran.length?ran.reduce((a,x)=>a+x.top*x.qVT,0)/ran.reduce((a,x)=>a+x.qVT,0):0;
  const field=race.qVT>4?race.qVS/race.qVT:cars.reduce((a,x)=>a+x.top,0)/cars.length*0.8;
  return c&&top?field*c.top/top*Q_UNRUN:field;
}
// Where every car is now, as the forecast's starting state. rel: distance past PIT_IN, for cars in the pit lane.
function qFcStart(plans){
  return cars.filter(c=>c.state==='race').map(c=>{
    const rel=mod(mod(c.d,L)-PIT_IN,L),plan=plans.has(c)?[plans.get(c)]:c.you?[]:(c.qPlan||[]).map(f=>f*QUALI_SECONDS);
    const o={c,d:c.d,mode:c.qMode,rel,lap:c.qLap,sets:c.qSets,plan,again:c.you&&c.qAgain};
    if(c.qMode==='garage'||(c.pit&&c.qMode==='in'))o.mode='garage';
    else if(c.pit)o.mode='lane';   // heading out
    return o;
  });
}
// Run the forecast to `until`; returns the clear-air penalty: seconds your cars spend on a flying lap with a car
// within Q_CLOSE seconds ahead. A slow one (out- or in-lap) counts in full; a flying one barely, it isn't in the way.
function qForecast(plans,until){
  const D=qBaseSpeed()*Q_CLOSE,fc=qFcStart(plans);let pen=0;
  for(const o of fc)o.v0=qBaseSpeed(o.c);
  for(let t=race.t;t<until;t+=Q_FC_DT){
    const evo=qEvo(t);
    for(const o of fc){const v=o.v0*evo;
      if(o.mode==='garage'){
        if(o.sets>0&&o.plan.length&&t>=o.plan[0]&&t<QUALI_SECONDS){o.plan.shift();o.sets--;o.mode='lane';}continue;}
      if(o.mode==='lane'){o.rel+=PIT_SPEED*Q_FC_DT;
        if(o.rel>=PIT_EXIT()){o.mode='out';o.d=PIT_IN+o.rel+Math.floor((o.d-PIT_IN)/L)*L;if(o.d<o.c.d)o.d+=L;o.lap=Math.floor(o.d/L);}continue;}
      o.d+=v*qPace(o.mode)*Q_FC_DT;
      const lap=Math.floor(o.d/L);
      if(lap!==o.lap){o.lap=lap;
        if(o.mode==='out')o.mode=t<QUALI_SECONDS?'flying':'in';
        else if(o.mode==='flying'){if(o.again&&t<QUALI_SECONDS)o.again=false;else o.mode='in';}}
      if(o.mode==='in'&&mod(mod(o.d,L)-PIT_IN,L)<v*Q_FC_DT*2){o.mode='garage';o.rel=o.c.pit?o.c.pit.box:boxRel(o.c.team,o.c.slot);}
    }
    for(const m of fc){if(!m.c.you||m.mode!=='flying')continue;
      for(const o of fc){if(o===m||!['out','flying','in'].includes(o.mode))continue;
        if(mod(o.d-m.d,L)<D)pen+=(o.mode==='flying'?0.1:1)*Q_FC_DT;}}
  }
  return pen;
}
// Re-plan one waiting car: try every release time in its window, keep the cleanest (nearest the slot on a tie).
function qualiPlanCar(c){
  if(c.qWait==null||c.qMode!=='garage')return;
  const v0=qBaseSpeed(c),slot=c.qWait*QUALI_SECONDS,box=c.pit?c.pit.box:PIT_HALF;
  const outLap=(PIT_EXIT()-box)/PIT_SPEED+(L-mod(PIT_IN+PIT_EXIT(),L))/(v0*OUTLAP_PACE);
  const from=Math.max(race.t,slot-Q_GAP_EARLY),to=Math.max(from,Math.min(slot+Q_GAP_LATE,QUALI_SECONDS-outLap-2));
  const mate=mine.find(x=>x!==c),plans=new Map();
  const mateGo=mate&&mate.qMode==='garage'&&mate.qGo!=null?mate.qGo:mate&&mate.qLeft!=null?mate.qLeft:null;
  if(mate&&mate.qMode==='garage'&&mate.qGo!=null)plans.set(mate,mate.qGo);
  let best=null,bestScore=1e9;
  for(let t=from;t<=to+1e-6;t+=Q_GAP_STEP){
    if(mateGo!=null&&Math.abs(t-mateGo)<Q_STAGGER&&t<to)continue;   // never nose to tail with your other car
    plans.set(c,t);
    const score=qForecast(plans,t+outLap+L/v0*1.05)+0.05*Math.abs(t-slot);
    if(score<bestScore-1e-9){bestScore=score;best=t;}
  }
  c.qGo=best;
}
// Every tick of qualifying: measure the lapping speed, and re-plan the cars waiting for a gap.
function qualiPlan(dt){
  for(const c of cars)if(c.state==='race'&&!c.pit&&c.qMode!=='garage'){const b=c.v/(qPace(c.qMode)*qEvo(race.t))*dt;
    race.qVS+=b;race.qVT+=dt;c.qVS=(c.qVS||0)+b;c.qVT=(c.qVT||0)+dt;}
  race.qPlanT=(race.qPlanT||0)-dt;if(race.qPlanT>0)return;race.qPlanT=Q_GAP_STEP;
  // (only once a car's window has opened: before that there's nothing to choose yet)
  mine.filter(c=>c.qWait!=null&&race.t>=c.qWait*QUALI_SECONDS-Q_GAP_EARLY-1).sort((a,b)=>a.qGo-b.qGo).forEach(qualiPlanCar);
}

function startQualifying(){
  resetRace();   // fresh per-car race state, then park everyone in their pit box
  race.mode='quali';race.t=0;race.ready=true;race.qVS=0;race.qVT=0;race.qPlanT=0;
  $('restart').disabled=true;[4,6,10,15].forEach(n=>$('l'+n).disabled=true);
  cars.forEach(c=>{
    const box=boxRel(c.team,c.slot),d=PIT_IN+box-L;
    Object.assign(c,{d,lat:PIT_LAT,latT:PIT_LAT,v:0,pit:{phase:'parked',box,t:0,total:0,add:0},
      qMode:'garage',qSets:qualiSetsFor(c),qBest:null,qStart:0,qAgain:false,qLap:Math.floor(d/L),compound:'soft',
      qPlan:c.you?null:Q_PLANS[c.team.mgr.tactics](),qWait:null,qGo:null,qLeft:null,qVS:0,qVT:0});
  });
  feedItems.length=0;$('feed').innerHTML='';
  say('Qualifying is live: 12 minutes on the clock. Weapons are off.');
}
function qSend(c,compound){
  if(race.mode!=='quali'||!c.pit||c.qMode!=='garage'||c.qSets<=0||race.t>=QUALI_SECONDS)return;
  if(c.you&&!readyToRun(c))return;   // finish this phase's tune picks first
  c.qSets--;c.qWait=null;c.qGo=null;c.qLeft=race.t;c.compound=compound;c.tire=100;c.qMode='out';c.qAgain=false;c.pit.phase='out';
  if(c.you){sfx('pitOut',{car:c});say(`${c.name} heads out on ${COMPOUNDS[compound].label.toLowerCase()}s.`,'you');}
}
function qAbort(c){
  if(c.qMode!=='out'&&c.qMode!=='flying')return;
  c.qMode='in';c.boxReq=true;c.qAgain=false;
  if(c.you){sfx('qIn');say(`${c.name}: aborting, coming in.`,'you');}
}
function parkInBox(c){c.pit.phase='parked';c.v=0;c.boxReq=false;c.qMode='garage';if(c.you&&!race.over){sfx('qIn');qualiReturn(c);}}

// Called every tick for cars in qualifying: AI run timing, and what happens at the start/finish line.
function qualiTick(c){
  if(!c.you&&c.qMode==='garage'&&c.qPlan&&c.qPlan.length&&race.t>=c.qPlan[0]*QUALI_SECONDS){c.qPlan.shift();qSend(c,isRain()?'wet':'soft');}
  if(c.you&&c.qGo!=null&&c.qMode==='garage'&&race.t>=c.qGo){
    // the last word on spacing, whatever planned the release: hold on if your other car has only just left
    const mate=mine.find(x=>x!==c);
    if(mate&&mate.qLeft!=null&&race.t-mate.qLeft<Q_STAGGER)c.qGo=mate.qLeft+Q_STAGGER;else qSend(c,c.qCmp);
  }
  const lap=Math.floor(c.d/L);if(lap===c.qLap)return;c.qLap=lap;
  const over=race.t>=QUALI_SECONDS;
  if(c.qMode==='out'&&!c.pit){             // crossing the line after leaving the pit lane starts a flying lap
    if(over){c.qMode='in';c.boxReq=true;return;}   // too late: a lap has to start before the flag
    c.qMode='flying';c.qStart=race.t;return;
  }
  if(c.qMode==='flying'){
    const time=race.t-c.qStart;
    if(c.you)onQualiLap(c);else aiQualiLap(c);   // the flying lap is also the Night Tune's feedback lap
    if(c.you)sfx(c.qBest===null||time<c.qBest?'qBest':'qLap');
    if(c.qBest===null||time<c.qBest){c.qBest=time;if(c.you)say(`${c.name}: ${fmtLap(time)}, P${standings().indexOf(c)+1} for now.`,'you');}
    else if(c.you)say(`${c.name}: ${fmtLap(time)}, no improvement.`,'you');
    if(c.qAgain&&!over&&c.tire>40){c.qStart=race.t;c.qAgain=false;return;}
    c.qMode='in';c.boxReq=true;
  }
}

// ---- after the session: the starting grid, then the race strategy (starting tires and orders), then the race ----
let qStep='grid';
function renderQualiResult(){
  const order=standings(),pole=order[0].qBest;
  if(qStep==='grid'){
    // The grid in two columns, like the real thing; lap times on hover.
    const slot=(c,k)=>`<li class="${c.you?'you':''}" value="${k+1}" title="${c.team.name} · ${fmtLap(c.qBest)}${c.qBest!=null&&pole!=null&&k?` (+${(c.qBest-pole).toFixed(3)})`:''}">${c.name}</li>`;
    $('qres').innerHTML=`<h3>STARTING GRID</h3>
      <div class="sgrid"><ol>${order.map(slot).filter((_,k)=>k%2===0).join('')}</ol><ol class="even">${order.map(slot).filter((_,k)=>k%2===1).join('')}</ol></div>
      <div class="gfoot"><span></span><button id="toStrategy">CONTINUE</button></div>`;
    $('toStrategy').addEventListener('click',()=>{qStep='strategy';renderQualiResult();});
  }else{
    // Set strategy: each car's starting tires and its opening orders.
    $('qres').innerHTML=`<h3 title="No tire rule: each car starts on the compound picked here. Orders can be changed from the race screen.">SET STRATEGY · ${LAPS} LAPS</h3>
      <div class="strat">${mine.map((c,k)=>{c.orders=c.orders||{fuel:'std',tires:'std',guns:'std'};
        return `<section><h4>${c.name} · P${order.indexOf(c)+1}</h4>
        <div class="srow"><span>START TIRES</span>${compoundsNow().map(cm=>`<button data-start="${k}" data-cmp="${cm}" aria-pressed="${(c.startCompound||(isRain()?'wet':'medium'))===cm}" title="${tireLifeLaps(c,cm).toFixed(1)} laps on STD">${COMPOUNDS[cm].label}</button>`).join('')}</div>
        ${['tires','fuel','guns'].map(kind=>{const o=ORDERS[kind];return `<div class="srow"><span title="${o.tip}">${o.label}</span><span class="lv pill">${Object.entries(o.opts).map(([val,v])=>
          `<button class="lvl ${v.col}" data-sorder="${k}" data-kind="${kind}" data-val="${val}" aria-pressed="${c.orders[kind]===val}" title="${v.tip}"></button>`).join('')}</span></div>`;}).join('')}
        </section>`;}).join('')}</div>
      <div class="gfoot"><button id="toGridBack">BACK</button><button id="toGrid">GO TO THE GRID</button></div>`;
    $('qres').querySelectorAll('[data-start]').forEach(b=>b.addEventListener('click',()=>{mine[+b.dataset.start].startCompound=b.dataset.cmp;renderQualiResult();}));
    $('qres').querySelectorAll('[data-sorder]').forEach(b=>b.addEventListener('click',()=>{mine[+b.dataset.sorder].orders[b.dataset.kind]=b.dataset.val;renderQualiResult();}));
    $('toGridBack').addEventListener('click',()=>{qStep='grid';renderQualiResult();});
    $('toGrid').addEventListener('click',goToGrid);
  }
  $('tuneOv').hidden=true;$('qualiOv').hidden=false;   // one office screen at a time
}
function goToGrid(){
  const grid=standings(),pole=grid[0];
  $('qualiOv').hidden=true;qStep='grid';
  resetRace(grid);race.t=-6.5;   // the title card, then the lights (views.js drawStart)
  // The race cards start on the orders picked in Set strategy.
  mine.forEach((c,k)=>document.querySelectorAll(`[data-car="${k}"][data-kind]`).forEach(b=>b.setAttribute('aria-pressed',String(c.orders[b.dataset.kind]===b.dataset.val))));
  say(`Pole: ${pole.name} (${pole.team.name}), ${fmtLap(pole.qBest)}.`);
}
