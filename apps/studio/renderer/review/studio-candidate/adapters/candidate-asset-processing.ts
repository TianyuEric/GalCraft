import { AssetSchema, createId, type Asset, type AssetReference, type AssetVariant, type BackgroundAdoptionScope, type DocumentView, type Id, type Issue, type Json, type Result, type StudioBridge } from '@galcraft/contracts';
import type { ProcessorCandidate } from '@galcraft/assets/processing';
import { assetReferenceKey, candidateAssetReferencePatches, candidateAssetReferences } from './candidate-asset-references.js';
import type { CandidateHost } from '../application/session.js';

type AssetPort = StudioBridge['assets'];
type Processing = Pick<AssetPort, 'removeBackground' | 'confirmBackground' | 'discardBackground' | 'processorCatalog' | 'processResource' |
  'cancelResource' | 'resourceCandidates' | 'previewResource' | 'confirmResource' | 'discardResource'>;
type Prepared = { record: ProcessorCandidate; uri: string; fromProcessor: boolean; references: AssetReference[] };
const processorKey = 'org.galcraft.review/边缘颜色透明化';
const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const fail = (code: string, message: string): Result<never> => {
  const error: Issue = { code, message, severity: 'error', owner: 'M04', related: [], actions: ['retry'] };
  return { ok: false, error, issues: [error] };
};
const data = <T>(document: DocumentView, path: string) => (JSON.parse(document.files[path]!) as { data: T }).data;

/** Candidate-only color key based on the corner color and its connected edge pixels. */
async function reviewTransparency(uri: string) {
  const image = new Image(); image.src = uri;
  await image.decode();
  const { naturalWidth: width, naturalHeight: height } = image;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('当前浏览器无法创建图像处理画布。');
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height), rgba = pixels.data;
  const reference = [rgba[0]!, rgba[1]!, rgba[2]!];
  const visited = new Uint8Array(width * height), queue = new Uint32Array(width * height);
  let read = 0, end = 0, changed = 0;
  const visit = (pixel: number) => {
    if (visited[pixel]) return;
    visited[pixel] = 1;
    const at = 4 * pixel;
    if (rgba[at + 3] && reference.some((value, channel) => Math.abs(rgba[at + channel]! - value) > 24)) return;
    queue[end++] = pixel;
    if (rgba[at + 3]) { rgba[at + 3] = 0; changed++; }
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (read < end) {
    const pixel = queue[read++]!;
    if (pixel % width) visit(pixel - 1);
    if (pixel % width < width - 1) visit(pixel + 1);
    if (pixel >= width) visit(pixel - width);
    if (pixel < (height - 1) * width) visit(pixel + width);
  }
  if (!changed || changed === width * height) return null;
  context.putImageData(pixels, 0, 0);
  const outputUri = canvas.toDataURL('image/png');
  if (!outputUri.startsWith('data:image/png;')) throw new Error('当前浏览器无法按原尺寸导出透明版本。');
  return { uri: outputUri, width, height };
}

