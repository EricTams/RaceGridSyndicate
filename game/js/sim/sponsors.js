// Sponsors, season stats and the team championship.
// Two sponsors, each a per-race fee plus a placement bonus, picked from 3 offers that run from an easy target with
// a small bonus and a bigger fee to a hard target with a big bonus and a small fee (shown as bare terms, no labels:
// judging how well you'll do is the player's call):
//  - the SEASON sponsor (your livery) pays its bonus at season end for your final team placement;
//  - the SHORT-TERM sponsor (1-4 races) pays its bonus every race one of your cars finishes at or above its target.
// Offers are priced from the team's reputation (where sponsors expect it to finish), so a team that beats its
// reputation profits from betting on itself. Deals can never be broken. AI teams on track sign the same deals
// (their manager picks); AI_CHEAT_CASH is an explicit extra, off by default.
'use strict';

// w = the slot's value (the season sponsor carries most of it); term = when its bonus pays.
const SPONSOR_SLOTS=[{id:'main',label:'SEASON',w:2,term:'season'},{id:'short',label:'SHORT-TERM',w:0.75,term:'race'}];
// Each brand is street or corporate, and prices its offers from that reputation track.
const SPONSOR_BRANDS=[['NULLTIDE ENERGY','#39ffd0','street'],['HELIX OPTICS','#6bd6ff','corp'],['STRAY CIRCUIT','#ff9a3c','street'],['OBSIDIAN BANK','#b9a8ff','corp'],
  ['RAMEN ROCKET','#ff5a5a','street'],['VOLTBOX','#ffe14a','street'],['GLASSHOUSE MEDIA','#e8f4ff','corp'],['REDLINE COLA','#ff2e4d','street'],
  ['MIRRORSHADE SECURITY','#9fb4c8','corp'],['PIXEL BAZAAR','#ff6ad5','street'],['NIGHT MARKET RADIO','#ffb347','street'],['LUMA PHARMA','#7dffa0','corp'],
  ['DATASTREAM','#4de1ff','corp'],['GRIDLOCK INSURANCE','#c6ff4a','corp'],['NEON NOODLE','#ff8ae2','street'],['BLACKSUN FREIGHT','#ffd27a','corp']];
// share = part of the value paid as the fee; p = how likely the sponsor thinks the target is; premium = reward for
// risk; season/race = the target's offset (in places) from where the sponsor expects you to finish.
const OFFER_STYLES=[{kind:'safe',label:'EASY',share:0.8,p:0.9,premium:1.0,season:2,race:4},
  {kind:'balanced',label:'BALANCED',share:0.5,p:0.65,premium:1.08,season:0,race:0},
  {kind:'bonus',label:'HARD',share:0.2,p:0.45,premium:1.15,season:-2,race:-4}];
const POINTS=[25,18,15,12,10,8,6,4,2,1];

const sponsorValue=(rep,w)=>0.17*(1+rep/100)*w;   // M QT per race for a slot, up to 2x at top rep
// Extra M QT per race (× tier money) for every AI team on track, on top of its deals: a difficulty knob, 0 = fair.
const AI_CHEAT_CASH=0;
const expectedPos=rep=>Math.max(1,Math.min(10,Math.round(1+(100-rep)/100*9)));   // where sponsors think you finish
const r2=x=>Math.round(x*100)/100;

// Your team's sponsor state, and this season's stats for every team.
league.stats={};
// Two reputation tracks. `rep` (their average) is what the Backer and objective difficulty use.
Object.defineProperty(TEAMS[0],'rep',{get(){return Math.round((this.street+this.corp)/2);}});
const REP_NAMES={street:'Street Cred',corp:'Corporate Standing'};
const clampRep=x=>Math.round(Math.max(0,Math.min(100,x)));
// Street Front / Corporate Suite: gains on your chosen path are amplified.
const frontMul=kind=>league.hqPath===kind?1+0.25*(league.hq.front||0):1;
function addRep(kind,delta){const me=TEAMS[0];me[kind]=clampRep(me[kind]+(delta>0?delta*frontMul(kind):delta));}
Object.assign(TEAMS[0],{street:30,corp:30,sponsors:Object.fromEntries(SPONSOR_SLOTS.map(s=>[s.id,null])),offers:{},skipped:{}});

