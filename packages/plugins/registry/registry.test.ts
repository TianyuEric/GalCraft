import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { FixtureLock } from '@galcraft/contracts/fixtures';
import type { Lock } from '@galcraft/contracts';
import { PluginManifestSchema } from '../contracts/manifest.js';
import type { PluginManifest } from '../contracts/manifest.js';
import { ContributionRegistry } from './index.js';
import { PluginPackageStore } from './package-store.js';

const packageTestRoot = resolve(process.cwd(), '../../tmp/testing/plugins-x');
afterEach(async () => { await rm(packageTestRoot, { recursive: true, force: true }); });

function manifest(id: string, version = '0.1.0', overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    schemaVersion: 1, id, name: id, version, description: '', author: 'GalCraft', license: 'MIT', homepage: null,
    engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [],
    entry: { runtime: 'runtime/index.js', editor: null }, files: [{ path: 'runtime/index.js', size: 1 }],
    contributions: [{ kind: 'command', key: `${id}/add`, targets: ['web', 'windows'], required: true }],
    stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [], ...overrides,
  };
}
function lock(...plugins: { id: string; version: string; required?: boolean }[]): Lock {
  return { ...FixtureLock, plugins: plugins.map(plugin => ({
    kind: 'plugin', id: plugin.id, version: plugin.version, required: plugin.required ?? true, targets: ['web', 'windows'],
  })) };
}
function installed(registry: ContributionRegistry, ...manifests: PluginManifest[]): void {
  for (const item of manifests) expect(registry.registerInstalled(item).ok).toBe(true);
}

