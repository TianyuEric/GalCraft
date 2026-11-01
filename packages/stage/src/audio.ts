import { createId } from '@galcraft/contracts';
import type { AudioState, ExecutionToken, Id, Issue, Result, VoicePlaybackBinding, VoiceResolution } from '@galcraft/contracts';
import { fail, ok } from './common.js';
import type { VoicePCM } from '@galcraft/plugins/contracts';

export type AudioBus = 'bgm' | 'ambience' | 'sfx' | 'voice' | 'ui' | 'video';
export type BackgroundRole = 'home' | 'stage' | 'audition';
export type PauseReason = 'systemPage' | 'history' | 'gallery' | 'video' | 'focus' | 'emergency' | 'debug';
export type AudioInspection = { sessionId: Id; sourceId: Id; token: ExecutionToken | null; assetId: Id; variantId: Id;
  bus: AudioBus; backgroundRole: BackgroundRole; positionSec: number; durationSec: number; suppressed: boolean; userPaused: boolean;
  voiceResolution: VoiceResolution | null; status: 'loading' | 'playing' | 'paused' | 'stopped' | 'ended' | 'failed';
  audioContext: AudioContextState; fade: { kind: 'in' | 'out'; elapsedMs: number; durationMs: number } | null;
  gains: { source: number; category: number; master: number; duck: number; effective: number };
  pauses: PauseReason[]; problems: ('SOURCE_ZERO' | 'CATEGORY_ZERO' | 'MASTER_ZERO' | 'AUTOPLAY_BLOCKED' | 'RESOURCE_MISSING' | 'LOAD_FAILED' | 'DECODE_FAILED')[];
  issues: Issue[] };
type Media = { preview:boolean; id: Id; sessionId: Id; assetId: Id; variantId: Id; bus: AudioBus; state: AudioState; role: BackgroundRole; userPaused: boolean;
  token: ExecutionToken | null; binding: VoicePlaybackBinding | null; buffer: AudioBuffer | null; durationSec: number; retainBuffer: boolean; source: AudioBufferSourceNode | null;
  gain: GainNode; cursor: number; startedAt: number; status: AudioInspection['status']; generation: number;
  fade: AudioInspection['fade']; fadeGain: number; blocked: boolean; duck: boolean; replaced: Id[]; issues: Issue[] };
const pauseBuses: Record<PauseReason, AudioBus[]> = {
  systemPage: ['voice', 'sfx', 'video'], history: ['voice', 'sfx'], gallery: ['bgm', 'ambience', 'voice', 'sfx'],
  video: ['bgm', 'ambience', 'voice', 'sfx'], focus: ['bgm', 'ambience', 'sfx', 'voice', 'ui', 'video'],
  emergency: ['bgm', 'ambience', 'sfx', 'voice', 'ui', 'video'], debug: ['bgm', 'ambience', 'sfx', 'voice', 'ui', 'video'],
};
const sameToken = (a: ExecutionToken | null, b: ExecutionToken) => a?.sessionId === b.sessionId && a.occurrence === b.occurrence && a.statementId === b.statementId;

