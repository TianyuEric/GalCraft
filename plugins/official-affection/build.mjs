import { stageOfficialPluginLicenses } from '../../tools/plugin-development/license-notices.mjs';
import { build } from 'vite';
import { sharedRuntimePlugin } from '@galcraft/plugins/development';
import { pluginMetadata } from './dist/metadata.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const runtimeBridge = await sharedRuntimePlugin();
await build({ configFile: false, plugins: [runtimeBridge], build: { license: { fileName: 'licenses/dependencies.md' }, outDir: 'package/runtime', emptyOutDir: true,
  lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' } } });
const id = 'org.galcraft.affection';
await build({ configFile: false, plugins: [runtimeBridge], build: { license: { fileName: 'licenses/dependencies.md' }, outDir: 'package/definition', emptyOutDir: true,
  lib: { entry: 'src/definition.ts', formats: ['es'], fileName: () => 'index.js' } } });
await writeFile('package/package.json', '{"type":"module","license":"MPL-2.0"}');
const licensePaths = await stageOfficialPluginLicenses('package');
const paths = [...licensePaths, 'runtime/index.js', 'definition/index.js', 'package.json'];
await writeFile('package/manifest.json', JSON.stringify({ ...pluginMetadata,
  files: await Promise.all(paths.map(async path => ({ path, size: (await readFile(`package/${path}`)).length }))) }, null, 2));
