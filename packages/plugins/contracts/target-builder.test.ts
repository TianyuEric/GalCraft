import { describe, expect, it } from 'vitest';
import { FixtureLock } from '@galcraft/contracts/fixtures';
import { PluginManifestSchema } from './manifest.js';
import { ContributionRegistry } from '../registry/index.js';
const manifest = { schemaVersion: 2, id: 'example.mobile', name: 'External mobile builder', description: '', version: '0.1.0', author: 'Example', license: 'MIT', homepage: null,
  engineRange: '^0.1.0', sdkMajor: 0, targets: ['android'], dependencies: [], entry: { definition: 'definition.mjs', runtime: null, editor: null, services: 'services.mjs' },
  files: [{ path: 'definition.mjs', size: 1 }, { path: 'services.mjs', size: 1 }], contributions: [{ kind: 'targetBuilder', key: 'example.mobile/build', targets: ['android'], required: true }],
  stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] };
describe('public target builder service contribution', () => {
  it('uses a services entry without requiring a Player runtime and registers an exact Android provider', () => {
    const parsed = PluginManifestSchema.parse(manifest), registry = new ContributionRegistry();
    expect(registry.registerInstalled(parsed).ok).toBe(true);
    const lock = structuredClone(FixtureLock); lock.engine.targets.push('android'); lock.plugins = [{ kind: 'plugin', id: parsed.id, version: parsed.version, targets: ['android'], required: true }];
    const prepared = registry.prepareContributions(lock, 'android', ['services']);
    expect(prepared).toMatchObject({ ok: true, value: { byKind: { targetBuilder: [{ key: 'example.mobile/build', provider: { id: 'example.mobile', version: '0.1.0' } }] } } });
    lock.plugins[0]!.version = '1.1.0'; expect(registry.prepareContributions(lock, 'android', ['services']).ok).toBe(false);
  });
  it('rejects a declaration without its real service entry', () => {
    expect(PluginManifestSchema.safeParse({ ...manifest, entry: { ...manifest.entry, services: null } }).success).toBe(false);
  });
});
