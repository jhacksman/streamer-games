// Drawing for a person: a stumpy little humanoid in the Mount Your Friends spirit (chunky
// torso, thick short limbs, shorts, outlined cartoon look) whose hands, feet and head are
// round sticky orbs, World of Goo style. Limbs stretch like taffy when a key is held.
import type { Physics } from '../../../packages/engine/src/physics/types.ts';
import { LIMBS, type LimbKey, type Person } from '../../../packages/engine/src/person/person.ts';

export interface View {
  toX(x: number): number;
  toY(y: number): number;
  scale: number;
}

export interface GooStyle {
  /** Shorts color (the player's identity color). */
  color: string;
  /** Skin tone. */
  skin?: string;
  /** 0..1 red stress tint. */
  stress?: number;
  /** Debris look: grey, X eyes. */
  limp?: boolean;
  /** Eyes look toward this world point. */
  lookAt?: { x: number; y: number };
  name?: string;
}

const SKINS = ['#f2c7a5', '#e0ac85', '#c68a62', '#a86b45', '#7d4b2e', '#f6d9c0'];
const OUTLINE = '#2a1d17';
const mix = (a: string, b: string, t: number) => `color-mix(in srgb, ${a}, ${b} ${Math.round(Math.max(0, Math.min(1, t)) * 100)}%)`;

export function skinFor(id: number): string {
  return SKINS[id % SKINS.length]!;
}

/** Thick limb from the torso to the orb; thins a little as it stretches. */
function limb(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, width: number, fill: string, lw: number) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = width + 2 * lw;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = width;
  ctx.stroke();
  // a soft highlight along the limb
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = width * 0.3;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * width * 0.18;
  const oy = (dx / len) * width * 0.18;
  ctx.beginPath();
  ctx.moveTo(ax + ox, ay + oy);
  ctx.lineTo(bx + ox, by + oy);
  ctx.stroke();
}

function orb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, lw: number) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, mix(fill, '#ffffff', 0.35));
  g.addColorStop(0.7, fill);
  g.addColorStop(1, mix(fill, '#000000', 0.25));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.2, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
}

