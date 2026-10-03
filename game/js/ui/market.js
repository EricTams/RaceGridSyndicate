// The driver market screen: fill every open seat before the season (renew, or pick 1 of 3 candidates).
'use strict';

let marketThen=null;
function openMarket(then){
  marketThen=then;
  if(!openSeats().length){league.market=null;then();return;}
  renderMarket();$('marketOv').hidden=false;
}
const drvTip=d=>STATS.map(([id,ab])=>`${ab} ${d.stats[id]}`).join(' · ')+(d.abilities.length?'\n'+d.abilities.map(a=>`${ABILITIES[a].label}: ${ABILITIES[a].desc}`).join('\n'):'\nNo abilities');
function renderMarket(){
  const m=league.market,me=TEAMS[0];
  const seats=m.seats.map(s=>{
    const d=me.drvs[s.k],head=`<span class="sp-tag">CAR ${s.k+1}</span>`;
    if(s.done)return `<div class="sp-slot" data-pop="mk-${s.k}">${head}<b title="${drvTip(d)}">${d.name}</b> <span>age ${d.age} · ${d.salary.toFixed(2)}M a season · ${d.yearsLeft} season${d.yearsLeft>1?'s':''}</span></div>`;
    const why=d.retiring?'Retiring':d.wontExtend?'Won\'t extend: raise refused':d.morale<25?'Won\'t extend: morale too low':'';
    const renew=s.renew?`<button class="tcard need" data-renew="${s.k}" title="${drvTip(d)}"><b>RE-SIGN ${d.name} ${trajectory(d)}</b>age ${d.age} · ${s.renew.salary.toFixed(2)}M · ${s.renew.years} seasons</button>`
      :`<button class="tcard" disabled title="${why}"><b>${d.name} LEAVES</b></button>`;
    return `<div class="sp-slot open">${head}<div class="offer">${renew}${s.offers.map((c,i)=>`
      <button class="tcard need" data-sign="${s.k}" data-i="${i}" title="${drvTip(c)}"><b>${c.name} · ${Math.round(driverRating(c))} ${trajectory(c)}</b>age ${c.age} · ${c.salary.toFixed(2)}M · ${c.years} season${c.years>1?'s':''}<br>${c.abilities.map(a=>ABILITIES[a].label).join(', ')||'—'}</button>`).join('')}</div></div>`;
  }).join('');
  $('market').innerHTML=`
    <h3 title="Rating: pace counts double, plus racecraft and composure. Drivers under 24 improve, 34+ decline; a 2-star fixer shows how each will develop (▲▲ fast, ▲ steady, ▼ fading, ▼▼ declining). Hover a driver for stats and abilities. A signing's first season is paid now. Contracts can't be broken.">DRIVER MARKET · SEASON ${league.season}</h3>
    <div class="sp-list mk">${seats}</div>
    <div class="gfoot"><span>${fmtQT(me.cash)}</span>
      <button id="mkDone" ${openSeats().length?'disabled title="Fill every seat"':''}>CONTINUE</button></div>`;
  const M=$('market');popIn(M);
  M.querySelectorAll('[data-renew]').forEach(b=>b.addEventListener('click',()=>{renewDriver(m.seats.find(s=>s.k===+b.dataset.renew));renderMarket();}));
  M.querySelectorAll('[data-sign]').forEach(b=>b.addEventListener('click',()=>{const s=m.seats.find(s=>s.k===+b.dataset.sign);signDriver(s,s.offers[+b.dataset.i]);renderMarket();}));
  $('mkDone').addEventListener('click',()=>{$('marketOv').hidden=true;league.market=null;buildDriverCards();updatePanels();const f=marketThen;marketThen=null;f&&f();});
}
