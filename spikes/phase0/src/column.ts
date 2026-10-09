// Controlled tall-chain test: N people pre-stacked into a column, welded head-to-feet,
// standing on a static base. Isolates the engine question ("do long, heavy weld chains stay
// stable, and does compression read correctly?") from game tuning.
import type { JointHandle, Physics } from '../../../packages/engine/src/physics/types.ts';
import { readStress, type BondLimits, type StressReading } from '../../../packages/engine/src/physics/stress.ts';
import { Person, POSES, personMass, poseExtent } from '../../../packages/engine/src/person/person.ts';

export interface ColumnConfig {
  people: number;
  /** Horizontal offset added per person (m). 0 = perfectly straight. */
  offset: number;
  angularHertz: number;
  angularDamping?: number;
  seconds: number;
  limits: BondLimits;
  /** Snap bonds whose stress ratio stays over 1 for holdTime. */
  snapping: boolean;
}

export interface ColumnResult {
  backend: string;
  people: number;
  offset: number;
  angularHertz: number;
  standing: number;
  snaps: number;
  bottom: StressReading | null;
  expectedBottomCompression: number;
  topStartY: number;
  topEndY: number;
  topDriftX: number;
  maxSpeed: number;
  nan: boolean;
  stepMsAvg: number;
  stepMsP95: number;
}

const STAND = poseExtent(POSES.standing);
const STAND_HEIGHT = { headTop: STAND.top, footBottom: STAND.bottom };

export function runColumn(p: Physics, cfg: ColumnConfig): ColumnResult {
  const dt = 1 / 60;
  const ground = p.createBody({ type: 'static', position: { x: 0, y: 0 } });
  p.addShape(ground, { kind: 'box', hx: 50, hy: 1, center: { x: 0, y: -1 } }, { filter: { category: 1, mask: 0xffff } });
  const personH = STAND_HEIGHT.headTop - STAND_HEIGHT.footBottom;
  const people: Person[] = [];
  const joints: JointHandle[] = [];
  for (let i = 0; i < cfg.people; i++) {
    const chestY = -STAND_HEIGHT.footBottom + i * personH;
    const person = new Person(p, {
      id: i + 1, position: { x: i * cfg.offset, y: chestY }, pose: POSES.standing,
      filter: { category: 2, mask: 0xffff }, contactEvents: false,
    });
    const body = person.freeze();
    const anchor = { x: i * cfg.offset, y: chestY + STAND_HEIGHT.footBottom };
    const below = i === 0 ? ground : people[i - 1]!.body!;
    joints.push(p.createWeld({ bodyA: below, bodyB: body, anchor, angularHertz: cfg.angularHertz, angularDamping: cfg.angularDamping ?? 0.7 }));
    people.push(person);
  }
  const top = people[people.length - 1]!;
  const topStart = top.topPoint();
  const over = new Map<JointHandle, number>();
  let snaps = 0;
  let maxSpeed = 0;
  let nan = false;
  const stepMs: number[] = [];
  const steps = Math.round(cfg.seconds / dt);
  for (let s = 0; s < steps; s++) {
    const t0 = performance.now();
    p.step(dt);
    stepMs.push(performance.now() - t0);
    if (cfg.snapping) {
      for (const j of joints) {
        if (!p.jointExists(j)) continue;
        const r = readStress(p, j, cfg.limits);
        const o = r.ratio > 1 ? (over.get(j) ?? 0) + dt : 0;
        over.set(j, o);
        if (o >= 0.1) {
          p.destroyJoint(j);
          snaps++;
        }
      }
    }
    if (s % 10 === 0) {
      for (const person of people) {
        const v = p.getVelocity(person.body!);
        const tr = p.getTransform(person.body!);
        if (!Number.isFinite(v.vx + v.vy + v.w + tr.x + tr.y + tr.angle)) nan = true;
        maxSpeed = Math.max(maxSpeed, Math.hypot(v.vx, v.vy));
      }
    }
  }
  const bottomJoint = joints[0]!;
  const bottom = p.jointExists(bottomJoint) ? readStress(p, bottomJoint, cfg.limits) : null;
  // A person counts as standing if still at roughly its stacked height.
  let standing = 0;
  people.forEach((person, i) => {
    const y = p.getTransform(person.body!).y;
    const expect = -STAND_HEIGHT.footBottom + i * personH;
    if (Math.abs(y - expect) < 1.0) standing++;
  });
  const topEnd = top.topPoint();
  const sorted = [...stepMs].sort((a, b) => a - b);
  return {
    backend: p.name, people: cfg.people, offset: cfg.offset, angularHertz: cfg.angularHertz, standing, snaps, bottom,
    expectedBottomCompression: (cfg.people) * personMass() * 10,
    topStartY: topStart.y, topEndY: topEnd.y, topDriftX: topEnd.x - topStart.x, maxSpeed, nan,
    stepMsAvg: stepMs.reduce((a, b) => a + b, 0) / stepMs.length,
    stepMsP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
  };
}
