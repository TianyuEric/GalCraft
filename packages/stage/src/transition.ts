import type { PresentationState, TransitionProcess } from '@galcraft/contracts';
import { copy } from './common.js';
import { sampleObjectAnimation } from './animation.js';

export function transitionProgress(process: TransitionProcess): number {
  const duration = Math.max(0, process.spec.durationMs);
  return duration === 0 ? 1 : Math.max(0, Math.min(1, process.elapsedMs / duration));
}

export function advanceTransitions(state: PresentationState, deltaMs: number): { state: PresentationState; finished: TransitionProcess[] } {
  const next = copy(state), finished: TransitionProcess[] = [];
  next.transitions = next.transitions.filter(process => {
    process.elapsedMs = Math.min(process.spec.durationMs, process.elapsedMs + Math.max(0, deltaMs));
    if (transitionProgress(process) < 1) return true;
    if (process.custom && process.to) {
      const duration = Array.isArray(process.custom) ? process.custom.reduce((sum, segment) => sum + segment.durationMs, 0) : process.custom.durationMs;
      next.objects = next.objects.map(object => object.id === process.objectId ? sampleObjectAnimation(process.to!, process.custom!, duration, object) : object);
    }
    finished.push(process); return false;
  });
  return { state: next, finished };
}
