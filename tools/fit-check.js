// Fit check (runs inside the game page): how much the scenery squeezes each circuit in the full-track view. The camera
// fits the circuit plus the landmark, sketch props and freeway focus points; if those sit far out, the circuit shrinks.
// Reports the circuit's size as a % of what it would be if the camera fitted the circuit alone (100 = no squeeze), and
// which side the scenery widens. Under ~75% the track starts to look small. Set window.FC={ids:[...]} or leave it unset
// for every track. Run it with: node tools/headless-shot.mjs out.png "$(cat tools/fit-check.js)"
(()=>{
  const out={},left=innerWidth>=760?Math.ceil(225/PX):4,sw=W-4-left,sh=H-8;
  const scale=b=>Math.max((b.maxR-b.minR)/sw,(b.maxU-b.minU)/sh);
  for(const id of (typeof FC!=='undefined'?FC.ids:TRACKS.map(t=>t.id))){loadTrack(TRACKS.find(t=>t.id===id));
    const b={minR:1e9,maxR:-1e9,minU:1e9,maxU:-1e9};
    P.filter((_,i)=>i%6===0).forEach(p=>{const R=p.dot(RIGHT),U=p.dot(UP);
      b.minR=Math.min(b.minR,R-HW);b.maxR=Math.max(b.maxR,R+HW);b.minU=Math.min(b.minU,U-HW);b.maxU=Math.max(b.maxU,U+HW);});
    // what pushes each side out: the landmark (lm), a sketch prop or a freeway focus point (fw)
    const lm=placeLandmark(TRACK),items=[['lm',new THREE.Vector3(lm.x,0,lm.z)],...WATER_PROPS.map(p=>['prop',new THREE.Vector3(p.x,0,p.z)]),
      ...FW_FOCUS.map(([x,z])=>['fw',new THREE.Vector3(x,FW_Y,z)])].map(([k,p])=>[k,p.dot(RIGHT),p.dot(UP)]);
    const who=(f)=>{let best=null,bv=-1e9;for(const it of items){const v=f(it);if(v>bv){bv=v;best=it[0];}}return best;};
    const grow={L:[b.minR-FIT.minR,who(i=>-i[1])],R:[FIT.maxR-b.maxR,who(i=>i[1])],D:[b.minU-FIT.minU,who(i=>-i[2])],U:[FIT.maxU-b.maxU,who(i=>i[2])]};
    out[id]={size:Math.round(100*scale(b)/scale(FIT)),grow:Object.entries(grow).filter(([,v])=>v[0]>3).map(([k,v])=>k+Math.round(v[0])+v[1]).join(' ')};}
  return JSON.stringify(out);
})()
