// Phase 0 viewer.
//   ?mode=live (default)  the tower with player bots; shows the current dropper's held keys
//   ?mode=story           a filmstrip of one drop: tucked -> press K -> pin -> rotate -> lock
//   ?mode=showcase        host (T-pose) next to half-size viewers in different key states
//   ?mode=determinism     fingerprints the same run on each backend
// Live-mode URL params mirror TowerConfig: backend, seed, drops, bot, hz, tension, base, limbs.
import { createPhysics, type BackendName, type Physics } from '../../../packages/engine/src/physics/index.ts';
import { DEFAULT_LIMITS, TowerSim, type Bot, type TowerConfig } from '../src/tower.ts';
import { storySim } from '../src/story.ts';
import { KEY_LABELS, LIMB_BITS, Person, POSES } from '../../../packages/engine/src/person/person.ts';
import { drawGooPerson, personColor, type View } from './goo-draw.ts';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const backend = (q.get('backend') ?? 'box2d3-compat') as BackendName;
const hud = document.getElementById('hud')!;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const DPR = devicePixelRatio;
canvas.width = innerWidth * DPR;
canvas.height = innerHeight * DPR;

const mode = q.get('mode') ?? 'live';
if (mode === 'play') await play();
else if (mode === 'determinism') await determinism();
else if (mode === 'showcase') await showcase();
else if (mode === 'story') await story();
else await live();

function config(): TowerConfig {
  return {
    seed: num('seed', 1),
    drops: num('drops', 40),
    bot: (q.get('bot') ?? 'player') as Bot,
    base: (q.get('base') ?? 'fixed') as TowerConfig['base'],
    limbs: q.has('limbs') ? Number(q.get('limbs')) : -1,
    weld: { angularHertz: num('hz', 0), angularDamping: 0.7 },
    limits: { ...DEFAULT_LIMITS, tension: num('tension', DEFAULT_LIMITS.tension), shear: num('shear', DEFAULT_LIMITS.shear) },
  };
}

// ---------- drawing ----------

function stressColor(r: number): string {
  const t = Math.max(0, Math.min(1, r));
  return `hsl(${120 - 120 * t}, 85%, 50%)`;
}

/** Draw the whole tower scene with a given view. */
function drawScene(c: CanvasRenderingContext2D, sim: TowerSim, view: View, w: number, h: number, opts: { ruler?: boolean; names?: boolean } = {}) {
  const p = sim.p;
  c.fillStyle = '#0f1420';
  c.fillRect(0, 0, w, h);
  if (opts.ruler) {
    c.fillStyle = '#5b6680';
    c.font = `${11 * DPR}px ui-monospace, monospace`;
    const top = (view.toY(0) - 0) / view.scale;
    const stepM = top > 40 ? 10 : top > 16 ? 5 : 1;
    for (let m = 0; m <= top; m += stepM) {
      c.fillRect(0, view.toY(m), 14 * DPR, 1);
      c.fillText(`${m} m`, 18 * DPR, view.toY(m) + 4);
    }
  }
  c.fillStyle = '#26314a';
  c.fillRect(0, view.toY(0), w, h - view.toY(0));

  const personStress = new Map<number, number>();
  for (const b of sim.bonds) {
    const r = sim.stress.ratio(b.joint);
    personStress.set(b.a, Math.max(personStress.get(b.a) ?? 0, r));
    personStress.set(b.b, Math.max(personStress.get(b.b) ?? 0, r));
  }
  // Big host first, then viewers in drop order.
  for (const [id, person] of [...sim.persons].sort((a, b) => a[0] - b[0])) {
    const role = sim.roles.get(id);
    drawGooPerson(c, p, person, view, {
      color: role === 'streamer' ? '#f0a03c' : personColor(id),
      stress: role === 'tower' ? personStress.get(id) ?? 0 : 0,
      limp: role === 'debris',
      name: opts.names && role !== 'streamer' ? `#${id}` : undefined,
    });
  }
  // Bonds: a dot at every contact point, green -> red by stress.
  for (const b of sim.bonds) {
    const ba = sim.towerBodyOf(b.a);
    if (ba === null || !p.bodyExists(ba)) continue;
    const t = p.getTransform(ba);
    for (const pt of b.points) {
      const cs = Math.cos(t.angle), sn = Math.sin(t.angle);
      c.beginPath();
      c.arc(view.toX(t.x + cs * pt.x - sn * pt.y), view.toY(t.y + sn * pt.x + cs * pt.y), Math.max(3 * DPR, 0.04 * view.scale), 0, Math.PI * 2);
      c.fillStyle = stressColor(sim.stress.ratio(b.joint));
      c.fill();
    }
  }
  // One-point pins: a white ring (the hinge).
  for (const [id, role] of sim.roles) {
    if (role !== 'pivoting') continue;
    const pin = sim.pinPoint(id);
    if (!pin) continue;
    c.beginPath();
    c.arc(view.toX(pin.x), view.toY(pin.y), Math.max(5 * DPR, 0.06 * view.scale), 0, Math.PI * 2);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2.5 * DPR;
    c.stroke();
  }
}

