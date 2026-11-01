import { createId } from '@galcraft/contracts';

import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AssetReference, AssetVariant, Id, Processing, Result, Source } from '@galcraft/contracts';
import { assetFilePath, indexEdit } from '../core/catalog.js';
import { fail, ok } from '../core/result.js';
import type { AssetIndex, PreparedIndexEdit } from '../core/types.js';
import { adjustMask, alignCanvas, composeAlpha, encodeMask, inspectAlpha, maskFromAlpha, readMask, renderAligned } from './mask.js';

export type BackgroundRemovalChoice = { enabled: boolean; provider: 'node' | 'comfy'; connectionId: Id | null; workflowBindingId: Id | null };
export type MattingOutput = { imagePath: string; maskPath: string | null; width: number; height: number;
  result: { declared: 'removed' | 'unchanged' | 'unknown'; hasAlpha: boolean; hasTransparency: boolean };
  provider: 'node' | 'comfy'; providerVersion: string; modelVersion: string | null };
export type MattingPort = (input: { operationId: Id; inputPath: string; outputDirectory: string }, signal?: AbortSignal) => Promise<Result<MattingOutput>>;
export type PreparedImage = { preparationId: Id; assetId: Id; maskVariantId: Id; transparentVariantId: Id;
  mask: AssetVariant; transparent: AssetVariant; result: 'processed' | 'reused' | 'needsReview' };
export type PreparedAligned = { preparationId: Id; assetId: Id; variantId: Id; variant: AssetVariant };
export type SelectedImageRef = AssetReference & { source: Source };
export type PreparedSelectedImage = { assetId: Id; variantId: Id; edit: PreparedIndexEdit; files: string[];
  replacements: { before: SelectedImageRef; after: { assetId: Id; variantId: Id | null } }[] };

export function shouldRemove(choice: BackgroundRemovalChoice, observed: Awaited<ReturnType<typeof inspectAlpha>>,
  declared: MattingOutput['result']['declared']): 'skip' | 'reuse' | 'review' | 'run' {
  if (!choice.enabled) return 'skip';
  if (declared === 'removed' && observed.hasTransparency && observed.hasVisibleForeground) return 'reuse';
  if (observed.hasTransparency) return 'review';
  return 'run';
}

export class ImageVariantProcessor {
  private readonly pending = new Map<Id, PreparedImage>();
  private readonly selectedAssets = new Map<Id, Id>();
  private readonly alignments = new Map<Id, PreparedAligned>();
  constructor(readonly projectRoot: string, private readonly readIndex: () => AssetIndex) {}

  private path(assetId: Id, variantId: Id, entry: string): string {
    return join(this.projectRoot, ...assetFilePath(assetId, variantId, entry).split('/'));
  }

