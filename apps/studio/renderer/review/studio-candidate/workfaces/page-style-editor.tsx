import { useEffect, useMemo, useRef, useState } from 'react';
import { Pin, X } from 'lucide-react';
import * as monaco from 'monaco-editor';
import type { DocumentView, Issue, NamedStyle, PageConfig, StyleEditInput } from '@galcraft/contracts';
import { adoptCanvasStyle, components } from '@galcraft/templates';
import { configureMonacoWorkers } from '../../../components/monaco-workers.js';
import { designerComponentName, designerPageName } from '../../../authoring/designer-labels.js';
import { CandidateButton, CandidateField, CandidateIconButton, CandidateInput, CandidateReviewDialog, CandidateSelect, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { editPage, type PageStore, type PageTemplate } from './page-edit.js';
import { CandidateResourcePreview, type PageResourcePreviewInput } from './page-resource-preview.js';
import { resultValue, workfaceError } from './workface-helpers.js';

type StyleFields = Omit<StyleEditInput, 'label' | 'styleId'>;
type StyleDraft = { fields: StyleFields; baseline: string };
export const styleDraftKey = (viewId: string) => viewId + '/named-style';
export type PageStyleTarget = { style?: NamedStyle; page: PageConfig; componentId: string | null };
type ScopedStyles = Record<string, StyleDraft>;
type Scope = { label: string; pinned: boolean; unavailable?: boolean; onPin: () => void; onClose: () => void; onFocus: () => void; onApplied: () => void };
const scopedDraftKey = (viewId: string) => viewId + '/scoped-styles';
export const pageStyleScope = (pageId: string, componentId: string | null) => `${pageId}/${componentId ?? 'page'}`;
export const hasScopedStyleDraft = (store: PageStore, viewId: string) => Object.keys(store.viewState<ScopedStyles>(scopedDraftKey(viewId)) ?? {}).length > 0;
export const missingScopedStyleDrafts = (store: PageStore, viewId: string, page: PageConfig, componentIds: ReadonlySet<string>) =>
  Object.values(store.viewState<ScopedStyles>(scopedDraftKey(viewId)) ?? {}).flatMap(({ fields }) =>
    fields.pageId === page.id && fields.componentId && !componentIds.has(fields.componentId) ? [{ id: fields.componentId, name: fields.name }] : []);

const styleInput = (target: PageStyleTarget, files: Record<string, string>): StyleFields => {
  const { style, page, componentId } = target;
  const items = components(page.root);
  const part = (items.find(item => item.id === componentId) ?? items[1] ?? page.root).part;
  return { name: style?.name ?? page.key + ' 样式', pageId: page.id, componentId, language: style?.language ?? 'css',
    activation: style?.activation ?? 'page', source: (style && files[style.sourcePath]) ?? '[data-gc-part="' + part + '"] {\n  color: #466b92;\n}' };
};
const styleVersion = (style: NamedStyle | undefined, fields: StyleFields) => JSON.stringify({ style, fields });

export function restoreScopedStyleDrafts(store: PageStore, viewId: string, documents: readonly DocumentView[], template: PageTemplate,
  sources: Record<string, string>, settings: Record<string, NamedStyle>) {
  const drafts = { ...store.viewState<ScopedStyles>(scopedDraftKey(viewId)) };
  const files = Object.assign({}, ...documents.map(doc => doc.files)) as Record<string, string>;
  for (const [key, source] of Object.entries(sources)) {
    const previous = settings[key];
    const [pageId, part] = key.split('/');
    const page = template.pages.find(item => item.id === (previous?.scope.pageId ?? pageId));
    if (!page) continue;
    const componentId = previous ? previous.scope.componentId : part && part !== 'page' ? part : null;
    const scope = pageStyleScope(page.id, componentId);
    if (drafts[scope]) continue;
    const style = template.styles.find(item => item.scope.pageId === page.id && item.scope.componentId === componentId);
    const baseline = styleInput({ style, page, componentId }, files);
    const fields = previous ? { ...baseline, name: previous.name, language: previous.language, activation: previous.activation ?? 'page', source } : { ...baseline, source };
    drafts[scope] = { fields, baseline: styleVersion(style, baseline) };
  }
  store.rememberViewState(scopedDraftKey(viewId), drafts);
}

export function CandidatePageStyle({ store, viewId, template, target, documents, theme, locale, active, onNavigate, onPending, scope }: {
  store: PageStore; viewId: string; template: PageTemplate; target: PageStyleTarget; documents: readonly DocumentView[]; theme: string; locale: string;
  active: boolean; onNavigate?: (id: string) => void; onPending: () => void; scope?: Scope;
}) {
  const files = Object.assign({}, ...documents.map(doc => doc.files)) as Record<string, string>;
  const saved = styleInput(target, files), version = styleVersion(target.style, saved);
  const targetKey = pageStyleScope(target.page.id, target.componentId);
  const readDraft = () => scope ? store.viewState<ScopedStyles>(scopedDraftKey(viewId))?.[targetKey] : store.viewState<StyleDraft>(styleDraftKey(viewId));
  const [draft, setDraft] = useState(readDraft);
  const writeDraft = (value: StyleDraft | undefined) => {
    if (scope) {
      const key = scopedDraftKey(viewId), drafts = { ...store.viewState<ScopedStyles>(key) };
      if (value) drafts[targetKey] = value;
      else delete drafts[targetKey];
      store.rememberViewState(key, drafts);
    } else store.rememberViewState(styleDraftKey(viewId), value);
    setDraft(value);
    onPending();
  };
  const fields = draft?.fields ?? saved;
  const [issueOverride, setIssueOverride] = useState<Issue[]>();
  const issues = issueOverride ?? target.style?.issues ?? [];
  const [preview, setPreview] = useState<PageResourcePreviewInput>();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [fault, setFault] = useState('');
  const [notice, setNotice] = useState('');
  const [generated, showGenerated] = useState(false);
  const [remove, showRemove] = useState(false);
  const [focused, setFocused] = useState(false);
  const unavailable = scope?.unavailable === true;
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | undefined>(undefined);
  const synchronized = useRef(false);
  const changeSource = useRef<(value: string) => void>(() => {});
  const dirty = !!draft;
  const conflict = dirty && draft.baseline !== version;
  const update = (next: StyleFields) => {
    const keep = JSON.stringify(next) !== JSON.stringify(saved) || conflict;
    const value = keep ? { fields: next, baseline: draft?.baseline ?? version } : undefined;
    writeDraft(value);
    setFault('');
    setNotice('');
    setIssueOverride(undefined);
    setPreview(undefined);
  };
  changeSource.current = source => update({ ...fields, source });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    configureMonacoWorkers();
    const model = monaco.editor.createModel(fields.source, fields.language);
    const instance = monaco.editor.create(element, { model, automaticLayout: true, ariaLabel: '样式源码',
      lineNumbers: 'on', minimap: { enabled: false }, wordWrap: 'on', scrollBeyondLastLine: false, fontSize: 12, lineHeight: 20, padding: { top: 8 } });
    editor.current = instance;
    const change = instance.onDidChangeModelContent(() => { if (!synchronized.current) changeSource.current(model.getValue()); });
    return () => { change.dispose(); instance.dispose(); model.dispose(); editor.current = undefined; };
  }, []);
  useEffect(() => { monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs'); }, [theme, active]);
  useEffect(() => {
    const instance = editor.current, model = instance?.getModel();
    if (!model || !instance) return;
    monaco.editor.setModelLanguage(model, fields.language);
    instance.updateOptions({ readOnly: busy || unavailable });
    if (model.getValue() !== fields.source) {
      synchronized.current = true;
      const view = instance.saveViewState();
      instance.executeEdits('galcraft-style-document', [{ range: model.getFullModelRange(), text: fields.source, forceMoveMarkers: true }]);
      if (view) instance.restoreViewState(view);
      synchronized.current = false;
    }
  }, [fields.source, fields.language, busy, unavailable]);
  useEffect(() => {
    const model = editor.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(model, 'galcraft-style', issues.map(issue => {
      const start = model.getPositionAt(issue.source?.range?.start ?? 0), end = model.getPositionAt(issue.source?.range?.end ?? 1);
      return { message: issue.message, severity: issue.severity === 'error' ? monaco.MarkerSeverity.Error : issue.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
        startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
    }));
  }, [issues]);
  const reset = () => {
    writeDraft(undefined);
    setPreview(undefined); setFault(''); setNotice(''); setIssueOverride(undefined);
  };
  const page = template.pages.find(item => item.id === fields.pageId) ?? target.page;
  const compile = async (commit: boolean) => {
    if (running.current) return;
    running.current = true; setBusy(true); setFault(''); setNotice('');
    const submittedDraft = JSON.stringify(readDraft());
    try {
      if (conflict) throw new Error('作品样式已变化。请重新读取后编译。');
      const prepare = store.services.bridge.templates?.preparePageStyleEdit;
      if (!prepare) throw new Error('样式编译服务不可用。');
      const plan = resultValue(await prepare({ ...fields, name: fields.name.trim(), label: '修改命名样式', styleId: target.style?.id }));
      const id = plan.created.styles[0] ?? target.style?.id;
      const compiled = plan.template.styles.find(item => item.id === id);
      if (!compiled) throw new Error('编译结果缺少命名样式。');
      const output = Object.fromEntries(plan.edit.patches.flatMap(patch => patch.kind === 'file' && patch.after !== null ? [[patch.path, patch.after]] : []));
      if (commit) {
        resultValue(await store.applyEdit(plan.edit));
        if (JSON.stringify(readDraft()) === submittedDraft) reset();
        scope?.onApplied();
        if (!scope && !target.style) onNavigate?.('page:@style:' + compiled.id);
      }
      if (!commit) setIssueOverride(compiled.issues);
      setNotice(compiled.issues.some(issue => issue.severity === 'error') ? (commit ? '已应用源码 · Player 保留最后有效样式' : '编译失败 · Player 保留最后有效样式')
        : (commit ? '已编译并应用 · 未保存' : '已编译 · 预览独立于作品'));
      if (!commit) setPreview({ template: plan.template, files: output, page: page.key });
    } catch (reason) { setFault(workfaceError(reason)); }
    finally { running.current = false; setBusy(false); }
  };
  const removeStyle = async () => {
    setBusy(true); setFault('');
    try {
      if (target.style) await editPage(store, '删除命名样式', [{ kind: 'style.remove', styleId: target.style.id }]);
      reset(); showRemove(false);
      if (!scope) onNavigate?.('page:' + target.page.key);
    } catch (reason) { showRemove(false); setFault(workfaceError(reason)); }
    finally { setBusy(false); }
  };
  const savedPreview = useMemo<PageResourcePreviewInput>(() => ({ template, page: page.key }), [template, page.key]);
  return <div className="candidate-resource-stack" data-style-id={target.style?.id} onFocusCapture={scope?.onFocus}>
    {scope && <CandidateToolbar label="样式作用域" className="candidate-scoped-style-header">
      <span title={scope.label}><strong>作用域</strong> {scope.label}</span>
      <CandidateButton aria-pressed={scope.pinned} onClick={scope.onPin}><Pin size={14} aria-hidden="true"/>固定样式目标</CandidateButton>
      <CandidateIconButton label="关闭样式视图" onClick={scope.onClose}><X size={14} aria-hidden="true"/></CandidateIconButton>
    </CandidateToolbar>}
    <div className="candidate-resource-fields">
      <CandidateField label="样式名称"><CandidateInput density="compact" value={fields.name} disabled={busy} readOnly={unavailable} onChange={event => update({ ...fields, name: event.currentTarget.value })}/></CandidateField>
      <CandidateField label="样式语言"><CandidateSelect density="compact" value={fields.language} disabled={busy} readOnly={unavailable} onValueChange={language => update({ ...fields, language: language as StyleFields['language'] })}><option value="css">CSS</option><option value="scss">SCSS</option></CandidateSelect></CandidateField>
      <CandidateField label="激活方式"><CandidateSelect density="compact" value={fields.activation} disabled={busy} readOnly={unavailable} onValueChange={activation => update({ ...fields, activation: activation as StyleFields['activation'] })}><option value="page">页面自动生效</option><option value="command">剧情 applyStyle 激活</option></CandidateSelect></CandidateField>
      {!scope && <><CandidateField label="所属页面"><CandidateSelect density="compact" value={fields.pageId} disabled={busy} onValueChange={pageId => update({ ...fields, pageId, componentId: null })}>{template.pages.map(item => <option key={item.id} value={item.id}>{designerPageName(item.key, locale, template.locales)}</option>)}</CandidateSelect></CandidateField>
      <CandidateField label="作用域"><CandidateSelect density="compact" value={fields.componentId ?? ''} disabled={busy} onValueChange={componentId => update({ ...fields, componentId: componentId || null })}><option value="">整个页面</option>{components(page.root).map(item => <option key={item.id} value={item.id}>{designerComponentName(item, locale, template.locales)}</option>)}</CandidateSelect></CandidateField></>}
    </div>
    {unavailable ? <p className="candidate-resource-hint">目标组件已移除。可复制源码，或放弃此草稿。</p>
      : (fault || conflict) && <CandidateState kind="error" title={fault || '命名样式已被其他编辑修改。'} action={conflict ? <CandidateButton onClick={reset}>重新读取</CandidateButton> : undefined}/>}
    <CandidateToolbar label="样式操作" className="candidate-resource-toolbar">
      <CandidateButton variant="primary" disabled={busy || conflict || unavailable || !fields.name.trim()} onClick={() => void compile(true)}>编译并应用</CandidateButton>
      {!scope && <CandidateButton variant="secondary" disabled={busy || conflict || !fields.name.trim()} onClick={() => void compile(false)}>编译预览</CandidateButton>}
      <CandidateButton disabled={busy} aria-pressed={focused} onClick={() => { setFocused(!focused); editor.current?.focus(); }}>{focused ? (scope ? '显示画布' : '显示 Player') : '聚焦源码'}</CandidateButton>
      <CandidateButton disabled={busy || unavailable} onClick={() => {
        const model = editor.current?.getModel();
        if (model) editor.current?.executeEdits('galcraft-canvas-units', [{ range: model.getFullModelRange(), text: adoptCanvasStyle(model.getValue()) }]);
      }}>采用画布单位</CandidateButton>
      <CandidateButton disabled={!target.style?.compiledPath} aria-expanded={generated} onClick={() => showGenerated(!generated)}>查看生成 CSS</CandidateButton>
      {dirty && !unavailable && <CandidateButton disabled={busy} onClick={reset}>恢复输入</CandidateButton>}
      <CandidateButton variant="danger" disabled={busy || (unavailable && !dirty)} onClick={() => showRemove(true)}>{target.style ? '删除样式' : unavailable ? '放弃草稿' : '放弃新样式'}</CandidateButton>
    </CandidateToolbar>
    {(busy || notice) && <p role="status" className="candidate-resource-hint">{busy ? '正在编译…' : notice}</p>}
    <div className="candidate-resource-style-body" data-source-focus={focused || undefined}>
      <div className="candidate-resource-monaco" ref={host}/>
      {!scope && !focused && <CandidateResourcePreview store={store} input={preview ?? savedPreview} active={active}/>}
    </div>
    {issues.length > 0 && <ul className="candidate-resource-issues" aria-label="编译诊断">{issues.map((issue, index) => <li key={issue.code + index} data-severity={issue.severity}><CandidateButton onClick={() => {
      const model = editor.current?.getModel();
      if (!model) return;
      const position = model.getPositionAt(issue.source?.range?.start ?? 0);
      editor.current?.setPosition(position); editor.current?.revealPositionInCenter(position); editor.current?.focus();
    }}>{issue.message}</CandidateButton></li>)}</ul>}
    {generated && target.style?.compiledPath && <pre className="candidate-resource-css"><code>{files[target.style.compiledPath]}</code></pre>}
    <CandidateReviewDialog open={remove} title={target.style ? '删除命名样式？' : '放弃新样式？'} description={target.style ? '作品历史可恢复已删除的样式。' : '当前样式源码和设置草稿将被丢弃。'} busy={busy} onDismiss={() => showRemove(false)}
      actions={<CandidateButton variant="danger" disabled={busy} onClick={() => void removeStyle()}>确认{target.style ? '删除' : '放弃'}</CandidateButton>}/>
  </div>;
}
