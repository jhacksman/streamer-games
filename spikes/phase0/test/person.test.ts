import { describe, expect, it } from 'vitest';
import { createPhysics, type BackendName, type Physics } from '../../../packages/engine/src/physics/index.ts';
import { LIMBS, LIMB_BITS, Person, personMass, targetsFor, type PartName, type PartTag } from '../../../packages/engine/src/person/person.ts';

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

  it('limbs are solid, weightless beams that follow the stretch, live and frozen', async () => {
    const p = await createPhysics(name, { gravity: { x: 0, y: 0 } });
    const person = new Person(p, { id: 1, position: { x: 0, y: 2 }, filter: FILTER, limbs: 0 });
    const limbShapes = () => person.shapes().filter((sh) => (p.shape(sh)!.opts.tag as PartTag).kind === 'limb');
    expect(person.shapes()).toHaveLength(11);
    expect(limbShapes()).toHaveLength(5);
    const armBeam = () => {
      const sh = limbShapes().find((x) => (p.shape(x)!.opts.tag as PartTag).part === 'armL')!;
      const g = p.shape(sh)!.geom;
      return g.kind === 'box' ? 2 * g.hx : 0;
    };
    const tucked = armBeam();
    person.limbs = LIMB_BITS.armL;
    settle(p, person, 60);
    const arm = LIMBS.find((l) => l.name === 'armL')!;
    expect(armBeam()).toBeGreaterThan(tucked + 0.45);
    expect(Math.abs(armBeam() - (arm.tucked + arm.reach))).toBeLessThan(0.05);
    const mass = [...person.parts.values()].reduce((m, b) => m + p.getMass(b), 0);
    expect(mass).toBeCloseTo(personMass(), 0); // beams add no mass
    const body = person.freeze();
    expect(p.getMass(body)).toBeCloseTo(personMass(), 0);
    expect(limbShapes()).toHaveLength(5);
    expect(armBeam()).toBeGreaterThan(tucked + 0.45);
    p.dispose();
  });

  it("a falling person's outstretched arm is what lands", async () => {
    const p = await createPhysics(name);
    // A short ledge to the left, only the stretched left arm can reach it.
    const ledge = p.createBody({ type: 'static', position: { x: -0.85, y: 0 } });
    p.addShape(ledge, { kind: 'box', hx: 0.12, hy: 0.1 }, { contactEvents: true, tag: { ground: true } });
    const person = new Person(p, { id: 1, position: { x: 0, y: 1.2 }, filter: FILTER, limbs: LIMB_BITS.armL, contactEvents: true });
    settle(p, person, 1);
    let firstKind: string | null = null;
    for (let i = 0; i < 120 && !firstKind; i++) {
      person.update();
      p.step(DT);
      for (const c of p.contactBegins()) {
        for (const sh of [c.shapeA, c.shapeB]) {
          const tag = p.shape(sh)?.opts.tag as PartTag | undefined;
          if (tag && 'kind' in tag) firstKind = tag.kind;
        }
      }
    }
    expect(firstKind).toBe('limb');
    p.dispose();
  });

  it('frozen limbs are scaffolding: a box dropped on an outstretched arm rests on it', async () => {
    const p = await createPhysics(name);
    // People spawn already in their pose, so freeze and pin right away (before gravity moves it).
    const person = new Person(p, { id: 1, position: { x: 0, y: 2 }, filter: FILTER, limbs: 31 });
    const body = person.freeze();
    const pin = p.createBody({ type: 'static', position: { x: 0, y: 2 } });
    p.createWeld({ bodyA: pin, bodyB: body, anchor: { x: 0, y: 2 } });
    // Drop a small box above the middle of the left arm beam (not over an orb).
    const armL = LIMBS.find((l) => l.name === 'armL')!;
    const reachX = Math.cos(armL.angle) * (armL.tucked + armL.reach) * 0.55 + armL.root.x;
    const reachY = 2 + armL.root.y + Math.sin(armL.angle) * (armL.tucked + armL.reach) * 0.55;
    const box = p.createBody({ type: 'dynamic', position: { x: reachX, y: reachY + 0.6 } });
    p.addShape(box, { kind: 'box', hx: 0.05, hy: 0.05 }, { density: 50, friction: 1 });
    for (let i = 0; i < 90; i++) p.step(DT);
    expect(p.getTransform(box).y).toBeGreaterThan(reachY - 0.1);
    p.dispose();
  });

  it('a person frozen after stepping can still be turned (non-zero rotational inertia)', async () => {
    // Regression: zero-density limb beams once zeroed a frozen body's inertia in box2d3-wasm.
    const p = await createPhysics(name, { gravity: { x: 0, y: 0 } });
    for (const limbs of [0, 16, 31]) {
      const person = new Person(p, { id: limbs + 1, position: { x: limbs * 4, y: 0 }, angle: 0.4, limbs, filter: FILTER });
      settle(p, person, 3);
      const body = person.freeze();
      const w0 = p.getVelocity(body).w;
      p.applyAngularImpulse(body, 10);
      const dw = p.getVelocity(body).w - w0;
      expect(dw, `limbs ${limbs}`).toBeGreaterThan(0.1);
      expect(dw, `limbs ${limbs}`).toBeLessThan(5);
    }
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
