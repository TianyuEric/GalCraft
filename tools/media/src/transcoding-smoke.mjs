import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { inspectToolPair, mediaExecutables, probeMedia, runProcess, transcodeWindowsMp4 } from './process.mjs';
import { prepareMediaTools } from '../prepare.mjs';
import { writeSyntheticVideo } from './synthetic-video.mjs';

const root = resolve('tmp/testing/media-tools');
const tools = await prepareMediaTools();
const input = join(root, '中文 空格', '源 视频.mkv');
const cancellationInput = join(root, '中文 空格', '长 视频.mp4');
const output = resolve('test-results/latest/media-transcoding/converted.mp4');
const reportPath = resolve('test-results/latest/media-transcoding/result.json');


await mkdir(dirname(output), { recursive: true });
await writeSyntheticVideo(tools, input, { videoCodec: 'ffv1', audioCodec: 'pcm_s16le' });
await writeSyntheticVideo(tools, cancellationInput, { durationSec: 12 });
const before = await stat(input);

const toolPair = await inspectToolPair(tools);
const probed = await probeMedia(tools, input);
const converted = await transcodeWindowsMp4(tools, input, output, true);
const decoded = await runProcess(mediaExecutables(tools).ffmpeg,
  ['-hide_banner', '-v', 'error', '-i', output, '-f', 'null', 'NUL']);
const outputProbe = await probeMedia(tools, output);

const abort = new AbortController();
let pid = null;
const began = performance.now();
const running = runProcess(mediaExecutables(tools).ffmpeg,
  ['-re', '-i', cancellationInput, '-c', 'copy', '-f', 'null', 'NUL'],
  { signal: abort.signal, onSpawn: value => { pid = value; } });
setTimeout(() => abort.abort(), 300);
let cancellation = 'unexpectedSuccess';
try { await running; } catch (error) { cancellation = error.code ?? String(error); }
const cancelElapsedMs = Math.round(performance.now() - began);
let childAlive = false;
try { process.kill(pid, 0); childAlive = true; } catch { /* child exited */ }

const after = await stat(input);
const video = outputProbe.streams?.find(stream => stream.codec_type === 'video');
const audio = outputProbe.streams?.find(stream => stream.codec_type === 'audio');
const report = {
  toolPair, input, sourceStreams: probed.streams?.map(stream => stream.codec_name),
  output, outputBytes: (await stat(output)).size, videoCodec: video?.codec_name, audioCodec: audio?.codec_name,
  decoded: decoded.stderr === '', converted: converted.stderr.includes('video:'),
  cancellation, pid, cancelElapsedMs, childAlive,
  sourcePreserved: before.size === after.size && before.mtimeMs === after.mtimeMs,
};
await writeFile(reportPath, JSON.stringify(report, null, 2));
if (!toolPair.h264Mf || !toolPair.aac ||
  !report.outputBytes || video?.codec_name !== 'h264' || audio?.codec_name !== 'aac' ||
  !report.decoded || cancellation !== 'CANCELLED' || childAlive || cancelElapsedMs > 5000 || !report.sourcePreserved)
  throw new Error(`Media transcoding check failed: ${JSON.stringify(report)}`);
