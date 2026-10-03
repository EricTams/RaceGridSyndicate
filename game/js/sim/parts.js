// Your parts as items: every part you build is one physical piece with its own level and condition, fitted to
// one car or kept as a spare. While a piece is on a car, its condition lives in c.cond (that's what races wear);
// it's written back to the piece when it comes off. AI teams keep one shared level per part type.
'use strict';

let partUid=0;
TEAMS[0].inv=[];
PARTS.forEach(p=>mine.forEach(c=>{
  const it={uid:++partUid,id:p.id,level:TEAMS[0].parts[p.id].level,cond:100};
  TEAMS[0].inv.push(it);(c.fit||(c.fit={}))[p.id]=it.uid;
}));

const partItem=uid=>TEAMS[0].inv.find(x=>x.uid===uid);
const fittedItem=(c,id)=>c.fit&&partItem(c.fit[id]);
const fittedTo=it=>mine.find(c=>c.fit[it.id]===it.uid)||null;
const itemCond=it=>{const c=fittedTo(it);return c?c.cond[it.id]:it.cond;};
// The level a car actually runs: its fitted piece for your cars, the team level for AI cars.
const carPartLevel=(c,id)=>{const it=c.you&&fittedItem(c,id);return (it?it.level:c.team.parts[id].level)+(c.team.fixer?loanLevels(c,id):0);};   // plus a test part on loan
// Your team level for a part type (development cost, regulations, the field median) is your best piece.
function syncBest(id){const t=TEAMS[0],v=t.inv.filter(x=>x.id===id).map(x=>x.level);if(v.length)t.parts[id].level=Math.max(...v);}

// Fit a piece to a car. If the other car was running it, the two cars swap pieces.
function fitPart(c,uid){
  const it=partItem(uid),id=it.id,cur=fittedItem(c,id);if(cur===it)return;
  sfx('clank');
  cur.cond=c.cond[id];
  const other=fittedTo(it);
  if(other){it.cond=other.cond[id];other.fit[id]=cur.uid;other.cond[id]=cur.cond;}
  c.fit[id]=uid;c.cond[id]=it.cond;uiPop='fit-'+uid;
}
function addPartItem(id,level){const it={uid:++partUid,id,level,cond:100};TEAMS[0].inv.push(it);syncBest(id);return it;}
// Level changes that hit every piece of a type (events, regulations, tier changes) go through here.
function shiftPartLevels(t,id,f){
  if(t.you){t.inv.filter(x=>x.id===id).forEach(x=>x.level=f(x.level));syncBest(id);}
  else t.parts[id].level=f(t.parts[id].level);
}
