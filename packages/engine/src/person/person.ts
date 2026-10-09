// Goo person shared by every game (World of Goo look): a body, plus a head, two hands and two
// feet that are sticky orbs on stretchy limbs. Five joints total, one per limb: holding a
// limb's key stretches it out along a fixed direction; letting go pulls it back in.
// While live (hanging or falling) the person can also slowly rotate and drift sideways.
//
// Front view, +y up, person frame origin at the body's center.
import type { BodyHandle, Filter, JointHandle, Physics, ShapeGeom, ShapeHandle, Transform, Vec2 } from '../physics/types.ts';

export type PartName = 'body' | 'head' | 'handL' | 'handR' | 'footL' | 'footR';
export type PartKind = 'body' | 'orb';
export type LimbKey = 'armL' | 'legL' | 'legR' | 'armR' | 'neck';

/** Bit per stretchable limb; a person's limb state is a 5-bit mask. */
export const LIMB_BITS: Record<LimbKey, number> = { armL: 1, legL: 2, legR: 4, armR: 8, neck: 16 };
export const ALL_LIMBS = 31;

export interface PartTag {
  personId: number;
  part: PartName;
  kind: PartKind;
}

export interface LimbSpec {
  name: LimbKey;
  orb: PartName;
  /** Where the limb leaves the body (person frame). */
  root: Vec2;
  /** Default direction in the body frame (radians, CCW from +x). */
  angle: number;
  /** Root-to-orb-center distance when fully tucked. */
  tucked: number;
  /** Extra length when fully stretched. */
  reach: number;
  radius: number;
  maxForce: number;
}

const DEG = Math.PI / 180;

export const PERSON_DENSITY = 160; // ~70 kg person
export const BODY_GEOM: ShapeGeom = { kind: 'box', hx: 0.2, hy: 0.27 };

export const LIMBS: readonly LimbSpec[] = [
  { name: 'neck', orb: 'head', root: { x: 0, y: 0.25 }, angle: 90 * DEG, tucked: 0.2, reach: 0.35, radius: 0.17, maxForce: 2500 },
  { name: 'armL', orb: 'handL', root: { x: -0.17, y: 0.16 }, angle: 160 * DEG, tucked: 0.14, reach: 0.55, radius: 0.09, maxForce: 1500 },
  { name: 'armR', orb: 'handR', root: { x: 0.17, y: 0.16 }, angle: 20 * DEG, tucked: 0.14, reach: 0.55, radius: 0.09, maxForce: 1500 },
  { name: 'legL', orb: 'footL', root: { x: -0.1, y: -0.25 }, angle: 250 * DEG, tucked: 0.14, reach: 0.6, radius: 0.1, maxForce: 2500 },
  { name: 'legR', orb: 'footR', root: { x: 0.1, y: -0.25 }, angle: 290 * DEG, tucked: 0.14, reach: 0.6, radius: 0.1, maxForce: 2500 },
];

const LIMB_BY_NAME = new Map(LIMBS.map((l) => [l.name, l]));
export const limbSpec = (n: LimbKey) => LIMB_BY_NAME.get(n)!;

/**
 * Named whole-body poses: limb -> stretch fraction (0 tucked .. 1 full), plus optional limb
 * direction overrides (e.g. the streamer's arms point straight up).
 */
export interface Pose {
  stretch?: Partial<Record<LimbKey, number>>;
  angles?: Partial<Record<LimbKey, number>>;
}

export const POSES = {
  /** The streamer: T-pose, arms straight out sideways, legs planted. Three wide landing spots. */
  tPose: { stretch: { neck: 0.3, armL: 1, armR: 1, legL: 1, legR: 1 }, angles: { armL: 180 * DEG, armR: 0, legL: 262 * DEG, legR: 278 * DEG } },
  /** Arms straight up, legs planted, head up a little. */
  armsUp: { stretch: { neck: 0.3, armL: 1, armR: 1, legL: 1, legR: 1 }, angles: { armL: 100 * DEG, armR: 80 * DEG, legL: 262 * DEG, legR: 278 * DEG } },
  /** Standing tall: legs and neck out, arms tucked. Used for stacking tests. */
  standing: { stretch: { neck: 1, armL: 0, armR: 0, legL: 1, legR: 1 }, angles: { legL: 265 * DEG, legR: 275 * DEG } },
} satisfies Record<string, Pose>;

