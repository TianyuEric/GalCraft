import { stageOfficialPluginLicenses } from '../../tools/plugin-development/license-notices.mjs';
import {build} from 'vite';
import {readFile, readdir, writeFile, copyFile, mkdir} from 'node:fs/promises';
import {pluginMetadata} from './dist/metadata.js';
for (const environment of ['definition','services','editor']) await build({configFile: false, build: { license: { fileName: 'licenses/dependencies.md' },outDir: `package/${environment}`, emptyOutDir: true, lib: {entry: `src/${environment}.ts`, formats: ['es'], fileName: () => 'index.js'}, rollupOptions: {external: [/^node:/]}}});
await writeFile('package/package.json', '{"type":"module","license":"MPL-2.0"}');
await mkdir('package/licenses',{recursive:true});await copyFile('licenses/motion-canvas.txt','package/licenses/motion-canvas.txt');
await stageOfficialPluginLicenses('package');
const files = [];
async function collect(directory, prefix = '') {for (const entry of await readdir(directory, {withFileTypes: true})) {const path = `${prefix}${entry.name}`; if (entry.isDirectory()) await collect(`${directory}/${entry.name}`, `${path}/`); else if (path !== 'manifest.json') files.push({path, size: (await readFile(`package/${path}`)).length});}}
await collect('package'); await writeFile('package/manifest.json', JSON.stringify({...pluginMetadata, files}, null, 2));
