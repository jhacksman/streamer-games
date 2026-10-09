import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    port: 5180,
    strictPort: true,
    fs: { allow: [repoRoot] },
    // Cross-origin isolation lets the "deluxe" (SIMD + threads) Box2D build load in the browser.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Pre-bundling would move box2d3-wasm away from its .wasm file.
  optimizeDeps: { exclude: ['box2d3-wasm'] },
});
