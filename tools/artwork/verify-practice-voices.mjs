import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile), root = resolve(import.meta.dirname, '../..'), media = join(root, 'apps/studio/resources/practice');
const bin = join(root, 'tools/media/runtime/bin');
const manifest = JSON.parse(await readFile(join(media, 'manifest.json'), 'utf8'));
const sourceRoot = join(media, manifest.voiceSources);
const frozen = JSON.parse(await readFile(join(sourceRoot, 'lines.json'), 'utf8'));
const records = [];
for (const line of frozen.lines) {
  const file = `voice/${line.key}.mp3`;
  if (!line.zh.trim() || !line.ja.trim() || !manifest.voices[line.characterKey]?.includes(file)) throw new Error(`Adopted dialogue mapping differs: ${file}`);
  const probe = JSON.parse((await run(join(bin, 'ffprobe.exe'), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', join(media, file)], { windowsHide: true })).stdout);
  const decoded = (await run(join(bin, 'ffmpeg.exe'), ['-v', 'error', '-i', join(media, file), '-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', '48000', '-ac', '2', 'pipe:1'], { windowsHide: true, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 })).stdout;
  const samples = new Float32Array(decoded.buffer, decoded.byteOffset, decoded.length / 4);
  let peak = 0, sum = 0;
  for (const sample of samples) { if (!Number.isFinite(sample)) throw new Error(`Non-finite audio sample: ${file}`); peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; }
  const rms = Math.sqrt(sum / samples.length), durationSec = Number(probe.format.duration);
  if (peak > 1 || rms < .001 || durationSec < 2) throw new Error(`Invalid voice audio: ${file}`);
  records.push({ file, character: line.character, lineKey: line.key, zh: line.zh, ja: line.ja, durationSec, peak, rms, channels: probe.streams[0].channels, sampleRate: Number(probe.streams[0].sample_rate), decoded: true });
}
if (records.length !== 39 || new Set(records.map(record => record.lineKey)).size !== 39 || Object.values(manifest.voices).some(files => files.length !== 13)) throw new Error('Expected 39 unique adopted lines, 13 per character');
const evidence = join(root, 'test-results/latest/practice-voices'); await mkdir(evidence, { recursive: true });
await writeFile(join(evidence, 'voice-measurements.json'), JSON.stringify({ environment: 'Adopted MP3, FFprobe and full FFmpeg float decode; public Chinese/Japanese dialogue correspondence', records }, null, 2) + '\n');
console.log(JSON.stringify({ decodedVoices: records.length, manualListening: 'Requires the executor to listen to the current outputs' }));
