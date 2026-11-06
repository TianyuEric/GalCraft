import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { readPluginDocumentInstances, type Source } from '@galcraft/contracts';
import type { StudioScope } from '@galcraft/plugins/contracts';
import { DomRegion } from '../../../authoring/workbench-host.js';
import type { AuthorToolEntry } from '../../../pages/Plugins/author-contributions.js';
import { StudioPluginHost, type StudioHostOptions } from '../../../pages/Plugins/studio-host.js';
import { workbenchBridge } from '../../../pages/Production/bridge.js';
import { CandidateButton, CandidateReviewDialog, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { CandidatePluginCatalog } from '../components/plugins/CandidatePluginCatalog.js';
import { CandidatePluginDocuments } from '../components/plugins/CandidatePluginDocuments.js';
import { CandidatePluginTool } from '../components/plugins/CandidatePluginTool.js';
import { fail, ok } from '../application/services.js';
import { useCandidateState } from '../application/context.js';
import { useFormalSource, workfaceError, type CandidateWorkfaceProps } from './workface-helpers.js';
import { pluginDocumentId, pluginDocumentTab, pluginToolView, usePluginDocumentWorkspace } from './plugin-document-workspace.js';
import '../styles/document-workfaces.css';
import '../styles/plugins.css';

const lockPath = 'dependencies.lock.json';

type PluginCommand = { id: string; label: string; disabled?:string; run(): void };
type PluginViews = {
  workspace: ReturnType<typeof usePluginDocumentWorkspace>;
  catalogRegion: HTMLElement;
  commands: PluginCommand[];
  projectId?: string;
  error: string;
};
const PluginViewsContext = createContext<PluginViews | null>(null);
function usePluginViews() {
  const context = useContext(PluginViewsContext);
  if (!context) throw new Error('插件工作面需要作品插件宿主。');
  return context;
}

export function useCandidatePluginViews() {
  return [...usePluginViews().workspace.entries.values()].map(({ id, title }) => ({ id, title }));
}

export function useCandidatePluginCommands() { return usePluginViews().commands; }

export function useCandidatePluginClose() { return usePluginViews().workspace.close; }

export function CandidatePluginsProvider({ onNavigate, onProjects, onCloseView, children }: CandidateWorkfaceProps & { onProjects?(): void; onCloseView?(id: string): void; children: ReactNode }) {
  const { store, source, error } = useFormalSource();
  const { activeView, projectActive } = useCandidateState();
  const workspace = usePluginDocumentWorkspace(store, id => onNavigate?.(id), onCloseView);
  const [catalogRegion] = useState(() => document.createElement('div'));
  const [host, setHost] = useState<StudioPluginHost | null>(null);
  const [loaded, setLoaded] = useState<{ host: StudioPluginHost; key: string } | null>(null);
  const [fault, setFault] = useState('');
  const [tool, setTool] = useState<{ entry: AuthorToolEntry; scope: StudioScope }>();
  const [workbenchKey, setWorkbenchKey] = useState('');
  const [workbenchRegion, setWorkbenchRegion] = useState<HTMLElement | null>(null);
  const [editedDocument, setEditedDocument] = useState<string>();
  const [generation, setGeneration] = useState(0);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const applyingCatalogEdit = useRef(false);
  const loading = useRef<Promise<void>>(Promise.resolve());
  const projectId = source?.project.projectId;
  const locale = store.controller.preferences.locale;
  const actions = useRef({ onNavigate, onProjects, locale });
  actions.current = { onNavigate, onProjects, locale };
  const showDirectory = projectActive && (activeView === 'plugins' || activeView === 'plugin-package');
  const documents = store.host.list();
  const lockDocument = documents.find(document => lockPath in document.files);
  const lockDocumentId = lockDocument?.documentId ?? store.seed.documents.find(document => lockPath in document.files)?.documentId;
  const bridge = workbenchBridge(store.services.bridge);
  const checkOpenDocuments = useCallback(() => workspace.entries.size
    ? fail('请先关闭插件文档，再更改作品插件；未应用的字段可继续编辑或放弃后关闭。', 'CANDIDATE_PLUGIN_DOCUMENTS_OPEN')
    : ok(undefined), [workspace]);
  useEffect(() => store.registerHistoryGuard(plan => lockDocumentId && plan.members.includes(lockDocumentId)
    ? checkOpenDocuments() : ok(undefined)), [checkOpenDocuments, lockDocumentId, store]);
  useEffect(() => {
    const readVersion = () => {
      const lock = store.host.getSnapshot().documents.find(document => lockPath in document.files);
      return lock ? `${lock.documentId}/${lock.revision}` : '';
    };
    let version = readVersion();
    return store.host.subscribe(() => {
      const next = readVersion();
      if (next === version) return;
      version = next;
      // The catalog refreshes after its own edits. Reopen its data when
      // history or another workface changes the lock.
      if (!applyingCatalogEdit.current) setCatalogRevision(value => value + 1);
    });
  }, [store]);
  const libraryBridge = useMemo(() => ({ ...bridge,
    plugins: { ...bridge.plugins,
      planChange: async (input: Parameters<typeof bridge.plugins.planChange>[0]) => {
        const check = checkOpenDocuments();
        return check.ok ? bridge.plugins.planChange(input) : check;
      },
    },
    documents: { ...bridge.documents,
      applyEdit: async (...input: Parameters<typeof bridge.documents.applyEdit>) => {
        const check = checkOpenDocuments();
        if (!check.ok) return check;
        applyingCatalogEdit.current = true;
        try { return await bridge.documents.applyEdit(...input); }
        finally { applyingCatalogEdit.current = false; }
      },
    },
  }), [bridge, checkOpenDocuments]);
  const documentVersions = readPluginDocumentInstances(documents).map(document => `${document.documentId}/${document.revision}`).join(',');
  const reloadKey = `${lockDocument?.revision ?? 0}/${generation}/${locale}/${documentVersions}`;
  const hasDocuments = workspace.entries.size > 0;
  useEffect(() => {
    if (!projectId) return;
    const open = (view: string) => {
      if (!actions.current.onNavigate) return fail('候选工作台导航不可用。', 'CANDIDATE_PLUGIN_NAVIGATION');
      actions.current.onNavigate(view); return ok(undefined);
    };
    const locate = async (position: Source) => {
      const document = store.host.list().find(item => item.documentId === position.documentId && Object.keys(item.files).length);
      if (!document) return fail('来源文档已移除。', 'CANDIDATE_PLUGIN_SOURCE');
      const scene = store.controller.source?.scenes.find(item => item.documentId === position.documentId);
      if (scene) {
        const result = open(`source:${scene.sceneId}`);
        if (!result.ok) return result;
        if (document.revision !== position.revision) return fail('来源已更新，已打开当前场景。请重新取得源位置。', 'CANDIDATE_PLUGIN_SOURCE');
        store.selectCommand(scene.sceneId, position.statementId ?? null);
        if (position.range) store.controller.setCaret(position.statementId ?? null, position.range.start);
        return result;
      }
      const tab = pluginDocumentTab(document.documentId);
      if (workspace.entries.has(tab)) {
        workspace.select(tab);
        return ok(undefined);
      }
      if ('assets/index.json' in document.files) return open('assets');
      if ('project.json' in document.files) return open('settings');
      if (lockPath in document.files) return open('plugins');
      const paths = Object.keys(document.files);
      if (paths.some(path => path.startsWith('characters/'))) return open('characters');
      if (paths.some(path => path.startsWith('ui/'))) return open('pages');
      return fail('请从插件文档列表打开这个来源。', 'CANDIDATE_PLUGIN_SOURCE');
    };
    const options: StudioHostOptions = {
      workspace: workspace.port,
      scope: () => {
        const state = store.getSnapshot(), view = state.activeView;
        const documentId = store.documentId(state.commandTarget);
        const document = store.host.list().find(item => item.documentId === documentId && Object.keys(item.files).length);
        const scene = store.controller.source?.scenes.find(item => item.documentId === documentId);
        const selection = scene && store.controller.selection?.documentId === documentId ? store.controller.selection : null;
        const page = scene ? 'creation' : view === 'pages' ? 'player-ui' : pluginDocumentId(view) ? 'plugins' : view.split(':')[0] ?? 'plugins';
        return { page, documentId: document?.documentId ?? null, sceneId: scene?.sceneId ?? null,
          statementIds: [...selection?.statementIds ?? []], textRange: selection?.textRange ?? null, assetIds: [],
          insertion: scene ? { documentId, offset: store.controller.caret.documentOffset } : null,
          versions: document ? [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }] : [] };
      },
      navigate: async (page, result) => {
        if (page === 'overview' && actions.current.onProjects) { actions.current.onProjects(); return ok(undefined); }
        if (page === 'overview') return fail('候选项目中心导航不可用。', 'CANDIDATE_PLUGIN_NAVIGATION');
        if (page === 'production' && (result?.kind === 'task' || result?.kind === 'candidate')) {
          const production = store.tasks.production;
          await production.refresh();
          const taskId = result.kind === 'task' ? result.taskId : result.taskId ?? production.data.candidates.find(item => item.candidate.id === result.candidateId)?.candidate.taskId;
          if (!taskId || !production.data.tasks.some(task => task.id === taskId)) return fail('制作结果已移除或不属于当前作品。', 'CANDIDATE_PLUGIN_NAVIGATION');
          production.taskId = taskId;
          production.selected = new Set(result.kind === 'task' ? result.candidateIds ?? [] : [result.candidateId]);
          production.changed();
        }
        return open(page === 'creation' ? `writing:${store.getSnapshot().ui.sceneId}` : page === 'player-ui' ? 'pages' : page);
      },
      locate,
    };
    const pluginHost = new StudioPluginHost(bridge, projectId, () => actions.current.locale, async key => { setWorkbenchKey(key); },
      async (_receipt, input) => {
        const documentId = input?.patches[0]?.documentId;
        if (documentId && workspace.entries.has(pluginDocumentTab(documentId))) setEditedDocument(documentId);
        store.refreshFromHost();
      }, options);
    const unsubscribe = store.subscribe(() => pluginHost.publishScope());
    setHost(pluginHost);
    return () => { unsubscribe(); void pluginHost.dispose(); };
  }, [bridge, projectId, store, workspace]);
  useEffect(() => {
    if (!host || hasDocuments || (loaded?.host === host && loaded.key === reloadKey)) return;
    let active = true;
    setFault('');
    // Lock and document notifications can arrive in separate renders. Serialize
    // this view's loads so a retired request cannot overwrite host diagnostics.
    loading.current = loading.current.then(async () => {
      if (!active) return;
      const result = await host.load();
      if (!active) return;
      setLoaded({ host, key: reloadKey });
      if (!result.ok) setFault(result.error.message);
    }).catch(reason => { if (active) setFault(workfaceError(reason)); });
    return () => { active = false; };
  }, [host, hasDocuments, loaded, reloadKey]);
  const readyHost = loaded?.host === host && (loaded.key === reloadKey || hasDocuments) ? host : null;
  useEffect(() => {
    if (!workbenchKey || !readyHost || !workbenchRegion) return;
    readyHost.mountWorkbench(workbenchKey, workbenchRegion);
    return () => workbenchRegion.replaceChildren();
  }, [readyHost, workbenchKey, workbenchRegion]);
  const workbench = readyHost?.workbenches().find(item => item.key === workbenchKey);
  const openTool = (entry: AuthorToolEntry) => {
    if (readyHost && entry.available) setTool({ entry, scope: structuredClone(readyHost.authorServices.scope()) });
  };
  const commands: PluginCommand[] = (readyHost?.tools('commands.palette') ?? []).map(item => ({
    id: 'plugin-tool:' + item.pluginId + '/' + item.tool.key,
    label: item.title, disabled:item.available?undefined:item.reason,
    run: () => openTool(item),
  }));
  for (const item of readyHost?.tools('context.menu') ?? []) {
    const id = 'plugin-tool:' + item.pluginId + '/' + item.tool.key;
    if (!commands.some(command => command.id === id)) commands.push({
      id, label: item.title, disabled: item.available ? undefined : item.reason, run: () => openTool(item),
    });
  }
  if (readyHost) for (const contribution of readyHost.workbenches()) commands.push({
    id: 'plugin-workbench:' + contribution.key, label: readyHost.title(contribution), run: () => setWorkbenchKey(contribution.key),
  });
  const instances = readPluginDocumentInstances(documents);
  if (readyHost) for (const document of instances) {
    const type = readyHost.documentTypes().find(item => item.pluginId === document.pluginId && item.definition.key === document.contributionKey);
    if (type && !workspace.entries.has(pluginDocumentTab(document.documentId))) commands.push({ id: 'open-' + pluginDocumentTab(document.documentId), label: '打开插件文档 · ' + document.name, run: () => {
      const current = readPluginDocumentInstances(store.host.list()).find(item => item.documentId === document.documentId);
      if (current) workspace.openDocument(current, type, readyHost.authorServices, locale);
    } });
  }
  const edited = documents.find(document => document.documentId === editedDocument && document.dirty);
  const disabled = instances.filter(document =>
    !readyHost?.documentTypes().some(item => item.pluginId === document.pluginId && item.definition.key === document.contributionKey));
  const documentContent = <>
    {fault && <CandidateState kind="error" title={fault} action={<CandidateButton onClick={() => setGeneration(value => value + 1)}>重新加载插件</CandidateButton>}/>}
    {!readyHost && !fault && <CandidateState kind="loading" title="正在读取已启用插件"/>}
    {edited && !workspace.entries.has(pluginDocumentTab(edited.documentId)) && <CandidateToolbar label="插件文档保存" className="candidate-plugin-save">
      <span>插件字段已应用</span><CandidateButton variant="outline" onClick={() => void store.save(false, edited.documentId)}>保存插件文档</CandidateButton>
    </CandidateToolbar>}
    {readyHost && <CandidatePluginDocuments services={readyHost.authorServices} locale={locale} missing={disabled} sourceVersion={documentVersions}
      onOpen={(document, type) => workspace.openDocument(document, type, readyHost.authorServices, locale)}/>}
  </>;
  const closing = workspace.closing;
  const portal = document.getElementById('studio-portals');
  return <PluginViewsContext.Provider value={{ workspace, catalogRegion, commands, projectId, error: error ?? '' }}>
    {children}
    {projectId && createPortal(<CandidatePluginCatalog key={projectId} bridge={libraryBridge} projectId={projectId} locale={locale} authorHost={readyHost}
      active={showDirectory} refreshVersion={catalogRevision}
      changed={async () => {
        const state = store.getSnapshot();
        if (lockDocument && state.activeView === 'plugins' && state.commandTarget !== lockDocument.documentId) store.target(lockDocument.documentId);
        store.refreshFromHost(); setGeneration(value => value + 1);
      }}>{documentContent}</CandidatePluginCatalog>, catalogRegion)}
    {tool && readyHost && <CandidatePluginTool entry={tool.entry} scope={tool.scope} services={readyHost.authorServices} locale={locale}
      active={projectActive} portal={portal} onClose={() => setTool(undefined)}
      onPin={input => { workspace.openTool(tool.entry, tool.scope, input, readyHost.authorServices, locale); setTool(undefined); }}/>}
    <CandidateReviewDialog open={projectActive && !!workbench && !closing} portal={portal} title={workbench && readyHost?.title(workbench)}
      onDismiss={() => setWorkbenchKey('')} actions={<CandidateButton onClick={() => setWorkbenchKey('')}>关闭工具</CandidateButton>}>
      <div ref={setWorkbenchRegion}/>
    </CandidateReviewDialog>
    <CandidateReviewDialog open={projectActive && !!closing} portal={portal} title="放弃未应用的字段草稿？" description={closing?.title}
      onDismiss={() => workspace.confirmClose(false)} actions={<>
        <CandidateButton onClick={() => workspace.confirmClose(false)}>继续编辑</CandidateButton>
        <CandidateButton variant="danger" onClick={() => workspace.confirmClose(true)}>放弃并关闭</CandidateButton>
      </>}/>
  </PluginViewsContext.Provider>;
}

export function CandidatePluginsView({ viewId }: { viewId: string }) {
  const { workspace, catalogRegion, projectId, error } = usePluginViews();
  if (!projectId) return <CandidateState kind={error ? 'error' : 'loading'} title={error || '正在读取插件目录'}/>;
  if (viewId === 'plugins' || viewId === 'plugin-package') return <section className="candidate-plugin-view" aria-label="插件管理">
    <DomRegion node={catalogRegion} className="candidate-plugin-region"/>
  </section>;
  const entry = workspace.entries.get(viewId);
  return <section className="candidate-workface candidate-document-workface candidate-plugins-workface" aria-label={pluginToolView(viewId) ? '插件工具' : '插件文档'}>
    {entry ? <div className="candidate-document-scroll candidate-plugin-content"><DomRegion node={entry.node}/></div>
      : <CandidateState kind="empty" title="此插件文档已关闭或提供者不可用"/>}
  </section>;
}
