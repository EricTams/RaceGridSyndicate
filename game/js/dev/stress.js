// 3D torture test, for chasing white race screens (lost WebGL contexts).
// game/?stress=N swaps tracks N times (default 40), rebuilding the rival cars each time, and draws each for a moment;
// add &loss to also force a context loss and restore every 5th swap and check the screen draws again after it.
// &memlog (with any page, e.g. a watched autoplay) samples GPU memory and whether the screen draws, every 5s.
// Lines go to the console as [stress]/[mem], to an on-screen panel, and to localStorage 'glStress' / 'glMem'.
'use strict';

(()=>{
  const q=new URLSearchParams(location.search);
  if(!q.has('stress')&&!q.has('memlog'))return;
  const gl=renderer.getContext(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // Does the screen draw? Right after the next render, sample a grid of pixels in the last view drawn: 'ok' when
  // some aren't the clear colour, 'blank' when none are, 'lost' when there's no context.
  let want=null;
  const _render=renderer.render.bind(renderer);
  renderer.render=(s,c)=>{_render(s,c);if(!want)return;const w=want;want=null;
    if(gl.isContextLost()){w('lost');return;}
    const v=new THREE.Vector4();renderer.getCurrentViewport(v);let lit=0,n=0;const px=new Uint8Array(4);
    for(let i=1;i<8;i++)for(let j=1;j<8;j++){gl.readPixels(Math.floor(v.x+v.z*i/8),Math.floor(v.y+v.w*j/8),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);n++;
      if(Math.abs(px[0]-7)+Math.abs(px[1]-4)+Math.abs(px[2]-15)>12)lit++;}
    w(lit?'ok':'blank');};
  const drawCheck=()=>new Promise(r=>{want=r;setTimeout(()=>{if(want===r){want=null;r(gl.isContextLost()?'lost':'no frame');}},2000);});
  const heap=()=>performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576)+'MB':'?';
  const sample=()=>{const m=renderer.info.memory;return {geo:m.geometries,tex:m.textures,prog:renderer.info.programs?renderer.info.programs.length:0,heap:heap(),lost:gl.isContextLost()};};

  const panel=document.createElement('pre');
  panel.style.cssText='position:fixed;right:8px;bottom:8px;width:430px;max-height:45vh;overflow:auto;z-index:98;margin:0;background:#0b0716e0;color:#f4ecff;font:14px/1.1 VT323,monospace;padding:6px;border:1px solid #3b2a66;pointer-events:none;white-space:pre-wrap';
  document.body.appendChild(panel);
  const log=(tag,key,line,data)=>{console.log(`[${tag}]`,line);panel.textContent=(line+'\n'+panel.textContent).slice(0,6000);
    try{const all=JSON.parse(localStorage.getItem(key)||'[]');all.push({at:new Date().toTimeString().slice(0,8),line,...data});localStorage.setItem(key,JSON.stringify(all.slice(-300)));}catch{}};

  if(q.has('memlog')){let t0=Date.now();
    (async()=>{for(;;){await sleep(5000);const s=sample(),d=await drawCheck();
      const where=window.autoplayProgress||`s${league.season} r${league.race}`,track=TRACK?TRACK.name:'';
      log('mem','glMem',`${Math.round((Date.now()-t0)/1000)}s ${where} ${track.slice(0,16)} geo${s.geo} tex${s.tex} prog${s.prog} heap${s.heap} ${d}`,{...s,where,track,draw:d});}})();
  }
  if(q.has('stress')){
    const N=+q.get('stress')||40,loss=q.has('loss'),ext=gl.getExtension('WEBGL_lose_context');
    (async()=>{
      await sleep(1500);
      localStorage.removeItem('glStress');
      document.querySelectorAll('.result').forEach(e=>e.hidden=true);setView('full');
      const start=sample();let blanks=0,peak=0;
      log('stress','glStress',`START geo${start.geo} tex${start.tex} prog${start.prog} heap${start.heap}`,start);
      for(let i=1;i<=N;i++){
        const def=TRACKS[i%TRACKS.length],t=performance.now();
        loadTrack(def);buildField();race.grid=null;resetRace();   // new rival cars need a grid slot before they can be drawn
        const ms=Math.round(performance.now()-t);
        await sleep(1200);
        let d=await drawCheck(),extra='';
        if(loss&&ext&&i%5===0){
          ext.loseContext();await sleep(800);const during=await drawCheck();
          ext.restoreContext();await sleep(1500);d=await drawCheck();extra=` · forced loss (${during}) → restored`;
        }
        const s=sample();peak=Math.max(peak,s.geo);if(d!=='ok')blanks++;
        log('stress','glStress',`${i}/${N} ${def.name.slice(0,16).padEnd(16)} ${ms}ms geo${s.geo} tex${s.tex} prog${s.prog} heap${s.heap} ${d}${extra}`,{i,track:def.name,ms,...s,draw:d});
      }
      const end=sample();
      log('stress','glStress',`DONE ${N} swaps · geo ${start.geo}→${end.geo} (peak ${peak}) · prog ${start.prog}→${end.prog} · heap ${start.heap}→${end.heap} · not drawing ${blanks}x`,{done:true,...end,blanks,peak});
      window.stressDone=true;
    })();
  }
})();
