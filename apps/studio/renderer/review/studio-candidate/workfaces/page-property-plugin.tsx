import { useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { JsonSchema, type ComponentConfig, type FieldSpec, type Json, type PageConfig } from '@galcraft/contracts';
import { validatePluginData, type ComponentContribution } from '@galcraft/plugins/contracts';
import { components, readTemplateDocuments, templateEdit } from '@galcraft/templates';
import { fieldInitialValue, fieldRecord, pluginReferencesFromDocuments, type PluginReference } from '../../../pages/Plugins/plugin-fields.js';
import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateSection, CandidateTextarea } from '../components/controls/index.js';
import { PageCheck, PageChoiceField, PageDraftActions, PagePropertyStatus, usePagePropertyAction, usePagePropertyDraft, type PagePropertySession } from './page-property-fields.js';
import { resultValue } from './workface-helpers.js';

type PluginDraft = { props: Record<string, Json>; raw: Record<string, string> };
type PluginSourceEdit = { path: string; text: string } | { path: string; removeIndex: number };
type PluginFieldProps = {
  field: FieldSpec; value: Json; path: string; raw: PluginDraft['raw']; references: PluginReference[];
  onChange: (value: Json, source?: PluginSourceEdit) => void;
};

function updatePluginSource(raw: PluginDraft['raw'], source?: PluginSourceEdit) {
  if (!source) return raw;
  if ('text' in source) return { ...raw, [source.path]: source.text };
  const prefix = `${source.path}/`;
  return Object.fromEntries(Object.entries(raw).flatMap(([path, text]) => {
    if (!path.startsWith(prefix)) return [[path, text]];
    const [first, ...parts] = path.slice(prefix.length).split('/');
    const index = Number(first);
    if (index === source.removeIndex) return [];
    return [[index > source.removeIndex ? `${prefix}${[index - 1, ...parts].join('/')}` : path, text]];
  }));
}

function PagePluginField({ field, value, path, raw, references, onChange }: PluginFieldProps) {
  const { label } = field;
  if (field.type === 'object' && field.children?.length) {
    const record = fieldRecord(value);
    return <CandidateFieldGroup title={label} description={field.description}>
      {field.children.map(child => <PagePluginField key={child.path} field={child} value={Object.hasOwn(record, child.path) ? record[child.path]! : fieldInitialValue(child)}
        path={`${path}/${child.path}`} references={references} raw={raw} onChange={(item, source) => onChange({ ...record, [child.path]: item }, source)}/>)}
    </CandidateFieldGroup>;
  }
  if (field.type === 'array' && field.item) {
    const items = Array.isArray(value) ? value : [];
    return <CandidateFieldGroup title={label} description={field.description}>
      {items.map((item, index) => <div className="candidate-property-option" key={index}>
        <PagePluginField field={{ ...field.item!, label: `${label} ${index + 1}` }} value={item} path={`${path}/${index}`} references={references} raw={raw}
          onChange={(entry, source) => onChange(items.map((previous, at) => at === index ? entry : previous), source)}/>
        <CandidateIconButton label={`移除${label} ${index + 1}`} onClick={() => onChange(items.filter((_, at) => at !== index), { path, removeIndex: index })}><Trash2 size={14}/></CandidateIconButton>
      </div>)}
      <CandidateButton onClick={() => onChange([...items, fieldInitialValue(field.item!)])}><Plus size={14}/>添加一项</CandidateButton>
    </CandidateFieldGroup>;
  }
  if (field.type === 'boolean') return <PageCheck label={label} value={value === true} onChange={onChange}/>;
  if (field.type === 'enum') return <PageChoiceField label={label} hint={field.description} value={String(value ?? '')} options={(field.enumValues ?? []).map(item => ({ value: item, label: item }))} onChange={onChange}/>;
  if (field.type === 'ref') {
    const options = references.filter(item => item.kind === field.refKind && (!field.assetKinds?.length || !item.assetKind || field.assetKinds.some(kind => kind === item.assetKind)))
      .map(item => ({ value: item.id, label: item.name }));
    if (value && !options.some(item => item.value === value)) options.push({ value: String(value), label: `当前引用不可用 · ${String(value)}` });
    return <PageChoiceField label={label} hint={field.description} value={String(value ?? '')} options={[{ value: '', label: '请选择' }, ...options]} onChange={next => onChange(next || null)}/>;
  }
  if (field.type === 'number' || field.type === 'integer') return <CandidateField label={label} hint={field.description} unit={field.unit === 'none' ? undefined : field.unit} className="candidate-property-short">
    <CandidateInput density="compact" data-local-history type="number" min={field.min} max={field.max} required={field.required} step={field.type === 'integer' ? 1 : 'any'}
      value={typeof value === 'number' ? value : ''} onChange={event => onChange(event.target.value === '' ? null : event.target.valueAsNumber)}/>
  </CandidateField>;
  if (['object', 'array', 'expression'].includes(field.type)) {
    const source = raw[path];
    let fault: string | undefined;
    if (source !== undefined) {
      try { JsonSchema.parse(JSON.parse(source)); } catch { fault = '请输入有效的 JSON。'; }
    }
    return <CandidateField label={label} hint={field.description} error={fault}>
      <CandidateTextarea rows={3} data-local-history value={source ?? JSON.stringify(value, null, 2)} onChange={event => {
        const text = event.target.value;
        let next = value;
        try { next = JsonSchema.parse(JSON.parse(text)); } catch { /* Keep the last parsed property while this input is incomplete. */ }
        onChange(next, { path, text });
      }}/>
    </CandidateField>;
  }
  return <CandidateField label={label} hint={field.description}><CandidateInput density="compact" value={String(value ?? '')} data-local-history required={field.required}
    placeholder={field.placeholder} onChange={event => onChange(event.target.value)}/></CandidateField>;
}

