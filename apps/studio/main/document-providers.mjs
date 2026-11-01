import { createId, normalizeProjectAuthoringData, normalizeCharacterAuthoringData } from '@galcraft/contracts';

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { CharacterSchema, GalleryEntrySchema, IdSchema, LockSchema, PerformancePresetSchema, ProjectSchema, SceneSchema, VariableSchema, VersionSchema } from '@galcraft/contracts';
import { openFromAccess, ProjectSession, recoverTransactions } from '@galcraft/documents';
import { createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { CoreCommandSpecs, parse } from '@galcraft/dsl';
import { backgroundReferences } from './asset-providers.mjs';
import { fail, ok } from './result.mjs';

const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }, null, 2) + '\n';
const sameDirectory = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
const commandFields = new Map(CoreCommandSpecs.map(spec => [spec.key, spec.fields]));
function normalizeAuthoringFields(session){
  const patches=[],expected=[];
  for(const document of session.documents.values())for(const [path,raw]of Object.entries(document.files))if(path==='project.json'||path.startsWith('characters/')&&path.endsWith('.json')){
    const before=JSON.parse(raw).data,after=path==='project.json'?normalizeProjectAuthoringData(before):normalizeCharacterAuthoringData(before);
    if(JSON.stringify(before)!==JSON.stringify(after)){patches.push({kind:'json',documentId:document.documentId,changes:[{path:'/data',before,after,op:'set'}]});expected.push({ref:{kind:'document',id:document.documentId},revision:document.revision});}
  }
  if(!patches.length)return ok(undefined);
  const plan=session.planEdit({label:'Normalize current authoring fields',origin:'field',expected,patches,preparedAssets:[],requiredRefs:[]});
  return plan.ok?session.applyEdit(plan.value.planId,plan.value.input.expected):plan;
}
function initializeMenuLanguages(session) {
  const document = [...session.documents.values()].find(item => item.files['project.json']);
  const project = JSON.parse(document.files['project.json']).data;
  if (project.languages.menus) return ok(undefined);
  const planned = session.planEdit({ label: '初始化作品菜单语言支持列表', origin: 'field',
    expected: [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }],
    preparedAssets: [], requiredRefs: [], patches: [{ kind: 'json', documentId: document.documentId,
      changes: [{ path: '/data/languages/menus', before: null, after: ProjectSchema.parse(project).languages.menus, op: 'set' }] }] });
  return planned.ok ? session.applyEdit(planned.value.planId, planned.value.input.expected) : planned;
}
function validateEditableDocuments(session) {
  for (const document of session.documents.values()) for (const [path, raw] of Object.entries(document.files)) {
    const schema = path.startsWith('characters/') && path.endsWith('.json') ? CharacterSchema
      : path.endsWith('/scene.json') ? SceneSchema
      : path.startsWith('variables/') && path.endsWith('.json') ? VariableSchema
      : path.startsWith('gallery/') && path.endsWith('.json') ? GalleryEntrySchema
      : path.startsWith('presentation/presets/') && path.endsWith('.json') ? PerformancePresetSchema : null;
    if (schema) schema.parse(path.startsWith('characters/')?normalizeCharacterAuthoringData(JSON.parse(raw).data):JSON.parse(raw).data);
  }
}
function referenceParent(source, documents) {
  if (!source?.path.startsWith('/data/')) return null;
  const raw = Object.entries(documents.get(source.documentId)?.files ?? {}).find(([path]) => path.endsWith('.json'))?.[1];
  if (!raw) return null;
  return source.path.slice(1).split('/').slice(0, -1).reduce((value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], JSON.parse(raw));
}
function resolveKnownRef(ref, documents, source) {
  const parent = source ? referenceParent(source, documents) : null;
  if (ref.kind !== 'asset' && ref.kind !== 'variant') {
    for (const document of documents.values()) for (const [path, raw] of Object.entries(document.files)) {
      if (!path.endsWith('.json')) continue;
      const data = JSON.parse(raw).data;
      if (ref.kind === 'chapter' && path === 'project.json' && data.chapters.some(chapter => chapter.id === ref.id)) return true;
      if (ref.kind === 'object' && path.startsWith('characters/') && (!source || source.documentId === document.documentId) && data.differences?.some(difference => difference.id === ref.id)) return true;
      if (ref.kind === 'label' && path.endsWith('/scene.json') && (!parent?.sceneId || parent.sceneId === data.id)) {
        const text = Object.entries(document.files).find(([path]) => path.endsWith('/script.gal'))?.[1];
        if (text && parse({ documentId: document.documentId, revision: document.revision, text }).cst.some(node => node.valid && node.command === 'label' && node.object?.value?.labelId === ref.id)) return true;
      }
      const kind = path.startsWith('characters/') ? 'character' : path.startsWith('variables/') ? 'variable'
        : path.endsWith('/scene.json') ? 'scene' : path.startsWith('ui/pages/') ? 'page' : path.startsWith('ui/styles/') ? 'style' : null;
      if(ref.kind==='galleryDifference'&&path.startsWith('gallery/')&&JSON.parse(raw).data?.differences?.some(difference=>difference.id===ref.id))return true;
      if (kind === ref.kind && JSON.parse(raw).data?.id === ref.id) return true;
    }
    return false;
  }
  const index = [...documents.values()].find(document => document.files['assets/index.json']);
  if (!index) return false;
  const assets = JSON.parse(index.files['assets/index.json']).data.assets;
  if (ref.kind === 'variant' && source) {
    const bindings = parent?.assetId ? [parent.assetId] : backgroundReferences({ documents: new Map([[source.documentId, documents.get(source.documentId)]]) })
      .filter(reference => reference.variantId === ref.id).map(reference => reference.assetId);
    return bindings.some(assetId => assets.some(asset => asset.id === assetId && asset.variants.some(variant => variant.id === ref.id)));
  }
  return ref.kind === 'asset' ? assets.some(asset => asset.id === ref.id)
    : assets.some(asset => asset.variants.some(variant => variant.id === ref.id));
}

