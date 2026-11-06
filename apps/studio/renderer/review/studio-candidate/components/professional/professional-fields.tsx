import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { CandidateField, CandidateIconButton, CandidateInput } from '../controls/index.js';

export const professionalText = (locale: string) => (zh: string, en: string, ja: string) =>
  locale === 'en' ? en : locale === 'ja' ? ja : zh;

export const professionalError = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);

export type ProfessionalNumberDraft = { value: number | null; raw: string };

export function parseProfessionalNumber(text: string, min = -Infinity, max = Infinity): number | null {
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) return null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export function ProfessionalNumber({ label, locale, value, displayValue, draft, unit, step, min, max, readOnly, onDraft, onPreview, onCommit, onCancel }: {
  label: string;
  locale: string;
  value: number;
  displayValue?: string;
  draft?: ProfessionalNumberDraft;
  unit?: string;
  step: number;
  min?: number;
  max?: number;
  readOnly?: boolean;
  onDraft(next: ProfessionalNumberDraft | undefined): void;
  onPreview(value: number): void;
  onCommit(value: number): Promise<void>;
  onCancel(): void;
}) {
  const t = professionalText(locale);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const busy = useRef(false);
  const pointer = useRef<{ id: number; startX: number; startValue: number } | null>(null);
  const actions = useRef({ onDraft, onCancel });
  actions.current = { onDraft, onCancel };

  const write = (raw: string) => {
    const next = { raw, value: parseProfessionalNumber(raw, min, max) };
    draftRef.current = next;
    onDraft(next);
    if (next.value !== null) onPreview(next.value);
  };
  const clear = () => { draftRef.current = undefined; actions.current.onDraft(undefined); };
  const submit = async () => {
    const next = draftRef.current?.value;
    if (readOnly || busy.current || next === undefined || next === null) return;
    busy.current = true;
    try { await onCommit(next); clear(); }
    catch { /* The workbench retains the draft and shows the transaction error. */ }
    finally { busy.current = false; }
  };
  const cancel = () => {
    if (busy.current) return;
    pointer.current = null;
    actions.current.onCancel();
    clear();
  };
  const stepped = (start: number, ticks: number) =>
    String(Number(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, start + ticks * step)).toPrecision(12)));
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = pointer.current;
    if (current?.id !== event.pointerId) return;
    const ticks = Math.trunc((event.clientX - current.startX) / 4);
    if (ticks || draftRef.current) write(stepped(current.startValue, ticks));
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !pointer.current) return;
      event.preventDefault();
      cancel();
    };
    const blur = () => { if (pointer.current) cancel(); };
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', escape); window.removeEventListener('blur', blur); };
  }, []);

  const invalid = draft !== undefined && draft.value === null;
  const error = invalid ? t('请输入范围内的数值，或按 Esc 还原。', 'Enter a value in range or press Esc to restore.', '範囲内の値を入力するか、Esc で元に戻してください。') : undefined;
  const scrubLabel = t('拖动调整', 'Drag to adjust', 'ドラッグで調整') + ' · ' + label;
  return <CandidateField className="candidate-pro-number" label={label} unit={unit} error={error}>
    {control => <>
      <CandidateInput {...control} density="compact" inputMode="decimal" value={draft?.raw ?? displayValue ?? String(value)} readOnly={readOnly}
        data-local-history={draft !== undefined || undefined}
        onChange={event => write(event.currentTarget.value)}
        onBlur={() => void submit()}
        onKeyDown={event => {
          if (event.key === 'Escape' && draftRef.current) {
            event.preventDefault(); event.stopPropagation(); cancel();
          }
          if (event.key === 'Enter' && draftRef.current) {
            event.preventDefault(); event.stopPropagation(); void submit();
          }
          if (!readOnly && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault();
            write(stepped(draftRef.current?.value ?? value, (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1)));
            void submit();
          }
        }}/>
      <CandidateIconButton className="candidate-pro-scrub" label={scrubLabel} disabled={readOnly}
        onPointerDown={event => {
          if (event.button !== 0 || busy.current) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer.current = { id: event.pointerId, startX: event.clientX, startValue: value };
        }}
        onPointerMove={move}
        onPointerUp={() => { if (pointer.current) { pointer.current = null; void submit(); } }}
        onPointerCancel={cancel}
        onLostPointerCapture={() => { if (pointer.current) cancel(); }}>
        <ArrowLeftRight size={14} aria-hidden="true"/>
      </CandidateIconButton>
    </>}
  </CandidateField>;
}
