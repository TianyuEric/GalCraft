import { AssetSchema, AssetReferenceSchema, IdSchema, RevisionSchema, assetReferenceTarget } from '@galcraft/contracts';
import type { Asset, AssetPickerPage, AssetPickerQuery, AssetReference, AssetVariant, Id, Issue, Patch, ResolvedAsset, Result, Target } from '@galcraft/contracts';
import { fail, issue, ok } from './result.js';
import { AssetTypeRegistry } from './type-registry.js';
import { assetNameParts, retainsAssetExtension } from './naming.js';
import type { AssetCollection, AssetIdsResult, AssetIndex, AssetListIdentity, AssetPage, AssetPickerContext,
  AssetQuery, PickerResult, PreparedIndexEdit, ResolveRequest, ResolveResult } from './types.js';

const clone = <T>(value: T): T => structuredClone(value);
const fileRoot = (assetId: Id, variantId: Id) => `assets/files/${assetId}/${variantId}`;
export function assetFilePath(assetId: Id, variantId: Id, path: string): string { return `${fileRoot(assetId, variantId)}/${path}`; }

export function createAssetIndex(documentId: Id): AssetIndex {
  return { schemaVersion: 1, documentId, revision: 1, data: { assets: [] } };
}

export function indexEdit(index: AssetIndex, nextAssets: Asset[], preparedAssets: Id[] = []): Result<PreparedIndexEdit> {
  if (new Set(nextAssets.map(asset => asset.id)).size !== nextAssets.length) return fail('ASSET_DUPLICATE', '素材 ID 重复');
  try { nextAssets.forEach(validateAsset); }
  catch (error) { return fail('ASSET_INDEX_INVALID', String(error)); }
  const patches: Patch[] = [{ kind: 'json', documentId: index.documentId,
    changes: [{ path: '/data/assets', before: clone(index.data.assets), after: clone(nextAssets), op: 'set' }] }];
  return ok({ indexPatches: patches, expected: [{ ref: { kind: 'document', id: index.documentId }, revision: index.revision }],
    requiredRefs: [], preparedAssets });
}

export class AssetCatalog {
  private index: AssetIndex;
  private readonly referencesByDocument = new Map<Id, AssetReference[]>();
  private readonly localesByDocument = new Map<Id, Map<Id, string[]>>();
  private readonly scenesByDocument = new Map<Id, Id>();

  constructor(index: AssetIndex, readonly types: AssetTypeRegistry = new AssetTypeRegistry()) { this.index = validateIndex(index); }
  replaceIndex(index: AssetIndex): void { this.index = validateIndex(index); }
  snapshot(): AssetIndex { return clone(this.index); }
  get(assetId: Id): Asset | null { return clone(this.index.data.assets.find(asset => asset.id === assetId) ?? null); }

  documentChanged(documentId: Id, references: AssetReference[], linkedLocales: ReadonlyMap<Id, string[]> = new Map(), sceneId: Id | null = null): void {
    this.referencesByDocument.set(documentId, references.map(ref => AssetReferenceSchema.parse(ref)));
    this.localesByDocument.set(documentId, new Map([...linkedLocales].map(([id, locales]) => [id, [...locales]])));
    if (sceneId) this.scenesByDocument.set(documentId, sceneId); else this.scenesByDocument.delete(documentId);
  }
  removeDocument(documentId: Id): void { this.referencesByDocument.delete(documentId); this.localesByDocument.delete(documentId); this.scenesByDocument.delete(documentId); }
  rebuildReferences(byDocument: ReadonlyMap<Id, { references: AssetReference[]; linkedLocales: ReadonlyMap<Id, string[]>; sceneId?: Id | null }>): void {
    this.referencesByDocument.clear();
    this.localesByDocument.clear();
    this.scenesByDocument.clear();
    for (const [id, fragment] of byDocument) this.documentChanged(id, fragment.references, fragment.linkedLocales, fragment.sceneId);
  }
  references(assetId: Id): AssetReference[] {
    const references = [...this.referencesByDocument.values()].flat();
    for (const asset of this.index.data.assets) for (const variant of asset.variants) {
      const refs = this.types.references(asset.kind, variant.typeData);
      if (refs.ok) for (const ref of refs.value) {
        const target = assetReferenceTarget(ref, this.index.data.assets);
        if (target) references.push({ ...target, owner: { kind: 'variant', id: variant.id }, usage: asset.kind, required: true });
      }
    }
    return clone(references.filter(ref => ref.assetId === assetId));
  }

