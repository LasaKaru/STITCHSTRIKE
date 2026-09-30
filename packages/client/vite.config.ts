import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const SERVER = process.env.STITCHSTRIKE_SERVER ?? 'http://localhost:8787';

export default defineConfig({
  server: {
    host: true,
    proxy: {
      // The arena connects to /ws on the page's own origin; in dev that is proxied to the game server.
      '/ws': { target: SERVER, ws: true, rewrite: (p) => p.replace(/^\/ws/, '') },
    },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // three.js alone is ~600 kB minified (150 kB gzip), well inside the plan's 40 MB first-download budget.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        wool: resolve(import.meta.dirname, 'wool.html'),
        arena: resolve(import.meta.dirname, 'arena.html'),
        figures: resolve(import.meta.dirname, 'figures.html'),
      },
    },
  },
});