export function drawGooPerson(ctx: CanvasRenderingContext2D, _p: Physics, person: Person, view: View, style: GooStyle) {
  const s = view.scale;
  const lw = Math.max(1, 0.018 * s);
  const skinBase = style.limp ? '#9ca3af' : style.skin ?? skinFor(person.id);
  const stress = style.stress && style.stress > 0.3 ? (style.stress - 0.3) / 0.7 : 0;
  const skin = stress > 0 ? mix(skinBase, '#ff3030', stress * 0.8) : skinBase;
  const shorts = style.limp ? '#6b7280' : style.color;
  const bt = person.bodyTransform();
  const P = (v: { x: number; y: number }) => ({ x: view.toX(v.x), y: view.toY(v.y) });

  const drawLimb = (name: LimbKey) => {
    const l = LIMBS.find((x) => x.name === name)!;
    const width = l.thickness; // drawn exactly as wide as the solid physics beam
    const a = P(person.limbRoot(name));
    const b = P(person.partPosition(l.orb));
    // stretched limbs get a bit thinner, like pulled taffy
    const stretch = Math.max(0, Math.min(1, person.stretch(name) / l.reach));
    limb(ctx, a.x, a.y, b.x, b.y, width * s * (1 - 0.1 * stretch), skin, lw);
    return { b, r: l.radius * s };
  };

  // legs behind the torso
  const feet = [drawLimb('legL'), drawLimb('legR')];
  for (const f of feet) orb(ctx, f.b.x, f.b.y, f.r, skin, lw);

  // torso: broad-shouldered, chunky, wearing shorts
  ctx.save();
  ctx.translate(view.toX(bt.x), view.toY(bt.y));
  ctx.rotate(-bt.angle);
  const sh = 0.25 * s; // half shoulder width
  const hp = 0.19 * s; // half hip width
  const top = -0.27 * s;
  const bot = 0.27 * s;
  ctx.beginPath();
  ctx.moveTo(-sh + 0.06 * s, top);
  ctx.quadraticCurveTo(0, top - 0.05 * s, sh - 0.06 * s, top);
  ctx.quadraticCurveTo(sh + 0.02 * s, top + 0.02 * s, sh - 0.01 * s, top + 0.14 * s);
  ctx.quadraticCurveTo(hp + 0.04 * s, 0.05 * s, hp, bot - 0.06 * s);
  ctx.quadraticCurveTo(hp, bot, hp - 0.07 * s, bot);
  ctx.lineTo(-hp + 0.07 * s, bot);
  ctx.quadraticCurveTo(-hp, bot, -hp, bot - 0.06 * s);
  ctx.quadraticCurveTo(-hp - 0.04 * s, 0.05 * s, -sh + 0.01 * s, top + 0.14 * s);
  ctx.quadraticCurveTo(-sh - 0.02 * s, top + 0.02 * s, -sh + 0.06 * s, top);
  ctx.closePath();
  const tg = ctx.createLinearGradient(-sh, 0, sh, 0);
  tg.addColorStop(0, mix(skin, '#000000', 0.12));
  tg.addColorStop(0.45, mix(skin, '#ffffff', 0.12));
  tg.addColorStop(1, mix(skin, '#000000', 0.18));
  ctx.fillStyle = tg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // shorts
  ctx.fillStyle = shorts;
  ctx.fillRect(-sh, 0.1 * s, 2 * sh, bot);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-sh, 0.1 * s, 2 * sh, 0.025 * s);
  ctx.restore();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // pecs and belly button, for that Mount Your Friends beefiness
  ctx.strokeStyle = mix(skin, OUTLINE, 0.45);
  ctx.lineWidth = lw * 0.8;
  ctx.beginPath();
  ctx.arc(-0.08 * s, -0.14 * s, 0.08 * s, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.moveTo(0.16 * s, -0.12 * s);
  ctx.arc(0.08 * s, -0.14 * s, 0.08 * s, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0.04 * s, 0.012 * s, 0, Math.PI * 2);
  ctx.fillStyle = mix(skin, OUTLINE, 0.5);
  ctx.fill();
  ctx.restore();

  // arms in front of the torso
  const hands = [drawLimb('armL'), drawLimb('armR')];
  for (const h of hands) orb(ctx, h.b.x, h.b.y, h.r, skin, lw);

  // neck + head
  const neckRoot = P(person.limbRoot('neck'));
  const hc = person.partPosition('head');
  const head = P(hc);
  const neckSpec = LIMBS.find((l) => l.name === 'neck')!;
  const neckStretch = Math.max(0, Math.min(1, person.stretch('neck') / neckSpec.reach));
  limb(ctx, neckRoot.x, neckRoot.y, head.x, head.y, neckSpec.thickness * s * (1 - 0.1 * neckStretch), skin, lw);
  const r = LIMBS.find((l) => l.orb === 'head')!.radius * s;
  orb(ctx, head.x, head.y, r, skin, lw);

  // face
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(-bt.angle);
  let look = { x: 0, y: 0 };
  if (style.lookAt) {
    const dx = style.lookAt.x - hc.x;
    const dy = style.lookAt.y - hc.y;
    const d = Math.hypot(dx, dy) || 1;
    const c = Math.cos(-bt.angle);
    const sn = Math.sin(-bt.angle);
    look = { x: ((dx * c - dy * sn) / d) * r * 0.07, y: (-(dx * sn + dy * c) / d) * r * 0.07 };
  }
  for (const side of [-1, 1]) {
    const ex = side * r * 0.34;
    const ey = -r * 0.1;
    if (style.limp) {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = r * 0.09;
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.11, ey - r * 0.11);
      ctx.lineTo(ex + r * 0.11, ey + r * 0.11);
      ctx.moveTo(ex + r * 0.11, ey - r * 0.11);
      ctx.lineTo(ex - r * 0.11, ey + r * 0.11);
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * 0.2, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = lw * 0.7;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex + look.x, ey + look.y + r * 0.04, r * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = '#1b130f';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + look.x - r * 0.04, ey + look.y - r * 0.01, r * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    // eyebrow
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.moveTo(ex - r * 0.17, ey - r * 0.36 + side * r * 0.02);
    ctx.lineTo(ex + r * 0.17, ey - r * 0.36 - side * r * 0.02);
    ctx.stroke();
  }
  if (!style.limp) {
    ctx.fillStyle = 'rgba(255,100,120,0.35)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.6, r * 0.25, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (style.limp) {
    ctx.moveTo(-r * 0.16, r * 0.42);
    ctx.lineTo(r * 0.16, r * 0.42);
  } else {
    ctx.arc(0, r * 0.2, r * 0.2, 0.18 * Math.PI, 0.82 * Math.PI);
  }
  ctx.stroke();
  ctx.restore();

  if (style.name) {
    ctx.font = `600 ${Math.max(11, 0.16 * s)}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(style.name, head.x, head.y - r - 0.08 * s);
  }
}

/** Distinct, saturated color per person id (golden-angle hues), used for their shorts. */
export function personColor(id: number): string {
  return `hsl(${(id * 137.508) % 360}, 72%, 52%)`;
}
