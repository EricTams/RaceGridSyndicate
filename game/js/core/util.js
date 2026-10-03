// Small shared helpers.
'use strict';

const $=id=>document.getElementById(id);
const mod=(a,n)=>((a%n)+n)%n;
const rand=(a,b)=>a+Math.random()*(b-a);
// Frees the GPU memory behind a removed object tree (geometries, materials, their textures). Removing an object
// from the scene alone leaves all of it on the GPU; a new track every race piles up until the GPU gives out.
// Shared geometries and materials are safe to free too: three.js uploads them again the next time they're drawn.
function disposeTree(root){
  const seen=new Set(),free=x=>{if(x&&!seen.has(x)){seen.add(x);x.dispose();}};
  root.traverse(o=>{
    free(o.geometry);
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(!m)return;
      Object.values(m).forEach(v=>{if(v&&v.isTexture)free(v);});
      if(m.uniforms)Object.values(m.uniforms).forEach(u=>{if(u&&u.value&&u.value.isTexture)free(u.value);});
      free(m);});
  });
}
// Showing what a choice did: an action sets uiPop to a key, and the next render of that screen flashes the
// element carrying data-pop="key" (see .pop in game.css).
let uiPop=null;
function popIn(root){if(!uiPop)return;const el=root.querySelector(`[data-pop="${uiPop}"]`);if(el)el.classList.add('pop');uiPop=null;}
// The bank figure flashes whenever it changed since that screen last drew it.
const bankSeen={};
function bankPop(root,key){const el=root.querySelector('.gbank');if(!el)return;const v=TEAMS[0].cash.toFixed(2);if(bankSeen[key]!=null&&bankSeen[key]!==v){el.classList.add('pop');sfx(+v>+bankSeen[key]?'cashIn':'cashOut');}bankSeen[key]=v;}
