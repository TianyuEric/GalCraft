import { describe, expect, it, vi } from 'vitest';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureLock, FixtureProject, FixtureScenes, FixtureTemplate } from '@galcraft/contracts/fixtures';
import type { DocumentView, SemanticQuery, StudioBridge } from '@galcraft/contracts';
import type { CompileInput } from '@galcraft/dsl';
import { compile as compileSnapshot } from '@galcraft/dsl';
import { createTemplateDocuments } from '@galcraft/templates';
import { createAuthoringServices } from './bridge.js';
import { prepareProjectPlugins } from './plugins.js';

const envelope = (id: string, data: unknown) => JSON.stringify({ schemaVersion: 1, documentId: id, revision: 1, data });
const view = (documentId: string, format: DocumentView['format'], files: Record<string, string>): DocumentView =>
  ({ documentId, revision: 1, savedRevision: 1, format, files, savedFiles: files, dirty: false });

describe('M01 semantic bridge', () => {
  it('keeps a legacy root configuration in runtime activation and snapshot, preferring documents/config when both exist', async () => {
    const id = 'org.example.legacy-config', rootConfig = { title: 'Root configuration' }, nestedConfig = { title: 'Documents configuration' };
    const runtime = `export let config; export function createPlugin(){return {activate:async context=>{config=context.config;return {commands:[],conditions:[],documents:[],tools:[],resources:[],stages:[],pages:[],components:[],systems:[],platform:[]}},deactivate:async()=>{}}}`;
    const runtimeUrl = `data:text/javascript,${encodeURIComponent(runtime)}`;
    const manifest = { schemaVersion: 1, id, name: 'Legacy configuration', version: '0.1.0', description: '', author: 'Example', license: 'MIT', homepage: null,
      engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [], entry: { runtime: 'runtime.js', editor: null }, files: [{ path: 'runtime.js', size: runtime.length }],
      contributions: [], stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] };
    const lock = { ...FixtureLock, plugins: [{ kind: 'plugin', id, version: '0.1.0', targets: ['web', 'windows'], required: true }] };
    const documents = [view(FixtureIds.projectA, 'json', { 'project.json': envelope(FixtureIds.projectA, FixtureProject) }),
      view('LockAA', 'json', { 'dependencies.lock.json': envelope('LockAA', lock) }), view('Assets', 'json', { 'assets/index.json': envelope('Assets', { assets: [] }) }),
      ...createTemplateDocuments(FixtureTemplate).map(item => view(item.documentId, item.format, item.files)),
      ...FixtureScenes.map((scene, index) => view(`Scene${index}`, 'dsl', { [`scenes/${scene.id}/scene.json`]: envelope(`Scene${index}`, scene),
        [`scenes/${scene.id}/script.gal`]: `end {} @${crypto.randomUUID()};` })),
      view('RootCf', 'json', { [`plugins/${id}/config.json`]: envelope('RootCf', rootConfig) })];
    const compile = vi.fn(async (input: CompileInput) => { const result = compileSnapshot(input); return { ok: true as const, value: { ...result, lastValid: result.snapshot, current: true }, warnings: [] }; });
    const bridge = { documents: { list: async () => ({ ok: true, value: documents, warnings: [] }) }, plugins: {
      resolve: async () => ({ ok: true, value: { handleId: 'LegacyLease', packages: [{ manifest, runtimeUrl, definitionUrl: null, editorUrl: null }] }, warnings: [] }),
      release: async () => ({ ok: true, value: undefined, warnings: [] }) }, language: { compile } } as unknown as StudioBridge;
    for (const expected of [rootConfig, nestedConfig]) {
      if (expected === nestedConfig) documents.push(view('NestCf', 'json', { [`plugins/${id}/documents/config.json`]: envelope('NestCf', nestedConfig) }));
      const result = await createAuthoringServices(bridge).compilePreview!();
      expect(result.ok).toBe(true);
      if (result.ok) { expect(result.value.issues).toEqual([]); expect(result.value.snapshot?.pluginDocuments[id]).toEqual(expected); }
      expect((await import(/* @vite-ignore */ runtimeUrl)).config).toEqual(expected);
    }
  });
  it('compiles mapped document instances from the selected working or saved projection without activating runtime code', async () => {
    const id = 'org.example.config', key = `${id}/settings`, commandKey = `${id}/mark`;
    const spec = { key: commandKey, version: '0.1.0', name: 'Mark', description: '', icon: 'mark', category: 'plugin', keywords: [], fields: [], continuation: 'continue', skippable: false, executor: id, targetCapabilities: [], constraints: [] };
    const definitionSource = `export function createDefinition(){return {commands:[${JSON.stringify(spec)}],documents:[{key:'${key}',schema:{type:'object'},fields:[],initial:{},configMapping:{purpose:'settings',mode:'multiple',required:true},collectReferences:data=>[{kind:'asset',id:data.assetId}],rewriteReferences:data=>({ok:true,value:data,warnings:[]})}]}}`;
    const manifest = { schemaVersion: 2, id, name: 'Configuration', version: '0.1.0', description: '', author: 'Example', license: 'MIT', homepage: null, engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [], entry: { runtime: 'runtime.js', editor: null, definition: 'definition.js' }, files: [{ path: 'runtime.js', size: 1 }, { path: 'definition.js', size: 1 }], contributions: [{ kind: 'document', key, targets: ['web', 'windows'], required: true }, { kind: 'command', key: commandKey, targets: ['web', 'windows'], required: true }], stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] };
    const lock = { ...FixtureLock, plugins: [{ kind: 'plugin', id, version: '0.1.0', targets: ['web', 'windows'], required: true }] };
    const pluginDocument = (documentId: string, name: string) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, pluginDocument: { pluginId: id, contributionKey: key, name, stateVersion: 1 }, data: { title: name, assetId: FixtureAsset.id } });
    const first = { ...view('DocAAA', 'json', { [`plugins/${id}/documents/DocAAA.json`]: pluginDocument('DocAAA', 'working') }), revision: 3, savedRevision: 2, dirty: true, savedFiles: { [`plugins/${id}/documents/DocAAA.json`]: pluginDocument('DocAAA', 'saved') } };
    const deleted = { ...view('DocBBB', 'json', {}), revision: 2, savedRevision: 1, dirty: true, savedFiles: { [`plugins/${id}/documents/DocBBB.json`]: pluginDocument('DocBBB', 'saved deleted') } };
    const documents = [view(FixtureIds.projectA, 'json', { 'project.json': envelope(FixtureIds.projectA, FixtureProject) }), view('LockAA', 'json', { 'dependencies.lock.json': envelope('LockAA', lock) }), view('Assets', 'json', { 'assets/index.json': envelope('Assets', { assets: [FixtureAsset] }) }), ...createTemplateDocuments(FixtureTemplate).map(item => view(item.documentId, item.format, item.files)), first, deleted];
    const compile = vi.fn(async (_input: CompileInput) => ({ ok: true as const, value: { snapshot: null, lastValid: null, current: true, issues: [] }, warnings: [] }));
    const bridge = { documents: { list: async () => ({ ok: true, value: documents, warnings: [] }) }, plugins: { resolve: async () => ({ ok: true, value: { handleId: 'LeaseA', packages: [{ manifest, definitionUrl: `data:text/javascript,${encodeURIComponent(definitionSource)}`, runtimeUrl: `data:text/javascript,${encodeURIComponent('throw new Error("Compiler must not activate runtime")')}`, editorUrl: null }] }, warnings: [] }), release: async () => ({ ok: true, value: undefined, warnings: [] }) }, language: { compile } } as unknown as StudioBridge;
    const services = createAuthoringServices(bridge);
    expect((await services.compilePreview!(false)).ok).toBe(true); expect((await services.compilePreview!(true)).ok).toBe(true);
    expect(compile.mock.calls[0]![0].pluginConfigDocuments).toEqual([{ contribution: key, documentId: 'DocAAA', revision: 3, data: { title: 'working', assetId: FixtureAsset.id } }]);
    expect(compile.mock.calls[1]![0].pluginConfigDocuments).toEqual([{ contribution: key, documentId: 'DocAAA', revision: 2, data: { title: 'saved', assetId: FixtureAsset.id } }, { contribution: key, documentId: 'DocBBB', revision: 1, data: { title: 'saved deleted', assetId: FixtureAsset.id } }]);
    expect(compile.mock.calls[1]![0].pluginCommands).toEqual([spec]); expect(compile.mock.calls[1]![0].assetReferences).toEqual(expect.arrayContaining([expect.objectContaining({ assetId: FixtureAsset.id, source: { documentId: 'DocBBB', revision: 1 } })]));
  });
  it('uses the exact locked third-party command for compilation and preview preparation', async () => {
    const id = 'org.example.dialogue', version = '0.1.0', key = `${id}/mark`;
    const spec = { key, version, name: 'Mark', description: 'Mark', icon: 'mark', category: 'plugin', keywords: [],
      fields: [], continuation: 'continue', skippable: false, executor: id, targetCapabilities: [], constraints: [] };
    const source = `export function createPlugin() { return { activate: async () => ({ commands: [{ spec: ${JSON.stringify(spec)},
      execute: async ({ state }) => ({ ok: true, value: { progress: state, longTermDelta: null, presentation: null, wait: null, result: null }, warnings: [] }) }],
      conditions: [], documents: [], tools: [], resources: [], stages: [], pages: [], components: [], systems: [], platform: [] }),
      deactivate: async () => {} }; }`;
    const manifest = { schemaVersion: 1, id, name: 'Dialogue', version, description: '', author: 'Example', license: 'MIT',
      homepage: null, engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [],
      entry: { runtime: 'runtime/index.js', editor: null }, files: [{ path: 'runtime/index.js', size: source.length }],
      contributions: [{ kind: 'command', key, targets: ['web', 'windows'], required: true }],
      stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] };
    const lock = { ...FixtureLock, plugins: [{ kind: 'plugin' as const, id, version, targets: ['web' as const, 'windows' as const], required: true }] };
    const template = structuredClone(FixtureTemplate);
    const documents = [
      view(FixtureIds.projectA, 'json', { 'project.json': envelope(FixtureIds.projectA, FixtureProject) }),
      view(crypto.randomUUID(), 'json', { 'dependencies.lock.json': envelope(crypto.randomUUID(), lock) }),
      view(crypto.randomUUID(), 'json', { 'assets/index.json': envelope(crypto.randomUUID(), { assets: [FixtureAsset] }) }),
      ...createTemplateDocuments(template).map(item => view(item.documentId, item.format, item.files)),
    ];
    const release = vi.fn(async () => ({ ok: true as const, value: undefined, warnings: [] }));
    const resolve = vi.fn(async () => ({ ok: true as const, value: { handleId: crypto.randomUUID(),
      packages: [{ manifest, runtimeUrl: `data:text/javascript,${encodeURIComponent(source)}`, editorUrl: null }] }, warnings: [] }));
    const compile = vi.fn(async (_input: CompileInput) => ({ ok: true as const,
      value: { snapshot: null, lastValid: null, current: true, issues: [] }, warnings: [] }));
    const bridge = { documents: { list: async () => ({ ok: true as const, value: documents, warnings: [] }) },
      plugins: { resolve, release }, language: { compile } } as unknown as StudioBridge;
    const compiled = await createAuthoringServices(bridge).compilePreview!();
    expect(compiled.ok).toBe(true);
    expect(compile.mock.calls[0]![0].pluginCommands).toEqual([spec]);
    const preview = await prepareProjectPlugins(bridge, lock, {},
      { projectId: FixtureIds.projectA, kind: 'playtest', instance: crypto.randomUUID() });
    expect(preview.contributions.commands[0]?.spec.key).toBe(key);
    expect(preview.manifests[0]?.id).toBe(id);
    await preview.dispose();
    expect(release).toHaveBeenCalledTimes(2);
  });
  it('forwards P03 folder, size and modified sorting to the M04 query', async () => {
    const query = vi.fn(async () => ({ ok: true as const, value: { items: [], total: 0, offset: 0, indexRevision: 4 }, warnings: [] }));
    const bridge = { assets: { query } } as unknown as StudioBridge;
    const services = createAuthoringServices(bridge);
    await services.queryAssets({ kind: 'image', text: '背景', folder: ['背景', '夜晚'], sort: 'size', direction: 'desc', offset: 0, limit: 40,
      allowedKinds: ['image', 'video'], usage: 'background', characterId: FixtureIds.an, sceneId: FixtureIds.street, locale: 'ja', tags: ['夜'], indexRevision: 4 });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ folder: ['背景', '夜晚'], sort: 'size', direction: 'desc', search: '背景',
      allowedKinds: ['image', 'video'], usage: 'background', characterId: FixtureIds.an, sceneId: FixtureIds.street, locale: 'ja', tags: ['夜'], indexRevision: 4 }));
  });
  it('queries M03 with the exact compiled scene and entity version vector', async () => {
    const characterDocumentId = crypto.randomUUID();
    const semanticLock = { ...FixtureLock, plugins: [] };
    const template = structuredClone(FixtureTemplate);
    template.pages[0]!.background.imageId = FixtureAsset.id;
    const documents = [
      view(FixtureIds.projectA, 'json', { 'project.json': envelope(FixtureIds.projectA,
        { ...FixtureProject, display: { ...FixtureProject.display, icon: FixtureAsset.id }, dynamicAssets: [FixtureAsset.id] }) }),
      view(crypto.randomUUID(), 'json', { 'dependencies.lock.json': envelope(crypto.randomUUID(), semanticLock) }),
      view(crypto.randomUUID(), 'json', { 'assets/index.json': envelope(crypto.randomUUID(), { assets: [FixtureAsset] }) }),
      view(characterDocumentId, 'json', { [`characters/${FixtureCharacters[0]!.id}.json`]:
        envelope(characterDocumentId, { ...FixtureCharacters[0], avatar: FixtureAsset.id }) }),
      view(FixtureIds.streetDocument, 'dsl', {
        [`scenes/${FixtureIds.street}/scene.json`]: envelope(FixtureIds.streetDocument, FixtureScenes[0]),
        [`scenes/${FixtureIds.street}/script.gal`]: `say {speaker:{kind:"narrator"},text:"你好"} @${FixtureIds.statements[0]};\n` +
          `label {labelId:"${FixtureIds.streetLabel}",name:"入口"} @${FixtureIds.streetLabelStatement};\n` +
          `changeFigure {op:"show",objectId:"${FixtureIds.choice}",assetId:"${FixtureAsset.id}"} @${FixtureIds.statements[1]};`,
      }),
      ...createTemplateDocuments(template).map(item => view(item.documentId, item.format, item.files)),
    ];
    const querySemantic = vi.fn(async (query: SemanticQuery) => ({ ok: true as const, value: {
      requestId: query.requestId, versions: query.expected, items: [], total: 0, offset: query.offset, coverage: [],
    }, warnings: [] }));
    const compile = vi.fn(async (_input: CompileInput) => ({ ok: true as const,
      value: { snapshot: null, lastValid: null, current: true, issues: [] }, warnings: [] }));
    const bridge = { documents: { list: async () => ({ ok: true as const, value: documents, warnings: [] }) },
      plugins: { resolve: async () => ({ ok: true as const, value: { handleId: crypto.randomUUID(), packages: [] }, warnings: [] }),
        release: async () => ({ ok: true as const, value: undefined, warnings: [] }) },
      language: { compile, querySemantic } } as unknown as StudioBridge;
    const service = createAuthoringServices(bridge);
    const result = await service.searchSemantic!({ kind: 'dialogue', speaker: { kind: 'narrator' } }, 0, [FixtureIds.street]);
    expect(result.ok).toBe(true);
    const authoring = await service.read();
    expect(authoring.ok && authoring.value.references?.some(item => item.kind === 'statement' && item.id === FixtureIds.statements[0])).toBe(true);
    expect(authoring.ok && authoring.value.references?.some(item => item.kind === 'page')).toBe(true);
    expect(authoring.ok && authoring.value.references?.some(item => item.kind === 'label' && item.id === FixtureIds.streetLabel)).toBe(true);
    expect(authoring.ok && authoring.value.references?.some(item => item.kind === 'object' && item.id === FixtureIds.choice)).toBe(true);
    const query = querySemantic.mock.calls[0]![0];
    expect(query.sceneIds).toEqual([FixtureIds.street]);
    expect(query.expectedLock).toEqual(semanticLock);
    expect(new Set(query.expected.map(item => item.ref.id))).toEqual(new Set(documents.map(item => item.documentId)));
    expect(compile.mock.calls[0]![0].assetReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: FixtureAsset.id, owner: { kind: 'document', id: FixtureIds.projectA },
        source: { documentId: FixtureIds.projectA, revision: 1, field: '/data/display/icon' } }),
      expect.objectContaining({ assetId: FixtureAsset.id, source: { documentId: FixtureIds.projectA, revision: 1,
        field: '/data/dynamicAssets/0' } }),
      expect.objectContaining({ assetId: FixtureAsset.id, owner: { kind: 'document', id: characterDocumentId },
        source: { documentId: characterDocumentId, revision: 1, field: '/data/avatar' } }),
      expect.objectContaining({ assetId: FixtureAsset.id, usage: expect.stringContaining('background.imageId') }),
    ]));
  });
});