/** The processing candidate adopts variant bytes and the index in one shared document transaction. */
export function createCandidateAssetProcessing(host: CandidateHost, assets: Pick<AssetPort, 'get' | 'preview'>): Processing {
  const prepared = new Map<Id, Prepared>(), running = new Map<Id, { cancelled: boolean }>();
  const prepare = async (assetId: Id, sourceVariantId: Id, fromProcessor: boolean) => {
    const asset = await assets.get(assetId); if (!asset.ok) return asset;
    const source = asset.value?.variants.find(variant => variant.id === sourceVariantId);
    if (asset.value?.kind !== 'image' || !source) return fail('CANDIDATE_PROCESSOR_INPUT', '审核透明化只接受可读取的图像版本。');
    const preview = await assets.preview(assetId, sourceVariantId); if (!preview.ok) return preview;
    try {
      const processed = await reviewTransparency(preview.value.uri);
      if (!processed) return ok(null);
      const preparationId = createId([prepared]), variantId = createId([asset.value.variants]);
      const variant: AssetVariant = { id: variantId, parentId: sourceVariantId, role: 'transparent',
        files: [{ path: 'transparent.png', role: 'primary', mime: 'image/png', bytes: atob(processed.uri.split(',')[1]!).length }], entry: 'transparent.png',
        metadata: { width: processed.width, height: processed.height, hasAlpha: true, hasTransparency: true },
        processing: null, canvas: source.canvas, targets: { web: 'direct' }, groupCapabilities: null };
      return ok({ fromProcessor, references: candidateAssetReferences(host.graphDocuments(), assetId), uri: processed.uri, record: { preparationId, assetId, sourceVariantId, variant,
        assetRevision: asset.value.revision, processorKey, packageVersion: '0.1.0', metadata: { algorithm: 'corner color, connected edge pixels, tolerance 24' } } } satisfies Prepared);
    } catch (reason) { return fail('CANDIDATE_PROCESSOR_FAILED', reason instanceof Error ? reason.message : String(reason)); }
  };
  const adopt = (id: Id, scope: BackgroundAdoptionScope = 'allFloating') => {
    const candidate = prepared.get(id);
    if (!candidate) return fail('CANDIDATE_PROCESSOR_MISSING', '处理候选已失效。');
    const { assetId, sourceVariantId, assetRevision, variant } = candidate.record;
    const documents = host.list();
    const index = documents.find(item => item.files['assets/index.json']), resources = documents.find(item => item.files['candidate/resources.json']);
    if (!index || !resources) return fail('CANDIDATE_PROCESSOR_DOCUMENT', '作品缺少素材索引或审核资源文档。');
    const before = data<{ assets: Asset[] }>(index, 'assets/index.json').assets;
    const asset = before.find(item => item.id === assetId);
    if (asset?.revision !== assetRevision || !asset.variants.some(item => item.id === sourceVariantId))
      return fail('CANDIDATE_PROCESSOR_STALE', '素材已变化，请重新准备处理候选。');
    const currentRefs = candidateAssetReferences(host.graphDocuments(), assetId);
    const keys = (refs: AssetReference[]) => refs.map(item => item.source ? assetReferenceKey(item.source) : item.owner.id).sort().join('|');
    if (keys(candidate.references) !== keys(currentRefs)) return fail('CANDIDATE_PROCESSOR_STALE', '引用已变化，请重新准备处理候选。');
    const newAsset = typeof scope === 'object';
    const adoptedId = newAsset ? createId(before) : assetId;
    const adoptedVariant = newAsset ? { ...variant, parentId: null } : variant;
    const updated = AssetSchema.parse(newAsset ? {
      ...asset, id: adoptedId, name: asset.name.replace(/(\.[^.]+)?$/, ' · 透明.png'), revision: 1, originalVariantId: variant.id,
      activeVariantId: variant.id, variants: [adoptedVariant], modifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    } : { ...asset, revision: asset.revision + 1, activeVariantId: scope === 'allFloating' ? variant.id : asset.activeVariantId,
      variants: [...asset.variants, variant] });
    const locations = data<{ locations: Record<string, string> }>(resources, 'candidate/resources.json').locations;
    let referencePatches: import('@galcraft/contracts').EditInput['patches'] = [];
    if (newAsset) {
      const chosen = scope.sources.map(source => currentRefs.find(reference => reference.source && assetReferenceKey(reference.source) === assetReferenceKey(source)));
      if (!chosen.length || chosen.some(item => !item) || new Set(chosen).size !== chosen.length)
        return fail('CANDIDATE_PROCESSOR_SCOPE', '请选择仍有效且互不重复的引用。');
      if (scope.sources.some(source => host.sourceIsInvalid(source.documentId)))
        return fail('CANDIDATE_PROCESSOR_SOURCE', '所选场景有待修复的原文，引用仍保留在当前素材。');
      try { referencePatches = candidateAssetReferencePatches(documents, chosen as AssetReference[], adoptedId, variant.id); }
      catch (reason) { return fail('CANDIDATE_PROCESSOR_SCOPE', reason instanceof Error ? reason.message : String(reason)); }
    }
    const expected = new Set([index.documentId, resources.documentId, ...referencePatches.map(patch => patch.documentId)]);
    const receipt = host.commit({ label: `采用审核透明版本 · ${asset.name}`, origin: 'candidate',
      expected: documents.filter(item => expected.has(item.documentId)).map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
      patches: [{ kind: 'json', documentId: index.documentId, changes: [{ path: '/data/assets', op: 'set', before, after: newAsset ? [...before, updated] : before.map(item => item.id === assetId ? updated : item) }] },
        { kind: 'json', documentId: resources.documentId, changes: [{ path: '/data/locations', op: 'set', before: locations, after: { ...locations, [`${adoptedId}/${variant.id}`]: candidate.uri } }] },
        ...referencePatches],
      preparedAssets: [], requiredRefs: [{ kind: 'asset', id: assetId }] });
    if (receipt.ok) prepared.delete(id);
    return receipt.ok ? ok({ receipt: receipt.value, variantId: variant.id, assetId: adoptedId }) : receipt;
  };
  const discard = async (id: Id) => { prepared.delete(id); return ok(undefined); };
  return {
    async removeBackground({ assetId, sourceVariantId, declared }) {
      if (declared === 'unchanged') return ok({ status: 'unchanged' });
      const result = await prepare(assetId, sourceVariantId, false); if (!result.ok) return result;
      if (!result.value) return ok({ status: 'needsReview' });
      const candidate = result.value; prepared.set(candidate.record.preparationId, candidate);
      return ok({ status: 'prepared', preparationId: candidate.record.preparationId, previewUri: candidate.uri, transparentVariantId: candidate.record.variant.id,
        references: candidate.references.flatMap(item => item.source ? [{ source: item.source, variantId: item.variantId, label: item.usage }] : []) });
    },
    async confirmBackground(id, scope) {
      const result = adopt(id, scope); if (!result.ok) return result;
      return ok({ assetId: result.value.assetId, transparentVariantId: result.value.variantId,
        save: { transactionId: result.value.receipt.groupId, saved: [], remainingDirty: result.value.receipt.dirty } });
    },
    discardBackground: discard,
    async processorCatalog() { return ok([{ key: processorKey, packageVersion: '0.1.0', inputKinds: ['image'], outputKinds: ['image'], fields: [], supportsCancel: true }]); },
    async processResource(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.processorKey !== processorKey ||
        typeof value.assetId !== 'string' || typeof value.sourceVariantId !== 'string' || typeof value.operationId !== 'string')
        return fail('CANDIDATE_PROCESSOR_INPUT', '缺少审核处理器、素材或操作身份。');
      const operation = { cancelled: false }; running.set(value.operationId, operation);
      try {
        const result = await prepare(value.assetId, value.sourceVariantId, true); if (!result.ok) return result;
        if (operation.cancelled) return fail('CANDIDATE_PROCESSOR_CANCELLED', '已取消审核透明化处理。');
        if (!result.value) return fail('CANDIDATE_PROCESSOR_REVIEW', '边缘色处理没有生成可采用的像素结果，请选择其他图像。');
        prepared.set(result.value.record.preparationId, result.value);
        return ok({ preparationId: result.value.record.preparationId });
      } finally { running.delete(value.operationId); }
    },
    async cancelResource(id) { const operation = running.get(id); if (operation) operation.cancelled = true; return ok(undefined); },
    async resourceCandidates() { return ok([...prepared.values()].filter(item => item.fromProcessor).map(item => item.record as Json)); },
    async previewResource(id) { const candidate = prepared.get(id); return candidate ? ok({ leaseId: createId(), uri: candidate.uri, mime: 'image/png', bytes: candidate.record.variant.files[0]!.bytes }) : fail('CANDIDATE_PROCESSOR_MISSING', '处理候选已失效。'); },
    async confirmResource(input) { const result = adopt(input.preparationId, input.activate === false ? 'keepCurrent' : 'allFloating'); return result.ok ? ok(result.value.receipt) : result; },
    discardResource: discard,
  };
}
