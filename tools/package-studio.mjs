import { studioVersion } from '../apps/studio/main/studio-version.mjs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { stageNativeDependencies } from './stage-native-dependencies.mjs';
import { studioPackageTarget, mediaToolNames } from './studio-package-target.mjs';
import { assertNativeBinaryTarget, nativeBinaryTarget } from './native-binary-target.mjs';
import { copyStudioService, copyMattingRuntime, copyMediaRuntime, copyDistributionLicenses } from './studio-runtime-files.mjs';

const repo = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url);
const target = studioPackageTarget(), stage = join(repo, 'build/studio-package');
const appRoot = join(stage, 'app'), resources = join(stage, 'resources');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
function runPnpm(args, cwd = repo) { execFileSync(pnpm, args, { cwd, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' }); }
function node(script, ...args) { execFileSync(process.execPath, [join(repo, script), ...args], { cwd: repo, stdio: 'inherit', windowsHide: true }); }
function signature(mode, path) {
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    join(repo, 'tools/windows-sign.ps1'), '-Mode', mode, ...(path ? ['-Path', path] : [])], { encoding: 'utf8', windowsHide: true }));
}
if (target.platform === 'win32' && process.platform !== 'win32') throw new Error('The locally signed Windows distribution must be built on Windows.');
if (!stage.startsWith(resolve(repo, 'build') + sep)) throw new Error('The staging directory must stay inside build/.');
const mediaDirectory = resolve(target.mediaDirectory ?? process.env.GALCRAFT_MEDIA_TOOL_DIR ?? join(repo, 'tools/media/runtime/bin'));
for (const name of mediaToolNames(target.platform)) await assertNativeBinaryTarget(join(mediaDirectory, name), target);
if (!target.reuseBuild) {
  runPnpm(['--filter', '@galcraft/studio', 'desktop:prepare']);
  runPnpm(['exec', 'vite', 'build', '--config', 'vite.main.config.ts'], join(repo, 'apps/studio'));
  node('tools/build-studio-service.mjs');
}
await rm(stage, { recursive: true, force: true }); await mkdir(resources, { recursive: true }); await mkdir(appRoot, { recursive: true });
const nativeSource = target.nativeSource ? resolve(target.nativeSource) : null;
const nativePackages = await stageNativeDependencies(nativeSource ?? join(repo, 'tools/matting/package.json'), appRoot, { ...target, dependencies: [
  'sharp', 'onnxruntime-node', { name: '@resvg/resvg-js', sourcePackage: nativeSource ?? join(repo, 'package.json') }, { name: 'playwright', sourcePackage: nativeSource ?? join(repo, 'package.json') },
] });
const dependencies = Object.fromEntries(['sharp', 'onnxruntime-node', '@resvg/resvg-js', 'playwright'].map(name => [name, nativePackages[name]]));
const expectedDependencies = { ...JSON.parse(await readFile(join(repo, 'tools/matting/package.json'), 'utf8')).dependencies, ...JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')).devDependencies };
for (const [name, version] of Object.entries(dependencies)) if (expectedDependencies[name] !== version) throw new Error(`Studio dependency differs: ${name}@${version}; expected ${expectedDependencies[name]}`);
await writeFile(join(appRoot, 'package.json'), JSON.stringify({ name: 'galcraft-studio', productName: 'GalCraft Studio', version: studioVersion,
  description: 'GalCraft visual novel authoring studio', author: { name: 'GalCraft' }, license: 'MPL-2.0', repository: 'https://github.com/TianyuEric/GalCraft', type: 'module', main: 'main/main.mjs', dependencies }, null, 2));
const nativeRequire = createRequire(join(appRoot, 'package.json'));
const ortRoot = dirname(dirname(nativeRequire.resolve('onnxruntime-node')));
await assertNativeBinaryTarget(join(ortRoot, 'bin/napi-v6', target.platform, target.arch, 'onnxruntime_binding.node'), target);
await copyMattingRuntime(repo, join(appRoot, 'resources/matting'));
await mkdir(join(appRoot, 'resources/fonts'), { recursive: true }); await cp(join(repo, 'tools/fonts/subset.py'), join(appRoot, 'resources/fonts/subset.py'));
await cp(join(repo, 'apps/studio/dist'), join(appRoot, 'dist'), { recursive: true });
await cp(join(repo, 'apps/studio/dist-main/main'), join(appRoot, 'main'), { recursive: true });
await cp(join(repo, 'apps/studio/main/service-preload.cjs'), join(appRoot, 'main/service-preload.cjs'));
await copyStudioService(repo, join(appRoot, 'service'));
await cp(join(repo, 'apps/studio/resources/branding'), join(appRoot, 'resources/branding'), { recursive: true });
await copyDistributionLicenses(repo, appRoot);
await cp(join(repo, 'build/desktop/engines/0.1.0'), join(resources, 'engines/0.1.0'), { recursive: true });
await copyMediaRuntime(repo, mediaDirectory, join(resources, 'media'), target.platform);
await mkdir(join(resources, 'motion-canvas'), { recursive: true });
for (const name of ['render.mjs', 'prepare.mjs']) await cp(join(repo, 'tools/motion-canvas', name), join(resources, 'motion-canvas', name));
await cp(join(repo, 'tools/motion-canvas/browser'), join(resources, 'motion-canvas/browser'), { recursive: true });
const pluginCatalog = JSON.parse(await readFile(join(repo, 'plugins/catalog.json'), 'utf8'));
await mkdir(join(resources, 'plugins'), { recursive: true }); await cp(join(repo, 'plugins/catalog.json'), join(resources, 'plugins/catalog.json'));
for (const { directory } of pluginCatalog) await cp(join(repo, 'plugins', directory), join(resources, 'plugins', directory), { recursive: true,
  filter: path => !path.includes(`${sep}.galcraft-load${sep}`) && !path.endsWith(`${sep}.galcraft-load`) });
let certificate, playerSignature;
if (process.platform === 'win32') {
  certificate = signature('prepare'); process.env.GALCRAFT_SIGN_THUMBPRINT = certificate.thumbprint;
  process.env.GALCRAFT_SIGN_EVIDENCE = join(repo, 'test-results/latest/sh9-platform-packaging', `signing-${target.platform}-${target.arch}`);
  playerSignature = signature('sign', join(resources, 'engines/0.1.0/windows/electron.exe'));
  const manifestPath = join(resources, 'engines/0.1.0/manifest.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const file of manifest.files) file.size = (await stat(join(resources, 'engines/0.1.0', file.path))).size;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}
await writeFile(join(resources, 'distribution.json'), JSON.stringify({ product: 'GalCraft Studio', author: 'GalCraft', publisher: 'GalCraft', version: studioVersion,
  platform: target.platform, arch: target.arch, nativePackages, media: { executables: mediaToolNames(target.platform) },
  playerWindows: { ...await nativeBinaryTarget(join(resources, 'engines/0.1.0/windows/electron.exe')), entry: 'engines/0.1.0/windows/electron.exe' }, browser: { runtime: 'distributed-electron', serviceOwned: true, mainWindowRequired: false, dependency: 'playwright', version: dependencies.playwright, bundled: true },
  tutorial: 'independent .galproject', plugins: pluginCatalog.map(({ id, version }) => ({ id, version })) }, null, 2));
node('tools/verify-studio-package.mjs', '--staging', '--platform', target.platform, '--arch', target.arch);
if (target.stageOnly) { console.log(JSON.stringify({ stage, target, certificate, playerSignature })); }
else {
  const { build, Platform, Arch } = require('electron-builder');
  const platform = { win32: Platform.WINDOWS, linux: Platform.LINUX, darwin: Platform.MAC }[target.platform];
  await build({ projectDir: repo, config: require(join(repo, 'electron-builder.cjs')), targets: platform.createTarget(target.format, Arch[target.arch]), publish: 'never' });
  const unpacked = target.platform === 'win32' ? `out/studio/${target.arch === 'x64' ? 'win-unpacked' : `win-${target.arch}-unpacked`}` : target.platform === 'linux' ? `out/studio/linux${target.arch === 'x64' ? '' : `-${target.arch}`}-unpacked` : `out/studio/mac${target.arch === 'x64' ? '' : `-${target.arch}`}/GalCraft Studio.app/Contents`;
  node('tools/verify-studio-package.mjs', '--unpacked', unpacked, '--platform', target.platform, '--arch', target.arch);
  const signatures = playerSignature ? [playerSignature] : [];
  if (target.platform === 'win32') {
    signatures.push(signature('inspect', join(repo, unpacked, 'GalCraft Studio.exe')));
    if (target.format === 'nsis') signatures.push(signature('inspect', join(repo, 'out/studio', `GalCraft-Studio-${studioVersion}-windows-${target.arch}-setup.exe`)));
  }
  await writeFile(join(repo, 'out/studio', `signing-record-${target.platform}-${target.arch}.json`), JSON.stringify({ certificate, signatures, verification: 'Package contents and signatures; application and installer not launched.' }, null, 2));
}
