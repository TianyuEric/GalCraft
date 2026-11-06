import { useEffect, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { CandidateIconButton } from '../controls/index.js';
import { professionalText } from './professional-fields.js';

export type LoopRange = { start: number; end: number };
const minGap = (duration: number) => Math.min(.01, duration / 2);
export const loopMinEnd = (start: number, duration: number) => Math.min(duration, start + minGap(duration));
export const loopMaxStart = (end: number, duration: number) => Math.max(0, end - minGap(duration));

export function CandidateAudioWaveform({ peaks, duration, loopLimit, position, range, locale, disabled, onSeek, onStart, onPreview, onCommit, onCancel }: {
  peaks: number[]; duration: number; loopLimit: number; position: number; range: LoopRange; locale: string; disabled: boolean;
  onSeek(value: number): void; onStart(): void; onPreview(range: LoopRange): void; onCommit(range: LoopRange): void; onCancel(): void;
}) {
  const t = professionalText(locale);
  const wave = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointer: number; node: HTMLButtonElement; edge: keyof LoopRange; before: LoopRange; next: LoopRange } | null>(null);
  const cancelCallback = useRef(onCancel); cancelCallback.current = onCancel;
  const cancel = () => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null; cancelCallback.current();
    if (current.node.hasPointerCapture(current.pointer)) current.node.releasePointerCapture(current.pointer);
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
  const at = (seconds: number) => Math.max(0, Math.min(100, seconds / duration * 100));
  const limit = (value: number, edge: keyof LoopRange, original: LoopRange) => Math.max(
    edge === 'start' ? 0 : loopMinEnd(original.start, loopLimit),
    Math.min(edge === 'end' ? loopLimit : loopMaxStart(original.end, loopLimit), value),
  );
  const handle = (edge: keyof LoopRange) => {
    const start = edge === 'start', value = range[edge];
    const label = start ? t('拖动循环起点', 'Drag loop start', 'ループ開始をドラッグ') : t('拖动循环终点', 'Drag loop end', 'ループ終了をドラッグ');
    return <CandidateIconButton className="candidate-pro-loop-handle" data-edge={edge} label={label} disabled={disabled} style={{ left: at(value) + '%' }}
      aria-description={value.toFixed(2) + ' s'}
      onPointerDown={event => {
        if (event.button !== 0) return;
        const node = event.currentTarget;
        node.focus({ preventScroll: true }); node.setPointerCapture(event.pointerId);
        gesture.current = { pointer: event.pointerId, node, edge, before: range, next: range };
        onStart();
      }}
      onPointerMove={event => {
        const current = gesture.current, bounds = wave.current?.getBoundingClientRect();
        if (!bounds?.width || current?.pointer !== event.pointerId || current.node !== event.currentTarget) return;
        const raw = Math.round((event.clientX - bounds.left) * duration * 100 / bounds.width) / 100;
        current.next = { ...current.before, [edge]: limit(raw, edge, current.before) };
        onPreview(current.next);
      }}
      onPointerUp={event => {
        const current = gesture.current;
        if (current?.pointer !== event.pointerId || current.node !== event.currentTarget) return;
        gesture.current = null;
        if (current.next[edge] !== current.before[edge]) onCommit(current.next);
      }}
      onPointerCancel={cancel} onLostPointerCapture={cancel}
      onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const step = (event.shiftKey ? .1 : .01) * (event.key === 'ArrowLeft' ? -1 : 1);
        onCommit({ ...range, [edge]: limit(Math.round((value + step) * 100) / 100, edge, range) });
      }}><GripVertical size={14} aria-hidden="true"/></CandidateIconButton>;
  };

  return <div className="candidate-pro-wave-wrap">
    <div className="candidate-pro-wave" ref={wave}>
      <div className="candidate-pro-loop-area" style={{ left: at(range.start) + '%', width: (at(range.end) - at(range.start)) + '%' }}/>
      <svg viewBox="0 0 1024 160" preserveAspectRatio="none" role="img" aria-label={t('实际音频的振幅波形', 'Waveform decoded from audio', '実音声の振幅波形')}
        onClick={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (bounds.width) onSeek(Math.max(0, Math.min(duration, (event.clientX - bounds.left) / bounds.width * duration)));
        }}>
        {peaks.map((peak, index) => <line key={index} x1={index * 2 + 1} x2={index * 2 + 1} y1={80 - peak * 72} y2={80 + peak * 72}/>)}
      </svg>
      <i className="candidate-pro-playhead" style={{ left: at(position) + '%' }}/>
      {handle('start')}{handle('end')}
    </div>
    <div className="candidate-pro-wave-ruler"><span>0 s</span><span>{(duration / 2).toFixed(2)} s</span><span>{duration.toFixed(2)} s</span></div>
    <div className="candidate-pro-wave-range" aria-live="off">
      <span>{t('起点', 'Start', '開始')} {range.start.toFixed(2)}s</span>
      <span>{t('终点', 'End', '終了')} {range.end.toFixed(2)}s</span>
    </div>
  </div>;
}
