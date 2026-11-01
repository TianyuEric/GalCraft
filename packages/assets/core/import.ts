import { createId } from '@galcraft/contracts';
import { availableAssetName, validAssetFileName } from './naming.js';

import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, posix, resolve } from 'node:path';
import { AssetSchema, AssetVariantSchema, AudioLoopSchema, NativeAnimationSchema, parseAnimationResource } from '@galcraft/contracts';
import type { Asset, AssetKind, AssetTypeData, AssetVariant, Id, NativeAnimation, ResourceCapabilities, Result } from '@galcraft/contracts';
import type { ResourceProvider } from '@galcraft/plugins/contracts';
import { probeMedia, runProcess, mediaExecutables } from '@galcraft/media-tools/process';
import { assetFilePath, indexEdit } from './catalog.js';
import { fail, issue, ok } from './result.js';
import { inspectSVG } from './svg.js';
import type { SVGDecoder } from './svg.js';
import type { AssetIndex, ImportInput, ImportItem, PreparedImport, PreparedIndexEdit } from './types.js';
import { resourceSource } from './source.js';
import { AssetTypeRegistry } from './type-registry.js';
import sharp from 'sharp';
import { inspectAlpha } from '../processing/mask.js';
import { MediaVariantProcessor } from '../processing/media.js';

type Probe = { kind: AssetKind; mime: string; metadata: AssetVariant['metadata']; targets: AssetVariant['targets'] };
const formats: Record<string, { kind: AssetKind; mime: string }> = {
  '.gca': { kind: 'animation', mime: 'application/vnd.galcraft.animation+json' },
  '.gif': { kind: 'image', mime: 'image/gif' },
  '.png': { kind: 'image', mime: 'image/png' }, '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' }, '.webp': { kind: 'image', mime: 'image/webp' },
  '.svg': { kind: 'image', mime: 'image/svg+xml' }, '.mp3': { kind: 'audio', mime: 'audio/mpeg' },
  '.wav': { kind: 'audio', mime: 'audio/wav' }, '.ogg': { kind: 'audio', mime: 'audio/ogg' },
  '.opus': { kind: 'audio', mime: 'audio/opus' }, '.mp4': { kind: 'video', mime: 'video/mp4' },
  '.webm': { kind: 'video', mime: 'video/webm' }, '.mkv': { kind: 'video', mime: 'video/x-matroska' },
  '.ttf': { kind: 'font', mime: 'font/ttf' }, '.otf': { kind: 'font', mime: 'font/otf' },
  '.woff': { kind: 'font', mime: 'font/woff' }, '.woff2': { kind: 'font', mime: 'font/woff2' },
};

