import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installLive2DSDK } from './live2d-sdk.mjs';
import { collectLive2DRuntime } from './live2d-release.mjs';

const fault = vi.hoisted(() => ({ commit: false }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, rename: async (from, to) => {
    if (fault.commit && String(from).includes('.staging-')) throw Object.assign(new Error('replacement directory is occupied'), { code: 'EPERM' });
    return actual.rename(from, to);
  } };
});

const root = resolve(import.meta.dirname, '../../../tmp/testing/live2d-sdk-refresh');
afterEach(async () => { fault.commit = false; await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const sdk = join(root, 'sdk'), motionSDK = join(root, 'motion-sdk'), framework = join(root, 'engine/live2d');
  const core = 'var Live2DCubismCore={Version:{csmGetVersion:()=>0x05010000}};';
  const motion = 'var Live2DCubismMotionSyncCore={CubismMotionSyncEngine:{csmMotionSyncGetEngineVersion:()=>0x05000004}};';
  const contents = { 'adapter.mjs': 'export function createBindings(){return "new bindings";}', 'notices/license.txt': 'license',
    'core/live2dcubismcore.js': core, 'motion/live2dcubismmotionsynccore.js': motion, 'motion/framework.mjs': 'new motion bindings' };
  const put = async (path, text) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, text); };
  await put(join(sdk, 'CHANGELOG.md'), '## [5-r.4]'); await put(join(motionSDK, 'CHANGELOG.md'), '## [5-r.2]');
  await put(join(sdk, 'Core/RedistributableFiles.txt'), 'live2dcubismcore.js'); await put(join(sdk, 'Core/live2dcubismcore.js'), core);
  await put(join(motionSDK, 'Core/CRI/RedistributableFiles.txt'), 'live2dcubismmotionsynccore.js'); await put(join(motionSDK, 'Core/CRI/live2dcubismmotionsynccore.js'), motion);
  for (const [path, text] of Object.entries(contents)) await put(join(framework, path), text);
  const files = paths => paths.map(path => ({ path, bytes: Buffer.byteLength(contents[path]) }));
  const manifest = { schemaVersion: 1, sdkRelease: '5-r.4', frameworkVersion: '5-r.4', coreVersion: '5.1.00', sourceUrl: 'https://www.live2d.com/', entry: 'adapter.mjs',
    coreFiles: files(['core/live2dcubismcore.js']), frameworkFiles: files(['adapter.mjs', 'notices/license.txt']), notices: ['notices/license.txt'], redistributableFiles: Object.keys(contents),
    motionSync: { componentRelease: '5-r.2', coreVersion: '5.0.04', files: files(['motion/live2dcubismmotionsynccore.js', 'motion/framework.mjs', 'notices/license.txt']), notices: ['notices/license.txt'], redistributableFiles: Object.keys(contents) }, verifiedTargets: ['web', 'windows'] };
  await put(join(framework, 'runtime.manifest.json'), JSON.stringify(manifest));
  const options = { engine: { directory: join(root, 'engine'), manifest: { entries: { live2d: 'live2d/runtime.manifest.json' } } }, root: join(root, 'installed'), sdk, motionSDK };
  return { options, destination: join(options.root, '5-r.4/5.1.00'), framework, manifest };
}

it('refreshes a same-version adapter and retains R2 for other projects during an R4-only import', async () => {
  const { options, destination, framework } = await fixture();
  const first = await installLive2DSDK(options);
  await writeFile(join(destination, 'adapter.mjs'), 'export function createRuntime(){}');
  await writeFile(join(destination, 'obsolete.mjs'), 'old chunk');
  await writeFile(join(framework, 'motion/framework.mjs'), 'new motion bindings');
  const next = await installLive2DSDK({ ...options, motionSDK: undefined });
  expect(next.motionSyncCoreVersion).toBeNull();
  expect(await readFile(join(destination, 'adapter.mjs'), 'utf8')).toContain('createBindings');
  expect(await readdir(destination)).not.toContain('obsolete.mjs');
  expect((await collectLive2DRuntime({ root: options.root, lock: first, target: 'windows', policy: { purpose: 'localTest' } })).manifest.motionSync.coreVersion).toBe('5.0.04');
  expect((await import(pathToFileURL(join(destination, 'adapter.mjs')).href)).createBindings()).toBe('new bindings');
});

it('adds MotionSync to an existing R4 runtime and refreshes both environments', async () => {
  const { options, destination } = await fixture();
  await installLive2DSDK({ ...options, motionSDK: undefined });
  const lock = await installLive2DSDK(options);
  expect(lock.motionSyncCoreVersion).toBe('5.0.04');
  for (const target of ['web', 'windows']) expect((await collectLive2DRuntime({ root: options.root, lock, target, policy: { purpose: 'localTest' } })).manifest.verifiedTargets).toContain(target);
  expect(await readFile(join(destination, 'motion/framework.mjs'), 'utf8')).toBe('new motion bindings');
});

it('retains the installed runtime when replacement files are invalid', async () => {
  const { options, destination, framework } = await fixture();
  const lock = await installLive2DSDK(options), before = await readFile(join(destination, 'adapter.mjs'), 'utf8');
  await writeFile(join(framework, 'adapter.mjs'), 'invalid');
  await expect(installLive2DSDK(options)).rejects.toThrow('运行文件与引擎声明不符');
  expect(await readFile(join(destination, 'adapter.mjs'), 'utf8')).toBe(before);
  expect((await collectLive2DRuntime({ root: options.root, lock, target: 'windows', policy: { purpose: 'localTest' } })).manifest.entry).toBe('adapter.mjs');
  expect(await readdir(dirname(destination))).toEqual(['5.1.00']);
});

it('restores the installed runtime if committing the staged directory fails', async () => {
  const { options, destination } = await fixture();
  const lock = await installLive2DSDK(options), before = await readFile(join(destination, 'adapter.mjs'), 'utf8');
  fault.commit = true;
  await expect(installLive2DSDK(options)).rejects.toThrow('replacement directory is occupied');
  expect(await readFile(join(destination, 'adapter.mjs'), 'utf8')).toBe(before);
  expect((await collectLive2DRuntime({ root: options.root, lock, target: 'windows', policy: { purpose: 'localTest' } })).manifest.entry).toBe('adapter.mjs');
  expect(await readdir(dirname(destination))).toEqual(['5.1.00']);
});
