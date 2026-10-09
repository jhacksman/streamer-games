// Thin physics adapter. Game code talks only to this interface, never to a
// physics engine directly, so the backend (Box2D v3 or Planck) can be swapped.
//
// Conventions (both backends must honor these):
// - Units are meters, kilograms, seconds, radians. +y is up. Gravity is set per world.
// - Handles are opaque integers owned by the backend.
// - Joint anchors are given in WORLD coordinates at creation time.
// - Revolute/weld "referenceAngle" defaults to the bodies' current relative angle
//   (angleB - angleA), so a joint created between two posed bodies holds that pose.
//   Revolute joint angle = (angleB - angleA) - referenceAngle; limits are relative to it.
// - getJointForce returns the constraint force the joint applies to body B, in newtons.
//   getJointTorque returns the constraint torque on body B, in newton-meters.
// - Contact "begin" events are collected during step() and returned by
//   contactBegins() until the next step. They are safe to act on between steps.

export interface Vec2 {
  x: number;
  y: number;
}

export type BodyHandle = number;
export type ShapeHandle = number;
export type JointHandle = number;

export type BodyType = 'static' | 'kinematic' | 'dynamic';

export interface Filter {
  /** Bit this shape belongs to. */
  category: number;
  /** Bits this shape collides with. */
  mask: number;
  /** Shapes sharing the same negative group never collide with each other. */
  group: number;
}

export type ShapeGeom =
  | { kind: 'box'; hx: number; hy: number; center?: Vec2; angle?: number }
  | { kind: 'circle'; radius: number; center?: Vec2 }
  | { kind: 'polygon'; vertices: Vec2[] };

export interface ShapeOpts {
  density?: number;
  friction?: number;
  restitution?: number;
  filter?: Partial<Filter>;
  sensor?: boolean;
  /** Report contact begin events for this shape. */
  contactEvents?: boolean;
  /** Free-form app data stored alongside the shape (never passed to the engine). */
  tag?: unknown;
}

export interface BodyOpts {
  type: BodyType;
  position: Vec2;
  angle?: number;
  linearVelocity?: Vec2;
  angularVelocity?: number;
  bullet?: boolean;
  gravityScale?: number;
  linearDamping?: number;
  angularDamping?: number;
  /** Free-form app data stored alongside the body. */
  tag?: unknown;
}

export interface Transform {
  x: number;
  y: number;
  angle: number;
}

export interface Velocity {
  vx: number;
  vy: number;
  w: number;
}

interface JointBase {
  bodyA: BodyHandle;
  bodyB: BodyHandle;
  collideConnected?: boolean;
}

export interface RevoluteDef extends JointBase {
  anchor: Vec2;
  referenceAngle?: number;
  limits?: { lower: number; upper: number };
  motor?: { speed: number; maxTorque: number };
}

export interface WeldDef extends JointBase {
  anchor: Vec2;
  referenceAngle?: number;
  /** 0 = rigid. Box2D v3 only; Planck welds are always linearly rigid. */
  linearHertz?: number;
  linearDamping?: number;
  /** Rotational springiness ("wobble"). 0 = rigid. */
  angularHertz?: number;
  angularDamping?: number;
}

export interface PrismaticDef extends JointBase {
  /** World anchor on body A. Translation = (anchorB - anchor) projected on the axis. */
  anchor: Vec2;
  /** World anchor on body B; defaults to `anchor` (translation starts at 0). */
  anchorB?: Vec2;
  /** World-space slide axis (normalized by the backend). */
  axis: Vec2;
  limits?: { lower: number; upper: number };
  motor?: { speed: number; maxForce: number };
}

export interface WheelDef extends JointBase {
  anchor: Vec2;
  axis: Vec2;
  spring?: { hertz: number; damping: number };
  motor?: { speed: number; maxTorque: number };
}

export interface DistanceDef extends JointBase {
  anchorA: Vec2;
  anchorB: Vec2;
  /** Rest length; defaults to the current distance between anchors. */
  length?: number;
  /** Rope: minLength 0, maxLength = length, no spring. */
  minLength?: number;
  maxLength?: number;
  spring?: { hertz: number; damping: number };
}

export type JointKind = 'revolute' | 'weld' | 'prismatic' | 'wheel' | 'distance';

export interface ContactBegin {
  shapeA: ShapeHandle;
  shapeB: ShapeHandle;
  /** World contact point if the backend could compute one. */
  point: Vec2 | null;
}

export interface ContactEnd {
  shapeA: ShapeHandle;
  shapeB: ShapeHandle;
}

export interface ShapeRecord {
  body: BodyHandle;
  geom: ShapeGeom;
  opts: ShapeOpts;
}

export interface Physics {
  readonly name: string;
  /** Fixed-step advance. */
  step(dt: number): void;

  createBody(opts: BodyOpts): BodyHandle;
  destroyBody(body: BodyHandle): void;
  bodyExists(body: BodyHandle): boolean;
  bodyTag(body: BodyHandle): unknown;
  addShape(body: BodyHandle, geom: ShapeGeom, opts?: ShapeOpts): ShapeHandle;
  /** JS-side record of a shape (geometry is in the body's local frame). */
  shape(shape: ShapeHandle): ShapeRecord | undefined;
  bodyShapes(body: BodyHandle): readonly ShapeHandle[];
  setShapeFilter(shape: ShapeHandle, filter: Partial<Filter>): void;

  getTransform(body: BodyHandle): Transform;
  setTransform(body: BodyHandle, t: Transform): void;
  getVelocity(body: BodyHandle): Velocity;
  setVelocity(body: BodyHandle, v: Partial<Velocity>): void;
  getMass(body: BodyHandle): number;
  getWorldCenter(body: BodyHandle): Vec2;
  applyForce(body: BodyHandle, force: Vec2, point?: Vec2): void;
  applyTorque(body: BodyHandle, torque: number): void;
  applyLinearImpulse(body: BodyHandle, impulse: Vec2, point?: Vec2): void;
  applyAngularImpulse(body: BodyHandle, impulse: number): void;

  createRevolute(def: RevoluteDef): JointHandle;
  createWeld(def: WeldDef): JointHandle;
  createPrismatic(def: PrismaticDef): JointHandle;
  createWheel(def: WheelDef): JointHandle;
  createDistance(def: DistanceDef): JointHandle;
  destroyJoint(joint: JointHandle): void;
  jointExists(joint: JointHandle): boolean;
  jointKind(joint: JointHandle): JointKind | undefined;
  jointBodies(joint: JointHandle): [BodyHandle, BodyHandle];

  /** Revolute: current angle relative to its reference angle. */
  jointAngle(joint: JointHandle): number;
  /** Prismatic: current translation along the axis. */
  jointTranslation(joint: JointHandle): number;
  /** Revolute/wheel: motor speed (rad/s). Prismatic: motor speed (m/s). */
  setMotorSpeed(joint: JointHandle, speed: number): void;
  /** Revolute/wheel: max motor torque. Prismatic: max motor force. */
  setMotorMax(joint: JointHandle, max: number): void;

  getJointForce(joint: JointHandle): Vec2;
  getJointTorque(joint: JointHandle): number;

  contactBegins(): readonly ContactBegin[];
  /** Contacts that stopped touching during the last step (same event rules as begins). */
  contactEnds(): readonly ContactEnd[];

  counts(): { bodies: number; joints: number; shapes: number };
  dispose(): void;
}

export type BackendName = 'box2d3' | 'box2d3-compat' | 'box2d3-deluxe' | 'planck';
