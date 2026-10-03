// Tuning constants: race rules, radio orders, parts, regulations, AI manager tiers.
'use strict';

// TRACK_SCALE stretches the circuit layout (not its width) so cars and scenery read smaller against it.
const CAR_SCALE=1.4, TRACK_SCALE=1.35, HW=4.3, BRAKE=38, HEADINGS=16;
let LAPS=6; // race length in laps of the current track (the LAPS buttons set it via lapsFor)
const SECTOR_COLORS=['#d86a9a','#6cc9d3','#a38ad4'];   // track edges, softened so the cars stand out
// Radio orders: one aggression setting each for fuel, tires and guns.
// On the driver cards each option is a colored button (blue = conserve, yellow = standard, red = push);
// `tip` is the hover text that says exactly what it does.
const ORDERS={
  fuel:{label:'FUEL',tip:'Fuel mix: how hard the engine runs',opts:{
    lean:{label:'LEAN',col:'blue',tip:'LEAN: 3% slower, 20% less fuel burn',spd:0.97,burn:0.8},
    std:{label:'STD',col:'yellow',tip:'STANDARD: normal pace and fuel burn',spd:1,burn:1},
    rich:{label:'RICH',col:'red',tip:'RICH: 5% faster, 30% more fuel burn, more engine wear',spd:1.05,burn:1.3}}},
  tires:{label:'TIRES',tip:'Tire use: grip against wear',opts:{
    save:{label:'SAVE',col:'blue',tip:'SAVE: 5% less grip, 40% less tire wear',grip:0.95,wear:0.6},
    std:{label:'STD',col:'yellow',tip:'STANDARD: normal grip and wear',grip:1,wear:1},
    push:{label:'PUSH',col:'red',tip:'PUSH: 6% more grip, 70% more tire wear, more chassis wear',grip:1.06,wear:1.7}}},
  guns:{label:'GUNS',tip:'Weapons: how freely the driver fires at the car ahead',opts:{
    hold:{label:'HOLD',col:'blue',tip:'HOLD: never fire, save ammo',rate:0,acc:0},
    std:{label:'STD',col:'yellow',tip:'STANDARD: fire at the car ahead, 62% base hit chance',rate:1,acc:0.62},
    free:{label:'FREE',col:'red',tip:'FREE: fire 60% more often, 50% base hit chance, burns ammo faster',rate:1.6,acc:0.5}}},
};
const AMMO=90,BURST=3;   // rounds in the magazine; rounds spent per trigger pull

// Parts: engine, chassis, body (armour plating + bodywork aero) and weapons. Each team develops a LEVEL per part; each car's copy has its own CONDITION, which wears every lap.
// Between races the manager chooses per part: leave it, REBUILD (re-machine/recast the whole part: fresh
// condition, same level, 60% of a new part's cost) or develop a NEW part (arrives DEV_STEP levels better
// and fresh after DEV_RACES races). Money is in millions of QT (quint-tokens).
const PARTS=[{id:'engine',label:'ENGINE',short:'ENG'},{id:'chassis',label:'CHASSIS',short:'CHS'},
  {id:'body',label:'BODY',short:'BDY'},{id:'weapons',label:'WEAPONS',short:'WPN'}];
const DEV_STEP=6,DEV_RACES=3,REBUILD_SHARE=0.6,WEAR_PER_LAP=1.2;
// Catch-up: a new part that's behind the field median arrives CATCH_UP of that gap better on top of its usual step
// (copying the leaders is easier than out-thinking them). For every team alike; it fades as a team catches up.
const CATCH_UP=0.4;
const catchUp=(lvl,id)=>Math.round(CATCH_UP*Math.max(0,fieldMedian(id)-lvl));
// Priced by the part's lead over the field, so a team can't run away with the tech: every level ahead costs 7% more.
const newPartCost=(lvl,id)=>0.5*tierMoney()*Math.pow(1.07,lvl-fieldMedian(id));
const rebuildCost=(lvl,id)=>REBUILD_SHARE*newPartCost(lvl,id);
// Performance multiplier from a part: its lead over the field median (about 0.33% a level, easing off past
// about 10 levels and capped near ±5%), times its condition. MEDIANS is refreshed at each race start.
const MEDIANS={};
const partF=(lvl,cond,id)=>(1+0.05*Math.tanh((lvl-(MEDIANS[id]??lvl))/15))*(0.9+0.1*cond/100);
// Placeholder race income until sponsors exist: a base payment plus prize money per car in the top 10.
const BASE_PAY=0.6,RACE_PAY=[0.15,0.12,0.1,0.09,0.08,0.07,0.06,0.05,0.04,0.03];
// Regulations: at mid-season the rules committee names 2 parts under review; at season end one gets new
// regs. Any team whose level on that part is above the field median (+margin) keeps only REG_KEEP of the excess.
const REG_NAMES={engine:'Flux-limiter mandate',chassis:'Crash-cell standard',body:'Bodywork homologation',weapons:'Ordnance treaty'};
const REG_MARGIN=2,REG_KEEP=0.35;
// AI managers: business drives garage calls, tactics shows up as race pace.
// Your cash at the start of a career: it pays the opening staff, the two drivers and the first new parts.
const START_CASH=3;
const MGR_TIERS=['rookie','pro','elite'],REBUILD_AT={rookie:30,pro:50,elite:60},TACTICS_PACE={rookie:-0.012,pro:0,elite:0.012};
// Qualifying: one session, weapons off, 2 fresh sets per car. QUALI_SECONDS of sim time shown as a 12:00 clock.
// The track rubbers in (up to TRACK_EVO faster by the end); out- and in-laps run slower and get in the way.
const QUALI_SECONDS=150,QUALI_CLOCK=720,QUALI_SETS=2,TRACK_EVO=0.03,OUTLAP_PACE=0.88,INLAP_PACE=0.8;
const choice=a=>a[Math.floor(Math.random()*a.length)];
