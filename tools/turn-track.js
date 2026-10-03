// Turn-track preview (runs inside the game page opened with ?bake): shows one track turned to several angles in its
// city, as a contact sheet, to pick the angle it sits best at. The city's map keeps its pinned turn, so the water and
// landmark stay where they really are and the circuit turns among them. Each cell is labelled with the angle
// (degrees, clockwise on the map), how big the circuit shows in the full-track view compared with the unturned track
// (zoom), and how much the scenery squeezes it (fit, as in tools/fit-check.js). Nothing is saved; to use an angle,
// turn the track's ctrl points (and its landmark x,z hint) in tracks.js by it and re-bake.
// Set window.TT={id:'tokyo',angles:[0,45,...],cols:4}. Run with:
//   node tools/headless-shot.mjs out.png "window.TT={...};$(cat tools/turn-track.js)" bake
(async()=>{
  document.querySelectorAll('[id$=Ov]').forEach(e=>e.hidden=true);
  window.requestAnimationFrame=()=>0;await new Promise(r=>setTimeout(r,100));
  const base=TRACKS.find(t=>t.id===TT.id),angles=TT.angles||[0,45,90,135,180,225,270,315],cols=TT.cols||4;
  const tw=Math.floor(1280/cols),th=Math.round(tw*0.7),sheet=document.createElement('canvas');
  sheet.width=cols*tw;sheet.height=Math.ceil(angles.length/cols)*th;const g=sheet.getContext('2d');g.font='12px monospace';
  const w=glCanvas.width,h=glCanvas.height,left=innerWidth>=760?Math.ceil(225/PX):4,sw=W-4-left,sh=H-8,out=[];
  const scale=b=>Math.max((b.maxR-b.minR)/sw,(b.maxU-b.minU)/sh);let ref=null;
  angles.forEach((deg,k)=>{
    const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),turn=([x,z])=>[x*c-z*s,x*s+z*c];
    const lm=base.landmark,[lx,lz]=turn([lm.x,lm.z]);
    loadTrack({...base,ctrl:base.ctrl.map(turn),landmark:{...lm,x:lx,z:lz}});resetRace();updateVisuals(0,0);
    const b={minR:1e9,maxR:-1e9,minU:1e9,maxU:-1e9};
    P.filter((_,i)=>i%6===0).forEach(p=>{const R=p.dot(RIGHT),U=p.dot(UP);
      b.minR=Math.min(b.minR,R-HW);b.maxR=Math.max(b.maxR,R+HW);b.minU=Math.min(b.minU,U-HW);b.maxU=Math.max(b.maxU,U+HW);});
    if(ref===null)ref=scale(FIT);
    const zoom=Math.round(100*ref/scale(FIT)),fit=Math.round(100*scale(b)/scale(FIT));out.push(`${deg}:${zoom}/${fit}`);
    const cR=(FIT.minR+FIT.maxR)/2,cU=(FIT.minU+FIT.maxU)/2,half=Math.max((FIT.maxU-FIT.minU)/2,(FIT.maxR-FIT.minR)/2*h/w)*1.1;
    renderer.setViewport(0,0,w,h);renderer.setScissor(0,0,w,h);setCam(cR,cU,half,w,h);renderer.render(scene,cam);
    const x=(k%cols)*tw,y=Math.floor(k/cols)*th,ch=w*th/tw;g.drawImage(glCanvas,0,(h-ch)/2,w,ch,x,y,tw,th);
    g.fillStyle='#ffd23f';g.fillText(`${deg}°  zoom ${zoom}%  fit ${fit}%`,x+4,y+14);g.strokeStyle='#444';g.strokeRect(x,y,tw,th);});
  Object.assign(sheet.style,{position:'fixed',left:0,top:0,zIndex:9999});document.body.appendChild(sheet);
  return out.join('  ');
})()
