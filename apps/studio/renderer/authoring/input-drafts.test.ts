import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputDraftStore } from './input-drafts.js';
import type { AuthoringServices } from './controller.js';

const ok = <T>(value:T) => ({ok:true as const,value,warnings:[]});
describe('M01 retained input transport',()=>{
  beforeEach(()=>{vi.useFakeTimers();const values=new Map<string,string>();vi.stubGlobal('location',{search:'?entry=browser'});vi.stubGlobal('sessionStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});});
  afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
  it('retains the original project and actual fields when switching before a pending write completes',async()=>{
    const writes:unknown[]=[];let unblock!:()=>void;
    const first=new Promise<void>(resolve=>{unblock=resolve;});
    const api={writeInputDraft:vi.fn(async(draft:unknown)=>{writes.push(draft);if(writes.length===1)await first;return ok(undefined);})} as unknown as AuthoringServices['bridge']['authoringPreferences'];
    const store=new InputDraftStore(api,()=>{}),content={text:'unfinished first project',number:'-'};
    store.schedule('firstProject',content);content.text='changed after capture';
    store.schedule('secondProject',{text:'second project'});
    await Promise.resolve();unblock();await store.flush();
    expect(writes).toMatchObject([{projectId:'firstProject',entry:'browser',content:{text:'unfinished first project',number:'-'}},{projectId:'secondProject',entry:'browser',content:{text:'second project'}}]);
  });
  it('writes while the client is open and reads its stable client identity',async()=>{
    const writeInputDraft=vi.fn(async()=>ok(undefined)),readInputDraft=vi.fn(async(_input:unknown)=>ok({content:{draft:'actual text'}}));
    const store=new InputDraftStore({writeInputDraft,readInputDraft} as unknown as AuthoringServices['bridge']['authoringPreferences'],()=>{});
    store.schedule('work',{draft:'actual text'});await vi.advanceTimersByTimeAsync(200);
    expect(writeInputDraft).toHaveBeenCalledTimes(1);
    expect(await store.read('work')).toEqual({draft:'actual text'});
    expect(readInputDraft.mock.calls[0]?.[0]).toMatchObject({projectId:'work',entry:'browser',clientId:sessionStorage.getItem('galcraft.studio.client.browser')});
  });
});