  private filtered(query: AssetQuery): Result<Asset[]> {
    if (query.indexRevision !== null && query.indexRevision !== this.index.revision)
      return fail('QUERY_STALE', `素材索引已变为 ${this.index.revision}，请刷新`, ['retry']);
    const direction = query.direction === 'desc' ? -1 : 1;
    const search = query.search.trim().toLocaleLowerCase();
    const typeFields = Object.entries(query.typeFields ?? {});
    if (typeFields.length) {
      const descriptors = this.types.list().filter(item => item.descriptor.key === query.kind).map(item => item.descriptor);
      if (!query.kind || typeFields.some(([path, value]) => !descriptors.some(type => type.filterFields?.includes(path) && type.fields.some(field => field.path === path && typeof value === field.type))))
        return fail('QUERY_TYPE_FIELDS', '专属筛选需要已注册类型声明的字段及对应值');
    }
    const byAsset = new Map<Id, AssetReference[]>();
    for (const fragment of this.referencesByDocument.values()) for (const ref of fragment) {
      const references = byAsset.get(ref.assetId) ?? []; references.push(ref); byAsset.set(ref.assetId, references);
    }
    const assets = this.index.data.assets.filter(asset => {
      const references = byAsset.get(asset.id) ?? [];
      if (query.kind && asset.kind !== query.kind) return false;
      if (query.allowedKinds && !query.allowedKinds.includes(asset.kind)) return false;
      if (!this.supports(asset, query.allowedCapabilities)) return false;
      if (typeFields.length) {
        const data = asset.variants.find(item => item.id === asset.activeVariantId)?.typeData?.value;
        if (typeFields.some(([path, expected]) => { let actual: unknown = data;
          for (const part of path.split('.')) actual = actual && typeof actual === 'object' && !Array.isArray(actual) ? (actual as Record<string, unknown>)[part] : undefined;
          return actual !== expected; })) return false;
      }
      if (query.folder && (query.folder.length > asset.folder.length || query.folder.some((part, i) => asset.folder[i] !== part))) return false;
      if (query.characterId && asset.characterId !== query.characterId) return false;
      if (query.sceneId && !this.matchesScene(asset, query.sceneId, references)) return false;
      if (query.locale && !this.matchesLocale(asset, query.locale)) return false;
      if (query.tags.some(tag => !asset.tags.includes(tag))) return false;
      if (query.usage && !matchesUsage(asset, references, query.usage)) return false;
      if (search && !`${asset.name}\n${asset.sourceName}\n${asset.tags.join(' ')}`.toLocaleLowerCase().includes(search)) return false;
      const used = references.length > 0;
      if (query.reference === 'used' && !used || query.reference === 'unused' && used) return false;
      if (query.review === 'needsReview' && !asset.tags.includes('needsReview')) return false;
      return true;
    });
    assets.sort((a, b) => {
      const left = query.sort === 'size' ? size(a) : query.sort === 'modified' ? a.modifiedAt : a.name;
      const right = query.sort === 'size' ? size(b) : query.sort === 'modified' ? b.modifiedAt : b.name;
      const primary = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
      return primary * direction || a.id.localeCompare(b.id);
    });
    return ok(assets);
  }

  private matchesLocale(asset: Asset, locale: string): boolean {
    return asset.locales.includes(locale) || [...this.localesByDocument.values()].some(byAsset => byAsset.get(asset.id)?.includes(locale));
  }
  private matchesScene(asset: Asset, sceneId: Id, references = [...this.referencesByDocument.values()].flat().filter(ref => ref.assetId === asset.id)): boolean {
    return asset.sceneIds.includes(sceneId) || references.some(ref =>
      ref.owner.kind === 'scene' && ref.owner.id === sceneId || !!ref.source && this.scenesByDocument.get(ref.source.documentId) === sceneId);
  }