/** Live steering while hanging/falling: -1, 0 or 1 on each axis. */
export interface Drive {
  /** -1 = counter-clockwise (I / W), +1 = clockwise (O / E). */
  rotate: number;
  /** -1 = left (U / Q), +1 = right (P / R). */
  drift: number;
}

export interface PersonOptions {
  id: number;
  position: Vec2;
  angle?: number;
  /** Stretched limbs (LIMB_BITS mask). A pose's stretch values take priority. */
  limbs?: number;
  pose?: Pose;
  filter: { category: number; mask: number };
  contactEvents?: boolean;
  linearVelocity?: Vec2;
  angularVelocity?: number;
  /** Stretch motor gain (1/s) and speed cap (m/s). */
  motorGain?: number;
  motorMaxSpeed?: number;
  /** Multiplies every limb's motor force. */
  strength?: number;
  /** Air control: max sideways speed (m/s) and rotation speed (rad/s). */
  driftSpeed?: number;
  rotateSpeed?: number;
}

const rot = (v: Vec2, a: number): Vec2 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y };
};
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (v: Vec2, k: number): Vec2 => ({ x: v.x * k, y: v.y * k });
const dirOf = (a: number): Vec2 => ({ x: Math.cos(a), y: Math.sin(a) });

function geomArea(g: ShapeGeom): number {
  if (g.kind === 'box') return 4 * g.hx * g.hy;
  if (g.kind === 'circle') return Math.PI * g.radius * g.radius;
  return 0;
}

/** Rotational inertia about the shape's own center, per unit density. */
function geomInertia(g: ShapeGeom): number {
  if (g.kind === 'box') return (4 * g.hx * g.hy * (4 * g.hx * g.hx + 4 * g.hy * g.hy)) / 12;
  if (g.kind === 'circle') return (Math.PI * g.radius ** 4) / 2;
  return 0;
}

export function partGeom(part: PartName): ShapeGeom {
  if (part === 'body') return BODY_GEOM;
  const limb = LIMBS.find((l) => l.orb === part)!;
  return { kind: 'circle', radius: limb.radius };
}

function transformGeom(g: ShapeGeom, t: Transform): ShapeGeom {
  if (g.kind === 'box') {
    return { kind: 'box', hx: g.hx, hy: g.hy, center: add({ x: t.x, y: t.y }, rot(g.center ?? { x: 0, y: 0 }, t.angle)), angle: t.angle + (g.angle ?? 0) };
  }
  if (g.kind === 'circle') return { kind: 'circle', radius: g.radius, center: add({ x: t.x, y: t.y }, rot(g.center ?? { x: 0, y: 0 }, t.angle)) };
  return { kind: 'polygon', vertices: g.vertices.map((v) => add({ x: t.x, y: t.y }, rot(v, t.angle))) };
}

/** Stretch target (meters of extension) per limb for a mask and optional pose. */
export function targetsFor(limbs: number, pose?: Pose): Record<LimbKey, number> {
  const out = {} as Record<LimbKey, number>;
  for (const l of LIMBS) {
    const fixed = pose?.stretch?.[l.name];
    const frac = fixed !== undefined ? fixed : limbs & LIMB_BITS[l.name] ? 1 : 0;
    out[l.name] = frac * l.reach;
  }
  return out;
}

/** Limb directions (body frame) for a pose. */
export function anglesFor(pose?: Pose): Record<LimbKey, number> {
  const out = {} as Record<LimbKey, number>;
  for (const l of LIMBS) out[l.name] = pose?.angles?.[l.name] ?? l.angle;
  return out;
}

/** World transforms of every part for a body transform, stretch and limb angles. */
export function poseTransforms(origin: Transform, stretch: Record<LimbKey, number>, angles: Record<LimbKey, number>): Map<PartName, Transform> {
  const out = new Map<PartName, Transform>();
  out.set('body', { ...origin });
  for (const l of LIMBS) {
    const local = add(l.root, scale(dirOf(angles[l.name]), l.tucked + stretch[l.name]));
    const w = add({ x: origin.x, y: origin.y }, rot(local, origin.angle));
    out.set(l.orb, { x: w.x, y: w.y, angle: origin.angle });
  }
  return out;
}

export class Person {
  readonly id: number;
  readonly physics: Physics;
  readonly group: number;
  state: 'ragdoll' | 'frozen' = 'ragdoll';
  limbs: number;
  pose: Pose | undefined;
  drive: Drive = { rotate: 0, drift: 0 };
  /** Limb directions in the body frame (fixed for this person's life). */
  readonly angles: Record<LimbKey, number>;
  filter: { category: number; mask: number };
  contactEvents: boolean;

