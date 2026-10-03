// Freeway check (runs inside the game page): measures docs/FREEWAY_CHECKLIST.md items on each track. Set
// window.AUDIT to a list of track ids first, or leave it unset for every track.
// Run it with: node tools/headless-shot.mjs out.png "$(cat tools/freeway-check.js)"
(()=>{
  // Measures the freeway checklist on each AUDIT track.
  const out={};
  for(const id of (typeof AUDIT!=="undefined"?AUDIT:TRACKS.map(t=>t.id))){loadTrack(TRACKS.find(t=>t.id===id));
    const R=FW_ROADS,res={roads:R.length};
    // 1: decks of different roads crossing within 4 units of height (excluding the joins where one starts on the other)
    let flat=0;
    for(let a=0;a<R.length;a++)for(let b=a+1;b<R.length;b++){
      for(let i=1;i<R[a].pts.length;i+=1)for(let j=1;j<R[b].pts.length;j+=1){
        const p=R[a].pts[i-1],q=R[a].pts[i],r=R[b].pts[j-1],s=R[b].pts[j];
        const d=(q[0]-p[0])*(s[1]-r[1])-(q[1]-p[1])*(s[0]-r[0]);if(!d)continue;
        const t=((r[0]-p[0])*(s[1]-r[1])-(r[1]-p[1])*(s[0]-r[0]))/d,u=((r[0]-p[0])*(q[1]-p[1])-(r[1]-p[1])*(q[0]-p[0]))/d;
        if(t<0||t>1||u<0||u>1)continue;
        const nearEnd=i<4||j<4||i>R[a].pts.length-4||j>R[b].pts.length-4;
        if(!nearEnd&&Math.abs(R[a].ys[i]-R[b].ys[j])<4&&R[a].fade[i]>0.5&&R[b].fade[j]>0.5)flat++;}}
    res.flatCrossings=flat;
    // 5: steepest grade, and height mismatch where a road starts or ends on another road
    let grade=0;for(const r of R)for(let i=1;i<r.pts.length;i++){const ds=r.cum[i]-r.cum[i-1];if(ds>0.5)grade=Math.max(grade,Math.abs(r.ys[i]-r.ys[i-1])/ds);}
    res.maxGrade='1 in '+(1/grade).toFixed(1);
    let step=0;for(const r of R)for(const k of[0,r.pts.length-1]){const [x,z]=r.pts[k];if(r.fade[k]<0.5)continue;
      for(const o of R){if(o===r)continue;let bi=-1,bd=3;o.pts.forEach(([a,b],i)=>{const d=Math.hypot(a-x,b-z);if(d<bd){bd=d;bi=i;}});
        if(bi>=0)step=Math.max(step,Math.abs(o.ys[bi]-r.ys[k]));}}
    res.worstJoinStep=+step.toFixed(2);
    // 6: pillars standing on a lower deck of another road, or on the circuit's verge
    let bad=0,pillars=0;
    for(const r of R)for(let u=0;u<r.len-0.5;u+=SPAN){const a=fwAt(r,u);if(a.y<=1.5||a.f<0.03)continue;pillars++;
      if(nearTrack(a.x,a.z,HW+3)){bad++;continue;}
      if(R.some(o=>o!==r&&o.pts.some(([x,z],i)=>o.ys[i]<a.y-1&&o.fade[i]>0.03&&Math.hypot(x-a.x,z-a.z)<3.5))){pillars--;continue;}   // not drawn
      for(const o of R){if(o===r)continue;if(o.pts.some(([x,z],i)=>Math.hypot(x-a.x,z-a.z)<3&&o.ys[i]<a.y-1&&o.fade[i]>0.5)){bad++;break;}}}
    res.pillarsOnRoads=bad+'/'+pillars;
    // 7: tightest bend (radius over ~12 units of road)
    let minR=1e9;for(const r of R)for(let i=2;i<r.pts.length-2;i++){if(r.fade[i]<0.5)continue;
      const a=r.pts[i-2],b=r.pts[i],c=r.pts[i+2],ab=Math.hypot(b[0]-a[0],b[1]-a[1]),bc=Math.hypot(c[0]-b[0],c[1]-b[1]),ac=Math.hypot(c[0]-a[0],c[1]-a[1]);
      const cr=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));if(cr>1e-6)minR=Math.min(minR,ab*bc*ac/(2*cr));}
    res.tightestBend=Math.round(minR);
    // 8: share of solid freeway inside the full-track view
    let inv=0,tot=0;for(const r of R)for(let i=0;i<r.pts.length;i+=2){if(r.fade[i]<0.5)continue;tot++;const v=new THREE.Vector3(r.pts[i][0],r.ys[i],r.pts[i][1]),X=v.dot(RIGHT),Y=v.dot(UP);
      if(X>FIT.minR&&X<FIT.maxR&&Y>FIT.minU&&Y<FIT.maxU)inv++;}
    res.inView=Math.round(100*inv/tot)+'%';
    // 10: landmark clipping, and deck points straddling a shoreline (one edge wet, the other dry)
    const lm=placeLandmark(TRACK);let clip=0,straddle=0,pts=0;
    for(const r of R)for(let i=0;i<r.pts.length;i+=2){if(r.fade[i]<0.5)continue;pts++;const [x,z]=r.pts[i],t=fwTan(r.pts,i);
      if(!(TRACK.roads&&TRACK.roads.kind==='span')&&Math.hypot(x-lm.x,z-lm.z)<(LANDMARK_R[TRACK.landmark.kind]||7))clip++;   // (a bridge carrying the freeway isn't a clash)
      if(inWater(x-t[1]*2.5,z+t[0]*2.5)!==inWater(x+t[1]*2.5,z-t[0]*2.5))straddle++;}
    res.landmarkClips=clip;res.shoreStraddle=Math.round(100*straddle/pts)+'%';
    // roads that come down low (under 2.5) over the water: they should only ever land on dry ground
    let wetLandings=0;for(const r of R)for(let i=0;i<r.pts.length;i++)if(r.ys[i]<2.5&&r.fade[i]>0.03&&inWater(...r.pts[i])){wetLandings++;break;}
    res.landsInWater=wetLandings;
    out[id]=res;}
  return JSON.stringify(out);
})()
