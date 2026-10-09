// Phase 0 Chat Tower simulation, backend-agnostic. Used headless (run.ts, tests) and by
// the browser viewer. Mirrors PLAN.md §10: drop -> freeze + weld on first contact ->
// sticky bonds when landed limbs touch -> direction-split stress -> snaps -> debris -> collapse.
import type { BodyHandle, JointHandle, Physics, Vec2 } from '../../../packages/engine/src/physics/types.ts';
import { StressTracker, type BondLimits, type StressMode } from '../../../packages/engine/src/physics/stress.ts';
import { rotate, segmentDistance, toWorld } from '../../../packages/engine/src/physics/geometry.ts';
import { Person, POSES, poseExtent, type PartTag, type Pose } from '../../../packages/engine/src/person/person.ts';
import { mulberry32 } from './rng.ts';

export const CAT = { GROUND: 0x1, TOWER: 0x2, FALLING: 0x4, DEBRIS: 0x8, CART: 0x10, STREAMER: 0x20 } as const;
// The tower is one welded structure: its frozen members (and the streamer) don't collide with
// each other. Overlapping frozen limbs otherwise fight their welds and snap bonds with huge
// forces (Phase 0 finding). Touching members bond by proximity instead (processSticky).
export const FILTERS = {
  tower: { category: CAT.TOWER, mask: CAT.GROUND | CAT.FALLING | CAT.DEBRIS },
  streamer: { category: CAT.STREAMER, mask: CAT.FALLING | CAT.DEBRIS },
  falling: { category: CAT.FALLING, mask: CAT.GROUND | CAT.TOWER | CAT.DEBRIS | CAT.STREAMER },
  debris: { category: CAT.DEBRIS, mask: CAT.GROUND | CAT.TOWER | CAT.DEBRIS | CAT.FALLING | CAT.STREAMER },
};

export const DEFAULT_LIMITS: BondLimits = {
  compression: 1e9, // "super duper strong": stacking straight up never breaks
  tension: 6000,
  shear: 9000,
  twist: 2600,
};

export interface TowerConfig {
  seed: number;
  drops: number;
  dt?: number;
  dropInterval?: number;
  dropHeight?: number;
  spread?: number;
  placement?: 'random' | 'straight' | 'lean';
  leanStep?: number;
  base?: 'fixed' | 'balanced';
  sticky?: boolean;
  maxBondsPerPerson?: number;
  bondSpeed?: number;
  limits?: BondLimits;
  weld?: { angularHertz: number; angularDamping: number };
  collapseAngle?: number;
  collapseHold?: number;
  settleAfter?: number;
  debrisLifetime?: number;
  /** Bonds to the streamer never snap: the streamer is the foundation; balance is the failure mode. */
  strongBase?: boolean;
  /** Bot air control: falling people drift toward the tower's summit (exercises Q/R, U/P). */
  aim?: boolean;
  /** Force every random drop to this limb mask (e.g. 31 = all out, a spiky scaffold piece). */
  limbs?: number;
  /** Seconds before a pair whose bond snapped may bond again (stops snap/re-stick churn). */
  rebondCooldown?: number;
  /** How close (m) a sticky orb must come to another person to grab on. */
  stickyRadius?: number;
}

type Role = 'streamer' | 'falling' | 'tower' | 'debris';

export interface Bond {
  joint: JointHandle;
  a: number;
  b: number;
  kind: 'landing' | 'sticky';
  /** Person-pair key: one bond (one weld) per pair of people. */
  key: string;
  /** Contact points in body A's local frame; their spread sets the bond's width. */
  points: Vec2[];
  width: number;
}

/** Narrowest a bond can be (a single hand or foot), meters. */
const MIN_BOND_WIDTH = 0.25;
/** A bond keeps at most this many distinct contact points, at least this far apart. */
const MAX_BOND_POINTS = 4;
const BOND_POINT_SPACING = 0.15;
/** Widest a bond can count as (meters). */
const MAX_BOND_WIDTH = 0.9;

export interface TowerMetrics {
  backend: string;
  steps: number;
  dropped: number;
  landed: number;
  missed: number;
  stickyBonds: number;
  snaps: { mode: StressMode; ratio: number }[];
  detached: number;
  collapsed: boolean;
  collapseTime: number | null;
  maxHeight: number;
  finalHeight: number;
  towerPeople: number;
  nan: boolean;
  blowup: boolean;
  stepMs: number[];
  frameMs: number[];
  peopleAtTiming: number[];
  maxBodies: number;
  maxJoints: number;
  bondsAtEnd: number;
}

