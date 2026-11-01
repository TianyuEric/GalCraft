import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mediaExecutables, runProcess } from './process.mjs';

/** Program-authored picture and sine tone for real codec, import and cancellation checks. */
export async function writeSyntheticVideo(tools, path, { durationSec = 3, videoCodec = 'libopenh264', audioCodec = 'aac' } = {}) {
  await mkdir(dirname(path), { recursive: true });
  await runProcess(mediaExecutables(tools).ffmpeg, ['-y', '-hide_banner', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', String(durationSec), '-c:v', videoCodec, '-pix_fmt', 'yuv420p', '-c:a', audioCodec, path]);
  return path;
}
