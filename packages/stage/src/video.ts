import { createId } from '@galcraft/contracts';
import type { ExecutionToken, Id, Issue, Result } from '@galcraft/contracts';
import { fail, ok } from './common.js';

export type VideoStatus = 'idle' | 'loading' | 'playing' | 'fading' | 'finished' | 'error' | 'aborted';
export type VideoCompletion = { token: ExecutionToken; processId: Id; outcome: 'completed' | 'skipped' | 'failed'; issue: Issue | null };
export class VideoController {
  private status: VideoStatus = 'idle';
  private token: ExecutionToken | null = null;
  private processId: Id | null = null;
  private url = '';
  private fadeMs = 0;
  private fadeElapsedMs = 0;
  private generation = 0;
  private completed = false;
  private paused = false;
  private pendingCompletion: VideoCompletion['outcome'] | null = null;
  constructor(private readonly video: HTMLVideoElement, private readonly onCompletion: (value: VideoCompletion) => void) {}
  get state() { return this.status; }
  async start(input: { token: ExecutionToken; url: string; skipFadeMs: number }, retry = false): Promise<Result<Id>> {
    this.generation++; const generation = this.generation;
    this.video.pause(); this.video.src = input.url; this.video.currentTime = 0;
    this.url = input.url; this.token = input.token; this.processId = retry && this.processId ? this.processId : createId();
    this.fadeMs = Math.max(0, input.skipFadeMs); this.fadeElapsedMs = 0; this.completed = false; this.pendingCompletion = null; this.status = 'loading';
    this.video.onended = () => { if (this.generation === generation) this.finish('completed'); };
    this.video.onerror = () => { if (this.generation === generation) this.status = 'error'; };
    const started = await this.playIfActive(generation); if (!started.ok) return started;
    this.status = 'playing'; return ok(this.processId);
  }
  async setPause(enabled: boolean): Promise<Result<void>> {
    if (this.paused === enabled) return ok(undefined);
    this.paused = enabled;
    if (enabled) { this.video.pause(); return ok(undefined); }
    if (this.pendingCompletion) { const outcome = this.pendingCompletion; this.pendingCompletion = null; this.finish(outcome); return ok(undefined); }
    if (!['loading', 'playing', 'fading'].includes(this.status)) return ok(undefined);
    return this.playIfActive(this.generation);
  }
  private async playIfActive(generation: number): Promise<Result<void>> {
    if (this.paused) return ok(undefined);
    try {
      await this.video.play();
      if (this.generation !== generation) return fail('VIDEO_STALE', '旧视频启动已失效');
      if (this.paused) this.video.pause();
      return ok(undefined);
    } catch (error) {
      if (this.paused && error instanceof DOMException && error.name === 'AbortError') return ok(undefined);
      if (this.generation === generation) this.status = 'error';
      return fail('VIDEO_PLAY_FAILED', String(error));
    }
  }
  input(origin: 'mouseRight' | 'physicalEsc'): boolean {
    if (this.paused || !['loading', 'playing', 'error'].includes(this.status)) return false;
    if (this.fadeMs === 0 || this.status === 'error') this.finish('skipped');
    else { this.status = 'fading'; this.fadeElapsedMs = 0; }
    return true;
  }
  tick(deltaMs: number) {
    if (this.paused || this.status !== 'fading') return;
    this.fadeElapsedMs += Math.max(0, deltaMs);
    this.video.style.opacity = String(Math.max(0, 1 - this.fadeElapsedMs / this.fadeMs));
    if (this.fadeElapsedMs >= this.fadeMs) this.finish('skipped');
  }
  async retry(): Promise<Result<Id>> {
    if (this.status !== 'error' || !this.token) return fail('VIDEO_RETRY', '没有可重试的视频');
    return this.start({ token: this.token, url: this.url, skipFadeMs: this.fadeMs }, true);
  }
  returnTitle() { if (this.status === 'idle') return; this.generation++; this.video.pause(); this.status = 'aborted'; this.completed = true; }
  private finish(outcome: VideoCompletion['outcome']) {
    if (this.completed || !this.token || !this.processId) return;
    if (this.paused) { this.pendingCompletion = outcome; return; }
    this.completed = true; this.video.pause(); this.status = 'finished';
    this.video.style.opacity = '1';
    this.onCompletion({ token: this.token, processId: this.processId, outcome, issue: null });
  }
  dispose() { this.generation++; this.video.pause(); this.video.removeAttribute('src'); this.video.load(); this.video.onended = null; this.video.onerror = null;
    this.status = 'idle'; this.token = null; this.processId = null; this.completed = true; }
}
