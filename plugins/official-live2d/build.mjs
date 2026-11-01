import { stageOfficialPluginLicenses } from '../../tools/plugin-development/license-notices.mjs';
import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { pluginMetadata } from './dist/metadata.js';
for (const [environment, entry] of Object.entries({ definition: 'definition', services: 'services', runtime: 'runtime', editor: 'editor' })) {
  await build({ configFile: false, build: { license: { fileName: 'licenses/dependencies.md' }, outDir: `package/${environment}`, emptyOutDir: true,
    lib: { entry: `src/${entry}.ts`, formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { external: [/^node:/] } } });
}
await writeFile('package/package.json', '{"type":"module","license":"MPL-2.0"}');
const licensePaths = await stageOfficialPluginLicenses('package');
const paths = [...licensePaths, 'package.json', ...['definition', 'services', 'runtime', 'editor'].map(environment => `${environment}/index.js`)];
await writeFile('package/manifest.json', JSON.stringify({ ...pluginMetadata,
  files: await Promise.all(paths.map(async path => ({ path, size: (await readFile(`package/${path}`)).length }))) }, null, 2));
