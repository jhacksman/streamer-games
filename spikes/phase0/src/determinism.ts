import { createPhysics, type BackendName } from '../../../packages/engine/src/physics/index.ts';
import { TowerSim, type TowerConfig } from './tower.ts';

export const DETERMINISM_CONFIG: TowerConfig = { seed: 7, drops: 20, placement: 'random', aim: true };
export const DETERMINISM_STEPS = 1800;

export async function fingerprint(backend: BackendName, steps = DETERMINISM_STEPS): Promise<string> {
  const p = await createPhysics(backend);
  const sim = new TowerSim(p, DETERMINISM_CONFIG);
  for (let i = 0; i < steps; i++) sim.step();
  const f = sim.fingerprint();
  p.dispose();
  return f;
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const out: Record<string, string[]> = {};
  for (const b of ['planck', 'box2d3-compat', 'box2d3-deluxe'] as BackendName[]) {
    out[b] = [await fingerprint(b), await fingerprint(b)];
  }
  console.log(JSON.stringify(out, null, 2));
}
