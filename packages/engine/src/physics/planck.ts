// Planck.js backend (Box2D v2.x JavaScript port). Fallback engine.
import * as planck from 'planck';
import type {
  BodyHandle, BodyOpts, ContactBegin, ContactEnd, DistanceDef, Filter, JointHandle, JointKind, Physics,
  PrismaticDef, RevoluteDef, ShapeGeom, ShapeHandle, ShapeOpts, ShapeRecord, Transform, Vec2,
  Velocity, WeldDef, WheelDef,
} from './types.ts';

export interface PlanckOptions {
  gravity?: Vec2;
  velocityIterations?: number;
  positionIterations?: number;
}

interface BodyEntry {
  body: planck.Body;
  shapes: ShapeHandle[];
  tag: unknown;
}

interface JointEntry {
  joint: planck.Joint;
  kind: JointKind;
  bodyA: BodyHandle;
  bodyB: BodyHandle;
}

export function createPlanckPhysics(opts: PlanckOptions = {}): Physics {
  const world = new planck.World({ gravity: planck.Vec2(opts.gravity?.x ?? 0, opts.gravity?.y ?? -10) });
  const velIters = opts.velocityIterations ?? 12;
  const posIters = opts.positionIterations ?? 8;

  const bodies = new Map<BodyHandle, BodyEntry>();
  const shapes = new Map<ShapeHandle, ShapeRecord & { fixture: planck.Fixture }>();
  const joints = new Map<JointHandle, JointEntry>();
  const fixtureToShape = new WeakMap<planck.Fixture, ShapeHandle>();
  const jointToHandle = new WeakMap<planck.Joint, JointHandle>();
  let nextId = 1;
  let lastDt = 1 / 60;
  let begins: ContactBegin[] = [];
  let pending: ContactBegin[] = [];
  let ends: ContactEnd[] = [];
  let pendingEnds: ContactEnd[] = [];

  world.on('begin-contact', (contact) => {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const sa = fixtureToShape.get(fa);
    const sb = fixtureToShape.get(fb);
    if (sa === undefined || sb === undefined) return;
    if (!shapes.get(sa)?.opts.contactEvents && !shapes.get(sb)?.opts.contactEvents) return;
    const wm = contact.getWorldManifold(null);
    const p = wm && wm.points.length > 0 ? wm.points[0] : null;
    pending.push({ shapeA: sa, shapeB: sb, point: p ? { x: p.x, y: p.y } : null });
  });

  world.on('end-contact', (contact) => {
    const sa = fixtureToShape.get(contact.getFixtureA());
    const sb = fixtureToShape.get(contact.getFixtureB());
    if (sa === undefined || sb === undefined) return;
    if (!shapes.get(sa)?.opts.contactEvents && !shapes.get(sb)?.opts.contactEvents) return;
    pendingEnds.push({ shapeA: sa, shapeB: sb });
  });

  // Joints destroyed implicitly (with a body) must leave our registry too.
  world.on('remove-joint', (joint) => {
    const h = jointToHandle.get(joint);
    if (h !== undefined) joints.delete(h);
  });

  const b = (h: BodyHandle): planck.Body => {
    const e = bodies.get(h);
    if (!e) throw new Error(`planck: unknown body ${h}`);
    return e.body;
  };
  const j = (h: JointHandle): JointEntry => {
    const e = joints.get(h);
    if (!e) throw new Error(`planck: unknown joint ${h}`);
    return e;
  };

  function toShape(geom: ShapeGeom): planck.Shape {
    switch (geom.kind) {
      case 'box':
        return new planck.Box(geom.hx, geom.hy, geom.center ? planck.Vec2(geom.center.x, geom.center.y) : undefined, geom.angle ?? 0);
      case 'circle':
        return new planck.Circle(planck.Vec2(geom.center?.x ?? 0, geom.center?.y ?? 0), geom.radius);
      case 'polygon':
        return new planck.Polygon(geom.vertices.map((v) => planck.Vec2(v.x, v.y)));
    }
  }

  function registerJoint(joint: planck.Joint, kind: JointKind, bodyA: BodyHandle, bodyB: BodyHandle): JointHandle {
    world.createJoint(joint);
    const h = nextId++;
    joints.set(h, { joint, kind, bodyA, bodyB });
    jointToHandle.set(joint, h);
    return h;
  }

  const physics: Physics = {
    name: 'planck',

    step(dt) {
      lastDt = dt;
      pending = [];
      world.step(dt, velIters, posIters);
      begins = pending;
      // End events can also fire outside step() (e.g. when a body is destroyed); report them with this step.
      ends = pendingEnds;
      pendingEnds = [];
    },

    createBody(o: BodyOpts) {
      const body = world.createBody({
        type: o.type,
        position: planck.Vec2(o.position.x, o.position.y),
        angle: o.angle ?? 0,
        linearVelocity: planck.Vec2(o.linearVelocity?.x ?? 0, o.linearVelocity?.y ?? 0),
        angularVelocity: o.angularVelocity ?? 0,
        bullet: o.bullet ?? false,
        gravityScale: o.gravityScale ?? 1,
        linearDamping: o.linearDamping ?? 0,
        angularDamping: o.angularDamping ?? 0,
      });
      const h = nextId++;
      bodies.set(h, { body, shapes: [], tag: o.tag });
      return h;
    },

    destroyBody(h) {
      const e = bodies.get(h);
      if (!e) return;
      for (const s of e.shapes) shapes.delete(s);
      world.destroyBody(e.body);
      bodies.delete(h);
    },

    bodyExists: (h) => bodies.has(h),
    bodyTag: (h) => bodies.get(h)?.tag,

    addShape(h, geom, o: ShapeOpts = {}) {
      const e = bodies.get(h);
      if (!e) throw new Error(`planck: unknown body ${h}`);
      const fixture = e.body.createFixture(toShape(geom), {
        density: o.density ?? 1,
        friction: o.friction ?? 0.6,
        restitution: o.restitution ?? 0,
        isSensor: o.sensor ?? false,
        filterCategoryBits: o.filter?.category ?? 0x0001,
        filterMaskBits: o.filter?.mask ?? 0xffff,
        filterGroupIndex: o.filter?.group ?? 0,
      });
      const s = nextId++;
      shapes.set(s, { body: h, geom, opts: o, fixture });
      fixtureToShape.set(fixture, s);
      e.shapes.push(s);
      return s;
    },

    shape: (s) => shapes.get(s),
    bodyShapes: (h) => bodies.get(h)?.shapes ?? [],

    setShapeFilter(s, f: Partial<Filter>) {
      const rec = shapes.get(s);
      if (!rec) return;
      const merged = { ...rec.opts.filter, ...f };
      rec.opts.filter = merged;
      rec.fixture.setFilterData({
        categoryBits: merged.category ?? 0x0001,
        maskBits: merged.mask ?? 0xffff,
        groupIndex: merged.group ?? 0,
      });
    },

    getTransform(h): Transform {
      const body = b(h);
      const p = body.getPosition();
      return { x: p.x, y: p.y, angle: body.getAngle() };
    },
    setTransform(h, t) {
      b(h).setTransform(planck.Vec2(t.x, t.y), t.angle);
    },
    getVelocity(h): Velocity {
      const body = b(h);
      const v = body.getLinearVelocity();
      return { vx: v.x, vy: v.y, w: body.getAngularVelocity() };
    },
    setVelocity(h, v) {
      const body = b(h);
      const cur = body.getLinearVelocity();
      if (v.vx !== undefined || v.vy !== undefined) body.setLinearVelocity(planck.Vec2(v.vx ?? cur.x, v.vy ?? cur.y));
      if (v.w !== undefined) body.setAngularVelocity(v.w);
    },
    getMass: (h) => b(h).getMass(),
    getWorldCenter(h) {
      const c = b(h).getWorldCenter();
      return { x: c.x, y: c.y };
    },
    applyForce(h, f, p) {
      const body = b(h);
      body.applyForce(planck.Vec2(f.x, f.y), p ? planck.Vec2(p.x, p.y) : body.getWorldCenter(), true);
    },
    applyTorque: (h, t) => b(h).applyTorque(t, true),
    applyLinearImpulse(h, i, p) {
      const body = b(h);
      body.applyLinearImpulse(planck.Vec2(i.x, i.y), p ? planck.Vec2(p.x, p.y) : body.getWorldCenter(), true);
    },
    applyAngularImpulse: (h, i) => b(h).applyAngularImpulse(i, true),

    createRevolute(d: RevoluteDef) {
      const joint = new planck.RevoluteJoint({
        collideConnected: d.collideConnected ?? false,
        referenceAngle: d.referenceAngle,
        enableLimit: !!d.limits,
        lowerAngle: d.limits?.lower ?? 0,
        upperAngle: d.limits?.upper ?? 0,
        enableMotor: !!d.motor,
        motorSpeed: d.motor?.speed ?? 0,
        maxMotorTorque: d.motor?.maxTorque ?? 0,
        // Planck reads referenceAngle at runtime; its typings only list it on RevoluteJointDef.
      } as planck.RevoluteJointOpt & { referenceAngle?: number }, b(d.bodyA), b(d.bodyB), planck.Vec2(d.anchor.x, d.anchor.y));
      return registerJoint(joint, 'revolute', d.bodyA, d.bodyB);
    },

    createWeld(d: WeldDef) {
      const joint = new planck.WeldJoint({
        collideConnected: d.collideConnected ?? false,
        referenceAngle: d.referenceAngle,
        frequencyHz: d.angularHertz ?? 0,
        dampingRatio: d.angularDamping ?? 0,
      }, b(d.bodyA), b(d.bodyB), planck.Vec2(d.anchor.x, d.anchor.y));
      return registerJoint(joint, 'weld', d.bodyA, d.bodyB);
    },

    createPrismatic(d: PrismaticDef) {
      const len = Math.hypot(d.axis.x, d.axis.y) || 1;
      const bodyA = b(d.bodyA);
      const bodyB = b(d.bodyB);
      const anchorB = d.anchorB ?? d.anchor;
      // Pass local anchors explicitly (no shared anchor arg) so body B's anchor can differ.
      const joint = new planck.PrismaticJoint({
        collideConnected: d.collideConnected ?? false,
        enableLimit: !!d.limits,
        lowerTranslation: d.limits?.lower ?? 0,
        upperTranslation: d.limits?.upper ?? 0,
        enableMotor: !!d.motor,
        motorSpeed: d.motor?.speed ?? 0,
        maxMotorForce: d.motor?.maxForce ?? 0,
        localAnchorA: bodyA.getLocalPoint(planck.Vec2(d.anchor.x, d.anchor.y)),
        localAnchorB: bodyB.getLocalPoint(planck.Vec2(anchorB.x, anchorB.y)),
        localAxisA: bodyA.getLocalVector(planck.Vec2(d.axis.x / len, d.axis.y / len)),
      } as planck.PrismaticJointOpt, bodyA, bodyB);
      return registerJoint(joint, 'prismatic', d.bodyA, d.bodyB);
    },

    createWheel(d: WheelDef) {
      const len = Math.hypot(d.axis.x, d.axis.y) || 1;
      const joint = new planck.WheelJoint({
        collideConnected: d.collideConnected ?? false,
        frequencyHz: d.spring?.hertz ?? 0,
        dampingRatio: d.spring?.damping ?? 0,
        enableMotor: !!d.motor,
        motorSpeed: d.motor?.speed ?? 0,
        maxMotorTorque: d.motor?.maxTorque ?? 0,
      }, b(d.bodyA), b(d.bodyB), planck.Vec2(d.anchor.x, d.anchor.y), planck.Vec2(d.axis.x / len, d.axis.y / len));
      return registerJoint(joint, 'wheel', d.bodyA, d.bodyB);
    },

    createDistance(d: DistanceDef) {
      const bodyA = b(d.bodyA);
      const bodyB = b(d.bodyB);
      const current = Math.hypot(d.anchorB.x - d.anchorA.x, d.anchorB.y - d.anchorA.y);
      const length = d.length ?? current;
      const isRope = d.minLength !== undefined && d.minLength <= 0 && !d.spring;
      if (isRope) {
        // Planck has no min/max on DistanceJoint; a RopeJoint is the tension-only equivalent.
        const joint = new planck.RopeJoint({
          collideConnected: d.collideConnected ?? true,
          maxLength: d.maxLength ?? length,
          localAnchorA: bodyA.getLocalPoint(planck.Vec2(d.anchorA.x, d.anchorA.y)),
          localAnchorB: bodyB.getLocalPoint(planck.Vec2(d.anchorB.x, d.anchorB.y)),
        } as planck.RopeJointOpt, bodyA, bodyB);
        return registerJoint(joint, 'distance', d.bodyA, d.bodyB);
      }
      const joint = new planck.DistanceJoint({
        collideConnected: d.collideConnected ?? false,
        length,
        frequencyHz: d.spring?.hertz ?? 0,
        dampingRatio: d.spring?.damping ?? 0,
      }, bodyA, bodyB, planck.Vec2(d.anchorA.x, d.anchorA.y), planck.Vec2(d.anchorB.x, d.anchorB.y));
      return registerJoint(joint, 'distance', d.bodyA, d.bodyB);
    },

    destroyJoint(h) {
      const e = joints.get(h);
      if (!e) return;
      world.destroyJoint(e.joint);
      joints.delete(h);
    },
    jointExists: (h) => joints.has(h),
    jointKind: (h) => joints.get(h)?.kind,
    jointBodies(h) {
      const e = j(h);
      return [e.bodyA, e.bodyB];
    },

    jointAngle(h) {
      const e = j(h);
      return (e.joint as planck.RevoluteJoint).getJointAngle();
    },
    jointTranslation(h) {
      const e = j(h);
      return (e.joint as planck.PrismaticJoint).getJointTranslation();
    },
    setMotorSpeed(h, speed) {
      const e = j(h);
      (e.joint as planck.RevoluteJoint | planck.PrismaticJoint | planck.WheelJoint).setMotorSpeed(speed);
    },
    setMotorMax(h, max) {
      const e = j(h);
      if (e.kind === 'prismatic') (e.joint as planck.PrismaticJoint).setMaxMotorForce(max);
      else (e.joint as planck.RevoluteJoint | planck.WheelJoint).setMaxMotorTorque(max);
    },

    getJointForce(h) {
      const f = j(h).joint.getReactionForce(1 / lastDt);
      return { x: f.x, y: f.y };
    },
    getJointTorque: (h) => j(h).joint.getReactionTorque(1 / lastDt),

    contactBegins: () => begins,
    contactEnds: () => ends,

    counts: () => ({ bodies: bodies.size, joints: joints.size, shapes: shapes.size }),

    dispose() {
      bodies.clear();
      shapes.clear();
      joints.clear();
    },
  };
  return physics;
}
