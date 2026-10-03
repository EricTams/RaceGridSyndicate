// Builds the game's recorded sound effects: assets/sfx/src (CC0 sources, see assets/sfx/SOURCES.md) → game/sfx/*.wav.
// Each recipe cuts a stretch of one or more sources, mixes them, filters, fades and normalizes, and saves 22.05 kHz
// mono 16-bit WAV (small, and every browser decodes it). The work runs in headless Chrome's Web Audio (it decodes the
// .ogg/.mp3 sources), with ./play.sh serving on :8000.
// usage: node tools/sfx-build.mjs            build every recipe
//        node tools/sfx-build.mjs gun hit    just these (by id prefix)
//        node tools/sfx-build.mjs --scan     list each source's loud events (start+length@peak dB), to pick cuts
import {spawn} from 'node:child_process';
import {writeFileSync, mkdirSync, readdirSync, rmSync} from 'node:fs';

// out: file in game/sfx/. layers: [src file, start s, length s, gain dB, at s (offset in the result)].
// hp/lp: filter Hz. fadeIn/fadeOut s. peak: normalize to this dBFS. rate: playback speed (pitch) of all layers.
const RECIPES = [
  // Your gun: short submachine-gun bursts
  {out: 'gun-1.wav', layers: [['ppsh-burst-a.wav', 0.03, 0.4]], hp: 120, fadeOut: 0.15, peak: -1},
  {out: 'gun-2.wav', layers: [['m45-burst-c.wav', 0.03, 0.5]], hp: 120, fadeOut: 0.18, peak: -1},
  {out: 'gun-3.wav', layers: [['m45-burst-b.wav', 0.03, 0.55]], hp: 120, fadeOut: 0.18, peak: -1},
  // Rounds hitting your car's plating
  {out: 'hit-1.wav', layers: [['impactMetal_light_000.ogg', 0, 0.4]], fadeOut: 0.12, peak: -3},
  {out: 'hit-2.wav', layers: [['impactMetal_light_002.ogg', 0, 0.4]], fadeOut: 0.12, peak: -3},
  {out: 'hit-3.wav', layers: [['impactMetal_light_004.ogg', 0, 0.4]], fadeOut: 0.12, peak: -3},
  // A jammed gun: a dry mechanical click
  {out: 'jam-1.wav', layers: [['sfx100v2_switch_01.ogg', 0, 0.3]], fadeOut: 0.08, peak: -4},
  // A mine dropped on the road
  {out: 'minedrop-1.wav', layers: [['impactMetal_medium_000.ogg', 0, 0.5]], fadeOut: 0.15, peak: -3},
  {out: 'minedrop-2.wav', layers: [['impactMetal_medium_001.ogg', 0, 0.5]], fadeOut: 0.15, peak: -3},
  // Running over a mine: a low blast under a metal bang
  {out: 'minehit-1.wav', layers: [['lowFrequency_explosion_000.ogg', 0.05, 1.2], ['impactPlate_heavy_000.ogg', 0, 0.5, -6]], fadeOut: 0.4, peak: -1},
  // Your car wrecked: a crunching explosion with the plating banging about
  {out: 'wreck-1.wav', layers: [['explosionCrunch_003.ogg', 0, 1.55], ['impactPlate_heavy_001.ogg', 0, 0.6, -4], ['impactMetal_heavy_000.ogg', 0, 0.6, -8, 0.18]], fadeOut: 0.5, peak: -1},
  {out: 'wreck-2.wav', layers: [['explosionCrunch_001.ogg', 0, 1.36], ['impactPlate_heavy_002.ogg', 0, 0.6, -4], ['impactMetal_heavy_001.ogg', 0, 0.6, -8, 0.22]], fadeOut: 0.5, peak: -1},
  {out: 'minehit-2.wav', layers: [['lowFrequency_explosion_001.ogg', 0.03, 0.9], ['impactPlate_heavy_002.ogg', 0, 0.5, -6]], fadeOut: 0.3, peak: -1},
  // Engine or chassis failure: a short, muffled pop
  {out: 'engine-1.wav', layers: [['explosionCrunch_004.ogg', 0, 0.9]], lp: 2500, fadeOut: 0.35, peak: -2},
  // The pit crew's air gun
  {out: 'airgun-1.wav', layers: [['bigsoundbank-0965-impact-wrench.mp3', 0.15, 0.4], ['bigsoundbank-0965-impact-wrench.mp3', 2.08, 0.42, 0, 0.45],
    ['bigsoundbank-0965-impact-wrench.mp3', 4.17, 0.35, 0, 0.92]], hp: 300, fadeIn: 0.01, fadeOut: 0.12, peak: -3},
  {out: 'airgun-2.wav', layers: [['bigsoundbank-0965-impact-wrench.mp3', 5.97, 0.33], ['bigsoundbank-0965-impact-wrench.mp3', 10.3, 0.48, 0, 0.42],
    ['bigsoundbank-0965-impact-wrench.mp3', 12.58, 0.42, 0, 0.95]], hp: 300, fadeIn: 0.01, fadeOut: 0.12, peak: -3},
  // Engines: your cars launching at lights out, and a rev as your car leaves the pit box
  {out: 'launch-1.wav', layers: [['bigsoundbank-0600-acceleration-aston-martin.mp3', 1.0, 1.9]], hp: 60, fadeIn: 0.05, fadeOut: 0.6, peak: -1},
  {out: 'pitout-1.wav', layers: [['bigsoundbank-0291-car-engine-2.mp3', 1.0, 1.0]], hp: 60, fadeIn: 0.04, fadeOut: 0.35, peak: -2},
  {out: 'pitout-2.wav', layers: [['bigsoundbank-0290-motor-car-1.mp3', 1.1, 0.9]], hp: 60, fadeIn: 0.04, fadeOut: 0.3, peak: -2},
  {out: 'pitout-3.wav', layers: [['bigsoundbank-0291-car-engine-2.mp3', 3.0, 0.9]], hp: 60, fadeIn: 0.04, fadeOut: 0.3, peak: -2},
  // An air drill: single wrench bursts, short for a Night Tune pick (the crew dialing in the setup)...
  {out: 'drill-1.wav', layers: [['bigsoundbank-0965-impact-wrench.mp3', 0.15, 0.3]], hp: 300, fadeIn: 0.005, fadeOut: 0.1, peak: -3},
  {out: 'drill-2.wav', layers: [['bigsoundbank-0965-impact-wrench.mp3', 4.17, 0.28]], hp: 300, fadeIn: 0.005, fadeOut: 0.1, peak: -3},
  {out: 'drill-3.wav', layers: [['bigsoundbank-0965-impact-wrench.mp3', 8.0, 0.32]], hp: 300, fadeIn: 0.005, fadeOut: 0.1, peak: -3},
  // ...and a burst then a clank for building the car (parts fitted, built, rebuilt; HQ work; design meeting picks)
  {out: 'build-1.wav', layers: [['bigsoundbank-0965-impact-wrench.mp3', 2.08, 0.42], ['impactMetal_heavy_002.ogg', 0, 0.3, -2, 0.4]], hp: 150, fadeIn: 0.005, fadeOut: 0.15, peak: -3},
  {out: 'build-2.wav', layers: [['bigsoundbank-0965-impact-wrench.mp3', 10.3, 0.45], ['impactMetal_medium_002.ogg', 0, 0.3, -2, 0.43]], hp: 150, fadeIn: 0.005, fadeOut: 0.15, peak: -3},
  {out: 'build-3.wav', layers: [['bigsoundbank-0965-impact-wrench.mp3', 12.58, 0.4], ['impactMetal_heavy_000.ogg', 0, 0.3, -2, 0.38]], hp: 150, fadeIn: 0.005, fadeOut: 0.15, peak: -3},
  // A contract signed: a stamp on the desk
  {out: 'stamp-1.wav', layers: [['impactWood_medium_000.ogg', 0, 0.35], ['impactSoft_heavy_000.ogg', 0, 0.35, -3]], fadeOut: 0.1, peak: -3},
  {out: 'stamp-2.wav', layers: [['impactWood_medium_001.ogg', 0, 0.35], ['impactSoft_heavy_001.ogg', 0, 0.35, -3]], fadeOut: 0.1, peak: -3},
];

