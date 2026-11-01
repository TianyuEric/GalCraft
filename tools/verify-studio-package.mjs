import { studioVersion } from '../apps/studio/main/studio-version.mjs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { NtExecutable, NtExecutableResource, Data, Resource } from 'resedit';
import { studioPackageTarget, mediaToolNames } from './studio-package-target.mjs';
import { assertNativeBinaryTarget, nativeBinaryTarget } from './native-binary-target.mjs';

const repo = resolve(import.meta.dirname, '..'), target = studioPackageTarget();
const at = process.argv.indexOf('--unpacked'), staging = process.argv.includes('--staging');
const unpacked = resolve(repo, at < 0 ? `out/studio/${target.arch === 'x64' ? 'win-unpacked' : `win-${target.arch}-unpacked`}` : process.argv[at + 1]);
const resources = staging ? join(repo, 'build/studio-package/resources') : join(unpacked, target.platform === 'darwin' ? 'Resources' : 'resources');
const appRoot = staging ? join(repo, 'build/studio-package/app') : join(resources, 'app');
const requiredFiles = ['package.json', 'main/main.mjs', 'main/service-preload.cjs', 'service/entry.mjs', 'service/cli.mjs', 'service/worker-entry.mjs',
  'service/compiler-utility.mjs', 'service/style-utility.mjs', 'dist/index.html', 'resources/branding/galcraft.ico', 'resources/matting/src/worker.mjs', 'resources/matting/manifest.json', 'resources/fonts/subset.py'];
for (const path of requiredFiles) await stat(join(appRoot, path));
for (const path of ['service/help', 'dist/help', 'resources/matting/src/asset-smoke.mjs', 'resources/matting/src/prepare-smoke.mjs'])
  if (await stat(join(appRoot, path)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }))
    throw new Error(`Obsolete development/help output entered the application: ${path}`);
