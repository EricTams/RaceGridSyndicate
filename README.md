# Race Grid Syndicate

A cyberpunk race-team manager: hire a crew, build the car, dial in the Night Tune, and run your two cars through
neon street races across ten seasons.

**Play:** https://erictams.github.io/RaceGridSyndicate/game/

## Running locally

`./play.sh` serves the folder on http://localhost:8000/ and opens it. There is no build step: the game is plain
HTML, CSS and JavaScript in `game/`.

## Where things are

- `game/`: the game (see `docs/ARCHITECTURE.md`)
- `docs/`: the design doc and architecture notes
- `assets/`: music and sound-effect sources, with their licenses in each `SOURCES.md`
- `sim/`, `tools/`: balance simulations, track and scenery tools, the sound-effect builder
- `prototypes/`: the frozen early prototypes

## Credits

See [CREDITS.md](CREDITS.md). The game also shows them on its first screen.
