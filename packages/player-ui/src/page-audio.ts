import { createId, enrichIssue, TitleMusicPlaybackSchema } from '@galcraft/contracts';
import type { AudioState, Id, Issue, Project, ResolvedAsset, Snapshot } from '@galcraft/contracts';
import type { AudioMixer, PauseReason } from '@galcraft/stage';
import type { BackgroundSource } from './navigation.js';

export type AuditionState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'ended' | 'blocked' | 'failed';
type Playback = Pick<AudioMixer, 'play' | 'release' | 'disposeSession' | 'inspect' | 'setBackgroundRole' | 'setSourcePaused' | 'setLoop' | 'enableSound' | 'seek' | 'setSourceVolume'>;
export class PageAudioController {
  private readonly settingsSession = createId();
  private settingsRequest=0;
  private settingsPlaying=false;
  private settingsId: Id | null = null;
  private readonly homeSession = createId();
  private readonly auditionSession = createId();
  private homeId: Id | null = null;
  private auditionId: Id | null = null;
  private request = 0;
  private homeRequest = 0;
  private enabled = false;
  private disposed = false;
  private page = 'title';
  private musicOpen = false;
  private source: BackgroundSource = { kind: 'home' };
  private display: Project['display'];
  audition: { state: AuditionState; asset: ResolvedAsset | null; error: string | null; issue?: Issue | null; loop: boolean; volume?:number } =
    { state: 'idle', asset: null, error: null, loop: false };
  homeError: string | null = null;
  homeIssue: Issue | null = null;
  constructor(private readonly audio: Playback, private readonly snapshot: Snapshot, private readonly changed: () => void) {
    this.display = snapshot.project.display;
  }
  start(display: Project['display'] = this.snapshot.project.display) {
    this.stop(); this.display = display; this.enabled = true; this.disposed = false;
    this.selectRole();
    const asset = this.snapshot.assets.find(item => item.assetId === display.titleMusic);
    if (!display.titleMusic) return;
    if (!asset || asset.kind !== 'audio') { this.homeError = '主页音乐素材不可用'; this.homeIssue = enrichIssue({ code: 'HOME_AUDIO_MISSING', message: this.homeError, severity: 'error', owner: 'M07', related: [], actions: ['returnTitle'] }); this.changed(); return; }
    const playback = TitleMusicPlaybackSchema.parse(display.titleMusicPlayback ?? {});
    const state: AudioState = { assetId: asset.assetId, variantId: asset.variantId, stopped: false, ...playback, fadeOutMs: 0 };
    const request = ++this.homeRequest;
    void this.audio.play({ sessionId: this.homeSession, bus: 'bgm', backgroundRole: 'home', state, requestSound: false }).then(result => {
      if (request !== this.homeRequest || !this.enabled || this.disposed) { if (result.ok) this.audio.release(result.value); return; }
      if (result.ok) this.homeId = result.value; else { this.homeError = result.error.message; this.homeIssue = result.error; }
      this.selectRole(); this.changed();
    });
  }
  setContext(page: string, source: BackgroundSource, musicOpen: boolean, pauses: Partial<Record<PauseReason, boolean>> = {}) {
    if (['music','cg'].includes(this.page) && !['music','cg'].includes(page) && page !== 'emergency' && musicOpen) this.pauseAudition(false);
    if (this.musicOpen && !musicOpen) { this.stopAudition(false); this.audition = { state: 'idle', asset: null, error: null, loop: false }; }
    if(this.page==='settings'&&page!=='settings')this.stopSettingsAudition(false);
    this.musicOpen = musicOpen; this.page = page; this.source = source; this.selectRole(pauses);
  }
  private selectRole(pauses: Partial<Record<PauseReason, boolean>> = {}) {
    const auditionActive = (this.page === 'music' || this.page === 'cg' || this.page === 'emergency') && this.audition.state === 'playing';
    this.audio.setBackgroundRole(auditionActive || this.settingsPlaying ? 'audition' : this.source.kind, pauses);
  }
  async playAudition(asset: ResolvedAsset, loop = this.audition.loop) {
    const request = ++this.request;
    if (this.auditionId) this.audio.setSourcePaused(this.auditionId, true);
    this.audition = { state: 'loading', asset, error: null, loop, volume:this.audition.volume??1 }; this.selectRole(); this.changed();
    const enabled = await this.audio.enableSound();
    if (request !== this.request || this.disposed || !['music','cg'].includes(this.page)) return;
    if (!enabled.ok) { this.audition.state = 'blocked'; this.audition.error = enabled.error.message; this.audition.issue = enabled.error; this.changed(); return; }
    const result = await this.audio.play({ sessionId: this.auditionSession, bus: 'bgm', backgroundRole: 'audition', requestSound: false,
      state: { assetId: asset.assetId, variantId: asset.variantId, stopped: false, volume: this.audition.volume??1,
        startSec: 0, loop, loopStartSec: 0, loopEndSec: null, fadeInMs: 0, fadeOutMs: 0 } });
    if (request !== this.request || this.disposed || !['music','cg'].includes(this.page)) { if (result.ok) this.audio.release(result.value); return; }
    if (!result.ok) { if (this.auditionId) this.audio.release(this.auditionId); this.auditionId = null;
      this.audition.state = 'failed'; this.audition.error = result.error.message; this.audition.issue = result.error; this.selectRole(); this.changed(); return; }
    if (this.auditionId) this.audio.release(this.auditionId);
    this.auditionId = result.value; this.audition.state = 'playing'; this.selectRole(); this.changed();
  }
  async playSettingsAudition(bus:'master'|'bgm'|'sfx'|'voice'|'ui'|'video') {
    this.stopSettingsAudition(false);const request=++this.settingsRequest;
    const asset=this.snapshot.assets.find(asset=>asset.kind==='audio');
    if(!asset)return {ok:false as const,error:{code:'SETTINGS_AUDIO_MISSING',message:'作品没有可试听的声音素材',severity:'error' as const,owner:'M07' as const,related:[],actions:[]},issues:[]};
    const enabled=await this.audio.enableSound();if(!enabled.ok)return enabled;
    if(request!==this.settingsRequest||this.page!=='settings'||this.disposed)return {ok:true as const,value:null,warnings:[]};
    const result=await this.audio.play({sessionId:this.settingsSession,bus:bus==='master'?'ui':bus,preview:true,voicePurpose:'interlude',backgroundRole:'audition',
      state:{assetId:asset.assetId,variantId:asset.variantId,stopped:false,volume:1,startSec:0,loop:false,loopStartSec:0,loopEndSec:null,fadeInMs:0,fadeOutMs:0}});
    if(request!==this.settingsRequest||this.page!=='settings'||this.disposed){if(result.ok)this.audio.release(result.value);return result;}
    this.settingsPlaying=result.ok;this.settingsId=result.ok?result.value:null;this.selectRole();return result;
  }
  stopSettingsAudition(notify=true) {this.settingsRequest++;this.settingsPlaying=false;this.settingsId=null;this.audio.disposeSession(this.settingsSession);this.selectRole();if(notify)this.changed();}
  pauseAudition(notify = true) {
    this.request++;
    if (this.auditionId) this.audio.setSourcePaused(this.auditionId, true);
    if (['playing', 'loading', 'blocked'].includes(this.audition.state)) this.audition.state = 'paused';
    if (notify) { this.selectRole(); this.changed(); }
  }
  async resumeAudition() {
    if (!['music','cg'].includes(this.page)) return;
    const existing = this.auditionInspection();
    if (this.auditionId && (!existing?.ok || existing.value.assetId !== this.audition.asset?.assetId)) {
      this.audio.release(this.auditionId); this.auditionId = null;
    }
    if (!this.auditionId) { if (this.audition.asset) await this.playAudition(this.audition.asset); return; }
    const request = ++this.request, result = await this.audio.enableSound();
    if (request !== this.request || this.disposed || !['music','cg'].includes(this.page)) return;
    if (!result.ok) { this.audition.error = result.error.message; this.audition.issue = result.error; this.audition.state = 'blocked'; this.changed(); return; }
    this.audio.setSourcePaused(this.auditionId, false); this.audition.state = 'playing'; this.audition.error = null; this.audition.issue = null;
    this.selectRole(); this.changed();
  }
  stopAudition(notify = true) {
    this.request++; if (this.auditionId) this.audio.release(this.auditionId); this.auditionId = null;
    this.audio.disposeSession(this.auditionSession); this.audition.state = 'stopped'; this.audition.error = null; this.audition.issue = null;
    if (notify) { this.selectRole(); this.changed(); }
  }
  setAuditionLoop(loop: boolean) { this.audition.loop = loop; if (this.auditionId) this.audio.setLoop(this.auditionId, loop); this.changed(); }
  setAuditionVolume(volume:number){this.audition.volume=volume;if(this.auditionId)this.audio.setSourceVolume(this.auditionId,volume);this.changed();}
  seekAudition(seconds: number) { if (this.auditionId) { this.audio.seek(this.auditionId, seconds); this.changed(); } }
  auditionInspection() { return this.auditionId ? this.audio.inspect({ sessionId: this.auditionSession,
    source: { kind: 'instance', id: this.auditionId } }) : null; }
  get soundBlocked() {
    const home = this.homeId ? this.audio.inspect({ sessionId: this.homeSession, source: { kind: 'instance', id: this.homeId } }) : null;
    return this.source.kind === 'home' && home?.ok && home.value.problems.includes('AUTOPLAY_BLOCKED');
  }
  async enableSound() { const result = await this.audio.enableSound();
    if (!result.ok) { this.homeError = result.error.message; this.homeIssue = result.error; } this.changed(); }
  tick() {
    if(this.settingsId){const sample=this.audio.inspect({sessionId:this.settingsSession,source:{kind:"instance",id:this.settingsId}});if(!sample.ok||sample.value.status==="ended")this.stopSettingsAudition();}
    const current = this.auditionInspection();
    if (this.audition.state === 'playing' && current?.ok && current.value.status === 'ended') {
      this.audition.state = 'ended'; this.selectRole(); this.changed();
    }
  }
  stop() {
    this.stopSettingsAudition(false);this.enabled = false; this.homeRequest++; this.request++; this.homeId = null; this.homeError = null; this.homeIssue = null;
    this.audio.disposeSession(this.homeSession); this.stopAudition(false); this.audition = { state: 'idle', asset: null, error: null, loop: false };
  }
  dispose() { this.disposed = true; this.stop(); }
}