/** The nine player keys, with held ones lit. */
function drawKeys(c: CanvasRenderingContext2D, held: string[], x: number, y: number, size: number) {
  const rows = [
    [KEY_LABELS.driftLeft, KEY_LABELS.rotateCCW, KEY_LABELS.rotateCW, KEY_LABELS.driftRight],
    [KEY_LABELS.limbs.armL, KEY_LABELS.limbs.legL, KEY_LABELS.limbs.legR, KEY_LABELS.limbs.armR],
    ['', KEY_LABELS.limbs.neck, '', ''],
  ];
  c.font = `700 ${size * 0.5}px ui-monospace, monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  rows.forEach((row, r) => row.forEach((k, i) => {
    if (!k) return;
    const kx = x + i * size * 1.15 + r * size * 0.3;
    const ky = y + r * size * 1.15;
    const on = held.includes(k);
    c.fillStyle = on ? '#ffd23f' : '#2a3247';
    c.strokeStyle = on ? '#fff3b0' : '#45506b';
    c.lineWidth = DPR;
    c.beginPath();
    c.roundRect(kx, ky, size, size, size * 0.18);
    c.fill();
    c.stroke();
    c.fillStyle = on ? '#1b1405' : '#8a94ad';
    c.fillText(k, kx + size / 2, ky + size / 2 + 1);
  }));
  c.textAlign = 'start';
  c.textBaseline = 'alphabetic';
}

// ---------- live ----------

async function live() {
  let p = await createPhysics(backend);
  let sim = new TowerSim(p, config());
  let paused = q.get('paused') === '1';
  let speed = num('speed', 1);
  let camH = 4;
  let camX = 0;

  addEventListener('keydown', async (e) => {
    if (e.key === ' ') paused = !paused;
    if (e.key === 'ArrowRight') speed = Math.min(8, speed * 2);
    if (e.key === 'ArrowLeft') speed = Math.max(0.25, speed / 2);
    if (e.key === 'r') {
      p.dispose();
      p = await createPhysics(backend);
      sim = new TowerSim(p, config());
    }
  });
  Object.assign(window, {
    __sim: () => sim,
    __runTo: (t: number) => {
      while (sim.time < t && !sim.done()) sim.step();
      paused = true;
      draw();
      const people = [...sim.roles.values()];
      return { t: +sim.time.toFixed(2), height: +sim.height().toFixed(2), locked: people.filter((r) => r === 'tower').length, pinned: people.filter((r) => r === 'pivoting').length, active: sim.activeId === null ? null : sim.dropperView(sim.activeId) };
    },
  });

  let acc = 0;
  let last = performance.now();
  const frame = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (!paused) acc += dt * speed;
    while (acc >= sim.cfg.dt) {
      if (!sim.done()) sim.step();
      acc -= sim.cfg.dt;
    }
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    const height = sim.height();
    camH += (Math.max(4, height + 2.5) - camH) * 0.05;
    camX += (p.getTransform(sim.cart).x - camX) * 0.05;
    const scale = H / camH;
    const view: View = { scale, toX: (x) => W / 2 + (x - camX) * scale, toY: (y) => H - 30 * DPR - y * scale };
    drawScene(ctx, sim, view, W, H, { ruler: true, names: true });
    const m = sim.metrics;
    const roles = [...sim.roles.values()];
    const active = sim.activeId === null ? null : sim.dropperView(sim.activeId);
    hud.textContent = [
      `${backend}  seed ${sim.cfg.seed}  bot ${sim.cfg.bot}  t ${sim.time.toFixed(1)} s  x${speed}${paused ? '  PAUSED' : ''}`,
      `height ${height.toFixed(2)} m   locked ${roles.filter((r) => r === 'tower').length}   pinned ${roles.filter((r) => r === 'pivoting').length}   missed ${m.missed}   snaps ${m.snaps.length}`,
      active ? `now dropping: #${active.id}  ${active.role === 'falling' ? 'falling' : active.role === 'pivoting' ? 'PINNED by 1 point (swing with I/O)' : active.role}` : 'between turns',
    ].join('\n');
    if (active) drawKeys(ctx, active.keys, W - 230 * DPR, 14 * DPR, 40 * DPR);
  }
}