  /** Live state: the body and five orbs as separate bodies. */
  parts = new Map<PartName, BodyHandle>();
  joints = new Map<LimbKey, JointHandle>();
  /** Frozen state: one compound body. */
  body: BodyHandle | null = null;
  /** Part positions relative to the body frame, captured at freeze time. */
  private frozenFrames = new Map<PartName, Transform>();

  private motorGain: number;
  private motorMaxSpeed: number;
  private strength: number;
  private driftSpeed: number;
  private rotateSpeed: number;

  constructor(physics: Physics, o: PersonOptions) {
    this.physics = physics;
    this.id = o.id;
    this.group = -(1 + (o.id % 30000));
    this.limbs = o.limbs ?? 0;
    this.pose = o.pose;
    this.angles = anglesFor(o.pose);
    this.filter = o.filter;
    this.contactEvents = o.contactEvents ?? true;
    this.motorGain = o.motorGain ?? 12;
    this.motorMaxSpeed = o.motorMaxSpeed ?? 4;
    this.strength = o.strength ?? 1;
    this.driftSpeed = o.driftSpeed ?? 2.5;
    this.rotateSpeed = o.rotateSpeed ?? 1.6;
    const frames = poseTransforms({ x: o.position.x, y: o.position.y, angle: o.angle ?? 0 }, targetsFor(this.limbs, this.pose), this.angles);
    const w = o.angularVelocity ?? 0;
    this.buildLive(frames, (at) => ({
      vx: (o.linearVelocity?.x ?? 0) - w * (at.y - o.position.y),
      vy: (o.linearVelocity?.y ?? 0) + w * (at.x - o.position.x),
      w,
    }));
  }

  private tag(part: PartName): PartTag {
    return { personId: this.id, part, kind: part === 'body' ? 'body' : 'orb' };
  }

  private shapeFilter(): Partial<Filter> {
    return { category: this.filter.category, mask: this.filter.mask, group: this.group };
  }

  private buildLive(frames: Map<PartName, Transform>, velocityAt: (at: Vec2) => { vx: number; vy: number; w: number }) {
    const p = this.physics;
    const make = (part: PartName) => {
      const t = frames.get(part)!;
      const v = velocityAt(t);
      const b = p.createBody({ type: 'dynamic', position: { x: t.x, y: t.y }, angle: t.angle, linearVelocity: { x: v.vx, y: v.vy }, angularVelocity: v.w, tag: this.tag(part) });
      p.addShape(b, partGeom(part), { density: PERSON_DENSITY, friction: 0.9, filter: this.shapeFilter(), contactEvents: this.contactEvents, tag: this.tag(part) });
      this.parts.set(part, b);
      return b;
    };
    const body = make('body');
    const bt = frames.get('body')!;
    for (const l of LIMBS) {
      const orb = make(l.orb);
      const ot = frames.get(l.orb)!;
      const dir = rot(dirOf(this.angles[l.name]), bt.angle);
      const root = add({ x: bt.x, y: bt.y }, rot(l.root, bt.angle));
      // anchorB = the orb point that sits on the root when tucked, so translation = stretch.
      const anchorB = sub({ x: ot.x, y: ot.y }, scale(dir, l.tucked));
      this.joints.set(l.name, p.createPrismatic({
        bodyA: body, bodyB: orb, anchor: root, anchorB, axis: dir,
        limits: { lower: 0, upper: l.reach }, motor: { speed: 0, maxForce: l.maxForce * this.strength },
      }));
    }
  }

