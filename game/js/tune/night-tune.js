// The Night Tune: gauges, cards, feedback, grades and its screen.
'use strict';

// Five gauges start at 0, each with a hidden target set by the track (plus a small per-driver offset).
// Initial tune (blind) -> flying lap -> tune -> flying lap -> final tune, where the two flying laps ARE the
// car's two qualifying runs: each sets a lap time and brings back feedback. Every pick is a fresh offer of
// cards with exact effects; randomness lives in which cards are offered and in the driver's feedback,
// never in what a chosen card does. Grades S..D decide how much of the car the driver gets on race night.
const GAUGES=[
  {id:'engine',label:'ENGINE',short:'ENG',word:'Engine',gold:'+1.5% top speed'},
  {id:'handling',label:'HANDLING',short:'HND',word:'Handling',gold:'Shrugs off the first spin'},
  {id:'aero',label:'AERO',short:'AER',word:'Aero',gold:'+2% pace in a slipstream'},
  {id:'weapons',label:'WEAPONS',short:'WPN',word:'Guns',gold:'+10% hit chance, no jams'},
  {id:'armor',label:'ARMOR',short:'ARM',word:'Plating',gold:'First hit each lap does half damage'},
];
const TUNE_PHASES=[{picks:4,label:'TEAM BASELINE',note:'Blind, and shared: these picks set up both cars before qualifying.'},
  {picks:3,label:'TUNE 2',note:'Use the feedback from qualifying run 1.'},{picks:3,label:'FINAL TUNE',note:'Race setup: no lap after this one, commit.'}];
const LAST_PHASE=TUNE_PHASES.length-1;
// Picks in a phase: your Sim Rig adds a baseline pick; a crew chief with DESIGN 4+ adds one to the final tune.
const phasePicks=(c,i)=>i===0?(c.you?baselinePicks():TUNE_PHASES[0].picks):TUNE_PHASES[i].picks+(i===LAST_PHASE&&skillOf(c.team,'chief','design')>=4?1:0);
const T_MIN=25,T_MAX=90,GRADES=[['S',5],['A',10],['B',18],['C',28],['D',999]];
const GRADE_SHARE={S:1,A:0.95,B:0.88,C:0.80,D:0.70};
// AI managers play the same Night Tune with the quick tune; a manager's tactics rating is how often they grab a
// random card instead of the best one.
const AI_TUNE_MISS={rookie:0.6,pro:0.35,elite:0.1};
const CARD_NAMES={
  engine:['Remap the injectors','Overclock the turbo','Detune the ECU'],handling:['Stiffen the springs','Tighten the diff','Soften the dampers'],
  aero:['Add wing','Bolt on a splitter','Trim the wing'],weapons:['Rechamber the rounds','Hot-wire the feed','Tighten the choke'],
  armor:['Bolt on plating','Shift plates rearward','Strip some plating']};
