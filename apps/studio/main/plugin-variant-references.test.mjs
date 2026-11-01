import { afterAll, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { fixtureId, FixtureAsset, FixtureLock, FixtureProject, FixtureScenes } from '@galcraft/contracts/fixtures';
import { readPluginDocumentInstances } from '@galcraft/contracts';
import { assetFilePath } from '@galcraft/assets';
import { ProjectSession } from '@galcraft/documents';
import { validateProject } from '../../../packages/documents/backup/validation.ts';
import { ResourceRegistry } from '@galcraft/media-tools/resources';
import { compile } from '@galcraft/dsl';
import { createOfficialTemplate, createTemplateDocuments, insertPluginComponent, readTemplateDocuments } from '@galcraft/templates';
import { ProjectAccess } from './project-access.mjs';
import { ProjectDocuments } from './document-providers.mjs';
import { PluginDocuments } from './plugin-documents.mjs';
import { StudioPluginPackages } from './plugin-packages.mjs';
import { StudioBackups } from './backup-providers.mjs';
import { StudioBuilds } from './build-providers.mjs';
import { pluginDocumentReferences, pluginServiceContext } from './plugin-service-ports.mjs';
import { createAuthoringServices } from '../renderer/authoring/bridge.ts';
import { prepareProjectPlugins } from '../renderer/authoring/plugins.ts';

vi.mock('../../../packages/player-ui/src/bootstrap.js', () => ({ mountPlayer: async () => ({ ok: true, value: { view: { dispose() {} } }, warnings: [] }) }));
vi.mock('../../../packages/player-ui/src/fonts.js', () => ({ loadReleaseFonts: async () => () => {} }));
vi.mock('../../../packages/player-ui/src/plugin-runtimes.js', () => ({ installPluginRuntimes() {} }));
import { mountRelease } from '../../../packages/player-ui/src/release.ts';

const root = resolve(import.meta.dirname, '../../../tmp/testing/plugin-development/variant-references');
const evidence = resolve(import.meta.dirname, '../../../test-results/latest/plugin-development/variant-references/consumers.json');
const pluginId = 'org.example.variant-reference', key = `${pluginId}/config`;
const projectDocumentId = fixtureId(0xe01), lockDocumentId = fixtureId(0xe02), indexDocumentId = fixtureId(0xe03);
const fixedId = fixtureId(0xe04), activeId = fixtureId(0xe05);
const ok = value => ({ ok: true, value, warnings: [] });
const value = result => { if (!result.ok) throw new Error(JSON.stringify(result)); return result.value; };
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data });
const put = async (path, data) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data); };
let projects, access;
afterAll(async () => {
  if (projects?.currentSessionId) { const id = projects.currentSessionId; await projects.close(id, 'discard'); access.release(id); }
  vi.unstubAllGlobals();
});

