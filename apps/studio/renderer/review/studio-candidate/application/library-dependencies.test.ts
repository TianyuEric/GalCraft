import { describe, expect, it, vi } from 'vitest';
import { createId, type Lock } from '@galcraft/contracts';
import { FixtureLock } from '@galcraft/contracts/fixtures';
import type { PluginManifest } from '@galcraft/plugins/contracts';
import { checkCandidateDependencies, type CandidateDependencyCatalog } from './library-dependencies.js';

const manifest: PluginManifest = { schemaVersion:1,id:'org.test.required',version:'1.2.3',name:'Required',description:'',author:'Test',license:'MPL-2.0',homepage:null,engineRange:'^0.1.0',sdkMajor:0,targets:['web'],dependencies:[],entry:{runtime:null,editor:null},files:[],contributions:[],stateVersions:{document:1,progress:1,longTerm:1},native:[] };
const ok=<T,>(value:T)=>({ok:true as const,value,warnings:[]});
const lock: Lock = {...structuredClone(FixtureLock),plugins:[{id:manifest.id,version:manifest.version,kind:'plugin',required:true,targets:['web']}]};
function catalog(manifests:unknown[]) {
  const release=vi.fn(async()=>ok(undefined));
  const value={engines:{listCreationVersions:async()=>ok([lock.engine.version])},plugins:{resolve:async()=>ok({handleId:createId(),packages:manifests.map(manifest=>({manifest,runtimeUrl:null,editorUrl:null}))}),release}} as unknown as CandidateDependencyCatalog;
  return {value,release};
}
describe('backup dependency checks without opening a work',()=>{
  it('rejects successful empty and partial resolver results',async()=>{
    const empty=catalog([]);expect(await checkCandidateDependencies(lock,empty.value)).toEqual(['插件 org.test.required 1.2.3']);expect(empty.release).toHaveBeenCalledOnce();
    const partial=catalog([manifest]);const additional={...lock,plugins:[...lock.plugins,{...lock.plugins[0]!,id:'org.test.missing'}]};
    expect(await checkCandidateDependencies(additional,partial.value)).toEqual(['插件 org.test.missing 1.2.3']);expect(partial.release).toHaveBeenCalledOnce();
  });
  it('requires the exact locked version and valid manifests',async()=>{
    expect(await checkCandidateDependencies(lock,catalog([{...manifest,version:'1.2.4'}]).value)).toEqual(['插件 org.test.required 1.2.3']);
    expect(await checkCandidateDependencies(lock,catalog([{id:manifest.id,version:manifest.version}]).value)).toEqual(['插件 org.test.required 1.2.3']);
  });
  it('accepts a complete exact catalog and always releases its handle',async()=>{
    const available=catalog([manifest]);expect(await checkCandidateDependencies(lock,available.value)).toEqual([]);expect(available.release).toHaveBeenCalledOnce();
  });
});
