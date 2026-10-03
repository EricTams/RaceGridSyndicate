// Track info, driver stats and abilities, your drivers, tire compounds and the 10 teams.
'use strict';

// Stats run 40-95 around a 70 baseline. Abilities are passive bonuses that switch on by track type,
// race situation or session; nothing is ever activated by the player.
const STATS=[['pace','PAC'],['racecraft','RCR'],['tires','TIR'],['fuel','FUE'],['gunnery','GUN'],['composure','CMP'],['feedback','FBK'],['fame','FAM']];
const ABILITIES={
  streetrat:{label:'STREET RAT',desc:'+12% grip in slow corners and the braking into them'},
  boulevard:{label:'BOULEVARD KING',desc:'+4% top speed on straights'},
  tunnel:{label:'TUNNEL VISION',desc:'No pace loss in the dark sector on a blackout night (everyone else loses 4%)'},
  raindancer:{label:'RAIN DANCER',desc:'+10% grip on acid-rain nights'},
  hunter:{label:'HUNTER',desc:'+2% pace and +10% hit chance once it has built pressure by sitting close behind other cars'},
  wall:{label:'WALL',desc:'Much harder to pass'},
  front:{label:'FRONT-RUNNER',desc:'+1.5% pace while in the top 3'},
  comeback:{label:'COMEBACK KID',desc:'+1% pace and better overtaking while outside the top 10'},
  cool:{label:'COOL UNDER FIRE',desc:'Takes 25% less damage from gunfire'},
  closer:{label:'CLOSER',desc:'+3% pace on the final lap'},
  rocket:{label:'ROCKET START',desc:'+8% pace and acceleration for the first 10 seconds'},
  pitwhisper:{label:'PIT WHISPERER',desc:'Pit stops take 30% less time'},
  tirewhisper:{label:'TIRE WHISPERER',desc:'35% less tire wear on PUSH'},
  miser:{label:'FUEL MISER',desc:'15% less fuel burn on LEAN, and LEAN costs half the pace'},
  deadeye:{label:'DEADEYE',desc:'Guns never jam; +5% hit chance'},
  nightowl:{label:'NIGHT OWL',desc:'30% clearer Night Tune feedback'},
  qualifier:{label:'QUALIFIER',desc:'+2% pace on qualifying flying laps'},
};
const has=(c,id)=>c.drv.abilities.includes(id);
const statMul=(v,per)=>1+(v-70)*per;
// Your team starts with two open seats: you sign both drivers in the opening draft (see sim/draft.js).
function rollDriver(team){
  const base=62+(team.tier||0)*6+(team.pace||0)*8,st={};   // better drivers in higher tiers
  STATS.forEach(([id])=>st[id]=Math.round(Math.max(40,Math.min(95,base+rand(-14,14)))));
  // 0 abilities is common, 3 is rare; stronger drivers skew toward more.
  const avg=STATS.reduce((a,[id])=>a+st[id],0)/STATS.length,roll=Math.random()+(avg-70)/60;
  const n=roll<0.3?0:roll<0.7?1:roll<0.93?2:3;
  const pool=Object.keys(ABILITIES).sort(()=>Math.random()-0.5);
  return {stats:st,abilities:pool.slice(0,n)};
}
const fmtQT=m=>`${m.toFixed(2)}M QT`;
// Tank range and tire life are fixed distances, so longer races need more stops.
// On STD a full tank lasts ~5.2 laps of this circuit and a set of tires ~6.7 laps.
const TANK_LAPS=5.2, TIRE_LAPS=6.7;   // TIRE_LAPS is for MEDIUM tires
// Tire compounds: softs grip but die fast, hards last. Pick a start compound in the Night Tune and a new one at each stop.
const COMPOUNDS={soft:{label:'SOFT',short:'S',grip:1.06,wear:1.8,col:'#ff3b3b'},
  medium:{label:'MEDIUM',short:'M',grip:1,wear:1,col:'#ffd23f'},hard:{label:'HARD',short:'H',grip:0.95,wear:0.6,col:'#f4ecff'},
  wet:{label:'WET',short:'W',grip:1,wear:1.1,col:'#39a8ff'}};   // for acid-rain nights (see cmpGrip)
