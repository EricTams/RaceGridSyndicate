// CREDITS: the first screen of a new career. The music, track and map credits here are required by their licenses
// (CC BY 3.0, MIT, ODbL) and must stay reachable in the game; the sound effects are CC0 and credited by choice.
// The repo's own list, with license files, is CREDITS.md at the root.
'use strict';

let creditsThen=null;
function openCredits(then){
  creditsThen=then;
  const a=(href,text)=>`<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  $('credits').innerHTML=`
    <h3>RACE GRID SYNDICATE</h3>
    <dl class="crlist">
      <dt>MUSIC</dt><dd>Played live from public-domain scores typeset by the ${a('https://www.mutopiaproject.org/','Mutopia Project')}.
        <i>Night on Bald Mountain</i> (Mussorgsky, arr. Konstantin Chernov): typeset by Robert Clausecker, Mutopia Project,
        ${a('https://creativecommons.org/licenses/by/3.0/','CC BY 3.0')}. Opening bars only, rearranged.</dd>
      <dt>TRACKS</dt><dd>Circuit outlines from ${a('https://github.com/bacinger/f1-circuits','f1-circuits')} by Tomislav Bacinger (MIT).</dd>
      <dt>CITY MAPS</dt><dd>Water, freeways and landmark positions © ${a('https://www.openstreetmap.org/copyright','OpenStreetMap contributors')} (ODbL).</dd>
      <dt>SOUND</dt><dd>CC0 recordings by ${a('https://kenney.nl','Kenney')}, the ${a('https://opengameart.org/content/the-free-firearm-sound-library','Free Firearm Sound Library')}
        (Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney), Joseph Sardin of ${a('https://bigsoundbank.com','BigSoundBank')}, and ${a('https://opengameart.org/content/100-cc0-sfx-2','OpenGameArt')}.</dd>
      <dt>TYPE &amp; 3D</dt><dd>Press Start 2P (CodeMan38) and VT323 (Peter Hull), SIL Open Font License. ${a('https://threejs.org','three.js')} (MIT).</dd>
    </dl>
    <div class="gfoot"><span></span><button id="crDone">START</button></div>`;
  $('creditsOv').hidden=false;
  $('crDone').addEventListener('click',()=>{$('creditsOv').hidden=true;const f=creditsThen;creditsThen=null;f&&f();});
}
