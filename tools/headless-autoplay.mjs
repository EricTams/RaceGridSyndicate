// Runs the autoplay harness in headless Chrome and prints progress and the final report.
// usage: node tools/headless-autoplay.mjs "autoplay=3&laps=4" [port]   (with ./play.sh serving on :8000)
// RGS_URL=http://localhost:8001/game/ runs a different copy of the game (e.g. a frozen baseline).
// RGS_GPU=1 renders on the real GPU (Metal) instead of the software renderer, and reports WebGL context losses.
// It shares the GPU with the user's Chrome: don't use it while they have the game open.
import {spawn} from 'node:child_process';
import {rmSync} from 'node:fs';
const query=process.argv[2]||'autoplay=3&laps=4',port=+process.argv[3]||9333;
// A fresh profile each run, so no stale cached game files; removed on exit.
const profile=`${process.env.TMPDIR||'/tmp/'}rgs-headless-${port}-${Date.now()}`;
process.on('exit',()=>{try{rmSync(profile,{recursive:true,force:true});}catch{}});
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,
  '--no-first-run',...(process.env.RGS_GPU?['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']:['--disable-gpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--window-size=1280,900',
  `${process.env.RGS_URL||'http://localhost:8000/game/'}?${query}`],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0;const pending=new Map();
async function connect(){
  for(let i=0;i<50;i++){try{const t=await (await fetch(`http://localhost:${port}/json`)).json();const p=t.find(x=>x.type==='page');if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(300);}
  throw new Error('no chrome');
}
const call=(method,params={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
const evalJS=async expr=>{const r=await call('Runtime.evaluate',{expression:expr,returnByValue:true});return r.result&&r.result.result?r.result.result.value:undefined;};
ws=new WebSocket(await connect());
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
  if(m.method==='Runtime.consoleAPICalled'){const t=(m.params.args||[]).map(x=>x.value).join(' ');if(/Context (Lost|Restored)|WebGL/.test(t))console.log(new Date().toTimeString().slice(0,8),'GPU',t);}
  if(m.method==='Runtime.exceptionThrown')console.log('EXCEPTION',m.params.exceptionDetails.exception?.description?.split('\n')[0]);};
await new Promise(r=>ws.onopen=r);
await call('Runtime.enable');
let last='',changed=Date.now(),code=0,done=0;
for(;;){
  await sleep(10000);
  let v;try{v=await evalJS(`JSON.stringify({p:window.autoplayProgress,r:document.getElementById('autoplayReport')?.textContent||null,c:JSON.parse(sessionStorage.getItem('autoplay')||'[]').map(x=>x.seasons.map(s=>'S'+s.s+'T'+s.tier+' P'+s.pos).join(' ')+' LEDGER '+JSON.stringify(x.seasons.map(s=>s.ledger||{})))})`);}catch{continue;}
  if(!v)continue;const {p,r,c}=JSON.parse(v);
  // Each finished career as it lands, so a run cut short still leaves its results in the log.
  for(;done<c.length;done++)console.log(`CAREER ${done+1}: ${c[done]}`);
  if(p!==last){console.log(new Date().toTimeString().slice(0,8),p);last=p;changed=Date.now();}
  if(r){console.log(r);break;}
  // No progress for 3 minutes: the harness has stalled (usually an exception, printed above).
  if(Date.now()-changed>180000){console.log('STALLED at',p);code=1;break;}
}
// Close gracefully (not a kill): killing a headless Chrome that has rendered WebGL knocks out the GPU of the
// user's own Chrome, which turns their open game white.
ws.send(JSON.stringify({id:++id,method:'Browser.close'}));await new Promise(r=>{chrome.on('exit',r);setTimeout(r,5000);});process.exit(code);
