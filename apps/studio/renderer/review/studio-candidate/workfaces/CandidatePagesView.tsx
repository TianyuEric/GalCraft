import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Braces, FilePlus, FileText, LayoutList, PanelRight, SlidersHorizontal } from 'lucide-react';
import { LockSchema, createId } from '@galcraft/contracts';
import { applyReadingPreset, components, readTemplateDocuments, templateEdit } from '@galcraft/templates';
import { designerComponentName, designerPageName } from '../../../authoring/designer-labels.js';
import { PageDesigner, type WorkbenchPreviewSettings } from '../../../authoring/page-designer.js';
import { planPortraitBatch } from '../../../authoring/portrait-batch.js';
import { prepareProjectPlugins } from '../../../authoring/plugins.js';
import { CandidateButton, CandidateField, CandidateInput, CandidateMenuButton, CandidateObjectRow, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { useCandidate, useCandidateState } from '../application/context.js';
import { CandidatePageBehavior, CandidatePageLocalState, pageBehaviorPending } from './page-behavior.js';
import { CandidatePageProperties, type CandidatePagePropertiesProps, pagePropertyPending } from './page-properties.js';
import { CandidatePageResourceView } from './page-resource-view.js';
import { CandidatePageStyle, hasScopedStyleDraft, missingScopedStyleDrafts, pageStyleScope, restoreScopedStyleDrafts } from './page-style-editor.js';
import { CandidatePageReadingStyles } from './page-reading-styles.js';
import { CandidatePageAnimationBindings } from './page-ui-animation-editor.js';
import { CandidatePageAfterstory } from './page-resource-afterstory.js';
import { PageOutline, type PageOutlineState } from './page-outline.js';
import { editPage } from './page-edit.js';
import { CandidatePageBlueprint } from './CandidatePageBlueprint.js';
import { useDocumentVisibility } from './document-visibility.js';
import { resultValue, useFormalSource, workfaceError, type CandidateWorkfaceProps } from './workface-helpers.js';
import '../styles/pages.css';

const pageModes = { layout: '布局', style: '样式', behavior: '行为', preview: '预览', blueprint: '蓝图审核' } as const;
const defaultStylePreview = 40;
const minStylePreview = 20, maxStylePreview = 70;
const constrainStylePreview = (value: number) => Math.min(maxStylePreview, Math.max(minStylePreview, Math.round(value)));
type PageMode = keyof typeof pageModes;
type DesignerViewState = { capture: ReturnType<PageDesigner['capture']>; scrollTop: number };
type DesignerOutline = PageOutlineState & { openStyle: () => void };
type OutlineMap = Map<string, DesignerOutline>;
const outlines = new WeakMap<ReturnType<typeof useCandidate>, { value: OutlineMap; subscribers: Set<() => void> }>();
function outlineStore(store: ReturnType<typeof useCandidate>) {
  let state = outlines.get(store);
  if (!state) {
    state = { value: new Map(), subscribers: new Set() };
    outlines.set(store, state);
  }
  const model = state;
  return {
    get: () => model.value,
    subscribe: (listener: () => void) => { model.subscribers.add(listener); return () => { model.subscribers.delete(listener); }; },
    set: (id: string, outline?: DesignerOutline) => {
      model.value = new Map(model.value);
      if (outline) model.value.set(id, outline); else model.value.delete(id);
      for (const listener of model.subscribers) listener();
    },
  };
}

type PagePropertyEntry = { props: CandidatePagePropertiesProps; afterstory: boolean; onNavigate?: (id: string) => void };
const propertyModels = new WeakMap<ReturnType<typeof useCandidate>, { value: Map<string, PagePropertyEntry>; listeners: Set<() => void> }>();
function propertyStore(store: ReturnType<typeof useCandidate>) {
  let state = propertyModels.get(store);
  if (!state) { state = { value: new Map(), listeners: new Set() }; propertyModels.set(store, state); }
  const model = state;
  return {
    get: () => model.value,
    subscribe: (listener: () => void) => { model.listeners.add(listener); return () => { model.listeners.delete(listener); }; },
    set: (id: string, entry?: PagePropertyEntry) => { model.value = new Map(model.value); if (entry) model.value.set(id, entry); else model.value.delete(id); for (const listener of model.listeners) listener(); },
  };
}

export function CandidatePageInspector({ viewId }: { viewId: string }) {
  const store = useCandidate(), model = useMemo(() => propertyStore(store), [store]);
  const entry = useSyncExternalStore(model.subscribe, model.get, model.get).get(viewId);
  return entry ? <div className="candidate-page-properties" aria-label="组件属性">
    <CandidatePageProperties key={viewId + '/' + (entry.props.component?.id ?? 'page')} {...entry.props}/>
    {entry.props.mode === 'style' && <><CandidatePageReadingStyles store={store} page={entry.props.page} component={entry.props.component} template={entry.props.template} locale={store.controller.preferences.locale}/>
      <CandidatePageAnimationBindings store={store} page={entry.props.page} component={entry.props.component} template={entry.props.template} onNavigate={entry.onNavigate}/></>}
    {entry.props.mode === 'layout' && entry.afterstory && <CandidatePageAfterstory store={store} viewId={viewId} locale={store.controller.preferences.locale}/>}
  </div> : <CandidateSection title="页面属性"><CandidateState kind="empty" title="页面编辑器未打开" description="定位来源后可查看页面或选中组件的属性。"/></CandidateSection>;
}

function hasDraft(state?: DesignerViewState) {
  if (!state) return false;
  const { styleDrafts, fieldInputs, animation } = state.capture;
  return Object.keys(styleDrafts).length > 0 || Object.keys(fieldInputs).length > 0 || !!animation && JSON.stringify(animation.draft) !== animation.baseline;
}

export function candidatePageTitle(page: { key: string; titleKey: string }, locale: string, locales: Record<string, Record<string, string>>) {
  return locales[locale]?.[page.titleKey]
    ?? (!['page.' + page.key, page.key].includes(page.titleKey) ? page.titleKey : designerPageName(page.key, locale, locales));
}

export function candidatePageResourceTitle(key: string, template: ReturnType<typeof readTemplateDocuments>) {
  if (key === '@templates') return '作品模板';
  if (key === '@animations') return '共享界面动画';
  if (key === 'gallery-content') return '鉴赏内容';
  if (key.startsWith('@style:new:')) return template.pages.some(page => page.id === key.split(':')[2]) ? '新建命名样式' : undefined;
  if (key.startsWith('@style:')) return template.styles.find(style => style.id === key.slice(7))?.name;
  if (key.startsWith('@animations:')) {
    const [, targetId, event] = key.split(':');
    const target = template.pages.flatMap(page => components(page.root)).find(component => component.id === targetId);
    const actions: Record<string, string> = { enter: '进入', exit: '退出', show: '显示', hide: '隐藏', hover: '悬停', focus: '焦点', pressed: '按下' };
    const action = actions[event ?? ''];
    if (target && action) return `${target.name || target.part} · ${action}动画`;
  }
  return undefined;
}

export function CandidatePageDirectory({ onNavigate }: CandidateWorkfaceProps) {
  const store = useCandidate();
  const { activeView } = useCandidateState();
  const { documents } = useSyncExternalStore(store.host.subscribe, store.host.getSnapshot, store.host.getSnapshot);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const createFormId = useId();
  const data = useMemo(() => { try { return readTemplateDocuments(documents); } catch { return null; } }, [documents]);
  const locale = store.controller.preferences.locale;
  const create = async () => {
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true); setError('');
    try {
      const key = 'page-' + createId().slice(0, 8);
      await editPage(store, '新建页面', [{ kind: 'page.create', key, title }]);
      setName(''); setCreating(false); onNavigate?.('page:' + key);
    } catch (reason) { setError(workfaceError(reason)); } finally { setBusy(false); }
  };
  const matches = data?.pages.filter(page => candidatePageTitle(page, locale, data.locales).toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()));
  return <CandidateSection title="页面目录" scroll className="candidate-page-directory" actions={<CandidateButton disabled={!data} onClick={() => { setError(''); setCreating(true); }}><FilePlus size={14}/>新建页面</CandidateButton>}>
    <div className="candidate-page-directory-filter"><CandidateInput aria-label="查找页面" placeholder="查找页面" value={filter} onChange={event => setFilter(event.target.value)}/><small>{matches?.length ?? 0} 页</small></div>
    <nav aria-label="页面列表">
      {matches?.map(page => {
        const id = 'page:' + page.key;
        return <CandidateObjectRow key={page.id} active={activeView === id} icon={<FileText size={15}/>} title={candidatePageTitle(page, locale, data!.locales)} onActivate={() => onNavigate?.(id)}/>;
      })}
      {!matches?.length && <CandidateState kind={data ? 'empty' : 'error'} title={data ? '没有匹配的页面' : '页面目录无法读取'}/>}
    </nav>
    <CandidateSection title="作品界面资源" className="candidate-page-directory-resources">
      <nav aria-label="作品界面资源">
        {[
          { id: 'page:@templates', title: '作品模板', icon: <FileText size={15}/> },
          { id: 'page:@animations', title: '共享界面动画', icon: <FileText size={15}/> },
          { id: 'page:gallery-content', title: '鉴赏内容', icon: <FileText size={15}/> },
          ...(data?.styles.map(style => ({ id: 'page:@style:' + style.id, title: style.name, metadata: style.language.toUpperCase(), icon: <Braces size={15}/> })) ?? []),
        ].map(item => <CandidateObjectRow key={item.id} active={activeView === item.id} {...item} onActivate={() => onNavigate?.(item.id)}/>)}
      </nav>
    </CandidateSection>
    <CandidateReviewDialog title="新建页面" open={creating} busy={busy} initialFocus={nameInput} onDismiss={() => setCreating(false)}
      actions={<><CandidateButton disabled={busy} onClick={() => setCreating(false)}>取消</CandidateButton><CandidateButton type="submit" form={createFormId} variant="primary" disabled={!name.trim() || busy}>新建页面</CandidateButton></>}>
      <form id={createFormId} onSubmit={event => { event.preventDefault(); void create(); }}>
        <CandidateField label="新页面名称"><CandidateInput ref={nameInput} placeholder="例如：人物介绍" value={name} onChange={event => setName(event.target.value)}/></CandidateField>
        {error && <p role="alert" className="candidate-page-error">{error}</p>}
      </form>
    </CandidateReviewDialog>
  </CandidateSection>;
}

