import { assetFieldReferences, assetReferenceTarget, createId, readPluginDocumentInstances } from '@galcraft/contracts';
import { AssetSchema, CharacterSchema, FlowSchema, GalleryEntrySchema, IdSchema, LockSchema, PerformancePresetSchema, ProjectSchema, SceneSchema, VariableSchema } from '@galcraft/contracts';
import type { AssetQuery as CatalogQuery, AssetReference, DocumentView, Issue, Ref, Result, Source, StudioBridge } from '@galcraft/contracts';
import type { CompileInput } from '@galcraft/dsl';
import { readTemplateDocuments } from '@galcraft/templates';
import { parse } from '@galcraft/dsl';
import { prepareProjectPlugins } from './plugins.js';
import type { AssetQuery, AuthoringServices, AuthoringSource, SceneSource } from './controller.js';

function fail<T>(code: string, message: string): Result<T> {
  const error: Issue = { code, message, severity: 'error', owner: 'M01', related: [], actions: ['retry'] };
  return { ok: false, error, issues: [error] };
}
function catalogQuery(input: AssetQuery): CatalogQuery {
  return { kind: input.kind as CatalogQuery['kind'], folder: input.folder ?? null, characterId: input.characterId ?? null, sceneId: input.sceneId ?? null, locale: input.locale ?? null,
    search: input.text, tags: input.tags ?? [], usage: input.usage ?? null, allowedKinds: input.allowedKinds, typeFields: input.typeFields,
    reference: input.reference ?? 'any', review: input.review ?? 'any', sort: input.sort ?? 'name', direction: input.direction ?? 'asc',
    offset: input.offset, limit: input.limit, indexRevision: input.indexRevision ?? null };
}
const assetFields = new Set(['assetId', 'icon', 'splash', 'titleBackground', 'titleMusic',
  'titleVideo', 'emergencyImage', 'backgroundImage', 'imageId', 'fontId', 'avatar', 'cover', 'selectedAssetId', 'resourceId']);
