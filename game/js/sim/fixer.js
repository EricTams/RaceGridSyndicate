// The Fixer's calls: between races every team's fixer may ring with deals nobody else would bring them. For you
// each call is one screen: take one deal or pass; an AI team's manager answers on the spot. PEOPLE is who they
// know: how often they call, how many deals they bring and whether the well-connected deals show up (3+). NERVE
// is how dirty they'll go: shady deals at 3+, the dirtiest at 4+, and every deal's price comes down (the same
// discount as event costs). Outcomes are stated on the deal; bets and dives pay on a stated race result, like a
// sponsor objective. Attacks (a bribed pit crew, a garage job, a dirt file) name the rival you pick and only work
// on a fixer with less NERVE than yours, so knowing who's soft is the edge. The rules are the same for every team.
'use strict';

const FIXER_CALL=[0,0.25,0.4,0.55,0.7,0.85];   // chance of a call after each race, by PEOPLE (0 = no fixer)
const fixerPeople=t=>t.staff&&t.staff.fixer?skillOf(t,'fixer','people'):0;
const fixerNerve=t=>t.staff&&t.staff.fixer?skillOf(t,'fixer','nerve'):0;
const dealsPerCall=t=>1+(fixerPeople(t)>=3?1:0)+(fixerPeople(t)>=5?1:0);
const dealPrice=(t,x)=>r2(x*tierMoney()*eventMulFor(skillOf(t,'fixer','nerve')));
// Running deals: kind, races left, and whatever the deal needs.
const fixerActive=(t,kind)=>t.fixer&&t.fixer.active.find(a=>a.kind===kind)||null;
function addActive(t,kind,races,data){t.fixer.active.push({kind,races,...data});}

// Hooks the rest of the game reads.
const loanLevels=(c,id)=>{const a=fixerActive(c.team,'loan');return a&&a.part===id?a.levels:0;};
const fixerMines=t=>{const a=fixerActive(t,'mines');return a?a.mines:0;};
const boostedSkill=(t,role,skill)=>{const a=fixerActive(t,'specialist');return a&&a.role===role&&a.skill===skill?a.level:0;};
const facilityGauge=(t,g)=>{const a=fixerActive(t,'facility');return !!a&&a.gauge===g;};
const leakedGauges=t=>{const a=fixerActive(t,'tuneleak');return a?a.gauges:[];};
const sabotageSecs=t=>TEAMS.reduce((s,o)=>{const a=fixerActive(o,'sabotage');return s+(a&&a.team===t.id?a.secs:0);},0);
const regLeaked=t=>!!t.fixer&&t.fixer.regSeason===league.season;
const repHit=(t,kind,d)=>{if(t===TEAMS[0])addRep(kind,d);else t.rep=clampRep(t.rep+d/2);};   // an AI team has one track: the average

// The rival a bet, a dive or a bribe is about: the team just above in the standings (or just below for the leader).
function nearRival(t){const st=teamStandings(),k=st.indexOf(t);return st[k>0?k-1:k+1];}
const bestFinish=(t,order)=>Math.min(...order.map((c,k)=>c.team===t&&c.state==='done'?k:99));
// Your weakest test facility (AI teams have no HQ: any gauge).
const weakGauge=t=>t.you?HQ_ROOMS.filter(r=>r.group==='facility').reduce((a,r)=>hqLevel(r.id)<hqLevel(a.id)?r:a).gauge:choice(GAUGES).id;
const nextTrackName=()=>{const id=(league.calendar||[])[league.race];const t=id&&TRACKS.find(x=>x.id===id);return t?t.name:'the next track';};
const spares=()=>TEAMS[0].inv.filter(it=>!fittedTo(it));
const spareValue=()=>r2(spares().reduce((a,it)=>a+0.3*newPartCost(it.level,it.id),0));
const notLast=()=>league.race<racesThisSeason();

