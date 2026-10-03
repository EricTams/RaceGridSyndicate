// The Backer screen at the start of each season, and the career summary after season 10.
'use strict';

let backerThen=null;
function openBacker(then){
  backerThen=then;startBackerSeason();renderBacker();$('backerOv').hidden=false;
}
function renderBacker(){
  const b=league.backer,conf=league.confidence;
  const mood=conf>=70?'pleased':conf>=40?'watching closely':conf>=20?'losing patience (interfering)':'furious (ultimatum)';
  $('backer').innerHTML=`
    <h3>THE BACKER · SEASON ${league.season} OF ${CAREER_SEASONS}</h3>
    <p class="nt-sub" title="The Backer is ${mood}. Below 40 they start interfering. Profit over a season: +5, a loss: −5.">CONFIDENCE <b style="color:${conf>=40?'#5cff8a':conf>=20?'#ffb03a':'#ff3b3b'}">${Math.round(conf)}</b>${league.debt>0?` · OWED ${league.debt.toFixed(2)}M`:''} · TITLES ${league.titles} · below 40 the Backer starts interfering</p>
    <p class="gmoney" title="Met: confidence +15. Missed: −20.${league.season===1?' A lenient first season.':''}"><b>PRIMARY:</b> ${objText(b.primary)} → met: confidence +15, missed: −20</p>
    ${b.optional?`<p class="gmoney pop"><b>OPTIONAL:</b> ${objText(b.optional.objective)} → +${b.optional.cash.toFixed(2)}M QT, confidence +${b.optional.conf}.</p>`:
      `<h4 style="margin-top:8px">PICK ONE OPTIONAL OBJECTIVE</h4><div class="offer">${b.offers.map((o,i)=>`<button class="tcard need" data-opt="${i}">
        ${objText(o.objective)}<br>+${o.cash.toFixed(2)}M QT, confidence +${o.conf}</button>`).join('')}</div>`}
    <div class="gfoot"><span></span>
      <button id="bkDone" ${b.optional?'':'disabled title="Pick an optional objective"'}>TO THE NIGHT TUNE</button></div>`;
  $('backer').querySelectorAll('[data-opt]').forEach(el=>el.addEventListener('click',()=>{pickOptional(+el.dataset.opt);renderBacker();}));
  $('bkDone').addEventListener('click',()=>{$('backerOv').hidden=true;const f=backerThen;backerThen=null;f&&f();});
}
function showCareerEnd(){
  const [grade,why]=careerGrade();
  $('backer').innerHTML=`
    <h3>CAREER OVER · ${grade}</h3>
    <p class="gmoney">${why} ${CAREER_SEASONS} seasons with the Syndicate.</p>
    <ol class="gres">${league.history.map(h=>`<li>Season ${h.season}: P${h.pos} in the ${TIER_NAMES[h.tier].toLowerCase()}</li>`).join('')}</ol>
    <div class="gfoot"><span>Final bank ${fmtQT(TEAMS[0].cash)}${league.debt>0?`, debt ${league.debt.toFixed(2)}M QT`:''}</span>
      <button id="newCareer" title="Nothing carries over to a new career">START A NEW CAREER</button></div>`;
  $('newCareer').addEventListener('click',()=>location.reload());
  $('backerOv').hidden=false;
}
