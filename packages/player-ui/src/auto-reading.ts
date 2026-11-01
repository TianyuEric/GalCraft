import type { ExecutionToken, Id, PresentationState } from '@galcraft/contracts';
import type { AudioMixer } from '@galcraft/stage';

export function readingViewport(viewport: Pick<HTMLElement, 'scrollTop'|'scrollHeight'|'clientHeight'>,
  textLength: number) {
  return { textAnchor: Math.floor(viewport.scrollTop / Math.max(1, viewport.scrollHeight) * textLength),
    atEnd: viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2 };
}

export function dialogueVoiceEnded(audio: Pick<AudioMixer, 'inspect'>, sessionId: Id,
  token: ExecutionToken, voice: PresentationState['voice']): boolean {
  if (!voice) return true;
  const inspection = audio.inspect({ sessionId, source: { kind: 'dialogue', token } });
  return inspection.ok && ['ended', 'stopped', 'failed'].includes(inspection.value.status);
}

export function autoReadClock(readyAt: number | null, now: number, conditions: {
  textComplete: boolean; textAtEnd: boolean; voiceEnded: boolean; animationComplete: boolean;
}): { readyAt: number | null; elapsedMs: number } {
  if (!conditions.textComplete || !conditions.textAtEnd || !conditions.voiceEnded || !conditions.animationComplete)
    return { readyAt: null, elapsedMs: 0 };
  const started = readyAt ?? now;
  return { readyAt: started, elapsedMs: now - started };
}
