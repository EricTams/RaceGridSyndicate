// Staff: one persistent world pool of people, shared by every team. Each person has four skills (1-5):
// MECHANICAL, DESIGN, PEOPLE and NERVE, and can fill any of the four roles; every skill drives its own effect in
// the two roles that use it, so a lopsided specialist in the right seat is worth finding. Contracts run 1-3
// seasons; each staffer brings their own crew. Rival teams hire before you (at a career start, best-ranked
// first); people whose contracts end go back to the pool, age, drift, and eventually retire.
'use strict';

const STAFF_SKILLS=[['mechanical','MECH'],['design','DES'],['people','PPL'],['nerve','NRV']];
// Effect curves by skill (a vacant role works like skill 1: the team muddles through).
const chiefAimFor=s=>10+15*(s-1),chiefExtraFor=s=>15*(s-1);       // % of cards aimed at what the car needs; % chance of a 4th card
const feedbackMulFor=s=>1.15-0.075*s;                              // driver feedback noise
const pitMulFor=s=>1.1-0.075*s;                                    // stop time
const wearMulFor=s=>1-(s-1)*0.06;                                  // part wear in races
const pitRepairFor=s=>5*s;                                         // % condition back on the most worn part at each stop
const devStepFor=s=>s>=5?8:7;                                      // levels a new part gains
const devRacesFor=s=>s>=4?2:3;                                     // races to build it
const offerMulFor=s=>1+(s-1)*0.05;                                 // sponsor offers
const eventMulFor=s=>1-(s-1)*0.1;                                  // event costs
const bargainFor=s=>1-(s-1)*0.05;                                  // contracts signed (drivers, staff, raises)
// What a team pays on a contract with this list price: its fixer's NERVE drives a hard bargain (no fixer, no bargain).
const bargainMul=t=>t.staff&&t.staff.fixer?bargainFor(t.staff.fixer.skills.nerve):1;
const contractFor=(t,list)=>r2(list*bargainMul(t));
const pct=x=>`${x>=0?'+':'−'}${Math.abs(Math.round(x*100))}%`;
// The fixer comes first: every team hires its fixer before the rest, so their hard bargain covers the other contracts.
const STAFF_ROLES=[
  {id:'fixer',label:'FIXER',group:'STRATEGIC',skills:['people','nerve'],what:['sponsor offers, driver scouting and deals','contracts, keeping the heat off drivers, event and deal costs, dirty deals'],
    effect:k=>[`PEOPLE: sponsor offers ${pct(offerMulFor(k.people)-1)}${k.people>=4?' and a 4th offer':''}; drivers: ${k.people>=4?'growth shown, a 4th candidate':k.people>=2?'growth shown':'no insight'}`,
      `PEOPLE: a deal call after ${Math.round(FIXER_CALL[k.people]*100)}% of races${k.people>=3?', connected deals':''}`,
      `NERVE: event and deal costs ${pct(eventMulFor(k.nerve)-1)}, contracts ${pct(bargainFor(k.nerve)-1)}, drivers' morale hits ${pct(fixerHeatFor(k.nerve)-1)}, wrecked drivers ${k.nerve>=4?`fired up +${[0,0,0,0,2,4][k.nerve]}`:'hurt −6'}, failed parts patched +${20*k.nerve}%, damages from softer fixers${k.nerve>=4?', every dirty deal':k.nerve>=3?', dirty deals':''}`]},
  {id:'chief',label:'CREW CHIEF',group:'RACE DAY',skills:['design','people'],what:['Night Tune cards and sweet spots','driver feedback, DIAL IT IN cards and resting morale'],
    effect:k=>[`DESIGN: ${chiefAimFor(k.design)}% of Night Tune cards aimed at what the car needs, ${chiefExtraFor(k.design)}% chance of a 4th card, sweet spot within ${5+0.5*(k.design-1)}${k.design>=4?', +1 final-tune pick':''}`,
      `PEOPLE: driver feedback noise ${pct(feedbackMulFor(k.people)-1)}, ${2*(k.people-1)}% of cards DIAL IT IN once there's feedback, morale rests ${2*(k.people-1)} higher`]},
  {id:'pit',label:'PIT BOSS',group:'RACE DAY',skills:['nerve','mechanical'],what:['pit stop time','part wear and repairs at the stop'],
    effect:k=>[`NERVE: pit stops take ${Math.round(pitMulFor(k.nerve)*100)}% of normal time`,`MECHANICAL: part wear in races ${pct(wearMulFor(k.mechanical)-1)}, +${pitRepairFor(k.mechanical)}% on the most worn part at each stop`]},
  {id:'techdir',label:'TECHNICAL DIRECTOR',group:'STRATEGIC',skills:['design','mechanical'],what:['how far new parts jump','how fast they\'re built'],
    effect:k=>[`DESIGN: new parts +${devStepFor(k.design)} levels`,`MECHANICAL: ready in ${devRacesFor(k.mechanical)} races`]},
];
const roleById=id=>STAFF_ROLES.find(r=>r.id===id);
// A team's skill in a role (1 when the role is vacant), and your team's shortcuts.
const skillOf=(t,role,skill)=>{const s=(t.staff&&t.staff[role]&&t.staff[role].skills[skill])||1;
  return t.fixer?Math.max(s,boostedSkill(t,role,skill)):s;};   // a fixer's freelancer can cover a skill