// The catalog. tier: clean (any fixer), connected (PEOPLE 3+), dirty (NERVE 3+), filthy (NERVE 4+). pieces: only
// for you (AI teams keep one shared level per part, not pieces). when(t): can it come up now. make(t): the deal as
// offered: text, button label, price, worth (roughly what it's worth to an AI manager, M QT) and what taking it does.
const FIXER_DEALS=[
  {id:'tuneleak',tier:'clean',make:t=>{const p=dealPrice(t,0.25);return {title:'TUNE SHEET',worth:0.35*tierMoney(),
    text:`A track marshal sells the setup notes from the last meet at ${nextTrackName()}.`,
    label:`BUY · −${p.toFixed(2)}M, NEXT RACE: PRECISE READINGS ON 2 GAUGES BEFORE THE BASELINE`,cost:p,
    run(){addActive(t,'tuneleak',1,{gauges:GAUGES.map(g=>g.id).sort(()=>Math.random()-0.5).slice(0,2),text:'Tune sheet: 2 precise readings next race'});}};}},
  {id:'facility',tier:'clean',when:t=>!t.you||HQ_ROOMS.some(r=>r.group==='facility'&&hqLevel(r.id)<3),make:t=>{
    const gid=weakGauge(t),g=GAUGES.find(x=>x.id===gid),r=HQ_ROOMS.find(x=>x.gauge===g.id),p=dealPrice(t,0.2);
    return {title:'BORROWED FACILITY',text:`A megacorp's ${r.label.toLowerCase()} is standing empty for a night.`,worth:0.3*tierMoney(),
      label:`BOOK IT · −${p.toFixed(2)}M, NEXT RACE: ${g.label} GAUGE STARTS AT ${TUNE_START[3]}`,cost:p,
      run(){addActive(t,'facility',1,{gauge:g.id,text:`${r.label}: ${g.word.toLowerCase()} starts at ${TUNE_START[3]} next race`});}};}},
  {id:'scrap',tier:'clean',pieces:true,make:t=>{const id=choice(PARTS).id,lv=t.parts[id].level+5,cond=40,p=dealPrice(t,0.3);
    return {title:'SCRAPPED PROTOTYPE',text:`A rival binned a prototype ${partLabel(id)} after one test. It's quick, but it's been thrashed.`,worth:0,
      label:`BUY · −${p.toFixed(2)}M, A SPARE ${partLabel(id).toUpperCase()} AT LEVEL ${lv}, ${cond}% CONDITION`,cost:p,
      run(){const it=addPartItem(id,lv);it.cond=cond;uiPop='fit-'+it.uid;}};}},
  {id:'buyer',tier:'clean',pieces:true,when:()=>spares().length>0,make:()=>{const v=spareValue(),n=spares().length;
    return {title:'COLLECTOR',text:`A collector wants the spare parts you aren't running (${n} piece${n>1?'s':''}).`,worth:0,
      label:`SELL THEM ALL · +${v.toFixed(2)}M`,cost:0,run(){const s=spares();TEAMS[0].inv=TEAMS[0].inv.filter(it=>!s.includes(it));PARTS.forEach(p=>syncBest(p.id));TEAMS[0].cash+=v;}};}},
  {id:'image',tier:'clean',make:t=>{const street=t.you&&t.street<t.corp,p=dealPrice(t,0.25);
    return street?{title:'BLOCK PARTY',text:'Your fixer can throw a party the whole block will talk about, on your name.',worth:0.2*tierMoney(),
      label:`THROW IT · −${p.toFixed(2)}M, STREET CRED +5`,cost:p,run(){repHit(t,'street',5);}}
      :{title:'PR FIRM',text:'A PR firm can put your team in front of the right boardrooms.',worth:0.2*tierMoney(),
      label:`HIRE THEM · −${p.toFixed(2)}M, CORPORATE STANDING +5`,cost:p,run(){repHit(t,'corp',5);}};}},
  {id:'bet',tier:'clean',when:notLast,make:t=>{const r=nearRival(t),stake=dealPrice(t,0.3),win=r2(stake*3);
    return {title:'SIDE BET',text:`A bookie is taking bets on you against ${r.name} next race.`,worth:0.35*win,
      label:`BET · −${stake.toFixed(2)}M, +${win.toFixed(2)}M IF YOUR BEST CAR BEATS BOTH OF ${r.name}'S`,cost:stake,
      run(){addActive(t,'bet',1,{team:r.id,win,text:`Bet: beat ${r.name} next race for +${win.toFixed(2)}M`});}};}},
  {id:'mole',tier:'connected',when:t=>league.review&&!regLeaked(t)&&!(t.you&&knowsRegPick()),make:t=>{const p=dealPrice(t,0.3);
    return {title:'COMMITTEE AIDE',text:'An aide on the rules committee knows which part the new regulations will hit.',
      worth:t.mgr&&t.mgr.business==='elite'?0.4*tierMoney():0,   // only an elite garage plans around the regulations
      label:`PAY · −${p.toFixed(2)}M, LEARN WHICH OF ${league.review.map(x=>x.toUpperCase()).join(' / ')} GETS NEW REGS`,cost:p,
      run(){t.fixer.regSeason=league.season;if(t.you)say(`Committee aide: new regs will hit ${league.regPick.toUpperCase()}.`,'you');}};}},
  {id:'loan',tier:'connected',when:t=>!fixerActive(t,'loan')&&notLast(),make:t=>{const id=choice(PARTS).id,p=dealPrice(t,0.4);
    return {title:'CORPORATE TEST PROGRAM',text:`A megacorp wants race data on its new ${partLabel(id)}. Run it for them, then it goes back.`,worth:0.9*tierMoney(),
      label:`RUN IT · −${p.toFixed(2)}M, ${partLabel(id).toUpperCase()} +5 LEVELS ON BOTH CARS FOR 3 RACES, CORP STANDING +2`,cost:p,
      run(){addActive(t,'loan',3,{part:id,levels:5,text:`Test ${partLabel(id)}: +5 levels`});repHit(t,'corp',2);}};}},
  {id:'specialist',tier:'connected',when:t=>!fixerActive(t,'specialist'),make:t=>{
    const opts=[['pit','nerve','A legendary pit crew','pit stops'],['pit','mechanical','A veteran mechanic','part wear'],
      ['chief','design','A star race engineer','Night Tune cards'],['chief','people','A driver whisperer','driver feedback']].filter(([r,k])=>skillOf(t,r,k)<5);
    if(!opts.length)return null;
    const [role,skill,who,what]=choice(opts),p=dealPrice(t,0.3);
    return {title:'FREELANCER',text:`${who} is between jobs and will work your next two races.`,worth:0.1*(5-skillOf(t,role,skill))*tierMoney(),
      label:`HIRE · −${p.toFixed(2)}M, ${what.toUpperCase()} AS A ${skill.toUpperCase()} 5 ${roleById(role).label} FOR 2 RACES`,cost:p,
      run(){addActive(t,'specialist',2,{role,skill,level:5,text:`${who}: ${skill.toUpperCase()} 5 ${roleById(role).label.toLowerCase()}`});}};}},
  {id:'dive',tier:'dirty',when:notLast,make:t=>{const r=nearRival(t),pay=r2(0.8*tierMoney());
    return {title:'TAKE A DIVE',text:`A syndicate has money on ${r.name}. They'll pay if ${r.name}'s lead car finishes ahead of both of yours next race.`,worth:0.3*pay,
      label:`AGREE · +${pay.toFixed(2)}M AND CORP STANDING −3 IF ${r.name} BEATS BOTH YOUR CARS`,cost:0,
      run(){addActive(t,'dive',1,{team:r.id,pay,text:`Dive: ${r.name} must beat both your cars (+${pay.toFixed(2)}M)`});}};}},
  {id:'blueprints',tier:'dirty',make:t=>{const id=choice(PARTS).id,p=dealPrice(t,0.4);
    return {title:'STOLEN BLUEPRINTS',text:`Someone walked out of a corporate design office with next year's ${partLabel(id)} plans.`,worth:0.6*tierMoney(),
      label:`BUY · −${p.toFixed(2)}M, NEXT SEASON'S ${partLabel(id).toUpperCase()} +4 LEVELS, STREET CRED +2, CORP STANDING −4`,cost:p,
      run(){(t.nextYear||(t.nextYear={}))[id]=(t.nextYear[id]||0)+4;repHit(t,'street',2);repHit(t,'corp',-4);}};}},
  {id:'mines',tier:'dirty',when:t=>!fixerActive(t,'mines'),make:t=>{const p=dealPrice(t,0.2);
    return {title:'ARMS CACHE',text:'A street gang is clearing out a lock-up full of mines.',worth:0.25*tierMoney(),
      label:`BUY · −${p.toFixed(2)}M, +2 MINES PER CAR FOR 3 RACES, STREET CRED +2`,cost:p,
      run(){addActive(t,'mines',3,{mines:2,text:'Arms cache: +2 mines per car'});repHit(t,'street',2);}};}},
  {id:'dossier',tier:'clean',when:t=>TEAMS.some(r=>r!==t&&!t.fixer.known[r.id]),make:t=>{const p=dealPrice(t,0.2);
    return {title:'DOSSIER',text:"A retired enforcer knows every fixer on this grid, and how much nerve they've really got.",
      worth:fixerNerve(t)>=3?0.15*tierMoney():0,
      label:`BUY · −${p.toFixed(2)}M, LEARN EVERY RIVAL FIXER'S NERVE THIS SEASON`,cost:p,run(){TEAMS.forEach(r=>{if(r!==t)t.fixer.known[r.id]=true;});}};}},
  // Attacks: you pick the rival. They only work on a fixer with less NERVE than yours, and the gap sets how hard
  // they hit; a fixer with as much NERVE shuts it down (see attack()).
  {id:'sabotage',tier:'filthy',attack:true,when:notLast,make:t=>({title:'PIT CREW BRIBE',text:'Your fixer can buy one of a rival\'s pit crew, if their fixer isn\'t watching.',
    cost:dealPrice(t,0.35),worth:0.45*tierMoney(),what:'their stops take longer next race',
    effect:g=>`+${Math.min(4,g)}s a stop next race`,
    hit(r,g){addActive(t,'sabotage',1,{team:r.id,secs:Math.min(4,g),text:`${r.name}'s pit crew is bought: +${Math.min(4,g)}s a stop`});}})},
  {id:'heist',tier:'filthy',attack:true,make:t=>({title:'GARAGE JOB',text:'A crew can get into a rival\'s garage overnight and wreck their best part.',
    cost:dealPrice(t,0.4),worth:0.5*tierMoney(),what:'their best part loses levels',
    effect:g=>`their best part −${Math.min(3,g)} level${Math.min(3,g)>1?'s':''}`,
    hit(r,g){const id=PARTS.map(p=>p.id).reduce((a,b)=>r.parts[b].level>r.parts[a].level?b:a),n=Math.min(3,g);
      shiftPartLevels(r,id,l=>l-n);fixerNote(r,`${t.name} had your ${partLabel(id)} wrecked: −${n} level${n>1?'s':''}`);}})},
  {id:'dirt',tier:'dirty',attack:true,make:t=>({title:'DIRT FILE',text:'Your fixer has a journalist ready to run a story on a rival, if their fixer can\'t bury it.',
    cost:dealPrice(t,0.25),worth:0.25*tierMoney(),what:'their Corporate Standing drops (sponsors pay less)',
    effect:g=>`their Corporate Standing −${3*Math.min(3,g)}`,
    hit(r,g){repHit(r,'corp',-3*Math.min(3,g));fixerNote(r,`${t.name} ran a story on you: Corporate Standing −${3*Math.min(3,g)}`);}})},
];
const tierOpen=(t,tier)=>({clean:true,connected:fixerPeople(t)>=3,dirty:fixerNerve(t)>=3,filthy:fixerNerve(t)>=4})[tier];