  queryAssets(query: AssetQuery): Result<AssetPage> {
    if (!Number.isSafeInteger(query.offset) || query.offset < 0 || !Number.isSafeInteger(query.limit) || query.limit < 0 || query.limit > 100)
      return fail('QUERY_RANGE', 'offset 必须非负，limit 范围为 1～100');
    const filtered = this.filtered(query);
    if (!filtered.ok) return filtered;
    const limit = query.limit || 40;
    return ok({ items: clone(filtered.value.slice(query.offset, query.offset + limit)), total: filtered.value.length,
      offset: query.offset, indexRevision: this.index.revision });
  }
  queryAssetIds(query: AssetQuery): Result<AssetIdsResult> {
    const filtered = this.filtered(query);
    return filtered.ok ? ok({ ids: filtered.value.map(asset => asset.id), indexRevision: this.index.revision }) : filtered;
  }

  describeAssetRows(input: { assetIds: Id[]; indexRevision: number; currentAssetId: Id | null;
    currentVariantId: Id | null; characters?: ReadonlyMap<Id, string> }): Result<{ items: AssetListIdentity[]; missingAssetIds: Id[] }> {
    if (input.indexRevision !== this.index.revision) return fail('QUERY_STALE', '素材索引已变化', ['retry']);
    const byId = new Map(this.index.data.assets.map(asset => [asset.id, asset]));
    const names = new Map<string, number>();
    for (const asset of byId.values()) {
      const key = JSON.stringify([asset.kind, asset.name]);
      names.set(key, (names.get(key) ?? 0) + 1);
    }
    const items: AssetListIdentity[] = [];
    const missingAssetIds: Id[] = [];
    for (const id of input.assetIds) {
      const asset = byId.get(id);
      if (!asset) { missingAssetIds.push(id); continue; }
      const selectedVersion = id === input.currentAssetId && input.currentVariantId ? input.currentVariantId : asset.activeVariantId;
      const variant = asset.variants.find(value => value.id === selectedVersion);
      items.push({ assetId: id, revision: asset.revision, name: asset.name, kind: asset.kind, folder: clone(asset.folder),
        character: asset.characterId ? { id: asset.characterId, name: input.characters?.get(asset.characterId) ?? asset.characterId } : null,
        sameNameCount: names.get(JSON.stringify([asset.kind, asset.name])) ?? 1, sourceName: asset.sourceName,
        createdAt: asset.createdAt, shownVariant: variant ? { id: variant.id, role: variant.role, metadata: clone(variant.metadata),
          active: variant.id === asset.activeVariantId, currentBinding: id === input.currentAssetId && variant.id === selectedVersion } : null,
        currentBindingMissing: id === input.currentAssetId && !variant });
    }
    return ok({ items, missingAssetIds });
  }