// ---- runs in the page ----
const PAGE = async (recipes, scan) => {
  const SR = 22050, src = {}, dec = new OfflineAudioContext(1, 1, 44100);
  const load = async f => src[f] || (src[f] = await dec.decodeAudioData(await (await fetch('/assets/sfx/src/' + encodeURIComponent(f))).arrayBuffer()));
  const db = x => x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -99;
  if (scan) {
    const out = [];
    for (const f of recipes) {
      const b = await load(f), d = b.getChannelData(0), win = Math.round(b.sampleRate * 0.01), env = [];
      for (let i = 0; i < d.length; i += win) { let m = 0; for (let j = i; j < Math.min(d.length, i + win); j++) m = Math.max(m, Math.abs(d[j])); env.push(m); }
      const pk = Math.max(...env), ev = []; let s = -1, gap = 0;
      env.forEach((v, k) => { if (v > pk * 0.1) { if (s < 0) s = k; gap = 0; } else if (s >= 0 && ++gap > 15) { ev.push([s, k - gap]); s = -1; } });
      if (s >= 0) ev.push([s, env.length - 1]);
      out.push(`${f.padEnd(40)} ${b.duration.toFixed(2)}s ${b.numberOfChannels}ch ${b.sampleRate}Hz peak ${db(pk)}  ` + ev.map(([a, z]) => `${(a / 100).toFixed(2)}+${((z - a + 1) / 100).toFixed(2)}`).join(' '));
    }
    return out.join('\n');
  }
  const res = {};
  for (const r of recipes) {
    const len = Math.max(...r.layers.map(l => (l[4] || 0) + l[2] / (r.rate || 1)));
    const ctx = new OfflineAudioContext(1, Math.ceil(len * SR), SR);
    let node = ctx.createGain();
    const head = node;
    if (r.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = r.hp; node.connect(f); node = f; }
    if (r.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = r.lp; node.connect(f); node = f; }
    node.connect(ctx.destination);
    for (const [f, start, dur, gdb = 0, at = 0] of r.layers) {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = await load(f); s.playbackRate.value = r.rate || 1; g.gain.value = Math.pow(10, gdb / 20);
      s.connect(g); g.connect(head); s.start(at, start, dur);
    }
    const buf = await ctx.startRendering(), d = buf.getChannelData(0), n = d.length;
    const fi = Math.round((r.fadeIn ?? 0.002) * SR), fo = Math.round((r.fadeOut ?? 0.05) * SR);
    for (let i = 0; i < fi && i < n; i++) d[i] *= i / fi;
    for (let i = 0; i < fo && i < n; i++) d[n - 1 - i] *= i / fo;
    let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
    const k = pk > 0 ? Math.pow(10, (r.peak ?? -1) / 20) / pk : 1;
    // trim trailing near-silence
    let end = n; while (end > 1 && Math.abs(d[end - 1] * k) < 0.0015) end--;
    const bytes = new DataView(new ArrayBuffer(44 + end * 2)), w = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); bytes.setUint32(4, 36 + end * 2, true); w(8, 'WAVEfmt '); bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true);
    bytes.setUint32(24, SR, true); bytes.setUint32(28, SR * 2, true); bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true); w(36, 'data'); bytes.setUint32(40, end * 2, true);
    for (let i = 0; i < end; i++) bytes.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(d[i] * k * 32767))), true);
    let bin = ''; const u8 = new Uint8Array(bytes.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    res[r.out] = {b64: btoa(bin), dur: Math.round(end / SR * 100) / 100, gain: Math.round(db(k) * 10) / 10};
  }
  return res;
};

