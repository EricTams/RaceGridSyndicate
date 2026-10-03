// THE FIELD: before the season's bets (sponsors, the Backer), the teams you'll race this season: how each one
// finished the last two seasons (public knowledge) and your fixer's read on its car (see scouting.js).
// fieldList() is shared with the garage standings.
'use strict';

let fieldThen=null;
function openField(then){fieldThen=then;renderField();$('fieldOv').hidden=false;}
const TIER_SHORT=['GUTTER','SPRAWL','CORPORATE'];
// "P3 · 142 pts", with the tier when it wasn't yours ("P1 · 188 pts SPRAWL"); new teams have no record.
function pastText(t,k){
  const r=pastResult(t,k);if(!r)return t.you&&!league.history.length?'new team':'—';
  return `P${r.pos} · ${r.pts} pts${r.tier!==myTier()?' '+TIER_SHORT[r.tier]:''}`;
}
// withPts: the season standings (position and points); otherwise the pre-season field.
function fieldList(teams,withPts){
  const me=TEAMS[0],nerve=t=>t===me?readText({lo:fixerNerve(me),hi:fixerNerve(me)}):readText(nerveRead(me,t));
  const head=`<li class="head">${withPts?'<span></span>':''}<span>TEAM</span>${withPts?'<span>PTS</span>':''}<span>LAST SEASON</span>${withPts?'':'<span>2 SEASONS AGO</span>'}<span title="Each team's fixer NERVE, as your fixer reads it (PEOPLE sharpens the read)">FIXER NERVE</span></li>`;
  return `<ul class="stlist fdlist${withPts?' pts':''}">${head}${teams.map((t,i)=>`<li class="${t.you?'you':''}">${withPts?`<span>${i+1}.</span>`:''}<b>${t.name}</b>${withPts?`<span>${seasonStat(t).points}</span>`:''}
    <span>${pastText(t,0)}</span>${withPts?'':`<span>${pastText(t,1)}</span>`}<span>${nerve(t)}</span></li>`).join('')}</ul>`;
}
function renderField(){
  // Last season's order (teams from the tier above first, then yours, then from below); the Syndicate if new, last.
  const key=t=>{const r=pastResult(t,0);return r?(r.tier>myTier()?-100:r.tier<myTier()?100:0)+r.pos:1000;};
  const teams=TEAMS.slice().sort((a,b)=>key(a)-key(b));
  $('field').innerHTML=`
    <h3>THE FIELD · ${TIER_NAMES[myTier()]} · SEASON ${league.season}</h3>
    ${fieldList(teams,false)}
    ${plotWidget('field')}
    <div class="gfoot"><span></span><button id="fdDone">CONTINUE</button></div>`;
  plotAnimate($('field'));
  $('fdDone').addEventListener('click',()=>{$('fieldOv').hidden=true;const f=fieldThen;fieldThen=null;f&&f();});
}