const assetArrays = new Set(['assetIds', 'assets', 'referenceAssets', 'dynamicAssets', 'fallbackFonts', 'resourceIds']);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const pointerPart = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');
function nonSceneAssetReferences(documents: DocumentView[]): AssetReference[] {
  const references: AssetReference[] = [];
  for (const document of documents) {
    for (const [path, raw] of Object.entries(document.files)) {
      if (!path.endsWith('.json') || path === 'assets/index.json' || path.startsWith('plugins/')) continue;
      const envelope = JSON.parse(raw) as { data: unknown };
      const add = (assetId: unknown, parts: string[], variantId: unknown) => {
        if (!IdSchema.safeParse(assetId).success) return;
        const field = `/data/${parts.map(pointerPart).join('/')}`;
        references.push({ assetId: assetId as string, owner: { kind: 'document', id: document.documentId },
          source: { documentId: document.documentId, revision: document.revision, field },
          usage: `${path} · ${parts.join('.')}`, required: true,
          variantId: IdSchema.safeParse(variantId).success ? variantId as string : null });
      };
      const walk = (value: unknown, parts: string[] = []) => {
        if (Array.isArray(value)) { value.forEach((item, index) => walk(item, [...parts, String(index)])); return; }
        if (!record(value)) return;
        for (const [key, item] of Object.entries(value)) {
          if (key === 'plugin' && path.startsWith('ui/pages/')) continue;
          if (key === 'voiceByLocale' && record(item)) {
            for (const [locale, voiceId] of Object.entries(item)) add(voiceId, [...parts, key, locale], null);
          } else if (assetFields.has(key)) add(item, [...parts, key], value.variantId);
          else if (assetArrays.has(key) && Array.isArray(item))
            item.forEach((assetId, index) => add(assetId, [...parts, key, String(index)], null));
          else walk(item, [...parts, key]);
        }
      };
      walk(envelope.data);
    }
  }
  return references;
}
function sourceFrom(documents: DocumentView[]): Result<AuthoringSource> {
  const projectDocument = documents.find(document => Object.keys(document.files).some(path => path === 'project.json'));
  if (!projectDocument) return fail('PROJECT_NOT_OPEN', '请先打开作品');
  const projectRaw = projectDocument.files['project.json'];
  if (!projectRaw) return fail('PROJECT_INVALID', '作品配置不存在');
  let project: AuthoringSource['project'];
  try { project = ProjectSchema.parse(JSON.parse(projectRaw).data); }
  catch { return fail('PROJECT_INVALID', '作品配置不符合当前规格'); }
  const scenes: SceneSource[] = [];
  const characters: AuthoringSource['characters'] = [];
  const variables: NonNullable<AuthoringSource['variables']> = [];
  const references: NonNullable<AuthoringSource['references']> = [];
  for (const document of documents.filter(item => item.format === 'json')) {
    const characterFile = Object.entries(document.files).find(([path]) => path.startsWith('characters/') && path.endsWith('.json'));
    if (!characterFile) continue;
    try { characters.push(CharacterSchema.parse(JSON.parse(characterFile[1]).data)); }
    catch { return fail('CHARACTER_INVALID', `角色 ${document.documentId} 的配置无效`); }
  }
  for (const document of documents.filter(item => item.format === 'dsl')) {
    const sceneFile = Object.entries(document.files).find(([path]) => path.endsWith('/scene.json'));
    const scriptFile = Object.entries(document.files).find(([path]) => path.endsWith('/script.gal'));
    if (!sceneFile || !scriptFile) continue;
    try {
      const scene = SceneSchema.parse(JSON.parse(sceneFile[1]).data);
      variables.push(...scene.locals.map(variable => ({ ...variable, declaringSceneId: scene.id })));
      scenes.push({ sceneId: scene.id, documentId: document.documentId, revision: document.revision,
        savedRevision: document.savedRevision, dirty: document.dirty, chapterId: scene.chapterId,
        name: scene.name, text: scriptFile[1] });
      for (const node of parse({ documentId: document.documentId, revision: document.revision, text: scriptFile[1] }).cst) {
        if (!node.valid || !node.id) continue;
        references.push({ kind: 'statement', id: node.id, name: `${scene.name} · ${node.command}` });
        const args = node.object?.value as Record<string, unknown> | undefined;
        const entity = node.command === 'label' ? { kind: 'label' as const, id: args?.labelId } :
          ['changeBg', 'changeFigure', 'changeIllustration'].includes(node.command) && (args?.op ?? 'show') === 'show' ? { kind: 'object' as const, id: args!.objectId } :
            node.command === 'playEffect' && args?.op === 'play' ? { kind: 'effect' as const, id: args.soundId } : null;
        if (entity && typeof entity.id === 'string') references.push({ kind: entity.kind, id: entity.id, name: `${scene.name} · ${node.command}` });
      }
    } catch { return fail('SCENE_INVALID', `场景 ${document.documentId} 的配置无效`); }
  }
  for (const document of documents.filter(item => item.format === 'json')) {
    for (const [path, raw] of Object.entries(document.files)) if (path.startsWith('variables/') && path.endsWith('.json')) {
      try { variables.push({ ...VariableSchema.parse(JSON.parse(raw).data), declaringSceneId: null }); }
      catch { return fail('VARIABLE_INVALID', `变量 ${document.documentId} 的配置无效`); }
    }
    for (const [path, raw] of Object.entries(document.files)) {
      if (path.startsWith('gallery/') && path.endsWith('.json')) {
        try { const gallery = GalleryEntrySchema.parse(JSON.parse(raw).data); references.push({ kind: 'gallery', id: gallery.id, name: gallery.name });for(const difference of gallery.differences??[])references.push({kind:'galleryDifference',id:difference.id,name:`${gallery.name} · ${difference.name}`}); }
        catch { return fail('GALLERY_INVALID', `回想配置 ${document.documentId} 无效`); }
      }
      if (path.startsWith('presentation/presets/') && path.endsWith('.json')) {
        try { const preset = PerformancePresetSchema.parse(JSON.parse(raw).data); references.push({ kind: 'preset', id: preset.id, name: preset.name }); }
        catch { return fail('PRESET_INVALID', `演出预设 ${document.documentId} 无效`); }
      }
    }
  }
  try { const template = readTemplateDocuments(documents);
    references.push(...template.pages.map(page => ({ kind: 'page' as const, id: page.id, name: page.key })));
    references.push(...template.styles.map(style => ({ kind: 'style' as const, id: style.id, name: style.name })));
  } catch { /* M08 的模板错误由编译状态呈现。 */ }
  const order = new Map(project.chapters.flatMap(chapter => chapter.sceneIds).map((id, index) => [id, index]));
  scenes.sort((a, b) => (order.get(a.sceneId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.sceneId) ?? Number.MAX_SAFE_INTEGER));
  return { ok: true, value: { projectDocumentId: projectDocument.documentId, projectRevision: projectDocument.revision,
    documentVersions:documents.map(document=>({documentId:document.documentId,revision:document.revision})),projectSavedRevision: projectDocument.savedRevision, projectDirty: projectDocument.dirty, project, scenes, characters, variables, references,
    anyDirty: documents.some(document => document.dirty), assetIndexDocumentId: documents.find(document => document.files['assets/index.json'])?.documentId, assetIndexRevision: documents.find(document => document.files['assets/index.json'])?.revision }, warnings: [] };
}

