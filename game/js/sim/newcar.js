// A new car every season. At season end each team's parts decay toward the baseline of the tier it races in next
// season, keeping a share of how far above it they ended (the part hit by new regulations keeps half as much), plus
// whatever its next-year
// projects in the Design Studio banked. Then the design meeting: first choose how hard to push (more picks,
// but the car starts the season more worn, and card levels vary more), then pick from idea cards pitched by the
// technical director and the rest of the crew. Each card has a level, drawn from its pitcher's MECHANICAL.
'use strict';

// How much of each part's level above the baseline a team keeps into next season: its technical director's DESIGN.
// A part below the baseline (often after a promotion) carries CARRY_DEFICIT of the shortfall, so it's pulled most of
// the way up.
const carryFor=design=>0.3+0.1*(design-1);   // 30% → 70%
const CARRY_DEFICIT=0.4,CARRY_REG=0.5;   // the regulated part keeps half the usual share
// How hard the meeting pushes: picks, the condition every part starts the season at, and how tightly card levels
// gather around their average (conc: the higher, the tighter; the average itself never moves).
const MEETING_PACES=[{label:'SAFE',picks:3,cond:100,conc:14,spread:'consistent'},{label:'STANDARD',picks:4,cond:85,conc:7,spread:'varied'},
  {label:'EXPERIMENTAL',picks:5,cond:70,conc:3.5,spread:'unpredictable'}];
const tierMedian=(tier,id)=>{const v=ALL_TEAMS.filter(t=>t.tier===tier).map(t=>t.parts[id].level).sort((a,b)=>a-b);return (v[4]+v[5])/2;};
const tierBaseline=tier=>TIER_BASE[tier]+3;

// ---- next-year projects (the Design Studio in your HQ; AI teams run theirs behind the scenes) ----
// A project takes STUDIO_RACES races and banks levels for next season's car in one part (DESIGN sizes it).
const STUDIO_RACES=3,studioGainFor=s=>3+Math.ceil(s/2),studioCost=()=>0.6*tierMoney();
const studioSlots=t=>t.you?[0,1,2,3][hqLevel('studio')]:{rookie:0,pro:1,elite:2}[t.mgr.business];
function startStudio(t,id){
  (t.studio||(t.studio=[])).push({id,left:STUDIO_RACES,gain:studioGainFor(skillOf(t,'techdir','design'))});
  t.cash-=studioCost();if(t.you){sfx('clank');uiPop='st-'+id;say(`Design Studio: next year's ${PARTS.find(p=>p.id===id).label.toLowerCase()} project started.`,'you');}
}
function advanceStudio(t){
  (t.studio||[]).forEach(p=>{if(--p.left===0)bankStudio(t,p);});
  t.studio=(t.studio||[]).filter(p=>p.left>0);
}
function bankStudio(t,p){(t.nextYear||(t.nextYear={}))[p.id]=(t.nextYear[p.id]||0)+p.gain;if(t.you)say(`Design Studio: +${p.gain} banked for next year's ${PARTS.find(x=>x.id===p.id).label.toLowerCase()}.`,'you');}
// AI managers with money to spare fund next year (elites more than pros; rookies never), on their weakest part.
function aiStudio(t){
  if((t.studio||[]).length>=studioSlots(t)||t.cash<studioCost()+2*tierMoney())return;
  const id=PARTS.map(p=>p.id).filter(id=>!(t.studio||[]).some(p=>p.id===id)).sort((a,b)=>t.parts[a].level-t.parts[b].level)[0];
  if(id)startStudio(t,id);
}

// ---- the season-end reset ----
// Step 1, before promotion and relegation: developments and projects in progress finish, and every team's
// end-of-season levels and keep share are noted (the carry-over is worked out once the new tiers are known).
function measureCarry(regId){
  ALL_TEAMS.forEach(t=>{
    PARTS.forEach(({id})=>{if(t.parts[id].dev>0&&TEAMS.includes(t))partArrives(t,id);});
    (t.studio||[]).forEach(p=>bankStudio(t,p));t.studio=[];
  });
  ALL_TEAMS.forEach(t=>{t.carryKeep=carryFor(skillOf(t,'techdir','design'));t.regPart=regId;
    t.endLevel=Object.fromEntries(PARTS.map(({id})=>[id,t.parts[id].level]));});
}
// Step 2, once every team is in its new tier: the new cars. Yours are two fresh sets of pieces; old ones go.
function buildNewCars(){
  ALL_TEAMS.forEach(t=>{
    t.newCar={};t.carry={};
    PARTS.forEach(({id})=>{
      const over=t.endLevel?t.endLevel[id]-tierBaseline(t.tier):0;
      t.carry[id]=Math.round(over<0?CARRY_DEFICIT*over:t.carryKeep*(id===t.regPart?CARRY_REG:1)*over);
      const lv=tierBaseline(t.tier)+(t.carry?t.carry[id]:0)+((t.nextYear||{})[id]||0);
      t.newCar[id]={base:tierBaseline(t.tier),carry:t.carry?t.carry[id]:0,studio:(t.nextYear||{})[id]||0,level:lv};
      t.parts[id].level=lv;t.parts[id].dev=0;t.parts[id].count=0;
    });
    t.nextYear={};t.buildOffers={};   // last season's designs don't carry over
  });
  const me=TEAMS[0];me.inv=[];
  PARTS.forEach(({id})=>mine.forEach(c=>{const it=addPartItem(id,me.parts[id].level);c.fit[id]=it.uid;}));
  cars.forEach(c=>{PARTS.forEach(p=>c.cond[p.id]=100);c.condStart={...c.cond};});
  ALL_TEAMS.filter(t=>!t.you).forEach(aiDesignMeeting);
}

