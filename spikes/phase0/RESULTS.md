# Phase 0 results: physics head-to-head

**Winner: Box2D v3 (box2d3-wasm 5.2.0, Box2D v3.2). Planck.js stays in the adapter as a fallback.**

Reproduce with `npm run phase0`, which writes `results.json`. Regression gates live in `test/phase0.test.ts` (`npm test`).
Measured on an Apple Silicon Mac, single-threaded. First run on Node 23.11; re-run on **Node 26.11** after the solid-limbs change (`results.json` holds the latest).

## Gate

| Gate (PLAN.md §15, Phase 0) | Result |
|---|---|
| No NaN or blow-ups | ✅ Both engines, across every test, once the test rig was fixed (see finding 6) |
| Wobble looks right | ✅ Checked in the viewer (`npm run phase0:viewer`). Springy bonds wobble, and people freeze crooked. |
| Under 4 ms per physics step with 50 people | ✅ Box2D 0.036 ms, Planck 0.166 ms |
| Every adapter feature works | ✅ 65 tests pass on Planck, Box2D compat, and Box2D deluxe |
| Straight stack holds; leaning stack fails | ✅ A straight column of 50 (and of 100) stands, with bottom compression within ±11% of the weight. A column leaning 12 cm per person fails by bending (33–37 snaps). |
| Determinism (Box2D v3) | ✅ Bit-identical run to run, compat vs. deluxe build, and Node vs. Chrome |

## Head-to-head numbers

| Test | Planck | Box2D v3 |
|---|---|---|
| Physics step, 50-person pile (avg / p95) | 0.166 / 0.224 ms | **0.036 / 0.059 ms** |
| Physics step, 157-beam bridge | 0.528 ms | **0.073 ms** |
| Physics step, 100-person column | 0.276 ms | **0.044 ms** |
| Whole frame incl. game logic, 50-person pile (avg / p95) | 0.342 / 1.09 ms | 0.664 / 1.78 ms |
| 50-person rigid column: bottom compression (expected 33,641 N) | 34,220 N | 32,897 N |
| 100-person rigid column: bottom compression (expected 67,283 N) | 59,682 N | 74,779 N |
| Top sag of the 100-person column over 10 s | 0.21 m | 0.81 m |
| Bridge: car crosses / 2 t anvil / 40 t anvil | crosses / 0 snaps / 2 snaps | crosses / 0 snaps / 3 snaps |
| Same fingerprint in Node and Chrome | ❌ diverges (repeatable within each) | ✅ identical |
| Compat build = deluxe (SIMD) build | n/a | ✅ identical |

### Why Box2D v3

- **4–7× faster physics.**
- **Cross-environment determinism.** Planck repeats within one environment but diverged between Node and Chrome. We need determinism for Fartman replays, play-along, and recorded room solutions.
- **Tolerates abuse better.** With the original motor-pinned base, Planck blew up in every tower run and Box2D didn't.
- **Has everything we need:** soft welds, constraint force and torque, plus built-in force and torque thresholds we haven't used yet.

### Risks and mitigations

- **box2d3-wasm is a small project.** Pin the exact version, vendor it before launch, and keep the Planck backend working.
- **Every JS→WASM call costs something.** Our game logic (sticky scans, stress reads) makes many small calls, so with Box2D the *whole frame* is slower than Planck's even though physics is 5× faster. Still under 2 ms at 50 people. Fix in Phase 1: read every transform once per step into a typed array, and use a spatial hash for sticky scans.
- **Box2D v3 builds rotations with a fast approximate cos/sin** (about 1e-3 rad of error). Harmless for gameplay; the tests allow for it.
- **Our own game code uses JS `Math.sin`/`cos`.** V8 (Node, Chrome, Electron) agrees with itself; Safari may not. Before Fartman play-along, game-side math needs deterministic helpers.

## Design findings (these change the game, not just the engine)

1. **Bond stress uses a masonry rule, not four independent limits.**
   - With independent limits, the bottom bond always snapped from "twist" around 7–10 m, because it carries the bending of everything above it.
   - Under the masonry rule, a bond is a joint of some width. Bending makes tension on one edge, and the weight pressing down cancels it. A bond only fails once the load shifts past its edge.
   - Result: straight stacks hold indefinitely and leaning ones fail. That's "compression super strong" with real physics behind it.
