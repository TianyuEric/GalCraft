import { createId } from '@galcraft/contracts';
import { suggestedAssetName } from './naming.js';

import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { Asset, AssetReference, Id, Issue, Patch, Result, Source, VersionRef } from '@galcraft/contracts';
import { assetFilePath, indexEdit } from './catalog.js';
import { inspectFile } from './import.js';
import type { SVGDecoder } from './svg.js';
import { fail, ok } from './result.js';
import type { AssetIndex } from './types.js';

export type UIReplacementRef = AssetReference & { source: Source };
export type UIAssetAdoption = { key: string; source: { assetId: Id; variantId: Id } | null;
  destination: 'newAsset' | 'newVariant'; replace: { mode: 'none' | 'selected' | 'all'; refs: UIReplacementRef[] } };
export type PrepareUIAssetAdoption = { projectId: Id; choice: UIAssetAdoption;
  use?: 'icon' | 'frame' | 'background' | 'texture' | 'logo' | 'decoration';
  candidate: { taskId: Id; candidateId: Id; artifactIndex: number; path: string; name: string };
  expected: VersionRef[] };
export type PreparedUIAssetAdoption = { preparationId: Id; key: string; assetId: Id; variantId: Id;
  indexPatches: Patch[]; replacementRefs: UIReplacementRef[]; expected: VersionRef[];
  requiredRefs: AssetReference['owner'][]; issues: Issue[] };

function refKey(ref: UIReplacementRef): string {
  return JSON.stringify([ref.assetId, ref.variantId, ref.owner.kind, ref.owner.id, ref.source.documentId,
    ref.source.statementId, ref.source.field, ref.source.range?.start, ref.source.range?.end, ref.source.revision]);
}
function sameRefs(a: UIReplacementRef[], b: UIReplacementRef[]): boolean {
  const left = a.map(refKey).sort();
  const right = b.map(refKey).sort();
  return left.length === right.length && left.every((key, i) => key === right[i]);
}

export class UIAssetAdoptionCoordinator {
  private readonly prepared = new Map<Id, { assetId: Id; variantIds: Id[]; name: string }>();
  constructor(private readonly projectRoot: string, private readonly toolDirectory: string,
    private readonly readIndex: () => AssetIndex,
    private readonly currentRefs: (assetId: Id) => UIReplacementRef[] | Promise<UIReplacementRef[]>,
    private readonly currentScopeVersions?: () => VersionRef[],
    private readonly svgDecoder?: SVGDecoder) {}

