// Phase 0 Chat Tower simulation, backend-agnostic. Used headless (run.ts, tests) and by the
// browser viewer. The landing rules (PLAN.md §10):
//
//   falling   A viewer drops tucked. Limbs/neck extend only while their key is held.
//   pivoting  The first sticky touch (a head, hand or foot orb is involved) PINS that point to the
//             tower as a hinge. The person can swing around it; rotate keys drive the hinge.
//             Body and limbs that touch without an orb just collide.
//   locked    A second sticky touch, by a different part and far enough from the first pin,
//             LOCKS the person in place: frozen rigid and welded at both points.
//
// Locked members bond where their orbs touch each other, bonds carry direction-split stress and
// snap, anything cut off from the streamer falls as debris, and the streamer tipping too far
// collapses everything.
import type { BodyHandle, JointHandle, Physics, ShapeHandle, Vec2 } from '../../../packages/engine/src/physics/types.ts';
import { StressTracker, type BondLimits, type StressMode } from '../../../packages/engine/src/physics/stress.ts';
import { capsuleContact, contactPoint, rotate, shapeCapsule } from '../../../packages/engine/src/physics/geometry.ts';
import { KEY_LABELS, LIMB_BITS, Person, POSES, poseExtent, type LimbKey, type PartName, type PartTag } from '../../../packages/engine/src/person/person.ts';
import { mulberry32 } from './rng.ts';

export const CAT = { GROUND: 0x1, TOWER: 0x2, FALLING: 0x4, DEBRIS: 0x8, CART: 0x10, STREAMER: 0x20 } as const;
// Locked members (and the streamer) are one welded structure and don't collide with each other:
// overlapping frozen limbs fought their welds (Phase 0 finding). Falling and pivoting people use
// the 'falling' filter, so they collide with the tower and that collision is what stops a swing.
export const FILTERS = {
  tower: { category: CAT.TOWER, mask: CAT.GROUND | CAT.FALLING | CAT.DEBRIS },
  streamer: { category: CAT.STREAMER, mask: CAT.FALLING | CAT.DEBRIS },
  falling: { category: CAT.FALLING, mask: CAT.GROUND | CAT.TOWER | CAT.DEBRIS | CAT.STREAMER },
  debris: { category: CAT.DEBRIS, mask: CAT.GROUND | CAT.TOWER | CAT.DEBRIS | CAT.FALLING | CAT.STREAMER },
};

export const DEFAULT_LIMITS: BondLimits = {
  compression: 1e9, // "super duper strong": stacking straight up never breaks
  tension: 20000,
  shear: 20000,
  twist: 2600,
  model: 'masonry',
  width: 0.25,
};

/** How dropped people behave. 'player' presses keys like a viewer would; 'passive' presses nothing. */
export type Bot = 'player' | 'passive';

export interface TowerConfig {
  seed: number;
  drops: number;
  dt?: number;
  bot?: Bot;
  /** Viewer size relative to the host (streamer). */
  viewerScale?: number;
  hostScale?: number;
  /** Drop height above the summit (m) and random sideways offset (m). */
  dropHeight?: number;
  spread?: number;
  /** A turn ends at lock, miss, or this many seconds after the drop. */
  turnTimeout?: number;
  /** Pause between turns (s). */
  turnGap?: number;
  base?: 'fixed' | 'balanced';
  sticky?: boolean;
  maxBondsPerPerson?: number;
  bondSpeed?: number;
  limits?: BondLimits;
  /** Weld springiness for locks and bonds. 0 Hz = rigid ("held in place"). */
  weld?: { angularHertz: number; angularDamping: number };
  /** Hinge (one-pin) motor speed (rad/s) while a rotate key is held. */
  pivotSpeed?: number;
  /** Hinge motor torque as a multiple of the torque to lift yourself at arm's length. */
  pivotStrength?: number;
  /** While it's your turn and no rotate key is held, the pin holds you at the angle you landed. */
  pivotHold?: number;
  /** Hinge friction once your turn is over (you dangle under gravity), same units. */
  pivotFriction?: number;
  /** The second pin must be at least this far (m, times person scale) from the first. */
  minLockSpacing?: number;
  /** The 'player' bot presses its reach key when its body is this close above the summit (m). */
  reachTrigger?: number;
  collapseAngle?: number;
  collapseHold?: number;
  settleAfter?: number;
  debrisLifetime?: number;
  /** Bonds to the streamer never snap: the streamer is the foundation; balance is the failure mode. */
  strongBase?: boolean;
  rebondCooldown?: number;
  /** How close (m) a locked member's sticky orb must come to another to bond. */
  stickyRadius?: number;
  /** Experiments only: limb keys held from spawn to landing (mask). -1 = normal. */
  limbs?: number;
  /** Each viewer starts on a claw above the summit and drops on release() (single-player / hotseat). */
  crane?: boolean;
  /** Claw slide speed (m/s) and turn speed (rad/s). */
  clawSpeed?: number;
  clawRotateSpeed?: number;
}

export type Role = 'streamer' | 'falling' | 'pivoting' | 'tower' | 'debris';

export interface Bond {
  joint: JointHandle;
  a: number;
  b: number;
  kind: 'lock' | 'sticky';
  /** Person-pair key: one bond (one weld) per pair of people. */
  key: string;
  /** Contact points in body A's local frame; their spread sets the bond's width. */
  points: Vec2[];
  width: number;
}

export interface Pin {
  joint: JointHandle;
  onto: number;
  selfShape: ShapeHandle;
  selfPart: PartName | LimbKey;
  /** Pin point in the frame of the body it's pinned onto. */
  localPoint: Vec2;
  since: number;
  /** Body angle relative to what it's pinned onto that the posture controller holds (rad). */
  target: number;
  /** Integral of the posture error (removes steady creep). */
  integral: number;
}