  private supports(asset: Asset, capabilities?: string[]): boolean {
    if (!capabilities?.length) return true;
    const variant = asset.variants.find(item => item.id === asset.activeVariantId), type = this.types.definition(asset.kind, variant?.typeData);
    return type.ok && capabilities.every(capability => type.value.definition.capabilities.includes(capability) || variant?.groupCapabilities?.capabilities.includes(capability));
  }
  picker(context: AssetPickerContext, recentIds: Id[] = []): PickerResult {
    const eligible = this.index.data.assets.filter(asset => context.allowedKinds.includes(asset.kind) && this.supports(asset, context.allowedCapabilities));
    const applied: string[] = [];
    const recentEntries = context.tab === 'recent' ? recentIds.map(id => {
      const asset = this.get(id);
      return { assetId: id, asset: asset && context.allowedKinds.includes(asset.kind) && this.supports(asset, context.allowedCapabilities) ? asset : null,
        missing: asset === null, removable: asset === null };
    }).filter(entry => entry.missing || entry.asset !== null) : [];
    const missingRecentIds = recentEntries.filter(entry => entry.missing).map(entry => entry.assetId);
    let items = eligible;
    if (context.tab === 'context') {
      if (context.characterId) { items = items.filter(asset => asset.characterId === context.characterId); applied.push('character'); }
      if (context.sceneId) { items = items.filter(asset => this.matchesScene(asset, context.sceneId!)); applied.push('scene'); }
      if (context.locale) { items = items.filter(asset => this.matchesLocale(asset, context.locale!)); applied.push('locale'); }
    } else if (context.tab === 'recent') {
      items = recentEntries.flatMap(entry => entry.asset ? [entry.asset] : []);
    }
    const currentMissing = !!context.currentAssetId && !this.get(context.currentAssetId);
    const described = context.currentAssetId ? this.describeAssetRows({ assetIds: [context.currentAssetId],
      indexRevision: this.index.revision, currentAssetId: context.currentAssetId, currentVariantId: context.currentVariantId }) : null;
    const current = described?.ok ? described.value.items[0] ?? null : null;
    return { items: clone(items), current, currentMissing, applied, recentEntries, missingRecentIds,
      empty: context.tab === 'recent' && missingRecentIds.length ? null :
        !eligible.length ? this.index.data.assets.length ? 'unsupported' : 'library' : !items.length ? 'filter' : null };
  }
  nextRecentIds(recentIds: Id[], assetId: Id): Id[] {
    return this.get(assetId) ? [assetId, ...recentIds.filter(id => id !== assetId)].slice(0, 30) : recentIds;
  }
  queryPicker(input: AssetPickerQuery, recentIds: Id[] = [], characters?: ReadonlyMap<Id, string>): Result<AssetPickerPage> {
    const { context, query } = input;
    if (!Number.isSafeInteger(query.offset) || query.offset < 0 || !Number.isSafeInteger(query.limit) || query.limit < 0 || query.limit > 100)
      return fail('QUERY_RANGE', 'offset 必须非负，limit 范围为 1～100');
    const picked = this.picker(context, recentIds);
    const filtered = this.filtered({ ...query, allowedKinds: context.allowedKinds, allowedCapabilities: context.allowedCapabilities });
    if (!filtered.ok) return filtered;
    const visible = new Set(picked.items.map(asset => asset.id));
    const eligible = context.tab === 'recent'
      ? picked.items.filter(asset => filtered.value.some(item => item.id === asset.id))
      : filtered.value.filter(asset => visible.has(asset.id));
    const items = clone(eligible.slice(query.offset, query.offset + (query.limit || 40)));
    const rows = this.describeAssetRows({ assetIds: items.map(asset => asset.id), indexRevision: this.index.revision,
      currentAssetId: null, currentVariantId: null, characters });
    const current = context.currentAssetId ? this.describeAssetRows({ assetIds: [context.currentAssetId], indexRevision: this.index.revision,
      currentAssetId: context.currentAssetId, currentVariantId: context.currentVariantId, characters }) : null;
    return ok({ ...picked, items, current: current?.ok ? current.value.items[0] ?? null : picked.current,
      rows: rows.ok ? rows.value.items : [], total: eligible.length, offset: query.offset, indexRevision: this.index.revision,
      empty: picked.empty ?? (!eligible.length && !picked.missingRecentIds.length ? 'filter' : null) });
  }

  resolveAsset(input: ResolveRequest, uri: (asset: Asset, variant: AssetVariant) => string): Result<ResolveResult> {
    const asset = this.index.data.assets.find(value => value.id === input.assetId);
    if (!asset) return fail('ASSET_MISSING', `缺少素材 ${input.assetId}`, ['locate']);
    const variant = asset.variants.find(value => value.id === (input.variantId ?? asset.activeVariantId));
    if (!variant) return fail('VARIANT_MISSING', `缺少素材版本 ${input.variantId ?? asset.activeVariantId}`, ['locate']);
    const type = this.types.validate(asset.kind, variant.typeData, input.target); if (!type.ok) return type;
    if (variant.groupCapabilities?.missingFiles.length) return fail('RESOURCE_GROUP_INCOMPLETE',
      `资源组缺少 ${variant.groupCapabilities.missingFiles.join('、')}`, ['supplyDependency']);
    const status = variant.targets[input.target];
    if (!status || status === 'unverified') return fail('TARGET_UNVERIFIED', `${input.target} 尚未验证此版本播放`, ['convert']);
    const resolved: ResolvedAsset = { assetId: asset.id, name: asset.name, variantId: variant.id, kind: asset.kind, entry: variant.entry,
      files: variant.files.map(file => ({ path: file.path, bytes: file.bytes, mime: file.mime })),
      metadata: clone(variant.metadata), canvas: clone(variant.canvas), provider: type.value.definition.resourceProviderKey ?? variant.groupCapabilities?.resolver ?? null,
      ...(variant.typeData ? { typeData: clone(variant.typeData) } : {}) };
    return ok({ asset: resolved, uri: uri(asset, variant), capabilities: clone(variant.groupCapabilities), playback: status, issues: [] });
  }