  /** Drive limb motors and air control. Call once per step while live. */
  update() {
    if (this.state !== 'ragdoll') return;
    const p = this.physics;
    const targets = targetsFor(this.limbs, this.pose);
    for (const l of LIMBS) {
      const h = this.joints.get(l.name);
      if (h === undefined || !p.jointExists(h)) continue;
      const err = targets[l.name] - p.jointTranslation(h);
      p.setMotorSpeed(h, Math.max(-this.motorMaxSpeed, Math.min(this.motorMaxSpeed, this.motorGain * err)));
    }
    // Air control: nudge the whole person toward a capped sideways speed and spin rate.
    const body = this.parts.get('body')!;
    const v = p.getVelocity(body);
    const mass = personMass();
    const targetVx = this.drive.drift * this.driftSpeed;
    if (this.drive.drift !== 0) {
      const dv = Math.max(-0.2, Math.min(0.2, targetVx - v.vx));
      for (const b of this.parts.values()) p.applyLinearImpulse(b, { x: dv * p.getMass(b), y: 0 });
    }
    if (this.drive.rotate !== 0) {
      const targetW = -this.drive.rotate * this.rotateSpeed; // clockwise is negative angle
      const dw = Math.max(-0.3, Math.min(0.3, targetW - v.w));
      const c = p.getWorldCenter(body);
      // Spin the whole person as one: tangential impulses on every part around the body center.
      for (const b of this.parts.values()) {
        const pc = p.getWorldCenter(b);
        const m = p.getMass(b);
        p.applyLinearImpulse(b, { x: -dw * (pc.y - c.y) * m, y: dw * (pc.x - c.x) * m });
      }
      p.applyAngularImpulse(body, dw * mass * 0.02);
    }
  }

  /** Current stretch of a limb (meters), live or frozen. */
  stretch(limb: LimbKey): number {
    const l = limbSpec(limb);
    if (this.state === 'ragdoll') {
      const h = this.joints.get(limb);
      return h !== undefined && this.physics.jointExists(h) ? this.physics.jointTranslation(h) : 0;
    }
    const f = this.frozenFrames.get(l.orb);
    if (!f) return 0;
    const d = sub({ x: f.x, y: f.y }, l.root);
    return Math.hypot(d.x, d.y) - l.tucked;
  }

  /** Go limp (motors nearly off) or restore strength. */
  setLimp(limp: boolean) {
    for (const l of LIMBS) {
      const h = this.joints.get(l.name);
      if (h !== undefined && this.physics.jointExists(h)) this.physics.setMotorMax(h, limp ? 20 : l.maxForce * this.strength);
    }
  }

  shapes(): ShapeHandle[] {
    if (this.state === 'frozen' && this.body !== null) return [...this.physics.bodyShapes(this.body)];
    return [...this.parts.values()].flatMap((b) => [...this.physics.bodyShapes(b)]);
  }

  bodies(): BodyHandle[] {
    return this.state === 'frozen' && this.body !== null ? [this.body] : [...this.parts.values()];
  }

  /** World transform of the body part (live or frozen). */
  bodyTransform(): Transform {
    if (this.state === 'frozen' && this.body !== null) return this.physics.getTransform(this.body);
    return this.physics.getTransform(this.parts.get('body')!);
  }

  /** World position of a part's center (live or frozen). */
  partPosition(part: PartName): Vec2 {
    if (this.state === 'ragdoll') {
      const t = this.physics.getTransform(this.parts.get(part)!);
      return { x: t.x, y: t.y };
    }
    const t = this.physics.getTransform(this.body!);
    const f = this.frozenFrames.get(part) ?? { x: 0, y: 0, angle: 0 };
    return add({ x: t.x, y: t.y }, rot({ x: f.x, y: f.y }, t.angle));
  }

  /** Where a limb leaves the body, in world space. */
  limbRoot(limb: LimbKey): Vec2 {
    const t = this.bodyTransform();
    return add({ x: t.x, y: t.y }, rot(limbSpec(limb).root, t.angle));
  }

  /** Merge body and orbs into one rigid body at the current pose. Momentum is preserved. */
  freeze(): BodyHandle {
    if (this.state === 'frozen' && this.body !== null) return this.body;
    const p = this.physics;
    const bt = p.getTransform(this.parts.get('body')!);

    let mass = 0, px = 0, py = 0, cx = 0, cy = 0;
    const info: { m: number; c: Vec2; v: { vx: number; vy: number; w: number }; i: number }[] = [];
    for (const [part, b] of this.parts) {
      const g = partGeom(part);
      const m = PERSON_DENSITY * geomArea(g);
      const c = p.getWorldCenter(b);
      const v = p.getVelocity(b);
      info.push({ m, c, v, i: PERSON_DENSITY * geomInertia(g) });
      mass += m; px += m * v.vx; py += m * v.vy; cx += m * c.x; cy += m * c.y;
    }
    const com = { x: cx / mass, y: cy / mass };
    const vel = { x: px / mass, y: py / mass };
    let L = 0, I = 0;
    for (const k of info) {
      const r = sub(k.c, com);
      L += k.i * k.v.w + k.m * (r.x * (k.v.vy - vel.y) - r.y * (k.v.vx - vel.x));
      I += k.i + k.m * (r.x * r.x + r.y * r.y);
    }
    const w = I > 0 ? L / I : 0;

    this.frozenFrames.clear();
    for (const [part, b] of this.parts) {
      const t = p.getTransform(b);
      const rel = rot(sub({ x: t.x, y: t.y }, { x: bt.x, y: bt.y }), -bt.angle);
      this.frozenFrames.set(part, { x: rel.x, y: rel.y, angle: t.angle - bt.angle });
    }
    for (const b of this.parts.values()) p.destroyBody(b);
    this.parts.clear();
    this.joints.clear();

    const body = p.createBody({ type: 'dynamic', position: { x: bt.x, y: bt.y }, angle: bt.angle, tag: { personId: this.id, frozen: true } });
    for (const [part, frame] of this.frozenFrames) {
      p.addShape(body, transformGeom(partGeom(part), frame), {
        density: PERSON_DENSITY, friction: 0.9, filter: this.shapeFilter(), contactEvents: this.contactEvents, tag: this.tag(part),
      });
    }
    const center = p.getWorldCenter(body);
    p.setVelocity(body, { vx: vel.x - w * (center.y - com.y), vy: vel.y + w * (center.x - com.x), w });
    this.body = body;
    this.state = 'frozen';
    return body;
  }