interface Dropper {
  spawnedAt: number;
  /** When they left the claw (or spawned, without a crane). The turn timer runs from here. */
  releasedAt: number;
  claw: { body: BodyHandle; weld: JointHandle } | null;
  /** While pinned: sticky touches that are still in contact, re-checked every step for a lock. */
  touches: Map<string, { selfShape: ShapeHandle; otherShape: ShapeHandle; selfPart: PartName | LimbKey; onto: number }>;
  /** Still this person's turn (the bot / viewer is pressing keys). */
  active: boolean;
  pin: Pin | null;
  targetX: number;
  reachLimb: LimbKey;
  rotateDir: number;
  flipAt: number;
  giveUpAt: number;
}

interface Candidate {
  selfShape: ShapeHandle;
  otherShape: ShapeHandle;
  selfPart: PartName | LimbKey;
  onto: number;
  point: Vec2;
}

export interface TowerMetrics {
  backend: string;
  steps: number;
  dropped: number;
  /** People locked into the tower (two pins). */
  landed: number;
  /** People who got a first pin. */
  pivots: number;
  missed: number;
  stickyBonds: number;
  snaps: { mode: StressMode; ratio: number }[];
  detached: number;
  collapsed: boolean;
  collapseTime: number | null;
  maxHeight: number;
  finalHeight: number;
  towerPeople: number;
  /** Still hanging by one pin at the end. */
  danglers: number;
  /** Seconds from first pin to lock, per lock. */
  pivotTimes: number[];
  nan: boolean;
  blowup: boolean;
  stepMs: number[];
  frameMs: number[];
  peopleAtTiming: number[];
  maxBodies: number;
  maxJoints: number;
  bondsAtEnd: number;
}

export interface DropperView {
  id: number;
  role: Role;
  /** Keys held right now, as labels (J K L ; , I O U P). */
  keys: string[];
  pins: number;
  /** Still hanging from the claw, waiting to be dropped. */
  onClaw: boolean;
}

const MIN_BOND_WIDTH = 0.25;
const MAX_BOND_POINTS = 4;
const BOND_POINT_SPACING = 0.15;
const MAX_BOND_WIDTH = 0.9;
const G = 10;

const STREAMER_ID = 0;
const now = () => performance.now();

const ORB_LIMB: Partial<Record<string, LimbKey>> = { head: 'neck', handL: 'armL', handR: 'armR', footL: 'legL', footR: 'legR' };

/** A touch sticks only if a sticky orb (head, hand or foot) is on at least one side. */
export function isSticky(a: PartTag, b: PartTag): boolean {
  return a.kind === 'orb' || b.kind === 'orb';
}

export class TowerSim {
  readonly p: Physics;
  readonly cfg: Required<TowerConfig>;
  readonly rng: () => number;
  readonly persons = new Map<number, Person>();
  readonly roles = new Map<number, Role>();
  readonly droppers = new Map<number, Dropper>();
  readonly bonds: Bond[] = [];
  readonly stress: StressTracker;
  readonly streamer: Person;
  readonly cart: BodyHandle;
  readonly ground: BodyHandle;
  readonly cartJoint: JointHandle;
  readonly ankle: JointHandle;
  readonly metrics: TowerMetrics;
  groundWeld: JointHandle | null = null;
  /** The person whose turn it is, if any. */
  activeId: number | null = null;
  /** Balanced base only: manual cart input (-1..1, the streamer's arrow keys). null = stand-in bot. */
  cartInput: number | null = null;
  /** Optional: replaces the bot for whoever's turn it is (viewer story mode, tests). */
  controller: ((sim: TowerSim, id: number, person: Person, pinned: boolean) => void) | null = null;
  /** Optional: choose where the nth drop (1-based) spawns. */
  spawnAt: ((n: number, summit: Vec2) => { x: number; angle?: number }) | null = null;

  time = 0;
  private nextTurnAt = 0.5;
  private nextId = 1;
  private tiltTime = 0;
  private bondCount = new Map<number, number>();
  private debrisSince = new Map<number, number>();
  private cooldownUntil = new Map<string, number>();
  readonly debug = { snapLog: [] as unknown[] };

  constructor(p: Physics, cfg: TowerConfig) {
    this.p = p;
    this.cfg = {
      dt: 1 / 60, bot: 'player', viewerScale: 0.5, hostScale: 1, dropHeight: 1.6, spread: 0.6,
      turnTimeout: 9, turnGap: 0.4, base: 'fixed', sticky: true, maxBondsPerPerson: 4, bondSpeed: 0.8,
      limits: DEFAULT_LIMITS, weld: { angularHertz: 0, angularDamping: 0.7 },
      pivotSpeed: 1.6, pivotStrength: 2.5, pivotHold: 2.5, pivotFriction: 0.08, minLockSpacing: 0.25, reachTrigger: 1.1,
      collapseAngle: (55 * Math.PI) / 180, collapseHold: 0.4, settleAfter: 4, debrisLifetime: 6,
      strongBase: true, rebondCooldown: 2, stickyRadius: 0.04, limbs: -1, crane: false, clawSpeed: 2.2, clawRotateSpeed: 1.6,
      ...cfg,
    };
    this.rng = mulberry32(this.cfg.seed);
    this.stress = new StressTracker({ limits: this.cfg.limits, smoothing: 0.25, holdTime: 0.1 });
    this.metrics = {
      backend: p.name, steps: 0, dropped: 0, landed: 0, pivots: 0, missed: 0, stickyBonds: 0, snaps: [], detached: 0,
      collapsed: false, collapseTime: null, maxHeight: 0, finalHeight: 0, towerPeople: 0, danglers: 0, pivotTimes: [],
      nan: false, blowup: false, stepMs: [], frameMs: [], peopleAtTiming: [], maxBodies: 0, maxJoints: 0, bondsAtEnd: 0,
    };

    this.ground = p.createBody({ type: 'static', position: { x: 0, y: 0 }, tag: { ground: true } });
    p.addShape(this.ground, { kind: 'box', hx: 60, hy: 1, center: { x: 0, y: -1 } }, { friction: 0.9, filter: { category: CAT.GROUND, mask: 0xffff }, tag: { ground: true } });

    const fixed = this.cfg.base === 'fixed';
    this.cart = p.createBody({ type: 'dynamic', position: { x: 0, y: 0.05 } });
    p.addShape(this.cart, { kind: 'box', hx: 0.3, hy: 0.05 }, { density: 2000, filter: { category: CAT.CART, mask: 0 } });
    this.cartJoint = p.createPrismatic({
      bodyA: this.ground, bodyB: this.cart, anchor: { x: 0, y: 0.05 }, axis: { x: 1, y: 0 },
      limits: { lower: -20, upper: 20 }, motor: { speed: 0, maxForce: fixed ? 0 : 60000 },
    });
    // The streamer: a full-size person frozen in a T-pose, feet just above the cart.
    const stance = poseExtent(POSES.tPose, 0, this.cfg.hostScale);
    this.streamer = new Person(p, {
      id: STREAMER_ID, scale: this.cfg.hostScale, position: { x: 0, y: 0.05 - stance.bottom }, pose: POSES.tPose,
      filter: FILTERS.streamer, contactEvents: true,
    });
    this.streamer.freeze();
    this.persons.set(STREAMER_ID, this.streamer);
    this.roles.set(STREAMER_ID, 'streamer');
    if (fixed) this.groundWeld = p.createWeld({ bodyA: this.ground, bodyB: this.streamer.body!, anchor: { x: 0, y: 0.05 } });
    this.ankle = p.createRevolute({
      bodyA: this.cart, bodyB: this.streamer.body!, anchor: { x: 0, y: 0.05 },
      limits: { lower: -1.35, upper: 1.35 }, motor: { speed: 0, maxTorque: fixed ? 0 : 9000 },
    });
  }

