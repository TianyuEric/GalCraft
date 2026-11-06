import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArchiveRestore, FileDiff, GitCompareArrows } from 'lucide-react';
import type { CandidateMaintenancePort } from '../application/project-maintenance.js';
import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateInput, CandidateReviewDialog, CandidateSection, CandidateSelect } from '../components/controls/index.js';
import '../styles/project-maintenance.css';

function MaintenanceSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <CandidateSection className="candidate-maintenance-section" title={<>{icon}{title}</>}>{children}</CandidateSection>;
}

export function CandidateMaintenanceView({ port, onProjects }: { port: CandidateMaintenancePort; onProjects?: () => void }) {
  const { recovery, conflicts, migration } = useSyncExternalStore(port.subscribe, port.getSnapshot, port.getSnapshot);
  const [versions, setVersions] = useState<readonly string[]>([]);
  const [engine, setEngine] = useState('');
  const [name, setName] = useState(() => port.projectName() + ' · 迁移副本');
  const [directory, setDirectory] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'status'; text: string } | null>(null);
  const locked = useRef(false);
  const error = useRef<HTMLParagraphElement>(null);
  const discard = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const currentEngine = port.currentEngine();
  useEffect(() => {
    let active = true;
    void port.listEngines().then(next => {
      if (!active) return;
      setVersions(next);
      setEngine(next.find(version => version !== currentEngine) ?? '');
    }).catch(reason => { if (active) setFeedback({ kind: 'error', text: String(reason instanceof Error ? reason.message : reason) }); });
    return () => { active = false; };
  }, [port, currentEngine]);
  useEffect(() => { if (feedback?.kind === 'error') error.current?.focus(); }, [feedback]);
  async function perform(action: () => void | Promise<void>, success?: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      if (success) setFeedback({ kind: 'status', text: success });
    } catch (reason) {
      setFeedback({ kind: 'error', text: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function dismissDiscard() { setConfirmDiscard(false); queueMicrotask(() => discard.current?.focus()); }
  const otherVersions = versions.filter(version => version !== currentEngine);
  return <section className="candidate-workface candidate-maintenance">
    <header><div><h2>作品维护</h2><p>{port.projectName()} · 引擎 {currentEngine}</p></div>
      {onProjects && <CandidateButton variant="outline" onClick={onProjects}>打开作品库</CandidateButton>}
    </header>
    <div className="candidate-maintenance-body">
      <p className="candidate-maintenance-scope">此处检查浏览器候选会话和它的副本。</p>
      {busy && <p role="status">正在处理维护请求…</p>}
      {feedback && <p className="candidate-maintenance-feedback" ref={error} tabIndex={-1} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
      <MaintenanceSection title="恢复草稿" icon={<ArchiveRestore size={16} aria-hidden="true" />}>
        {recovery ? <>
          <p>检测到 {recovery.files} 项文档变更、{recovery.sourceDrafts} 份未应用源码。恢复后可继续编辑和保存。</p>
          <div className="candidate-maintenance-actions">
            <CandidateButton variant="primary" disabled={busy} onClick={() => void perform(port.restoreRecovery, '草稿已恢复到当前工作会话。')}>恢复草稿</CandidateButton>
            <CandidateButton ref={discard} disabled={busy} onClick={() => setConfirmDiscard(true)}>放弃恢复草稿</CandidateButton>
          </div>
        </> : <p>没有待恢复的草稿。</p>}
      </MaintenanceSection>
      <MaintenanceSection title="外部修改" icon={<FileDiff size={16} aria-hidden="true" />}>
        {conflicts.length ? <>
          <p>{conflicts.length} 个文件有外部修改。展开文件可比较上次保存、当前工作和外部版本。</p>
          <ul className="candidate-maintenance-conflicts">{conflicts.map(({ documentId, path, base, working, incoming }) =>
            <li key={documentId + '/' + path}><CandidateSection title={path} collapsible initiallyOpen={false}>
              <div className="candidate-maintenance-versions">{[['上次保存', base], ['当前工作', working], ['外部版本', incoming]].map(([label, text]) =>
                <section key={label}><h4>{label}</h4>{text === null ? <p>此版本无文件</p> : <pre tabIndex={0} aria-label={label + ' · ' + path}>{text}</pre>}</section>
              )}</div>
            </CandidateSection></li>)}</ul>
          <p>采用外部版本只替换列出的文件，结果留在工作会话中等待保存。</p>
          <div className="candidate-maintenance-actions">
            <CandidateButton disabled={busy} onClick={() => void perform(port.inspectConflict, '已重新比较当前版本。')}>重新比较</CandidateButton>
            <CandidateButton disabled={busy} onClick={() => void perform(() => port.resolveConflict('working'), '已保留当前工作内容。')}>保留工作内容</CandidateButton>
            <CandidateButton variant="outline" disabled={busy} onClick={() => void perform(() => port.resolveConflict('external'), '已采用外部版本，请检查并保存。')}>采用外部版本</CandidateButton>
          </div>
        </> : <p>没有待处理的外部修改。</p>}
      </MaintenanceSection>
      <MaintenanceSection title="引擎迁移" icon={<GitCompareArrows size={16} aria-hidden="true" />}>
        <p>基于当前保存版本准备并验证迁移副本。提交会把副本加入作品库，原作品继续保留。</p>
        <form className="candidate-maintenance-form" onSubmit={event => {
          event.preventDefault();
          void perform(() => port.prepareMigration({ engineVersion: engine, name, directory }), '迁移副本通过文档与编译检查。');
        }}>
          <CandidateFieldGroup disabled={busy || !!migration}>
            <CandidateField label="目标引擎"><CandidateSelect required value={engine} onValueChange={selectedValue => setEngine(selectedValue)}>
              <option value="">{otherVersions.length ? '选择目标版本' : '暂无其他可用版本'}</option>
              {otherVersions.map(version => <option key={version}>{version}</option>)}
            </CandidateSelect></CandidateField>
            <CandidateField label="迁移副本名称"><CandidateInput required value={name} onChange={event => setName(event.target.value)} /></CandidateField>
            <CandidateField label="迁移副本目录"><CandidateInput required value={directory} placeholder="/review/迁移副本" onChange={event => setDirectory(event.target.value)} /></CandidateField>
          </CandidateFieldGroup>
          {!migration && <div className="candidate-maintenance-actions">
            <CandidateButton disabled={busy} onClick={() => void perform(async () => {
              const next = await port.listEngines();
              setVersions(next);
              setEngine(current => next.includes(current) ? current : next.find(version => version !== currentEngine) ?? '');
            }, '已刷新可用引擎。')}>刷新引擎</CandidateButton>
            <CandidateButton type="submit" variant="primary" disabled={busy || !engine}>准备并验证副本</CandidateButton>
          </div>}
        </form>
        {migration && <div className="candidate-maintenance-plan">
          <dl>
            <div><dt>引擎版本</dt><dd>{migration.sourceEngine} → {migration.request.engineVersion}</dd></div>
            <div><dt>已检查文档</dt><dd>{migration.documents}</dd></div>
            <div><dt>副本身份</dt><dd>{migration.copyId}</dd></div>
            <div><dt>副本目录</dt><dd>{migration.request.directory}</dd></div>
          </dl>
          <div className="candidate-maintenance-actions">
            <CandidateButton disabled={busy} onClick={() => void perform(port.rollbackMigration, '已回退本次准备，原作品保持可用。')}>回退迁移计划</CandidateButton>
            <CandidateButton variant="primary" disabled={busy} onClick={() => void perform(async () => { await port.commitMigration(); }, '迁移副本已登记到作品库。')}>提交迁移副本</CandidateButton>
          </div>
        </div>}
      </MaintenanceSection>
    </div>
    <CandidateReviewDialog open={confirmDiscard} title="放弃恢复草稿" description="放弃后，这份待恢复内容将从当前候选会话移除。" initialFocus={cancel} onDismiss={dismissDiscard}
      actions={<><CandidateButton ref={cancel} onClick={dismissDiscard}>取消</CandidateButton><CandidateButton variant="danger" onClick={() => {
        port.discardRecovery(); dismissDiscard(); setFeedback({ kind: 'status', text: '已移除待恢复草稿。' });
      }}>放弃草稿</CandidateButton></>} />
  </section>;
}