interface Landing { person: Person; touches: { onto: number; part: string; ontoPart: string; point: Vec2 | null }[] }

const STREAMER_ID = 0;
const now = () => performance.now();

export class TowerSim {
  readonly p: Physics;
  readonly cfg: Required<TowerConfig>;
  readonly rng: () => number;
  readonly persons = new Map<number, Person>();
  readonly roles = new Map<number, Role>();
  readonly bonds: Bond[] = [];
  readonly stress: StressTracker;
  readonly streamer: Person;
  readonly cart: BodyHandle;
  readonly ground: BodyHandle;
  readonly cartJoint: JointHandle;
  readonly ankle: JointHandle;
  readonly metrics: TowerMetrics;
  /** Fixed-base mode: the weld holding the streamer to the ground. */
  groundWeld: JointHandle | null = null;

  time = 0;
  private nextDrop = 0.5;
  private nextId = 1;
  private tiltTime = 0;
  private bondCount = new Map<number, number>();
  private debrisSince = new Map<number, number>();
  private lastDropX = 0;
  /** Pair key -> sim time when that pair may bond again after a snap. */
  private cooldownUntil = new Map<string, number>();
  /** Tuning diagnostics: sticky-bond candidates and why they were rejected, plus every snap. */
  readonly debug = { touchAdds: 0, rejectBonded: 0, rejectCap: 0, rejectSpeed: 0, snapLog: [] as unknown[] };

  constructor(p: Physics, cfg: TowerConfig) {
    this.p = p;
    this.cfg = {
      dt: 1 / 60, dropInterval: 1.4, dropHeight: 2.0, spread: 0.45, placement: 'random', leanStep: 0.18,
      base: 'fixed', sticky: true, maxBondsPerPerson: 4, bondSpeed: 0.8, limits: DEFAULT_LIMITS,
      weld: { angularHertz: 12, angularDamping: 0.7 }, collapseAngle: (55 * Math.PI) / 180, collapseHold: 0.4,
      settleAfter: 4, debrisLifetime: 5, strongBase: true, aim: false, limbs: -1, rebondCooldown: 2, stickyRadius: 0.04,
      ...cfg,
    };
    this.rng = mulberry32(this.cfg.seed);
    this.stress = new StressTracker({ limits: this.cfg.limits, smoothing: 0.25, holdTime: 0.1 });
    this.metrics = {
      backend: p.name, steps: 0, dropped: 0, landed: 0, missed: 0, stickyBonds: 0, snaps: [], detached: 0,
      collapsed: false, collapseTime: null, maxHeight: 0, finalHeight: 0, towerPeople: 0, nan: false, blowup: false,
      stepMs: [], frameMs: [], peopleAtTiming: [], maxBodies: 0, maxJoints: 0, bondsAtEnd: 0,
    };

    this.ground = p.createBody({ type: 'static', position: { x: 0, y: 0 }, tag: { ground: true } });
    p.addShape(this.ground, { kind: 'box', hx: 60, hy: 1, center: { x: 0, y: -1 } }, { friction: 0.9, filter: { category: CAT.GROUND, mask: 0xffff }, tag: { ground: true } });

    // The streamer: posed arms-up person frozen into one body, standing on a sliding cart.
    const fixed = this.cfg.base === 'fixed';
    this.cart = p.createBody({ type: 'dynamic', position: { x: 0, y: 0.05 } });
    p.addShape(this.cart, { kind: 'box', hx: 0.3, hy: 0.05 }, { density: 2000, filter: { category: CAT.CART, mask: 0 } });
    this.cartJoint = p.createPrismatic({
      bodyA: this.ground, bodyB: this.cart, anchor: { x: 0, y: 0.05 }, axis: { x: 1, y: 0 },
      limits: { lower: -20, upper: 20 }, motor: { speed: 0, maxForce: fixed ? 0 : 60000 },
    });
    // The streamer is a goo person frozen in a T-pose, feet just above the cart.
    const stance = poseExtent(POSES.tPose);
    this.streamer = new Person(p, { id: STREAMER_ID, position: { x: 0, y: 0.05 - stance.bottom }, pose: POSES.tPose, filter: FILTERS.streamer, contactEvents: true });
    this.streamer.freeze();
    this.persons.set(STREAMER_ID, this.streamer);
    this.roles.set(STREAMER_ID, 'streamer');
    if (fixed) {
      // Fixed base: weld the streamer to the ground. (Pinning with huge motors injects energy
      // into Planck's solver, which made the comparison unfair.) The ankle is a stiff motorless
      // revolute so tilt still reads, but it carries nothing.
      this.groundWeld = p.createWeld({ bodyA: this.ground, bodyB: this.streamer.body!, anchor: { x: 0, y: 0.05 } });
    }
    this.ankle = p.createRevolute({
      bodyA: this.cart, bodyB: this.streamer.body!, anchor: { x: 0, y: 0.05 },
      limits: { lower: -1.35, upper: 1.35 }, motor: { speed: 0, maxTorque: fixed ? 0 : 9000 },
    });
  }

