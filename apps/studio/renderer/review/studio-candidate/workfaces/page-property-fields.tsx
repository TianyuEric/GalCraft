import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComponentConfig, PageConfig, PageEditOperation } from '@galcraft/contracts';
import { components, readTemplateDocuments } from '@galcraft/templates';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateInput, CandidateNumberField, CandidateSelect, CandidateToolbar, type NumberInputDraft } from '../components/controls/index.js';
import { editPage, type PageStore } from './page-edit.js';
import { workfaceError } from './workface-helpers.js';

export type PagePropertySession = { store: PageStore; viewId: string; onPending: () => void };
type Draft<T> = { baseline: string; value: T };
const draftKey = (viewId: string) => viewId + '/page-property-fields';
const serialize = (value: unknown) => JSON.stringify(value) ?? '';

export function pageFieldsPending(store: PageStore, viewId: string) {
  return Object.keys(store.viewState(draftKey(viewId)) ?? {}).length > 0;
}

export function usePagePropertyDraft<T>(session: PagePropertySession, id: string, initial: unknown) {
  const { store, viewId, onPending } = session;
  const key = draftKey(viewId), baseline = serialize(initial);
  const draft = store.viewState<Record<string, Draft<T>>>(key)?.[id];
  const [, refresh] = useState(0);
  const change = (value?: T) => {
    const all = { ...store.viewState<Record<string, Draft<T>>>(key) };
    if (value === undefined || serialize(value) === baseline) delete all[id];
    else all[id] = { baseline: all[id]?.baseline ?? baseline, value };
    store.rememberViewState(key, all);
    onPending();
    refresh(revision => revision + 1);
  };
  const assertCurrent = (read: () => unknown) => {
    const started = store.viewState<Record<string, Draft<T>>>(key)?.[id]?.baseline ?? baseline;
    if (serialize(read()) !== started) throw new Error('工作区中的值已变化。请撤回草稿后重新编辑。');
  };
  return { value: draft?.value, dirty: !!draft, conflict: !!draft && draft.baseline !== baseline, change, assertCurrent };
}

export function currentPropertyPage(store: PageStore, pageId: string): PageConfig {
  const page = readTemplateDocuments(store.host.list()).pages.find(item => item.id === pageId);
  if (!page) throw new Error('该页面已移除。');
  return page;
}

export function currentPropertyComponent(store: PageStore, pageId: string, componentId: string): ComponentConfig {
  const component = components(currentPropertyPage(store, pageId).root).find(item => item.id === componentId);
  if (!component) throw new Error('该组件已移除。');
  return component;
}

export type ComponentChanges = Extract<PageEditOperation, { kind: 'component.update' }>['changes'];
export const updateComponent = (store: PageStore, pageId: string, componentId: string, changes: ComponentChanges, label: string) =>
  editPage(store, label, [{ kind: 'component.update', pageId, componentId, changes }]);

export function usePagePropertyAction() {
  const [busy, setBusy] = useState(false), [fault, setFault] = useState('');
  const running = useRef(false);
  const run = async (apply: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true); setFault('');
    try { await apply(); } catch (reason) { setFault(workfaceError(reason)); }
    finally { running.current = false; setBusy(false); }
  };
  return { busy, fault, run, setFault };
}

export function PagePropertyStatus({ fault, conflict }: { fault?: string; conflict?: boolean }) {
  return <>{fault && <p className="candidate-property-error" role="alert">{fault}</p>}
    {conflict && <p className="candidate-property-error" role="alert">工作区中的值已变化。撤回草稿可读取当前值。</p>}</>;
}

export function PageDraftActions({ label, draft, busy, apply, reset }: {
  label: string; draft: { dirty: boolean; conflict: boolean }; busy: boolean; apply: () => void; reset: () => void;
}) {
  return <CandidateToolbar label={label}>
    <CandidateButton variant="primary" disabled={!draft.dirty || draft.conflict || busy} onClick={apply}>{label}</CandidateButton>
    {draft.dirty && <CandidateButton disabled={busy} onClick={reset}>{draft.conflict ? '重新读取' : '撤回草稿'}</CandidateButton>}
  </CandidateToolbar>;
}

export type PageChoice<T extends string = string> = { value: T; label: string };