  // ---- queries (viewer, metrics) ----

  towerBodyOf(id: number): BodyHandle | null {
    return this.persons.get(id)?.body ?? null;
  }

  height(): number {
    let top = this.streamer.state === 'frozen' ? this.streamer.top() : 0;
    for (const [id, role] of this.roles) if (role === 'tower') top = Math.max(top, this.persons.get(id)!.top());
    return Math.max(0, top);
  }

  /** The tower's highest point: where drops aim. */
  summit(): Vec2 {
    let best: Vec2 = { x: this.p.getTransform(this.cart).x, y: 0 };
    for (const [id, role] of this.roles) {
      if (role !== 'tower' && role !== 'streamer') continue;
      const person = this.persons.get(id)!;
      if (person.state !== 'frozen') continue;
      const t = person.topPoint();
      if (t.y > best.y) best = t;
    }
    return best;
  }

  tilt(): number {
    return this.p.jointExists(this.ankle) ? this.p.jointAngle(this.ankle) : 0;
  }

  /** World position of a person's first pin, if pinned. */
  pinPoint(id: number): Vec2 | null {
    const pin = this.droppers.get(id)?.pin;
    if (!pin) return null;
    const onto = this.towerBodyOf(pin.onto);
    if (onto === null) return null;
    const t = this.p.getTransform(onto);
    const r = rotate(pin.localPoint, t.angle);
    return { x: t.x + r.x, y: t.y + r.y };
  }

  dropperView(id: number): DropperView | null {
    const person = this.persons.get(id);
    const role = this.roles.get(id);
    if (!person || !role || id === STREAMER_ID) return null;
    const keys: string[] = [];
    for (const [limb, bit] of Object.entries(LIMB_BITS) as [LimbKey, number][]) if (person.limbs & bit) keys.push(KEY_LABELS.limbs[limb]);
    if (person.drive.rotate < 0) keys.push(KEY_LABELS.rotateCCW);
    if (person.drive.rotate > 0) keys.push(KEY_LABELS.rotateCW);
    if (person.drive.drift < 0) keys.push(KEY_LABELS.driftLeft);
    if (person.drive.drift > 0) keys.push(KEY_LABELS.driftRight);
    return { id, role, keys, pins: role === 'tower' ? 2 : role === 'pivoting' ? 1 : 0, onClaw: !!this.droppers.get(id)?.claw };
  }

  // ---- turns ----

  private spawnDrop() {
    const summit = this.summit();
    const s = this.cfg.viewerScale;
    const limbs = this.cfg.limbs >= 0 ? this.cfg.limbs : 0;
    const extent = poseExtent({}, limbs, s);
    const x = summit.x + (this.rng() * 2 - 1) * this.cfg.spread;
    const angle = (this.rng() * 2 - 1) * 0.3;
    const reachChoices: LimbKey[] = ['legL', 'legR', 'legL', 'legR', 'armL', 'armR', 'neck'];
    const reachLimb = reachChoices[Math.floor(this.rng() * reachChoices.length)]!;
    const targetX = summit.x + (this.rng() * 2 - 1) * 0.15;
    const id = this.nextId++;
    const spot = this.spawnAt?.(id, summit);
    const person = new Person(this.p, {
      id, scale: s, position: { x: spot?.x ?? x, y: summit.y + this.cfg.dropHeight - extent.bottom }, angle: spot?.angle ?? angle, limbs,
      filter: FILTERS.falling, contactEvents: true,
    });
    this.persons.set(id, person);
    this.roles.set(id, 'falling');
    let claw: Dropper['claw'] = null;
    if (this.cfg.crane) {
      const bt = person.bodyTransform();
      const body = this.p.createBody({ type: 'kinematic', position: { x: bt.x, y: bt.y }, angle: bt.angle });
      const weld = this.p.createWeld({ bodyA: body, bodyB: person.parts.get('body')!, anchor: { x: bt.x, y: bt.y } });
      claw = { body, weld };
      person.airControl = false; // on the claw, U/P and I/O move the claw instead
    }
    this.droppers.set(id, { spawnedAt: this.time, releasedAt: this.time, claw, touches: new Map(), active: true, pin: null, targetX, reachLimb, rotateDir: 0, flipAt: 0, giveUpAt: 0 });
    this.activeId = id;
    this.metrics.dropped++;
  }

  private endTurn(id: number) {
    const d = this.droppers.get(id);
    if (d) d.active = false;
    const person = this.persons.get(id);
    // The viewer lets go of every key: anything still live tucks back in.
    if (person && person.state === 'ragdoll' && this.cfg.limbs < 0) person.limbs = 0;
    if (person) person.drive = { rotate: 0, drift: 0 };
    if (this.activeId === id) {
      this.activeId = null;
      this.nextTurnAt = this.time + this.cfg.turnGap;
    }
  }

