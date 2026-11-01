import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { studioVersion } from '../apps/studio/main/studio-version.mjs';
import { copyDistributionLicenses } from './studio-runtime-files.mjs';

const root = resolve(import.meta.dirname, '..');
const destination = join(root, 'build/npm-studio-entry');
await mkdir(join(destination, 'bin'), { recursive: true });
await cp(join(root, 'tools/studio-npm-entry.mjs'), join(destination, 'bin/cli.mjs'));
await copyDistributionLicenses(root, destination);
await writeFile(join(destination, 'package.json'), JSON.stringify({
  name: '@galcraft/studio', version: studioVersion, type: 'module',
  description: 'Install and launch GalCraft Studio from its exact release',
  author: { name: 'GalCraft' }, license: 'MPL-2.0',
  repository: { type: 'git', url: 'https://github.com/TianyuEric/GalCraft.git', directory: 'tools' },
  homepage: 'https://galcraft.dev/docs/en/installation/', publishConfig: { access: 'public' },
  bin: { 'galcraft-studio': 'bin/cli.mjs' }, engines: { node: '>=22.12.0' }, os: ['win32'], cpu: ['x64'],
  files: ['bin/cli.mjs', 'README.md', 'LICENSE', 'LICENSES', 'LICENSING.md', 'THIRD_PARTY_NOTICES.md'],
}, null, 2));
const readme = `# GalCraft Studio\n\nGalCraft Studio ${studioVersion} is an early preview for Windows x64. Use Node.js 22.12.0 or later; the latest Node 24 LTS patch is recommended.\n\n## Start Studio\n\n\`\`\`powershell\nnpx --yes @galcraft/studio@${studioVersion}\n\`\`\`\n\nOr install the command globally:\n\n\`\`\`powershell\nnpm install --global @galcraft/studio@${studioVersion}\ngalcraft-studio\n\`\`\`\n\nThe npm package provides a small launch command. On the first command, it installs the exact full application from [GitHub Release v${studioVersion}](https://github.com/TianyuEric/GalCraft/releases/tag/v${studioVersion}) into \`%LOCALAPPDATA%/GalCraft/npm-studio/${studioVersion}\`. Preparation downloads about 326 MiB plus npm dependencies and requires GitHub and npm access. npm installs the application's existing native dependencies. Later commands reuse that version's completed installation. Failed preparation can be retried with the same command. Studio keeps personal data in its existing user directory.\n\nThe full application retains the Player engines, 13 official plugins, FFmpeg/ffprobe, and their licenses. The Windows installer and full \`galcraft-studio-${studioVersion}.tgz\` remain available from the release. The registry entry is the small launcher; \`galcraft-studio-npm-entry-${studioVersion}.tgz\` is its matching release attachment.\n\n\`galcraft-studio status\` shows the service address; \`galcraft-studio stop\` saves recovery data and stops it. Closing the browser leaves the service running. All arguments, including \`--user-data\` and \`--no-open\`, pass to the existing application CLI.\n\nRead the [product manual](https://galcraft.dev/docs/en/studio-guide/). The launcher source is tagged [studio-npm-v${studioVersion}](https://github.com/TianyuEric/GalCraft/tree/studio-npm-v${studioVersion}); the full application source remains [v${studioVersion}](https://github.com/TianyuEric/GalCraft/tree/v${studioVersion}). Code uses MPL-2.0; bundled notices describe third-party terms and corresponding source.\n`;
await writeFile(join(destination, 'README.md'), readme);
const entry = await readFile(join(destination, 'bin/cli.mjs'), 'utf8');
if (!entry.includes('releases/download/v${version}/galcraft-studio-${version}.tgz')) throw new Error('The entry must install the full application release URL.');
console.log(JSON.stringify({ packageDirectory: destination, packageName: '@galcraft/studio', version: studioVersion, role: 'npm-entry' }));