if ((await readdir(join(appRoot, 'resources/matting/src'))).some(name => !['matting.mjs', 'worker.mjs'].includes(name))) throw new Error('Matting distribution contains development inputs.');
if ((await readdir(join(resources, 'media/bin'))).some(name => !mediaToolNames(target.platform).includes(name))) throw new Error('Media distribution contains executables outside FFmpeg/ffprobe.');
if (await stat(join(resources, 'media/doc')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('Upstream developer manuals entered the application.');
for (const path of ['resources/practice', 'resources/templates/practice']) if (await stat(join(appRoot, path)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('The complete tutorial must be distributed as a separate .galproject.');
const packageJson = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'));
if (packageJson.version !== studioVersion) throw new Error('Studio application version differs from its source manifest.');
if (packageJson.author?.name !== 'GalCraft' || packageJson.author?.email || packageJson.productName !== 'GalCraft Studio') throw new Error('Studio package metadata must use GalCraft without personal email.');
const require = createRequire(join(appRoot, 'package.json'));
const nativeEntries = Object.fromEntries(['sharp', 'onnxruntime-node', '@resvg/resvg-js', 'playwright'].map(dependency => [dependency, require.resolve(dependency)]));
for (const entry of Object.values(nativeEntries)) if (!entry.startsWith(appRoot + sep)) throw new Error(`Native dependency resolves outside the package: ${entry}`);
const sharpRequire = createRequire(nativeEntries.sharp), resvgRequire = createRequire(nativeEntries['@resvg/resvg-js']);
const sharpEntry = sharpRequire.resolve(`@img/sharp-${target.platform}-${target.arch}/sharp.node`);
const sharpLibrary = join(dirname(sharpEntry), 'lib');
const sharpBinary = sharpEntry.endsWith('.node') ? sharpEntry : join(sharpLibrary, (await readdir(sharpLibrary)).find(name => name.endsWith('.node')));
const nativeBinaries = [sharpBinary,
  resvgRequire.resolve(`@resvg/resvg-js-${target.platform}-${target.arch}${target.platform === 'linux' ? '-gnu' : target.platform === 'win32' ? '-msvc' : ''}`),
  join(dirname(dirname(nativeEntries['onnxruntime-node'])), 'bin/napi-v6', target.platform, target.arch, 'onnxruntime_binding.node')];
for (const binary of nativeBinaries) await assertNativeBinaryTarget(binary, target);
for (const name of mediaToolNames(target.platform)) await assertNativeBinaryTarget(join(resources, 'media/bin', name), target);
for (const path of ['motion-canvas/prepare.mjs', 'motion-canvas/render.mjs', 'motion-canvas/browser/editor.html', 'media/src/process.mjs']) await stat(join(resources, path));
const distribution = JSON.parse(await readFile(join(resources, 'distribution.json'), 'utf8'));
if (distribution.version !== packageJson.version) throw new Error('Studio distribution and application versions differ.');
if (distribution.platform !== target.platform || distribution.arch !== target.arch || distribution.publisher !== 'GalCraft') throw new Error('Distribution target or publisher differs.');
const pluginsRoot = join(resources, 'plugins'), pluginCatalog = JSON.parse(await readFile(join(pluginsRoot, 'catalog.json'), 'utf8'));
for (const { id, version, directory } of pluginCatalog) {
  const manifest = JSON.parse(await readFile(join(pluginsRoot, directory, 'manifest.json'), 'utf8'));
  if (manifest.id !== id || manifest.version !== version) throw new Error(`Bundled plugin differs: ${id}@${version}`);
  for (const file of manifest.files) if ((await stat(join(pluginsRoot, directory, file.path))).size !== file.size) throw new Error(`Bundled plugin file differs: ${directory}/${file.path}`);
}
const engineRoot = join(resources, 'engines/0.1.0'), engineManifest = JSON.parse(await readFile(join(engineRoot, 'manifest.json'), 'utf8'));
if (JSON.stringify(await readdir(join(resources, 'engines'))) !== JSON.stringify(['0.1.0'])) throw new Error('The unpublished distribution must contain only engine 0.1.0.');
for (const file of engineManifest.files) if ((await stat(join(engineRoot, file.path))).size !== file.size) throw new Error(`Engine file size differs: ${file.path}`);
const playerBinary = join(engineRoot, engineManifest.entries.playerWindows), player = await nativeBinaryTarget(playerBinary);
if (player.platform !== 'win32') throw new Error('The Windows Player entry must be an actual Windows executable.');
const icons = [], branding = [], expectedIcons = Data.IconFile.from(await readFile(join(repo, 'assets/branding/galcraft.ico'))).icons.map(item => item.data);
const iconBytes = item => Buffer.from(item.isRaw() ? item.bin : item.generate());
for (const path of [playerBinary, ...(!staging && target.platform === 'win32' ? [join(unpacked, 'GalCraft Studio.exe')] : [])]) {
  const entries = NtExecutableResource.from(NtExecutable.from(await readFile(path), { ignoreCert: true })).entries;
  const groups = Resource.IconGroupEntry.fromEntries(entries), sizes = [...new Set(groups.flatMap(group => group.icons.map(icon => icon.width || 256)))].sort((a, b) => a - b);
  const actual = groups.flatMap(group => group.getIconItemsFromEntries(entries));
  if (!expectedIcons.every(expected => actual.some(icon => iconBytes(icon).equals(iconBytes(expected))))) throw new Error(`Executable icon differs from GalCraft branding: ${path}`);
  icons.push({ path, sizes, matchesBranding: true });
  if (path !== playerBinary) {
    const values = Resource.VersionInfo.fromEntries(entries).map(info => info.getStringValues({ lang: 1033, codepage: 1200 }));
    if (!values.some(value => value.CompanyName === 'GalCraft' && value.ProductName === 'GalCraft Studio' && value.FileVersion === studioVersion && value.ProductVersion === `${studioVersion}.0`)) throw new Error('Studio executable product/publisher differs from GalCraft.');
    branding.push({ path, values });
  }
}
const report = { target: `${target.platform}/${target.arch}`, staging, inspection: 'Service entry points, actual native binary targets, closed dependencies, exact plugin/engine files and executable icons',
  appRoot, resources, studioVersion: packageJson.version, distributionVersion: distribution.version, requiredFiles, nativeBinaries, plugins: pluginCatalog.map(({ id, version }) => ({ id, version })), engineFiles: engineManifest.files.length, player, icons,
  tutorial: 'independent .galproject', browser: distribution.browser, branding };
console.log(JSON.stringify({ result: 'passed', target: report.target, staging, appRoot, studioVersion: packageJson.version,
  engineFiles: report.engineFiles, plugins: report.plugins.length, nativeBinaries: nativeBinaries.length }));
