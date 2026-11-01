import { stageOfficialPluginLicenses } from '../../tools/plugin-development/license-notices.mjs';
import { build } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sharedRuntimePlugin } from '@galcraft/plugins/development';

const directory = import.meta.dirname;
await mkdir(join(directory, 'package'), { recursive: true });
await writeFile(join(directory, 'package/package.json'), '{"type":"module","license":"MPL-2.0"}\n');
for (const [environment, entry] of [['definition', 'src/definition.ts'], ['editor', 'src/index.ts']]) {
  await build({ configFile: false, root: directory, plugins: [await sharedRuntimePlugin()], build: { license: { fileName: 'licenses/dependencies.md' },
    outDir: `package/${environment}`, emptyOutDir: true, lib: { entry, formats: ['es'], fileName: () => 'index.js' },
  } });
}
const { pluginMetadata } = await import(`${pathToFileURL(join(directory, 'package/editor/index.js')).href}?build`);
const licensePaths = await stageOfficialPluginLicenses('package');
const paths = [...licensePaths, 'definition/index.js', 'editor/index.js', 'package.json'];
await writeFile(join(directory, 'package/manifest.json'), JSON.stringify({ ...pluginMetadata,
  files: await Promise.all(paths.map(async path => ({ path, size: (await readFile(join(directory, 'package', path))).length }))) }, null, 2) + '\n');
