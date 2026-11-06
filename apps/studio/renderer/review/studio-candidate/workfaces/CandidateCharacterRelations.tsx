import { useState, useSyncExternalStore } from 'react';
import { createId, LockSchema, readPluginDocumentInstances } from '@galcraft/contracts';
import { createDefinition } from '../../../../../../plugins/official-affection/src/definition.js';
import { useCandidate, useCandidateState } from '../application/context.js';
import { CandidateSceneGraph } from '../components/CandidateSceneGraph.js';
import { CandidateButton } from '../components/controls/index.js';
import { pluginDocumentTab } from './plugin-document-workspace.js';
import { resultValue, useFormalSource, workfaceError, type CandidateWorkfaceProps } from './workface-helpers.js';

const pluginId = 'org.galcraft.affection';
const definition = createDefinition().documents![0]!;

export function CandidateStorySceneGraph({ onNavigate }: CandidateWorkfaceProps) {
  const { store, source, error } = useFormalSource();
  const { ui } = useCandidateState();
  return source ? <section className="candidate-workface candidate-object-scroll" aria-label="全作场景图"><CandidateSceneGraph source={source} locale={store.controller.preferences.locale} activeSceneId={ui.sceneId} onNavigate={(id, statementId) => {
    if (statementId) store.selectCommand(id, statementId);
    onNavigate?.((statementId ? 'commands:' : 'writing:') + id);
  }}/></section> : <p role={error ? 'alert' : 'status'}>{error || '正在读取剧情…'}</p>;
}

/** The directory links to the same document editor used by the plugin workspace. */
export function CandidateCharacterRelations({ onNavigate }: CandidateWorkfaceProps) {
  const store = useCandidate();
  const { documents } = useSyncExternalStore(store.host.subscribe, store.host.getSnapshot, store.host.getSnapshot);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = documents.find(document => 'dependencies.lock.json' in document.files);
  const config = readPluginDocumentInstances([...documents]).find(item => item.pluginId === pluginId && item.contributionKey === definition.key);
  let enabled = false;
  try { enabled = !!lock && LockSchema.parse(JSON.parse(lock.files['dependencies.lock.json']!).data).plugins.some(item => item.id === pluginId); }
  catch { /* The plugin directory presents dependency diagnostics. */ }
  const open = async () => {
    if (config) { onNavigate?.(pluginDocumentTab(config.documentId)); return; }
    if (!enabled || !lock || busy) return;
    setBusy(true); setError('');
    try {
      const latest = store.host.list();
      const existing = readPluginDocumentInstances(latest).find(item => item.pluginId === pluginId && item.contributionKey === definition.key);
      if (existing) { onNavigate?.(pluginDocumentTab(existing.documentId)); return; }
      const id = createId([latest]);
      const path = 'plugins/' + pluginId + '/documents/' + id + '.json';
      const edit = { label: '创建角色好感度文档', origin: 'plugin' as const, expected: [{ ref: { kind: 'document' as const, id: lock.documentId }, revision: lock.revision }],
        preparedAssets: [], requiredRefs: definition.collectReferences(definition.initial),
        patches: [{ kind: 'document' as const, documentId: id, op: 'create' as const, before: null, after: { format: 'json' as const, files: {
          [path]: JSON.stringify({ schemaVersion: 1, documentId: id, revision: 0, data: definition.initial,
            pluginDocument: { pluginId, contributionKey: definition.key, name: '角色好感度', stateVersion: definition.stateVersion } }),
        } } }] };
      resultValue(await store.applyEdit(edit));
      onNavigate?.(pluginDocumentTab(id));
    } catch (reason) { setError(workfaceError(reason)); } finally { setBusy(false); }
  };
  return <nav className="candidate-object-list" aria-label="角色插件工具">
    <h3>角色插件工具</h3>
    {config || enabled ? <CandidateButton disabled={busy} onClick={() => void open()}>{config ? '角色好感度' : '新建角色好感度文档'}</CandidateButton>
      : <CandidateButton onClick={() => onNavigate?.('plugins')}>管理好感度插件</CandidateButton>}
    {error && <p role="alert">{error}</p>}
  </nav>;
}
