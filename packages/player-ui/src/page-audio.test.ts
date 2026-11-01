import { describe, expect, it } from 'vitest';
import { createId, ProjectSchema, SplashPlaybackSchema, TitleMusicPlaybackSchema, TitleVideoPlaybackSchema } from '@galcraft/contracts';
import type { AudioState, ResolvedAsset } from '@galcraft/contracts';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { AudioMixer } from '@galcraft/stage';
import { PageAudioController } from './page-audio.js';
import { PageNavigator } from './navigation.js';

class Source {
  buffer: AudioBuffer | null = null; loop = false; loopStart = 0; loopEnd = 0;
  onended: (() => void) | null = null; stopped = false; offset = 0;
  connect() {} disconnect() {} start(_when: number, offset: number) { this.offset = offset; } stop() { this.stopped = true; }
}
class Context {
  state = 'running'; currentTime = 0; destination = {}; sources: Source[] = [];
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  createAnalyser() { return { fftSize: 1024, connect() {}, disconnect() {}, getFloatTimeDomainData() {} }; }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  async resume() { this.state = 'running'; }
}
const settle = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };
const fixture = () => {
  const snapshot = structuredClone(FixtureSnapshot), prototype = snapshot.assets.find(item => item.kind === 'audio')!;
  const assets = ['home','stage','ambience','audition'].map(() => ({ ...prototype, assetId: createId() }));
  snapshot.assets.push(...assets); snapshot.project.display.titleMusic = assets[0]!.assetId;
  return { snapshot, assets };
};
const state = (asset: ResolvedAsset): AudioState => ({ assetId:asset.assetId,variantId:asset.variantId,stopped:false,volume:1,
  startSec:0,loop:false,loopStartSec:0,loopEndSec:null,fadeInMs:0,fadeOutMs:0 });

