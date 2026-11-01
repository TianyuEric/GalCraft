import { useEffect, useRef, useState } from 'react';
import type { DocumentView, FieldSpec, Json, Ref, Result } from '@galcraft/contracts';
import { Button, Choice, Field } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';

export type PluginReference = Ref & { name: string; assetKind?: string };
export function pluginReferencesFromDocuments(documents: DocumentView[]): PluginReference[] {
  const references: PluginReference[] = documents.map(item => ({ kind: 'document', id: item.documentId, name: Object.keys(item.files)[0]?.split('/').at(-1) ?? item.documentId }));
  for (const document of documents) for (const [path, raw] of Object.entries(document.files)) {
    if (!path.endsWith('.json')) continue;
    const data = JSON.parse(raw).data;
    if (path === 'assets/index.json') for (const asset of data.assets ?? []) {
      references.push({ kind: 'asset', id: asset.id, name: asset.name, assetKind: asset.kind });
      references.push(...(asset.variants ?? []).map((variant: { id: string }) => ({ kind: 'variant' as const,
        id: variant.id, name: `${asset.name} · ${variant.id}`, assetKind: asset.kind })));
    }
    else { const kind = path.startsWith('characters/') ? 'character' : path.startsWith('variables/') ? 'variable' : path.endsWith('/scene.json') ? 'scene' : path.includes('/pages/') ? 'page' : path.includes('/styles/') ? 'style' : null;
      if (kind && data?.id) references.push({ kind, id: data.id, name: data.name ?? data.key ?? data.id }); }
  }
  return references;
}
export type PublicFieldEditor = {
  mount(root: HTMLElement, value: Json, commit: (value: Json) => Promise<Result<void>>): () => void;
};
export const fieldRecord = (value: Json): Record<string, Json> => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export function fieldInitialValue(field: FieldSpec): Json {
  if (field.type === 'object' && field.children?.length && (field.default !== null || !field.nullable)) return { ...fieldDefaults(field.children), ...structuredClone(fieldRecord(field.default)) };
  return structuredClone(field.default);
}
export function fieldDefaults(fields: FieldSpec[]): Record<string, Json> {
  return Object.fromEntries(fields.map(field => [field.path, fieldInitialValue(field)]));
}
const words = (locale: string, zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
export function pluginInputsValid(scope?: Element | null): boolean {
  const root = scope ?? document.activeElement?.closest('[role="dialog"],.plugin-component-properties');
  const invalid = root?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:invalid,textarea:invalid');
  if (invalid) { invalid.reportValidity(); return false; }
  return true;
}

function CustomField({ editor, value, change }: { editor: PublicFieldEditor; value: Json; change(value: Json): void }) {
  const root = useRef<HTMLDivElement>(null);
  const commit = useRef(change); commit.current = change;
  useEffect(() => editor.mount(root.current!, value, async next => { commit.current(next); return { ok: true, value: undefined, warnings: [] }; }), []);
  return <div ref={root} />;
}
function StructuredInput({ value, change, label }: { value: Json; change(value: Json): void; label: string }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2)), [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null), committed = useRef(value);
  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setText(JSON.stringify(value, null, 2)); setError(''); input.current?.setCustomValidity('');
  }, [value]);
  return <><Textarea ref={input} aria-label={label} value={text} onChange={event => {
    setText(event.target.value);
    try {
      const next: Json = JSON.parse(event.target.value);
      committed.current = next; change(next); event.target.setCustomValidity(''); setError('');
    } catch (e) { event.target.setCustomValidity(String(e)); setError(String(e)); }
  }}/>{error && <small role="alert" className="field-error">{error}</small>}</>;
}
export function PluginFields({ fields, value, change, locale, references = [], translate = text => text, editorFor, errors = {}, prefix = '' }: {
  fields: FieldSpec[]; value: Record<string, Json>; change(value: Record<string, Json>): void; locale: string;
  references?: PluginReference[]; translate?(key: string): string; editorFor?(field: string): PublicFieldEditor | undefined;
  errors?: Record<string, string>;
  prefix?: string;
}) {
  if (!fields.length) return <p className="plugin-neutral">{words(locale, '此贡献没有需要填写的参数。', 'This contribution has no parameters.', 'このコントリビューションにパラメーターはありません。')}</p>;
  return <div className="plugin-fields">{fields.map(field => {
    const current = value[field.path] === undefined ? field.default : value[field.path], label = field.labelKey ? translate(field.labelKey) : field.label;
    const placeholder = field.placeholderKey ? translate(field.placeholderKey) : field.placeholder;
    const update = (next: Json) => change({ ...value, [field.path]: next });
    const custom = editorFor?.(prefix + field.path);
    let control;
    if (custom) control = <CustomField editor={custom} value={current} change={update}/>;
    else if (field.type === 'object' && field.children?.length) control = <PluginFields fields={field.children} value={fieldRecord(current)} change={update} locale={locale} references={references} translate={translate} editorFor={editorFor} prefix={`${prefix}${field.path}.`}/>;
    else if (field.type === 'array' && field.item) {
      const items = Array.isArray(current) ? current : [];
      control = <div className="plugin-array">{items.map((item, index) => <div className="plugin-array-row" key={index}>
        <PluginFields fields={[{ ...field.item!, path: 'item', labelKey: undefined, label: `${label} ${index + 1}` }]} value={{ item }} change={next => update(items.map((entry, at) => at === index ? next.item! : entry))} locale={locale} references={references} translate={translate}/>
        <Button aria-label={words(locale, `移除${label} ${index + 1}`, `Remove ${label} ${index + 1}`, `${label} ${index + 1}を削除`)} onClick={() => update(items.filter((_, at) => at !== index))}>×</Button>
      </div>)}<Button onClick={() => update([...items, fieldInitialValue(field.item!)])}>{words(locale, '添加一项', 'Add item', '項目を追加')}</Button></div>;
    } else if (field.type === 'boolean') control = <input type="checkbox" checked={current === true} onChange={event => update(event.target.checked)} aria-label={label}/>;
    else if (field.type === 'enum') control = <Choice label={label} value={String(current ?? '')} options={(field.enumValues ?? []).map(item => ({ value: item, label: field.enumLabelKeys?.[item] ? translate(field.enumLabelKeys[item]) : translate(item) }))} onChange={update}/>;
    else if (field.type === 'ref') {
      const options = references.filter(item => item.kind === field.refKind && (!field.assetKinds?.length || !item.assetKind || field.assetKinds.includes(item.assetKind as never))).map(item => ({ value: item.id, label: item.name }));
      if (current && !options.some(item => item.value === current)) options.push({ value: String(current), label: words(locale, '当前引用（不可用）', 'Current reference (unavailable)', '現在の参照（利用不可）') });
      control = <Choice label={label} value={String(current ?? '')} options={[{ value: '', label: words(locale, '请选择', 'Choose', '選択してください') }, ...options]} onChange={next => update(next || null)}/>;
    } else if (field.type === 'number' || field.type === 'integer') control = <div className="plugin-number"><Input type="number" aria-label={label} value={typeof current === 'number' ? current : ''} min={field.min} max={field.max} step={field.type === 'integer' ? 1 : 'any'} onChange={event => update(event.target.value === '' ? null : Number(event.target.value))}/>{field.unit !== 'none' && <span>{field.unit}</span>}</div>;
    else if (field.type === 'object' || field.type === 'array' || field.type === 'expression') control = <StructuredInput key={field.path} value={current} change={update} label={label}/>;
    else control = <Input value={String(current ?? '')} aria-label={label} placeholder={placeholder} required={field.required} onChange={event => update(event.target.value)}/>;
    const unit = field.unit === 'none' ? '' : ({ ms: words(locale, '毫秒', 'ms', 'ミリ秒'), s: words(locale, '秒', 'seconds', '秒'), px: 'px', deg: words(locale, '度', 'degrees', '度'), percent: '%', ratio: words(locale, '倍', 'ratio', '倍率') })[field.unit];
    const constraints = [field.default !== null && !['object','array'].includes(field.type) ? `${words(locale, '默认', 'Default', '既定値')}: ${typeof field.default === 'boolean' ? words(locale, field.default ? '是' : '否', field.default ? 'Yes' : 'No', field.default ? 'はい' : 'いいえ') : field.enumLabelKeys?.[String(field.default)] ? translate(field.enumLabelKeys[String(field.default)]!) : String(field.default)}${unit ? ` ${unit}` : ''}` : '', field.min !== undefined ? `≥ ${field.min}` : field.exclusiveMin !== undefined ? `> ${field.exclusiveMin}` : '', field.max !== undefined ? `≤ ${field.max}` : ''].filter(Boolean).join(' · ');
    return <Field key={field.path} name={field.path} label={label} required={field.required} help={[field.descriptionKey ? translate(field.descriptionKey) : field.description, constraints].filter(Boolean).join(' ')} error={errors[field.path]}>{control}</Field>;
  })}</div>;
}
