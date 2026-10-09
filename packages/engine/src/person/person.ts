// The person shared by every game: a stumpy little human with a round body whose head, hands
// and feet are sticky orbs on stretchy limbs. Five joints total, one per limb.
//
// - Limbs and neck are short stubs by default. Holding a limb's key stretches it straight out;
//   letting go pulls it back in. Nothing is extended unless its key is held.
// - Limbs are solid, effectively weightless beams (scaffolding others can land on).
// - People come in sizes: the host (streamer) is scale 1, viewers are scale 0.5.
// - While falling, rotate/drift keys give a little air control. Once pinned to the tower by one
//   orb, the game turns air control off and drives the pin as a hinge instead.
//
// Front view, +y up, person frame origin at the body's center.
import type { BodyHandle, Filter, JointHandle, Physics, ShapeGeom, ShapeHandle, Transform, Vec2 } from '../physics/types.ts';

export type PartName = 'body' | 'head' | 'handL' | 'handR' | 'footL' | 'footR';
export type PartKind = 'body' | 'orb' | 'limb';
export type LimbKey = 'armL' | 'legL' | 'legR' | 'armR' | 'neck';

/** Bit per stretchable limb; a person's limb state is a 5-bit mask of keys held. */
export const LIMB_BITS: Record<LimbKey, number> = { armL: 1, legL: 2, legR: 4, armR: 8, neck: 16 };
export const ALL_LIMBS = 31;

/** Default keys (right-hand layout) for display: limbs, rotate, drift. */
export const KEY_LABELS = {
  limbs: { armL: 'J', legL: 'K', legR: 'L', armR: ';', neck: ',' } as Record<LimbKey, string>,
  rotateCCW: 'I',
  rotateCW: 'O',
  driftLeft: 'U',
  driftRight: 'P',
};

export interface PartTag {
  personId: number;
  /** Body or orb name, or the limb name for a limb beam. */
  part: PartName | LimbKey;
  kind: PartKind;
}

export interface LimbSpec {
  name: LimbKey;
  orb: PartName;
  /** Where the limb leaves the body (person frame). */
  root: Vec2;
  /** Default direction in the body frame (radians, CCW from +x). */
  angle: number;
  /** Root-to-orb-center distance when tucked (the stub). */
  tucked: number;
  /** Extra length when fully stretched. */
  reach: number;
  radius: number;
  /** Width of the solid limb beam (meters). */
  thickness: number;
  maxForce: number;
}

export interface PersonSpec {
  scale: number;
  /** Round body: an 8-sided ellipse with these radii. */
  bodyRx: number;
  bodyRy: number;
  body: ShapeGeom;
  limbs: readonly LimbSpec[];
}

const DEG = Math.PI / 180;

export const PERSON_DENSITY = 187; // host (scale 1) ≈ 70 kg, viewer (scale 0.5) ≈ 17 kg
const BODY_RX = 0.22;
const BODY_RY = 0.27;

/** Full-size (scale 1) limbs. Use `specFor(scale).limbs` for a given person. */
export const LIMBS: readonly LimbSpec[] = [
  { name: 'neck', orb: 'head', root: { x: 0, y: 0.25 }, angle: 90 * DEG, tucked: 0.2, reach: 0.35, radius: 0.17, thickness: 0.15, maxForce: 2500 },
  { name: 'armL', orb: 'handL', root: { x: -0.19, y: 0.1 }, angle: 160 * DEG, tucked: 0.14, reach: 0.55, radius: 0.09, thickness: 0.16, maxForce: 1500 },
  { name: 'armR', orb: 'handR', root: { x: 0.19, y: 0.1 }, angle: 20 * DEG, tucked: 0.14, reach: 0.55, radius: 0.09, thickness: 0.16, maxForce: 1500 },
  { name: 'legL', orb: 'footL', root: { x: -0.1, y: -0.24 }, angle: 250 * DEG, tucked: 0.14, reach: 0.6, radius: 0.1, thickness: 0.2, maxForce: 2500 },
  { name: 'legR', orb: 'footR', root: { x: 0.1, y: -0.24 }, angle: 290 * DEG, tucked: 0.14, reach: 0.6, radius: 0.1, thickness: 0.2, maxForce: 2500 },
];

