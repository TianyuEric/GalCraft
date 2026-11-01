import { stageOfficialPluginLicenses } from '../../tools/plugin-development/license-notices.mjs';
import { build } from 'vite';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { pluginMetadata } from './dist/metadata.js';
for (const [environment, entry] of Object.entries({ definition: 'definition', services: 'services', editor: 'editor' })) {
  await build({ configFile: false, build: { license: { fileName: 'licenses/dependencies.md' }, outDir: `package/${environment}`, emptyOutDir: true,
    lib: { entry: `src/${entry}.ts`, formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { external: [/^node:/] } } });
}
await build({ configFile: false, build: { license: { fileName: 'licenses/dependencies.md' }, outDir: 'package/services', emptyOutDir: false,
  lib: { entry: 'src/render-worker.ts', formats: ['es'], fileName: () => 'render-worker.js' }, rollupOptions: { external: [/^node:/] } } });
await copyFile('node_modules/spessasynth_lib/dist/spessasynth_processor.min.js', 'package/editor/spessasynth_processor.min.js');
await mkdir('package/licenses', { recursive: true });
for (const [dependency, name] of [['spessasynth_core', 'LICENSE'], ['spessasynth_lib', 'LICENSE'], ['tone', 'LICENSE.md'], ['stb-vorbis', 'LICENSE']]) {
  await copyFile(`node_modules/${dependency}/${name}`, `package/licenses/${dependency}.txt`);
}
await writeFile('package/package.json', '{"type":"module","license":"MPL-2.0"}');
await stageOfficialPluginLicenses('package');
const paths = [];
async function collect(directory, prefix = '') { for (const entry of await readdir(directory, { withFileTypes: true })) {
  const path = `${prefix}${entry.name}`; if (entry.isDirectory()) await collect(`${directory}/${entry.name}`, `${path}/`); else if (path !== 'manifest.json') paths.push(path);
} }
await collect('package');
await writeFile('package/manifest.json', JSON.stringify({ ...pluginMetadata,
  files: await Promise.all(paths.map(async path => ({ path, size: (await readFile(`package/${path}`)).length }))) }, null, 2));
