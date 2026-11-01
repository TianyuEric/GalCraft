import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PluginPackageStore } from './package-store.js';
import { preparePluginModuleGraph } from './module-loader.js';

const state = vi.hoisted(() => ({ failures: [] as string[], attempts: 0 }));
vi.mock('node:fs/promises', async importActual => {
  const actual = await importActual<typeof import('node:fs/promises')>();
  return { ...actual, rename: async (source: string, destination: string) => {
    state.attempts++;
    const code = state.failures.shift();
    if (code) throw Object.assign(new Error(`rename ${code}`), { code });
    return actual.rename(source, destination);
  } };
});
const root = resolve('../../tmp/testing/plugin-store-rename');
afterEach(async () => { state.failures = []; state.attempts = 0; await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const source = join(root, 'source'); await mkdir(source, { recursive: true });
  const runtime = 'export const marker=true;';
  await writeFile(join(source, 'runtime.js'), runtime);
  await writeFile(join(source, 'manifest.json'), JSON.stringify({ schemaVersion: 1, id: 'org.example.store', name: 'Store', version: '0.1.0',
    description: '', author: 'Example', license: 'MIT', homepage: null, engineRange: '^0.1.0', sdkMajor: 0, targets: ['web'], dependencies: [],
    entry: { runtime: 'runtime.js', editor: null }, files: [{ path: 'runtime.js', size: Buffer.byteLength(runtime) }], contributions: [],
    stateVersions: { document: 0, progress: 0, longTerm: 0 }, native: [] }));
  return { source, store: new PluginPackageStore(join(root, 'store')) };
}
it.skipIf(process.platform !== 'win32')('finishes the same staged package after transient Windows rename locks', async () => {
  const { source, store } = await fixture(); state.failures = ['EPERM', 'EACCES'];
  const result = await store.installDirectory(source);
  expect(result.ok).toBe(true); expect(state.attempts).toBe(3);
  if (result.ok) expect(await readFile(join(result.value.directory, 'runtime.js'), 'utf8')).toBe('export const marker=true;');
});
it.skipIf(process.platform !== 'win32')('bounds Windows retries and removes the incomplete staging directory', async () => {
  const { source, store } = await fixture(); state.failures = ['EPERM', 'EPERM', 'EPERM', 'EPERM'];
  const result = await store.installDirectory(source);
  expect(result).toMatchObject({ ok: false, error: { code: 'PLUGIN_LOAD', message: expect.stringContaining('EPERM') } });
  expect(state.attempts).toBe(4); expect(await readdir(join(root, 'store/org.example.store'))).toEqual([]);
});
it('refreshes the same package version while existing leased graphs retain their lazy modules', async () => {
  const { source, store } = await fixture();
  const runtime = 'export async function value(){return (await import("./value.js")).value;}';
  await writeFile(join(source, 'runtime.js'), runtime); await writeFile(join(source, 'value.js'), 'export const value="old";');
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  manifest.files = [{ path: 'runtime.js', size: Buffer.byteLength(runtime) }, { path: 'value.js', size: Buffer.byteLength('export const value="old";') }];
  await writeFile(join(source, 'manifest.json'), JSON.stringify(manifest));
  const first = await store.installDirectory(source); if (!first.ok) throw first.error;
  const old = await preparePluginModuleGraph(first.value.directory, first.value.manifest);
  try {
    const before = await old.importEntry('runtime.js');
    await writeFile(join(source, 'value.js'), 'export const value="new";');
    const refreshed = await store.installDirectory(source); if (!refreshed.ok) throw refreshed.error;
    expect(refreshed.value.manifest.version).toBe('0.1.0');
    const current = await preparePluginModuleGraph(refreshed.value.directory, refreshed.value.manifest);
    try {
      expect(await before.value()).toBe('old');
      expect(await (await current.importEntry('runtime.js')).value()).toBe('new');
    } finally { await current.release(); }
  } finally { await old.release(); }
});
it.skipIf(process.platform !== 'win32')('restores the previous package when committing a same-version replacement fails', async () => {
  const { source, store } = await fixture();
  const first = await store.installDirectory(source); if (!first.ok) throw first.error;
  await writeFile(join(source, 'runtime.js'), 'export const marker=123; ');
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  manifest.files[0].size = Buffer.byteLength('export const marker=123; ');
  await writeFile(join(source, 'manifest.json'), JSON.stringify(manifest));
  state.failures = ['', 'EPERM', 'EPERM', 'EPERM', 'EPERM'];
  const result = await store.installDirectory(source);
  expect(result.ok).toBe(false);
  expect(await readFile(join(first.value.directory, 'runtime.js'), 'utf8')).toBe('export const marker=true;');
  expect(await readdir(join(root, 'store/org.example.store'))).toEqual(['0.1.0']);
});