  /** Split back into a live body + orbs at the frozen pose, inheriting the motion. */
  unfreeze(limp = true) {
    if (this.state !== 'frozen' || this.body === null) return;
    const p = this.physics;
    const t = p.getTransform(this.body);
    const v = p.getVelocity(this.body);
    const center = p.getWorldCenter(this.body);
    const frames = new Map<PartName, Transform>();
    for (const [part, rel] of this.frozenFrames) {
      const pos = add({ x: t.x, y: t.y }, rot({ x: rel.x, y: rel.y }, t.angle));
      frames.set(part, { x: pos.x, y: pos.y, angle: t.angle + rel.angle });
    }
    p.destroyBody(this.body);
    this.body = null;
    this.buildLive(frames, (at) => ({ vx: v.vx - v.w * (at.y - center.y), vy: v.vy + v.w * (at.x - center.x), w: v.w }));
    this.state = 'ragdoll';
    this.drive = { rotate: 0, drift: 0 };
    if (limp) this.setLimp(true);
  }

  setFilter(filter: { category: number; mask: number }) {
    this.filter = filter;
    for (const s of this.shapes()) this.physics.setShapeFilter(s, this.shapeFilter());
  }

  top(): number {
    return this.topPoint().y;
  }

  /** World position of this person's highest point. */
  topPoint(): Vec2 {
    let best: Vec2 = { x: 0, y: -Infinity };
    for (const s of this.shapes()) {
      const rec = this.physics.shape(s)!;
      const t = this.physics.getTransform(rec.body);
      const g = rec.geom;
      if (g.kind === 'circle') {
        const c = add({ x: t.x, y: t.y }, rot(g.center ?? { x: 0, y: 0 }, t.angle));
        if (c.y + g.radius > best.y) best = { x: c.x, y: c.y + g.radius };
      } else if (g.kind === 'box') {
        const c = g.center ?? { x: 0, y: 0 };
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          const corner = add({ x: t.x, y: t.y }, rot(add(c, rot({ x: sx * g.hx, y: sy * g.hy }, g.angle ?? 0)), t.angle));
          if (corner.y > best.y) best = corner;
        }
      }
    }
    return best;
  }

  destroy() {
    for (const b of this.bodies()) this.physics.destroyBody(b);
    this.parts.clear();
    this.joints.clear();
    this.body = null;
  }
}

export const personMass = () =>
  PERSON_DENSITY * (geomArea(BODY_GEOM) + LIMBS.reduce((m, l) => m + Math.PI * l.radius * l.radius, 0));

/** Lowest (feet) and highest (head) points of a pose, relative to the body center. */
export function poseExtent(pose: Pose, limbs = 0): { bottom: number; top: number } {
  const frames = poseTransforms({ x: 0, y: 0, angle: 0 }, targetsFor(limbs, pose), anglesFor(pose));
  let bottom = -(BODY_GEOM.kind === 'box' ? BODY_GEOM.hy : 0);
  let top = -bottom;
  for (const l of LIMBS) {
    const f = frames.get(l.orb)!;
    bottom = Math.min(bottom, f.y - l.radius);
    top = Math.max(top, f.y + l.radius);
  }
  return { bottom, top };
}
