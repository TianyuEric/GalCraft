import { useEffect, useRef, useState } from 'react';
import { Link2, LockKeyhole, MousePointer2 } from 'lucide-react';
import { type ComponentConfig, type PageConfig, type PageEditOperation } from '@galcraft/contracts';
import { componentTextEditable, componentTextOverride, officialLocaleResources } from '@galcraft/templates';
import type { ComponentContribution } from '@galcraft/plugins/contracts';
import type { WorkbenchFieldPreview } from '../../../authoring/page-designer.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateInput, CandidateNumberField, CandidateSection, CandidateState, type NumberInputDraft } from '../components/controls/index.js';
import { currentPageComponent, editPage, type PageStore, type PageTemplate } from './page-edit.js';
import { workfaceError } from './workface-helpers.js';
import { pageFieldsPending } from './page-property-fields.js';
import { PageBackgroundProperties } from './page-property-background.js';
import { PageComponentLayout, type PagePropertyGeometry } from './page-property-layout.js';
import { PageAppearance, PagePropertySources, type PageVisualState } from './page-property-appearance.js';
import { PageImageSlots } from './page-property-images.js';
import { PagePluginProperties } from './page-property-plugin.js';
import { PageComponentData, PageContentProperties } from './page-data-component.js';
import '../styles/page-properties.css';

type TextDraft = { base: string; value: string };
type DimensionDraft = { baseline: string; input: NumberInputDraft };
export function pagePropertyPending(store: PageStore, viewId: string) {
  return Object.keys(store.viewState<Record<string, TextDraft>>(viewId + '/page-text') ?? {}).length > 0
    || Object.keys(store.viewState<Record<string, DimensionDraft>>(viewId + '/page-dimensions') ?? {}).length > 0
    || pageFieldsPending(store, viewId);
}

export type CandidatePagePropertiesProps = Omit<Parameters<typeof PageQuickProperties>[0], 'layout'> & {
  mode: 'layout' | 'style';
  selectedIds: readonly string[];
  state: PageVisualState;
  geometry?: PagePropertyGeometry;
  plugins?: readonly ComponentContribution[];
  onOpenStyle?: (styleId: string) => void;
};

