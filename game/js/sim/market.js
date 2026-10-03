// The driver market: drivers age, develop and retire; contracts run down and can't be broken.
// When a seat opens you pick from 3 candidates (always including a cheap, raw rookie) or renew
// the driver whose contract is ending. AI teams refill their seats the same way, by their manager.
'use strict';

const RETIRE_AGE=38;
const DRIVER_NAMES=['NOVA','RAZOR','KITE','ECHO','FLINT','WREN','JINX','SPARK','ROOK','LYNX','HEX','VOLT','ASH','BLITZ','CROW',
  'DUSK','EMBER','FANG','GHOST','HAZE','IRIS','JOLT','KARMA','LUMEN','MANTA','NEON','ORCA','PIXEL','QUARTZ','RIFT','SABLE',
  'TORQUE','UMBRA','VANDAL','WISP','XENON','YURI','ZERO','BRIX','CINDER','DRAKE','FLUX','GLITCH','HAVOC','ICON','KNOX','LOTUS',
  'MOTH','NIX','OMEN','PRISM','RUNE','SHARD','TANK','VIPER','WOLF','ZEN','COBALT','DIESEL','STATIC','ARC','BOLTZ','CIPHER',
  'DYNAMO','ENIGMA','FERAL','GRIM','HALCYON','INK','JACKAL','KESTREL','LANCE','MIRAGE','NOMAD','ONYX','PHANTOM','QUASAR','RAVEN',
  'SIREN','TALON','URCHIN','VORTEX','WARDEN','YAKUZA','ZEPHYR','AXLE','BANSHEE','CHROME','DAGGER','ELECTRA','FROST','GAUGE',
  'HALO-X','INFERNO','JUNKER','KILO','LOCUS','MAGNET','NEEDLE','OXIDE','PISTON','RELIC','SLATE','TEMPEST','VECTOR','WRAITH'];

const driverRating=d=>(2*d.stats.pace+d.stats.racecraft+d.stats.composure)/4;
// Stars cost steeply more than journeymen (another 5% a point above 65), so no team can sign every star.
const STAR_FROM=65,STAR_STEP=1.05;
const driverPrice=d=>r2(0.35*Math.pow(1.06,driverRating(d)-60)*Math.pow(STAR_STEP,Math.max(0,driverRating(d)-STAR_FROM))*(1+d.stats.fame/200)*Math.sqrt(tierMoney()));   // M QT a season

// Every driver gets an age, a hidden talent (how well they develop) and a contract.
ALL_TEAMS.forEach(t=>t.drvs.forEach((d,k)=>Object.assign(d,{name:t.drivers[k],age:19+Math.floor(Math.random()*15),
  talent:rand(-1,1),yearsLeft:1+Math.floor(Math.random()*3)})));
league.market=null;league.retired=[];

function freshName(){
  const used=new Set([...ALL_TEAMS.flatMap(t=>t.drivers),...league.retired,...(league.market?league.market.seats.flatMap(s=>s.offers.map(o=>o.name)):[])]);
  const free=DRIVER_NAMES.filter(n=>!used.has(n));
  return free.length?choice(free):choice(DRIVER_NAMES)+'-'+(2+Math.floor(Math.random()*8));
}
// Young drivers improve (faster with talent), prime drivers hold, drivers 34+ decline.
function ageDriver(d){
  d.age++;
  const grow=d.age<=24?rand(1,4)*(1+d.talent*0.6):d.age<=33?rand(-1,1.5)+d.talent*0.5:-rand(1,4);
  STATS.forEach(([id])=>{if(id!=='fame')d.stats[id]=Math.round(Math.max(35,Math.min(99,d.stats[id]+grow+rand(-1.5,1.5))));});
  d.stats.fame=Math.max(20,d.stats.fame-2);
}
// A new driver for a team in a tier: kind sets how good they are (rookie, journeyman or star).
function newDriver(tier,kind){
  const d=rollDriver({tier,pace:{rookie:-2,mid:0,star:1.2}[kind]});
  Object.assign(d,{name:freshName(),talent:kind==='rookie'?rand(-0.3,1):rand(-1,1),
    age:kind==='rookie'?17+Math.floor(Math.random()*3):23+Math.floor(Math.random()*10)});
  if(kind==='rookie')d.stats.fame=Math.min(d.stats.fame,30);
  return d;
}
function seatDriver(t,k,d,salary,years){
  initDriverCareer(d,salary);d.yearsLeft=years;d.expiring=false;
  t.drvs[k]=d;t.drivers[k]=d.name;
  const c=cars.find(c=>c.team===t&&c.slot===k);if(c){c.drv=d;c.name=d.name;}
}