export class AudioMixer {
  private readonly master: GainNode;
  private readonly voiceAnalyser: AnalyserNode;
  private readonly voiceSamples: Float32Array<ArrayBuffer>;
  private readonly buses = new Map<AudioBus, GainNode>();
  private readonly levels = new Map<AudioBus, number>();
  private readonly sources = new Map<Id, Media>();
  private readonly requests = new Map<string, number>();
  private readonly pauses = new Set<PauseReason>();
  private backgroundRole: BackgroundRole | null = 'stage';
  private disposed = false;
  private masterLevel = 1;
  private outputMuted = false;
  private duckFactor = 0.35;
  private interruptOnSilent = true;
  private duckCurrent = 1;
  private duckFrom = 1;
  private duckTo = 1;
  private duckElapsed = 0;
  private duckDuration = 0;
  private pcmSource: Id | null = null;
  private pcmPosition = 0;
  constructor(private readonly context: AudioContext,
    private readonly load: (assetId: Id, variantId: Id) => Promise<AudioBuffer>) {
    this.master = context.createGain(); this.master.connect(context.destination);
    for (const bus of ['bgm', 'ambience', 'sfx', 'voice', 'ui', 'video'] as AudioBus[]) {
      const gain = context.createGain(); gain.connect(this.master); this.buses.set(bus, gain); this.levels.set(bus, 1);
    }
    this.voiceAnalyser = context.createAnalyser(); this.voiceAnalyser.fftSize = 1024;
    this.voiceSamples = new Float32Array(this.voiceAnalyser.fftSize);
    this.voiceAnalyser.connect(this.buses.get('voice')!);
  }
  setLevels(master: number, categories: Partial<Record<AudioBus, number>>) {
    this.masterLevel = Math.max(0, master); this.master.gain.value = this.outputMuted ? 0 : this.masterLevel;
    for (const [bus, level] of Object.entries(categories) as [AudioBus, number][]) this.levels.set(bus, Math.max(0, level));
    this.refreshGains();
  }
  setOutputMuted(muted: boolean) { this.outputMuted = muted; this.master.gain.value = muted ? 0 : this.masterLevel; }
  setDuck(factor: number, interruptOnSilent = true) { this.duckFactor = Math.max(0, factor); this.interruptOnSilent = interruptOnSilent; this.refreshGains(); }
  private refreshGains() {
    const speaking = [...this.sources.values()].some(item => item.duck && item.status === 'playing');
    const target = speaking ? this.duckFactor : 1;
    if (target !== this.duckTo) { this.duckFrom = this.duckCurrent; this.duckTo = target; this.duckElapsed = 0; this.duckDuration = speaking ? 100 : 250; }
    this.applyBusGains();
  }
  private applyBusGains() { for (const [bus, node] of this.buses)
    node.gain.value = (this.levels.get(bus) ?? 1) * (bus === 'bgm' ? this.duckCurrent : 1); }
  private paused(bus: AudioBus) { return [...this.pauses].some(reason => pauseBuses[reason].includes(bus)); }
  private suppressed(item: Media) { return (item.bus === 'bgm' || item.bus === 'ambience') && item.role !== this.backgroundRole; }
  private itemPaused(item: Media) { return [...this.pauses].some(reason=>pauseBuses[reason].includes(item.bus)&&!(item.preview&&['systemPage','history','video','gallery'].includes(reason))) || this.suppressed(item) || item.userPaused; }
  private detachSource(item: Media) {
    item.generation++; const source = item.source; item.source = null;
    if (source) { source.onended = null; source.stop(); source.disconnect(); source.buffer = null; }
  }
  private releaseBuffer(item: Media) { item.buffer = null; item.gain.disconnect(); }
  private createSource(item: Media) {
    if (!item.buffer) return;
    if (this.context.state !== 'running') { item.blocked = true; item.status = 'paused'; return; }
    const source = this.context.createBufferSource(); source.buffer = item.buffer;
    source.loop = item.state.loop;
    if (item.state.loop) { source.loopStart = item.state.loopStartSec; source.loopEnd = item.state.loopEndSec ?? item.durationSec; }
    source.connect(item.gain); item.generation++; const generation = item.generation;
    source.onended = () => { if (item.generation === generation && item.status === 'playing') {
      item.cursor = item.durationSec; item.status = 'ended'; item.source = null; source.onended = null; source.disconnect(); source.buffer = null;
      if (!item.retainBuffer) this.releaseBuffer(item); this.refreshGains();
    } };
    if (item.state.loop) { const end = item.state.loopEndSec ?? item.durationSec, start = item.state.loopStartSec;
      if (item.cursor >= end) item.cursor = start + ((item.cursor - start) % (end - start)); }
    item.source = source; item.startedAt = this.context.currentTime; source.start(0, item.cursor); item.status = 'playing';
    if (item.state.fadeInMs > 0 && item.cursor === item.state.startSec) {
      item.fade = { kind: 'in', elapsedMs: 0, durationMs: item.state.fadeInMs }; item.fadeGain = 0; item.gain.gain.value = 0;
    }
    this.refreshGains();
    for (const old of item.replaced) this.stop(old);
    item.replaced = [];
  }
  async play(input: { sessionId: Id; bus: AudioBus; state: AudioState; token?: ExecutionToken | null;
    binding?: VoicePlaybackBinding | null; replace?: boolean; preview?: boolean; backgroundRole?: BackgroundRole;
    requestSound?: boolean; voicePurpose?: 'interlude' }): Promise<Result<Id>> {
    const { state, bus } = input;
    if (state.stopped || !state.assetId || !state.variantId) return fail('AUDIO_RESOURCE', '声音请求缺少可播放素材');
    if (bus === 'voice' && input.voicePurpose !== 'interlude') {
      const selection = input.binding?.resolution.selected;
      if (!input.binding || !input.token || !sameToken(input.binding.token, input.token) ||
        selection?.assetId !== state.assetId || selection.variantId !== state.variantId)
        return fail('VOICE_BINDING', '对白声源与本次令牌或解析素材不一致');
    }
    const exclusive = input.replace || bus === 'bgm' || bus === 'voice' || bus === 'ui';
    if (this.disposed) return fail('AUDIO_STALE', '播放器已关闭');
    const role = input.backgroundRole ?? 'stage';
    const requestKey = exclusive ? `${input.sessionId}:${bus}${role === 'stage' ? '' : `:${role}`}` : null;
    const lifetimeKey = `${input.sessionId}:lifetime`;
    const replayKey = `${input.sessionId}:voiceReplay`, replay = this.requests.get(replayKey) ?? 0;
    const lifetime = this.requests.get(lifetimeKey) ?? 0; this.requests.set(lifetimeKey, lifetime);
    const request = requestKey ? (this.requests.get(requestKey) ?? 0) + 1 : 0;
    if (requestKey) this.requests.set(requestKey, request);
    let buffer: AudioBuffer;
    try { buffer = await this.load(state.assetId, state.variantId); }
    catch (error) { return fail('AUDIO_LOAD_FAILED', String(error)); }
    if (this.disposed || this.requests.get(lifetimeKey) !== lifetime || requestKey && this.requests.get(requestKey) !== request)
      return fail('AUDIO_STALE', '旧声音请求已失效');
    if (state.startSec < 0 || state.startSec >= buffer.duration || state.loopStartSec < 0 ||
      state.loopStartSec >= buffer.duration || (state.loopEndSec !== null && (state.loopEndSec > buffer.duration || state.loopEndSec <= state.loopStartSec)))
      return fail('AUDIO_RANGE', '声音切入或循环区间超出解码时长');
    const replaced = exclusive ? [...this.sources.values()]
      .filter(item => item.sessionId === input.sessionId && item.bus === bus && item.role === role && item.buffer) : [];
    let blocked = false, resume:Promise<void>|null=null;
    if ((input.preview || !this.paused(bus)) && this.context.state === 'suspended') {
      // Browsers can leave resume() pending until a real gesture. Publish the blocked
      // source now so the owner can offer its recovery control.
      blocked=true;
      if(input.requestSound!==false)try{resume=this.context.resume();blocked=(this.context.state as AudioContextState)!=='running';}catch{}
    }
    if (this.disposed || this.requests.get(lifetimeKey) !== lifetime || requestKey && this.requests.get(requestKey) !== request)
      return fail('AUDIO_STALE', '旧声音请求已失效');
    const gain = this.context.createGain(); gain.gain.value = state.volume;
    gain.connect(bus === 'voice' ? this.voiceAnalyser : this.buses.get(bus)!);
    const item: Media = { preview:!!input.preview, id: createId(), sessionId: input.sessionId, assetId: state.assetId, variantId: state.variantId, bus,
      state: structuredClone(state), token: input.token ?? null, binding: input.binding ? structuredClone(input.binding) : null,
      buffer, durationSec: buffer.duration, retainBuffer: bus === 'bgm' || bus === 'ambience' || Boolean(input.preview) ||
        Boolean(input.binding && (this.requests.get(replayKey) ?? 0) === replay),
      source: null, gain, cursor: state.startSec, startedAt: 0, status: 'loading', generation: 0, fade: null,
      fadeGain: 1, blocked, role, userPaused: false, duck: bus === 'voice' || Boolean(input.preview), replaced: replaced.map(value => value.id), issues: [] };
    this.sources.set(item.id, item);
    for (const old of replaced) if (old.status === 'ended' || old.status === 'stopped') this.stop(old.id);
    if(resume)void resume.then(()=>{
      if(this.disposed||this.sources.get(item.id)!==item||this.requests.get(lifetimeKey)!==lifetime||requestKey&&this.requests.get(requestKey)!==request||this.context.state!=='running')return;
      item.blocked=false;if(item.status==='paused'&&!this.itemPaused(item))this.createSource(item);
    }).catch(()=>{});
    if (blocked) { item.status = 'paused'; return { ok: true, value: item.id, warnings: [{ code: 'AUTOPLAY_BLOCKED', severity: 'warning',
      message: '浏览器阻止自动播放，点击后重试', owner: 'M06', related: [], actions: ['retry'] }] }; }
    if (this.itemPaused(item)) item.status = 'paused';
    else try { this.createSource(item); }
    catch (error) { this.sources.delete(item.id); item.gain.disconnect(); return fail('AUDIO_PLAY_FAILED', String(error)); }
    return ok(item.id);
  }
  silence(sessionId: Id) {
    const replayKey = `${sessionId}:voiceReplay`; this.requests.set(replayKey, (this.requests.get(replayKey) ?? 0) + 1);
    for (const item of this.sources.values()) if (item.sessionId === sessionId && item.bus === 'voice' && !item.preview) {
      item.retainBuffer = false; if (item.status === 'ended') this.releaseBuffer(item);
    }
    if (!this.interruptOnSilent) return;
    const requestKey = `${sessionId}:voice`;
    this.requests.set(requestKey, (this.requests.get(requestKey) ?? 0) + 1);
    for (const item of this.sources.values()) if (item.sessionId === sessionId && item.bus === 'voice') this.stop(item.id);
  }
  stop(sourceId: Id, fadeOutMs = 0) {
    const item = this.sources.get(sourceId); if (!item) return;
    if (fadeOutMs > 0 && item.status === 'playing') { item.fade = { kind: 'out', elapsedMs: 0, durationMs: fadeOutMs }; return; }
    this.detachSource(item); this.releaseBuffer(item);
    item.status = 'stopped'; item.cursor = item.state.startSec; item.fade = null; item.fadeGain = 1; this.refreshGains();
  }
  tick(deltaMs: number) {
    if (this.pauses.has('emergency')) return;
    const step = Math.max(0, deltaMs);
    if (this.duckCurrent !== this.duckTo) {
      this.duckElapsed = Math.min(this.duckDuration, this.duckElapsed + step);
      this.duckCurrent = this.duckFrom + (this.duckTo - this.duckFrom) * (this.duckElapsed / this.duckDuration);
      this.applyBusGains();
    }
    for (const item of this.sources.values()) if (item.fade && item.status === 'playing') {
      item.fade.elapsedMs = Math.min(item.fade.durationMs, item.fade.elapsedMs + step);
      const portion = item.fade.durationMs === 0 ? 1 : item.fade.elapsedMs / item.fade.durationMs;
      item.fadeGain = item.fade.kind === 'in' ? portion : 1 - portion;
      item.gain.gain.value = item.state.volume * item.fadeGain;
      if (portion === 1) { const fade = item.fade; item.fade = null; if (fade.kind === 'out') this.stop(item.id); }
    }
  }
  setPause(reason: PauseReason, enabled: boolean) {
    if (enabled) this.pauses.add(reason); else this.pauses.delete(reason);
    if (reason === 'video' && enabled) for (const item of this.sources.values())
      if ((item.bus === 'voice' || item.bus === 'sfx') && item.status === 'playing') this.stop(item.id);
    this.reconcileSources();
  }
  /** Selects existing background instances; their bus volume and playback cursors stay intact. */
  setBackgroundRole(role: BackgroundRole | null, pauses: Partial<Record<PauseReason, boolean>> = {}) {
    this.backgroundRole = role;
    for (const [reason, enabled] of Object.entries(pauses) as [PauseReason,boolean][]) {
      if (enabled) this.pauses.add(reason); else this.pauses.delete(reason);
    }
    this.reconcileSources();
  }
  seek(sourceId: Id, seconds: number): void {
    const item = this.sources.get(sourceId); if (!item?.buffer || !Number.isFinite(seconds)) return;
    const playing = item.status === 'playing'; this.detachSource(item); item.status='paused';
    item.cursor = Math.max(0, Math.min(seconds, item.durationSec));
    if(item.state.loop){const end=item.state.loopEndSec??item.durationSec,start=item.state.loopStartSec;
      if(item.cursor>=end)item.cursor=start+(item.cursor-start)%(end-start);}
    if(item.cursor>=item.durationSec){item.status='ended';if(!item.retainBuffer)this.releaseBuffer(item);}
    else if (playing && !this.itemPaused(item)) this.createSource(item);
  }
  setSourceVolume(sourceId:Id,volume:number){const item=this.sources.get(sourceId);if(!item||!Number.isFinite(volume))return;item.state.volume=Math.max(0,Math.min(volume,1));item.gain.gain.value=item.state.volume*item.fadeGain;}
  setSourcePaused(sourceId: Id, paused: boolean) { const item = this.sources.get(sourceId); if (!item) return;
    item.userPaused = paused; this.reconcileSources(); }
  setLoop(sourceId: Id, loop: boolean) { const item = this.sources.get(sourceId); if (!item) return;
    item.state.loop = loop; if (item.source) { item.source.loop = loop; item.source.loopStart = item.state.loopStartSec;
      item.source.loopEnd = item.state.loopEndSec ?? item.durationSec; } }
  private reconcileSources() {
    for (const item of this.sources.values()) {
      if (this.itemPaused(item) && item.status === 'playing') {
        item.cursor += this.context.currentTime - item.startedAt; this.detachSource(item); item.status = 'paused';
      } else if (!this.itemPaused(item) && item.status === 'paused' && !item.blocked) this.createSource(item);
    }
    this.refreshGains();
  }
  async resumeBlocked(sourceId: Id): Promise<Result<void>> {
    const item = this.sources.get(sourceId); if (!item) return fail('AUDIO_SOURCE_GONE', '声源已释放');
    if (!item.blocked) return ok(undefined);
    try { await this.context.resume();
      if (this.disposed || this.sources.get(sourceId) !== item) return fail('AUDIO_SOURCE_GONE', '声源已释放');
      if (this.context.state !== 'running') return fail('AUTOPLAY_BLOCKED', '浏览器仍阻止自动播放');
      item.blocked = false; if (!this.itemPaused(item) && item.status === 'paused') this.createSource(item);
      return ok(undefined); }
    catch { return fail('AUTOPLAY_BLOCKED', '浏览器仍阻止自动播放'); }
  }
  inspect(input: { sessionId: Id; source: { kind: 'instance'; id: Id } | { kind: 'dialogue'; token: ExecutionToken } }): Result<AudioInspection> {
    const requested = input.source;
    const item = requested.kind === 'instance' ? this.sources.get(requested.id) :
      [...this.sources.values()].reverse().find(value => value.sessionId === input.sessionId && value.bus === 'voice' && sameToken(value.token, requested.token));
    if (!item || item.sessionId !== input.sessionId) return fail('AUDIO_SOURCE_GONE', '声源已释放');
    const source = item.state.volume * item.fadeGain, category = this.levels.get(item.bus) ?? 1, master = this.outputMuted ? 0 : this.masterLevel;
    const duck = item.bus === 'bgm' ? this.duckCurrent : 1;
    const problems: AudioInspection['problems'] = [];
    if (item.blocked) problems.push('AUTOPLAY_BLOCKED');
    if (item.state.volume === 0) problems.push('SOURCE_ZERO'); if (category === 0) problems.push('CATEGORY_ZERO'); if (master === 0) problems.push('MASTER_ZERO');
    return ok({ sessionId: item.sessionId, sourceId: item.id, token: item.token, assetId: item.assetId, variantId: item.variantId,
      bus: item.bus, backgroundRole: item.role, positionSec: this.position(item), durationSec: item.durationSec,
      suppressed: this.suppressed(item), userPaused: item.userPaused,
      voiceResolution: item.binding?.resolution ?? null, status: item.status, audioContext: this.context.state,
      fade: item.fade, gains: { source, category, master, duck, effective: source * category * master * duck },
      pauses: [...this.pauses], problems, issues: [...item.issues] });
  }
  private position(item: Media) { let position = item.cursor + (item.status === 'playing' ? this.context.currentTime - item.startedAt : 0);
    if (item.state.loop) { const end = item.state.loopEndSec ?? item.durationSec, start = item.state.loopStartSec;
      if (position >= end) position = start + (position - start) % (end - start); }
    return Math.min(position, item.durationSec); }
  async enableSound(): Promise<Result<void>> {
    try { await this.context.resume(); if (this.disposed) return fail('AUDIO_STALE', '播放器已关闭');
      if (this.context.state !== 'running') return fail('AUTOPLAY_BLOCKED', '浏览器仍阻止自动播放');
      for (const item of this.sources.values()) item.blocked = false;
      this.reconcileSources(); return ok(undefined);
    } catch { return fail('AUTOPLAY_BLOCKED', '浏览器仍阻止自动播放'); }
  }
  release(sourceId: Id) { const item = this.sources.get(sourceId); if (!item) return;
    this.stop(sourceId); item.gain.disconnect(); this.sources.delete(sourceId); }
  voiceLevel(): number {
    if (this.context.state !== 'running' || ![...this.sources.values()].some(item => item.bus === 'voice' && item.status === 'playing')) return 0;
    this.voiceAnalyser.getFloatTimeDomainData(this.voiceSamples);
    const meanSquare = this.voiceSamples.reduce((sum, sample) => sum + sample * sample, 0) / this.voiceSamples.length;
    return Math.max(0, Math.min(1, Math.sqrt(meanSquare)));
  }
  voicePCM(deltaMs: number): VoicePCM | null {
    if (this.context.state !== 'running') return null;
    const item = [...this.sources.values()].find(item => item.bus === 'voice' && item.status === 'playing');
    if (!item?.buffer) { this.pcmSource = null; return null; }
    const position = Math.min(item.durationSec, item.cursor + this.context.currentTime - item.startedAt);
    const start = this.pcmSource === item.id && this.pcmPosition <= position ? this.pcmPosition : Math.max(item.cursor, position - deltaMs / 1000);
    const firstSample = Math.round(start * 48000), lastSample = Math.round(position * 48000);
    this.pcmSource = item.id; this.pcmPosition = lastSample / 48000;
    const samples = new Float32Array(Math.max(0, lastSample - firstSample));
    for (let channel = 0; channel < item.buffer.numberOfChannels; channel++) {
      const values = item.buffer.getChannelData(channel);
      for (let index = 0; index < samples.length; index++) {
        const offset = (firstSample + index) / 48000 * item.buffer.sampleRate, left = Math.floor(offset), fraction = offset - left;
        samples[index] = samples[index]! + ((values[left] ?? 0) * (1 - fraction) + (values[left + 1] ?? 0) * fraction) / item.buffer.numberOfChannels;
      }
    }
    return { sourceId: item.id, samples, sampleRate: 48000 };
  }
  disposeSession(sessionId: Id) { const lifetimeKey = `${sessionId}:lifetime`, lifetime = (this.requests.get(lifetimeKey) ?? 0) + 1;
    for (const key of this.requests.keys()) if (key.startsWith(`${sessionId}:`)) this.requests.delete(key);
    this.requests.set(lifetimeKey, lifetime);
    for (const item of this.sources.values()) if (item.sessionId === sessionId) this.release(item.id); }
  dispose() { this.disposed = true; this.requests.clear(); for (const item of [...this.sources.values()]) this.disposeSession(item.sessionId);
    this.voiceAnalyser.disconnect(); this.master.disconnect(); for (const bus of this.buses.values()) bus.disconnect(); }
}
