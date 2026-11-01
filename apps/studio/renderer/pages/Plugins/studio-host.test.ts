import { describe, expect, it, vi } from 'vitest';
import type { DocumentView, Lock, Result, StudioBridge } from '@galcraft/contracts';
import type { PluginManifest, StudioScope } from '@galcraft/plugins/contracts';
import { StudioPluginHost } from './studio-host.js';
import { createDefinition, pluginMetadata as affection } from '@galcraft/official-affection';
import { readFileSync } from 'node:fs';

const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const uri = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const pluginId = 'org.example.author';
const lock: Lock = { engine: { kind: 'engine', id: 'core', version: '0.1.0', targets: ['web', 'windows'], required: true }, template: { kind: 'template', id: 'default', version: '0.1.0', targets: ['web', 'windows'], required: true }, plugins: [{ kind: 'plugin', id: pluginId, version: '0.1.0', targets: ['web', 'windows'], required: true }], selectedProviders: {} };
const manifest: PluginManifest = { schemaVersion: 2, id: pluginId, name: 'Author tool', version: '0.1.0', description: '', author: 'Example', license: 'MIT', homepage: null, engineRange: '*', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [], entry: { runtime: null, editor: 'editor.js', definition: 'definition.js' }, files: [{ path: 'editor.js', size: 1 }, { path: 'definition.js', size: 1 }], contributions: [{ kind: 'tool', key: `${pluginId}/inspect`, targets: ['web', 'windows'], required: true }], stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] };
const source = `export function createPlugin() { return { deactivate: async () => {}, activate: async () => ({ commands:[],conditions:[],documents:[],resources:[],stages:[],pages:[],components:[],systems:[],platform:[],tools:[{key:'${pluginId}/inspect',titleKey:'${pluginId}/inspectTitle',inputFields:[],locations:['tools.list','commands.palette'],scope:{pages:['creation'],selection:'statements'},run:async(input,context)=>({ok:true,value:{kind:'report',issues:[],message:context.scope.statementIds.join(',')},warnings:[]})}] }) }; }`;
function fixture(pluginSource = source, pluginManifest = manifest) {
  let sceneRevision = 1, failReload = false, handle = 0;
  const release = vi.fn(async () => ok(undefined));
  const documents = (): DocumentView[] => [{ documentId: 'LockAA', revision: 1, savedRevision: 1, dirty: false, format: 'json', savedFiles: {}, files: { 'dependencies.lock.json': JSON.stringify({ data: lock }) } }, { documentId: 'SceneA', revision: sceneRevision, savedRevision: 1, dirty: sceneRevision > 1, format: 'dsl', savedFiles: {}, files: { 'scenes/SceneA/script.gal': 'say {} @LineAA;' } }];
  const bridge = { documents: { list: async () => ok(documents()) }, plugins: { release, resolve: async () => ok({ handleId: `Handle${++handle}`, packages: [{ manifest: pluginManifest, runtimeUrl: null, editorUrl: pluginManifest.entry.editor ? uri(failReload ? 'export function createPlugin(){throw new Error("Build failed")}' : pluginSource) : null, definitionUrl: uri(`export const definition={messages:{'zh-CN':{'${pluginId}/inspectTitle':'检查所选台词'}}}`) }] }) } } as unknown as Pick<StudioBridge, 'documents' | 'plugins'>;
  const scope: StudioScope = { page: 'creation', sceneId: 'SceneA', documentId: 'SceneA', statementIds: ['LineAA'], textRange: null, assetIds: [], insertion: null, versions: [{ ref: { kind: 'document', id: 'SceneA' }, revision: 1 }] };
  const host = new StudioPluginHost(bridge, 'ProjAA', () => 'zh-CN', async () => {}, async () => {}, { scope: () => scope, navigate: async () => ok(undefined), locate: async () => ok(undefined) });
  return { host, release, scope, change: () => sceneRevision++, failReload: () => { failReload = true; } };
}
describe('Studio author contribution consumer', () => {
  it.each([true, false])('loads a service tool without requiring an editor implementation (editor entry: %s)', async editor => {
    const serviceManifest: PluginManifest = { ...manifest, externalTools: [`${pluginId}/inspect`],
      entry: { ...manifest.entry, editor: editor ? 'editor.js' : null, services: 'services.js' },
      files: [...manifest.files, { path: 'services.js', size: 1 }] };
    const { host } = fixture(source.replace(/tools:\[\{.*\}\]/, 'tools:[]'), serviceManifest);
    try {
      expect(await host.load()).toMatchObject({ ok: true });
      expect(host.tools('tools.list')).toEqual([]);
      expect(host.inspect(pluginId).manifest?.externalTools).toEqual(serviceManifest.externalTools);
    } finally { await host.dispose(); }
  });
  it('still requires the declared editor tool implementation', async () => {
    const { host } = fixture(source.replace(/tools:\[\{.*\}\]/, 'tools:[]'));
    try { expect(await host.load()).toMatchObject({ ok: false }); expect(host.loadError).toContain(`${pluginId}/inspect`); }
    finally { await host.dispose(); }
  });
  it('loads the locked official definition into the same document, command, condition and component catalogs', async () => {
    const release = vi.fn(async () => ok(undefined));
    let selected: Lock = { ...lock, plugins: [
      { kind: 'plugin', id: affection.id, version: affection.version, targets: ['web', 'windows'], required: true },
    ] };
    let handle = 0;
    const bridge = { documents: { list: async () => ok([{ documentId: 'LockAA', revision: 1, savedRevision: 1, dirty: false, format: 'json', savedFiles: {}, files: { 'dependencies.lock.json': JSON.stringify({ data: selected }) } }]) },
      plugins: { release, resolve: async () => ok({ handleId: `Official${++handle}`, packages: selected.plugins.some(item => item.id === affection.id && item.version === affection.version) ? [{
        manifest: JSON.parse(readFileSync(new URL('../../../../../plugins/official-affection/package/manifest.json', import.meta.url), 'utf8')),
        runtimeUrl: null, editorUrl: null, definitionUrl: uri(readFileSync(new URL('../../../../../plugins/official-affection/package/definition/index.js', import.meta.url), 'utf8')),
      }] : [] }) } } as unknown as Pick<StudioBridge, 'documents' | 'plugins'>;
    let displayLocale = 'zh-CN';
    const host = new StudioPluginHost(bridge, 'ProjAA', () => displayLocale, async () => {}, async () => {});
    expect((await host.load()).ok).toBe(true);
    const definition = createDefinition();
    expect(host.inspect(affection.id).definedKeys).toEqual(expect.arrayContaining([
      ...definition.commands!.map(item => item.key), ...definition.conditions!.map(item => item.key),
    ]));
    expect(JSON.parse(JSON.stringify(host.documentTypes().map(item => item.definition)))).toEqual(JSON.parse(JSON.stringify(definition.documents)));
    expect(host.documentTypes()[0]!.definition.validate!({ characters: [] }).ok).toBe(true);
    expect(host.commandSpecs()[0]!.name).toBe('增减好感度');
    expect(host.conditionMetadata()[0]!.fields[0]!.label).toBe('角色');
    displayLocale = 'en';
    expect(host.commandSpecs()).toEqual(definition.commands);
    expect(host.conditionMetadata()).toEqual(definition.conditions);
    displayLocale = 'ja';
    expect(host.commandSpecs()[0]!.name).toBe('好感度を増減');
    expect(host.conditionMetadata()[0]!.fields[0]!.label).toBe('キャラクター');
    expect(host.componentDefinitions()).toEqual(definition.components);
    expect(host.inspect(affection.id).manifest?.version).toBe(affection.version);
    expect(host.documentTypes().every(item => item.pluginId === affection.id)).toBe(true);
    selected = { ...selected, plugins: [{ ...selected.plugins[0]!, version: '9.0.0' }] };
    expect((await host.load()).ok).toBe(false);
    expect(host.loadError).toContain('org.galcraft.affection@9.0.0');
    expect(host.documentTypes()).toHaveLength(1);
    expect(release).toHaveBeenCalledWith('Official2');
    expect(release).not.toHaveBeenCalledWith('Official1');
    selected = { ...selected, plugins: [] };
    expect((await host.load()).ok).toBe(true);
    expect(host.documentTypes()).toHaveLength(0);
    expect(release).toHaveBeenCalledWith('Official1');
    await host.dispose();
    expect(release).toHaveBeenCalledWith('Official3');
  });
  it('loads public tools, language names and selection requirements from the editor entry', async () => {
    const { host, scope } = fixture(); expect((await host.load()).ok).toBe(true);
    expect(host.tools('tools.list')[0]).toMatchObject({ title: '检查所选台词', available: true });
    expect(host.tools('context.menu')).toHaveLength(0);
    const captured = host.scope(); scope.statementIds = ['LineBB'];
    const result = await host.authorServices.run(host.tools('commands.palette')[0]!, {}, captured, new AbortController().signal);
    expect(result).toMatchObject({ ok: true, value: { kind: 'report', message: 'LineAA' } });
    scope.statementIds = []; expect(host.tools('tools.list')[0]).toMatchObject({ available: false, reason: '请先选择语句' });
    await host.dispose();
  });
  it('rejects a run after its captured document revision changes', async () => {
    const { host, change } = fixture(); await host.load(); const scope = host.scope(); change();
    const result = await host.authorServices.run(host.tools('tools.list')[0]!, {}, scope, new AbortController().signal);
    expect(result.ok).toBe(false); if (!result.ok) expect(result.error.message).toContain('已有结果仍可审阅');
    await host.dispose();
  });
  it('keeps the effective implementation and package lease after a reload fails', async () => {
    const { host, failReload, release } = fixture(); await host.load(); failReload();
    expect((await host.load()).ok).toBe(false); expect(host.tools('tools.list')).toHaveLength(1);
    expect(release).toHaveBeenCalledWith('Handle2'); expect(release).not.toHaveBeenCalledWith('Handle1');
    expect(host.loadError).toContain('Build failed'); await host.dispose(); expect(release).toHaveBeenCalledWith('Handle1');
  });
  it('retires a replacement and releases its lease when disposed during the previous lease release', async () => {
    const trackedSource = source.replace('export function createPlugin() { return { deactivate: async () => {},', 'let next = 0; export const retired = []; export function createPlugin() { const id = ++next; return { deactivate: async () => { retired.push(id); },');
    const tracked = await import(/* @vite-ignore */ uri(trackedSource)) as { retired: number[] };
    const { host, release } = fixture(trackedSource);
    expect((await host.load()).ok).toBe(true);
    let resume!: () => void, releasing!: () => void;
    const paused = new Promise<void>(resolve => { resume = resolve; });
    const started = new Promise<void>(resolve => { releasing = resolve; });
    release.mockImplementation(async (...args: unknown[]) => {
      if (args[0] === 'Handle1') { releasing(); await paused; }
      return ok(undefined);
    });
    const replacement = host.load();
    try {
      await started;
      await host.dispose();
      expect(host.tools('tools.list')).toEqual([]);
      expect(host.inspect(pluginId).manifest).toBeNull();
    } finally { resume(); }
    expect((await replacement).ok).toBe(false);
    expect(host.tools('tools.list')).toEqual([]);
    expect(host.inspect(pluginId).manifest).toBeNull();
    expect(tracked.retired).toEqual([1, 2]);
    expect(release.mock.calls).toEqual([['Handle1'], ['Handle2']]);
    await host.dispose();
    expect(release).toHaveBeenCalledTimes(2);
  });
});