/** An 8-sided ellipse with flat top and bottom (Box2D polygons max out at 8 vertices). */
function ellipsePolygon(rx: number, ry: number): ShapeGeom {
  const vertices: Vec2[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * (Math.PI / 4);
    vertices.push({ x: rx * Math.cos(a), y: ry * Math.sin(a) });
  }
  return { kind: 'polygon', vertices };
}

const specs = new Map<number, PersonSpec>();

/** Body and limb dimensions for a person of a given size. Mass scales with scale². */
export function specFor(scale = 1): PersonSpec {
  let s = specs.get(scale);
  if (!s) {
    const k = scale;
    s = {
      scale,
      bodyRx: BODY_RX * k,
      bodyRy: BODY_RY * k,
      body: ellipsePolygon(BODY_RX * k, BODY_RY * k),
      limbs: LIMBS.map((l) => ({
        ...l,
        root: { x: l.root.x * k, y: l.root.y * k },
        tucked: l.tucked * k,
        reach: l.reach * k,
        radius: l.radius * k,
        thickness: l.thickness * k,
        maxForce: l.maxForce * k * k,
      })),
    };
    specs.set(scale, s);
  }
  return s;
}

/**
 * Named whole-body poses: limb -> stretch fraction (0 tucked .. 1 full), plus optional limb
 * direction overrides. Poses are for posed people (the streamer, tests); viewers use keys.
 */
export interface Pose {
  stretch?: Partial<Record<LimbKey, number>>;
  angles?: Partial<Record<LimbKey, number>>;
}

export const POSES = {
  /** The streamer: T-pose, arms straight out sideways, legs planted. */
  tPose: { stretch: { neck: 0.3, armL: 1, armR: 1, legL: 1, legR: 1 }, angles: { armL: 180 * DEG, armR: 0, legL: 262 * DEG, legR: 278 * DEG } },
  /** Arms straight up, legs planted, head up a little. */
  armsUp: { stretch: { neck: 0.3, armL: 1, armR: 1, legL: 1, legR: 1 }, angles: { armL: 100 * DEG, armR: 80 * DEG, legL: 262 * DEG, legR: 278 * DEG } },
  /** Standing tall: legs and neck out, arms tucked. Used for stacking tests. */
  standing: { stretch: { neck: 1, armL: 0, armR: 0, legL: 1, legR: 1 }, angles: { legL: 265 * DEG, legR: 275 * DEG } },
} satisfies Record<string, Pose>;

/** Live steering: -1, 0 or 1 on each axis. */
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
  /** Size: 1 = host (streamer), 0.5 = viewer. */
  scale?: number;
  /** Limb keys held (LIMB_BITS mask). Default 0: everything tucked. */
  limbs?: number;
  pose?: Pose;
  filter: { category: number; mask: number };
  contactEvents?: boolean;
  linearVelocity?: Vec2;
  angularVelocity?: number;
  /** Stretch motor gain (1/s) and speed cap (m/s at scale 1). */
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
const mul = (v: Vec2, k: number): Vec2 => ({ x: v.x * k, y: v.y * k });
const dirOf = (a: number): Vec2 => ({ x: Math.cos(a), y: Math.sin(a) });

