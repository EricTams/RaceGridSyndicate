// HQ: rooms in the hideout, each with 3 levels that unlock things (not discounts). Big-ticket purchases
// made from the garage between races.
'use strict';

const HQ_COSTS=[1.0,2.0,4.0];   // M QT for levels 1, 2 and 3 of any room
const TUNE_START=[0,8,16,24];   // a test facility's level → where its gauge starts
const HQ_ROOMS=[
  {id:'machine',label:'MACHINE SHOP',levels:['1 new part in development at a time','2 new parts in development at once','3 new parts in development at once','3 at once, and every new part arrives +1 level']},
  {id:'simrig',label:'SIM RIG',levels:['Standard Night Tune','+1 team-baseline pick (5)','Your crew chief aims 15% more cards at what the car needs','A 3rd qualifying set: one more run and flying lap']},
  {id:'dataden',label:'DATA DEN',levels:['No rival intel','Rival tune grades in the timing tower','Rival managers\' ratings when you hover the timing tower','Know which part the regulation change will hit as soon as the review is named']},
  {id:'front',label:'STREET FRONT / CORPORATE SUITE',levels:['Pick a path: street or corporate','+25% reputation gains on your path','+50% gains on your path','+75% gains, and that path\'s sponsors offer +10%']},
  {id:'studio',label:'DESIGN STUDIO',levels:['No next-year projects','1 next-year project at a time','2 at once','3 at once, and 1 more option at every design-meeting pick']},
  {id:'lounge',label:'LOUNGE',levels:['Morale drifts toward 60','Your drivers\' morale drifts toward 65','Morale hits on your drivers are 25% softer','Your drivers\' morale never drops below 30']},
  // Test facilities: each lifts where one Night Tune gauge starts (hidden targets never sit below 25, so a
  // higher start is a pure head start).
  {id:'dyno',group:'facility',gauge:'engine',label:'DYNO CELL',levels:TUNE_START.map(v=>`Engine gauge starts at ${v}`)},
  {id:'susp',group:'facility',gauge:'handling',label:'SUSPENSION RIG',levels:TUNE_START.map(v=>`Handling gauge starts at ${v}`)},
  {id:'tunnel',group:'facility',gauge:'aero',label:'WIND TUNNEL',levels:TUNE_START.map(v=>`Aero gauge starts at ${v}`)},
  {id:'range',group:'facility',gauge:'weapons',label:'FIRING RANGE',levels:TUNE_START.map(v=>`Weapons gauge starts at ${v}`)},
  {id:'crash',group:'facility',gauge:'armor',label:'CRASH BAY',levels:TUNE_START.map(v=>`Armor gauge starts at ${v}`)},
];
league.hq=Object.fromEntries(HQ_ROOMS.map(r=>[r.id,0]));
const hqLevel=id=>league.hq[id];
league.hqPath=null;   // 'street' or 'corp' once the front room is built
function upgradeRoom(id,path){uiPop='hq-'+id;sfx('clank');
  if(id==='front'&&!league.hqPath){if(!path)return;league.hqPath=path;}
  const lvl=league.hq[id];if(lvl>=3)return;
  TEAMS[0].cash-=HQ_COSTS[lvl];league.hq[id]=lvl+1;
  const name=id==='front'?(league.hqPath==='street'?'street front':'corporate suite'):HQ_ROOMS.find(r=>r.id===id).label.toLowerCase();
  say(`HQ: ${name} upgraded to level ${lvl+1}.`,'you');
}

// ---- what each room unlocks ----
const devSlots=()=>[1,2,3,3][hqLevel('machine')];
const devBonusLevels=()=>hqLevel('machine')>=3?1:0;
const baselinePicks=()=>hqLevel('simrig')>=1?5:4;
const simRigAim=()=>hqLevel('simrig')>=2?0.15:0;
const qualiSetsFor=c=>c.you&&hqLevel('simrig')>=3?QUALI_SETS+1:QUALI_SETS;
const seesRivalGrades=()=>hqLevel('dataden')>=1;
const seesRivalManagers=()=>hqLevel('dataden')>=2;
const knowsRegPick=()=>hqLevel('dataden')>=3||regLeaked(TEAMS[0]);   // or your fixer's committee aide
// Crew Quarters is out for now (anyone can be hired; cost is the limit). It may return as the place that makes top
// staff want to work for you; its old level 3 showed every rival's staff on the Team screen.
const seesRivalStaff=()=>false;
const moraleTarget=()=>hqLevel('lounge')>=1?65:MORALE_BASE;
const moraleHitMul=()=>hqLevel('lounge')>=2?0.75:1;
const moraleFloor=()=>hqLevel('lounge')>=3?30:0;
const tuneStartFor=g=>{const r=HQ_ROOMS.find(x=>x.gauge===g);return r?TUNE_START[facilityGauge(TEAMS[0],g)?3:hqLevel(r.id)]:0;};   // (a borrowed facility counts as level 3)
const partsInDev=()=>PARTS.filter(p=>TEAMS[0].parts[p.id].dev>0).length;
