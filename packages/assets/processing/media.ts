import { createId } from '@galcraft/contracts';

import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { Asset, AssetVariant, Id, Processing, Result, Target } from '@galcraft/contracts';
import { mediaExecutables, probeMedia, runProcess, transcodeWindowsMp4 } from '@galcraft/media-tools/process';
import { assetFilePath, indexEdit } from '../core/catalog.js';
import { fail, ok } from '../core/result.js';
import type { AssetIndex, PreparedIndexEdit } from '../core/types.js';

export type AudioEdit = Extract<Processing['settings'], { kind: 'audio' }>;
export type AudioPlayback = { loopStartSec: number | null; loopEndSec: number | null };
export type Compatibility = { container: string; videoCodec: string | null; audioCodec: string | null;
  candidates: { target: Target; playback: 'direct' | 'needsConversion' | 'unverified'; reason: string }[] };
type MediaProbe = Awaited<ReturnType<typeof probeMedia>>;
type MediaStream = NonNullable<MediaProbe['streams']>[number];

function streams(raw: MediaProbe): { video: MediaStream | undefined; audio: MediaStream | undefined } {
  return { video: raw.streams?.find(item => item.codec_type === 'video'), audio: raw.streams?.find(item => item.codec_type === 'audio') };
}

export function inspectCompatibility(raw: MediaProbe, kind: 'audio' | 'video'): Compatibility {
  const { video, audio } = streams(raw);
  const container = raw.format?.format_name ?? '';
  const directAudio = audio?.codec_name === 'mp3' || audio?.codec_name === 'pcm_s16le' && /wav/.test(container) ||
    (audio?.codec_name === 'vorbis' || audio?.codec_name === 'opus') && /ogg|opus/.test(container);
  const directVideo = video?.codec_name === 'h264' && /mp4|mov/.test(container) && (!audio || audio.codec_name === 'aac') ||
    (video?.codec_name === 'vp8' || video?.codec_name === 'vp9') && /webm/.test(container) &&
    (!audio || audio.codec_name === 'opus' || audio.codec_name === 'vorbis');
  const candidate = kind === 'audio' ? !!directAudio : !!directVideo;
  return { container, videoCodec: video?.codec_name ?? null, audioCodec: audio?.codec_name ?? null,
    candidates: (['web', 'windows'] as const).map(target => ({ target,
      playback: candidate ? 'unverified' : 'needsConversion',
      reason: candidate ? '格式候选；需在目标实际解码和播放' : '容器或编码不在约定的直接播放组合内' })) };
}

export function audioPlan(input: AudioEdit, originalDuration: number): Result<{ durationSec: number; playback: AudioPlayback; args: string[] }> {
  const { startSec, endSec, gainDb, fadeInMs, fadeOutMs, loopStartSec, loopEndSec } = input;
  if (![startSec, endSec, gainDb, fadeInMs, fadeOutMs].every(Number.isFinite) ||
      startSec < 0 || endSec <= startSec || endSec > originalDuration || fadeInMs < 0 || fadeOutMs < 0)
    return fail('AUDIO_RANGE', '裁切或淡变区间不在原件时长内');
  const durationSec = endSec - startSec;
  if (fadeInMs + fadeOutMs > durationSec * 1000) return fail('AUDIO_FADE_OVERLAP', '淡入与淡出时长之和超过裁切时长');
  if ((loopStartSec === null) !== (loopEndSec === null) ||
      loopStartSec !== null && (loopStartSec < startSec || loopEndSec! > endSec || loopEndSec! <= loopStartSec))
    return fail('AUDIO_LOOP_RANGE', '循环点必须都在裁切区间内，且终点晚于起点');
  const filters: string[] = [];
  if (gainDb !== 0) filters.push(`volume=${gainDb}dB`);
  if (fadeInMs > 0) filters.push(`afade=t=in:st=0:d=${fadeInMs / 1000}`);
  if (fadeOutMs > 0) filters.push(`afade=t=out:st=${durationSec - fadeOutMs / 1000}:d=${fadeOutMs / 1000}`);
  return ok({ durationSec, playback: { loopStartSec: loopStartSec === null ? null : loopStartSec - startSec,
    loopEndSec: loopEndSec === null ? null : loopEndSec - startSec },
    args: ['-ss', String(startSec), '-t', String(durationSec), ...(filters.length ? ['-af', filters.join(',')] : [])] });
}

export function audioPlaybackForVariant(variant: AssetVariant): Result<AudioPlayback> {
  const settings = variant.processing?.settings;
  if (settings?.kind !== 'audio' || settings.loopStartSec === null && settings.loopEndSec === null)
    return ok({ loopStartSec: null, loopEndSec: null });
  if (settings.loopStartSec === null || settings.loopEndSec === null)
    return fail('AUDIO_LOOP_RANGE', '已保存的循环点缺少起点或终点');
  const start = settings.loopStartSec - settings.startSec;
  const end = settings.loopEndSec - settings.startSec;
  if (start < 0 || end <= start || variant.metadata.durationSec === undefined || end > variant.metadata.durationSec + 0.05)
    return fail('AUDIO_LOOP_RANGE', '已保存的循环点超出播放版本时长');
  return ok({ loopStartSec: start, loopEndSec: end });
}

