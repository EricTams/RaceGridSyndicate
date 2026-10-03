// Driver morale (0-100, drifts back toward 60) and raise demands from winning drivers.
'use strict';

const MORALE_BASE=60,MORALE_DRIFT=0.1,RAISE_SHARE=0.25;
// What a driver's fame is worth in your tier: raises stop once a driver is paid this.
const marketValue=d=>0.5*(1+d.stats.fame/50)*tierMoney();
const moodLabel=m=>m>=80?'FIRED UP':m>=60?'CONTENT':m>=40?'UNEASY':m>=20?'FRUSTRATED':'MISERABLE';
const moodCol=m=>m>=60?'#5cff8a':m>=40?'#ffb03a':'#ff3b3b';
const moralePace=c=>1+(c.drv.morale-MORALE_BASE)*0.0005;              // about ±2% pace at the extremes
// The crew chief's PEOPLE lifts the resting level (up to 8 higher); the fixer's NERVE keeps the heat off your drivers
// (morale hits up to 32% softer), from 1 to 5, for every team.
const chiefLift=c=>2*(skillOf(c.team,'chief','people')-1);
const fixerHeatFor=s=>1-0.08*(s-1);
const fixerHeatMul=c=>fixerHeatFor(skillOf(c.team,'fixer','nerve'));
const composureOf=c=>c.drv.stats.composure+(c.drv.morale-MORALE_BASE)*0.25;   // ±10 composure at the extremes
function moodNote(c,text,delta){(c.moodNotes||(c.moodNotes=[])).push([text,delta]);}

function initDriverCareer(d,salary){
  Object.assign(d,{morale:MORALE_BASE,salary,winsSince:0,podiumsSince:0,raise:null,promised:0,wontExtend:false});
}

// After a race: the result, how it compares with the grid slot, race events, then drift toward 60.
// Returns the breakdown for your drivers, for the garage screen.
function applyRaceMorale(order){
  const out=[];
  cars.forEach(c=>{
    const d=c.drv,from=d.morale,pos=order.indexOf(c)+1,notes=(c.moodNotes||[]).slice();
    if(c.state==='done'){
      if(pos===1)notes.push(['Win',12]);else if(pos<=3)notes.push(['Podium',8]);else if(pos<=10)notes.push(['Points',3]);
      if(pos<=c.gridPos-3)notes.push([`Beat P${c.gridPos} grid slot`,2]);
      else if(pos>=c.gridPos+3)notes.push([`Below P${c.gridPos} grid slot`,-3]);
    }
    // (a good tune pays in pace and results already, so it adds no morale of its own)
    if(c.condStart&&Math.min(...Object.values(c.condStart))<30)notes.push(['Neglected parts',-3]);
    // Your Lounge and every team's fixer soften the hits; your Lounge and every team's crew chief lift the resting
    // level; the Lounge sets a floor.
    const lounge=c.you?moraleHitMul():1,heat=fixerHeatMul(c),soft=lounge*heat,target=(c.you?moraleTarget():MORALE_BASE)+chiefLift(c),floor=c.you?moraleFloor():0;
    const hits=notes.reduce((a,[,v])=>a+Math.min(0,v),0);
    const raw=from+notes.reduce((a,[,v])=>a+(v<0?v*soft:v),0);
    // the garage's breakdown credits the fixer with what they took off the hits
    const spared=Math.round(-hits*lounge*(1-heat));if(spared>=1)notes.push(['Your fixer kept the heat off',spared]);
    d.morale=Math.max(floor,Math.min(100,raw+(target-raw)*MORALE_DRIFT));
    // Winning builds fame, and enough of it brings a raise demand.
    if(c.state==='done'&&pos===1){d.stats.fame=Math.min(99,d.stats.fame+3);d.winsSince++;d.podiumsSince++;}
    else if(c.state==='done'&&pos<=3){d.stats.fame=Math.min(99,d.stats.fame+1);d.podiumsSince++;}
    if(!d.raise&&d.raisedIn!==league.season&&(d.winsSince>=2||d.podiumsSince>=3))raiseDemand(c);
    if(c.you)out.push({car:c,from,to:d.morale,notes});
    c.moodNotes=[];
  });
  return out;
}

function raiseDemand(c){
  const d=c.drv;d.winsSince=d.podiumsSince=0;
  const amount=r2(Math.min(d.salary*RAISE_SHARE,marketValue(d)-d.salary-d.promised)*bargainMul(c.team));   // the fixer haggles it down
  if(amount<0.05)return;   // already paid what they're worth
  d.raisedIn=league.season;   // one demand a season
  if(c.you){d.raise={amount};say(`${c.name} wants a raise: +${amount.toFixed(2)}M QT a season.`,'you');return;}
  // AI teams answer at once, by their manager's business rating.
  const t=c.team,b=t.mgr.business,pay=b==='elite'?t.cash>amount*2:b==='pro'?t.cash>amount*3:Math.random()<0.5;
  if(pay){t.cash-=amount;d.salary+=amount;d.morale=Math.min(100,d.morale+10);}
  else d.morale=Math.max(0,d.morale-20);
}

// Your answer, from the garage: every option's outcome is shown on its button.
function answerRaise(c,choice){
  const d=c.drv,amt=d.raise.amount;
  if(choice==='pay'){d.salary+=amt;d.morale=Math.min(100,d.morale+10);say(`${c.name}: raise agreed, ${d.salary.toFixed(2)}M QT a season.`,'you');}
  else if(choice==='promise'){d.promised+=amt;d.morale=Math.max(0,d.morale-5);say(`${c.name}: raise promised from next season.`,'you');}
  else{d.morale=Math.max(0,d.morale-20);d.wontExtend=true;say(`${c.name}: raise refused. Won't extend.`,'bad');}
  d.raise=null;
}

// A new season: your drivers' salaries are paid, and promised raises take effect first.
function paySalaries(){
  let total=0;
  mine.forEach(c=>{const d=c.drv;if(d.expiring)return;d.salary+=d.promised;d.promised=0;total+=d.salary;});   // expiring: paid on (re)signing
  total+=staffSalaries();   // staff contracts are paid with the drivers'
  TEAMS[0].cash-=total;
  return total;
}