  async prepareMatting(assetId: Id, sourceVariantId: Id, choice: BackgroundRemovalChoice, declared: MattingOutput['result']['declared'],
    port?: MattingPort, options: { signal?: AbortSignal; recognizeAgain?: boolean } = {}): Promise<Result<{ status: 'unchanged' | 'reused' | 'needsReview' | 'prepared'; prepared: PreparedImage | null }>> {
    const asset = this.readIndex().data.assets.find(value => value.id === assetId);
    const source = asset?.variants.find(value => value.id === sourceVariantId);
    if (!asset || !source || asset.kind !== 'image') return fail('IMAGE_VARIANT_MISSING', '图像版本不存在');
    const inputPath = this.path(assetId, sourceVariantId, source.entry);
    const observed = await inspectAlpha(inputPath);
    const action = options.recognizeAgain && choice.enabled ? 'run' : shouldRemove(choice, observed, declared);
    if (action === 'skip') return ok({ status: 'unchanged', prepared: null });
    if (action === 'reuse') return ok({ status: 'reused', prepared: null });
    if (action === 'review') return ok({ status: 'needsReview', prepared: null });
    if (choice.provider === 'node' && (choice.connectionId || choice.workflowBindingId) ||
        choice.provider === 'comfy' && (!choice.connectionId || !choice.workflowBindingId))
      return fail('MATTING_SELECTION', '透明化处理方式缺少有效绑定');
    if (!port) return fail('MATTING_PROVIDER_UNAVAILABLE', '所选透明化工具尚未就绪', ['retry']);
    const outputDirectory = join(this.projectRoot, 'assets', 'prepared', createId(this.readIndex()));
    try {
      const response = await port({ operationId: createId(this.readIndex()), inputPath, outputDirectory }, options.signal);
      if (!response.ok) return response;
      const output = response.value;
      if (options.signal?.aborted) throw new Error('Cancelled');
      const actual = await inspectAlpha(output.imagePath);
      if (actual.width !== observed.width || actual.height !== observed.height || output.width !== observed.width || output.height !== observed.height)
        throw new Error('透明化结果与原画布尺寸不一致');
      const mask = output.maskPath ? await readMask(output.maskPath, actual.width, actual.height) : await maskFromAlpha(output.imagePath);
      const prepared = await this.prepareMask(assetId, sourceVariantId, mask, 0, 0,
        output.provider === 'node' ? 'galcraft.birefnet' : 'comfy',
        output.modelVersion ? `${output.providerVersion}+${output.modelVersion}` : output.providerVersion,
        output.imagePath, source.canvas);
      if (!actual.hasTransparency || !actual.hasVisibleForeground) prepared.result = 'needsReview';
      return ok({ status: prepared.result === 'needsReview' ? 'needsReview' : 'prepared', prepared });
    } catch (error) { return fail(options.signal?.aborted ? 'CANCELLED' : 'MATTING_FAILED', String(error), ['retry']); }
    finally { await rm(outputDirectory, { recursive: true, force: true }); }
  }

  async prepareRefinement(assetId: Id, sourceVariantId: Id, mask: Uint8Array, featherPx: number, expandPx: number,
    crop?: { x: number; y: number; width: number; height: number }): Promise<Result<PreparedImage>> {
    const asset = this.readIndex().data.assets.find(value => value.id === assetId);
    const source = asset?.variants.find(value => value.id === sourceVariantId);
    if (!asset || !source || asset.kind !== 'image') return fail('IMAGE_VARIANT_MISSING', '图像版本不存在');
    const observed = await inspectAlpha(this.path(assetId, sourceVariantId, source.entry));
    if (mask.length !== observed.width * observed.height) return fail('MASK_SIZE', '蒙版与原图画布不一致');
    try {
      const adjusted = await adjustMask(mask, observed.width, observed.height, featherPx, expandPx);
      const prepared = await this.prepareMask(assetId, sourceVariantId, adjusted, featherPx, expandPx,
        'galcraft.mask-editor', '0.1.0', null, source.canvas, crop);
      return ok(prepared);
    } catch (error) { return fail('MASK_PROCESS_FAILED', String(error), ['retry']); }
  }

