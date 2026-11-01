import type { PresentationState } from '@galcraft/contracts';
import { copy } from './common.js';
import { finishAnimations } from './animation.js';
import { advanceTransitions } from './transition.js';

/** Resolve finite visual work for an inspection frame while keeping loop instances at their sampled position. */
export function inspectionPresentation(state: PresentationState): PresentationState {
  let next = finishAnimations(state, undefined, { includeLoops: false }).state;
  const remaining = Math.max(0, ...next.transitions.map(value => value.spec.durationMs - value.elapsedMs),
    ...Object.values(next.characterDifferences ?? {}).map(value => value.durationMs - value.elapsedMs),
    next.text.textboxTransition?.durationMs ?? 0, next.film.transition?.durationMs ?? 0);
  next = advanceTransitions(advancePresentationTime(next, remaining), remaining).state;
  for (const object of next.objects) if (object.imagePlayback?.mode === 'once') {
    object.imagePlayback.elapsedMs = object.imagePlayback.frameDurationsMs.reduce((sum, duration) => sum + duration, 0);
    object.imagePlayback.completed = true;
  }
  if (next.intro) {
    if (!next.intro.manual && !next.intro.keepFinal) next.intro = null;
    else {
      if (!next.intro.manual) next.intro.index = Math.max(0, next.intro.paragraphs.length - 1);
      next.intro.shown = Array.from(next.intro.paragraphs[next.intro.index] ?? '').length;
      next.intro.elapsedMs = next.intro.durationMs; next.intro.held = true; next.intro.holdRemainingMs = 0;
    }
  }
  return next;
}

/** Advances saved visual state on the same paused logical clock as stage animation. */
export function advancePresentationTime(state: PresentationState, deltaMs: number, options: { finish?: boolean } = {}): PresentationState {
  const next = copy(state), delta = Math.max(0, deltaMs);
  const elapsed = (current: number, duration: number) => options.finish ? duration : Math.min(duration, current + delta);
  next.logicalTimeMs = (next.logicalTimeMs ?? 0) + delta;
  for (const state of Object.values(next.characterDifferences ?? {})) {
    state.elapsedMs = elapsed(state.elapsedMs, state.durationMs);
    if (state.elapsedMs >= state.durationMs) state.previous = null;
  }
  const text = next.text.textboxTransition;
  if (text) {
    text.elapsedMs = elapsed(text.elapsedMs, text.durationMs);
    const factor = text.durationMs === 0 ? 1 : text.elapsedMs / text.durationMs;
    next.text.textboxOpacity = text.from + (text.to - text.from) * factor;
    next.text.textboxVisible = factor < 1 || text.to > 0;
    if (factor === 1) delete next.text.textboxTransition;
  }
  const film = next.film.transition;
  if (film) {
    film.elapsedMs = elapsed(film.elapsedMs, film.durationMs);
    const factor = film.durationMs === 0 ? 1 : film.elapsedMs / film.durationMs;
    next.film.top = film.fromTop + (film.toTop - film.fromTop) * factor;
    next.film.bottom = film.fromBottom + (film.toBottom - film.fromBottom) * factor;
    next.film.enabled = factor < 1 || film.enabled;
    if (factor === 1) delete next.film.transition;
  }
  return next;
}
