// The field plot: one row per rival, a bar over the range your fixer reads for it (strongest at the top), and your
// car as a vertical line through the stack. Bars left of the line are behind you, bars crossing it too close to
// call, bars right of it ahead. Tabs pick the whole car or one part; your fixer sums it up underneath.
// A screen drops plotWidget(name) into its HTML and calls plotAnimate(root) after rendering: bars and lines
// slide from where they were last drawn, so every choice that moves them shows.
'use strict';

let plotView='car';   // 'car' or a part id, shared by every plot so the choice sticks between screens
const PLOT_CTX={},PLOT_LAST={};
const viewLabel=v=>v==='car'?'CAR':PARTS.find(p=>p.id===v).label;
// Your level for a view: the whole car (average part) or one part, per car.
function myLevel(v,c){
  const lv=id=>carPartLevel(c,id);
  return v==='car'?PARTS.reduce((a,p)=>a+lv(p.id),0)/PARTS.length:lv(v);
}
function plotInner(name){
  const ctx=PLOT_CTX[name],v=plotView,w=scoutW();
  const rivals=TEAMS.filter(t=>!t.you).map(t=>({t,m:v==='car'?carReadW(t,w):partReadW(t,v,w)})).sort((a,b)=>b.m-a.m);
  const lines=Math.round(myLevel(v,mine[0]))===Math.round(myLevel(v,mine[1]))
    ?[{label:'YOU',level:myLevel(v,mine[0])}]:mine.map((c,k)=>({label:`CAR ${k+1}`,level:myLevel(v,c)}));
  const all=[...rivals.flatMap(r=>[r.m-w,r.m+w]),...lines.map(l=>l.level)];
  const lo=Math.floor(Math.min(...all)-2),hi=Math.ceil(Math.max(...all)+2),x=v=>(v-lo)/(hi-lo)*100;
  const at=v=>`calc(var(--fp-name) + (100% - var(--fp-name)) * ${(x(v)/100).toFixed(4)})`;
  const rows=rivals.map(({t,m})=>`<div class="fp-row" title="${t.name}: ${Math.round(m-w)}–${Math.round(m+w)}"><span class="fp-name">${t.name}</span>
    <span class="fp-track"><i data-k="${t.id}" style="left:${x(m-w).toFixed(2)}%;width:${(2*w/(hi-lo)*100).toFixed(2)}%;background:${t.body}"></i></span></div>`).join('');
  const you=lines.map(l=>`<b class="fp-you" data-k="you-${l.label}" style="left:${at(l.level)}" title="${l.label} ${Math.round(l.level)}"><span>${l.label} ${Math.round(l.level)}</span></b>`).join('');
  const tabs=`<div class="grp fp-tabs">${['car',...PARTS.map(p=>p.id)].map(k=>`<button data-pv="${k}" aria-pressed="${k===v}">${viewLabel(k)}</button>`).join('')}</div>`;
  return `${tabs}<div class="fp-body">${rows}${you}</div><div class="fp-axis"><span>${lo}</span><span>${hi}</span></div>
    <p class="fp-quote">${fixerSays(ctx,rivals,w,lines[0].level)}</p>`;
}
function plotWidget(name){PLOT_CTX[name]={};return `<div class="fplot" data-plot="${name}">${plotInner(name)}</div>`;}
// Slide every keyed bar and line from where it was last drawn to where it is now.
function plotAnimate(root=document){
  root.querySelectorAll('.fplot[data-plot]').forEach(el=>{
    const name=el.dataset.plot,last=PLOT_LAST[name]||{},now={};
    el.querySelectorAll('[data-k]').forEach(n=>{const k=n.dataset.k,to=[n.style.left,n.style.width];now[k]=to;const from=last[k];
      if(!from||(from[0]===to[0]&&from[1]===to[1]))return;
      n.style.transition='none';n.style.left=from[0];n.style.width=from[1];
      requestAnimationFrame(()=>requestAnimationFrame(()=>{n.style.transition='';n.style.left=to[0];n.style.width=to[1];}));});
    PLOT_LAST[name]=now;
  });
}
// Redraw one plot (or every plot on screen) in place, animated.
function plotRefresh(name){
  document.querySelectorAll(name?`.fplot[data-plot="${name}"]`:'.fplot[data-plot]').forEach(el=>{el.innerHTML=plotInner(el.dataset.plot);plotAnimate(el.parentNode);});
}
document.addEventListener('click',e=>{const b=e.target.closest('.fplot [data-pv]');if(!b)return;plotView=b.dataset.pv;plotRefresh();});

// What your fixer makes of it. Plain talk, from the same numbers the plot shows.
function fixerSays(ctx,rivals,w,you){
  const f=league.staff.fixer;
  if(!f)return `Nobody's feeding us anything. Hire a fixer and we'd know who's quick.`;
  const what=plotView==='car'?'car':PARTS.find(p=>p.id===plotView).label.toLowerCase();
  const ahead=rivals.filter(r=>r.m-w>you).length,behind=rivals.filter(r=>r.m+w<you).length,unsure=rivals.length-ahead-behind;
  const top=rivals[0].t.name.replace(/\b\w+/g,s=>s[0]+s.slice(1).toLowerCase());
  const n=k=>k===1?'one crew':`${['no','one','two','three','four','five','six','seven','eight','nine'][k]} crews`;
  const where=ahead===rivals.length?`Every crew out there has a better ${what} than ours.`
    :behind===rivals.length?`Nobody's ${what} comes close to ours.`
    :(()=>{const bits=[ahead&&`${n(ahead)} ${ahead===1?'is':'are'} clearly ahead of us`,behind&&`${ahead?'':`${n(behind)} ${behind===1?'is':'are'} `}${ahead?n(behind)+' ':''}clearly behind`,
        unsure&&`${ahead||behind?n(unsure).split(' ')[0]:n(unsure)} I can't call`].filter(Boolean);
      const t=bits.length>1?bits.slice(0,-1).join(', ')+' and '+bits[bits.length-1]:bits[0];return t[0].toUpperCase()+t.slice(1)+'.';})();
  const p=f.skills.people,sure=p<=1?`That's barroom talk, mind.`:p===2?`My contacts are thin, so don't bet the house on it.`:p>=5?`I've got people in every garage on the grid.`:p===4?`My people in their garages don't miss much.`:'';
  return `<b>${f.name}:</b> "${top} ${plotView==='car'?'have the car to beat':`have the best ${what}`}. ${where}${sure?' '+sure:''}"`;
}
