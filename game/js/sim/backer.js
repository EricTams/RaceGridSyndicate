// The Backer: season objectives, Backer Confidence, emergency loans, and the 10-season career.
// There is no game over before season 10: missing objectives costs confidence (and invites interference),
// running out of money means a loan, and the career always runs its full length.
'use strict';

const CAREER_SEASONS=10,LOAN_INTEREST=0.10,LOAN_REPAY_SHARE=0.3;
const BACKER_OPTIONAL=[{diff:'easy',cash:0.5,conf:5},{diff:'medium',cash:1.0,conf:8},{diff:'hard',cash:2.0,conf:12}];
Object.assign(league,{confidence:60,debt:0,backer:null,history:[],titles:0,seasonStartCash:START_CASH});

// Season start: the Backer's primary objective, plus 3 optional objectives to choose from.
function startBackerSeason(){
  const me=TEAMS[0],honeymoon=league.season===1?2:0;
  league.backer={primary:{kind:'top',target:Math.min(10,expectedPos(me.rep)+honeymoon)},optional:null,
    offers:BACKER_OPTIONAL.map(o=>({...o,objective:makeObjective(o.diff,me.rep)}))};
  league.seasonStartCash=me.cash;
}
function pickOptional(i){const b=league.backer;b.optional=b.offers[i];b.offers=[];}

// Season end: confidence moves with objectives and money; the result goes into the career record.
function closeBackerSeason(){
  const me=TEAMS[0],b=league.backer,lines=[],pos=standingPos(me);
  let d=0;
  if(b){
    if(objMet(b.primary)){d+=15;lines.push(`Backer: primary objective met (${objText(b.primary)}). Confidence +15.`);}
    else{d-=20;lines.push(`Backer: primary objective missed (${objText(b.primary)}). Confidence −20.`);}
    if(b.optional){
      if(objMet(b.optional.objective)){d+=b.optional.conf;me.cash+=b.optional.cash;
        lines.push(`Backer: optional objective met. +${b.optional.cash.toFixed(2)}M QT, confidence +${b.optional.conf}.`);}
      else lines.push(`Backer: optional objective missed (${objText(b.optional.objective)}).`);
    }
  }
  const profit=me.cash-league.seasonStartCash;d+=profit>=0?5:-5;
  lines.push(`Backer: ${profit>=0?'profit':'loss'} of ${Math.abs(profit).toFixed(2)}M QT this season. Confidence ${profit>=0?'+5':'−5'}.`);
  league.confidence=Math.max(0,Math.min(100,league.confidence+d));
  if(pos===1&&myTier()===2)league.titles++;   // only Corporate Grand Circuit titles count
  league.history.push({season:league.season,pos,tier:myTier()});
  return lines;
}

// After salaries: cover a negative balance with a Backer loan, then repay from what's left.
function settleDebt(){
  const me=TEAMS[0],lines=[];
  if(me.cash<0){
    const loan=-me.cash;league.debt+=loan*(1+LOAN_INTEREST);me.cash=0;league.confidence=Math.max(0,league.confidence-15);
    lines.push(`Out of money: the Backer covers ${loan.toFixed(2)}M QT as a loan (10% interest). Confidence −15.`);
  }else if(league.debt>0){
    const pay=Math.min(league.debt,me.cash*LOAN_REPAY_SHARE);league.debt-=pay;me.cash-=pay;
    lines.push(`Loan repayment: ${pay.toFixed(2)}M QT. ${league.debt>0.005?`${league.debt.toFixed(2)}M QT still owed.`:'Loan cleared.'}`);
  }
  return lines;
}

// Below 40 confidence, the Backer starts interfering through event cards.
const BACKER_EVENTS=[
  ()=>({title:'BACKER WANTS A RETURN',text:'The Backer demands a dividend before the next race.',
    options:[{label:'PAY IT · −0.50M, CONFIDENCE +8',cost:0.5,run(){TEAMS[0].cash-=0.5;league.confidence=Math.min(100,league.confidence+8);}},
             {label:'STALL · CONFIDENCE −8',cost:0,run(){league.confidence=Math.max(0,league.confidence-8);}}]}),
  ()=>({title:'BACKER VETO',text:'The Backer wants every new part approved first and is freezing development.',
    options:[{label:'ACCEPT · NO NEW PARTS UNTIL NEXT RACE, CONFIDENCE +6',cost:0,run(){league.devFrozen=true;league.confidence=Math.min(100,league.confidence+6);}},
             {label:'PUSH BACK · CONFIDENCE −6',cost:0,run(){league.confidence=Math.max(0,league.confidence-6);}}]}),
];

function careerGrade(){
  if(league.titles>=2)return ['LEGEND',`${league.titles} Grand Circuit titles.`];
  if(league.titles===1)return ['CHAMPION','A Grand Circuit title.'];
  if(league.maxTier===2)return ['CONTENDER','Reached the Corporate Grand Circuit.'];
  if(league.maxTier===1)return ['CLIMBER','Reached the Sprawl League.'];
  return ['STUCK','Never left the Gutter Circuit.'];
}
