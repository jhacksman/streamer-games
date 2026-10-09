// Box2D v3 backend via box2d3-wasm (Box2D v3.2 compiled to WebAssembly).
//
// Notes on v3.2 specifics handled here:
// - Joints are defined with local frames (b2Transform) instead of anchors + reference angles.
//   Revolute/weld angle = angle(qB * frameB.q) - angle(qA * frameA.q), so frameA.q = 0 and
//   frameB.q = -referenceAngle gives "angle = (angleB - angleA) - referenceAngle".
// - Prismatic and wheel joints slide along the x-axis of localFrameA.
// - The engine stores no user data for us; shapes and joints are tracked in JS maps.
import type {
  BodyHandle, BodyOpts, ContactBegin, ContactEnd, DistanceDef, Filter, JointHandle, JointKind, Physics,
  PrismaticDef, RevoluteDef, ShapeGeom, ShapeHandle, ShapeOpts, ShapeRecord, Transform, Vec2,
  Velocity, WeldDef, WheelDef,
} from './types.ts';

// The wasm module's own typings are large; we use a loose type at this boundary only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Box2DModule = any;

interface Id { index1: number; world0?: number; generation: number }

export interface Box2D3Options {
  gravity?: Vec2;
  subSteps?: number;
  enableSleep?: boolean;
}

interface BodyEntry {
  id: Id;
  shapes: ShapeHandle[];
  joints: Set<JointHandle>;
  tag: unknown;
}

interface JointEntry {
  id: Id;
  kind: JointKind;
  bodyA: BodyHandle;
  bodyB: BodyHandle;
}

const idKey = (id: Id) => `${id.index1}:${id.world0 ?? 0}:${id.generation}`;

