// NEW CAR: this season's car before the design meeting, and where each part's level came from.
// DESIGN MEETING: 4 picks from the technical director's idea cards; the crew adds options.
'use strict';

let newCarThen=null,meetThen=null;
function openNewCar(then){newCarThen=then;renderNewCar();$('newcarOv').hidden=false;}
function renderNewCar(){
  const me=TEAMS[0],first=!me.newCar;
  const rows=PARTS.map(({id,label})=>{
    const n=me.newCar&&me.newCar[id],lv=me.parts[id].level;
    const from=n?`<span>base ${n.base}</span><span>${n.carry>=0?'+':'−'}${Math.abs(n.carry)} carried</span><span>${n.studio?`+${n.studio} studio`:''}</span>`:'<span></span><span></span><span></span>';
    return `<li><b>${label}</b>${from}<span class="lv">${lv}</span></li>`;
  }).join('');
  $('newcar').innerHTML=`
    <h3 title="Every season each team builds a new car: the tier's base level, plus ${Math.round(CARRY*100)}% of each part's lead over the field at the end of last season (the part hit by new regulations keeps none of its lead), plus whatever the Design Studio banked. Then the design meeting.">${first?'YOUR FIRST CAR':`NEW CAR · SEASON ${league.season}`}</h3>
    ${league.lastReg&&!first?`<p class="regwatch hit">${league.lastReg}</p>`:''}
    <div class="carstage"><div class="showcase" title="Season ${league.season}'s car"><small>SEASON ${league.season} CAR</small></div><ul class="ncrows">${rows}</ul></div>
    <div class="gfoot"><span></span><button id="ncDone">TO THE DESIGN MEETING</button></div>`;
  popIn($('newcar'));showcase($('newcar').querySelector('.showcase'));
  $('ncDone').addEventListener('click',()=>{$('newcarOv').hidden=true;const f=newCarThen;newCarThen=null;f&&f();});
}
function openMeeting(then){meetThen=then;startMeeting();renderMeeting();$('meetOv').hidden=false;}
function renderMeeting(){
  const me=TEAMS[0],m=league.meeting;
  if(!m.pace){renderPace();return;}
  const done=m.picks.length>=m.pace.picks;
  const levels=PARTS.map(({id,short})=>`<span>${short} ${me.parts[id].level}</span>`).join('');
  const help=MEETING_HELP.filter(([r,k])=>league.staff[r]&&skillOf(me,r,k)>=3).map(([r,k])=>`${skillOf(me,r,k)>=5?2:1} from your ${roleById(r).label.toLowerCase()} (${k.toUpperCase()} ${skillOf(me,r,k)})`);
  $('meet').innerHTML=`
    <h3 title="Your technical director pitches the ideas: DESIGN ${skillOf(me,'techdir','design')} sizes single-part gains, MECHANICAL ${skillOf(me,'techdir','mechanical')} spreads work over two parts. Your crew chief's DESIGN, pit boss's MECHANICAL and fixer's PEOPLE add options at 3 and 5.">DESIGN MEETING · ${done?'DONE':`PICK ${m.picks.length+1}/${m.pace.picks}`}</h3>
    <div class="carstage"><div class="showcase"><small>SEASON ${league.season} CAR</small></div><div>
    <p class="nt-sub mtlv">${levels}</p>
    ${done?`<ul class="gobj">${m.picks.map(c=>`<li>${cardText(c)}</li>`).join('')}</ul>`
      :`<div class="offer mtoffer">${m.offer.map((c,i)=>`<button class="tcard need" data-pick="${i}">${cardText(c)}</button>`).join('')}</div>
    <p class="nt-sub">${m.offer.length} ideas: 2 from your technical director${help.length?', '+help.join(', '):''}${hqLevel('studio')>=3?', 1 from the Design Studio':''}</p>`}</div></div>
    <div class="gfoot"><span></span><button id="mtDone" ${done?'':'disabled'}>CONTINUE</button></div>`;
  const M=$('meet');popIn(M);showcase(M.querySelector('.showcase'));
  M.querySelectorAll('[data-pick]').forEach(b=>b.addEventListener('click',()=>{pickCard(+b.dataset.pick);renderMeeting();showcaseFlash();}));
  $('mtDone').addEventListener('click',()=>{$('meetOv').hidden=true;const f=meetThen;meetThen=null;f&&f();});
}
// Before the picks: how hard to push.
function renderPace(){
  $('meet').innerHTML=`
    <h3>DESIGN MEETING</h3>
    <p class="nt-sub">Each pick changes the car's part levels. Parts below 100% condition are slower until rebuilt, and below 20% they can fail in a race.</p>
    <div class="carstage"><div class="showcase"><small>SEASON ${league.season} CAR</small></div>
    <div class="offer mtoffer">${MEETING_PACES.map((p,i)=>`<button class="tcard need" data-pace="${i}"><b>${p.label}</b>${p.picks} picks<br>Every part starts the season at ${p.cond}% condition</button>`).join('')}</div></div>`;
  const M=$('meet');popIn(M);showcase(M.querySelector('.showcase'));
  M.querySelectorAll('[data-pace]').forEach(b=>b.addEventListener('click',()=>{choosePace(+b.dataset.pace);renderMeeting();}));
}
