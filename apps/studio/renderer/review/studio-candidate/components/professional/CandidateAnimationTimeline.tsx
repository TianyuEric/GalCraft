import { useEffect, useRef } from 'react';
import type { NativeAnimation } from '@galcraft/contracts';
import { Diamond } from 'lucide-react';
import { CandidateButton } from '../controls/index.js';
import { professionalText } from './professional-fields.js';

type KeyframeSelection = [track: number, key: number];
export type AnimationTimelineProps = {
  animation: NativeAnimation;
  locale: string;
  time: number;
  zoom: number;
  snap: boolean;
  disabled: boolean;
  selection: KeyframeSelection;
  label(path: string): string;
  onSelect(selection: KeyframeSelection): void;
  onPause(): void;
  onPreview(animation: NativeAnimation): void;
  onCommit(animation: NativeAnimation): void;
};

export function patchAnimationFrame(animation: NativeAnimation, [track, key]: KeyframeSelection, patch: Partial<NativeAnimation['tracks'][number]['keyframes'][number]>): NativeAnimation {
  const next = structuredClone(animation);
  Object.assign(next.tracks[track]!.keyframes[key]!, patch);
  return next;
}

export function CandidateAnimationTimeline({ animation, locale, time, zoom, snap, disabled, selection, label, onSelect, onPause, onPreview, onCommit }: AnimationTimelineProps) {
  const t = professionalText(locale);
  const gesture = useRef<{
    before: NativeAnimation; next: NativeAnimation; index: KeyframeSelection; node: HTMLButtonElement;
    pointerId: number; initialX: number; width: number;
  } | null>(null);
  const preview = useRef(onPreview); preview.current = onPreview;
  const cancel = () => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    preview.current(current.before);
    if (current.node.hasPointerCapture(current.pointerId)) current.node.releasePointerCapture(current.pointerId);
    current.node.focus({ preventScroll: true });
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !gesture.current) return;
      event.preventDefault(); event.stopPropagation(); cancel();
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('blur', cancel); };
  }, []);
  const offset = (at: number) => animation.durationMs ? at / animation.durationMs * 100 : 0;

  return <div className="candidate-pro-timeline-scroll" tabIndex={0} aria-label={t('关键帧轨道滚动区', 'Keyframe tracks', 'キーフレームトラック')}>
    <div className="candidate-pro-timeline" style={{ minWidth: zoom * 100 + '%' }}>
      <div className="candidate-pro-ruler"><span>ms</span><div>{[0, .25, .5, .75, 1].map(fraction =>
        <span key={fraction} style={{ left: fraction * 100 + '%' }}>{Math.round(animation.durationMs * fraction)}</span>)}</div></div>
      {animation.tracks.map((track, trackIndex) => <div className="candidate-pro-lane" key={track.path} data-selected={trackIndex === selection[0] || undefined}>
        <CandidateButton disabled={disabled} aria-pressed={trackIndex === selection[0]} title={label(track.path)}
          onClick={() => onSelect([trackIndex, 0])}><Diamond size={14} aria-hidden="true"/><span>{label(track.path)}</span></CandidateButton>
        <div className="candidate-pro-track">
          <i className="candidate-pro-playhead" style={{ left: offset(time) + '%' }}/>
          {track.keyframes.map((key, keyIndex) => {
            const selected = trackIndex === selection[0] && keyIndex === selection[1];
            const index: KeyframeSelection = [trackIndex, keyIndex];
            return <CandidateButton key={keyIndex} className="candidate-pro-key" disabled={disabled} aria-pressed={selected}
              aria-label={label(track.path) + ' ' + key.timeMs + ' ms'} title={key.timeMs + ' ms · ' + key.value}
              style={{ left: offset(key.timeMs) + '%' }} onFocus={() => onSelect(index)} onClick={() => onSelect(index)}
              onPointerDown={event => {
                if (event.button !== 0) return;
                const node = event.currentTarget;
                const width = node.parentElement?.getBoundingClientRect().width;
                if (!width) return;
                node.focus(); node.setPointerCapture(event.pointerId); onSelect(index); onPause();
                gesture.current = { before: animation, next: animation, index, node, pointerId: event.pointerId, initialX: event.clientX, width };
              }}
              onPointerMove={event => {
                const current = gesture.current;
                if (current?.pointerId !== event.pointerId || current.node !== event.currentTarget) return;
                if (current.before === current.next && Math.abs(event.clientX - current.initialX) < 3) return;
                const frames = current.before.tracks[trackIndex]!.keyframes;
                const original = frames[keyIndex]!.timeMs;
                const previous = frames[keyIndex - 1]?.timeMs;
                const following = frames[keyIndex + 1]?.timeMs;
                const min = previous === undefined ? 0 : previous + Math.min(1, (original - previous) / 2);
                const max = following === undefined ? current.before.durationMs : following - Math.min(1, (following - original) / 2);
                const raw = original + (event.clientX - current.initialX) * current.before.durationMs / current.width;
                const step = snap ? 100 : 1;
                const at = Math.max(min, Math.min(max, Math.round(raw / step) * step));
                current.next = patchAnimationFrame(current.before, current.index, { timeMs: at });
                onPreview(current.next);
              }}
              onPointerUp={event => {
                const current = gesture.current;
                if (current?.pointerId !== event.pointerId || current.node !== event.currentTarget) return;
                gesture.current = null;
                if (current.before !== current.next) onCommit(current.next);
              }}
              onPointerCancel={cancel} onLostPointerCapture={cancel}
              onKeyDown={event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const at = key.timeMs + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 100 : 10);
                if (at < 0 || at > animation.durationMs || at <= (track.keyframes[keyIndex - 1]?.timeMs ?? -Infinity)
                  || at >= (track.keyframes[keyIndex + 1]?.timeMs ?? Infinity)) return;
                onCommit(patchAnimationFrame(animation, index, { timeMs: at }));
              }}><Diamond size={14} aria-hidden="true"/></CandidateButton>;
          })}
        </div>
      </div>)}
    </div>
  </div>;
}