export function planTargetPlayback(index: AssetIndex, assetId: Id, variantId: Id,
  target: 'web' | 'windows', observed: 'direct' | 'converted'): Result<PreparedIndexEdit> {
  const assets = structuredClone(index.data.assets);
  const asset = assets.find(value => value.id === assetId);
  const variant = asset?.variants.find(value => value.id === variantId);
  if (!asset || !variant) return fail('ASSET_VARIANT_MISSING', '待验证素材版本不存在');
  if (observed === 'converted' && variant.role !== 'compatible' && variant.role !== 'trimmed')
    return fail('PLAYBACK_VARIANT', '转换播放回执必须对应派生播放版本');
  variant.targets[target] = observed;
  asset.revision++;
  asset.modifiedAt = new Date().toISOString();
  return indexEdit(index, assets, [assetId]);
}

export type PreparedVariant = { preparationId: Id; assetId: Id; variantId: Id; variant: AssetVariant;
  playback?: AudioPlayback; compatibility: Compatibility | null };

export class MediaVariantProcessor {
  private readonly pending = new Map<Id, PreparedVariant>();
  constructor(readonly projectRoot: string, readonly toolDirectory: string, private readonly readIndex: () => AssetIndex,
    readonly ffmpegVersion: string) {}

  private source(assetId: Id, variantId: Id): Result<{ asset: Asset; variant: AssetVariant; path: string }> {
    const asset = this.readIndex().data.assets.find(value => value.id === assetId);
    const variant = asset?.variants.find(value => value.id === variantId);
    if (!asset || !variant) return fail('ASSET_VARIANT_MISSING', '素材或指定版本不存在');
    return ok({ asset, variant, path: join(this.projectRoot, ...assetFilePath(assetId, variantId, variant.entry).split('/')) });
  }