function requiredDocumentReferences(documents) {
  const references = backgroundReferences({ documents }).flatMap(reference => {
    const source = { documentId: reference.source.documentId, path: reference.source.statementId ? '#source' : reference.source.field };
    return [{ ...source, ref: { kind: 'asset', id: reference.assetId } }, ...(reference.variantId ? [{ ...source,
      path: source.path.endsWith('/assetId') ? source.path.slice(0, -7) + 'variantId' : source.path,
      ref: { kind: 'variant', id: reference.variantId } }] : [])];
  });
  const add = (documentId, path, kind, id) => { if (id) references.push({ documentId, path, ref: { kind, id } }); };
  const entry = (documentId, path, value) => {
    if (!value) return;
    add(documentId, `${path}/sceneId`, 'scene', value.sceneId);
    add(documentId, `${path}/labelId`, 'label', value.labelId);
  };
  const commandReferences = (documentId, fields, args) => {
    for (const field of fields) {
      const value = args?.[field.path];
      if (['scene', 'label', 'character'].includes(field.refKind) && IdSchema.safeParse(value).success) add(documentId, '#source', field.refKind, value);
      if (field.type === 'object' && value && typeof value === 'object') commandReferences(documentId, field.children ?? [], value);
      if (field.type === 'array' && Array.isArray(value) && field.item) for (const item of value) commandReferences(documentId, [field.item], { [field.item.path]: item });
    }
  };
  for (const document of documents.values()) {
    const text = Object.entries(document.files).find(([path]) => path.endsWith('/script.gal'))?.[1];
    if (!text) continue;
    for (const node of parse({ documentId: document.documentId, revision: document.revision, text }).cst)
      if (node.valid && node.command !== 'label' && node.object) commandReferences(document.documentId, commandFields.get(node.command) ?? [], node.object.value);
  }
  for (const document of documents.values()) for (const [path, raw] of Object.entries(document.files)) {
    if (!path.endsWith('.json')) continue;
    const data = JSON.parse(raw).data, id = document.documentId;
    if (path === 'project.json') {
      entry(id, '/data/entry', data.entry);
      data.chapters.forEach((chapter, index) => chapter.sceneIds.forEach((sceneId, sceneIndex) => add(id, `/data/chapters/${index}/sceneIds/${sceneIndex}`, 'scene', sceneId)));
    } else if (path.endsWith('/scene.json')) add(id, '/data/chapterId', 'chapter', data.chapterId);
    else if (path.startsWith('characters/')) {
      entry(id, '/data/afterstory/entry', data.afterstory?.entry);
      add(id, '/data/initialDifferenceId', 'object', data.initialDifferenceId);
      data.personalRoute?.sceneIds.forEach((sceneId, index) => add(id, `/data/personalRoute/sceneIds/${index}`, 'scene', sceneId));
      for (const variableId of Object.keys(data.afterstory?.initialProgress ?? {})) add(id, `/data/afterstory/initialProgress/${variableId}`, 'variable', variableId);
    }
  }
  return references;
}

