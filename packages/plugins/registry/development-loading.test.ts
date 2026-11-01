import { afterEach, expect, it } from 'vitest';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FixtureLock } from '@galcraft/contracts/fixtures';
import type { PluginContext } from '../contracts/sdk.js';
import type { Issue } from '@galcraft/contracts';
import { PluginHost, loadPluginDefinition, acquirePluginDefinition } from './host.js';
import { PluginManifestSchema } from '../contracts/manifest.js';

const root = resolve('../../tmp/testing/plugin-development/loading');
afterEach(async () => { await rm(root, { recursive: true, force: true }); delete (globalThis as unknown as { __pluginReleased?: number }).__pluginReleased; });
async function packageAt(name: string, sources: Record<string, string>, overrides: Record<string, unknown> = {}) {
  const directory = join(root, name); await mkdir(directory, { recursive: true });
  for (const [file, content] of Object.entries(sources)) { await mkdir(join(directory, file, '..'), { recursive: true }); await writeFile(join(directory, file), content); }
  const manifest = PluginManifestSchema.parse({ schemaVersion: 2, id: 'org.example.loading', name: 'Loading', version: '0.1.0', description: '', author: 'Example', license: 'UNLICENSED', homepage: null,
    engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [], entry: { definition: 'definition.js', runtime: 'runtime.js', editor: null },
    files: Object.entries(sources).map(([path, content]) => ({ path, size: Buffer.byteLength(content) })), contributions: [{ kind: 'condition', key: 'org.example.loading/value', targets: ['web', 'windows'], required: true }],
    stateVersions: { document: 0, progress: 0, longTerm: 0 }, native: [], ...overrides });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest)); return { directory, manifest };
}
const context = (): PluginContext => ({ pluginId: 'org.example.loading', target: 'web', domain: { kind: 'sample', projectId: '10000000-0000-4000-8000-000000000001', instance: 'test' },
  documents: { read: () => { throw new Error('unused'); }, propose: () => { throw new Error('unused'); } }, assets: { resolve: async () => { throw new Error('unused'); } }, pages: { open: async () => { throw new Error('unused'); } }, log: () => {} });
