import type { PresentationState } from '@galcraft/contracts';
import { copy } from './common.js';

export type IntroState = NonNullable<PresentationState['intro']>;

export function advanceIntro(value: IntroState, deltaMs: number, manualAdvance = false): { state: IntroState | null; completed: boolean } {
  const state = copy(value);
  if (!state.paragraphs.length) return { state: state.keepFinal ? state : null, completed: true };
  let remaining = Math.max(0, deltaMs);
  const next = () => {
    if (state.index + 1 === state.paragraphs.length) return true;
    state.index++; state.shown = 0; state.held = false; state.elapsedMs = 0;
    state.holdRemainingMs = state.holdMs;
    return false;
  };
  if (manualAdvance) {
    if (!state.held) {
      state.elapsedMs = state.durationMs;
      state.shown = Array.from(state.paragraphs[state.index]!).length;
      state.held = true;
      return { state, completed: false };
    }
    const completed = next();
    return { state: completed && !state.keepFinal ? null : state, completed };
  }
  while (true) {
    if (!state.held) {
      const duration = Math.max(0, state.durationMs);
      const step = Math.min(remaining, Math.max(0, duration - state.elapsedMs));
      state.elapsedMs += step; remaining -= step;
      const length = Array.from(state.paragraphs[state.index]!).length;
      state.shown = state.animation === 'typewriter' && duration > 0 ? Math.floor(length * state.elapsedMs / duration) : length;
      if (state.elapsedMs < duration) break;
      state.shown = length; state.held = true;
    }
    if (state.manual) break;
    const step = Math.min(remaining, Math.max(0, state.holdRemainingMs));
    state.holdRemainingMs -= step; remaining -= step;
    if (state.holdRemainingMs > 0) break;
    const completed = next();
    if (completed) return { state: state.keepFinal ? state : null, completed: true };
    if (remaining === 0 && state.durationMs > 0) break;
  }
  return { state, completed: false };
}
