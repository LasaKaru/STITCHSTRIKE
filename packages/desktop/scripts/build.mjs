// Bundles the Electron main + preload (with the game server and shared sim inlined)
// and copies the built web client next to them. Run the client build first.
import { build } from 'esbuild';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientDist = join(root, '..', 'client', 'dist');
if (!existsSync(join(clientDist, 'index.html'))) {
  console.error('Build the client first: pnpm --filter @stitchstrike/client build');
  process.exit(1);
}

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: 'linked',
  // ws works without its optional native speedups.
  // steamworks.js is optional and native: required at runtime only if installed.
  external: ['electron', 'bufferutil', 'utf-8-validate', 'steamworks.js'],
  logLevel: 'info',
};
await build({ ...common, entryPoints: [join(root, 'src/main.ts')], outfile: join(root, 'dist/main.cjs') });
await build({ ...common, entryPoints: [join(root, 'src/preload.ts')], outfile: join(root, 'dist/preload.cjs') });

rmSync(join(root, 'client'), { recursive: true, force: true });
cpSync(clientDist, join(root, 'client'), { recursive: true });
console.log('client copied to packages/desktop/client');
