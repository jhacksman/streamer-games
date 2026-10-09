// Phase 0 gates as regression tests (fast versions of npm run phase0).
import { describe, expect, it } from 'vitest';
import { createPhysics, type BackendName } from '../../../packages/engine/src/physics/index.ts';
import { TowerSim } from '../src/tower.ts';
import { runColumn } from '../src/column.ts';
import { runTruss } from '../src/truss.ts';
import { fingerprint } from '../src/determinism.ts';

const LIMITS = { compression: 1e9, tension: 20000, shear: 20000, twist: 2600, model: 'masonry' as const, width: 0.25 };

describe.each(['planck', 'box2d3-compat'] as BackendName[])('%s phase 0 gates', (name) => {
  it('a straight 50-person column stands and reads compression correctly', async () => {
    const p = await createPhysics(name);
    const r = runColumn(p, { people: 50, offset: 0, angularHertz: 0, seconds: 5, limits: LIMITS, snapping: true });
    p.dispose();
    expect(r.nan).toBe(false);
    expect(r.standing).toBe(50);
    expect(r.snaps).toBe(0);
    expect(r.bottom!.compression).toBeGreaterThan(0.9 * r.expectedBottomCompression);
    expect(r.bottom!.compression).toBeLessThan(1.1 * r.expectedBottomCompression);
    expect(r.stepMsP95).toBeLessThan(4);
  });

  it('a leaning column fails by bending', async () => {
    const p = await createPhysics(name);
    const r = runColumn(p, { people: 50, offset: 0.12, angularHertz: 0, seconds: 5, limits: LIMITS, snapping: true });
    p.dispose();
    expect(r.nan).toBe(false);
    expect(r.snaps).toBeGreaterThan(5);
  });

  it('a 20-drop tower runs with no NaN or blow-ups', async () => {
    const p = await createPhysics(name);
    const m = new TowerSim(p, { seed: 1, drops: 20, bot: 'player', limits: LIMITS }).run();
    p.dispose();
    expect(m.nan).toBe(false);
    expect(m.blowup).toBe(false);
    expect(m.landed).toBeGreaterThan(10);
  });
});

describe('box2d3 bridge truss', () => {
  it('a light car crosses; a 40 t anvil snaps pins; nothing blows up', async () => {
    const car = runTruss(await createPhysics('box2d3-compat'), { panels: 40, panelWidth: 1.5, height: 2, load: 1, pinLimit: 950000, seconds: 12 });
    expect(car.snaps).toBe(0);
    expect(car.vehicleX).toBeGreaterThan(60);
    expect(car.blowup).toBe(false);
    const anvil = runTruss(await createPhysics('box2d3-compat'), { panels: 40, panelWidth: 1.5, height: 2, load: 1, anvil: 40000, pinLimit: 950000, seconds: 8 });
    expect(anvil.snaps).toBeGreaterThan(0);
    expect(anvil.nan).toBe(false);
  });
});

describe('box2d3 determinism', () => {
  it('is repeatable, and the compat and deluxe builds agree bit for bit', async () => {
    const a = await fingerprint('box2d3-compat', 900);
    expect(await fingerprint('box2d3-compat', 900)).toBe(a);
    expect(await fingerprint('box2d3-deluxe', 900)).toBe(a);
  });
});
