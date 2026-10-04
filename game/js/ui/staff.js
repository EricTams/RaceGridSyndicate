// The crew screens. CREW: your four roles, who's in each, and HIRE on the open ones, in any order. A role's list:
// everyone working in your tier (people at your rivals included, so you can see who's spending) plus the free
// pool, sorted by fit for the role, with a filter for who's available. Hiring (or BACK) returns to CREW.
'use strict';

let staffThen=null,staffRole=null,staffFreeOnly=true;   // lists open on who you can hire
// Click a column header to sort by it, again to flip. Names sort A-Z and salaries cheapest first by default; the rest
// highest first. Whatever the column, people you can hire stay above those you can't.
let staffSort={key:'fit',dir:-1};
const sortHead=(state,key,label,tip='')=>`<button class="sorth" data-sort="${key}" ${state.key===key?`aria-sort="${state.dir<0?'descending':'ascending'}"`:''} ${tip?`title="${tip}"`:''}>${label}${state.key===key?(state.dir<0?' ▼':' ▲'):''}</button>`;
function sortBy(state,key){state.dir=state.key===key?-state.dir:(key==='name'||key==='salary'?1:-1);state.key=key;}
const cmpBy=(state,get)=>(a,b)=>{const x=get(a),y=get(b);return (typeof x==='string'?x.localeCompare(y):x-y)*state.dir;};
function openStaff(then){
  staffThen=then;
  if(!vacantRoles().length){then();return;}
  staffRole=null;
  renderStaff();$('staffOv').hidden=false;
}
// Skill readouts; hi = the skills that matter here (the rest are dimmed).
const skillPips=(p,hi=[])=>STAFF_SKILLS.map(([k,ab])=>`<span class="sk sk${p.skills[k]}${hi.length&&!hi.includes(k)?' off':''}" title="${k.toUpperCase()} ${p.skills[k]}">${ab} ${p.skills[k]}</span>`).join('');
const roleShort=id=>roleById(id).label.split(' ').map(w=>w[0]).join('');
// 0 = hireable, 1 = not (on a rival team, or more than you can pay): sorts who you can hire first.
const priceTo=p=>p.team?p.salary:contractFor(TEAMS[0],p.salary);   // a free agent's price to you (after your fixer's bargain)
const canHire=p=>p.team||priceTo(p)>TEAMS[0].cash?1:0;
const STAFF_SORT={name:p=>p.name,fit:p=>roleScore(p,staffRole),salary:p=>priceTo(p),...Object.fromEntries(STAFF_SKILLS.map(([k])=>[k,p=>p.skills[k]]))};
function renderStaff(){
  if(!staffRole){renderCrew();return;}
  const me=TEAMS[0],r=roleById(staffRole);
  const onTrack=new Set(TEAMS.filter(t=>!t.you).map(t=>t.id));
  const people=league.staffPool.filter(p=>p.team?onTrack.has(p.team)&&!staffFreeOnly:true)
    .sort((a,b)=>canHire(a)-canHire(b)||cmpBy(staffSort,STAFF_SORT[staffSort.key])(a,b)||roleScore(b,staffRole)-roleScore(a,staffRole)||a.salary-b.salary);
  const row=p=>{
    const t=p.team&&teamById(p.team),poor=priceTo(p)>me.cash;
    const act=t?`<span class="stat" title="${roleById(p.role).label} at ${t.name}, ${p.yearsLeft} season${p.yearsLeft>1?'s':''} left">${t.id} ${roleShort(p.role)}</span>`
      :poor?`<button disabled title="Not enough money">NO MONEY</button>`:`<button class="need" data-hire="${p.id}">HIRE</button>`;
    return `<li class="${t?'taken':''}" data-pid="${p.id}" title="${r.effect(p.skills).join('\n')}"><b>${p.name}</b><span class="fit">${roleScore(p,staffRole).toFixed(1)}</span>${skillPips(p,r.skills)}<span class="sal">${priceTo(p).toFixed(2)}M${t?'':` · ${p.years}y`}</span>${act}</li>`;
  };
  $('staff').innerHTML=`
    <h3 title="Everyone has four skills (1-5); this role uses the two that are lit. Hover anyone to see what they'd do here. A hire's first season is paid on signing; contracts can't be broken.">CREW · HIRE A ${r.label}</h3>
    <div class="stsort"><button data-filter="0" aria-pressed="${!staffFreeOnly}">EVERYONE</button><button data-filter="1" aria-pressed="${staffFreeOnly}">AVAILABLE</button></div>
    <ul class="stlist"><li class="head">${sortHead(staffSort,'name','NAME')}${sortHead(staffSort,'fit','FIT','The average of the two skills this role uses')}${STAFF_SKILLS.map(([k,ab])=>sortHead(staffSort,k,ab,k.toUpperCase()+' 1-5'+(r.skills.includes(k)?': '+r.what[r.skills.indexOf(k)]:''))).join('')}${sortHead(staffSort,'salary','SALARY','A season; the contract runs the years shown')}<span title="Rival staff: their team and role (CC crew chief, PB pit boss, TD technical director, F fixer)">${staffFreeOnly?'':'AT'}</span></li>${people.map(row).join('')}</ul>
    <div class="gfoot"><span>${fmtQT(me.cash)} · staff ${staffSalaries().toFixed(2)}M a season</span>
      <span class="btns"><button data-back="1">BACK</button><button data-vacant="1">LEAVE VACANT</button></span></div>`;
  const S=$('staff');popIn(S);
  S.querySelectorAll('[data-hire]').forEach(b=>b.addEventListener('click',()=>{hireStaff(staffRole,league.staffPool.find(p=>p.id===+b.dataset.hire));staffRole=null;renderStaff();}));
  S.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{staffFreeOnly=b.dataset.filter==='1';renderStaff();}));
  S.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{sortBy(staffSort,b.dataset.sort);renderStaff();}));
  S.querySelector('[data-vacant]').addEventListener('click',()=>{league.staffSkipped[staffRole]=true;staffRole=null;renderStaff();});
  S.querySelector('[data-back]').addEventListener('click',()=>{staffRole=null;renderStaff();});
}
// CREW: who you have in each role, and a way into each open one.
function renderCrew(){
  const me=TEAMS[0],open=vacantRoles().length;
  // The fixer's seat is settled first (hired or left vacant): they negotiate everyone else's contract.
  const fixerFirst=!league.staff.fixer&&!league.staffSkipped.fixer;
  const rows=STAFF_ROLES.map(r=>{
    const p=league.staff[r.id],uses=r.skills.map((k,i)=>`${k.toUpperCase()}: ${r.what[i]}`).join(' · ');
    const who=p?`<b>${p.name}</b> ${skillPips(p,r.skills)} <span>${p.salary.toFixed(2)}M · ${p.yearsLeft} season${p.yearsLeft>1?'s':''}</span>`
      :league.staffSkipped[r.id]?'<span>Vacant</span>':fixerFirst&&r.id!=='fixer'?`<button disabled title="Hire your fixer first: they negotiate everyone else's contract">HIRE</button>`
      :`<button class="need" data-role="${r.id}">HIRE</button>`;
    return `<div class="sp-slot${p?'':' open'}" data-pop="st-${r.id}" title="${p?r.effect(p.skills).join('\n'):uses}"><span class="sp-tag">${r.label}</span><span class="who">${who}</span></div>`;
  }).join('');
  $('staff').innerHTML=`
    <h3 title="Anyone can fill any role: each role uses two of the four skills. Your fixer comes first: their NERVE bargains down every contract after. A hire's first season is paid on signing; contracts can't be broken.">${league.season===1&&league.race===1?'BUILD YOUR CREW':`CREW · SEASON ${league.season}`}</h3>
    <div class="sp-list crew">${rows}</div>
    <div class="gfoot"><span>${fmtQT(me.cash)} · staff ${staffSalaries().toFixed(2)}M a season</span>
      <button id="stDone" ${open?'disabled title="Hire or leave vacant every open role"':''}>CONTINUE</button></div>`;
  const S=$('staff');popIn(S);
  S.querySelectorAll('[data-role]').forEach(b=>b.addEventListener('click',()=>{staffRole=b.dataset.role;renderStaff();}));
  $('stDone').addEventListener('click',()=>{$('staffOv').hidden=true;const f=staffThen;staffThen=null;f&&f();});
}
