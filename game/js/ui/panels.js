// Driver cards, timing tower and header.
'use strict';

function buildDriverCards(){
  mine.forEach((c,k)=>{
    $('drv'+k).innerHTML=`
      <div class="drv-head"><span class="tag">CAR ${k+1}</span><b class="nm" id="d${k}nm">${c.name}</b><span class="pos" id="d${k}pos">P-</span>
        <span class="hd" id="d${k}lap">-</span><span class="st" id="d${k}st"></span>
        <button class="watch" data-watch="${k}">WATCH</button>
        <span class="boxcell"><button data-car="${k}" data-box id="d${k}box" aria-pressed="false" class="box" title="Plan a pit stop and call the car in at the end of this lap. Click again to cancel.">BOX</button>
          <div class="pitpop" id="d${k}pop" hidden></div></span></div>
      <div class="qrow" id="d${k}q" hidden></div>
      <div class="rows">
        ${[['tire','tires',`TIRES <b id="d${k}cmp"></b>`,''],['fuel','fuel','FUEL',`<b id="d${k}fuelF" class="flag"></b>`],['ammo','guns','ROUNDS','']].map(([id,kind,lbl,extra])=>{const o=ORDERS[kind];
          return `<div class="rw rw-${id}"><span title="${o.tip}">${lbl}</span><div class="meter"><i id="d${k}${id}B"></i>${extra}</div><span id="d${k}${id}">-</span>
            <span class="lv pill" role="group" aria-label="${c.name} ${o.label.toLowerCase()} order">${Object.entries(o.opts).map(([val,v])=>
              `<button class="lvl ${v.col}" data-car="${k}" data-kind="${kind}" data-val="${val}" aria-pressed="${val==='std'}" title="${v.tip}" aria-label="${v.tip}"></button>`).join('')}</span></div>`;}).join('')}
        <div class="rw rw-arm"><span>ARMOR</span><div class="meter"><i id="d${k}armB"></i></div><span id="d${k}arm">-</span>
</div>
      </div>
      <div class="foot" id="d${k}foot"></div>`;
  });
  document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>{
    const c=mine[+b.dataset.car],kind=b.dataset.kind;c.orders[kind]=b.dataset.val;
    b.parentElement.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    say(`Radio to ${c.name}: ${ORDERS[kind].label.toLowerCase()} ${ORDERS[kind].opts[b.dataset.val].label}.`,'you');
  }));
  // BOX: cancels a called stop, otherwise opens the pit plan (pre-filled with the best compound).
  document.querySelectorAll('[data-box]').forEach(b=>b.addEventListener('click',()=>{
    const k=+b.dataset.car,c=mine[k];if(c.pit||c.state!=='race'||race.mode!=='race')return;
    if(c.boxReq){c.boxReq=false;sfx('boxCancel');say(`Radio to ${c.name}: stay out, cancel the stop.`,'you');syncPitButton(k);return;}
    const pop=$(`d${k}pop`);if(!pop.hidden){pop.hidden=true;return;}
    if(!compoundsNow().includes(c.pitCompound))c.pitCompound=bestCompound(c);
    renderPitPop(k);pop.hidden=false;
  }));
  document.querySelectorAll('[data-watch]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.watch==='0'?'c1':'c2')));
}
// Qualifying buttons live inside panels that are re-rendered, so one delegated listener handles them.
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-q]');if(!b)return;const c=mine[+b.dataset.car];
  if(b.dataset.q==='tune'){openTune(+b.dataset.car);return;}
  if(b.dataset.q==='out')qSend(c,b.dataset.cmp);else if(b.dataset.q==='abort')qAbort(c);else if(b.dataset.q==='again')c.qAgain=!c.qAgain;
  updatePanels();
});
// The pit plan: refuel or not, which tires, then call the car in.
function renderPitPop(k){
  const c=mine[k],pop=$(`d${k}pop`);
  pop.innerHTML=`<button data-pp="fuel" aria-pressed="${c.pitFuel!==false}" title="Refuel enough to finish on RICH">FUEL</button>
    <div class="cmp">${[...compoundsNow(),'none'].map(cm=>`<button data-pp="cmp" data-cmp="${cm}" aria-pressed="${c.pitCompound===cm}" title="${cm==='none'?'Keep the current tires':tireLifeLaps(c,cm).toFixed(1)+' laps on STD'}">${cm==='none'?'NO TIRES':COMPOUNDS[cm].label}</button>`).join('')}</div>
    <button data-pp="go" class="box">BOX THIS LAP</button>`;
  pop.querySelectorAll('[data-pp]').forEach(b=>b.addEventListener('click',()=>{
    const p=b.dataset.pp;
    if(p==='fuel')c.pitFuel=c.pitFuel===false;
    else if(p==='cmp')c.pitCompound=b.dataset.cmp;
    else{pop.hidden=true;if(c.pit||c.state!=='race')return;c.boxReq=true;sfx('box');say(`Radio to ${c.name}: box this lap.`,'you');syncPitButton(k);return;}
    renderPitPop(k);
  }));
}
function syncPitButton(k){
  const c=mine[k],b=$(`d${k}box`);if(!b)return;
  const on=race.mode==='race'&&(c.boxReq||!!c.pit);
  b.textContent=on&&c.pitCompound!=='none'&&COMPOUNDS[c.pitCompound]?`BOX · ${COMPOUNDS[c.pitCompound].short}`:'BOX';
  b.setAttribute('aria-pressed',String(on));
  // Pulse BOX when the car needs a stop: fuel won't reach the flag, or the tires are nearly gone.
  b.classList.toggle('need',race.mode==='race'&&c.state==='race'&&!on&&race.t>0&&(fuelAtFlag(c)<0||c.tire<25));
  if(!on&&race.mode!=='race'){const pop=$(`d${k}pop`);if(pop)pop.hidden=true;}
}
function gapText(c,lead,k){
  if(race.mode==='quali')return c.qMode==='flying'?'FLY':fmtLap(c.qBest);
  if(c.state==='wreck')return'DNF';
  if(c.pit)return'PIT';
  if(k===0)return c.state==='done'?'WINNER':'LEADER';
  if(c.state==='done'&&lead.state==='done')return'+'+(c.finishT-lead.finishT).toFixed(1);
  const diff=lead.d-c.d;return diff>L?`+${Math.floor(diff/L)} LAP`:`+${(diff/27).toFixed(1)}`;
}
function updatePanels(){
  // Radio lines fade off the map after a few seconds.
  const now=performance.now();$('feed').querySelectorAll('li').forEach(li=>li.classList.toggle('old',now-(+li.dataset.at||0)>7000));
  const order=standings(),lead=order[0];
  const avgGrade=c=>{const g=Object.values(c.tune.grades).map(x=>'SABCD'.indexOf(x));return 'SABCD'[Math.round(g.reduce((a,b)=>a+b,0)/g.length)];};
  const intel=c=>!c.you&&seesRivalGrades()&&c.tune&&c.tune.grades?` <small class="g-${avgGrade(c)}" title="Average tune grade">${avgGrade(c)}</small>`:'';
  // Position, colour, name and gap; the rest is on hover.
  const tip=c=>`${c.team.name} · ${COMPOUNDS[c.compound].label} tires · armor ${Math.round(c.dur)}%`+
    (!c.you&&seesRivalManagers()&&c.team.mgr?` · manager: ${c.team.mgr.business} business, ${c.team.mgr.tactics} tactics`:'');
  $('tower').innerHTML=order.map((c,k)=>`<li class="row${c.you?' you':''}" title="${tip(c)}"><span class="p">${k+1}</span>
    <i class="chip" style="background:${c.team.body}"></i><span class="n">${c.name}${intel(c)}</span>
    <span class="g">${gapText(c,lead,k)}</span></li>`).join('');
  mine.forEach((c,k)=>{
    const p=order.indexOf(c)+1;
    $(`d${k}pos`).textContent=c.state==='wreck'?'DNF':`P${p}`;
    // Everything that doesn't change during a race lives in the tooltip on the driver's name.
    const d=c.drv,tg=c.tune&&c.tune.locked?GAUGES.map(g=>`${g.short} ${c.tune.grades[g.id]}`).join(' '):'not locked';
    $(`d${k}nm`).title=`${STATS.map(([id,ab])=>`${ab} ${d.stats[id]}`).join(' · ')}\nAbilities: ${d.abilities.map(a=>ABILITIES[a].label).join(', ')||'none'}\nTune: ${tg}\nMorale ${Math.round(d.morale)} ${moodLabel(d.morale)}${d.wontExtend?", won't extend":''}`;
    const qr=$(`d${k}q`);qr.hidden=true;   // qualifying decisions happen on the Tune screen$('drv'+k).classList.toggle('quali',race.mode==='quali');
    if(race.mode==='quali'){
      const st={garage:'in the box',out:'out-lap',flying:`flying lap ${(race.t-c.qStart).toFixed(1)}s`,in:'in-lap'}[c.qMode];
      const t=c.tune,tuneBtn=!t.locked&&!readyToRun(c)?`<button data-q="tune" data-car="${k}">TUNE</button>`:
        !t.locked&&t.phase===LAST_PHASE?`<button data-q="tune" data-car="${k}">FINAL TUNE</button>`:'';
      const btns=c.qMode==='garage'?tuneBtn+(readyToRun(c)&&c.qSets>0&&race.t<QUALI_SECONDS?(isRain()?['wet','soft']:['soft','medium']).map(cm=>
          `<button data-q="out" data-car="${k}" data-cmp="${cm}">OUT ON ${COMPOUNDS[cm].label}</button>`).join(''):''):
        c.qMode==='in'?'':`<button data-q="abort" data-car="${k}">ABORT</button>`+
          (c.qMode==='flying'?`<button data-q="again" data-car="${k}" aria-pressed="${c.qAgain}">GO AGAIN</button>`:'');
      qr.innerHTML=`<span>${st} · ${c.qSets} set${c.qSets===1?'':'s'} left</span><span class="btns">${btns}</span>`;   // position and time are in the tower
    }
    $(`d${k}lap`).textContent=race.mode==='quali'?'QUALI':c.state==='done'?'FIN':`L${Math.min(LAPS,Math.max(1,Math.floor(Math.max(0,c.d)/L)+1))}/${LAPS}`;
    const meter=(id,val,max,col)=>{$(`d${k}${id}B`).style.width=val/max*100+'%';$(`d${k}${id}B`).style.background=col;};
    meter('arm',c.dur,100,durCol(c.dur));$(`d${k}arm`).textContent=Math.round(c.dur)+'%';
    meter('tire',c.tire,100,durCol(c.tire));
    const cm=COMPOUNDS[c.compound];$(`d${k}cmp`).textContent=cm.short;$(`d${k}cmp`).style.color=cm.col;syncPitButton(k);$(`d${k}tire`).textContent=Math.round(c.tire)+'%';
    const flag=fuelAtFlag(c);
    meter('fuel',c.fuel,100,durCol(c.fuel));
    $(`d${k}fuel`).textContent=Math.round(c.fuel)+'%';
    // Marker on the fuel bar: where the level will be at the flag on the current order.
    const fl=$(`d${k}fuelF`);fl.hidden=c.state!=='race';fl.style.left=Math.max(0,Math.min(100,flag))+'%';fl.classList.toggle('short',flag<0);
    meter('ammo',c.ammo,AMMO,c.ammo<=0?'#ff3b3b':'#2ef2ff');$(`d${k}ammo`).textContent=c.ammo;
    const stTxt=race.mode==='quali'?c.qMode==='garage'&&c.qGo!=null?`Out at ${qMin(c.qGo)} min`:{garage:'In the box',out:'Out-lap',flying:'Flying lap',in:'In-lap'}[c.qMode]:c.state==='wreck'?'Wrecked':c.state==='done'?'Cooling down':
      c.pit?(c.pit.phase==='stop'?`In the box ${Math.max(0,c.pit.t).toFixed(1)}s`:'Pit lane'):
      c.boxReq?'Boxing this lap':c.spin>0?'Spinning!':c.fuel<=0?'Out of fuel':c.dur<35?'Smoking':race.t<0?'On the grid':
      flag<0?`Fuel −${Math.round(-flag)}%`:`Fuel +${Math.round(flag)}%`;   // tank left at the flag on the current order
    const stEl=$(`d${k}st`);stEl.textContent=stTxt;stEl.title=race.mode==='race'&&c.state==='race'?'Fuel left at the flag on the current fuel order':'';stEl.classList.toggle('bad',c.state==='wreck'||(race.mode==='race'&&race.t>0&&c.state==='race'&&(flag<0||c.fuel<=0||c.dur<35)));
    const lit=d.abilities.filter(id=>c.abOn[id]);
    // Footer: only what needs attention now: worn parts (failure risk), mines carried, abilities firing.
    $(`d${k}foot`).innerHTML=PARTS.filter(pt=>c.cond[pt.id]<40).map(pt=>
      `<span class="ab warn" title="${pt.label} worn: failure risk rises below 40%">${pt.short} ${Math.round(c.cond[pt.id])}%</span>`).join('')+
      (c.mines>0?`<span title="Mines carried">MINES <b>${c.mines}</b></span>`:'')+
      lit.map(id=>`<span class="ab on" title="${ABILITIES[id].desc}">${ABILITIES[id].label}</span>`).join('');
    // A chime for a place gained (a low tick for two or more lost), judged every 2s so a back-and-forth battle doesn't chatter.
    if(race.mode==='race'&&race.t>0&&c.state==='race'&&race.t-(c.sfxPosT||0)>=2){
      if(!c.pit&&c.sfxPos&&p<c.sfxPos)sfx('posUp',{car:c});else if(!c.pit&&c.sfxPos&&p>=c.sfxPos+2)sfx('posDown',{car:c});
      c.sfxPos=p;c.sfxPosT=race.t;}
    if(race.mode==='race'&&race.t>0&&c.state==='race'&&p<c.lastPos&&p<=3)say(`${c.name} up to P${p}.`,'you');
    c.lastPos=p;
  });
  if(race.over&&!race.resultShown&&race.t-race.overAt>1.5&&(race.mode!=='race'||!race.winner||race.t-race.winAt>3.3)){   // (the chequered flag plays out first)
    race.resultShown=true;
    if(race.mode==='quali'){
      // Session over: finish any unlocked tunes (no more feedback laps), then the grid.
      ntStage='post';setPaused(false);
      const k=mine.findIndex(x=>!x.tune.locked);
      if(k<0)renderQualiResult();else openTune(k);
      return;
    }
    settleRace(order);
    $('restart').disabled=true;[4,6,10,15].forEach(n=>$('l'+n).disabled=true);
    openGarage();$('result').hidden=false;
  }
}
