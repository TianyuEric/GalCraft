import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parseMusicScore, tickToSeconds } from '../../plugins/music-composition/dist/score.js';
const run = promisify(execFile), root = resolve(import.meta.dirname, '../..'), media = join(root, 'apps/studio/resources/practice');
const evidence = join(root, 'test-results/latest/practice-audio');
const bin = join(root, 'tools/media/runtime/bin');
const ffmpeg = join(bin, 'ffmpeg.exe'), ffprobe = join(bin, 'ffprobe.exe');
const records = [];
const manifest = JSON.parse(await readFile(join(media, 'manifest.json'), 'utf8'));
const files = [...manifest.music, ...Object.values(manifest.effects)];
function rms(samples, start, end, channels = 2) { let sum = 0; for (let i = start; i < end; i++) sum += samples[i] ** 2; return Math.sqrt(sum / (end - start)); }
await mkdir(evidence, { recursive: true });
for (const file of files) {
  const path = join(media, file);
  const probe = JSON.parse((await run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { maxBuffer: 1024 * 1024, windowsHide: true })).stdout);
  const decoded = (await run(ffmpeg, ['-v', 'error', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', '48000', 'pipe:1'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, windowsHide: true })).stdout;
  const samples = new Float32Array(decoded.buffer, decoded.byteOffset, decoded.byteLength / 4);
  let peak = 0, finite = true, sum = 0;
  for (const sample of samples) { if (!Number.isFinite(sample)) finite = false; peak = Math.max(peak, Math.abs(sample)); sum += sample * sample; }
  const channels = 2, rate = 48000, frames = samples.length / channels, seconds = frames / rate;
  const boundaryDeltas = [samples[0] - samples.at(-2), samples[1] - samples.at(-1)];
  const nearBoundaryMaxDelta = Math.max(...Array.from({ length: 960 }, (_, i) => Math.abs(samples[(i + 1) * 2] - samples[i * 2])), ...Array.from({ length: 960 }, (_, i) => Math.abs(samples[samples.length - (i + 1) * 2] - samples[samples.length - (i + 2) * 2])));
  const record = { file, codec: probe.streams[0].codec_name, sourceSampleRate: Number(probe.streams[0].sample_rate), sourceChannels: probe.streams[0].channels, durationSeconds: seconds, finite, peak, rms: Math.sqrt(sum / samples.length), peakDbfs: 20 * Math.log10(peak), boundaryDeltas, nearBoundaryMaxDelta, first50msRms: rms(samples, 0, 4800), last50msRms: rms(samples, samples.length - 4800, samples.length), result: 'passed', humanListening: 'pending; decode and numerical boundary checks do not establish perceived musical or voice quality' };
  if (!finite || peak === 0 || peak > 1) throw new Error(JSON.stringify(record));
  if (file.startsWith('music/')) {
    if (record.sourceSampleRate !== 48000 || record.sourceChannels !== 2 || seconds < 85 || seconds > 95) throw new Error('Music format/duration mismatch ' + file);
    const key = file.split('/')[1].replace(/\.[^.]+$/, ''), source = JSON.parse(await readFile(join(media, `sources/music/${key}.score.json`), 'utf8'));
    const parsed = parseMusicScore(source); if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    const production = JSON.parse(await readFile(join(media, `sources/music/${key}.production.json`), 'utf8'));
    if (JSON.stringify(production.input.fields.score) !== JSON.stringify(source) || JSON.stringify(production.artifact.metadata.musicSource.score) !== JSON.stringify(source)) throw new Error('Frozen task / artifact / editable source differ: ' + key);
    const expected = tickToSeconds(source, source.durationTicks); if (Math.abs(seconds - expected) > 1 / rate) throw new Error('Score duration mismatch');
    record.score = { title: source.title, segments: source.segments.length, tracks: source.tracks.length, notes: source.tracks.reduce((sum, track) => sum + track.notes.length, 0), loop: source.loop, expectedSeconds: expected, eventsAtBeginning: source.tracks.flatMap(track => track.notes).filter(note => note.startTick === 0).length, taskId: production.taskId, candidateId: production.candidateId, frozenSourceMatches: true };
    const preview = join(evidence, `${key}-loop-join.wav`);
    await run(ffmpeg, ['-y', '-v', 'error', '-sseof', '-3', '-i', path, '-t', '3', '-i', path, '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[a]', '-map', '[a]', '-ar', '48000', '-ac', '2', preview], { windowsHide: true }); record.loopAudition = preview;
  }
  if (file.includes('projector-bell')) { record.seconds5to6Rms = rms(samples, 5 * rate * 2, 6 * rate * 2); if (record.seconds5to6Rms < .004) throw new Error('Bell tail too quiet for independent-stop demonstration'); }
  records.push(record);
}
const mixReference = join(evidence, 'mix-independent-stop-reference.wav');
await run(ffmpeg, ['-y', '-v', 'error', '-i', join(media, manifest.music[3]), '-i', join(media, 'audio/spring-rain-loop.wav'), '-i', join(media, 'audio/spring-projector-bell.wav'), '-filter_complex', '[0:a]atrim=duration=10,volume=0.65[b];[1:a]atrim=duration=2.5,volume=0.15,apad=whole_dur=10[r];[2:a]volume=0.5,adelay=1000|1000,apad=whole_dur=10[s];[b][r][s]amix=inputs=3:duration=first:normalize=0[a]', '-map', '[a]', '-ar', '48000', '-ac', '2', mixReference], { windowsHide: true });
const report = { date: new Date().toISOString(), environment: 'Windows; real M10 exact plugin 0.1.0 artifacts; FFmpeg/FFprobe n9.0.2 decode; original source MusicScore validation', target: 'DEM-M / DEM-V1 / DEM-09 / DEM-10 media delivery', expected: 'Five ~90s 48kHz stereo score-linked Opus128; one periodic rain ambience loop; one 7.2s bell with remaining audible energy at 5s', actual: records, mixReference: { path: mixReference, purpose: 'Audition material levels and the intended sequence; actual Player soundId handling is a separate integration acceptance', timelineSeconds: { bgmStart: 0, rainStart: 0, bellStart: 1, rainStop: 2.5, bellNaturalEnd: 8.2, bgmContinueTo: 10 }, volumes: { bgm: .65, rain: .15, bell: .5 } }, result: 'media checks passed; human listening and selected voice transcript verification pending', limitations: ['Subjective listening is recorded separately from numerical checks.', 'Current Japanese voice provenance follows sources/voice/adopted-ja/license-provenance.json.', 'Source validity and waveform measurements do not certify auditory quality.'] };
await writeFile(join(evidence, 'audio-measurements.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(records.map(({ file, durationSeconds, peakDbfs, rms, seconds5to6Rms }) => ({ file, durationSeconds, peakDbfs, rms, seconds5to6Rms })), null, 2));
