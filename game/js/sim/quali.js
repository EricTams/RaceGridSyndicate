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
function qPlanRun(c,wait){if(wait){const f=qWaitAt(c);if(f!=null){c.qWait=f;say(`${c.name} will go out at ${Math.round(f*12)} minutes in.`,'you');return;}}qSend(c,c.qCmp);}

function startQualifying(){
  resetRace();   // fresh per-car race state, then park everyone in their pit box
  race.mode='quali';race.t=0;race.ready=true;
  $('restart').disabled=true;[4,6,10,15].forEach(n=>$('l'+n).disabled=true);
  cars.forEach(c=>{
    const box=boxRel(c.team,c.slot),d=PIT_IN+box-L;
    Object.assign(c,{d,lat:PIT_LAT,latT:PIT_LAT,v:0,pit:{phase:'parked',box,t:0,total:0,add:0},
      qMode:'garage',qSets:qualiSetsFor(c),qBest:null,qStart:0,qAgain:false,qLap:Math.floor(d/L),compound:'soft',
      qPlan:c.you?null:Q_PLANS[c.team.mgr.tactics](),qWait:null});
  });
  feedItems.length=0;$('feed').innerHTML='';
  say('Qualifying is live: 12 minutes on the clock. Weapons are off.');
}
function qSend(c,compound){
  if(race.mode!=='quali'||!c.pit||c.qMode!=='garage'||c.qSets<=0||race.t>=QUALI_SECONDS)return;
  if(c.you&&!readyToRun(c))return;   // finish this phase's tune picks first
  c.qSets--;c.compound=compound;c.tire=100;c.qMode='out';c.qAgain=false;c.pit.phase='out';
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
  if(c.you&&c.qWait!=null&&c.qMode==='garage'&&race.t>=c.qWait*QUALI_SECONDS){c.qWait=null;qSend(c,c.qCmp);}
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
