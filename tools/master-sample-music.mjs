import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { masterMusic } from '../plugins/music-composition/dist/mastering.js';
import { mediaExecutables, probeMedia, runProcess } from './media/src/process.mjs';
import { prepareMediaTools } from './media/prepare.mjs';
import { practiceDistributionFiles } from './practice-distribution.mjs';

function pcmWave(channels) {
  const frames = channels[0].length, wave = Buffer.alloc(44 + frames * 4);
  wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20); wave.writeUInt16LE(2, 22); wave.writeUInt32LE(48000, 24); wave.writeUInt32LE(192000, 28);
  wave.writeUInt16LE(4, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) wave.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), 44 + i * 4 + c * 2);
  return wave;
}

// Produce a reviewable copy. The shipped manifest and existing projects are untouched.
const root = resolve(import.meta.dirname, '..'), source = join(root, 'apps/studio/resources/practice');
const evidence = join(root, 'test-results/latest/practice-mastering'), candidate = join(evidence, 'candidate-practice');
const tools = await prepareMediaTools(), { ffmpeg } = mediaExecutables(tools);
await mkdir(evidence, { recursive: true });
const closure = await practiceDistributionFiles(source), manifest = structuredClone(closure.manifest), rows = [], comparisons = [[], []];
for (const path of closure.files.filter(path => !manifest.music.includes(path))) {
  const target = join(candidate, path); await mkdir(dirname(target), { recursive: true }); await copyFile(join(source, path), target);
}
const measure = async path => {
  const result = await runProcess(ffmpeg, ['-hide_banner', '-nostdin', '-i', path, '-af', 'loudnorm=I=-18:TP=-1.5:LRA=20:print_format=json', '-f', 'null', 'NUL']);
  const raw = result.stderr.slice(result.stderr.lastIndexOf('{'), result.stderr.lastIndexOf('}') + 1);
  const data = JSON.parse(raw); return { lufs: Number(data.input_i), truePeakDbtp: Number(data.input_tp), lra: Number(data.input_lra) };
};
for (const [index, filename] of manifest.music.entries()) {
  const name = `spring-0${index + 1}`;
  const input = filename.endsWith('.wav') ? join(source, filename) : join(root, 'assets/generated/practice/music/originals', `${name}.wav`);
  const bytes = execFileSync(ffmpeg, ['-v', 'error', '-i', input, '-f', 'f32le', '-ac', '2', '-ar', '48000', 'pipe:1'], { windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
  const frames = bytes.length / 8, channels = [new Float32Array(frames), new Float32Array(frames)];
  for (let i = 0; i < frames; i++) { channels[0][i] = bytes.readFloatLE(i * 8); channels[1][i] = bytes.readFloatLE(i * 8 + 4); }
  const originals = channels.map(channel => channel.slice(0, 6 * 48000));
  const mastering = masterMusic(channels, 48000);
  const master = join(evidence, 'masters', `${name}.wav`), opus = join(candidate, 'music', `${name}.opus`);
  await mkdir(dirname(master), { recursive: true }); await mkdir(dirname(opus), { recursive: true });
  await writeFile(master, pcmWave(channels));
  await runProcess(ffmpeg, ['-hide_banner', '-nostdin', '-y', '-i', master, '-c:a', 'libopus', '-b:a', '128k', '-vbr', 'off', opus]);
  const [before, after, compressed, probe] = await Promise.all([measure(input), measure(master), measure(opus), probeMedia(tools, opus)]);
  const sourceData = JSON.parse(await readFile(join(source, `sources/music/${name}.production.json`), 'utf8'));
  const metadata = sourceData.artifact.metadata;
  sourceData.artifact = { ...sourceData.artifact, localPath: opus, mime: 'audio/opus', bytes: (await stat(opus)).size,
    metadata: { ...metadata, durationSeconds: frames / 48000, sampleRate: 48000, peak: mastering.peak, mastering,
      playbackEncoding: { format: 'opus', bitrateKbps: 128 }, loop: metadata.loop } };
  await writeFile(join(candidate, `sources/music/${name}.production.json`), JSON.stringify(sourceData, null, 2) + '\n');
  manifest.music[index] = `music/${name}.opus`;
  const row = { name, frames, original: input, master, opus, mastering, before, after, compressed,
    originalBytes: (await stat(input)).size, opusBytes: (await stat(opus)).size, codec: probe.streams.find(stream => stream.codec_type === 'audio').codec_name };
  rows.push(row);
  for (let c = 0; c < 2; c++) comparisons[c].push(originals[c], new Float32Array(48000), channels[c].slice(0, 6 * 48000), new Float32Array(48000));
  console.log(JSON.stringify({ name, before, after, compressed, originalBytes: row.originalBytes, opusBytes: row.opusBytes }));
  if (Math.abs(after.lufs + 18) > .3 || Math.abs(compressed.lufs + 18) > .3 || compressed.truePeakDbtp > -1.5 || row.codec !== 'opus') throw new Error(`${name}: mastering acceptance failed`);
}
await writeFile(join(candidate, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const merged = comparisons.map(parts => { const channel = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { channel.set(part, offset); offset += part.length; } return channel; });
const comparison = join(evidence, 'comparison.wav');
await writeFile(comparison, pcmWave(merged));
await runProcess(ffmpeg, ['-hide_banner', '-nostdin', '-y', '-i', comparison, '-c:a', 'libmp3lame', '-b:a', '192k', join(evidence, 'comparison.mp3')]);
const packaged = await practiceDistributionFiles(candidate);
const size = async (directory, paths) => (await Promise.all(paths.map(path => stat(join(directory, path))))).reduce((sum, item) => sum + item.size, 0);
const report = { executedAt: new Date().toISOString(), target: 'five original sample tracks; shared PCM mastering and Opus128 candidate', rows,
  originalDistributionBytes: await size(source, closure.files), candidateDistributionBytes: await size(candidate, packaged.files),
  comparison: 'Each track: original 6s, silence 1s, mastered 6s, silence 1s; tracks 01 through 05.', humanListening: 'notExecuted', shippedManifestChanged: false };
await writeFile(join(evidence, 'audio-report.json'), JSON.stringify(report, null, 2) + '\n');
