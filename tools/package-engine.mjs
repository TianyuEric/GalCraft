import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { brandWindowsExecutable } from './brand-windows-executable.mjs';
import { readWindowsExecutableArchitecture } from '../packages/publishing/dist/engine/index.js';
import { copyDistributionLicenses } from './studio-runtime-files.mjs';
const repo = resolve(import.meta.dirname, '..');
const version = process.argv[3] ?? '0.1.0';
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Engine version must be an exact release version');
const destination = resolve(process.argv[2] ?? join(repo, 'out/engines', version));
try { await stat(join(destination, 'manifest.json')); throw new Error('Engine version already installed; choose an empty package directory'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(destination, { recursive: true });
const require = createRequire(join(repo, 'apps/player-windows/package.json'));
const electron = resolve(process.env.GALCRAFT_WINDOWS_PLAYER_RUNTIME ?? dirname(require('electron')));
const playerArch = await readWindowsExecutableArchitecture(join(electron, 'electron.exe'));
const electronVersion = (await readFile(join(electron, 'version'), 'utf8')).trim();
const expectedElectronVersion = JSON.parse(await readFile(require.resolve('electron/package.json'), 'utf8')).version;
if (electronVersion !== expectedElectronVersion) throw new Error(`Windows Player Electron differs: ${electronVersion}; expected ${expectedElectronVersion}`);
const fontsDirectory = resolve(process.env.GALCRAFT_FONT_DIR ?? join(repo, 'tools/fonts/cache'));
const fontCatalog = JSON.parse(await readFile(join(fontsDirectory, 'fonts.json'), 'utf8'));
await cp(join(repo, 'apps/player-web/dist'), join(destination, 'web'), { recursive: true });
await cp(join(repo, 'apps/player-web/dist-preview'), join(destination, 'preview'), { recursive: true });
await cp(electron, join(destination, 'windows'), { recursive: true, filter: path => !path.endsWith('default_app.asar') });
await cp(join(repo, 'apps/player-windows/dist'), join(destination, 'windows/resources/app/dist'), { recursive: true });
await mkdir(join(destination, 'windows/resources/app/main'), { recursive: true });
await cp(join(repo, 'apps/player-windows/dist-main/main.mjs'), join(destination, 'windows/resources/app/main/main.mjs'));
await cp(join(repo, 'apps/player-windows/dist-main/licenses'), join(destination, 'windows/licenses'), { recursive: true });
await cp(join(repo, 'apps/player-windows/main/preload.cjs'), join(destination, 'windows/resources/app/main/preload.cjs'));
await cp(join(repo, 'assets/branding/galcraft.ico'), join(destination, 'windows/resources/app/branding/galcraft.ico'));
await brandWindowsExecutable(join(destination, 'windows/electron.exe'), join(repo, 'assets/branding/galcraft.ico'));
await writeFile(join(destination, 'windows/resources/app/package.json'), JSON.stringify({ name: 'galcraft-player', version, type: 'module', main: 'main/main.mjs' }));
for (const target of ['web', 'windows']) {
  await copyDistributionLicenses(repo, join(destination, target));
  const fonts = join(destination, target, 'runtime/fonts'), licenses = join(destination, target, 'licenses');
  await mkdir(fonts, { recursive: true }); await mkdir(licenses, { recursive: true });
  for (const font of fontCatalog.fonts) await cp(join(fontsDirectory, font.path), join(fonts, font.path));
  await cp(join(fontsDirectory, fontCatalog.license), join(licenses, 'Noto-OFL.txt'));
  await cp(join(fontsDirectory, 'UPSTREAM.md'), join(licenses, 'Noto-UPSTREAM.md'));
  await writeFile(join(destination, target, 'runtime/fonts.json'), JSON.stringify({ source: fontCatalog.source, license: 'licenses/Noto-OFL.txt',
    fonts: fontCatalog.fonts.map(font => ({ family: font.family, language: font.language, path: `runtime/fonts/${font.path}` })) }));
}
await copyDistributionLicenses(repo, join(destination, 'preview'));
await cp(join(repo, 'apps/player-windows/dist-compiler/compiler.mjs'), join(destination, 'compiler.mjs'));
await writeFile(join(destination, 'release-notes.md'), `# GalCraft ${version}\nWeb HTTP and Windows ${playerArch} Player.\n`);
let live2dEntry;
if (process.env.GALCRAFT_LIVE2D_RUNTIME) {
  const prepared = resolve(process.env.GALCRAFT_LIVE2D_RUNTIME);
  const runtime = JSON.parse(await readFile(join(prepared, 'runtime.manifest.json'), 'utf8'));
  if (runtime.sdkRelease !== '5-r.4' || !['web', 'windows'].every(target => runtime.verifiedTargets.includes(target))) throw new Error('Live2D R4 runtime needs both target checks');
  const notices = new Set([...runtime.notices, ...runtime.motionSync?.notices ?? []]);
  for (const file of [...runtime.frameworkFiles, ...runtime.coreFiles, ...runtime.motionSync?.files ?? []]
    .filter(file => runtime.frameworkFiles.some(item => item.path === file.path) || notices.has(file.path))) {
    const path = join(destination, 'live2d', file.path); await mkdir(dirname(path), { recursive: true }); await cp(join(prepared, file.path), path);
  }
  live2dEntry = 'live2d/runtime.manifest.json'; await writeFile(join(destination, live2dEntry), JSON.stringify(runtime, null, 2));
}
const files = [];
async function walk(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) await walk(join(directory, entry.name), `${path}/`);
    else files.push({ path, size: (await stat(join(directory, entry.name))).size });
  }
}
await walk(destination);
const manifest = { schemaVersion: 1, id: 'galcraft', version, targets: ['web', 'windows', 'android', 'ios'], projectSchemaVersions: [1], saveSchemaVersions: [1],
  sdkMajor: 0, dslVersion: '0.1.0', templateSchemaVersions: [1], entries: { compiler: 'compiler.mjs', playerWeb: 'web/index.html', playerWindows: 'windows/electron.exe', preview: 'preview/preview.mjs', live2d: live2dEntry, upgrade: null },
  host: { electron: electronVersion, supportedWindows: [`Windows 11 ${playerArch}`], supportedBrowsers: [] },
  conversions: [], files, releaseNotes: 'release-notes.md' };
await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ destination, files: files.length, electron: manifest.host.electron }));
