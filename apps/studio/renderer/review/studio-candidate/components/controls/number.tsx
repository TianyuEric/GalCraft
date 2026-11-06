import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { editorText } from '../../../../components/editor-fields/editor-text.js';
import { CandidateField } from './fields.js';
import { CandidateIconButton, CandidateInput } from './primitives.js';

export type NumberInputDraft = { value: number | null; raw: string };

type NumberProps = {
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  step: number;
  disabled?: boolean;
  locale?: string;
  inputDraft?: NumberInputDraft | null;
  onInputDraftChange?(draft: NumberInputDraft | null): void;
} & ({
  allowEmpty?: false;
  value: number;
  onPreview?(value: number): void;
  onCommit(value: number): void | Promise<void>;
} | {
  allowEmpty: true;
  value: number | null;
  onPreview?(value: number | null): void;
  onCommit(value: number | null): void | Promise<void>;
});

function parse(raw: string): number | null {
  const text = raw.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function CandidateNumberField(props: NumberProps) {
  const { label, unit, value, min, max, step, disabled, locale, inputDraft, onInputDraftChange } = props;
  const t = (text: string) => editorText(text, locale);
  const [localDraft, setLocalDraft] = useState<NumberInputDraft | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const draft = (onInputDraftChange ? inputDraft : localDraft) ?? null;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const baseline = useRef(value);
  const input = useRef<HTMLInputElement>(null);
  const scrub = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const committing = useRef(false);
  const pointer = useRef<{ id: number; x: number; value: number; ticks: number; moved: boolean } | null>(null);
  const committedText = String(value ?? '');

  const valid = (next: NumberInputDraft) => next.value === null
    ? props.allowEmpty === true && next.raw.trim() === ''
    : Number.isFinite(next.value) && next.value >= (min ?? -Infinity) && next.value <= (max ?? Infinity);
  const preview = (next: number | null) => {
    if (props.allowEmpty) props.onPreview?.(next);
    else if (next !== null) props.onPreview?.(next);
  };
  const retain = (next: NumberInputDraft | null) => {
    draftRef.current = next;
    if (onInputDraftChange) onInputDraftChange(next);
    else setLocalDraft(next);
  };
  const write = (raw: string) => {
    if (!draftRef.current) baseline.current = value;
    const next = { raw, value: parse(raw) };
    retain(raw === committedText ? null : next);
    setError('');
    if (!composing.current) preview(valid(next) ? next.value : value);
  };
  const reset = () => {
    retain(null);
    setError('');
    preview(value);
  };
  const submit = async () => {
    const next = draftRef.current;
    if (!next || disabled || composing.current || committing.current) return;
    if (!valid(next)) {
      setError(t('请输入有效范围内的数值，或按 Esc 还原。'));
      return;
    }
    if (next.value === value) { reset(); return; }
    // Persistent consumers compare the full field against the baseline in their own transaction.
    if (!onInputDraftChange && baseline.current !== value) {
      setError(locale === 'en' ? 'The value changed. Press Esc to load the current value.'
        : locale === 'ja' ? '値が変更されました。Esc で現在の値を読み込んでください。'
          : '值已变化。按 Esc 读取当前值。');
      return;
    }
    committing.current = true;
    setPending(true);
    setError('');
    try {
      if (props.allowEmpty) await props.onCommit(next.value);
      else if (next.value !== null) await props.onCommit(next.value);
      retain(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      committing.current = false;
      setPending(false);
    }
  };
  const cancel = () => {
    if (committing.current) return;
    const drag = pointer.current;
    pointer.current = null;
    if (drag && scrub.current?.hasPointerCapture(drag.id)) scrub.current.releasePointerCapture(drag.id);
    reset();
  };
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const onBlur = () => { if (pointer.current) cancelRef.current(); };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !pointer.current) return;
      event.preventDefault();
      cancelRef.current();
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const stepped = (start: number, ticks: number) => {
    const amount = start + ticks * step;
    const rounded = Number.isInteger(amount) ? amount : Number(amount.toPrecision(15));
    return String(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, rounded)));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLButtonElement>) => {
    if (composing.current) return;
    if (event.key === 'Escape' && (draftRef.current || pointer.current)) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
    if (event.key === 'Enter' && event.currentTarget === input.current) {
      event.preventDefault();
      event.stopPropagation();
      void submit();
    }
    if (!disabled && !committing.current && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      event.stopPropagation();
      const ticks = (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1);
      write(stepped(draftRef.current?.value ?? value ?? 0, ticks));
      void submit();
    }
  };
  const range = min === undefined && max === undefined ? '' : `${min ?? '−∞'}–${max ?? '∞'} · `;
  const scrubLabel = `${t('拖动调整')} · ${label}`;
  return <CandidateField className="gc-candidate-number-field" label={label} unit={unit}
    hint={`${range}↑↓ ${t('步进')} ${step} · Esc ${t('还原')}`}
    error={error && <span role="alert">{error}</span>}>
    {control => <>
      <CandidateInput {...control} ref={input} density="compact" type="text" inputMode="decimal" value={draft?.raw ?? committedText}
        disabled={disabled} readOnly={pending} aria-busy={pending || undefined} data-local-history={String(!!draft || pending)}
        onChange={event => write(event.currentTarget.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={event => { composing.current = false; write(event.currentTarget.value); }}
        onBlur={() => { if (!pointer.current) void submit(); }}
        onKeyDown={onKeyDown}/>
      <CandidateIconButton ref={scrub} className="gc-candidate-number-scrub" label={scrubLabel} disabled={disabled || pending}
        onClick={() => input.current?.focus({ preventScroll: true })} onKeyDown={onKeyDown}
        onPointerDown={event => {
          if (event.button !== 0 || pointer.current || composing.current || committing.current) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = { id: event.pointerId, x: event.clientX, value: draftRef.current?.value ?? value ?? 0, ticks: 0, moved: false };
        }}
        onPointerMove={event => {
          const drag = pointer.current;
          if (drag?.id !== event.pointerId) return;
          const ticks = Math.trunc((event.clientX - drag.x) / 4);
          if (drag.ticks === ticks) return;
          drag.ticks = ticks;
          drag.moved = true;
          write(stepped(drag.value, ticks));
        }}
        onPointerUp={event => {
          const drag = pointer.current;
          if (drag?.id !== event.pointerId) return;
          pointer.current = null;
          if (drag.moved) void submit();
        }}
        onPointerCancel={event => { if (pointer.current?.id === event.pointerId) cancel(); }}
        onLostPointerCapture={event => { if (pointer.current?.id === event.pointerId) cancel(); }}>
        <ArrowLeftRight size={14} aria-hidden="true"/>
      </CandidateIconButton>
    </>}
  </CandidateField>;
}