function seconds(raw: string | undefined, ticks?: number, timeBase?: string): number | undefined {
  const base = timeBase?.split('/').map(Number);
  if (ticks !== undefined && Number.isSafeInteger(ticks) && ticks >= 0 && base?.length === 2 && base.every(value => Number.isFinite(value) && value > 0))
    return ticks * base[0]! / base[1]!;
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
export async function inspectFile(path: string, toolDirectory: string, signal?: AbortSignal): Promise<Result<Probe>> {
  const spec = formats[extname(path).toLowerCase()];
  if (!spec) return fail('UNSUPPORTED_FORMAT', `不支持文件 ${basename(path)}`);
  if (spec.kind === 'animation') {
    const parsed = parseAnimationResource(await readFile(path, 'utf8'));
    if (!parsed.ok) return parsed;
    return ok({ ...spec, metadata: { durationSec: (Array.isArray(parsed.value) ? parsed.value.reduce((sum, segment) => sum + segment.durationMs, 0) : parsed.value.durationMs) / 1000 }, targets: { web: 'direct', windows: 'direct' } });
  }
  if (spec.mime === 'image/gif' || spec.mime === 'image/webp') {
    try {
      const image = sharp(await readFile(path), { animated: true }), metadata = await image.metadata();
      const format = spec.mime === 'image/gif' ? 'gif' : 'webp';
      if (metadata.format !== format || !metadata.width || !metadata.height) return fail('MEDIA_SIGNATURE', `${basename(path)} 的文件内容与扩展名不符`);
      await image.raw().toBuffer();
      const frames = metadata.pages ?? 1;
      const delays = Array.from({ length: frames }, (_, index) => Math.max(1, metadata.delay?.[index] || 100));
      return ok({ ...spec, metadata: { width: metadata.width, height: metadata.pageHeight ?? metadata.height,
        hasAlpha: metadata.hasAlpha, ...(frames > 1 ? { durationSec: delays.reduce((sum, value) => sum + value, 0) / 1000,
          imageAnimation: { format, frameDurationsMs: delays, sourceLoopCount: metadata.loop ?? null } } : {}) },
        targets: { web: 'direct', windows: 'direct' } });
    } catch (error) { return fail('IMAGE_DECODE_FAILED', `${basename(path)}: ${String(error)}`, ['locate']); }
  }
  if (spec.mime === 'image/png') {
    const bytes = await readFile(path);
    for (let offset = 8; offset + 8 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL')
        return fail('ANIMATED_IMAGE_FORMAT', 'APNG is outside the supported animated image formats', ['locate']);
      offset += length + 12;
    }
  }
  if (spec.mime === 'image/svg+xml') {
    const checked = inspectSVG({ source: await readFile(path, 'utf8') });
    if (!checked.ok) return checked;
    return ok({ ...spec, metadata: { width: checked.value.intrinsic.width, height: checked.value.intrinsic.height,
      svgViewBox: checked.value.viewBox }, targets: { web: 'unverified', windows: 'unverified' } });
  }
  if (spec.kind === 'font') {
    const handle = await open(path, 'r');
    const data = Buffer.alloc(4);
    try { await handle.read(data, 0, 4, 0); }
    finally { await handle.close(); }
    const signature = data.subarray(0, 4).toString('ascii');
    if (!['OTTO', 'true', 'wOFF', 'wOF2'].includes(signature) && data.readUInt32BE(0) !== 0x00010000)
      return fail('INVALID_FONT', `${basename(path)} 不是支持的字体文件`);
    return ok({ ...spec, metadata: {}, targets: { web: 'unverified', windows: 'unverified' } });
  }
  const handle = await open(path, 'r');
  const signature = Buffer.alloc(16);
  try { await handle.read(signature, 0, signature.length, 0); }
  finally { await handle.close(); }
  const extension = extname(path).toLowerCase();
  const validSignature = extension === '.png' ? signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : extension === '.jpg' || extension === '.jpeg' ? signature[0] === 0xff && signature[1] === 0xd8
      : extension === '.webp' ? signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP'
        : extension === '.wav' ? signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WAVE'
          : extension === '.ogg' || extension === '.opus' ? signature.toString('ascii', 0, 4) === 'OggS'
            : extension === '.mp4' ? signature.toString('ascii', 4, 8) === 'ftyp'
              : extension === '.webm' || extension === '.mkv' ? signature.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
                : true;
  if (!validSignature) return fail('MEDIA_SIGNATURE', `${basename(path)} 的文件内容与扩展名不符`);
  const raw = await probeMedia(toolDirectory, path, signal);
  const stream = raw.streams?.find(value => value.codec_type === (spec.kind === 'image' || spec.kind === 'video' ? 'video' : 'audio'));
  if (!stream?.codec_name) return fail('INVALID_MEDIA', `${basename(path)} 无法读取所需媒体流`);
  const metadata: AssetVariant['metadata'] = {};
  if (stream.width && stream.height) { metadata.width = stream.width; metadata.height = stream.height; }
  const duration = seconds(stream.duration ?? raw.format?.duration, spec.kind === 'audio' ? stream.duration_ts : undefined, stream.time_base);
  if (duration !== undefined) metadata.durationSec = duration;
  if (raw.format?.format_name) metadata.container = raw.format.format_name;
  if (spec.kind === 'video') metadata.videoCodec = stream.codec_name;
  if (spec.kind === 'audio') {
    const sampleRate = Number(stream.sample_rate);
    if (Number.isFinite(sampleRate) && sampleRate > 0) metadata.sampleRate = sampleRate;
    if (stream.channels) metadata.channels = stream.channels;
  }
  if (spec.kind === 'image') {
    const alpha=await inspectAlpha(path);
    metadata.hasAlpha=alpha.hasAlpha;metadata.hasTransparency=alpha.hasTransparency;
  }
  if (spec.kind === 'image') {
    const { ffmpeg } = mediaExecutables(toolDirectory);
    await runProcess(ffmpeg, ['-v', 'error', '-i', path, '-frames:v', '1', '-f', 'null', '-'], { signal });
  }
  return ok({ ...spec, metadata, targets: { web: 'unverified', windows: 'unverified' } });
}

async function listFiles(directory: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const child = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(directory, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

export class ImportCoordinator {
  private readonly prepared = new Map<Id, PreparedImport>();
  constructor(readonly projectRoot: string, readonly toolDirectory: string, private readonly readIndex: () => AssetIndex,
    private readonly resourceProvider?: ResourceProvider | ((directory: string) => ResourceProvider), private readonly svgDecoder?: SVGDecoder,
    private readonly resolveResource?: (sourcePath: string) => Promise<{ provider: ResourceProvider; release(): void | Promise<void> } | null>,
    readonly types: AssetTypeRegistry = new AssetTypeRegistry()) {}

  async importBatch(input: ImportInput, signal?: AbortSignal): Promise<ImportItem[]> {
    const items: ImportItem[] = [];
    for (const [fileIndex, sourcePath] of input.files.entries()) {
      if (signal?.aborted) break;
      let lease: Awaited<ReturnType<NonNullable<ImportCoordinator['resolveResource']>>> = null;
      try { lease = await this.resolveResource?.(sourcePath) ?? null;
        items.push({ sourcePath, result: await this.prepareOne(sourcePath, input, signal, input.fileNames?.[fileIndex], input.fileTags?.[fileIndex], lease?.provider, input.fileSources?.[fileIndex], input.fileTypeData?.[fileIndex], input.fileAudioPlayback?.[fileIndex]) }); }
      catch (error) { items.push({ sourcePath, result: fail('IMPORT_FAILED', `${sourcePath}: ${String(error)}`, ['retry']) }); }
      finally { await lease?.release(); }
    }
    return items;
  }

  private async prepareOne(sourcePath: string, input: ImportInput, signal?: AbortSignal, fileName?: string, tags: string[] = [], pluginProvider?: ResourceProvider, provenance?: Asset['source'], frozenTypeData?: AssetVariant['typeData'], playback?: NonNullable<ImportInput['fileAudioPlayback']>[number]): Promise<ImportItem['result']> {
    const source = resolve(sourcePath);
    const info = await stat(source);
    const model = !pluginProvider && (info.isDirectory() || source.toLowerCase().endsWith('.model3.json'));
    let display = fileName ?? basename(source);
    if (fileName !== undefined && (!validAssetFileName(fileName) || model || extname(fileName).toLowerCase() !== extname(source).toLowerCase()))
      return fail('ASSET_NAME_INVALID', 'The asset name must retain the original extension and exclude paths or reserved filename characters.');
    const index = structuredClone(this.readIndex());
    const indexedIds = new Set(index.data.assets.map(asset => asset.id));
    for (const pending of this.prepared.values()) {
      const at = index.data.assets.findIndex(asset => asset.id === pending.asset.id);
      if (at >= 0) index.data.assets[at] = pending.asset;
      else index.data.assets.push(pending.asset);
    }
    if (fileName !== undefined && input.conflict === 'keepBoth') display = availableAssetName(display, index.data.assets.map(asset => asset.name));
    pluginProvider ??= typeof this.resourceProvider === 'function' ? this.resourceProvider(info.isDirectory() ? source : dirname(source)) : this.resourceProvider;
    const kind: AssetKind = pluginProvider?.kind ?? (model || source.toLowerCase().endsWith('.model3.json') || pluginProvider?.extensions.includes('.model3.json') ? 'live2d' : formats[extname(source).toLowerCase()]?.kind ?? input.usage ?? 'effect');
    if (model && !pluginProvider) return fail('RESOURCE_PROVIDER_MISSING', `${display} 需要作品启用的精确资源提供者`, ['supplyDependency']);
    if (!model && !pluginProvider && !formats[extname(source).toLowerCase()]) return fail('UNSUPPORTED_FORMAT', `不支持文件 ${display}`);
    if (input.usage && input.usage !== kind) return fail('IMPORT_KIND', `${display} 与 ${input.usage} 用途不符`);
    const matches = index.data.assets.filter(asset => asset.name === display && asset.kind === kind);
    if (matches.length && input.conflict === 'ask') return fail('IMPORT_CONFLICT', `${display} 已存在，需选择替换、保留两者或跳过`, ['chooseTarget']);
    if (matches.length && input.conflict === 'skip') return fail('IMPORT_SKIPPED', `${display} 已跳过`, ['cancel']);
    if (matches.length > 1 && input.conflict === 'replace') return fail('IMPORT_AMBIGUOUS', `${display} 对应多个素材，需明确选择`, ['chooseTarget']);
    const replaced = input.conflict === 'replace' ? matches[0] ?? null : null;
    const assetId = replaced?.id ?? createId(this.readIndex());
    const variantId = createId(this.readIndex());
    const preparationId = createId(this.readIndex());
    const staging = join(this.projectRoot, 'assets', 'prepared', preparationId);
    const destination = join(this.projectRoot, 'assets', 'files', assetId, variantId);
    let entry: string;
    let files: string[];
    let group: Result<{ files: string[]; capabilities: ResourceCapabilities }> | null = null;
    try {
      await mkdir(staging, { recursive: true });
      let providerMetadata: AssetVariant['metadata'] = {};
      let typeData = frozenTypeData ? structuredClone(frozenTypeData) : undefined;
      if (pluginProvider) {
        const directory = info.isDirectory() ? source : dirname(source), present = await listFiles(directory);
        entry = info.isDirectory() ? present.find(path => pluginProvider.extensions.some(extension => path.toLowerCase().endsWith(extension.toLowerCase()))) ?? '' : basename(source);
        if (!entry) return fail('RESOURCE_ENTRY_MISSING', `${display} 缺少提供者支持的入口`);
        const inspected = await pluginProvider.inspect(entry, present, resourceSource(directory, entry, present));
        if (!inspected.ok) return inspected;
        typeData ??= inspected.value.typeData;
        const type = this.types.validate(kind, typeData); if (!type.ok) return type;
        if (type.value.definition.resourceProviderKey && type.value.definition.resourceProviderKey !== pluginProvider.key) return fail('ASSET_TYPE_PROVIDER', `${kind} 未关联 ${pluginProvider.key}`);
        files = [...new Set([entry, ...inspected.value.files])];
        const missing = files.filter(path => !present.includes(path));
        if (missing.length || inspected.value.capabilities.missingFiles.length) return fail('RESOURCE_GROUP_INCOMPLETE', `${display} 缺少：${[...missing, ...inspected.value.capabilities.missingFiles].join('、')}`, ['supplyDependency']);
        group = ok({ files, capabilities: inspected.value.capabilities });
        const checkedMetadata = AssetVariantSchema.shape.metadata.safeParse(inspected.value.metadata);
        if (!checkedMetadata.success) return fail('RESOURCE_METADATA', checkedMetadata.error.message);
        providerMetadata = checkedMetadata.data;
        const reader = resourceSource(directory, entry, files);
        for (const path of files) { await mkdir(dirname(join(staging, path)), { recursive: true }); await writeFile(join(staging, path), await reader.readBytes(path)); }
      } else {
        if (typeData) { const checked = this.types.validate(kind, typeData); if (!checked.ok) return checked; }
        entry = display;
        files = [entry];
        await copyFile(source, join(staging, entry));
      }
      const probe = model || pluginProvider && !formats[extname(entry).toLowerCase()] ? ok<Probe>({ kind, mime: 'application/octet-stream', metadata: providerMetadata, targets: { web: 'unverified', windows: 'unverified' } })
        : await inspectFile(join(staging, entry), this.toolDirectory, signal);
      if (!probe.ok) return probe;
      if (playback?.loop) {
        const loop = AudioLoopSchema.safeParse(playback.loop), duration = probe.value.metadata.durationSec;
        if (kind !== 'audio' || !loop.success || duration === undefined) return fail('AUDIO_LOOP_RANGE', '循环区需位于实际解码音频时长内', ['edit']);
        const rate = probe.value.metadata.sampleRate, endSec = Math.min(loop.data.endSec, duration);
        // Rendering rounds musical time to sample frames; compare endpoints on the same grid.
        const pastEnd = rate && rate > 0 ? Math.round(loop.data.endSec * rate) > Math.round(duration * rate) : loop.data.endSec > duration;
        if (pastEnd || loop.data.startSec >= endSec) return fail('AUDIO_LOOP_RANGE', '循环区需位于实际解码音频时长内', ['edit']);
        probe.value.metadata.loop = { ...loop.data, endSec };
      }
      if (!model && extname(entry).toLowerCase() === '.svg') {
        if (!this.svgDecoder) return fail('SVG_DECODE_UNAVAILABLE', 'SVG 导入需要图像解码器', ['retry']);
        const decoded = await this.svgDecoder(await readFile(join(staging, entry), 'utf8'));
        if (!decoded.ok) return decoded;
      }
      const entries = await Promise.all(files.map(async path => ({ path, bytes: (await stat(join(staging, path))).size,
        mime: formats[extname(path).toLowerCase()]?.mime ?? 'application/octet-stream', role: path === entry ? 'entry' : 'dependency' })));
      const variant: AssetVariant = { id: variantId, parentId: replaced?.activeVariantId ?? null,
        role: model || pluginProvider ? 'group' : 'original', files: entries, entry, metadata: probe.value.metadata,
        canvas: probe.value.metadata.width && probe.value.metadata.height ? { width: probe.value.metadata.width,
          height: probe.value.metadata.height, offsetX: 0, offsetY: 0 } : null,
        processing: null, targets: probe.value.targets, groupCapabilities: group?.ok ? group.value.capabilities : null,
        ...(typeData ? { typeData } : {}) };
      const now = new Date().toISOString();
      const name = matches.length && input.conflict === 'keepBoth' ? uniqueName(display, index.data.assets) : display;
      const asset: Asset = replaced ? { ...replaced, revision: replaced.revision + 1, activeVariantId: variantId,
        variants: [...replaced.variants, variant],
        source: indexedIds.has(replaced.id) ? replaced.source : provenance ?? { kind: 'import', description: source, usage: 'localReview' },
        folder: indexedIds.has(replaced.id) ? replaced.folder : input.folder,
        createdAt: indexedIds.has(replaced.id) ? replaced.createdAt : now,
        modifiedAt: now }
        : { id: assetId, revision: 1, name, kind, folder: input.folder, tags: [...new Set(tags)], locales: [], characterId: null,
          sceneIds: [], groupId: null, originalVariantId: variantId, activeVariantId: variantId, variants: [variant],
          sourceName: display, source: provenance ?? { kind: 'import', description: source, usage: 'localReview' },
          createdAt: now, modifiedAt: now };
      AssetSchema.parse(asset);
      const ffmpegVersion = playback?.encoding ? (await runProcess(mediaExecutables(this.toolDirectory).ffmpeg, ['-version'], { signal })).stdout.split(/\r?\n/, 1)[0]! : '';
      await mkdir(dirname(destination), { recursive: true });
      await rename(staging, destination);
      if (playback?.encoding) {
        if (kind !== 'audio' || playback.encoding.format !== 'opus' || playback.encoding.bitrateKbps !== 128) {
          await rm(destination, { recursive: true, force: true });
          return fail('AUDIO_ENCODING', '播放派生需要明确的 Opus 128kbps 音频配置');
        }
        const processor = new MediaVariantProcessor(this.projectRoot, this.toolDirectory, () => ({ ...index, data: { assets: [asset] } }), ffmpegVersion);
        const derived = await processor.prepareAudio(assetId, variantId, { kind: 'audio', startSec: 0, endSec: variant.metadata.durationSec!, gainDb: 0,
          fadeInMs: 0, fadeOutMs: 0, loopStartSec: variant.metadata.loop?.startSec ?? null, loopEndSec: variant.metadata.loop?.endSec ?? null }, 'opus', signal);
        if (!derived.ok) { await rm(destination, { recursive: true, force: true }); return derived; }
        asset.variants.push(derived.value.variant); asset.activeVariantId = derived.value.variantId;
        processor.confirm(derived.value.preparationId);
      }
      this.prepared.set(preparationId, { preparationId, asset, files: asset.variants.filter(item => item.id === variantId || item.parentId === variantId).flatMap(item => item.files.map(file => assetFilePath(assetId, item.id, file.path))),
        variantIds: asset.variants.filter(item => item.id === variantId || item.parentId === variantId).map(item => item.id), replaces: replaced?.id ?? null,
        replacesIndexedAsset: replaced ? indexedIds.has(replaced.id) : false });
      return ok({ assetId, variantId, preparationId, issues: [] });
    } finally { await rm(staging, { recursive: true, force: true }); }
  }

  prepareIndexEdit(preparationIds: Id[]): Result<PreparedIndexEdit> {
    const index = this.readIndex();
    const next = structuredClone(index.data.assets);
    const selectedIds = new Set<Id>();
    for (const id of preparationIds) {
      if (!this.prepared.has(id) || selectedIds.has(id)) return fail('PREPARATION_MISSING', `准备项 ${id} 不可用`);
      selectedIds.add(id);
    }
    const selected = [...this.prepared.values()].filter(prepared => selectedIds.has(prepared.preparationId));
    for (const prepared of selected) {
      const at = next.findIndex(asset => asset.id === prepared.asset.id);
      if (prepared.expectedRevision !== undefined && (at < 0 || next[at]!.revision !== prepared.expectedRevision)) return fail('ASSET_STALE', '素材已变化，请刷新后重试', ['compare']);
      if (prepared.replaces && at < 0 && prepared.replacesIndexedAsset)
        return fail('IMPORT_CONFLICT', '待替换素材已变化', ['compare']);
      if (prepared.replaces) {
        const additions = prepared.asset.variants.filter(variant => prepared.variantIds.includes(variant.id));
        if (at < 0) {
          const first = additions[0];
          if (!first) return fail('PREPARATION_MISSING', '准备项没有素材版本');
          next.push({ ...structuredClone(prepared.asset), revision: 1, originalVariantId: first.id,
            activeVariantId: additions.at(-1)!.id, variants: additions.map((variant, index) => ({ ...variant,
              parentId: index ? additions[index - 1]!.id : null })) });
          continue;
        }
        const current = next[at]!;
        const known = new Set(current.variants.map(variant => variant.id));
        if (additions.some(variant => known.has(variant.id))) return fail('IMPORT_CONFLICT', '待采用版本已在索引中', ['compare']);
        let parentId = current.activeVariantId;
        for (const variant of additions) {
          current.variants.push({ ...variant, parentId });
          parentId = variant.id;
        }
        current.activeVariantId = parentId;
        current.revision++;
        current.modifiedAt = new Date().toISOString();
      } else if (at >= 0) return fail('IMPORT_CONFLICT', '新素材身份已在索引中', ['compare']);
      else next.push(structuredClone(prepared.asset));
    }
    return indexEdit(index, next, [...new Set(selected.map(prepared => prepared.asset.id))]);
  }
  /** Creates a new immutable variant. typeData is authoritative; imported source files keep their provenance. */
  async prepareAnimation(input: { name: string; animation: NativeAnimation; assetId?: Id; expectedRevision?: number; source?: Asset['source'] }): Promise<ImportItem['result']> {
    const parsed = NativeAnimationSchema.safeParse(input.animation);
    if (!parsed.success) return fail('ANIMATION_RESOURCE_SCHEMA', parsed.error.message);
    const index = this.readIndex(), original = input.assetId ? index.data.assets.find(asset => asset.id === input.assetId) : undefined;
    if (input.assetId && (!original || original.kind !== 'animation' || original.revision !== input.expectedRevision)) return fail('ASSET_STALE', '动画素材已变化，请刷新后重试', ['compare']);
    const name = input.name.trim().replace(/\.gca$/i, '') + '.gca';
    if (!input.name.trim().replace(/\.gca$/i, '').trim() || !validAssetFileName(name)) return fail('ASSET_NAME_INVALID', '请输入有效动画名称');
    const assetId = original?.id ?? createId(index), variantId = createId(index), preparationId = createId(index);
    const directory = join(this.projectRoot, 'assets', 'files', assetId, variantId), path = assetFilePath(assetId, variantId, 'animation.gca');
    const source = JSON.stringify(parsed.data, null, 2), now = new Date().toISOString();
    try {
      await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'animation.gca'), source);
      const variant: AssetVariant = { id: variantId, parentId: original?.activeVariantId ?? null, role: 'original',
        entry: 'animation.gca', files: [{ path: 'animation.gca', bytes: Buffer.byteLength(source), mime: 'application/vnd.galcraft.animation+json', role: 'entry' }],
        metadata: { durationSec: parsed.data.durationMs / 1000 }, canvas: null, processing: null,
        targets: { web: 'direct', windows: 'direct' }, groupCapabilities: null };
      const asset: Asset = original ? { ...structuredClone(original), name, revision: original.revision + 1, activeVariantId: variantId, variants: [...structuredClone(original.variants), variant], modifiedAt: now } :
        { id: assetId, revision: 1, name, kind: 'animation', folder: [], tags: [], locales: [], characterId: null, sceneIds: [], groupId: null,
          originalVariantId: variantId, activeVariantId: variantId, variants: [variant], sourceName: name,
          source: input.source ?? { kind: 'import', description: 'Studio animation editor', usage: 'localReview' }, createdAt: now, modifiedAt: now };
      AssetSchema.parse(asset);
      this.prepared.set(preparationId, { preparationId, asset, files: [path], variantIds: [variantId], replaces: original?.id ?? null,
        replacesIndexedAsset: !!original, ...(original ? { expectedRevision: original.revision } : {}) });
      return ok({ assetId, variantId, preparationId, issues: [] });
    } catch (error) { await rm(directory, { recursive: true, force: true }); return fail('ANIMATION_EDIT_FAILED', String(error)); }
  }
  async prepareTypeData(input: { assetId: Id; variantId: Id; expectedRevision: number; typeData: AssetTypeData }): Promise<ImportItem['result']> {
    const asset = this.readIndex().data.assets.find(item => item.id === input.assetId);
    if (!asset || asset.revision !== input.expectedRevision) return fail('ASSET_STALE', '素材已变化，请刷新后重试', ['compare']);
    const source = asset.variants.find(item => item.id === input.variantId);
    if (!source) return fail('VARIANT_MISSING', '素材版本不存在');
    const valid = this.types.validate(asset.kind, input.typeData); if (!valid.ok) return valid;
    const variantId = createId(this.readIndex()), preparationId = createId(this.readIndex());
    const variant: AssetVariant = { ...structuredClone(source), id: variantId, parentId: source.id, typeData: structuredClone(input.typeData) };
    const destination = join(this.projectRoot, 'assets', 'files', asset.id, variantId);
    try {
      for (const file of variant.files) {
        const to = join(destination, ...file.path.split('/')); await mkdir(dirname(to), { recursive: true });
        await copyFile(join(this.projectRoot, ...assetFilePath(asset.id, source.id, file.path).split('/')), to);
      }
      this.prepared.set(preparationId, { preparationId, asset: { ...structuredClone(asset), revision: asset.revision + 1,
        activeVariantId: variantId, variants: [...structuredClone(asset.variants), variant], modifiedAt: new Date().toISOString() },
        files: variant.files.map(file => assetFilePath(asset.id, variantId, file.path)), variantIds: [variantId], replaces: asset.id, replacesIndexedAsset: true, expectedRevision: input.expectedRevision });
      return ok({ assetId: asset.id, variantId, preparationId, issues: [] });
    } catch (error) { await rm(destination, { recursive: true, force: true }); return fail('ASSET_TYPE_EDIT', String(error)); }
  }
  async copyAsset(assetId: Id): Promise<Result<{ assetId: Id; preparationId: Id }>> {
    const original = this.readIndex().data.assets.find(asset => asset.id === assetId);
    if (!original) return fail('ASSET_MISSING', '素材不存在');
    const copyId = createId(this.readIndex());
    const preparationId = createId(this.readIndex());
    const ids = new Map(original.variants.map(value => [value.id, createId(this.readIndex())]));
    const mapping = { [assetId]: copyId, ...Object.fromEntries(ids) };
    const rewritten = this.types.rewriteAsset(original, mapping); if (!rewritten.ok) return rewritten;
    const now = new Date().toISOString();
    const copy: Asset = { ...structuredClone(original), id: copyId, revision: 1, name: `${original.name} 副本`,
      originalVariantId: ids.get(original.originalVariantId)!, activeVariantId: ids.get(original.activeVariantId)!,
      variants: rewritten.value.variants.map(value => ({ ...structuredClone(value), id: ids.get(value.id)!,
        parentId: value.parentId ? ids.get(value.parentId)! : null,
        processing: value.processing ? { ...value.processing, inputVariantId: ids.get(value.processing.inputVariantId)!,
          settings: value.processing.settings.kind === 'mask' ? { ...value.processing.settings,
            maskVariantId: ids.get(value.processing.settings.maskVariantId)! } : value.processing.settings } : null })),
      createdAt: now, modifiedAt: now };
    const paths: string[] = [];
    try {
      for (const variant of original.variants) for (const file of variant.files) {
        const from = join(this.projectRoot, ...assetFilePath(assetId, variant.id, file.path).split('/'));
        const path = assetFilePath(copyId, ids.get(variant.id)!, file.path);
        const to = join(this.projectRoot, ...path.split('/'));
        await mkdir(dirname(to), { recursive: true });
        const definition = this.types.definition(original.kind, variant.typeData); if (!definition.ok) throw new Error(definition.error.message);
        if (definition.value.definition.rewriteFile) {
          const rewrittenFile = this.types.rewriteFile(original.kind, variant, file.path, await readFile(from), mapping);
          if (!rewrittenFile.ok) throw new Error(rewrittenFile.error.message);
          await writeFile(to, rewrittenFile.value);
          const copiedVariant = copy.variants.find(value => value.id === ids.get(variant.id))!;
          copiedVariant.files.find(value => value.path === file.path)!.bytes = (await stat(to)).size;
        } else await copyFile(from, to);
        paths.push(path);
      }
    } catch (error) {
      await rm(join(this.projectRoot, 'assets', 'files', copyId), { recursive: true, force: true });
      return fail('ASSET_COPY_FAILED', `素材复制失败：${String(error)}`, ['retry']);
    }
    this.prepared.set(preparationId, { preparationId, asset: copy, files: paths, variantIds: [...ids.values()],
      replaces: null, replacesIndexedAsset: false });
    return ok({ assetId: copyId, preparationId });
  }
  confirm(preparationIds: Id[]): void { for (const id of preparationIds) this.prepared.delete(id); }
  pendingVariants(): { assetId: Id; variantId: Id }[] {
    return [...this.prepared.values()].flatMap(value => value.variantIds.map(variantId => ({ assetId: value.asset.id, variantId })));
  }
  async discard(preparationId: Id): Promise<void> {
    const prepared = this.prepared.get(preparationId);
    if (!prepared) return;
    this.prepared.delete(preparationId);
    for (const variantId of prepared.variantIds)
      await rm(join(this.projectRoot, 'assets', 'files', prepared.asset.id, variantId), { recursive: true, force: true });
  }
}

function uniqueName(name: string, assets: Asset[]): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let number = 2;
  while (assets.some(asset => asset.name === `${base}-${number}${ext}`)) number++;
  return `${base}-${number}${ext}`;
}