it('reuses unchanged module identities across sequential and overlapping definition leases', async () => {
  const { directory, manifest } = await packageAt('repeated', { 'definition.js': 'export const definition={documents:[]};', 'runtime.js': 'export const unused=true;' });
  const [first, overlapping] = await Promise.all([acquirePluginDefinition(directory, manifest), acquirePluginDefinition(directory, manifest)]);
  expect(overlapping.definition).toBe(first.definition);
  await first.release();
  expect((await readdir(join(directory, '..', '.galcraft-load'))).length).toBe(1);
  await overlapping.release();
  for (let round = 0; round < 12; round++) {
    const next = await acquirePluginDefinition(directory, manifest);
    expect(next.definition).toBe(first.definition);
    await next.release();
  }
  expect(await readdir(join(directory, '..', '.galcraft-load'))).toEqual([]);
});
it('reloads an imported module with the full emitted graph and releases retired snapshots', async () => {
  const sources = { 'definition.js': 'export const definition={documents:[]};', 'value.js': 'export const value=true;',
    'runtime.js': `import {value} from './value.js'; export const createPlugin=()=>({activate:async()=>({conditions:[{key:'org.example.loading/value',fields:[],evaluate:()=>({ok:true,value,warnings:[]})}]}),deactivate:async()=>{}});` };
  const { directory, manifest } = await packageAt('graph', sources);
  const host = new PluginHost(join(root, 'store'), context), lock = { ...FixtureLock, plugins: [{ ...FixtureLock.plugins[0]!, id: manifest.id }] };
  expect((await host.install({ kind: 'directory', path: directory })).ok).toBe(true);
  const first = await host.prepareContributions(lock, 'web'); if (!first.ok) throw first.error;
  expect(first.value.conditions[0]!.evaluate(null, null, null)).toMatchObject({ value: true });
  await host.loadDevelopment({ directory, projectId: context().domain.projectId });
  sources['value.js'] = 'export const value=false;'; await writeFile(join(directory, 'value.js'), sources['value.js']);
  manifest.files.find(file => file.path === 'value.js')!.size = Buffer.byteLength(sources['value.js']); await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  const second = await host.reload({ pluginId: manifest.id, projectId: context().domain.projectId }); if (!second.ok) throw second.error;
  expect(second.value.conditions[0]!.evaluate(null, null, null)).toMatchObject({ value: false });
  expect(first.value.conditions[0]!.evaluate(null, null, null)).toMatchObject({ value: true });
  await host.releaseContributions(first.value); await host.releaseContributions(second.value);
  expect(host.activeContributions()).toBe(null); await host.dispose();
  expect(await readdir(join(directory, '..', '.galcraft-load'))).toEqual([]);
});
it('loads definitions without evaluating a DOM runtime and acquires exact service leases', async () => {
  const { directory, manifest } = await packageAt('definition', { 'definition.js': 'export const definition={documents:[]};',
    'runtime.js': 'throw new Error("runtime must not start");',
    'services.js': `export const createPlugin=()=>({activate:async context=>{context.onDispose(()=>{globalThis.__pluginReleased=(globalThis.__pluginReleased??0)+1});context.onDispose(()=>{throw new Error('cleanup failed')});return {publishChecks:[{key:'org.example.loading/check',check:async()=>[]}]};},deactivate:async()=>{}});` },
    { entry: { definition: 'definition.js', runtime: 'runtime.js', editor: null, services: 'services.js' }, contributions: [{ kind: 'publishCheck', key: 'org.example.loading/check', targets: ['web', 'windows'], required: true }] });
  expect(await loadPluginDefinition(directory, manifest)).toEqual({ documents: [] });
  const messages: Issue[] = [];
  const host = new PluginHost(join(root, 'services-store'), () => ({ ...context(), log: issue => messages.push(issue) }));
  expect((await host.install({ kind: 'directory', path: directory })).ok).toBe(true);
  const lease = await host.acquireServices({ pluginId: manifest.id, version: '0.1.0', target: 'web' }); if (!lease.ok) throw lease.error;
  expect(lease.value.contributions.publishChecks?.[0]?.key).toBe('org.example.loading/check');
  expect((await host.acquireServices({ pluginId: manifest.id, version: '2.0.0', target: 'web' })).ok).toBe(false);
  await lease.value.release(); await lease.value.release();
  expect((globalThis as unknown as { __pluginReleased: number }).__pluginReleased).toBe(1);
  expect(messages).toMatchObject([{ code: 'PLUGIN_DISPOSE', severity: 'warning' }]);
  await host.dispose();
});
it('rejects missing graph dependencies and multiple system state declarations', async () => {
  const { directory, manifest } = await packageAt('missing', { 'definition.js': 'export const definition={};', 'runtime.js': "import './unlisted.js';" });
  const host = new PluginHost(join(root, 'check-store'), context);
  const result = await host.inspectPackage({ kind: 'directory', path: directory });
  expect(!result.ok && result.error.code).toBe('PLUGIN_DEPENDENCY_GRAPH');
  const system = { kind: 'system', key: 'org.example.loading/first', targets: ['web'], required: true };
  expect(PluginManifestSchema.safeParse({ ...manifest, contributions: [system, { ...system, key: 'org.example.loading/second' }] }).success).toBe(false);
});

it('keeps the installed locked version when a development directory selects another exact version', async () => {
  const source = (value: boolean) => ({ 'definition.js': 'export const definition={};',
    'runtime.js': `export const createPlugin=()=>({activate:async()=>({conditions:[{key:'org.example.loading/value',fields:[],evaluate:()=>({ok:true,value:${value},warnings:[]})}]}),deactivate:async()=>{}});` });
  const installed = await packageAt('locked', source(true));
  const development = await packageAt('new-version', source(false), { version: '2.0.0' });
  const host = new PluginHost(join(root, 'exact-store'), context);
  try {
    expect((await host.install({ kind: 'directory', path: installed.directory })).ok).toBe(true);
    expect((await host.loadDevelopment({ directory: development.directory, projectId: context().domain.projectId })).ok).toBe(true);
    const lock = { ...FixtureLock, plugins: [{ ...FixtureLock.plugins[0]!, id: installed.manifest.id }] };
    const offered = await host.prepareContributions(lock, 'web'); if (!offered.ok) throw offered.error;
    expect(offered.value.conditions[0]!.evaluate(null, null, null)).toMatchObject({ value: true });
  } finally { await host.dispose(); }
});