const mySkill=(role,skill)=>skillOf(TEAMS[0],role,skill);
const engineerWear=()=>wearMulFor(mySkill('pit','mechanical'));
const pitCrewMul=()=>pitMulFor(mySkill('pit','nerve'));
const myDevStep=()=>devStepFor(mySkill('techdir','design'));
const myDevRaces=()=>devRacesFor(mySkill('techdir','mechanical'));
const commercialMul=()=>offerMulFor(mySkill('fixer','people'));
const fixerMul=()=>eventMulFor(mySkill('fixer','nerve'));
const scoutStars=()=>mySkill('fixer','people');   // the fixer knows everyone, drivers included
const staffStars=id=>id==='fixer'?mySkill('fixer','people'):1;   // (kept for the sponsor code's 4th-offer check)

// ---- the people ----
// Salary follows what someone is best at (their top skill counts most), so a lopsided specialist costs about
// the same as an all-rounder of the same level: they're a bargain in the right seat.
const topSkill=p=>Math.max(...STAFF_SKILLS.map(([k])=>p.skills[k]));
const staffLevel=p=>{const v=STAFF_SKILLS.map(([k])=>p.skills[k]).sort((a,b)=>b-a);return 0.6*v[0]+0.4*v[1];};
const staffPrice=p=>r2(0.12*Math.pow(1.6,staffLevel(p)-1)*(0.9+0.2*((p.id*7919)%100)/100));   // M QT a season
const roleScore=(p,role)=>{const r=roleById(role);return (p.skills[r.skills[0]]+p.skills[r.skills[1]])/2;};
const STAFF_FIRST=['RIZZO','KOVA','DELANEY','OKAFOR','MIRA','TANAKA','BRANDT','SOLE','VANCE','IBARRA','QUILL','NAKAMURA','FERRO',
  'ADEYEMI','LUX','CASTILLO','HOLM','ZHAO','REYES','MARLOWE','PIKE','ONYX','SATO','VOSS','KESSLER','AMARI','DUBOIS','ORTEGA',
  'LINDQVIST','MBEKI','PARK','ROSSI','NOVAK','HALE','YUEN','SAXON','ABARA','KRUGER','VEGA','MORROW'];
let staffUid=0;
const clampSkill=x=>Math.max(1,Math.min(5,Math.round(x)));
// q: the person's general level (about 1.5 to 3.5); one skill is their specialty.
function makePerson(q,age){
  const skills={},spec=choice(STAFF_SKILLS)[0];
  STAFF_SKILLS.forEach(([k])=>skills[k]=clampSkill(q+rand(-1.2,1.2)+(k===spec?rand(0.8,1.8):0)));
  // an initial and a surname, never repeated
  const id=++staffUid,used=new Set(league.staffPool.map(x=>x.name));
  let name;do name=`${'ABCDEFGHIJKLMNOPRSTVWZ'[Math.floor(Math.random()*22)]}. ${choice(STAFF_FIRST)}`;while(used.has(name)&&used.size<800);
  const p={id,name,
    age:age??26+Math.floor(Math.random()*28),skills,team:null,role:null,yearsLeft:0};
  p.salary=staffPrice(p);p.years=1+Math.floor(Math.random()*3);
  return p;
}
const STAFF_Q=[2,2.6,3.2];   // general level of the people working in each tier
league.staffPool=[];
const freeStaff=()=>league.staffPool.filter(p=>!p.team);
function joinTeam(t,role,p){
  p.salary=contractFor(t,p.salary);   // the list price, less the team's fixer's bargain (fixed for the contract)
  p.team=t.id;p.role=role;p.yearsLeft=p.years;p.hiredSeason=league.season;(t.staff||(t.staff={}))[role]=p;
}
// An AI manager hires for a role: rookies go for the flashiest skill, pros for the fit, elites for fit per QT.
function aiPickStaff(t,role,pool){
  const b=t.mgr.business,budget=Math.max(0.15,t.cash*0.15);
  const fits=pool.filter(p=>contractFor(t,p.salary)<=budget),from=fits.length?fits:pool.slice().sort((a,c)=>a.salary-c.salary).slice(0,1);
  const score={rookie:p=>topSkill(p),pro:p=>roleScore(p,role)-0.8*p.salary,elite:p=>roleScore(p,role)-0.5*p.salary+0.2*Math.max(...roleById(role).skills.map(k=>p.skills[k]))}[b];
  return from.reduce((a,p)=>score(p)>score(a)?p:a,from[0]);
}
// Every AI team fills its open roles from the free pool, in order (round by round, so the best team doesn't
// take all four of the best people). Hires pay their first season on signing, as yours do.
function aiHireStaff(order,log){
  STAFF_ROLES.forEach(({id})=>order.forEach(t=>{
    if(t.staff&&t.staff[id])return;
    const pool=freeStaff();if(!pool.length)return;
    const p=aiPickStaff(t,id,pool);joinTeam(t,id,p);t.cash-=p.salary;
    if(log&&t.tier===myTier())log.push({team:t,role:id,p});
  }));
}
// A new career: teams off your tier already have their people; your tier's rivals hire first, best-ranked first,
// then you choose from what's left (a big free pool, 20 or so).
ALL_TEAMS.forEach(t=>{if(!t.you)t.staff={};});
TEAMS[0].staff=Object.fromEntries(STAFF_ROLES.map(r=>[r.id,null]));
league.staff=TEAMS[0].staff;
ALL_TEAMS.filter(t=>!t.you&&t.tier!==myTier()).forEach(t=>STAFF_ROLES.forEach(({id})=>{
  const p=makePerson(STAFF_Q[t.tier]+(SEEDS[t.seed].drv||0));league.staffPool.push(p);joinTeam(t,id,p);}));
