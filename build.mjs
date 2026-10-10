import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { patchCore } from './lib/core-patches.cjs';
// Build the portable network service and its WebSocket dependency. The resulting
// plugin uses Node built-ins only; source-checkout paths are build inputs only.
const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error('Usage: node build.mjs <PI-Desktop source checkout>');
const require = createRequire(resolve(sourceRoot, 'package.json'));
const esbuild = require('esbuild');
const output = resolve(dirname(fileURLToPath(import.meta.url)), 'lib');
await mkdir(output, { recursive: true });
await esbuild.build({
  entryPoints: [resolve(sourceRoot, 'apps/desktop/electron/main/group-rooms/index.ts')],
  outfile: resolve(output, 'network.cjs'), bundle: true, platform: 'node',
  format: 'cjs', target: 'node22', legalComments: 'inline',
  plugins: [{ name: 'public-sdk-core', setup(build) {
    build.onLoad({ filter: /group-rooms\/index\.ts$/ }, async args => ({
      contents: patchCore(await readFile(args.path, 'utf8')), loader: 'ts', resolveDir: dirname(args.path),
    }));
  } }],
});
const wsPackage = require.resolve('ws/package.json');
const wsLicense = await readFile(resolve(dirname(wsPackage), 'LICENSE'), 'utf8');
await writeFile(resolve(output, 'WS-LICENSE.txt'), wsLicense);
