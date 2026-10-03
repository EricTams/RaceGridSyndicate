// The sponsor screens, one per sponsor: the season sponsor at a season start ('season'), and the short-term
// sponsor just before the Night Tune whenever its slot is free ('race').
'use strict';

let sponsorThen=null,sponsorTerm='season';
function openSponsors(then,term='season'){
  sponsorThen=then;sponsorTerm=term;
  if(!openSlots(term).length){then();return;}
  openSlots(term).forEach(s=>{if(!TEAMS[0].offers[s.id])TEAMS[0].offers[s.id]=makeOffers(s);});
  renderSponsors();$('sponsorOv').hidden=false;
}
// The fee over the whole deal: per race × the races it runs (a season deal runs the races left this season).
const feeText=o=>{const n=o.term==='race'?o.races:racesThisSeason()-league.race+1;
  return `Fee +${o.perRace.toFixed(2)}M a race × ${n} race${n>1?'s':''} = ${(o.perRace*n).toFixed(2)}M`;};
function renderSponsors(){
  const me=TEAMS[0];
  const season=sponsorTerm==='season',rows=SPONSOR_SLOTS.filter(s=>s.term===sponsorTerm).map(slot=>{
    const d=me.sponsors[slot.id];
    if(d)return `<div class="sp-slot" data-pop="sp-${slot.id}"><span class="sp-tag">${slot.label}</span><b style="color:${d.color}">${d.brand}</b>
      <span>+${d.perRace.toFixed(2)} a race · ${dealText(d)} · ${dealLength(d)}${d.term==='race'?' left':''}</span></div>`;
    if(me.skipped[slot.id])return `<div class="sp-slot"><span class="sp-tag">${slot.label}</span><span>Left empty ${slot.term==='season'?'this season':'for the next race'}.</span></div>`;
    return `<div class="sp-slot open"><span class="sp-tag">${slot.label}</span><div class="offer">${me.offers[slot.id].map((o,i)=>`
      <button class="tcard need" data-sign="${slot.id}" data-i="${i}" title="${o.type==='street'?'Street':'Corporate'} brand: priced from your ${o.type==='street'?'Street Cred':'Corporate Standing'}"><b style="color:${o.color}">${o.brand}</b>
      ${feeText(o)}<br>${dealText(o)}</button>`).join('')}
      <button data-skip="${slot.id}">LEAVE EMPTY</button></div></div>`;
  }).join('');
  const perRace=sponsorPerRace();
  $('sponsors').innerHTML=`
    <h3>${season?`SEASON SPONSOR · SEASON ${league.season}`:`SHORT-TERM SPONSOR · RACE ${league.race}`}</h3>
    <p class="nt-sub" title="Each deal pays a fee every race plus a bonus if you hit its target. Street brands price from your Street Cred, corporate brands from your Corporate Standing. Deals can't be broken.${season?' Your season sponsor\'s color goes on your cars.':''}">Street Cred ${me.street} · Corporate Standing ${me.corp} (brands price their offers from these) · ${season?'Team standings count at the end of the season.':'Either car counts; a car that doesn\'t finish (DNF) doesn\'t.'}</p>
    <div class="sp-list">${rows}</div>
    <div class="gfoot"><span>Signed: +${perRace.toFixed(2)}M QT a race</span>
      <button id="spDone" ${openSlots(sponsorTerm).length?'disabled title="Sign or leave it empty"':''}>${season?'CONTINUE':'TO THE NIGHT TUNE'}</button></div>`;
  const S=$('sponsors');popIn(S);
  S.querySelectorAll('[data-sign]').forEach(b=>b.addEventListener('click',()=>{
    signSponsor(b.dataset.sign,me.offers[b.dataset.sign][+b.dataset.i]);applyLivery();renderSponsors();updateHeader();}));
  S.querySelectorAll('[data-skip]').forEach(b=>b.addEventListener('click',()=>{me.skipped[b.dataset.skip]=true;delete me.offers[b.dataset.skip];renderSponsors();}));
  const done=$('spDone');done.addEventListener('click',()=>{$('sponsorOv').hidden=true;const f=sponsorThen;sponsorThen=null;f&&f();});
}
// Your Main sponsor's color becomes your cars' trim.
function applyLivery(){mine.forEach(c=>c.trim.uniforms.uColor.value.set(mainColor()||c.team.trim));}
