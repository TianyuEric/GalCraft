import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type { Asset } from '@galcraft/contracts';
import { mediaExecutables, probeMedia, runProcess } from '@galcraft/media-tools/process';
import { ProjectSession } from '@galcraft/documents';
import { AssetCatalog, createAssetIndex } from '../core/catalog.js';
import { ImportCoordinator } from '../core/import.js';
import { fail } from '../core/result.js';
import { commitPreparedAsset } from './commit.js';
import { ImageVariantProcessor, shouldRemove } from './image.js';
import { MediaVariantProcessor, audioPlan, audioPlaybackForVariant, inspectCompatibility, planTargetPlayback } from './media.js';
import { EditableMask, alignCanvas, composeAlpha, inspectAlpha } from './mask.js';

const directory = join(process.cwd(), '..', '..', 'tmp', 'testing', `q-processing-${process.pid}`);
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

function indexWithAsset() {
  const index = createAssetIndex(randomUUID());
  const assetId = randomUUID();
  const variantId = randomUUID();
  const asset: Asset = { id: assetId, revision: 1, name: '白衣.png', kind: 'image', folder: [], tags: [], locales: [],
    characterId: null, sceneIds: [], groupId: null, originalVariantId: variantId, activeVariantId: variantId,
    variants: [{ id: variantId, parentId: null, role: 'original', files: [{ path: 'source.png', bytes: 1, mime: 'image/png', role: 'entry' }],
      entry: 'source.png', metadata: { width: 2, height: 1, hasAlpha: true },
      canvas: { width: 2, height: 1, offsetX: 0, offsetY: 0 }, processing: null,
      targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null }],
    sourceName: '白衣.png', source: { kind: 'import', description: 'local', usage: 'localReview' },
    createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() };
  index.data.assets.push(asset);
  return { index, assetId, variantId };
}

