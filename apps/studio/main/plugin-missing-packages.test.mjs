import { afterEach, expect, it } from 'vitest';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { assetFilePath, createAssetIndex } from '@galcraft/assets';
import { DefaultTimeoutSecByPurpose, IssueSchema } from '@galcraft/contracts';
import { fixtureId, FixtureAsset, FixtureLock, FixtureProject, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { StudioAssets } from './asset-providers.mjs';
import { StudioBuilds } from './build-providers.mjs';
import { PluginDocuments } from './plugin-documents.mjs';
import { StudioPluginPackages } from './plugin-packages.mjs';
import { pluginDocumentReferences, pluginServicePorts } from './plugin-service-ports.mjs';
import { StudioProduction } from './production-providers.mjs';

const root = resolve(import.meta.dirname, '../../../tmp/testing/plugin-missing-packages');
const shapeId = 'org.test.geometry', kind = `${shapeId}/shape`, generatorId = 'org.test.generator', operationId = `${generatorId}/generate`;
const value = result => { if (!result.ok) throw new Error(JSON.stringify(result)); return result.value; };
const envelope = (documentId, data, extra = {}) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, ...extra, data });
const put = async (path, content) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, content); };
const capabilities = { query: false, refetch: false, cancelPerTask: false, resume: false };
const operation = { contractVersion: 1, id: operationId, version: 1, title: 'Stored generation', description: '', providerKey: `${generatorId}/provider`,
  purpose: operationId, fields: [], inputSchema: true, inputs: [], outputs: [{ key: 'text', type: 'text', required: true, multiple: false, mimeTypes: ['text/plain'] }], capabilities, adoption: { kind: 'text' } };
let session, production;
afterEach(async () => { await production?.closeProject(session.projectId); await session?.dispose('discard'); await rm(root, { recursive: true, force: true }); });

async function packageSource(id, version = '0.1.0') {
  const directory = join(root, 'source', id, version), shape = id === shapeId;
  const files = shape ? { 'definition.mjs': `const ok=value=>({ok:true,value,warnings:[]});
    export function createDefinition(){return {assetTypes:[{contractVersion:1,key:'${kind}',typeVersion:1,title:'Geometry',description:'',icon:'shapes',schema:true,
      fields:[],extensions:[],targets:['web','windows'],resourceProviderKey:null,capabilities:[],collectReferences:value=>[{kind:'asset',id:value.texture}],rewriteReferences:(value,ids)=>ok({...value,texture:ids[value.texture]??value.texture})}],
      documents:[{key:'${shapeId}/config',instances:'multiple',titleKey:'Geometry',stateVersion:1,schema:true,fields:[],initial:{},collectReferences:value=>[{kind:'asset',id:value.texture}],rewriteReferences:(value,ids)=>ok({...value,texture:ids[value.texture]??value.texture})}]};}` }
    : { 'definition.mjs': `export function createDefinition(){return {productionOperations:[${JSON.stringify(operation)}]};}`,
      'services.mjs': `import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';
      export function createPlugin(){return {activate:async()=>({generationProviders:[{key:'${generatorId}/provider',version:'0.1.0',purposes:['text','${operationId}'],configFields:[],inputSchema:true,outputSchema:true,capabilities:${JSON.stringify(capabilities)},create:config=>({
        inspect:async(_config,purpose)=>({connectionId:config.id,connectionRevision:config.revision,checkedAt:new Date().toISOString(),serviceVersion:'1',purpose,status:'unverified',inputs:[],output:'text',models:null,promptFormat:'natural',textVision:null,remote:{query:false,cancelQueued:false,cancelRunning:'none'},issues:[]}),
        async *submit(input,ctx){await mkdir(ctx.directory,{recursive:true});const path=join(ctx.directory,'result.txt');await writeFile(path,'Preserved candidate');yield {kind:'output',artifacts:[{kind:'text',port:'text',localPath:path,mime:'text/plain',bytes:19,metadata:{},groupId:ctx.requestId,role:'primary',background:null}],usage:null};},
        cancel:async()=>({local:'stopped',remote:'unsupported'})})}]}),deactivate:async()=>{}};}` };
  const contributions = shape ? [{ kind: 'assetType', key: kind }, { kind: 'document', key: `${shapeId}/config` }]
    : [{ kind: 'generationProvider', key: `${generatorId}/provider` }, { kind: 'productionOperation', key: operationId }];
  for (const [path, content] of Object.entries(files)) await put(join(directory, path), content);
  await put(join(directory, 'manifest.json'), JSON.stringify({ schemaVersion: 2, id, name: id, version, description: '', author: 'Test', license: 'MIT', homepage: null,
    engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [], environmentDependencies: { definition: [], editor: [], services: [], runtime: [] },
    entry: { definition: 'definition.mjs', runtime: null, editor: null, services: shape ? null : 'services.mjs' },
    files: Object.entries(files).map(([path, content]) => ({ path, size: Buffer.byteLength(content) })),
    contributions: contributions.map(item => ({ ...item, targets: ['web', 'windows'], required: true })), stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] }));
  return directory;
}