it('keeps definition-only fixed variants through saved compilation, both release targets and backup identity rewriting', async () => {
  await rm(root, { recursive: true, force: true });
  const projectRoot = join(root, 'project'), pluginRoot = join(root, 'plugins'), source = join(root, 'source');
  const asset = structuredClone(FixtureAsset), originalId = asset.originalVariantId;
  asset.variants[0].targets = { web: 'direct', windows: 'direct' };
  for (const [id, entry, role] of [[fixedId, 'fixed.png', 'compatible'], [activeId, 'active.png', 'compatible']]) asset.variants.push({
    ...structuredClone(asset.variants[0]), id, parentId: originalId, role, entry,
    files: [{ path: entry, bytes: 1, mime: 'image/png', role: 'primary' }],
  });
  asset.activeVariantId = activeId;
  const field = (path, refKind) => ({ path, type: 'ref', refKind, label: path, description: path, default: null, required: true, nullable: false, unit: 'none', group: 'basic', summary: true, keywords: [] });
  const hud = { key: `${pluginId}/hud`, componentKey: `${pluginId}/hud`, publicParts: [], fields: [field('floatingImage', 'asset'), field('lockedImage', 'variant'),
    { ...field('nested', 'variant'), type: 'object', children: [field('locked', 'variant')] }, { ...field('versions', 'variant'), type: 'array', item: field('version', 'variant') }] };
  const definition = `const ok=value=>({ok:true,value,warnings:[]}); export function createDefinition(){return {documents:[{
    key:'${key}',instances:'multiple',stateVersion:1,schema:{type:'object',properties:{selected:{type:'string'},floating:{type:'boolean'}},required:['selected'],additionalProperties:false},
    fields:[{path:'selected',label:'Version',description:'Exact variant',type:'ref',required:true,nullable:false,default:'${fixedId}',unit:'none',refKind:'variant'}],initial:{selected:'${fixedId}'},
    configMapping:{purpose:'fixed image',mode:'multiple',required:true},
    collectReferences:data=>[{kind:'variant',id:data.selected},...(data.floating?[{kind:'asset',id:'${asset.id}'}]:[])],rewriteReferences:(data,ids)=>ok({...data,selected:ids[data.selected]??data.selected})}],components:[${JSON.stringify(hud)}]}}`;
  const runtime = `export let resolved=[],assetPort; export function createPlugin(){return {activate:async context=>{
    assetPort=context.assets;
    const selected=context.config.documents[0].data.selected;
    const fixed=await context.assets.resolve({kind:'variant',id:selected});
    resolved=[fixed,await context.assets.resolve({kind:'asset',id:fixed.ok?fixed.value.assetId:'Missing'})];
    if(!resolved[0].ok||resolved[0].value.variantId!==selected)throw new Error('Fixed variant was not resolved');
    return {commands:[],conditions:[],documents:[],tools:[],resources:[],stages:[],pages:[],components:[${JSON.stringify(hud)}],systems:[],platform:[]};},deactivate:async()=>{}}}`;
  const packageFiles = { 'definition.mjs': definition, 'runtime.mjs': runtime };
  const manifest = { schemaVersion: 2, id: pluginId, name: 'Variant reference', version: '0.1.0', description: '', author: 'GalCraft test', license: 'MIT', homepage: null,
    engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [], environmentDependencies: { definition: [], editor: [], services: [], runtime: [] },
    entry: { definition: 'definition.mjs', runtime: 'runtime.mjs', editor: null, services: null },
    files: Object.entries(packageFiles).map(([path, content]) => ({ path, size: Buffer.byteLength(content) })),
    contributions: [{ kind: 'document', key, targets: ['web', 'windows'], required: true }, { kind: 'component', key: hud.key, targets: ['web', 'windows'], required: true }], stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] };
  for (const [path, content] of Object.entries(packageFiles)) await put(join(source, path), content);
  await put(join(source, 'manifest.json'), JSON.stringify(manifest));
  const plugins = new StudioPluginPackages(pluginRoot, new ResourceRegistry());
  value(await plugins.install({ kind: 'directory', path: source }));
  const template = createOfficialTemplate({ kind: 'standard' });
  const project = structuredClone(FixtureProject);
  const lock = { ...structuredClone(FixtureLock), plugins: [{ kind: 'plugin', id: pluginId, version: '0.1.0', targets: ['web', 'windows'], required: true }],
    template: { ...FixtureLock.template, id: template.id, version: template.version } };
  const initial = [
    { documentId: projectDocumentId, revision: 1, format: 'json', files: { 'project.json': envelope(projectDocumentId, project) } },
    { documentId: lockDocumentId, revision: 1, format: 'json', files: { 'dependencies.lock.json': envelope(lockDocumentId, lock) } },
    { documentId: indexDocumentId, revision: 1, format: 'json', files: { 'assets/index.json': envelope(indexDocumentId, { assets: [asset] }) } },
    ...FixtureScenes.map((scene, i) => { const documentId = fixtureId(0xe10 + i); return { documentId, revision: 1, format: 'dsl', files: {
      [`scenes/${scene.id}/scene.json`]: envelope(documentId, scene), [`scenes/${scene.id}/script.gal`]: `end {} @${fixtureId(0xe20 + i)};` } }; }),
    ...createTemplateDocuments(template),
  ];
  await (await ProjectSession.createProject(projectRoot, project.projectId, initial)).dispose('saved');
  for (const variant of asset.variants) await put(join(projectRoot, assetFilePath(asset.id, variant.id, variant.entry)), variant.id === fixedId ? 'f' : variant.id === activeId ? 'a' : 'o');
  access = new ProjectAccess(); projects = new ProjectDocuments(access); value(await projects.open(projectRoot));
  const documents = new PluginDocuments(projects, plugins), created = value(await documents.create({ pluginId, contributionKey: key, name: 'Fixed version' }));
  expect(created.requiredRefs).toEqual([{ kind: 'variant', id: fixedId }]);
  value(projects.applyEdit(value(projects.planEdit(created)).planId, created.expected));
  const pluginDocumentId = created.patches[0].documentId;
  value(await projects.save(value(projects.planSave({ kind: 'all' })).planId));
  const references = await pluginDocumentReferences(plugins, projects.currentSession, asset.id);
  expect(references).toEqual([{ assetId: asset.id, variantId: fixedId, owner: { kind: 'document', id: pluginDocumentId },
    source: { documentId: pluginDocumentId, revision: 1 }, usage: 'pluginDocument', required: true, label: 'Fixed version' }]);
  const context = pluginServiceContext({ projects, assets: {}, credential() {} }, pluginId, 'windows');
  const resolvedVariant = value(await context.assets.resolve({ kind: 'variant', id: fixedId })), resolvedActive = value(await context.assets.resolve({ kind: 'asset', id: asset.id }));
  expect(resolvedVariant.variantId).toBe(fixedId); expect(resolvedActive.variantId).toBe(activeId);
  expect(resolvedVariant.files).toEqual([{ path: 'fixed.png', bytes: 1, mime: 'image/png' }]);
  expect((await context.assets.resolve({ kind: 'variant', id: fixtureId(0xe99) })).ok).toBe(false);

  const definitionUrl = `data:text/javascript,${encodeURIComponent(definition)}`, runtimeUrl = `data:text/javascript,${encodeURIComponent(runtime)}`;
  let snapshot, lastInput;
  const bridge = { documents: { list: () => Promise.resolve(projects.list()) }, plugins: { resolve: async () => ok({ handleId: fixtureId(0xe30), packages: [{ manifest, definitionUrl, runtimeUrl, editorUrl: null }] }), release: async () => ok(undefined) },
    language: { compile: async input => { lastInput = input; const result = compile(input); expect(result.issues).toEqual([]); snapshot = result.snapshot; return ok({ snapshot, lastValid: snapshot, current: true, issues: result.issues }); } } };
  value(await createAuthoringServices(bridge).compilePreview(true));
  expect(lastInput.assetReferences).toContainEqual({ assetId: asset.id, variantId: fixedId, owner: { kind: 'document', id: pluginDocumentId },
    source: { documentId: pluginDocumentId, revision: 1 }, usage: key, required: true });
  expect(snapshot.assets.map(item => item.variantId)).toEqual([activeId, fixedId]);
  expect(snapshot.pluginDocuments[pluginId].documents[0]).toMatchObject({ documentId: pluginDocumentId, revision: 1, data: { selected: fixedId } });
  const preview = await prepareProjectPlugins(bridge, lock, snapshot.pluginDocuments, { projectId: project.projectId, kind: 'playtest', instance: 'variant' }, projects.list().value, snapshot.assets);
  const previewRuntime = await import(runtimeUrl);
  expect(previewRuntime.resolved.map(result => value(result).variantId)).toEqual([fixedId, activeId]); await preview.dispose();
  const list = bridge.documents.list, missingId = fixtureId(0xe99), changedViews = value(projects.list()).map(document => {
    if (document.documentId !== pluginDocumentId) return document;
    const [path, raw] = Object.entries(document.files)[0], content = JSON.parse(raw); content.data.selected = missingId;
    return { ...document, revision: 7, files: { [path]: JSON.stringify(content) }, dirty: true };
  });
  bridge.documents.list = async () => ok(changedViews);
  const missing = await createAuthoringServices(bridge).compilePreview(false);
  expect(missing.ok).toBe(false); expect(missing.error).toMatchObject({ code: 'PLUGIN_CONFIG_ASSET_MISSING', source: { documentId: pluginDocumentId, revision: 7 }, related: [{ kind: 'variant', id: missingId }] });
  bridge.documents.list = list;

  vi.stubGlobal('document', { title: '' });
  const releases = [], engines = new Map();
  for (const target of ['web', 'windows']) {
    const entry = target === 'web' ? 'index.html' : 'player.exe', engineDirectory = join(root, 'engine');
    const engineFiles = { [`${target}/${entry}`]: target === 'windows' ? await readFile(createRequire(import.meta.url)('electron')) : 'engine', [`${target}/runtime/fonts/test-zh.otf`]: 'font', [`${target}/runtime/fonts/test-ja.otf`]: 'font', [`${target}/runtime/fonts/LICENSE.txt`]: 'test license',
      [`${target}/runtime/fonts.json`]: JSON.stringify({ fonts: [{ family: 'Test Chinese', language: 'zh-CN', path: 'runtime/fonts/test-zh.otf' }, { family: 'Test Japanese', language: 'ja', path: 'runtime/fonts/test-ja.otf' }], license: 'runtime/fonts/LICENSE.txt' }) };
    for (const [path, content] of Object.entries(engineFiles)) await put(join(engineDirectory, path), content);
    const engine = { target, manifest: { version: '0.1.0', files: Object.entries(engineFiles).map(([path, content]) => ({ path, size: Buffer.byteLength(content) })), conversions: [], entries: { playerWeb: 'web/index.html', playerWindows: 'windows/player.exe' } }, directory: engineDirectory };
    engines.set(target, engine);
    const builds = new StudioBuilds({ projects, language: { lastValid: () => ok(snapshot), currentInput: () => lastInput }, engineCatalog: { resolveProjectEngine: async () => ok(engine) }, pluginRoot,
      inputRoot: join(root, 'build-inputs'), verify: async () => ok({ evidencePaths: [] }) });
    const input = { projectId: project.projectId, target, outputDirectory: join(root, `release-${target}`), releaseVersion: project.releaseVersion, snapshotId: snapshot.snapshotId,
      savedVersions: snapshot.documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })), keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [] };
    const plan = value(await builds.planBuild(input)); expect(plan.issues.filter(issue=>issue.severity==='error')).toEqual([]);
    value(await builds.build(plan.planId));
    const releaseManifest = JSON.parse(await readFile(join(input.outputDirectory, 'release.manifest.json'), 'utf8'));
    const releaseSnapshot = JSON.parse(await readFile(join(input.outputDirectory, releaseManifest.snapshot), 'utf8'));
    expect(releaseSnapshot.assets.map(item => item.variantId)).toEqual([fixedId]);
    expect(releaseManifest.resources).toMatchObject([{ assetId: asset.id, variantId: fixedId, files: [assetFilePath(asset.id, fixedId, 'fixed.png')] }]);
    expect(await readFile(join(input.outputDirectory, assetFilePath(asset.id, fixedId, 'fixed.png')), 'utf8')).toBe('f');
    expect(releaseManifest.files.some(file => file.path.includes(activeId) || file.path.includes(originalId))).toBe(false);
    vi.stubGlobal('fetch', async url => new Response(await readFile(fileURLToPath(url)), { status: 200 }));
    const mounted = await mountRelease({ dataset: {} }, pathToFileURL(`${input.outputDirectory}/`), { target }, releaseSnapshot, releaseManifest);
    const releaseRuntime = await import(pathToFileURL(join(input.outputDirectory, `plugins/runtime/${pluginId}/0.1.0/runtime.mjs`)).href);
    expect(value(releaseRuntime.resolved[0]).variantId).toBe(fixedId); mounted.view.dispose();
    releases.push({ target, plan, manifest: releaseManifest, snapshot: releaseSnapshot, resolved: releaseRuntime.resolved });
  }
  const invalidSnapshot = structuredClone(snapshot); invalidSnapshot.documents = changedViews.map(document => ({ documentId: document.documentId, revision: document.revision }));
  const missingBuilds = new StudioBuilds({ projects: { currentRoot: projectRoot, currentSession: { projectId: project.projectId, withSavedSnapshot: async action => action(changedViews) } },
    language: { lastValid: () => ok(invalidSnapshot), currentInput: () => lastInput }, engineCatalog: { resolveProjectEngine: async () => ok(engines.get('web')) }, pluginRoot, inputRoot: join(root, 'build-inputs'), verify: async () => ok({ evidencePaths: [] }) });
  const missingBuildPlan = value(await missingBuilds.planBuild({ projectId: project.projectId, target: 'web', outputDirectory: join(root, 'release-missing'), releaseVersion: project.releaseVersion, snapshotId: invalidSnapshot.snapshotId,
    savedVersions: invalidSnapshot.documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })), keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [] }));
  expect(missingBuildPlan.issues).toContainEqual(expect.objectContaining({ code: 'BUILD_PLUGIN_REFERENCE', source: { documentId: pluginDocumentId, revision: 7 }, related: [{ kind: 'variant', id: missingId }] }));
  expect((await missingBuilds.build(missingBuildPlan.planId)).error.code).toBe('BUILD_BLOCKED');

  const backups = new StudioBackups({ userData: join(root, 'user-data'), projects, engineCatalog: { resolveProjectEngine: async () => ok({}) },
    officialPackages: { [pluginId]: { '0.1.0': join(pluginRoot, pluginId, '0.1.0') } } });
  expect(await backups.service.providers.validateDependencies(project, lock, '', [...projects.currentSession.documents.values()])).toEqual([]);
  const packagePath = join(root, 'variants.galproject'), backup = value(await backups.service.createBackup(projects.currentSession, { source: 'saved', destination: packagePath }));
  expect(backup.files.filter(file => file.role === 'asset')).toHaveLength(3);
  const restored = [];
  for (const identity of ['copyNew', 'restoreOriginal']) {
    const destination = join(root, identity), plan = value(await backups.service.prepareRestore({ packagePath, destination, identity, collision: 'newDirectory' }));
    expect(plan.missing).toEqual([]); const receipt = value(await backups.service.commitRestore(plan.operationDirectory));
    const session = await ProjectSession.open(destination, receipt.projectId);
    try {
      const copiedDocuments = [...session.documents.values()], instance = readPluginDocumentInstances(copiedDocuments)[0], index = JSON.parse(copiedDocuments.find(document => document.files['assets/index.json']).files['assets/index.json']).data.assets[0];
      const mapped = id => identity === 'copyNew' ? plan.idMap[id] : id;
      expect(instance.data.selected).toBe(mapped(fixedId)); expect(index.id).toBe(mapped(asset.id));
      expect(index.originalVariantId).toBe(mapped(originalId)); expect(index.activeVariantId).toBe(mapped(activeId));
      expect(index.variants.find(variant => variant.id === instance.data.selected).entry).toBe('fixed.png');
      expect(await readFile(join(destination, assetFilePath(index.id, instance.data.selected, 'fixed.png')), 'utf8')).toBe('f');
      expect(await validateProject(destination, copiedDocuments, backups.service.providers)).toEqual([]);
      restored.push({ identity, receipt, idMap: plan.idMap, instance, index });
    } finally { await session.dispose('saved'); }
  }
  await backups.plugins.dispose();
  expect(JSON.parse(await readFile(join(projectRoot, 'assets/index.json'), 'utf8')).data.assets[0]).toEqual(asset);
  expect(readPluginDocumentInstances([...projects.currentSession.documents.values()])[0].data.selected).toBe(fixedId);
  const update = value(await documents.update({ documentId: pluginDocumentId, expectedRevision: 1, data: { selected: fixedId, floating: true } }));
  value(projects.applyEdit(value(projects.planEdit(update)).planId, update.expected));
  value(await projects.save(value(projects.planSave({ kind: 'all' })).planId));
  value(await createAuthoringServices(bridge).compilePreview(true));
  expect(snapshot.assets.map(item => item.variantId)).toEqual([activeId, fixedId]);
  const engine = engines.get('web');
  const builds = new StudioBuilds({ projects, language: { lastValid: () => ok(snapshot), currentInput: () => lastInput }, engineCatalog: { resolveProjectEngine: async () => ok(engine) }, pluginRoot,
    inputRoot: join(root, 'build-inputs'), verify: async () => ok({ evidencePaths: [] }) });
  const outputDirectory = join(root, 'release-both'), bothPlan = value(await builds.planBuild({ projectId: project.projectId, target: 'web', outputDirectory, releaseVersion: project.releaseVersion, snapshotId: snapshot.snapshotId,
    savedVersions: snapshot.documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })), keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [] }));
  expect(bothPlan.issues.filter(issue=>issue.severity==='error')).toEqual([]); value(await builds.build(bothPlan.planId));
  const bothManifest = JSON.parse(await readFile(join(outputDirectory, 'release.manifest.json'), 'utf8')), bothSnapshot = JSON.parse(await readFile(join(outputDirectory, bothManifest.snapshot), 'utf8'));
  expect(bothSnapshot.assets.map(item => item.variantId)).toEqual([activeId, fixedId]);
  const bothMounted = await mountRelease({ dataset: {} }, pathToFileURL(`${outputDirectory}/`), { target: 'web' }, bothSnapshot, bothManifest);
  const bothRuntime = await import(pathToFileURL(join(outputDirectory, `plugins/runtime/${pluginId}/0.1.0/runtime.mjs`)).href);
  expect(bothRuntime.resolved.map(result => value(result).variantId)).toEqual([fixedId, activeId]); bothMounted.view.dispose();
  const docChange = value(await documents.update({ documentId: pluginDocumentId, expectedRevision: 2, data: { selected: originalId } }));
  value(projects.applyEdit(value(projects.planEdit(docChange)).planId, docChange.expected));
  const currentTemplate = readTemplateDocuments(value(projects.list())), pageId = currentTemplate.pages[0].id;
  const props = { floatingImage: asset.id, lockedImage: fixedId, nested: { locked: fixedId }, versions: [fixedId], freeText: fixedId, opaque: { id: fixedId } };
  const inserted = insertPluginComponent(currentTemplate, pageId, currentTemplate.pages[0].root.id, hud, props).template.pages[0];
  const pageDocument = [...projects.currentSession.documents.values()].find(document => document.files[`ui/pages/${pageId}.json`]);
  const page = JSON.parse(pageDocument.files[`ui/pages/${pageId}.json`]).data;
  const pageExpected = [{ ref: { kind: 'document', id: pageDocument.documentId }, revision: pageDocument.revision }];
  const pageEdit = value(projects.planEdit({ label: 'Insert variant HUD', origin: 'plugin', expected: pageExpected,
    patches: [{ kind: 'json', documentId: pageDocument.documentId, changes: [{ path: '/data/root/children', before: page.root.children, after: inserted.root.children, op: 'set' }] }], preparedAssets: [], requiredRefs: [{ kind: 'asset', id: asset.id }, { kind: 'variant', id: fixedId }] }));
  value(projects.applyEdit(pageEdit.planId, pageExpected)); value(await projects.save(value(projects.planSave({ kind: 'all' })).planId));
  value(await createAuthoringServices(bridge).compilePreview(true));
  const componentRefs = lastInput.assetReferences.filter(reference => reference.usage === hud.key);
  expect(componentRefs).toHaveLength(4);
  expect(componentRefs.map(reference => reference.source.field)).toEqual([
    `/data/root/children/${page.root.children.length}/plugin/props/floatingImage`, `/data/root/children/${page.root.children.length}/plugin/props/lockedImage`,
    `/data/root/children/${page.root.children.length}/plugin/props/nested/locked`, `/data/root/children/${page.root.children.length}/plugin/props/versions/0`]);
  expect(componentRefs.every(reference => reference.source.documentId === pageDocument.documentId && reference.source.revision === 2)).toBe(true);
  expect(snapshot.assets.map(item => item.variantId)).toContain(fixedId);
  const sourceCompile = { assetReferences: lastInput.assetReferences, assets: snapshot.assets, config: snapshot.pluginDocuments[pluginId] };
  const componentBackups = new StudioBackups({ userData: join(root, 'component-user-data'), projects, engineCatalog: { resolveProjectEngine: async () => ok({}) }, officialPackages: { [pluginId]: { '0.1.0': join(pluginRoot, pluginId, '0.1.0') } } });
  const componentPackage = join(root, 'component.galproject'); value(await componentBackups.service.createBackup(projects.currentSession, { source: 'saved', destination: componentPackage }));
  const componentCopy = value(await componentBackups.service.prepareRestore({ packagePath: componentPackage, destination: join(root, 'component-copy'), identity: 'copyNew', collision: 'newDirectory' }));
  expect(componentCopy.missing).toEqual([]); value(await componentBackups.service.commitRestore(componentCopy.operationDirectory));
  const copyAccess = new ProjectAccess(), copyProjects = new ProjectDocuments(copyAccess); value(await copyProjects.open(componentCopy.destination));
  let copiedComponentRelease;
  try {
    bridge.documents.list = async () => copyProjects.list(); value(await createAuthoringServices(bridge).compilePreview(true));
    const copyComponent = snapshot.template.pages[0].root.children.find(component => component.plugin?.key === hud.key), copyProps = copyComponent.plugin.props;
    expect(copyProps).toEqual({ floatingImage: componentCopy.idMap[asset.id], lockedImage: componentCopy.idMap[fixedId], nested: { locked: componentCopy.idMap[fixedId] },
      versions: [componentCopy.idMap[fixedId]], freeText: fixedId, opaque: { id: fixedId } });
    expect(snapshot.assets.some(item => item.variantId === copyProps.lockedImage)).toBe(true);
    const copyBuilds = new StudioBuilds({ projects: copyProjects, language: { lastValid: () => ok(snapshot), currentInput: () => lastInput }, engineCatalog: { resolveProjectEngine: async () => ok(engine) }, pluginRoot,
      inputRoot: join(root, 'build-inputs'), verify: async () => ok({ evidencePaths: [] }) });
    const copyOutput = join(root, 'component-copy-release'), copyPlan = value(await copyBuilds.planBuild({ projectId: componentCopy.resultProjectId, target: 'web', outputDirectory: copyOutput, releaseVersion: project.releaseVersion, snapshotId: snapshot.snapshotId,
      savedVersions: snapshot.documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })), keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [] }));
    expect(copyPlan.issues.filter(issue=>issue.severity==='error')).toEqual([]); value(await copyBuilds.build(copyPlan.planId));
    const copyManifest = JSON.parse(await readFile(join(copyOutput, 'release.manifest.json'), 'utf8')), copySnapshot = JSON.parse(await readFile(join(copyOutput, copyManifest.snapshot), 'utf8'));
    expect(copySnapshot.assets.map(item => item.variantId)).toContain(copyProps.lockedImage);
    expect(copySnapshot.assets[0].variantId).toBe(componentCopy.idMap[activeId]);
    const copyMounted = await mountRelease({ dataset: {} }, pathToFileURL(`${copyOutput}/`), { target: 'web' }, copySnapshot, copyManifest);
    const copyRuntime = await import(pathToFileURL(join(copyOutput, `plugins/runtime/${pluginId}/0.1.0/runtime.mjs`)).href);
    const copyResolved = value(await copyRuntime.assetPort.resolve({ kind: 'variant', id: copyProps.lockedImage }));
    expect(copyResolved.assetId).toBe(copyProps.floatingImage); expect(copyResolved.variantId).toBe(copyProps.lockedImage);
    expect(await readFile(join(copyOutput, copyResolved.entry), 'utf8')).toBe('f'); copyMounted.view.dispose();
    copiedComponentRelease = { copyPlan, copyProps, manifest: copyManifest, snapshot: copySnapshot, resolved: copyResolved, references: lastInput.assetReferences.filter(reference => reference.usage === hud.key) };
  } finally { bridge.documents.list = list; const id = copyProjects.currentSessionId; await copyProjects.close(id, 'discard'); copyAccess.release(id); await componentBackups.plugins.dispose(); }
  await put(evidence, JSON.stringify({ target: 'Node consumers + real Windows disk', environment: { node: process.version, platform: process.platform },
    dataset: { pluginId, assetId: asset.id, originalId, activeId, fixedId, pluginDocumentId },
    steps: ['install definition package', 'create variant-only document through M02 and save', 'resolve normal indexed file roles in service context', 'saved M03 compilation and playtest runtime activation', 'M11 plan/build for Web and Windows', 'activate packaged runtime with variant reference', 'full backup', 'copyNew with reference rewrite', 'restoreOriginal', 'verify source identities and active version'],
    expected: 'Fixed variant references remain exact across every consumer; active and original identities stay distinct and the source remains unchanged',
    actual: { references, resolvedVariant, resolvedActive, missingVariantDiagnostic: missing.error, missingBuildPlan, compile: sourceCompile, releases, backup, restored,
      bothReferenceRelease: { plan: bothPlan, manifest: bothManifest, snapshot: bothSnapshot, resolved: bothRuntime.resolved }, componentReferences: componentRefs, copiedComponentRelease },
    limitations: ['Engine entry files and graphical Player mount are test adapters; checks cover real packaging, runtime activation, document and asset disk IO'], result: 'passed', executedAt: new Date().toISOString() }, null, 2));
}, 90000); // Packages both targets and performs three identity-rewriting backups on real disk.

