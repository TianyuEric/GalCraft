/** A separate cover preserves the mounted page, dialogs and media underneath it. */
export class EmergencyCover {
  readonly element = document.createElement('dialog');
  readonly canvas = document.createElement('div');
  private focus: HTMLElement | null = null;
  private rootInert = false;
  private inert = new Map<HTMLElement, boolean>();
  private media = new Map<HTMLMediaElement, { muted: boolean; playing: boolean }>();
  private animations: Animation[] = [];
  private observer: MutationObserver | null = null;
  private readonly onPlay = (event: Event) => { if (event.target instanceof HTMLMediaElement) this.pauseMedia(event.target, true); };
  get active() { return this.element.isConnected; }
  constructor(private readonly root: HTMLElement) {
    this.element.className = 'gc-emergency'; this.element.tabIndex = -1;
    this.element.setAttribute('role', 'dialog'); this.element.setAttribute('aria-modal', 'true');
    this.element.style.cssText = 'position:absolute!important;inset:0!important;z-index:2147483647!important;overflow:hidden!important;background:var(--gc-bg,#000)!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important;isolation:isolate!important;margin:0!important;border:0!important;padding:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;box-sizing:border-box!important;display:block!important';
    this.canvas.className = 'gc-content'; this.canvas.dataset.page = 'emergency'; this.canvas.dataset.gcPage = 'emergency';
    Object.assign(this.canvas.style, { position: 'absolute', transformOrigin: 'top left', padding: '0' });
    const style = document.createElement('style');
    style.textContent = '.galcraft-player[data-gc-emergency="true"] > :not(.gc-emergency):not(style),.galcraft-player[data-gc-emergency="true"] > :not(.gc-emergency):not(style) *{visibility:hidden!important;pointer-events:none!important}';
    this.element.append(style, this.canvas);
  }
  private pauseMedia(element: HTMLMediaElement, requested = false) {
    if (!this.media.has(element)) this.media.set(element, { muted: element.muted, playing: requested || !element.paused });
    else if (requested) this.media.get(element)!.playing = true;
    element.muted = true; element.pause();
  }
  private retain() {
    for (const child of this.root.children) if (child instanceof HTMLElement && child !== this.element && child.tagName !== 'STYLE') {
      if (!this.inert.has(child)) this.inert.set(child, child.inert);
      child.inert = true;
    }
    for (const media of this.root.querySelectorAll<HTMLMediaElement>('audio,video')) if (!this.element.contains(media)) this.pauseMedia(media);
  }
  open(label: string) {
    if (this.active) return;
    this.focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.rootInert = this.root.inert; this.root.inert = false;
    this.element.setAttribute('aria-label', label); this.root.dataset.gcEmergency = 'true';
    this.root.append(this.element);
    if (document.fullscreenElement && !document.fullscreenElement.contains(this.element)) this.element.showModal(); else this.element.open = true;
    this.retain();
    this.animations = (this.root.getAnimations?.({ subtree: true }) ?? []).filter(animation => animation.playState === 'running');
    for (const animation of this.animations) animation.pause();
    this.root.addEventListener('play', this.onPlay, true);
    this.observer = new MutationObserver(() => this.retain());
    this.observer.observe(this.root, { childList: true, subtree: true });
    this.element.focus({ preventScroll: true });
  }
  setRootInert(value: boolean) { if (this.active) this.rootInert = value; else this.root.inert = value; }
  close(resumeMedia: boolean) {
    if (!this.active) return;
    this.observer?.disconnect(); this.observer = null; this.root.removeEventListener('play', this.onPlay, true);
    this.element.close(); this.element.remove(); delete this.root.dataset.gcEmergency;
    for (const [element, inert] of this.inert) element.inert = inert; this.inert.clear();
    this.root.inert = this.rootInert;
    for (const animation of this.animations) if (animation.playState === 'paused') animation.play(); this.animations = [];
    for (const [element, state] of this.media) { element.muted = state.muted; if (resumeMedia && state.playing && element.isConnected) void element.play().catch(() => {}); }
    this.media.clear();
    if (this.focus?.isConnected) this.focus.focus({ preventScroll: true }); else this.root.focus({ preventScroll: true });
    this.focus = null;
  }
}

export function emergencyActionAllowed(action: { kind: string; enabled?: boolean; action?: {kind: string; enabled?: boolean} }) {
  if (action.kind === 'official' && action.action) return emergencyActionAllowed(action.action);
  return action.kind === 'setLocal' || action.kind === 'toggleLocal' || action.kind === 'back' || action.kind === 'emergency' && action.enabled === false;
}