  /** Drop the person off the claw. They keep the claw's motion. */
  release(id: number) {
    const d = this.droppers.get(id);
    if (!d?.claw) return;
    if (this.p.jointExists(d.claw.weld)) this.p.destroyJoint(d.claw.weld);
    this.p.destroyBody(d.claw.body);
    d.claw = null;
    d.releasedAt = this.time;
    const person = this.persons.get(id);
    if (person) person.airControl = true;
  }

  /** Claw position for drawing. */
  clawTransform(id: number) {
    const claw = this.droppers.get(id)?.claw;
    return claw ? this.p.getTransform(claw.body) : null;
  }

  private moveClaws() {
    for (const [id, d] of this.droppers) {
      if (!d.claw) continue;
      const person = this.persons.get(id)!;
      const t = this.p.getTransform(d.claw.body);
      // Ride above the summit as the tower grows; U/P slide, I/O turn.
      const targetY = this.summit().y + this.cfg.dropHeight - poseExtent({}, 0, person.scale).bottom;
      const vx = t.x < -15 && person.drive.drift < 0 ? 0 : t.x > 15 && person.drive.drift > 0 ? 0 : person.drive.drift * this.cfg.clawSpeed;
      this.p.setVelocity(d.claw.body, { vx, vy: Math.max(-2, Math.min(2, (targetY - t.y) * 3)), w: -person.drive.rotate * this.cfg.clawRotateSpeed });
    }
  }

  // ---- the 'player' bot: a stand-in for a viewer pressing keys ----

  private botControl(id: number, person: Person, d: Dropper) {
    if (this.cfg.limbs >= 0) person.limbs = this.cfg.limbs;
    if (this.cfg.bot === 'passive') {
      if (this.cfg.limbs < 0) person.limbs = 0;
      person.drive = { rotate: 0, drift: 0 };
      return;
    }
    const role = this.roles.get(id);
    const bt = person.bodyTransform();
    if (d.claw) {
      // On the claw: slide over the target, then drop.
      const dx = d.targetX - bt.x;
      person.drive = { rotate: 0, drift: Math.abs(dx) > 0.06 ? Math.sign(dx) : 0 };
      if (Math.abs(dx) <= 0.06) this.release(id);
      return;
    }
    if (role === 'falling') {
      // Steer toward the summit (U/P), tucked, and press one limb key only when close.
      const dx = d.targetX - bt.x;
      person.drive = { rotate: 0, drift: Math.abs(dx) > 0.06 ? Math.sign(dx) : 0 };
      const close = bt.y - this.summit().y < this.cfg.reachTrigger;
      if (this.cfg.limbs < 0) person.limbs = close ? LIMB_BITS[d.reachLimb] : 0;
      return;
    }
    if (role !== 'pivoting' || !d.pin) return;
    // Pinned by one point: swing (I/O) to bring a second orb onto the tower, reaching with the
    // limbs on the far side while keeping the pinned limb's key held.
    const pinLimb = ORB_LIMB[d.pin.selfPart] ?? (d.pin.selfPart in LIMB_BITS ? (d.pin.selfPart as LimbKey) : null);
    const reach = pinLimb === 'armL' || pinLimb === 'armR' ? LIMB_BITS.legL | LIMB_BITS.legR : LIMB_BITS.armL | LIMB_BITS.armR;
    if (this.time > d.giveUpAt && d.giveUpAt > 0) {
      person.drive = { rotate: 0, drift: 0 };
      if (this.cfg.limbs < 0) person.limbs = pinLimb ? LIMB_BITS[pinLimb] : 0;
      return;
    }
    if (d.rotateDir === 0) {
      const pin = this.pinPoint(id)!;
      const c = this.p.getWorldCenter(person.parts.get('body')!);
      if (Math.abs(c.x - pin.x) > 0.05 * person.scale) {
        d.rotateDir = c.x > pin.x ? 1 : -1; // swing the way gravity already pulls
      } else {
        // Balanced over or under the pin: swing toward the tower's axis.
        const axis = this.p.getTransform(this.cart).x;
        const wantRight = axis > c.x;
        const ccwMovesRight = c.y < pin.y; // below the pin, counter-clockwise moves right
        d.rotateDir = wantRight === ccwMovesRight ? -1 : 1;
      }
      d.flipAt = this.time + 2.5;
      d.giveUpAt = this.time + 7;
    }
    if (this.time > d.flipAt) {
      d.rotateDir *= -1;
      d.flipAt = this.time + 2.5;
    }
    person.drive = { rotate: d.rotateDir, drift: 0 };
    if (this.cfg.limbs < 0) person.limbs = (pinLimb ? LIMB_BITS[pinLimb] : 0) | reach;
  }

  /** Hinge torque scale: what it takes to lift yourself at about arm's length. */
  private hingeTorque(person: Person) {
    return person.mass() * G * 0.9 * person.scale;
  }

