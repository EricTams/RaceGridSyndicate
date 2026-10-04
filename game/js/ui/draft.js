// The opening driver draft, crew-style. DRIVERS: your two seats, and SIGN on the empty ones. SIGN opens the list:
// every driver in your tier (your rivals' included, with what they signed for) plus the free agents left after the
// rivals' picks, best first, with a filter for who's available. Signing (or BACK) returns to DRIVERS.
'use strict';

let draftThen=null,draftList=false,draftFreeOnly=true;   // the list opens on who you can sign
let draftSort={key:'rating',dir:-1};   // click a column header to sort (see sortHead in staff.js)
// Growth sorts by the arrows your fixer shows, never the hidden talent behind them.
const DRAFT_SORT={name:d=>d.name,rating:d=>driverRating(d),growth:d=>({'▲▲':2,'▲':1,'':0,'▼':-1,'▼▼':-2})[trajectory(d)],pace:d=>d.stats.pace,age:d=>d.age,salary:d=>d.salary};   // (list prices: your fixer's bargain comes off every one alike)
function openDraft(then){
  draftThen=then;
  if(!league.draft||league.draft.signed.length>=2){then();return;}
  draftList=false;renderDraft();$('draftOv').hidden=false;
}
function renderDraft(){
  const dr=league.draft,me=TEAMS[0],full=dr.signed.length>=2;
  if(draftList&&!full){renderDraftList();return;}
  const seats=[0,1].map(k=>{const d=dr.signed[k];return `<div class="sp-slot" data-pop="df-${k}"><span class="sp-tag">CAR ${k+1}</span><span class="who">${d
    ?`<b title="${drvTip(d)}">${d.name}</b> <span>${Math.round(driverRating(d))} ${trajectory(d)} · age ${d.age} · ${d.salary.toFixed(2)}M · ${d.years} season${d.years>1?'s':''}</span>`
    :`<button class="need" data-seat="${k}">SIGN</button>`}</span></div>`;}).join('');
  $('draft').innerHTML=`
    <h3 title="Every rival team has filled one seat from the free agents, best-ranked team first. The Syndicate is ranked last, so you sign both drivers from what's left. A signing's first season is paid now. Contracts can't be broken.">DRIVERS</h3>
    <div class="sp-list crew">${seats}</div>
    <div class="gfoot"><span>${fmtQT(me.cash)}</span>
      <button id="dfDone" ${full?'':'disabled title="Sign two drivers"'}>CONTINUE</button></div>`;
  const D=$('draft');popIn(D);
  D.querySelectorAll('[data-seat]').forEach(b=>b.addEventListener('click',()=>{draftList=true;renderDraft();}));
  $('dfDone').addEventListener('click',()=>{$('draftOv').hidden=true;buildDriverCards();updatePanels();const f=draftThen;draftThen=null;f&&f();});
}
// The list: rating counts pace double, plus racecraft and composure; a 2-skill Fixer (PEOPLE) shows growth.
function renderDraftList(){
  const dr=league.draft,me=TEAMS[0];
  const taken=draftFreeOnly?[]:TEAMS.filter(t=>!t.you).flatMap(t=>t.drvs.map(d=>({d,t})));
  const all=[...taken,...dr.pool.map(d=>({d,t:null}))].sort((a,b)=>!!a.t-!!b.t||cmpBy(draftSort,DRAFT_SORT[draftSort.key])(a.d,b.d)||driverRating(b.d)-driverRating(a.d));
  const row=({d,t})=>`<li class="${t?'taken':''}" title="${drvTip(d)}"><b>${d.name}</b><span class="fit">${Math.round(driverRating(d))}</span><span>${trajectory(d)||'&nbsp;'}</span>
    <span>PAC ${d.stats.pace}</span><span>age ${d.age}</span><span class="abil">${d.abilities.map(a=>ABILITIES[a].label).join(', ')||'—'}</span>
    <span class="sal">${(t?d.salary:contractFor(me,d.salary)).toFixed(2)}M${t?'':` · ${d.years}y`}</span>${t?`<span class="stat">${t.id}</span>`
      :contractFor(me,d.salary)>me.cash?`<button disabled title="Not enough money">NO MONEY</button>`:`<button class="need" data-sign="${dr.pool.indexOf(d)}">SIGN</button>`}</li>`;
  $('draft').innerHTML=`
    <h3 title="Rating: pace counts double, plus racecraft and composure. Hover a driver for stats and abilities. A Fixer with PEOPLE 2+ shows how each will develop (▲▲ fast, ▲ steady, ▼ fading).">DRIVERS · SIGN FOR CAR ${dr.signed.length+1}</h3>
    <div class="stsort"><button data-filter="0" aria-pressed="${!draftFreeOnly}">EVERYONE</button><button data-filter="1" aria-pressed="${draftFreeOnly}">AVAILABLE</button></div>
    <ul class="stlist dflist"><li class="head">${sortHead(draftSort,'name','NAME')}${sortHead(draftSort,'rating','RATING','Pace counts double, plus racecraft and composure')}${scoutStars()<2?'<span class="dim" title="A Fixer with PEOPLE 2+ shows how each driver will develop">?</span>':sortHead(draftSort,'growth','GROWTH','▲▲ fast, ▲ steady, ▼ fading')}${sortHead(draftSort,'pace','PACE')}${sortHead(draftSort,'age','AGE')}<span>ABILITIES</span>${sortHead(draftSort,'salary','SALARY','A season; the contract runs the years shown')}<span title="Drivers already signed show their team">${draftFreeOnly?'':'AT'}</span></li>${all.map(row).join('')}</ul>
    <div class="gfoot"><span>${fmtQT(me.cash)}</span><button data-back="1">BACK</button></div>`;
  const D=$('draft');popIn(D);
  D.querySelectorAll('[data-sign]').forEach(b=>b.addEventListener('click',()=>{draftSign(dr.pool[+b.dataset.sign]);draftList=false;renderDraft();}));
  D.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{draftFreeOnly=b.dataset.filter==='1';renderDraft();}));
  D.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{sortBy(draftSort,b.dataset.sort);renderDraft();}));
  D.querySelector('[data-back]').addEventListener('click',()=>{draftList=false;renderDraft();});
}
