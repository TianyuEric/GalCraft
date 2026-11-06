import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { FieldSpec, Json } from '@galcraft/contracts';
import { fieldInitialValue, fieldRecord, type PluginReference, type PublicFieldEditor } from '../../../../pages/Plugins/plugin-fields.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateSelect, CandidateTextarea } from '../controls/index.js';

type PluginFieldProps = {
  fields: FieldSpec[];
  value: Record<string, Json>;
  change(value: Record<string, Json>): void;
  locale: string;
  references: PluginReference[];
  translate(key: string): string;
  editorFor?(field: string): PublicFieldEditor | undefined;
  errors?: Record<string, string>;
  onInvalidDraft?(id: string, invalid: boolean): void;
  prefix?: string;
};

function CustomField({ editor, value, change }: { editor: PublicFieldEditor; value: Json; change(value: Json): void }) {
  const root = useRef<HTMLDivElement>(null);
  const commit = useRef(change);
  commit.current = change;
  useEffect(() => editor.mount(root.current!, value, async next => {
    commit.current(next);
    return { ok: true, value: undefined, warnings: [] };
  }), []);
  return <div ref={root}/>;
}

function StructuredField({ value, change, onInvalidDraft, ...props }: {
  value: Json;
  change(value: Json): void;
  onInvalidDraft?(invalid: boolean): void;
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const lastValue = useRef(value);
  const report = useRef(onInvalidDraft);
  report.current = onInvalidDraft;
  useEffect(() => {
    if (Object.is(value, lastValue.current)) return;
    lastValue.current = value;
    setText(JSON.stringify(value, null, 2));
    setError('');
    input.current?.setCustomValidity('');
    report.current?.(false);
  }, [value]);
  useEffect(() => () => report.current?.(false), []);
  return <div className="candidate-plugin-structured">
    <CandidateTextarea {...props} aria-invalid={error ? true : props['aria-invalid']} ref={input} value={text} onChange={event => {
      const draft = event.target.value;
      setText(draft);
      try {
        const next = JSON.parse(draft) as Json;
        lastValue.current = next;
        change(next);
        setError('');
        event.target.setCustomValidity('');
        report.current?.(false);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(message);
        event.target.setCustomValidity(message);
        report.current?.(true);
      }
    }}/>
    {error && <p role="alert">{error}</p>}
  </div>;
}

function PluginArray({ field, value, change, label, ...rest }: Omit<PluginFieldProps, 'fields' | 'value' | 'change'> & {
  field: FieldSpec;
  value: Json;
  change(value: Json): void;
  label: string;
}) {
  const items = Array.isArray(value) ? value : [];
  const keys = useRef<string[]>([]);
  const itemField = field.item!;
  while (keys.current.length < items.length) keys.current.push(crypto.randomUUID());
  keys.current.length = items.length;
  const t = (zh: string, en: string, ja: string) => rest.locale === 'en' ? en : rest.locale === 'ja' ? ja : zh;
  return <div className="candidate-plugin-array">
    {items.map((item, index) => {
      const key = keys.current[index]!;
      return <div className="candidate-plugin-array-row" key={key}>
        <CandidatePluginFields {...rest} prefix={`${rest.prefix ?? ''}${field.path}.${key}.`} fields={[{
          ...itemField, path: 'item', labelKey: undefined, label: `${label} ${index + 1}`,
        }]} value={{ item }} change={next => change(items.map((entry, position) => position === index ? next.item! : entry))}/>
        <CandidateIconButton label={t(`移除${label} ${index + 1}`, `Remove ${label} ${index + 1}`, `${label} ${index + 1}を削除`)} onClick={() => {
          keys.current.splice(index, 1);
          change(items.filter((_, position) => position !== index));
        }}><X size={14} aria-hidden="true"/></CandidateIconButton>
      </div>;
    })}
    <CandidateButton variant="outline" onClick={() => change([...items, fieldInitialValue(itemField)])}><Plus size={14} aria-hidden="true"/>
      {t('添加一项', 'Add item', '項目を追加')}
    </CandidateButton>
  </div>;
}

export function CandidatePluginFields({ fields, value, change, locale, references, translate, editorFor, errors = {}, onInvalidDraft, prefix = '' }: PluginFieldProps) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  if (!fields.length) return <p className="candidate-plugin-field-empty">{t('此贡献没有需要填写的参数。', 'This contribution has no parameters.', 'このコントリビューションにパラメーターはありません。')}</p>;
  return <div className="candidate-plugin-fields">{fields.map(field => {
    const current = value[field.path] === undefined ? field.default : value[field.path];
    const label = field.labelKey ? translate(field.labelKey) : field.label;
    const placeholder = field.placeholderKey ? translate(field.placeholderKey) : field.placeholder;
    const description = field.descriptionKey ? translate(field.descriptionKey) : field.description;
    const update = (next: Json) => change({ ...value, [field.path]: next });
    const path = prefix + field.path;
    const custom = editorFor?.(path);
    const nested = { locale, references, translate, onInvalidDraft };
    if (custom) return <CandidateFieldGroup key={field.path} title={label} description={description}>
      <CustomField editor={custom} value={current} change={update}/>
    </CandidateFieldGroup>;
    if (field.type === 'object' && field.children?.length) return <CandidateFieldGroup key={field.path} title={label} description={description}>
      <CandidatePluginFields {...nested} prefix={`${path}.`} editorFor={editorFor} fields={field.children} value={fieldRecord(current)} change={update}/>
    </CandidateFieldGroup>;
    if (field.type === 'array' && field.item) return <CandidateFieldGroup key={field.path} title={label} description={description}>
      <PluginArray {...nested} prefix={prefix} field={field} value={current} change={update} label={label}/>
    </CandidateFieldGroup>;

    const enumLabel = (value: string) => field.enumLabelKeys?.[value] ? translate(field.enumLabelKeys[value]!) : translate(value);
    const unit = field.unit === 'none' ? undefined : ({
      ms: t('毫秒', 'ms', 'ミリ秒'), s: t('秒', 'seconds', '秒'), px: 'px', deg: t('度', 'degrees', '度'), percent: '%', ratio: t('倍', 'ratio', '倍率'),
    })[field.unit];
    const defaultLabel = typeof field.default === 'boolean' ? (field.default ? t('是', 'Yes', 'はい') : t('否', 'No', 'いいえ')) :
      field.type === 'enum' ? enumLabel(String(field.default)) : String(field.default);
    const bounds = [
      field.default !== null && field.default !== '' && !['object', 'array'].includes(field.type) ? `${t('默认值', 'Default', '既定値')} ${defaultLabel}${unit ? ` ${unit}` : ''}` : '',
      field.min !== undefined ? `≥ ${field.min}` : field.exclusiveMin !== undefined ? `> ${field.exclusiveMin}` : '',
      field.max !== undefined ? `≤ ${field.max}` : '',
    ].filter(Boolean).join(' · ');
    const hint = [description, bounds].filter(Boolean).join(' ');
    const number = field.type === 'number' || field.type === 'integer';
    let control;
    if (field.type === 'boolean') control = <CandidateCheckbox checked={current === true} onChange={event => update(event.target.checked)}/>;
    else if (field.type === 'enum') control = <CandidateSelect value={String(current ?? '')} onValueChange={update}>
      {(field.enumValues ?? []).map(item => <option key={item} value={item}>{enumLabel(item)}</option>)}
    </CandidateSelect>;
    else if (field.type === 'ref') {
      const options = references.filter(item => item.kind === field.refKind && (!field.assetKinds?.length || !item.assetKind || field.assetKinds.includes(item.assetKind as never)));
      control = <CandidateSelect value={String(current ?? '')} onValueChange={next => update(next || null)}>
        <option value="">{t('请选择', 'Choose', '選択してください')}</option>
        {options.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        {!!current && !options.some(item => item.id === current) && <option value={String(current)}>{t('当前引用（不可用）', 'Current reference (unavailable)', '現在の参照（利用不可）')}</option>}
      </CandidateSelect>;
    } else if (number) control = <CandidateInput type="number" value={typeof current === 'number' ? current : ''} min={field.min} max={field.max}
      step={field.type === 'integer' ? 1 : 'any'} onChange={event => update(event.target.value === '' ? null : Number(event.target.value))}/>;
    else if (field.type === 'object' || field.type === 'array' || field.type === 'expression') control = (props: {
      id: string; 'aria-describedby'?: string; 'aria-invalid'?: true;
    }) => <StructuredField {...props} value={current} change={update} onInvalidDraft={invalid => onInvalidDraft?.(path, invalid)}/>;
    else control = <CandidateInput value={String(current ?? '')} placeholder={placeholder} required={field.required} onChange={event => update(event.target.value)}/>;
    return <CandidateField key={field.path} label={label} layout="row" unit={number ? unit : undefined} hint={hint} error={errors[field.path]}>{control}</CandidateField>;
  })}</div>;
}