export function compileInput(documents: DocumentView[]): Result<CompileInput> {
  const authoring = sourceFrom(documents);
  if (!authoring.ok) return authoring;
  try {
    const file = (path: string) => documents.flatMap(document => Object.entries(document.files)).find(([name]) => name === path)?.[1];
    const lockRaw = file('dependencies.lock.json');
    const assetRaw = file('assets/index.json');
    if (!lockRaw || !assetRaw) return fail('COMPILE_INPUT_MISSING', '缺少作品依赖锁或素材索引');
    const lock = LockSchema.parse(JSON.parse(lockRaw).data);
    const assets = AssetSchema.array().parse(JSON.parse(assetRaw).data.assets);
    const scenes = documents.filter(document => document.format === 'dsl').map(document => {
      const raw = Object.entries(document.files).find(([path]) => path.endsWith('/scene.json'))?.[1];
      return raw ? SceneSchema.parse(JSON.parse(raw).data) : null;
    }).filter((scene): scene is NonNullable<typeof scene> => scene !== null);
    const variables = documents.flatMap(document => Object.entries(document.files).filter(([path]) => path.startsWith('variables/') && path.endsWith('.json'))
      .map(([, raw]) => VariableSchema.parse(JSON.parse(raw).data)));
    const gallery = documents.flatMap(document => Object.entries(document.files).filter(([path]) => path.startsWith('gallery/') && path.endsWith('.json'))
      .map(([, raw]) => GalleryEntrySchema.parse(JSON.parse(raw).data)));
    const flows = documents.flatMap(document => Object.entries(document.files).filter(([path]) => path.startsWith('flows/') && path.endsWith('.json'))
      .map(([, raw]) => FlowSchema.parse(JSON.parse(raw).data)));
    const debugScenarios = documents.flatMap(document => Object.entries(document.files).filter(([path]) => path.startsWith('authoring/debug/') && path.endsWith('.json'))
      .map(([, raw]) => ({ documentId: document.documentId, revision: document.revision, data: JSON.parse(raw).data })));
    const template = readTemplateDocuments(documents);
    const pluginDocuments = Object.fromEntries(lock.plugins.flatMap(plugin => {
      const raw = file(`plugins/${plugin.id}/documents/config.json`) ?? file(`plugins/${plugin.id}/config.json`);
      return raw ? [[plugin.id, JSON.parse(raw).data]] : [];
    }));
    return { ok: true, value: { projectId: authoring.value.project.projectId, engineVersion: authoring.value.project.engineVersion,
      lock, project: authoring.value.project,
      documents: [...authoring.value.scenes.map(scene => ({ documentId: scene.documentId, revision: scene.revision,
        kind: 'scene', sceneId: scene.sceneId, text: scene.text })), ...documents.flatMap(document => Object.entries(document.files)
        .filter(([path]) => path.startsWith('flows/') && path.endsWith('.json')).map(([, text]) => ({ documentId: document.documentId,
          revision: document.revision, kind: 'flow', flowId: JSON.parse(text).data.id, text })))], scenes, characters: authoring.value.characters,
      variables, assets, gallery, flows, debugScenarios, template, assetReferences: nonSceneAssetReferences(documents),
      pluginDocuments,
      cancelOperationId: createId(),
      entityVersions: documents.filter(document => document.format !== 'dsl').map(document => ({ ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision })) }, warnings: [] };
  } catch { return fail('COMPILE_INPUT_INVALID', '作品编译输入不符合当前规格'); }
}