export function PageChoiceField<T extends string>({ label, value, options, onChange, hint, short, disabled }: {
  label: string; value: T; options: readonly PageChoice<T>[]; onChange: (value: T) => void; hint?: ReactNode; short?: boolean; disabled?: boolean;
}) {
  return <CandidateField label={label} hint={hint} className={short ? 'candidate-property-short' : undefined}>
    <CandidateSelect density="compact" value={value} disabled={disabled} onValueChange={next => onChange(next as T)}>
      {!options.some(option => option.value === value) && <option value={value}>{value || '请选择'}</option>}
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </CandidateSelect>
  </CandidateField>;
}

export function PageCheck({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="candidate-property-check"><CandidateCheckbox checked={value} disabled={disabled} onChange={event => onChange(event.target.checked)}/>{label}</label>;
}

function nativeColor(value: string) {
  if (/^#[\da-f]{6,8}$/i.test(value)) return value.slice(0, 7);
  if (/^#[\da-f]{3,4}$/i.test(value)) return '#' + [...value.slice(1, 4)].map(digit => digit.repeat(2)).join('');
  return '#000000';
}

export function PageTextProperty({ session, name, label, value, read, commit, disabled, short, preview, swatch }: {
  session: PagePropertySession; name: string; label: string; value: string; read: () => string;
  commit: (value: string) => Promise<unknown>; disabled?: boolean; short?: boolean; preview?: (value: string | null) => void; swatch?: boolean;
}) {
  const draft = usePagePropertyDraft<string>(session, name, value);
  const action = usePagePropertyAction();
  const previewRef = useRef(preview); previewRef.current = preview;
  useEffect(() => () => previewRef.current?.(null), []);
  const apply = (next = draft.value) => {
    preview?.(null);
    if (next === undefined || next === value || draft.conflict || disabled) return;
    void action.run(async () => { draft.assertCurrent(read); await commit(next); draft.change(); });
  };
  const change = (value: string) => { draft.change(value); preview?.(value); action.setFault(''); };
  const colorInput = useRef<HTMLInputElement>(null);
  const applyRef = useRef(apply); applyRef.current = apply;
  useEffect(() => {
    const element = colorInput.current;
    if (!element) return;
    const change = () => applyRef.current(element.value);
    element.addEventListener('change', change);
    return () => element.removeEventListener('change', change);
  }, [swatch]);
  return <CandidateField label={label} className={short ? 'candidate-property-short' : undefined} error={action.fault || (draft.conflict ? '值已变化，按 Esc 读取当前值。' : undefined)}>
    {control => <>
      {swatch && <CandidateInput ref={colorInput} className="candidate-property-swatch" density="compact" type="color" aria-label={`选择${label}`} title={`选择${label}`}
        value={nativeColor(draft.value ?? value)} disabled={disabled || action.busy || draft.conflict} onInput={event => change(event.currentTarget.value)} onChange={() => {}}/>}
      <CandidateInput {...control} density="compact" value={draft.value ?? value} disabled={disabled || action.busy} data-local-history={draft.dirty || undefined}
      onChange={event => change(event.target.value)} onBlur={() => apply()}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); apply(); }
        if (event.key === 'Escape' && draft.dirty) { event.preventDefault(); event.stopPropagation(); draft.change(); preview?.(null); action.setFault(''); }
      }}/>
    </>}
  </CandidateField>;
}

export function PageNumberProperty({ session, name, label, value, read, commit, min, max, step = 1, unit = '', disabled, preview }: {
  session: PagePropertySession; name: string; label: string; value: number; read: () => number;
  commit: (value: number) => Promise<unknown>; min?: number; max?: number; step?: number; unit?: string; disabled?: boolean;
  preview?: (value: number | null) => void;
}) {
  const draft = usePagePropertyDraft<NumberInputDraft>(session, name, value);
  const previewRef = useRef(preview); previewRef.current = preview;
  useEffect(() => () => previewRef.current?.(null), []);
  return <CandidateNumberField label={label} value={value} unit={unit} min={min} max={max} step={step} disabled={disabled}
    locale={session.store.controller.preferences.locale} inputDraft={draft.value} onInputDraftChange={next => draft.change(next ?? undefined)}
    onPreview={next => preview?.(next === value ? null : next)} onCommit={async next => { draft.assertCurrent(read); await commit(next); preview?.(null); }}/>
}
