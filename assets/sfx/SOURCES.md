# Sound effect sources

Recorded sources for the game's physical sound effects (guns, hits, mines, wrecks, engines, the pit air gun, the garage air drill, stamps).
`node tools/sfx-build.mjs` cuts, mixes and normalizes them into `game/sfx/*.wav`. The recipes are in that script, and
the game plays them from `SFX_SAMPLES` in `game/js/audio/sfx.js`. Interface, radio and race-info sounds are
synthesized in code and need no files.

Same rule as the music: **Public Domain / CC0 only** (CC-BY is OK with a credit line here; never CC-BY-SA).

| Files in `src/` | Source | License |
| --- | --- | --- |
| `impact*.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) by Kenney (kenney.nl) | CC0 |
| `explosionCrunch_*.ogg`, `lowFrequency_explosion_*.ogg` | [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) by Kenney (kenney.nl) | CC0 |
| `sfx100v2_switch_01.ogg` | [100 CC0 SFX #2](https://opengameart.org/content/100-cc0-sfx-2) on OpenGameArt | CC0 |
| `ppsh-burst-a.wav` | [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library) (Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney), Prepared SFX Library `PPSh/P_32P.wav`, 0.75 s + 1.0 s, cut to 48 kHz 16-bit | CC0 |
| `m45-burst-b.wav`, `m45-burst-c.wav` | Same library, `Carl Gustav M45/G_33P.wav`, 4.20 s + 1.1 s and 7.95 s + 1.0 s, cut to 48 kHz 16-bit | CC0 |
| `bigsoundbank-0600-acceleration-aston-martin.mp3` | [Acceleration Aston Martin](https://bigsoundbank.com/acceleration-aston-martin-s0600.html) by Joseph Sardin, BigSoundBank | CC0 |
| `bigsoundbank-0291-car-engine-2.mp3` | [Car Engine #2](https://bigsoundbank.com/car-engine-2-s0291.html) by Joseph Sardin, BigSoundBank | CC0 |
| `bigsoundbank-0290-motor-car-1.mp3` | [Motor car #1](https://bigsoundbank.com/motor-car-1-s0290.html) by Joseph Sardin, BigSoundBank | CC0 |
| `bigsoundbank-0965-impact-wrench.mp3` | [Impact wrench #2](https://bigsoundbank.com/impact-wrench-2-s0965.html) by Joseph Sardin, BigSoundBank | CC0 |

Kenney credit is appreciated but not required.
