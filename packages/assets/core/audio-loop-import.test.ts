import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@galcraft/contracts';
import { probeMedia } from '@galcraft/media-tools/process';
import { createAssetIndex } from './catalog.js';
import { ImportCoordinator, inspectFile } from './import.js';

vi.mock('@galcraft/media-tools/process', () => ({ probeMedia: vi.fn() }));

const root = resolve(import.meta.dirname, '../../../tmp/testing', `audio-loop-import-${process.pid}-${randomUUID()}`);
const rate = 48000;
const duration = 640000 / rate;
afterEach(async () => { await rm(root, { recursive: true, force: true }); vi.resetAllMocks(); });

async function wave(frames = 640000, exactTiming = true) {
  await mkdir(root, { recursive: true });
  const file = join(root, 'fractional.wav'), bytes = Buffer.alloc(44 + frames * 4);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 4, 28); bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(frames * 4, 40);
  await writeFile(file, bytes);
  vi.mocked(probeMedia).mockResolvedValue({ format: { format_name: 'wav', duration: (frames / rate).toFixed(6) },
    streams: [{ codec_type: 'audio', codec_name: 'pcm_s16le', sample_rate: String(rate), channels: 2,
      duration: (frames / rate).toFixed(6), ...(exactTiming ? { duration_ts: frames, time_base: `1/${rate}` } : {}) }] });
  return file;
}

async function importLoop(file: string, startSec: number, endSec: number) {
  const index = createAssetIndex(randomUUID()), importer = new ImportCoordinator(join(root, 'project'), '', () => index);
  const [item] = await importer.importBatch({ projectId: randomUUID(), files: [file], folder: [], conflict: 'keepBoth',
    usage: 'audio', targetBinding: null, fileAudioPlayback: [{ loop: { startSec, endSec, tail: 'wrap' } }] });
  return { importer, result: item!.result };
}

function importedMetadata({ importer, result }: Awaited<ReturnType<typeof importLoop>>) {
  if (!result.ok) throw new Error(result.error.message);
  const edit = importer.prepareIndexEdit([result.value.preparationId]);
  if (!edit.ok) throw new Error(edit.error.message);
  const patch = edit.value.indexPatches[0];
  if (patch?.kind !== 'json') throw new Error('Missing asset index patch');
  return (patch.changes[0]!.after as Asset[])[0]!.variants[0]!.metadata;
}

describe('fractional audio duration and loop adoption', () => {
  it('reads exact stream timestamps instead of the rounded duration string', async () => {
    const result = await inspectFile(await wave(), '');
    expect(result.ok && result.value.metadata.durationSec).toBe(duration);
  });

  it('adopts the full 72 BPM loop at 13.333333333333334 seconds', async () => {
    const metadata = importedMetadata(await importLoop(await wave(), 0, 16 * 60 / 72));
    expect(metadata.durationSec).toBe(duration);
    expect(metadata.loop).toEqual({ startSec: 0, endSec: duration, tail: 'wrap' });
  });

  it('bounds a musical endpoint to its rendered sample frame at 71 BPM', async () => {
    const musicalDuration = 16 * 60 / 71, frames = Math.round(musicalDuration * rate);
    const metadata = importedMetadata(await importLoop(await wave(frames), 0, musicalDuration));
    expect(metadata.durationSec).toBe(frames / rate);
    expect(metadata.loop?.endSec).toBe(frames / rate);
  });

  it('accepts probe decimal rounding when exact timestamp fields are unavailable', async () => {
    const metadata = importedMetadata(await importLoop(await wave(640000, false), 0, duration));
    expect(metadata.durationSec).toBe(13.333333);
    expect(metadata.loop?.endSec).toBe(metadata.durationSec);
  });

  it.each([1 / rate, 0.01])('rejects a loop extending beyond the file by %s seconds', async excess => {
    const { result } = await importLoop(await wave(), 0, duration + excess);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('AUDIO_LOOP_RANGE');
  });

  it('preserves an interior loop without changing its boundaries', async () => {
    const metadata = importedMetadata(await importLoop(await wave(), 2, 12));
    expect(metadata.loop).toEqual({ startSec: 2, endSec: 12, tail: 'wrap' });
  });
});