  /**
   * While it's your turn, a posture controller on your BODY holds your angle relative to what
   * you're pinned to (cancelling gravity), and I/O move that target angle. It acts on the heavy
   * body directly: driving the 17 kg body through the light 1 kg orb's joints sagged by up to
   * 1.8 rad in Phase 0. After your turn, only a little hinge friction is left and you dangle.
   */
  private driveHinges() {
    const dt = this.cfg.dt;
    for (const [id, d] of this.droppers) {
      if (!d.pin || this.roles.get(id) !== 'pivoting') continue;
      const person = this.persons.get(id)!;
      if (!this.p.jointExists(d.pin.joint)) continue;
      this.p.setMotorMax(d.pin.joint, this.hingeTorque(person) * this.cfg.pivotFriction);
      this.p.setMotorSpeed(d.pin.joint, 0);
      if (!d.active) continue;
      const onto = this.towerBodyOf(d.pin.onto);
      const body = person.parts.get('body');
      const pin = this.pinPoint(id);
      if (onto === null || body === undefined || !pin) continue;
      const rel = this.p.getTransform(body).angle - this.p.getTransform(onto).angle;
      d.pin.target += -person.drive.rotate * this.cfg.pivotSpeed * dt; // clockwise (+1) is a negative angle
      const rate = -person.drive.rotate * this.cfg.pivotSpeed; // the target's own rotation rate
      let err = wrapAngle(d.pin.target - rel);
      const blocked = Math.abs(err) > 0.5;
      if (blocked) {
        // Something is in the way: don't wind up.
        err = Math.sign(err) * 0.5;
        d.pin.target = rel + err;
      }
      // The integral only trims steady creep while holding still; turning or pushing resets it.
      if (blocked || person.drive.rotate !== 0) d.pin.integral = 0;
      else d.pin.integral = Math.max(-0.3, Math.min(0.3, d.pin.integral + err * dt));
      const wRel = this.p.getVelocity(body).w - this.p.getVelocity(onto).w - rate;
      let m = 0, cx = 0, cy = 0;
      for (const b of person.bodies()) {
        const bm = this.p.getMass(b);
        const c = this.p.getWorldCenter(b);
        m += bm; cx += bm * c.x; cy += bm * c.y;
      }
      cx /= m; cy /= m;
      const tauGravity = (cx - pin.x) * -m * G; // gravity's torque about the pin
      const I = m * ((cx - pin.x) ** 2 + (cy - pin.y) ** 2) + 0.02 * m * person.scale * person.scale;
      const w = 12;
      const max = this.hingeTorque(person) * (person.drive.rotate !== 0 ? this.cfg.pivotStrength : this.cfg.pivotHold);
      const tau = Math.max(-max, Math.min(max, -tauGravity + I * w * w * (err + 0.4 * w * d.pin.integral) - 2 * I * w * wRel));
      this.p.applyTorque(body, tau);
      this.p.applyTorque(onto, -tau);
    }
  }

  // ---- contacts: pins and locks ----

  private roleOfShape(shape: number): { role: Role | 'ground'; tag: PartTag | null } | null {
    const rec = this.p.shape(shape);
    if (!rec) return null;
    const tag = rec.opts.tag as PartTag | { ground: true } | undefined;
    if (!tag) return null;
    if ('ground' in tag) return { role: 'ground', tag: null };
    const role = this.roles.get(tag.personId);
    return role ? { role, tag } : null;
  }

  private processContacts() {
    const pins = new Map<number, Candidate[]>();
    const misses = new Set<number>();
    const solid = (r: Role | 'ground') => r === 'tower' || r === 'streamer';
    const touchKey = (a: ShapeHandle, b: ShapeHandle) => `${a}:${b}`;

    for (const c of this.p.contactBegins()) {
      const A = this.roleOfShape(c.shapeA);
      const B = this.roleOfShape(c.shapeB);
      if (!A || !B) continue;
      for (const [x, y, xs, ys] of [[A, B, c.shapeA, c.shapeB], [B, A, c.shapeB, c.shapeA]] as const) {
        if (!x.tag) continue;
        const id = x.tag.personId;
        if (x.role === 'falling') {
          if (solid(y.role) && y.tag) {
            if (isSticky(x.tag, y.tag)) {
              if (!pins.has(id)) pins.set(id, []);
              const point = c.point ?? this.p.getWorldCenter(this.p.shape(xs)!.body);
              pins.get(id)!.push({ selfShape: xs, otherShape: ys, selfPart: x.tag.part, onto: y.tag.personId, point });
            }
          } else if (y.role === 'ground' || y.role === 'debris') {
            misses.add(id);
          }
        } else if (x.role === 'pivoting' && solid(y.role) && y.tag && isSticky(x.tag, y.tag)) {
          this.droppers.get(id)?.touches.set(touchKey(xs, ys), { selfShape: xs, otherShape: ys, selfPart: x.tag.part, onto: y.tag.personId });
        }
      }
    }
    for (const c of this.p.contactEnds()) {
      for (const d of this.droppers.values()) {
        if (d.touches.size === 0) continue;
        d.touches.delete(touchKey(c.shapeA, c.shapeB));
        d.touches.delete(touchKey(c.shapeB, c.shapeA));
      }
    }

    for (const id of misses) {
      if (pins.has(id) || this.roles.get(id) !== 'falling') continue;
      this.toDebris(id);
      this.metrics.missed++;
    }
    for (const [id, cands] of pins) {
      if (this.roles.get(id) !== 'falling') continue;
      const first = cands[0]!;
      this.pin(id, first);
      // Every other sticky touch from the same impact is a live touch: it can lock straight away.
      const d = this.droppers.get(id)!;
      for (const c of cands.slice(1)) d.touches.set(touchKey(c.selfShape, c.otherShape), { selfShape: c.selfShape, otherShape: c.otherShape, selfPart: c.selfPart, onto: c.onto });
    }
    this.checkLocks();
  }

  /**
   * A pinned person locks as soon as any sticky touch that is still in contact is a different
   * part, far enough from the pin. Checked every step, not just when a touch starts: the hold
   * keeps people still, so a touch that becomes valid later produces no new contact event.
   */
  private checkLocks() {
    for (const [id, d] of this.droppers) {
      if (!d.pin || d.touches.size === 0 || this.roles.get(id) !== 'pivoting') continue;
      const person = this.persons.get(id)!;
      const pin = this.pinPoint(id);
      if (!pin) continue;
      for (const [key, t] of d.touches) {
        if (!this.p.shape(t.selfShape) || !this.p.shape(t.otherShape)) {
          d.touches.delete(key); // a limb beam was rebuilt, or the other person changed shape
          continue;
        }
        const ontoRole = this.roles.get(t.onto);
        if (ontoRole !== 'tower' && ontoRole !== 'streamer') continue;
        if (t.selfPart === d.pin.selfPart) continue;
        const point = contactPoint(this.p, t.selfShape, t.otherShape);
        if (!point || Math.hypot(point.x - pin.x, point.y - pin.y) < this.cfg.minLockSpacing * person.scale) continue;
        this.lock(id, { selfShape: t.selfShape, otherShape: t.otherShape, selfPart: t.selfPart, onto: t.onto, point });
        break;
      }
    }
  }

