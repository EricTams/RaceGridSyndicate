// The opening driver draft: a new career starts with a shared pool of free-agent drivers. Every AI team in
// your tier fills one seat from it (its other seat keeps its own driver), picking in pecking-order order,
// and the Syndicate, ranked last, signs both its drivers from what's left.
'use strict';

// Veterans are past their prime: decent now, cheap, and fading from next season.
const DRAFT_POOL={star:2,mid:8,vet:2,rookie:3};
// How an AI manager rates a free agent: elites buy value, pros lean on rating, rookies chase fame.
const draftScore={
  elite:d=>driverRating(d)-4*d.salary,
  pro:d=>driverRating(d)-7*d.salary,
  rookie:d=>d.stats.fame,
};
function draftDriver(kind){
  const d=newDriver(myTier(),kind==='vet'?'mid':kind);
  if(kind==='vet')d.age=33+Math.floor(Math.random()*3);
  d.salary=kind==='rookie'?r2(Math.min(0.2,driverPrice(d))):kind==='vet'?r2(0.6*driverPrice(d)):driverPrice(d);
  d.years=kind==='rookie'?3:kind==='vet'?1:1+Math.floor(Math.random()*3);
  return d;
}
function startDraft(){
  const pool=[];
  Object.entries(DRAFT_POOL).forEach(([kind,n])=>{for(let k=0;k<n;k++){const d=draftDriver(kind);while(pool.some(x=>x.name===d.name))d.name=freshName();pool.push(d);}});
  const order=TEAMS.filter(t=>!t.you).sort((a,b)=>SEED_ORDER.indexOf(a.seed)-SEED_ORDER.indexOf(b.seed));
  const picks=[];
  order.forEach(t=>{
    const fits=pool.filter(d=>d.salary<=t.cash*0.6),from=fits.length?fits:pool.slice().sort((a,b)=>a.salary-b.salary).slice(0,1);
    const d=from.slice().sort((a,b)=>draftScore[t.mgr.business](b)-draftScore[t.mgr.business](a))[0];
    const s=contractFor(t,d.salary);pool.splice(pool.indexOf(d),1);t.cash-=s;
    seatDriver(t,1,d,s,d.years);picks.push({team:t,d});
  });
  league.draft={picks,pool:pool.sort((a,b)=>driverRating(b)-driverRating(a)),signed:[]};
}
// You sign into your first empty seat; the first season is paid on signing.
function draftSign(d){
  const dr=league.draft,k=dr.signed.length;if(k>=2)return;
  sfx('stamp');
  dr.pool.splice(dr.pool.indexOf(d),1);dr.signed.push(d);
  const s=contractFor(TEAMS[0],d.salary);TEAMS[0].cash-=s;seatDriver(TEAMS[0],k,d,s,d.years);uiPop='df-'+k;
  say(`${d.name} signs: ${d.salary.toFixed(2)}M QT a season for ${d.years} season${d.years>1?'s':''}.`,'you');
}
startDraft();