// ntStage: 'tune' = team baseline before qualifying, 'quali' = during the session, 'post' = session over.
let tuneDone=false,ntCar=0,ntStage='tune',ntPrevPause=false;
const gradeOf=(d,s=5)=>d<=s?'S':GRADES.slice(1).find(([,lim])=>d<=lim)[0];   // s: the sweet spot's half-width
// The crew chief's DESIGN widens the sweet spot: within 5 of the target at DESIGN 1, 7 at 5 (A and below don't move).
const sweetFor=c=>5+0.5*(skillOf(c.team,'chief','design')-1);
// Until a tune is locked, the car runs on whatever the gauges are set to now (so tune 2 shapes run 2).
const tuneGrade=(c,g)=>!c.tune?'B':c.tune.grades?c.tune.grades[g]:gradeOf(Math.abs(c.tune.vals[g]-c.tune.targets[g]),sweetFor(c));
const tuneShare=(c,g)=>GRADE_SHARE[tuneGrade(c,g)];
const tunePace=(c,g)=>1-(1-tuneShare(c,g))*0.12;          // a D tune costs ~3.6% on that axis
const golden=(c,g)=>tuneGrade(c,g)==='S';
// The sweet-spot payoff: once locked, each golden gauge is worth +1% pace for the race, and a Perfect Tune
// (all five golden) another +3% on top.
const sweetCount=c=>c.tune&&c.tune.locked?GAUGES.filter(g=>c.tune.grades[g.id]==='S').length:0;
const tuneBonus=c=>{const n=sweetCount(c);return 1+0.01*n+(n===GAUGES.length?0.03:0);};
// A car can go out for a qualifying run once its picks for the current phase are done.
const readyToRun=c=>c.tune.locked||(c.tune.lapReady&&c.tune.phase<LAST_PHASE);
const sigmaOf=c=>15*Math.max(0.4,1-(c.drv.stats.feedback-70)*0.02)*(has(c,'nightowl')?0.7:1)*feedbackMulFor(skillOf(c.team,'chief','people'));   // your crew chief's PEOPLE reads the driver
const PRIOR_MU=(T_MIN+T_MAX)/2,PRIOR_VAR=(T_MAX-T_MIN)**2/12;
function estimate(c,g){   // player-side belief about a target: uniform prior + noisy readings
  const rs=c.tune.readings[g],sg=sigmaOf(c),prec=1/PRIOR_VAR+rs.length/sg**2;
  const mu=(PRIOR_MU/PRIOR_VAR+rs.reduce((a,b)=>a+b,0)/sg**2)/prec;
  return {mu:Math.min(T_MAX,Math.max(T_MIN,mu)),sd:Math.sqrt(1/prec)};
}
// Special cards work from the hidden targets themselves, so besides helping they leak a little: watch which
// way things move. A card is special 5% of the time per crew chief star.
const SPECIALS={
  trim:{name:'FINE TRIM',text:'Every gauge 1 toward its sweet spot',tip:'Every gauge moves 1 toward its hidden target. Watch which way each one goes.'},
  hunch:{name:"CHIEF'S HUNCH",text:'Furthest-off gauge 10 toward its sweet spot',tip:'Your chief spots the gauge furthest from its target and moves it 10 toward it. Now you know which one it was, and which way.'},
  // a test facility's precise reading on one named gauge; only dealt in the team baseline, before any laps
  // sets one gauge to the middle of what the feedback says (the chief's PEOPLE deals it, once something has been read)
  dial:{name:'DIAL IT IN',text:'',tip:'Your chief sets this gauge to the middle of what the driver feedback says: your best read of its target, exactly.'},
  read:{name:'PRECISE READING',text:'A precise reading on one gauge',tip:'Nothing moves. The test facility reads this gauge far more precisely than a flying lap: its band narrows sharply.'},
};
// A special card's face: a precise reading is named for its gauge's test facility.
const specialFace=(cd,c)=>cd.special==='dial'?{...SPECIALS.dial,text:`${GAUGES.find(x=>x.id===cd.g).word} to your best read${c?` (${Math.round(estimate(c,cd.g).mu)})`:''}`}:cd.special!=='read'?SPECIALS[cd.special]:{...SPECIALS.read,name:HQ_ROOMS.find(r=>r.gauge===cd.g).label,text:`A precise reading on ${GAUGES.find(x=>x.id===cd.g).word.toLowerCase()}`};
function applySpecial(c,cd){
  const t=c.tune,kind=cd.special,off=g=>t.targets[g]-t.vals[g];
  if(kind==='trim')GAUGES.forEach(({id})=>{const d=off(id);t.vals[id]+=Math.sign(d)*Math.min(1,Math.abs(d));});
  else if(kind==='hunch'){const g=GAUGES.map(x=>x.id).reduce((a,b)=>Math.abs(off(b))>Math.abs(off(a))?b:a);const d=off(g);t.vals[g]+=Math.sign(d)*Math.min(10,Math.abs(d));}
  else if(kind==='dial')t.vals[cd.g]=estimate(c,cd.g).mu;
  else if(kind==='read'){
    const g=cd.g,r=t.targets[g]+gauss()*sigmaOf(c)*0.4;
    for(let k=0;k<6;k++)t.readings[g].push(r);   // worth six flying-lap readings
    t.notes.push(`${specialFace(cd).name}: ${GAUGES.find(x=>x.id===g).word} reads about ${Math.round(r)}.`);
  }
}
function pickSpecial(c,cd){if(c.you)sfx('card');(shared(c)?mine:[c]).forEach(x=>applySpecial(x,cd));usePick(c);}
// The deal: every knob for what the cards offer, in one place. A gauge's state is the driver's latest read of the
// gap minus what you've changed since (so an offer stops pushing a gauge you've already fixed); before any
// feedback every gauge counts as WAY_LOW, since they all start below the lowest target.
const DEAL={
  // how likely a card is to work on a gauge in each state
  gauge:{wayLow:4,low:2,right:0.5,high:2,wayHigh:4},
  // what kind of card it is for a gauge in that state
  kind:{wayLow:{bigUp:5,smallUp:2,smallDn:0.2,bigDn:0},
        low:   {bigUp:1,smallUp:5,smallDn:0.3,bigDn:0},
        right: {bigUp:0.2,smallUp:1,smallDn:1,bigDn:0.2},
        high:  {bigUp:0,smallUp:0.3,smallDn:5,bigDn:1},
        wayHigh:{bigUp:0,smallUp:0.2,smallDn:2,bigDn:5}},
  // the unsharpened deal a weak chief falls back on
  flatKind:{bigUp:2,smallUp:1,smallDn:0.5,bigDn:0.5},
  size:{big:[15,30],small:[5,12]},
  // how closely the deal follows the table, by crew chief DESIGN (0-5); the Sim Rig adds its aim on top
  sharp:[0.3,0.45,0.6,0.7,0.8,0.9],
  // side effects: odds per chief DESIGN, size, and which gauges they tend to land on
  sideOdds:s=>0.8-0.12*s,sideSize:[3,8],
  side:{wayLow:0.5,low:1,right:1,high:2,wayHigh:2},
};
const gapState=d=>d>18?'wayLow':d>6?'low':d>=-6?'right':d>=-18?'high':'wayHigh';
const dealState=(c,g)=>{const rs=c.tune.readings[g];return rs.length?gapState(rs[rs.length-1]-c.tune.vals[g]):'wayLow';};
const weighted=w=>{const ks=Object.keys(w),tot=ks.reduce((a,k)=>a+w[k],0);let r=Math.random()*tot;for(const k of ks){r-=w[k];if(r<=0)return k;}return ks[ks.length-1];};
const chiefDesign=c=>skillOf(c.team,'chief','design');   // the car's own crew chief deals its cards
function makeCard(c){
  const cd=chiefDesign(c),s=cd-1,offered=(c.tune.offer||[]).map(x=>x.g);
  // Dial it in comes from the chief's PEOPLE (2% of cards a star above 1): trusting the driver's feedback, on the
  // read gauge furthest from its best read (not one already in this offer).
  const read=GAUGES.map(x=>x.id).filter(g=>c.tune.readings[g].length&&!offered.includes(g));
  if(read.length&&Math.random()<0.02*(skillOf(c.team,'chief','people')-1))
    return {special:'dial',g:read.sort((a,b)=>Math.abs(c.tune.vals[b]-estimate(c,b).mu)-Math.abs(c.tune.vals[a]-estimate(c,a).mu))[0]};
  if(Math.random()<0.05*cd){
    // precise readings only in the team baseline, on a gauge nothing has read yet (and not one already in this offer)
    const unread=c.tune.phase===0?GAUGES.map(x=>x.id).filter(g=>!c.tune.readings[g].length&&!offered.includes(g)):[];
    const kinds=Object.keys(SPECIALS).filter(k=>k!=='dial'&&(k!=='read'||unread.length)),special=choice(kinds);
    return special==='read'?{special,g:choice(unread)}:{special};
  }
  const a=Math.min(1,DEAL.sharp[Math.max(0,Math.min(5,cd))]+(c.you?simRigAim():0)),mix=(tbl,flat)=>Object.fromEntries(Object.keys(tbl).map(k=>[k,a*tbl[k]+(1-a)*flat[k]]));
  const st=Object.fromEntries(GAUGES.map(x=>[x.id,dealState(c,x.id)]));
  const g=weighted(Object.fromEntries(GAUGES.map(x=>[x.id,a*DEAL.gauge[st[x.id]]+(1-a)]))),kind=weighted(mix(DEAL.kind[st[g]],DEAL.flatKind));
  const [lo,hi]=DEAL.size[kind.startsWith('big')?'big':'small'],sign=kind.endsWith('Up')?1:-1;
  const fx=[[g,sign*(lo+Math.floor(Math.random()*(hi-lo+1)))]];
  if(Math.random()<DEAL.sideOdds(s)){const o=weighted(Object.fromEntries(GAUGES.filter(x=>x.id!==g).map(x=>[x.id,DEAL.side[st[x.id]]])));
    fx.push([o,-(DEAL.sideSize[0]+Math.floor(Math.random()*(DEAL.sideSize[1]-DEAL.sideSize[0]+1)))]);}
  const names=CARD_NAMES[g];return {fx,name:sign>0?names[Math.floor(Math.random()*2)]:names[2]};
}
function dealOffer(c){const n=3+(Math.random()<0.15*(chiefDesign(c)-1)?1:0);c.tune.offer=[];for(let k=0;k<n;k++)c.tune.offer.push(makeCard(c));}   // built up card by card, so a card can see the ones before it
// This race's circuit and conditions on screen (the track preview does this first; doing it again is harmless).
function prepRaceTrack(){
  if(league.calendarSeason!==league.season)makeCalendar();
  if(TRACK!==raceTrack())loadTrack(raceTrack());else applyWeather();
}
function startNightTune(){
  prepRaceTrack();
  mine.forEach(c=>{if(!compoundsNow().includes(c.pitCompound)&&c.pitCompound!=='none')c.pitCompound='medium';if(isRain())c.pitCompound='wet';syncPitButton(c.slot);});
  tuneDone=false;race.ready=false;ntCar=0;ntStage='tune';
  const trackTargets={};GAUGES.forEach(g=>trackTargets[g.id]=rand(T_MIN,T_MAX));
  // The night's conditions push one gauge's target into the upper or lower half of the range.
  const wt=WEATHER[weatherId()].tune,mid=(T_MIN+T_MAX)/2;
  if(wt)trackTargets[wt[0]]=wt[1]>0?rand(mid,T_MAX):rand(T_MIN,mid);
  cars.forEach(c=>{
    // AI teams have no HQ: 4 baseline picks and every gauge starting from 0
    const tune={vals:{},targets:{},readings:{},grades:null,locked:false,phase:0,picks:phasePicks(c,0),fb:null,base:{},notes:[],lapReady:false};
    GAUGES.forEach(g=>{tune.vals[g.id]=tune.base[g.id]=c.you?tuneStartFor(g.id):facilityGauge(c.team,g.id)?TUNE_START[3]:0;   // your HQ's test facilities give a head start
      tune.readings[g.id]=[];
      tune.targets[g.id]=Math.min(T_MAX,Math.max(T_MIN,trackTargets[g.id]+rand(-8,8)));});
    c.tune=tune;
    // a fixer's tune sheet: precise readings on two gauges before the baseline (like the facility's special card)
    leakedGauges(c.team).forEach(g=>{const r=tune.targets[g]+gauss()*sigmaOf(c)*0.4;for(let k=0;k<6;k++)tune.readings[g].push(r);});
    if(!c.you){dealOffer(c);aiTune(c);}   // AI cars make their blind baseline picks now
  });
  // The initial blind tune is a team baseline: one shared offer, picks apply to both cars.
  dealOffer(mine[0]);mine[1].tune.offer=mine[0].tune.offer;
  $('tuneOv').hidden=false;renderTune();
}
function applyFx(c,fx){fx.forEach(([g,d])=>c.tune.vals[g]=Math.max(0,Math.min(100,c.tune.vals[g]+d)));}
const shared=c=>c.you&&c.tune.phase===0&&!c.tune.lapReady;   // only your two cars share a baseline
function usePick(c){
  if(shared(c)){
    mine.forEach(x=>x.tune.picks--);
    if(mine[0].tune.picks>0){dealOffer(mine[0]);mine[1].tune.offer=mine[0].tune.offer;}
    else mine.forEach(x=>{x.tune.offer=[];x.tune.lapReady=true;});
    return;
  }
  const t=c.tune;t.picks--;
  if(t.picks>0)dealOffer(c);else{t.offer=[];t.lapReady=true;}
}
// Apply a card: during the shared baseline it changes both cars.
function pickFx(c,fx){if(c.you)sfx('card');(shared(c)?mine:[c]).forEach(x=>applyFx(x,fx));usePick(c);}
function flyingLap(c){
  const t=c.tune,sg=sigmaOf(c);t.notes=[];t.fb={};
  GAUGES.forEach(g=>{
    const r=t.targets[g.id]+gauss()*sg;t.readings[g.id].push(r);t.base[g.id]=t.vals[g.id];
    t.fb[g.id]=`${g.word} `+{wayLow:'way off, needs a lot more.',low:'close, needs a touch more.',right:'feels right.',high:'slightly overdone.',wayHigh:'way overcooked, back it off.'}[gapState(r-t.vals[g.id])];
  });
  t.phase++;t.picks=phasePicks(c,t.phase);t.lapReady=false;dealOffer(c);
}
// A qualifying flying lap completed: it doubles as the tune's flying lap if the car was due one.
function onQualiLap(c){
  const t=c.tune;
  if(t.locked||!t.lapReady||t.phase>=LAST_PHASE)return;
  flyingLap(c);say(`${c.name}: feedback's in. ${c.qSets>0?'Tune in the box before the next run.':'Use it for the final tune.'}`,'you');
}
// Session over before a car ran its laps: move on to the next phase with no new feedback.
function skipLap(c){
  const t=c.tune;t.notes=['No lap this time, so no new feedback.'];GAUGES.forEach(g=>t.base[g.id]=t.vals[g.id]);   // a new round: adjustments start again
  t.phase++;t.picks=phasePicks(c,t.phase);t.lapReady=false;dealOffer(c);
}
function openTune(k){
  ntCar=k;mine[k].tuneWaiting=false;
  if(ntStage==='quali'){ntPrevPause=ui.paused;setPaused(true);}   // the session clock stops while you pick
  $('tuneOv').hidden=false;renderTune();
}
function closeTune(){
  $('tuneOv').hidden=true;if(ntStage!=='quali')return;
  setPaused(ntPrevPause);
  const next=mine.find(x=>x.tuneWaiting);if(next)openTune(next.slot);   // the other car came back while you were busy
}
// A car back in its box in qualifying: open its tune (feedback in hand, or another run to decide on).
function qualiReturn(c){
  if(c.tune.locked&&c.qSets<=0)return;
  if(!$('tuneOv').hidden){c.tuneWaiting=true;return;}
  c.tuneWaiting=false;openTune(c.slot);
}
function lockTune(c){
  const t=c.tune;t.grades={};
  const s=sweetFor(c);GAUGES.forEach(g=>t.grades[g.id]=gradeOf(Math.abs(t.vals[g.id]-t.targets[g.id]),s));
  t.locked=true;t.offer=[];
  if(mine.every(x=>x.tune.locked))tuneDone=true;
  const golds=GAUGES.filter(g=>t.grades[g.id]==='S').length;
  if(c.you)sfx(golds===GAUGES.length?'perfect':'lock');
  if(golds===GAUGES.length&&c.you)say(`${c.name}: PERFECT TUNE. Every gauge golden.`,'you');
}
// Quick tune: plays this phase's picks the way a sensible crew would (greedy on the current estimate).
// It stops where a real qualifying lap is needed; after the session it runs on without feedback.
function autoTune(c){while(autoTuneStep(c));}
// One quick-tune action (a pick, a pass, or locking in); false when it has to stop for a flying lap or is done.
function autoTuneStep(c){
  const t=c.tune;
  if(t.locked)return false;
  if(t.lapReady){
    if(t.phase===LAST_PHASE){lockTune(c);return false;}
    if(ntStage==='post'){skipLap(c);return true;}
    return false;
  }
  const best=autoTuneBest(c);
  if(best&&best.special)pickSpecial(c,best);else if(best)pickFx(c,best.fx);else usePick(c);
  return true;
}
// The quick tune's choice for the current offer: the card (and effect) that moves the gauges closest to the estimates.
function bestCard(c){
  const t=c.tune,cost=()=>GAUGES.reduce((a,g)=>{const m=estimate(c,g.id).mu,v=t.vals[g.id];return a+(v<=m?m-v:1.5*(v-m));},0);
  let best=null,bestCost=cost();
  const base=bestCost;
  t.offer.forEach((card,i)=>{
    if(card.special){
      const save={...t.vals},rs=Object.fromEntries(GAUGES.map(g=>[g.id,t.readings[g.id].slice()])),q=t.notes.slice();
      applySpecial(c,card);const k=card.special==='read'?base-1:cost();
      t.vals=save;t.readings=rs;t.notes=q;
      if(k<bestCost){bestCost=k;best={...card,i};}
      return;
    }
    const save={...t.vals};applyFx(c,card.fx);const k=cost();t.vals=save;if(k<bestCost){bestCost=k;best={fx:card.fx,i};}
  });
  return best;
}
// An AI car tunes as far as it can: picks until it needs a flying lap, or locks in after its final picks.
// Its manager sometimes grabs a random card instead of the best one.
function aiTune(c){
  const t=c.tune,miss=AI_TUNE_MISS[c.team.mgr.tactics];
  while(!t.locked){
    if(t.lapReady){if(t.phase===LAST_PHASE)lockTune(c);return;}
    let best=null;
    if(Math.random()<miss&&t.offer.length){const i=Math.floor(Math.random()*t.offer.length),card=t.offer[i];best=card.special?{...card,i}:{fx:card.fx,i};}
    else best=bestCard(c);
    if(best&&best.special)pickSpecial(c,best);else if(best)pickFx(c,best.fx);else usePick(c);
  }
}
// An AI car's qualifying flying lap brings back feedback, and it tunes on it straight away.
function aiQualiLap(c){const t=c.tune;if(t.locked||!t.lapReady||t.phase>=LAST_PHASE)return;flyingLap(c);aiTune(c);}
// Session over: AI cars that missed laps finish their tune without feedback.
function aiFinishTunes(){cars.forEach(c=>{if(c.you||!c.tune)return;while(!c.tune.locked){if(c.tune.lapReady&&c.tune.phase<LAST_PHASE)skipLap(c);aiTune(c);}});}
let autoTuneBest=bestCard;   // (autoplay swaps this to play your cars worse)
// Animate what just changed on the Night Tune: markers slide to their new values with a floating delta,
// feedback bands narrow, and grades pop in one by one when a car locks in.
let ntAnim=null;
function animateTune(T,c){
  const t=c.tune,prev=ntAnim&&ntAnim.car===c?ntAnim:null;
  T.querySelectorAll('.gbar').forEach(bar=>{
    const g=bar.dataset.g,val=bar.querySelector('.val'),band=bar.querySelector('.band'),v=t.vals[g];
    if(!prev)return;
    const pv=prev.vals[g];
    if(Math.abs(pv-v)>0.1){
      val.style.transition='none';val.style.left=pv+'%';
      const d=Math.round(v-pv);if(d)bar.insertAdjacentHTML('beforeend',`<span class="dfloat ${d>0?'up':'dn'}" style="left:${v}%">${d>0?'+':''}${d}</span>`);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{val.style.transition='';val.style.left=v+'%';}));
    }
    const pb=prev.band[g];
    if(pb&&(Math.abs(pb[0]-band.dataset.l)>0.5||Math.abs(pb[1]-band.dataset.w)>0.5)){
      const reach=bar.querySelector('.reach'),from=[[band,pb[0],pb[1]],[reach,Math.max(0,pb[0]-5),Math.min(100,pb[0]+pb[1]+5)-Math.max(0,pb[0]-5)]];
      from.forEach(([el,l,w])=>{el.style.transition='none';el.style.left=l+'%';el.style.width=w+'%';});
      requestAnimationFrame(()=>requestAnimationFrame(()=>from.forEach(([el])=>{el.style.transition='';el.style.left=el.dataset.l+'%';el.style.width=el.dataset.w+'%';})));
    }
  });
  if(t.locked&&prev&&!prev.locked){
    T.querySelectorAll('.grade,.gbar .win').forEach((el,i)=>{el.classList.add('reveal');el.style.animationDelay=(i%GAUGES.length)*0.25+'s';});
    // Sweet spots: the gauge turns gold and bursts stars from the target, one gauge after another.
    T.querySelectorAll('.gbar').forEach((bar,i)=>{
      if(!bar.classList.contains('sweet'))return;
      const x=t.targets[bar.dataset.g],d=i*0.25+0.2;
      bar.style.animationDelay=d+'s';bar.classList.add('burst-now');
      bar.insertAdjacentHTML('beforeend',Array.from({length:10},(_,k)=>{const a=k/10*Math.PI*2;
        return `<i class="star" style="left:${x}%;--dx:${Math.round(Math.cos(a)*38)}px;--dy:${Math.round(Math.sin(a)*22)}px;animation-delay:${d}s"></i>`;}).join(''));
    });
    const b=T.querySelector('.nt-banner');if(b){b.classList.add('arrive');b.style.animationDelay=GAUGES.length*0.25+0.2+'s';}
    if(sweetCount(c))T.classList.add('flash-in');
  }
  const band={};T.querySelectorAll('.gbar').forEach(bar=>{const b=bar.querySelector('.band');band[bar.dataset.g]=[+b.dataset.l,+b.dataset.w];});
  ntAnim={car:c,vals:{...t.vals},band,locked:t.locked};
}
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function renderTune(){
  const c=mine[ntCar],t=c.tune,ph=TUNE_PHASES[Math.min(t.phase,TUNE_PHASES.length-1)];
  const steps=TUNE_PHASES.map((p,i)=>{
    const n=phasePicks(c,i);
    const dots=Array.from({length:n},(_,j)=>{const used=i<t.phase||t.locked||(i===t.phase&&j<n-t.picks);
      return `<i class="${used?'done':i===t.phase&&j===n-t.picks?'now':''}"></i>`;}).join('');
    return dots+(i<TUNE_PHASES.length-1?`<span class="${i<t.phase?'done':''}">LAP</span>`:'');}).join('');
  const sw=sweetFor(c);
  const rows=GAUGES.map(g=>{
    const v=t.vals[g.id],e=estimate(c,g.id),seen=t.readings[g.id].length>0;
    const lo=seen?Math.max(0,e.mu-1.5*e.sd):T_MIN,hi=seen?Math.min(100,e.mu+1.5*e.sd):T_MAX;
    const win=t.locked?`<span class="win" style="left:${Math.max(0,t.targets[g.id]-sw)}%;width:${2*sw}%"></span>`:'';
    const gr=t.locked?`<span class="grade g-${t.grades[g.id]}">${t.grades[g.id]}${t.grades[g.id]==='S'?'★':''}</span>`:'<span></span>';
    const sweet=t.locked&&t.grades[g.id]==='S';
    return `<span class="gl${sweet?' sweet':''}" title="${g.label}. Cyan lines: where the hidden target probably is. Shading: every value that could still land in the sweet spot (within ${sw} of the target). Graded by distance to the target: S within ${sw} (golden: ${g.gold}), A 10, B 18, C 28, D beyond.">${g.label}</span><div class="gbar${sweet?' sweet':''}" data-g="${g.id}"><span class="reach" style="left:${Math.max(0,lo-sw)}%;width:${Math.min(100,hi+sw)-Math.max(0,lo-sw)}%" data-l="${Math.max(0,lo-sw)}" data-w="${Math.min(100,hi+sw)-Math.max(0,lo-sw)}"></span><span class="band" style="left:${lo}%;width:${hi-lo}%" data-l="${lo}" data-w="${hi-lo}"></span>${win}<span class="val" style="left:${v}%"></span></div><span>${Math.round(v)}</span>${gr}`;
  }).join('');
  const fxTxt=fx=>fx.map(([g,d])=>`<span class="${d>0?'up':'dn'}">${d>0?'+':''}${d} ${GAUGES.find(x=>x.id===g).short}</span>`).join(' ');
  let offer='';
  if(!t.locked&&t.offer.length){
    offer=
      `<div class="offer">${t.offer.map((cd,i)=>cd.special?`<button class="tcard need special" data-card="${i}" title="${specialFace(cd).tip}"><b>${specialFace(cd,c).name}</b>${specialFace(cd,c).text}</button>`:
        `<button class="tcard need" data-card="${i}"><b>${cd.name.toUpperCase()}</b>${fxTxt(cd.fx)}</button>`).join('')}</div>`;
  }
  const allLocked=mine.every(x=>x.tune.locked),other=mine[1-ntCar];
  // The qualifying flow lives here: pick tires and send the car out; it comes back to this screen with feedback.
  const cmps=isRain()?['wet','soft']:['soft','medium'];mine.forEach(x=>{if(!cmps.includes(x.qCmp))x.qCmp=cmps[0];});
  const cmpPick=`<span class="grp" title="Tires for the run">${cmps.map(cm=>`<button data-qcmp="${cm}" aria-pressed="${c.qCmp===cm}">${COMPOUNDS[cm].label}</button>`).join('')}</span>`;
  const canRun=ntStage==='quali'&&c.qMode==='garage'&&c.qSets>0&&race.t<QUALI_SECONDS&&readyToRun(c);
  let act;
  if(!t.lapReady&&!t.locked)act=`<button id="ntPass">PASS</button>`;
  else if(ntStage==='tune')act=`${cmpPick}<button id="ntStart" title="Both cars head out as the session opens, a few seconds apart">GO NOW</button><button id="ntStartWait" title="The track rubbers in: later runs are quicker. Both cars go out about 4 minutes in, each timed for a gap in traffic">WAIT FOR GRIP</button>`;
  else if(t.lapReady&&!t.locked&&t.phase===LAST_PHASE)act=`<button id="ntLock">LOCK IN ${c.name}</button>`;
  else if(canRun)act=`${cmpPick}<button id="ntSend">GO NOW</button>${qWaitAt(c)!=null?`<button id="ntWait" title="The track rubbers in: later runs are quicker. Goes out when there's a gap in traffic">WAIT FOR GRIP</button>`:''}${t.locked?`<button id="ntClose">STAY IN</button>`:''}`;
  else if(ntStage==='quali')act=`<button id="ntClose">BACK TO THE SESSION</button>`;
  else if(t.lapReady&&!t.locked)act=`<button id="ntSkip">CONTINUE WITHOUT A LAP</button>`;
  else act=allLocked?`<button id="ntGrid">TO THE GRID</button>`:`<button id="ntNext">TUNE ${other.name}</button>`;
  const status=t.locked?'LOCKED FOR THE RACE':
    t.lapReady?(ntStage==='tune'?'BASELINE SET':t.phase<LAST_PHASE?(ntStage==='post'?'SESSION OVER':'PICKS DONE: SEND THE CAR OUT'):'FINAL PICKS DONE'):
    `${ph.label} · ${t.picks} PICK${t.picks>1?'S':''} LEFT`;
  const statusTip=t.locked?`Golden gauges: ${GAUGES.filter(g=>t.grades[g.id]==='S').map(g=>`${g.label} (${g.gold})`).join(', ')||'none'}`:ph.note;
  // During the session you can only tune a car that is sitting in its box.
  const canSwitch=x=>ntStage!=='quali'||x.qMode==='garage';
  $('tune').innerHTML=`
    <div class="nt-top"><div><h3 title="${WEATHER[weatherId()].tip}
Chief ${CHIEF.name} (DESIGN ${CHIEF.skill}, PEOPLE ${mySkill('chief','people')}) · ${c.name} feedback ${c.drv.stats.feedback}${has(c,'nightowl')?' + NIGHT OWL':''}">NIGHT TUNE · ${TRACK.name.toUpperCase()}${weatherId()==='clear'?'':' · '+WEATHER[weatherId()].label}</h3></div>
      <div class="grp" role="group" aria-label="Car to tune">${mine.map((x,i)=>`<button data-ntcar="${i}" aria-pressed="${i===ntCar}" ${canSwitch(x)?'':'disabled'}>${x.name}${x.tune.locked?' ✓':''}</button>`).join('')}</div></div>
    <div class="nt-steps">${steps}</div>
    <p class="nt-sub" title="${statusTip}">${status}</p>
    ${sweetCount(c)?`<div class="nt-banner" title="+${Math.round((tuneBonus(c)-1)*100)}% pace for the race">${sweetCount(c)===GAUGES.length?'PERFECT TUNE':`SWEET SPOT BONUS ×${sweetCount(c)}`}</div>`:''}
    <div class="gauges">${rows}</div>
    <div class="quotes">${t.fb||GAUGES.some(g=>Math.round(t.vals[g.id]-t.base[g.id]))?`<div class="fbt">
      <span></span><b title="How far you've moved each gauge this round, side effects included">ADJUSTMENTS</b><b title="What ${c.name} said about each gauge after the last flying lap">FEEDBACK</b>
      ${GAUGES.map(g=>{const d=Math.round(t.vals[g.id]-t.base[g.id]);
        return `<span>${g.short}</span><span class="${d>0?'up':d<0?'dn':''}" title="${g.label}: ${d>0?'+':''}${d} this round">${d>0?'+':''}${d||'-'}</span><span>${t.fb?t.fb[g.id]:'-'}</span>`;}).join('')}
      </div>`:''}${t.fb?'':`<p>${c.name}: "Send me out and I'll tell you what she needs."</p>`}${t.notes.map(q=>`<p>${q}</p>`).join('')}</div>
    ${offer}
    <div class="nt-foot"><span></span>
      <span class="btns">${t.locked?'':`<button id="ntAuto">QUICK TUNE</button>`}${act}</span></div>`;
  const T=$('tune');
  T.classList.toggle('sweet',sweetCount(c)>0);T.classList.toggle('perfect',sweetCount(c)===GAUGES.length);
  if(!t.offer.length||t.locked||t.lapReady)T.querySelectorAll('#ntStart,#ntStartWait,#ntSend,#ntWait,#ntLock,#ntGrid,#ntNext').forEach(b=>b.classList.add('need'));
  animateTune(T,c);
  // Hovering a card previews where each gauge would land.
  T.querySelectorAll('[data-card]').forEach(b=>{const cd=t.offer[+b.dataset.card];if(cd.special)return;   // no preview: it would give the target away
    b.addEventListener('mouseenter',()=>cd.fx.forEach(([g,d])=>{if(!d)return;const bar=T.querySelector(`.gbar[data-g="${g}"]`);if(!bar)return;
      const x=Math.max(0,Math.min(100,t.vals[g]+d));bar.insertAdjacentHTML('beforeend',`<span class="ghost ${d>0?'up':'dn'}" style="left:${x}%"><i>${d>0?'+':''}${d}</i></span>`);}));
    b.addEventListener('mouseleave',()=>T.querySelectorAll('.ghost').forEach(x=>x.remove()));});
  T.querySelectorAll('[data-ntcar]').forEach(b=>b.addEventListener('click',()=>{ntCar=+b.dataset.ntcar;renderTune();}));
  T.querySelectorAll('[data-qcmp]').forEach(b=>b.addEventListener('click',()=>{(ntStage==='tune'?mine:[c]).forEach(x=>x.qCmp=b.dataset.qcmp);renderTune();}));
  T.querySelectorAll('[data-card]').forEach(b=>b.addEventListener('click',()=>{
    const cd=t.offer[+b.dataset.card];if(cd.special){pickSpecial(c,cd);renderTune();return;}
    pickFx(c,cd.fx);renderTune();}));

  const on=(id,fn)=>{const el=$(id);if(el)el.addEventListener('click',()=>{fn();renderTune();});};
  on('ntPass',()=>usePick(c));
  on('ntSkip',()=>skipLap(c));
  on('ntLock',()=>lockTune(c));
  on('ntAuto',()=>autoTune(c));
  on('ntNext',()=>{ntCar=1-ntCar;});
  const once=(id,fn)=>{const el=$(id);if(el)el.addEventListener('click',fn);};
  const startQ=wait=>{$('tuneOv').hidden=true;ntStage='quali';startQualifying();mine.forEach(x=>qPlanRun(x,wait));};
  once('ntStart',()=>startQ(false));once('ntStartWait',()=>startQ(true));
  once('ntSend',()=>{qPlanRun(c,false);closeTune();});once('ntWait',()=>{qPlanRun(c,true);closeTune();});
  once('ntClose',closeTune);
  once('ntGrid',()=>{$('tuneOv').hidden=true;renderQualiResult();});
}
