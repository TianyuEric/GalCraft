import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./collaboration-compile.mjs',()=>({compileCollaborationProject:vi.fn()}));
import { compileCollaborationProject } from './collaboration-compile.mjs';
import { registerLifecycleTools } from './collaboration-lifecycle.mjs';

beforeEach(()=>vi.mocked(compileCollaborationProject).mockReset());
function fixture(){
  const handlers=new Map(),documents=[{documentId:'Proj01',revision:2,files:{}}];
  const project={projectId:'Work01',documents:new Map(documents.map(document=>[document.documentId,document])),dirtyIds:()=>[],withSavedSnapshot:callback=>callback(documents)};
  const planBuild=vi.fn(async input=>({ok:true,value:{input},warnings:[]}));
  const owner={userData:'unused',project:()=>project,control:{host:{builds:{planBuild}}},production:{language:{lastValid:()=>({ok:true,value:{snapshotId:'Working'},warnings:[]})}},register(key,_title,_description,_schema,_effects,execute){handlers.set(key,execute);}};
  registerLifecycleTools(owner);const call=input=>handlers.get('galcraft_release')(input,{projectId:'Work01',writeSessionId:'Write1'},()=>{});
  return {call,planBuild};
}
it('prepares the checked saved snapshot even when a later working compile becomes lastValid',async()=>{
  const {call,planBuild}=fixture();vi.mocked(compileCollaborationProject).mockResolvedValue({current:true,snapshot:{snapshotId:'Saved1'},issues:[]});
  expect(await call({action:'check'})).toMatchObject({snapshotId:'Saved1',savedVersions:[{ref:{kind:'document',id:'Proj01'},revision:2}]});
  await call({action:'prepare',settings:{target:'web'}});expect(planBuild.mock.calls[0][0]).toMatchObject({snapshotId:'Saved1',savedVersions:[{ref:{kind:'document',id:'Proj01'},revision:2}]});
});
it('rejects a superseded saved check and clears the previous release review baseline',async()=>{
  const {call,planBuild}=fixture();vi.mocked(compileCollaborationProject).mockResolvedValueOnce({current:true,snapshot:{snapshotId:'Saved1'},issues:[]}).mockResolvedValueOnce({current:false,snapshot:null,issues:[]});
  await call({action:'check'});await expect(call({action:'check'})).rejects.toMatchObject({code:'COMPILE_SUPERSEDED'});
  await expect(call({action:'prepare',settings:{target:'web'}})).rejects.toMatchObject({code:'BUILD_SNAPSHOT_MISSING'});expect(planBuild).not.toHaveBeenCalled();
});
