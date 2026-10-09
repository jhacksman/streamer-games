// Joint stress split by direction, smoothed, with snapping. Shared by Chat Tower (sticky
// bonds) and Bridge Breakers (truss beams).
//
// The bond axis runs from body A's center of mass to body B's. getJointForce is the force
// the joint applies to body B, so a component along the axis (pushing B away from A) means
// the bodies are being pressed together: compression. Against the axis (pulling B back
// toward A) means they are being pulled apart: tension.
import type { JointHandle, Physics } from './types.ts';

export type StressMode = 'compression' | 'tension' | 'shear' | 'twist';

export interface BondLimits {
  /** Newtons. Set very high to make stacking "super strong". */
  compression: number;
  tension: number;
  shear: number;
  /** Newton-meters. Used only by the 'independent' model. */
  twist: number;
  /**
   * 'independent': four separate limits (axial compression/tension, shear, twist torque).
   * 'masonry': the bond is a joint `width` meters wide. Bending (twist) becomes tension on one
   * edge and compression on the other, and the axial compression pressing the bond together
   * cancels edge tension. A bond only fails in tension once the load's line of action leaves
   * the middle of the bond, like a stone column. Straight stacks never fail; leans do.
   */
  model?: 'independent' | 'masonry';
  /** Bond width in meters for the 'masonry' model. */
  width?: number;
}

export interface StressReading {
  compression: number;
  tension: number;
  shear: number;
  twist: number;
  /** Worst load / limit across the four modes. 1.0 = at the breaking point. */
  ratio: number;
  governing: StressMode;
}

export function readStress(p: Physics, joint: JointHandle, limits: BondLimits, width?: number): StressReading {
  const [a, b] = p.jointBodies(joint);
  const ca = p.getWorldCenter(a);
  const cb = p.getWorldCenter(b);
  let ax = cb.x - ca.x;
  let ay = cb.y - ca.y;
  const len = Math.hypot(ax, ay);
  if (len > 1e-6) {
    ax /= len;
    ay /= len;
  } else {
    ax = 0;
    ay = 1;
  }
  const f = p.getJointForce(joint);
  const axial = f.x * ax + f.y * ay;
  const compression = Math.max(0, axial);
  const tension = Math.max(0, -axial);
  const shear = Math.abs(f.x * -ay + f.y * ax);
  const twist = Math.abs(p.getJointTorque(joint));
  let ratios: [StressMode, number][];
  if (limits.model === 'masonry') {
    // Two edges, width w apart. Axial load splits evenly; the moment adds +/- twist / w.
    const w = width ?? limits.width ?? 0.3;
    const bend = twist / w;
    const edgeTension = Math.max(0, bend - axial / 2);
    const edgeCompression = Math.max(0, axial / 2 + bend);
    // Report the tension as "twist" when bending, not a straight pull, is what causes it.
    const pullShare = Math.max(0, -axial / 2);
    ratios = [
      ['compression', edgeCompression / limits.compression],
      [bend > pullShare ? 'twist' : 'tension', edgeTension / limits.tension],
      ['shear', shear / limits.shear],
    ];
  } else {
    ratios = [
      ['compression', compression / limits.compression],
      ['tension', tension / limits.tension],
      ['shear', shear / limits.shear],
      ['twist', twist / limits.twist],
    ];
  }
  let governing: StressMode = 'compression';
  let ratio = 0;
  for (const [mode, r] of ratios) {
    if (r > ratio) {
      ratio = r;
      governing = mode;
    }
  }
  return { compression, tension, shear, twist, ratio, governing };
}

export interface StressTrackerOptions {
  limits: BondLimits;
  /** Exponential smoothing factor per step (0..1). Lower = smoother. */
  smoothing?: number;
  /** Seconds the smoothed ratio must stay above 1 before the joint snaps. */
  holdTime?: number;
}

interface Tracked {
  smoothed: number;
  over: number;
  last: StressReading | null;
  /** Masonry-model bond width override (meters). */
  width?: number;
}

export interface Snap {
  joint: JointHandle;
  reading: StressReading;
}

/** Tracks smoothed stress per joint and reports joints that should snap. */
export class StressTracker {
  private readonly tracked = new Map<JointHandle, Tracked>();
  readonly limits: BondLimits;
  private readonly smoothing: number;
  private readonly holdTime: number;

  constructor(o: StressTrackerOptions) {
    this.limits = o.limits;
    this.smoothing = o.smoothing ?? 0.25;
    this.holdTime = o.holdTime ?? 0.1;
  }

  add(joint: JointHandle, width?: number) {
    this.tracked.set(joint, { smoothed: 0, over: 0, last: null, width });
  }

  /** Change a bond's width (masonry model), e.g. when more contact points join it. */
  setWidth(joint: JointHandle, width: number) {
    const t = this.tracked.get(joint);
    if (t) t.width = width;
  }

  remove(joint: JointHandle) {
    this.tracked.delete(joint);
  }

  /** Smoothed stress ratio for rendering (green -> red). */
  ratio(joint: JointHandle): number {
    return this.tracked.get(joint)?.smoothed ?? 0;
  }

  reading(joint: JointHandle): StressReading | null {
    return this.tracked.get(joint)?.last ?? null;
  }

  joints(): JointHandle[] {
    return [...this.tracked.keys()];
  }

  /** Call after each physics step. Returns joints that crossed their limit long enough. */
  update(p: Physics, dt: number): Snap[] {
    const snaps: Snap[] = [];
    for (const [joint, t] of this.tracked) {
      if (!p.jointExists(joint)) {
        this.tracked.delete(joint);
        continue;
      }
      const r = readStress(p, joint, this.limits, t.width);
      t.last = r;
      t.smoothed += (r.ratio - t.smoothed) * this.smoothing;
      t.over = t.smoothed > 1 ? t.over + dt : 0;
      if (t.over >= this.holdTime) snaps.push({ joint, reading: r });
    }
    return snaps;
  }
}