function geomArea(g: ShapeGeom): number {
  if (g.kind === 'box') return 4 * g.hx * g.hy;
  if (g.kind === 'circle') return Math.PI * g.radius * g.radius;
  let a = 0;
  for (let i = 0; i < g.vertices.length; i++) {
    const p = g.vertices[i]!;
    const q = g.vertices[(i + 1) % g.vertices.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Rotational inertia about the shape's own origin, per unit density. */
function geomInertia(g: ShapeGeom): number {
  if (g.kind === 'box') return (4 * g.hx * g.hy * (4 * g.hx * g.hx + 4 * g.hy * g.hy)) / 12;
  if (g.kind === 'circle') return (Math.PI * g.radius ** 4) / 2;
  let num = 0;
  for (let i = 0; i < g.vertices.length; i++) {
    const p = g.vertices[i]!;
    const q = g.vertices[(i + 1) % g.vertices.length]!;
    const cross = Math.abs(p.x * q.y - q.x * p.y);
    num += cross * (p.x * p.x + p.x * q.x + q.x * q.x + p.y * p.y + p.y * q.y + q.y * q.y);
  }
  return num / 12;
}

/** A limb beam from `from` to `to` (same frame), as a box; null if too short to matter. */
function beamGeom(from: Vec2, to: Vec2, thickness: number): ShapeGeom | null {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len < 0.01) return null;
  return { kind: 'box', hx: len / 2, hy: thickness / 2, center: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, angle: Math.atan2(to.y - from.y, to.x - from.x) };
}

/**
 * Limb beams are effectively weightless. Not exactly 0: in box2d3-wasm, adding a zero-density
 * shape to a body could zero that body's rotational inertia (it then can't be turned by any
 * joint or contact and spins forever). Found in Phase 0; a tiny density avoids it.
 */
const LIMB_DENSITY = 1e-3;

/** Rebuild a limb beam once its length drifts this far from the shape (fraction of scale, m). */
const LIMB_REBUILD = 0.03;

function transformGeom(g: ShapeGeom, t: Transform): ShapeGeom {
  if (g.kind === 'box') {
    return { kind: 'box', hx: g.hx, hy: g.hy, center: add({ x: t.x, y: t.y }, rot(g.center ?? { x: 0, y: 0 }, t.angle)), angle: t.angle + (g.angle ?? 0) };
  }
  if (g.kind === 'circle') return { kind: 'circle', radius: g.radius, center: add({ x: t.x, y: t.y }, rot(g.center ?? { x: 0, y: 0 }, t.angle)) };
  return { kind: 'polygon', vertices: g.vertices.map((v) => add({ x: t.x, y: t.y }, rot(v, t.angle))) };
}

/** Stretch target (meters of extension) per limb for a key mask and optional pose. */
export function targetsFor(limbs: number, pose?: Pose, spec: PersonSpec = specFor(1)): Record<LimbKey, number> {
  const out = {} as Record<LimbKey, number>;
  for (const l of spec.limbs) {
    const fixed = pose?.stretch?.[l.name];
    const frac = fixed !== undefined ? fixed : limbs & LIMB_BITS[l.name] ? 1 : 0;
    out[l.name] = frac * l.reach;
  }
  return out;
}

/** Limb directions (body frame) for a pose. */
export function anglesFor(pose?: Pose, spec: PersonSpec = specFor(1)): Record<LimbKey, number> {
  const out = {} as Record<LimbKey, number>;
  for (const l of spec.limbs) out[l.name] = pose?.angles?.[l.name] ?? l.angle;
  return out;
}

/** World transforms of every part for a body transform, stretch and limb angles. */
export function poseTransforms(origin: Transform, stretch: Record<LimbKey, number>, angles: Record<LimbKey, number>, spec: PersonSpec = specFor(1)): Map<PartName, Transform> {
  const out = new Map<PartName, Transform>();
  out.set('body', { ...origin });
  for (const l of spec.limbs) {
    const local = add(l.root, mul(dirOf(angles[l.name]), l.tucked + stretch[l.name]));
    const w = add({ x: origin.x, y: origin.y }, rot(local, origin.angle));
    out.set(l.orb, { x: w.x, y: w.y, angle: origin.angle });
  }
  return out;
}

export class Person {
  readonly id: number;
  readonly physics: Physics;
  readonly group: number;
  readonly scale: number;
  readonly spec: PersonSpec;
  state: 'ragdoll' | 'frozen' = 'ragdoll';
  /** Limb keys currently held (LIMB_BITS mask). */
  limbs: number;
  pose: Pose | undefined;
  drive: Drive = { rotate: 0, drift: 0 };
  /** Air control (drift + rotate impulses). The game turns it off once the person is pinned. */
  airControl = true;
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
  /** Live limb beams (one shape on each orb body) and the length they were built at. */
  private limbBeams = new Map<LimbKey, { shape: ShapeHandle; length: number }>();

  private motorGain: number;
  private motorMaxSpeed: number;
  private strength: number;
  private driftSpeed: number;
  private rotateSpeed: number;

  constructor(physics: Physics, o: PersonOptions) {
    this.physics = physics;
    this.id = o.id;
    this.group = -(1 + (o.id % 30000));
    this.scale = o.scale ?? 1;
    this.spec = specFor(this.scale);
    this.limbs = o.limbs ?? 0;
    this.pose = o.pose;
    this.angles = anglesFor(o.pose, this.spec);
    this.filter = o.filter;
    this.contactEvents = o.contactEvents ?? true;
    this.motorGain = o.motorGain ?? 12;
    this.motorMaxSpeed = (o.motorMaxSpeed ?? 4) * this.scale;
    this.strength = o.strength ?? 1;
    this.driftSpeed = o.driftSpeed ?? 2.5;
    this.rotateSpeed = o.rotateSpeed ?? 1.6;
    const frames = poseTransforms({ x: o.position.x, y: o.position.y, angle: o.angle ?? 0 }, targetsFor(this.limbs, this.pose, this.spec), this.angles, this.spec);
    const w = o.angularVelocity ?? 0;
    this.buildLive(frames, (at) => ({
      vx: (o.linearVelocity?.x ?? 0) - w * (at.y - o.position.y),
      vy: (o.linearVelocity?.y ?? 0) + w * (at.x - o.position.x),
      w,
    }));
  }

  limb(name: LimbKey): LimbSpec {
    return this.spec.limbs.find((l) => l.name === name)!;
  }

  partGeom(part: PartName): ShapeGeom {
    if (part === 'body') return this.spec.body;
    const l = this.spec.limbs.find((x) => x.orb === part)!;
    return { kind: 'circle', radius: l.radius };
  }

  mass(): number {
    return personMass(this.scale);
  }

  private tag(part: PartName): PartTag {
    return { personId: this.id, part, kind: part === 'body' ? 'body' : 'orb' };
  }

  private limbTag(limb: LimbKey): PartTag {
    return { personId: this.id, part: limb, kind: 'limb' };
  }

  /** Live: (re)build a limb's solid beam on its orb, from the orb back to the limb root. */
  private buildLimbBeam(l: LimbSpec, length: number) {
    const p = this.physics;
    const old = this.limbBeams.get(l.name);
    if (old) p.removeShape(old.shape);
    this.limbBeams.delete(l.name);
    const orb = this.parts.get(l.orb);
    if (orb === undefined) return;
    // The orb keeps the body's orientation (the stretch joint locks rotation), so in the orb's
    // frame the root lies straight back along the limb direction.
    const back = mul(dirOf(this.angles[l.name]), -length);
    const geom = beamGeom({ x: 0, y: 0 }, back, l.thickness);
    if (!geom) return;
    const shape = p.addShape(orb, geom, { density: LIMB_DENSITY, friction: 0.9, filter: this.shapeFilter(), contactEvents: this.contactEvents, tag: this.limbTag(l.name) });
    this.limbBeams.set(l.name, { shape, length });
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
      p.addShape(b, this.partGeom(part), { density: PERSON_DENSITY, friction: 0.9, filter: this.shapeFilter(), contactEvents: this.contactEvents, tag: this.tag(part) });
      this.parts.set(part, b);
      return b;
    };
    const body = make('body');
    const bt = frames.get('body')!;
    for (const l of this.spec.limbs) {
      const orb = make(l.orb);
      const ot = frames.get(l.orb)!;
      const dir = rot(dirOf(this.angles[l.name]), bt.angle);
      const root = add({ x: bt.x, y: bt.y }, rot(l.root, bt.angle));
      // anchorB = the orb point that sits on the root when tucked, so translation = stretch.
      const anchorB = sub({ x: ot.x, y: ot.y }, mul(dir, l.tucked));
      this.joints.set(l.name, p.createPrismatic({
        bodyA: body, bodyB: orb, anchor: root, anchorB, axis: dir,
        limits: { lower: 0, upper: l.reach }, motor: { speed: 0, maxForce: l.maxForce * this.strength },
      }));
      const d = sub({ x: ot.x, y: ot.y }, root);
      this.buildLimbBeam(l, Math.hypot(d.x, d.y));
    }
  }

  /** Drive limb motors toward the held keys, plus air control if enabled. Call once per step. */
  update() {
    if (this.state !== 'ragdoll') return;
    const p = this.physics;
    const targets = targetsFor(this.limbs, this.pose, this.spec);
    for (const l of this.spec.limbs) {
      const h = this.joints.get(l.name);
      if (h === undefined || !p.jointExists(h)) continue;
      const stretch = p.jointTranslation(h);
      const err = targets[l.name] - stretch;
      p.setMotorSpeed(h, Math.max(-this.motorMaxSpeed, Math.min(this.motorMaxSpeed, this.motorGain * err)));
      // Keep the solid beam matched to the limb's current length.
      const length = l.tucked + Math.max(0, stretch);
      const beam = this.limbBeams.get(l.name);
      if (!beam || Math.abs(beam.length - length) > LIMB_REBUILD * this.scale) this.buildLimbBeam(l, length);
    }
    if (!this.airControl) return;
    // Air control: nudge the whole person toward a capped sideways speed and spin rate.
    const body = this.parts.get('body')!;
    const v = p.getVelocity(body);
    if (this.drive.drift !== 0) {
      const dv = Math.max(-0.2, Math.min(0.2, this.drive.drift * this.driftSpeed - v.vx));
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
    }
  }

  /** Current stretch of a limb (meters), live or frozen. */
  stretch(limb: LimbKey): number {
    const l = this.limb(limb);
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
    for (const l of this.spec.limbs) {
      const h = this.joints.get(l.name);
      if (h !== undefined && this.physics.jointExists(h)) this.physics.setMotorMax(h, limp ? 20 * this.scale * this.scale : l.maxForce * this.strength);
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
    return add({ x: t.x, y: t.y }, rot(this.limb(limb).root, t.angle));
  }

  /** Merge body and orbs into one rigid body at the current pose. Momentum is preserved. */
  freeze(): BodyHandle {
    if (this.state === 'frozen' && this.body !== null) return this.body;
    const p = this.physics;
    const bt = p.getTransform(this.parts.get('body')!);

    let mass = 0, px = 0, py = 0, cx = 0, cy = 0;
    const info: { m: number; c: Vec2; v: { vx: number; vy: number; w: number }; i: number }[] = [];
    for (const [part, b] of this.parts) {
      const g = this.partGeom(part);
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
    this.limbBeams.clear();

    const body = p.createBody({ type: 'dynamic', position: { x: bt.x, y: bt.y }, angle: bt.angle, tag: { personId: this.id, frozen: true } });
    for (const [part, frame] of this.frozenFrames) {
      p.addShape(body, transformGeom(this.partGeom(part), frame), {
        density: PERSON_DENSITY, friction: 0.9, filter: this.shapeFilter(), contactEvents: this.contactEvents, tag: this.tag(part),
      });
    }
    // Solid, weightless limb beams: the scaffolding other people land on and stick to.
    for (const l of this.spec.limbs) {
      const orb = this.frozenFrames.get(l.orb);
      const geom = orb ? beamGeom(l.root, { x: orb.x, y: orb.y }, l.thickness) : null;
      if (geom) p.addShape(body, geom, { density: LIMB_DENSITY, friction: 0.9, filter: this.shapeFilter(), contactEvents: this.contactEvents, tag: this.limbTag(l.name) });
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
      } else {
        const corners: Vec2[] = g.kind === 'box'
          ? ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => add(g.center ?? { x: 0, y: 0 }, rot({ x: sx * g.hx, y: sy * g.hy }, g.angle ?? 0)))
          : g.vertices;
        for (const c of corners) {
          const w = add({ x: t.x, y: t.y }, rot(c, t.angle));
          if (w.y > best.y) best = w;
        }
      }
    }
    return best;
  }

  destroy() {
    for (const b of this.bodies()) this.physics.destroyBody(b);
    this.parts.clear();
    this.joints.clear();
    this.limbBeams.clear();
    this.body = null;
  }
}

/** Total mass of a person of a given size (body + five orbs; beams are weightless). */
export function personMass(scale = 1): number {
  const s = specFor(scale);
  return PERSON_DENSITY * (geomArea(s.body) + s.limbs.reduce((m, l) => m + Math.PI * l.radius * l.radius, 0));
}

/** Lowest (feet) and highest (head) points of a pose, relative to the body center. */
export function poseExtent(pose: Pose, limbs = 0, scale = 1): { bottom: number; top: number } {
  const spec = specFor(scale);
  const frames = poseTransforms({ x: 0, y: 0, angle: 0 }, targetsFor(limbs, pose, spec), anglesFor(pose, spec), spec);
  let bottom = -spec.bodyRy;
  let top = spec.bodyRy;
  for (const l of spec.limbs) {
    const f = frames.get(l.orb)!;
    bottom = Math.min(bottom, f.y - l.radius);
    top = Math.max(top, f.y + l.radius);
  }
  return { bottom, top };
}