describe('media plans', () => {
  it('saves the committed asset while retaining an independent change in the same index', async () => {
    const { index, assetId } = indexWithAsset(), second = indexWithAsset().index.data.assets[0]!;
    index.data.assets.push(second);
    const project = join(directory, 'selective-commit'), projectId = randomUUID();
    const session = await ProjectSession.createProject(project, projectId, [{ documentId: index.documentId,
      revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
    const readIndex = () => JSON.parse(session.readDocument(index.documentId)!.files['assets/index.json']!) as typeof index;
    const independent = new AssetCatalog(readIndex()).planMetadata([second.id], value => ({ ...value, name: '保留未保存' }));
    if (!independent.ok) throw new Error(independent.error.message);
    const planned = session.planEdit({ label: '独立素材编辑', origin: 'field', expected: independent.value.expected,
      patches: independent.value.indexPatches, preparedAssets: [], requiredRefs: [] });
    if (!planned.ok) throw new Error(planned.error.message);
    expect(session.applyEdit(planned.value.planId, independent.value.expected).ok).toBe(true);
    const edit = planTargetPlayback(readIndex(), assetId, index.data.assets[0]!.activeVariantId, 'windows', 'direct');
    if (!edit.ok) throw new Error(edit.error.message);
    const committed = await commitPreparedAsset(session, edit.value, { label: '确认素材播放', onApplied: () => {}, onRejected: async () => {} });
    expect(committed.ok).toBe(true);
    const saved = JSON.parse(await readFile(join(project, 'assets/index.json'), 'utf8')) as typeof index;
    expect(saved.data.assets[0]!.variants[0]!.targets.windows).toBe('direct');
    expect(saved.data.assets[1]!.name).toBe(second.name);
    expect(readIndex().data.assets[1]!.name).toBe('保留未保存');
    expect(session.readDocument(index.documentId)!.dirty).toBe(true);
    await session.dispose('discard');
  });

  it('validates trim, fades and source-time loops before processing', () => {
    const base = { kind: 'audio' as const, startSec: 10, endSec: 50, gainDb: 0.5,
      fadeInMs: 2000, fadeOutMs: 3000, loopStartSec: 15, loopEndSec: 45 };
    const plan = audioPlan(base, 60);
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.value).toMatchObject({ durationSec: 40, playback: { loopStartSec: 5, loopEndSec: 35 } });
    expect(audioPlan({ ...base, fadeOutMs: 39000 }, 60).ok).toBe(false);
    expect(audioPlan({ ...base, loopStartSec: 9 }, 60).ok).toBe(false);
  });

  it('does not mark probed codec combinations as target verified', () => {
    const direct = inspectCompatibility({ format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
      streams: [{ codec_type: 'video', codec_name: 'h264' }, { codec_type: 'audio', codec_name: 'aac' }] }, 'video');
    expect(direct.candidates.map(value => value.playback)).toEqual(['unverified', 'unverified']);
    const mkv = inspectCompatibility({ format: { format_name: 'matroska,webm' },
      streams: [{ codec_type: 'video', codec_name: 'hevc' }] }, 'video');
    expect(mkv.candidates.map(value => value.playback)).toEqual(['needsConversion', 'needsConversion']);
    const { index, assetId, variantId } = indexWithAsset();
    const planned = planTargetPlayback(index, assetId, variantId, 'windows', 'direct');
    expect(planned.ok).toBe(true);
    expect(index.data.assets[0]!.variants[0]!.targets.web).toBe('unverified');
    expect(index.data.assets[0]!.variants[0]!.targets.windows).toBe('unverified');
  });
});

const toolDirectory = process.env.GALCRAFT_MEDIA_TOOL_DIR;
describe.skipIf(!toolDirectory)('real media variants', () => {
  it('adopts a declared Opus128 playback variant atomically while retaining the WAV master and loop', async () => {
    await mkdir(directory, { recursive: true });
    const input = join(directory, 'master.wav');
    await runProcess(mediaExecutables(toolDirectory!).ffmpeg, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', input]);
    const original = await readFile(input), index = createAssetIndex(randomUUID());
    const importer = new ImportCoordinator(directory, toolDirectory!, () => index);
    const result = await importer.importBatch({ projectId: randomUUID(), files: [input], folder: [], conflict: 'keepBoth', usage: 'audio', targetBinding: null,
      fileAudioPlayback: [{ loop: { startSec: 0, endSec: 2, tail: 'wrap' }, encoding: { format: 'opus', bitrateKbps: 128 } }] });
    const row = result[0]!.result; expect(row.ok).toBe(true); if (!row.ok) throw new Error(row.error.message);
    expect(index.data.assets).toEqual([]);
    const prepared = importer.prepareIndexEdit([row.value.preparationId]); if (!prepared.ok) throw new Error(prepared.error.message);
    const patch = prepared.value.indexPatches.find(patch => patch.kind === 'json');
    if (!patch || patch.kind !== 'json') throw new Error('Expected an asset index edit');
    const asset = patch.changes.find(change => Array.isArray(change.after))!.after as unknown as Asset[];
    expect(asset[0]!.variants).toHaveLength(2);
    const playback = asset[0]!.variants.find(variant => variant.id === asset[0]!.activeVariantId)!;
    expect(playback.entry).toBe('audio.opus'); expect(playback.parentId).toBe(asset[0]!.originalVariantId);
    expect(playback.metadata.loop).toEqual({ startSec: 0, endSec: 2, tail: 'wrap' });
    expect(playback.processing?.settings).toMatchObject({ codec: 'opus', bitrateKbps: 128 });
    expect(await readFile(input)).toEqual(original);
      const replacement = await importer.importBatch({ projectId: randomUUID(), files: [input], folder: [], conflict: 'replace', usage: 'audio', targetBinding: null,
        fileAudioPlayback: [{ loop: { startSec: 0, endSec: 2, tail: 'wrap' }, encoding: { format: 'opus', bitrateKbps: 128 } }] });
      const replaced = replacement[0]!.result; if (!replaced.ok) throw new Error(replaced.error.message);
      const replacementEdit = importer.prepareIndexEdit([replaced.value.preparationId]); if (!replacementEdit.ok) throw new Error(replacementEdit.error.message);
      const replacementPatch = replacementEdit.value.indexPatches.find(patch => patch.kind === 'json');
      if (!replacementPatch || replacementPatch.kind !== 'json') throw new Error('Expected replacement index edit');
      const replacementAssets = replacementPatch.changes.find(change => Array.isArray(change.after))!.after as unknown as Asset[];
      expect(replacementAssets[0]!.variants.find(variant => variant.id === replacementAssets[0]!.activeVariantId)?.entry).toBe('audio.opus');
    const cancelled = await importer.importBatch({ projectId: randomUUID(), files: [input], folder: [], conflict: 'keepBoth', usage: 'audio', targetBinding: null,
      fileAudioPlayback: [{ loop: { startSec: 0, endSec: 3, tail: 'wrap' }, encoding: { format: 'opus', bitrateKbps: 128 } }] });
    expect(cancelled[0]!.result.ok).toBe(false); expect(index.data.assets).toEqual([]);
  });
  it('creates immutable audio and video candidates with verified codecs but unverified target playback', async () => {
    const tools = mediaExecutables(toolDirectory!);
    const index = createAssetIndex(randomUUID());
    const makeAsset = async (kind: 'audio' | 'video', filename: string, args: string[]) => {
      const assetId = randomUUID();
      const variantId = randomUUID();
      const input = join(directory, 'assets', 'files', assetId, variantId, filename);
      await mkdir(join(directory, 'assets', 'files', assetId, variantId), { recursive: true });
      await runProcess(tools.ffmpeg, [...args, input]);
      const asset: Asset = { id: assetId, revision: 1, name: filename, kind, folder: [], tags: [], locales: [],
        characterId: null, sceneIds: [], groupId: null, originalVariantId: variantId, activeVariantId: variantId,
        variants: [{ id: variantId, parentId: null, role: 'original', files: [{ path: filename, bytes: (await stat(input)).size,
          mime: kind === 'audio' ? 'audio/wav' : 'video/x-matroska', role: 'entry' }], entry: filename, metadata: {}, canvas: null,
          processing: null, targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null }],
        sourceName: filename, source: { kind: 'import', description: 'local', usage: 'localReview' },
        createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() };
      index.data.assets.push(asset);
      return { assetId, variantId, input };
    };
    const audio = await makeAsset('audio', '中文 源.wav', ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'pcm_s16le']);
    const video = await makeAsset('video', '中文 源.mkv', ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=10:duration=1', '-c:v', 'mpeg4']);
    const processor = new MediaVariantProcessor(directory, toolDirectory!, () => index, 'ffmpeg-n9.0.2');
    const abort = new AbortController();
    abort.abort();
    const cancelled = await processor.prepareAudio(audio.assetId, audio.variantId,
      { kind: 'audio', startSec: 0.5, endSec: 1.5, gainDb: 0, fadeInMs: 0, fadeOutMs: 0,
        loopStartSec: null, loopEndSec: null }, 'wav', abort.signal);
    expect(cancelled).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(index.data.assets[0]!.variants).toHaveLength(1);
    const trimmed = await processor.prepareAudio(audio.assetId, audio.variantId,
      { kind: 'audio', startSec: 0.5, endSec: 1.5, gainDb: 0.5, fadeInMs: 100, fadeOutMs: 100,
        loopStartSec: 0.75, loopEndSec: 1.25 }, 'wav');
    expect(trimmed).toMatchObject({ ok: true });
    if (!trimmed.ok) return;
    expect(trimmed.value.playback).toEqual({ loopStartSec: 0.25, loopEndSec: 0.75 });
    expect((await processor.prepareIndexEdit(trimmed.value.preparationId, true)).ok).toBe(true);
    expect(index.data.assets[0]!.activeVariantId).toBe(audio.variantId);
    const audioOutput = join(directory, 'assets', 'files', audio.assetId, trimmed.value.variantId, 'audio.wav');
    expect((await probeMedia(toolDirectory!, audioOutput)).streams?.[0]?.codec_name).toBe('pcm_s16le');
    expect(audioPlaybackForVariant(trimmed.value.variant)).toMatchObject({ ok: true,
      value: { loopStartSec: 0.25, loopEndSec: 0.75 } });
    const converted = await processor.prepareVideo(video.assetId, video.variantId);
    expect(converted).toMatchObject({ ok: true });
    if (!converted.ok) return;
    expect((await processor.prepareIndexEdit(converted.value.preparationId, true)).ok).toBe(true);
    expect(converted.value.variant.targets).toEqual({ web: 'unverified', windows: 'unverified' });
    expect((await stat(audio.input)).size).toBeGreaterThan(0);
    expect((await stat(video.input)).size).toBeGreaterThan(0);
  });

  it('commits a trimmed audio variant and restores the same loop points after reopening M02', async () => {
    const project = join(directory, 'audio-project');
    const projectId = randomUUID();
    const documentId = randomUUID();
    const assetId = randomUUID();
    const sourceVariantId = randomUUID();
    const index = createAssetIndex(documentId);
    const now = new Date().toISOString();
    index.data.assets.push({ id: assetId, revision: 1, name: '语音.wav', kind: 'audio', folder: [], tags: [], locales: [],
      characterId: null, sceneIds: [], groupId: null, originalVariantId: sourceVariantId, activeVariantId: sourceVariantId,
      variants: [{ id: sourceVariantId, parentId: null, role: 'original', files: [{ path: 'source.wav', bytes: 1, mime: 'audio/wav', role: 'entry' }],
        entry: 'source.wav', metadata: { durationSec: 2 }, canvas: null, processing: null,
        targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null }],
      sourceName: '语音.wav', source: { kind: 'import', description: 'local', usage: 'localReview' },
      createdAt: now, modifiedAt: now });
    const session = await ProjectSession.createProject(project, projectId, [{ documentId, revision: 1,
      format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
    const sourceDirectory = join(project, 'assets', 'files', assetId, sourceVariantId);
    await mkdir(sourceDirectory, { recursive: true });
    await runProcess(mediaExecutables(toolDirectory!).ffmpeg,
      ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'pcm_s16le', join(sourceDirectory, 'source.wav')]);
    const readIndex = () => JSON.parse(session.readDocument(documentId)!.files['assets/index.json']!) as typeof index;
    const processor = new MediaVariantProcessor(project, toolDirectory!, readIndex, 'ffmpeg-n9.0.2');
    const prepared = await processor.prepareAudio(assetId, sourceVariantId,
      { kind: 'audio', startSec: 0.5, endSec: 1.5, gainDb: 0.5, fadeInMs: 100, fadeOutMs: 100,
        loopStartSec: 0.75, loopEndSec: 1.25 }, 'wav');
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const edit = await processor.prepareIndexEdit(prepared.value.preparationId, true);
    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    const committed = await commitPreparedAsset(session, edit.value, {
      label: '整理配音', onApplied: () => processor.confirm(prepared.value.preparationId),
      onRejected: () => processor.discard(prepared.value.preparationId),
    });
    expect(committed.ok).toBe(true);
    await session.dispose('saved');
    const reopened = await ProjectSession.open(project, projectId);
    const saved = JSON.parse(reopened.readDocument(documentId)!.files['assets/index.json']!) as typeof index;
    const variant = saved.data.assets[0]!.variants.find(value => value.id === prepared.value.variantId)!;
    expect(saved.data.assets[0]!.activeVariantId).toBe(prepared.value.variantId);
    expect(audioPlaybackForVariant(variant)).toMatchObject({ ok: true,
      value: { loopStartSec: 0.25, loopEndSec: 0.75 } });
    expect((await probeMedia(toolDirectory!, join(project, 'assets', 'files', assetId, variant.id, variant.entry))).streams?.[0]?.codec_name)
      .toBe('pcm_s16le');
    await reopened.dispose('saved');
  });
});

describe('mask and image variants', () => {
  it('supports one-stroke undo and stable foot placement', () => {
    const mask = new EditableMask(2, 1, Uint8Array.from([0, 255]));
    mask.apply({ x: 0, y: 0, radius: 0.5, weight: 1, mode: 'keep' });
    expect([...mask.values]).toEqual([255, 255]);
    expect(mask.undo()).toBe(true);
    expect([...mask.values]).toEqual([0, 255]);
    expect(alignCanvas({ width: 100, height: 100, offsetX: 0, offsetY: 0 },
      { width: 20, height: 30, footX: 10, footY: 30 }, { x: 50, y: 90 })).toMatchObject({ placeX: 40, placeY: 60 });
  });

  it('keeps original and mask while refinement of transparent alpha does not square it', async () => {
    const { index, assetId, variantId } = indexWithAsset();
    const source = join(directory, 'assets', 'files', assetId, variantId, 'source.png');
    await mkdir(join(directory, 'assets', 'files', assetId, variantId), { recursive: true });
    await sharp(Buffer.from([255, 255, 255, 128, 10, 20, 30, 255]),
      { raw: { width: 2, height: 1, channels: 4 } }).png().toFile(source);
    const processImage = new ImageVariantProcessor(directory, () => index);
    const disabled = await processImage.prepareMatting(assetId, variantId,
      { enabled: false, provider: 'node', connectionId: null, workflowBindingId: null }, 'unknown');
    expect(disabled).toMatchObject({ ok: true, value: { status: 'unchanged', prepared: null } });
    expect(shouldRemove({ enabled: true, provider: 'comfy', connectionId: null, workflowBindingId: null },
      await inspectAlpha(source), 'removed')).toBe('reuse');
    const selected = { enabled: true, provider: 'node' as const, connectionId: null, workflowBindingId: null };
    expect(shouldRemove(selected, { width: 2, height: 1, hasAlpha: true, hasTransparency: false,
      hasVisibleForeground: true, alphaMin: 255, alphaMax: 255 }, 'removed')).toBe('run');
    expect(shouldRemove(selected, { width: 2, height: 1, hasAlpha: true, hasTransparency: true,
      hasVisibleForeground: false, alphaMin: 0, alphaMax: 0 }, 'removed')).toBe('review');
    const prepared = await processImage.prepareRefinement(assetId, variantId, Uint8Array.from([128, 0]), 0, 0);
    if (!prepared.ok) throw new Error(prepared.error.message);
    expect(prepared).toMatchObject({ ok: true });
    if (!prepared.ok) return;
    const patch = processImage.prepareIndexEdit(prepared.value.preparationId, true);
    expect(patch.ok).toBe(true);
    const transparent = join(directory, 'assets', 'files', assetId, prepared.value.transparentVariantId, 'transparent.png');
    const pixels = await sharp(transparent).raw().toBuffer();
    expect([pixels[3], pixels[7]]).toEqual([64, 0]);
    expect((await stat(source)).size).toBeGreaterThan(0);
    expect((await readFile(source)).equals(await composeAlpha(source, Uint8Array.from([255, 255]), 'original'))).toBe(true);
    const transparentIndex = structuredClone(index);
    transparentIndex.data.assets[0]!.variants.push(prepared.value.transparent);
    const second = new ImageVariantProcessor(directory, () => transparentIndex);
    const refined = await second.prepareRefinement(assetId, prepared.value.transparentVariantId, Uint8Array.from([128, 0]), 0, 0);
    expect(refined.ok).toBe(true);
    if (!refined.ok) return;
    const refinedPixels = await sharp(join(directory, 'assets', 'files', assetId, refined.value.transparentVariantId, 'transparent.png')).raw().toBuffer();
    expect(refinedPixels[3]).toBe(128);
    const aligned = await processImage.prepareAligned(assetId, variantId,
      { width: 4, height: 3, offsetX: 0, offsetY: 0 }, { x: 1, y: 1 }, { x: 2, y: 3 });
    expect(aligned).toMatchObject({ ok: true });
    if (!aligned.ok) return;
    expect((processImage.prepareAlignmentIndexEdit(aligned.value.preparationId, false)).ok).toBe(true);
    const alignedPath = join(directory, 'assets', 'files', assetId, aligned.value.variantId, 'aligned.png');
    expect((await sharp(alignedPath).metadata()).width).toBe(4);
    expect((await sharp(alignedPath).metadata()).height).toBe(3);
  });

  it('accepts the H Result port and saves the prepared mask pair through M02', async () => {
    const { index, assetId, variantId } = indexWithAsset();
    const projectId = randomUUID();
    const project = join(directory, 'project');
    const session = await ProjectSession.createProject(project, projectId, [{ documentId: index.documentId,
      revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }]);
    const sourceDirectory = join(project, 'assets', 'files', assetId, variantId);
    await mkdir(sourceDirectory, { recursive: true });
    const source = join(sourceDirectory, 'source.png');
    await sharp(Buffer.from([255, 255, 255, 255, 20, 30, 40, 255]),
      { raw: { width: 2, height: 1, channels: 4 } }).png().toFile(source);
    const readIndex = () => JSON.parse(session.readDocument(index.documentId)!.files['assets/index.json']!) as typeof index;
    const processor = new ImageVariantProcessor(project, readIndex);
    const failedPort = await processor.prepareMatting(assetId, variantId,
      { enabled: true, provider: 'node', connectionId: null, workflowBindingId: null }, 'unchanged',
      async () => fail('WORKER_EXIT', '工具进程退出'));
    expect(failedPort).toMatchObject({ ok: false, error: { code: 'WORKER_EXIT' } });
    expect(readIndex().data.assets[0]!.variants).toHaveLength(1);
    const prepared = await processor.prepareMatting(assetId, variantId,
      { enabled: true, provider: 'node', connectionId: null, workflowBindingId: null }, 'unchanged',
      async input => {
        await mkdir(input.outputDirectory, { recursive: true });
        const imagePath = join(input.outputDirectory, 'transparent.png');
        await sharp(Buffer.from([255, 255, 255, 0, 20, 30, 40, 255]),
          { raw: { width: 2, height: 1, channels: 4 } }).png().toFile(imagePath);
        return { ok: true, value: { imagePath, maskPath: null, width: 2, height: 1,
          result: { declared: 'removed', hasAlpha: true, hasTransparency: true },
          provider: 'node', providerVersion: '0.1.0', modelVersion: 'v1' }, warnings: [] };
      });
    expect(prepared).toMatchObject({ ok: true, value: { status: 'prepared' } });
    if (!prepared.ok || !prepared.value.prepared) return;
    const edit = processor.prepareIndexEdit(prepared.value.prepared.preparationId, true);
    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    const committed = await commitPreparedAsset(session, edit.value, {
      label: '透明化素材', onApplied: () => processor.confirm(prepared.value.prepared!.preparationId),
      onRejected: () => processor.discard(prepared.value.prepared!.preparationId),
    });
    expect(committed.ok).toBe(true);
    expect(readIndex().data.assets[0]!.variants).toHaveLength(3);
    await session.dispose('saved');
    const reopened = await ProjectSession.open(project, projectId);
    const saved = JSON.parse(reopened.readDocument(index.documentId)!.files['assets/index.json']!) as typeof index;
    expect(saved.data.assets[0]!.activeVariantId).toBe(prepared.value.prepared.transparentVariantId);
    expect(saved.data.assets[0]!.variants[2]!.processing?.toolVersion).toBe('0.1.0+v1');
    expect((await stat(source)).size).toBeGreaterThan(0);
    await reopened.dispose('saved');
  });

  it('prepares a new asset for selected floating and exact references without changing the source asset', async () => {
    const { index, assetId, variantId } = indexWithAsset();
    const source = join(directory, 'assets', 'files', assetId, variantId, 'source.png');
    await mkdir(join(directory, 'assets', 'files', assetId, variantId), { recursive: true });
    await sharp(Buffer.from([255, 255, 255, 255, 20, 30, 40, 255]),
      { raw: { width: 2, height: 1, channels: 4 } }).png().toFile(source);
    const derivedId = randomUUID();
    const derived = join(directory, 'assets', 'files', assetId, derivedId, 'derived.png');
    await mkdir(join(directory, 'assets', 'files', assetId, derivedId), { recursive: true });
    await copyFile(source, derived);
    index.data.assets[0]!.variants.push({ ...structuredClone(index.data.assets[0]!.variants[0]!),
      id: derivedId, parentId: variantId, files: [{ path: 'derived.png', bytes: (await stat(derived)).size,
        mime: 'image/png', role: 'entry' }], entry: 'derived.png' });
    index.data.assets[0]!.activeVariantId = derivedId;
    const before = structuredClone(index.data.assets[0]!);
    const processor = new ImageVariantProcessor(directory, () => index);
    const prepared = await processor.prepareRefinement(assetId, derivedId, Uint8Array.from([0, 255]), 0, 0);
    if (!prepared.ok) throw new Error(prepared.error.message);
    const documentId = randomUUID();
    const refs = [null, derivedId].map((binding, index) => ({ assetId,
      owner: { kind: 'statement' as const, id: randomUUID() },
      source: { documentId, statementId: randomUUID(), field: `image${index}`, revision: 4 },
      usage: 'portrait', required: true, variantId: binding }));
    expect((await processor.prepareSelectedRefsIndexEdit(prepared.value.preparationId, [])).ok).toBe(false);
    expect((await processor.prepareSelectedRefsIndexEdit(prepared.value.preparationId,
      [{ ...refs[0]!, assetId: randomUUID() }])).ok).toBe(false);
    expect((await processor.prepareSelectedRefsIndexEdit(prepared.value.preparationId,
      [refs[0]!, { ...refs[0]!, variantId: derivedId }])).ok).toBe(false);
    const selected = await processor.prepareSelectedRefsIndexEdit(prepared.value.preparationId, refs);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(index.data.assets[0]).toEqual(before);
    expect(selected.value.edit.preparedAssets).toEqual([selected.value.assetId]);
    expect(selected.value.edit.requiredRefs).toEqual([]);
    expect(selected.value.edit.expected).toContainEqual({ ref: { kind: 'document', id: documentId }, revision: 4 });
    expect(selected.value.replacements.map(value => value.after)).toEqual([
      { assetId: selected.value.assetId, variantId: null },
      { assetId: selected.value.assetId, variantId: selected.value.variantId },
    ]);
    const assets = selected.value.edit.indexPatches[0]!.kind === 'json'
      ? selected.value.edit.indexPatches[0]!.changes[0]!.after as Asset[] : [];
    expect(assets[0]).toEqual(before);
    const copied = assets.find(asset => asset.id === selected.value.assetId)!;
    expect(copied.activeVariantId).toBe(selected.value.variantId);
    expect(copied.variants).toHaveLength(4);
    const transparent = copied.variants.find(variant => variant.id === selected.value.variantId)!;
    expect(transparent.processing?.inputVariantId).toBe(transparent.parentId);
    expect(copied.variants.find(variant => variant.id === transparent.parentId)?.parentId).toBe(copied.originalVariantId);
    expect(transparent.processing?.settings).toMatchObject({ maskVariantId: copied.variants.find(variant => variant.role === 'mask')!.id });
    for (const file of selected.value.files)
      expect((await stat(join(directory, ...file.split('/')))).size).toBeGreaterThan(0);
    expect((await stat(source)).size).toBeGreaterThan(0);
    const binding = { schemaVersion: 1, documentId, revision: 4,
      data: { refs: refs.map(ref => ({ assetId: ref.assetId, variantId: ref.variantId })) } };
    const project = join(directory, 'selected-m02');
    const session = await ProjectSession.createProject(project, randomUUID(), [
      { documentId: index.documentId, revision: index.revision, format: 'json',
        files: { 'assets/index.json': JSON.stringify(index) } },
      { documentId, revision: 4, format: 'json', files: { 'bindings.json': JSON.stringify(binding) } },
    ]);
    const patches = [...selected.value.edit.indexPatches,
      { kind: 'json' as const, documentId, changes: selected.value.replacements.flatMap((replacement, position) => [
        { path: `/data/refs/${position}/assetId`, before: replacement.before.assetId,
          after: replacement.after.assetId, op: 'set' as const },
        { path: `/data/refs/${position}/variantId`, before: replacement.before.variantId,
          after: replacement.after.variantId, op: 'set' as const },
      ]) }];
    const plan = session.planEdit({ label: '仅所选引用采用透明图', origin: 'batch',
      expected: selected.value.edit.expected, patches,
      preparedAssets: selected.value.edit.preparedAssets, requiredRefs: selected.value.edit.requiredRefs });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.error.message);
    const applied = session.applyEdit(plan.value.planId, selected.value.edit.expected);
    expect(applied.ok).toBe(true);
    const savedBinding = JSON.parse(session.readDocument(documentId)!.files['bindings.json']!) as typeof binding;
    expect(savedBinding.data.refs).toEqual(selected.value.replacements.map(value => value.after));
    const savedIndex = JSON.parse(session.readDocument(index.documentId)!.files['assets/index.json']!) as typeof index;
    expect(savedIndex.data.assets[0]).toEqual(before);
    await session.dispose('discard');
    expect(processor.prepareIndexEdit(prepared.value.preparationId, true).ok).toBe(false);
    await processor.discard(prepared.value.preparationId);
    await expect(stat(join(directory, 'assets', 'files', selected.value.assetId))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await stat(source)).size).toBeGreaterThan(0);
  });
});