  private pin(id: number, c: Candidate) {
    const person = this.persons.get(id)!;
    const d = this.droppers.get(id)!;
    if (d.claw) this.release(id); // grabbed the tower while still on the claw
    const ontoBody = this.towerBodyOf(c.onto);
    const self = this.p.shape(c.selfShape);
    if (ontoBody === null || !self) return;
    const joint = this.p.createRevolute({
      bodyA: ontoBody, bodyB: self.body, anchor: c.point,
      motor: { speed: 0, maxTorque: this.hingeTorque(person) * this.cfg.pivotFriction },
    });
    // Sticky catch: the grab kills your motion relative to what you grabbed, so you stay at the
    // angle you landed. From here only your rotate keys (or, after your turn, gravity) swing you.
    for (const b of person.bodies()) {
      const at = this.p.getWorldCenter(b);
      const v = this.bodyVelocityAt(ontoBody, at);
      this.p.setVelocity(b, { vx: v.x, vy: v.y, w: this.p.getVelocity(ontoBody).w });
    }
    const t = this.p.getTransform(ontoBody);
    const rel = person.bodyTransform().angle - t.angle;
    d.pin = { joint, onto: c.onto, selfShape: c.selfShape, selfPart: c.selfPart, localPoint: rotate({ x: c.point.x - t.x, y: c.point.y - t.y }, -t.angle), since: this.time, target: rel, integral: 0 };
    d.rotateDir = 0;
    d.touches.clear();
    person.airControl = false;
    person.drive = { rotate: 0, drift: 0 };
    this.roles.set(id, 'pivoting');
    this.metrics.pivots++;
  }

  private lock(id: number, second: Candidate) {
    const person = this.persons.get(id)!;
    const d = this.droppers.get(id)!;
    const pin = d.pin!;
    const first = { onto: pin.onto, point: this.pinPoint(id)! };
    if (this.p.jointExists(pin.joint)) this.p.destroyJoint(pin.joint);
    d.pin = null;
    person.drive = { rotate: 0, drift: 0 };
    person.freeze();
    person.setFilter(FILTERS.tower);
    this.roles.set(id, 'tower');
    const groups = new Map<number, Vec2[]>();
    for (const q of [first, { onto: second.onto, point: second.point }]) {
      if (!groups.has(q.onto)) groups.set(q.onto, []);
      groups.get(q.onto)!.push(q.point);
    }
    for (const [onto, pts] of groups) this.addBond(onto, id, pts, 'lock');
    this.metrics.landed++;
    this.metrics.pivotTimes.push(this.time - pin.since);
    if (this.activeId === id) this.endTurn(id);
    this.droppers.delete(id); // locked people need no turn state
  }

  // ---- bonds ----

  private pairKey(a: number, b: number) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private widen(bond: Bond, at: Vec2) {
    const ba = this.towerBodyOf(bond.a);
    if (ba === null) return;
    const t = this.p.getTransform(ba);
    const local = rotate({ x: at.x - t.x, y: at.y - t.y }, -t.angle);
    if (bond.points.length >= MAX_BOND_POINTS) return;
    if (bond.points.some((q) => Math.hypot(q.x - local.x, q.y - local.y) < BOND_POINT_SPACING * 0.5)) return;
    bond.points.push(local);
    let w = MIN_BOND_WIDTH;
    for (let i = 0; i < bond.points.length; i++) {
      for (let j = i + 1; j < bond.points.length; j++) {
        const pi = bond.points[i]!;
        const pj = bond.points[j]!;
        w = Math.max(w, Math.hypot(pi.x - pj.x, pi.y - pj.y) + MIN_BOND_WIDTH);
      }
    }
    bond.width = Math.min(MAX_BOND_WIDTH, w);
    this.stress.setWidth(bond.joint, bond.width);
  }

  /** One weld per pair of people, at the centroid of its contact points; more points widen it. */
  private addBond(a: number, b: number, points: Vec2[], kind: Bond['kind']) {
    const key = this.pairKey(a, b);
    const existing = this.bonds.find((x) => x.key === key);
    if (existing) {
      for (const pt of points) this.widen(existing, pt);
      return;
    }
    const ba = this.towerBodyOf(a);
    const bb = this.towerBodyOf(b);
    if (ba === null || bb === null) return;
    const anchor = { x: points.reduce((s, q) => s + q.x, 0) / points.length, y: points.reduce((s, q) => s + q.y, 0) / points.length };
    const joint = this.p.createWeld({
      bodyA: ba, bodyB: bb, anchor, angularHertz: this.cfg.weld.angularHertz, angularDamping: this.cfg.weld.angularDamping,
    });
    const t = this.p.getTransform(ba);
    const first = points[0]!;
    const bond: Bond = { joint, a, b, kind, key, points: [rotate({ x: first.x - t.x, y: first.y - t.y }, -t.angle)], width: MIN_BOND_WIDTH };
    this.bonds.push(bond);
    if (!(this.cfg.strongBase && (a === STREAMER_ID || b === STREAMER_ID))) this.stress.add(joint, MIN_BOND_WIDTH);
    for (const pt of points.slice(1)) this.widen(bond, pt);
    this.bondCount.set(a, (this.bondCount.get(a) ?? 0) + 1);
    this.bondCount.set(b, (this.bondCount.get(b) ?? 0) + 1);
  }

