// Conformance tests: every backend must honor the conventions in physics/types.ts.
import { describe, expect, it } from 'vitest';
import { createPhysics, type BackendName, type Physics } from '../../../packages/engine/src/physics/index.ts';

const BACKENDS: BackendName[] = ['planck', 'box2d3-compat', 'box2d3-deluxe'];
const DT = 1 / 60;

function ground(p: Physics, contactEvents = false) {
  const g = p.createBody({ type: 'static', position: { x: 0, y: 0 } });
  p.addShape(g, { kind: 'box', hx: 50, hy: 0.5, center: { x: 0, y: -0.5 } }, { contactEvents });
  return g;
}
function box(p: Physics, x: number, y: number, opts: Parameters<Physics['addShape']>[2] = {}, angle = 0) {
  const b = p.createBody({ type: 'dynamic', position: { x, y }, angle });
  p.addShape(b, { kind: 'box', hx: 0.5, hy: 0.5 }, { density: 1, ...opts });
  return b;
}
function run(p: Physics, steps: number) {
  for (let i = 0; i < steps; i++) p.step(DT);
}

describe.each(BACKENDS)('%s adapter', (name) => {
  it('falls under gravity, lands, and reports a contact begin with a point', async () => {
    const p = await createPhysics(name);
    ground(p);
    const b = box(p, 0, 3, { contactEvents: true });
    let begin = null as null | { point: unknown };
    for (let i = 0; i < 120 && !begin; i++) {
      p.step(DT);
      begin = p.contactBegins()[0] ?? null;
    }
    expect(begin).not.toBeNull();
    expect(begin!.point).not.toBeNull();
    run(p, 120);
    const t = p.getTransform(b);
    expect(t.y).toBeGreaterThan(0.45);
    expect(t.y).toBeLessThan(0.56);
    p.dispose();
  });

  it('reports a contact end when a resting box is lifted away', async () => {
    const p = await createPhysics(name);
    ground(p);
    const b = box(p, 0, 0.5, { contactEvents: true });
    run(p, 30);
    p.setVelocity(b, { vy: 6 });
    let ends = 0;
    for (let i = 0; i < 30; i++) {
      p.step(DT);
      ends += p.contactEnds().length;
    }
    expect(ends).toBeGreaterThan(0);
    p.dispose();
  });

  it('reports contacts if either shape asks for events (OR semantics)', async () => {
    const p = await createPhysics(name);
    ground(p, true);
    box(p, 0, 2, { contactEvents: false });
    let seen = 0;
    for (let i = 0; i < 120; i++) {
      p.step(DT);
      seen += p.contactBegins().length;
    }
    expect(seen).toBeGreaterThan(0);
    p.dispose();
  });

  it('revolute angle = (angleB - angleA) - reference, defaulting to the current pose', async () => {
    const p = await createPhysics(name, { gravity: { x: 0, y: 0 } });
    const a = p.createBody({ type: 'static', position: { x: 0, y: 0 }, angle: 0.4 });
    p.addShape(a, { kind: 'box', hx: 0.2, hy: 0.2 });
    const b = box(p, 1, 0, {}, 0.9);
    const j = p.createRevolute({ bodyA: a, bodyB: b, anchor: { x: 0.5, y: 0 }, motor: { speed: 1, maxTorque: 1000 } });
    // Box2D v3 builds rotations with a fast approximate cos/sin, so allow ~1e-3 rad.
    expect(Math.abs(p.jointAngle(j))).toBeLessThan(2e-3);
    run(p, 18); // positive motor speed for 0.3 s at 1 rad/s -> +0.3 rad
    expect(p.jointAngle(j)).toBeGreaterThan(0.25);
    expect(p.jointAngle(j)).toBeLessThan(0.35);
    const rel = p.getTransform(b).angle - p.getTransform(a).angle - 0.5;
    expect(p.jointAngle(j)).toBeCloseTo(rel, 2);
    p.dispose();
  });

  it('revolute limits and motor drive the joint', async () => {
    const p = await createPhysics(name, { gravity: { x: 0, y: 0 } });
    const a = p.createBody({ type: 'static', position: { x: 0, y: 0 } });
    p.addShape(a, { kind: 'box', hx: 0.2, hy: 0.2 });
    const b = box(p, 1, 0);
    const j = p.createRevolute({
      bodyA: a, bodyB: b, anchor: { x: 0, y: 0 },
      limits: { lower: -0.5, upper: 0.5 }, motor: { speed: 2, maxTorque: 500 },
    });
    run(p, 120);
    expect(p.jointAngle(j)).toBeGreaterThan(0.45);
    expect(p.jointAngle(j)).toBeLessThan(0.55);
    p.setMotorSpeed(j, -2);
    run(p, 120);
    expect(p.jointAngle(j)).toBeLessThan(-0.45);
    p.dispose();
  });

  it('joint force on body B: hanging weight and stacked weight both push B up by m*g', async () => {
    for (const above of [false, true]) {
      const p = await createPhysics(name);
      const a = p.createBody({ type: 'static', position: { x: 0, y: 5 } });
      p.addShape(a, { kind: 'box', hx: 0.5, hy: 0.5 });
      const by = above ? 6 : 4;
      const b = box(p, 0, by, { density: 2 }); // 1x1 m, density 2 -> 2 kg
      const j = p.createWeld({ bodyA: a, bodyB: b, anchor: { x: 0, y: 5 + (above ? 0.5 : -0.5) } });
      run(p, 60);
      const f = p.getJointForce(j);
      const m = p.getMass(b);
      expect(m).toBeCloseTo(2, 2);
      expect(f.y).toBeGreaterThan(0.9 * m * 10);
      expect(f.y).toBeLessThan(1.1 * m * 10);
      expect(Math.abs(f.x)).toBeLessThan(0.5);
      p.dispose();
    }
  });

  it('springy weld (angularHertz) wobbles, rigid weld does not', async () => {
    const swing = async (hz: number) => {
      const p = await createPhysics(name);
      const a = p.createBody({ type: 'static', position: { x: 0, y: 0 } });
      p.addShape(a, { kind: 'box', hx: 0.2, hy: 0.2 });
      const b = p.createBody({ type: 'dynamic', position: { x: 0, y: 1.2 } });
      p.addShape(b, { kind: 'box', hx: 0.1, hy: 1 }, { density: 1 });
      p.createWeld({ bodyA: a, bodyB: b, anchor: { x: 0, y: 0.2 }, angularHertz: hz, angularDamping: 0.1 });
      p.setVelocity(b, { w: 2 });
      let maxAngle = 0;
      for (let i = 0; i < 90; i++) {
        p.step(DT);
        maxAngle = Math.max(maxAngle, Math.abs(p.getTransform(b).angle));
      }
      p.dispose();
      return maxAngle;
    };
    const springy = await swing(3);
    const rigid = await swing(0);
    expect(springy).toBeGreaterThan(0.02);
    expect(springy).toBeGreaterThan(3 * rigid);
  });

  it('prismatic slides along its axis with a motor and limits', async () => {
    const p = await createPhysics(name, { gravity: { x: 0, y: 0 } });
    const a = p.createBody({ type: 'static', position: { x: 0, y: 0 } });
    p.addShape(a, { kind: 'box', hx: 0.2, hy: 0.2 });
    const b = box(p, 0, 0);
    const j = p.createPrismatic({
      bodyA: a, bodyB: b, anchor: { x: 0, y: 0 }, axis: { x: 1, y: 0 },
      limits: { lower: -2, upper: 2 }, motor: { speed: 1, maxForce: 1000 },
    });
    run(p, 60);
    const t = p.getTransform(b);
    expect(p.jointTranslation(j)).toBeCloseTo(1, 1);
    expect(t.x).toBeCloseTo(1, 1);
    expect(Math.abs(t.y)).toBeLessThan(0.01);
    expect(Math.abs(t.angle)).toBeLessThan(0.01);
    run(p, 180);
    expect(p.jointTranslation(j)).toBeLessThan(2.05);
    p.dispose();
  });

  it('prismatic with a separate anchorB starts at that translation', async () => {
    const p = await createPhysics(name, { gravity: { x: 0, y: 0 } });
    const a = p.createBody({ type: 'static', position: { x: 0, y: 0 }, angle: 0.5 });
    p.addShape(a, { kind: 'box', hx: 0.2, hy: 0.2 });
    const b = p.createBody({ type: 'dynamic', position: { x: 0, y: 0 }, angle: 0.5 });
    p.addShape(b, { kind: 'box', hx: 0.2, hy: 0.2 }, { density: 1 });
    const axis = { x: Math.cos(0.5), y: Math.sin(0.5) };
    const j = p.createPrismatic({
      bodyA: a, bodyB: b, anchor: { x: 0, y: 0 }, anchorB: { x: -0.3 * axis.x, y: -0.3 * axis.y }, axis,
      limits: { lower: -0.5, upper: 0.5 },
    });
    // translation = (anchorB - anchor) . axis = -0.3
    expect(p.jointTranslation(j)).toBeCloseTo(-0.3, 2);
    p.dispose();
  });

  it('rope (distance, minLength 0) allows slack but stops at max length', async () => {
    const p = await createPhysics(name);
    const a = p.createBody({ type: 'static', position: { x: 0, y: 5 } });
    p.addShape(a, { kind: 'box', hx: 0.1, hy: 0.1 });
    const b = box(p, 0, 4);
    p.createDistance({ bodyA: a, bodyB: b, anchorA: { x: 0, y: 5 }, anchorB: { x: 0, y: 4 }, minLength: 0, maxLength: 2 });
    p.setVelocity(b, { vy: 3 }); // thrown upward: slack rope must not push back
    p.step(DT);
    expect(p.getVelocity(b).vy).toBeGreaterThan(2);
    run(p, 180);
    expect(p.getTransform(b).y).toBeGreaterThan(2.9);
    expect(p.getTransform(b).y).toBeLessThan(3.1);
    p.dispose();
  });

  it('wheel joints drive a two-wheeled cart forward', async () => {
    const p = await createPhysics(name);
    ground(p);
    const chassis = p.createBody({ type: 'dynamic', position: { x: 0, y: 1 } });
    p.addShape(chassis, { kind: 'box', hx: 1, hy: 0.2 }, { density: 1 });
    for (const wx of [-0.8, 0.8]) {
      const wheel = p.createBody({ type: 'dynamic', position: { x: wx, y: 0.4 } });
      p.addShape(wheel, { kind: 'circle', radius: 0.4 }, { density: 1, friction: 0.9 });
      p.createWheel({
        bodyA: chassis, bodyB: wheel, anchor: { x: wx, y: 0.4 }, axis: { x: 0, y: 1 },
        spring: { hertz: 4, damping: 0.7 }, motor: { speed: -10, maxTorque: 50 },
      });
    }
    run(p, 120);
    expect(p.getTransform(chassis).x).toBeGreaterThan(3);
    expect(Math.abs(p.getTransform(chassis).angle)).toBeLessThan(0.3);
    p.dispose();
  });

  it('same negative group never collides', async () => {
    const p = await createPhysics(name);
    ground(p);
    const a = box(p, 0, 0.5, { filter: { group: -3 } });
    const b = box(p, 0, 2, { filter: { group: -3 } });
    run(p, 90);
    expect(p.getTransform(b).y).toBeLessThan(0.7); // fell through a, onto the ground
    expect(p.getTransform(a).y).toBeLessThan(0.7);
    p.dispose();
  });

  it('compound body: several shapes on one body add their mass', async () => {
    const p = await createPhysics(name);
    const b = p.createBody({ type: 'dynamic', position: { x: 0, y: 5 } });
    p.addShape(b, { kind: 'box', hx: 0.5, hy: 0.5, center: { x: -1, y: 0 } }, { density: 1 });
    p.addShape(b, { kind: 'box', hx: 0.5, hy: 0.5, center: { x: 1, y: 0 }, angle: 0.3 }, { density: 1 });
    p.addShape(b, { kind: 'circle', radius: 0.5, center: { x: 0, y: 1 } }, { density: 1 });
    expect(p.getMass(b)).toBeCloseTo(2 + Math.PI * 0.25, 2);
    expect(p.bodyShapes(b)).toHaveLength(3);
    p.dispose();
  });

  it('removeShape takes a shape off its body and updates the mass', async () => {
    const p = await createPhysics(name);
    const b = p.createBody({ type: 'dynamic', position: { x: 0, y: 5 } });
    p.addShape(b, { kind: 'box', hx: 0.5, hy: 0.5 }, { density: 1 });
    const extra = p.addShape(b, { kind: 'box', hx: 0.5, hy: 0.5, center: { x: 1, y: 0 } }, { density: 1 });
    expect(p.getMass(b)).toBeCloseTo(2, 2);
    p.removeShape(extra);
    expect(p.bodyShapes(b)).toHaveLength(1);
    expect(p.shape(extra)).toBeUndefined();
    expect(p.getMass(b)).toBeCloseTo(1, 2);
    p.dispose();
  });

  it('destroying a body removes its joints from the registry', async () => {
    const p = await createPhysics(name);
    const a = box(p, 0, 0);
    const b = box(p, 1, 0);
    const j = p.createWeld({ bodyA: a, bodyB: b, anchor: { x: 0.5, y: 0 } });
    expect(p.jointExists(j)).toBe(true);
    p.destroyBody(b);
    expect(p.jointExists(j)).toBe(false);
    expect(p.counts()).toMatchObject({ bodies: 1, joints: 0 });
    p.dispose();
  });
});