// ---------- play: single player, one viewer after another ----------

async function play() {
  const keysDiv = document.getElementById('keys')!;
  keysDiv.innerHTML = [
    '<b>Claw</b>: U/P slide · I/O turn · <b>Space</b> drop',
    '<b>Falling</b>: J K L ; extend limbs · , neck · U/P drift · I/O spin',
    '<b>Pinned</b> (ring): I/O swing to a 2nd point → locked',
    'left hand: A S D F X · Q/R · W/E   ·   Esc restart' + (q.get('base') === 'balanced' ? '   ·   ←/→ balance' : ''),
  ].join('<br>');
  keysDiv.style.cssText = 'position:fixed;bottom:10px;left:10px;opacity:.85;line-height:1.6;font-size:14px;background:rgba(10,14,23,.75);padding:8px 12px;border-radius:8px';

  const make = async () => {
    const p = await createPhysics(backend);
    const sim = new TowerSim(p, {
      seed: num('seed', Math.floor(Math.random() * 1e6)), drops: 1e9, bot: 'player', crane: true,
      base: (q.get('base') ?? 'fixed') as TowerConfig['base'], turnTimeout: num('turn', 12),
      weld: { angularHertz: num('hz', 0), angularDamping: 0.7 },
    });
    return { p, sim };
  };
  let { p, sim } = await make();
  const held = new Set<string>();
  const any = (...codes: string[]) => codes.some((c) => held.has(c));
  const GAME_KEYS = new Set(['KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Comma', 'KeyI', 'KeyO', 'KeyU', 'KeyP', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyX', 'KeyW', 'KeyE', 'KeyQ', 'KeyR', 'Space', 'ArrowLeft', 'ArrowRight', 'Escape']);

  const install = () => {
    sim.controller = (_s, _id, person) => {
      person.limbs =
        (any('KeyJ', 'KeyA') ? LIMB_BITS.armL : 0) | (any('KeyK', 'KeyS') ? LIMB_BITS.legL : 0) |
        (any('KeyL', 'KeyD') ? LIMB_BITS.legR : 0) | (any('Semicolon', 'KeyF') ? LIMB_BITS.armR : 0) |
        (any('Comma', 'KeyX') ? LIMB_BITS.neck : 0);
      person.drive = {
        rotate: (any('KeyI', 'KeyW') ? -1 : 0) + (any('KeyO', 'KeyE') ? 1 : 0),
        drift: (any('KeyU', 'KeyQ') ? -1 : 0) + (any('KeyP', 'KeyR') ? 1 : 0),
      };
    };
  };
  install();

  addEventListener('keydown', async (e) => {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    held.add(e.code);
    if (e.code === 'Space' && sim.activeId !== null) sim.release(sim.activeId);
    if (e.code === 'Escape') {
      p.dispose();
      ({ p, sim } = await make());
      install();
    }
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  Object.assign(window, { __sim: () => sim, __held: held });

  let camY = 2;
  let camX = 0;
  let camH = 4.5;
  let acc = 0;
  let last = performance.now();
  const frame = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    acc += dt;
    sim.cartInput = sim.cfg.base === 'balanced' ? (any('ArrowLeft') ? -1 : 0) + (any('ArrowRight') ? 1 : 0) : null;
    while (acc >= sim.cfg.dt) {
      sim.step();
      acc -= sim.cfg.dt;
    }
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    const height = sim.height();
    const active = sim.activeId === null ? null : sim.dropperView(sim.activeId);
    const claw = sim.activeId === null ? null : sim.clawTransform(sim.activeId);
    // Keep the claw (or the falling person) and the top of the tower in view.
    const focusY = claw ? claw.y : active ? sim.persons.get(active.id)!.bodyTransform().y : height;
    const topY = Math.max(height, focusY) + 1.2;
    camH += (Math.max(4.5, topY + 0.5) - camH) * 0.06;
    camY += (topY - camY) * 0.08;
    const focusX = claw ? claw.x : sim.summit().x;
    camX += (focusX * 0.5 + p.getTransform(sim.cart).x * 0.5 - camX) * 0.05;
    const scale = H / camH;
    const view: View = { scale, toX: (x) => W / 2 + (x - camX) * scale, toY: (y) => H - 30 * DPR - y * scale };
    drawScene(ctx, sim, view, W, H, { ruler: true });

    if (claw) {
      // The claw: a cable from the top and two prongs holding the person by the back.
      const cx = view.toX(claw.x);
      const cy = view.toY(claw.y);
      ctx.strokeStyle = '#9aa6c2';
      ctx.lineWidth = 2 * DPR;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, cy - 0.2 * scale);
      ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-claw.angle);
      ctx.strokeStyle = '#c9d2e6';
      ctx.lineWidth = 3 * DPR;
      ctx.beginPath();
      ctx.moveTo(-0.12 * scale, -0.2 * scale);
      ctx.lineTo(0.12 * scale, -0.2 * scale);
      ctx.moveTo(-0.12 * scale, -0.2 * scale);
      ctx.quadraticCurveTo(-0.17 * scale, 0, -0.08 * scale, 0.04 * scale);
      ctx.moveTo(0.12 * scale, -0.2 * scale);
      ctx.quadraticCurveTo(0.17 * scale, 0, 0.08 * scale, 0.04 * scale);
      ctx.stroke();
      ctx.restore();
    }

    const roles = [...sim.roles.values()];
    const locked = roles.filter((r) => r === 'tower').length;
    const status = !active ? 'next viewer coming…'
      : active.onClaw ? `viewer #${active.id} on the claw: aim with U/P, shape with J K L ; ,  then SPACE`
      : active.role === 'falling' ? `viewer #${active.id} falling`
      : active.role === 'pivoting' ? `viewer #${active.id} PINNED by 1 point: swing with I/O to a 2nd point`
      : `viewer #${active.id} ${active.role}`;
    hud.style.fontSize = '15px';
    hud.textContent = `height ${height.toFixed(2)} m   locked ${locked}   missed ${sim.metrics.missed}   snaps ${sim.metrics.snaps.length}\n${status}`;
    if (active) drawKeys(ctx, active.keys, W - 230 * DPR, 14 * DPR, 40 * DPR);
    if (sim.metrics.collapsed) {
      ctx.fillStyle = 'rgba(10,14,23,.7)';
      ctx.fillRect(0, H * 0.4, W, 120 * DPR);
      ctx.fillStyle = '#ffd23f';
      ctx.font = `800 ${44 * DPR}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`COLLAPSED at ${sim.metrics.maxHeight.toFixed(2)} m`, W / 2, H * 0.4 + 60 * DPR);
      ctx.font = `${18 * DPR}px ui-rounded, system-ui, sans-serif`;
      ctx.fillStyle = '#e8ecf4';
      ctx.fillText('Esc to play again', W / 2, H * 0.4 + 96 * DPR);
      ctx.textAlign = 'start';
    }
  }
}

// ---------- story (filmstrip) ----------

async function story() {
  const p = await createPhysics(backend);
  const sim = storySim(p);
  const hand = sim.streamer.partPosition('handR');
  const PW = 560 * DPR;
  const PH = 470 * DPR;
  const cam = { x: hand.x - 0.05, y: hand.y + 0.45, h: 2.6 };
  const panelView = (): View => {
    const scale = PH / cam.h;
    return { scale, toX: (x) => PW / 2 + (x - cam.x) * scale, toY: (y) => PH / 2 - (y - cam.y) * scale };
  };
  type Shot = { title: string; sub: string; img: HTMLCanvasElement; keys: string[] };
  const shots: Shot[] = [];
  const capture = (title: string, sub: string, keysOf = 1) => {
    const img = document.createElement('canvas');
    img.width = PW;
    img.height = PH;
    const c = img.getContext('2d')!;
    drawScene(c, sim, panelView(), PW, PH);
    shots.push({ title, sub, img, keys: sim.dropperView(keysOf)?.keys ?? [] });
  };

  const want = new Set(['fall', 'press', 'pin', 'swing', 'lock', 'next']);
  let pinAt = 0;
  let lockAt = 0;
  while (sim.time < 14 && want.size) {
    sim.step();
    const person = sim.persons.get(1);
    const role = sim.roles.get(1);
    if (!person || !role) continue;
    const v = sim.dropperView(1)!;
    if (want.has('fall') && role === 'falling' && v.keys.length === 0 && person.bodyTransform().y < hand.y + 1.35) {
      capture('1. Falling, no keys held', 'Limbs and neck are short stubs (tucked)');
      want.delete('fall');
    } else if (want.has('press') && role === 'falling' && v.keys.includes(KEY_LABELS.limbs.legL) && person.stretch('legL') > 0.6 * person.limb('legL').reach) {
      capture('2. Holding K', 'Only the left leg stretches out');
      want.delete('press');
    } else if (want.has('pin') && role === 'pivoting') {
      pinAt = sim.time;
      capture('3. Left foot touches: PINNED by 1 point', 'Sticky catch: stays at this angle (ring = hinge)');
      want.delete('pin');
    } else if (want.has('swing') && role === 'pivoting' && sim.time - pinAt > 0.4) {
      capture('4. Holding I (+ J to reach)', 'Swings counter-clockwise around the pin');
      want.delete('swing');
    } else if (want.has('lock') && role === 'tower') {
      lockAt = sim.time;
      capture('5. Second orb touches: 2 points = LOCKED', 'Frozen and welded at both points (dots)');
      want.delete('lock');
    } else if (want.has('next') && lockAt > 0 && (sim.roles.get(2) === 'tower' || sim.time - lockAt > 4)) {
      capture('6. Next viewer lands on them', 'Viewers are half the host\'s size', 2);
      want.delete('next');
    }
  }

  const cols = 3;
  const pad = 16 * DPR;
  const capH = 150 * DPR;
  canvas.width = cols * PW + (cols + 1) * pad;
  canvas.height = 2 * (PH + capH) + 3 * pad;
  canvas.style.width = `${canvas.width / DPR}px`;
  canvas.style.height = `${canvas.height / DPR}px`;
  document.body.style.overflow = 'auto';
  ctx.fillStyle = '#0a0e17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  shots.forEach((s, i) => {
    const x = pad + (i % cols) * (PW + pad);
    const y = pad + Math.floor(i / cols) * (PH + capH + pad);
    ctx.drawImage(s.img, x, y);
    ctx.fillStyle = '#e8ecf4';
    ctx.font = `700 ${20 * DPR}px ui-rounded, system-ui, sans-serif`;
    ctx.fillText(s.title, x + 6 * DPR, y + PH + 30 * DPR);
    ctx.fillStyle = '#aeb6c8';
    ctx.font = `${15 * DPR}px ui-rounded, system-ui, sans-serif`;
    ctx.fillText(s.sub, x + 6 * DPR, y + PH + 54 * DPR);
    drawKeys(ctx, s.keys, x + 6 * DPR, y + PH + 68 * DPR, 22 * DPR);
  });
  hud.textContent = '';
  (window as unknown as { __storyDone: boolean }).__storyDone = true;
}

// ---------- showcase ----------

async function showcase() {
  const p: Physics = await createPhysics(backend, { gravity: { x: 0, y: 0 } });
  const filter = { category: 0x4, mask: 0 };
  const cast = [
    { label: 'host (streamer), T-pose', scale: 1, pose: POSES.tPose, limbs: 0, color: '#f0a03c' },
    { label: 'viewer, no keys: tucked', scale: 0.5, limbs: 0 },
    { label: 'viewer holding K', scale: 0.5, limbs: LIMB_BITS.legL },
    { label: 'holding J and ;', scale: 0.5, limbs: LIMB_BITS.armL | LIMB_BITS.armR },
    { label: 'holding all five', scale: 0.5, limbs: 31 },
  ];
  const xs = [-2.3, -0.75, 0.35, 1.45, 2.65];
  const people = cast.map((c, i) => new Person(p, { id: i + 3, scale: c.scale, position: { x: xs[i]!, y: c.scale === 1 ? 1.2 : 1.0 }, limbs: c.limbs, pose: c.pose, filter, contactEvents: false }));
  // People spawn exactly in the pose their held keys produce, and in the game the host is
  // frozen in place; draw them as spawned (no settling steps, which slowly spin a free body).
  people[0]!.freeze();
  const W = canvas.width;
  const H = canvas.height;
  const scale = Math.min(W / 6.8, H / 2.6);
  const view: View = { scale, toX: (x) => W / 2 + x * scale, toY: (y) => H * 0.5 - (y - 1.1) * scale };
  ctx.fillStyle = '#0f1420';
  ctx.fillRect(0, 0, W, H);
  people.forEach((person, i) => {
    drawGooPerson(ctx, p, person, view, { color: cast[i]!.color ?? personColor(i + 3) });
    ctx.font = `${12 * DPR}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aeb6c8';
    ctx.fillText(cast[i]!.label, view.toX(xs[i]!), view.toY(-0.05));
    ctx.textAlign = 'start';
  });
  hud.textContent = 'Round bodies; head, hands and feet are sticky orbs. Viewers are half the host\'s size. Limbs stretch only while their key is held.';
}

// ---------- determinism ----------

async function determinism() {
  const { fingerprint } = await import('../src/determinism.ts');
  const results: Record<string, string> = {};
  for (const b of ['planck', 'box2d3-compat', 'box2d3-deluxe'] as BackendName[]) results[b] = await fingerprint(b);
  hud.textContent = JSON.stringify({ results, crossOriginIsolated }, null, 2);
  (window as unknown as { __determinism: unknown }).__determinism = results;
}
