import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { mediaToolNames } from './studio-package-target.mjs';

/** Carry the applicable project license scope and source availability notice. */
export async function copyDistributionLicenses(repo, destination) {
  await mkdir(destination, { recursive: true });
  const paths = ['LICENSE', 'LICENSING.md', 'THIRD_PARTY_NOTICES.md', 'LICENSES'];
  for (const name of paths) await cp(join(repo, name), join(destination, name), { recursive: true });
}

export async function copyStudioService(repo, destination) {
  const source = join(repo, 'apps/studio/dist-service/service');
  await mkdir(destination, { recursive: true });
  for (const name of ['entry.mjs', 'cli.mjs', 'worker-entry.mjs', 'compiler-utility.mjs', 'style-utility.mjs', 'licenses'])
    await cp(join(source, name), join(destination, name), { recursive: true });
}

export async function copyMattingRuntime(repo, destination) {
  await mkdir(join(destination, 'src'), { recursive: true });
  for (const name of ['matting.mjs', 'worker.mjs'])
    await cp(join(repo, 'tools/matting/src', name), join(destination, 'src', name));
  await cp(join(repo, 'tools/matting/manifest.json'), join(destination, 'manifest.json'));
}

export async function copyMediaRuntime(repo, binaryDirectory, destination, platform = process.platform) {
  await mkdir(join(destination, 'bin'), { recursive: true });
  for (const name of mediaToolNames(platform)) await cp(join(binaryDirectory, name), join(destination, 'bin', name));
  // Keep the upstream notices alongside the executables. Developer manuals and
  // ffplay are outside the application's FFmpeg/ffprobe runtime contract.
  for (const name of await readdir(dirname(binaryDirectory)))
    if (/^(?:LICENSE|COPYING|NOTICE|SOURCE|UPSTREAM)/i.test(name)) await cp(join(dirname(binaryDirectory), name), join(destination, name), { recursive: true });
  if (resolve(binaryDirectory) === resolve(repo, 'tools/media/runtime/bin')) {
    await cp(join(repo, 'tools/media/UPSTREAM.md'), join(destination, 'UPSTREAM.md'));
    await cp(join(repo, 'tools/media/SOURCES.md'), join(destination, 'SOURCES.md'));
    await cp(join(repo, 'LICENSES/ffmpeg-build-inputs.json'), join(destination, 'SOURCE-INPUTS.json'));
    await cp(join(repo, 'tools/media/source-bundle.json'), join(destination, 'SOURCE-BUNDLE.json'));
    await cp(join(repo, 'tools/media/notices'), join(destination, 'notices'), { recursive: true });
    await cp(join(repo, 'LICENSES/GPL-3.0.txt'), join(destination, 'COPYING.GPLv3'));
  }
  await mkdir(join(destination, 'src'), { recursive: true });
  await cp(join(repo, 'tools/media/src/process.mjs'), join(destination, 'src/process.mjs'));
}