// ---- the design meeting ----
// Who pitches, per pick: the technical director 2 cards, every other hired crew member 1, and a level-3 Design
// Studio 1 more (the technical director's work).
const MEETING_CREW=['chief','pit','fixer'];
function meetingPitchers(t){
  const who=['techdir','techdir',...MEETING_CREW.filter(r=>t.staff&&t.staff[r])];
  if(t.you&&hqLevel('studio')>=3)who.push('techdir');
  return who;
}
// A card's level (1-5) comes from its pitcher's MECHANICAL: on average 1.6 at MECHANICAL 1 up to 4.4 at 5, any
// level possible from anyone. The draw is a beta curve (bounded, so it never piles up at 1 or 5) with a small
// even floor; the meeting's pace sets how tight the curve is, never where its average sits.
const CARD_FLOOR=0.05;
const cardLevelAvg=mech=>1.6+0.7*(mech-1);
function gammaDraw(a){   // Marsaglia-Tsang
  if(a<1)return gammaDraw(a+1)*Math.pow(Math.random(),1/a);
  const d=a-1/3,c=1/Math.sqrt(9*d);
  for(;;){let x,v;do{x=Math.sqrt(-2*Math.log(1-Math.random()))*Math.cos(2*Math.PI*Math.random());v=1+c*x;}while(v<=0);
    v=v*v*v;const u=Math.random();if(u<1-0.0331*x*x*x*x||Math.log(u)<0.5*x*x+d*(1-v+Math.log(v)))return d*v;}
}
function cardLevel(mech,conc){
  if(Math.random()<CARD_FLOOR)return 1+Math.floor(Math.random()*5);
  // the beta part's average, so that with the floor mixed in the card averages cardLevelAvg
  const m=Math.max(0.03,Math.min(0.97,((cardLevelAvg(mech)-3*CARD_FLOOR)/(1-CARD_FLOOR)-0.5)/5));
  const x=gammaDraw(m*conc),y=gammaDraw((1-m)*conc);
  return Math.min(5,1+Math.floor(5*x/(x+y)));
}
// The level sets the numbers: one part +(2+level); two parts +2/+2/+3/+3/+4 each; a trade +(4+level) for −2 elsewhere.
function designCard(t,from,pace){
  const lv=cardLevel(skillOf(t,from,'mechanical'),pace.conc),ids=PARTS.map(p=>p.id).sort(()=>Math.random()-0.5),r=Math.random(),fx={};
  if(r<0.45)fx[ids[0]]=2+lv;
  else if(r<0.75){fx[ids[0]]=fx[ids[1]]=[2,2,3,3,4][lv-1];}
  else{fx[ids[0]]=4+lv;fx[ids[1]]=-2;}
  return {fx,lv,from};
}
const cardText=c=>Object.entries(c.fx).map(([id,v])=>`${v>0?'+':'−'}${Math.abs(v)} ${PARTS.find(p=>p.id===id).label}`).join(' · ');
const cardPips=c=>'■'.repeat(c.lv)+'□'.repeat(5-c.lv);
function applyCard(t,c){Object.entries(c.fx).forEach(([id,v])=>shiftPartLevels(t,id,l=>l+v));}
// Every part on a team's cars starts the season at the meeting's condition.
function setStartCondition(t,cond){
  cars.filter(c=>c.team===t).forEach(c=>{PARTS.forEach(p=>c.cond[p.id]=cond);c.condStart={...c.cond};});
  if(t.you)t.inv.forEach(it=>{if(!fittedTo(it))it.cond=cond;});
}
// AI managers push by tactics (elites go for 5 picks when they can afford the rebuilds), then pick: rookies
// take whatever's first, the others the biggest total (elites favour their weakest part).
function aiDesignMeeting(t){
  const tac=t.mgr.tactics,pace=tac==='rookie'?choice(MEETING_PACES):tac==='elite'&&t.cash>=2*TIER_MONEY[t.tier]?MEETING_PACES[2]:MEETING_PACES[1];
  setStartCondition(t,pace.cond);
  for(let k=0;k<pace.picks;k++){
    const offer=meetingPitchers(t).map(r=>designCard(t,r,pace));
    const val=c=>Object.entries(c.fx).reduce((a,[id,v])=>a+v*(tac==='elite'&&v>0?1+Math.max(0,tierMedian(t.tier,id)-t.parts[id].level)/20:1),0);
    applyCard(t,tac==='rookie'?offer[0]:offer.reduce((a,c)=>val(c)>val(a)?c:a));
  }
}
// Your meeting state: the pace chosen (null until you choose), the picks made and the current offer.
function startMeeting(){league.meeting={pace:null,picks:[],offer:[]};}
const dealOfferCards=()=>meetingPitchers(TEAMS[0]).map(r=>designCard(TEAMS[0],r,league.meeting.pace));
function choosePace(i){const m=league.meeting;m.pace=MEETING_PACES[i];setStartCondition(TEAMS[0],m.pace.cond);m.offer=dealOfferCards();}
function pickCard(i){sfx('clank');
  const m=league.meeting,c=m.offer[i];applyCard(TEAMS[0],c);m.picks.push(c);uiPop='mt-'+m.picks.length;
  m.offer=m.picks.length<m.pace.picks?dealOfferCards():[];
}
// A new career: the rivals' first cars get their meetings now; yours happens on screen.
ALL_TEAMS.filter(t=>!t.you).forEach(aiDesignMeeting);
