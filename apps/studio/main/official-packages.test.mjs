import { afterEach, expect, it } from 'vitest';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureLock, FixtureProject, FixtureScenes, FixtureTemplate, FixtureVariables } from '@galcraft/contracts/fixtures';
import { compile } from '@galcraft/dsl';
import { PluginHost, acquirePluginDefinition, preparePluginModuleGraph } from '@galcraft/plugins';
import { checkPluginImplementations } from '@galcraft/plugins/development';
import { StudioPluginPackages } from './plugin-packages.mjs';
import { readBundledPlugins, installBundledPlugins } from './bundled-plugins.mjs';

const root = resolve('../../tmp/testing/n1-packages');
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const unwrap = result => { if (!result.ok) throw new Error(JSON.stringify(result.issues)); return result.value; };
const context = (pluginId, target) => ({ pluginId, target, domain: { projectId: 'ProjAA', kind: 'sample', instance: 'n1' },
  config: { schemaVersion: 1, documents: [{ contribution: `${pluginId}/config`, documentId: 'ConfigA', revision: 1, purpose: 'characters',
    data: { characters: [{ characterId: 'CharAA', min: 0, max: 100, initial: 20, visible: true, label: '角色' }] } }] },
  documents: { read: () => { throw new Error('unused'); }, propose: () => { throw new Error('unused'); } },
  assets: { resolve: async () => { throw new Error('unused'); } }, pages: { open: async () => { throw new Error('unused'); } }, log: () => {} });

it('inspects, packs and installs every catalog version through the ordinary package store', async () => {
  const packages = new StudioPluginPackages(join(root, 'store'), {});
  const catalog = await readBundledPlugins(resolve('../../plugins'));
  await installBundledPlugins(packages, catalog);
  const listed = unwrap(await packages.list(null));
  expect(listed.entries.map(item => `${item.manifest.id}@${item.manifest.version}`).sort()).toEqual([
    'org.galcraft.ai-epilogue@0.1.0', 'org.galcraft.android@0.1.0', 'org.galcraft.ios@0.1.0',
    'org.galcraft.animation-generation@0.1.0','org.galcraft.comfyui@0.1.0','org.galcraft.generation-services@0.1.0','org.galcraft.novelai@0.1.0',
    'org.galcraft.live2d@0.1.0', 'org.galcraft.motion-canvas@0.1.0', 'org.galcraft.music-composition@0.1.0',
    'org.galcraft.steam@0.1.0', 'org.galcraft.voice-comfy@0.1.0', 'org.galcraft.voicestudio@0.1.0',
  ].sort());
  const host = new PluginHost(join(root, 'archives'), context);
  try {
    for (const [id, versions] of Object.entries(catalog)) for (const [version, directory] of Object.entries(versions)) {
      const manifest = unwrap(await packages.inspectPackage({ kind: 'directory', path: directory })).manifest;
      expect(await checkPluginImplementations(directory, manifest), `${id}@${version}`).toEqual([]);
      const packed = unwrap(await host.packPlugin({ directory, outputDirectory: join(root, 'packed') }));
      unwrap(await host.install({ kind: 'archive', path: packed.path }));
      const installed = unwrap(await host.store.inspectDirectory(join(root, 'archives', id, version)));
      expect(installed).toEqual(manifest);
      const lease = await acquirePluginDefinition(directory, manifest);
      try {
        if (id === 'org.galcraft.ai-epilogue') {
          expect(lease.definition.documents[0].initial).toEqual({ entries: [] });
          expect(manifest.entry.runtime).toBeNull();
        }
      } finally { await lease.release(); }
    }
  } finally { await host.dispose(); }
}, 30000);