export function CandidatePageProperties({ mode, selectedIds, state, geometry, plugins, onOpenStyle, ...props }: CandidatePagePropertiesProps) {
  const { page, component, name, store, viewId, onPending, previewField, template } = props;
  const session = { store, viewId, onPending };
  return <div className="candidate-property-sheet" onFocusCapture={() => { if (store.getSnapshot().commandTarget !== page.id) store.target(page.id); }}>
    {component ? <>
      <PageQuickProperties key={component.id} {...props} layout={mode === 'layout'}/>
      {mode === 'layout' ? <>
        <PageComponentLayout key={`${component.id}/layout`} session={session} page={page} component={component} selectedIds={selectedIds} name={name} geometry={geometry} locales={template.locales}/>
        <PageContentProperties key={`${component.id}/content`} session={session} page={page} component={component}/>
        {component.plugin && <PagePluginProperties key={`${component.id}/plugin`} session={session} page={page} component={component} definition={plugins?.find(item => item.key === component.plugin!.key)}/>}
        <PageComponentData key={`${component.id}/data`} session={session} page={page} component={component}/>
      </> : <PageAppearance key={`${component.id}/${state}`} session={session} page={page} component={component} template={template} state={state} previewField={previewField}/>}
      <PageImageSlots key={`${component.id}/${mode}`} session={session} page={page} component={component} state={state}/>
      <PagePropertySources key={`${component.id}/sources`} page={page} component={component} template={template} state={state} geometry={geometry} onOpenStyle={onOpenStyle}/>
    </> : mode === 'layout' ? <PageBackgroundProperties session={session} page={page} previewField={previewField}/>
      : <CandidateSection title="页面样式"><p className="candidate-property-note">选中组件可编辑各状态的外观。页面和组件的命名样式在样式编辑器中管理。</p></CandidateSection>}
  </div>;
}
export function PageQuickProperties({ page, component, selectionCount, name, store, template, previewLocale, viewId, onPending, previewField, layout }: {
  page: PageConfig; component?: ComponentConfig; selectionCount: number; name: string; store: PageStore; template: PageTemplate; previewLocale: string; viewId: string; onPending: () => void; previewField: (change: WorkbenchFieldPreview | null) => void; layout: boolean;
}) {
  const [fault, setFault] = useState('');
  const [busy, setBusy] = useState(false);
  const labelKey = String(component?.content.labelKey ?? '');
  const display = component && componentTextEditable(component) ? componentTextOverride(component, template.locales, previewLocale)
    ?? String(component.content.text ?? template.locales[previewLocale]?.[labelKey] ?? officialLocaleResources()[previewLocale as 'zh-CN' | 'en' | 'ja']?.strings[labelKey] ?? template.locales['zh-CN']?.[labelKey] ?? labelKey) : undefined;
  const draftKey = viewId + '/page-text', target = component?.id + '/' + previewLocale;
  const [draft, setDraft] = useState(() => store.viewState<Record<string, TextDraft>>(draftKey)?.[target]);
  useEffect(() => setDraft(store.viewState<Record<string, TextDraft>>(draftKey)?.[target]), [store, draftKey, target]);
  const text = draft?.value;
  const conflict = draft !== undefined && draft.base !== display;
  const setText = (value?: string) => {
    const next = value === undefined || value === display ? undefined : { base: draft?.base ?? display ?? '', value };
    const all = { ...store.viewState<Record<string, TextDraft>>(draftKey) };
    if (next) all[target] = next; else delete all[target];
    store.rememberViewState(draftKey, all);
    setDraft(next);
    onPending();
  };
  const perform = async (label: string, operation: PageEditOperation) => {
    setBusy(true); setFault('');
    try { await editPage(store, label, [operation]); if (operation.kind === 'component.text') setText(undefined); }
    catch (reason) { setFault(workfaceError(reason)); }
    finally { setBusy(false); }
  };
  const handoff = async () => {
    if (!component) return;
    setFault('');
    try {
      const document = store.host.list().find(item => item.documentId === page.id);
      const send = store.tasks.collaboration.handoffTarget;
      if (!document || !send) throw new Error('请先创建或连接当前作品的协作。');
      const result = await send({ target: { ref: { kind: 'component', id: component.id }, source: { documentId: document.documentId, revision: document.revision } } });
      if (!result.ok) throw new Error(result.error.message);
      store.notice('已交接这个组件与所读版本。');
    } catch (reason) { setFault(workfaceError(reason)); }
  };
  return <CandidateSection title={component ? name : '页面属性'} actions={component && selectionCount === 1 ? <CandidateButton onClick={() => void handoff()}><Link2 size={14}/>交给协作</CandidateButton> : undefined}>
    {component ? <>
      {selectionCount > 1 && <p className="candidate-page-hint">已选择 {selectionCount} 个组件。字段作用于 {name}。</p>}
      <div className="candidate-page-checks">
        <label><CandidateCheckbox checked={component.visible} disabled={busy} onChange={event => void perform('切换组件显示', { kind: 'component.update', pageId: page.id, componentId: component.id, changes: { visible: event.target.checked } })}/>显示</label>
        <label><CandidateCheckbox checked={component.locked} disabled={busy} onChange={event => void perform('切换组件锁定', { kind: 'component.update', pageId: page.id, componentId: component.id, changes: { locked: event.target.checked } })}/><LockKeyhole size={13}/>锁定</label>
      </div>
      {layout && <PageDimensions key={component.id} page={page} component={component} store={store} viewId={viewId} onPending={onPending} previewField={previewField}/>}
      {display !== undefined && <form className="candidate-page-text-form" onSubmit={event => {
        event.preventDefault();
        if (text !== undefined && !conflict) void perform('修改显示文字', { kind: 'component.text', pageId: page.id, componentId: component.id, locale: previewLocale, text });
      }}>
        <CandidateField label={`显示文字 · ${previewLocale}`}><CandidateInput value={text ?? display} onChange={event => setText(event.target.value)} data-local-history={text !== undefined}/></CandidateField>
        <CandidateButton type="submit" disabled={busy || conflict || text === undefined || text === display}>应用文字</CandidateButton>
        {text !== undefined && <CandidateButton disabled={busy} onClick={() => setText(undefined)}>{conflict ? '重新读取' : '撤回'}</CandidateButton>}
        {conflict && <p role="alert" className="candidate-page-error">正式文字已变化。请重新读取后编辑。</p>}
        {componentTextOverride(component, template.locales, previewLocale) !== undefined && <CandidateButton disabled={busy} onClick={() => void perform('恢复默认文字', { kind: 'component.text', pageId: page.id, componentId: component.id, locale: previewLocale, text: null })}>恢复默认文字</CandidateButton>}
      </form>}
    </> : <CandidateState kind="empty" title="编辑页面背景" description={<><MousePointer2 size={13}/> 也可在画布或组件大纲中选择组件。</>}/>}
    {fault && <p role="alert" className="candidate-page-error">{fault}</p>}
  </CandidateSection>;
}

