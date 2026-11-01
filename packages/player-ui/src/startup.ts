import { SplashPlaybackSchema, StartupSequenceSchema, startupClipEnd } from '@galcraft/contracts';
import type { PlayerHost, Project, Snapshot, StartupClip, StartupSequence } from '@galcraft/contracts';

/** Startup media owns its resources and clock independently from the story's OP/ED controller. */
class SingleMediaStartup {
  private generation = 0;
  private release: (() => void) | null = null;
  private element: HTMLElement | null = null;
  private video: HTMLVideoElement | null = null;
  private elapsed = 0;
  private ready = false;
  private paused = false;
  private blocked = false;
  private playback = SplashPlaybackSchema.parse({});
  private reduced = false;
  private revealed = false;
  get active() { return this.element !== null; }
  constructor(private readonly root: HTMLElement, private readonly host: PlayerHost, private readonly snapshot: Snapshot,
    private readonly finished: () => void, private readonly error: (message: string) => void, private readonly reveal: () => void) {}
  async play(display: Project['display'], reducedMotion: boolean) {
    this.stop(); this.playback = SplashPlaybackSchema.parse(display.splashPlayback ?? {}); this.reduced = reducedMotion;
    if (!display.splash) { this.finished(); return; }
    const asset = this.snapshot.assets.find(item => item.assetId === display.splash);
    if (!asset || !['image', 'video'].includes(asset.kind)) { this.error('开屏素材不可用'); this.finished(); return; }
    const generation = this.generation;
    const overlay = document.createElement('section'); overlay.className = 'gc-startup'; overlay.dataset.gcStartup = asset.kind;
    overlay.setAttribute('aria-label', '开屏'); overlay.style.background = this.playback.background;
    this.element = overlay; this.root.append(overlay); overlay.tabIndex = 0; overlay.focus();
    overlay.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); this.skip(); });
    const resolved = await this.host.resources.resolve(asset.assetId, asset.variantId);
    if (generation !== this.generation) { if (resolved.ok) resolved.value.release(); return; }
    if (!resolved.ok) { this.fail(resolved.error.message); return; }
    this.release = resolved.value.release;
    if (asset.kind === 'image') {
      const image = document.createElement('img'); image.alt = ''; image.style.objectFit = this.playback.fit;
      image.onload = () => { if (generation === this.generation) this.ready = true; };
      image.onerror = () => { if (generation === this.generation) this.fail('开屏图片读取失败'); };
      overlay.prepend(image); image.src = resolved.value.uri;
    } else {
      const video = document.createElement('video'); this.video = video; video.playsInline = true;
      video.style.objectFit = this.playback.fit; video.volume = this.playback.volume; video.muted = this.playback.volume === 0;
      video.addEventListener('loadedmetadata', () => {
        if (generation !== this.generation) return;
        if (this.playback.startSec >= video.duration || this.playback.endSec !== null && this.playback.endSec > video.duration) { this.fail('开屏视频片段超出时长'); return; }
        video.currentTime = this.playback.startSec; this.ready = true; this.resumeVideo();
      });
      video.addEventListener('ended', () => { if (generation === this.generation && !this.paused) this.complete(); });
      video.addEventListener('error', () => { if (generation === this.generation) this.fail('开屏视频读取失败'); });
      overlay.prepend(video); video.src = resolved.value.uri;
    }
  }
  setPaused(paused: boolean) {
    if (this.paused === paused) return; this.paused = paused;
    if (paused) this.video?.pause(); else this.resumeVideo();
  }
  setVideoVolume(volume: number) { if (this.video) this.video.volume = this.playback.volume * Math.max(0, Math.min(1, volume)); }
  private resumeVideo() {
    const video = this.video, generation = this.generation;
    if (!video || !this.ready || this.paused || this.blocked) return;
    void video.play().catch(() => {
      if (generation !== this.generation || this.paused) return;
      this.blocked = true;
      const enable = document.createElement('button'); enable.className = 'gc-startup-enable'; enable.textContent = '播放开屏';
      enable.addEventListener('click', () => { this.blocked = false; enable.remove(); this.resumeVideo(); }); this.element?.append(enable);
    });
  }
  tick(deltaMs: number) {
    if (!this.active || !this.ready || this.paused) return;
    if (this.video) {
      if (this.playback.endSec !== null && this.video.currentTime >= this.playback.endSec || this.video.ended) this.complete(); return;
    }
    this.elapsed += Math.max(0, deltaMs);
    const fadeIn = this.reduced ? 0 : this.playback.fadeInMs, fadeOut = this.reduced ? 0 : this.playback.fadeOutMs;
    const remaining = fadeIn + this.playback.durationMs + fadeOut - this.elapsed;
    if (remaining <= fadeOut && !this.revealed) { this.revealed = true; this.reveal(); }
    this.element!.style.opacity = String(fadeIn > 0 && this.elapsed < fadeIn ? this.elapsed / fadeIn : fadeOut > 0 && remaining < fadeOut ? Math.max(0, remaining / fadeOut) : 1);
    if (remaining <= 0) this.complete();
  }
  skip() { if (this.active && this.playback.allowSkip) this.complete(); }
  keydown(event: KeyboardEvent) { if (!this.active) return false;
    if (!event.isComposing && event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); this.skip(); }
    return true; }
  private fail(message: string) { this.error(message); this.complete(); }
  private complete() { if (!this.active) return; if (!this.revealed) { this.revealed = true; this.reveal(); } this.stop(); this.finished(); }
  stop() { this.generation++; this.video?.pause(); if (this.video) { this.video.removeAttribute('src'); this.video.load(); }
    this.video = null; this.element?.remove(); this.element = null; this.release?.(); this.release = null;
    this.elapsed = 0; this.ready = false; this.blocked = false; this.revealed = false; }
}

