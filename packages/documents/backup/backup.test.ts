import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile, cp, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { FixtureAsset, FixtureCharacters, FixtureLock, FixtureProject, FixtureScenes } from '@galcraft/contracts/fixtures';
import type { FieldSpec } from '@galcraft/contracts';
import { ProjectSession } from '@galcraft/documents';
import { componentTextOverride, components, createOfficialTemplate, createTemplateDocuments, readTemplateDocuments } from '@galcraft/templates';
import { preparePageEdit } from '@galcraft/templates/editor';
import { compileStyle } from '@galcraft/templates/compiler';
import { AssetCatalog, AssetTypeRegistry, assetFilePath } from '../../assets/dist/core/index.js';
import { OfficialRecipes, CreationRecipeSchema } from '../../authoring/dist/recipes/index.js';
import { createAffectionContributions } from '../../../plugins/official-affection/dist/index.js';
import { BackupService, migrateLegacyProject, rewriteProjectPath, value, problem, type BackupProviders } from './index.js';
import { put, readJson } from './files.js';
const root = resolve(import.meta.dirname, '../../../tmp/testing/backup'), projectRoot = join(root, 'projects/a'), backup = join(root, 'work.galproject');
let session: ProjectSession, service: BackupService, providers: BackupProviders, registry: any[], rejectRegistry: boolean, missingEngine: boolean;
const envelope = (id: string, data: unknown) => JSON.stringify({ schemaVersion: 1, documentId: id, revision: 1, data });
const playerNameVariableId = '00000000-0000-4000-8000-000000000fa1';
const jsonDocument = (path: string, data: unknown) => { const documentId = randomUUID(); return { documentId, revision: 1, format: 'json' as const, files: { [path]: envelope(documentId, data) } }; };
beforeEach(async () => {
  await rm(root, { recursive: true, force: true }); registry = []; rejectRegistry = false; missingEngine = false;
  const template = createOfficialTemplate({ kind: 'standard' }), styleId = randomUUID(), style = { id: styleId, name: '样式源码', scope: { pageId: template.pages[0]!.id, componentId: null }, language: 'scss' as const,
    sourcePath: `ui/styles/${styleId}.scss`, compiledPath: `ui/styles/${styleId}.compiled.css`, sourceRevision: 1, compiledSourceRevision: null, assets: [], issues: [] };
  const source = '@use "./colors" as c; [data-gc-part="title.background"] { color:c.$ink; }', modules = { 'ui/styles/_colors.scss': '$ink: #123456;' };
  const compiled = compileStyle({ style, source, instanceId: template.instanceId, modules }); template.styles = [compiled.style];
  const assets = [structuredClone(FixtureAsset), { ...structuredClone(FixtureAsset), id: randomUUID(), name: '未引用素材', sceneIds: [] }];
  assets[1]!.variants[0]!.id = randomUUID(); assets[1]!.originalVariantId = assets[1]!.activeVariantId = assets[1]!.variants[0]!.id;
  const recipe = { ...structuredClone(OfficialRecipes[0]!), id: randomUUID(), scope: 'project', projectId: FixtureProject.projectId };
  const presetId = randomUUID(), debugId = randomUUID();
  const inputs = [jsonDocument('project.json', { ...FixtureProject, player: { ...FixtureProject.player, name: { characterId: FixtureCharacters[0]!.id, defaultName: '旅行者', allowCustom: true, variableId: playerNameVariableId, maxLength: 24 } }, templateDocumentId: template.instanceId }),
    jsonDocument(`variables/${playerNameVariableId}.json`, {id:playerNameVariableId,name:'主角姓名',type:'string',scope:'progress',initial:'旅行者'}),
    jsonDocument('dependencies.lock.json', { ...FixtureLock, template: { ...FixtureLock.template, id: template.id, version: template.version } }),
    jsonDocument('assets/index.json', { assets }), jsonDocument(`characters/${FixtureCharacters[0]!.id}.json`, FixtureCharacters[0]),
    jsonDocument(`authoring/recipes/${recipe.id}.json`, recipe),
    jsonDocument(`presentation/presets/${presetId}.json`, { id: presetId, name: '参考背景', category: '背景', revision: 1, description: '', bindings: [], resourceIds: [assets[0]!.id], statements: [{ command: 'changeBg', args: { assetId: assets[0]!.id } }] }),
    jsonDocument(`authoring/debug/${debugId}.json`, { schemaVersion: 1, id: debugId, name: '测试入口', projectId: FixtureProject.projectId, engineVersion: '0.1.0', pluginVersions: [], entry: { sceneId: FixtureScenes[0]!.id, statementId: null }, target: { sceneId: FixtureScenes[0]!.id, statementId: null }, initialProgress: {}, pluginInitial: {}, route: [], playerInputs: [], externalPolicy: 'simulate' }),
    jsonDocument('plugins/org.galcraft.affection/documents/config.json', { characters: [{ characterId: FixtureCharacters[0]!.id, min: 0, max: 100, initial: 0, visible: true, label: '角色' }] }),
    ...FixtureScenes.map(scene => { const documentId = randomUUID(); return { documentId, revision: 1, format: 'dsl' as const, files: { [`scenes/${scene.id}/scene.json`]: envelope(documentId, scene),
      [`scenes/${scene.id}/script.gal`]: `// ${FixtureProject.projectId}\nsay {speaker:{kind:"narrator"},text:"${FixtureProject.projectId}"} @${randomUUID()};\nend {} @${randomUUID()};` } }; }), ...createTemplateDocuments(template)];
  const templateDoc = inputs.find(document => 'ui/template.json' in document.files)!; Object.assign(templateDoc.files, modules, { [style.sourcePath]: source, [style.compiledPath!]: compiled.css! });
  session = await ProjectSession.createProject(projectRoot, FixtureProject.projectId, inputs);
  for (const asset of assets) await put(join(projectRoot, assetFilePath(asset.id, asset.activeVariantId, 'background.png')), 'x');
  await put(join(projectRoot, '.galcraft/tasks/private.json'), '{"secret":"private"}');
  const contribution = createAffectionContributions({ characters: [{ characterId: FixtureCharacters[0]!.id, min: 0, max: 100, initial: 0, visible: true, label: '角色' }] }).documents[0]!;
  providers = { collectAssets: index => new AssetCatalog(index).collectAssets([], 'windows', { includeUnused: true }),
    dependencies: async lock => [lock.engine, lock.template, ...lock.plugins].map(dependency => ({ dependency, directory: null, redistribute: false, reason: '本地精确依赖', sourceUrl: null, instructions: '安装相同版本' })),
    validateDependencies: async () => missingEngine ? [problem('ENGINE_MISSING', '引擎 0.1.0 待安装')] : [],
    pluginDocuments: path => path.includes('org.galcraft.affection') ? contribution : null,
    documentProvider: path => path.startsWith('authoring/recipes/') ? { schema: CreationRecipeSchema } : null,
    registry: { capture: async () => structuredClone(registry), register: async receipt => { registry.push(receipt); if (rejectRegistry) throw new Error('最近作品登记写入失败'); }, restore: async previous => { registry = structuredClone(previous) as any[]; } } };
  service = new BackupService(providers);
});
afterEach(async () => { await session.dispose('discard'); await rm(root, { recursive: true, force: true }); });
async function makeBackup() { return value(await service.createBackup(session, { source: 'saved', destination: backup })); }
it('carries a component-local menu label into an independent restored project', async () => {
  const template=readTemplateDocuments([...session.documents.values()]),page=template.pages.find(page=>page.key==='title')!,button=components(page.root).find(component=>component.part==='title.menu.characters')!;
  const edit=preparePageEdit({documents:[...session.documents.values()],request:{label:'Local menu text',operations:[{kind:'component.text',pageId:page.id,componentId:button.id,locale:'zh-CN',text:'After story'}]}}).edit;
  value(session.applyEdit(value(session.planEdit(edit)).planId,edit.expected));value(await session.save(value(session.planSave({kind:'all'})).planId));await makeBackup();
  const plan=value(await service.prepareRestore(options('copyNew'))),receipt=value(await service.commitRestore(plan.operationDirectory));
  const restored=await ProjectSession.open(receipt.directory,receipt.projectId);
  try { const copy=readTemplateDocuments([...restored.documents.values()]),copied=components(copy.pages.find(page=>page.key==='title')!.root).find(component=>component.part==='title.menu.characters')!;
    expect(copied.id).not.toBe(button.id);expect(componentTextOverride(copied,copy.locales,'zh-CN')).toBe('After story');expect(componentTextOverride(copied,copy.locales,'en')).toBeUndefined();
  } finally { await restored.dispose('discard'); }
},30000);
it('backs up and validates a flow that references a saved independent initial scenario', async () => {
  const document=[...session.documents.values()].find(document=>Object.keys(document.files).some(path=>path.startsWith('authoring/debug/')))!;
  const path=Object.keys(document.files)[0]!, before=JSON.parse(document.files[path]!).data;
  const lock=JSON.parse([...session.documents.values()].find(document=>document.files['dependencies.lock.json'])!.files['dependencies.lock.json']!).data;
  const after={...before,pluginVersions:[lock.engine,...lock.plugins,lock.template]};
  const flowId=randomUUID(),nodeId=randomUUID(),flowDocument=randomUUID(),expected=[{ref:{kind:'document' as const,id:document.documentId},revision:document.revision}];
  const flow={id:flowId,name:'独立回想',roots:[nodeId],nodes:[{id:nodeId,name:'已保存初值',x:0,y:0,sceneId:FixtureScenes[0]!.id,statementId:null,unlock:{kind:'literal',value:true},lockedView:'locked',entry:{kind:'initial',debugScenarioId:before.id}}],edges:[]};
  const plan=value(session.planEdit({label:'流程独立初值',origin:'field',expected,preparedAssets:[],requiredRefs:[],patches:[
    {kind:'json',documentId:document.documentId,changes:[{path:'/data',before,after,op:'set'}]},
    {kind:'document',documentId:flowDocument,op:'create',before:null,after:{format:'json',files:{[`flows/${flowId}.json`]:envelope(flowDocument,flow)}}},
  ]}));value(session.applyEdit(plan.planId,expected));value(await session.save(value(session.planSave({kind:'all'})).planId));
  const manifest=await makeBackup();expect(manifest.files.some(file=>file.path===`project/${path}`)).toBe(true);
  const prepared=value(await service.prepareRestore({packagePath:backup,destination:join(root,'restored-initial'),identity:'restoreOriginal',collision:'newDirectory'}));
  expect(prepared.missing.filter(issue=>issue.severity==='error')).toEqual([]);
  value(await service.cancelRestore(prepared.operationDirectory));
});
it('migrates legacy identities in place, preserves short IDs and text, and reopens all references', async () => {
  const legacyProjectId = randomUUID();
  for (const document of session.documents.values()) for (const [path, raw] of Object.entries(document.files)) {
    if (path.endsWith('.json')) {
      const record = JSON.parse(raw);
      if (record.data?.projectId === FixtureProject.projectId) { record.data.projectId = legacyProjectId; await put(join(projectRoot, path), JSON.stringify(record)); }
    } else if (path.endsWith('.gal')) await put(join(projectRoot, path), raw.replaceAll(FixtureProject.projectId, legacyProjectId));
  }
  const original = await readFile(join(projectRoot, 'project.json'), 'utf8');
  const template = JSON.parse([...session.documents.values()].find(document => 'ui/template.json' in document.files)!.files['ui/template.json']!).data;
  await session.dispose('saved');
  const receipt = (await migrateLegacyProject(projectRoot, providers))!;
  expect(receipt.idMap[template.template.instanceId]).toBeUndefined();
  expect(Object.values(receipt.idMap).every(id => /^[A-Za-z0-9]{6}$/.test(id))).toBe(true);
  expect(await readFile(join(receipt.backupDirectory, 'project.json'), 'utf8')).toBe(original);
  const reopened = await ProjectSession.open(projectRoot, receipt.projectId);
  try {
    const files = Object.assign({}, ...[...reopened.documents.values()].map(document => document.files));
    const project = JSON.parse(files['project.json']).data;
    expect(project.projectId).toBe(receipt.idMap[legacyProjectId]);
    expect(project.templateDocumentId).toBeUndefined();
    expect(JSON.parse(files['ui/template.json']).data.template.instanceId).toBe(template.template.instanceId);
    expect(project.player.name.characterId).toBe(FixtureCharacters[0]!.id);
    expect(project.player.name.variableId).toBe(receipt.idMap[playerNameVariableId]);
    expect(JSON.parse(files['plugins/org.galcraft.affection/documents/config.json']).data.characters[0].characterId).toBe(project.player.name.characterId);
    const script = Object.entries(files).find(([path]) => path.endsWith('.gal'))![1];
    expect(script).toContain(`text:"${legacyProjectId}"`);
    expect(await readFile(join(projectRoot, assetFilePath(FixtureAsset.id, FixtureAsset.activeVariantId, 'background.png')), 'utf8')).toBe('x');
  } finally { await reopened.dispose('saved'); }
  expect(await migrateLegacyProject(projectRoot, providers)).toBeNull();
});
it('migrates no files when dependencies or a recovery draft block migration', async () => {
  await session.dispose('saved');
  const original = await readFile(join(projectRoot, 'project.json'), 'utf8');
  missingEngine = true;
  await expect(migrateLegacyProject(projectRoot, providers)).rejects.toThrow('引擎');
  missingEngine = false;
  await put(join(projectRoot, '.galcraft/recovery/draft.json'), '{}');
  await expect(migrateLegacyProject(projectRoot, providers)).rejects.toThrow('恢复草稿');
  expect(await readFile(join(projectRoot, 'project.json'), 'utf8')).toBe(original);
});
it('migrates atomically with rollback when registration fails', async () => {
  await session.dispose('saved');
  const original = await readFile(join(projectRoot, 'project.json'), 'utf8');
  registry = [{ old: true }]; rejectRegistry = true;
  await expect(migrateLegacyProject(projectRoot, providers)).rejects.toThrow('登记写入失败');
  expect(await readFile(join(projectRoot, 'project.json'), 'utf8')).toBe(original);
  expect(registry).toEqual([{ old: true }]);
  const reopened = await ProjectSession.open(projectRoot, FixtureProject.projectId);
  await reopened.dispose('saved');
});
const options = (identity: 'restoreOriginal' | 'copyNew' = 'restoreOriginal') => ({ packagePath: backup, destination: join(root, 'projects/b'), identity, collision: 'newDirectory' as const });
it('完整包包含未引用素材、方案和 SCSS 模块，原身份恢复且无连接可编辑', async () => {
  const manifest = await makeBackup(); expect(manifest.files.filter(file => file.role === 'asset')).toHaveLength(2);
  expect(manifest.files.some(file => file.path.endsWith('_colors.scss'))).toBe(true); expect(manifest.files.some(file => file.path.includes('authoring/recipes'))).toBe(true);
  expect(manifest.files.some(file => file.path.startsWith('project/.galcraft/'))).toBe(false);
  const plan = value(await service.prepareRestore(options())); expect(plan.missing).toEqual([]);
  const receipt = value(await service.commitRestore(plan.operationDirectory)); expect(receipt.projectId).toBe(session.projectId); expect(receipt.readiness.editing).toBe('editable'); expect(receipt.readiness.generation.every(value => value.state === 'needsConnection')).toBe(true);
  const reopened = await ProjectSession.open(receipt.directory, receipt.projectId); expect([...reopened.documents.keys()].sort()).toEqual([...session.documents.keys()].sort()); await reopened.dispose('saved');
});
it('copies versioned custom asset data and its real source references through backup restore', async () => {
  const typeProvider = { id: 'org.test.geometry', version: '0.1.0' }, kind = 'org.test.geometry/shape' as const;
  const ok = <T>(value: T) => ({ ok: true as const, value, warnings: [] });
  const types = new AssetTypeRegistry([{ provider: typeProvider, definition: {
    contractVersion: 1, key: kind, typeVersion: 1, title: 'Geometry', description: '', icon: 'geometry', schema: { type: 'object' }, fields: [], extensions: ['.shape.json'], targets: ['web', 'windows'], resourceProviderKey: typeProvider.id + '/parser', capabilities: [],
    collectReferences: data => [{ kind: 'asset', id: (data as { texture: string }).texture }],
    rewriteReferences: (data, mapping) => ok({ ...data as { texture: string }, texture: mapping[(data as { texture: string }).texture] ?? (data as { texture: string }).texture }),
    rewriteFile: (_path, bytes, mapping) => { const raw = JSON.parse(new TextDecoder().decode(bytes)); return ok(new TextEncoder().encode(JSON.stringify({ ...raw, texture: mapping[raw.texture] ?? raw.texture }))); },
  } }]);
  const document = [...session.documents.values()].find(document => 'assets/index.json' in document.files)!;
  const before = JSON.parse(document.files['assets/index.json']!).data.assets, shape = structuredClone(before[1]);
  shape.kind = kind; shape.variants[0].entry = 'polygon.shape.json'; shape.variants[0].files[0].path = 'polygon.shape.json';
  shape.variants[0].typeData = { typeVersion: 1, provider: typeProvider, value: { texture: FixtureAsset.id, color: '#123456' } };
  const text = JSON.stringify(shape.variants[0].typeData.value); shape.variants[0].files[0].bytes = Buffer.byteLength(text);
  await put(join(projectRoot, assetFilePath(shape.id, shape.activeVariantId, 'polygon.shape.json')), text);
  const expected = [{ ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision }];
  const edit = value(session.planEdit({ label: 'Custom geometry', origin: 'plugin', expected, preparedAssets: [shape.id], requiredRefs: [], patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data/assets', before, after: [before[0], shape], op: 'set' }] }] }));
  value(session.applyEdit(edit.planId, expected)); value(await session.save(value(session.planSave({ kind: 'all' })).planId));
  providers.assetTypes = types; providers.collectAssets = index => new AssetCatalog(index, types).collectAssets([], 'windows', { includeUnused: true });
  await makeBackup(); const plan = value(await service.prepareRestore(options('copyNew'))); expect(plan.missing).toEqual([]);
  const receipt = value(await service.commitRestore(plan.operationDirectory));
  const index = JSON.parse(await readFile(join(receipt.directory, 'assets/index.json'), 'utf8'));
  const copied = index.data.assets.find((item: any) => item.kind === kind), variant = copied.variants[0];
  expect(variant.typeData.provider).toEqual(typeProvider); expect(variant.typeData.value.texture).toBe(plan.idMap[FixtureAsset.id]);
  const file = await readFile(join(receipt.directory, assetFilePath(copied.id, variant.id, variant.entry)));
  expect(JSON.parse(file.toString()).texture).toBe(plan.idMap[FixtureAsset.id]); expect(file.length).toBe(variant.files[0].bytes);
}, 30_000);
it('复制枚举核心和插件引用，方案/场景/模板/素材新身份，正文 UUID 不改写', async () => {
  await makeBackup(); const plan = value(await service.prepareRestore(options('copyNew'))); expect(plan.missing).toEqual([]); expect(plan.resultProjectId).not.toBe(session.projectId);
  expect(Object.values(plan.idMap).every(id => /^[A-Za-z0-9]{6}$/.test(id))).toBe(true);
  expect(new Set(Object.values(plan.idMap).map(id => id.toLowerCase())).size).toBe(Object.values(plan.idMap).length);
  const receipt = value(await service.commitRestore(plan.operationDirectory)), reopened = await ProjectSession.open(receipt.directory, receipt.projectId);
  const documents = [...reopened.documents.values()], all = Object.assign({}, ...documents.map(document => document.files));
  const project = JSON.parse(all['project.json']).data; expect(project.projectId).toBe(plan.resultProjectId); expect(project.chapters[0].id).toBe(plan.idMap[FixtureProject.chapters[0]!.id]);
  expect(project.player.name.characterId).toBe(plan.idMap[FixtureCharacters[0]!.id]);
  expect(project.player.name.variableId).toBe(plan.idMap[playerNameVariableId]);
  expect(project.player.name.defaultName).toBe('旅行者');
  const plugin = JSON.parse(all['plugins/org.galcraft.affection/documents/config.json']).data; expect(plugin.characters[0].characterId).toBe(plan.idMap[FixtureCharacters[0]!.id]);
  const recipePath = Object.keys(all).find(path => path.startsWith('authoring/recipes/'))!; expect(JSON.parse(all[recipePath]).data.projectId).toBe(plan.resultProjectId);
  const preset = JSON.parse(all[Object.keys(all).find(path => path.startsWith('presentation/presets/'))!]).data;
  expect(preset.resourceIds[0]).toBe(plan.idMap[FixtureAsset.id]); expect(preset.statements[0].args.assetId).toBe(plan.idMap[FixtureAsset.id]);
  const debug = JSON.parse(all[Object.keys(all).find(path => path.startsWith('authoring/debug/'))!]).data;
  expect(debug.projectId).toBe(plan.resultProjectId); expect(debug.entry.sceneId).toBe(plan.idMap[FixtureScenes[0]!.id]);
  const script = Object.entries(all).find(([path]) => path.endsWith('.gal'))![1]; expect(script).toContain(`text:"${session.projectId}"`);
  for (const id of session.documents.keys()) expect(reopened.documents.has(id)).toBe(false);
  await reopened.dispose('saved');
}, 30_000);
it('复制按插件组件字段重写素材、版本和嵌套引用，保留自由文本', async () => {
  const pageDocument = [...session.documents.values()].find(document => Object.keys(document.files).some(path => path.startsWith('ui/pages/')))!;
  const path = Object.keys(pageDocument.files).find(path => path.startsWith('ui/pages/'))!;
  const page = JSON.parse(pageDocument.files[path]!).data;
  const field = (path: string, kind: FieldSpec['refKind']): FieldSpec => ({ path, type: 'ref', refKind: kind,
    label: path, description: path, default: null, required: true, nullable: false, unit: 'none', group: 'basic', summary: true, keywords: [] });
  providers.pluginComponents = () => [{ key: 'org.galcraft.affection/hud', componentKey: 'org.galcraft.affection/hud', publicParts: [],
    fields: [field('assetId', 'asset'), field('variantId', 'variant'), field('characterId', 'character'),
      { ...field('nested', 'document'), type: 'object', children: [field('documentId', 'document')] },
      { ...field('versions', 'variant'), type: 'array', item: field('variant', 'variant') }] }];
  const component = { ...structuredClone(page.root), id: randomUUID(), part: 'org.galcraft.affection/hud', children: [],
    plugin: { key: 'org.galcraft.affection/hud', props: { assetId: FixtureAsset.id, variantId: FixtureAsset.activeVariantId,
      characterId: FixtureCharacters[0]!.id, nested: { documentId: pageDocument.documentId },
      versions: [FixtureAsset.activeVariantId], freeText: FixtureAsset.id, opaque: { id: FixtureAsset.id } } } };
  const expected = [{ ref: { kind: 'document' as const, id: pageDocument.documentId }, revision: pageDocument.revision }];
  const plan = value(session.planEdit({ label: '插入引用组件', origin: 'plugin', expected,
    patches: [{ kind: 'json', documentId: pageDocument.documentId, changes: [{ path: '/data/root/children',
      before: page.root.children, after: [...page.root.children, component], op: 'set' }] }], preparedAssets: [], requiredRefs: [] }));
  value(session.applyEdit(plan.planId, expected));
  value(await session.save(value(session.planSave({ kind: 'all' })).planId));
  await makeBackup();
  const copied = value(await service.prepareRestore(options('copyNew')));
  expect(copied.missing).toEqual([]);
  const receipt = value(await service.commitRestore(copied.operationDirectory));
  const reopened = await ProjectSession.open(receipt.directory, receipt.projectId);
  try {
    const props = JSON.parse(reopened.readDocument(copied.idMap[pageDocument.documentId]!)!.files[rewriteProjectPath(path, copied.idMap)]!).data.root.children.find((item: any) => item.plugin)?.plugin.props;
    expect(props.assetId).toBe(copied.idMap[FixtureAsset.id]);
    expect(props.variantId).toBe(copied.idMap[FixtureAsset.activeVariantId]);
    expect(props.characterId).toBe(copied.idMap[FixtureCharacters[0]!.id]);
    expect(props.nested.documentId).toBe(copied.idMap[pageDocument.documentId]);
    expect(props.versions).toEqual([copied.idMap[FixtureAsset.activeVariantId]]);
    expect(props.freeText).toBe(FixtureAsset.id); expect(props.opaque.id).toBe(FixtureAsset.id);
  } finally { await reopened.dispose('saved'); }
}, 30_000);
it('缺精确引擎保留暂存，补齐沿同 planId 重检后恢复', async () => {
  await makeBackup(); missingEngine = true; const plan = value(await service.prepareRestore(options())); expect(plan.missing[0]!.code).toBe('ENGINE_MISSING'); expect(registry).toEqual([]);
  expect((await service.commitRestore(plan.operationDirectory)).ok).toBe(false); missingEngine = false;
  const checked = value(await service.checkRestore(plan.operationDirectory)); expect(checked.planId).toBe(plan.planId); expect(checked.missing).toEqual([]); expect(checked.readiness?.editing).toBe('editable');
  missingEngine = true;
  const invalidated = value(await service.checkRestore(plan.operationDirectory)); expect(invalidated.readiness).toBeNull(); expect(invalidated.missing[0]!.code).toBe('ENGINE_MISSING');
  missingEngine = false; expect((await service.commitRestore(plan.operationDirectory)).ok).toBe(true);
});
it('备份固定已存快照，工作编辑可继续，后续保存等待资源收集结束', async () => {
  let release!: () => void, entered!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const dependencies = providers.dependencies; providers.dependencies = async lock => { entered(); await hold; return dependencies(lock); };
  const creating = service.createBackup(session, { source: 'saved', destination: backup }); await started;
  const document = [...session.documents.values()].find(document => 'project.json' in document.files)!, expected = [{ ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision }];
  const edit = value(session.planEdit({ label: '编辑名称', origin: 'field', expected, preparedAssets: [], requiredRefs: [], patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data/name', before: FixtureProject.name, after: '备份期间的新名称', op: 'set' }] }] }));
  value(session.applyEdit(edit.planId, expected));
  let saved = false; const saving = session.save(value(session.planSave({ kind: 'all' })).planId).then(result => { value(result); saved = true; });
  await Promise.resolve(); expect(saved).toBe(false); release(); value(await creating); await saving;
  const packed = service.inspectArchive(await readFile(backup)); expect(JSON.parse(new TextDecoder().decode(packed.entries['project/project.json'])).data.name).toBe(FixtureProject.name);
  expect(JSON.parse(await readFile(join(projectRoot, 'project.json'), 'utf8')).data.name).toBe('备份期间的新名称');
});
it('缺插件重写提供方不产生混合身份作品', async () => {
  await makeBackup(); providers.pluginDocuments = () => null; const plan = value(await service.prepareRestore(options('copyNew')));
  expect(plan.missing[0]!.code).toBe('RESTORE_IDENTITY_PROVIDER'); expect((await service.commitRestore(plan.operationDirectory)).ok).toBe(false); expect(registry).toEqual([]);
});
it('备份失败保留已有包；恢复取消不登记且保持来源', async () => {
  await makeBackup(); const original = await readFile(backup); const asset = [...session.documents.values()].find(document => 'assets/index.json' in document.files)!;
  const path = JSON.parse(asset.files['assets/index.json']!).data.assets[0]; await rm(join(projectRoot, assetFilePath(path.id, path.activeVariantId, 'background.png')));
  expect((await service.createBackup(session, { source: 'saved', destination: backup })).ok).toBe(false); expect(await readFile(backup)).toEqual(original);
  const plan = value(await service.prepareRestore(options())); value(await service.cancelRestore(plan.operationDirectory)); expect((await service.commitRestore(plan.operationDirectory)).ok).toBe(false); expect(registry).toEqual([]); expect(await readFile(backup)).toEqual(original);
});
it('替换登记失败恢复旧目录和旧最近列表，重试仍用同身份', async () => {
  await makeBackup(); await put(join(root, 'projects/b/old.txt'), '旧作品'); registry = [{ old: true }];
  const plan = value(await service.prepareRestore({ ...options(), collision: 'replaceConfirmed' })); rejectRegistry = true;
  expect((await service.commitRestore(plan.operationDirectory)).ok).toBe(false); expect(await readFile(join(root, 'projects/b/old.txt'), 'utf8')).toBe('旧作品'); expect(registry).toEqual([{ old: true }]);
  rejectRegistry = false; expect(value(await service.commitRestore(plan.operationDirectory)).projectId).toBe(plan.resultProjectId);
});
it('目录安装中断恢复完整旧目录；重复恢复幂等', async () => {
  await makeBackup(); await put(join(root, 'projects/b/old.txt'), '旧作品'); const plan = value(await service.prepareRestore({ ...options(), collision: 'replaceConfirmed' }));
  await rename(plan.destination, plan.previousDirectory!); await rename(plan.stagingDirectory, plan.destination); plan.phase = 'installed'; plan.registryBefore = [];
  await put(join(plan.operationDirectory, 'plan.json'), JSON.stringify(plan)); value(await service.recover(plan.operationDirectory)); value(await service.recover(plan.operationDirectory));
  expect(await readFile(join(plan.destination, 'old.txt'), 'utf8')).toBe('旧作品'); expect((await service.commitRestore(plan.operationDirectory)).ok).toBe(true);
});
it('包路径越界及文件大小不匹配在解包前拒绝', async () => {
  await makeBackup(); const files = unzipSync(await readFile(backup)), manifest = JSON.parse(new TextDecoder().decode(files['package.json'])); manifest.files[0].path = '../outside'; files['package.json'] = strToU8(JSON.stringify(manifest));
  expect(() => service.inspectArchive(zipSync(files))).toThrow();
});
it('升级提交核对工作与保存版本，登记失败保留旧会话和目录', async () => {
  const candidate = join(root, 'upgrade'); await cp(projectRoot, candidate, { recursive: true });
  const expected = { working: [...session.documents.values()].map(document => ({ ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision })), saved: [...session.documents.values()].map(document => ({ ref: { kind: 'document' as const, id: document.documentId }, revision: document.savedRevision })) };
  expect((await service.commitUpgrade(session, { directory: candidate, expected: { ...expected, working: [] } })).ok).toBe(false);
  rejectRegistry = true; expect((await service.commitUpgrade(session, { directory: candidate, expected })).ok).toBe(false); expect(session.planSave({ kind: 'all' }).ok).toBe(true);
  rejectRegistry = false; expect((await service.commitUpgrade(session, { directory: candidate, expected })).ok).toBe(true); expect(session.planSave({ kind: 'all' }).ok).toBe(false);
});

