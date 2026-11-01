import { editorText as translate } from './editor-text.js';
import './editor-fields.css';
import { useEffect, useId, useRef, useState } from 'react';
import { NumberField } from '@base-ui/react/number-field';
import { ArrowLeftRight, Minus, Plus } from 'lucide-react';

/** coss Number Field composition, adapted to Studio density and a cancellable gesture. */
export type NumberInputDraft = { value: number | null; raw: string };
type StudioNumberProps = {
  label: string; min?: number; max?: number; step: number; unit: string; disabled?: boolean; readOnly?: boolean; buttons?: boolean; locale?: string;
  onDraftChange?(dirty: boolean): void;
  inputDraft?: NumberInputDraft | null; onInputDraftChange?(draft: NumberInputDraft | null): void;
} & ({ allowEmpty?: false; value: number; onPreview(value: number): void; onCommit(value: number): void | Promise<void> }
  | { allowEmpty: true; value: number | null; onPreview(value: number | null): void; onCommit(value: number | null): void | Promise<void> });
export function StudioNumberField({ label, value, min, max, step, unit, disabled, readOnly, buttons = false, locale = 'zh-CN', allowEmpty, onPreview, onCommit, onDraftChange, inputDraft, onInputDraftChange }: StudioNumberProps) {
  const t = (text: string) => translate(text, locale);
  const committing = useRef(false);
  const [pending, setPending] = useState(false);
  const id = useId(), [draft, setDraft] = useState<number | null>(inputDraft ? inputDraft.value : value), [error, setError] = useState(''), [generation, setGeneration] = useState(0);
  const start = useRef(value), current = useRef<number | null>(inputDraft ? inputDraft.value : value), scrubbing = useRef(false), cancelled = useRef(false);
  const input = useRef<HTMLInputElement>(null), composing = useRef(false), edited = useRef(!!inputDraft);
  const restoreAfterGeneration = useRef(false);
  const retainedRaw = useRef(inputDraft?.raw);
  const dirtyCallback = useRef(onDraftChange); dirtyCallback.current = onDraftChange;
  useEffect(() => () => { dirtyCallback.current?.(false); }, []);
  useEffect(() => {
    if (retainedRaw.current !== undefined && input.current) { input.current.value = retainedRaw.current; dirtyCallback.current?.(true); }
    if (restoreAfterGeneration.current) { restoreAfterGeneration.current = false; if (document.activeElement === document.body) input.current?.focus({ preventScroll: true }); }
  }, [generation]);
  useEffect(() => { if (!edited.current) { setDraft(value); current.current = value; start.current = value; } }, [value]);
  const valid = (next: number | null) => next === null ? allowEmpty === true : Number.isFinite(next) && (min === undefined || next >= min) && (max === undefined || next <= max);
  const preview = (next: number | null) => { if (next !== null) onPreview(next); else if (allowEmpty) onPreview(null); };
  const commit = async (next: number | null) => {
    if (cancelled.current || composing.current || committing.current) return;
    if (!valid(next)) { setError(t("请输入有效范围内的数值，或按 Esc 还原。")); return; }
    setError(''); if (next === start.current) { edited.current = false; retainedRaw.current=undefined;onInputDraftChange?.(null);onDraftChange?.(false); return; }
    const restoreFocus = document.activeElement === input.current;
    committing.current = true; setPending(true);
    try {
      if (next !== null) await onCommit(next); else if (allowEmpty) await onCommit(null);
      start.current = next; edited.current = false; retainedRaw.current=undefined;onInputDraftChange?.(null);onDraftChange?.(false);
      // Accepting typed text ends Base UI's manual-input authority, even if the host moved the DOM without a blur.
      restoreAfterGeneration.current = restoreFocus;
      setGeneration(value => value + 1);
    } catch (reason) { setError(String(reason instanceof Error ? reason.message : reason)); } finally {
      committing.current = false; setPending(false);
    }
  };
  const cancel = () => {
    if (committing.current) return;
    cancelled.current = true; scrubbing.current = false; edited.current = false;
    retainedRaw.current=undefined;onInputDraftChange?.(null);
    current.current = start.current; setDraft(start.current); preview(start.current); onDraftChange?.(false); setError('');
    // Remount releases Base UI's pointer lock and removes its active scrub listeners.
    restoreAfterGeneration.current = true; setGeneration(value => value + 1); requestAnimationFrame(() => { cancelled.current = false; });
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (scrubbing.current && event.key === 'Escape') { event.preventDefault(); cancel(); } };
    const blur = () => { if (scrubbing.current) cancel(); };
    window.addEventListener('keydown', key); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', blur); };
  });
  return <div className="candidate-number-field">
    <NumberField.Root key={generation} id={id} value={draft} min={min} max={max} step={step} smallStep={step} largeStep={step * 10}
      disabled={disabled} readOnly={readOnly || pending} allowOutOfRange locale={locale} className="candidate-number" onValueChange={(next, details) => {
        if (cancelled.current) { details.cancel(); return; }
        edited.current = next !== start.current; current.current = next; setDraft(next); onDraftChange?.(edited.current);
        queueMicrotask(()=>{retainedRaw.current=input.current?.value;onInputDraftChange?.(edited.current?{value:next,raw:input.current?.value??String(next??'')}:null);});
        if (valid(next)) { setError(''); preview(next); }
      }} onValueCommitted={(next) => { scrubbing.current = false; if (!error) commit(next); }}>
      <NumberField.ScrubArea className="candidate-scrub" onPointerDown={() => { start.current = current.current ?? value; scrubbing.current = true; }}
        onPointerCancel={cancel} title={t("左右拖动快速调整；Esc 还原")}>
        <label htmlFor={id}>{label}</label><ArrowLeftRight size={14} aria-hidden="true"/><span>{t("拖动调整")}</span>
        <NumberField.ScrubAreaCursor><ArrowLeftRight size={24}/></NumberField.ScrubAreaCursor>
      </NumberField.ScrubArea>
      <NumberField.Group className="candidate-number-group">
        {buttons && <NumberField.Decrement data-slot="studio-editor-control" aria-label={`${t('减少')}${label}`}><Minus size={14}/></NumberField.Decrement>}
        <NumberField.Input data-slot="studio-editor-control" data-local-history={edited.current || pending ? 'true' : 'false'} ref={input} aria-label={label} aria-invalid={!!error} aria-describedby={`${id}-help`} onFocus={() => { if (!edited.current) start.current = current.current ?? value; }}
          onInputCapture={event=>{const raw=event.currentTarget.value;queueMicrotask(()=>{const parsed=raw.trim()&&Number.isFinite(Number(raw))?Number(raw):null;current.current=parsed;retainedRaw.current=raw;edited.current=raw!==String(start.current??'');onDraftChange?.(edited.current);onInputDraftChange?.(edited.current?{value:parsed,raw}:null);});}}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDownCapture={event => {
            if (event.nativeEvent.isComposing || composing.current) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
            if (event.key === 'Enter') { event.preventDefault(); commit(current.current); }
          }}/>
        <span className="candidate-unit">{unit}</span>
        {buttons && <NumberField.Increment data-slot="studio-editor-control" aria-label={`${t('增加')}${label}`}><Plus size={14}/></NumberField.Increment>}
      </NumberField.Group>
    </NumberField.Root>
    <p id={`${id}-help`} className={error ? 'candidate-error' : 'candidate-hint'} role={error ? 'alert' : undefined}>{error || `${min === undefined && max === undefined ? '' : `${min ?? '−∞'}–${max ?? '∞'} ${unit} · `}↑↓ ${t('步进')} ${step} · Esc ${t('还原')}`}</p>
  </div>;
}