it('loads the exact current affection and an equivalent renamed package, with no missing-version fallback', async () => {
  const registered = [], released = [];
  const resources = { register: input => { registered.push(input); return { uri: `file://${input.path.replaceAll('\\', '/')}`,
    release: () => released.push(input.relative) }; } };
  const packages = new StudioPluginPackages(join(root, 'store'), resources);
  const renamed = join(root, 'renamed');
  await cp(resolve('../../plugins/official-affection/package'), renamed, { recursive: true });
  const renamedId = 'org.example.relationship';
  const renamedManifest = JSON.parse((await readFile(join(renamed, 'manifest.json'), 'utf8')).replaceAll('org.galcraft.affection', renamedId));
  for (const file of renamedManifest.files) if (file.path.endsWith('.js')) {
    const source = (await readFile(join(renamed, file.path), 'utf8')).replaceAll('org.galcraft.affection', renamedId);
    await writeFile(join(renamed, file.path), source); file.size = Buffer.byteLength(source);
  }
  await writeFile(join(renamed, 'manifest.json'), JSON.stringify(renamedManifest));
  for (const directory of [resolve('../../plugins/official-affection/package'), renamed])
    unwrap(await packages.install({ kind: 'directory', path: directory }));
  const host = new PluginHost(join(root, 'store'), context);
  try {
    for (const [id, version] of [['org.galcraft.affection', '0.1.0'], [renamedId, '0.1.0']]) {
      const lock = { ...FixtureLock, plugins: [{ kind: 'plugin', id, version, targets: ['web', 'windows'], required: true }] };
      const exact = unwrap(await packages.exactDirectory(id, version));
      const graph = await preparePluginModuleGraph(exact.directory, exact.manifest);
      try {
        const runtime = await graph.importEntry(exact.manifest.entry.runtime);
        expect(runtime.pluginMetadata).toMatchObject({ id, version });
        const compiled = compile({ projectId: FixtureProject.projectId, engineVersion: '0.1.0', project: FixtureProject, lock,
          documents: [{ documentId: 'DocAAA', revision: 1, kind: 'scene', sceneId: FixtureIds.street,
            text: `${id}/add {characterId:"${FixtureCharacters[0].id}",amount:5} @StmtAA;` }],
          scenes: [FixtureScenes[0]], characters: FixtureCharacters, variables: FixtureVariables, assets: [FixtureAsset],
          gallery: [], flows: [], template: FixtureTemplate, pluginCommands: runtime.createDefinition().commands, cancelOperationId: 'Cancel' });
        expect(compiled.issues.filter(issue => issue.severity === 'error')).toEqual([]);
        expect(compiled.snapshot).not.toBeNull();
      }
      finally { await graph.release(); }
      const definitions = unwrap(await packages.acquireDefinitions({ documents: new Map([['lock', { files: { 'dependencies.lock.json': JSON.stringify({ data: lock }) } }]]) }));
      try { expect(definitions.documents[0].key).toBe(`${id}/config`); }
      finally { await definitions.release(); }
      const resolved = unwrap(await packages.resolve(lock));
      expect(resolved.packages[0].manifest).toMatchObject({ id, version });
      await packages.release(resolved.handleId); await packages.release(resolved.handleId);
      const offered = unwrap(await host.prepareContributions(lock, 'web'));
      const progress = offered.systems[0].initialProgress({});
      const step = unwrap(await offered.commands.find(command => command.spec.key === `${id}/add`).execute({ args: { characterId: 'CharAA', amount: 5 }, state: progress,
        token: { sessionId: 'SessAA', statementId: 'StmtAA', occurrence: 1 } }));
      expect(step.progress).toEqual({ values: { CharAA: 25 } });
      expect(offered.pages[0].key).toBe(`${id}/relations`);
    }
    const missingLock = { ...FixtureLock, plugins: [{ kind: 'plugin', id: 'org.galcraft.affection', version: '9.0.0', targets: ['web'], required: true }] };
    expect((await packages.resolve(missingLock)).ok).toBe(false);
    expect((await host.prepareContributions(missingLock, 'web')).ok).toBe(false);
    expect((await packages.resolve({ ...missingLock, plugins: [{ ...missingLock.plugins[0], required: false }] })).value.packages).toEqual([]);
    expect(released).toHaveLength(registered.length);
  } finally { await host.dispose(); }
}, 30000);
