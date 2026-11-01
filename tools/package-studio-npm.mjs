import { studioVersion } from '../apps/studio/main/studio-version.mjs';
import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { copyStudioService, copyMattingRuntime, copyMediaRuntime, copyDistributionLicenses } from './studio-runtime-files.mjs';

const repo = resolve(import.meta.dirname, '..'), studio = join(repo, 'apps/studio');
const destination = resolve(repo, 'build/npm-studio');
if (!destination.startsWith(`${join(repo, 'build')}${sep}`)) throw new Error('npm staging must stay inside build.');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const run = (args, cwd = repo) => execFileSync(pnpm, args, { cwd, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
if (!process.argv.includes('--reuse-build')) {
  run(['--filter', '@galcraft/studio', 'desktop:prepare']);
  execFileSync(process.execPath, [join(repo, 'tools/build-studio-service.mjs')], { cwd: repo, stdio: 'inherit', windowsHide: true });
}
for (const file of ['entry.mjs', 'cli.mjs', 'worker-entry.mjs', 'compiler-utility.mjs', 'style-utility.mjs']) await access(join(studio, 'dist-service/service', file));
await rm(destination, { recursive: true, force: true }); await mkdir(destination, { recursive: true });
await cp(join(studio, 'dist'), join(destination, 'dist'), { recursive: true });
await copyStudioService(repo, join(destination, 'service'));
const resources = join(destination, 'resources'); await mkdir(resources, { recursive: true });
await mkdir(join(resources, 'engines'), { recursive: true });
await cp(join(repo, 'build/desktop/engines/0.1.0'), join(resources, 'engines/0.1.0'), { recursive: true });
const catalog = JSON.parse(await readFile(join(repo, 'plugins/catalog.json'), 'utf8'));
await mkdir(join(resources, 'plugins'), { recursive: true });
await writeFile(join(resources, 'plugins/catalog.json'), JSON.stringify(catalog, null, 2));
for (const { directory } of catalog) await cp(join(repo, 'plugins', directory), join(resources, 'plugins', directory), { recursive: true,
  filter: path => !path.includes(`${sep}.galcraft-load`) });
await copyMediaRuntime(repo, resolve(process.env.GALCRAFT_MEDIA_TOOL_DIR ?? join(repo, 'tools/media/runtime/bin')), join(resources, 'media'));
await copyMattingRuntime(repo, join(resources, 'matting'));
for (const [source, target] of [['tools/fonts/subset.py', 'fonts/subset.py']]) {
  await mkdir(resolve(resources, target, '..'), { recursive: true });
  await cp(join(repo, source), join(resources, target), { recursive: true, filter: path => !path.endsWith('.test.mjs') && !path.endsWith('ffplay.exe') });
}
await mkdir(join(resources, 'motion-canvas'), { recursive: true });
for (const name of ['render.mjs', 'prepare.mjs']) await cp(join(repo, 'tools/motion-canvas', name), join(resources, 'motion-canvas', name));
await cp(join(repo, 'tools/motion-canvas/browser'), join(resources, 'motion-canvas/browser'), { recursive: true });
await copyDistributionLicenses(repo, destination);
await writeFile(join(destination, 'package.json'), JSON.stringify({ name: '@galcraft/studio', version: studioVersion, type: 'module',
  description: 'GalCraft local visual novel authoring studio', author: { name: 'GalCraft' }, license: 'MPL-2.0',
  repository: { type: 'git', url: 'https://github.com/TianyuEric/GalCraft.git' }, homepage: 'https://github.com/TianyuEric/GalCraft#readme', publishConfig: { access: 'public' },
  bin: { 'galcraft-studio': 'service/cli.mjs' }, files: ['service', 'dist', 'resources', 'LICENSE', 'LICENSES', 'LICENSING.md', 'THIRD_PARTY_NOTICES.md', 'README.md'],
  engines: { node: '>=22.12.0' }, os: ['win32'], cpu: ['x64'], dependencies: { playwright: '1.62.1', sharp: '0.35.4', 'onnxruntime-node': '1.25.1', '@resvg/resvg-js': '2.6.2' },
}, null, 2));
await writeFile(join(destination, 'README.md'), "# GalCraft Studio\n\nThe npm application supports Node.js 22.12.0 or later; use the latest Node.js 24 LTS patch. Packaged desktop builds include their runtime and need no separate Node.js installation. Source development and CI use Node.js 24.21.0 with pnpm 12.3.4.\n\nRun `galcraft-studio` to start the local service and open Studio. `galcraft-studio status` shows its address; `galcraft-studio stop` saves recovery data and stops it. Closing a browser tab keeps the service running. Use `galcraft-studio serve` for a foreground service. Capture first uses GALCRAFT_CHROMIUM_PATH when configured, otherwise a detected supported Chrome/Edge. If none is available, `galcraft-studio prepare-browser` prepares matching Chromium once. Non-browser editing and compilation work without it; starting Studio does not download a browser.\n\nThis package targets Windows x64 and carries its prepared FFmpeg/ffprobe and Player runtime. Its package metadata requires win32/x64; other platform distributions require separately prepared matching runtimes.\n\nProject samples and Android SDK/JDK tools are distributed separately. Install version " + studioVersion + " with `npm install --global @galcraft/studio@" + studioVersion + "`, or run `npx --yes --package=@galcraft/studio@" + studioVersion + " galcraft-studio`. Find the installer, corresponding source and tutorial links at https://github.com/TianyuEric/GalCraft/releases/tag/v" + studioVersion + ". Read the product manual at https://galcraft.dev/docs/en/studio-guide/.\n");
console.log(JSON.stringify({ packageDirectory: destination, packageName: '@galcraft/studio', version: studioVersion, publication: 'local-only' }));
