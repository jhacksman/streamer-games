// The scripted "story" drop used by the viewer's filmstrip and by tests: one viewer drops onto
// the streamer's outstretched right hand, presses K (left leg) just before landing, pins by the
// left foot, then holds a rotate key (plus J to reach) until a second orb touches and locks.
import type { Physics } from '../../../packages/engine/src/physics/types.ts';
import { LIMB_BITS } from '../../../packages/engine/src/person/person.ts';
import { TowerSim } from './tower.ts';

export interface StoryOptions {
  /** Where the viewer's body drops, relative to the streamer's right-hand orb (m). */
  offsetX?: number;
  /** Rotate key held once pinned: -1 = I (counter-clockwise), +1 = O (clockwise). */
  rotate?: number;
  /** Extra limb keys held once pinned. */
  reachLimbs?: number;
}

export function storySim(p: Physics, o: StoryOptions = {}): TowerSim {
  const sim = new TowerSim(p, { seed: 11, drops: 2, bot: 'player', turnTimeout: 12 });
  const hand = sim.streamer.partPosition('handR');
  const handTop = hand.y + sim.streamer.limb('armR').radius;
  sim.spawnAt = (n) => (n === 1 ? { x: hand.x + (o.offsetX ?? 0.18), angle: 0 } : { x: hand.x - 0.05, angle: 0 });
  sim.controller = (s, id, person, pinned) => {
    if (id !== 1) {
      // The second viewer just drops tucked and lets physics do the rest.
      person.limbs = 0;
      person.drive = { rotate: 0, drift: 0 };
      return;
    }
    if (!pinned) {
      const close = person.bodyTransform().y - handTop < 1.0;
      person.limbs = close ? LIMB_BITS.legL : 0; // tucked until close, then hold K
      person.drive = { rotate: 0, drift: 0 };
      return;
    }
    person.limbs = LIMB_BITS.legL | (o.reachLimbs ?? LIMB_BITS.armL);
    person.drive = { rotate: o.rotate ?? -1, drift: 0 };
  };
  return sim;
}