  /** Locked members bond where a sticky orb of one touches the other, once nearly at rest. */
  private processSticky() {
    if (!this.cfg.sticky) return;
    const landed: Person[] = [];
    for (const [id, role] of this.roles) {
      if (role === 'tower' || role === 'streamer') {
        const person = this.persons.get(id)!;
        if (person.state === 'frozen' && person.body !== null) landed.push(person);
      }
    }
    const caps = new Map<number, { orb: boolean; cap: NonNullable<ReturnType<typeof shapeCapsule>> }[]>();
    const capsOf = (q: Person) => {
      let c = caps.get(q.id);
      if (!c) {
        c = [];
        for (const sh of q.shapes()) {
          const cap = shapeCapsule(this.p, sh);
          if (cap) c.push({ orb: (this.p.shape(sh)!.opts.tag as PartTag).kind === 'orb', cap });
        }
        caps.set(q.id, c);
      }
      return c;
    };
    const centers = landed.map((q) => this.p.getWorldCenter(q.body!));
    for (let i = 0; i < landed.length; i++) {
      for (let j = i + 1; j < landed.length; j++) {
        const A = landed[i]!;
        const B = landed[j]!;
        if (Math.hypot(centers[i]!.x - centers[j]!.x, centers[i]!.y - centers[j]!.y) > 2.6) continue;
        const key = this.pairKey(A.id, B.id);
        const existing = this.bonds.find((x) => x.key === key);
        if (!existing && (this.cooldownUntil.get(key) ?? 0) > this.time) continue;
        if (!existing) {
          const capA = A.id === STREAMER_ID ? Infinity : this.cfg.maxBondsPerPerson;
          const capB = B.id === STREAMER_ID ? Infinity : this.cfg.maxBondsPerPerson;
          if ((this.bondCount.get(A.id) ?? 0) >= capA || (this.bondCount.get(B.id) ?? 0) >= capB) continue;
        }
        for (const ca of capsOf(A)) {
          for (const cb of capsOf(B)) {
            if (!ca.orb && !cb.orb) continue; // only the orbs are sticky
            const hit = capsuleContact(ca.cap, cb.cap);
            if (hit.gap > this.cfg.stickyRadius) continue;
            if (!existing) {
              const va = this.bodyVelocityAt(A.body!, hit.point);
              const vb = this.bodyVelocityAt(B.body!, hit.point);
              if (Math.hypot(va.x - vb.x, va.y - vb.y) > this.cfg.bondSpeed) continue;
              this.metrics.stickyBonds++;
            }
            this.addBond(A.id, B.id, [hit.point], 'sticky');
          }
        }
      }
    }
  }

  private bodyVelocityAt(body: BodyHandle, at: Vec2) {
    const v = this.p.getVelocity(body);
    const c = this.p.getWorldCenter(body);
    return { x: v.vx - v.w * (at.y - c.y), y: v.vy + v.w * (at.x - c.x) };
  }

  private processStress() {
    const snaps = this.stress.update(this.p, this.cfg.dt);
    if (snaps.length === 0) return;
    for (const s of snaps) {
      const i = this.bonds.findIndex((b) => b.joint === s.joint);
      if (i < 0) continue;
      const bond = this.bonds[i]!;
      this.p.destroyJoint(s.joint);
      this.stress.remove(s.joint);
      this.bonds.splice(i, 1);
      this.cooldownUntil.set(bond.key, this.time + this.cfg.rebondCooldown);
      this.bondCount.set(bond.a, (this.bondCount.get(bond.a) ?? 1) - 1);
      this.bondCount.set(bond.b, (this.bondCount.get(bond.b) ?? 1) - 1);
      this.metrics.snaps.push({ mode: s.reading.governing, ratio: s.reading.ratio });
      this.debug.snapLog.push({ t: +this.time.toFixed(2), bond: `${bond.kind} ${bond.a}->${bond.b}`, width: +bond.width.toFixed(2), ratio: +s.reading.ratio.toFixed(2), mode: s.reading.governing });
    }
    // Anyone no longer connected to the streamer falls as debris, and so does anyone pinned to them.
    const reached = new Set<number>([STREAMER_ID]);
    const queue = [STREAMER_ID];
    while (queue.length) {
      const id = queue.pop()!;
      for (const b of this.bonds) {
        const other = b.a === id ? b.b : b.b === id ? b.a : null;
        if (other !== null && !reached.has(other)) {
          reached.add(other);
          queue.push(other);
        }
      }
    }
    for (const [id, role] of this.roles) {
      if (role === 'tower' && !reached.has(id)) {
        this.dropBondsOf(id);
        this.toDebris(id);
        this.metrics.detached++;
      }
    }
    this.dropOrphanedPins();
  }

  private dropOrphanedPins() {
    for (const [id, d] of this.droppers) {
      if (!d.pin || this.roles.get(id) !== 'pivoting') continue;
      const ontoRole = this.roles.get(d.pin.onto);
      if (ontoRole !== 'tower' && ontoRole !== 'streamer') this.toDebris(id);
    }
  }

  private dropBondsOf(id: number) {
    for (let i = this.bonds.length - 1; i >= 0; i--) {
      const b = this.bonds[i]!;
      if (b.a !== id && b.b !== id) continue;
      if (this.p.jointExists(b.joint)) this.p.destroyJoint(b.joint);
      this.stress.remove(b.joint);
      this.bonds.splice(i, 1);
      this.bondCount.set(b.a, (this.bondCount.get(b.a) ?? 1) - 1);
      this.bondCount.set(b.b, (this.bondCount.get(b.b) ?? 1) - 1);
    }
  }

  private toDebris(id: number) {
    const person = this.persons.get(id);
    if (!person) return;
    const d = this.droppers.get(id);
    if (d?.claw) this.release(id);
    d?.touches.clear();
    if (d?.pin) {
      if (this.p.jointExists(d.pin.joint)) this.p.destroyJoint(d.pin.joint);
      d.pin = null;
    }
    if (person.state === 'frozen') person.unfreeze(true);
    else person.setLimp(true);
    person.limbs = 0;
    person.setFilter(FILTERS.debris);
    this.roles.set(id, 'debris');
    this.debrisSince.set(id, this.time);
    if (this.activeId === id) this.endTurn(id);
  }

  collapse() {
    if (this.metrics.collapsed) return;
    this.metrics.collapsed = true;
    this.metrics.collapseTime = this.time;
    for (const b of this.bonds) {
      if (this.p.jointExists(b.joint)) this.p.destroyJoint(b.joint);
      this.stress.remove(b.joint);
    }
    this.bonds.length = 0;
    for (const [id, role] of this.roles) {
      if (role === 'tower' || role === 'falling' || role === 'pivoting') this.toDebris(id);
    }
    this.streamer.unfreeze(true);
    this.streamer.setFilter(FILTERS.debris);
    this.roles.set(STREAMER_ID, 'debris');
  }

