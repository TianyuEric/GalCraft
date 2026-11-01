import {access, mkdir, readFile, readdir, stat, writeFile, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectToolPair, runProcess} from '../media/src/process.mjs';

export const dependencyVersions = {'@motion-canvas/core': '3.17.2', '@motion-canvas/2d': '3.17.2', '@motion-canvas/ui': '3.17.2', '@motion-canvas/vite-plugin': '3.17.2', vite: '5.4.21', 'playwright-core': '1.62.1'};
export const capabilityKey = 'org.galcraft.motion-canvas/toolchain';

async function bytes(directory) {
  let size = 0;
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const file = join(directory, entry.name);
    size += entry.isDirectory() ? await bytes(file) : (await stat(file)).size;
  }
  return size;
}
export async function prepareMotionCanvas({browserExecutable, directory = join(import.meta.dirname, 'runtime'), toolDirectory = resolve(import.meta.dirname, '../media/runtime/bin')} = {}) {
  const runtime = resolve(directory); await mkdir(runtime, {recursive: true});
  browserExecutable ??= process.env.GALCRAFT_CHROMIUM_PATH;
  const media = await inspectToolPair(toolDirectory);
  if (!media.videoEncoder || !media.aac) throw new Error('The prepared host FFmpeg must expose H.264 and AAC encoders');
  await writeFile(join(runtime, 'package.json'), JSON.stringify({name: '@galcraft/motion-canvas-local-runtime', version: '0.1.0', private: true, type: 'module', dependencies: dependencyVersions}, null, 2));
  const npmCli = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const installCache = resolve(runtime, '.npm-cache');
  await runProcess(process.execPath, [npmCli, 'install', '--prefix', runtime, '--workspaces=false', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', installCache]);
  if (dirname(installCache) !== runtime) throw new Error('The install cache must belong to the selected runtime directory');
  await rm(installCache, {recursive: true, force: true});
  const require = createRequire(join(runtime, 'package.json'));
  const {chromium} = require('playwright-core');
  browserExecutable ??= chromium.executablePath();
  await access(browserExecutable);
  const browser = await chromium.launch({executablePath: browserExecutable, headless: true});
  let version; try {version = browser.version();} finally {await browser.close();}
  const manifest = {id: capabilityKey, version: '0.1.0', motionCanvas: '3.17.2', vite: '5.4.21', playwright: '1.62.1',
    browser: {name: 'chromium', version, executablePath: resolve(browserExecutable)},
    encoding: {ffmpegVersion: media.ffmpegVersion, ffprobeVersion: media.ffprobeVersion, videoEncoder: media.videoEncoder, audioEncoder: 'aac', pixelFormat: 'yuv420p', toolDirectory: resolve(toolDirectory)},
    runtimeDirectory: runtime, dependencies: dependencyVersions, runtimeBytes: await bytes(join(runtime, 'node_modules'))};
  await writeFile(join(runtime, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return {url: pathToFileURL(join(import.meta.dirname, 'render.mjs')).href, expected: manifest};
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const at = process.argv.indexOf('--browser');
  const directoryAt = process.argv.indexOf('--directory');
  const mediaAt = process.argv.indexOf('--media-tools');
  console.log(JSON.stringify(await prepareMotionCanvas({browserExecutable: at < 0 ? undefined : process.argv[at + 1], directory: directoryAt < 0 ? undefined : process.argv[directoryAt + 1], toolDirectory: mediaAt < 0 ? undefined : process.argv[mediaAt + 1]}), null, 2));
}