it.each([false, true])('keeps required missing exact packages readable and blocks interpretation until they return (other version: %s)', async otherVersion => {
  const pluginRoot = join(root, 'installed'), packages = new StudioPluginPackages(pluginRoot, {});
  for (const id of [shapeId, generatorId]) for (const version of otherVersion ? ['0.1.0', '2.0.0'] : ['0.1.0']) value(await packages.install({ kind: 'directory', path: await packageSource(id, version) }));
  const projectDocumentId = fixtureId(0xf01), lockDocumentId = fixtureId(0xf02), indexId = fixtureId(0xf03), pluginDocumentId = fixtureId(0xf04);
  const template = createOfficialTemplate({ kind: 'standard' }), project = structuredClone(FixtureProject);
  const lock = { ...FixtureLock, template: { ...FixtureLock.template, id: template.id, version: template.version },
    plugins: [shapeId, generatorId].map(id => ({ kind: 'plugin', id, version: '0.1.0', targets: ['web', 'windows'], required: true })) };
  const image = structuredClone(FixtureAsset), shape = { ...structuredClone(FixtureAsset), id: fixtureId(0xf05), kind, name: 'Preserved shape' };
  shape.variants[0].id = fixtureId(0xf06); shape.activeVariantId = shape.originalVariantId = shape.variants[0].id;
  shape.variants[0].entry = 'shape.json'; shape.variants[0].files = [{ path: 'shape.json', bytes: 2, mime: 'application/json', role: 'entry' }];
  shape.variants[0].typeData = { typeVersion: 1, provider: { id: shapeId, version: '0.1.0' }, value: { texture: image.id } };
  const index = { ...createAssetIndex(indexId), data: { assets: [image, shape] } }, projectRoot = join(root, 'project');
  session = await ProjectSession.createProject(projectRoot, project.projectId, [
    { documentId: projectDocumentId, revision: 1, format: 'json', files: { 'project.json': envelope(projectDocumentId, project) } },
    { documentId: lockDocumentId, revision: 1, format: 'json', files: { 'dependencies.lock.json': envelope(lockDocumentId, lock) } },
    { documentId: indexId, revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } },
    { documentId: pluginDocumentId, revision: 1, format: 'json', files: { [`plugins/${shapeId}/config/${pluginDocumentId}.json`]: envelope(pluginDocumentId, { texture: image.id },
      { pluginDocument: { pluginId: shapeId, contributionKey: `${shapeId}/config`, name: 'Preserved config', stateVersion: 1 } }) } },
    ...createTemplateDocuments(template),
  ]);
  await put(join(projectRoot, assetFilePath(shape.id, shape.activeVariantId, 'shape.json')), '{}');
  const projects = { currentSession: session, currentRoot: projectRoot }, ports = pluginServicePorts(packages), assets = new StudioAssets(projects, '', null, null, {});
  assets.assetTypes = ports.assetTypes; assets.pluginReferences = (session, id, options) => pluginDocumentReferences(packages, session, id, options);
  const config = { id: fixtureId(0xf07), revision: 1, name: 'Stored provider', protocol: 'plugin', providerKey: `${generatorId}/provider`, baseUrl: '',
    credentialId: null, auth: 'none', apiKeyHeader: null, model: 'fixture', purposes: ['text', operationId], timeoutSecByPurpose: DefaultTimeoutSecByPurpose,
    concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  const options = { userData: join(root, 'user-data'), projects, assets, connections: { list: async () => [config], read: async () => ({ config }), credential: async () => null }, generationProviders: ports.generationProviders };
  production = new StudioProduction(options);
  const ctx = await production.current(), snapshot = (await ports.generationProviders.operations(session)).find(item => item.id === operationId);
  const item = { id: fixtureId(0xf08), purpose: operationId, operationSnapshot: snapshot, target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: operationId, uiScope: null },
    backgroundRemoval: null, backgroundPreview: null, dependencies: [], input: { purpose: operationId, fields: {}, references: [] }, sourceVersions: [], configSnapshot: config,
    workflowSnapshot: null, recipeSnapshot: null, state: 'draft', remote: null, progress: { phase: '', completed: null, total: null }, attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false, issues: [] };
  const plan = value(await ctx.service.planTask({ projectId: project.projectId, name: 'Stored extension task', items: [item], context: [], policy: 'waitForSelection', selectionRule: null }));
  const task = value(await ctx.service.submit(plan.planId)); await ctx.service.drain();
  const completed = ctx.service.listTasks()[0]; expect(completed.items[0].candidateIds).toHaveLength(1);
  const candidateId = completed.items[0].candidateIds[0], candidate = ctx.service.getCandidate(candidateId), persistedTask = await readFile(ctx.service.store.taskPath(task.id), 'utf8');
  const persistedCandidate = await readFile(join(ctx.service.store.candidatePath(task.id, item.id, candidateId), 'candidate.json'), 'utf8');
  await production.closeProject(project.projectId);

  await rename(join(pluginRoot, shapeId, '0.1.0'), join(root, 'offline-shape'));
  production = new StudioProduction(options);
  const shapeOnlyOverview = await production.call('overview');
  expect(shapeOnlyOverview.ok).toBe(true); expect(shapeOnlyOverview.value.providers.map(provider => provider.packageVersion)).toEqual(['0.1.0']);
  expect(shapeOnlyOverview.warnings.some(issue => issue.message.includes(`${shapeId}@0.1.0`))).toBe(true);
  await production.closeProject(project.projectId);
  await rename(join(pluginRoot, generatorId, '0.1.0'), join(root, 'offline-generator'));
  production = new StudioProduction(options);

  const query = { kind: null, folder: null, characterId: null, sceneId: null, locale: null, search: '', tags: [], reference: 'any', review: 'any', sort: 'name', direction: 'asc', offset: 0, limit: 40, indexRevision: null };
  const queried = await assets.query(query), ids = await assets.allIds(query), picked = await assets.picker({ query, context: { projectId: project.projectId, allowedKinds: ['image', kind], tab: 'all', currentAssetId: null, currentVariantId: null, characterId: null, sceneId: null, locale: null } });
  for (const result of [queried, ids, picked]) {
    expect(result.ok).toBe(true); expect(result.warnings.some(issue => issue.code === 'ASSET_TYPE_UNAVAILABLE' && issue.entity?.id === shape.activeVariantId)).toBe(true);
    expect(result.warnings.some(issue => issue.code === 'PLUGIN_DOCUMENT_PROVIDER' && issue.entity?.id === pluginDocumentId)).toBe(true);
    result.warnings.forEach(issue => IssueSchema.parse(issue));
  }
  expect(queried.value.items.map(asset => asset.id).sort()).toEqual([image.id, shape.id].sort());
  expect(ids.value.ids.sort()).toEqual([image.id, shape.id].sort()); expect(picked.value.items).toHaveLength(2);
  expect(value(await assets.typeCatalog()).find(entry => entry.descriptor.key === kind)).toMatchObject({ unavailable: true, count: 1 });
  expect(value(assets.get(shape.id))).toEqual(shape);
  expect((await assets.references(image.id)).warnings.some(issue => issue.code === 'PLUGIN_DOCUMENT_PROVIDER')).toBe(true);
  expect((await packages.acquireDefinitions(session)).ok).toBe(false);
  await expect(assets.referenceRecords(session)).rejects.toThrow();
  await expect(pluginDocumentReferences(packages, session, image.id)).rejects.toThrow();
  expect((await assets.editTypeData({ assetId: shape.id, variantId: shape.activeVariantId, expectedRevision: shape.revision, typeData: shape.variants[0].typeData })).error.code).toBe('ASSET_TYPE_UNAVAILABLE');
  expect((await assets.remove([image.id])).error.code).toBe('ASSET_TYPE_UNAVAILABLE');
  expect((await new PluginDocuments(projects, packages).copy({ documentId: pluginDocumentId })).ok).toBe(false);
  await expect(ports.generationProviders.acquire({ providerKey: config.providerKey, packageVersion: '0.1.0' }, session)).rejects.toThrow();
  const overview = await production.call('overview');
  expect(overview.ok).toBe(true); expect(overview.value.providers).toEqual([]); expect(overview.value.operations.some(item => item.id === operationId)).toBe(false);
  expect(overview.value.tasks).toEqual([completed]); expect(overview.value.candidates[0].candidate).toEqual(candidate);
  expect(overview.warnings.some(issue => issue.message.includes(`${generatorId}@0.1.0`))).toBe(true);
  expect((await production.call('providers')).warnings.some(issue => issue.message.includes(`${generatorId}@0.1.0`))).toBe(true);
  overview.warnings.forEach(issue => IssueSchema.parse(issue));
  const blockedGeneration = await (await production.current()).service.planTask({ projectId: project.projectId, name: 'Blocked', items: [item], context: [], policy: 'waitForSelection', selectionRule: null });
  expect(blockedGeneration.ok).toBe(false); expect(blockedGeneration.error.message).toContain(operationId);
  expect(await readFile(ctx.service.store.taskPath(task.id), 'utf8')).toBe(persistedTask);
  expect(await readFile(join(ctx.service.store.candidatePath(task.id, item.id, candidateId), 'candidate.json'), 'utf8')).toBe(persistedCandidate);
  expect(JSON.parse(session.readDocument(lockDocumentId).files['dependencies.lock.json']).data).toEqual(lock);
  expect(await readFile(join(projectRoot, assetFilePath(shape.id, shape.activeVariantId, 'shape.json')), 'utf8')).toBe('{}');
  expect(session.dirtyIds()).toEqual([]);

  const buildSnapshot = { ...structuredClone(FixtureSnapshot), project, projectId: project.projectId, template, lock, assets: [], characters: [],
    documents: [...session.documents.values()].map(document => ({ documentId: document.documentId, revision: document.revision })) };
  buildSnapshot.scenes.forEach(scene => { scene.instructions = []; });
  const engine = { target: 'web', manifest: { version: '0.1.0', files: [], conversions: [], entries: { playerWeb: 'web/index.html', playerWindows: 'windows/player.exe' } }, directory: root };
  const builds = new StudioBuilds({ projects, language: { lastValid: () => ({ ok: true, value: buildSnapshot, warnings: [] }), currentInput: () => ({}) },
    engineCatalog: { resolveProjectEngine: async () => ({ ok: true, value: engine, warnings: [] }) }, pluginRoot, inputRoot: join(root, 'build-inputs') });
  const buildPlan = value(await builds.planBuild({ projectId: project.projectId, target: 'web', outputDirectory: join(root, 'release'), releaseVersion: project.releaseVersion,
    snapshotId: buildSnapshot.snapshotId, savedVersions: buildSnapshot.documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
    keepAssets: [shape.id], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [] }));
  expect(buildPlan.issues.some(issue => issue.code === 'BUILD_PLUGIN' && issue.message.includes(`${shapeId}@0.1.0`) && issue.severity === 'error')).toBe(true);
  expect((await builds.build(buildPlan.planId)).error.code).toBe('BUILD_BLOCKED');

  for (const id of [shapeId, generatorId]) await rename(join(root, id === shapeId ? 'offline-shape' : 'offline-generator'), join(pluginRoot, id, '0.1.0'));
  expect((await assets.query(query)).warnings).toEqual([]);
  expect(value(await assets.typeCatalog()).find(entry => entry.descriptor.key === kind)).toMatchObject({ provider: { id: shapeId, version: '0.1.0' }, count: 1 });
  expect((await assets.referenceRecords(session, image.id))).toHaveLength(2);
  const restored = await production.call('overview'); expect(restored.warnings).toEqual([]); expect(restored.value.tasks).toEqual([completed]);
  expect(restored.value.operations.find(item => item.id === operationId).provider.version).toBe('0.1.0');
  const lease = await ports.generationProviders.acquire({ providerKey: config.providerKey, packageVersion: '0.1.0' }, session); expect(lease.packageVersion).toBe('0.1.0'); await lease.release();
  expect(session.dirtyIds()).toEqual([]);
  await put(resolve(import.meta.dirname, `../../../test-results/latest/architecture-missing-packages/${otherVersion ? 'other-version' : 'absent'}.json`), JSON.stringify({
    target: 'Required exact package loss and recovery', environment: { node: process.version, platform: process.platform, storage: 'real local disk', host: 'Studio main services' },
    data: { requiredLock: lock, ordinaryAssetId: image.id, extensionAssetId: shape.id, pluginDocumentId, taskId: task.id, candidateId, otherVersion },
    expected: 'General reads preserve content with capability diagnostics; specialized edits, reference rewrites, generation and publishing block; restoring the exact packages recovers access without issuing requests',
    actual: { readableAssetIds: ids.value.ids, queryWarnings: queried.warnings, overviewWarnings: overview.warnings, preservedTasks: overview.value.tasks.length,
      preservedCandidates: overview.value.candidates.length, generationBlock: blockedGeneration.error, publishBlock: buildPlan.issues.filter(issue => issue.code === 'BUILD_PLUGIN'),
      restoredProviderVersion: lease.packageVersion, restoredWarnings: restored.warnings, projectDirtyIds: session.dirtyIds() },
    result: 'passed', evidence: ['main/plugin-missing-packages.test.mjs'], executedAt: new Date().toISOString(),
  }, null, 2));
}, 30_000);
