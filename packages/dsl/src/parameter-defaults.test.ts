import { describe, expect, it } from 'vitest';
import { FixtureCharacters, FixtureIds, FixtureLock, FixtureProject, FixtureScenes, FixtureTemplate, FixtureVariables } from '@galcraft/contracts/fixtures';
import { compile, type CompileInput } from './compiler.js';
function input(required: boolean, defaultValue: number | null): CompileInput { return { projectId:FixtureProject.projectId,engineVersion:'0.1.0',lock:FixtureLock,project:FixtureProject,characters:FixtureCharacters,variables:FixtureVariables,assets:[],gallery:[],flows:[],template:FixtureTemplate,cancelOperationId:'Cancel',
  scenes:[FixtureScenes[0]!,{...FixtureScenes[1]!,locals:[{id:'ParamA',name:'amount',scope:'local',type:'number',initial:0}],parameters:[{variableId:'ParamA',required,defaultValue}]}],
  documents:[{documentId:'Script',revision:1,kind:'scene',sceneId:FixtureIds.street,text:`callScene {sceneId:"${FixtureIds.bookshop}",parameters:{}} @CallAA;`},{documentId:'Callee',revision:1,kind:'scene',sceneId:FixtureIds.bookshop,text:'return {} @RetAAA;'}] }; }
describe('call parameter omission',()=>{
  it('permits omission with a valid default under either legacy required flag',()=>{
    const optional=compile(input(false,3));expect(optional.issues).toEqual([]);expect(optional.snapshot).not.toBeNull();
    expect(compile(input(false,null)).issues).toContainEqual(expect.objectContaining({code:'CALL_ARGUMENT'}));
    expect(compile(input(true,3)).issues).toEqual([]);
    expect(compile(input(true,null)).issues).toContainEqual(expect.objectContaining({code:'CALL_ARGUMENT'}));
  });
  it('does not require a main character afterstory for compilation',()=>{
    const source=input(false,3);source.characters=[{...FixtureCharacters[0]!,narrativeRole:'main',personalRoute:{sceneIds:[],endingIds:[]}}];expect(compile(source).snapshot).not.toBeNull();
  });
});