  async prepareUIAssetAdoption(input: PrepareUIAssetAdoption,
    canPinVariant: (ref: UIReplacementRef) => boolean = () => false): Promise<Result<PreparedUIAssetAdoption>> {
    const index = this.readIndex();
    const indexVersions = input.expected.filter(value => value.ref.kind === 'document' && value.ref.id === index.documentId);
    if (indexVersions.length !== 1 || indexVersions[0]!.revision !== index.revision)
      return fail('UI_INDEX_CHANGED', '素材索引版本未冻结或已变化', ['compare']);
    const { choice } = input;
    const original = choice.source ? index.data.assets.find(asset => asset.id === choice.source!.assetId) : null;
    const sourceVersion = original?.variants.find(value => value.id === choice.source?.variantId);
    if (choice.source && (!original || !sourceVersion)) return fail('UI_SOURCE_CHANGED', '源素材版本已变化', ['compare']);
    if (!choice.source && (choice.destination !== 'newAsset' || choice.replace.mode !== 'none' || choice.replace.refs.length))
      return fail('UI_ADOPTION_SCOPE', '全新素材只能先以无替换范围入库');
    if (choice.destination === 'newVariant' && !original) return fail('UI_SOURCE_REQUIRED', '追加版本需要源素材');
    if (choice.replace.mode === 'none' && choice.replace.refs.length ||
      choice.replace.mode === 'selected' && !choice.replace.refs.length)
      return fail('UI_ADOPTION_SCOPE', '引用范围与选中引用不一致');
    const actual = original ? await this.currentRefs(original.id) : [];
    if (choice.replace.mode === 'all' && !sameRefs(choice.replace.refs, actual))
      return fail('UI_REFS_CHANGED', '完整反向引用集合已变化', ['compare']);
    if (choice.replace.mode === 'all') {
      if (!this.currentScopeVersions) return fail('UI_SCOPE_UNAVAILABLE', '无法冻结完整引用来源范围', ['retry']);
      const expectedScope = new Map(input.expected.map(value => [`${value.ref.kind}/${value.ref.id}`, value.revision]));
      if (this.currentScopeVersions().some(value => expectedScope.get(`${value.ref.kind}/${value.ref.id}`) !== value.revision))
        return fail('UI_SCOPE_CHANGED', '完整引用来源或目录成员版本已变化', ['compare']);
    }
    if (choice.replace.refs.some(ref => !choice.source || ref.assetId !== choice.source.assetId ||
      !actual.some(value => refKey(value) === refKey(ref))))
      return fail('UI_REFS_CHANGED', '所选引用位置或当前值已变化', ['compare']);
    if (choice.destination === 'newVariant' && choice.replace.mode === 'selected' &&
      choice.replace.refs.some(ref => ref.variantId === null && !canPinVariant(ref)))
      return fail('UI_FLOATING_REF', '该位置只有浮动素材引用，请改用独立素材或确认全部引用', ['chooseTarget']);
    const revisions = new Map(input.expected.map(value => [`${value.ref.kind}/${value.ref.id}`, value.revision]));
    for (const ref of choice.replace.refs) {
      if (revisions.get(`document/${ref.source.documentId}`) !== ref.source.revision)
        return fail('UI_SOURCE_CHANGED', '引用来源文档版本已变化', ['compare']);
    }
    if (choice.replace.mode === 'all') for (const ref of actual) {
      if (revisions.get(`document/${ref.source.documentId}`) !== ref.source.revision)
        return fail('UI_SOURCE_CHANGED', '完整引用来源文档版本未冻结', ['compare']);
    }
    const inspected = await inspectFile(input.candidate.path, this.toolDirectory);
    if (!inspected.ok) return inspected;
    if (inspected.value.kind !== 'image') return fail('UI_ASSET_KIND', 'UI 静态素材必须是图像');
    if (extname(input.candidate.path).toLowerCase() === '.svg') {
      if (!this.svgDecoder) return fail('SVG_DECODE_UNAVAILABLE', 'SVG 采用需要图像解码器', ['retry']);
      const decoded = await this.svgDecoder(await readFile(input.candidate.path, 'utf8'));
      if (!decoded.ok) return decoded;
    }
    const assetId = choice.destination === 'newVariant' ? original!.id : createId(this.readIndex());
    const variantId = createId(this.readIndex());
    const preparationId = createId(this.readIndex());
    const copiedVariants = choice.destination === 'newAsset' && original ? new Map(original.variants.map(value => [value.id, createId(this.readIndex())])) : null;
    if (copiedVariants && sourceVersion && !copiedVariants.has(sourceVersion.id)) return fail('UI_SOURCE_CHANGED', '源版本不存在');
    const parentId = choice.destination === 'newVariant' ? sourceVersion?.id ?? null
      : sourceVersion ? copiedVariants!.get(sourceVersion.id)! : null;
    const outputFile = suggestedAssetName({ usage: 'ui', sceneName: basename(input.candidate.name, extname(input.candidate.name)), extension: extname(input.candidate.path).slice(1) }, [...index.data.assets.map(asset => asset.name), ...[...this.prepared.values()].map(value => value.name)]);
    const now = new Date().toISOString();
    const variant: Asset['variants'][number] = { id: variantId, parentId, role: 'original',
      files: [{ path: outputFile, bytes: (await stat(input.candidate.path)).size, mime: inspected.value.mime, role: 'entry' }],
      entry: outputFile, metadata: inspected.value.metadata,
      canvas: inspected.value.metadata.width && inspected.value.metadata.height ? { width: inspected.value.metadata.width,
        height: inspected.value.metadata.height, offsetX: 0, offsetY: 0 } : null,
      processing: null, targets: inspected.value.targets, groupCapabilities: null };
    const next: Asset = choice.destination === 'newVariant' ? { ...original!, revision: original!.revision + 1,
      activeVariantId: choice.replace.mode === 'all' ? variantId : original!.activeVariantId,
      variants: [...original!.variants, variant], modifiedAt: now }
      : original ? { ...original, id: assetId, revision: 1, name: outputFile,
        originalVariantId: copiedVariants!.get(original.originalVariantId)!, activeVariantId: variantId,
        variants: [...original.variants.map(value => ({ ...structuredClone(value), id: copiedVariants!.get(value.id)!,
          parentId: value.parentId ? copiedVariants!.get(value.parentId)! : null,
          processing: value.processing ? { ...value.processing, inputVariantId: copiedVariants!.get(value.processing.inputVariantId)!,
            settings: value.processing.settings.kind === 'mask' ? { ...value.processing.settings,
              maskVariantId: copiedVariants!.get(value.processing.settings.maskVariantId)! } : value.processing.settings } : null })), variant],
        source: { kind: 'generation', description: input.candidate.name, usage: 'localReview', taskId: input.candidate.taskId },
        createdAt: now, modifiedAt: now }
      : { id: assetId, revision: 1, name: outputFile, kind: 'image', folder: [], tags: [], locales: [],
        characterId: null, sceneIds: [], groupId: null, originalVariantId: variantId, activeVariantId: variantId,
        variants: [variant], sourceName: outputFile, source: { kind: 'generation', description: input.candidate.name,
          usage: 'localReview', taskId: input.candidate.taskId }, createdAt: now, modifiedAt: now };
    if (input.use) next.tags = [...new Set([...next.tags, `ui:${input.use}`])];
    try {
      if (copiedVariants && original) {
        for (const value of original.variants) for (const file of value.files) {
          const from = join(this.projectRoot, ...assetFilePath(original.id, value.id, file.path).split('/'));
          const to = join(this.projectRoot, ...assetFilePath(assetId, copiedVariants.get(value.id)!, file.path).split('/'));
          await mkdir(dirname(to), { recursive: true });
          await copyFile(from, to);
        }
      }
      const targetFile = join(this.projectRoot, ...assetFilePath(assetId, variantId, outputFile).split('/'));
      await mkdir(dirname(targetFile), { recursive: true });
      await copyFile(input.candidate.path, targetFile);
    } catch (error) {
      for (const id of [...(copiedVariants?.values() ?? []), variantId])
        await rm(join(this.projectRoot, 'assets', 'files', assetId, id), { recursive: true, force: true });
      return fail('UI_COPY_FAILED', `素材文件复制失败：${String(error)}`, ['retry']);
    }
    const edit = indexEdit(index, index.data.assets.some(value => value.id === assetId)
      ? index.data.assets.map(value => value.id === assetId ? next : value) : [...index.data.assets, next], [assetId]);
    if (!edit.ok) return edit;
    this.prepared.set(preparationId, { name: outputFile, assetId, variantIds: [...(copiedVariants?.values() ?? []), variantId] });
    const expected = new Map(input.expected.map(value => [`${value.ref.kind}/${value.ref.id}`, value]));
    expected.set(`document/${index.documentId}`, edit.value.expected[0]!);
    return ok({ preparationId, key: choice.key, assetId, variantId, indexPatches: edit.value.indexPatches,
      replacementRefs: choice.replace.refs, expected: [...expected.values()],
      requiredRefs: choice.replace.refs.map(ref => ref.owner), issues: [] });
  }
  confirm(preparationId: Id): void { this.prepared.delete(preparationId); }
  async discard(preparationId: Id): Promise<void> {
    const entry = this.prepared.get(preparationId);
    if (!entry) return;
    this.prepared.delete(preparationId);
    for (const id of entry.variantIds)
      await rm(join(this.projectRoot, 'assets', 'files', entry.assetId, id), { recursive: true, force: true });
  }
}
