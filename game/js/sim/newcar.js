// A new car every season. At season end each team's parts reset to its tier's baseline plus CARRY of each part's
// lead over its field (the part hit by new regulations keeps none of its lead), plus whatever its next-year
// projects in the Design Studio banked. Then the design meeting: first choose how hard to push (more picks,
// but the car starts the season more worn), then pick from idea cards pitched by the technical director (their
// skills size the cards); the rest of the crew add options to choose from.
'use strict';

const CARRY=0.4;
// How hard the meeting pushes: picks, and the condition every part starts the season at.
const MEETING_PACES=[{label:'SAFE',picks:3,cond:100},{label:'STANDARD',picks:4,cond:85},{label:'EXPERIMENTAL',picks:5,cond:70}];
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
// carry-over is measured against its own tier.
function measureCarry(regId){
  ALL_TEAMS.forEach(t=>{
    PARTS.forEach(({id})=>{if(t.parts[id].dev>0&&TEAMS.includes(t))partArrives(t,id);});
    (t.studio||[]).forEach(p=>bankStudio(t,p));t.studio=[];
  });
  ALL_TEAMS.forEach(t=>{t.carry={};PARTS.forEach(({id})=>{
    const lead=t.parts[id].level-tierMedian(t.tier,id);
    t.carry[id]=Math.round(CARRY*(id===regId?Math.min(0,lead):lead));
  });});
}
// Step 2, once every team is in its new tier: the new cars. Yours are two fresh sets of pieces; old ones go.
function buildNewCars(){
  ALL_TEAMS.forEach(t=>{
    t.newCar={};
    PARTS.forEach(({id})=>{
      const lv=tierBaseline(t.tier)+(t.carry?t.carry[id]:0)+((t.nextYear||{})[id]||0);
      t.newCar[id]={base:tierBaseline(t.tier),carry:t.carry?t.carry[id]:0,studio:(t.nextYear||{})[id]||0,level:lv};
      t.parts[id].level=lv;t.parts[id].dev=0;t.parts[id].count=0;
    });
    t.nextYear={};
  });
  const me=TEAMS[0];me.inv=[];
  PARTS.forEach(({id})=>mine.forEach(c=>{const it=addPartItem(id,me.parts[id].level);c.fit[id]=it.uid;}));
  cars.forEach(c=>{PARTS.forEach(p=>c.cond[p.id]=100);c.condStart={...c.cond};});
  ALL_TEAMS.filter(t=>!t.you).forEach(aiDesignMeeting);
}

// ---- the design meeting ----
// Cards come from the technical director: DESIGN sizes single-part gains (half a level a star), MECHANICAL spreads work over two
// parts. Options per pick: 2, +1 for each of crew chief DESIGN, pit boss MECHANICAL and fixer PEOPLE at 3+
// (another +1 at 5), +1 with a level-3 Design Studio.
const MEETING_HELP=[['chief','design'],['pit','mechanical'],['fixer','people']];
function meetingOptions(t){
  let n=2;MEETING_HELP.forEach(([r,k])=>{const s=skillOf(t,r,k);if(t.staff&&t.staff[r])n+=(s>=3?1:0)+(s>=5?1:0);});
  if(t.you&&hqLevel('studio')>=3)n++;
  return n;
}
function designCard(t){
  const D=skillOf(t,'techdir','design'),M=skillOf(t,'techdir','mechanical'),ids=PARTS.map(p=>p.id).sort(()=>Math.random()-0.5),r=Math.random(),fx={};
  // DESIGN sizes single-part cards at half a level a star (4 → 6 from DESIGN 1 to 5; a 3 is the old 5)
  if(r<0.45)fx[ids[0]]=Math.round(3.5+D/2);
  else if(r<0.75){fx[ids[0]]=1+Math.ceil(M/2);fx[ids[1]]=1+Math.ceil(M/2);}
  else{fx[ids[0]]=Math.round(5.5+D/2);fx[ids[1]]=-2;}
  return {fx};
}
const cardText=c=>Object.entries(c.fx).map(([id,v])=>`${v>0?'+':'−'}${Math.abs(v)} ${PARTS.find(p=>p.id===id).label}`).join(' · ');
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
    const offer=Array.from({length:meetingOptions(t)},()=>designCard(t));
    const val=c=>Object.entries(c.fx).reduce((a,[id,v])=>a+v*(tac==='elite'&&v>0?1+Math.max(0,tierMedian(t.tier,id)-t.parts[id].level)/20:1),0);
    applyCard(t,tac==='rookie'?offer[0]:offer.reduce((a,c)=>val(c)>val(a)?c:a));
  }
}
// Your meeting state: the pace chosen (null until you choose), the picks made and the current offer.
function startMeeting(){league.meeting={pace:null,picks:[],offer:[]};}
const dealOfferCards=()=>Array.from({length:meetingOptions(TEAMS[0])},()=>designCard(TEAMS[0]));
function choosePace(i){const m=league.meeting;m.pace=MEETING_PACES[i];setStartCondition(TEAMS[0],m.pace.cond);m.offer=dealOfferCards();}
function pickCard(i){sfx('clank');
  const m=league.meeting,c=m.offer[i];applyCard(TEAMS[0],c);m.picks.push(c);uiPop='mt-'+m.picks.length;
  m.offer=m.picks.length<m.pace.picks?dealOfferCards():[];
}
// A new career: the rivals' first cars get their meetings now; yours happens on screen.
ALL_TEAMS.filter(t=>!t.you).forEach(aiDesignMeeting);
