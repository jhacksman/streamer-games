// Phase 0 head-to-head: runs every experiment on every backend and writes results.json.
//   npm run phase0
import { writeFileSync } from 'node:fs';
import { createPhysics, type BackendName } from '../../../packages/engine/src/physics/index.ts';
import { TowerSim, type TowerConfig } from './tower.ts';
import { runColumn } from './column.ts';
import { runTruss } from './truss.ts';
import { fingerprint } from './determinism.ts';

const BACKENDS: BackendName[] = ['planck', 'box2d3-compat', 'box2d3-deluxe'];
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const pct = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)] ?? 0;
const r3 = (x: number) => +x.toFixed(3);
const LIMITS = { compression: 1e9, tension: 20000, shear: 20000, twist: 2600, model: 'masonry' as const, width: 0.25 };
const UNBREAKABLE = { ...LIMITS, compression: 1e12, tension: 1e12, shear: 1e12, twist: 1e12 };

async function tower(name: BackendName, cfg: TowerConfig) {
  const p = await createPhysics(name);
  const m = new TowerSim(p, cfg).run();
  p.dispose();
  const peak = Math.max(...m.peopleAtTiming);
  const atPeak = (a: number[]) => a.filter((_, i) => m.peopleAtTiming[i]! >= peak - 5);
  return {
    landed: m.landed, pivots: m.pivots, missed: m.missed, danglers: m.danglers, towerPeopleEnd: m.towerPeople, peakPeople: peak, sticky: m.stickyBonds,
    pivotToLockSec: r3(avg(m.pivotTimes)),
    snaps: m.snaps.reduce<Record<string, number>>((o, s) => ((o[s.mode] = (o[s.mode] ?? 0) + 1), o), {}),
    detached: m.detached, collapsed: m.collapsed, maxHeight: r3(m.maxHeight), nan: m.nan, blowup: m.blowup,
    stepAvgMs: r3(avg(atPeak(m.stepMs))), stepP95Ms: r3(pct(atPeak(m.stepMs), 0.95)),
    frameAvgMs: r3(avg(atPeak(m.frameMs))), frameP95Ms: r3(pct(atPeak(m.frameMs), 0.95)),
  };
}

const results: Record<string, Record<string, unknown>> = {};
for (const name of BACKENDS) {
  console.error(`running ${name}...`);
  const r: Record<string, unknown> = {};
  r.tower_player = await tower(name, { seed: 1, drops: 40, bot: 'player' });
  r.tower_passive = await tower(name, { seed: 1, drops: 40, bot: 'passive' });
  r.tower_player_springy12hz = await tower(name, { seed: 1, drops: 40, bot: 'player', weld: { angularHertz: 12, angularDamping: 0.7 } });
  r.tower_player_balanced = await tower(name, { seed: 1, drops: 40, bot: 'player', base: 'balanced' });
  r.pile40_unbreakable = await tower(name, { seed: 3, drops: 40, bot: 'player', limits: UNBREAKABLE });
  for (const [label, people, offset, hz, snapping] of [
    ['column50_straight_rigid', 50, 0, 0, true], ['column50_straight_soft12hz', 50, 0, 12, false],
    ['column50_lean12cm', 50, 0.12, 0, true], ['column100_straight_rigid', 100, 0, 0, false],
  ] as const) {
    const p = await createPhysics(name);
    const c = runColumn(p, { people, offset, angularHertz: hz, seconds: 10, limits: LIMITS, snapping });
    p.dispose();
    r[label] = {
      standing: c.standing, of: people, snaps: c.snaps, bottomCompression: c.bottom ? Math.round(c.bottom.compression) : null,
      expectedCompression: Math.round(c.expectedBottomCompression), topSag: r3(c.topStartY - c.topEndY), nan: c.nan,
      stepAvgMs: r3(c.stepMsAvg), stepP95Ms: r3(c.stepMsP95),
    };
  }
  for (const [label, anvil] of [['truss_car', 0], ['truss_anvil2t', 2000], ['truss_anvil40t', 40000]] as const) {
    const p = await createPhysics(name);
    const t = runTruss(p, { panels: 40, panelWidth: 1.5, height: 2, load: 1, anvil, pinLimit: 950000, seconds: 14 });
    p.dispose();
    r[label] = { beams: t.beams, pins: t.pins, snaps: t.snaps, carCrossed: t.vehicleX > 60, nan: t.nan, blowup: t.blowup, stepAvgMs: r3(t.stepMsAvg), stepP95Ms: r3(t.stepMsP95) };
  }
  r.determinism = { run1: await fingerprint(name), run2: await fingerprint(name) };
  results[name] = r;
}
results.meta = { node: process.version, platform: `${process.platform} ${process.arch}`, date: new Date().toISOString() };
writeFileSync(new URL('../results.json', import.meta.url), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
