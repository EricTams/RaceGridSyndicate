// Top-down map (runs inside the game page): a plain north-up plan of one track's water (blue), land (dark), circuit
// (pink), freeways (orange) and landmark footprint (red), for checking geography the isometric view hides.
// Run it with: node tools/headless-shot.mjs map.png "window.TOP={id:'sanfrancisco',half:320};$(cat tools/topdown-map.js)"
(async()=>{
  document.querySelectorAll('[id$=Ov]').forEach(e=>e.hidden=true);window.requestAnimationFrame=()=>0;
  loadTrack(TRACKS.find(t=>t.id===TOP.id));
  const cv=document.createElement('canvas'),S=800,H=TOP.half||300,k=S/(2*H);cv.width=cv.height=S;const g=cv.getContext('2d');
  const img=g.createImageData(S,S);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){const wx=x/k-H,wz=y/k-H,i=(y*S+x)*4,w=inWater(wx,wz);
    img.data[i]=w?20:40;img.data[i+1]=w?80:30;img.data[i+2]=w?110:50;img.data[i+3]=255;}
  g.putImageData(img,0,0);const X=x=>(x+H)*k;
  g.strokeStyle='#ff4fd8';g.lineWidth=3;g.beginPath();P.forEach((p,i)=>i?g.lineTo(X(p.x),X(p.z)):g.moveTo(X(p.x),X(p.z)));g.closePath();g.stroke();
  g.strokeStyle='#ffa030';g.lineWidth=2;for(const r of FW_ROADS){g.beginPath();r.pts.forEach(([x,z],i)=>i?g.lineTo(X(x),X(z)):g.moveTo(X(x),X(z)));g.stroke();}
  const s=placeLandmark(TRACK),L=s.span||0,dx=Math.cos(-s.rot),dz=Math.sin(-s.rot);
  g.strokeStyle='#ff3030';g.lineWidth=5;g.beginPath();g.moveTo(X(s.x-dx*L),X(s.z-dz*L));g.lineTo(X(s.x+dx*L),X(s.z+dz*L));g.stroke();
  g.fillStyle='#fff';g.font='14px monospace';g.fillText(TRACK.name+'  (north up; pink circuit, orange freeways, red landmark)',8,18);
  Object.assign(cv.style,{position:'fixed',left:0,top:0,zIndex:9999});document.body.appendChild(cv);return 'ok';
})()
