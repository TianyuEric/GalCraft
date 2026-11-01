import { parentPort, workerData } from 'node:worker_threads';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { audioToWav } from 'spessasynth_core';
import { readSoundBank } from './catalog.js';
import { parseMusicScore, pluginId, scoreDocumentKey } from './score.js';
import { renderMusicPCM } from './render-core.js';
const input = workerData as { score: unknown; soundbankUrl: string; descriptor: unknown; directory: string; requestId: string };
try {
  const parsed = parseMusicScore(input.score); if (!parsed.ok) throw new Error(parsed.issues.map(issue => issue.message).join('\n'));
  const score = parsed.value, raw = await readFile(new URL(input.soundbankUrl));
  const { bank, instruments } = await readSoundBank(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const rendered = renderMusicPCM(score, bank, instruments, (completed, total) => parentPort?.postMessage({ kind: 'progress', completed, total }));
  const wave = new Uint8Array(audioToWav(rendered.channels, score.render.sampleRate, { normalizeAudio: false }));
  const localPath = join(input.directory, 'composition.wav');
  await writeFile(`${localPath}.part`, wave); await rename(`${localPath}.part`, localPath);
  parentPort?.postMessage({ kind: 'output', artifact: { kind: 'audio', localPath, mime: 'audio/wav', bytes: wave.byteLength, port: 'audio', groupId: input.requestId, role: 'primary', background: null,
    metadata: { durationSeconds: rendered.durationSeconds, sampleRate: score.render.sampleRate, channels: 2, loop: rendered.loop, peak: rendered.peak,
      mastering: rendered.mastering, playbackEncoding: { format: 'opus', bitrateKbps: 128 },
      musicSource: { pluginId, pluginVersion: '0.1.0', operationVersion: 1, score, soundbank: input.descriptor, events: rendered.events },
      authorDocument: { pluginId, contributionKey: scoreDocumentKey, stateVersion: 1, data: { score }, name: score.title } } } });
} catch (error) { parentPort?.postMessage({ kind: 'failure', message: error instanceof Error ? error.message : String(error) }); }