// ---- what each fixer knows about the others' NERVE (0 = no fixer) ----
// Your fixer's PEOPLE reads a rival fixer as a range that always holds the truth (5 wide with no fixer, exact at
// PEOPLE 5); a dossier, or a move that gets shut down (either way round), makes it exact for the season.
const READ_WIDTH=[5,3,2,2,1,0];
const strHash=s=>[...s].reduce((h,ch)=>(h*31+ch.charCodeAt(0))>>>0,7);
function nerveRead(t,r){
  const n=fixerNerve(r);if(t.fixer.known[r.id])return {lo:n,hi:n};
  const w=READ_WIDTH[fixerPeople(t)];let lo=n-strHash(t.id+r.id+league.season)%(w+1),hi=lo+w;   // the same read all season
  if(lo<0){hi-=lo;lo=0;}if(hi>5){lo-=hi-5;hi=5;}
  return {lo:Math.max(0,lo),hi};
}
const readText=({lo,hi})=>lo===hi?(lo?`${lo}`:'none'):`${lo}–${hi}`;
function fixerNote(t,text){if(t.fixer)t.fixer.notes.push(text);}
// A move on a rival: it works when their fixer's NERVE is below yours; otherwise they shut it down, you've paid,
// your Corporate Standing takes a hit, and each side now knows the other's NERVE.
function attack(t,d,r){
  t.cash-=d.cost;const g=fixerNerve(t)-fixerNerve(r);
  if(g>0){d.hit(r,g);if(t.you)say(`${t.staff.fixer.name}: ${d.title.toLowerCase()} on ${r.name} worked, ${d.effect(g)}.`,'you');return true;}
  repHit(t,'corp',-4);t.fixer.known[r.id]=true;r.fixer.known[t.id]=true;
  if(t.you){const txt=`${r.name}'s fixer shut down your ${d.title.toLowerCase()}: their NERVE is ${fixerNerve(r)}. They know it was you.`;fixerNote(t,txt);say(txt,'bad');}
  fixerNote(r,`Your fixer shut down ${t.name}'s ${d.title.toLowerCase()}. Their NERVE is ${fixerNerve(t)}.`);
  return false;
}
// An AI manager's target: rookies go for the team just above them, whatever their fixer; pros and elites only for
// a rival their fixer reads as surely softer, nearest in the standings (above first).
function aiTarget(t){
  if(t.mgr.business==='rookie')return nearRival(t);
  const st=teamStandings(),k=st.indexOf(t),n=fixerNerve(t);
  return st.filter(r=>r!==t&&nerveRead(t,r).hi<n).sort((a,b)=>{const da=st.indexOf(a)-k,db=st.indexOf(b)-k;return (da>0)-(db>0)||Math.abs(da)-Math.abs(db);})[0]||null;
}
// A team's call: deals from the tiers its fixer can reach, no deal twice in a row.
function fixerCall(t){
  const f=t.fixer;f.call=null;
  if(!notLast()||Math.random()>=FIXER_CALL[fixerPeople(t)])return;
  const pool=FIXER_DEALS.filter(d=>tierOpen(t,d.tier)&&(t.you||!d.pieces)&&(!d.when||d.when(t))&&!f.last.includes(d.id)).sort(()=>Math.random()-0.5);
  const deals=[];
  for(const d of pool){if(deals.length>=dealsPerCall(t))break;const o=d.make(t);if(o)deals.push({...o,id:d.id,tier:d.tier,attack:!!d.attack});}
  if(deals.length){f.call={deals};f.last=deals.map(d=>d.id);}
}
// Take deal i (null: pass); an attack needs its target.
function answerFixer(i,t=TEAMS[0],targetId=null){
  const f=t.fixer,d=i==null?null:f.call.deals[i];
  if(d&&d.attack)attack(t,d,teamById(targetId));
  else if(d){t.cash-=d.cost;d.run();if(t.you)say(`${t.staff.fixer.name}: ${d.title.toLowerCase()}, done.`,'you');}
  f.call=null;
}
// An AI manager answers by business rating: rookies take the first deal they can afford, pros and elites the best
// value over its price, keeping a reserve.
function aiAnswerFixer(t){
  const deals=t.fixer.call.deals,b=t.mgr.business,reserve=b==='rookie'?0:0.3*tierMoney();
  const target=aiTarget(t),ok=deals.map((d,i)=>i).filter(i=>deals[i].cost<=t.cash-reserve&&(!deals[i].attack||target));
  let pick=null;
  if(b==='rookie')pick=ok.length?ok[0]:null;
  else{let best=0;ok.forEach(i=>{const v=deals[i].worth-deals[i].cost;if(v>best){best=v;pick=i;}});}
  answerFixer(pick,t,target&&target.id);
}
// After each race (from settleRace): bets and dives pay out, running deals run down, then every team's fixer may
// call. Your fixer hears when a rival's deal is aimed at you.
function settleFixer(order){
  TEAMS.forEach(t=>{
    const f=t.fixer,best=bestFinish(t,order);
    f.active.forEach(a=>{
      if(a.kind==='bet'){const won=best<bestFinish(teamById(a.team),order);if(won)t.cash+=a.win;if(t.you)say(`Side bet ${won?`won: +${a.win.toFixed(2)}M`:'lost'}.`,'you');}
      if(a.kind==='dive'){const r=teamById(a.team),paid=bestFinish(r,order)<best;
        if(paid){t.cash+=a.pay;repHit(t,'corp',-3);}if(t.you)say(paid?`The syndicate paid: +${a.pay.toFixed(2)}M.`:`${r.name} didn't beat you: no payment.`,'you');}
      a.races--;
    });
    f.active=f.active.filter(a=>a.races>0);
  });
  TEAMS.forEach(t=>{fixerCall(t);if(!t.you&&t.fixer.call)aiAnswerFixer(t);});
}
// What rivals have running against you, as far as your fixer hears (any fixer does).
function rivalMoves(){
  const me=TEAMS[0];if(!me.staff.fixer)return [];
  return [...TEAMS.filter(t=>!t.you).flatMap(t=>t.fixer.active.filter(a=>a.team===me.id&&a.kind!=='bet').map(a=>
    a.kind==='sabotage'?`${t.name} bought one of your pit crew: +${a.secs}s a stop next race`:`${t.name} is taking money to lose to you next race`)),...me.fixer.notes];
}
// ---- after the race: a fixer with NERVE makes a bad night pay (every team, before morale is applied) ----
// Payback (NERVE 4+): a driver wrecked by a rival wants payback: the −6 becomes +2 (+4 at NERVE 5).
// Warranty: the part that failed and put a car out is patched by its supplier: +20% condition a NERVE star.
// Damages: a rival whose weapons wrecked your car pays for it if their fixer has less NERVE than yours, 0.05M × tier
// money a point of gap; a fixer as tough as yours laughs the claim off (and yours learns their NERVE).
const PAYBACK=[0,0,0,0,2,4];
function fixerAftermath(order){
  TEAMS.forEach(t=>t.fixer.notes=[]);
  cars.forEach(c=>{
    const t=c.team,n=fixerNerve(t);if(!n)return;
    if(c.failedPart){const id=c.failedPart,fix=Math.min(100-c.cond[id],20*n);
      if(fix>=1){c.cond[id]+=fix;fixerNote(t,`Warranty: the supplier patched ${c.name}'s ${partLabel(id)} (+${Math.round(fix)}%)`);}}
    const by=c.wreckedBy,r=by&&by.team;if(!r||r===t)return;
    if(PAYBACK[n]){const k=(c.moodNotes||[]).findIndex(([x])=>x.startsWith('Wrecked by'));if(k>=0)c.moodNotes[k]=[`Payback on ${r.name}`,PAYBACK[n]];}
    const g=n-fixerNerve(r);
    if(g>0){const amt=Math.min(Math.max(0,r.cash),r2(0.05*g*tierMoney()));
      if(amt>0){r.cash-=amt;t.cash+=amt;fixerNote(t,`${r.name} paid ${amt.toFixed(2)}M for wrecking ${c.name}`);fixerNote(r,`You paid ${t.name} ${amt.toFixed(2)}M for wrecking ${c.name}`);}}
    else{t.fixer.known[r.id]=true;fixerNote(t,`${r.name}'s fixer laughed off your claim for ${c.name} (their NERVE is ${fixerNerve(r)})`);}
  });
}
// A new season: running deals end with the old one.
function closeFixerSeason(){ALL_TEAMS.forEach(t=>{t.fixer.active=[];t.fixer.call=null;t.fixer.known={};});}   // new season, new staff: reads start over
ALL_TEAMS.forEach(t=>t.fixer={call:null,active:[],last:[],known:{},notes:[]});
league.fixer=TEAMS[0].fixer;   // your fixer's state (the garage reads it)
