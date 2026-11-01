import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AssetTypeRegistry, assetFilePath, createAssetIndex } from '@galcraft/assets';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { StudioAssets } from './asset-providers.mjs';
import { StudioCollaboration } from './collaboration-providers.mjs';
import { AssetsInputSchema, AssetsOutputSchema } from './collaboration-contracts.mjs';
import { verifyAssetPlayback } from './asset-targets.mjs';

vi.mock('./asset-targets.mjs', () => ({ verifyAssetPlayback: vi.fn() }));
const root=resolve(import.meta.dirname,'../../../tmp/testing/projects/collaboration-asset-verification');
const profile=resolve(import.meta.dirname,'../../../tmp/testing/user-data/collaboration-asset-verification');
let project,service;
afterEach(async()=>{await service?.close();service=null;await project?.dispose('discard');project=null;await rm(root,{recursive:true,force:true});await rm(profile,{recursive:true,force:true});vi.resetAllMocks();});
async function setup(documents=['Index1']){
 const asset=structuredClone(FixtureAsset);asset.variants[0].targets={web:'unverified',windows:'unverified'};
 const index=createAssetIndex('Index1');index.data.assets=[asset];
 project=await ProjectSession.createProject(root,'Proj01',[{documentId:'Index1',revision:1,format:'json',files:{'assets/index.json':JSON.stringify(index)}}]);
 const source=join(root,assetFilePath(asset.id,asset.activeVariantId,asset.variants[0].entry));await mkdir(resolve(source,'..'),{recursive:true});await writeFile(source,'actual fixture bytes');
 const projects={currentSession:project,currentRoot:root,currentSessionId:'Write1'};
 const assets=new StudioAssets(projects,'',null,null,{register:()=>({uri:'galcraft-resource://fixture/image.png',release(){}})});
 assets.verifyAssetPlayback=verifyAssetPlayback;
 assets.assetTypes={acquire:async()=>({types:new AssetTypeRegistry(),release:async()=>{}})};
 service=new StudioCollaboration({userData:profile,projects,assets,production:{generationProviders:{operations:async()=>[]}},plugins:{externalTools:async()=>[],acquireDefinitions:async()=>({ok:true,warnings:[],value:{documents:[],components:[],pages:[],release:async()=>{}}})}});
 await service.ready;
 const session=await service.core.create({projectId:'Proj01',writeSessionId:'Write1',projectRoot:root,projectName:'目标验证',goal:'Validate existing media',harness:'codex',scope:{documents,createKinds:[],tools:['galcraft_assets'],operations:[],connectionIds:[],models:[],workflowIds:[],maxGenerations:0}});
 const invoke=(target,callId)=>service.core.invoke('galcraft_assets',AssetsInputSchema.parse({action:'verifyTarget',target}),session.id,callId);
 const read=()=>JSON.parse(project.readDocument('Index1').files['assets/index.json']).data.assets[0];
 return {asset,session,invoke,read};
}
it('maps actual M04 verification to a working-copy M02 receipt and recovers a lost commit without decoding again',async()=>{
 const f=await setup();verifyAssetPlayback.mockResolvedValue({ok:true});
 const apply=project.applyExternalEdit.bind(project);project.applyExternalEdit=async(...args)=>{await apply(...args);throw new Error('Lost verification response after M02 commit');};
 const lost=await f.invoke('web','verify-web');expect(lost.state).toBe('uncertain');project.applyExternalEdit=apply;
 const recovered=await service.core.query(f.session.id,'verify-web');expect(recovered.state).toBe('completed');
 expect(AssetsOutputSchema.safeParse(recovered.result).success).toBe(true);
 expect(recovered.result).toMatchObject({action:'verifyTarget',target:'web',issues:[],receipt:{documents:[{ref:{kind:'document',id:'Index1'},revision:2}]}});
 expect(f.read().variants[0].targets).toEqual({web:'direct',windows:'unverified'});expect(project.dirtyIds()).toEqual(['Index1']);
 expect(JSON.parse(await readFile(join(root,'assets/index.json'),'utf8')).data.assets[0].variants[0].targets.web).toBe('unverified');
 expect((await f.invoke('web','verify-web')).result.receipt).toEqual(recovered.result.receipt);expect(project.operations).toHaveLength(1);expect(verifyAssetPlayback).toHaveBeenCalledTimes(1);
});
it('refuses an out-of-scope index before playback and checks the actual plan against a scope narrowed during playback',async()=>{
 const f=await setup([]);verifyAssetPlayback.mockResolvedValue({ok:true});
 const denied=await f.invoke('windows','verify-denied');expect(denied.errorCode,JSON.stringify(denied)).toBe('DOCUMENT_SCOPE');expect(verifyAssetPlayback).not.toHaveBeenCalled();expect(project.operations).toHaveLength(0);
 await service.core.update({id:f.session.id,expectedRevision:1,scope:{...f.session.scope,documents:['Index1']}});
 verifyAssetPlayback.mockImplementationOnce(async()=>{await service.core.update({id:f.session.id,expectedRevision:2,scope:{...f.session.scope,documents:[]}});return {ok:true};});
 const changed=await f.invoke('windows','verify-scope-changed');expect(changed.errorCode,JSON.stringify(changed)).toBe('DOCUMENT_SCOPE');expect(project.operations).toHaveLength(0);expect(f.read().variants[0].targets.windows).toBe('unverified');
});
it('returns original decode issues together with the actual committed unverified target receipt',async()=>{
 const f=await setup();verifyAssetPlayback.mockResolvedValue({ok:false,reason:'Image decode failed'});
 const result=await f.invoke('windows','verify-failed-decode');expect(result.state).toBe('completed');expect(AssetsOutputSchema.safeParse(result.result).success).toBe(true);
 expect(result.result.issues).toEqual([expect.objectContaining({code:'ASSET_DECODE',message:expect.stringContaining('Image decode failed')})]);
 expect(result.result.receipt.documents).toContainEqual({ref:{kind:'document',id:'Index1'},revision:2});expect(f.read().variants[0].targets.windows).toBe('unverified');
});
