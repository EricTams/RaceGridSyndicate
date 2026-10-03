// Scouting: what you know about rival cars. Your fixer's PEOPLE sets how sharp the read is: each rival part is
// known to within ±scoutW(). The read's error is fixed per part for a season (new cars, new error), so hiring a
// sharper fixer narrows the range around the truth rather than reshuffling it. ui/fieldplot.js draws it.
'use strict';

const SCOUT_W=[10,10,7,5,3,1.5];   // half-width of the read by fixer PEOPLE (index 0 = no fixer)
const scoutW=()=>SCOUT_W[league.staff.fixer?mySkill('fixer','people'):0];
league.scoutErr={};
// Where the read sits inside its range, −0.8..0.8 of the half-width (so the range always holds the true level).
const scoutU=(t,id)=>{const k=`${t.id}:${id}:${league.season}`;return league.scoutErr[k]??(league.scoutErr[k]=rand(-0.8,0.8));};
const partRead=(t,id)=>t.you?t.parts[id].level:t.parts[id].level+scoutU(t,id)*scoutW();
const carLevel=t=>PARTS.reduce((a,p)=>a+t.parts[p.id].level,0)/PARTS.length;
const carRead=t=>PARTS.reduce((a,p)=>a+partRead(t,p.id),0)/PARTS.length;
// The field median as your fixer reads it (the workshop's regulation-risk tag uses it).
const fieldMedianRead=id=>{const v=TEAMS.map(t=>partRead(t,id)).sort((a,b)=>a-b);return (v[4]+v[5])/2;};

// A read at any precision (the fixer-hiring list previews a candidate's): w is the half-width.
const partReadW=(t,id,w)=>t.you?t.parts[id].level:t.parts[id].level+scoutU(t,id)*w;
const carReadW=(t,w)=>PARTS.reduce((a,p)=>a+partReadW(t,p.id,w),0)/PARTS.length;
