import { describe, expect, it } from 'vitest';
import type { LongTerm } from '@galcraft/contracts';
import { FixtureIds, FixtureRuntimeState, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { readUIValue, evaluateUICondition } from '@galcraft/templates/editor';
import { playerVariableValues } from './variables.js';

const profile = ():LongTerm=>({schemaVersion:2,revision:0,readStatements:[],endings:[],cg:{},music:[],video:[],flowEntries:{},variables:{},plugins:{}});
describe('public story variable projection',()=>{
  it('uses stable identities and the active frame; updates and restored states replace progress without replacing the profile',()=>{
    const snapshot=structuredClone(FixtureSnapshot),state=structuredClone(FixtureRuntimeState),longTerm=profile();
    snapshot.variables.push({id:'PlyrAA',name:'同名变量',scope:'longTerm',type:'string',initial:'初始姓名'});
    snapshot.scenes[0]!.scene.locals.push({id:'LocalA',name:'同名变量',scope:'local',type:'boolean',initial:true});
    state.frames=[{id:'FrameA',sceneId:snapshot.scenes[0]!.scene.id,locals:{LocalA:false},returnTo:null,receiver:null},{id:'FrameB',sceneId:snapshot.scenes[1]!.scene.id,locals:{},returnTo:null,receiver:null}];
    const binding={source:'variable' as const,scope:'progress' as const,variableId:FixtureIds.relation};
    const read=()=>({data:{},local:{},variables:playerVariableValues(snapshot,state,longTerm)});
    expect(readUIValue(binding,read())).toBe(0);
    expect(readUIValue({...binding,scope:'local'},read())).toBeUndefined();
    expect(readUIValue({source:'variable',scope:'local',variableId:'LocalA'},read())).toBeUndefined();
    state.frames.pop();
    expect(readUIValue({source:'variable',scope:'local',variableId:'LocalA'},read())).toBe(false);
    state.progress[FixtureIds.relation]=20;
    expect(readUIValue(binding,read())).toBe(20);
    expect(evaluateUICondition({op:'greater',left:binding,right:{source:'literal',value:10}},read())).toBe(true);
    longTerm.variables.PlyrAA={value:'另一个名字',updatedAt:'2026-10-25T00:00:00Z'};
    state.progress=structuredClone(FixtureRuntimeState.progress);
    expect(readUIValue(binding,read())).toBe(0);
    expect(read().variables.longTerm.PlyrAA).toBe('另一个名字');
    expect(playerVariableValues(snapshot,undefined,longTerm)).toEqual({progress:{},local:{},longTerm:{PlyrAA:'另一个名字'}});
    expect(playerVariableValues(snapshot,state,profile()).longTerm.PlyrAA).toBe('初始姓名');
    snapshot.variables=snapshot.variables.filter(variable=>variable.id!==FixtureIds.relation);
    expect(readUIValue(binding,read())).toBeUndefined();
  });
});