export class ProjectDocuments {
  #current = null;

  constructor(projectAccess, resolveRequiredRef, engineCatalog) {
    this.projectAccess = projectAccess;
    this.resolveRequiredRef = resolveRequiredRef ?? resolveKnownRef;
    this.engineCatalog = engineCatalog;
  }

  get currentSession() { return this.#current?.session ?? null; }
  get currentSessionId() { return this.#current?.sessionId ?? null; }
  get currentRoot() { return this.#current?.root ?? null; }

  async create(input, prepareCreated) {
    if (this.#current && !['save', 'discard'].includes(input?.closeChoice)) return fail('PROJECT_SESSION_ACTIVE', '请先关闭当前作品', 'M02');
    if (!input || !input.name?.trim() || /[<>:"/\\|?*]/.test(input.name) || input.name === '.' || input.name === '..')
      return fail('PROJECT_NAME_INVALID', '作品名称不能作为目录名', 'M02');
    if (!Number.isSafeInteger(input.width) || input.width <= 0 || !Number.isSafeInteger(input.height) || input.height <= 0)
      return fail('CANVAS_INVALID', '画布尺寸必须是正整数', 'M02');
    if (!VersionSchema.safeParse(input.engineVersion).success) return fail('ENGINE_VERSION_INVALID', '请选择精确引擎版本', 'M11');
    if (!this.engineCatalog) return fail('ENGINE_CATALOG_UNAVAILABLE', '引擎目录尚未就绪', 'M11');
    const engine = await this.engineCatalog.resolveEngine(input.engineVersion, 'web');
    if (!engine.ok) return engine;
    const projectId = createId();
    const chapterId = createId();
    const sceneId = createId();
    const sceneDocumentId = createId();
    const projectDocumentId = createId();
    const templateKind = input.template === 'empty' ? 'light' : input.template === 'sample' ? 'rich' : input.template;
    if (!['light', 'standard', 'rich'].includes(templateKind)) return fail('TEMPLATE_INVALID', '模板种类无效', 'M08');
    const template = createOfficialTemplate({ kind: templateKind, ...(input.template === 'sample' ? { richRelation: 'variables' } : {}) });
    const project = ProjectSchema.parse({ projectId, name: input.name.trim(), description: '', releaseVersion: '0.1.0',
      engineVersion: input.engineVersion, canvas: { width: input.width, height: input.height, stageColor: '#000000' },
      entry: { sceneId, labelId: null }, chapters: [{ id: chapterId, name: '第一章', sceneIds: [sceneId] }],
      display: { icon: null, splash: null, titleBackground: null, titleMusic: null, titleVideo: null },
      languages: { menus: ['zh-CN'], menuDefault: 'zh-CN', textDefault: 'zh-CN', voiceDefault: 'zh-CN', voices: [] },
      dynamicAssets: [], player: { autosave: true },
      platform: { steamAppId: null }, createdAt: new Date().toISOString(),
    });
    const scene = SceneSchema.parse({ id: sceneId, name: '场景 1', chapterId, parameters: [], locals: [], returns: 'void', script: 'script.gal' });
    const lock = LockSchema.parse({ engine: { kind: 'engine', id: 'galcraft', version: input.engineVersion,
      targets: [...engine.value.manifest.targets], required: true }, plugins: template.dependencies.filter(item => item.kind === 'plugin'),
      template: template.dependencies.find(item => item.kind === 'template'), selectedProviders: {} });
    const lockDocumentId = createId();
    const assetIndexId = createId();
    const inputs = [
      { documentId: projectDocumentId, revision: 1, format: 'json', files: { 'project.json': envelope(projectDocumentId, project) } },
      { documentId: lockDocumentId, revision: 1, format: 'json', files: { 'dependencies.lock.json': envelope(lockDocumentId, lock) } },
      { documentId: sceneDocumentId, revision: 1, format: 'dsl', files: {
        [`scenes/${sceneId}/scene.json`]: envelope(sceneDocumentId, scene),
        [`scenes/${sceneId}/script.gal`]: input.template === 'sample'
          ? `say {speaker:{kind:"narrator"},text:"欢迎使用 GalCraft。"} @${createId()};\n` : '',
      } },
      { documentId: assetIndexId, revision: 1, format: 'json', files: { 'assets/index.json': envelope(assetIndexId, { assets: [] }) } },
      ...createTemplateDocuments(template),
    ];
    const root = join(resolve(input.path), input.name.trim());
    await ProjectSession.createProject(root, projectId, inputs);
    const prepared = await this.prepareOpen(root);
    if (!prepared.ok) return prepared;
    if (prepareCreated) {
      const candidate = new ProjectDocuments(this.projectAccess, this.resolveRequiredRef, this.engineCatalog);
      candidate.#current = prepared.value;
      try { await prepareCreated(candidate); }
      catch (error) {
        await prepared.value.session.dispose('discard');
        this.projectAccess.release(prepared.value.sessionId);
        throw error;
      }
    }
    return this.adoptPrepared(prepared.value, input.closeChoice ?? 'save');
  }

  list() {
    const session = this.#current?.session;
    return session ? ok([...session.documents.keys()].map(id => session.readDocument(id)))
      : fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
  }

  async open(path, retainedSessionId = null) {
    const root = resolve(path);
    if (this.#current && sameDirectory(this.#current.root, root)) {
      return ok({ projectId: this.#current.projectId, sessionId: this.#current.sessionId });
    }
    if (this.#current) return fail('PROJECT_SESSION_ACTIVE', '请先关闭当前作品', 'M02');
    const prepared = await this.prepareOpen(root, retainedSessionId);
    if (!prepared.ok) return prepared;
    this.#current = prepared.value;
    return ok({ projectId: prepared.value.projectId, sessionId: prepared.value.sessionId });
  }

  async prepareOpen(root, retainedSessionId = null) {
    await this.beforeOpen?.(root);
    if (await recoverTransactions(root) !== 'ready') {
      return fail('RECOVERY_PENDING', '作品文件组恢复尚未完成', 'M02');
    }

    const record = JSON.parse(await readFile(join(root, 'project.json'), 'utf8'));
    if (record.schemaVersion !== 1) throw new Error('Invalid project document');
    IdSchema.parse(record.documentId);
    const project = ProjectSchema.parse(normalizeProjectAuthoringData(record.data));
    const sessionId = retainedSessionId ?? createId();
    let session;
    await this.projectAccess.attach({
      projectId: project.projectId,
      sessionId,
      path: root,
      resolveEntityDirectory: async ref => {
        if (ref.kind === 'document') {
          const document = session?.readDocument(ref.id);
          const path = document && Object.keys(document.files)[0];
          return path ? dirname(join(root, path)) : null;
        }
        if (ref.kind === 'asset' || ref.kind === 'variant') {
          const index = [...(session?.documents.values() ?? [])].find(document => document.files['assets/index.json']);
          if (!index) return null;
          const assets = JSON.parse(index.files['assets/index.json']).data.assets;
          const asset = assets.find(asset => asset.id === ref.id || asset.variants.some(variant => variant.id === ref.id));
          const variant = asset?.variants.find(variant => variant.id === ref.id) ?? asset?.variants.find(variant => variant.id === asset.activeVariantId);
          return variant ? join(root, 'assets', 'files', asset.id, variant.id) : null;
        }
        return null;
      },
    });
    try {
      session = await openFromAccess(this.projectAccess, sessionId, project.projectId,
        { resolveRequiredRef: this.resolveRequiredRef, requiredReferences: requiredDocumentReferences });
      validateEditableDocuments(session);
      const recovery = await session.listRecovery();
      if (!recovery.ok) throw new Error(recovery.error.message);
      if (!recovery.value) {
        const normalized=normalizeAuthoringFields(session);if(!normalized.ok)throw new Error(normalized.error.message);
        const initialized = initializeMenuLanguages(session);
        if (!initialized.ok) throw new Error(initialized.error.message);
      }
    } catch (error) {
      await session?.dispose('keep');
      this.projectAccess.release(sessionId);
      throw error;
    }
    return ok({ root, projectId: project.projectId, sessionId, session });
  }

  async switch({ directory, choice }) {
    if (!['save', 'discard'].includes(choice)) return fail('INVALID_CLOSE_CHOICE', '关闭选择无效', 'M02');
    const root = resolve(directory), current = this.#current;
    if (!current || sameDirectory(current.root, root)) return this.open(root);
    // Read and attach the candidate before disposing the active workspace.
    // Failed opening or saving leaves the current session and its working documents intact.
    const prepared = await this.prepareOpen(root);
    if (!prepared.ok) return prepared;
    return this.adoptPrepared(prepared.value, choice);
  }

  async adoptPrepared(candidate, choice) {
    const current = this.#current;
    if (!current) {
      this.#current = candidate;
      return ok({ projectId: candidate.projectId, sessionId: candidate.sessionId });
    }
    try {
      const closed = await this.close(current.sessionId, choice);
      if (!closed.ok) {
        await candidate.session.dispose('keep');
        this.projectAccess.release(candidate.sessionId);
        return closed;
      }
    } catch (error) {
      await candidate.session.dispose('keep');
      this.projectAccess.release(candidate.sessionId);
      throw error;
    }
    this.projectAccess.release(current.sessionId);
    this.#current = candidate;
    return ok({ projectId: candidate.projectId, sessionId: candidate.sessionId });
  }

  async close(sessionId, choice) {
    const current = this.#current;
    if (!current || current.sessionId !== sessionId) return fail('PROJECT_SESSION_MISSING', '作品会话不存在', 'M02');
    if (choice === 'cancel') return ok(undefined);
    if (choice === 'save') {
      const planned = current.session.planSave({ kind: 'all' });
      if (!planned.ok) return planned;
      const saved = await current.session.save(planned.value.planId);
      if (!saved.ok) return saved;
      if (saved.value.remainingDirty.length) return fail('UNSAVED_CHANGES', '作品仍有未保存修改', 'M02');
      await this.beforeClose?.(current.session);
      const disposed = await current.session.dispose('saved');
      if (!disposed.ok) return disposed;
    } else if (choice === 'discard') {
      await this.beforeClose?.(current.session);
      const disposed = await current.session.dispose('discard');
      if (!disposed.ok) return disposed;
    } else return fail('INVALID_CLOSE_CHOICE', '关闭选择无效', 'M02');
    this.#current = null;
    return ok(undefined);
  }

  async reopenCommitted() {
    const current = this.#current;
    if (!current) return fail('PROJECT_SESSION_MISSING', '作品会话不存在', 'M02');
    this.projectAccess.release(current.sessionId); this.#current = null;
    return this.open(current.root, current.sessionId);
  }

  #call(method, args) {
    const session = this.#current?.session;
    return session ? session[method](...args) : fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
  }

  planEdit(input) { return this.#call('planEdit', [input]); }
  applyEdit(planId, expected) { return this.#call('applyEdit', [planId, expected]); }
  planUndo(documentId, operationId, paths) { return this.#call('planUndo', [documentId, operationId, paths]); }
  planRedo(documentId, paths) { return this.#call('planRedo', [documentId, paths]); }
  planDiscard(scope) { return this.#call('planDiscard', [scope]); }
  applyDiscard(planId) { return this.#call('applyDiscard', [planId]); }
  undo(planId) { return this.#call('undo', [planId]); }
  redo(planId) { return this.#call('redo', [planId]); }
  planSave(scope) { return this.#call('planSave', [scope]); }
  save(planId) { return this.#call('save', [planId]); }
  getConflict(planId) { return this.#current ? ok(this.#current.session.getConflict(planId)) : fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02'); }
  resolveConflict(planId, choice, copyPath) { return this.#call('resolveConflict', [planId, choice, copyPath]); }
  listRecovery() { return this.#call('listRecovery', []); }
  async recover(choice) {
    const session = this.#current?.session;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
    const recovered = await session.recover(choice);
    if (!recovered.ok) return recovered;
    const normalized=normalizeAuthoringFields(session);if(!normalized.ok)return normalized;
    const initialized = initializeMenuLanguages(session);
    return initialized.ok ? recovered : initialized;
  }
  getRecoveryConflict() { return this.#current ? ok(this.#current.session.getRecoveryConflict()) : fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02'); }
  async resolveRecoveryConflict(choice, copyPath) {
    const session = this.#current?.session;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
    const recovered = await session.resolveRecoveryConflict(choice, copyPath);
    if (!recovered.ok) return recovered;
    const normalized=normalizeAuthoringFields(session);if(!normalized.ok)return normalized;
    const initialized = initializeMenuLanguages(session);
    return initialized.ok ? recovered : initialized;
  }
}