  // ---- queries used by the viewer and metrics ----

  towerBodyOf(id: number): BodyHandle | null {
    return this.persons.get(id)?.body ?? null;
  }

  height(): number {
    let top = this.streamer.state === 'frozen' ? this.streamer.top() : 0;
    for (const [id, role] of this.roles) if (role === 'tower') top = Math.max(top, this.persons.get(id)!.top());
    return Math.max(0, top);
  }

  /** x of the tower's summit (its highest point), where drops aim. */
  private topX(): number {
    let best = -Infinity;
    let x = this.p.getTransform(this.cart).x;
    for (const [id, role] of this.roles) {
      if (role !== 'tower' && role !== 'streamer') continue;
      const person = this.persons.get(id)!;
      if (person.state !== 'frozen') continue;
      const t = person.topPoint();
      if (t.y > best) {
        best = t.y;
        x = t.x;
      }
    }
    return x;
  }

  tilt(): number {
    return this.p.jointExists(this.ankle) ? this.p.jointAngle(this.ankle) : 0;
  }

  // ---- simulation ----

  private spawnDrop() {
    const top = this.height();
    let x: number;
    let angle = 0;
    let limbs = 0;
    let pose: Pose | undefined;
    if (this.cfg.placement === 'random') {
      x = this.topX() + (this.rng() * 2 - 1) * this.cfg.spread;
      angle = (this.rng() * 2 - 1) * 0.25;
      const rolled = Math.floor(this.rng() * 32);
      limbs = this.cfg.limbs >= 0 ? this.cfg.limbs : rolled;
    } else if (this.cfg.placement === 'straight') {
      // Directly onto the current top person: a vertical column.
      x = this.topX();
      pose = POSES.standing;
    } else {
      // Each person a step further out than the one below: a growing overhang.
      x = this.topX() + this.cfg.leanStep;
      pose = POSES.standing;
    }
    this.lastDropX = x;
    const id = this.nextId++;
    const extent = poseExtent(pose ?? {}, limbs);
    const person = new Person(this.p, {
      id, position: { x, y: top + this.cfg.dropHeight - extent.bottom }, angle, limbs, pose,
      filter: FILTERS.falling, contactEvents: true,
    });
    this.persons.set(id, person);
    this.roles.set(id, 'falling');
    this.metrics.dropped++;
  }

  private roleOfShape(shape: number): { role: Role | 'ground'; tag: PartTag | null } | null {
    const rec = this.p.shape(shape);
    if (!rec) return null;
    const tag = rec.opts.tag as PartTag | { ground: true } | undefined;
    if (!tag) return null;
    if ('ground' in tag) return { role: 'ground', tag: null };
    const role = this.roles.get(tag.personId);
    return role ? { role, tag } : null;
  }

  private bodyVelocityAt(body: BodyHandle, at: Vec2) {
    const v = this.p.getVelocity(body);
    const c = this.p.getWorldCenter(body);
    return { x: v.vx - v.w * (at.y - c.y), y: v.vy + v.w * (at.x - c.x) };
  }

