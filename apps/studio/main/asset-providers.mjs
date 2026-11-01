import { assetReferenceTarget, createId, round5AssetBindings, StageWeatherPresets, fieldSpecsInputSchema } from '@galcraft/contracts';
import { join } from 'node:path';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { retainsAssetExtension } from '@galcraft/assets/naming';

import { AssetCatalog, AssetTypeRegistry, ImportCoordinator, assetFilePath, indexEdit, decodeSVG } from '@galcraft/assets';
import { ImageVariantProcessor, PluginResourceProcessor, audioPlaybackForVariant, commitPreparedAsset } from '@galcraft/assets/processing';
import { CoreCommandSpecs, fieldAt, parse, patchFields } from '@galcraft/dsl';
import { IdSchema } from '@galcraft/contracts';
import { fail, ok } from './result.mjs';
import { prepareStageTarget, stageResource } from './asset-stage-targets.mjs';

const directAssetFields = new Set(['assetId', 'icon', 'splash', 'titleBackground', 'titleMusic',
  'titleVideo', 'emergencyImage', 'backgroundImage', 'imageId', 'fontId', 'avatar', 'cover', 'selectedAssetId', 'resourceId']);
const assetArrayFields = new Set(['assetIds', 'assets', 'referenceAssets', 'dynamicAssets', 'fallbackFonts', 'resourceIds']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pointerPart = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
const sourceKey = source => JSON.stringify([source.documentId, source.revision,
  source.statementId ?? null, source.field ?? null, source.range ?? null]);
const commandFields = new Map(CoreCommandSpecs.map(spec => [spec.key, spec.fields]));

function walkCommandAssets(command, args, matches, add, parts = []) {
  const fields = commandFields.get(command);
  if (!fields) return false;
  const visit = (field, value, path, parent) => {
    if (field.refKind === 'asset' && matches(value)) {
      add(path, typeof parent.variantId === 'string' ? parent.variantId : null, value);
    } else if (field.path === 'voiceByLocale' && record(value)) {
      for (const [locale, id] of Object.entries(value)) if (matches(id)) add([...path, locale], null, id);
    } else if (field.type === 'object' && record(value)) {
      for (const child of field.children ?? []) visit(child, value[child.path], [...path, child.path], value);
    } else if (field.type === 'array' && Array.isArray(value) && field.item) {
      value.forEach((item, index) => visit(field.item, item, [...path, String(index)], value));
    }
  };
  for (const field of fields) visit(field, args[field.path], [...parts, field.path], args);
  return true;
}

export function backgroundReferences(session, assetId = null) {
  const references = [];
  const matches = value => assetId === null ? IdSchema.safeParse(value).success : value === assetId;
  for (const document of session.documents.values()) {
    if (document.files['assets/index.json']) continue;
    const script = Object.entries(document.files).find(([path]) => path.endsWith('/script.gal'));
    if (script) {
      const sceneRaw = Object.entries(document.files).find(([path]) => path.endsWith('/scene.json'))?.[1];
      const scene = sceneRaw ? JSON.parse(sceneRaw).data : null;
      for (const binding of scene ? round5AssetBindings({ scene }) : []) if (matches(binding.assetId)) references.push({ assetId: binding.assetId, variantId: binding.variantId,
        owner: { kind: 'document', id: document.documentId }, source: { documentId: document.documentId, revision: document.revision, field: binding.field },
        usage: 'scene presentation', required: true, label: `${scene.name} · ${binding.field}` });
      const parsed = parse({ documentId: document.documentId, revision: document.revision, text: script[1] });
      for (const node of parsed.cst) {
        if (!node.valid || !node.id || !record(node.object?.value)) continue;
        const add = (parts, variantId, referencedId) => {
          const field = parts.join('.');
          const fieldNode = fieldAt(node.object, parts);
          references.push({ assetId: referencedId, owner: { kind: 'statement', id: node.id },
            source: { documentId: document.documentId, revision: document.revision, statementId: node.id,
              field, ...(fieldNode ? { range: { start: fieldNode.valueNode.start, end: fieldNode.valueNode.end } } : {}) },
            usage: node.command, required: true, variantId,
            label: `${scene?.name ?? scene?.id ?? document.documentId} · ${node.command} · ${field}` });
        };
        const walk = (value, parts = []) => {
          if (Array.isArray(value)) { value.forEach((item, index) => walk(item, [...parts, String(index)])); return; }
          if (!record(value)) return;
          for (const [key, item] of Object.entries(value)) {
            if (key === 'voiceByLocale' && record(item)) {
              for (const [locale, voiceId] of Object.entries(item)) if (matches(voiceId)) add([...parts, key, locale], null, voiceId);
            } else if ((directAssetFields.has(key) || key === 'voice') && matches(item)) {
              add([...parts, key], typeof value.variantId === 'string' ? value.variantId : null, item);
            } else if (assetArrayFields.has(key) && Array.isArray(item)) {
              item.forEach((id, index) => { if (matches(id)) add([...parts, key, String(index)], null, id); });
            } else walk(item, [...parts, key]);
          }
        };
        if (!walkCommandAssets(node.command, node.object.value, matches, add)) walk(node.object.value);
      }
      continue;
    }
    const jsonFile = Object.entries(document.files).find(([path]) => path.endsWith('.json'));
    if (!jsonFile) continue;
    const envelope = JSON.parse(jsonFile[1]);
    const add = (parts, variantId, referencedId) => {
      const field = `/data/${parts.map(pointerPart).join('/')}`;
      references.push({ assetId: referencedId, owner: { kind: 'document', id: document.documentId },
        source: { documentId: document.documentId, revision: document.revision, field },
        usage: jsonFile[0], required: true, variantId, label: `${jsonFile[0]} · ${parts.join('.')}` });
    };
    const walk = (value, parts = []) => {
      if (Array.isArray(value)) { value.forEach((item, index) => walk(item, [...parts, String(index)])); return; }
      if (!record(value)) return;
      const commandArgs = typeof value.command === 'string' && record(value.args) &&
        walkCommandAssets(value.command, value.args, matches, add, [...parts, 'args']);
      for (const [key, item] of Object.entries(value)) {
        if (key === 'args' && commandArgs) continue;
        if (key === 'voiceByLocale' && record(item)) {
          for (const [locale, voiceId] of Object.entries(item)) if (matches(voiceId)) add([...parts, key, locale], null, voiceId);
        } else if (directAssetFields.has(key) && matches(item)) {
          add([...parts, key], typeof value.variantId === 'string' ? value.variantId : null, item);
        } else if (assetArrayFields.has(key) && Array.isArray(item)) {
          item.forEach((id, index) => { if (matches(id)) add([...parts, key, String(index)], null, id); });
        } else walk(item, [...parts, key]);
      }
    };
    walk(envelope.data);
  }
  return references;
}

export function selectedReferencePatches(session, selected, replacements) {
  const patches = [];
  for (const documentId of new Set(selected.map(reference => reference.source.documentId))) {
    const document = session.documents.get(documentId);
    if (!document) return fail('REFERENCE_MISSING', '引用所属文档不存在', 'M04', ['compare']);
    const entries = selected.map((reference, index) => ({ reference, replacement: replacements[index] }))
      .filter(item => item.reference.source.documentId === documentId);
    if (entries.some(item => item.reference.source.revision !== document.revision))
      return fail('REFERENCE_STALE', '引用所属文档已变化，请重新预览', 'M04', ['compare']);
    for (let index = entries.length - 1; index >= 0; index--) {
      const { reference, replacement } = entries[index];
      if (reference.assetId === replacement.after.assetId && (reference.variantId === null || reference.variantId === replacement.after.variantId)) entries.splice(index, 1);
      else if (!reference.source.field) return fail('REFERENCE_LOCATION', '插件文档声明了素材引用，未提供字段位置；请在所属文档中修改该引用', 'M04', ['locate']);
    }
    if (!entries.length) continue;
    const scriptEntries = entries.filter(item => document.format === 'dsl' && !item.reference.source.field.startsWith('/'));
    if (scriptEntries.length) {
      const script = Object.entries(document.files).find(([path]) => path.endsWith('/script.gal'))?.[1];
      if (script === undefined) return fail('REFERENCE_MISSING', '脚本文件不存在', 'M04');
      const parsed = parse({ documentId, revision: document.revision, text: script });
      const edits = [];
      for (const { reference, replacement } of scriptEntries) {
        const source = reference.source;
        if (!source.statementId || !source.field) return fail('REFERENCE_LOCATION', '脚本引用缺少语句位置', 'M04');
        const node = parsed.cst.find(value => value.id === source.statementId);
        const field = node?.object && fieldAt(node.object, source.field.split('.'));
        if (!node?.valid || !field || field.valueNode.value !== reference.assetId ||
          source.range && (field.valueNode.start !== source.range.start || field.valueNode.end !== source.range.end))
          return fail('REFERENCE_STALE', '所选脚本引用已变化，请重新预览', 'M04', ['compare']);
        const changes = [{ field: source.field, op: 'set', value: replacement.after.assetId }];
        if (reference.variantId !== null) changes.push({ field: source.field.replace(/assetId$/, 'variantId'),
          op: 'set', value: replacement.after.variantId });
        const result = patchFields(parsed, { documentId, revision: document.revision,
          statementIds: [source.statementId], changes });
        if (!result.ok) return result;
        edits.push(...result.value.map(edit => ({ start: edit.start, end: edit.end, before: edit.oldText, after: edit.text })));
      }
      if (new Set(edits.map(edit => `${edit.start}:${edit.end}`)).size !== edits.length)
        return fail('REFERENCE_SCOPE_DUPLICATE', '所选引用重复', 'M04');
      patches.push({ kind: 'text', documentId, edits });
    }
    const jsonEntries = entries.filter(item => !scriptEntries.includes(item));
    if (jsonEntries.length) {
      const jsonFile = Object.entries(document.files).find(([path]) => path.endsWith('.json'))?.[1];
      if (!jsonFile) return fail('REFERENCE_MISSING', '引用文档文件不存在', 'M04');
      const envelope = JSON.parse(jsonFile);
      const at = path => path.slice(1).split('/').reduce((value, part) => value?.[part.replaceAll('~1', '/').replaceAll('~0', '~')], envelope);
      const changes = [];
      const arrayChanges = new Map();
      for (const { reference, replacement } of jsonEntries) {
        const path = reference.source.field;
        if (!path?.startsWith('/data/') || at(path) !== reference.assetId)
          return fail('REFERENCE_STALE', '所选配置引用已变化，请重新预览', 'M04', ['compare']);
        const parentPath = path.slice(0, path.lastIndexOf('/'));
        const index = Number(path.slice(path.lastIndexOf('/') + 1));
        if (Array.isArray(at(parentPath)) && Number.isInteger(index)) {
          const change = arrayChanges.get(parentPath) ?? { path: parentPath,
            before: structuredClone(at(parentPath)), after: structuredClone(at(parentPath)), op: 'set' };
          change.after[index] = replacement.after.assetId;
          arrayChanges.set(parentPath, change);
        } else changes.push({ path, before: reference.assetId, after: replacement.after.assetId, op: 'set' });
        if (reference.variantId !== null) {
          const variantPath = path.replace(/\/assetId$/, '/variantId');
          if (variantPath === path || at(variantPath) !== reference.variantId)
            return fail('REFERENCE_STALE', '精确版本引用已变化，请重新预览', 'M04', ['compare']);
          changes.push({ path: variantPath, before: reference.variantId, after: replacement.after.variantId, op: 'set' });
        }
      }
      changes.push(...arrayChanges.values());
      patches.push({ kind: 'json', documentId, changes });
    }
  }
  return ok(patches);
}

export class StudioAssets {
  #runtimeLeases = new Map();
  #preview = null;
  #thumbnailLeases = [];
  #preparedMatting = new Map();
  #renamePlans = new Map();
  #resourceProcessing = new WeakMap();
  #processorCalls = new Map();
  #targetVerification = false;

  constructor(projectDocuments, toolDirectory, svgDecoder, operations, resources, modelDirectory, mattingWorker = join(import.meta.dirname, '../../../tools/matting/src/worker.mjs'), live2dRuntimeDirectory) {
    this.mattingWorker = mattingWorker;
    this.projectDocuments = projectDocuments;
    this.toolDirectory = toolDirectory;
    this.svgDecoder = svgDecoder ?? decodeSVG;
    this.operations = operations;
    this.resources = resources;
    this.modelDirectory = modelDirectory;
    this.live2dRuntimeDirectory = live2dRuntimeDirectory;
  }

  current() {
    const session = this.projectDocuments.currentSession;
    if (!session) return null;
    const index = [...session.documents.values()].find(document => document.files['assets/index.json']);
    if (!index) return null;
    return { session, index: JSON.parse(index.files['assets/index.json']) };
  }

  async acquireTypes(session) { return this.assetTypes ? this.assetTypes.acquire(session) : { types: new AssetTypeRegistry(), release: async () => {} }; }
  async typeCatalog() {
    const current = this.current(); if (!current) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    const lease = await this.acquireTypes(current.session);
    try {
      const entries = lease.types.list().map(entry => ({ ...entry, count: current.index.data.assets.filter(asset => asset.kind === entry.descriptor.key).length }));
      for (const kind of new Set(current.index.data.assets.map(asset => asset.kind))) if (!entries.some(entry => entry.descriptor.key === kind)) entries.push({
        descriptor: { contractVersion: 1, key: kind, typeVersion: 1, title: kind, description: 'Asset type provider unavailable', icon: 'file', group: 'unavailable', schema: true, fields: [], extensions: [], targets: [], resourceProviderKey: null, capabilities: [] },
        provider: null, count: current.index.data.assets.filter(asset => asset.kind === kind).length, unavailable: true,
      });
      return { ...ok(entries), warnings: lease.warnings ?? [] };
    } finally { await lease.release(); }
  }
  async typeContract(input) {
    const current = this.current(); if (!current) return fail('ASSET_INDEX_MISSING', 'Open a project first.', 'M04');
    const lease = await this.acquireTypes(current.session);
    try {
      const entry = lease.types.list().find(entry => entry.descriptor.key === input.kind && entry.descriptor.typeVersion === (input.typeVersion ?? 1)
        && (!input.provider || entry.provider?.id === input.provider.id && entry.provider?.version === input.provider.version));
      return entry ? { ...ok(entry), warnings: lease.warnings ?? [] } : fail('ASSET_TYPE_UNAVAILABLE', 'The exact asset type provider is missing. Read the current type catalog and supply the dependency.', 'M04', ['supplyDependency']);
    } finally { await lease.release(); }
  }
  async saveAnimation(input) {
    const current = this.current(), root = this.projectDocuments.currentRoot;
    if (!current || !root) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    const coordinator = new ImportCoordinator(root, this.toolDirectory, () => this.current()?.index ?? current.index);
    let preparationId;
    try {
      const prepared = await coordinator.prepareAnimation(input); if (!prepared.ok) return prepared;
      preparationId = prepared.value.preparationId;
      if (this.projectDocuments.currentSession !== current.session) return fail('PROJECT_STALE', '作品已切换', 'M04');
      const edit = coordinator.prepareIndexEdit([preparationId]); if (!edit.ok) return edit;
      const applied = await this.#applyIndex(edit, '保存动画资源'); if (!applied.ok) return applied;
      coordinator.confirm([preparationId]); preparationId = null;
      return ok({ assetId: prepared.value.assetId, variantId: prepared.value.variantId, edit: applied.value });
    } finally { if (preparationId) await coordinator.discard(preparationId); }
  }
  async weatherTexture(key) {
    const preset = Object.hasOwn(StageWeatherPresets, key) ? StageWeatherPresets[key] : null;
    if (!preset) return fail('WEATHER_PRESET', '请选择有效天气预设', 'M04');
    const current = this.current(); if (!current) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    const tag = `galcraft-weather:${key}`;
    const existing = current.index.data.assets.find(asset => asset.tags.includes(tag));
    if (existing) return ok(existing);
    const imported = await this.import([join(import.meta.dirname, '../resources/practice/textures', preset.texture)], { conflict: 'keepBoth', tags: [tag], source: { kind: 'template',
      description: `OpenWebGAL/WebGAL_Terre · packages/terre2/assets/templates/WebGAL_Template/game/tex/${preset.texture} · MPL-2.0`, usage: 'redistributable' } });
    if (!imported.ok) return imported;
    const asset = imported.value.succeeded[0];
    if (!asset) return imported.value.failed[0] ? { ok: false, error: imported.value.failed[0].issue, issues: imported.value.failed.map(item => item.issue) } : fail('WEATHER_TEXTURE', '天气纹理导入失败', 'M04');
    if (this.projectDocuments.currentSession !== current.session) return fail('PROJECT_STALE', '作品已切换', 'M04');
    return ok(asset);
  }
  /** Prepare a shipped preset resource; M02 owns the returned files after a reviewed plan is prepared. */
  async prepareBuiltinPreset({file, tag, source}) {
    const current=this.current(),root=this.projectDocuments.currentRoot;
    if(!current||!root)return fail('ASSET_INDEX_MISSING','Open a project with an asset index first.','M04');
    const existing=current.index.data.assets.find(asset=>asset.tags.includes(tag));
    if(existing)return ok({asset:existing,indexDocumentId:current.index.documentId,edit:null,confirm(){},async discard(){}});
    const lease=await this.acquireTypes(current.session),coordinator=new ImportCoordinator(root,this.toolDirectory,()=>this.current()?.index??current.index,undefined,this.svgDecoder,undefined,lease.types);
    let preparationId;
    try{
      const batch=await coordinator.importBatch({projectId:current.session.projectId,files:[file],folder:[],conflict:'keepBoth',usage:null,targetBinding:null,fileTags:[[tag]],fileSources:[source]});
      const item=batch[0]?.result;if(!item?.ok)return item??fail('PRESET_IMPORT','The preset resource could not be prepared.','M04');
      preparationId=item.value.preparationId;
      const prepared=coordinator.prepareIndexEdit([preparationId]);if(!prepared.ok)return prepared;
      if(this.projectDocuments.currentSession!==current.session)return fail('PROJECT_STALE','The project changed while preparing the resource.','M04');
      const edit={label:'Use a core preset resource',origin:'preset',expected:prepared.value.expected,patches:prepared.value.indexPatches,preparedAssets:prepared.value.preparedAssets,requiredRefs:[]};
      const asset=edit.patches.flatMap(patch=>patch.kind==='json'?patch.changes:[]).find(change=>change.path==='/data/assets')?.after.find(asset=>asset.id===item.value.assetId);
      const id=preparationId;preparationId=null;
      return ok({asset,indexDocumentId:current.index.documentId,edit,confirm:()=>coordinator.confirm([id]),discard:()=>coordinator.discard(id)});
    }finally{try{if(preparationId)await coordinator.discard(preparationId);}finally{await lease.release();}}
  }
  async editTypeData(input, options = {}) {
    const current = this.current(), root = this.projectDocuments.currentRoot;
    if (!current || !root) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    const lease = await this.acquireTypes(current.session);
    const coordinator = new ImportCoordinator(root, this.toolDirectory, () => this.current()?.index ?? current.index, undefined, this.svgDecoder, undefined, lease.types);
    let preparationId;
    try {
      const prepared = await coordinator.prepareTypeData(input); if (!prepared.ok) return prepared;
      preparationId = prepared.value.preparationId;
      if (this.projectDocuments.currentSession !== current.session) return fail('PROJECT_STALE', '作品已切换', 'M04');
      const edit = coordinator.prepareIndexEdit([preparationId]); if (!edit.ok) return edit;
      const affectedReferences = await this.referenceRecords(current.session, input.assetId);
      for (const reference of affectedReferences) if (reference.source && !edit.value.expected.some(version => version.ref.id === reference.source.documentId))
        edit.value.expected.push({ ref: { kind: 'document', id: reference.source.documentId }, revision: reference.source.revision });
      let applied;
      try { applied = await this.#applyIndex(edit, '编辑素材专属数据', { ...options, beforeCommit: plan => options.beforeCommit?.(plan, { affectedReferences }) }); }
      catch (error) {
        if (options.collaboration && (await current.session.lookupExternalCall(options.collaboration))?.ok) { coordinator.confirm([preparationId]); preparationId = null; }
        throw error;
      }
      if (!applied.ok) return applied;
      coordinator.confirm([preparationId]); preparationId = null;
      return ok({ ...prepared.value, edit: applied.value });
    } finally { if (preparationId) await coordinator.discard(preparationId); await lease.release(); }
  }

  async query(query) {
    const current = this.current();
    if (!current) return fail('ASSET_INDEX_MISSING', '请先打开包含素材索引的作品', 'M04');
    const lease = await this.acquireTypes(current.session);
    try { return await this.readCatalog(current, lease.types, catalog => catalog.queryAssets(query)); }
    finally { await lease.release(); }
  }

  async allIds(query) {
    const current = this.current();
    if (!current) return fail('ASSET_INDEX_MISSING', '请先打开包含素材索引的作品', 'M04');
    const lease = await this.acquireTypes(current.session);
    try { return await this.readCatalog(current, lease.types, catalog => catalog.queryAssetIds(query)); }
    finally { await lease.release(); }
  }

  async referenceRecords(session, assetId = null, { allowMissing = false, onIssue } = {}) {
    const core = backgroundReferences(session, assetId);
    const plugin = await this.pluginReferences?.(session, assetId, { allowMissing, onIssue }) ?? [];
    const typed = [], document = [...session.documents.values()].find(document => document.files['assets/index.json']);
    const assets = document ? JSON.parse(document.files['assets/index.json']).data.assets : [];
    const lease = await this.acquireTypes(session);
    try {
      (lease.warnings ?? []).forEach(issue => onIssue?.(issue));
      for (const asset of assets) for (const variant of asset.variants) {
        const references = lease.types.references(asset.kind, variant.typeData);
        if (!references.ok) {
          if (!allowMissing) throw new Error(references.error.message);
          onIssue?.({ ...references.error, severity: 'warning', entity: { kind: 'variant', id: variant.id },
            source: { documentId: document.documentId, revision: document.revision } });
          continue;
        }
        for (const ref of references.value) {
          const target = assetReferenceTarget(ref, assets); if (!target || assetId && target.assetId !== assetId) continue;
          typed.push({ ...target, owner: { kind: 'variant', id: variant.id }, source: { documentId: document.documentId, revision: document.revision },
            usage: asset.kind, required: true, label: `${asset.name} · ${variant.id}` });
        }
      }
    } finally { await lease.release(); }
    return [...new Map([...core, ...plugin, ...typed].map(reference => [JSON.stringify([reference.assetId, reference.variantId, reference.owner, reference.source]), reference])).values()];
  }
  async readReferences(session, assetId = null) {
    const warnings = [], references = await this.referenceRecords(session, assetId, { allowMissing: true, onIssue: issue => {
      if (!warnings.some(existing => existing.code === issue.code && existing.message === issue.message && existing.entity?.id === issue.entity?.id)) warnings.push(issue);
    } });
    return { ...ok(references), warnings };
  }
  async readCatalog(current, types, read) {
    const references = await this.readReferences(current.session), result = read(this.catalog(current, references.value, types));
    return result.ok ? { ...result, warnings: [...result.warnings, ...references.warnings] } : result;
  }
  catalog(current, references = backgroundReferences(current.session), types = new AssetTypeRegistry()) {
    const catalog = new AssetCatalog(current.index, types), byDocument = new Map();
    const sceneIds = new Map([...current.session.documents.values()].flatMap(document =>
      Object.entries(document.files).filter(([path]) => path.endsWith('/scene.json')).map(([, raw]) => [document.documentId, JSON.parse(raw).data.id])));
    for (const { label, ...ref } of references) {
      const documentId = ref.source.documentId;
      const projected = byDocument.get(documentId) ?? { references: [], linkedLocales: new Map(), sceneId: sceneIds.get(documentId) ?? null };
      projected.references.push(ref);
      const field = ref.source.field ?? '', match = /(?:^|[./])voiceByLocale[./]([^./]+)$/.exec(field);
      if (match) projected.linkedLocales.set(ref.assetId, [...(projected.linkedLocales.get(ref.assetId) ?? []), match[1]]);
      byDocument.set(documentId, projected);
    }
    catalog.rebuildReferences(byDocument);
    return catalog;
  }
  async picker(input, recentIds = []) {
    const current = this.current();
    if (!current) return fail('ASSET_INDEX_MISSING', '请先打开包含素材索引的作品', 'M04');
    if (current.session.projectId !== input.context.projectId) return fail('PROJECT_STALE', '素材选择器的作品已变化', 'M04');
    const characters = new Map([...current.session.documents.values()].flatMap(document =>
      Object.entries(document.files).filter(([path]) => path.startsWith('characters/') && path.endsWith('.json'))
        .map(([, raw]) => { const character = JSON.parse(raw).data; return [character.id, character.name]; })));
    const lease = await this.acquireTypes(current.session);
    try { return await this.readCatalog(current, lease.types, catalog => catalog.queryPicker(input, recentIds, characters)); }
    finally { await lease.release(); }
  }

  get(assetId) {
    const current = this.current();
    return current ? ok(new AssetCatalog(current.index).get(assetId))
      : fail('ASSET_INDEX_MISSING', '请先打开包含素材索引的作品', 'M04');
  }
  async references(assetId) {
    const current = this.current();
    return current ? this.readReferences(current.session, assetId) : fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
  }
  async resourceProcessing() {
    const current = this.current(), root = this.projectDocuments.currentRoot;
    if (!current || !root) throw new Error('请先打开作品');
    if (!this.#resourceProcessing.has(current.session)) {
      const processor = new PluginResourceProcessor(root, this.toolDirectory, () => {
        const document = [...current.session.documents.values()].find(document => document.files['assets/index.json']);
        return { ...JSON.parse(document.files['assets/index.json']), revision: document.revision };
      });
      const opening = processor.open().then(() => processor); this.#resourceProcessing.set(current.session, opening);
    }
    return this.#resourceProcessing.get(current.session);
  }
  async resourceCandidates() { return ok((await this.resourceProcessing()).candidates()); }
  async processorCatalog() {
    const current = this.current();
    if (!current) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    const warnings = [], providers = await this.resourceProcessors?.list?.(current.session, { onIssue: issue => warnings.push(issue) }) ?? [];
    return { ...ok(providers), warnings };
  }
  async processorContract(input) {
    const current = this.current();
    if (!current || !this.resourceProcessors) return fail('RESOURCE_PROCESSOR_MISSING', 'Supply the selected resource processor.', 'M04', ['supplyDependency']);
    const lease = await this.resourceProcessors.acquire(input.processorKey, current.session);
    try {
      if (input.packageVersion && lease.packageVersion !== input.packageVersion) return fail('RESOURCE_PROCESSOR_CHANGED', 'The processor package version changed. Read its current contract again.', 'M04', ['compare']);
      const { key, version, inputKinds, outputKinds, fields, supportsCancel } = lease.processor;
      return ok({ key, version, packageVersion: lease.packageVersion, inputKinds, outputKinds, fields, supportsCancel, settingsSchema: fieldSpecsInputSchema(fields) });
    } finally { await lease.release(); }
  }
  async previewResource(preparationId) {
    const current = this.current(), root = this.projectDocuments.currentRoot;
    if (!current || !root) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    const candidate = (await this.resourceProcessing()).candidates().find(candidate => candidate.preparationId === preparationId);
    if (!candidate) return fail('PREPARATION_MISSING', '资源处理候选不存在', 'M04');
    const variant = candidate.variant, entry = variant.files.find(file => file.path === variant.entry);
    if (!entry) return fail('ASSET_ENTRY_MISSING', '资源处理候选缺少入口', 'M04');
    const leaseId = createId(), leases = variant.files.map(file => this.resources.register({ projectId: current.session.projectId, assetId: candidate.assetId,
      variantId: variant.id, relative: file.path, path: join(root, ...assetFilePath(candidate.assetId, variant.id, file.path).split('/')), mime: file.mime }));
    this.#runtimeLeases.set(leaseId, { preparationId, release: () => leases.forEach(lease => lease.release()) });
    return ok({ leaseId, uri: leases[variant.files.indexOf(entry)].uri, mime: entry.mime, bytes: entry.bytes });
  }
  async processResource(input) {
    const current = this.current();
    if (!current || !this.resourceProcessors) return fail('RESOURCE_PROCESSOR_MISSING', '请补齐所选资源处理器', 'M04', ['supplyDependency']);
    const processor = await this.resourceProcessing(), operationId = input.operationId ?? createId();
    if (this.#processorCalls.has(operationId)) return fail('RESOURCE_OPERATION_ACTIVE', '资源处理调用已存在', 'M04');
    const controller = new AbortController(), operation = { controller, projectId: current.session.projectId, supportsCancel: false };
    this.#processorCalls.set(operationId, operation);
    let lease;
    try {
      lease = await this.resourceProcessors.acquire(input.processorKey, current.session);
      if (input.packageVersion && lease.packageVersion !== input.packageVersion) return fail('RESOURCE_PROCESSOR_CHANGED', 'The processor package version changed. Read its current contract and prepare again.', 'M04', ['compare']);
      operation.supportsCancel = lease.processor.supportsCancel;
      const references = await this.referenceRecords(current.session, input.assetId);
      const result = await processor.prepare({ ...input, references }, lease.processor, lease.packageVersion, controller.signal);
      return result.ok ? ok({ operationId, ...result.value }) : result;
    } catch (error) { return fail('RESOURCE_PROCESSOR_FAILED', String(error), 'M04', ['supplyDependency']); }
    finally { await lease?.release(); this.#processorCalls.delete(operationId); }
  }
  cancelResource(operationId) {
    const operation = this.#processorCalls.get(operationId);
    if (!operation) return fail('RESOURCE_OPERATION_MISSING', '资源处理调用不存在', 'M04');
    operation.controller.abort();
    return ok({ local: 'stopped', remote: operation.supportsCancel ? 'unknown' : 'unsupported' });
  }
  async confirmResource(input, options = {}) {
    const current = this.current(), processor = await this.resourceProcessing();
    const candidate = processor.candidates().find(candidate => candidate.preparationId === input.preparationId);
    let affectedReferences = [];
    if (candidate?.referenceScope && (input.activate ?? true)) {
      const references = await this.referenceRecords(current.session, candidate.assetId);
      affectedReferences = references;
      const keys = values => values.map(reference => JSON.stringify([reference.assetId, reference.variantId, reference.owner, reference.source])).sort();
      if (JSON.stringify(keys(candidate.referenceScope)) !== JSON.stringify(keys(references))) return fail('REPLACEMENT_SCOPE_STALE', '素材引用影响已变化，请重新准备并审阅处理候选，或保留当前活动版本', 'M04', ['compare']);
    }
    const edit = processor.prepareIndexEdit(input.preparationId, input.activate ?? true);
    if (!edit.ok) return edit;
    for (const reference of affectedReferences) if (reference.source && !edit.value.expected.some(version => version.ref.id === reference.source.documentId))
      edit.value.expected.push({ ref: { kind: 'document', id: reference.source.documentId }, revision: reference.source.revision });
    const planned = current.session.planEdit({ label: '采用资源处理候选', origin: 'candidate', expected: edit.value.expected,
      patches: edit.value.indexPatches, preparedAssets: edit.value.preparedAssets, requiredRefs: edit.value.requiredRefs });
    if (!planned.ok) return planned;
    await options.beforeCommit?.(planned.value, { affectedReferences });
    if (this.projectDocuments.currentSession !== current.session) return fail('PROJECT_STALE', 'The project changed. Read the current resource processing candidate again.', 'M04');
    let applied;
    try { applied = options.collaboration ? await current.session.applyExternalEdit(planned.value.planId, edit.value.expected, options.collaboration) : current.session.applyEdit(planned.value.planId, edit.value.expected); }
    catch (error) { if (options.collaboration && (await current.session.lookupExternalCall(options.collaboration))?.ok) await processor.confirm(input.preparationId); throw error; }
    if (!applied.ok) return applied;
    await processor.confirm(input.preparationId); return applied;
  }
  async discardResource(preparationId) {
    for (const [leaseId, lease] of this.#runtimeLeases) if (lease.preparationId === preparationId) this.releaseRuntime(leaseId);
    await (await this.resourceProcessing()).discard(preparationId); return ok(undefined);
  }

  async inspectModel(assetId) {
    const current = this.current(), root = this.projectDocuments.currentRoot;
    if (!current || !root) return fail('ASSET_INDEX_MISSING', '请先打开包含素材索引的作品', 'M04');
    const asset = current.index.data.assets.find(asset => asset.id === assetId);
    const variant = asset?.variants.find(variant => variant.id === asset.activeVariantId);
    if (!asset || !variant || !variant.groupCapabilities) return fail('MODEL_ASSET_MISSING', '请选择已导入的资源组', 'M04');
    const directory = join(root, ...assetFilePath(asset.id, variant.id, '').split('/'));
    const lease = await this.resourceProviders?.resolve(join(directory, variant.entry), current.session);
    if (!lease) return fail('RESOURCE_PROVIDER_MISSING', '请通过作品插件依赖启用此模型的精确资源提供者', 'M04', ['supplyDependency']);
    let inspected;
    try {
      const { readFile } = await import('node:fs/promises');
      const files = variant.files.map(file => file.path), read = path => { if (!files.includes(path)) throw new Error(`未声明资源文件 ${path}`); return readFile(join(directory, path)); };
      inspected = await lease.provider.inspect(variant.entry, files, { rootFile: variant.entry, files, metadata: variant.metadata,
        readBytes: read, readText: async path => (await read(path)).toString('utf8') });
    } finally { await lease.release(); }
    if (!inspected.ok) return inspected;
    if (this.projectDocuments.currentSession !== current.session || this.projectDocuments.currentRoot !== root)
      return fail('PROJECT_STALE', '作品已切换，请重新读取模型参数', 'M04');
    if (JSON.stringify(variant.groupCapabilities) === JSON.stringify(inspected.value.capabilities)) return ok(asset);
    const next = { ...asset, revision: asset.revision + 1, modifiedAt: new Date().toISOString(),
      variants: asset.variants.map(item => item.id === variant.id ? { ...item, groupCapabilities: inspected.value.capabilities } : item) };
    const applied = await this.#applyIndex(indexEdit(current.index, current.index.data.assets.map(item => item.id === assetId ? next : item)), '读取 Live2D 模型参数');
    return applied.ok ? this.get(assetId) : applied;
  }

  async verifyTarget(target, operationId = createId(), progress = () => {}, options = {}) {
    const current = this.current();
    if (!current || !['web', 'windows', 'android', 'ios'].includes(target)) return fail('ASSET_TARGET', '请选择作品与发行目标', 'M04');
    if (!this.verifyAssetPlayback) return fail('TARGET_VALIDATOR_UNAVAILABLE', '请由当前宿主装配目标媒体验证能力', 'M04');
    if (this.#targetVerification) return fail('ASSET_VERIFICATION_BUSY', '目标素材验证正在执行', 'M04');
    this.#targetVerification = true;
    let completed = 0, total = null;
    const issues = [], identity = { operationId, projectId: current.session.projectId, sessionId: this.projectDocuments.currentSessionId ?? current.session.projectId, target };
    const report = (phase, item = {}) => progress({ ...identity, phase, completed, total, issueCount: issues.length, ...item });
    try {
    report('preparing');
    const verifyAssetPlayback = this.verifyAssetPlayback;
    const assets = structuredClone(current.index.data.assets);
    const fixedReferences = (await this.referenceRecords(current.session)).filter(reference => reference.variantId !== null);
    const variantsForTarget = asset => asset.variants.filter(variant => variant.id === asset.activeVariantId || variant.role === 'compatible'
      || fixedReferences.some(reference => reference.assetId === asset.id && reference.variantId === variant.id));
    const work = assets.flatMap(asset => variantsForTarget(asset).map(variant => ({ asset, variant })));
    total = work.length;
    let stageTarget; const typeLease = await this.acquireTypes(current.session);
    try {
      for (const asset of assets) for (const variant of variantsForTarget(asset)) {
        variant.targets[target] = 'unverified';
      }
      report('checking');
      for (const { asset, variant } of work) {
        const item = { assetId: asset.id, variantId: variant.id, name: asset.name };
        report('checking', item);
        try {
        const checked = typeLease.types.validate(asset.kind, variant.typeData, target);
        if (!checked.ok) { issues.push(...checked.issues); continue; }
        if (target === 'android' || target === 'ios') { const { mobileMediaIssue } = await import('./mobile-media.mjs'); const unsupported = mobileMediaIssue(asset, variant, target); if (unsupported) { issues.push(unsupported); continue; } }
        const location = this.resolveRuntime(asset.id, variant.id);
        if (!location.ok) { issues.push(location.error); continue; }
        let runtime, stage;
        try {
          if (variant.groupCapabilities?.resolver) {
            if (variant.groupCapabilities.missingFiles.length) throw new Error(`资源组缺少文件：${variant.groupCapabilities.missingFiles.join('、')}`);
            stageTarget ??= await prepareStageTarget(current.session, assets, target, this.targetValidation);
            const resource = stageResource(asset, variant), suffix = resource.entry.split('/').map(encodeURIComponent).join('/');
            stage = { ...stageTarget.binding, resource, baseUri: location.value.uri.slice(0, -suffix.length) };
          }
          const result = await verifyAssetPlayback(asset, location.value.uri, runtime ? { url: runtime.url, expected: runtime.expected,
            resource: { assetId: asset.id, variantId: variant.id, kind: asset.kind, entry: variant.entry } } : null, stage);
          if (result.ok) {
            variant.targets[target] = variant.role === 'compatible' ? 'converted' : 'direct';
            if (result.capabilities && variant.groupCapabilities) {
              Object.assign(variant.groupCapabilities, { parameters: result.capabilities.parameters, motions: result.capabilities.motions,
                expressions: result.capabilities.expressions, capabilities: result.capabilities.features });
            }
          }
          else issues.push({ code: stage ? 'ASSET_STAGE_TARGET' : 'ASSET_DECODE', message: `${asset.name}: ${result.reason}`, severity: 'error', owner: 'M04', related: [{ kind: 'asset', id: asset.id }], actions: stage ? ['supplyDependency', 'retry'] : ['convert'] });
        } catch (error) { issues.push({ code: 'ASSET_RUNTIME', message: `${asset.name}: ${error}`, severity: 'error', owner: 'M04', related: [{ kind: 'asset', id: asset.id }], actions: ['supplyDependency'] }); }
        finally { runtime?.release(); this.releaseRuntime(location.value.leaseId); }
        } finally { completed++; report('checking', item); }
      }
    } finally { await stageTarget?.release(); await typeLease.release(); }
    report('applying');
    if (this.projectDocuments.currentSession !== current.session) { report('failed', { message: '作品已切换，请重新验证目标' }); return fail('PROJECT_CHANGED', '作品已切换，请重新验证目标', 'M04'); }
    if(options.collaboration){
      const context=options.collaboration,directory=join(context.projectRoot??this.projectDocuments.currentRoot,'.galcraft','asset-verification-results');
      await mkdir(directory,{recursive:true});const path=join(directory,`${context.sessionId}-${context.callId}.json`);
      await writeFile(`${path}.tmp`,JSON.stringify({target,issues}));await rename(`${path}.tmp`,path);
    }
    const edit = await this.#applyIndex(indexEdit(current.index, assets), '验证目标媒体', options);
    report(edit.ok ? 'complete' : 'failed', edit.ok ? {} : { message: edit.error.message });
    return edit.ok ? ok({ edit: edit.value, issues }) : edit;
    } catch (error) { report('failed', { message: String(error) }); throw error; }
    finally { this.#targetVerification = false; }
  }

  describe(input) {
    const current = this.current();
    return current ? new AssetCatalog(current.index).describeAssetRows(input)
      : fail('ASSET_INDEX_MISSING', '请先打开包含素材索引的作品', 'M04');
  }

  async rename(changes) {
    const current = this.current();
    if (!current) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    return this.#applyIndex(new AssetCatalog(current.index).planRename(changes), '重命名素材');
  }
  async prepareCatalogEdit(input) {
    const current=this.current();if(!current)return fail('ASSET_INDEX_MISSING','Open a project with an asset index first.','M04');
    const references=await this.readReferences(current.session,input.assetId),lease=await this.acquireTypes(current.session);
    try {const catalog=this.catalog(current,references.value,lease.types);
      if(input.action==='rename')return catalog.planRename([{id:input.assetId,name:input.name}]);
      if(input.action==='prepareVariantSwitch')return catalog.planActiveVariant(input.assetId,input.variantId);
      if(input.action==='setMetadata')return catalog.planMetadata([input.assetId],asset=>({...asset,...input.fields}));
      return fail('ASSET_ACTION','Unknown catalog edit action.','M04');
    }finally{await lease.release();}
  }
  async lookupImport(context) {
    const path=join(context.projectRoot??this.projectDocuments.currentRoot,'.galcraft','asset-import-results',`${context.sessionId}-${context.callId}.json`);
    let batch;try{batch=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return;throw error;}
    if(batch.committed)return batch.result;
    const receipt=await this.projectDocuments.currentSession?.lookupExternalCall(context);
    if(receipt?.ok)return batch.result;
  }

  planBatchRename(input) {
    const current = this.current();
    if (!current) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    const catalog = new AssetCatalog(current.index);
    const planned = catalog.planBatchRename({ assetIds: input.assetIds, template: input.template,
      values: new Map(input.values.map(value => [value.assetId, value])) });
    if (!planned.ok) return planned;
    const planId = createId();
    this.#renamePlans.set(planId, { projectId: current.session.projectId, edit: planned.value.edit });
    return ok({ planId, names: planned.value.names, conflicts: planned.value.conflicts,
      indexRevision: current.index.revision });
  }

  async applyBatchRename(planId) {
    const plan = this.#renamePlans.get(planId);
    const current = this.current();
    if (!plan || !current || plan.projectId !== current.session.projectId)
      return fail('RENAME_PLAN_MISSING', '批量命名计划不属于当前作品', 'M04');
    const applied = await this.#applyIndex(ok(plan.edit), '批量命名素材');
    if (applied.ok) this.#renamePlans.delete(planId);
    return applied;
  }

  async remove(ids) {
    const current = this.current();
    if (!current) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    const typeLease = await this.acquireTypes(current.session);
    try {
      for (const asset of current.index.data.assets) for (const variant of asset.variants) {
        const references = typeLease.types.references(asset.kind, variant.typeData); if (!references.ok) return references;
      }
    } finally { await typeLease.release(); }
    const selected = new Set(ids);
    const references = await this.referenceRecords(current.session);
    for (const id of selected) {
      if (!current.index.data.assets.some(asset => asset.id === id)) return fail('ASSET_MISSING', `素材 ${id} 不存在`, 'M04', ['locate']);
      if (references.some(reference => reference.assetId === id)) return fail('ASSET_REFERENCED', `素材 ${id} 仍被作品引用`, 'M04', ['locate']);
      const used = [...current.session.documents.values()].some(document =>
        !document.files['assets/index.json'] && Object.values(document.files).some(content => content.includes(id)));
      if (used) return fail('ASSET_REFERENCED', `素材 ${id} 仍被作品引用`, 'M04', ['locate']);
    }
    return this.#applyIndex(indexEdit(current.index, current.index.data.assets.filter(asset => !selected.has(asset.id))), '移除素材');
  }

  async #applyIndex(edit, label, options = {}) {
    if (!edit.ok) return edit;
    const session = this.projectDocuments.currentSession;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
    const planned = session.planEdit({ label, origin: 'batch', expected: edit.value.expected,
        patches: edit.value.indexPatches, preparedAssets: edit.value.preparedAssets, requiredRefs: edit.value.requiredRefs });
    if(!planned.ok)return planned;
    await options.beforeCommit?.(planned.value);
    if (this.projectDocuments.currentSession !== session) return fail('PROJECT_STALE', 'The project changed before applying the asset edit.', 'M04');
    return options.collaboration ? session.applyExternalEdit(planned.value.planId, edit.value.expected, options.collaboration) : session.applyEdit(planned.value.planId, edit.value.expected);
  }

  preview(assetId, variantId) {
    const current = this.current();
    const root = this.projectDocuments.currentRoot;
    if (!current || !root) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    const asset = current.index.data.assets.find(value => value.id === assetId);
    const variant = asset?.variants.find(value => value.id === (variantId ?? asset.activeVariantId));
    if (!asset || !variant) return fail('ASSET_VARIANT_MISSING', '素材版本不存在', 'M04', ['locate']);
    const entry = variant.files.find(file => file.path === variant.entry);
    if (!entry) return fail('ASSET_ENTRY_MISSING', '素材入口文件不存在', 'M04', ['locate']);
    this.stopPreview();
    const location = this.resources.register({ projectId: current.session.projectId, assetId, variantId: variant.id,
      relative: variant.entry, path: join(root, ...assetFilePath(assetId, variant.id, variant.entry).split('/')), mime: entry.mime });
    this.#preview = location;
    const playback = asset.kind === 'audio' ? audioPlaybackForVariant(variant) : ok({ loopStartSec: null, loopEndSec: null });
    return playback.ok ? ok({ uri: location.uri, mime: entry.mime, playback: playback.value }) : playback;
  }

  thumbnails(requests) {
    this.clearThumbnails();
    const current = this.current();
    const root = this.projectDocuments.currentRoot;
    if (!current || !root) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    const items = [], warnings = [], seen = new Set();
    for (const request of requests) {
      const asset = current.index.data.assets.find(value => value.id === request.assetId);
      const variant = asset?.variants.find(value => value.id === (request.variantId ?? asset.activeVariantId));
      const key = variant && `${asset.id}/${variant.id}`;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      const entry = variant?.files.find(file => file.path === variant.entry);
      if (!asset || asset.kind !== 'image' || !variant || !entry?.mime.startsWith('image/')) {
        warnings.push({ code: 'THUMBNAIL_UNAVAILABLE', severity: 'warning',
          message: `素材或图像版本无法预览：${request.assetId}/${request.variantId ?? 'active'}`,
          owner: 'M04', related: [], actions: ['locate'] });
        continue;
      }
      const lease = this.resources.register({ projectId: current.session.projectId, assetId: asset.id,
        variantId: variant.id, relative: variant.entry,
        path: join(root, ...assetFilePath(asset.id, variant.id, variant.entry).split('/')), mime: entry.mime });
      this.#thumbnailLeases.push(lease);
      items.push({ assetId: asset.id, variantId: variant.id, uri: lease.uri });
    }
    return { ok: true, value: items, warnings };
  }

  clearThumbnails() {
    for (const lease of this.#thumbnailLeases) lease.release();
    this.#thumbnailLeases = [];
  }

  stopPreview() { this.#preview?.release(); this.#preview = null; return ok(undefined); }

  resolveRuntime(assetId, variantId) {
    const current = this.current(), root = this.projectDocuments.currentRoot;
    const asset = current?.index.data.assets.find(item => item.id === assetId);
    const variant = asset?.variants.find(item => item.id === variantId);
    const entry = variant?.files.find(file => file.path === variant.entry);
    if (!current || !root || !entry) return fail('ASSET_VARIANT_MISSING', '快照中的素材版本不存在', 'M04', ['locate']);
    const leaseId = createId();
    const leases = variant.files.map(file => this.resources.register({ projectId: current.session.projectId, assetId, variantId,
      relative: file.path, path: join(root, ...assetFilePath(assetId, variantId, file.path).split('/')), mime: file.mime }));
    this.#runtimeLeases.set(leaseId, { release: () => leases.forEach(lease => lease.release()) });
    return ok({ leaseId, uri: leases[variant.files.indexOf(entry)].uri, mime: entry.mime, bytes: entry.bytes });
  }
  async previewPreparedAssets(preparedAssets) {
    const current = this.current(), root = this.projectDocuments.currentRoot;
    if (!current || !root) return fail('ASSET_INDEX_MISSING', 'Open a project before previewing prepared assets.', 'M04');
    const lease = await this.acquireTypes(current.session), leaseIds = [];
    try {
      const catalog = new AssetCatalog({ ...current.index, data: { assets: [...current.index.data.assets.filter(asset => !preparedAssets.some(prepared => prepared.id === asset.id)), ...preparedAssets] } }, lease.types);
      const assets = [], locations = [];
      for (const asset of preparedAssets) for (const variant of asset.variants) {
        for (const file of variant.files) { const info = await stat(join(root, ...assetFilePath(asset.id, variant.id, file.path).split('/'))); if (!info.isFile() || info.size !== file.bytes) throw new Error(`The prepared asset file is missing or changed: ${asset.name} / ${file.path}`); }
        const resolved = catalog.resolveAsset({ assetId: asset.id, variantId: variant.id, target: 'web', usage: 'ui' }, () => '');
        if (!resolved.ok) { for (const id of leaseIds) this.releaseRuntime(id); return resolved; }
        const resources = variant.files.map(file => this.resources.register({ projectId: current.session.projectId, assetId: asset.id, variantId: variant.id,
          relative: file.path, path: join(root, ...assetFilePath(asset.id, variant.id, file.path).split('/')), mime: file.mime }));
        const id = createId(), entryIndex = variant.files.findIndex(file => file.path === variant.entry), entry = variant.files[entryIndex];
        this.#runtimeLeases.set(id, { release: () => resources.forEach(resource => resource.release()) }); leaseIds.push(id);
        assets.push(resolved.value.asset); locations.push({ assetId: asset.id, variantId: variant.id, uri: resources[entryIndex].uri, mime: entry.mime, bytes: entry.bytes });
      }
      if (this.projectDocuments.currentSession !== current.session) throw new Error('The project changed while preparing asset preview.');
      return { ...ok({ assets, locations, leaseIds }), warnings: lease.warnings ?? [] };
    } catch (error) { for (const id of leaseIds) this.releaseRuntime(id); return fail('PREPARED_ASSET_PREVIEW', String(error), 'M04'); }
    finally { await lease.release(); }
  }
  releaseRuntime(leaseId) { this.#runtimeLeases.get(leaseId)?.release(); this.#runtimeLeases.delete(leaseId); return ok(undefined); }

  prepareMattingModel() {
    const script = this.mattingWorker;
    return this.operations.start({ operationId: createId(), owner: 'M04', script,
      input: { kind: 'prepareModel', modelDirectory: this.modelDirectory }, outputDirectory: null });
  }

  async removeBackground(input) {
    const current = this.current();
    const root = this.projectDocuments.currentRoot;
    if (!current || !root) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
    if (!input.choice.enabled) return ok({ status: 'unchanged' });
    const processor = new ImageVariantProcessor(root, () => this.current()?.index ?? current.index);
    const script = this.mattingWorker;
    const prepared = await processor.prepareMatting(input.assetId, input.sourceVariantId, input.choice,
      input.declared, input.choice.provider === 'node' ? request => this.operations.start({ operationId: request.operationId, owner: 'M04', script,
        input: { inputPath: request.inputPath, modelDirectory: this.modelDirectory }, outputDirectory: request.outputDirectory })
        : this.comfyMatting ? (request, signal) => this.comfyMatting(request,input.choice,input.collaboration,signal) : undefined,
      { recognizeAgain: input.recognizeAgain });
    if (!prepared.ok || !prepared.value.prepared) return prepared;
    const item = prepared.value.prepared;
    const entry = item.transparent.files.find(file => file.path === item.transparent.entry);
    if (!entry) { await processor.discard(item.preparationId); return fail('ASSET_ENTRY_MISSING', '透明版本入口不存在', 'M04'); }
    const location = this.resources.register({ projectId: current.session.projectId, assetId: input.assetId,
      variantId: item.transparentVariantId, relative: item.transparent.entry,
      path: join(root, ...assetFilePath(input.assetId, item.transparentVariantId, item.transparent.entry).split('/')), mime: entry.mime });
    const references = await this.referenceRecords(current.session, input.assetId);
    this.#preparedMatting.set(item.preparationId, { processor, item, projectId: current.session.projectId, location, references });
    return ok({ status: prepared.value.status, preparationId: item.preparationId,
      previewUri: location.uri, maskVariantId: item.maskVariantId, transparentVariantId: item.transparentVariantId,
      references: references.map(({ source, label, variantId }) => ({ source, label, variantId })) });
  }

  async confirmBackground(preparationId, scope) {
    const candidate = this.#preparedMatting.get(preparationId);
    const current = this.current();
    if (!candidate || !current || current.session.projectId !== candidate.projectId)
      return fail('PREPARATION_MISSING', '透明化准备项不属于当前作品', 'M04');
    if (scope !== 'allFloating' && scope !== 'keepCurrent' && scope?.kind !== 'newAssetSelectedRefs')
      return fail('REPLACEMENT_SCOPE_INVALID', '请选择透明版本的采用范围', 'M04', ['edit']);
    const references = await this.referenceRecords(current.session, candidate.item.assetId);
    const currentKeys = references.map(reference => JSON.stringify([sourceKey(reference.source), reference.variantId]));
    const previewKeys = candidate.references.map(reference => JSON.stringify([sourceKey(reference.source), reference.variantId]));
    if (JSON.stringify(currentKeys) !== JSON.stringify(previewKeys))
      return fail('REPLACEMENT_SCOPE_STALE', '素材引用已变化，请重新准备并预览影响', 'M04', ['compare']);
    let edit;
    let assetId = candidate.item.assetId;
    if (scope?.kind === 'newAssetSelectedRefs') {
      const keys = scope.sources.map(sourceKey);
      if (!keys.length || new Set(keys).size !== keys.length)
        return fail('REPLACEMENT_SCOPE_INVALID', '请选择不重复的素材引用', 'M04', ['edit']);
      const selected = keys.map(key => references.find(reference => sourceKey(reference.source) === key));
      if (selected.some(reference => !reference))
        return fail('REPLACEMENT_SCOPE_STALE', '所选引用已变化，请重新预览', 'M04', ['compare']);
      const prepared = await candidate.processor.prepareSelectedRefsIndexEdit(preparationId, selected);
      if (!prepared.ok) return prepared;
      const patches = selectedReferencePatches(current.session, selected, prepared.value.replacements);
      if (!patches.ok) { await candidate.processor.discard(preparationId); candidate.location.release(); this.#preparedMatting.delete(preparationId); return patches; }
      assetId = prepared.value.assetId;
      edit = ok({ ...prepared.value.edit,
        indexPatches: [...prepared.value.edit.indexPatches, ...patches.value] });
    } else edit = candidate.processor.prepareIndexEdit(preparationId, scope === 'allFloating');
    if (!edit.ok) return edit;
    const done = () => { candidate.location.release(); this.#preparedMatting.delete(preparationId); };
    const committed = await commitPreparedAsset(current.session, edit.value, {
      label: '采用透明版本', onApplied: () => { candidate.processor.confirm(preparationId); done(); },
      onRejected: async () => { await candidate.processor.discard(preparationId); done(); },
    });
    return committed.ok ? ok({ save: committed.value.save, transparentVariantId: candidate.item.transparentVariantId, assetId }) : committed;
  }

  async discardBackground(preparationId) {
    const candidate = this.#preparedMatting.get(preparationId);
    if (!candidate) return fail('PREPARATION_MISSING', '透明化准备项不存在', 'M04');
    await candidate.processor.discard(preparationId);
    candidate.location.release();
    this.#preparedMatting.delete(preparationId);
    return ok(undefined);
  }

  async discardPending(projectId = null) {
    for (const operation of this.#processorCalls.values()) if (projectId === null || operation.projectId === projectId) operation.controller.abort();
    for (const lease of this.#runtimeLeases.values()) lease.release();
    this.#runtimeLeases.clear();
    for (const [preparationId, candidate] of this.#preparedMatting) {
      if (projectId !== null && candidate.projectId !== projectId) continue;
      const discarded = await this.discardBackground(preparationId);
      if (!discarded.ok) return discarded;
    }
    this.stopPreview();
    return ok(undefined);
  }

  async import(paths, options = {}) {
    const current = this.current();
    const root = this.projectDocuments.currentRoot;
    if (!current || !root) return fail('ASSET_INDEX_MISSING', '请先打开包含素材索引的作品', 'M04');
    const typeLease = await this.acquireTypes(current.session);
    let coordinator, prepared = [], confirmed = false;
    try {
    coordinator = new ImportCoordinator(root, this.toolDirectory,
      () => this.current()?.index ?? current.index, undefined, this.svgDecoder,
      this.resourceProviders ? path => this.resourceProviders.resolve(path, current.session) : undefined, typeLease.types);
    const items = await coordinator.importBatch({ projectId: current.session.projectId, files: paths,
      folder: [], conflict: options.conflict ?? 'ask', usage: null, targetBinding: null });
    prepared = items.flatMap(item => item.result.ok ? [item.result.value.preparationId] : []);
    const failed = items.flatMap(item => item.result.ok ? [] : [{ path: item.sourcePath, issue: item.result.error }]);
    const persist=async(result,committed)=>{if(!options.collaboration)return;const context=options.collaboration,directory=join(root,'.galcraft','asset-import-results');await mkdir(directory,{recursive:true});const path=join(directory,`${context.sessionId}-${context.callId}.json`);await writeFile(`${path}.tmp`,JSON.stringify({result,committed}));await rename(`${path}.tmp`,path);};
    if (!prepared.length) {const result={succeeded:[],failed};await persist(result,true);return ok(result);}
    const edit = coordinator.prepareIndexEdit(prepared);
    if (!edit.ok) return edit;
    if (options.tags || options.source) {
      const importedIds = new Set(items.flatMap(item => item.result.ok ? [item.result.value.assetId] : []));
      for (const patch of edit.value.indexPatches) if (patch.kind === 'json') for (const change of patch.changes) if (change.path === '/data/assets' && Array.isArray(change.after)) {
        change.after = change.after.map(asset => importedIds.has(asset.id) ? { ...asset, tags: [...asset.tags, ...(options.tags ?? [])], source: options.source ?? asset.source } : asset);
      }
    }
    const planned = current.session.planEdit({ label: '导入素材', origin: 'batch',
      expected: edit.value.expected, patches: edit.value.indexPatches,
      preparedAssets: edit.value.preparedAssets, requiredRefs: [] });
    if (!planned.ok) return planned;
    const importedIds=new Set(items.flatMap(item=>item.result.ok?[item.result.value.assetId]:[])),after=edit.value.indexPatches.find(patch=>patch.kind==='json')?.changes.find(change=>change.path==='/data/assets')?.after??[];
    const batchResult={succeeded:after.filter(asset=>importedIds.has(asset.id)),failed};
    await persist(batchResult,false);
    if(this.projectDocuments.currentSession!==current.session)return fail('PROJECT_STALE','作品已切换，请重新导入素材','M04');
    await options.beforeCommit?.(planned.value);
    let applied;
    try { applied = options.collaboration ? await current.session.applyExternalEdit(planned.value.planId, edit.value.expected, options.collaboration) : current.session.applyEdit(planned.value.planId, edit.value.expected); }
    catch(error) { if(options.collaboration) { const accepted=await current.session.lookupExternalCall(options.collaboration);if(accepted?.ok){coordinator.confirm(prepared);confirmed=true;} } throw error; }
    if (!applied.ok) return applied;
    coordinator.confirm(prepared);confirmed=true;
    const next = this.current();
    const ids = new Set(applied.value.assetIds);
    const result={ succeeded: (next?.index.data.assets ?? []).filter(asset => ids.has(asset.id)), failed };await persist(result,true);return ok(result);
    } finally { try { if(!confirmed)for(const id of prepared)await coordinator.discard(id); } finally { await typeLease.release(); } }
  }
}
