import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { coreVersion } from '../../apps/studio/main/live2d-core-version.mjs';
const repo = resolve(import.meta.dirname, '../..');
const require = createRequire(join(repo, 'apps/studio/package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const sdk = resolve(process.argv[2]), motion = resolve(process.argv[3]);
const output = resolve(process.argv[4]);
for (const [root, version] of [[sdk, '5-r.4'], [motion, '5-r.2']]) {
  const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
  if (changelog.match(/^## \[([^\]]+)\]/m)?.[1] !== version) throw new Error(`Expected SDK ${version}: ${root}`);
}
await mkdir(output, { recursive: true });
const coreFiles = [], frameworkFiles = [], notices = [], motionFiles = [], motionNotices = [];
async function copy(source, path, files) {
  await mkdir(join(output, path, '..'), { recursive: true }); await copyFile(source, join(output, path));
  files.push({ path, bytes: (await stat(join(output, path))).size });
}
async function core(root, file, folder, files, noticeFiles) {
  const redistributable = await readFile(join(root, 'RedistributableFiles.txt'), 'utf8');
  if (!redistributable.includes(file)) throw new Error(`Core not listed for redistribution: ${file}`);
  await copy(join(root, file), `${folder}/${file}`, files);
  for (const name of ['LICENSE.md', 'RedistributableFiles.txt']) {
    await copy(join(root, name), `${folder}/${name}`, files); noticeFiles.push(`${folder}/${name}`);
  }
}
await core(join(sdk, 'Core'), 'live2dcubismcore.js', 'core', coreFiles, notices);
if (motion) await core(join(motion, 'Core/CRI'), 'live2dcubismmotionsynccore.js', 'motion', motionFiles, motionNotices);
for (const name of ['LICENSE.md', 'NOTICE.md']) {
  await copy(join(sdk, name), `notices/cubism-${name}`, coreFiles); notices.push(`notices/cubism-${name}`);
  if (motion) { await copy(join(motion, name), `notices/motionsync-${name}`, motionFiles); motionNotices.push(`notices/motionsync-${name}`); }
}
await copy(join(sdk, 'Framework/LICENSE.md'), 'notices/framework-LICENSE.md', coreFiles); notices.push('notices/framework-LICENSE.md');
const bundled = await build({ configFile: false, root: repo, resolve: { alias: { '@framework': join(sdk, 'Framework/src'),
  '@motionsyncframework': join(motion ?? sdk, 'Framework/src') } },
  build: { outDir: output, emptyOutDir: false, minify: false, lib: { entry: join(repo, 'tools/live2d/runtime.ts'), formats: ['es'], fileName: () => 'adapter.mjs' } } });
for (const result of Array.isArray(bundled) ? bundled : [bundled]) for (const file of result.output)
  frameworkFiles.push({ path: file.fileName, bytes: (await stat(join(output, file.fileName))).size });
await writeFile(join(output, 'runtime.manifest.json'), JSON.stringify({ schemaVersion: 1, sdkRelease: '5-r.4', frameworkVersion: '5-r.4',
  coreVersion: await coreVersion(join(output, 'core/live2dcubismcore.js'), 'cubism'), entry: 'adapter.mjs',
  sourceUrl: 'https://www.live2d.com/sdk/download/web/', coreFiles, frameworkFiles, notices,
  redistributableFiles: [...coreFiles, ...frameworkFiles].map(file => file.path),
  motionSync: { componentRelease: '5-r.2', coreVersion: await coreVersion(join(output, 'motion/live2dcubismmotionsynccore.js'), 'motion'),
    files: motionFiles, notices: motionNotices, redistributableFiles: motionFiles.map(file => file.path) }, verifiedTargets: [] }, null, 2));
console.log(JSON.stringify({ output, coreFiles: coreFiles.length, motionFiles: motionFiles.length }));
