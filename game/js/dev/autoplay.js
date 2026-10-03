// Autoplay: plays whole careers with a sensible manager policy, for testing and balance.
// Open game/?autoplay=5 to play 5 careers (the page reloads between careers); the report appears on
// screen and in the console. Results are kept in sessionStorage under 'autoplay'.
// Add &watch to see it live: sessions run through the normal game loop at 4x and each screen stays up
// for a moment, so you can follow a career as it's played.
// &skill=poor|fine|amazing|perfect picks how well the manager plays (default fine); &seasons=N stops each
// career after N seasons (the season-1 difficulty targets are measured with &seasons=1).
// &blitz (or &blitz=N) with &watch: qualifying and races play live for N seconds (default 2), then skip to the flag.
// &wait=N pauses N seconds before the first career starts (tools/grid-reference.js hooks in meanwhile).
// &rich (or &rich=N) starts each career with N M QT (default 500) and a fully upgraded HQ.
// &manual=staff,field,garage (with &watch) hands you those screens: autoplay waits while one is open and carries on
// once you close it. Screens: staff, draft, newcar, meeting, field, market, sponsors, backer, garage (the whole
// between-races garage, until you press NEXT RACE).
'use strict';

const AUTO=(()=>{
  const q=new URLSearchParams(location.search),runs=+q.get('autoplay')||0;
  if(!runs)return null;
  const click=id=>{const e=$(id);if(e&&!e.disabled){e.click();return true;}return false;};
  const shown=id=>{const e=$(id);return !!e&&!e.hidden;};
  const watch=q.has('watch'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const SKILL=q.get('skill')||'fine',maxSeasons=+q.get('seasons')||99;
  const good=SKILL==='amazing'||SKILL==='perfect';
  // Skill in the Night Tune: poor picks at random, fine misses a third of the best picks, amazing and perfect play
  // the quick tune from the driver feedback (no peeking at the hidden targets).
  if(SKILL==='poor'||SKILL==='fine'){const best=autoTuneBest,miss=SKILL==='poor'?1:0.35;
    autoTuneBest=c=>{const t=c.tune;if(Math.random()<miss&&t.offer.length){const i=Math.floor(Math.random()*t.offer.length),card=t.offer[i];
      return card.special?{...card,i}:{fx:card.fx,i};}return best(c);};}
  // A pause so a screen can be seen (watch mode only); &pace=N stretches the off-track screens (default 2).
  const PACE=+q.get('pace')||2;
  const show=ms=>watch?sleep(ms*PACE):Promise.resolve();
  // Run the session until done() is true, calling tick() along the way: instantly, or live in watch mode.
  // &blitz(=N) in watch mode: each session plays live for N seconds (default 2), then runs to the flag at once.
  const BLITZ=q.has('blitz')?(+q.get('blitz')||2):0;
  async function run(tick,done,cap=60*600){
    if(watch){race.ready=true;setPaused(false);const t0=Date.now();
      while(!done()){
        if(BLITZ&&!race.over&&Date.now()-t0>BLITZ*1000){let n=0;while(!race.over&&n<cap){tick();stepSim(1/60);n++;}}
        tick();await sleep(100);}
      return;}
    let n=0;while(!done()&&n<cap){tick();stepSim(1/60);updateVisuals(1/60,n/60);n++;}
  }
  const errors=[];
  addEventListener('error',e=>errors.push(String(e.message)));
  const me=()=>TEAMS[0];
  // Income this season (race pay and prizes): yours vs the average AI team in your tier.
  const inc={you:0,ai:0};
  // Night Tune golden gauges per car this season (yours vs the AI cars), and the drivers' ratings against the field's.
  const tn={you:0,ai:0,n:0,grid:0,fin:0,cond:0,aiCond:0};
  const avgCond=cs=>cs.reduce((a,c)=>a+PARTS.reduce((b,p)=>b+c.cond[p.id],0)/PARTS.length,0)/cs.length;
  const goldens=c=>c.tune&&c.tune.grades?GAUGES.reduce((a,g)=>a+GRADE_SHARE[c.tune.grades[g.id]],0)/GAUGES.length*100:0;   // the average grade share (S 100 ... D 70)
  const _settle=settleRace;settleRace=order=>{_settle(order);inc.you+=lastSettle.pay;
    const n=TEAMS.length-1;inc.ai+=(TEAMS.filter(t=>!t.you).reduce((a,t)=>a+sponsorPerRace(t),0)+order.filter(c=>!c.you).reduce((a,c)=>{const k=order.indexOf(c);return a+(c.state==='done'&&k<RACE_PAY.length?RACE_PAY[k]*tierMoney():0);},0))/n;};
  // The ledger: every change to your cash, by source (+) and sink (−), booked to the season it happens in
  // (season-end bonuses and the Backer's settlement go to the season that earned them).
  const ledgers={};const book=(k,v)=>{if(Math.abs(v)<1e-9)return;const l=ledgers[league.season]||(ledgers[league.season]={});l[k]=(l[k]||0)+v;};
  const track=(name,k)=>{const f=window[name];window[name]=function(...a){const c0=me().cash,r=f.apply(this,a);book(typeof k==='function'?k(...a):k,me().cash-c0);return r;};};
  {const f=settleRace;settleRace=order=>{const c0=me().cash;f(order);const s=lastSettle;book('sponsor fees',s.fees);book('sponsor bonuses',s.shortBonus);book('prize money',me().cash-c0-s.fees-s.shortBonus);};}
  {const f=paySalaries;paySalaries=()=>{const st=staffSalaries(),c0=me().cash,r=f();book('staff salaries',-st);book('driver salaries',me().cash-c0+st);return r;};}
  track('hireStaff','staff salaries');
  ['draftSign','signDriver','renewDriver'].forEach(n=>track(n,'driver salaries'));
  track('answerRaise','driver raises');
  track('developPart','new parts');track('addPartCopy','new parts');track('rebuildPart','rebuilds');
  track('upgradeRoom','HQ');track('answerEvent','events');track('answerFixer','fixer deals');track('closeBackerSeason','Backer (objectives, loans)');track('settleDebt','Backer (objectives, loans)');
  // Sponsor objective bonuses are paid at season end.
  const _close=closeSponsorSeason;closeSponsorSeason=()=>{const c0=me().cash,r=_close();inc.you+=me().cash-c0;book('sponsor bonuses',me().cash-c0);return r;};

  // ---- the manager policy ----
  // Watch mode rhythm: a screen opens, a beat, one selection, a beat, the next selection...
  const beat=()=>show(1000);
  // The pre-season screens, in whatever order they open (a new career: staff, draft, sponsors, Backer).
  const MANUAL=new Set((q.get('manual')||'').split(',').filter(Boolean));
  const SCREEN_KEY={staffOv:'staff',draftOv:'draft',newcarOv:'newcar',meetOv:'meeting',fieldOv:'field',marketOv:'market',sponsorOv:'sponsors',backerOv:'backer'};
  const waitClosed=async id=>{while(shown(id))await sleep(250);};
  // The garage is yours: wait for it to open after the race, then until you've pressed NEXT RACE.
  async function playerGarage(){for(let k=0;k<40&&!shown('result');k++)await sleep(250);await waitClosed('result');}
  async function preSeason(){
    for(let k=0;k<12;k++){
      const mine=Object.keys(SCREEN_KEY).find(id=>shown(id)&&MANUAL.has(SCREEN_KEY[id]));
      if(mine)await waitClosed(mine);   // your screen: autoplay waits
      else if(shown('creditsOv')){await beat();click('crDone');}
      else if(shown('staffOv'))await staffScreen();
      else if(shown('draftOv'))await draftScreen();
      else if(shown('newcarOv')){await beat();click('ncDone');}
      else if(shown('fieldOv')){await beat();click('fdDone');}
      else if(shown('meetOv'))await meetingScreen();
      else if(shown('marketOv')||shown('sponsorOv')||shown('backerOv'))await otherScreens();
      else break;
    }
  }
  // Staff from the pool: poor hires at random; fine the best fit for each role it can afford; amazing and perfect
  // the fixer first (the game requires it), then good managers fill the technical director and crew chief, weigh the skill that matters most in each seat, and take
  // value for money in the pit and the fixer's office.
  const STAFF_WEIGHT={techdir:{design:1,mechanical:0.6},chief:{design:1,people:0.5},pit:{nerve:0.7,mechanical:0.5},fixer:{people:0.6,nerve:0.4}};
  async function staffScreen(){await beat();
    const roles=vacantRoles().map(r=>r.id).sort((a,b)=>good?['fixer','techdir','chief','pit'].indexOf(a)-['fixer','techdir','chief','pit'].indexOf(b):0);
    for(const role of roles){
      const pool=freeStaff().filter(p=>p.salary<me().cash*0.3);
      const w=STAFF_WEIGHT[role],fit=p=>Object.entries(w).reduce((a,[k,x])=>a+x*p.skills[k],0);
      const key=SKILL==='poor'?()=>Math.random()-0.5:SKILL==='fine'?(a,b)=>roleScore(b,role)-roleScore(a,role)
        :role==='pit'||role==='fixer'?(a,b)=>(fit(b)-3*b.salary)-(fit(a)-3*a.salary):(a,b)=>fit(b)-fit(a);
      const p=pool.sort(key)[0];
      staffRole=role;renderStaff();await beat();   // (watch mode: open the role's list before the pick)
      if(p)hireStaff(role,p);else league.staffSkipped[role]=true;
      staffRole=null;renderStaff();await beat();   // back to CREW
    }
    click('stDone');
  }
  // Draft: poor signs the famous names; fine the best rating it can afford with money kept back; amazing and
  // perfect put drivers first (the biggest pace lever) and keep a little for the first new part.
  async function draftScreen(){await beat();draftList=true;renderDraft();await beat();   // (watch mode: open the list)
    // Amazing and perfect weigh the pair: a star plus a cheap second driver can beat two journeymen.
    if(good){const pool=league.draft.pool,budget=me().cash-0.4;let best=null;
      pool.forEach((a,i)=>pool.slice(i+1).forEach(b=>{const cost=a.salary+b.salary,v=driverRating(a)+driverRating(b);
        if(cost<=budget&&(!best||v>best.v))best={a,b,v};}));
      if(best){draftSign(best.a);draftSign(best.b);renderDraft();await beat();}}
    while(league.draft.signed.length<2){
      const left=2-league.draft.signed.length,reserve=good?0.4:SKILL==='fine'?0.6:0;
      const fits=league.draft.pool.filter(d=>d.salary<=(me().cash-reserve)/left);
      const from=fits.length?fits:league.draft.pool.slice().sort((a,b)=>a.salary-b.salary).slice(0,1);
      const d=from.sort(SKILL==='poor'?(a,b)=>b.stats.fame-a.stats.fame:(a,b)=>driverRating(b)-driverRating(a))[0];
      draftSign(d);renderDraft();await beat();
    }
    click('dfDone');
  }
  // The design meeting: poor pushes at random and picks at random; fine goes STANDARD; amazing and perfect go
  // EXPERIMENTAL when they can afford the rebuilds. Everyone else picks the biggest total, favouring weak parts.
  async function meetingScreen(){await beat();
    const pace=SKILL==='poor'?Math.floor(Math.random()*3):good&&me().cash>=1.5*tierMoney()?2:1;
    choosePace(pace);renderMeeting();await beat();
    while(league.meeting.picks.length<league.meeting.pace.picks){
      const offer=league.meeting.offer,val=c=>Object.entries(c.fx).reduce((a,[id,v])=>a+v*(good&&v>0?1+Math.max(0,fieldMedian(id)-me().parts[id].level)/20:1),0);
      pickCard(SKILL==='poor'?Math.floor(Math.random()*offer.length):offer.indexOf(offer.reduce((a,c)=>val(c)>val(a)?c:a)));
      renderMeeting();await beat();
    }
    click('mtDone');
  }
  async function otherScreens(){
    if(shown('marketOv')){await beat();
      for(const s of openSeats()){
        const budget=Math.max(0,me().cash)*0.5+racesThisSeason()*sponsorPerRace()*0.25;
        const best=s.offers.filter(c=>c.salary<budget).sort((a,b)=>driverRating(b)-driverRating(a))[0];
        if(s.renew&&s.renew.salary<budget&&(!best||driverRating(me().drvs[s.k])>=driverRating(best)-3))renewDriver(s);
        else signDriver(s,best||s.offers[0]);
        renderMarket();await beat();
      }
      click('mkDone');
    }
    if(shown('sponsorOv')){await beat();
      for(const [slot,offers] of Object.entries(me().offers)){
        // value = the fees + the bonus at rough odds for how hard the target is (short-term: per race, for its races)
        const odds={safe:0.85,balanced:0.55,bonus:0.25},n=o=>o.term==='season'?racesThisSeason()-league.race+1:o.races;
        const val=o=>o.perRace*n(o)+o.bonus*(odds[o.kind]??0.4)*(o.term==='season'?1:o.races);
        let best=0;offers.forEach((o,i)=>{if(val(o)>val(offers[best]))best=i;});
        if(SKILL==='poor')best=Math.floor(Math.random()*offers.length);
        signSponsor(slot,offers[best]);applyLivery();renderSponsors();await beat();
      }
      click('spDone');
    }
    if(shown('backerOv')&&league.backer&&!league.backer.optional){await beat();pickOptional(1);renderBacker();await beat();click('bkDone');}
  }
  // The Night Tune one pick at a time (instantly outside watch mode).
  async function tuneSteps(c){
    if(!watch){autoTune(c);return;}
    for(;;){
      // Hover the card it's about to pick, so its preview shows, then pick it.
      const t=c.tune,best=!t.locked&&!t.lapReady&&t.offer.length?autoTuneBest(c):null;
      const card=best&&document.querySelector(`#tune [data-card="${best.i}"]`);
      if(card){card.dispatchEvent(new Event('mouseenter'));card.classList.add('hover');await beat();}
      if(!autoTuneStep(c))break;
      renderTune();await beat();
    }
    renderTune();
  }
  async function weekend(){
    // Drive the game's own functions (not buttons) so a missing button can't derail a weekend.
    if(shown('trackPreview')){await show(2500);click('tpGo');}   // a look at the circuit first
    await beat();await tuneSteps(mine[0]);await beat();$('tuneOv').hidden=true;ntStage='quali';startQualifying();
    mine.forEach(c=>{c.qCmp=isRain()?'wet':'soft';qPlanRun(c,true);});   // wait for grip, like an elite team
    // Each time a car comes back, its Tune screen opens: tune, and send it out again while sets last.
    let busy=false;
    await run(()=>{
      if(busy||$('tuneOv').hidden||ntStage!=='quali')return;
      const c=mine[ntCar],act=()=>{autoTune(c);if(c.qSets>0&&readyToRun(c)){c.qCmp=isRain()?'wet':good?'soft':'medium';qPlanRun(c,true);}closeTune();};
      if(!watch){act();return;}
      busy=true;(async()=>{await beat();const was=c.tune.locked;await tuneSteps(c);
        if(!was&&c.tune.locked)await show(3500);   // hold on the lock-in payoff (tuneSteps' last draw plays it)
        act();await beat();busy=false;})();
    },()=>race.over&&(!watch||!$('qualiOv').hidden||race.t-race.overAt>3));
    ntStage='post';
    for(const c of mine){
      if(c.tune.locked)continue;
      if(!watch){autoTune(c);continue;}
      ntCar=c.slot;$('qualiOv').hidden=true;$('tuneOv').hidden=false;renderTune();await beat();
      await tuneSteps(c);await show(3500);   // final picks one by one, then hold on the lock-in payoff
    }
    if(watch){$('tuneOv').hidden=true;qStep='grid';renderQualiResult();await show(2500);}
    $('tuneOv').hidden=true;$('qualiOv').hidden=true;setPaused(false);
    if(watch){qStep='strategy';renderQualiResult();await beat();}
    for(const c of mine){c.startCompound=isRain()?'wet':tireLifeLaps(c,'medium')<LAPS?'hard':'medium';if(watch){renderQualiResult();await beat();}}
    tn.you+=(goldens(mine[0])+goldens(mine[1]))/2;tn.ai+=cars.filter(c=>!c.you).reduce((a,c)=>a+goldens(c),0)/(cars.length-2);tn.n++;
    tn.cond+=avgCond(mine);tn.aiCond+=avgCond(cars.filter(c=>!c.you));
    goToGrid();let lastCheck=-1;
    await run(()=>{
      if(Math.floor(race.t)>lastCheck){lastCheck=Math.floor(race.t);mine.forEach(c=>{
        if(c.state!=='race'||c.pit)return;
        // Race orders (fine and up): RICH/PUSH whenever the tank and tires reach the flag on them, LEAN/SAVE when
        // they can't reach it on STD; poor leaves everything on STD.
        if(SKILL!=='poor'&&c.orders){
          const need=Math.max(0,LAPS*L-c.d)*FUEL_PER_UNIT;
          c.orders.fuel=c.fuel>=need*ORDERS.fuel.opts.rich.burn+2?'rich':c.fuel>=need*1.01||c.fuel<need*ORDERS.fuel.opts.lean.burn?'std':'lean';
          c.orders.tires=c.tire>=tireNeed(c,'push')+5?'push':c.tire>=tireNeed(c,'std')+3||c.tire<tireNeed(c,'save')?'std':'save';
        }
        if(c.boxReq||c.d>(LAPS-1)*L)return;
        const lapFuel=L*FUEL_PER_UNIT*fuelBurn(c);
        if((fuelAtFlag(c)<0&&c.fuel<lapFuel*1.3)||(c.tire<22&&c.tire<tireNeed(c,c.orders.tires))){c.boxReq=true;c.pitCompound=bestCompound(c);}
      });}
    },()=>race.over&&(!watch||race.resultShown));
    {const st=standings();tn.fin+=mine.reduce((a,c)=>a+st.indexOf(c)+1,0)/2;tn.grid+=mine.reduce((a,c)=>a+c.gridPos,0)/2;}
    if(!watch){race.t+=3;updatePanels();}   // (watch mode: the garage shows the result next)
  }
  // Between races. In watch mode it walks the same screens a player would: the result, then each screen
  // where a decision is made (before and after), then the hub.
  async function garage(){
    const t=me(),view=async(tab,ms=1000)=>{if(!watch)return;garageTab=tab;renderGarage();await show(ms);};
    await view('result',2500);
    if(league.event){await view('event',2000);const o=league.event.options;answerEvent(o[0].cost<=t.cash-1?0:1);await view('hub');}
    // Fixer calls: the first deal it can afford; an attack only on a rival its fixer surely beats.
    if(league.fixer.call){await view('fixer',2000);
      const soft=teamStandings().find(r=>r!==t&&nerveRead(t,r).hi<fixerNerve(t));
      const k=league.fixer.call.deals.findIndex(d=>d.cost<=t.cash-1&&(!d.attack||soft));
      answerFixer(SKILL==='poor'||k<0?null:k,t,soft&&soft.id);await view('hub');}
    if(mine.some(c=>c.drv.raise)){await view('team');mine.forEach(c=>c.drv.raise&&answerRaise(c,t.cash>c.drv.raise.amount*4?'pay':'promise'));await view('team');}
    // Amazing and perfect buy the second Machine Shop slot first: money can't become parts without it.
    if(good&&league.hq.machine===0&&t.cash>HQ_COSTS[0]+0.2){await view('hq');upgradeRoom('machine');await view('hq');}
    // Parts: rebuild worn ones, develop the weakest while there are slots and money.
    const rebuilds=[];
    // Fit the best pieces: the best to the higher-rated driver, as long as it's in decent shape.
    const fits=[];
    for(const p of PARTS){
      const drivers=mine.slice().sort((a,b)=>driverRating(b.drv)-driverRating(a.drv));
      const pieces=t.inv.filter(x=>x.id===p.id&&itemCond(x)>30).sort((a,b)=>b.level-a.level);
      drivers.forEach((c,k)=>{const it=pieces[k];if(it&&it.level>carPartLevel(c,p.id))fits.push([c,it.uid]);});
    }
    if(fits.length){await view('workshop');for(const [c,uid] of fits){fitPart(c,uid);await view('workshop');}}
    // (amazing and perfect keep the cars fresher: rebuild sooner, with less cash held back)
    const rbAt=good?60:45,rbKeep=good?0.3:1;
    mine.forEach(c=>PARTS.forEach(p=>{const rb=rebuildCost(carPartLevel(c,p.id),p.id);if(c.cond[p.id]<rbAt&&t.cash>rb+rbKeep)rebuilds.push([c,p.id]);}));
    const low=SKILL==='poor'?[]:PARTS.map(p=>p.id).sort((a,b)=>t.parts[a].level-t.parts[b].level);
    if(rebuilds.length||low.some(id=>t.parts[id].dev<=0&&partsInDev()<devSlots()&&!league.devFrozen&&t.cash>newPartCost(t.parts[id].level,id)+0.3*tierMoney())){
      if(rebuilds.length)await view('cars');
      for(const [c,id] of rebuilds)if(t.cash>rebuildCost(carPartLevel(c,id),id)+rbKeep){rebuildPart(t,c,id);await view('cars');}
      await view('workshop');
      for(const id of low){if(partsInDev()>=devSlots()||league.devFrozen)break;const np=newPartCost(t.parts[id].level,id);if(t.parts[id].dev<=0&&t.cash>np+0.3*tierMoney()){developPart(t,id);await view('workshop');
        if(SKILL!=='fine'&&t.cash>piecePrice(id)+0.3*tierMoney()){addPartCopy(id);await view('workshop');}}}   // a piece for each car
    }
    // HQ: the Machine Shop (more development slots) first, then the rest when there's money to spare.
    // Amazing and perfect fund next year from the Design Studio when there's money to spare.
    if(good&&(me().studio||[]).length<studioSlots(me())&&t.cash>studioCost()+1){
      const id=PARTS.map(p=>p.id).filter(id=>!(t.studio||[]).some(p=>p.id===id)).sort((a,b)=>t.parts[a].level-t.parts[b].level)[0];
      if(id){await view('studio');startStudio(t,id);await view('studio');}}
    const room=(good?['machine','studio','dyno','susp','tunnel','simrig','lounge','dataden']:['machine','simrig','lounge','dataden']).find(id=>{const l=league.hq[id];return l<3&&t.cash>HQ_COSTS[l]+(id==='machine'?1:5);});
    if(room&&SKILL!=='poor'){await view('hq');upgradeRoom(room);await view('hq');}
    garageTab='hub';renderGarage();await show(2500);
  }

  // ---- one career, then store and reload ----
  // Yields between race weekends so the page (and any tools watching it) stays responsive.
  // A message-channel yield: unlike setTimeout it isn't throttled when the tab is in the background.
  const breathe=()=>new Promise(r=>{const ch=new MessageChannel();ch.port1.onmessage=()=>r();ch.port2.postMessage(0);});
  async function career(){
    const seasons=[];let guard=0;
    if(watch){setSpeed(4);setView('full');}
    // &rich: start the career with a fortune and every HQ room at level 3.
    if(q.has('rich')){me().cash=+q.get('rich')||500;league.hqPath='corp';HQ_ROOMS.forEach(r=>league.hq[r.id]=3);}
    await preSeason();
    while(guard++<200&&!$('newCareer')&&seasons.length<maxSeasons){
      await weekend();if(MANUAL.has('garage'))await playerGarage();else await garage();
      if(league.race===racesThisSeason())seasons.push({s:league.season,tier:typeof myTier==='function'?myTier():0,pos:standingPos(me()),
        cash:+me().cash.toFixed(2),conf:league.confidence,debt:+league.debt.toFixed(2),
        drv:mine.map(c=>`${c.name}${Math.round(driverRating(c.drv))}/${c.drv.salary.toFixed(1)}`).join(' '),inc:`${inc.you.toFixed(1)}/${inc.ai.toFixed(1)}`,lead:Math.round(PARTS.reduce((a,p)=>a+me().parts[p.id].level-fieldMedian(p.id),0)/PARTS.length),
        gold:`${(tn.you/tn.n).toFixed(0)}/${(tn.ai/tn.n).toFixed(0)}`,race:`grid${(tn.grid/tn.n).toFixed(1)} fin${(tn.fin/tn.n).toFixed(1)} cond${(tn.cond/tn.n).toFixed(0)}/${(tn.aiCond/tn.n).toFixed(0)}`,table:teamStandings().map(t=>`${t.you?'*':''}${t.id}${seasonStat(t).points}`).join(' '),drvGap:Math.round(mine.reduce((a,c)=>a+driverRating(c.drv),0)/2-cars.filter(c=>!c.you).reduce((a,c)=>a+driverRating(c.drv),0)/(cars.length-2))});
      if(league.race===racesThisSeason()){inc.you=inc.ai=0;Object.keys(tn).forEach(k=>tn[k]=0);}
      click('nextRace');await preSeason();
      window.autoplayProgress=`career ${JSON.parse(sessionStorage.getItem('autoplay')||'[]').length+1}, season ${league.season}, race ${league.race}`;
      await breathe();
    }
    seasons.forEach(x=>x.ledger=Object.fromEntries(Object.entries(ledgers[x.s]||{}).map(([k,v])=>[k,+v.toFixed(2)])));
    return {grade:careerGrade()[0],titles:league.titles,seasons,errors:errors.slice(0,5)};
  }
  function report(all){
    const lines=[`AUTOPLAY: ${all.length} career${all.length>1?'s':''}, skill ${SKILL}`];
    const s1=all.map(r=>r.seasons[0]&&r.seasons[0].pos).filter(Boolean).sort((a,b)=>a-b);
    if(s1.length)lines.push(`Season 1 finish: median ${s1[s1.length>>1]}, mean ${(s1.reduce((a,b)=>a+b,0)/s1.length).toFixed(1)}, all [${s1.join(' ')}]`);
    const grades={};all.forEach(r=>grades[r.grade]=(grades[r.grade]||0)+1);
    lines.push('Grades: '+Object.entries(grades).map(([g,n])=>`${g} ${n}`).join(', '));
    all.forEach((r,i)=>lines.push(`#${i+1} ${r.grade}: `+r.seasons.map(s=>`S${s.s}T${s.tier} P${s.pos} ${s.cash}M c${s.conf}${s.debt?' debt'+s.debt:''} lead${s.lead} gold${s.gold} ${s.race} {${s.table}} drv${s.drvGap} inc${s.inc} [${s.drv}]`).join(' | ')+(r.errors.length?' ERRORS: '+r.errors.join(' / '):'')));
    console.log(lines.join('\n'));
    const pre=document.createElement('pre');pre.id='autoplayReport';pre.textContent=lines.join('\n');
    pre.style.cssText='position:fixed;inset:10px;z-index:99;overflow:auto;background:#0b0716ee;color:#f4ecff;font:15px/1.2 VT323,monospace;padding:10px;border:2px solid #ffd23f;white-space:pre-wrap';
    document.body.appendChild(pre);
  }
  async function go(){
    const all=JSON.parse(sessionStorage.getItem('autoplay')||'[]');
    if(all.length>=runs){report(all);sessionStorage.removeItem('autoplay');return;}
    LAPS_PRESET=+q.get('laps')||LAPS_PRESET;LAPS=lapsFor();
    all.push(await career());
    sessionStorage.setItem('autoplay',JSON.stringify(all));
    if(all.length>=runs){report(all);sessionStorage.removeItem('autoplay');}else location.reload();
  }
  breathe().then(()=>sleep((+q.get('wait')||0)*1000)).then(go);   // &wait=N: a pause before starting, for tools that hook in
  return {career};
})();