  collectAssets(references: AssetReference[], target: Target, options: { includeUnused?: boolean; retained?: { assetId: Id; variantId: Id }[] } = {}): AssetCollection {
    const collectedReferences = clone(references);
    const assets: ResolvedAsset[] = [];
    const files: { path: string; bytes: number }[] = [];
    const issues: Issue[] = [];
    const seen = new Set<string>();
    const requested = options.includeUnused ? this.index.data.assets.flatMap(asset => asset.variants.map(variant => ({ assetId: asset.id, variantId: variant.id, required: true, source: undefined as AssetReference['source'] })))
      : [...references.map(ref => ({ assetId: ref.assetId, variantId: ref.variantId, required: ref.required, source: ref.source })),
        ...(options.retained ?? []).map(value => ({ ...value, required: true, source: undefined as AssetReference['source'] }))];
    for (const ref of requested) {
      const asset = this.index.data.assets.find(value => value.id === ref.assetId);
      const variant = asset?.variants.find(value => value.id === (ref.variantId ?? asset.activeVariantId));
      if (!asset || !variant) {
        const missing = issue('ASSET_MISSING', `缺少素材或版本 ${ref.assetId}/${ref.variantId ?? 'active'}`, ['locate']);
        issues.push({ ...missing, severity: ref.required ? 'error' : 'warning', entity: { kind: 'asset', id: ref.assetId },
          ...(ref.source ? { source: ref.source } : {}) });
        continue;
      }
      const key = `${asset.id}/${variant.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const type = this.types.validate(asset.kind, variant.typeData, target);
      if (!type.ok) { issues.push(...type.issues.map(item => ({ ...item, entity: { kind: 'asset' as const, id: asset.id } }))); }
      const dependencies = this.types.references(asset.kind, variant.typeData);
      if (dependencies.ok) for (const reference of dependencies.value) {
        const dependency = assetReferenceTarget(reference, this.index.data.assets);
        if (dependency) { requested.push({ ...dependency, required: true, source: ref.source });
          collectedReferences.push({ ...dependency, owner: { kind: 'variant', id: variant.id }, usage: asset.kind, required: true }); }
        else issues.push({ ...issue('ASSET_TYPE_REFERENCE_MISSING', `${key} 引用缺失 ${reference.kind}/${reference.id}`, ['supplyDependency']), entity: { kind: 'asset', id: asset.id } });
      }
      else if (type.ok) issues.push(...dependencies.issues);
      if (variant.groupCapabilities?.missingFiles.length) issues.push({ ...issue('RESOURCE_GROUP_INCOMPLETE',
        `资源组 ${key} 缺少 ${variant.groupCapabilities.missingFiles.join('、')}`, ['supplyDependency']),
        entity: { kind: 'asset', id: asset.id }, ...(ref.source ? { source: ref.source } : {}) });
      if (!options.includeUnused && (!variant.targets[target] || variant.targets[target] === 'unverified'))
        issues.push({ ...issue('TARGET_UNVERIFIED', `${key} 尚未验证 ${target} 播放`, ['convert']),
          entity: { kind: 'asset', id: asset.id }, ...(ref.source ? { source: ref.source } : {}) });
      assets.push({ assetId: asset.id, name: asset.name, variantId: variant.id, kind: asset.kind, entry: variant.entry,
        files: variant.files.map(file => ({ path: file.path, bytes: file.bytes, mime: file.mime })),
        metadata: clone(variant.metadata), canvas: clone(variant.canvas), provider: type.ok ? type.value.definition.resourceProviderKey ?? variant.groupCapabilities?.resolver ?? null : variant.groupCapabilities?.resolver ?? null,
        ...(variant.typeData ? { typeData: clone(variant.typeData) } : {}) });
      for (const file of variant.files) files.push({ path: assetFilePath(asset.id, variant.id, file.path), bytes: file.bytes });
    }
    return { assets, files, references: collectedReferences, issues };
  }

  planMetadata(assetIds: Id[], transform: (asset: Asset) => Asset): Result<PreparedIndexEdit> {
    const ids = new Set(assetIds);
    if (ids.size !== assetIds.length || assetIds.some(id => !this.get(id))) return fail('ASSET_MISSING', '待修改素材不存在');
    const next = this.index.data.assets.map(asset => {
      if (!ids.has(asset.id)) return clone(asset);
      const changed = transform(clone(asset));
      if (changed.id !== asset.id) throw new Error('Metadata edit cannot change asset identity');
      return { ...changed, revision: asset.revision + 1, modifiedAt: new Date().toISOString() };
    });
    return indexEdit(this.index, next);
  }
  planRename(changes: { id: Id; name: string }[]): Result<PreparedIndexEdit> {
    for (const change of changes) {
      const asset = this.get(change.id);
      if (!asset) return fail('ASSET_MISSING', `Asset ${change.id} does not exist.`);
      if (!change.name.trim()) return fail('ASSET_NAME_INVALID', 'The asset name must not be empty.');
      if (!retainsAssetExtension(asset.name, change.name.trim())) return fail('ASSET_EXTENSION_LOCKED', 'Keep the original file extension when renaming an asset.');
    }
    return this.planMetadata(changes.map(change => change.id), asset => ({ ...asset, name: changes.find(change => change.id === asset.id)!.name.trim() }));
  }
  planTargetStatus(assetId: Id, variantId: Id, target: Target,
    status: 'direct' | 'converted'): Result<PreparedIndexEdit> {
    const asset = this.get(assetId);
    if (!asset || !asset.variants.some(variant => variant.id === variantId)) return fail('VARIANT_MISSING', '素材版本不存在');
    return this.planMetadata([assetId], value => ({ ...value, variants: value.variants.map(variant =>
      variant.id === variantId ? { ...variant, targets: { ...variant.targets, [target]: status } } : variant) }));
  }
  planActiveVariant(assetId: Id, variantId: Id): Result<{ edit: PreparedIndexEdit; floatingRefs: AssetReference[] }> {
    const asset = this.get(assetId);
    if (!asset?.variants.some(variant => variant.id === variantId)) return fail('VARIANT_MISSING', '素材版本不存在');
    const edit = this.planMetadata([assetId], value => ({ ...value, activeVariantId: variantId }));
    return edit.ok ? ok({ edit: edit.value, floatingRefs: this.references(assetId).filter(ref => ref.variantId === null) }) : edit;
  }
  planBatchRename(input: { assetIds: Id[]; template: string;
    values: ReadonlyMap<Id, { chapter: string; character: string; usage: string }> }): Result<{
      names: { assetId: Id; before: string; after: string }[]; conflicts: { name: string; assetIds: Id[] }[];
      edit: PreparedIndexEdit }> {
    if (new Set(input.assetIds).size !== input.assetIds.length) return fail('ASSET_SELECTION', '批量选择中有重复素材');
    const names: { assetId: Id; before: string; after: string }[] = [];
    for (const [index, id] of input.assetIds.entries()) {
      const asset = this.get(id);
      const values = input.values.get(id);
      if (!asset || !values) return fail('ASSET_MISSING', '批量命名缺少素材或上下文字段');
      const stem = input.template.replaceAll('{chapter}', values.chapter).replaceAll('{character}', values.character)
        .replaceAll('{usage}', values.usage).replaceAll('{number}', String(index + 1)).trim();
      if (!stem || /\{[^}]+\}/.test(stem)) return fail('RENAME_TEMPLATE', '命名模板含未提供字段');
      const after = stem + assetNameParts(asset.name).extension;
      names.push({ assetId: id, before: asset.name, after });
    }
    const grouped = new Map<string, Id[]>();
    for (const asset of this.index.data.assets) {
      const after = names.find(value => value.assetId === asset.id)?.after ?? asset.name;
      const key = JSON.stringify([asset.kind, after]);
      grouped.set(key, [...(grouped.get(key) ?? []), asset.id]);
    }
    const conflicts = [...grouped.entries()].filter(([, ids]) => ids.length > 1 && ids.some(id => input.assetIds.includes(id)))
      .map(([key, assetIds]) => ({ name: (JSON.parse(key) as string[])[1]!, assetIds }));
    const byId = new Map(names.map(value => [value.assetId, value.after]));
    const edit = this.planMetadata(input.assetIds, value => ({ ...value, name: byId.get(value.id)! }));
    return edit.ok ? ok({ names, conflicts, edit: edit.value }) : edit;
  }
  planFolder(assetIds: Id[], folder: string[]): Result<PreparedIndexEdit> {
    return this.planMetadata(assetIds, value => ({ ...value, folder: [...folder] }));
  }
  inspectRemoval(assetId: Id): Result<{ references: AssetReference[]; files: string[] }> {
    const asset = this.get(assetId);
    if (!asset) return fail('ASSET_MISSING', '素材不存在');
    return ok({ references: this.references(assetId), files: asset.variants.flatMap(variant =>
      variant.files.map(file => assetFilePath(asset.id, variant.id, file.path))) });
  }
  planRemove(assetId: Id): Result<PreparedIndexEdit> {
    if (!this.get(assetId)) return fail('ASSET_MISSING', '素材不存在');
    if (this.references(assetId).length) return fail('ASSET_REFERENCED', '素材仍有引用，请先替换或解除引用', ['locate']);
    return indexEdit(this.index, this.index.data.assets.filter(asset => asset.id !== assetId));
  }
}

function size(asset: Asset): number { return asset.variants.find(value => value.id === asset.activeVariantId)?.files.reduce((n, file) => n + file.bytes, 0) ?? 0; }
function matchesUsage(asset: Asset, references: AssetReference[], usage: string): boolean {
  if (asset.tags.includes(usage) || usage === asset.kind) return true;
  if (usage === 'ui' && asset.tags.some(tag => ['ui:icon', 'ui:frame', 'ui:background', 'ui:texture', 'ui:logo', 'ui:decoration'].includes(tag))) return true;
  const commands: Record<string, string> = { background: 'changeBg', figure: 'changeFigure', bgm: 'bgm', effect: 'playEffect' };
  return references.some(ref => {
    if (ref.usage === usage || ref.usage === commands[usage]) return true;
    const field = ref.source?.field ?? '';
    if (usage === 'voice') return /(?:^|[./])(?:voice|voiceByLocale)(?:[./]|$)/.test(field);
    if (usage === 'background') return /(?:^|[./])(?:backgroundImage|titleBackground)(?:[./]|$)/.test(field) || /(?:^|[./])background[./]imageId$/.test(field);
    if (usage === 'ui') return /(?:^|[./])(?:imageId|fontId|icon|splash)(?:[./]|$)/.test(field);
    return false;
  });
}
function validateAsset(asset: Asset): void {
  AssetSchema.parse(asset);
  const ids = new Set(asset.variants.map(value => value.id));
  if (ids.size !== asset.variants.length || !ids.has(asset.originalVariantId) || !ids.has(asset.activeVariantId))
    throw new Error(`Invalid variant identity in ${asset.id}`);
  for (const variant of asset.variants) {
    if (variant.parentId && !ids.has(variant.parentId) || !variant.files.some(file => file.path === variant.entry) ||
      variant.processing && (!ids.has(variant.processing.inputVariantId) ||
        variant.processing.settings.kind === 'mask' && !ids.has(variant.processing.settings.maskVariantId)))
      throw new Error(`Invalid variant relation in ${asset.id}/${variant.id}`);
  }
}
function validateIndex(index: AssetIndex): AssetIndex {
  if (index.schemaVersion !== 1 || !Array.isArray(index.data.assets)) throw new Error('Invalid asset index');
  IdSchema.parse(index.documentId);
  RevisionSchema.parse(index.revision);
  const ids = new Set<string>();
  for (const asset of index.data.assets) {
    validateAsset(asset);
    if (ids.has(asset.id)) throw new Error(`Duplicate asset ${asset.id}`);
    ids.add(asset.id);
  }
  return clone(index);
}
