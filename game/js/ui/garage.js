// Between races: the race result, any event card, then the season hub (next race, standings, cars, team, HQ),
// each hub card opening its own focused screen.
'use strict';

let garageTab='result',buildPart=null;   // buildPart: the part whose build cards are open
// The three build cards for a part: level pips, the jump, build time and the condition it arrives in.
function buildHtml(id){
  const me=TEAMS[0];
  return `<div class="offer mtoffer">${buildOffer(me,id).map((b,i)=>`<button class="tcard need" data-build="${i}" title="Level ${b.lv} of 5">
    <small class="pips">${'■'.repeat(b.lv)}${'□'.repeat(5-b.lv)} ${b.label}</small>+${buildGain(me,id,b)} levels<br>${buildRaces(me,b)} race${buildRaces(me,b)>1?'s':''} · ${b.cond}% condition</button>`).join('')}</div>`;
}
// Called once when the race is settled: open on the race result.
function openGarage(){garageTab='result';renderGarage();}
function renderGarage(){
  const me=TEAMS[0],s=lastSettle,rowsTop=s.order.slice(0,6);
  const extra=mine.filter(c=>s.order.indexOf(c)>=6);
  const resItem=c=>`<li class="${c.you?'you':''}" value="${s.order.indexOf(c)+1}">${c.name} <small>${c.team.id}</small>${c.state==='wreck'?' · DNF':''}</li>`;
  const reg=league.review?`<p class="regwatch" title="One of these gets new regulations at season end: levels above the field median +${REG_MARGIN} keep only ${Math.round(REG_KEEP*100)}% of the excess.">REG REVIEW: <b>${league.review.map(x=>x.toUpperCase()).join('</b> / <b>')}</b>${knowsRegPick()&&league.regPick?` · DATA DEN: <b>${league.regPick.toUpperCase()}</b>`:''}</p>`:'';
  const lastReg=league.lastReg&&league.race===1?`<p class="regwatch hit">${league.lastReg}</p>`:'';
  const risky=id=>league.review&&league.review.includes(id)&&me.parts[id].level>fieldMedianRead(id)+REG_MARGIN;
  // Garage: what each car runs (level vs the field, condition, rebuild), then every piece you own to fit.
  const condBar=v=>`<span class="pcond"><i class="meter"><i style="width:${v}%;background:${durCol(v)}"></i></i>${Math.round(v)}%</span>`;
  const carCols=mine.map((c,k)=>`<section class="pcar"><h4>CAR ${k+1} · ${c.name}</h4>${PARTS.map(({id,label})=>{
    const lv=carPartLevel(c,id),cond=c.cond[id],rb=rebuildCost(lv,id);
    return `<div class="prow" data-pop="rb-${k}-${id}"><span>${label}</span><span>${lv}</span>${condBar(cond)}
      <button data-rebuild="${id}" data-car="${k}" title="Re-machine the whole part: back to 100%" ${cond>=99.5||me.cash<rb?'disabled':''}>REBUILD ${rb.toFixed(2)}</button></div>`;}).join('')}</section>`).join('');
  const stock=PARTS.map(({id,label})=>{
    const pt=me.parts[id],np=piecePrice(id),items=me.inv.filter(x=>x.id===id).sort((a,b)=>b.level-a.level);
    const full=partsInDev()>=devSlots();
    const build=pt.dev>0?`<span class="dim">${pt.count>1?pt.count+' ':''}NEW IN ${pt.dev} RACE${pt.dev>1?'S':''}</span>${(pt.count||1)<2?`<button data-copy="${id}" title="A second piece of the part in development, arriving with it" ${me.cash<np?'disabled':''}>+1 COPY · ${np.toFixed(2)}</button>`:''}`:
      `<button data-newpart="${id}" title="${full?'Machine Shop full ('+partsInDev()+'/'+devSlots()+' in development)':'Choose from three designs for a new '+label.toLowerCase()}" ${me.cash<np||league.devFrozen||full?'disabled':''}>BUILD · ${np.toFixed(2)}M</button>`;
    return `<section class="pgroup"><h4>${label}${risky(id)?' <b class="over" title="Under regulation review">REG</b>':''}</h4>${items.map(it=>{
      const on=fittedTo(it),better=!on&&mine.some(c=>carPartLevel(c,id)<it.level)&&itemCond(it)>30;
      return `<div class="pitem" data-pop="fit-${it.uid}"><span>${it.level}</span>${condBar(itemCond(it))}
        <span class="btns">${mine.map((c,k)=>`<button data-fit="${it.uid}" data-car="${k}" aria-pressed="${on===c}" class="${better?'need':''}">CAR ${k+1}</button>`).join('')}</span></div>`;}).join('')}
      ${build}</section>`;}).join('');
  const done=league.race>=racesThisSeason();
  // Drivers: how each one's morale moved this race, and any raise demand to answer.
  const drivers=(s.morale||[]).map(({car:c,from,to,notes})=>{
    const d=c.drv,k=mine.indexOf(c),r=d.raise;
    const why=notes.length?notes.map(([t,v])=>`${t} ${v>0?'+':''}${v}`).join(', '):'no big moments';
    const raise=r?`<div class="raise"><b>${c.name} WANTS A RAISE: +${r.amount.toFixed(2)}M QT A SEASON</b>
        <span class="btns"><button class="need" data-raise="${k}" data-choice="pay">PAY · MORALE +10</button>
        <button class="need" data-raise="${k}" data-choice="promise">PROMISE NEXT SEASON · MORALE −5</button>
        <button class="need" data-raise="${k}" data-choice="refuse">REFUSE · MORALE −20, WON'T EXTEND</button></span></div>`:'';
    return `<p class="gmoney">${c.name} morale ${Math.round(from)} → <b style="color:${moodCol(to)}" title="${why}. Morale drifts toward ${moraleTarget()} after each race.">${Math.round(to)} ${moodLabel(to)}</b> · age ${d.age} · salary ${d.salary.toFixed(2)}M QT, ${d.yearsLeft} season${d.yearsLeft>1?'s':''} left${d.promised?` (+${d.promised.toFixed(2)} promised)`:''}${d.wontExtend?' · <b style="color:#ff3b3b">WON\'T EXTEND</b>':''}</p>${raise}`;
  }).join('');
  const pending=mine.some(c=>c.drv.raise);   // events are answered on their own screen first
  const ev=league.event,eventHtml=ev?`<div class="raise"><span>${ev.text}</span><span class="btns">${ev.options.map((o,i)=>
    `<button class="need" data-event="${i}" ${o.cost>me.cash?'disabled title="Not enough money"':''}>${o.label}</button>`).join('')}</span></div>`:'';
  // The fixer's call: a few deals, take one or pass.
  const call=league.fixer.call,fx=league.staff.fixer;
  const callHtml=call?`<p class="nt-sub">${fx.name} has ${call.deals.length>1?`${call.deals.length} deals`:'a deal'} for you.</p>${call.deals.map((d,i)=>
    `<div class="raise"><span><b>${d.title}</b>${d.tier==='clean'?'':` <small class="dim">${d.tier.toUpperCase()}</small>`} · ${d.text}</span><span class="btns">${d.attack?`<button class="need" data-fixer-pick="${i}" ${d.cost>me.cash?'disabled title="Not enough money"':''}>PICK A RIVAL · −${d.cost.toFixed(2)}M: ${d.what.toUpperCase()}</button>`
      :`<button class="need" data-fixer="${i}" ${d.cost>me.cash?'disabled title="Not enough money"':''}>${d.label}</button>`}</span></div>`).join('')}`:'';
  // An attack's target: every rival with what your fixer knows of their NERVE, and what that means for this move.
  const pick=call&&call.deals[league.fixer.pick],myN=fixerNerve(me);
  const nerveTip=`Works only on a fixer with less NERVE than yours, and the gap sets how hard it hits. If theirs is as high, they shut it down: you've paid, Corporate Standing −4, and they know it was you.`;
  const targetHtml=pick?`<p class="nt-sub">Your NERVE <b>${myN}</b></p><ul class="stlist fxlist"><li class="head"><span>TEAM</span><span>POS</span><span title="${nerveTip}">THEIR NERVE</span><span title="${nerveTip}">IF YOU GO</span><span></span></li>${
    teamStandings().filter(r=>r!==me).map(r=>{const rd=nerveRead(me,r),lo=myN-rd.hi,hi=myN-rd.lo;
      const verdict=lo>0?`WORKS: ${pick.effect(lo)}${hi>lo?` (up to ${pick.effect(hi).replace(/^their /,'')})`:''}`:hi<=0?'SHUT DOWN':'MAYBE';
      return `<li><b>${r.name}</b><span>P${standingPos(r)}</span><span>${readText(rd)}</span><span class="${lo>0?'':hi<=0?'bad':'dim'}">${verdict}</span><button class="need" data-attack="${r.id}">GO</button></li>`;}).join('')}</ul>`:'';
  const afterEvent=call?'fixer':'hub';
  const running=[...league.fixer.active.map(a=>a.text),...rivalMoves().map(x=>`<span class="bad">${x}</span>`)];
  // Team standings (top 5 plus you) and how the sponsor deals stand.
  const st=teamStandings();
  const standingsHtml=`${fieldList(st,true)}${plotWidget('standings')}<p class="nt-sub">Street Cred ${me.street} · Corporate Standing ${me.corp}</p>`;
  const deals=SPONSOR_SLOTS.map(sl=>me.sponsors[sl.id]).filter(Boolean).map(d=>
    `<li><b style="color:${d.color}">${d.brand}</b> ${dealText(d)} · ${d.term==='season'?`now P${standingPos(me)}${seasonDealMet(d)?' ✓':''}`:`${d.hits} hit${d.hits===1?'':'s'}, ${dealLength(d)} left`}</li>`).join('');
  const sponsorsHtml=deals?`<h4>SPONSORS</h4><ul class="gobj">${deals}</ul>`:'';
  const bk=league.backer,bObj=(o,tag)=>`<li><b>${tag}</b> ${objText(o)} · ${objProgress(o)}${objMet(o)?' ✓':''}</li>`;
  const backerHtml=bk?`<h4>BACKER · CONFIDENCE ${Math.round(league.confidence)}</h4><ul class="gobj">${bObj(bk.primary,'PRIMARY')}${bk.optional?bObj(bk.optional.objective,'OPTIONAL'):''}</ul>`:'';
  const worn=mine.some(c=>PARTS.some(p=>c.cond[p.id]<40));
  // The season calendar: every race, its forecast and how your cars did.
  const scheduleHtml=`<p class="nt-sub">${TIER_NAMES[myTier()]} · ${CAREER_SEASONS-league.season} season${CAREER_SEASONS-league.season===1?'':'s'} left after this one · Backer confidence ${Math.round(league.confidence)}${league.debt>0.005?` · owes ${league.debt.toFixed(2)}M QT`:''}</p>
    <ol class="sched">${(league.calendar||[]).map((id,i)=>{const t=TRACKS.find(x=>x.id===id),w=WEATHER[league.weather[i]]||WEATHER.clear,r=(league.raceLog||[])[i];
      return `<li class="${i===league.race-1?'now':''}${i>=league.race?' next':''}"><span>${i+1}</span><span>${t.name}</span><span title="${w.tip}">${w.label}</span><span>${r?mine.map((c,k)=>`${c.name} ${r[k]}`).join(' · '):''}</span></li>`;}).join('')}</ol>`;
  const back=`<button data-gtab="hub">BACK</button>`;
  const toFit=me.inv.some(it=>!fittedTo(it)&&itemCond(it)>30&&mine.some(c=>carPartLevel(c,it.id)<it.level));
  const card=(title,body,btn,alert)=>`<section class="hcard${alert?' alert':''}"><h4>${title}</h4><div>${body}</div>${btn}</section>`;
  const pts=seasonStat(me).points,pos=st.indexOf(me)+1;
  const nextId=(league.calendar||[])[league.race],nextT=nextId&&TRACKS.find(t=>t.id===nextId),nextW=WEATHER[(league.weather||[])[league.race]]||WEATHER.clear;
  // One screen per view: the race result, an event card, the season hub, and a focused screen per hub card.
  const view={
    result:[`RACE ${league.race} · RESULT`,`<div class="stamps">${s.mine.map(m=>`<span class="stamp${m.dnf?' dnf':''}"><small>${m.name}</small>${m.dnf?'DNF':'P'+m.pos}</span>`).join('')}
      <span class="stampnote">${s.pts?`+${s.pts} PTS · `:''}${s.prevPos===standingPos(me)?`P${s.prevPos} in the standings`:`P${s.prevPos} → P${standingPos(me)} in the standings`}</span></div>
      <div class="gcols"><ol class="gres reveal">${rowsTop.map(resItem).join('')}${extra.map(resItem).join('')}</ol>
      <p class="gmoney">${s.mine.map(m=>`${m.name} ${m.dnf?'DNF':'P'+m.pos} · prize +${m.prize.toFixed(2)}`).join('<br>')}<br>Sponsor fees +${s.fees.toFixed(2)}${s.shortBonus?`<br>Short-term bonus +${s.shortBonus.toFixed(2)}`:''}<br>Race total <b>+${s.pay.toFixed(2)}</b>${me.fixer.notes.length?`<br>${me.fixer.notes.map(x=>`<small>FIXER: ${x}</small>`).join('<br>')}`:''}</p></div>`,
      `<button data-gtab="${ev?'event':afterEvent}">CONTINUE</button>`],
    event:[ev?ev.title:'EVENT',eventHtml,ev?'':`<button data-gtab="${afterEvent}">CONTINUE</button>`],
    fixer:[`FIXER · ${fx?fx.name:''}`,callHtml,call?`<button id="fixerPass">PASS</button>`:`<button data-gtab="hub">CONTINUE</button>`],
    fixertarget:[`PICK A RIVAL · ${pick?pick.title:''}`,targetHtml,`<button data-gtab="fixer">BACK</button>`],
    hub:[`SEASON ${league.season} · RACE ${league.race}/${racesThisSeason()}`,`<div class="hub">
      ${card('NEXT RACE',done?'Season over':nextT?`${nextT.name}<br><small title="${nextW.tip}">${nextW.label}</small>`:'',`<button data-gtab="schedule">CALENDAR</button>`)}
      ${card('STANDINGS',`P${pos} · ${pts} pts`,`<button data-gtab="standings">STANDINGS</button>`)}
      ${card('GOALS',`Backer confidence ${Math.round(league.confidence)}${me.sponsors.main?`<br><small>Season sponsor: top ${me.sponsors.main.target}</small>`:''}`,`<button data-gtab="goals">GOALS</button>`)}
      ${card('CARS',PARTS.map(p=>`${p.short} ${me.parts[p.id].level}`).join(' · ')+(worn?'<br><small class="bad">Worn parts</small>':''),`<button data-gtab="cars">CARS</button>`,worn)}
      ${card('WORKSHOP',`${partsInDev()} of ${devSlots()} in development`+(toFit?'<br><small class="bad">New part to fit</small>':''),`<button data-gtab="workshop">WORKSHOP</button>`,toFit)}
      ${card('TEAM','Morale: '+mine.map(c=>`${c.name} <b style="color:${moodCol(c.drv.morale)}">${Math.round(c.drv.morale)}</b>`).join(' · ')+(mine.some(c=>c.drv.raise)?'<br><small class="bad">Raise demand</small>':''),`<button data-gtab="team">TEAM</button>`,mine.some(c=>c.drv.raise))}
      ${hqLevel('studio')?card('STUDIO',`${(me.studio||[]).length} of ${studioSlots(me)} next-year projects`+(Object.values(me.nextYear||{}).some(Boolean)?`<br><small>${PARTS.filter(p=>(me.nextYear||{})[p.id]).map(p=>`${p.short} +${me.nextYear[p.id]}`).join(' · ')} banked</small>`:''),`<button data-gtab="studio">STUDIO</button>`):''}
      ${running.length?card('FIXER DEALS',running.join('<br>'),''):''}
      ${card('HQ',`${HQ_ROOMS.reduce((a,r)=>a+hqLevel(r.id),0)} of ${HQ_ROOMS.length*3} upgrades`,`<button data-gtab="hq">HQ</button>`)}
    </div>`,`<button id="nextRace" ${pending?'disabled title="Answer the raise demand first"':''}>${done?'END SEASON':'NEXT RACE'}</button>`],
    schedule:['CALENDAR',scheduleHtml,back],
    standings:['STANDINGS',standingsHtml,back],
    goals:['GOALS',`${backerHtml}${sponsorsHtml}`,back],
    cars:['CARS',`${reg}<div class="pcars">${carCols}</div>${plotWidget('cars')}`,back],
    studio:['DESIGN STUDIO',`${studioSlots(me)?'':'<p class="nt-sub">Build the Design Studio in HQ to start next-year projects.</p>'}<div class="pstock">${PARTS.map(({id,label})=>{
      const on=(me.studio||[]).find(p=>p.id===id),bank=(me.nextYear||{})[id]||0,full=(me.studio||[]).length>=studioSlots(me);
      return `<section class="pgroup"><h4>${label}</h4><div>${bank?`+${bank} banked for next year`:'Nothing banked'}</div>${on?`<span class="dim">+${on.gain} in ${on.left} race${on.left>1?'s':''}</span>`
        :`<button data-studio="${id}" ${full?`disabled title="${studioSlots(me)?'Studio full':'Build the Design Studio in HQ first'}"`:me.cash<studioCost()?'disabled title="Not enough money"':''}>START +${studioGainFor(skillOf(me,'techdir','design'))} · ${studioCost().toFixed(2)}</button>`}</section>`;}).join('')}</div>`,back,'Projects don\'t help this season: their levels go into next season\'s new car.'],
    build:buildPart?[`BUILD A NEW ${PARTS.find(p=>p.id===buildPart).label} · ${piecePrice(buildPart).toFixed(2)}M`,buildHtml(buildPart),`<button data-gtab="workshop">BACK</button>`,
      `Your technical director's DESIGN sets how high each design's level tends to be; MECHANICAL sets the base build time.${catchUp(me.parts[buildPart].level,buildPart)?` Includes +${catchUp(me.parts[buildPart].level,buildPart)} catch-up: this part is behind the field.`:''}`]:[],
    workshop:['WORKSHOP',`${reg}<div class="pstock">${stock}</div>`,back],
    team:['TEAM',`<section class="gdrivers">${drivers}</section><h4>STAFF</h4><ul class="gobj">${STAFF_ROLES.map(r=>{const x=league.staff[r.id];
      const k=x?x.skills:{mechanical:1,design:1,people:1,nerve:1};
      return `<li title="${r.effect(k).join('\n')}">${r.label} · ${x?`${x.name} ${skillPips(x)} · ${x.yearsLeft} season${x.yearsLeft>1?'s':''} left`:'vacant'}</li>`;}).join('')}</ul>${seesRivalStaff()?`<h4>RIVAL STAFF</h4><ul class="gobj">${TEAMS.filter(t=>!t.you).map(t=>`<li>${t.name}: ${STAFF_ROLES.map(r=>{const p=t.staff[r.id];return p?`<span title="${r.label}">${p.name} (${p.yearsLeft})</span>`:'—';}).join(' · ')}</li>`).join('')}</ul>`:''}`,back],
    hq:['HQ',[['ROOMS',r=>!r.group],['TEST FACILITIES',r=>r.group==='facility']].map(([h,f])=>`<h4>${h}</h4><div class="hq">${HQ_ROOMS.filter(f).map(r=>{const l=hqLevel(r.id),cost=HQ_COSTS[l];
      return `<div class="sp-slot" data-pop="hq-${r.id}"><span class="sp-tag">${r.label}</span><span class="pips">${'■'.repeat(l)}${'□'.repeat(3-l)}</span>
        <span>${r.levels[l]}${l<3?` <span class="dim">→ level ${l+1}: ${r.levels[l+1]}</span>`:''}</span>${l<3?(r.id==='front'&&!league.hqPath?['street','corp'].map(pth=>`<button data-hq="front" data-path="${pth}" ${me.cash<cost?'disabled':''} title="Level 1: ${r.levels[1]}">${pth==='street'?'STREET FRONT':'CORPORATE SUITE'} · ${cost.toFixed(2)}M</button>`).join(''):
          `<button data-hq="${r.id}" ${me.cash<cost?'disabled':''} title="Level ${l+1}: ${r.levels[l+1]}">${r.id==='front'?(league.hqPath==='street'?'STREET FRONT ':'CORPORATE SUITE '):''}LEVEL ${l+1} · ${cost.toFixed(2)}M</button>`):''}</div>`;}).join('')}</div>`).join(''),back],
  }[garageTab]||[];
  $('garage').innerHTML=`<div class="nt-top"><h3${view[3]?` title="${view[3]}"`:''}>${view[0]}</h3><span class="gbank">${fmtQT(me.cash)}</span></div>
    ${garageTab==='hub'?lastReg:''}${view[1]}<div class="gfoot"><span></span>${view[2]}</div>`;
  popIn($('garage'));bankPop($('garage'),'garage');
  plotAnimate($('garage'));
  $('garage').querySelectorAll('[data-event]').forEach(b=>b.addEventListener('click',()=>{answerEvent(+b.dataset.event);garageTab=league.fixer.call?'fixer':'hub';renderGarage();}));
  $('garage').querySelectorAll('[data-fixer]').forEach(b=>b.addEventListener('click',()=>{answerFixer(+b.dataset.fixer);garageTab='hub';renderGarage();updateHeader();}));
  $('garage').querySelectorAll('[data-fixer-pick]').forEach(b=>b.addEventListener('click',()=>{league.fixer.pick=+b.dataset.fixerPick;garageTab='fixertarget';renderGarage();}));
  $('garage').querySelectorAll('[data-attack]').forEach(b=>b.addEventListener('click',()=>{answerFixer(league.fixer.pick,me,b.dataset.attack);garageTab='hub';renderGarage();updateHeader();}));
  $('fixerPass')&&$('fixerPass').addEventListener('click',()=>{answerFixer(null);garageTab='hub';renderGarage();});
  $('garage').querySelectorAll('[data-hq]').forEach(b=>b.addEventListener('click',()=>{upgradeRoom(b.dataset.hq,b.dataset.path);renderGarage();updateHeader();}));
  $('garage').querySelectorAll('[data-gtab]').forEach(b=>b.addEventListener('click',()=>{garageTab=b.dataset.gtab;renderGarage();}));
  $('garage').querySelectorAll('[data-raise]').forEach(b=>b.addEventListener('click',()=>{
    answerRaise(mine[+b.dataset.raise],b.dataset.choice);renderGarage();}));
  $('garage').querySelectorAll('[data-rebuild]').forEach(b=>b.addEventListener('click',()=>{
    rebuildPart(me,mine[+b.dataset.car],b.dataset.rebuild);renderGarage();updateHeader();}));
  $('garage').querySelectorAll('[data-studio]').forEach(b=>b.addEventListener('click',()=>{startStudio(me,b.dataset.studio);renderGarage();}));
  $('garage').querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>{addPartCopy(b.dataset.copy);renderGarage();}));
  $('garage').querySelectorAll('[data-fit]').forEach(b=>b.addEventListener('click',()=>{fitPart(mine[+b.dataset.car],+b.dataset.fit);renderGarage();}));
  $('garage').querySelectorAll('[data-newpart]').forEach(b=>b.addEventListener('click',()=>{buildPart=b.dataset.newpart;garageTab='build';renderGarage();}));
  $('garage').querySelectorAll('[data-build]').forEach(b=>b.addEventListener('click',()=>{
    developPart(me,buildPart,buildOffer(me,buildPart)[+b.dataset.build]);buildPart=null;garageTab='workshop';renderGarage();updateHeader();}));
  $('nextRace')&&$('nextRace').addEventListener('click',nextRace);
}