  private control() {
    const p = this.p;
    if (!p.jointExists(this.ankle) || this.cfg.base === 'fixed' || this.streamer.body === null) return;
    // Stand-in for the human streamer: slide the cart toward the lean, like balancing a broom.
    // (React to the lean, not the center of mass: the streamer rides the cart, so chasing the
    // center of mass made the cart run away in Phase 0.)
    const lean = p.jointAngle(this.ankle); // + = leaning counter-clockwise (left)
    const leanRate = p.getVelocity(this.streamer.body).w - p.getVelocity(this.cart).w;
    const v = this.cartInput !== null
      ? this.cartInput * 3 // the human streamer's arrow keys
      : Math.max(-5, Math.min(5, -8 * lean - 2 * leanRate - 0.3 * p.jointTranslation(this.cartJoint)));
    p.setMotorSpeed(this.cartJoint, v);
    p.setMotorSpeed(this.ankle, -4 * lean);
  }

  private checkHealth() {
    for (const person of this.persons.values()) {
      for (const b of person.bodies()) {
        const t = this.p.getTransform(b);
        const v = this.p.getVelocity(b);
        if (!Number.isFinite(t.x + t.y + t.angle + v.vx + v.vy + v.w)) this.metrics.nan = true;
        if (Math.hypot(v.vx, v.vy) > 80 || Math.abs(v.w) > 120) this.metrics.blowup = true;
      }
    }
    const c = this.p.counts();
    this.metrics.maxBodies = Math.max(this.metrics.maxBodies, c.bodies);
    this.metrics.maxJoints = Math.max(this.metrics.maxJoints, c.joints);
  }

  /** One fixed step of the whole game loop. */
  step() {
    const frameStart = now();
    const dt = this.cfg.dt;
    if (!this.metrics.collapsed && this.activeId === null && this.metrics.dropped < this.cfg.drops && this.time >= this.nextTurnAt) this.spawnDrop();
    if (this.activeId !== null) {
      const d = this.droppers.get(this.activeId)!;
      // The turn timer starts when you leave the claw.
      if (!d.claw && this.time - d.releasedAt > this.cfg.turnTimeout) this.endTurn(this.activeId);
    }

    for (const [id, d] of this.droppers) {
      const role = this.roles.get(id);
      if (role !== 'falling' && role !== 'pivoting') continue;
      const person = this.persons.get(id)!;
      if (d.active) {
        if (this.controller) this.controller(this, id, person, d.pin !== null);
        else this.botControl(id, person, d);
      }
      person.update();
    }
    this.moveClaws();
    this.driveHinges();
    this.control();

    const t0 = now();
    this.p.step(dt);
    const t1 = now();

    this.processContacts();
    if (this.metrics.steps % 6 === 0) this.processSticky();
    this.processStress();

    if (!this.metrics.collapsed) {
      this.tiltTime = Math.abs(this.tilt()) > this.cfg.collapseAngle ? this.tiltTime + dt : 0;
      if (this.tiltTime >= this.cfg.collapseHold) this.collapse();
    }
    // Someone whose turn is over but who never stuck anywhere (resting on a body or limb) goes to debris.
    for (const [id, d] of this.droppers) {
      if (!d.active && !d.claw && this.roles.get(id) === 'falling' && this.time - d.releasedAt > this.cfg.turnTimeout + this.cfg.debrisLifetime) this.toDebris(id);
    }
    for (const [id, since] of this.debrisSince) {
      if (this.time - since > this.cfg.debrisLifetime && id !== STREAMER_ID) {
        this.persons.get(id)?.destroy();
        this.persons.delete(id);
        this.roles.delete(id);
        this.droppers.delete(id);
        this.debrisSince.delete(id);
        this.bondCount.delete(id);
        for (const key of this.cooldownUntil.keys()) if (key.split('|').includes(String(id))) this.cooldownUntil.delete(key);
      }
    }

    this.time += dt;
    this.metrics.steps++;
    if (this.metrics.steps % 10 === 0) {
      this.checkHealth();
      if (!this.metrics.collapsed) this.metrics.maxHeight = Math.max(this.metrics.maxHeight, this.height());
    }
    this.metrics.stepMs.push(t1 - t0);
    this.metrics.frameMs.push(now() - frameStart);
    let people = 0;
    for (const r of this.roles.values()) if (r === 'tower') people++;
    this.metrics.peopleAtTiming.push(people);
  }

  done(): boolean {
    if (this.metrics.collapsed) return this.time - (this.metrics.collapseTime ?? 0) > 3;
    return this.metrics.dropped >= this.cfg.drops && this.activeId === null && this.time > this.nextTurnAt + this.cfg.settleAfter;
  }

  run(maxSeconds = 900): TowerMetrics {
    while (!this.done() && this.time < maxSeconds) this.step();
    this.checkHealth();
    this.metrics.finalHeight = this.metrics.collapsed ? 0 : this.height();
    if (!this.metrics.collapsed) this.metrics.maxHeight = Math.max(this.metrics.maxHeight, this.metrics.finalHeight);
    let people = 0;
    let danglers = 0;
    for (const r of this.roles.values()) {
      if (r === 'tower') people++;
      if (r === 'pivoting') danglers++;
    }
    this.metrics.towerPeople = people;
    this.metrics.danglers = danglers;
    this.metrics.bondsAtEnd = this.bonds.length;
    return this.metrics;
  }

  /** Bit-exact fingerprint of every body transform, for determinism checks. */
  fingerprint(): string {
    const parts: number[] = [];
    for (const [id, person] of [...this.persons].sort((a, b) => a[0] - b[0])) {
      parts.push(id);
      for (const b of person.bodies()) {
        const t = this.p.getTransform(b);
        parts.push(t.x, t.y, t.angle);
      }
    }
    const ct = this.p.getTransform(this.cart);
    parts.push(ct.x, ct.y, ct.angle);
    return fnv1a(new Float64Array(parts));
  }
}

function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

function fnv1a(data: Float64Array): string {
  const bytes = new Uint8Array(data.buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + ':' + data.length;
}
