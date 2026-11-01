import { afterEach,expect,it } from 'vitest';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createId } from '@galcraft/contracts';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import { assetFilePath,createAssetIndex } from './catalog.js';
import { prepareTemplateAssets } from './template-import.js';
let root:string|undefined;afterEach(async()=>{if(root)await rm(root,{recursive:true,force:true});root=undefined;});
it('prepares independent exact variants and metadata without applying the index',async()=>{
  root=await mkdtemp(join(tmpdir(),'galcraft-template-assets-'));const asset=structuredClone(FixtureAsset),bytes=new Uint8Array([1,2,3]),files:Record<string,Uint8Array>={};
  for(const variant of asset.variants){variant.processing=null;for(const file of variant.files){file.bytes=bytes.length;files[assetFilePath(asset.id,variant.id,file.path)]=bytes;}}
  const index=createAssetIndex(createId()),prepared=await prepareTemplateAssets({projectRoot:root,index,assets:[asset],files});
  expect(index.data.assets).toEqual([]);expect(prepared.assetMap[asset.id]).not.toBe(asset.id);expect(prepared.indexPatches).toHaveLength(1);
  const adopted=prepared.assets[0]!;expect(adopted.characterId).toBeNull();expect(adopted.sceneIds).toEqual([]);expect(adopted.source.kind).toBe('template');
  expect(adopted.variants.map(variant=>variant.canvas)).toEqual(asset.variants.map(variant=>variant.canvas));
  for(let i=0;i<adopted.variants.length;i++){const variant=adopted.variants[i]!;expect(variant.id).toBe(prepared.variantMap[asset.variants[i]!.id]);for(const file of variant.files)expect(new Uint8Array(await readFile(join(root,assetFilePath(adopted.id,variant.id,file.path))))).toEqual(bytes);}
});
