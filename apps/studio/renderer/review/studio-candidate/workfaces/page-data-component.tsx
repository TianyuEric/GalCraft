import { Plus, Trash2 } from 'lucide-react';
import { ComponentChangesSchema, type ComponentConfig, type PageConfig } from '@galcraft/contracts';
import { BasicComponentCatalog, componentTextEditable } from '@galcraft/templates';
import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateSection, CandidateTextarea } from '../components/controls/index.js';
import { PageValueField, pageValueContext, type PageValueType } from './page-data-values.js';
import { currentPropertyComponent, PageCheck, PageChoiceField, PageDraftActions, PageNumberProperty, PagePropertyStatus, PageTextProperty, updateComponent, usePagePropertyAction, usePagePropertyDraft, type PagePropertySession } from './page-property-fields.js';

const captions: Record<string, string> = { text: '显示文字', title: '标题', placeholder: '输入提示', value: '初始值', min: '最小值', max: '最大值', step: '步长', minLength: '最短长度', maxLength: '最长长度', inputType: '输入类型' };
const readingKeys = ['portrait', 'nameAbove', 'gradient', 'portraitWidth', 'nvlPadding', 'nvlScrimOpacity', 'nvlLineHeight', 'nvlScrimColor', 'nvlParagraphGap', 'nvlNameColor', 'nvlNameBold'];
const numeric = ['value', 'min', 'max', 'step', 'minLength', 'maxLength'];

export function PageContentProperties({ session, page, component }: { session: PagePropertySession; page: PageConfig; component: ComponentConfig }) {
  const { store } = session;
  const action = usePagePropertyAction();
  const basic = BasicComponentCatalog.find(item => item.part === component.part);
  const keys = [...new Set([...Object.keys(component.content), ...basic?.contentKeys ?? []])].filter(key => !['labelKey', 'labelOverrideKey'].includes(key)
    && !(key === 'text' && (componentTextEditable(component) || !Object.hasOwn(component.content, key)))
    && !(component.part === 'story.readingPanel' && readingKeys.includes(key)));
  const valueFor = (item: ComponentConfig, key: string) => Object.hasOwn(item.content, key) ? item.content[key] : numeric.includes(key) ? 0 : '';
  const read = (key: string) => valueFor(currentPropertyComponent(store, page.id, component.id), key);
  const update = (key: string, value: string | boolean | number) => updateComponent(store, page.id, component.id, { content: { [key]: value } }, '编辑组件内容');
  const fields = keys.flatMap(key => {
    const label = captions[key] ?? key, value = valueFor(component, key);
    if (typeof value === 'boolean') return [<PageCheck key={key} label={label} value={value} disabled={action.busy} onChange={next => void action.run(() => update(key, next))}/>];
    if (typeof value === 'number') return [<PageNumberProperty key={key} session={session} name={`${component.id}/content/${key}`} label={label} value={value} read={() => Number(read(key))}
      step={key === 'step' ? 0.1 : 1} commit={next => update(key, next)}/>];
    if (typeof value === 'string') return [<PageTextProperty key={key} session={session} name={`${component.id}/content/${key}`} label={label} value={value} read={() => String(read(key))} commit={next => update(key, next)}/>];
    return [];
  });
  if (!fields.length) return null;
  return <CandidateSection title="组件内容" collapsible initiallyOpen={false}>{fields}<PagePropertyStatus fault={action.fault}/></CandidateSection>;
}

const bindingLabels: Record<string, string> = { value: '控件值', text: '显示文字', visible: '显示状态', disabled: '禁用状态', selected: '选中状态' };
const bindingMode = [{ value: 'off', label: '使用组件内容' }, { value: 'on', label: '绑定数据' }] as const;
const repeatMode = [{ value: 'off', label: '普通容器' }, { value: 'on', label: '使用数据集合' }] as const;

