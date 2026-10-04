// The three tiers: the tiers you're not in are simulated at season end, then 2 teams go up and 2 go down
// between each pair of tiers. Your tier's standings come from the races you actually ran.
'use strict';

// A quick season for a tier you're not racing in: each race ranks both cars of every team by
// part level, driver pace and the manager's tactics, with noise. Each team's points land in t.simPts.
function simSeason(teams,tier){
  const pts=new Map(teams.map(t=>[t,0]));
  const rating=(t,d)=>PARTS.reduce((a,p)=>a+t.parts[p.id].level,0)/PARTS.length+0.25*d.stats.pace+(t.mgr?TACTICS_PACE[t.mgr.tactics]*200:0);
  for(let r=0;r<TIER_RACES[tier];r++){
    const field=teams.flatMap(t=>t.drvs.map(d=>({t,s:rating(t,d)+gauss()*4}))).sort((a,b)=>b.s-a.s);
    field.slice(0,POINTS.length).forEach((e,k)=>pts.set(e.t,pts.get(e.t)+POINTS[k]));
  }
  teams.forEach(t=>t.simPts=pts.get(t));
  return teams.slice().sort((a,b)=>pts.get(b)-pts.get(a));
}
const simulateTierSeason=tier=>simSeason(ALL_TEAMS.filter(t=>t.tier===tier),tier);

// Past seasons, newest first: [{tiers:{0:[{id,pts}],1:[...],2:[...]}}]. A career starts with two made-up seasons
// raced by the teams as they stand (the Syndicate is new, so it isn't in them); each real season end is added.
league.past=null;
function pastSeasons(){
  if(!league.past)league.past=[0,1].map(()=>({tiers:Object.fromEntries([0,1,2].map(k=>
    [k,simSeason(ALL_TEAMS.filter(t=>t.tier===k&&!t.you),k).map(t=>({id:t.id,pts:t.simPts}))]))}));
  return league.past;
}
// Where a team finished k seasons ago: {pos, pts, tier}, or null if it wasn't racing.
function pastResult(t,k){
  const s=pastSeasons()[k];if(!s)return null;
  for(const tier of [0,1,2]){const i=s.tiers[tier].findIndex(r=>r.id===t.id);if(i>=0)return {pos:i+1,pts:s.tiers[tier][i].pts,tier};}
  return null;
}
// Teams you don't race against keep enough cash to run (their cars are rebuilt with everyone's at season end).
function evolveOffscreen(t){t.cash=Math.max(t.cash,rand(1,3)*TIER_MONEY[t.tier]);}

// Season end: promotion and relegation, then the field on track becomes your (possibly new) tier.
// AI teams have one reputation, which follows their standings like yours (see closeSponsorSeason).
ALL_TEAMS.forEach(t=>{if(!t.you)t.rep=clampRep(35+(t.pace||0)*15+SEEDS[t.seed].rep+rand(-5,5));});
// AI teams on track sign real sponsor deals, at the start of a career and whenever a slot opens at a season start.
// Teams off track have no deals (deals are priced for a tier); they re-sign when they're back in yours.
function aiSponsorsForSeason(){
  ALL_TEAMS.filter(t=>!t.you&&t.tier!==myTier()).forEach(t=>t.sponsors=null);
  TEAMS.filter(t=>!t.you).forEach(aiSignSponsors);
}
aiSponsorsForSeason();
function promoteAndRelegate(){
  const lines=[],me=TEAMS[0],from=me.tier;
  const order={};[0,1,2].forEach(k=>order[k]=k===from?teamStandings():simulateTierSeason(k));
  pastSeasons().unshift({tiers:Object.fromEntries([0,1,2].map(k=>[k,order[k].map(t=>({id:t.id,pts:k===from?seasonStat(t).points:t.simPts}))]))});
  [0,1,2].forEach(k=>order[k].forEach((t,i)=>{if(!t.you){t.rep=clampRep(0.6*t.rep+0.4*(100-i*10));t.lastPos=i+1;}}));
  const moves=new Map();
  [0,1].forEach(k=>{order[k].slice(0,2).forEach(t=>moves.set(t,k+1));order[k+1].slice(-2).forEach(t=>moves.set(t,k));});
  // A promoted team gets a league grant (the new tier's money) to help it catch up with cars built for a bigger pond.
  moves.forEach((to,t)=>{if(to>t.tier)t.cash+=TIER_MONEY[to];if(!t.you)t.rep=clampRep(t.rep+(to>t.tier?-15:10));t.tier=to;});
  ALL_TEAMS.filter(t=>!t.you&&t.tier!==me.tier).forEach(evolveOffscreen);
  [2,1,0].forEach(k=>{const champ=order[k][0];if(k!==from)lines.push(`${TIER_NAMES[k]} champions: ${champ.name}.`);});
  if(me.tier!==from){
    const up=me.tier>from;
    lines.push(up?`PROMOTED to the ${TIER_NAMES[me.tier]}! League grant +${TIER_MONEY[me.tier].toFixed(2)}M QT.`:`Relegated to the ${TIER_NAMES[me.tier]}.`);
    // A bigger pond: sponsors see you as smaller fish after promotion, and bigger after relegation.
    me.street=clampRep(me.street+(up?-15:10));me.corp=clampRep(me.corp+(up?-15:10));
    league.confidence=Math.max(0,Math.min(100,league.confidence+(up?15:-20)));
    lines.push(`Backer confidence ${up?'+15':'−20'}.`);
    league.maxTier=Math.max(league.maxTier,me.tier);
  }
  // AI teams on track pay their drivers and staff for the new season, as you do.
  ALL_TEAMS.filter(t=>!t.you&&t.tier===me.tier).forEach(t=>{t.cash-=t.drvs.reduce((a,d)=>a+d.salary,0)+staffSalaries(t);});
  // Refill the on-track field: you first, then the rest of your tier.
  const next=ALL_TEAMS.filter(t=>t.tier===me.tier&&!t.you);
  TEAMS.length=0;TEAMS.push(me,...next);
  buildField();
  return lines;
}
