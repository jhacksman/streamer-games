// Phase 0 truss spike for Bridge Breakers: a Warren truss with verticals, ~157 beams pinned
// at shared nodes, road deck on the bottom chord, and a wheeled vehicle driving across.
// Pins snap when their constraint force exceeds the material limit.
import type { BodyHandle, JointHandle, Physics, Vec2 } from '../../../packages/engine/src/physics/types.ts';

export interface TrussConfig {
  panels: number;
  panelWidth: number;
  height: number;
  /** Vehicle chassis mass multiplier (1 = light car). */
  load: number;
  /** Pin force limit (N). */
  pinLimit: number;
  /** Anvil dropped on mid-span at t = 4 s (kg); 0 = none. */
  anvil?: number;
  seconds: number;
}

export interface TrussResult {
  backend: string;
  beams: number;
  pins: number;
  snaps: number;
  maxPinForce: number;
  vehicleCrossed: boolean;
  vehicleFell: boolean;
  vehicleX: number;
  nan: boolean;
  blowup: boolean;
  stepMsAvg: number;
  stepMsP95: number;
}

const CAT = { GROUND: 1, ROAD: 2, STRUCT: 4, VEHICLE: 8 };

export function runTruss(p: Physics, cfg: TrussConfig): TrussResult {
  const dt = 1 / 60;
  const L = cfg.panels * cfg.panelWidth;
  // Approach roads on both sides; the chasm floor is far below.
  for (const [x0, x1] of [[-20, 0], [L, L + 20]]) {
    // Approach road surface level with the deck top (deck beams are 0.12 thick each side of the chord).
    const g = p.createBody({ type: 'static', position: { x: (x0! + x1!) / 2, y: 0.12 - 0.5 } });
    p.addShape(g, { kind: 'box', hx: (x1! - x0!) / 2, hy: 0.5 }, { friction: 0.9, filter: { category: CAT.GROUND, mask: 0xffff } });
  }
  const floor = p.createBody({ type: 'static', position: { x: L / 2, y: -30 } });
  p.addShape(floor, { kind: 'box', hx: L, hy: 0.5 }, { filter: { category: CAT.GROUND, mask: 0xffff } });

  // Nodes: bottom chord at y=0, top chord at y=height (panel points 1..n-1).
  const bottom: Vec2[] = [];
  const top: (Vec2 | null)[] = [];
  for (let i = 0; i <= cfg.panels; i++) {
    bottom.push({ x: i * cfg.panelWidth, y: 0 });
    top.push(i > 0 && i < cfg.panels ? { x: i * cfg.panelWidth, y: cfg.height } : null);
  }
  const nodeKey = (v: Vec2) => `${v.x.toFixed(3)},${v.y.toFixed(3)}`;
  const atNode = new Map<string, BodyHandle[]>();
  const beams: BodyHandle[] = [];
  const addBeam = (a: Vec2, b: Vec2, road: boolean) => {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const body = p.createBody({ type: 'dynamic', position: mid, angle });
    p.addShape(body, { kind: 'box', hx: len / 2, hy: road ? 0.12 : 0.07 }, {
      density: road ? 400 : 300, friction: 0.9,
      filter: { category: road ? CAT.ROAD : CAT.STRUCT, mask: road ? CAT.VEHICLE | CAT.GROUND : CAT.GROUND, group: -7 },
    });
    beams.push(body);
    for (const n of [a, b]) {
      const k = nodeKey(n);
      if (!atNode.has(k)) atNode.set(k, []);
      atNode.get(k)!.push(body);
    }
  };
  for (let i = 0; i < cfg.panels; i++) addBeam(bottom[i]!, bottom[i + 1]!, true); // road deck
  for (let i = 1; i < cfg.panels - 1; i++) addBeam(top[i]!, top[i + 1]!, false); // top chord
  for (let i = 1; i < cfg.panels; i++) addBeam(bottom[i]!, top[i]!, false); // verticals
  for (let i = 0; i < cfg.panels; i++) {
    // diagonals slope toward mid-span (Pratt-like), ends go to the first/last top node
    const mid = i < cfg.panels / 2;
    const a = mid ? (i === 0 ? bottom[0]! : bottom[i]!) : top[i] ?? bottom[i]!;
    const b = mid ? top[i + 1] ?? bottom[i + 1]! : i + 1 === cfg.panels ? bottom[cfg.panels]! : bottom[i + 1]!;
    if (a.y !== b.y) addBeam(a, b, false);
  }

  // Pins: every beam at a node pinned to the first beam there; end nodes pinned to the ground.
  const pins: JointHandle[] = [];
  const anchors = new Map<string, BodyHandle>();
  for (const [x, i] of [[0, 0], [L, 1]] as const) {
    const a = p.createBody({ type: 'static', position: { x, y: 0 } });
    p.addShape(a, { kind: 'circle', radius: 0.1 }, { filter: { category: CAT.GROUND, mask: 0 } });
    anchors.set(nodeKey(i === 0 ? bottom[0]! : bottom[cfg.panels]!), a);
  }
  for (const [k, list] of atNode) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    const first = list[0]!;
    for (const other of list.slice(1)) pins.push(p.createRevolute({ bodyA: first, bodyB: other, anchor: { x, y } }));
    const anchor = anchors.get(k);
    if (anchor !== undefined) pins.push(p.createRevolute({ bodyA: anchor, bodyB: first, anchor: { x, y } }));
  }

  // Vehicle: chassis + two motorized wheels on wheel joints.
  const chassis = p.createBody({ type: 'dynamic', position: { x: -8, y: 1.05 } });
  p.addShape(chassis, { kind: 'box', hx: 1.4, hy: 0.3 }, { density: 120 * cfg.load, filter: { category: CAT.VEHICLE, mask: CAT.ROAD | CAT.GROUND } });
  for (const wx of [-1, 1]) {
    const wheel = p.createBody({ type: 'dynamic', position: { x: -8 + wx, y: 0.53 } });
    p.addShape(wheel, { kind: 'circle', radius: 0.4 }, { density: 60, friction: 1, filter: { category: CAT.VEHICLE, mask: CAT.ROAD | CAT.GROUND } });
    p.createWheel({ bodyA: chassis, bodyB: wheel, anchor: { x: -8 + wx, y: 0.53 }, axis: { x: 0, y: 1 }, spring: { hertz: 4, damping: 0.7 }, motor: { speed: -18, maxTorque: 800 * cfg.load } });
  }

  let snaps = 0;
  let maxPinForce = 0;
  let nan = false;
  let blowup = false;
  const stepMs: number[] = [];
  const steps = Math.round(cfg.seconds / dt);
  // Let the bridge settle under its own weight before the vehicle arrives.
  for (let s = 0; s < steps; s++) {
    if (cfg.anvil && s === 240) {
      const anvil = p.createBody({ type: 'dynamic', position: { x: L / 2, y: 6 } });
      const side = 0.8;
      p.addShape(anvil, { kind: 'box', hx: side / 2, hy: side / 2 }, { density: cfg.anvil / (side * side), filter: { category: CAT.VEHICLE, mask: CAT.ROAD | CAT.GROUND } });
    }
    const t0 = performance.now();
    p.step(dt);
    stepMs.push(performance.now() - t0);
    for (let i = pins.length - 1; i >= 0; i--) {
      const j = pins[i]!;
      if (!p.jointExists(j)) {
        pins.splice(i, 1);
        continue;
      }
      const f = p.getJointForce(j);
      const mag = Math.hypot(f.x, f.y);
      if (s > 120) maxPinForce = Math.max(maxPinForce, mag); // ignore the initial settle
      if (s > 120 && mag > cfg.pinLimit) {
        p.destroyJoint(j);
        pins.splice(i, 1);
        snaps++;
      }
    }
    if (s % 10 === 0) {
      for (const b of [...beams, chassis]) {
        const v = p.getVelocity(b);
        const t = p.getTransform(b);
        if (!Number.isFinite(v.vx + v.vy + v.w + t.x + t.y + t.angle)) nan = true;
        if (Math.hypot(v.vx, v.vy) > 80 || Math.abs(v.w) > 150) blowup = true;
      }
    }
  }
  const ct = p.getTransform(chassis);
  const sorted = [...stepMs].sort((a, b) => a - b);
  return {
    backend: p.name, beams: beams.length, pins: pins.length + snaps, snaps, maxPinForce,
    vehicleCrossed: ct.x > L + 1 && ct.y > -1, vehicleFell: ct.y < -5, vehicleX: ct.x, nan, blowup,
    stepMsAvg: stepMs.reduce((a, b) => a + b, 0) / stepMs.length,
    stepMsP95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
  };
}