export function PageComponentData({ session, page, component }: { session: PagePropertySession; page: PageConfig; component: ComponentConfig }) {
  const { store } = session, kind = component.part.startsWith('basic.') ? component.part.slice(6) : '';
  const action = usePagePropertyAction();
  const optionsEnabled = ['select', 'tabs'].includes(kind) || !!component.options;
  const repeatEnabled = kind === 'list' || !!component.repeat;
  const collect = (item: ComponentConfig) => ({ bindings: item.bindings ?? {}, ...(optionsEnabled && { options: item.options ?? [] }), ...(repeatEnabled && { repeat: item.repeat ?? null }) });
  const initial = collect(component);
  type DataDraft = ReturnType<typeof collect> & { source?: string };
  const draft = usePagePropertyDraft<DataDraft>(session, `${component.id}/data`, initial);
  const value: DataDraft = draft.value ?? initial;
  const context = pageValueContext(store, page);
  const hasControlValue = ['input', 'slider', 'toggle', 'select', 'tabs'].includes(kind);
  const valueType: PageValueType | undefined = kind === 'slider' || kind === 'input' && component.content.inputType === 'number' ? 'number' : kind === 'toggle' ? 'boolean' : hasControlValue ? 'string' : undefined;
  const textEnabled = componentTextEditable(component);
  const keys = [...new Set([...(hasControlValue ? ['value'] : []), ...(textEnabled ? ['text'] : []), 'visible', 'disabled', 'selected', ...Object.keys(value.bindings)])];
  const change = (next: typeof value) => { draft.change(next); action.setFault(''); };
  const apply = () => action.run(async () => {
    draft.assertCurrent(() => collect(currentPropertyComponent(store, page.id, component.id)));
    const { source, ...visual } = value;
    const parsed = source === undefined ? visual : readAdvanced(source);
    const options = parsed.options ?? [];
    if (options.some(option => !option.value.trim()) || new Set(options.map(option => option.value)).size !== options.length) throw new Error('每个选项需要一个非空且唯一的选项值。');
    await updateComponent(store, page.id, component.id, parsed, '编辑组件数据');
    draft.change();
  });
  const readAdvanced = (source: string) => {
    const parsed = ComponentChangesSchema.pick({ bindings: true, options: true, repeat: true }).parse(JSON.parse(source));
    return { bindings: parsed.bindings ?? {}, ...(optionsEnabled && { options: parsed.options ?? value.options ?? [] }), ...(repeatEnabled && { repeat: parsed.repeat ?? null }) };
  };
  const changeOption = (index: number, field: 'label' | 'value', next: string) => change({ ...value, options: value.options?.map((option, i) => i === index ? { ...option, [field]: next } : option) });
  if (!kind && !textEnabled && !component.bindings && !repeatEnabled && !optionsEnabled) return null;

  return <CandidateSection title="数据与绑定" collapsible initiallyOpen={false}>
    <fieldset className="candidate-property-form" disabled={action.busy || draft.conflict}>
      <fieldset className="candidate-property-form" disabled={value.source !== undefined}>
      {keys.map(key => {
        const binding = value.bindings[key], label = bindingLabels[key] ?? key;
        return <div className="candidate-property-binding" key={key}>
          <PageChoiceField label={`${label}绑定`} value={binding ? 'on' : 'off'} options={bindingMode} onChange={mode => {
            const bindings = { ...value.bindings };
            if (mode === 'off') delete bindings[key];
            else if (key === 'value') bindings[key] = { source: 'local', path: Object.entries(context.local).find(([, item]) => !valueType || typeof item === valueType)?.[0] ?? 'value' };
            else bindings[key] = { source: 'literal', value: key === 'text' ? '' : true };
            change({ ...value, bindings });
          }}/>
          {binding && <PageValueField label={label} value={binding} context={context} type={key === 'value' ? valueType : key === 'text' ? 'string' : ['visible', 'disabled', 'selected'].includes(key) ? 'boolean' : undefined}
            writable={key === 'value'} group={false} onChange={next => change({ ...value, bindings: { ...value.bindings, [key]: next } })}/>}
        </div>;
      })}
      {optionsEnabled && <CandidateFieldGroup title="选择项">
        {value.options?.map((option, index) => <div className="candidate-property-option" key={index}>
          <CandidateField label={`选项 ${index + 1} 的值`}><CandidateInput density="compact" value={option.value} data-local-history onChange={event => changeOption(index, 'value', event.target.value)}/></CandidateField>
          <CandidateField label="显示名称"><CandidateInput density="compact" value={option.label} data-local-history onChange={event => changeOption(index, 'label', event.target.value)}/></CandidateField>
          <CandidateIconButton label={`移除选项 ${index + 1}`} onClick={() => change({ ...value, options: value.options?.filter((_, i) => i !== index) })}><Trash2 size={14}/></CandidateIconButton>
        </div>)}
        <CandidateButton onClick={() => {
          const options = value.options ?? [];
          let index = options.length + 1;
          while (options.some(option => option.value === `option${index}`)) index++;
          change({ ...value, options: [...options, { value: `option${index}`, label: '新选项' }] });
        }}><Plus size={14}/>添加选项</CandidateButton>
      </CandidateFieldGroup>}
      {repeatEnabled && <CandidateFieldGroup title="列表项目样板">
        <PageChoiceField label="重复数据" value={value.repeat ? 'on' : 'off'} options={repeatMode} onChange={mode => change({ ...value, repeat: mode === 'off' ? null : { source: { source: 'data', path: 'characters' }, key: 'id', emptyText: '' } })}/>
        {value.repeat && <>
          <PageValueField label="集合" group={false} context={context} type="collection" value={value.repeat.source} onChange={source => change({ ...value, repeat: { ...value.repeat!, source } })}/>
          <CandidateField label="项目身份属性"><CandidateInput density="compact" value={value.repeat.key} data-local-history onChange={event => change({ ...value, repeat: { ...value.repeat!, key: event.target.value } })}/></CandidateField>
          <CandidateField label="空列表文字"><CandidateInput density="compact" value={value.repeat.emptyText ?? ''} data-local-history onChange={event => change({ ...value, repeat: { ...value.repeat!, emptyText: event.target.value } })}/></CandidateField>
          <p className="candidate-property-note">子组件会为每个项目重复。选择「当前列表项」读取该项的属性。</p>
        </>}
      </CandidateFieldGroup>}
      </fieldset>
      <details className="candidate-property-disclosure"><summary>高级数据配置</summary>
        <CandidateField label="高级数据配置 JSON" hint={value.source !== undefined ? '读取高级配置后可继续编辑可视化字段。' : undefined}>
          <CandidateTextarea rows={5} data-local-history value={value.source ?? JSON.stringify(value, null, 2)} onChange={event => change({ ...value, source: event.target.value })}/>
        </CandidateField>
        <CandidateButton disabled={value.source === undefined} onClick={() => {
          try { change(readAdvanced(value.source!)); } catch (reason) { action.setFault(reason instanceof Error ? reason.message : String(reason)); }
        }}>读取高级配置</CandidateButton>
      </details>
    </fieldset>
    <PagePropertyStatus fault={action.fault} conflict={draft.conflict}/>
    <PageDraftActions label="应用数据配置" draft={draft} busy={action.busy} apply={() => void apply()} reset={() => { draft.change(); action.setFault(''); }}/>
  </CandidateSection>;
}
