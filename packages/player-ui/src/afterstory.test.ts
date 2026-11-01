import {expect,it} from 'vitest';
import type {PlayerHost,SaveRecord} from '@galcraft/contracts';
import {FixtureDomains,FixtureSaveRecord} from '@galcraft/contracts/fixtures';
import {PlayerDataService} from './data.js';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { afterstoryDirectoryUnlocked, afterstoryUnlocked, afterstoryCharacters } from './afterstory.js';
it('opens the directory only for a main character route and unlocks each independent entry',()=>{
  const snapshot=structuredClone(FixtureSnapshot);
  snapshot.characters=snapshot.characters.slice(0,2).map((character,index)=>({...character,narrativeRole:'main',personalRoute:{sceneIds:[],endingIds:[`route-${index}`]},afterstory:{id:`Entry${index}`,title:'后日谈',cover:null,entry:snapshot.project.entry,initialProgress:{},unlockEndingIds:[`route-${index}`],lockedView:'locked'}}));
  expect(afterstoryDirectoryUnlocked(snapshot,[])).toBe(false);expect(afterstoryDirectoryUnlocked(snapshot,['other-ending'])).toBe(false);
  expect(afterstoryDirectoryUnlocked(snapshot,['route-0'])).toBe(true);expect(afterstoryUnlocked(snapshot.characters[1]!,['route-0'])).toBe(false);
  snapshot.characters[1]!.afterstory!.presentation={figure:{assetId:'Image1',variantId:null},crop:{x:0,y:0,width:1,height:1},order:-1};
  expect(afterstoryCharacters(snapshot)[0]!.id).toBe(snapshot.characters[1]!.id);
});
const ok=<T>(value:T)=>({ok:true as const,value,warnings:[]});
it('keeps ordinary continue and each afterstory continue in separate indexed records across reopening',async()=>{
  const disk=new Map<string,Uint8Array>();
  const host:Pick<PlayerHost,'storage'|'target'>={target:'web',storage:{read:async(key:string)=>ok(disk.get(key)??null),commit:async(input:Parameters<PlayerHost['storage']['commit']>[0])=>{input.writes.forEach(write=>disk.set(write.key,write.bytes));input.deletes.forEach(key=>disk.delete(key));return ok({revision:input.expectedRevision+1});}}};
  const data=new PlayerDataService(host,FixtureDomains[0]!,'zh-CN','zh-CN');await data.open();
  const save=async(id:string,entryId?:string)=>{const record:SaveRecord={...structuredClone(FixtureSaveRecord),recordId:id,kind:'continue'};
    record.state.story=entryId?{kind:'afterstory',entryId,characterId:'Hero01',title:entryId}:{kind:'main'};
    const result=await data.save({kind:'continue',record,expectedIndexRevision:data.current()!.index.revision});expect(result.ok).toBe(true);};
  await save('Main01');await save('After1','Entry1');await save('After2','Entry2');await save('After3','Entry1');
  const reopened=new PlayerDataService(host,FixtureDomains[0]!,'zh-CN','zh-CN');await reopened.open();
  expect(reopened.current()!.index.continueRecordId).toBe('Main01');expect(reopened.current()!.index.afterstoryRecords).toEqual({Entry1:'After3',Entry2:'After2'});
});
