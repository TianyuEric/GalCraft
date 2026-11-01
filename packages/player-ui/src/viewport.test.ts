import { afterEach, expect, test, vi } from 'vitest';
import type { PlayerHost } from '@galcraft/contracts';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';

const mocks=vi.hoisted(()=>({viewport:vi.fn(),start:vi.fn(),resized:null as null|(()=>void)}));
vi.mock('@galcraft/stage',async importOriginal=>({...await importOriginal<typeof import('@galcraft/stage')>(),
  StageController:class {static async create(){return{setViewport:mocks.viewport,onCompletion:()=>{},dispose:()=>{}};}},
  AudioMixer:class {setLevels(){}setDuck(){}},
  VideoController:class {},
}));
vi.mock('./view.js',()=>({PlayerView:class {constructor(readonly options:unknown){}async start(){mocks.start();}render(){}}}));
import { mountPlayer } from './bootstrap.js';

afterEach(()=>{vi.unstubAllGlobals();mocks.viewport.mockClear();mocks.start.mockClear();mocks.resized=null;});
test('mounted Player uses local dimensions at fit scale and follows actual local resize',async()=>{
  vi.stubGlobal('document',{createElement:()=>({append:()=>{}}),addEventListener:()=>{},removeEventListener:()=>{}});
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  vi.stubGlobal('AudioContext',class {async close(){}});
  vi.stubGlobal('requestAnimationFrame',()=>0);
  vi.stubGlobal('ResizeObserver',class {constructor(callback:()=>void){mocks.resized=callback;}observe(){}disconnect(){}});
  const transformedBounds=vi.fn(()=>({width:480,height:270}));
  const clipped=vi.fn();
  const root={append:()=>{},style:{},classList:{add:clipped},clientWidth:1920,clientHeight:1080,getBoundingClientRect:transformedBounds} as unknown as HTMLElement;
  const success=<T>(value:T)=>({ok:true as const,value,warnings:[]});
  const storage:PlayerHost['storage']={read:async()=>success(null),commit:async batch=>success({revision:batch.expectedRevision+1})};
  const host={target:'web',storage,subscribeLifecycle:()=>()=>{}} as unknown as PlayerHost;
  const mounted=await mountPlayer(root,host,structuredClone(FixtureSnapshot));expect(mounted.ok).toBe(true);
  expect(mocks.viewport).toHaveBeenLastCalledWith({x:0,y:0,width:1920,height:1080});
  expect(clipped).toHaveBeenCalledWith('galcraft-player');
  expect(root.style.overflow).toBe('hidden');
  expect(mocks.viewport.mock.invocationCallOrder[0]).toBeLessThan(mocks.start.mock.invocationCallOrder[0]!);
  expect(transformedBounds).not.toHaveBeenCalled();
  Object.assign(root,{clientWidth:800,clientHeight:450});mocks.resized!();
  expect(mocks.viewport).toHaveBeenLastCalledWith({x:0,y:0,width:800,height:450});
});
