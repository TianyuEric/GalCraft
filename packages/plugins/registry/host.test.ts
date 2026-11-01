import { afterEach, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { FixtureLock } from '@galcraft/contracts/fixtures';
import type { PluginContext } from '../contracts/sdk.js';
import { PluginHost } from './host.js';
const root = resolve('../../tmp/testing/plugins-p');
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
it('prepares a Studio-only package without evaluating its UI editor in the runtime host', async () => {
  const source = join(root, 'studio-only'); await mkdir(source, { recursive: true });
  const js = 'throw new Error("UI editor must stay in Studio"); export function createStudioPlugin() {}';
  await writeFile(join(source, 'editor.js'), js);
  const manifest = { schemaVersion: 1, id: 'org.example.studio', name: 'Studio', version: '0.1.0', description: '', author: 'Example',
    license: 'MIT', homepage: null, engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [],
    entry: { runtime: null, editor: 'editor.js' }, files: [{ path: 'editor.js', size: Buffer.byteLength(js) }], contributions: [],
    studio: [{ key: 'org.example.studio/workbench', kind: 'workbench', slot: 'extensions.navigation' }],
    stateVersions: { progress: 0, longTerm: 0, document: 0 }, native: [] };
  await writeFile(join(source,'manifest.json'),JSON.stringify(manifest));
  const host = new PluginHost(join(root,'studio-store'),() => ({}) as PluginContext);
  expect((await host.install({kind:'directory',path:source})).ok).toBe(true);
  const lock = {...FixtureLock,plugins:[{...FixtureLock.plugins[0]!,id:manifest.id}]};
  const result = await host.prepareContributions(lock,'web');
  expect(result.ok).toBe(true); if (result.ok) expect(Object.values(result.value).every(collection => collection.length === 0)).toBe(true);
  await host.dispose();
});
it('packs an ESM plugin, installs its archive, reopens exact versions and preserves active contributions on failed reload', async () => {
  const source = join(root, 'source'); await mkdir(join(source, 'runtime'), { recursive: true });
  const js = `export function createPlugin(){return {activate:async()=>({commands:[],conditions:[],documents:[],tools:[],resources:[],stages:[],pages:[],components:[],systems:[],platform:[]}),deactivate:async()=>{}}}`;
  await writeFile(join(source, 'runtime/index.js'), js);
  await writeFile(join(source, 'package.json'), '{"type":"module"}');
  const manifest = { schemaVersion: 1, id: 'org.galcraft.empty', name: 'Example', version: '0.1.0', description: '', author: 'GalCraft',
    license: 'MIT', homepage: null, engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [],
    entry: { runtime: 'runtime/index.js', editor: null }, files: [{ path: 'runtime/index.js', size: Buffer.byteLength(js) },
      { path: 'package.json', size: 17 }], contributions: [], stateVersions: { progress: 1, longTerm: 1, document: 1 }, native: [] };
  await writeFile(join(source, 'manifest.json'), JSON.stringify(manifest));
  const store = join(root, 'store'), context = () => ({}) as PluginContext;
  const host = new PluginHost(store, context);
  const packed = await host.packPlugin({ directory: source, outputDirectory: join(root, 'output') });
  expect(packed.ok).toBe(true); if (!packed.ok) throw packed.error;
  expect((await host.install({ kind: 'archive', path: packed.value.path })).ok).toBe(true);
  const reopened = new PluginHost(store, context);
  const lock = { ...FixtureLock, plugins: [{ ...FixtureLock.plugins[0]!, id: manifest.id }] };
  expect((await reopened.prepareContributions(lock, 'web')).ok).toBe(true);
  const previous = reopened.activeContributions();
  expect((await reopened.loadDevelopment({ directory: source, projectId: crypto.randomUUID() })).ok).toBe(true);
  await writeFile(join(source, 'runtime/index.js'), 'broken');
  expect((await reopened.reload({ pluginId: manifest.id, projectId: crypto.randomUUID() })).ok).toBe(false);
  expect(reopened.activeContributions()).toBe(previous);
  await reopened.dispose();
});
it('installs the built official affection archive and loads its command and relation page on both targets', async () => {
  await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: resolve('../../plugins/official-affection') });
  const characterId = '10000000-0000-4000-8000-000000000001';
  const config = { characters: [{ characterId, min: 0, max: 100, initial: 20, visible: true, label: '春' }] };
  const unavailable = (): never => { throw new Error('This plugin must not access host storage during activation'); };
  const context = (): PluginContext => ({ config, pluginId: 'org.galcraft.affection', target: 'web',
    domain: { kind: 'playtest', projectId: characterId, instance: characterId },
    documents: { read: unavailable, propose: unavailable }, assets: { resolve: unavailable }, pages: { open: unavailable }, log: () => {} });
  const host = new PluginHost(join(root, 'official'), context);
  const packed = await host.packPlugin({ directory: resolve('../../plugins/official-affection/package'), outputDirectory: join(root, 'output') });
  if (!packed.ok) throw packed.error;
  expect((await host.install({ kind: 'archive', path: packed.value.path })).ok).toBe(true);
  for (const target of ['web', 'windows'] as const) {
    const lock = { ...FixtureLock, plugins: [{ ...FixtureLock.plugins[0]!, version: packed.value.manifest.version }] };
    const prepared = await host.prepareContributions(lock, target); if (!prepared.ok) throw prepared.error;
    const system = prepared.value.systems[0]!;
    const result = await prepared.value.commands[0]!.execute({ args: { characterId, amount: 15 }, state: system.initialProgress(config),
      token: { sessionId: crypto.randomUUID(), statementId: crypto.randomUUID(), occurrence: 1 } });
    expect(result.ok && result.value.progress).toEqual({ values: { [characterId]: 35 } });
    expect(prepared.value.pages[0]?.key).toBe('org.galcraft.affection/relations');
  }
  await host.dispose();
}, 30_000);