async function inputWithPlugins(bridge: StudioBridge, documents: DocumentView[]): Promise<Result<{ input: CompileInput; dispose(): Promise<void> }>> {
  const result = compileInput(documents);
  if (!result.ok) return result;
  let plugins: Awaited<ReturnType<typeof prepareProjectPlugins>> | null = null;
  try {
    const input = result.value;
    plugins = await prepareProjectPlugins(bridge, input.lock, input.pluginDocuments ?? {},
      { projectId: input.projectId, kind: 'playtest', instance: createId() }, documents, [], 'definition');
    input.pluginConfigMappings = Object.fromEntries(plugins.definitions.flatMap(({ definition }) => (definition.documents ?? []).flatMap(document => document.configMapping ? [[document.key, document.configMapping]] : [])));
    input.pluginMessages = plugins.definitions.flatMap(({ pluginId, definition }) => definition.messages ? [{ pluginId, messages: definition.messages }] : []);
    input.pluginConfigDocuments = [];
    const referenceIssues: Issue[] = [];
    const collectReference = (ref: Ref, source: Source, usage: string) => {
      if (ref.kind !== 'asset' && ref.kind !== 'variant') return;
      const target = assetReferenceTarget(ref, input.assets);
      if (!target) referenceIssues.push({ code: 'PLUGIN_CONFIG_ASSET_MISSING', message: `插件贡献 ${usage} 引用了缺少的素材或版本 ${ref.id}`,
        severity: 'error', owner: 'M03', related: [ref], actions: ['edit', 'locate'], source });
      else (input.assetReferences ??= []).push({ ...target, owner: { kind: 'document', id: source.documentId }, source, usage, required: true });
    };
    for (const { pluginId, definition } of plugins.definitions) {
      for (const document of definition.documents ?? []) {
        const instances = readPluginDocumentInstances(documents).filter(instance => instance.pluginId === pluginId && instance.contributionKey === document.key);
        for (const instance of instances) {
          const source = documents.find(item => item.documentId === instance.documentId);
          if (!source) continue;
          const data = instance.data;
          if (document.configMapping) input.pluginConfigDocuments.push({ contribution: document.key, documentId: source.documentId, revision: source.revision, data });
          for (const ref of document.collectReferences(data)) collectReference(ref, { documentId: source.documentId, revision: source.revision }, document.key);
        }
      }
      for (const page of input.template.pages) {
        const source = documents.find(document => Object.entries(document.files).some(([path, raw]) => path.startsWith('ui/pages/') && path.endsWith('.json') && JSON.parse(raw).data.id === page.id));
        if (!source) continue;
        const visit = (component: typeof page.root, path: string) => {
          const provider = definition.components?.find(item => item.key === component.plugin?.key);
          if (provider && component.plugin) for (const { ref, path: parts } of assetFieldReferences(component.plugin.props, provider.fields ?? []))
            collectReference(ref, { documentId: source.documentId, revision: source.revision, field: `${path}/plugin/props/${parts.map(pointerPart).join('/')}` }, provider.key);
          component.children.forEach((child, index) => visit(child, `${path}/children/${index}`));
        };
        visit(page.root, '/data/root');
      }
    }
    if (referenceIssues.length) { await plugins.dispose(); return { ok: false, error: referenceIssues[0]!, issues: referenceIssues }; }
    input.pluginCommands = plugins.commandSpecs;
    input.pluginConditions = Object.fromEntries(plugins.conditionSpecs.map(condition => [condition.key, {
      args: condition.fields.map(field => field.type === 'number' || field.type === 'integer' ? 'number' as const :
        field.type === 'boolean' ? 'boolean' as const : 'string' as const), returns: 'boolean' as const,
    }]));
    return { ok: true as const, value: { input, dispose: plugins.dispose }, warnings: [] };
  } catch (error) { await plugins?.dispose(); return fail<{ input: CompileInput; dispose(): Promise<void> }>('PLUGIN_LOAD', String(error)); }
}

