import { createBox2D3Physics, type Box2DModule } from './box2d3.ts';
import { createPlanckPhysics } from './planck.ts';
import type { BackendName, Physics, Vec2 } from './types.ts';

export * from './types.ts';
export { createBox2D3Physics, createPlanckPhysics };

export interface WorldOptions {
  gravity?: Vec2;
  /** Box2D v3 sub-steps per step. */
  subSteps?: number;
  /** Planck solver iterations. */
  velocityIterations?: number;
  positionIterations?: number;
  enableSleep?: boolean;
}

type Flavour = 'auto' | 'compat' | 'deluxe';
const modules = new Map<Flavour, Promise<Box2DModule>>();

// The package only exports its auto-selecting entry, so pinned builds are loaded by path.
function flavourUrl(flavour: 'compat' | 'deluxe'): string {
  const file = `${flavour}/Box2D.${flavour}.mjs`;
  // Workspace node_modules is at the repo root; works under Vite (browser) and test runners.
  // The path goes through a variable on purpose: Vite rewrites `new URL(<literal>, import.meta.url)`
  // into an asset glob, which finds nothing inside node_modules.
  const rel = '../../../../node_modules/box2d3-wasm/build/dist/es/' + file;
  const direct = new URL(rel, import.meta.url).href;
  if (typeof window !== 'undefined') return direct;
  try {
    const entry = import.meta.resolve?.('box2d3-wasm');
    return entry ? new URL(`./${file}`, entry).href : direct;
  } catch {
    return direct;
  }
}

/**
 * Loads the box2d3-wasm module once per flavour. 'compat' and 'deluxe' bypass the
 * package's auto-selection so tests can pin a build. Threading is always off
 * (pthreadCount 0); we step single-threaded for determinism.
 */
export function loadBox2D3(flavour: Flavour = 'auto'): Promise<Box2DModule> {
  let p = modules.get(flavour);
  if (!p) {
    p = (async () => {
      if (flavour === 'auto') {
        const mod = await import('box2d3-wasm');
        return mod.default({ pthreadCount: 0 });
      }
      const mod = await import(/* @vite-ignore */ flavourUrl(flavour));
      return mod.default({ pthreadCount: 0 });
    })();
    modules.set(flavour, p);
  }
  return p;
}

export async function createPhysics(backend: BackendName, opts: WorldOptions = {}): Promise<Physics> {
  const gravity = opts.gravity ?? { x: 0, y: -10 };
  switch (backend) {
    case 'planck':
      return createPlanckPhysics({ gravity, velocityIterations: opts.velocityIterations, positionIterations: opts.positionIterations });
    case 'box2d3':
      return createBox2D3Physics(await loadBox2D3('auto'), { gravity, subSteps: opts.subSteps, enableSleep: opts.enableSleep }, 'box2d3');
    case 'box2d3-compat':
      return createBox2D3Physics(await loadBox2D3('compat'), { gravity, subSteps: opts.subSteps, enableSleep: opts.enableSleep }, 'box2d3-compat');
    case 'box2d3-deluxe':
      return createBox2D3Physics(await loadBox2D3('deluxe'), { gravity, subSteps: opts.subSteps, enableSleep: opts.enableSleep }, 'box2d3-deluxe');
  }
}