// Season end: everyone ages; AI teams renew or replace; your ending contracts open the market.
function closeDriverSeason(){
  const lines=[],me=TEAMS[0];
  ALL_TEAMS.forEach(t=>t.drvs.forEach((d,k)=>{
    ageDriver(d);d.yearsLeft--;
    const retires=d.age>=RETIRE_AGE||(d.age>=35&&Math.random()<0.3);
    if(t.you){
      if(retires){d.expiring=true;d.retiring=true;lines.push(`${d.name} retires at ${d.age}.`);}
      else if(d.yearsLeft<=0){d.expiring=true;lines.push(`${d.name}'s contract has ended.`);}
      return;
    }
    if(!retires&&d.yearsLeft>0)return;
    if(retires){league.retired.push(d.name);league.retired=league.retired.slice(-20);}
    // AI managers: good business managers keep good drivers and find better replacements.
    const b=t.mgr.business,keep=!retires&&Math.random()<{rookie:0.4,pro:0.6,elite:0.7}[b];
    if(keep){d.yearsLeft=1+Math.floor(Math.random()*3);d.salary=contractFor(t,driverPrice(d));return;}
    const kind=Math.random()<{rookie:0.2,pro:0.35,elite:0.55}[b]?'star':Math.random()<0.3?'rookie':'mid';
    const nd=newDriver(t.tier,kind);seatDriver(t,k,nd,contractFor(t,driverPrice(nd)),1+Math.floor(Math.random()*3));
    if(t.tier===me.tier)lines.push(`${t.name} sign ${nd.name}${retires?`, replacing the retired ${d.name}`:''}.`);
  }));
  // Your open seats: renew (if they'll stay) or pick 1 of 3 candidates.
  const seats=me.drvs.map((d,k)=>({k,d})).filter(s=>s.d.expiring).map(({k,d})=>{
    const stays=!d.retiring&&!d.wontExtend&&d.morale>=25;
    const renew=stays?{salary:r2(Math.max(d.salary+d.promised,contractFor(me,driverPrice(d)))),years:2}:null;   // a promise is kept
    return {k,leaving:d.name,renew,offers:[]};
  });
  league.market=seats.length?{seats}:null;
  const kinds=scoutStars()>=4?['rookie','mid','star',choice(['mid','star'])]:['rookie','mid','star'];   // a 4-star fixer finds a 4th
  if(league.market)league.market.seats.forEach(s=>kinds.forEach(kind=>{
    const d=newDriver(myTier(),kind);d.salary=contractFor(me,kind==='rookie'?r2(Math.min(0.2,driverPrice(d))):driverPrice(d));   // priced to you
    d.years=kind==='rookie'?3:1+Math.floor(Math.random()*3);s.offers.push(d);}));
  return lines;
}
// What a 2-star fixer reads from a driver's hidden talent: how they'll develop from here.
const trajectory=d=>scoutStars()<2?'':d.age>=34?'▼▼':d.talent>0.4?'▲▲':d.talent>-0.2?'▲':'▼';
const openSeats=()=>league.market?league.market.seats.filter(s=>!s.done):[];
// Signing pays the first season now; later seasons are paid with the other salaries.
function renewDriver(seat){
  const d=TEAMS[0].drvs[seat.k],r=seat.renew;
  sfx('stamp');uiPop='mk-'+seat.k;TEAMS[0].cash-=r.salary;d.salary=r.salary;d.promised=0;d.yearsLeft=r.years;d.expiring=false;d.wontExtend=false;seat.done=true;
  say(`${d.name} re-signs: ${r.salary.toFixed(2)}M QT a season for ${r.years} seasons.`,'you');
}
function signDriver(seat,d){
  sfx('stamp');uiPop='mk-'+seat.k;TEAMS[0].cash-=d.salary;seatDriver(TEAMS[0],seat.k,d,d.salary,d.years);seat.done=true;
  say(`${d.name} signs: ${d.salary.toFixed(2)}M QT a season for ${d.years} season${d.years>1?'s':''}.`,'you');
}