describe('page background ownership', () => {
  it('plays an explicit settings sample despite a system-page pause and restores background after natural end', async () => {
    const {snapshot}=fixture(),context=new Context(),audio=new AudioMixer(context as unknown as AudioContext,async()=>({duration:2}) as AudioBuffer);
    const controller=new PageAudioController(audio,snapshot,()=>{});controller.start();await settle();
    controller.setContext('settings',{kind:'home'},false,{systemPage:true});
    const sample=await controller.playSettingsAudition('sfx');expect(sample.ok).toBe(true);const source=context.sources.at(-1)!;expect(source.stopped).toBe(false);
    source.onended?.();controller.tick();expect(context.sources.at(-1)).not.toBe(source);
    controller.dispose();audio.dispose();
  });
  it('retains navigation audio through a nested chain and restores the pre-gallery stage reference', () => {
    const navigation = new PageNavigator(), sessionId = createId();
    navigation.replace('story',sessionId); navigation.open('settings',{sessionId}); navigation.open('cg'); navigation.open('load');
    expect(navigation.audioSource).toEqual({kind:'stage',sessionId}); navigation.back(); navigation.back(); navigation.back();
    navigation.open('music',{sessionId}); expect(navigation.audioSource).toEqual({kind:'home'});
    navigation.open('settings'); navigation.open('help'); expect(navigation.audioSource).toEqual({kind:'home'});
    navigation.back(); navigation.back(); expect(navigation.audioSource).toEqual({kind:'home'});
    navigation.back(); expect(navigation.audioSource).toEqual({kind:'stage',sessionId});
  });
  it('plays home, auditions, pause/resume and natural completion without losing the stage/ambience cursor', async () => {
    const {snapshot,assets}=fixture(), context=new Context();
    const audio=new AudioMixer(context as unknown as AudioContext,async id=>({duration:60,label:id}) as unknown as AudioBuffer);
    const controller=new PageAudioController(audio,snapshot,()=>{}), sessionId=createId();
    controller.start(); await settle(); context.currentTime=3;
    const stage=await audio.play({sessionId,bus:'bgm',state:state(assets[1]!)}), ambience=await audio.play({sessionId,bus:'ambience',state:state(assets[2]!)});
    if(!stage.ok||!ambience.ok)throw Error('stage setup');
    controller.setContext('story',{kind:'stage',sessionId},false); context.currentTime=8;
    controller.setContext('cg',{kind:'stage',sessionId},false);
    expect(audio.inspect({sessionId,source:{kind:'instance',id:stage.value}})).toMatchObject({ok:true,value:{status:'playing',positionSec:5}});
    controller.setContext('music',{kind:'home'},true);
    const homeOffset=context.sources.at(-1)!.offset; expect(homeOffset).toBe(3);
    await controller.playAudition(assets[3]!); expect(controller.audition.state).toBe('playing');
    context.currentTime=11; controller.pauseAudition(); expect(context.sources.at(-1)!.offset).toBe(3);
    await controller.resumeAudition(); expect(context.sources.at(-1)!.offset).toBe(3);
    audio.setPause('focus',true); audio.setPause('emergency',true); audio.setPause('focus',false);
    expect(controller.audition.state).toBe('playing'); expect(controller.auditionInspection()).toMatchObject({ok:true,value:{status:'paused'}});
    audio.setPause('emergency',false); context.sources.at(-1)!.onended?.(); controller.tick();
    expect(controller.audition.state).toBe('ended'); expect(context.sources.at(-1)!.offset).toBe(3);
    controller.setContext('story',{kind:'stage',sessionId},false);
    for(const id of [stage.value,ambience.value])expect(audio.inspect({sessionId,source:{kind:'instance',id}})).toMatchObject({ok:true,value:{status:'playing',positionSec:5}});
    controller.dispose(); audio.dispose();
  });
  it('pauses an audition before a child page and keeps it paused when returning', async () => {
    const {snapshot,assets}=fixture(), context=new Context(), audio=new AudioMixer(context as unknown as AudioContext,async()=>({duration:60}) as AudioBuffer);
    const controller=new PageAudioController(audio,snapshot,()=>{});
    controller.start(); await settle(); controller.setContext('music',{kind:'home'},true); await controller.playAudition(assets[3]!);
    context.currentTime=4; controller.setContext('settings',{kind:'home'},true);
    expect(controller.audition.state).toBe('paused'); controller.setContext('music',{kind:'home'},true);
    expect(controller.audition.state).toBe('paused'); expect(controller.auditionInspection()).toMatchObject({ok:true,value:{positionSec:4,userPaused:true}});
    await controller.resumeAudition(); expect(context.sources.at(-1)!.offset).toBe(4);
    controller.stopAudition(); expect(controller.auditionInspection()).toBeNull(); controller.dispose(); audio.dispose();
  });
  it('retains the audition through emergency and focus pauses until both are cleared', async () => {
    const {snapshot,assets}=fixture(), context=new Context(), audio=new AudioMixer(context as unknown as AudioContext,async()=>({duration:60}) as AudioBuffer);
    const controller=new PageAudioController(audio,snapshot,()=>{});
    controller.start(); await settle(); controller.setContext('music',{kind:'home'},true); await controller.playAudition(assets[3]!);
    context.currentTime=4;
    controller.setContext('emergency',{kind:'home'},true,{emergency:true});
    controller.setContext('emergency',{kind:'home'},true,{focus:true});
    expect(controller.audition.state).toBe('playing');
    expect(controller.auditionInspection()).toMatchObject({ok:true,value:{status:'paused',positionSec:4,userPaused:false,suppressed:false}});
    controller.setContext('music',{kind:'home'},true,{emergency:false,focus:true});
    expect(controller.auditionInspection()).toMatchObject({ok:true,value:{status:'paused',positionSec:4,userPaused:false}});
    controller.setContext('music',{kind:'home'},true,{focus:false});
    expect(controller.auditionInspection()).toMatchObject({ok:true,value:{status:'playing',positionSec:4,userPaused:false}});
    expect(context.sources.at(-1)!.offset).toBe(4);
    controller.dispose(); audio.dispose();
  });
  it('discards slow audition loading after exit and keeps slow home loading suppressed after story entry', async () => {
    const {snapshot,assets}=fixture(), context=new Context(); const pending=new Map<string,(buffer:AudioBuffer)=>void>();
    const audio=new AudioMixer(context as unknown as AudioContext,id=>new Promise(resolve=>pending.set(id,resolve)));
    const controller=new PageAudioController(audio,snapshot,()=>{}); controller.start(); controller.setContext('story',{kind:'stage',sessionId:createId()},false);
    pending.get(assets[0]!.assetId)!({duration:60} as AudioBuffer); await settle(); expect(context.sources).toHaveLength(0);
    controller.setContext('music',{kind:'home'},true); const playing=controller.playAudition(assets[3]!); await settle();
    controller.setContext('story',{kind:'stage',sessionId:createId()},false);
    pending.get(assets[3]!.assetId)!({duration:60} as AudioBuffer); await playing; expect(controller.auditionInspection()).toBeNull();
    expect(context.sources).toHaveLength(1); controller.dispose(); audio.dispose();
  });
  it('retains home audio after decode failure and does not treat zero volume as playback failure', async () => {
    const {snapshot,assets}=fixture(); snapshot.project.display.titleMusicPlayback=TitleMusicPlaybackSchema.parse({volume:0});
    const context=new Context(), audio=new AudioMixer(context as unknown as AudioContext,async id=>{
      if(id===assets[3]!.assetId)throw Error('bad audio');return{duration:60} as AudioBuffer;
    }); const controller=new PageAudioController(audio,snapshot,()=>{});
    controller.start(); await settle(); expect(controller.homeError).toBeNull(); controller.setContext('music',{kind:'home'},true);
    await controller.playAudition(assets[3]!); expect(controller.audition.state).toBe('failed'); expect(controller.audition.error).toContain('bad audio');
    expect(controller.homeError).toBeNull(); controller.dispose(); audio.dispose();
  });
  it('resumes the selected replacement after a child page cancels loading, without reviving the previous track', async () => {
    const {snapshot,assets}=fixture(),context=new Context();let decoded!:(value:AudioBuffer)=>void;
    const replacement={...assets[3]!,assetId:createId()};snapshot.assets.push(replacement);
    let slow=true;
    const audio=new AudioMixer(context as unknown as AudioContext,id=>id===replacement.assetId&&slow
      ?new Promise(resolve=>{decoded=resolve;}):Promise.resolve({duration:60} as AudioBuffer));
    const controller=new PageAudioController(audio,snapshot,()=>{});controller.start();await settle();controller.setContext('music',{kind:'home'},true);
    await controller.playAudition(assets[3]!);const pending=controller.playAudition(replacement);await settle();
    controller.setContext('settings',{kind:'home'},true);decoded({duration:60} as AudioBuffer);await pending;
    controller.setContext('music',{kind:'home'},true);slow=false;await controller.resumeAudition();
    expect(controller.auditionInspection()).toMatchObject({ok:true,value:{assetId:replacement.assetId,status:'playing'}});
    controller.dispose();audio.dispose();
  });
  it('accepts old display references and validates playback defaults and intervals', () => {
    expect(ProjectSchema.safeParse(FixtureSnapshot.project).success).toBe(true);
    expect(SplashPlaybackSchema.parse({})).toMatchObject({durationMs:1500,fadeInMs:250,allowSkip:true});
    expect(TitleVideoPlaybackSchema.parse({})).toMatchObject({volume:0,loop:true});
    expect(TitleMusicPlaybackSchema.parse({})).toMatchObject({volume:1,loop:true});
    expect(SplashPlaybackSchema.safeParse({startSec:4,endSec:3}).success).toBe(false);
    expect(TitleMusicPlaybackSchema.safeParse({loopStartSec:4,loopEndSec:3}).success).toBe(false);
  });
});