const dimensions = { x: '水平位置', y: '垂直位置', width: '宽度', height: '高度' };
function PageDimensions({ page, component, store, viewId, onPending, previewField }: {
  page: PageConfig; component: ComponentConfig; store: PageStore; viewId: string; onPending: () => void;
  previewField: (change: WorkbenchFieldPreview | null) => void;
}) {
  const draftKey = viewId + '/page-dimensions';
  const [, refreshDrafts] = useState(0);
  const clearPreview = useRef(previewField);
  clearPreview.current = previewField;
  useEffect(() => () => clearPreview.current(null), []);
  return <div className="candidate-page-dimensions">
    {(Object.keys(dimensions) as (keyof typeof dimensions)[]).map(field => {
      const length = component.layout[field];
      const key = component.id + '/' + field;
      const fixed = length.unit !== 'auto';
      const coordinate = field === 'x' || field === 'y';
      const unit = length.unit === 'percent' ? '%' : 'px';
      const min = coordinate ? undefined : 0;
      const baseline = JSON.stringify(length);
      const change = (draft: NumberInputDraft | null) => {
        const values = { ...store.viewState<Record<string, DimensionDraft>>(draftKey) };
        if (draft) values[key] = { baseline: values[key]?.baseline ?? baseline, input: draft }; else delete values[key];
        store.rememberViewState(draftKey, values);
        onPending();
        refreshDrafts(revision => revision + 1);
      };
      const preview = (value: number | null) => previewField(value === null || value === (fixed ? length.value : null)
        ? null : { kind: 'dimension', componentId: component.id, field, value });
      const commit = async (value: number | null) => {
        const current = currentPageComponent(store, page.id, component.id);
        const started = store.viewState<Record<string, DimensionDraft>>(draftKey)?.[key]?.baseline ?? baseline;
        if (!current || JSON.stringify(current.layout[field]) !== started) throw new Error('正式值已变化。按 Esc 读取最新尺寸。');
        const layout = value === null ? { [field]: { unit: 'auto' } }
          : { [field]: { unit: fixed ? length.unit : 'px', value }, ...(coordinate ? { position: 'free' as const } : {}) };
        await editPage(store, '调整组件尺寸与位置', [{ kind: 'component.update', pageId: page.id, componentId: component.id, changes: { layout } }]);
        previewField(null);
      };
      const props = { label: dimensions[field], unit, step: 1, min, locale: store.controller.preferences.locale,
        inputDraft: store.viewState<Record<string, DimensionDraft>>(draftKey)?.[key]?.input, onInputDraftChange: change,
        onPreview: preview, onCommit: commit };
      return fixed ? <CandidateNumberField key={field} {...props} value={length.value}/> : <CandidateNumberField key={field} {...props} allowEmpty value={null}/>;
    })}
  </div>;
}
