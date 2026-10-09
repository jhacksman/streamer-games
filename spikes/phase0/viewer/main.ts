// Phase 0 viewer: draws the tower sim live so wobble, bonds and stress can be judged by eye.
// URL params mirror TowerConfig, e.g. ?backend=box2d3-compat&placement=random&drops=50&tension=20000
// ?mode=fingerprint runs headless for N steps and prints the determinism fingerprint.
import { createPhysics, type BackendName } from '../../../packages/engine/src/physics/index.ts';
import { TowerSim, type TowerConfig, DEFAULT_LIMITS } from '../src/tower.ts';
import { LIMB_BITS, Person, POSES } from '../../../packages/engine/src/person/person.ts';
import { drawGooPerson, personColor } from './goo-draw.ts';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const backend = (q.get('backend') ?? 'box2d3-compat') as BackendName;

function config(): TowerConfig {
  return {
    seed: num('seed', 1),
    drops: num('drops', 50),
    placement: (q.get('placement') ?? 'random') as TowerConfig['placement'],
    base: (q.get('base') ?? 'fixed') as TowerConfig['base'],
    dropInterval: num('interval', 1.4),
    leanStep: num('leanStep', 0.18),
    sticky: q.get('sticky') !== '0',
    aim: q.get('aim') !== '0',
    limbs: q.has('limbs') ? Number(q.get('limbs')) : -1,
    weld: { angularHertz: num('hz', 12), angularDamping: 0.7 },
    stickyRadius: num('sticky_r', 0.04),
    limits: {
      ...DEFAULT_LIMITS,
      tension: num('tension', DEFAULT_LIMITS.tension),
      shear: num('shear', DEFAULT_LIMITS.shear),
      twist: num('twist', DEFAULT_LIMITS.twist),
      model: (q.get('model') ?? 'masonry') as 'masonry' | 'independent',
      width: num('width', 0.25),
    },
  };
}

const hud = document.getElementById('hud')!;

if (q.get('mode') === 'determinism') {
  const { fingerprint } = await import('../src/determinism.ts');
  const results: Record<string, string> = {};
  for (const b of ['planck', 'box2d3-compat', 'box2d3-deluxe'] as BackendName[]) results[b] = await fingerprint(b);
  hud.textContent = JSON.stringify({ results, crossOriginIsolated, userAgent: navigator.userAgent }, null, 2);
  (window as unknown as { __determinism: unknown }).__determinism = results;
} else if (q.get('mode') === 'showcase') {
  await showcase();
} else if (q.get('mode') === 'fingerprint') {
  const steps = num('steps', 1800);
  const p = await createPhysics(backend);
  const sim = new TowerSim(p, config());
  for (let i = 0; i < steps; i++) sim.step();
  const result = { backend, steps, fingerprint: sim.fingerprint(), landed: sim.metrics.landed, crossOriginIsolated };
  hud.textContent = JSON.stringify(result, null, 2);
  (window as unknown as { __fingerprint: unknown }).__fingerprint = result;
} else {
  await live();
}

