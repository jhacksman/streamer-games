// Engine-independent contact geometry. Shapes are treated as capsules: circles are zero-length
// capsules; boxes are capsules along their long axis with radius = half the short side. Good
// enough for anchoring welds and detecting "touching", and fully deterministic.
import type { Physics, ShapeHandle, Transform, Vec2 } from './types.ts';

export interface Capsule {
  a: Vec2;
  b: Vec2;
  r: number;
}

export function rotate(v: Vec2, a: number): Vec2 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y };
}

export function toWorld(t: Transform, v: Vec2): Vec2 {
  const r = rotate(v, t.angle);
  return { x: t.x + r.x, y: t.y + r.y };
}

/** World-space capsule for a shape, or null for shapes we don't approximate. */
export function shapeCapsule(p: Physics, shape: ShapeHandle): Capsule | null {
  const rec = p.shape(shape);
  if (!rec) return null;
  const t = p.getTransform(rec.body);
  const g = rec.geom;
  if (g.kind === 'circle') {
    const c = toWorld(t, g.center ?? { x: 0, y: 0 });
    return { a: c, b: c, r: g.radius };
  }
  if (g.kind === 'box') {
    return boxCapsule(t, g.center ?? { x: 0, y: 0 }, g.hx, g.hy, g.angle ?? 0);
  }
  // Polygon (e.g. the round body): a capsule fitted to its local bounding box.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of g.vertices) {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  return boxCapsule(t, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, (maxX - minX) / 2, (maxY - minY) / 2, 0);
}

function boxCapsule(t: Transform, c: Vec2, hx: number, hy: number, angle: number): Capsule {
  const long = hy >= hx;
  const half = Math.max(0, (long ? hy : hx) - (long ? hx : hy));
  const along = rotate(long ? { x: 0, y: half } : { x: half, y: 0 }, angle);
  return { a: toWorld(t, { x: c.x - along.x, y: c.y - along.y }), b: toWorld(t, { x: c.x + along.x, y: c.y + along.y }), r: long ? hx : hy };
}

/** Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9). */
export function segmentDistance(p1: Vec2, q1: Vec2, p2: Vec2, q2: Vec2): { dist: number; p: Vec2; q: Vec2 } {
  const d1 = { x: q1.x - p1.x, y: q1.y - p1.y };
  const d2 = { x: q2.x - p2.x, y: q2.y - p2.y };
  const r = { x: p1.x - p2.x, y: p1.y - p2.y };
  const a = d1.x * d1.x + d1.y * d1.y;
  const e = d2.x * d2.x + d2.y * d2.y;
  const f = d2.x * r.x + d2.y * r.y;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  let s = 0;
  let t = 0;
  if (a <= 1e-9 && e <= 1e-9) {
    s = t = 0;
  } else if (a <= 1e-9) {
    t = clamp(f / e);
  } else {
    const c = d1.x * r.x + d1.y * r.y;
    if (e <= 1e-9) {
      s = clamp(-c / a);
    } else {
      const b = d1.x * d2.x + d1.y * d2.y;
      const denom = a * e - b * b;
      s = denom > 1e-9 ? clamp((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a);
      }
    }
  }
  const p = { x: p1.x + d1.x * s, y: p1.y + d1.y * s };
  const q = { x: p2.x + d2.x * t, y: p2.y + d2.y * t };
  return { dist: Math.hypot(p.x - q.x, p.y - q.y), p, q };
}

/** Gap between two capsules (negative = overlapping) and the point midway between their surfaces. */
export function capsuleContact(a: Capsule, b: Capsule): { gap: number; point: Vec2 } {
  const d = segmentDistance(a.a, a.b, b.a, b.b);
  const gap = d.dist - a.r - b.r;
  // Walk from each axis point toward the other by its radius; the contact is midway between.
  const len = d.dist || 1;
  const n = { x: (d.q.x - d.p.x) / len, y: (d.q.y - d.p.y) / len };
  const sa = { x: d.p.x + n.x * a.r, y: d.p.y + n.y * a.r };
  const sb = { x: d.q.x - n.x * b.r, y: d.q.y - n.y * b.r };
  return { gap, point: { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 } };
}

/** Deterministic contact point for two touching shapes, from their geometry. */
export function contactPoint(p: Physics, shapeA: ShapeHandle, shapeB: ShapeHandle): Vec2 | null {
  const a = shapeCapsule(p, shapeA);
  const b = shapeCapsule(p, shapeB);
  if (!a || !b) return null;
  return capsuleContact(a, b).point;
}
