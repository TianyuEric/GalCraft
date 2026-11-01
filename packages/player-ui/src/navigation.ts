import { createId } from '@galcraft/contracts';
import type { Id, Json, PageKey } from '@galcraft/contracts';

export type BackgroundSource = { kind: 'home' } | { kind: 'stage'; sessionId: Id | null };
export type NavigationFrame = { id: Id; page: PageKey; originPage: PageKey; originFocus: string; originAudioSource: BackgroundSource;
  originScroll: number; sessionId: Id | null; state: Json; resultReceiver: string | null; originVisitId:Id };
export class PageNavigator {
  private frames: NavigationFrame[] = [];
  page: PageKey = 'title';
  visitId:Id = createId();
  audioSource: BackgroundSource = { kind: 'home' };
  private listeners = new Set<(page: PageKey) => void>();
  subscribe(listener: (page: PageKey) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private notify() { for (const listener of this.listeners) listener(this.page); }
  open(page: PageKey, input: { focusKey?: string; scroll?: number; sessionId?: Id | null;
    state?: Json; resultReceiver?: string | null } = {}): NavigationFrame {
    const frame = { id: createId(), page, originPage: this.page, originVisitId:this.visitId,originFocus: input.focusKey ?? '',
      originScroll: input.scroll ?? 0, sessionId: input.sessionId ?? null, state: input.state ?? null,
      resultReceiver: input.resultReceiver ?? null, originAudioSource: structuredClone(this.audioSource) };
    if (this.page === 'story' && input.sessionId) frame.originAudioSource = { kind: 'stage', sessionId: input.sessionId };
    this.audioSource = page === 'music' || page === 'title' ? { kind: 'home' } : frame.originAudioSource;
    this.frames.push(frame); this.page = page;this.visitId=frame.id; this.notify(); return frame;
  }
  back(): NavigationFrame | null {
    const frame = this.frames.pop(); if (!frame) return null;
    this.page = frame.originPage;this.visitId=frame.originVisitId; this.audioSource = frame.originAudioSource; this.notify(); return frame;
  }
  replace(page: PageKey, sessionId: Id | null = null) { this.frames = []; this.page = page;this.visitId=createId();
    this.audioSource = page === 'story' ? { kind: 'stage', sessionId } : { kind: 'home' }; this.notify(); }
  source(): NavigationFrame | null { return this.frames.at(-1) ?? null; }
  contains(page: PageKey) { return this.page === page || this.frames.some(frame => frame.originPage === page); }
}

export type RoutedInput = { kind: 'keyboard'|'pointer'|'wheel'|'touch'|'hostBack'; key: string|null;
  button: number|null; deltaY: number; composing: boolean; repeat: boolean;
  target: 'field'|'control'|'stage'|'toolbar'|'edge'; origin: 'physical'|'mouseRight'|'touch'|'host'; eventId: Id };
export type InputState = { page: PageKey; modal: boolean; video: boolean; fading: boolean; hiddenUI: boolean;
  emergency: boolean; movieSkip: boolean; rightButton: 'escape'|'none'; wheelUp: 'history'|'none';
  wheelDown: 'advance'|'none' };
export type InputAction = 'back'|'advance'|'toggleUI'|'history'|'videoSkip'|'restoreUI'|'emergencyRestore'|null;
export class InputRouter {
  private consumed = new Set<Id>();
  route(event: RoutedInput, state: InputState): InputAction {
    if (this.consumed.has(event.eventId)) return null;
    const consume = (action: InputAction) => { if (action) this.consumed.add(event.eventId); return action; };
    if (event.composing || event.target === 'field') return null;
    if (state.emergency) return event.kind === 'hostBack' || event.key === 'Escape' ? consume('emergencyRestore') : null;
    if (state.video || state.fading) return (event.key === 'Escape' && event.origin === 'physical' || event.origin === 'mouseRight' && state.rightButton === 'escape') &&
      state.movieSkip && !state.fading ? consume('videoSkip') : null;
    if (state.modal) return event.key === 'Escape' || event.kind === 'hostBack' ? consume('back') : null;
    if (event.key === 'Escape' || event.kind === 'hostBack' || event.origin === 'mouseRight' && state.rightButton === 'escape')
      return consume(state.page === 'story' ? 'toggleUI' : 'back');
    if (state.page !== 'story') return null;
    if (event.target === 'control' || event.target === 'toolbar') return null;
    if (event.kind === 'wheel') return event.deltaY < 0 && state.wheelUp === 'history' ? consume('history') :
      event.deltaY > 0 && state.wheelDown === 'advance' ? consume(state.hiddenUI ? 'restoreUI' : 'advance') : null;
    if (event.key === ' ' || event.key === 'Enter' || event.kind === 'pointer' && event.button === 0)
      return consume(state.hiddenUI ? 'restoreUI' : 'advance');
    return null;
  }
  clear() { this.consumed.clear(); }
}