async function live() {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  let p = await createPhysics(backend);
  let sim = new TowerSim(p, config());
  let paused = q.get('paused') === '1';
  let speed = num('speed', 1);
  let stepOnce = false;
  let camH = 8;
  let camX = 0;

  addEventListener('keydown', async (e) => {
    if (e.key === ' ') paused = !paused;
    if (e.key === '.') stepOnce = true;
    if (e.key === 'ArrowRight') speed = Math.min(8, speed * 2);
    if (e.key === 'ArrowLeft') speed = Math.max(0.25, speed / 2);
    if (e.key === 'r') {
      p.dispose();
      p = await createPhysics(backend);
      sim = new TowerSim(p, config());
    }
  });

  // Inspection hooks for automated checks: run to a sim time, then pause.
  Object.assign(window, {
    __sim: () => sim,
    __runTo: (t: number) => {
      while (sim.time < t && !sim.done()) sim.step();
      paused = true;
      draw();
      return { t: +sim.time.toFixed(2), height: +sim.height().toFixed(2), tower: [...sim.roles.values()].filter((r) => r === 'tower').length, snaps: sim.metrics.snaps.length, bonds: sim.bonds.length };
    },
    __play: () => { paused = false; },
  });

  const resize = () => {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
  };
  addEventListener('resize', resize);
  resize();

  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) acc += dt * speed;
    while (acc >= sim.cfg.dt || stepOnce) {
      if (!sim.done()) sim.step();
      acc = Math.max(0, acc - sim.cfg.dt);
      stepOnce = false;
    }
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function stressColor(r: number): string {
    // green (0) -> yellow (0.6) -> red (1+)
    const t = Math.max(0, Math.min(1, r));
    const hue = 120 - 120 * Math.min(1, t / 1);
    return `hsl(${hue}, 85%, ${50 + (t > 0.85 ? 10 * Math.sin(performance.now() / 60) : 0)}%)`;
  }

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    const height = sim.height();
    camH += (Math.max(8, height + 5) - camH) * 0.05;
    camX += (p.getTransform(sim.cart).x - camX) * 0.05;
    const scale = H / camH;
    const toX = (x: number) => W / 2 + (x - camX) * scale;
    const toY = (y: number) => H - 30 * devicePixelRatio - y * scale;

    ctx.fillStyle = '#0f1420';
    ctx.fillRect(0, 0, W, H);
    // ruler
    ctx.fillStyle = '#5b6680';
    ctx.font = `${11 * devicePixelRatio}px ui-monospace, monospace`;
    const stepM = camH > 40 ? 10 : camH > 16 ? 5 : 1;
    for (let m = 0; m <= camH; m += stepM) {
      ctx.fillRect(0, toY(m), 14 * devicePixelRatio, 1);
      ctx.fillText(`${m} m`, 18 * devicePixelRatio, toY(m) + 4);
    }
    // ground
    ctx.fillStyle = '#26314a';
    ctx.fillRect(0, toY(0), W, H - toY(0));

    // per-person worst stress, for the red tint
    const personStress = new Map<number, number>();
    for (const b of sim.bonds) {
      const r = sim.stress.ratio(b.joint);
      personStress.set(b.a, Math.max(personStress.get(b.a) ?? 0, r));
      personStress.set(b.b, Math.max(personStress.get(b.b) ?? 0, r));
    }

    const view = { toX, toY, scale };
    for (const [id, person] of sim.persons) {
      const role = sim.roles.get(id);
      drawGooPerson(ctx, p, person, view, {
        color: role === 'streamer' ? '#f0a03c' : personColor(id),
        stress: role === 'tower' ? personStress.get(id) ?? 0 : 0,
        limp: role === 'debris',
        lookAt: role === 'falling' ? { x: camX, y: height } : undefined,
      });
    }

    // bonds as goo blobs, tinted by stress
    for (const b of sim.bonds) {
      const ba = sim.towerBodyOf(b.a);
      if (ba === null || !p.bodyExists(ba)) continue;
      const t = p.getTransform(ba);
      const r = sim.stress.ratio(b.joint);
      for (const pt of b.points) {
        const c = Math.cos(t.angle), s = Math.sin(t.angle);
        const wx = t.x + c * pt.x - s * pt.y;
        const wy = t.y + s * pt.x + c * pt.y;
        ctx.beginPath();
        ctx.arc(toX(wx), toY(wy), Math.max(3 * devicePixelRatio, 0.07 * scale), 0, Math.PI * 2);
        ctx.fillStyle = stressColor(r);
        ctx.fill();
      }
    }

    const m = sim.metrics;
    const people = [...sim.roles.values()].filter((r) => r === 'tower').length;
    const recent = m.stepMs.slice(-120);
    const stepAvg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
    hud.textContent = [
      `${backend}  seed ${sim.cfg.seed}  ${sim.cfg.placement}  ${sim.cfg.limits.model} tension ${sim.cfg.limits.tension}`,
      `t ${sim.time.toFixed(1)} s   x${speed}${paused ? '  PAUSED' : ''}`,
      `height ${height.toFixed(1)} m   max ${m.maxHeight.toFixed(1)} m`,
      `tower ${people}   dropped ${m.dropped}   landed ${m.landed}   missed ${m.missed}`,
      `bonds ${sim.bonds.length}   sticky ${m.stickyBonds}   snaps ${m.snaps.length}   detached ${m.detached}`,
      `tilt ${((sim.tilt() * 180) / Math.PI).toFixed(1)}°   ${m.collapsed ? 'COLLAPSED' : ''}`,
      `physics step ${stepAvg.toFixed(3)} ms`,
    ].join('\n');
  }
}

/** A few goo people in different shapes, big, for judging the look. */
async function showcase() {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  const p = await createPhysics(backend, { gravity: { x: 0, y: 0 } });
  const filter = { category: 0x4, mask: 0 };
  const cast = [
    { label: 'streamer: T-pose', pose: POSES.tPose, limbs: 0, color: '#f0a03c' },
    { label: 'no keys: tucked', limbs: 0 },
    { label: 'J + ; arms', limbs: LIMB_BITS.armL | LIMB_BITS.armR },
    { label: 'all five keys', limbs: 31 },
    { label: 'K L , legs+neck', limbs: LIMB_BITS.legL | LIMB_BITS.legR | LIMB_BITS.neck },
  ];
  const people = cast.map((c, i) => new Person(p, {
    id: i + 3, position: { x: (i - (cast.length - 1) / 2) * 1.85, y: 1.6 }, limbs: c.limbs, pose: c.pose, filter, contactEvents: false,
  }));
  for (let i = 0; i < 90; i++) {
    for (const person of people) person.update();
    p.step(1 / 60);
  }
  const W = canvas.width;
  const H = canvas.height;
  const scale = Math.min(W / 9.6, H / 3.2);
  const view = { scale, toX: (x: number) => W / 2 + x * scale, toY: (y: number) => H * 0.48 - (y - 1.6) * scale };
  ctx.fillStyle = '#0f1420';
  ctx.fillRect(0, 0, W, H);
  people.forEach((person, i) => {
    drawGooPerson(ctx, p, person, view, { color: cast[i]!.color ?? personColor(i + 3), lookAt: { x: 0, y: 0.5 } });
    ctx.font = `${11 * devicePixelRatio}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aeb6c8';
    ctx.fillText(cast[i]!.label, view.toX(person.bodyTransform().x), view.toY(-0.2));
  });
  hud.textContent = 'Stumpy people: sticky orbs for head, hands, feet. Limbs short until a key is held.';
}
