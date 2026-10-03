# Credits

Race Grid Syndicate shows these credits on its first screen (`game/js/ui/credits.js`). The music, track and map
credits are required by their licenses and must stay visible in the game.

## Required

- **Music: *Night on Bald Mountain*** (Mussorgsky, piano arrangement by Konstantin Chernov). Typeset by Robert
  Clausecker, Mutopia Project ([piece 1892](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1892)), licensed
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Changes: only the opening 64 bars are used, converted to the game's
  song format and played on its synth in its own arrangements. Every other piece is public domain; the full list is
  in `assets/music/src/SOURCES.md`.
- **Track shapes:** circuit outlines from [f1-circuits](https://github.com/bacinger/f1-circuits) by Tomislav Bacinger,
  MIT license (text in `licenses/f1-circuits-MIT.txt`). They are used in `sim/f1-circuits.geojson` and, reshaped, in
  `game/js/data/tracks.js`.
- **City maps:** water, freeways and landmark positions for the geo-placed cities come from
  © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under the
  [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). The data derived from it
  (`game/js/data/waters.js`, `game/js/data/scenery.js`) is available under the ODbL as well.

## By choice (CC0)

Sound effects, full list in `assets/sfx/SOURCES.md`:

- [Kenney](https://kenney.nl): Impact Sounds and Sci-fi Sounds
- [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library): Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney
- Joseph Sardin, [BigSoundBank](https://bigsoundbank.com)
- [100 CC0 SFX #2](https://opengameart.org/content/100-cc0-sfx-2) on OpenGameArt

## Loaded from CDNs (not redistributed)

- Fonts: Press Start 2P (CodeMan38) and VT323 (Peter Hull), SIL Open Font License, via Google Fonts
- [three.js](https://threejs.org) r128, MIT, via cdnjs
