// Loads the game in headless Chrome, runs a snippet, and saves a screenshot.
// usage: node tools/headless-shot.mjs out.png "<js to run after load>" [query] [port]   (with ./play.sh serving on :8000)
import {spawn} from 'node:child_process';
import {writeFileSync,rmSync} from 'node:fs';
const [out='shot.png',js='0',query='',portArg]=process.argv.slice(2),port=+portArg||9334;
// A fresh profile each run, so no stale cached game files; removed on exit.
const profile=`${process.env.TMPDIR||'/tmp/'}rgs-shot-${port}-${Date.now()}`;
process.on('exit',()=>{try{rmSync(profile,{recursive:true,force:true});}catch{}});
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,
  '--no-first-run','--disable-gpu','--use-angle=swiftshader','--enable-unsafe-swiftshader',   // software only: stay off the real GPU
  '--window-size=1280,900',
  `http://localhost:8000/game/${query?'?'+query:''}`],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let wsUrl;
for(let i=0;i<50&&!wsUrl;i++){try{const t=await (await fetch(`http://localhost:${port}/json`)).json();wsUrl=t.find(x=>x.type==='page')?.webSocketDebuggerUrl;}catch{}await sleep(300);}
const ws=new WebSocket(wsUrl);let id=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown')console.log('EXCEPTION',m.params.exceptionDetails.exception?.description?.split('\n').slice(0,4).join(' | '));};
await new Promise(r=>ws.onopen=r);
const call=(method,params={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
await call('Runtime.enable');await sleep(2500);
const r=await call('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true});
const v=r.result?.result?.value;if(v!==undefined)console.log(typeof v==='string'?v:JSON.stringify(v));
if(r.result?.exceptionDetails)console.log('ERROR',r.result.exceptionDetails.exception?.description?.split('\n')[0]);
await sleep(800);
const shot=await call('Page.captureScreenshot',{format:'png'});
writeFileSync(out,Buffer.from(shot.result.data,'base64'));
// Close gracefully (not a kill): killing a headless Chrome that has rendered WebGL knocks out the GPU of the
// user's own Chrome, which turns their open game white.
ws.send(JSON.stringify({id:++id,method:'Browser.close'}));await new Promise(r=>{chrome.on('exit',r);setTimeout(r,5000);});process.exit(0);
