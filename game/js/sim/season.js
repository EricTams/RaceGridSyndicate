// Between races: income, part development, AI garages, regulations, advancing the season.
'use strict';

let lastSettle=null;
function settleRace(order){
  const prevPos=standingPos(TEAMS[0]);   // for the result screen: where you stood before this race
  recordRaceStats(order);
  // Every team on track is paid by its sponsor deals (plus any AI cheat cash); prize money scales with the tier
  // (sponsor deals are priced per tier when signed).
  const fees=sponsorPerRace(),pay={};TEAMS.forEach(t=>pay[t.name]=sponsorPerRace(t)+(t.you?0:AI_CHEAT_CASH*tierMoney()));
  order.forEach((c,k)=>{if(c.state==='done'&&k<RACE_PAY.length)pay[c.team.name]+=RACE_PAY[k]*tierMoney();});
  TEAMS.forEach(t=>t.cash+=pay[t.name]);
  const shortBonus=settleShortDeals(order);   // short-term sponsors pay for placements race by race
  lastSettle={order,prevPos,pts:mine.reduce((a,c)=>a+(c.state==='done'?POINTS[order.indexOf(c)]||0:0),0),pay:pay[TEAMS[0].name]+shortBonus,fees,shortBonus,mine:mine.map(c=>({name:c.name,pos:order.indexOf(c)+1,dnf:c.state==='wreck',
    prize:c.state==='done'&&order.indexOf(c)<RACE_PAY.length?RACE_PAY[order.indexOf(c)]*tierMoney():0}))};
  (league.raceLog||(league.raceLog=[]))[league.race-1]=lastSettle.mine.map(m=>m.dnf?'DNF':'P'+m.pos);   // for the schedule
  fixerAftermath(order);   // a fixer with nerve makes a bad night pay (before morale: payback changes the notes)
  lastSettle.morale=applyRaceMorale(order);
  rollEvent();
  settleFixer(order);   // bets and dives pay out, running deals run down, maybe a call
  // Parts in development get one race closer; finished ones arrive fresh on both cars. Next-year projects too.
  TEAMS.forEach(t=>PARTS.forEach(({id})=>{const pt=t.parts[id];if(pt.dev>0&&--pt.dev===0)partArrives(t,id);}));
  TEAMS.forEach(advanceStudio);
  TEAMS.filter(t=>!t.you).forEach(aiGarage);
  updateHeader();
  if(league.race===Math.floor(racesThisSeason()/2)&&!league.review){
    const ids=PARTS.map(p=>p.id).sort(()=>Math.random()-0.5);league.review=ids.slice(0,2);league.regPick=choice(league.review);   // decided now; a level-3 Data Den reveals it
    say(`Rules committee names ${league.review.map(x=>x.toUpperCase()).join(' and ')} for review. One gets new regs next season.`,'bad');
  }
}
// A new part arrives at the level and condition its build card promised (pt.build).
function partArrives(t,id){
  const pt=t.parts[id],label=PARTS.find(p=>p.id===id).label,b=pt.build||{gain:7,cond:100};pt.dev=0;pt.build=null;
  if(t.you){sfx('arrive');const lv=pt.level+buildGain(t,id,b),n=pt.count||1;for(let k=0;k<n;k++)addPartItem(id,lv).cond=b.cond;pt.count=0;
    say(`Garage: ${n>1?`${n} new ${label.toLowerCase()}s are`:`a new ${label.toLowerCase()} is`} ready (level ${lv}, ${b.cond}% condition). Fit ${n>1?'them':'it'} to your cars.`,'you');}
  else{pt.level+=buildGain(t,id,b);cars.filter(c=>c.team===t).forEach(c=>c.cond[id]=b.cond);}
}
// ---- building a new part: three cards, one per style, each with a level drawn from the technical director's
// DESIGN (the design meeting's curve at its STANDARD spread; nothing widens it). The style trades the jump against
// build time and the condition the piece arrives in; the level sizes the jump. The technical director's
// MECHANICAL still sets the base build time.
const BUILD_STYLES=[{id:'perf',label:'PERFORMANCE',gain:5,races:1,cond:80},{id:'quick',label:'QUICK',gain:3,races:-1,cond:90},
  {id:'robust',label:'ROBUST',gain:4,races:0,cond:100}];
