// The landing rules: tucked by default, one sticky touch pins (a hinge you can swing),
// a second sticky touch by a different part locks you in place with two points.
import { describe, expect, it } from 'vitest';
import { createPhysics, type BackendName } from '../../../packages/engine/src/physics/index.ts';
import { LIMBS, personMass, specFor, type PartTag } from '../../../packages/engine/src/person/person.ts';
import { TowerSim, isSticky } from '../src/tower.ts';
import { storySim } from '../src/story.ts';

const BACKENDS: BackendName[] = ['planck', 'box2d3-compat'];
const tag = (kind: PartTag['kind']): PartTag => ({ personId: 1, part: 'body', kind });

describe('sizes and shape', () => {
  it('viewers are half the host size and a quarter of the mass; the body is round', () => {
    expect(specFor(0.5).limbs.find((l) => l.name === 'neck')!.radius).toBeCloseTo(LIMBS.find((l) => l.name === 'neck')!.radius / 2, 6);
    expect(personMass(0.5)).toBeCloseTo(personMass(1) / 4, 3);
    const body = specFor(1).body;
    expect(body.kind).toBe('polygon');
    if (body.kind === 'polygon') expect(body.vertices).toHaveLength(8);
  });
});

describe('stickiness', () => {
  it('only head, hand and foot orbs are sticky', () => {
    expect(isSticky(tag('orb'), tag('body'))).toBe(true);
    expect(isSticky(tag('limb'), tag('orb'))).toBe(true);
    expect(isSticky(tag('body'), tag('body'))).toBe(false);
    expect(isSticky(tag('limb'), tag('body'))).toBe(false);
    expect(isSticky(tag('limb'), tag('limb'))).toBe(false);
  });
});

describe.each(BACKENDS)('%s landing', (name) => {
  it('falls tucked until a key is pressed', async () => {
    const p = await createPhysics(name);
    const sim = storySim(p);
    while (sim.roles.get(1) !== 'falling') sim.step();
    for (let i = 0; i < 10; i++) sim.step(); // well above the hand, no keys yet
    const person = sim.persons.get(1)!;
    expect(sim.dropperView(1)!.keys).toEqual([]);
    for (const l of person.spec.limbs) expect(person.stretch(l.name), l.name).toBeLessThan(0.01);
    p.dispose();
  });

  it('one sticky touch pins you; while it is your turn you hold the angle you landed at', async () => {
    const p = await createPhysics(name);
    const sim = storySim(p, { rotate: 0, reachLimbs: 0 });
    while (sim.roles.get(1) !== 'pivoting' && sim.time < 5) sim.step();
    expect(sim.roles.get(1)).toBe('pivoting');
    const a0 = sim.persons.get(1)!.bodyTransform().angle;
    for (let i = 0; i < 120; i++) sim.step(); // 2 s, no rotate key
    expect(sim.roles.get(1)).toBe('pivoting');
    expect(Math.abs(sim.persons.get(1)!.bodyTransform().angle - a0)).toBeLessThan(0.1);
    p.dispose();
  });

  it('rotating swings you around the pin until a second orb touches, then you are locked by two points', async () => {
    const p = await createPhysics(name);
    const sim = storySim(p);
    while (sim.roles.get(1) !== 'pivoting' && sim.time < 5) sim.step();
    const pinnedAt = sim.time;
    const a0 = sim.persons.get(1)!.bodyTransform().angle;
    while (sim.roles.get(1) === 'pivoting' && sim.time < pinnedAt + 4) sim.step();
    expect(sim.roles.get(1)).toBe('tower');
    expect(Math.abs(sim.persons.get(1)!.bodyTransform().angle - a0)).toBeGreaterThan(0.5); // it really swung
    const points = sim.bonds.filter((b) => b.b === 1 || b.a === 1).reduce((n, b) => n + b.points.length, 0);
    expect(points).toBeGreaterThanOrEqual(2);
    p.dispose();
  });

  it('single-player claw: the viewer waits on the claw until dropped, then lands and locks', async () => {
    const p = await createPhysics(name);
    const sim = new TowerSim(p, { seed: 3, drops: 3, bot: 'player', crane: true });
    let dropNow = false;
    sim.controller = (_s, _id, person) => {
      person.limbs = 0;
      person.drive = { rotate: 0, drift: 0 };
    };
    while (sim.activeId === null) sim.step();
    const id = sim.activeId!;
    const y0 = sim.persons.get(id)!.bodyTransform().y;
    for (let i = 0; i < 120; i++) sim.step(); // 2 s on the claw: it must not fall
    expect(sim.dropperView(id)!.onClaw).toBe(true);
    expect(Math.abs(sim.persons.get(id)!.bodyTransform().y - y0)).toBeLessThan(0.1);
    sim.release(id);
    dropNow = true;
    while (sim.roles.get(id) === 'falling' && sim.time < 30) sim.step();
    expect(['pivoting', 'tower']).toContain(sim.roles.get(id));
    expect(dropNow).toBe(true);
    p.dispose();
  });

  it('every locked person in a 20-drop game is held by at least two points', async () => {
    const p = await createPhysics(name);
    const sim = new TowerSim(p, { seed: 4, drops: 20, bot: 'player' });
    const m = sim.run();
    expect(m.nan).toBe(false);
    expect(m.blowup).toBe(false);
    expect(m.landed).toBeGreaterThan(12);
    for (const [id, role] of sim.roles) {
      if (role !== 'tower') continue;
      const pts = sim.bonds.filter((b) => b.a === id || b.b === id).reduce((n, b) => n + b.points.length, 0);
      expect(pts, `person #${id}`).toBeGreaterThanOrEqual(2);
    }
    p.dispose();
  });
});