  async prepareAudio(assetId: Id, sourceVariantId: Id, edit: AudioEdit, format: 'wav' | 'opus', signal?: AbortSignal): Promise<Result<PreparedVariant>> {
    const source = this.source(assetId, sourceVariantId);
    if (!source.ok) return source;
    if (source.value.asset.kind !== 'audio') return fail('ASSET_KIND', '素材不是音频');
    let raw: MediaProbe;
    try { raw = await probeMedia(this.toolDirectory, source.value.path, signal); }
    catch (error) { return fail(signal?.aborted ? 'CANCELLED' : 'MEDIA_PROBE_FAILED', String(error), ['retry']); }
    const duration = Number(streams(raw).audio?.duration ?? raw.format?.duration);
    const plan = audioPlan(edit, duration);
    if (!plan.ok) return plan;
    const id = createId(this.readIndex());
    const entry = `audio.${format}`;
    const destination = join(this.projectRoot, ...assetFilePath(assetId, id, entry).split('/'));
    const codec = format === 'wav' ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'libopus', '-b:a', '128k', '-vbr', 'off'];
    try {
      await mkdir(dirname(destination), { recursive: true });
      await runProcess(mediaExecutables(this.toolDirectory).ffmpeg,
        ['-hide_banner', '-nostdin', '-y', '-i', source.value.path, '-vn', ...plan.value.args, ...codec, destination], { signal });
      const output = await probeMedia(this.toolDirectory, destination, signal);
      const outputDuration = Number(streams(output).audio?.duration ?? output.format?.duration);
      if (!Number.isFinite(outputDuration) || Math.abs(outputDuration - plan.value.durationSec) > 0.1 ||
          (plan.value.playback.loopEndSec !== null && plan.value.playback.loopEndSec > outputDuration + 0.05))
        throw new Error('输出时长或循环点与裁切计划不符');
      const expectedCodec = format === 'wav' ? 'pcm_s16le' : 'opus';
      if (streams(output).audio?.codec_name !== expectedCodec) throw new Error('输出音频编码与请求不符');
      const prepared = await this.record(assetId, sourceVariantId, id, entry, destination, 'trimmed',
        { toolId: 'ffmpeg', toolVersion: this.ffmpegVersion, inputVariantId: sourceVariantId, settings: { ...edit, codec: expectedCodec, ...(format === 'opus' ? { bitrateKbps: 128 } : {}) } },
        { durationSec: outputDuration, container: output.format?.format_name ?? format,
          sampleRate: Number(streams(output).audio?.sample_rate), channels: streams(output).audio?.channels,
          ...(source.value.variant.metadata.authorDocument ? { authorDocument: source.value.variant.metadata.authorDocument } : {}),
          ...(plan.value.playback.loopStartSec !== null ? { loop: { startSec: plan.value.playback.loopStartSec, endSec: plan.value.playback.loopEndSec!, tail: source.value.variant.metadata.loop?.tail ?? 'cut' } } : {}) },
        source.value.variant.canvas, inspectCompatibility(output, 'audio'), plan.value.playback);
      return ok(prepared);
    } catch (error) { await rm(dirname(destination), { recursive: true, force: true });
      return fail(signal?.aborted ? 'CANCELLED' : 'AUDIO_PROCESS_FAILED', String(error), ['retry']); }
  }

  async prepareVideo(assetId: Id, sourceVariantId: Id, signal?: AbortSignal): Promise<Result<PreparedVariant>> {
    const source = this.source(assetId, sourceVariantId);
    if (!source.ok) return source;
    if (source.value.asset.kind !== 'video') return fail('ASSET_KIND', '素材不是视频');
    let input: MediaProbe;
    try { input = await probeMedia(this.toolDirectory, source.value.path, signal); }
    catch (error) { return fail(signal?.aborted ? 'CANCELLED' : 'MEDIA_PROBE_FAILED', String(error), ['retry']); }
    const id = createId(this.readIndex());
    const entry = 'video.mp4';
    const destination = join(this.projectRoot, ...assetFilePath(assetId, id, entry).split('/'));
    const hasAudio = !!streams(input).audio;
    try {
      await mkdir(dirname(destination), { recursive: true });
      await transcodeWindowsMp4(this.toolDirectory, source.value.path, destination, hasAudio, { signal });
      const output = await probeMedia(this.toolDirectory, destination, signal);
      const { video, audio } = streams(output);
      if (video?.codec_name !== 'h264' || hasAudio && audio?.codec_name !== 'aac') throw new Error('输出视频编码与请求不符');
      const prepared = await this.record(assetId, sourceVariantId, id, entry, destination, 'compatible',
        { toolId: 'ffmpeg', toolVersion: this.ffmpegVersion, inputVariantId: sourceVariantId,
          settings: { kind: 'transcode', container: 'mp4', videoCodec: 'h264', audioCodec: hasAudio ? 'aac' : null } },
        { width: video.width, height: video.height, durationSec: Number(output.format?.duration),
          container: output.format?.format_name, videoCodec: video.codec_name },
        source.value.variant.canvas, inspectCompatibility(output, 'video'));
      return ok(prepared);
    } catch (error) { await rm(dirname(destination), { recursive: true, force: true });
      return fail(signal?.aborted ? 'CANCELLED' : 'VIDEO_PROCESS_FAILED', String(error), ['retry']); }
  }

  private async record(assetId: Id, sourceVariantId: Id, id: Id, entry: string, destination: string,
    role: AssetVariant['role'], processing: Processing, metadata: AssetVariant['metadata'], canvas: AssetVariant['canvas'],
    compatibility: Compatibility, playback?: AudioPlayback): Promise<PreparedVariant> {
    const mime = role === 'compatible' ? 'video/mp4' : extname(entry) === '.wav' ? 'audio/wav' : 'audio/opus';
    const variant: AssetVariant = { id, parentId: sourceVariantId, role,
      files: [{ path: entry, bytes: (await stat(destination)).size, mime, role: 'entry' }], entry, metadata, canvas,
      processing, targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null };
    const prepared: PreparedVariant = { preparationId: createId(this.readIndex()), assetId, variantId: id, variant, compatibility, ...(playback ? { playback } : {}) };
    this.pending.set(prepared.preparationId, prepared);
    return prepared;
  }

  async prepareIndexEdit(preparationId: Id, activate: boolean): Promise<Result<PreparedIndexEdit>> {
    const prepared = this.pending.get(preparationId);
    if (!prepared) return fail('PREPARATION_MISSING', '派生版本准备项不存在');
    const index = this.readIndex();
    const assets = structuredClone(index.data.assets);
    const asset = assets.find(value => value.id === prepared.assetId);
    if (!asset || !asset.variants.some(value => value.id === prepared.variant.parentId))
      return fail('ASSET_VARIANT_MISSING', '来源版本已变化', ['compare']);
    asset.variants.push(structuredClone(prepared.variant));
    if (activate) asset.activeVariantId = prepared.variantId;
    asset.revision++;
    asset.modifiedAt = new Date().toISOString();
    return indexEdit(index, assets, [asset.id]);
  }

  confirm(preparationId: Id): void { this.pending.delete(preparationId); }
  async discard(preparationId: Id): Promise<void> {
    const prepared = this.pending.get(preparationId);
    if (!prepared) return;
    this.pending.delete(preparationId);
    await rm(join(this.projectRoot, 'assets', 'files', prepared.assetId, prepared.variantId), { recursive: true, force: true });
  }
}
