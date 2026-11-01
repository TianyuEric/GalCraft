import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtimeManifest, runtimePluginClosure, runtimePluginFiles } from './plugin-release.mjs';
const roots=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

it('closes exact runtime dependencies while excluding editor and service dependencies',()=>{
  const manifests=new Map([
    ['example.game',{id:'example.game',entry:{runtime:'runtime/index.js'},dependencies:[],environmentDependencies:{runtime:[{id:'example.library',range:'0.1.0'}],editor:[{id:'example.editor',range:'0.1.0'}],services:[{id:'example.service',range:'0.1.0'}]},contributions:[]}],
    ['example.library',{id:'example.library',entry:{runtime:null},dependencies:[],contributions:[]}],
    ['example.editor',{id:'example.editor',entry:{runtime:null},dependencies:[],contributions:[]}],
    ['example.service',{id:'example.service',entry:{runtime:null},dependencies:[],contributions:[]}],
  ]);
  const lock={plugins:[...manifests.keys()].map(id=>({id,version:'0.1.0',targets:['web']}))};
  expect([...runtimePluginClosure(lock,manifests,'web')]).toEqual(['example.library','example.game']);
  expect(()=>runtimePluginClosure({plugins:lock.plugins.filter(item=>item.id!=='example.library')},manifests,'web')).toThrow('Missing exact runtime dependency');
});

it('packs a v2 runtime module graph and only the selected native target and architecture',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gc-runtime-'));roots.push(root);
  const content={'runtime/index.js':"import {value} from '../shared/value.js';export {value};",'shared/value.js':'export const value=20;',
    'definition/index.js':'throw new Error("definition must not ship");','editor/index.js':'throw new Error("editor must not ship");','services/index.js':'throw new Error("services must not ship");',
    'native/x64/provider.mjs':'export function createPlatformProvider(){}','native/x64/sdk.dll':'native64','native/arm64/provider.mjs':'nativearm','package.json':'{"type":"module"}'};
  for(const [path,text] of Object.entries(content)){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),text);}
  const manifest={schemaVersion:2,id:'example.game',entry:{runtime:'runtime/index.js',editor:'editor/index.js',definition:'definition/index.js',services:'services/index.js'},
    dependencies:[],environmentDependencies:{runtime:[],definition:[],editor:[],services:[]},studio:[{}],contributions:[{kind:'component',key:'example.game/hud',targets:['web','windows']},{kind:'resource',key:'example.game/resource',targets:['web','windows']},{kind:'stage',key:'example.game/stage',targets:['web','windows']}],
    files:Object.entries(content).map(([path,text])=>({path,size:Buffer.byteLength(text)})),native:[{target:'windows',arch:'x64',entry:'native/x64/provider.mjs'},{target:'windows',arch:'arm64',entry:'native/arm64/provider.mjs'}]};
  const selected=await runtimePluginFiles(root,manifest,'windows','x64');
  expect(selected.files.map(item=>item.path)).toEqual(['runtime/index.js','shared/value.js','native/x64/provider.mjs','native/x64/sdk.dll','package.json']);
  const projected=runtimeManifest(manifest,selected.files,selected.native,'windows');
  expect(projected.entry).toEqual({runtime:'runtime/index.js',editor:null});expect(projected.studio).toBeUndefined();expect(projected.environmentDependencies).toBeUndefined();
  expect(projected.contributions.map(item=>item.kind)).toEqual(['component','stage']);
  expect((await runtimePluginFiles(root,manifest,'web','x64')).files.map(item=>item.path)).toEqual(['runtime/index.js','shared/value.js','package.json']);
});

it('follows real module and import.meta asset references without treating external URL bases or quoted code as files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gc-runtime-'));roots.push(root);
  const content={'runtime/index.js':`export {value} from '../shared/value.js';
    const example = "import './absent.js'";
    export const base = dependency => new URL('./', dependency.url);
    export const localBase = new URL('./', import.meta.url);
    export const image = new URL('../images/icon.png', import.meta.url);`,
    'shared/value.js':'export const value=20;', 'images/icon.png':'image', 'package.json':'{"type":"module"}'};
  for(const [path,text] of Object.entries(content)){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),text);}
  const manifest={schemaVersion:2,entry:{runtime:'runtime/index.js'},native:[],files:Object.entries(content).map(([path,text])=>({path,size:Buffer.byteLength(text)}))};
  expect((await runtimePluginFiles(root,manifest,'web','x64')).files.map(item=>item.path)).toEqual(Object.keys(content));
  await writeFile(join(root,'shared/value.js'),"export {missing} from './missing.js';");
  await expect(runtimePluginFiles(root,manifest,'web','x64')).rejects.toThrow('Runtime module is absent from file list: shared/missing.js');
});
