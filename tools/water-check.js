// Water check (runs inside the game page): how many separate bodies of water each track's painted water forms (sizes
// in pixels, biggest first, specks ignored). One body per connected waterway is expected; a landmark's land pad or a
// sketch shape that cuts a bay off from its channel shows up as an extra body. Set window.WC={ids:[...]} or leave it
// unset for every track. Run it with: node tools/headless-shot.mjs out.png "$(cat tools/water-check.js)"
(()=>{

  const out={};
  for(const id of (typeof WC!=='undefined'?WC.ids:TRACKS.map(t=>t.id))){loadTrack(TRACKS.find(t=>t.id===id));const S=WATER_TEX_HALF*2*WATER_TEX_PX,lab=new Int32Array(S*S),sizes=[];let n=0;
    for(let i=0;i<S*S;i++){if(!WATER_MASK[i]||lab[i])continue;n++;let c=0;const q=[i];lab[i]=n;
      while(q.length){const a=q.pop();c++;for(const d of[1,-1,S,-S]){const b=a+d;if(b>=0&&b<S*S&&WATER_MASK[b]&&!lab[b]){lab[b]=n;q.push(b);}}}sizes.push(c);}
    out[id]=sizes.filter(c=>c>400).sort((a,b)=>b-a);}
  return JSON.stringify(out);
})()
