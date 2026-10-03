# Freeway checklist

What the city freeways (`game/js/world/freeways.js`) still need to look reasonable. Freeways are scenery only: they never cross the circuit or its pits and never affect the race. Check each item in the track viewer (`game/?tracks`, add `&only=id,id` to focus) at the normal full-track zoom, then up close. `tools/freeway-check.js` measures items 1, 5, 6, 7, 8 and 10 on every track. Status as of 2026-09-24: [x] done, [~] partly done, [ ] not started.

- [x] **1. No flat crossings.** Two roads that cross at the same height look like a collision. Where roads cross, one flies over the other (at least 4 units of clearance), or they meet at a proper junction.
  *Done when:* no two decks overlap at the same height anywhere. **Status:** 0 flat crossings on every track (on-ramps that would cross another road try another spot).

- [x] **2. Free ends fade out.** Freeway ends and exit ramps come down on a ramp and dissolve with an ordered dither over their last 40 units (the `uFade` material control), instead of stopping dead on open ground. Traffic lights disappear as they reach the fade.
  *Done when:* no road ends abruptly. (Done 2026-09-24.)

- [x] **3. On-ramps as well as off-ramps.** Real freeways have both. Pair each exit with an on-ramp on the other side of the road (or just past it), so the junction reads as a working interchange rather than a single slip road.
  *Done when:* every exit has a matching on-ramp. **Status:** exits and on-ramps come as a pair (a diamond: the on-ramp further along the same side, dithering in from the ground) or not at all. 14 cities have one; 10 have no dry land for it (mostly the shore viaducts: Hong Kong, Seoul, Mumbai, Rio, Chicago, Havana, plus Seattle, Lagos, San Francisco, Sydney).

- [~] **4. Clean splits and merges.** Where a branch leaves or a ramp joins, two slabs currently overlap. The deck should widen into a tapered wedge (the "gore") and then divide, so it looks like one road splitting in two.
  *Done when:* no overlapping or z-fighting slabs at any split or merge. **Status:** rails, lane dashes and lamps over another road's deck are left out, so splits read as one deck forking in a V. The two slabs still overlap underneath (same colour, so it doesn't show at normal zoom).

- [~] **5. Believable heights and slopes.** Keep a maximum grade on ramps, no sudden steps in height, connectors meeting the road they join at exactly its height, and a flyover that clears the road beneath by a full deck's height.
  *Done when:* no visible step or gap where two roads join, and no ramp steeper than about 1 in 8. **Status:** joins meet exactly (0 step everywhere) and ramps, the stack flyover and its directional connector are 1 in 8.5. Bridges arching over water are steeper (1 in 7.2 to 7.9), and San Francisco's is 1 in 5.6.

- [x] **6. Sensible pillars.** Pillars are evenly spaced and never stand on a lower road, the circuit's verge or another pillar. Pillars in water get a wider pier base. Tall flyovers get sturdier pillars than low ramps.
  *Done when:* no pillar pokes through a deck or stands on a road. **Status:** 0 pillars on roads on every track (a pillar that would stand on a lower deck is left out).

- [~] **7. Smooth curves only.** Pushing roads clear of the circuit can still leave kinks. Freeways should have a minimum curve radius (freeways bend gently) and no zigzags near their ends. Extend `tools/kink-check.js`, or add a freeway check, to flag sharp bends.
  *Done when:* the check reports no bend tighter than the minimum radius. **Status:** tightest bend 21 to 92 units on every track (the stack's connector was 6, now 40). Shore roads that follow the coast are the tightest (21 to 31).

- [~] **8. Each city's freeway is in the picture.** On some tracks the freeway sits at or beyond the edge of the full-track view (Victoria Harbour Streets, Vltava Ring, Gangnam Twist). The main feature (the interchange, the bridge, the shore road) should be clearly visible without zooming out.
  *Done when:* every track shows its freeway's main feature in the full-track view. **Status:** 14% to 56% of each track's solid freeway is in the full-track view; the interchange, split and exit points are framed. Lagos (14%), Berlin (18%) and Prague (23%) show least.

- [~] **9. Traffic that behaves.** Traffic lights drive on the correct side for their direction, follow ramps on and off rather than looping on one road, never run off a faded end into nothing, and thin out on ramps compared with the main road.
  *Done when:* no light disappears mid-road or drives into a dead end. **Status:** main roads are two-way and drive on the right; exits, on-ramps and connectors are one-way, single file and quieter. Lights still don't pass from one road to another.

- [~] **10. No clashes with the rest of the city.** Shadows lie along their deck (a mirrored-rotation bug, fixed 2026-09-24). Freeways never clip through a landmark, never run half on the water's edge, and cross water only as a clear bridge (a raised deck on piers), never skimming along the surface. The shore viaduct sits cleanly over the water or cleanly on the bank.
  *Done when:* a close-up sweep of every track shows no clipping, and no deck half over water. **Rule (2026-09-24): a road may only come down on dry land.** Over water, roads stay up as bridges and viaducts: an exit or on-ramp whose low half would be over water is placed elsewhere or not at all, and a road end whose descent would cross water stays up and just fades. `tools/freeway-check.js` reports `landsInWater` (0 on every track). **Status:** no landmark clipping anywhere; shore roads are offshore viaducts wholly over the water. Up to 21% of some decks still straddle a shoreline, mostly where a bridge crosses a riverbank.