// ---- season stats and standings ----
function seasonStat(t){return league.stats[t.id]||(league.stats[t.id]={points:0,wins:0,podiums:0,dnfs:0,led:false});}
const teamStandings=()=>TEAMS.slice().sort((a,b)=>seasonStat(b).points-seasonStat(a).points||seasonStat(b).wins-seasonStat(a).wins);
const standingPos=t=>teamStandings().indexOf(t)+1;
function recordRaceStats(order){
  order.forEach((c,k)=>{
    const s=seasonStat(c.team);
    if(c.state==='wreck'){s.dnfs++;return;}
    if(k<POINTS.length)s.points+=POINTS[k];
    if(k===0)s.wins++;
    if(k<3)s.podiums++;
  });
}

// ---- objectives ----
function makeObjective(diff,rep,me=TEAMS[0]){
  const e=expectedPos(rep);
  const racePts=(POINTS[2*e-2]||0)+(POINTS[2*e-1]||0),seasonPts=Math.max(4,racePts*racesThisSeason());
  const rivals=TEAMS.filter(t=>t!==me);
  const pool={
    easy:[{kind:'points',target:Math.max(2,Math.round(seasonPts*0.5))},{kind:'top',target:Math.min(10,e+2)}],
    medium:[{kind:'points',target:Math.round(seasonPts*1.1)+2},{kind:'top',target:e},
      {kind:'ahead',rival:choice(rivals).id},e<=6?{kind:'podiums',target:1}:{kind:'top',target:Math.max(1,e-1)}],
    hard:[{kind:'wins',target:1},{kind:'podiums',target:3},{kind:'top',target:Math.max(1,e-3)},{kind:'nodnf'},{kind:'lead'}],
  }[diff];
  return {...choice(pool)};
}
const teamById=id=>ALL_TEAMS.find(t=>t.id===id);
const teamName=id=>teamById(id).name;
// 'Finish ahead of X' when X is in another tier: you're ahead of a lower tier, behind a higher one.
function aheadOf(id,me=TEAMS[0]){
  const r=teamById(id);
  return r.tier!==me.tier?me.tier>r.tier:standingPos(me)<standingPos(r);
}
function objText(o){
  switch(o.kind){
    case 'points':return `Score ${o.target}+ team points`;
    case 'podiums':return `${o.target} podium${o.target>1?'s':''}`;
    case 'wins':return `Win ${o.target} race${o.target>1?'s':''}`;
    case 'top':return `Top ${o.target} in the team standings`;
    case 'ahead':return `Finish ahead of ${teamName(o.rival)}`;
    case 'nodnf':return 'No DNFs all season';
    case 'lead':return 'Lead a race at any point';
  }
}
function objMet(o,me=TEAMS[0]){
  const s=seasonStat(me),pos=standingPos(me);
  switch(o.kind){
    case 'points':return s.points>=o.target;
    case 'podiums':return s.podiums>=o.target;
    case 'wins':return s.wins>=o.target;
    case 'top':return pos<=o.target;
    case 'ahead':return aheadOf(o.rival,me);
    case 'nodnf':return s.dnfs===0;
    case 'lead':return s.led;
  }
}
function objProgress(o){
  const me=TEAMS[0],s=seasonStat(me),pos=standingPos(me);
  switch(o.kind){
    case 'points':return `${s.points}/${o.target}`;
    case 'podiums':return `${s.podiums}/${o.target}`;
    case 'wins':return `${s.wins}/${o.target}`;
    case 'top':return `now P${pos}`;
    case 'ahead':{const r=teamById(o.rival);return r.tier!==TEAMS[0].tier?`they're in the ${TIER_NAMES[r.tier].toLowerCase()}`:`you P${pos}, them P${standingPos(r)}`;}
    case 'nodnf':return s.dnfs?`${s.dnfs} DNF`:'clean so far';
    case 'lead':return s.led?'done':'not yet';
  }
}

