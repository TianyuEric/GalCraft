import { describe, expect, it } from 'vitest';
import type { AudioState, VoicePlaybackBinding } from '@galcraft/contracts';
import { FixtureIds, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { AudioMixer } from './audio.js';

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
  async resume() {}
}
const asset = FixtureSnapshot.assets.find(item => item.assetId === FixtureIds.voices[0])!;
const state: AudioState = { assetId: asset.assetId, variantId: asset.variantId, stopped: false,
  volume: 1, startSec: 0, loop: false, loopStartSec: 0, loopEndSec: null, fadeInMs: 0, fadeOutMs: 0 };
const token = { sessionId: FixtureIds.session, occurrence: 1, statementId: FixtureIds.statements[0]! };
const binding: VoicePlaybackBinding = { token, resolution: { id: crypto.randomUUID(), source: FixtureSnapshot.scenes[0]!.instructions[0]!.source,
  requestedLocale: 'zh-CN', defaultLocale: 'zh-CN', attempts: [], selected: { assetId: asset.assetId,
    variantId: asset.variantId, locale: 'zh-CN', via: 'requestedLocale' } } };

describe('dialogue audio lifecycle', () => {
  it('releases ended one-shot buffers and nodes while preserving diagnostic metadata', async () => {
    const context = new Context(), buffer = { duration: 30 } as AudioBuffer;
    const audio = new AudioMixer(context as unknown as AudioContext, async () => buffer);
    const played = await audio.play({ sessionId: token.sessionId, bus: 'sfx', state }); if (!played.ok) throw played.error;
    const node = context.sources[0]!; node.onended!();
    expect(node.buffer).toBeNull(); expect(node.onended).toBeNull();
    expect(Reflect.get(audio, 'sources').get(played.value).buffer).toBeNull();
    expect(audio.inspect({ sessionId: token.sessionId, source: { kind: 'instance', id: played.value } })).toMatchObject({
      ok: true, value: { status: 'ended', durationSec: 30, positionSec: 30, assetId: state.assetId } });
    audio.dispose();
  });
  it('releases playing and ended replaced dialogue buffers and keeps the current voice replayable', async () => {
    const context = new Context(), buffers: AudioBuffer[] = [];
    const audio = new AudioMixer(context as unknown as AudioContext, async () => { const buffer = { duration: 30 } as AudioBuffer; buffers.push(buffer); return buffer; });
    const play = async (occurrence: number) => {
      const currentToken = { ...token, occurrence }, result = await audio.play({ sessionId: token.sessionId, bus: 'voice',
        token: currentToken, binding: { ...binding, token: currentToken }, state }); if (!result.ok) throw result.error; return result.value;
    };
    const first = await play(1), firstNode = context.sources[0]!, oldEnd = firstNode.onended!;
    const second = await play(2); oldEnd();
    expect(firstNode.buffer).toBeNull(); expect(Reflect.get(audio, 'sources').get(first).buffer).toBeNull();
    context.sources[1]!.onended!();
    expect(Reflect.get(audio, 'sources').get(second).buffer).toBe(buffers[1]);
    const replay = await play(2);
    expect(Reflect.get(audio, 'sources').get(second).buffer).toBeNull();
    expect(audio.inspect({ sessionId: token.sessionId, source: { kind: 'instance', id: replay } })).toMatchObject({ ok: true, value: { status: 'playing' } });
    audio.dispose();
  });
  it('detaches paused nodes while retaining current voice and explicit history preview buffers', async () => {
    const context = new Context(), buffer = { duration: 30 } as AudioBuffer;
    const audio = new AudioMixer(context as unknown as AudioContext, async () => buffer);
    const voice = await audio.play({ sessionId: token.sessionId, bus: 'voice', token, binding, state }); if (!voice.ok) throw voice.error;
    context.currentTime = 4; audio.setPause('history', true);
    expect(context.sources[0]!.buffer).toBeNull(); expect(context.sources[0]!.onended).toBeNull();
    expect(Reflect.get(audio, 'sources').get(voice.value).buffer).toBe(buffer);
    const preview = await audio.play({ sessionId: crypto.randomUUID(), bus: 'ui', state, preview: true }); if (!preview.ok) throw preview.error;
    context.sources[1]!.onended!();
    expect(Reflect.get(audio, 'sources').get(preview.value).buffer).toBe(buffer);
    audio.setPause('history', false); expect(context.sources[2]!.offset).toBe(4);
    audio.release(preview.value); expect(Reflect.get(audio, 'sources').has(preview.value)).toBe(false); audio.dispose();
  });
  it('lets a previous voice finish without retaining its buffer after an unvoiced dialogue', async () => {
    const context = new Context(), audio = new AudioMixer(context as unknown as AudioContext, async () => ({ duration: 30 }) as AudioBuffer);
    audio.setDuck(.35, false);
    const played = await audio.play({ sessionId: token.sessionId, bus: 'voice', token, binding, state }); if (!played.ok) throw played.error;
    audio.silence(token.sessionId); expect(context.sources[0]!.stopped).toBe(false);
    context.sources[0]!.onended!(); expect(Reflect.get(audio, 'sources').get(played.value).buffer).toBeNull(); audio.dispose();
  });
  it('returns a blocked interlude while resume awaits a gesture, and a late grant respects source disposal', async () => {
    const context=new Context();context.state='suspended';const grants:(()=>void)[]=[];
    context.resume=()=>new Promise<void>(resolve=>grants.push(()=>{context.state='running';resolve();}));
    const audio=new AudioMixer(context as unknown as AudioContext,async()=>({duration:30}) as AudioBuffer);
    const first=await audio.play({sessionId:token.sessionId,bus:'voice',voicePurpose:'interlude',state});if(!first.ok)throw first.error;
    expect(audio.inspect({sessionId:token.sessionId,source:{kind:'instance',id:first.value}})).toMatchObject({ok:true,value:{status:'paused',problems:['AUTOPLAY_BLOCKED']}});
    audio.release(first.value);grants.shift()!();await Promise.resolve();expect(context.sources).toHaveLength(0);
    context.state='suspended';const second=await audio.play({sessionId:token.sessionId,bus:'voice',voicePurpose:'interlude',state});if(!second.ok)throw second.error;
    const resumed=audio.resumeBlocked(second.value);grants.shift()!();grants.shift()!();await resumed;
    expect(context.sources).toHaveLength(1);expect(audio.inspect({sessionId:token.sessionId,source:{kind:'instance',id:second.value}})).toMatchObject({ok:true,value:{status:'playing',problems:[]}});audio.dispose();
  });
  it('selects background roles while retaining source cursors and independent pause reasons', async () => {
    const context = new Context();
    const audio = new AudioMixer(context as unknown as AudioContext, async () => ({ duration: 30 }) as AudioBuffer);
    const play = async (role: 'home'|'stage'|'audition', bus: 'bgm'|'ambience' = 'bgm') => {
      const result = await audio.play({ sessionId: token.sessionId, bus, backgroundRole: role, state });
      if (!result.ok) throw result.error; return result.value;
    };
    const stage = await play('stage'), ambience = await play('stage','ambience'), home = await play('home');
    const inspect = (id: string) => { const result = audio.inspect({ sessionId: token.sessionId, source: { kind: 'instance', id } });
      if (!result.ok) throw result.error; return result.value; };
    expect(inspect(home).status).toBe('paused'); expect(inspect(stage).status).toBe('playing');
    context.currentTime = 4; audio.setPause('systemPage',true);
    expect(inspect(stage).status).toBe('playing'); expect(inspect(ambience).status).toBe('playing');
    audio.setBackgroundRole('home');
    expect(inspect(stage).positionSec).toBe(4); expect(inspect(ambience).positionSec).toBe(4);
    const audition = await play('audition'); audio.setBackgroundRole('audition');
    context.currentTime = 7; audio.setPause('focus',true); audio.setPause('emergency',true); audio.setPause('debug',true);
    audio.setPause('focus',false); audio.setPause('emergency',false);
    expect(inspect(audition).status).toBe('paused'); expect(inspect(home).status).toBe('paused');
    audio.setPause('debug',false); expect(inspect(audition).status).toBe('playing');
    audio.setSourcePaused(audition,true); audio.setBackgroundRole('home'); expect(inspect(home).status).toBe('playing');
    audio.setSourcePaused(audition,false); audio.setBackgroundRole('audition'); expect(inspect(audition).positionSec).toBe(3);
    audio.release(audition); audio.setBackgroundRole('stage');
    expect(inspect(stage).positionSec).toBe(4); expect(inspect(ambience).positionSec).toBe(4);
    expect(inspect(stage).status).toBe('playing'); expect(inspect(home).status).toBe('paused'); audio.dispose();
  });
  it.each(['bgm','ambience'] as const)('invalidates a pending %s load on session disposal, even when that identity is used again', async bus => {
    const context = new Context(); let decoded!: (buffer: AudioBuffer) => void;
    const audio = new AudioMixer(context as unknown as AudioContext, () => new Promise(resolve => { decoded = resolve; }));
    const pending = audio.play({ sessionId: token.sessionId, bus, state });
    const oldDecoded = decoded; audio.disposeSession(token.sessionId);
    const next = audio.play({ sessionId: token.sessionId, bus, state });
    oldDecoded({duration:30} as AudioBuffer); const stale = await pending;
    expect(stale.ok || stale.error.code).toBe('AUDIO_STALE'); expect(context.sources).toHaveLength(0);
    decoded({duration:30} as AudioBuffer); expect((await next).ok).toBe(true); expect(context.sources).toHaveLength(1); audio.dispose();
  });
  it('prepares home audio without waiting for a browser autoplay grant and enables only its current role', async () => {
    const context = new Context(); context.state = 'suspended';
    const audio = new AudioMixer(context as unknown as AudioContext, async () => ({duration:30}) as AudioBuffer);
    audio.setBackgroundRole('home');
    const prepared = await audio.play({sessionId:token.sessionId,bus:'bgm',backgroundRole:'home',requestSound:false,state});
    if (!prepared.ok) throw prepared.error;
    const inspect = () => audio.inspect({sessionId:token.sessionId,source:{kind:'instance',id:prepared.value}});
    expect(inspect()).toMatchObject({ok:true,value:{status:'paused',problems:['AUTOPLAY_BLOCKED']}});
    audio.setBackgroundRole('stage'); context.resume = async () => { context.state = 'running'; };
    await audio.enableSound(); expect(context.sources).toHaveLength(0);
    audio.setBackgroundRole('home'); expect(context.sources).toHaveLength(1); audio.dispose();
  });
  it.each([true, false])('applies interruptOnSilent=%s to voice still decoding during a skip', async interrupt => {
    const context = new Context();
    let decoded!: (buffer: AudioBuffer) => void;
    const audio = new AudioMixer(context as unknown as AudioContext, () => new Promise(resolve => { decoded = resolve; }));
    audio.setDuck(.35, interrupt);
    const pending = audio.play({ sessionId: token.sessionId, bus: 'voice', token, binding, state });
    audio.silence(token.sessionId);
    decoded({ duration: 30 } as AudioBuffer);
    const played = await pending;
    expect(played.ok).toBe(!interrupt);
    if (!played.ok) expect(played.error.code).toBe('AUDIO_STALE');
    expect(context.sources).toHaveLength(interrupt ? 0 : 1);
    if (played.ok) { context.sources[0]!.onended!(); expect(Reflect.get(audio, 'sources').get(played.value).buffer).toBeNull(); }
    audio.dispose();
  });

  it('pauses voice on system pages and resumes from its cursor', async () => {
    const context = new Context();
    const audio = new AudioMixer(context as unknown as AudioContext, async () => ({ duration: 30 }) as AudioBuffer);
    const result = await audio.play({ sessionId: token.sessionId, bus: 'voice', token, binding, state });
    if (!result.ok) throw result.error;
    context.currentTime = 4;
    audio.setPause('systemPage', true);
    const paused = audio.inspect({ sessionId: token.sessionId, source: { kind: 'dialogue', token } });
    expect(paused.ok && paused.value.status).toBe('paused');
    expect(context.sources[0]!.stopped).toBe(true);
    audio.setPause('focus', true); audio.setPause('focus', false);
    expect(context.sources).toHaveLength(1);
    audio.setPause('systemPage', false);
    const resumed = audio.inspect({ sessionId: token.sessionId, source: { kind: 'dialogue', token } });
    expect(resumed.ok && resumed.value.status).toBe('playing');
    expect(context.sources[1]!.offset).toBe(4);
    audio.dispose();
  });
});