  async prepareAligned(assetId: Id, sourceVariantId: Id, targetCanvas: { width: number; height: number; offsetX: number; offsetY: number },
    sourceFoot: { x: number; y: number }, targetFoot: { x: number; y: number }): Promise<Result<PreparedAligned>> {
    const asset = this.readIndex().data.assets.find(value => value.id === assetId);
    const source = asset?.variants.find(value => value.id === sourceVariantId);
    if (!asset || !source || asset.kind !== 'image') return fail('IMAGE_VARIANT_MISSING', '图像版本不存在');
    const sourcePath = this.path(assetId, sourceVariantId, source.entry);
    const observed = await inspectAlpha(sourcePath);
    let placement: ReturnType<typeof alignCanvas>;
    try { placement = alignCanvas(targetCanvas, { width: observed.width, height: observed.height,
      footX: sourceFoot.x, footY: sourceFoot.y }, targetFoot); }
    catch (error) { return fail('DIFFERENCE_ALIGNMENT', String(error), ['edit']); }
    const variantId = createId(this.readIndex());
    const destination = this.path(assetId, variantId, 'aligned.png');
    try {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await renderAligned(sourcePath, placement));
      const variant: AssetVariant = { id: variantId, parentId: sourceVariantId, role: 'transparent',
        files: [{ path: 'aligned.png', bytes: (await stat(destination)).size, mime: 'image/png', role: 'entry' }],
        entry: 'aligned.png', metadata: { width: targetCanvas.width, height: targetCanvas.height, hasAlpha: true },
        canvas: targetCanvas, processing: null, targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null };
      const prepared = { preparationId: createId(this.readIndex()), assetId, variantId, variant };
      this.alignments.set(prepared.preparationId, prepared);
      return ok(prepared);
    } catch (error) {
      await rm(dirname(destination), { recursive: true, force: true });
      return fail('DIFFERENCE_ALIGNMENT', String(error), ['retry']);
    }
  }

  prepareAlignmentIndexEdit(preparationId: Id, activate: boolean): Result<PreparedIndexEdit> {
    const prepared = this.alignments.get(preparationId);
    if (!prepared) return fail('PREPARATION_MISSING', '差分对齐准备项不存在');
    const index = this.readIndex();
    const assets = structuredClone(index.data.assets);
    const asset = assets.find(value => value.id === prepared.assetId);
    if (!asset || !asset.variants.some(value => value.id === prepared.variant.parentId))
      return fail('IMAGE_VARIANT_MISSING', '来源版本已变化', ['compare']);
    asset.variants.push(structuredClone(prepared.variant));
    if (activate) asset.activeVariantId = prepared.variantId;
    asset.revision++;
    asset.modifiedAt = new Date().toISOString();
    return indexEdit(index, assets, [asset.id]);
  }

  confirmAlignment(preparationId: Id): void { this.alignments.delete(preparationId); }
  async discardAlignment(preparationId: Id): Promise<void> {
    const prepared = this.alignments.get(preparationId);
    if (!prepared) return;
    this.alignments.delete(preparationId);
    await rm(join(this.projectRoot, 'assets', 'files', prepared.assetId, prepared.variantId), { recursive: true, force: true });
  }

  private async prepareMask(assetId: Id, sourceVariantId: Id, mask: Uint8Array, featherPx: number, expandPx: number,
    toolId: string, toolVersion: string, providedImage: string | null, canvas: AssetVariant['canvas'],
    crop?: { x: number; y: number; width: number; height: number }): Promise<PreparedImage> {
    const asset = this.readIndex().data.assets.find(value => value.id === assetId)!;
    const source = asset.variants.find(value => value.id === sourceVariantId)!;
    const inputPath = this.path(assetId, sourceVariantId, source.entry);
    const observed = await inspectAlpha(inputPath);
    const maskId = createId(this.readIndex());
    const imageId = createId(this.readIndex());
    const maskPath = this.path(assetId, maskId, 'mask.png');
    const imagePath = this.path(assetId, imageId, 'transparent.png');
    let pixels = providedImage ? await readFile(providedImage) :
      await composeAlpha(inputPath, mask, source.role === 'transparent' ? 'existingAlpha' : 'original');
    let outputCanvas = canvas ?? { width: observed.width, height: observed.height, offsetX: 0, offsetY: 0 };
    if (crop) {
      if (![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger) || crop.x < 0 || crop.y < 0 ||
          crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > observed.width || crop.y + crop.height > observed.height)
        throw new Error('裁切范围不在原画布内');
      const sharp = (await import('sharp')).default;
      pixels = await sharp(pixels).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).png().toBuffer();
      mask = Uint8Array.from(await sharp(mask, { raw: { width: observed.width, height: observed.height, channels: 1 } })
        .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).raw().toBuffer());
      outputCanvas = { width: crop.width, height: crop.height, offsetX: outputCanvas.offsetX + crop.x, offsetY: outputCanvas.offsetY + crop.y };
    }
    try {
      await mkdir(dirname(maskPath), { recursive: true });
      await mkdir(dirname(imagePath), { recursive: true });
      await writeFile(maskPath, await encodeMask(mask, outputCanvas.width, outputCanvas.height));
      await writeFile(imagePath, pixels);
      const processing: Processing = { toolId, toolVersion, inputVariantId: sourceVariantId,
        settings: { kind: 'mask', maskVariantId: maskId, featherPx, expandPx } };
      const maskVariant: AssetVariant = { id: maskId, parentId: sourceVariantId, role: 'mask',
        files: [{ path: 'mask.png', bytes: (await stat(maskPath)).size, mime: 'image/png', role: 'entry' }], entry: 'mask.png',
        metadata: { width: outputCanvas.width, height: outputCanvas.height }, canvas: outputCanvas,
        processing: null, targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null };
      const transparent: AssetVariant = { id: imageId, parentId: sourceVariantId, role: 'transparent',
        files: [{ path: 'transparent.png', bytes: (await stat(imagePath)).size, mime: 'image/png', role: 'entry' }], entry: 'transparent.png',
        metadata: { width: outputCanvas.width, height: outputCanvas.height, hasAlpha: true }, canvas: outputCanvas,
        processing, targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null };
      const prepared: PreparedImage = { preparationId: createId(this.readIndex()), assetId, maskVariantId: maskId,
        transparentVariantId: imageId, mask: maskVariant, transparent, result: 'processed' };
      this.pending.set(prepared.preparationId, prepared);
      return prepared;
    } catch (error) {
      await Promise.all([rm(dirname(maskPath), { recursive: true, force: true }), rm(dirname(imagePath), { recursive: true, force: true })]);
      throw error;
    }
  }

  prepareIndexEdit(preparationId: Id, activate: boolean): Result<PreparedIndexEdit> {
    const prepared = this.pending.get(preparationId);
    if (!prepared) return fail('PREPARATION_MISSING', '透明版本准备项不存在');
    if (this.selectedAssets.has(preparationId)) return fail('PREPARATION_SCOPE', '透明版本已准备为独立素材');
    const index = this.readIndex();
    const assets = structuredClone(index.data.assets);
    const asset = assets.find(value => value.id === prepared.assetId);
    if (!asset || !asset.variants.some(value => value.id === prepared.transparent.parentId))
      return fail('IMAGE_VARIANT_MISSING', '来源版本已变化', ['compare']);
    asset.variants.push(structuredClone(prepared.mask), structuredClone(prepared.transparent));
    if (activate) asset.activeVariantId = prepared.transparentVariantId;
    asset.revision++;
    asset.modifiedAt = new Date().toISOString();
    return indexEdit(index, assets, [asset.id]);
  }

  async prepareSelectedRefsIndexEdit(preparationId: Id, selectedRefs: SelectedImageRef[]): Promise<Result<PreparedSelectedImage>> {
    const prepared = this.pending.get(preparationId);
    if (!prepared) return fail('PREPARATION_MISSING', '透明版本准备项不存在');
    if (this.selectedAssets.has(preparationId)) return fail('PREPARATION_SCOPE', '透明版本已准备为独立素材');
    if (!selectedRefs.length || selectedRefs.some(ref => ref.assetId !== prepared.assetId || !ref.source))
      return fail('IMAGE_REPLACEMENT_SCOPE', '请选择当前素材的实际引用位置');
    const refKeys = selectedRefs.map(ref => JSON.stringify([ref.owner, ref.source.documentId,
      ref.source.statementId, ref.source.field, ref.source.range]));
    if (new Set(refKeys).size !== refKeys.length) return fail('IMAGE_REPLACEMENT_SCOPE', '所选引用位置重复');
    const versions = new Map<Id, number>();
    for (const ref of selectedRefs) {
      const revision = versions.get(ref.source.documentId);
      if (revision !== undefined && revision !== ref.source.revision)
        return fail('IMAGE_REPLACEMENT_SCOPE', '所选引用的来源版本不一致', ['compare']);
      versions.set(ref.source.documentId, ref.source.revision);
    }
    const index = this.readIndex();
    if (versions.has(index.documentId) && versions.get(index.documentId) !== index.revision)
      return fail('IMAGE_REPLACEMENT_SCOPE', '素材索引引用版本已变化', ['compare']);
    const original = index.data.assets.find(asset => asset.id === prepared.assetId);
    if (!original || !original.variants.some(variant => variant.id === prepared.transparent.parentId))
      return fail('IMAGE_VARIANT_MISSING', '来源版本已变化', ['compare']);
    const assetId = createId(this.readIndex());
    const ids = new Map(original.variants.map(variant => [variant.id, createId(this.readIndex())]));
    const remap = (variant: AssetVariant): AssetVariant => ({ ...structuredClone(variant),
      id: ids.get(variant.id) ?? variant.id,
      parentId: variant.parentId ? ids.get(variant.parentId) ?? variant.parentId : null,
      processing: variant.processing ? { ...variant.processing,
        inputVariantId: ids.get(variant.processing.inputVariantId) ?? variant.processing.inputVariantId,
        settings: variant.processing.settings.kind === 'mask'
          ? { ...variant.processing.settings, maskVariantId: ids.get(variant.processing.settings.maskVariantId) ??
            variant.processing.settings.maskVariantId } : variant.processing.settings } : null });
    const now = new Date().toISOString();
    const asset = { ...structuredClone(original), id: assetId, revision: 1, name: `${original.name} 透明版`,
      originalVariantId: ids.get(original.originalVariantId)!, activeVariantId: prepared.transparentVariantId,
      variants: [...original.variants.map(remap), remap(prepared.mask), remap(prepared.transparent)],
      createdAt: now, modifiedAt: now };
    const planned = indexEdit(index, [...index.data.assets, asset], [assetId]);
    if (!planned.ok) return planned;
    planned.value.expected.push(...[...versions].map(([documentId, revision]) =>
      ({ ref: { kind: 'document' as const, id: documentId }, revision }))
      .filter(value => value.ref.id !== index.documentId));
    const files = [...original.variants.flatMap(variant => variant.files.map(file =>
      assetFilePath(assetId, ids.get(variant.id)!, file.path))),
    ...[prepared.mask, prepared.transparent].flatMap(variant => variant.files.map(file =>
      assetFilePath(assetId, variant.id, file.path)))];
    const oldMask = join(this.projectRoot, 'assets', 'files', prepared.assetId, prepared.maskVariantId);
    const oldTransparent = join(this.projectRoot, 'assets', 'files', prepared.assetId, prepared.transparentVariantId);
    const newRoot = join(this.projectRoot, 'assets', 'files', assetId);
    let maskMoved = false;
    let transparentMoved = false;
    try {
      for (const variant of original.variants) for (const file of variant.files) {
        const destination = this.path(assetId, ids.get(variant.id)!, file.path);
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(this.path(original.id, variant.id, file.path), destination);
      }
      await mkdir(newRoot, { recursive: true });
      await rename(oldMask, join(newRoot, prepared.maskVariantId));
      maskMoved = true;
      await rename(oldTransparent, join(newRoot, prepared.transparentVariantId));
      transparentMoved = true;
    } catch (error) {
      if (transparentMoved) await rename(join(newRoot, prepared.transparentVariantId), oldTransparent);
      if (maskMoved) await rename(join(newRoot, prepared.maskVariantId), oldMask);
      await rm(newRoot, { recursive: true, force: true });
      return fail('IMAGE_COPY_FAILED', `独立透明素材准备失败：${String(error)}`, ['retry']);
    }
    this.selectedAssets.set(preparationId, assetId);
    return ok({ assetId, variantId: prepared.transparentVariantId, edit: planned.value, files,
      replacements: selectedRefs.map(before => ({ before,
        after: { assetId, variantId: before.variantId === null ? null : prepared.transparentVariantId } })) });
  }

  confirm(preparationId: Id): void { this.pending.delete(preparationId); this.selectedAssets.delete(preparationId); }
  async discard(preparationId: Id): Promise<void> {
    const prepared = this.pending.get(preparationId);
    if (!prepared) return;
    this.pending.delete(preparationId);
    const selectedAssetId = this.selectedAssets.get(preparationId);
    this.selectedAssets.delete(preparationId);
    if (selectedAssetId) await rm(join(this.projectRoot, 'assets', 'files', selectedAssetId), { recursive: true, force: true });
    await Promise.all([prepared.maskVariantId, prepared.transparentVariantId].map(id =>
      rm(join(this.projectRoot, 'assets', 'files', prepared.assetId, id), { recursive: true, force: true })));
  }
}
