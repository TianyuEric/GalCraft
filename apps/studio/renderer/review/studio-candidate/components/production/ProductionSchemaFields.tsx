import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FieldSpec, Json } from '@galcraft/contracts';
import { fieldInitialValue, fieldRecord } from '../../../../pages/Plugins/plugin-fields.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateTextarea } from '../controls/index.js';
import { ProductionChoice, productionText } from './ProductionControls.js';

function StructuredValue({ value, label, onChange }: { value: Json; label: string; onChange(value: Json): void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState('');
  const committed = useRef(value), input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setText(JSON.stringify(value, null, 2));
    setError('');
    input.current?.setCustomValidity('');
  }, [value]);
  return <CandidateField label={label} error={error} className="candidate-production-long">
    <CandidateTextarea ref={input} value={text} onChange={event => {
      setText(event.target.value);
      try {
        const next: Json = JSON.parse(event.target.value);
        committed.current = next;
        event.target.setCustomValidity('');
        setError('');
        onChange(next);
      } catch (reason) {
        const message = String(reason);
        event.target.setCustomValidity(message);
        setError(message);
      }
    }}/>
  </CandidateField>;
}

export function ProductionSchemaFields({ fields, value, change, locale, translate = key => key }: {
  fields: FieldSpec[]; value: Record<string, Json>; change(value: Record<string, Json>): void; locale: string; translate?(key: string): string;
}) {
  const t = (zh: string, en: string, ja: string) => productionText(locale, zh, en, ja);
  if (!fields.length) return <p>{t('此贡献没有需要填写的参数。', 'This contribution has no parameters.', 'このコントリビューションにパラメーターはありません。')}</p>;
  return <CandidateFieldGroup className="candidate-production-schema">
    {fields.map(field => {
      const current = value[field.path] === undefined ? field.default : value[field.path];
      const label = field.labelKey ? translate(field.labelKey) : field.label;
      const placeholder = field.placeholderKey ? translate(field.placeholderKey) : field.placeholder;
      const update = (next: Json) => change({ ...value, [field.path]: next });
      const description = field.descriptionKey ? translate(field.descriptionKey) : field.description;
      const unit = field.unit === 'none' ? undefined : ({ ms: 'ms', s: 's', px: 'px', deg: '°', percent: '%', ratio: '×' })[field.unit];
      const min = field.min !== undefined ? `≥ ${field.min}` : field.exclusiveMin !== undefined ? `> ${field.exclusiveMin}` : '';
      const max = field.max !== undefined ? `≤ ${field.max}` : '';
      const defaultValue = field.default === null || typeof field.default === 'object' ? '' : typeof field.default === 'boolean'
        ? field.default ? t('是', 'Yes', 'はい') : t('否', 'No', 'いいえ')
        : field.enumLabelKeys?.[String(field.default)] ? translate(field.enumLabelKeys[String(field.default)]!) : String(field.default);
      const hint = [description, defaultValue && `${t('默认', 'Default', '既定値')} ${defaultValue}${unit ? ` ${unit}` : ''}`, min, max].filter(Boolean).join(' · ');
      if (field.type === 'object' && field.children?.length) return <CandidateFieldGroup key={field.path} title={label} description={description}>
        <ProductionSchemaFields fields={field.children} value={fieldRecord(current)} change={update} locale={locale} translate={translate}/>
      </CandidateFieldGroup>;
      if (field.type === 'array' && field.item) {
        const items = Array.isArray(current) ? current : [];
        const definition = field.item;
        return <CandidateFieldGroup key={field.path} title={label} description={description}>
          {items.map((item, index) => <div key={index} className="candidate-production-array-row">
            <ProductionSchemaFields fields={[{ ...definition, path: 'item', labelKey: undefined, label: `${label} ${index + 1}` }]} value={{ item }}
              change={next => update(items.map((entry, at) => at === index ? next.item! : entry))} locale={locale} translate={translate}/>
            <CandidateIconButton label={t(`移除${label} ${index + 1}`, `Remove ${label} ${index + 1}`, `${label} ${index + 1}を削除`)}
              onClick={() => update(items.filter((_, at) => at !== index))}><Trash2 size={14}/></CandidateIconButton>
          </div>)}
          <CandidateButton variant="outline" onClick={() => update([...items, fieldInitialValue(definition)])}><Plus size={14}/>{t('添加一项', 'Add item', '項目を追加')}</CandidateButton>
        </CandidateFieldGroup>;
      }
      if (field.type === 'object' || field.type === 'array' || field.type === 'expression') return <div key={field.path} data-field={field.path}>
        {hint && <p>{hint}</p>}<StructuredValue value={current} label={label} onChange={update}/>
      </div>;
      const numeric = field.type === 'integer' || field.type === 'number';
      return <CandidateField key={field.path} label={label} hint={hint || undefined} data-field={field.path} unit={numeric ? unit : undefined}
        className={numeric ? 'candidate-production-number' : undefined}>
        {field.type === 'boolean' ? <CandidateCheckbox checked={current === true} onChange={event => update(event.target.checked)}/>
          : field.type === 'enum' ? <ProductionChoice label={label} value={String(current ?? '')} options={(field.enumValues ?? []).map(item => ({
            value: item, label: field.enumLabelKeys?.[item] ? translate(field.enumLabelKeys[item]) : translate(item),
          }))} onChange={update}/>
          : field.type === 'ref' ? <ProductionChoice label={label} value={String(current ?? '')} options={[
            { value: '', label: t('请选择', 'Choose', '選択してください') },
            ...(current ? [{ value: String(current), label: t('当前引用（不可用）', 'Current reference (unavailable)', '現在の参照（利用不可）') }] : []),
          ]} onChange={next => update(next || null)}/>
          : numeric ? <CandidateInput type="number" value={typeof current === 'number' ? current : ''} min={field.min} max={field.max}
            step={field.type === 'integer' ? 1 : 'any'} onChange={event => update(event.target.value === '' ? null : Number(event.target.value))}/>
          : <CandidateInput value={String(current ?? '')} placeholder={placeholder} required={field.required} onChange={event => update(event.target.value)}/>}
      </CandidateField>;
    })}
  </CandidateFieldGroup>;
}
