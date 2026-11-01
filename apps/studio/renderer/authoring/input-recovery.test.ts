import { expect, it } from 'vitest';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import type { Json } from '@galcraft/contracts';
import { retainedWorkspaceInput, workspaceInputHasChanges, workspaceInputVersionsMatch } from './input-recovery.js';
const project = structuredClone(FixtureProject);
const publish={target:'windows',steamAppId:project.platform.steamAppId??'',version:project.releaseVersion,brandName:project.name,brandIcon:project.display.icon??'',executableName:'Game.exe',publisher:'',windowsSigning:'unsigned'};
const draft=()=>({version:1,versions:[{documentId:'ProjAA',revision:1},{documentId:'Assets',revision:1}],publish,scripts:[],writing:[],forms:[],production:{gui:{workflowDocuments:[],recipe:null,uiProposal:null},connection:{edit:null,provider:'openai',advanced:null,baseline:'',selection:[]},candidateText:[]}}) as unknown as Json;
it('restores clean workspace choices after media verification changes document versions',()=>{
  const value=draft(); expect(workspaceInputHasChanges(value,project)).toBe(false);
  expect(workspaceInputVersionsMatch(value,project,'ProjAA',new Map([['ProjAA',1],['Assets',8]]))).toBe(true);
});
it('checks the project document for pending release identity, leaving unrelated assets outside its scope',()=>{
  const value={...draft() as object,publish:{...publish,windowsSigning:'certificate'}} as unknown as Json;
  expect(workspaceInputVersionsMatch(value,project,'ProjAA',new Map([['ProjAA',1],['Assets',8]]))).toBe(true);
  expect(workspaceInputVersionsMatch(value,project,'ProjAA',new Map([['ProjAA',2],['Assets',8]]))).toBe(false);
});
it('removes nested clean recovery records while retaining actual script and form input',()=>{
  expect(retainedWorkspaceInput({...draft() as object,retained:draft()} as Json,project)).toBeNull();
  const script={...draft() as object,scripts:[['SceneA','unfinished source']]};
  const retained=retainedWorkspaceInput({...draft() as object,retained:script} as Json,project);
  expect(retained).toMatchObject({scripts:[['SceneA','unfinished source']]});
  expect(workspaceInputVersionsMatch(retained!,project,'ProjAA',new Map([['ProjAA',2],['Assets',8]]))).toBe(false);
});
it('retains changed production and unsupported input rather than dropping it during normalization',()=>{
  const value={...draft() as object,unapplied:true,otherUnapplied:true,production:{gui:{recipe:{name:'unfinished'}}}} as Json;
  expect(retainedWorkspaceInput(value,project)).not.toBeNull();
});
