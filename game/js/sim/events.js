// Business events between races: two options, outcomes stated on the buttons (no dice on the result).
'use strict';

const EVENT_CHANCE=0.3;   // chance of an event after each race
const lowestPart=t=>PARTS.map(p=>p.id).reduce((a,b)=>t.parts[a].level<=t.parts[b].level?a:b);
const partLabel=id=>PARTS.find(p=>p.id===id).label.toLowerCase();
// Costs go through the Fixer: fc() for the label, spend() when paid, cost for the affordability check.
const fc=x=>(x*fixerMul()).toFixed(2);
const spend=x=>{TEAMS[0].cash-=x*fixerMul();};
function wearAll(amount){mine.forEach(c=>PARTS.forEach(p=>{c.cond[p.id]=Math.max(0,c.cond[p.id]-amount);}));}

// Each event builds its text and options when it fires (so it can name a driver or a part).
const EVENTS=[
  ()=>({title:'PUBLICITY STUNT',text:'A sponsor wants both drivers at a club launch the night before the next race.',
    options:[{label:'DO IT · +0.40M, CORP STANDING +2, BOTH DRIVERS MORALE −5',cost:0,run(){TEAMS[0].cash+=0.4;addRep('corp',2);mine.forEach(c=>c.drv.morale=Math.max(0,c.drv.morale-5));}},
             {label:'DECLINE',cost:0,run(){}}]}),
  ()=>{const id=lowestPart(TEAMS[0]);return {title:'HOT PART',text:`A black-market fixer offers a ${partLabel(id)} that fell off a corporate truck.`,
    options:[{label:`BUY · −${fc(0.50)}M, ${partLabel(id).toUpperCase()} +4 LEVELS, STREET CRED +3, CORP STANDING −3`,cost:0.5*fixerMul(),run(){spend(0.5);shiftPartLevels(TEAMS[0],id,l=>l+4);addRep('street',3);addRep('corp',-3);}},
             {label:'WALK AWAY',cost:0,run(){}}]};},
  ()=>({title:'GARAGE FIRE',text:'An electrical fire breaks out in the parts store overnight.',
    options:[{label:`PAY AN EMERGENCY CREW · −${fc(0.40)}M`,cost:0.4*fixerMul(),run(){spend(0.4);}},
             {label:'LET IT BURN OUT · ALL PARTS ON BOTH CARS −20% CONDITION',cost:0,run(){wearAll(20);}}]}),
  ()=>({title:'INVESTOR',text:'An investor offers cash now for a cut of this season\'s sponsor bonuses.',
    options:[{label:'TAKE IT · +1.50M NOW, SPONSOR BONUSES −30% THIS SEASON',cost:0,run(){TEAMS[0].cash+=1.5;league.bonusCut=Math.min(0.9,(league.bonusCut||0)+0.3);}},
             {label:'DECLINE',cost:0,run(){}}]}),
  ()=>({title:'POACHER',text:`A rival team is trying to poach your crew chief ${CHIEF.name}.`,
    options:[{label:`COUNTER-OFFER · −${fc(0.40)}M`,cost:0.4*fixerMul(),run(){spend(0.4);}},
             {label:`LET THEM TALK · CHIEF ${CHIEF.name} −1 STAR`,cost:0,run(){CHIEF.skill=Math.max(1,CHIEF.skill-1);}}]}),
  ()=>{const id=lowestPart(TEAMS[0]);return {title:'WIND TUNNEL TIME',text:'A megacorp is renting out a night of wind-tunnel time.',
    options:[{label:`BOOK IT · −${fc(0.40)}M, ${partLabel(id).toUpperCase()} +2 LEVELS`,cost:0.4*fixerMul(),run(){spend(0.4);shiftPartLevels(TEAMS[0],id,l=>l+2);}},
             {label:'PASS',cost:0,run(){}}]};},
  ()=>({title:'STREET EXHIBITION',text:'An underground promoter wants your cars at an exhibition run.',
    options:[{label:'SHOW UP · +0.50M, STREET CRED +2, ALL PARTS ON BOTH CARS −10% CONDITION',cost:0,run(){TEAMS[0].cash+=0.5;addRep('street',2);wearAll(10);}},
             {label:'STAY HOME',cost:0,run(){}}]}),
  ()=>{const c=choice(mine);return {title:'BONUS REQUEST',text:`${c.name} asks for a one-off bonus after a hard night.`,
    options:[{label:`PAY IT · −${fc(0.20)}M, ${c.name} MORALE +8`,cost:0.2*fixerMul(),run(){spend(0.2);c.drv.morale=Math.min(100,c.drv.morale+8);}},
             {label:`SAY NO · ${c.name} MORALE −5`,cost:0,run(){c.drv.morale=Math.max(0,c.drv.morale-5);}}]};},
  ()=>({title:'NOSY JOURNALIST',text:'A journalist is digging into who really bankrolls your team.',
    options:[{label:`PAY THEM OFF · −${fc(0.30)}M`,cost:0.3*fixerMul(),run(){spend(0.3);}},
             {label:'IGNORE IT · CORP STANDING −4',cost:0,run(){addRep('corp',-4);}}]}),
  ()=>{const c=choice(mine),id=PARTS.map(p=>p.id).reduce((a,b)=>c.cond[a]<=c.cond[b]?a:b);return {title:'SCRAPYARD AUCTION',
    text:`A scrapyard is selling a ${partLabel(id)} that fits ${c.name}'s car.`,
    options:[{label:`BUY · −${fc(0.30)}M, ${c.name}'S ${partLabel(id).toUpperCase()} BACK TO 100%`,cost:0.3*fixerMul(),run(){spend(0.3);c.cond[id]=100;}},
             {label:'PASS',cost:0,run(){}}]};},
];

function rollEvent(){
  // Below 40 confidence the Backer interferes: half of all races bring a Backer event.
  if(league.confidence<40&&Math.random()<0.5){league.event=choice(BACKER_EVENTS)();return;}
  league.event=Math.random()<EVENT_CHANCE?choice(EVENTS)():null;
}
function answerEvent(i){
  const e=league.event,o=e.options[i];
  o.run();league.event=null;
  say(`${e.title.charAt(0)+e.title.slice(1).toLowerCase()}: ${o.label.toLowerCase()}.`,'you');
}