const CMP_ORDER=['soft','medium','hard'];
// The pecking order at the start of a career: seed sets each team's starting parts, drivers, cash and manager
// (see SEEDS). It's fixed, the same every career; after that teams rise and fall through play.
const SEEDS={
  top:  {lvl:5, drv:0.5, cash:[3.7,4.7],rep:15, mgr:['pro','elite']},
  upper:{lvl:2, drv:0.2, cash:[3.2,4.2],rep:5,  mgr:MGR_TIERS},
  lower:{lvl:0, drv:0,   cash:[2.7,3.7],rep:0,  mgr:MGR_TIERS},
  back: {lvl:-2,drv:-0.3,cash:[2.2,3.2],rep:-5, mgr:['rookie']},
  you:  {lvl:-5},   // the Syndicate: the slowest car on the grid on day one
};
const SEED_ORDER=['top','upper','lower','back','you'];
// plan: attack = RICH/PUSH and extra stops, stretch = fewest stops, std = STD orders.
// guns/mines/pace/armor give each team a recognisable style on track. tier: 0 = Gutter Circuit,
// 1 = Sprawl League, 2 = Corporate Grand Circuit. Teams move between tiers (2 up, 2 down each season).
const ALL_TEAMS=[
  // ---- Gutter Circuit ----
  {tier:0,id:'SYN',seed:'you',name:'SYNDICATE',body:'#ff2e88',trim:'#2ef2ff',you:true,drivers:['OPEN SEAT','OPEN SEAT']},
  {tier:0,id:'RRT',seed:'back',name:'RUST RATS',body:'#c8743a',trim:'#2a1a10',plan:'stretch',guns:'free',drivers:['GRIT','SCAB']},
  {tier:0,id:'SWK',seed:'lower',name:'SEWER KINGS',body:'#7fa33a',trim:'#1b2410',plan:'std',mines:2,drivers:['MUCK','SLUDGE']},
  {tier:0,id:'GLG',seed:'top',name:'GLITCH GANG',body:'#8f6bff',trim:'#1a0a2a',plan:'attack',drivers:['BYTE','NULL']},
  {tier:0,id:'SCH',seed:'upper',name:'SCRAPHEAP',body:'#9a9a8a',trim:'#ff8a1f',plan:'std',armor:1.1,drivers:['BOLT','RIVET']},
  {tier:0,id:'BLK',seed:'top',name:'BLOCK 9',body:'#5ad1ff',trim:'#0a1a2a',plan:'std',guns:'free',drivers:['TAGG','KRUSH']},
  {tier:0,id:'DDV',seed:'lower',name:'DUST DEVILS',body:'#e0c070',trim:'#3a2a10',plan:'stretch',drivers:['SAND','GUST']},
  {tier:0,id:'NRC',seed:'back',name:'NEON ROACHES',body:'#b0ff3a',trim:'#101a05',plan:'attack',armor:0.9,drivers:['SKITTER','HUSK']},
  {tier:0,id:'TSN',seed:'top',name:'TIN SAINTS',body:'#f4f4ff',trim:'#7a1a2a',plan:'std',guns:'hold',drivers:['HALO','GRACE']},
  {tier:0,id:'ALC',seed:'upper',name:'ALLEY CATS',body:'#ff4a4a',trim:'#2a1020',plan:'attack',drivers:['MOG','TABBY']},
  // ---- Sprawl League ----
  {tier:1,id:'KBR',seed:'top',name:'NEON KOBRA',body:'#39ff7a',trim:'#1d1a33',plan:'stretch',guns:'free',drivers:['MAMBA','KOIL']},
  {tier:1,id:'RON',seed:'upper',name:'CRIMSON RONIN',body:'#ff3b3b',trim:'#1a1a1a',plan:'std',guns:'free',armor:0.9,drivers:['KAGE','SORA']},
  {tier:1,id:'VOD',seed:'upper',name:'VOID CULT',body:'#9b5cff',trim:'#2ef2ff',plan:'std',mines:3,drivers:['HEX','OMEN']},
  {tier:1,id:'TDW',seed:'back',name:'TIDEWATER',body:'#1fd1b0',trim:'#0b3a44',plan:'stretch',armor:0.85,drivers:['REEF','SURGE']},
  {tier:1,id:'SPL',seed:'lower',name:'STATIC PULSE',body:'#ffe14a',trim:'#2a2a0a',plan:'attack',drivers:['VOLTA','ARC']},
  {tier:1,id:'IRV',seed:'top',name:'IRONVEIL',body:'#7a8aa0',trim:'#ffd23f',plan:'std',armor:1.15,drivers:['ANVIL','WARD']},
  {tier:1,id:'RHB',seed:'back',name:'RED HARBOR',body:'#ff7a3d',trim:'#10202a',plan:'std',mines:2,drivers:['DOCK','BRINE']},
  {tier:1,id:'SKR',seed:'top',name:'SKYLINE RUNNERS',body:'#6bb8ff',trim:'#f4ecff',plan:'attack',pace:0.3,drivers:['LOFT','SPIRE']},
  {tier:1,id:'NSH',seed:'back',name:'NIGHTSHIFT',body:'#c0c0ff',trim:'#1a1a3a',plan:'stretch',guns:'hold',drivers:['OWL','DUSK']},
  {tier:1,id:'HDR',seed:'lower',name:'HALO DRIFT',body:'#ffffff',trim:'#ff2e88',plan:'std',drivers:['SERA','PHIL']},
  // ---- Corporate Grand Circuit ----
  {tier:2,id:'JKL',seed:'lower',name:'CHROME JACKALS',body:'#8f9bb3',trim:'#ff3b3b',plan:'std',drivers:['RUST','HOUND']},
  {tier:2,id:'HXD',seed:'back',name:'HEXADYNE',body:'#ff8a1f',trim:'#8a4dff',plan:'attack',drivers:['VOLT','NOVA']},
  {tier:2,id:'AZR',seed:'top',name:'AZURE DYNAMICS',body:'#3d7bff',trim:'#f4ecff',plan:'std',pace:0.5,drivers:['ION','PAX']},
  {tier:2,id:'GLT',seed:'top',name:'GILT VIPERS',body:'#ffd23f',trim:'#3a0d2a',plan:'attack',pace:0.8,armor:1.1,drivers:['GOLDIE','FANG']},
  {tier:2,id:'GHL',seed:'back',name:'GHOSTLINE',body:'#f4f4ff',trim:'#3d7bff',plan:'attack',guns:'hold',drivers:['WISP','BANSHEE']},
  {tier:2,id:'ZNA',seed:'lower',name:'ZENITH ARMS',body:'#ff3b6b',trim:'#1a1a1a',plan:'std',guns:'free',armor:1.1,drivers:['SABRE','LANCE']},
  {tier:2,id:'LMS',seed:'upper',name:'LUMEN SYSTEMS',body:'#7dffea',trim:'#0a2a2a',plan:'stretch',pace:0.4,drivers:['PRISM','FLUX']},
  {tier:2,id:'APX',seed:'top',name:'APEX MERIDIAN',body:'#c86bff',trim:'#ffd23f',plan:'attack',pace:0.6,drivers:['ZENO','VALE']},
  {tier:2,id:'KRH',seed:'upper',name:'KRONOS HEAVY',body:'#a0ff5a',trim:'#1a2a0a',plan:'std',armor:1.2,mines:2,drivers:['TITAN','ROOK']},
  {tier:2,id:'ORB',seed:'back',name:'ORBITAL CITY',body:'#ff9ad5',trim:'#2a0a2a',plan:'stretch',drivers:['NOVA','ORBIT']},
];
const TIER_NAMES=['GUTTER CIRCUIT','SPRAWL LEAGUE','CORPORATE GRAND CIRCUIT'];
const TIER_RACES=[8,10,12],TIER_MONEY=[1,2,3.5],TIER_BASE=[50,60,70];
// TEAMS is the tier you race in (your team first). It is refilled in place when you change tier.
const TEAMS=ALL_TEAMS.filter(t=>t.tier===0);
const myTier=()=>TEAMS[0].tier;
const tierMoney=()=>TIER_MONEY[myTier()];
// ?short in the URL shortens every season to 4 races (for testing).
const racesThisSeason=()=>new URLSearchParams(location.search).has('short')?4:TIER_RACES[myTier()];