// ---- offers and deals ----
// An AI team has one reputation for both tracks. Every team's Fixer (PEOPLE) improves its offers.
const repOf=(t,type)=>t.you?t[type]:t.rep;
// A season offer targets the final team placement; a short-term offer targets a car's finish in each race (the
// sponsor expects your best car about 2 × your expected team place − 1). Short-term deals fit the races left.
const expectedCarPos=rep=>Math.min(20,2*expectedPos(rep)-1);
function makeOffers(slot,me=TEAMS[0]){
  const used=new Set([...Object.values(me.sponsors).filter(Boolean).map(d=>d.brand),
    ...Object.values(me.offers).flat().map(o=>o.brand)]);
  const brands=SPONSOR_BRANDS.filter(([b])=>!used.has(b)).sort(()=>Math.random()-0.5);
  const pathBonus=type=>me.you&&league.hqPath===type&&(league.hq.front||0)>=3?1.1:1;
  // A 4-star fixer finds a 4th offer.
  const styles=skillOf(me,'fixer','people')>=4?[...OFFER_STYLES,choice(OFFER_STYLES)]:OFFER_STYLES;
  const mul=offerMulFor(skillOf(me,'fixer','people')),left=racesThisSeason()-league.race+1;
  return styles.map((st,i)=>{
    const [brand,color,type]=brands[i]||choice(SPONSOR_BRANDS);
    const v=sponsorValue(repOf(me,type),slot.w)*mul*pathBonus(type)*tierMoney(),perRace=v*st.share;
    const o={brand,color,type,kind:st.kind,style:st.label,term:slot.term,perRace:r2(perRace)};
    if(slot.term==='season'){   // the bonus is worth the rest of the season's value, at the sponsor's odds
      o.target=Math.max(1,Math.min(10,expectedPos(me.rep)+st.season));
      o.bonus=r2(Math.max(0.05,(v*st.premium-perRace)*racesThisSeason()/st.p));
    }else{                      // the bonus is paid per race, so it's priced per race
      o.target=Math.max(1,Math.min(20,expectedCarPos(me.rep)+st.race));
      o.bonus=r2(Math.max(0.02,(v*st.premium-perRace)/st.p));
      o.races=Math.min(left,1+Math.floor(Math.random()*4));
    }
    return o;
  });
}
// Where a deal stands against its target: the team's place now, or (short-term) whether a car made it this race.
const dealText=d=>d.term==='season'
  ?`Bonus +${d.bonus.toFixed(2)}M if the team ends the season P${d.target} or better`
  :`Bonus +${d.bonus.toFixed(2)}M each race a car finishes P${d.target} or better`;