export function createBox2D3Physics(B: Box2DModule, opts: Box2D3Options = {}, label = 'box2d3'): Physics {
  const subSteps = opts.subSteps ?? 4;
  const worldDef = B.b2DefaultWorldDef();
  worldDef.gravity = new B.b2Vec2(opts.gravity?.x ?? 0, opts.gravity?.y ?? -10);
  if (opts.enableSleep !== undefined) worldDef.enableSleep = opts.enableSleep;
  const worldId: Id = B.b2CreateWorld(worldDef);

  const bodies = new Map<BodyHandle, BodyEntry>();
  const shapes = new Map<ShapeHandle, ShapeRecord & { id: Id }>();
  const shapeByKey = new Map<string, ShapeHandle>();
  const joints = new Map<JointHandle, JointEntry>();
  let nextId = 1;
  let begins: ContactBegin[] = [];
  let ends: ContactEnd[] = [];

  const vec = (x: number, y: number) => new B.b2Vec2(x, y);
  const read = (v: { x: number; y: number; delete?: () => void }): Vec2 => {
    const out = { x: v.x, y: v.y };
    v.delete?.();
    return out;
  };

  const be = (h: BodyHandle): BodyEntry => {
    const e = bodies.get(h);
    if (!e) throw new Error(`${label}: unknown body ${h}`);
    return e;
  };
  const je = (h: JointHandle): JointEntry => {
    const e = joints.get(h);
    if (!e) throw new Error(`${label}: unknown joint ${h}`);
    return e;
  };

  function angleOf(bodyId: Id): number {
    const r = B.b2Body_GetRotation(bodyId);
    const a = B.b2Rot_GetAngle(r);
    r.delete?.();
    return a;
  }

  function localPoint(bodyId: Id, p: Vec2): Vec2 {
    return read(B.b2Body_GetLocalPoint(bodyId, vec(p.x, p.y)));
  }

  function makeFrame(p: Vec2, angle: number) {
    const t = new B.b2Transform();
    t.p = vec(p.x, p.y);
    t.q = B.b2MakeRot(angle);
    return t;
  }

  function setBase(def: { base: Record<string, unknown> }, d: { bodyA: BodyHandle; bodyB: BodyHandle; collideConnected?: boolean },
    frameA: { p: Vec2; angle: number }, frameB: { p: Vec2; angle: number }) {
    const base = def.base;
    base.bodyIdA = be(d.bodyA).id;
    base.bodyIdB = be(d.bodyB).id;
    base.localFrameA = makeFrame(frameA.p, frameA.angle);
    base.localFrameB = makeFrame(frameB.p, frameB.angle);
    base.collideConnected = d.collideConnected ?? false;
  }

  function anchorFrames(d: { bodyA: BodyHandle; bodyB: BodyHandle }, anchor: Vec2, referenceAngle: number | undefined) {
    const a = be(d.bodyA).id;
    const b = be(d.bodyB).id;
    const ref = referenceAngle ?? angleOf(b) - angleOf(a);
    return {
      frameA: { p: localPoint(a, anchor), angle: 0 },
      frameB: { p: localPoint(b, anchor), angle: -ref },
    };
  }

  // Prismatic/wheel: frame A's x-axis is the slide axis; frame B starts aligned with frame A.
  function axisFrames(d: { bodyA: BodyHandle; bodyB: BodyHandle }, anchor: Vec2, axis: Vec2, anchorB: Vec2 = anchor) {
    const a = be(d.bodyA).id;
    const b = be(d.bodyB).id;
    const thetaA = angleOf(a);
    const thetaB = angleOf(b);
    const axisWorld = Math.atan2(axis.y, axis.x);
    const phiA = axisWorld - thetaA;
    const phiB = thetaA + phiA - thetaB;
    return {
      frameA: { p: localPoint(a, anchor), angle: phiA },
      frameB: { p: localPoint(b, anchorB), angle: phiB },
    };
  }

  function registerJoint(id: Id, kind: JointKind, bodyA: BodyHandle, bodyB: BodyHandle): JointHandle {
    const h = nextId++;
    joints.set(h, { id, kind, bodyA, bodyB });
    be(bodyA).joints.add(h);
    be(bodyB).joints.add(h);
    return h;
  }

  function contactPoint(shapeA: Id, shapeB: Id): Vec2 | null {
    const keyB = idKey(shapeB);
    const data = B.b2Shape_GetContactData(shapeA, 8);
    if (!data) return null;
    let found: Vec2 | null = null;
    const n = data.length ?? data.size?.() ?? 0;
    for (let i = 0; i < n && !found; i++) {
      const c = data.get ? data.get(i) : data[i];
      if (!c) continue;
      const other = idKey(c.shapeIdA) === keyB || idKey(c.shapeIdB) === keyB;
      if (other && c.manifold.pointCount > 0) {
        const mp = c.manifold.GetPoint(0);
        found = { x: mp.point.x, y: mp.point.y };
      }
    }
    return found;
  }

  const bodyTypeOf = (t: BodyOpts['type']) =>
    t === 'static' ? B.b2BodyType.b2_staticBody : t === 'kinematic' ? B.b2BodyType.b2_kinematicBody : B.b2BodyType.b2_dynamicBody;

  const physics: Physics = {
    name: label,

    step(dt) {
      B.b2World_Step(worldId, dt, subSteps);
      const out: ContactBegin[] = [];
      const ev = B.b2World_GetContactEvents(worldId);
      for (let i = 0; i < ev.beginCount; i++) {
        const e = ev.GetBeginEvent(i);
        const sa = shapeByKey.get(idKey(e.shapeIdA));
        const sb = shapeByKey.get(idKey(e.shapeIdB));
        if (sa !== undefined && sb !== undefined) {
          out.push({ shapeA: sa, shapeB: sb, point: contactPoint(e.shapeIdA, e.shapeIdB) });
        }
        e.delete?.();
      }
      const outEnds: ContactEnd[] = [];
      for (let i = 0; i < ev.endCount; i++) {
        const e = ev.GetEndEvent(i);
        const sa = shapeByKey.get(idKey(e.shapeIdA));
        const sb = shapeByKey.get(idKey(e.shapeIdB));
        if (sa !== undefined && sb !== undefined) outEnds.push({ shapeA: sa, shapeB: sb });
        e.delete?.();
      }
      ev.delete?.();
      begins = out;
      ends = outEnds;
    },

    createBody(o: BodyOpts) {
      const bd = B.b2DefaultBodyDef();
      bd.type = bodyTypeOf(o.type);
      bd.position = vec(o.position.x, o.position.y);
      bd.rotation = B.b2MakeRot(o.angle ?? 0);
      bd.linearVelocity = vec(o.linearVelocity?.x ?? 0, o.linearVelocity?.y ?? 0);
      bd.angularVelocity = o.angularVelocity ?? 0;
      bd.isBullet = o.bullet ?? false;
      bd.gravityScale = o.gravityScale ?? 1;
      bd.linearDamping = o.linearDamping ?? 0;
      bd.angularDamping = o.angularDamping ?? 0;
      const id: Id = B.b2CreateBody(worldId, bd);
      bd.delete?.();
      const h = nextId++;
      bodies.set(h, { id, shapes: [], joints: new Set(), tag: o.tag });
      return h;
    },

    destroyBody(h) {
      const e = bodies.get(h);
      if (!e) return;
      for (const s of e.shapes) {
        const rec = shapes.get(s);
        if (rec) shapeByKey.delete(idKey(rec.id));
        shapes.delete(s);
      }
      // Box2D destroys attached joints with the body; mirror that in our registry.
      for (const jh of e.joints) {
        const j = joints.get(jh);
        if (!j) continue;
        const other = j.bodyA === h ? j.bodyB : j.bodyA;
        bodies.get(other)?.joints.delete(jh);
        joints.delete(jh);
      }
      B.b2DestroyBody(e.id);
      bodies.delete(h);
    },

    bodyExists: (h) => bodies.has(h),
    bodyTag: (h) => bodies.get(h)?.tag,

    addShape(h, geom: ShapeGeom, o: ShapeOpts = {}) {
      const e = be(h);
      const sd = B.b2DefaultShapeDef();
      sd.density = o.density ?? 1;
      sd.material.friction = o.friction ?? 0.6;
      sd.material.restitution = o.restitution ?? 0;
      sd.filter.categoryBits = o.filter?.category ?? 0x0001;
      sd.filter.maskBits = o.filter?.mask ?? 0xffff;
      sd.filter.groupIndex = o.filter?.group ?? 0;
      sd.isSensor = o.sensor ?? false;
      sd.enableSensorEvents = o.sensor ?? false;
      sd.enableContactEvents = o.contactEvents ?? false;
      let id: Id;
      switch (geom.kind) {
        case 'box': {
          const poly = B.b2MakeOffsetBox(geom.hx, geom.hy, vec(geom.center?.x ?? 0, geom.center?.y ?? 0), B.b2MakeRot(geom.angle ?? 0));
          id = B.b2CreatePolygonShape(e.id, sd, poly);
          poly.delete?.();
          break;
        }
        case 'circle': {
          const c = new B.b2Circle();
          c.center = vec(geom.center?.x ?? 0, geom.center?.y ?? 0);
          c.radius = geom.radius;
          id = B.b2CreateCircleShape(e.id, sd, c);
          c.delete?.();
          break;
        }
        case 'polygon': {
          const hull = B.b2ComputeHull(geom.vertices.map((v) => vec(v.x, v.y)));
          const poly = B.b2MakePolygon(hull, 0);
          id = B.b2CreatePolygonShape(e.id, sd, poly);
          poly.delete?.();
          hull.delete?.();
          break;
        }
      }
      sd.delete?.();
      const s = nextId++;
      shapes.set(s, { body: h, geom, opts: o, id });
      shapeByKey.set(idKey(id), s);
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
      const filter = B.b2Shape_GetFilter(rec.id);
      filter.categoryBits = merged.category ?? 0x0001;
      filter.maskBits = merged.mask ?? 0xffff;
      filter.groupIndex = merged.group ?? 0;
      B.b2Shape_SetFilter(rec.id, filter);
      filter.delete?.();
    },

    getTransform(h): Transform {
      const id = be(h).id;
      const p = read(B.b2Body_GetPosition(id));
      return { x: p.x, y: p.y, angle: angleOf(id) };
    },
    setTransform(h, t) {
      B.b2Body_SetTransform(be(h).id, vec(t.x, t.y), B.b2MakeRot(t.angle));
    },
    getVelocity(h): Velocity {
      const id = be(h).id;
      const v = read(B.b2Body_GetLinearVelocity(id));
      return { vx: v.x, vy: v.y, w: B.b2Body_GetAngularVelocity(id) };
    },
    setVelocity(h, v) {
      const id = be(h).id;
      if (v.vx !== undefined || v.vy !== undefined) {
        const cur = read(B.b2Body_GetLinearVelocity(id));
        B.b2Body_SetLinearVelocity(id, vec(v.vx ?? cur.x, v.vy ?? cur.y));
      }
      if (v.w !== undefined) B.b2Body_SetAngularVelocity(id, v.w);
    },
    getMass: (h) => B.b2Body_GetMass(be(h).id),
    getWorldCenter: (h) => read(B.b2Body_GetWorldCenterOfMass(be(h).id)),
    applyForce(h, f, p) {
      const id = be(h).id;
      if (p) B.b2Body_ApplyForce(id, vec(f.x, f.y), vec(p.x, p.y), true);
      else B.b2Body_ApplyForceToCenter(id, vec(f.x, f.y), true);
    },
    applyTorque: (h, t) => B.b2Body_ApplyTorque(be(h).id, t, true),
    applyLinearImpulse(h, i, p) {
      const id = be(h).id;
      if (p) B.b2Body_ApplyLinearImpulse(id, vec(i.x, i.y), vec(p.x, p.y), true);
      else B.b2Body_ApplyLinearImpulseToCenter(id, vec(i.x, i.y), true);
    },
    applyAngularImpulse: (h, i) => B.b2Body_ApplyAngularImpulse(be(h).id, i, true),

    createRevolute(d: RevoluteDef) {
      const def = B.b2DefaultRevoluteJointDef();
      const { frameA, frameB } = anchorFrames(d, d.anchor, d.referenceAngle);
      setBase(def, d, frameA, frameB);
      def.enableLimit = !!d.limits;
      def.lowerAngle = d.limits?.lower ?? 0;
      def.upperAngle = d.limits?.upper ?? 0;
      def.enableMotor = !!d.motor;
      def.motorSpeed = d.motor?.speed ?? 0;
      def.maxMotorTorque = d.motor?.maxTorque ?? 0;
      const id = B.b2CreateRevoluteJoint(worldId, def);
      def.delete?.();
      return registerJoint(id, 'revolute', d.bodyA, d.bodyB);
    },

    createWeld(d: WeldDef) {
      const def = B.b2DefaultWeldJointDef();
      const { frameA, frameB } = anchorFrames(d, d.anchor, d.referenceAngle);
      setBase(def, d, frameA, frameB);
      def.linearHertz = d.linearHertz ?? 0;
      def.linearDampingRatio = d.linearDamping ?? 0;
      def.angularHertz = d.angularHertz ?? 0;
      def.angularDampingRatio = d.angularDamping ?? 0;
      const id = B.b2CreateWeldJoint(worldId, def);
      def.delete?.();
      return registerJoint(id, 'weld', d.bodyA, d.bodyB);
    },

    createPrismatic(d: PrismaticDef) {
      const def = B.b2DefaultPrismaticJointDef();
      const { frameA, frameB } = axisFrames(d, d.anchor, d.axis, d.anchorB ?? d.anchor);
      setBase(def, d, frameA, frameB);
      def.enableLimit = !!d.limits;
      def.lowerTranslation = d.limits?.lower ?? 0;
      def.upperTranslation = d.limits?.upper ?? 0;
      def.enableMotor = !!d.motor;
      def.motorSpeed = d.motor?.speed ?? 0;
      def.maxMotorForce = d.motor?.maxForce ?? 0;
      const id = B.b2CreatePrismaticJoint(worldId, def);
      def.delete?.();
      return registerJoint(id, 'prismatic', d.bodyA, d.bodyB);
    },

    createWheel(d: WheelDef) {
      const def = B.b2DefaultWheelJointDef();
      const { frameA, frameB } = axisFrames(d, d.anchor, d.axis);
      setBase(def, d, frameA, frameB);
      def.enableSpring = !!d.spring;
      def.hertz = d.spring?.hertz ?? 0;
      def.dampingRatio = d.spring?.damping ?? 0;
      def.enableMotor = !!d.motor;
      def.motorSpeed = d.motor?.speed ?? 0;
      def.maxMotorTorque = d.motor?.maxTorque ?? 0;
      const id = B.b2CreateWheelJoint(worldId, def);
      def.delete?.();
      return registerJoint(id, 'wheel', d.bodyA, d.bodyB);
    },

    createDistance(d: DistanceDef) {
      const def = B.b2DefaultDistanceJointDef();
      const a = be(d.bodyA).id;
      const b = be(d.bodyB).id;
      setBase(def, d, { p: localPoint(a, d.anchorA), angle: 0 }, { p: localPoint(b, d.anchorB), angle: 0 });
      const current = Math.hypot(d.anchorB.x - d.anchorA.x, d.anchorB.y - d.anchorA.y);
      const length = d.length ?? current;
      def.length = length;
      const isRope = d.minLength !== undefined && d.minLength <= 0 && !d.spring;
      if (isRope) {
        // Spring enabled with zero stiffness = no length constraint except the limits: a rope.
        def.enableSpring = true;
        def.hertz = 0;
        def.dampingRatio = 0;
        def.enableLimit = true;
        def.minLength = 0;
        def.maxLength = d.maxLength ?? length;
      } else {
        def.enableSpring = !!d.spring;
        def.hertz = d.spring?.hertz ?? 0;
        def.dampingRatio = d.spring?.damping ?? 0;
        const limited = d.minLength !== undefined || d.maxLength !== undefined;
        def.enableLimit = limited;
        if (limited) {
          def.minLength = d.minLength ?? 0;
          def.maxLength = d.maxLength ?? 1e9;
        }
      }
      if (d.collideConnected === undefined) def.base.collideConnected = isRope;
      const id = B.b2CreateDistanceJoint(worldId, def);
      def.delete?.();
      return registerJoint(id, 'distance', d.bodyA, d.bodyB);
    },

    destroyJoint(h) {
      const e = joints.get(h);
      if (!e) return;
      B.b2DestroyJoint(e.id, true);
      bodies.get(e.bodyA)?.joints.delete(h);
      bodies.get(e.bodyB)?.joints.delete(h);
      joints.delete(h);
    },
    jointExists: (h) => joints.has(h),
    jointKind: (h) => joints.get(h)?.kind,
    jointBodies(h) {
      const e = je(h);
      return [e.bodyA, e.bodyB];
    },

    jointAngle: (h) => B.b2RevoluteJoint_GetAngle(je(h).id),
    jointTranslation: (h) => B.b2PrismaticJoint_GetTranslation(je(h).id),
    setMotorSpeed(h, speed) {
      const e = je(h);
      // Unlike Planck, Box2D v3 does not wake sleeping bodies when motor settings change.
      B.b2Joint_WakeBodies(e.id);
      if (e.kind === 'revolute') B.b2RevoluteJoint_SetMotorSpeed(e.id, speed);
      else if (e.kind === 'prismatic') B.b2PrismaticJoint_SetMotorSpeed(e.id, speed);
      else if (e.kind === 'wheel') B.b2WheelJoint_SetMotorSpeed(e.id, speed);
    },
    setMotorMax(h, max) {
      const e = je(h);
      B.b2Joint_WakeBodies(e.id);
      if (e.kind === 'revolute') B.b2RevoluteJoint_SetMaxMotorTorque(e.id, max);
      else if (e.kind === 'prismatic') B.b2PrismaticJoint_SetMaxMotorForce(e.id, max);
      else if (e.kind === 'wheel') B.b2WheelJoint_SetMaxMotorTorque(e.id, max);
    },

    getJointForce: (h) => read(B.b2Joint_GetConstraintForce(je(h).id)),
    getJointTorque: (h) => B.b2Joint_GetConstraintTorque(je(h).id),

    contactBegins: () => begins,
    contactEnds: () => ends,

    counts: () => ({ bodies: bodies.size, joints: joints.size, shapes: shapes.size }),

    dispose() {
      B.b2DestroyWorld(worldId);
      bodies.clear();
      shapes.clear();
      shapeByKey.clear();
      joints.clear();
    },
  };
  return physics;
}