export function createAuthoringServices(bridge: StudioBridge): AuthoringServices & {
  bridge: StudioBridge;
  chooseDirectory: StudioBridge['projects']['chooseDirectory'];
  openProject: StudioBridge['projects']['open'];
  copyProject: StudioBridge['projects']['copy'];
  createProject: StudioBridge['projects']['create'];
  closeProject: StudioBridge['projects']['close'];
  pickAssetFiles: StudioBridge['files']['pickAssets'];
  revealEntity: StudioBridge['files']['revealEntity'];
} {
  return {
    bridge,
    runtimeAssets: bridge.assets,
    assetTypeCatalog: () => bridge.assets.typeCatalog(),
    editAssetTypeData: input => bridge.assets.editTypeData(input),
    saveAnimation: input => bridge.assets.saveAnimation(input),
    weatherTexture: key => bridge.assets.weatherTexture(key),
    compileStyle: input => bridge.templates.compileStyle(input),
    read: async provided => { if (provided) return sourceFrom(provided); const documents = await bridge.documents.list(); return documents.ok ? sourceFrom(documents.value) : documents; },
    queryAssets: async input => bridge.assets.query(catalogQuery(input)),
    queryAssetPicker: input => bridge.assets.picker(input),
    recordAssetUse: input => bridge.assets.recordUse(input),
    removeRecentAsset: input => bridge.assets.removeRecent(input),
    allAssetIds: async input => bridge.assets.allIds(catalogQuery({ ...input, offset: 0, limit: 40 })),
    importAssets: paths => bridge.assets.import(paths),
    getAsset: id => bridge.assets.get(id),
    inspectModelAsset: id => bridge.assets.inspectModel(id),
    describeAssets: input => bridge.assets.describe(input),
    renameAssets: changes => bridge.assets.rename(changes),
    verifyAssetTarget: (target, operationId) => bridge.assets.verifyTarget(target, operationId),
    planBatchRename: input => bridge.assets.planBatchRename(input),
    applyBatchRename: id => bridge.assets.applyBatchRename(id),
    removeAssets: ids => bridge.assets.remove(ids),
    previewAsset: (id, variantId) => bridge.assets.preview(id, variantId),
    stopAssetPreview: () => bridge.assets.stopPreview(),
    thumbnails: requests => bridge.assets.thumbnails(requests),
    prepareMattingModel: () => bridge.assets.prepareMattingModel(),
    removeBackground: input => bridge.assets.removeBackground(input),
    confirmBackground: (id, scope) => bridge.assets.confirmBackground(id, scope),
    discardBackground: id => bridge.assets.discardBackground(id),
    readPreferences: () => bridge.authoringPreferences.readPreferences(),
    writePreferences: value => bridge.authoringPreferences.writePreferences(value),
    compilePreview: async (saved = false, provided) => { const documents = provided ? { ok: true as const, value: provided } : await bridge.documents.list();
      if (!documents.ok) return documents;
      const prepared = await inputWithPlugins(bridge, saved ? documents.value.filter(doc => Object.keys(doc.savedFiles).length).map(doc =>
        ({ ...doc, files: doc.savedFiles, revision: doc.savedRevision, dirty: false })) : documents.value);
      if (!prepared.ok) return prepared;
      try { return await bridge.language.compile(prepared.value.input); }
      finally { await prepared.value.dispose(); } },
    searchSemantic: async (filter, offset, sceneIds = []) => {
      const documents = await bridge.documents.list(); if (!documents.ok) return documents;
      const prepared = await inputWithPlugins(bridge, documents.value); if (!prepared.ok) return prepared;
      try {
        const input = prepared.value.input;
        const compiled = await bridge.language.compile(input); if (!compiled.ok) return compiled;
        return bridge.language.querySemantic({ projectId: input.projectId, requestId: createId(),
          expected: [...input.documents.map(item => ({ ref: { kind: 'document' as const, id: item.documentId }, revision: item.revision })),
            ...(input.entityVersions ?? [])], expectedLock: input.lock, sceneIds, offset, limit: 40, filter });
      } finally { await prepared.value.dispose(); }
    },
    locate: source => bridge.language.locate(source),
    chooseDirectory: () => bridge.projects.chooseDirectory(),
    openProject: path => bridge.projects.open(path),
    copyProject: () => bridge.projects.copy(),
    createProject: input => bridge.projects.create(input),
    closeProject: (id, choice) => bridge.projects.close(id, choice),
    pickAssetFiles: () => bridge.files.pickAssets(),
    revealEntity: ref => bridge.files.revealEntity(ref),
  };
}
