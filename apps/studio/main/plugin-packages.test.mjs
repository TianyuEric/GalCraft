import { afterEach, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StudioPluginPackages } from './plugin-packages.mjs';

const root = join(process.cwd(), '..', '..', 'tmp', 'testing', 'studio-plugin-packages');
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it('resolves exact installed plugin files and releases their resource URLs', async () => {
  const source = join(root, 'source'), runtime = 'runtime/index.js', helper = 'runtime/helper.js';
  await mkdir(join(source, 'runtime'), { recursive: true });
  const files = { [runtime]: 'import { value } from "./helper.js"; export const marker = value;', [helper]: 'export const value = 1;' };
  for (const [path, content] of Object.entries(files)) await writeFile(join(source, path), content);
  await writeFile(join(source, 'manifest.json'), JSON.stringify({ schemaVersion: 1, id: 'org.example.demo', name: 'Demo', version: '0.1.0',
    description: '', author: 'Example', license: 'MIT', homepage: null, engineRange: '^0.1.0', sdkMajor: 0,
    targets: ['web', 'windows'], dependencies: [], entry: { runtime, editor: null },
    files: Object.entries(files).map(([path, content]) => ({ path, size: Buffer.byteLength(content) })),
    contributions: [], stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] }));
  const registered = [], released = [];
  const resources = { register: input => { registered.push(input); return { uri: `galcraft-resource://plugins/${input.assetId}/${input.variantId}/${input.relative}`,
    release: () => released.push(input.relative) }; } };
  const packages = new StudioPluginPackages(join(root, 'installed'), resources);
  expect((await packages.install({ kind: 'directory', path: source })).ok).toBe(true);
  expect((await packages.list(null)).value.entries[0].studioService).toBe(false);
  packages.setStudioServices([{ id: 'org.example.demo', version: '0.1.0' }]);
  expect((await packages.list(null)).value.entries[0].studioService).toBe(true);
  for (const version of [null, '0.1.0']) {
    const change = await packages.planChange({ pluginId: 'org.example.demo', version }, null);
    expect(change.ok).toBe(false);
    expect(change.error.code).toBe('PLUGIN_STUDIO_SERVICE');
  }
  const lock = { plugins: [{ kind: 'plugin', id: 'org.example.demo', version: '0.1.0', targets: ['web'], required: true }] };
  const resolved = await packages.resolve(lock);
  expect(resolved.ok).toBe(true); if (!resolved.ok) throw resolved.error;
  expect(resolved.value.packages[0]?.runtimeUrl).toContain('/runtime/index.js');
  expect(registered.map(item => item.relative)).toEqual([runtime, helper]);
  expect(registered.every(item => item.path.startsWith(join(root, 'installed')))).toBe(true);
  packages.release(resolved.value.handleId);
  expect(released).toEqual([runtime, helper]);

  const development = join(root, 'development');
  await mkdir(join(development, 'runtime'), { recursive: true });
  for (const [path, content] of Object.entries(files)) await writeFile(join(development, path), content);
  const nextManifest = { ...resolved.value.packages[0].manifest };
  await writeFile(join(development, 'manifest.json'), JSON.stringify(nextManifest));
  expect((await packages.loadDevelopment({ directory: development, projectId: crypto.randomUUID() })).ok).toBe(true);
  await writeFile(join(development, 'manifest.json'), JSON.stringify({ ...nextManifest, version: '2.0.0' }));
  const oldVersion = await packages.resolve(lock);
  expect(oldVersion.ok).toBe(true); if (!oldVersion.ok) throw oldVersion.error;
  expect(registered.slice(2).every(item => item.path.startsWith(join(root, 'installed')))).toBe(true);
  packages.release(oldVersion.value.handleId);
});
