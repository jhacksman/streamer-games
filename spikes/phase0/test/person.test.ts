import { describe, expect, it } from 'vitest';
import { createPhysics, type BackendName, type Physics } from '../../../packages/engine/src/physics/index.ts';
import { LIMBS, LIMB_BITS, Person, personMass, targetsFor, type PartName } from '../../../packages/engine/src/person/person.ts';

const BACKENDS: BackendName[] = ['planck', 'box2d3-compat', 'box2d3-deluxe'];
const DT = 1 / 60;
const FILTER = { category: 0x0004, mask: 0xffff };

function settle(p: Physics, person: Person, steps: number) {
  for (let i = 0; i < steps; i++) {
    person.update();
    p.step(DT);
  }
}

describe.each(BACKENDS)('%s goo person', (name) => {
  it('is a body plus five orbs on five stretch joints, about 70 kg', async () => {
    const p = await createPhysics(name, { gravity: { x: 0, y: 0 } });
    const person = new Person(p, { id: 1, position: { x: 0, y: 2 }, filter: FILTER });
    expect(person.parts.size).toBe(6);
    expect(person.joints.size).toBe(5);
    const m = [...person.parts.values()].reduce((s, b) => s + p.getMass(b), 0);
    expect(m).toBeCloseTo(personMass(), 0);
    expect(m).toBeGreaterThan(60);
    expect(m).toBeLessThan(80);
    p.dispose();
  });

  it('starts tucked, stretches each limb and the neck on command, and tucks back', async () => {
    const p = await createPhysics(name, { gravity: { x: 0, y: 0 } });
    const person = new Person(p, { id: 1, position: { x: 0, y: 2 }, filter: FILTER, limbs: 0 });
    settle(p, person, 30);
    for (const l of LIMBS) expect(person.stretch(l.name), `${l.name} tucked`).toBeLessThan(0.03);
    person.limbs = LIMB_BITS.armL | LIMB_BITS.legR | LIMB_BITS.neck;
    settle(p, person, 60);
    const targets = targetsFor(person.limbs);
    for (const l of LIMBS) expect(Math.abs(person.stretch(l.name) - targets[l.name]), `${l.name} stretched`).toBeLessThan(0.03);
    person.limbs = 0;
    settle(p, person, 60);
    for (const l of LIMBS) expect(person.stretch(l.name), `${l.name} tucked again`).toBeLessThan(0.03);
    p.dispose();
  });

  it('freeze keeps mass and momentum; unfreeze restores the same pose and stretch', async () => {
    const p = await createPhysics(name, { gravity: { x: 0, y: 0 } });
    const person = new Person(p, { id: 1, position: { x: 0, y: 2 }, filter: FILTER, limbs: LIMB_BITS.armL | LIMB_BITS.neck }, );
    settle(p, person, 60);
    for (const b of person.parts.values()) p.setVelocity(b, { vx: 3, vy: -1, w: 0 });
    const before = new Map([...person.parts].map(([k, b]) => [k, p.getTransform(b)]));
    const stretchBefore = new Map(LIMBS.map((l) => [l.name, person.stretch(l.name)]));
    const body = person.freeze();
    expect(person.state).toBe('frozen');
    expect(p.getMass(body)).toBeCloseTo(personMass(), 0);
    const v = p.getVelocity(body);
    expect(v.vx).toBeCloseTo(3, 2);
    expect(v.vy).toBeCloseTo(-1, 2);
    expect(Math.abs(v.w)).toBeLessThan(1e-3);
    for (const l of LIMBS) expect(person.stretch(l.name)).toBeCloseTo(stretchBefore.get(l.name)!, 2);
    p.setVelocity(body, { vx: 0, vy: 0, w: 0 });
    person.unfreeze(false);
    expect(person.parts.size).toBe(6);
    for (const [k, t] of before) {
      const now = p.getTransform(person.parts.get(k as PartName)!);
      expect(Math.hypot(now.x - t.x, now.y - t.y), `${k} position`).toBeLessThan(2e-3);
    }
    for (const l of LIMBS) expect(person.stretch(l.name)).toBeCloseTo(stretchBefore.get(l.name)!, 2);
    p.dispose();
  });

  it('air control: drift moves sideways, rotate spins', async () => {
    const p = await createPhysics(name, { gravity: { x: 0, y: 0 } });
    const person = new Person(p, { id: 1, position: { x: 0, y: 2 }, filter: FILTER });
    person.drive = { drift: 1, rotate: 0 };
    settle(p, person, 60);
    expect(person.bodyTransform().x).toBeGreaterThan(1);
    expect(p.getVelocity(person.parts.get('body')!).vx).toBeLessThan(2.8); // capped
    person.drive = { drift: 0, rotate: 1 };
    const a0 = person.bodyTransform().angle;
    settle(p, person, 30);
    expect(person.bodyTransform().angle).toBeLessThan(a0 - 0.2); // clockwise
    p.dispose();
  });

  it('survives 20 freeze/unfreeze cycles under gravity without NaN', async () => {
    const p = await createPhysics(name);
    const g = p.createBody({ type: 'static', position: { x: 0, y: 0 } });
    p.addShape(g, { kind: 'box', hx: 20, hy: 0.5, center: { x: 0, y: -0.5 } });
    const person = new Person(p, { id: 1, position: { x: 0, y: 3 }, filter: FILTER, limbs: 31 });
    for (let c = 0; c < 20; c++) {
      settle(p, person, 15);
      person.freeze();
      for (let i = 0; i < 10; i++) p.step(DT);
      person.unfreeze();
    }
    settle(p, person, 60);
    for (const b of person.bodies()) {
      const t = p.getTransform(b);
      expect(Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.angle)).toBe(true);
      expect(t.y).toBeGreaterThan(-0.5);
    }
    p.dispose();
  });
});