// ---- headless Chrome (same pattern as tools/headless-shot.mjs) ----
const args = process.argv.slice(2), scan = args.includes('--scan'), only = args.filter(a => !a.startsWith('--'));
const port = 9341, profile = `${process.env.TMPDIR || '/tmp/'}rgs-sfx-${Date.now()}`;
process.on('exit', () => { try { rmSync(profile, {recursive: true, force: true}); } catch {} });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', 'http://localhost:8000/tools/'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://localhost:${port}/json`)).json()).find(x => x.type === 'page')?.webSocketDebuggerUrl; } catch {} await sleep(300); }
const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const call = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({id: i, method, params})); });
await sleep(800);
const input = scan ? readdirSync(new URL('../assets/sfx/src/', import.meta.url)).filter(f => /\.(ogg|wav|mp3)$/.test(f)).sort()
  : RECIPES.filter(r => !only.length || only.some(o => r.out.startsWith(o)));
const r = await call('Runtime.evaluate', {expression: `(${PAGE})(${JSON.stringify(input)}, ${scan})`, awaitPromise: true, returnByValue: true});
if (r.result?.exceptionDetails) console.log('ERROR', r.result.exceptionDetails.exception?.description);
else if (scan) console.log(r.result.result.value);
else {
  const dir = new URL('../game/sfx/', import.meta.url); mkdirSync(dir, {recursive: true});
  for (const [f, v] of Object.entries(r.result.result.value)) {
    const buf = Buffer.from(v.b64, 'base64'); writeFileSync(new URL(f, dir), buf);
    console.log(`${f.padEnd(16)} ${String(v.dur).padStart(5)}s  ${String(Math.round(buf.length / 1024)).padStart(4)} KB  (normalize ${v.gain > 0 ? '+' : ''}${v.gain} dB)`);
  }
}
ws.send(JSON.stringify({id: ++id, method: 'Browser.close'})); await new Promise(r => { chrome.on('exit', r); setTimeout(r, 5000); }); process.exit(0);
