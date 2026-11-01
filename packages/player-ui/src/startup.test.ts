import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId, SplashPlaybackSchema, StartupClipSchema, StartupSequenceSchema } from '@galcraft/contracts';
import type { PlayerHost } from '@galcraft/contracts';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { StartupPresentation } from './startup.js';

class Element {
  className='';dataset:Record<string,string>={};style:Record<string,string>={};tabIndex=0;children:Element[]=[];removed=false;
  src='';alt='';playsInline=false;volume=1;muted=false;currentTime=0;duration=10;ended=false;
  textContent='';
  onload:(()=>void)|null=null;onerror:(()=>void)|null=null;play=vi.fn(async()=>{});pause=vi.fn();load=vi.fn();
  listeners=new Map<string,()=>void>();constructor(readonly tag:string){}
  setAttribute(){}append(...elements:Element[]){this.children.push(...elements);}prepend(element:Element){this.children.unshift(element);}
  addEventListener(key:string,callback:()=>void){this.listeners.set(key,callback);}remove(){this.removed=true;}focus(){}removeAttribute(){}
}
afterEach(()=>vi.unstubAllGlobals());
const setup=(kind:'image'|'video'='image',deferred=false)=>{
  vi.stubGlobal('document',{createElement:(tag:string)=>new Element(tag)});
  const snapshot=structuredClone(FixtureSnapshot),asset=structuredClone(snapshot.assets.find(item=>item.kind==='image')!);asset.kind=kind;snapshot.assets=[asset];
  snapshot.project.display.splash=asset.assetId;const root=new Element('root'),finished=vi.fn(),error=vi.fn(),release=vi.fn();
  let resolve!:(value:unknown)=>void;const resources={resolve:vi.fn(()=>deferred?new Promise(value=>{resolve=value;}):Promise.resolve({ok:true,value:{uri:'local:fixture',release},warnings:[]}))};
  const startup=new StartupPresentation(root as unknown as HTMLElement,{resources} as unknown as PlayerHost,snapshot,finished,error);
  return{snapshot,root,startup,finished,error,release,resources,resolve:(value:unknown)=>resolve(value)};
};
describe('startup media lifecycle',()=>{
  it('keeps title text and black on one layer for 600ms hold and 1200ms reveal after preparation', async () => {
    const fixture=setup(),reveal=vi.fn();let prepared!:()=>void;
    const startup=new StartupPresentation(fixture.root as unknown as HTMLElement,{resources:fixture.resources} as unknown as PlayerHost,fixture.snapshot,fixture.finished,fixture.error,reveal,()=>new Promise<void>(resolve=>{prepared=resolve;}));
    fixture.snapshot.project.display.startupSequence=StartupSequenceSchema.parse({background:'#000000',revealMode:'withLastClip',clips:[{id:createId(),kind:'text',name:'title',text:{'zh-CN':'作品标题'},fadeInMs:0,holdMs:600,fadeOutMs:1200}]});
    const pending=startup.play(fixture.snapshot.project.display,false),overlay=fixture.root.children[0]!;
    startup.tick(5000);expect(overlay.children[0]!.style.opacity).toBe('1');expect(reveal).not.toHaveBeenCalled();
    prepared();await pending;startup.tick(600);expect(reveal).toHaveBeenCalledTimes(1);expect(overlay.style.opacity).toBe('1');
    startup.tick(600);expect(overlay.style.opacity).toBe('0.5');expect(overlay.children[0]!.style.opacity).toBe('1');expect(fixture.finished).not.toHaveBeenCalled();
    startup.tick(600);expect(fixture.finished).toHaveBeenCalledTimes(1);expect(overlay.removed).toBe(true);
  });
  it('consumes a skip during title preparation and hands off only once title is ready', async () => {
    const fixture=setup();let prepared!:()=>void;
    const startup=new StartupPresentation(fixture.root as unknown as HTMLElement,{resources:fixture.resources} as unknown as PlayerHost,fixture.snapshot,fixture.finished,fixture.error,()=>{},()=>new Promise<void>(resolve=>{prepared=resolve;}));
    fixture.snapshot.project.display.startupSequence=StartupSequenceSchema.parse({revealMode:'withLastClip',clips:[{id:createId(),kind:'text',name:'title',fadeInMs:0,holdMs:600,fadeOutMs:1200}]});
    const pending=startup.play(fixture.snapshot.project.display,false),event={code:'Escape',isComposing:false,preventDefault:vi.fn(),stopPropagation:vi.fn()} as unknown as KeyboardEvent;
    expect(startup.keydown(event)).toBe(true);expect(event.preventDefault).toHaveBeenCalled();expect(event.stopPropagation).toHaveBeenCalled();expect(fixture.finished).not.toHaveBeenCalled();
    prepared();await pending;expect(fixture.finished).toHaveBeenCalledTimes(1);expect(startup.active).toBe(false);
  });
  it('honors the final hold but finishes its joint reveal immediately with reduced motion', async () => {
    const fixture=setup();fixture.snapshot.project.display.startupSequence=StartupSequenceSchema.parse({revealMode:'withLastClip',clips:[{id:createId(),kind:'text',name:'title',fadeInMs:0,holdMs:600,fadeOutMs:1200}]});
    await fixture.startup.play(fixture.snapshot.project.display,true);fixture.startup.tick(599);expect(fixture.finished).not.toHaveBeenCalled();fixture.startup.tick(1);expect(fixture.finished).toHaveBeenCalledTimes(1);
  });
  it('runs overlapping native clips and starts home exactly at the final reveal, preserving pause and reading time', async () => {
    const fixture = setup(), reveal = vi.fn();
    const startup = new StartupPresentation(fixture.root as unknown as HTMLElement, { resources: fixture.resources } as unknown as PlayerHost, fixture.snapshot, fixture.finished, fixture.error, reveal);
    fixture.snapshot.project.display.startupSequence = StartupSequenceSchema.parse({ revealMs: 3000, clips: [
      StartupClipSchema.parse({ id: createId(), kind: 'text', name: 'notice', text: { 'zh-CN': '说明' }, fadeInMs: 100, holdMs: 60000, fadeOutMs: 100 }),
      StartupClipSchema.parse({ id: createId(), kind: 'color', name: 'overlap', color: '#123456', startMs: 100, fadeInMs: 100, holdMs: 100, fadeOutMs: 100 }),
    ] });
    await startup.play(fixture.snapshot.project.display, false);
    const overlay = fixture.root.children[0]!; startup.tick(150); expect(overlay.children[0]!.style.opacity).toBe('1'); expect(overlay.children[1]!.style.opacity).toBe('0.5');
    startup.setPaused(true); startup.tick(10000); startup.setPaused(false); startup.tick(60050);
    expect(reveal).toHaveBeenCalledTimes(1); expect(fixture.finished).not.toHaveBeenCalled(); startup.tick(1500); expect(overlay.style.opacity).toBe('0.5');
    startup.tick(1500); expect(fixture.finished).toHaveBeenCalledTimes(1); startup.skip(); expect(reveal).toHaveBeenCalledTimes(1);
  });
  it('accepts only physical Esc or contextmenu, consumes a disabled skip, and emits no skip button', async () => {
    const fixture = setup(); fixture.snapshot.project.display.startupSequence = StartupSequenceSchema.parse({ clips: [StartupClipSchema.parse({ id: createId(), kind: 'text', name: 'notice' })] });
    await fixture.startup.play(fixture.snapshot.project.display, false); const overlay = fixture.root.children[0]!;
    expect(overlay.children.some(child => child.tag === 'button')).toBe(false); expect(overlay.listeners.has('pointerup')).toBe(false);
    for (const code of ['Enter', 'KeyA']) fixture.startup.keydown({ key: 'Escape', code, isComposing: false } as KeyboardEvent);
    expect(fixture.finished).not.toHaveBeenCalled();
    const event = { code: 'Escape', isComposing: false, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent;
    fixture.startup.keydown(event); fixture.startup.keydown(event); expect(fixture.finished).toHaveBeenCalledTimes(1);
  });
  it('releases a late native clip once after an allowed skip and never revives its video or image', async () => {
    const fixture = setup('image', true); fixture.snapshot.project.display.startupSequence = StartupSequenceSchema.parse({ clips: [StartupClipSchema.parse({ id: createId(), kind: 'image', name: 'late', assetId: fixture.snapshot.assets[0]!.assetId })] });
    const pending = fixture.startup.play(fixture.snapshot.project.display, false); fixture.startup.skip(); fixture.startup.skip();
    fixture.resolve({ ok: true, value: { uri: 'late:fixture', release: fixture.release }, warnings: [] }); await pending;
    expect(fixture.finished).toHaveBeenCalledTimes(1); expect(fixture.release).toHaveBeenCalledTimes(1); expect(fixture.startup.active).toBe(false);
  });
  it('enters home without a blank wait when no splash is configured',async()=>{
    const fixture=setup();fixture.snapshot.project.display.splash=null;await fixture.startup.play(fixture.snapshot.project.display,false);
    expect(fixture.finished).toHaveBeenCalledTimes(1);expect(fixture.resources.resolve).not.toHaveBeenCalled();expect(fixture.startup.active).toBe(false);
  });
  it('keeps reduced-motion reading time while removing image fades',async()=>{
    const fixture=setup();await fixture.startup.play(fixture.snapshot.project.display,true);fixture.root.children[0]!.children[0]!.onload?.();
    fixture.startup.tick(1499);expect(fixture.finished).not.toHaveBeenCalled();fixture.startup.tick(1);
    expect(fixture.finished).toHaveBeenCalledTimes(1);expect(fixture.release).toHaveBeenCalledTimes(1);fixture.startup.tick(1000);expect(fixture.finished).toHaveBeenCalledTimes(1);
  });
  it('freezes image reading and fade time during pause and consumes startup skip independently',async()=>{
    const fixture=setup();await fixture.startup.play(fixture.snapshot.project.display,false);const overlay=fixture.root.children[0]!;overlay.children[0]!.onload?.();
    fixture.startup.tick(125);expect(overlay.style.opacity).toBe('0.5');fixture.startup.setPaused(true);fixture.startup.tick(10000);
    expect(overlay.style.opacity).toBe('0.5');fixture.startup.setPaused(false);fixture.startup.tick(125);expect(overlay.style.opacity).toBe('1');
    const event={key:'Escape',code:'Escape',isComposing:false,preventDefault:vi.fn(),stopPropagation:vi.fn()};expect(fixture.startup.keydown(event as unknown as KeyboardEvent)).toBe(true);
    expect(fixture.finished).toHaveBeenCalledTimes(1);expect(event.preventDefault).toHaveBeenCalled();
  });
  it('honors a disabled skip and completes at the configured image duration',async()=>{
    const fixture=setup();fixture.snapshot.project.display.splashPlayback=SplashPlaybackSchema.parse({allowSkip:false,durationMs:100,fadeInMs:0,fadeOutMs:0});
    await fixture.startup.play(fixture.snapshot.project.display,false);fixture.root.children[0]!.children[0]!.onload?.();fixture.startup.skip();
    expect(fixture.finished).not.toHaveBeenCalled();fixture.startup.tick(100);expect(fixture.finished).toHaveBeenCalledTimes(1);
  });
  it('releases a resource that arrives after the startup was skipped or the window closed',async()=>{
    const fixture=setup('image',true);const pending=fixture.startup.play(fixture.snapshot.project.display,false);fixture.startup.skip();fixture.startup.stop();
    fixture.resolve({ok:true,value:{uri:'late:fixture',release:fixture.release},warnings:[]});await pending;
    expect(fixture.release).toHaveBeenCalledTimes(1);expect(fixture.finished).toHaveBeenCalledTimes(1);expect(fixture.root.children[0]!.children.some(item=>item.tag==='img')).toBe(false);
  });
  it('plays a legal video segment once and preserves its pause boundary',async()=>{
    const fixture=setup('video');fixture.snapshot.project.display.splashPlayback=SplashPlaybackSchema.parse({startSec:2,endSec:4});
    await fixture.startup.play(fixture.snapshot.project.display,false);const video=fixture.root.children[0]!.children[0]!;video.listeners.get('loadedmetadata')?.();
    expect(video.currentTime).toBe(2);expect(video.play).toHaveBeenCalledTimes(1);fixture.startup.setPaused(true);video.currentTime=4;fixture.startup.tick(1000);
    expect(fixture.finished).not.toHaveBeenCalled();fixture.startup.setPaused(false);fixture.startup.tick(1);expect(fixture.finished).toHaveBeenCalledTimes(1);
    expect(fixture.release).toHaveBeenCalledTimes(1);expect(video.pause).toHaveBeenCalled();
  });
  it('recovers to home with a local diagnostic when the image cannot be read',async()=>{
    const fixture=setup();await fixture.startup.play(fixture.snapshot.project.display,false);fixture.root.children[0]!.children[0]!.onerror?.();
    expect(fixture.error).toHaveBeenCalledWith('开屏图片读取失败');expect(fixture.finished).toHaveBeenCalledTimes(1);expect(fixture.startup.active).toBe(false);
  });
});
