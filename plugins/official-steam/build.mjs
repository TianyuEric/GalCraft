import { stageOfficialPluginLicenses } from '../../tools/plugin-development/license-notices.mjs';
import { build } from 'vite';
import { sharedRuntimePlugin } from '@galcraft/plugins/development';
import { pluginMetadata } from './dist/metadata.js';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
await build({ configFile: false, plugins: [await sharedRuntimePlugin()], build: { license: { fileName: 'licenses/dependencies.md' }, outDir: 'package/runtime', emptyOutDir: true,
  lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' } } });
await build({ configFile: false, build: { license: { fileName: 'licenses/dependencies.md' }, target: 'node24', outDir: 'package/services', emptyOutDir: true,
  lib: { entry: 'src/services.ts', formats: ['es'], fileName: () => 'index.mjs' } } });
await build({ configFile: false, build: { license: { fileName: 'licenses/dependencies.md' }, target: 'node24', outDir: 'package/native/windows-x64', emptyOutDir: true,
  lib: { entry: 'src/platform.ts', formats: ['es'], fileName: () => 'index.mjs' },
  rolldownOptions: { external: [/^node:/] } } });
await cp('src/steam-worker.mjs', 'package/native/windows-x64/steam-worker.mjs');
const require = createRequire(import.meta.url), sdk = dirname(require.resolve('steamworks.js'));
for (const file of ['steamworksjs.win32-x64-msvc.node', 'steam_api64.dll']) await cp(join(sdk, 'dist/win64', file), join('package/native/windows-x64', file));
await mkdir('package/licenses', { recursive: true }); await cp('STEAMWORKS-NOTICE.md', 'package/licenses/STEAMWORKS-NOTICE.md');
await cp('STEAMWORKS-LICENSE', 'package/licenses/STEAMWORKS-LICENSE');
await writeFile('package/package.json', '{"type":"module","license":"MPL-2.0"}');
await stageOfficialPluginLicenses('package');
const files = [];
async function walk(directory, prefix = '') { for (const item of await readdir(directory, { withFileTypes: true })) {
  const path = `${prefix}${item.name}`;
  if (item.isDirectory()) await walk(join(directory, item.name), `${path}/`);
  else if (path !== 'manifest.json') files.push({ path, size: (await readFile(join(directory, item.name))).length });
} }
await walk('package');
await writeFile('package/manifest.json', JSON.stringify({ ...pluginMetadata, files }, null, 2));
