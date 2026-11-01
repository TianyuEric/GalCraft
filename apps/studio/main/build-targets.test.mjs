import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ResourceRegistry } from '@galcraft/media-tools/resources';
import { FixtureLock } from '@galcraft/contracts/fixtures';
import { StudioPluginPackages } from './plugin-packages.mjs';
import { StudioBuildTargets } from './build-targets.mjs';
it('keeps target-only services out of the Player closure while discovering installed external builders without work enablement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galcraft-target-services-')), resources = new ResourceRegistry(), packages = new StudioPluginPackages(root, resources);
  try {
    expect((await packages.install({ kind: 'directory', path: resolve(import.meta.dirname, '../../../plugins/official-android/package') })).ok).toBe(true);
    const targets = new StudioBuildTargets(packages, () => null);
    const external = await targets.catalog(); expect(external.ok).toBe(true); expect(external.value).toHaveLength(1);
    expect(external.value[0].builder).toEqual({ key: 'org.galcraft.android/build', pluginId: 'org.galcraft.android', version: '0.1.0' });
    packages.setStudioServices([{ id: 'org.galcraft.android', version: '0.1.0' }]);
    const lock = structuredClone(FixtureLock); lock.plugins = [];
    const resolved = await packages.resolve(lock); expect(resolved.ok).toBe(true); expect(resolved.value.packages).toEqual([]);
    expect(packages.dependencies(null)).toHaveLength(1); expect((await packages.list(null)).value.entries).toHaveLength(1); expect((await targets.catalog()).value).toHaveLength(1);
    await packages.release(resolved.value.handleId);
  } finally { await packages.dispose(); await rm(root, { recursive: true, force: true }); }
});
