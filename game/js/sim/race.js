// Race state, reset, standings, comms feed and effect triggers.
'use strict';

// mode: 'quali' during qualifying, 'race' otherwise. grid: starting order (cars) for the race.
const race={t:-3,over:false,resultShown:false,overAt:0,ready:false,mode:'race',grid:null};
const feedItems=[];
function say(text,cls=''){
  const lap=Math.min(LAPS,Math.max(1,Math.floor(Math.max(0,leader().d)/L)+1));
  // A repeat of the latest line just counts up (×3) instead of filling the panel.
  const top=feedItems[0];
  if(top&&top.text===text){top.n=(top.n||1)+1;top.lap=lap;top.at=performance.now();}
  else{feedItems.unshift({text,cls,lap,at:performance.now()});feedItems.length=Math.min(feedItems.length,40);}   // the comms panel scrolls
  sfxUnless(cls==='bad'?'radioBad':cls==='you'?'radioYou':'radio');   // a blip, unless the moment made its own sound
  $('feed').innerHTML=feedItems.map(f=>`<li class="${f.cls}" data-at="${f.at}"><span>L${f.lap}</span>${f.text}${f.n?` ×${f.n}`:''}</li>`).join('');
}
function resetRace(gridOrder){
  PARTS.forEach(p=>MEDIANS[p.id]=fieldMedian(p.id));
  race.mode='race';race.t=-3;race.over=false;race.resultShown=false;race.winner=null;race.winAt=0;$('result').hidden=true;race.ready=tuneDone;
  cars.forEach(c=>{c.spinSaved=false;c.armorLap=-1;c.sfxPos=0;c.sfxPosT=0;});
  $('restart').disabled=false;[4,6,10,15].forEach(n=>$('l'+n).disabled=false);
  // Grid comes from qualifying; RESTART reuses it. Before the first qualifying it's random.
  const grid=gridOrder||race.grid||cars.slice().sort(()=>Math.random()-0.5);race.grid=grid;
  cars.forEach(c=>{
    const k=grid.indexOf(c);
    Object.assign(c,{d:-3-Math.floor(k/2)*4.2,lat:k%2?-1.4:1.4,latT:0,v:0,dur:100,state:'race',finishT:0,passT:0,passSide:1,
      fireCd:rand(1,3),mines:(c.team.mines||1)+fixerMines(c.team),spin:0,spinA:0,flash:0,lastHitMsg:-9,lastPos:k+1,
      top:(31.5+(c.team.pace||0))*statMul(c.drv.stats.pace,0.0015)*(1+(c.team.mgr?TACTICS_PACE[c.team.mgr.tactics]:0)),
      grip:94*statMul(c.drv.stats.pace,0.001),acc:13.5,armor:c.team.armor||1,abOn:{},abSaid:{},
      fuel:100,tire:100,ammo:AMMO,huntT:0,armorWarn:null,warn:{},pit:null,boxReq:false,stops:0,pitFuel:c.you?c.pitFuel!==false:true,pitCompound:c.you?(c.pitCompound||'medium'):'medium',
      compound:c.you&&compoundsNow().includes(c.startCompound)?c.startCompound:isRain()?'wet':c.you?'medium':({attack:'soft',stretch:'hard'}[c.team.plan]||'medium'),
      orders:c.you&&c.orders?c.orders:{fuel:'std',tires:'std',guns:c.team.guns||'std'}});
    c.latT=c.lat;c.cond={...c.condStart};c.failed={};c.failedPart=null;c.wreckedBy=null;c.gridPos=k+1;c.moodNotes=[];
    c.body.uniforms.uColor.value.set(c.team.body);c.trim.uniforms.uColor.value.set(c.you&&mainColor()?mainColor():c.team.trim);
  });
  cars.forEach(c=>{c.lastPos=standings().indexOf(c)+1;});
  mines.forEach(m=>{m.active=false;m.m.visible=false;});
  smoke.forEach(s=>{s.life=0;s.m.visible=false;});
  feedItems.length=0;$('feed').innerHTML='';
  say('Race control: grid is set.');
  if(league.review)say(`Rules committee reviewing ${league.review.map(id=>id.toUpperCase()).join(' and ')} for next season.`,'bad');
  updateHeader();
}
function updateHeader(){
  const w=WEATHER[weatherId()];$('trackName').textContent=TRACK.name+(weatherId()==='clear'?'':` · ${w.label}`);
  $('trackName').title=`Track tags: ${TRACK.tags.join(', ')} (some driver abilities use them)\n${w.tip}`;
}
function standings(){
  if(race.mode==='quali')return cars.slice().sort((a,b)=>(a.qBest??1e9)-(b.qBest??1e9)||a.name.localeCompare(b.name));
  const key=c=>c.state==='done'?[0,c.finishT]:c.state==='wreck'?[2,-c.d]:[1,-c.d];
  return cars.slice().sort((a,b)=>{const x=key(a),y=key(b);return x[0]-y[0]||x[1]-y[1];});
}
const leader=()=>standings()[0];

function tracer(from,to,col){
  const tr=pick(tracers,t=>t.life<=0),a=tr.l.geometry.attributes.position.array;
  a[0]=from.x;a[1]=from.y;a[2]=from.z;a[3]=to.x;a[4]=to.y;a[5]=to.z;
  tr.l.geometry.attributes.position.needsUpdate=true;tr.l.material.color.set(col);tr.life=0.09;tr.l.visible=true;
}
function spark(p,big=false){
  const n=big?6:2;
  for(let k=0;k<n;k++){const s=pick(sparks,s=>s.life<=0);s.life=big?0.35:0.12;s.m.visible=true;
    s.m.position.set(p.x+rand(-1,1)*(big?1.5:0.5),p.y+rand(0,1),p.z+rand(-1,1)*(big?1.5:0.5));s.m.scale.setScalar(big?1.6:1);}
}