export function PagePluginProperties({ session, page, component, definition }: {
  session: PagePropertySession; page: PageConfig; component: ComponentConfig; definition?: ComponentContribution;
}) {
  const { store } = session, action = usePagePropertyAction();
  const form = useRef<HTMLFormElement>(null);
  const collect = (props: Json): PluginDraft => ({ props: fieldRecord(props), raw: {} });
  const initial = collect(component.plugin?.props ?? {});
  const draft = usePagePropertyDraft<PluginDraft>(session, `${component.id}/plugin`, initial);
  const value = draft.value ?? initial;
  const references = pluginReferencesFromDocuments(store.host.list());
  if (!definition || !component.plugin) return <CandidateSection title="插件公开属性" collapsible initiallyOpen={false}>
    <p className="candidate-property-note">当前提供者不可用，组件配置已保留。</p>
  </CandidateSection>;
  const pluginKey = component.plugin.key;
  const apply = () => action.run(async () => {
    const docs = store.host.list(), template = readTemplateDocuments(docs);
    const latest = template.pages.find(item => item.id === page.id);
    const target = latest && components(latest.root).find(item => item.id === component.id);
    if (!target?.plugin || target.plugin.key !== pluginKey) throw new Error('插件组件已变化。请重新选择。');
    draft.assertCurrent(() => collect(target.plugin!.props));
    for (const raw of Object.values(value.raw)) JsonSchema.parse(JSON.parse(raw));
    if (definition.propsSchema) resultValue(validatePluginData(definition.propsSchema, value.props));
    target.plugin.props = value.props;
    resultValue(await store.applyEdit(templateEdit(docs, template, '编辑插件组件属性')));
    draft.change();
  });
  const fields = definition.fields ?? [];
  return <CandidateSection title="插件公开属性" collapsible initiallyOpen={false}>
    <form ref={form} className="candidate-property-form" onSubmit={event => { event.preventDefault(); if (draft.dirty && !draft.conflict) void apply(); }}>
      <fieldset className="candidate-property-form" disabled={draft.conflict || action.busy}>
        {!fields.length && <p className="candidate-property-note">此组件没有开放属性。</p>}
        {fields.map(field => <PagePluginField key={field.path} field={field} path={field.path} raw={value.raw} references={references}
          value={Object.hasOwn(value.props, field.path) ? value.props[field.path]! : fieldInitialValue(field)} onChange={(next, source) => {
            draft.change({ props: { ...value.props, [field.path]: next }, raw: updatePluginSource(value.raw, source) });
            action.setFault('');
          }}/>) }
      </fieldset>
      <PagePropertyStatus fault={action.fault} conflict={draft.conflict}/>
      <PageDraftActions label="应用插件属性" draft={draft} busy={action.busy} apply={() => form.current?.requestSubmit()} reset={() => { draft.change(); action.setFault(''); }}/>
    </form>
    {definition.publicParts.length > 0 && <details className="candidate-property-disclosure"><summary>公开部件</summary><p className="candidate-property-note">{definition.publicParts.join(' · ')}</p></details>}
  </CandidateSection>;
}