for(let k=0;k<60;k++)league.staffPool.push(makePerson(STAFF_Q[myTier()]+rand(-0.6,0.8)));
league.staffHires=[];
aiHireStaff(TEAMS.filter(t=>!t.you).sort((a,b)=>SEED_ORDER.indexOf(a.seed)-SEED_ORDER.indexOf(b.seed)),league.staffHires);
league.staffSkipped={};

// The Night Tune reads its crew chief from here (DESIGN shapes the cards).
const CHIEF={get name(){return league.staff.chief?league.staff.chief.name:'NOBODY';},
  get skill(){return mySkill('chief','design');},set skill(v){if(league.staff.chief)league.staff.chief.skills.design=clampSkill(v);}};

const vacantRoles=()=>STAFF_ROLES.filter(r=>!league.staff[r.id]&&!league.staffSkipped[r.id]);
function hireStaff(roleId,p){
  sfx('stamp');
  joinTeam(TEAMS[0],roleId,p);uiPop='st-'+roleId;
  TEAMS[0].cash-=p.salary;   // the first season is paid on signing; later seasons with the other salaries
  say(`Hired ${p.name} as ${roleById(roleId).label.toLowerCase()}.`,'you');
}
const staffSalaries=(t=TEAMS[0])=>Object.values(t.staff||{}).filter(Boolean).reduce((a,s)=>a+s.salary,0);
// Season end: contracts run down (leavers go back to the pool), everyone ages and drifts, the old retire and
// newcomers arrive; then every AI team re-hires, higher tiers first and within a tier the best-placed first.
function closeStaffSeason(){
  const lines=[];
  ALL_TEAMS.forEach(t=>Object.entries(t.staff||{}).forEach(([role,p])=>{
    if(!p||--p.yearsLeft>0)return;
    t.staff[role]=null;p.team=null;p.role=null;
    if(t.you)lines.push(`${p.name}'s contract as ${roleById(role).label.toLowerCase()} ended.`);
  }));
  league.staffPool=league.staffPool.filter(p=>{
    p.age++;
    const k=choice(STAFF_SKILLS)[0];
    if(p.age<=32&&Math.random()<0.35)p.skills[k]=clampSkill(p.skills[k]+1);
    else if(p.age>=52&&Math.random()<0.35)p.skills[k]=clampSkill(p.skills[k]-1);
    if(!p.team)p.salary=staffPrice(p);p.years=1+Math.floor(Math.random()*3);   // salaries under contract stay as signed
    const retires=!p.team&&(p.age>=65||(p.age>=58&&Math.random()<0.3));
    return !retires;
  });
  for(let k=0;k<8;k++)league.staffPool.push(makePerson(rand(1.6,3),22+Math.floor(Math.random()*6)));
  league.staffSkipped={};
  return lines;
}
// After promotion and relegation: the AI teams fill their open roles before you see the pool.
function aiStaffForSeason(){
  league.staffHires=[];
  const order=ALL_TEAMS.filter(t=>!t.you).sort((a,b)=>b.tier-a.tier||(a.lastPos||5)-(b.lastPos||5));
  aiHireStaff(order,league.staffHires);
}