it('diagnoses a missing fixed variant at the actual plugin document revision', async () => {
  const asset = structuredClone(FixtureAsset), missingId = fixtureId(0xef0), documentId = fixtureId(0xef1);
  const provider = { key, collectReferences: () => [{ kind: 'variant', id: missingId }] };
  const template = createOfficialTemplate({ kind: 'standard' });
  const documents = [
    { documentId: projectDocumentId, revision: 1, files: { 'project.json': envelope(projectDocumentId, { ...FixtureProject, templateDocumentId: template.instanceId }) } },
    { documentId: lockDocumentId, revision: 1, files: { 'dependencies.lock.json': envelope(lockDocumentId, { ...FixtureLock, plugins: [] }) } },
    { documentId: indexDocumentId, revision: 1, files: { 'assets/index.json': envelope(indexDocumentId, { assets: [asset] }) } },
    { documentId, revision: 7, files: { [`plugins/${pluginId}/config/${documentId}.json`]: envelope(documentId, { selected: missingId }) } },
    ...createTemplateDocuments(template),
  ];
  const providers = { collectAssets: () => ({ files: [], issues: [] }), pluginDocuments: () => provider };
  const issues = await validateProject(root, documents, providers);
  expect(issues).toContainEqual(expect.objectContaining({ code: 'RESTORE_PLUGIN_REFERENCE', source: { documentId, revision: 7 }, related: [{ kind: 'variant', id: missingId }] }));
  const release = vi.fn(), plugins = { acquireDefinitions: async () => ok({ documents: [provider], release }) };
  documents[3].files[Object.keys(documents[3].files)[0]] = JSON.stringify({ schemaVersion: 1, documentId, revision: 7,
    pluginDocument: { pluginId, contributionKey: key, name: 'Missing', stateVersion: 1 }, data: { selected: missingId } });
  await expect(pluginDocumentReferences(plugins, { documents: new Map(documents.map(document => [document.documentId, document])) })).rejects.toThrow(`${documentId}@7`);
  expect(release).toHaveBeenCalledOnce();
  await put(join(dirname(evidence), 'diagnostics.json'), JSON.stringify({ target: 'Node reference validation', environment: { node: process.version, platform: process.platform },
    dataset: { pluginId, documentId, revision: 7, missingVariantId: missingId }, expected: 'A missing variant reports its actual owning document and revision and releases the definition lease',
    actual: { issues, definitionLeaseReleases: release.mock.calls.length }, result: 'passed', executedAt: new Date().toISOString() }, null, 2));
});