const BUILD_CONC=7;
const buildRaces=(t,b)=>Math.max(1,devRacesFor(skillOf(t,'techdir','mechanical'))+b.races);
const buildGain=(t,id,b)=>b.gain+(t.you?devBonusLevels():0)+catchUp(t.parts[id].level,id);
function buildCard(t,st){const lv=cardLevel(skillOf(t,'techdir','design'),BUILD_CONC);return {style:st.id,label:st.label,lv,gain:st.gain+lv,races:st.races,cond:st.cond};}
// A part's three cards are dealt once and kept until one is built: backing out never re-deals.
function buildOffer(t,id){const o=t.buildOffers||(t.buildOffers={});return o[id]||(o[id]=BUILD_STYLES.map(st=>buildCard(t,st)));}
// AI managers (and autoplay) pick by tactics: rookies at random, the others weigh the jump against time and condition.
function aiBuildPick(t,id){
  const offer=buildOffer(t,id),tac=(t.mgr&&t.mgr.tactics)||'pro';if(tac==='rookie')return choice(offer);
  const [w,v]=tac==='elite'?[0.08,1]:[0.05,0.5],val=b=>b.gain-w*(100-b.cond)-v*buildRaces(t,b);
  return offer.reduce((a,b)=>val(b)>val(a)?b:a);
}
function developPart(t,id,card=aiBuildPick(t,id)){
  const pt=t.parts[id];if(t.you){sfx('clank');uiPop='part-'+id;pt.count=1;}
  t.cash-=t.you?piecePrice(id):newPartCost(pt.level,id);pt.dev=buildRaces(t,card);pt.build=card;delete t.buildOffers[id];
}
// Your builds make one piece; a part already in development can have a second copy added (no extra Machine Shop slot).
const piecePrice=id=>newPartCost(TEAMS[0].parts[id].level,id)/2;
function addPartCopy(id){const pt=TEAMS[0].parts[id];if(pt.dev<=0)return;sfx('clank');TEAMS[0].cash-=piecePrice(id);pt.count=(pt.count||1)+1;uiPop='part-'+id;}   // your technical director sets both
function rebuildPart(t,c,id){if(t.you)sfx('clank');if(t.you)uiPop='rb-'+c.slot+'-'+id;t.cash-=rebuildCost(carPartLevel(c,id),id);c.cond[id]=100;}
// AI garage calls by business rating: rookies rebuild late and waste money, elites plan around new parts
// and steer clear of over-developing a part that's under regulation review.
function aiGarage(t){
  aiStudio(t);
  const b=t.mgr.business,teamCars=cars.filter(c=>c.team===t),reserve=b==='rookie'?0:0.3;
  const avg=PARTS.reduce((a,p)=>a+t.parts[p.id].level,0)/PARTS.length;
  for(const {id} of PARTS){
    const pt=t.parts[id],rb=rebuildCost(pt.level,id),worst=Math.min(...teamCars.map(c=>c.cond[id]));
    if(b==='rookie'){
      if(pt.dev<=0&&PARTS.filter(p=>t.parts[p.id].dev>0).length<1&&t.cash>newPartCost(pt.level,id)&&Math.random()<0.3)developPart(t,id);
      teamCars.forEach(c=>{if(c.cond[id]<REBUILD_AT.rookie&&t.cash>rb)rebuildPart(t,c,id);});
      continue;
    }
    const slotsFull=PARTS.filter(p=>t.parts[p.id].dev>0).length>=(b==='elite'?3:2);   // AI garages have dev slots too
    if(pt.dev<=0&&!slotsFull){
      // Pros replace a clearly lagging part; elites also replace worn ones (a new part arrives fresh)
      // but won't pour money into a part under regulation review that's already above the line.
      const risky=b==='elite'&&league.review&&(regLeaked(t)?league.regPick===id:league.review.includes(id))&&pt.level>=fieldMedian(id)+REG_MARGIN;
      // Both also push a part forward whenever the budget comfortably allows it.
      const np=newPartCost(pt.level,id),flush=t.cash-reserve>np*(b==='elite'?2:3);
      const wants=flush||(b==='elite'?(pt.level<avg-2||worst<REBUILD_AT.elite):pt.level<avg-3);
      if(!risky&&wants&&t.cash-reserve-2*rb>newPartCost(pt.level,id)){developPart(t,id);continue;}
    }
    const arriving=pt.dev>0&&pt.dev<=(b==='elite'?3:1);
    teamCars.forEach(c=>{if(c.cond[id]<REBUILD_AT[b]&&!arriving&&t.cash-reserve>rb)rebuildPart(t,c,id);});
  }
}
function nextRace(){
  league.lastReg=null;league.devFrozen=false;
  const newSeason=league.race+1>racesThisSeason(),tierWas=TEAMS[0].tier;
  if(++league.race>racesThisSeason()){
    // New regulations: the part named keeps none of its lead in next season's car.
    const regId=league.review?(league.regPick||choice(league.review)):null;
    if(regId)league.lastReg=`New regs: ${REG_NAMES[regId]} (${PARTS.find(p=>p.id===regId).label}). No team carries its lead in that part into the new car.`;
    measureCarry(regId);closeFixerSeason();
    league.sponsorNotes=[...closeSponsorSeason(),...closeBackerSeason(),...closeStaffSeason(),...promoteAndRelegate(),...closeDriverSeason()];league.stats={};
    league.season++;league.race=1;league.review=null;
    buildNewCars();
    aiStaffForSeason();aiSponsorsForSeason();
    if(league.season<=CAREER_SEASONS){   // no salaries or loans after the final season
      league.salaryNote=`Season ${league.season}: driver and staff salaries paid, ${paySalaries().toFixed(2)}M QT.`;
      league.sponsorNotes.push(...settleDebt());
    }
  }
  TEAMS.filter(t=>!t.you).forEach(aiSignSponsors);   // AI teams refill an expired short-term deal
  cars.forEach(c=>c.condStart={...c.cond});
  const careerOver=league.season>CAREER_SEASONS;
  if(careerOver){league.season=CAREER_SEASONS;league.race=racesThisSeason();}
  resetRace();
  if(newSeason)sfx(TEAMS[0].tier>tierWas?'promo':TEAMS[0].tier<tierWas?'releg':'season');
  if(careerOver)showCareerEnd();
  else if(newSeason)openMarket(()=>openStaff(()=>openNewCar(()=>openMeeting(()=>openField(()=>openSponsors(()=>openBacker(()=>openSponsors(startWeekend,'race'))))))));
  else openSponsors(startWeekend,'race');   // a free short-term slot gets offers before the weekend
  if(league.lastReg)say(league.lastReg,'bad');
  if(league.salaryNote){say(league.salaryNote,'you');league.salaryNote=null;}
  (league.sponsorNotes||[]).forEach(t=>say(t,'you'));league.sponsorNotes=null;
}

// Each season's calendar: the tier's tracks in a shuffled rotation, one per race.
function makeCalendar(){
  const pool=TRACKS.filter(t=>t.tiers.includes(myTier())).sort(()=>Math.random()-0.5);
  league.calendar=Array.from({length:racesThisSeason()},(_,i)=>pool[i%pool.length].id);league.calendarSeason=league.season;league.raceLog=[];
  // Each city has its own chance of acid rain (Seattle's is high); the other conditions share the rest.
  league.weather=league.calendar.map(id=>{const t=TRACKS.find(x=>x.id===id),rain=t.rain??WEATHER.rain.odds;
    const odds=k=>k==='rain'?rain:WEATHER[k].odds*(1-rain)/(1-WEATHER.rain.odds);
    let r=Math.random();return Object.keys(WEATHER).find(k=>(r-=odds(k))<0)||'clear';});
}
const raceTrack=()=>TRACKS.find(t=>t.id===(league.calendar||[])[league.race-1])||TRACKS[0];