  private pairKey(a: number, b: number) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  /** Another touch between an already-bonded pair widens their bond instead of adding a weld. */
  private widenBond(bond: Bond, at: Vec2) {
    const ba = this.towerBodyOf(bond.a);
    if (ba === null) return;
    const t = this.p.getTransform(ba);
    const local = rotate({ x: at.x - t.x, y: at.y - t.y }, -t.angle);
    if (bond.points.length >= MAX_BOND_POINTS) return;
    if (bond.points.some((q) => Math.hypot(q.x - local.x, q.y - local.y) < BOND_POINT_SPACING)) return;
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

  private addBond(a: number, b: number, anchor: Vec2, kind: Bond['kind']) {
    const key = this.pairKey(a, b);
    const existing = this.bonds.find((x) => x.key === key);
    if (existing) {
      this.widenBond(existing, anchor);
      return;
    }
    const ba = this.towerBodyOf(a);
    const bb = this.towerBodyOf(b);
    if (ba === null || bb === null) return;
    // Bonded pairs don't collide: a weld locked onto an overlap would fight the contact solver.
    // Touching limbs are found geometrically instead (processSticky).
    const joint = this.p.createWeld({
      bodyA: ba, bodyB: bb, anchor, angularHertz: this.cfg.weld.angularHertz, angularDamping: this.cfg.weld.angularDamping,
    });
    const t = this.p.getTransform(ba);
    const local = rotate({ x: anchor.x - t.x, y: anchor.y - t.y }, -t.angle);
    this.bonds.push({ joint, a, b, kind, key, points: [local], width: MIN_BOND_WIDTH });
    if (!(this.cfg.strongBase && (a === STREAMER_ID || b === STREAMER_ID))) this.stress.add(joint, MIN_BOND_WIDTH);
    this.bondCount.set(a, (this.bondCount.get(a) ?? 0) + 1);
    this.bondCount.set(b, (this.bondCount.get(b) ?? 0) + 1);
  }

  private toDebris(id: number) {
    const person = this.persons.get(id);
    if (!person) return;
    if (person.state === 'frozen') person.unfreeze(true);
    else person.setLimp(true);
    person.setFilter(FILTERS.debris);
    this.roles.set(id, 'debris');
    this.debrisSince.set(id, this.time);
  }

  private processContacts() {
    const landings = new Map<number, Landing>();
    const misses = new Set<number>();

    for (const c of this.p.contactBegins()) {
      const A = this.roleOfShape(c.shapeA);
      const B = this.roleOfShape(c.shapeB);
      if (!A || !B) continue;
      for (const [x, y] of [[A, B], [B, A]] as const) {
        if (x.role !== 'falling' || !x.tag) continue;
        const id = x.tag.personId;
        if (misses.has(id)) continue;
        if ((y.role === 'tower' || y.role === 'streamer') && y.tag) {
          let l = landings.get(id);
          if (!l) landings.set(id, (l = { person: this.persons.get(id)!, touches: [] }));
          l.touches.push({ onto: y.tag.personId, part: x.tag.part, ontoPart: y.tag.part, point: c.point });
        } else if ((y.role === 'ground' || y.role === 'debris') && !landings.has(id)) {
          misses.add(id);
        }
      }
    }

    for (const id of misses) {
      if (landings.has(id)) continue;
      this.toDebris(id);
      this.metrics.missed++;
    }

    for (const l of landings.values()) {
      const person = l.person;
      person.freeze();
      person.setFilter(FILTERS.tower);
      this.roles.set(person.id, 'tower');
      let bonded = 0;
      for (const t of l.touches) {
        const onto = this.towerBodyOf(t.onto);
        if (onto === null) continue;
        const isNewPair = !this.bonds.some((b) => b.key === this.pairKey(t.onto, person.id));
        if (bonded > 0 && isNewPair && (this.bondCount.get(person.id) ?? 0) >= this.cfg.maxBondsPerPerson) continue;
        const anchor = t.point ?? midpoint(this.p.getWorldCenter(onto), this.p.getWorldCenter(person.body!));
        this.addBond(t.onto, person.id, anchor, bonded === 0 ? 'landing' : 'sticky');
        if (bonded > 0 && isNewPair) this.metrics.stickyBonds++;
        bonded++;
      }
      if (bonded === 0) {
        this.toDebris(person.id);
        continue;
      }
      this.metrics.landed++;
    }

  }

  /** World-space capsules for a landed person's shapes: orbs are circles, the body a capsule. */
  private capsules(person: Person): { part: string; orb: boolean; a: Vec2; b: Vec2; r: number }[] {
    const out: { part: string; orb: boolean; a: Vec2; b: Vec2; r: number }[] = [];
    for (const sh of person.shapes()) {
      const rec = this.p.shape(sh);
      if (!rec) continue;
      const tag = rec.opts.tag as PartTag;
      const t = this.p.getTransform(rec.body);
      const g = rec.geom;
      if (g.kind === 'circle') {
        const c = toWorld(t, g.center ?? { x: 0, y: 0 });
        out.push({ part: tag.part, orb: tag.kind === 'orb', a: c, b: c, r: g.radius });
      } else if (g.kind === 'box') {
        const c = g.center ?? { x: 0, y: 0 };
        const long = g.hy >= g.hx;
        const half = Math.max(0, (long ? g.hy : g.hx) - (long ? g.hx : g.hy));
        const along = rotate(long ? { x: 0, y: half } : { x: half, y: 0 }, g.angle ?? 0);
        out.push({ part: tag.part, orb: false, a: toWorld(t, { x: c.x - along.x, y: c.y - along.y }), b: toWorld(t, { x: c.x + along.x, y: c.y + along.y }), r: long ? g.hx : g.hy });
      }
    }
    return out;
  }

  /** Bond landed people where a sticky orb (head, hand, foot) touches the other person, once nearly at rest. */
  private processSticky() {
    if (!this.cfg.sticky) return;
    const landed: Person[] = [];
    for (const [id, role] of this.roles) {
      if (role === 'tower' || role === 'streamer') {
        const person = this.persons.get(id)!;
        if (person.state === 'frozen' && person.body !== null) landed.push(person);
      }
    }
    const centers = landed.map((q) => this.p.getWorldCenter(q.body!));
    const caps = new Map<number, ReturnType<TowerSim['capsules']>>();
    const capsOf = (q: Person) => {
      let c = caps.get(q.id);
      if (!c) caps.set(q.id, (c = this.capsules(q)));
      return c;
    };
    const GAP = this.cfg.stickyRadius;
    for (let i = 0; i < landed.length; i++) {
      for (let j = i + 1; j < landed.length; j++) {
        const A = landed[i]!;
        const B = landed[j]!;
        if (Math.hypot(centers[i]!.x - centers[j]!.x, centers[i]!.y - centers[j]!.y) > 2.6) continue;
        const existing = this.bonds.find((x) => x.key === this.pairKey(A.id, B.id));
        if (!existing && (this.cooldownUntil.get(this.pairKey(A.id, B.id)) ?? 0) > this.time) continue;
        if (!existing) {
          const capA = A.id === STREAMER_ID ? Infinity : this.cfg.maxBondsPerPerson;
          const capB = B.id === STREAMER_ID ? Infinity : this.cfg.maxBondsPerPerson;
          if ((this.bondCount.get(A.id) ?? 0) >= capA || (this.bondCount.get(B.id) ?? 0) >= capB) {
            this.debug.rejectCap++;
            continue;
          }
        }
        for (const ca of capsOf(A)) {
          for (const cb of capsOf(B)) {
            if (!ca.orb && !cb.orb) continue; // only the orbs are sticky
            const d = segmentDistance(ca.a, ca.b, cb.a, cb.b);
            if (d.dist - ca.r - cb.r > GAP) continue;
            this.debug.touchAdds++;
            const at = midpoint(d.p, d.q);
            if (!existing) {
              const va = this.bodyVelocityAt(A.body!, at);
              const vb = this.bodyVelocityAt(B.body!, at);
              if (Math.hypot(va.x - vb.x, va.y - vb.y) > this.cfg.bondSpeed) {
                this.debug.rejectSpeed++;
                continue;
              }
              this.metrics.stickyBonds++;
            } else {
              this.debug.rejectBonded++;
            }
            this.addBond(A.id, B.id, at, 'sticky');
          }
        }
      }
    }
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
      this.debug.snapLog.push({ t: +this.time.toFixed(2), bond: `${bond.kind} ${bond.a}->${bond.b}`, people: [...this.roles.values()].filter((r) => r === 'tower').length,
        axial: Math.round(s.reading.compression - s.reading.tension), twist: Math.round(s.reading.twist), shear: Math.round(s.reading.shear), width: +bond.width.toFixed(2), ratio: +s.reading.ratio.toFixed(2), mode: s.reading.governing });
    }
    // Anyone no longer connected to the streamer falls as debris.
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
      if (role === 'tower' || role === 'falling') this.toDebris(id);
    }
    this.streamer.unfreeze(true);
    this.streamer.setFilter(FILTERS.debris);
    this.roles.set(STREAMER_ID, 'debris');
  }

  private control() {
    const p = this.p;
    if (!p.jointExists(this.ankle)) return;
    const angle = p.jointAngle(this.ankle);
    if (this.cfg.base === 'fixed') return;
    // Stand-in for the human streamer: slide the cart under the tower's center of mass.
    let m = 0, mx = 0, mvx = 0;
    for (const [id, role] of this.roles) {
      if (role !== 'tower' && role !== 'streamer') continue;
      const body = this.persons.get(id)!.body;
      if (body === null) continue;
      const bm = p.getMass(body);
      m += bm;
      mx += bm * p.getWorldCenter(body).x;
      mvx += bm * p.getVelocity(body).vx;
    }
    const comX = mx / m;
    const comVx = mvx / m;
    const cartX = p.getTransform(this.cart).x;
    const v = Math.max(-5, Math.min(5, 2.5 * (comX - cartX) + 1.2 * comVx));
    p.setMotorSpeed(this.cartJoint, v);
    p.setMotorSpeed(this.ankle, -4 * angle);
  }

  private checkHealth() {
    let bodies = 0;
    for (const person of this.persons.values()) {
      for (const b of person.bodies()) {
        bodies++;
        const t = this.p.getTransform(b);
        const v = this.p.getVelocity(b);
        if (!Number.isFinite(t.x + t.y + t.angle + v.vx + v.vy + v.w)) this.metrics.nan = true;
        if (Math.hypot(v.vx, v.vy) > 80 || Math.abs(v.w) > 120) this.metrics.blowup = true;
      }
    }
    const c = this.p.counts();
    this.metrics.maxBodies = Math.max(this.metrics.maxBodies, c.bodies);
    this.metrics.maxJoints = Math.max(this.metrics.maxJoints, c.joints);
    return bodies;
  }

  /** One fixed step of the whole game loop. */
  step() {
    const frameStart = now();
    const dt = this.cfg.dt;
    if (!this.metrics.collapsed && this.metrics.dropped < this.cfg.drops && this.time >= this.nextDrop) {
      this.spawnDrop();
      this.nextDrop = this.time + this.cfg.dropInterval;
    }
    const aimX = this.cfg.aim ? this.topX() : 0;
    for (const [id, role] of this.roles) {
      if (role !== 'falling') continue;
      const person = this.persons.get(id)!;
      if (this.cfg.aim) {
        // Bot stand-in for a viewer steering with Q/R or U/P: drift toward the summit.
        const dx = aimX - person.bodyTransform().x;
        person.drive.drift = Math.abs(dx) > 0.15 ? Math.sign(dx) : 0;
      }
      person.update();
    }
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
    for (const [id, since] of this.debrisSince) {
      if (this.time - since > this.cfg.debrisLifetime && id !== STREAMER_ID) {
        this.persons.get(id)?.destroy();
        this.persons.delete(id);
        this.roles.delete(id);
        this.debrisSince.delete(id);
      }
    }

    this.time += dt;
    this.metrics.steps++;
    if (this.metrics.steps % 10 === 0) {
      this.checkHealth();
      if (!this.metrics.collapsed) this.metrics.maxHeight = Math.max(this.metrics.maxHeight, this.height());
    }
    const frameEnd = now();
    this.metrics.stepMs.push(t1 - t0);
    this.metrics.frameMs.push(frameEnd - frameStart);
    let people = 0;
    for (const r of this.roles.values()) if (r === 'tower') people++;
    this.metrics.peopleAtTiming.push(people);
  }

  done(): boolean {
    if (this.metrics.collapsed) return this.time - (this.metrics.collapseTime ?? 0) > 3;
    return this.metrics.dropped >= this.cfg.drops && this.time > this.nextDrop + this.cfg.settleAfter;
  }

  run(maxSeconds = 600): TowerMetrics {
    while (!this.done() && this.time < maxSeconds) this.step();
    this.checkHealth();
    this.metrics.finalHeight = this.metrics.collapsed ? 0 : this.height();
    if (!this.metrics.collapsed) this.metrics.maxHeight = Math.max(this.metrics.maxHeight, this.metrics.finalHeight);
    let people = 0;
    for (const r of this.roles.values()) if (r === 'tower') people++;
    this.metrics.towerPeople = people;
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

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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