2. **One bond per pair of people.** A second weld between the same two people fought the first, because the springy weld had rotated in between, which created huge internal forces. Extra touches between an already-bonded pair now **widen** the bond instead, and a wider bond resists bending better.
3. **Bonded pairs don't collide.** A weld locked onto a slight overlap fights the contact solver (one person saw 17,000 N of tension). Touching orbs are found geometrically (orbs as circles, the body as a capsule) every 0.1 s, so they still bond.
4. **The streamer's bonds never snap.** Any single 0.25 m bond under a tall column fails once the column leans half a degree. The streamer is the foundation, and **losing balance is the main failure**, as in the original pitch. Person-to-person bonds still snap at bad overhangs.
5. **Wobble and height pull against each other.**
   - Springy (12 Hz) bonds wobble nicely but can't hold a 50-high column on either engine.
   - Fully rigid bonds are worst under landing impacts.
   - Towers in the current tuning top out around 13–22 m. Tune in Phase 4. Options: stiffer bonds lower down, bonds that stiffen once settled, and higher tension limits.
6. **Test-rig lesson.** Pinning the base with enormous motors (10⁹ N·m) made Planck blow up. A weld is the right way to fix something in place.
7. **Freezing on first contact makes towers crooked by nature.** People freeze mid-topple, and the next drop lands on whatever is highest. Aiming (Q/R, U/P air control) and limb shapes matter a lot.
8. **The stand-in balancing bot collapses at about 7 people** with the current cart and ankle tuning. The real streamer controls need tuning in Phase 4 so balancing is hard but fair.

## What was built (reused by later phases)

- `packages/engine/src/physics/`:
  - `types.ts`: the adapter API
  - `box2d3.ts`, `planck.ts`: the backends
  - `index.ts`: the loader, including pinned compat/deluxe builds
  - `stress.ts`: the masonry and independent stress models, plus the smoothed snap tracker
- `packages/engine/src/person/person.ts`: the stumpy humanoid with sticky orbs. One body plus head, hands and feet orbs on 5 stretch joints. Limbs are tucked until a key is held. Includes freeze/unfreeze with momentum preserved, and air control (drift and rotate).
- `spikes/phase0/`:
  - `src/tower.ts`: the tower sim
  - `src/column.ts`: controlled tall chains
  - `src/truss.ts`: the bridge
  - `src/determinism.ts`
  - `src/run.ts`
  - `viewer/`: live view, showcase (`?mode=showcase`), and determinism check (`?mode=determinism`)

## Addendum: solid limbs, Node 26, and a box2d3-wasm bug (2026-10-09)

**Solid limbs (your call).** Every limb is now a solid beam, so stretched people are scaffolding others land on and stick to.
- While live, each beam rides on its orb and is rebuilt as the limb stretches.
- When frozen, beams are baked into the compound body.
- A falling person's limb hitting the tower counts as the landing.

The upgrade surfaced four things:

1. **box2d3-wasm bug: zero-density shapes could zero a body's rotational inertia.**
   - Symptom: a frozen person spun at a constant rate forever, dragging the streamer over.
   - Cause: Box2D then treats a body like that as unrotatable, so no weld can stop it.
   - It only happened after the world had been stepped. The first zero-density beam added to the new body made its inertia exactly 0, while mass stayed correct.
   - **Fix:** limb beams use density 0.001 instead of 0 (still effectively weightless).
   - A regression test covers it.
   - Worth reporting upstream (I haven't, since posting publicly needs your OK).
2. **The same bug caused run-to-run drift.** For a while, worlds sharing one WASM instance didn't repeat. With the fix, shared-instance runs repeat exactly again. Each world still gets a fresh WASM instance by default (about 10 ms) as insurance.
3. **Frozen tower members no longer collide with each other (or with the streamer).** Overlapping frozen limbs fought their welds and snapped bonds with forces up to millions of newtons. Touching members bond by proximity instead. Falling people and debris still collide with everything.
4. **Springy bonds in closed loops fight each other.** A bond remembers its angle when it forms, so when a loop closes around a bond that has flexed, the springs pull against each other permanently (about 100,000 N at 12 Hz).
   - A 2 s re-stick cooldown after a snap stops snap/re-stick churn.
   - **Rigid bonds build much taller towers:**

     | | Spiky drops | Random drops |
     |---|---|---|
     | Box2D, rigid | 42.1 m (22 people) | 24.4 m |
     | Planck, rigid | 26.3 m | 27.0 m |
     | Box2D, springy (12 Hz) | 18.5 m | 12.7 m |
     | Planck, springy (12 Hz) | 17.6 m | 12.3 m |

   - **Wobble vs. height is the big Phase 4 tuning call.**

**Sticky bonds between new pairs are rare** with the summit-aiming test bot, which always lands on exactly one person. A sticky radius (`stickyRadius`) is now tunable. Real players aiming into gaps between two people should trigger it; tune in Phase 4.

**Frame-time watch.** With 11 shapes per person, the sticky scan costs more. The worst case (a 50-person pile, everything sticky) hit a 3.3 ms p95 whole frame on Box2D, still under 4 ms. Phase 1: spatial hash plus batched transform reads.
