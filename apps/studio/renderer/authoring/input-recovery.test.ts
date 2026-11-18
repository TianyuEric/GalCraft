import { expect, it } from 'vitest';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import type { Json } from '@galcraft/contracts';
import { retainedWorkspaceInput, withoutRecoveredCharacterInput, workspaceInputHasChanges, workspaceInputVersionsMatch } from './input-recovery.js';
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

const characterInput = (extra: Record<string, unknown> = {}) => ({ ...draft() as object, unapplied:true, otherUnapplied:true,
  character:{drafts:{RoleAA:{id:'RoleAA',name:'A',description:'Retained notes'}},bases:{RoleAA:{id:'RoleAA',name:'A',description:''}},selected:'RoleAA',search:''}, ...extra }) as unknown as Json;
it('exhausts a character-only recovery after its inputs have been retained by identity',()=>{
  expect(withoutRecoveredCharacterInput(characterInput(),project)).toBeNull();
});
const emptyProcessor = {processorKey:'',settings:{},open:false,inputSelection:[]};
it('ignores the exact empty resource processor shell captured by an untouched workbench',()=>{
  const value=characterInput({resourceProcessor:emptyProcessor});
  expect(withoutRecoveredCharacterInput(value,project)).toBeNull();
  expect(value).toHaveProperty('resourceProcessor',emptyProcessor);
});
it.each([
  {...emptyProcessor,settings:{threshold:0}}, {...emptyProcessor,processorKey:'org.example/image'},
  {...emptyProcessor,open:true}, {...emptyProcessor,inputSelection:[{id:'AssetA'}]},
  {...emptyProcessor,futureInput:'unfinished'}, {...emptyProcessor,settings:[]},
  {processorKey:'',settings:{},open:false},
])('retains resource processor input outside the exact empty shell: %j',resourceProcessor=>{
  expect(withoutRecoveredCharacterInput(characterInput({resourceProcessor}),project)).toMatchObject({resourceProcessor,unapplied:true,otherUnapplied:true});
});
it('keeps invalid script input and its original versions after character recovery',()=>{
  const value=characterInput({scripts:[['SceneA','@say { incomplete']]});
  const remaining=withoutRecoveredCharacterInput(value,project);
  expect(remaining).toMatchObject({scripts:[['SceneA','@say { incomplete']],versions:[{documentId:'ProjAA',revision:1},{documentId:'Assets',revision:1}],unapplied:true,otherUnapplied:true});
  expect(remaining).not.toHaveProperty('character');
  expect(value).toHaveProperty('character.drafts.RoleAA.description','Retained notes');
});
it('retains release recovery only while its applied identity differs from the project',()=>{
  expect(withoutRecoveredCharacterInput(characterInput({publish}),project)).toBeNull();
  const remaining=withoutRecoveredCharacterInput(characterInput({publish:{...publish,version:'9.8.7'}}),project);
  expect(remaining).toMatchObject({publish:{version:'9.8.7'},unapplied:true,otherUnapplied:false});
  expect(workspaceInputVersionsMatch(remaining!,project,'ProjAA',new Map([['ProjAA',1],['Assets',8]]))).toBe(true);
});
it('preserves nested records until their own inputs have been recovered',()=>{
  const retained=characterInput();
  expect(withoutRecoveredCharacterInput(characterInput({retained}),project)).toBe(retained);
});
it.each([
  {projectCreate:{name:'New work',template:'standard',width:1920,height:1080,engineVersion:''}},
  {forms:[{id:'professional-input',title:'Professional input',fields:[],adapter:{kind:'unknown',raw:'unfinished'}}]},
  {designer:{behaviorDrafts:{BindingA:{graph:{}}}}},
  {startup:{display:{...project.display,icon:'Changed'},displayPending:true,buffers:{},tab:'home'}},
  {production:{workflow:{workflowDocuments:[{id:'WorkflowA',text:'unfinished',dirty:true}]}}},
])('keeps other pending author input after character recovery: %j',extra=>{
  expect(withoutRecoveredCharacterInput(characterInput(extra),project)).toMatchObject({...extra,unapplied:true,otherUnapplied:true});
});
it.each([null,[],{version:2,character:{drafts:{}}},{version:1,character:'unknown',versions:[]},
  characterInput({futureInput:{raw:'unfinished'}}),characterInput({startup:{futureInput:'unfinished'}}),
  characterInput({versions:[{documentId:'ProjAA',revision:'unknown'}]}),characterInput({production:{gui:{futureInput:'unfinished'}}}),
  characterInput({publish:{...publish,futureInput:'unfinished'}}),
])('preserves an unrecognized recovery record unchanged: %j',value=>{
  expect(withoutRecoveredCharacterInput(value as Json,project)).toBe(value);
});