export function CandidatePageOutline({ viewId }: { viewId: string }) {
  const store = useCandidate();
  const model = useMemo(() => outlineStore(store), [store]);
  const outline = useSyncExternalStore(model.subscribe, model.get, model.get).get(viewId);
  if (!outline) return <CandidateSection title="组件大纲"><CandidateState kind="empty" title="请先打开一个页面" description="在页面目录中选择需要编辑的页面。"/></CandidateSection>;
  return <PageOutline key={viewId} store={store} outline={outline} onStyle={outline.openStyle}/>;
}

type PageProps = CandidateWorkfaceProps & { pageKey?: string; viewId?: string };
export function CandidatePagesView(props: PageProps) {
  if (!props.pageKey) return <CandidatePageDirectory onNavigate={props.onNavigate}/>;
  if (props.pageKey.startsWith('@') || props.pageKey === 'gallery-content') return <CandidatePageResourceView pageKey={props.pageKey} viewId={props.viewId ?? 'page:' + props.pageKey} onNavigate={props.onNavigate}/>;
  return <PageObject key={props.viewId ?? props.pageKey} {...props} pageKey={props.pageKey} viewId={props.viewId ?? 'page:' + props.pageKey}/>;
}

function pagePreviewSettings(designer: PageDesigner) {
  const { state, sample, previewLocale, zoom } = designer.capture();
  const { states, samples, locales, defaultLocale, zoom: zoomOptions } = designer.workbenchPreviewOptions();
  return [
    { key: 'state', label: '组件状态', value: state, options: states },
    { key: 'sample', label: '页面样例', value: sample, options: samples },
    { key: 'locale', label: 'Player 菜单语言', value: previewLocale ?? defaultLocale, options: locales },
    { key: 'zoom', label: '预览倍率', value: zoom, options: zoomOptions },
  ] as const;
}
async function setDesignerMode(designer: PageDesigner, mode: PageMode) {
  await designer.setWorkbenchPreview({ mode: mode === 'preview' ? 'preview' : 'design' });
}

