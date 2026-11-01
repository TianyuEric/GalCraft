import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const directory = join(root, 'apps/studio/resources/practice');
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
const crops = JSON.parse(await readFile(join(directory, 'sources/images/avatar-crops.json'), 'utf8'));
await mkdir(join(directory, 'avatars'), { recursive: true });
for (const [key, crop] of Object.entries(crops)) {
  execFileSync(join(root, 'tools/media/runtime/bin/ffmpeg.exe'), ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', crop.source, '-vf', `crop=${crop.size}:${crop.size}:${crop.x}:${crop.y}`, '-frames:v', '1', manifest.avatars[key]],
  { cwd: directory, windowsHide: true, stdio: 'inherit' });
}
console.log('Prepared three transparent head portraits from the original character artwork.');
