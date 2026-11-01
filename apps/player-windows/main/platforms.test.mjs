import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNativePlatforms } from './platforms.mjs';

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
describe('Windows release native platform loading', () => {
  it('simulates validation domains without importing a native SDK', async () => {
    const platform=await loadNativePlatforms({releaseRoot:'unused',snapshot:{projectId:'project'},domain:{projectId:'project',kind:'sample',instance:'validation'},importModule:()=>{throw new Error('Native SDK was imported');}});
    expect(await platform.invoke('example.platform/api:unlock',{id:'first'})).toMatchObject({ok:true,value:{status:'simulated'}});
  });
  it('loads only the current architecture and invokes the actual module in the main process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gc-platform-')); roots.push(root);
    const directory = join(root, 'plugins/runtime/example.platform/0.1.0'); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'provider.mjs'), 'export function createPlatformProvider(context) { return { invoke: async (action,args)=>({ok:true,value:{action,args,arch:context.arch,appId:context.projectPlatform.steamAppId,releaseDirectory:context.runtime.releaseDirectory,node:typeof process.versions.node},warnings:[]}) }; }');
    const native = await import('node:fs/promises').then(fs => fs.readFile(join(directory, 'provider.mjs')));
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ schemaVersion: 1, id: 'example.platform', name: 'Native', version: '0.1.0', description: '', author: 'Test', license: 'MIT', homepage: null, engineRange: '*', sdkMajor: 0, targets: ['windows'], dependencies: [], entry: { runtime: 'provider.mjs', editor: null }, files: [{path:'provider.mjs',size:native.length}], contributions: [{kind:'platform',key:'example.platform/api',targets:['windows'],required:true}], stateVersions: {document:1,progress:1,longTerm:1},native:[{target:'windows',arch:'x64',entry:'provider.mjs'}] }));
    const snapshot = { projectId: 'project', project: { platform: { steamAppId: '480' } }, lock: { plugins: [{id:'example.platform',version:'0.1.0'}] }, pluginDocuments: {} };
    const platforms = await loadNativePlatforms({ releaseRoot: root, snapshot, arch: 'x64' });
    expect((await platforms.invoke('example.platform/api:unlock', {id:'first'})).value).toEqual({action:'unlock',args:{id:'first'},arch:'x64',appId:'480',releaseDirectory:root,node:'string'});
    await platforms.dispose();
    const unavailable = await loadNativePlatforms({ releaseRoot: root, snapshot, arch: 'arm64' });
    expect((await unavailable.invoke('example.platform/api:unlock', {})).error.code).toBe('PLATFORM_UNAVAILABLE');
  });
});