function PageObject({ onNavigate, pageKey, viewId }: PageProps & { pageKey: string; viewId: string }) {
  const { store, source, error, versions } = useFormalSource();
  const { ui, activeView, projectActive } = useCandidateState();
  const root = useRef<HTMLElement>(null), host = useRef<HTMLDivElement>(null);
  const layoutMode = useRef<HTMLButtonElement>(null);
  const styleFocused = useRef(false);
  const visible = useDocumentVisibility(root, projectActive);
  const current = useRef<PageDesigner | null>(null);
  const viewport = useRef<HTMLElement | null>(null);
  const animationRefresh = useRef<DesignerViewState | null>(null);
  const ownWrite = useRef(false);
  const readVersions = useRef('');
  const model = useMemo(() => outlineStore(store), [store]);
  const propertiesModel = useMemo(() => propertyStore(store), [store]);
  useEffect(() => () => propertiesModel.set(viewId), [propertiesModel, viewId]);
  const [mode, setMode] = useState<PageMode>(() => store.viewState<PageMode>(viewId + '/mode') ?? 'layout');
  const [stylePin, setStylePin] = useState<string | null | undefined>(() => store.viewState<string | null>(viewId + '/style-pin'));
  const [styleTargets, setStyleTargets] = useState<ReadonlySet<string | null>>(() => new Set());
  const [stylePreview, setStylePreview] = useState(defaultStylePreview);
  const callbacks = useRef({ onNavigate, versions, mode });
  callbacks.current = { onNavigate, versions, mode };
  const [pluginComponents, setPluginComponents] = useState<DesignerOutline['plugins']>([]);
  const [options, setOptions] = useState(false);
  const [previewSettings, setPreviewSettings] = useState<ReadonlyArray<ReturnType<typeof pagePreviewSettings>[number]>>([]);
  const docs = useSyncExternalStore(store.host.subscribe, store.host.getSnapshot, store.host.getSnapshot).documents;
  const template = useMemo(() => { try { return readTemplateDocuments(docs); } catch { return undefined; } }, [docs]);
  const page = template?.pages.find(item => item.key === pageKey);
  const isPending = () => hasDraft(store.viewState<DesignerViewState>(viewId)) || hasScopedStyleDraft(store, viewId) || pageBehaviorPending(store, viewId) || pagePropertyPending(store, viewId);
  const pending = () => store.setViewPending(viewId, isPending());
  const [selection, setSelection] = useState<string[]>([]);
  const [resolved, setResolved] = useState<string>();
  const [fault, setFault] = useState('');
  const [retry, setRetry] = useState(0);
  const projectId = source?.project.projectId;
  const locale = store.controller.preferences.locale;
  const lock = store.host.list().find(document => 'dependencies.lock.json' in document.files)?.files['dependencies.lock.json'];
  const activateTarget = () => {
    const designer = current.current;
    if (designer?.workbenchPage() !== pageKey) return;
    const state = store.getSnapshot();
    if (state.activeView !== viewId) return;
    let id = designer.workbenchDocumentId();
    if (callbacks.current.mode === 'style' && styleFocused.current) {
      const documents = store.host.list();
      const template = readTemplateDocuments(documents);
      const page = template.pages.find(item => item.key === pageKey);
      const pin = store.viewState<string | null>(viewId + '/style-pin');
      const componentId = pin === undefined ? designer.capture().selected[0] ?? null : pin;
      const style = template.styles.find(item => item.scope.pageId === page?.id && item.scope.componentId === componentId);
      id = documents.find(document => style && style.sourcePath in document.files)?.documentId
        ?? documents.find(document => 'ui/template.json' in document.files)?.documentId ?? id;
    }
    if (id) {
      store.rememberViewState('page:lastActive', viewId);
      if (state.commandTarget !== id) store.target(id);
    }
  };
  useEffect(() => store.registerViewGuard(viewId, () => !isPending()), [store, viewId]);
  useEffect(() => {
    if (!host.current || !projectId || !projectActive) return;
    let alive = true, initialized = false;
    let designer: PageDesigner | null = null;
    const remember = (value: PageDesigner) => {
      const state = animationRefresh.current ?? { capture: value.capture(), scrollTop: viewport.current?.scrollTop ?? 0 };
      store.rememberViewState(viewId, state);
      pending();
    };
    const setup = async () => {
      const documents = store.host.list();
      const projectLock = lock ? LockSchema.parse(JSON.parse(lock).data) : null;
      let components: NonNullable<Awaited<ReturnType<typeof prepareProjectPlugins>>['definitions'][number]['definition']['components']> = [];
      if (projectLock?.plugins.length) {
        const plugins = await prepareProjectPlugins(store.services.bridge, projectLock, {}, { projectId, kind: 'sample', instance: createId() }, documents, [], 'definition');
        try { components = plugins.definitions.flatMap(item => item.definition.components ?? []); }
        finally { await plugins.dispose(); }
      }
      if (!alive || !host.current) return;
      setPluginComponents(components);
      const sync = () => {
        if (!alive || !designer || !initialized) return;
        const selected = designer.capture().selected;
        const currentPage = readTemplateDocuments(store.host.list()).pages.find(item => item.key === pageKey);
        setSelection(selected);
        setPreviewSettings(pagePreviewSettings(designer));
        model.set(viewId, { designer, page: currentPage, selection: selected, plugins: components,
          editable: !['preview', 'blueprint'].includes(callbacks.current.mode), selectable: callbacks.current.mode !== 'preview', updated: sync, openStyle: () => setMode('style') });
        activateTarget();
      };
      const draftChanged = () => { if (alive && designer && initialized) { remember(designer); sync(); } };
      const saved = animationRefresh.current ?? store.viewState<DesignerViewState>(viewId);
      let capture = saved?.capture;
      if (capture && Object.keys(capture.styleDrafts).length) {
        restoreScopedStyleDrafts(store, viewId, documents, readTemplateDocuments(documents), capture.styleDrafts, capture.styleDraftOptions);
        capture = { ...capture, styleDrafts: {}, styleDraftOptions: {} };
      }
      const services = { ...store.services, bridge: { ...store.services.bridge, collaboration: store.tasks.collaboration,
        documents:{...store.services.bridge.documents,applyEdit:async (...args:Parameters<typeof store.services.bridge.documents.applyEdit>)=>{
          ownWrite.current=true;
          const result=await store.services.bridge.documents.applyEdit(...args);
          if(!result.ok)ownWrite.current=false;
          return result;
        }} } };
      designer = new PageDesigner(services, async () => {
        readVersions.current = store.host.list().map(document=>`${document.documentId}/${document.revision}/${document.savedRevision}`).join('|');
        ownWrite.current=false;
        store.refreshFromHost(); sync(); if (designer) remember(designer);
      }, locale, capture, undefined, components, key => {
        if (key !== pageKey) {
          const owner = designer;
          queueMicrotask(() => { if (owner && alive) void owner.openPage(pageKey).then(sync).catch(reason => setFault(workfaceError(reason))); });
          callbacks.current.onNavigate?.('page:' + key);
        } else sync();
      }, async () => {
        const id = designer?.workbenchDocumentId();
        if (!id || !await store.save(false, id)) throw new Error('当前页面尚未保存，请处理未应用输入或重试。');
      }, origin => {
        const scene = store.controller.source?.scenes.find(item => item.documentId === origin.documentId);
        if (!scene) return;
        if (origin.statementId) store.selectCommand(scene.sceneId, origin.statementId);
        callbacks.current.onNavigate?.('source:' + scene.sceneId);
      }, () => {
        const state = store.getSnapshot();
        const scene = store.controller.source?.scenes.find(item => item.sceneId === state.ui.sceneId);
        const origin=store.viewState<string>('script:editorOrigin');
        const statementId=origin===`commands:${scene?.sceneId}`?store.commandSelection(scene!.sceneId):state.ui.lineId;
        return scene && statementId ? { documentId: scene.documentId, revision: scene.revision, statementId } : null;
      }, sync, draftChanged);
      const canvas = designer.useWorkbenchCanvas();
      viewport.current = canvas.viewport;
      current.current = designer;
      host.current.replaceChildren(canvas.status, canvas.viewport);
      readVersions.current = callbacks.current.versions;
      await designer.start();
      if (!alive) return;
      if (!designer.workbenchPages().some(item => item.id === pageKey)) throw new Error('此页面或资源已移除。请从目录选择现有对象。');
      await designer.openPage(pageKey);
      if (!alive) return;
      await setDesignerMode(designer, callbacks.current.mode);
      if (saved) canvas.viewport.scrollTo(0, saved.scrollTop);
      initialized = true;
      animationRefresh.current = null;
      setResolved(designer.workbenchPages().find(item => item.id === pageKey)?.name ?? pageKey);
      sync();
      remember(designer);
    };
    setResolved(undefined);
    void setup().catch(reason => { if (alive) setFault(workfaceError(reason)); });
    return () => {
      alive = false;
      current.current = null;
      model.set(viewId);
      if (designer) {
        if (initialized) remember(designer);
        host.current?.replaceChildren();
        queueMicrotask(() => designer?.dispose());
      }
      viewport.current = null;
    };
  }, [store, model, locale, projectId, projectActive, pageKey, viewId, lock, retry]);
  useEffect(() => {
    const designer = current.current;
    if (!designer || !resolved || ownWrite.current || readVersions.current === versions) return;
    let alive = true;
    readVersions.current = versions;
    const capture = designer.capture();
    if (capture.animation) {
      const animation = capture.animation;
      if (JSON.stringify(animation.draft) === animation.baseline) {
        const available = readTemplateDocuments(store.host.list()).animations;
        const value = available.find(item => item.id === animation.selected) ?? available[0];
        capture.animation = value ? { ...animation, selected: value.id, draft: structuredClone(value), baseline: JSON.stringify(value) } : null;
      }
      // Recreate the formal consumer against the new authority while retaining uncommitted input.
      // PageDesigner.refresh refreshes page regions but does not re-render its animation manager.
      animationRefresh.current = { capture, scrollTop: viewport.current?.scrollTop ?? 0 };
      setRetry(value => value + 1);
      return;
    }
    void designer.refresh().then(() => {
      if (!alive || current.current !== designer) return;
      const entry = designer.workbenchPages().find(page => page.id === pageKey);
      if (!entry) { setResolved(undefined); model.set(viewId); setFault('此页面或资源已移除。请从目录选择现有对象。'); return; }
      setResolved(entry.name);
      model.get().get(viewId)?.updated();
    }).catch(reason => { if (alive) setFault(workfaceError(reason)); });
    return () => { alive = false; };
  }, [versions, resolved, model, viewId, pageKey]);
  useEffect(() => {
    const element = host.current;
    if (visible || !element) return;
    for (const media of element.querySelectorAll<HTMLMediaElement>('audio, video')) media.pause();
    const pause = (event: Event) => { if (event.target instanceof HTMLMediaElement) event.target.pause(); };
    element.addEventListener('play', pause, true);
    return () => element.removeEventListener('play', pause, true);
  }, [visible]);
  useEffect(() => { activateTarget(); }, [activeView, resolved, mode, store]);
  useEffect(() => {
    store.rememberViewState(viewId + '/mode', mode);
    const designer = current.current;
    if (!designer || !resolved) return;
    let canceled = false;
    queueMicrotask(async () => {
      if (canceled || designer !== current.current) return;
      const focused = document.activeElement;
      await setDesignerMode(designer, mode);
      if (canceled || designer !== current.current) return;
      if (focused instanceof HTMLElement && focused.isConnected && root.current?.contains(focused)) focused.focus({ preventScroll: true });
      model.get().get(viewId)?.updated();
    });
    return () => { canceled = true; };
  }, [mode, resolved, model, store, viewId]);
  const showProperties = mode === 'behavior';
  const pageComponents = page ? components(page.root) : [];
  const component = pageComponents.find(item => item.id === selection[0]);
  const componentName = component && template ? component.name || designerComponentName(component, locale, template.locales) : '';
  const styleComponentId = stylePin !== undefined ? stylePin : component?.id ?? null;
  const missingStyleTargets = page ? missingScopedStyleDrafts(store, viewId, page, new Set(pageComponents.map(item => item.id))) : [];
  const currentStyleTarget = mode === 'style' && !!page && !!resolved;
  useEffect(() => {
    if (currentStyleTarget) setStyleTargets(targets => targets.has(styleComponentId) ? targets : new Set([...targets, styleComponentId]));
  }, [currentStyleTarget, styleComponentId]);
  const renderedStyleTargets = currentStyleTarget && !styleTargets.has(styleComponentId) ? [...styleTargets, styleComponentId] : [...styleTargets];
  const changeStylePin = (pin: string | null | undefined) => {
    store.rememberViewState(viewId + '/style-pin', pin);
    setStylePin(pin);
  };
  const toggleStylePin = () => changeStylePin(stylePin === undefined ? styleComponentId : undefined);
  const menuLocale = previewSettings.find(setting => setting.key === 'locale')?.value ?? locale;
  useEffect(() => {
    if (page && template && resolved) propertiesModel.set(viewId, {
      props: { page, template, component, selectedIds: selection, selectionCount: selection.length, name: componentName, store, viewId,
        mode: mode === 'style' ? 'style' : 'layout', state: previewSettings.find(setting => setting.key === 'state')?.value as CandidatePagePropertiesProps['state'] ?? 'normal',
        previewLocale: menuLocale, onPending: pending, previewField: value => current.current?.previewWorkbenchField(value),
        geometry: viewport.current && source ? { surface: viewport.current, canvasWidth: source.project.canvas.width } : undefined, plugins: pluginComponents,
        onOpenStyle: styleId => onNavigate?.('page:@style:' + styleId) },
      afterstory: pageKey === 'characters', onNavigate,
    });
    else propertiesModel.set(viewId);
  }, [propertiesModel, page, template, resolved, component, selection, componentName, mode, previewSettings, menuLocale, pluginComponents, source?.project.canvas.width, viewId, onNavigate]);
  const produce = () => {
    const designer = current.current;
    if (!designer) return;
    try {
      const page = readTemplateDocuments(store.host.list()).pages.find(item => item.key === pageKey);
      if (!page) return;
      const origin = { documentId: page.id, pageIds: [page.id], componentIds: designer.capture().selected };
      void store.tasks.openProduction('ui-assets', origin).catch(reason => store.notice(workfaceError(reason)));
    } catch (reason) { store.notice(workfaceError(reason)); }
  };
  const changeReading = async (preset: 'portrait' | 'clear') => {
    try {
      const documents = store.host.list(), next = readTemplateDocuments(documents);
      applyReadingPreset(next, preset);
      resultValue(await store.applyEdit(templateEdit(documents, next, preset === 'portrait' ? '应用头像阅读' : '应用通透阅读')));
    } catch (reason) { store.notice(workfaceError(reason)); }
  };
  const batchPortraits = async () => {
    try {
      const reading = resultValue(await store.services.read());
      const planned = resultValue(planPortraitBatch(reading));
      if (planned.count) resultValue(await store.applyEdit(planned.edit));
      store.notice(planned.count ? `已更新 ${planned.count} 条立绘头像配置 · 未保存` : '没有需要开启头像的立绘配置。');
    } catch (reason) { store.notice(workfaceError(reason)); }
  };
  const retryPage = () => { setFault(''); setRetry(value => value + 1); };
  return <section ref={root} className="candidate-workface candidate-page-workface" aria-label={resolved ?? '页面设计'} data-object-mode={mode} data-theme={ui.theme}>
    <header className="candidate-page-bar">
      <h2 title={resolved}>{resolved ?? '页面设计'}</h2>
      {resolved && <>
        <CandidateToolbar label="页面模式" className="candidate-page-modes">
          {(['layout', 'style', 'behavior', 'preview'] as const).map(key => <CandidateButton key={key} ref={key === 'layout' ? layoutMode : undefined} aria-pressed={mode === key || key === 'behavior' && mode === 'blueprint'} onClick={() => setMode(key)}>{pageModes[key]}</CandidateButton>)}
        </CandidateToolbar>
        <CandidateToolbar label="页面工具" className="candidate-page-tools">
          <CandidateButton onClick={() => onNavigate?.('page-outline')}><LayoutList size={14}/>组件大纲</CandidateButton>
          {(mode === 'layout' || mode === 'style') && <CandidateButton onClick={() => onNavigate?.('inspector')}><PanelRight size={14}/>属性</CandidateButton>}
          {mode === 'behavior' && <CandidateButton onClick={() => setMode('blueprint')} disabledReason={pageBehaviorPending(store, viewId) ? '请先应用或撤回手工行为草稿。' : undefined}>打开蓝图审核</CandidateButton>}
          {mode === 'blueprint' && <CandidateButton onClick={() => setMode('behavior')}>返回手工行为</CandidateButton>}
          <CandidateMenuButton label="页面操作" actions={[
            { id: 'produce', label: '制作 UI 位图或 SVG', run: produce },
            ...(mode === 'style' && page ? [{ id: 'new-style', label: '新建命名样式', run: () => onNavigate?.('page:@style:new:' + page.id + (component ? ':' + component.id : '')) }] : []),
            ...(mode === 'style' ? missingStyleTargets.map(target => ({ id: 'missing-style:' + target.id, label: `查看失效样式草稿 · ${target.name}`, run: () => changeStylePin(target.id) })) : []),
            ...(mode === 'preview' ? [{ id: 'startup', label: '开屏预览', run: () => void current.current?.previewWorkbenchStartup() }] : []),
            ...(mode === 'layout' && pageKey === 'story' ? [
              { id: 'reading-portrait', label: '头像阅读', separatorBefore: true, run: () => void changeReading('portrait') },
              { id: 'reading-clear', label: '通透阅读', run: () => void changeReading('clear') },
              { id: 'portrait', label: '批量开启立绘头像', disabledReason: page && components(page.root).some(item => item.part === 'story.readingPanel' && item.content.portrait === true) ? undefined : '请先为阅读面板启用头像槽。', run: () => void batchPortraits() },
            ] : []),
          ]}>页面操作</CandidateMenuButton>
          {(mode === 'layout' || mode === 'style' || mode === 'preview') && <CandidateButton onClick={() => setOptions(true)}><SlidersHorizontal size={14}/>预览选项</CandidateButton>}
        </CandidateToolbar>
      </>}
    </header>
    {(error || fault) && <CandidateState kind="error" title="页面读取失败" description={error || fault} action={<CandidateButton onClick={retryPage}>重试</CandidateButton>}/>}
    {!resolved && !fault && !error && <CandidateState kind="loading" title="正在读取页面…"/>}
    <div hidden={!resolved || mode === 'blueprint'} className="candidate-page-workspace" data-properties={showProperties || undefined} data-style={currentStyleTarget || undefined}
      style={currentStyleTarget ? { '--candidate-style-preview': `${stylePreview}%` } as CSSProperties : undefined}>
      <div ref={host} className="candidate-page-canvas-host page-designer" data-zoom={previewSettings.find(setting => setting.key === 'zoom')?.value ?? 'fit'}
        onFocusCapture={() => { styleFocused.current = false; activateTarget(); }} onPointerDownCapture={() => { styleFocused.current = false; }}/>
      {currentStyleTarget && <div className="candidate-page-style-divider" role="separator" tabIndex={0} aria-label="调整样式面板高度"
        aria-orientation="horizontal" aria-valuemin={100 - maxStylePreview} aria-valuemax={100 - minStylePreview} aria-valuenow={100 - stylePreview}
        onPointerDown={event => { if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
          setStylePreview(constrainStylePreview((event.clientY - bounds.top) * 100 / bounds.height));
        }}
        onKeyDown={event => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          setStylePreview(value => constrainStylePreview(value + (event.key === 'ArrowUp' ? -4 : 4)));
        }}/>}
      {page && template && renderedStyleTargets.map(id => {
        const open = currentStyleTarget && id === styleComponentId;
        const target = id ? pageComponents.find(item => item.id === id) : undefined;
        const unavailable = id !== null && !target;
        const style = unavailable ? undefined : template.styles.find(item => item.scope.pageId === page.id && item.scope.componentId === id);
        return <section key={pageStyleScope(page.id, id)} className="candidate-page-style-pane" aria-label="作用域 CSS / SCSS" hidden={!open}>
          <CandidatePageStyle store={store} viewId={viewId} template={template} documents={docs}
              target={{ style, page, componentId: id }} theme={ui.theme} locale={locale} active={visible && open} onPending={pending}
              scope={{ label: target ? target.name || designerComponentName(target, locale, template.locales) : unavailable ? '已移除的组件' : '整个页面',
                unavailable, pinned: stylePin !== undefined, onPin: toggleStylePin, onClose: () => { setMode('layout'); layoutMode.current?.focus(); },
                onFocus: () => { styleFocused.current = true; activateTarget(); }, onApplied: activateTarget }}/></section>;
      })}
      {showProperties && <aside className="candidate-page-properties" aria-label="组件属性">
        <>
          {mode === 'behavior' ? page && component && template
            ? <CandidatePageBehavior key={component.id} store={store} viewId={viewId} page={page} component={component} pages={template.pages.map(item => ({ value: item.key, label: candidatePageTitle(item, locale, template.locales) }))} onPending={pending}/>
            : <CandidateSection title="页面行为"><CandidateState kind="empty" title="选择要编辑的组件" description="在画布或组件大纲中选择组件后配置事件。"/></CandidateSection>
            : null}
          {mode === 'behavior' && page && <CandidatePageLocalState store={store} viewId={viewId} page={page} onPending={pending}/>}
        </>
      </aside>}
    </div>
    {mode === 'blueprint' && resolved && <CandidatePageBlueprint key={page?.id ?? pageKey} pageKey={pageKey} selection={selection} versions={versions} active={visible} onNavigate={onNavigate}/>}
    <CandidateReviewDialog title="预览选项" description="样例内容和菜单语言作用于当前页面的独立预览。" open={options} onDismiss={() => setOptions(false)}
      actions={<CandidateButton variant="primary" onClick={() => setOptions(false)}>完成</CandidateButton>}>
      <div className="candidate-page-preview-fields">
        {previewSettings.map(setting => <CandidateField key={setting.key} label={setting.label}>
          <CandidateSelect value={setting.value} onValueChange={value => {
            const designer = current.current;
            if (!designer) return;
            void designer.setWorkbenchPreview({ [setting.key]: value } as Partial<WorkbenchPreviewSettings>)
              .then(() => { if (current.current === designer) setPreviewSettings(pagePreviewSettings(designer)); })
              .catch(reason => setFault(workfaceError(reason)));
          }}>{setting.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</CandidateSelect>
        </CandidateField>)}
      </div>
    </CandidateReviewDialog>
  </section>;
}
