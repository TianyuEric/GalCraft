import { useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Layers, RefreshCw } from 'lucide-react';
import { createId } from '@galcraft/contracts';
import { Button } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { DocumentTabs } from '../../components/workbench/WorkbenchShell.js';
import { ServiceConnections } from './ServiceConnections.js';
import { WorkflowDialog } from './WorkflowDialog.js';
import { unwrap } from './bridge.js';
import type { ProductionSession, WorkflowGuiDraft } from './session.js';
import { readWorkflow, type WorkflowDraft } from './workflow-model.js';
import './production.css';

type Props = {
  session: ProductionSession;
  locale?: string;
  active?: boolean;
  onReturn?(): void;
  onUnappliedChange?(dirty: boolean): void;
  embedded?: { search: string; explorer?: HTMLElement; inspector?: HTMLElement };
};

export function ConnectionWorkbench({ session, locale = 'zh-CN', active = true, onReturn, onUnappliedChange, embedded }: Props) {
  useSyncExternalStore(session.subscribe, session.snapshot);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [search, setSearch] = useState(() => session.workflowGuiDraft?.search ?? '');
  const [error, setError] = useState('');
  const [workflowDocuments, setWorkflowDocuments] = useState<WorkflowGuiDraft['workflowDocuments']>(
    () => (session.workflowGuiDraft?.workflowDocuments ?? session.guiDraft?.workflowDocuments ?? []).map(item => ({ ...item, closeRequest: 0 })),
  );
  const [activeWorkflow, setActiveWorkflow] = useState(
    () => session.workflowGuiDraft?.activeWorkflow ?? session.guiDraft?.activeWorkflow ?? '',
  );
  const workflowDirty = workflowDocuments.some(item => item.dirty);
  const dirty = workflowDirty || session.connectionDirty;
  const refresh = () => session.refresh().then(() => setError(''), issue => setError(issue instanceof Error ? issue.message : String(issue)));
  useEffect(() => {
    if (active && !embedded) void refresh();
  }, [session, active, !!embedded]);
  useEffect(() => {
    session.workflowGuiDraft = { workflowDocuments, activeWorkflow, search };
    if (session.workflowDirty !== workflowDirty) {
      session.workflowDirty = workflowDirty;
      session.changed();
    }
  }, [session, workflowDocuments, activeWorkflow, search, workflowDirty]);
  useEffect(() => { onUnappliedChange?.(dirty); }, [dirty, onUnappliedChange]);

  const closeWorkflow = (id: string) => {
    setWorkflowDocuments(items => items.filter(item => item.id !== id));
    setActiveWorkflow(current => current === id ? '' : current);
  };
  const openWorkflow = (id?: string, importText?: string) => {
    const draftSource = id?.startsWith('workflow-draft:') ?? false;
    const workflowId = id?.replace(/^workflow-draft:/, '');
    const opened = workflowId && workflowDocuments.find(item => (readWorkflow(item.text)?.id ?? item.id) === workflowId && !!item.draftSource === draftSource);
    if (opened) {
      setActiveWorkflow(opened.id);
      return;
    }
    const existing = session.data.workflows.find(item => item.id === workflowId);
    const storedDraft = session.data.workflowDrafts?.find(item => item.id === workflowId);
    if (id && !(draftSource ? storedDraft : existing)) return;
    const workflow: WorkflowDraft = (draftSource ? storedDraft?.workflow : existing) ?? {
      id: createId(session.data), revision: 0, name: '', purpose: null, imageUsages: null, graphVersion: '1',
      apiGraph: {}, editorWorkflowPath: null, inputs: [], uploads: [], outputs: [], requiredNodes: [], modelNotes: [],
    };
    const editorId = draftSource ? `workflow-draft:${workflow.id}` : workflow.id;
    setWorkflowDocuments(items => items.some(item => item.id === editorId) ? items : [...items, {
      id: editorId, text: JSON.stringify(workflow, null, 2),
      title: workflow.name || t('未命名工作流', 'Untitled workflow', '無題ワークフロー'),
      dirty: Boolean(importText), importText, paste: draftSource ? storedDraft?.paste ?? '' : '',
      draftRevision: storedDraft?.revision ?? null, draftSource,
      expectedRevision: draftSource ? storedDraft!.availableRevision : existing?.revision ?? null, closeRequest: 0,
    }]);
    setActiveWorkflow(editorId);
  };
  const updateEditor = (id: string, changes: Partial<WorkflowGuiDraft['workflowDocuments'][number]>) => {
    setWorkflowDocuments(items => items.map(item => item.id === id ? { ...item, ...changes } : item));
  };
  const chooseImport = session.bridge.files.readImport
    ? async () => unwrap(await session.bridge.files.readImport!({ purpose: 'production', extensions: ['json'] }))
    : undefined;
  const selected = workflowDocuments.find(item => item.id === activeWorkflow);
  const selectedId = readWorkflow(selected?.text ?? '')?.id ?? activeWorkflow;
  const editor = workflowDocuments.length > 0 && <section className="workflow-documents" hidden={!activeWorkflow}>
    <DocumentTabs documents={workflowDocuments.map(item => ({ ...item, icon: <Layers size={15}/> }))} active={activeWorkflow}
      onSelect={setActiveWorkflow} onPin={() => {}}
      onReorder={ids => setWorkflowDocuments(items => ids.map(id => items.find(item => item.id === id)!))}
      onClose={id => setWorkflowDocuments(items => items.map(item => item.id === id ? { ...item, closeRequest: item.closeRequest + 1 } : item))}/>
    {workflowDocuments.map(item => <div key={item.id} hidden={item.id !== activeWorkflow} className="workflow-document-content">
      <WorkflowDialog inline active={active} locale={locale} closeRequest={item.closeRequest} close={() => closeWorkflow(item.id)}
        initialText={item.text} initialImportText={item.importText} initialBaseline={item.baseline} initialPaste={item.paste} initialPasteBaseline={item.pasteBaseline}
        operations={session.data.operations} existingWorkflows={session.data.workflows}
        availableRevision={item.expectedRevision} configurationDraftRevision={item.draftSource ? item.draftRevision : undefined} chooseImport={chooseImport}
        outputConnections={session.data.connections.filter(connection => connection.protocol === 'comfyUI')}
        discoverOutputs={async (connectionId, workflow, historyTaskId) => {
          if (!workflow.purpose) throw new Error(t('请先选择用途或操作。', 'Choose a purpose or operation first.', '用途・操作を選択してください。'));
          return unwrap(await session.bridge.production.discoverWorkflowOutputs({
            connectionId, workflow: { ...workflow, purpose: workflow.purpose }, historyTaskId,
          }));
        }}
        onIdentityChange={expectedRevision => updateEditor(item.id, { expectedRevision, draftRevision: null })}
        onState={state => updateEditor(item.id, { ...state, importText: undefined })}
        saveDraft={async (workflow, paste) => {
          const result = unwrap(await session.bridge.production.saveWorkflowDraft({
            draft: {
              schemaVersion: 1, id: workflow.id, revision: item.draftRevision ?? 0, name: workflow.name,
              workflow, paste, availableRevision: item.expectedRevision, updatedAt: new Date().toISOString(),
            },
            expectedRevision: item.draftRevision ?? null,
          }));
          updateEditor(item.id, { draftRevision: result.revision });
          await session.refresh();
        }}
        save={async workflow => {
          const updated = unwrap(await session.bridge.production.saveWorkflow({ workflow, expectedRevision: item.expectedRevision }));
          updateEditor(item.id, { expectedRevision: updated.revision });
          await session.refresh();
          return updated;
        }}/>
    </div>)}
  </section>;
  const connections = <ServiceConnections session={session} locale={locale} search={embedded?.search ?? search} active={active}
    explorerContainer={embedded?.explorer} inspectorContainer={embedded?.inspector}
    workflowActive={!!activeWorkflow} selectedWorkflow={selected?.draftSource ? `workflow-draft:${selectedId}` : selectedId}
    showConnection={() => setActiveWorkflow('')} workflowEditor={editor} editWorkflow={openWorkflow}
    importWorkflow={chooseImport ? async () => { const selected = await chooseImport(); if (selected) openWorkflow(undefined, selected.text); } : undefined}/>;
  if (embedded) return connections;
  const title = t('连接与工作流', 'Connections and workflows', '接続とワークフロー');
  const searchLabel = t('搜索服务连接与工作流', 'Search connections and workflows', '接続とワークフローを検索');
  return <section className="connection-workbench" aria-label={title}>
    <header className="production-workbench-toolbar">
      <h1>{title}</h1>
      <Input aria-label={searchLabel} placeholder={searchLabel} value={search} onChange={event => setSearch(event.target.value)}/>
      {onReturn && <Button tone="quiet" onClick={onReturn}><ArrowLeft size={15}/>{t('返回制作任务', 'Return to production task', '制作タスクに戻る')}</Button>}
    </header>
    {error && <div className="workbench-error" role="alert">{error} <Button onClick={() => void refresh()}><RefreshCw size={15}/>{t('重新读取', 'Reload', '再読込')}</Button></div>}
    {connections}
  </section>;
}