describe('X plugin declaration registry', () => {
  it('keeps installation separate from project Lock and resolves exact versions independently', () => {
    const registry = new ContributionRegistry();
    installed(registry, manifest('org.galcraft.affection'), manifest('org.galcraft.affection', '2.0.0'));
    expect(FixtureLock.plugins[0]?.version).toBe('0.1.0');
    expect(registry.activeContributions()).toBeNull();
    const a = registry.prepareContributions(lock({ id: 'org.galcraft.affection', version: '0.1.0' }), 'web');
    const b = registry.prepareContributions(lock({ id: 'org.galcraft.affection', version: '2.0.0' }), 'windows');
    expect(a.ok && a.value.byKey['org.galcraft.affection/add']?.provider.version).toBe('0.1.0');
    expect(b.ok && b.value.byKey['org.galcraft.affection/add']?.provider.version).toBe('2.0.0');
    expect(registry.activeContributions()).toBeNull();
  });

  it('loads exact dependency versions first and reports missing or incompatible dependencies', () => {
    const registry = new ContributionRegistry();
    installed(registry,
      manifest('org.galcraft.base', '2.1.0'),
      manifest('org.galcraft.feature', '0.1.0', { dependencies: [{ id: 'org.galcraft.base', range: '^2.0.0' }] }),
    );
    const valid = registry.prepareContributions(lock(
      { id: 'org.galcraft.feature', version: '0.1.0' }, { id: 'org.galcraft.base', version: '2.1.0' },
    ), 'web');
    expect(valid.ok && valid.value.loadOrder.map(item => item.id)).toEqual(['org.galcraft.base', 'org.galcraft.feature']);
    const absent = registry.prepareContributions(lock({ id: 'org.galcraft.feature', version: '0.1.0' }), 'web');
    expect(!absent.ok && absent.error.message).toContain('org.galcraft.base');
    installed(registry, manifest('org.galcraft.base', '3.0.0'));
    const wrongVersion = registry.prepareContributions(lock(
      { id: 'org.galcraft.feature', version: '0.1.0' }, { id: 'org.galcraft.base', version: '3.0.0' },
    ), 'web');
    expect(!wrongVersion.ok && wrongVersion.error.message).toContain('^2.0.0');
  });

  it('does not select prerelease versions through stable ranges, but accepts an explicit prerelease range', () => {
    const registry = new ContributionRegistry();
    installed(registry,
      manifest('org.galcraft.base', '2.1.0-beta.2'),
      manifest('org.galcraft.feature', '0.1.0', { dependencies: [{ id: 'org.galcraft.base', range: '^2.0.0' }] }),
      manifest('org.galcraft.preview', '0.1.0', { dependencies: [{ id: 'org.galcraft.base', range: '^2.1.0-beta.1' }] }),
    );
    const stableRange = registry.prepareContributions(lock(
      { id: 'org.galcraft.feature', version: '0.1.0' }, { id: 'org.galcraft.base', version: '2.1.0-beta.2' },
    ), 'web');
    expect(!stableRange.ok && stableRange.error.message).toContain('^2.0.0');
    const explicitRange = registry.prepareContributions(lock(
      { id: 'org.galcraft.preview', version: '0.1.0' }, { id: 'org.galcraft.base', version: '2.1.0-beta.2' },
    ), 'web');
    expect(explicitRange.ok && explicitRange.value.loadOrder.map(item => item.id)).toEqual([
      'org.galcraft.base', 'org.galcraft.preview',
    ]);
    const previewEngine = registry.prepareContributions({
      ...lock({ id: 'org.galcraft.base', version: '2.1.0-beta.2' }),
      engine: { ...FixtureLock.engine, version: '1.1.0-beta.1' },
    }, 'web');
    expect(!previewEngine.ok && previewEngine.error.message).toContain('^0.1.0');
  });

  it('reports the whole cycle path and keeps the previous active table', () => {
    const registry = new ContributionRegistry();
    installed(registry, manifest('org.galcraft.stable'));
    const stable = registry.prepareContributions(lock({ id: 'org.galcraft.stable', version: '0.1.0' }), 'web');
    if (!stable.ok) throw stable.error;
    registry.activate(stable.value);
    installed(registry,
      manifest('org.galcraft.a', '0.1.0', { dependencies: [{ id: 'org.galcraft.b', range: '0.1.0' }] }),
      manifest('org.galcraft.b', '0.1.0', { dependencies: [{ id: 'org.galcraft.a', range: '0.1.0' }] }),
    );
    const result = registry.prepareContributions(lock(
      { id: 'org.galcraft.a', version: '0.1.0' }, { id: 'org.galcraft.b', version: '0.1.0' },
    ), 'web');
    expect(!result.ok && result.error.message).toContain('org.galcraft.a → org.galcraft.b → org.galcraft.a');
    expect(registry.activeContributions()?.byKey['org.galcraft.stable/add']).toBeDefined();
  });

  it('reports duplicate contribution keys and accepts an explicit selected provider', () => {
    const registry = new ContributionRegistry();
    const key = 'org.galcraft.shared/add';
    installed(registry,
      manifest('org.galcraft.first', '0.1.0', { contributions: [{ kind: 'command', key, targets: ['web'], required: true }] }),
      manifest('org.galcraft.second', '0.1.0', { contributions: [{ kind: 'command', key, targets: ['web'], required: true }] }),
    );
    const input = lock({ id: 'org.galcraft.first', version: '0.1.0' }, { id: 'org.galcraft.second', version: '0.1.0' });
    const conflict = registry.prepareContributions(input, 'web');
    expect(!conflict.ok && conflict.error.code).toBe('CONTRIBUTION_CONFLICT');
    expect(!conflict.ok && conflict.error.message).toContain(key);
    const chosen = registry.prepareContributions({ ...input, selectedProviders: { [key]: 'org.galcraft.second' } }, 'web');
    expect(chosen.ok && chosen.value.byKey[key]?.provider.id).toBe('org.galcraft.second');
    const invalid = registry.prepareContributions({ ...input, selectedProviders: { [key]: 'org.galcraft.absent' } }, 'web');
    expect(!invalid.ok && invalid.error.code).toBe('CONTRIBUTION_CONFLICT');
  });

  it('rejects duplicate keys within one package and target or engine mismatches', () => {
    const registry = new ContributionRegistry();
    const duplicate = manifest('org.galcraft.bad');
    duplicate.contributions.push({ ...duplicate.contributions[0]! });
    installed(registry, duplicate, manifest('org.galcraft.future', '0.1.0', { engineRange: '^2.0.0' }));
    const duplicateResult = registry.prepareContributions(lock({ id: 'org.galcraft.bad', version: '0.1.0' }), 'web');
    expect(!duplicateResult.ok && duplicateResult.error.code).toBe('CONTRIBUTION_CONFLICT');
    const engineResult = registry.prepareContributions(lock({ id: 'org.galcraft.future', version: '0.1.0' }), 'web');
    expect(!engineResult.ok && engineResult.error.message).toContain('^2.0.0');
    const targetResult = registry.prepareContributions(lock({ id: 'org.galcraft.bad', version: '0.1.0' }), 'android');
    expect(!targetResult.ok && targetResult.error.code).toBe('PLUGIN_TARGET');
  });

  it('validates package paths and refuses a changed declaration at the same ID and version', () => {
    const registry = new ContributionRegistry();
    const original = manifest('org.galcraft.affection');
    expect(registry.registerInstalled(original).ok).toBe(true);
    expect(registry.registerInstalled({ ...original, description: 'different' }).ok).toBe(false);
    expect(registry.resolveExact(original.id, original.version)?.description).toBe('');
    expect(PluginManifestSchema.safeParse({ ...original, files: [{ path: '../secret', size: 1 }] }).success).toBe(false);
    expect(PluginManifestSchema.safeParse({ ...original, dependencies: [{ id: 'org.galcraft.other', range: 'latest' }] }).success).toBe(false);
  });

  it('closes dependencies for the requested environment and target without requiring pure editor dependencies at runtime', () => {
    const registry = new ContributionRegistry();
    const input = manifest('org.galcraft.environment', '0.1.0', { environmentDependencies: {
      definition: [], services: [], editor: [{ id: 'org.galcraft.editor', range: '^0.1.0' }],
      runtime: [{ id: 'org.galcraft.windows', range: '^0.1.0', targets: ['windows'] }],
    } });
    installed(registry, input);
    const exact = lock({ id: input.id, version: input.version });
    expect(registry.prepareContributions(exact, 'web', ['definition', 'runtime']).ok).toBe(true);
    expect(registry.prepareContributions(exact, 'web').ok).toBe(false);
    const windows = registry.prepareContributions(exact, 'windows', ['definition', 'runtime']);
    expect(!windows.ok && windows.error.message).toContain('org.galcraft.windows');
  });

  it('refreshes an unpublished package at the same version without changing the project or accepting invalid files', async () => {
    const source = join(packageTestRoot, 'source');
    const store = new PluginPackageStore(join(packageTestRoot, 'installed'));
    await mkdir(join(source, 'runtime'), { recursive: true });
    await writeFile(join(source, 'runtime/index.js'), 'x');
    const input = manifest('org.galcraft.affection');
    await writeFile(join(source, 'manifest.json'), JSON.stringify(input));
    const first = await store.installDirectory(source);
    expect(first.ok).toBe(true);
    expect((await store.installDirectory(source)).ok).toBe(true);
    expect(FixtureLock.plugins[0]?.version).toBe('0.1.0');
    if (!first.ok) throw first.error;
    expect(await readFile(join(first.value.directory, 'runtime/index.js'), 'utf8')).toBe('x');
    const registry = new ContributionRegistry();
    expect(registry.registerInstalled(first.value.manifest).ok).toBe(true);
    const prepared = registry.prepareContributions(FixtureLock, 'web');
    expect(prepared.ok && prepared.value.byKey['org.galcraft.affection/add']?.provider.version).toBe('0.1.0');
    await writeFile(join(source, 'runtime/index.js'), 'y');
    const changed = await store.installDirectory(source);
    expect(changed.ok).toBe(true);
    expect(await readFile(join(first.value.directory, 'runtime/index.js'), 'utf8')).toBe('y');
    await writeFile(join(source, 'runtime/index.js'), 'longer');
    const invalid = await store.installDirectory(source);
    expect(!invalid.ok && invalid.error.code).toBe('PLUGIN_LOAD');
    expect(await readFile(join(first.value.directory, 'runtime/index.js'), 'utf8')).toBe('y');
  });
});