const dealLength=d=>d.term==='season'?'this season':`${d.racesLeft??d.races} race${(d.racesLeft??d.races)>1?'s':''}`;
const seasonDealMet=(d,t=TEAMS[0])=>standingPos(t)<=d.target;
const raceDealMet=(d,t,order)=>order.some((c,k)=>c.team===t&&c.state==='done'&&k+1<=d.target);
// term: 'season' (the season sponsor's screen) or 'race' (the short-term sponsor's); no term = both.
const openSlots=term=>SPONSOR_SLOTS.filter(s=>(!term||s.term===term)&&!TEAMS[0].sponsors[s.id]&&!TEAMS[0].skipped[s.id]);
function signSponsor(slotId,offer,t=TEAMS[0]){if(t.you)sfx('stamp');
  t.sponsors[slotId]={...offer,racesLeft:offer.races,hits:0};if(t.offers)delete t.offers[slotId];
  if(!t.you)return;
  uiPop='sp-'+slotId;
  say(`Signed ${offer.brand} (${SPONSOR_SLOTS.find(s=>s.id===slotId).label.toLowerCase()}) for ${dealLength(offer)}.`,'you');
}
const mainColor=()=>TEAMS[0].sponsors.main?TEAMS[0].sponsors.main.color:null;
const sponsorPerRace=(t=TEAMS[0])=>Object.values(t.sponsors||{}).filter(Boolean).reduce((a,d)=>a+d.perRace,0);
// After each race: short-term bonuses for every team on track, then short-term deals run down.
function settleShortDeals(order){
  let mine=0;
  TEAMS.forEach(t=>{
    const d=t.sponsors&&t.sponsors.short;if(!d)return;
    if(raceDealMet(d,t,order)){const paid=d.bonus*(t.you?1-(league.bonusCut||0):1);t.cash+=paid;d.hits++;if(t.you)mine=paid;}
    if(--d.racesLeft<=0)t.sponsors.short=null;
  });
  TEAMS[0].skipped.short=false;   // leaving it empty only skips one race
  return mine;
}
// AI managers fill their open slots: rookies take the biggest fee; pros weigh the bonus at cautious odds; elites
// also judge where their team will really finish against where the sponsor expects it to.
const AI_ODDS={safe:0.85,balanced:0.55,bonus:0.25};
const SEED_POS={top:2,upper:4.5,lower:6.5,back:8.5};
function aiSignSponsors(t){
  t.sponsors=t.sponsors||Object.fromEntries(SPONSOR_SLOTS.map(s=>[s.id,null]));t.offers={};
  const edge=(expectedPos(t.rep)-(t.lastPos||SEED_POS[t.seed]||5.5))*0.06;   // places better than the sponsor thinks
  SPONSOR_SLOTS.forEach(slot=>{
    if(t.sponsors[slot.id])return;
    const offers=makeOffers(slot,t),b=t.mgr.business,n=o=>o.term==='season'?racesThisSeason():o.races;
    const odds=o=>Math.max(0.05,Math.min(0.95,AI_ODDS[o.kind]+(b==='elite'?edge:0)));
    // short of cash, even a good manager needs the fees now: they count 1.5× until the team has reserves again
    const feeW=t.cash<1.5*tierMoney()?1.5:1;
    const val=o=>b==='rookie'?o.perRace:feeW*o.perRace*n(o)+o.bonus*odds(o)*(o.term==='season'?1:o.races);
    signSponsor(slot.id,offers.reduce((a,o)=>val(o)>val(a)?o:a),t);
  });
  t.offers={};
}

// Season end: pay objective bonuses, run contracts down, update reputation from the standings.
function closeSponsorSeason(){
  const me=TEAMS[0],lines=[];
  // Both tracks follow your standings; street adds wins and wrecked rivals, corporate adds objectives met and loses DNFs.
  const pos=standingPos(me),s=seasonStat(me),base=100-(pos-1)*10;
  const met=me.sponsors.main&&seasonDealMet(me.sponsors.main)?1:0;
  me.street=clampRep(0.6*me.street+0.4*base+frontMul('street')*(2*s.wins+2*(s.kills||0)));
  me.corp=clampRep(0.6*me.corp+0.4*base+frontMul('corp')*2*met-3*s.dnfs);
  lines.push(`Team standings: P${pos}. Street Cred ${me.street}, Corporate Standing ${me.corp}.`);
  // The season sponsor pays for the final placement; both deals end with the season (short-term ones are
  // priced for this tier and this season's races).
  const d=me.sponsors.main;
  if(d){const paid=d.bonus*(1-(league.bonusCut||0));   // an investor may have taken a cut
    if(seasonDealMet(d)){me.cash+=paid;lines.push(`${d.brand}: top ${d.target} made, +${paid.toFixed(2)}M QT.`);}
    else lines.push(`${d.brand}: top ${d.target} missed.`);}
  me.sponsors={main:null,short:null};me.skipped={};me.offers={};league.bonusCut=0;
  TEAMS.filter(t=>!t.you&&t.sponsors).forEach(t=>{
    if(t.sponsors.main&&seasonDealMet(t.sponsors.main,t))t.cash+=t.sponsors.main.bonus;
    t.sponsors={main:null,short:null};
  });
  return lines;
}