type ClipView = { clip: StartupClip; element: HTMLElement; video?: HTMLVideoElement; release?: () => void; ready: boolean; started: boolean; blocked: boolean };

/** One startup clock owns all clips, including overlaps and the final reveal. */
export class StartupPresentation {
  private readonly single: SingleMediaStartup;
  private element: HTMLElement | null = null;
  private clips: ClipView[] = [];
  private sequence: StartupSequence | null = null;
  private generation = 0;
  private elapsed = 0;
  private paused = false;
  private reduced = false;
  private revealed = false;
  private volume = 1;
  private prepared = false;
  private skipPending = false;
  get active() { return this.element !== null || this.single.active; }
  constructor(private readonly root: HTMLElement, private readonly host: PlayerHost, private readonly snapshot: Snapshot,
    private readonly finished: () => void, private readonly error: (message: string) => void, private readonly reveal: () => void = () => {},
    private readonly prepareTitle: () => Promise<void> = async () => {}) {
    this.single = new SingleMediaStartup(root, host, snapshot, finished, error, reveal);
  }
  async play(display: Project['display'], reducedMotion: boolean, locale = this.snapshot.project.languages.menuDefault) {
    this.stop();
    if (!display.startupSequence) return this.single.play(display, reducedMotion);
    this.sequence = StartupSequenceSchema.parse(display.startupSequence); this.reduced = reducedMotion;
    this.elapsed = 0; this.revealed = false; this.prepared = false; this.skipPending = false;
    const generation = this.generation;
    const overlay = document.createElement('section'); overlay.className = 'gc-startup'; overlay.dataset.gcStartup = 'sequence';
    overlay.setAttribute('aria-label', '开屏'); overlay.style.background = this.sequence.background; overlay.tabIndex = 0;
    overlay.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); this.skip(); });
    this.element = overlay; this.root.append(overlay); overlay.focus();
    const preparation = this.sequence.revealMode === 'withLastClip' ? this.prepareTitle() : Promise.resolve();
    await Promise.all([preparation, ...this.sequence.clips.map(async clip => {
      if (generation !== this.generation) return;
      const element = document.createElement(clip.kind === 'image' ? 'img' : clip.kind === 'video' ? 'video' : 'div');
      element.className = 'gc-startup-clip'; element.style.opacity = '0'; element.style.background = clip.background;
      Object.assign(element.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: clip.fit, display: 'grid', placeItems: 'center', whiteSpace: 'pre-wrap', textAlign: 'center', color: clip.color });
      const view: ClipView = { clip, element, ready: !clip.assetId, started: false, blocked: false };
      this.clips.push(view); overlay.append(element);
      if (clip.kind === 'text') element.textContent = clip.text[locale] ?? clip.text[this.snapshot.project.languages.menuDefault] ?? clip.text['zh-CN'] ?? Object.values(clip.text)[0] ?? '';
      if (clip.kind === 'color') element.style.background = clip.color;
      if (clip.startMs === 0 && clip.fadeInMs === 0) element.style.opacity = '1';
      if (!clip.assetId) return;
      const asset = this.snapshot.assets.find(item => item.assetId === clip.assetId);
      if (!asset || asset.kind !== clip.kind) { this.fail(`开屏片段“${clip.name}”素材不可用`); return; }
      const resolved = await this.host.resources.resolve(asset.assetId, asset.variantId);
      if (generation !== this.generation) { if (resolved.ok) resolved.value.release(); return; }
      if (!resolved.ok) { this.fail(resolved.error.message); return; }
      view.release = resolved.value.release;
      if (clip.kind === 'image') {
        const image = element as HTMLImageElement; image.alt = ''; image.onload = () => { view.ready = true; };
        image.onerror = () => { if (generation === this.generation) this.fail(`开屏图片“${clip.name}”读取失败`); }; image.src = resolved.value.uri;
      } else {
        const video = element as HTMLVideoElement; view.video = video; video.playsInline = true; video.volume = clip.volume * this.volume; video.muted = video.volume === 0;
        video.addEventListener('loadedmetadata', () => {
          if (generation !== this.generation) return;
          if (clip.startSec >= video.duration || clip.endSec !== null && clip.endSec > video.duration) { this.fail(`开屏视频“${clip.name}”片段超出时长`); return; }
          video.currentTime = clip.startSec; view.ready = true;
        });
        video.addEventListener('error', () => { if (generation === this.generation) this.fail(`开屏视频“${clip.name}”读取失败`); }); video.src = resolved.value.uri;
      }
    })]).catch(error => { if (generation === this.generation) this.fail(String(error)); });
    if (generation === this.generation) { this.prepared = true; if (this.skipPending) this.complete(); else this.tick(0); }
  }
  private playVideo(view: ClipView) {
    if (!view.video || this.paused || view.blocked) return;
    const generation = this.generation;
    void view.video.play().catch(() => {
      if (generation !== this.generation || this.paused || view.blocked) return;
      view.blocked = true;
      const enable = document.createElement('button'); enable.className = 'gc-startup-enable'; enable.textContent = '播放开屏';
      enable.addEventListener('click', () => { view.blocked = false; enable.remove(); this.playVideo(view); }); this.element?.append(enable);
    });
  }
  setPaused(paused: boolean) {
    this.single.setPaused(paused); if (this.paused === paused) return; this.paused = paused;
    for (const view of this.clips) if (paused) view.video?.pause(); else if (view.started && this.elapsed < startupClipEnd(view.clip)) this.playVideo(view);
  }
  setVideoVolume(volume: number) { this.volume = Math.max(0, Math.min(1, volume)); this.single.setVideoVolume(this.volume);
    for (const view of this.clips) if (view.video) { view.video.volume = view.clip.volume * this.volume; view.video.muted = view.video.volume === 0; } }
  tick(deltaMs: number) {
    if (!this.element || !this.sequence) { this.single.tick(deltaMs); return; }
    if (!this.prepared || this.paused || this.clips.some(view => !view.ready || view.blocked)) return;
    this.elapsed += Math.max(0, deltaMs);
    const last = this.sequence.clips.reduce<StartupClip | null>((result, clip) => !result || startupClipEnd(clip) > startupClipEnd(result) ? clip : result, null);
    const joint = this.sequence.revealMode === 'withLastClip' && last !== null;
    const end = Math.max(0, ...this.sequence.clips.map(startupClipEnd));
    const revealStart = joint ? end - last!.fadeOutMs : end;
    for (const view of this.clips) {
      const clip = view.clip, local = this.elapsed - clip.startMs, duration = clip.fadeInMs + clip.holdMs + clip.fadeOutMs;
      const active = local >= 0 && local < duration;
      const retained = joint && clip.id === last!.id && local >= clip.fadeInMs + clip.holdMs;
      const opacity = retained ? 1 : !active ? 0 : this.reduced ? 1 : clip.fadeInMs > 0 && local < clip.fadeInMs ? local / clip.fadeInMs : clip.fadeOutMs > 0 && local > clip.fadeInMs + clip.holdMs ? (duration - local) / clip.fadeOutMs : 1;
      view.element.style.opacity = String(opacity);
      if (active && !view.started) { view.started = true; this.playVideo(view); }
      if (!active && view.started || view.video && clip.endSec !== null && view.video.currentTime >= clip.endSec) view.video?.pause();
    }
    if (this.elapsed >= revealStart && !this.revealed) { this.revealed = true; this.reveal(); }
    const revealMs = this.reduced ? 0 : joint ? last!.fadeOutMs : this.sequence.revealMs;
    if (this.revealed) this.element.style.opacity = String(revealMs ? Math.max(0, 1 - (this.elapsed - revealStart) / revealMs) : 0);
    if (this.elapsed >= revealStart + revealMs) this.complete();
  }
  skip() { if (this.element && this.sequence?.allowSkip) { if (!this.prepared && this.sequence.revealMode === 'withLastClip') this.skipPending = true; else this.complete(); } else this.single.skip(); }
  keydown(event: KeyboardEvent) { if (!this.element) return this.single.keydown(event);
    if (!event.isComposing && event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); this.skip(); } return true; }
  private fail(message: string) { if (!this.element) return; this.error(message); this.complete(); }
  private complete() { if (!this.element) return; if (!this.revealed) { this.revealed = true; this.reveal(); } this.stop(); this.finished(); }
  stop() {
    this.generation++; this.single.stop();
    for (const view of this.clips) { view.video?.pause(); if (view.video) { view.video.removeAttribute('src'); view.video.load(); } view.release?.(); }
    this.clips = []; this.element?.remove(); this.element = null; this.sequence = null; this.elapsed = 0; this.revealed = false; this.prepared = false; this.skipPending = false;
  }
}
