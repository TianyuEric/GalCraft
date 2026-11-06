import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Ellipsis, Folder, FolderOpen, Pin, Plus, Search } from 'lucide-react';
import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateInput, CandidateObjectRow, CandidateSelect, CandidateMenuButton, CandidateReviewDialog } from './controls/index.js';
import {
  assertCandidateRestoreTarget, candidateDirectoryKey, candidateLibraryGroups,
  type CandidateCreationRequest, type CandidateProjectEntry, type CandidateRestoreCheck, type CandidateRestoreTarget,
} from '../application/project-library.js';
import '../styles/project-library.css';

export type { CandidateCreationRequest, CandidateProjectEntry, CandidateRestoreCheck, CandidateRestoreTarget } from '../application/project-library.js';

type Operation = void | Promise<void>;
type CloseChoice = 'save' | 'discard';
type ProjectDialog = { kind: 'create' | 'register' } |
  { kind: 'close' | 'restore' | 'repair' | 'remove'; entry: CandidateProjectEntry };

type Props = {
  entries: readonly CandidateProjectEntry[];
  theme: 'light' | 'dark';
  onOpen(id: string): Operation;
  onCreate(name: string, request: CandidateCreationRequest): Operation;
  onClose(id: string, choice: CloseChoice): Operation;
  onBackup(id: string): Operation;
  onRestore(id: string, choice: CloseChoice, target: CandidateRestoreTarget): Operation;
  onRegister?(directory: string): Operation;
  onRemove?(id: string): Operation;
  onPin?(id: string, pinned: boolean): Operation;
  onRepair?(id: string, directory: string): Operation;
  onCheckRestore?(id: string, target: CandidateRestoreTarget): CandidateRestoreCheck | Promise<CandidateRestoreCheck>;
  engineVersions?: readonly string[];
  listEngineVersions?(): Promise<readonly string[]>;
  onReturn?(): void;
  onPreferences?(): void;
  error?: string;
  onRetry(): Operation;
};

const defaultVersions = ['0.1.0'] as const;
const templates = {
  standard: ['标准', '阅读、存档、CG 与音乐鉴赏'],
  light: ['轻量', '阅读、存档和历史'],
  rich: ['丰富', '加入流程图、角色与变量关系页'],
} satisfies Record<CandidateCreationRequest['template'], [string, string]>;

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function useOperation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string } | null>(null);
  const locked = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => { if (error) alert.current?.focus(); }, [error]);
  async function run<T>(action: () => T | Promise<T>, onSuccess?: (value: T) => void) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try { const result = await action(); onSuccess?.(result); }
    catch (reason) { setError({ text: message(reason) }); }
    finally { locked.current = false; setBusy(false); }
  }
  return { busy, error, alert, run };
}

function Feedback({ operation }: { operation: ReturnType<typeof useOperation> }) {
  return <>
    {operation.busy && <p className="candidate-library-status" role="status">正在处理，请稍候…</p>}
    {operation.error && <p className="candidate-library-error" role="alert" ref={operation.alert} tabIndex={-1}>{operation.error.text}</p>}
  </>;
}

function ProjectDialogFrame({ title, busy, onDismiss, returnTo, fallback, children }: {
  title: string; busy: boolean; onDismiss(): void; returnTo: HTMLElement | null; fallback: HTMLElement | null; children: ReactNode;
}) {
  useLayoutEffect(() => () => { queueMicrotask(() => (returnTo?.isConnected ? returnTo : fallback)?.focus()); }, [returnTo, fallback]);
  return <CandidateReviewDialog open title={title} busy={busy} className="candidate-library-dialog" onDismiss={onDismiss}>{children}</CandidateReviewDialog>;
}

type DialogProps = Pick<Parameters<typeof ProjectDialogFrame>[0], 'returnTo' | 'fallback' | 'onDismiss'>;

function ProjectRow({ entry, busy, onOpen, onPin, onBackup, showDialog, canRemove, canRepair }: {
  entry: CandidateProjectEntry; busy: boolean; onOpen(): void; onPin?: () => void; onBackup(): void;
  showDialog(kind: 'close' | 'restore' | 'repair' | 'remove', from: HTMLElement): void;
  canRemove: boolean; canRepair: boolean;
}) {
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const missing = entry.pathStatus === 'missing';
  function select(kind: 'close' | 'restore' | 'repair' | 'remove', from: HTMLElement) {
    const trigger = actionTrigger.current ?? from;
    showDialog(kind, trigger);
  }
  return <li className="candidate-library-row"><CandidateObjectRow title={entry.name} description={entry.path ?? '候选作品目录'}
    icon={<Folder size={18}/>} disabled={busy || missing} activationLabel={'打开 ' + entry.name} onActivate={onOpen}
    metadata={<span className="candidate-library-row-state">
      {missing && <span data-tone="warning">路径失效</span>}
      {entry.opened && <span>{entry.dirty ? '未保存' : '已打开'}</span>}
    </span>}
    actions={<div className="candidate-library-row-actions">
      {onPin && <CandidateButton variant="ghost" density="compact" aria-label={entry.pinned ? '取消固定 ' + entry.name : '固定 ' + entry.name}
        aria-pressed={!!entry.pinned} title={entry.pinned ? '取消固定' : '固定'} disabled={busy} onClick={onPin}><Pin size={14} aria-hidden="true" /></CandidateButton>}
      {missing ? canRepair && <CandidateButton disabled={busy} density="compact" onClick={event => showDialog('repair', event.currentTarget)}>修复路径</CandidateButton>
        : <CandidateButton disabled={busy} density="compact" onClick={onOpen}>打开作品</CandidateButton>}
      <CandidateMenuButton ref={actionTrigger} label={entry.name + '的作品操作'} disabled={busy} actions={[
        {id:'backup',label:'创建备份',disabledReason:missing?'修复路径后可创建备份':undefined,run:onBackup},
        ...(entry.backup?[{id:'restore',label:'恢复备份',run:()=>select('restore',actionTrigger.current!)}]:[]),
        ...(entry.opened?[{id:'close',label:'关闭作品',run:()=>select('close',actionTrigger.current!)}]:[]),
        ...(canRemove?[{id:'remove',label:'移除登记',run:()=>select('remove',actionTrigger.current!)}]:[])
      ]}><Ellipsis size={16}/></CandidateMenuButton>
    </div>}/>
  </li>;
}

function CreateProjectDialog({ engineVersions, listEngineVersions, onCreate, ...frame }: DialogProps & Pick<Props, 'onCreate' | 'listEngineVersions'> & {
  engineVersions: readonly string[];
}) {
  const operation = useOperation();
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<CandidateCreationRequest['template']>('standard');
  const [width, setWidth] = useState('1920');
  const [height, setHeight] = useState('1080');
  const [engine, setEngine] = useState('');
  const [directory, setDirectory] = useState('');
  const [versions, setVersions] = useState<readonly string[]>(listEngineVersions ? [] : engineVersions);
  const [loadingVersions, setLoadingVersions] = useState(!!listEngineVersions);
  const [catalogError, setCatalogError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const loader = useRef(listEngineVersions);
  loader.current = listEngineVersions;
  const selectedEngine = versions.includes(engine) ? engine : versions.at(-1) ?? '';
  useEffect(() => {
    const load = loader.current;
    if (!load) return;
    let active = true;
    setLoadingVersions(true);
    setCatalogError('');
    void Promise.resolve().then(() => active ? load() : null).then(next => {
      if (active && next) setVersions(next);
    }).catch(reason => {
      if (active) setCatalogError(message(reason));
    }).finally(() => {
      if (active) setLoadingVersions(false);
    });
    return () => { active = false; };
  }, [attempt]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void operation.run(() => {
      if (!name.trim()) throw new Error('请输入作品名称。');
      if (loadingVersions || catalogError || !selectedEngine) throw new Error('请先读取并选择可用的引擎版本。');
      candidateDirectoryKey(directory);
      return onCreate(name.trim(), { name: name.trim(), template, width: Number(width), height: Number(height), engineVersion: selectedEngine, directory: directory.trim() });
    }, frame.onDismiss);
  }
  return <ProjectDialogFrame {...frame} busy={operation.busy} title="新建作品">
    <p>选择初始页面、画布和引擎。作品将在指定目录创建并打开。</p>
    <form onSubmit={submit}>
      <CandidateFieldGroup disabled={operation.busy}>
        <CandidateField label="新作品名称"><CandidateInput autoFocus required value={name} onChange={event => setName(event.target.value)} /></CandidateField>
        <CandidateField label="作品模板" hint={templates[template][1]}><CandidateSelect value={template} onValueChange={selectedValue => setTemplate(selectedValue as CandidateCreationRequest['template'])}>
          {Object.entries(templates).map(([key, [title]]) => <option key={key} value={key}>{title}</option>)}
        </CandidateSelect></CandidateField>
        <div className="candidate-library-size">
          <CandidateField label="画布宽度（px）"><CandidateInput type="number" required min={1} step={1} value={width} onChange={event => setWidth(event.target.value)} /></CandidateField>
          <CandidateField label="画布高度（px）"><CandidateInput type="number" required min={1} step={1} value={height} onChange={event => setHeight(event.target.value)} /></CandidateField>
        </div>
        <CandidateField label="引擎版本"><CandidateSelect required disabled={loadingVersions || !versions.length} value={selectedEngine} onValueChange={selectedValue => setEngine(selectedValue)}>
          {!versions.length && <option value="">{loadingVersions ? '正在读取引擎目录…' : '暂无可用引擎'}</option>}
          {versions.map(version => <option key={version}>{version}</option>)}
        </CandidateSelect></CandidateField>
        {catalogError && <p className="candidate-library-error" role="alert">{catalogError}</p>}
        {listEngineVersions && !loadingVersions && (catalogError || !versions.length) &&
          <CandidateButton className="candidate-library-engine-retry" onClick={() => setAttempt(current => current + 1)}>重试读取引擎</CandidateButton>}
        <CandidateField label="作品目录"><CandidateInput required placeholder="/candidate/works/我的新作品" value={directory} onChange={event => setDirectory(event.target.value)} /></CandidateField>
      </CandidateFieldGroup>
      <Feedback operation={operation} />
      <footer><CandidateButton disabled={operation.busy} onClick={frame.onDismiss}>取消</CandidateButton>
        <CandidateButton type="submit" variant="primary" disabled={operation.busy || loadingVersions || !!catalogError || !selectedEngine}>创建并打开</CandidateButton></footer>
    </form>
  </ProjectDialogFrame>;
}

function DirectoryDialog({ entry, run, ...frame }: DialogProps & { entry?: CandidateProjectEntry; run(directory: string): Operation }) {
  const operation = useOperation();
  const [directory, setDirectory] = useState('');
  const title = entry ? '修复作品路径' : '登记作品';
  return <ProjectDialogFrame {...frame} busy={operation.busy} title={title}>
    {entry ? <p>选择“{entry.name}”的新目录。宿主将核对作品身份。</p> : <p>输入已有作品的目录，将作品加入库中。</p>}
    <form onSubmit={event => {
      event.preventDefault();
      void operation.run(() => { candidateDirectoryKey(directory); return run(directory.trim()); }, frame.onDismiss);
    }}>
      <CandidateField label={entry ? '新作品目录' : '已有作品目录'}><CandidateInput autoFocus required disabled={operation.busy} value={directory}
        onChange={event => setDirectory(event.target.value)} placeholder={entry?.path ?? '/candidate/works/已有作品'} /></CandidateField>
      <Feedback operation={operation} />
      <footer><CandidateButton disabled={operation.busy} onClick={frame.onDismiss}>取消</CandidateButton>
        <CandidateButton type="submit" variant="primary" disabled={operation.busy}>{entry ? '验证并修复' : '登记'}</CandidateButton></footer>
    </form>
  </ProjectDialogFrame>;
}

function RestoreProjectDialog({ entry, onCheckRestore, onRestore, ...frame }: DialogProps & Pick<Props, 'onCheckRestore' | 'onRestore'> & {
  entry: CandidateProjectEntry;
}) {
  const operation = useOperation();
  const [kind, setKind] = useState<CandidateRestoreTarget['kind']>(entry.pathStatus === 'missing' ? 'copy' : 'replace');
  const [name, setName] = useState(entry.name + ' · 恢复副本');
  const [directory, setDirectory] = useState('');
  const [check, setCheck] = useState<CandidateRestoreCheck | null>(null);
  const [choice, setChoice] = useState<CloseChoice>('save');
  const target = { kind, name: kind === 'copy' ? name.trim() : entry.name, directory: kind === 'copy' ? directory.trim() : entry.path ?? '' };
  async function checkTarget() {
    if (kind === 'copy') {
      if (!target.name) throw new Error('请输入恢复副本名称。');
      candidateDirectoryKey(target.directory);
    }
    const result = await onCheckRestore?.(entry.id, target) ?? { sourceId: entry.id, targetId: kind === 'replace' ? entry.id : undefined, missingDependencies: [] };
    assertCandidateRestoreTarget(entry, target, result);
    return result;
  }
  function inspect() {
    setCheck(null);
    void operation.run(checkTarget, setCheck);
  }
  function restore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!check || check.missingDependencies.length) { inspect(); return; }
    void operation.run(async () => {
      const latest = await checkTarget();
      setCheck(latest);
      if (latest.missingDependencies.length) throw new Error('恢复前依赖已变化，请解决缺项后重新检查。');
      await onRestore(entry.id, kind === 'copy' ? 'discard' : choice, target);
    }, frame.onDismiss);
  }
  return <ProjectDialogFrame {...frame} busy={operation.busy} title="恢复备份">
    <p>来源为“{entry.name}”的备份。先检查目标身份和备份依赖。</p>
    <form onSubmit={restore}>
      <CandidateFieldGroup disabled={operation.busy}>
        <CandidateField label="恢复目标"><CandidateSelect autoFocus value={kind} onValueChange={selectedValue => { setKind(selectedValue as CandidateRestoreTarget['kind']); setCheck(null); }}>
          <option value="replace" disabled={entry.pathStatus === 'missing'}>替换原作品</option>
          <option value="copy">恢复为独立副本</option>
        </CandidateSelect></CandidateField>
        {kind === 'copy' ? <>
          <CandidateField label="恢复副本名称"><CandidateInput required value={name} onChange={event => { setName(event.target.value); setCheck(null); }} /></CandidateField>
          <CandidateField label="恢复副本目录"><CandidateInput required value={directory} onChange={event => { setDirectory(event.target.value); setCheck(null); }} placeholder="/candidate/works/恢复副本" /></CandidateField>
        </> : <>
          {entry.path && <p className="candidate-library-path">{entry.path}</p>}
          <CandidateField label="原作品处理方式"><CandidateSelect value={choice} onValueChange={selectedValue => setChoice(selectedValue as CloseChoice)}>
            <option value="save">保存当前内容并保留恢复前副本</option>
            <option value="discard">放弃当前编辑</option>
          </CandidateSelect></CandidateField>
        </>}
      </CandidateFieldGroup>
      {check && (check.missingDependencies.length ? <div className="candidate-library-error" role="status">
        <strong>缺少以下依赖</strong><ul>{check.missingDependencies.map(dependency => <li key={dependency}>{dependency}</li>)}</ul>
        <p>补齐依赖后重新检查，当前目标会保留。</p>
      </div> : <p className="candidate-library-status" role="status">{kind === 'copy' ? '新目录可用，将分配独立作品身份。' : '原作品身份匹配。'} 备份依赖检查通过。</p>)}
      <Feedback operation={operation} />
      <footer>
        <CandidateButton disabled={operation.busy} onClick={frame.onDismiss}>取消</CandidateButton>
        {check && <CandidateButton disabled={operation.busy} onClick={inspect}>重新检查依赖</CandidateButton>}
        {(!check || !check.missingDependencies.length) && <CandidateButton type="submit" variant="primary" disabled={operation.busy}>
          {check ? '确认恢复' : '检查恢复目标'}
        </CandidateButton>}
      </footer>
    </form>
  </ProjectDialogFrame>;
}

function ConfirmProjectDialog({ kind, entry, onClose, onRemove, ...frame }: DialogProps & Pick<Props, 'onClose' | 'onRemove'> & {
  kind: 'close' | 'remove'; entry: CandidateProjectEntry;
}) {
  const operation = useOperation();
  const removing = kind === 'remove';
  const run = (choice: CloseChoice) => void operation.run(() => removing ? onRemove?.(entry.id) : onClose(entry.id, choice), frame.onDismiss);
  return <ProjectDialogFrame {...frame} busy={operation.busy} title={removing ? '移除作品登记' : '关闭作品选择'}>
    <p>{removing ? '“' + entry.name + '”将从作品库移除。可通过原目录重新登记。'
      : '“' + entry.name + '”的工作会话将关闭。请选择如何处理当前修改。'}</p>
    <Feedback operation={operation} />
    <footer><CandidateButton autoFocus disabled={operation.busy} onClick={frame.onDismiss}>取消</CandidateButton>
      {!removing && entry.dirty && <CandidateButton disabled={operation.busy} onClick={() => run('discard')}>放弃修改并关闭</CandidateButton>}
      <CandidateButton disabled={operation.busy} variant="primary" onClick={() => run('save')}>{removing ? '移除登记' : entry.dirty ? '保存并关闭' : '关闭作品'}</CandidateButton>
    </footer>
  </ProjectDialogFrame>;
}

export function CandidateProjectCenter({
  entries, theme, onOpen, onCreate, onClose, onBackup, onRestore, onReturn, onPreferences, error, onRetry,
  onRegister, onRemove, onPin, onRepair, onCheckRestore, engineVersions = defaultVersions, listEngineVersions,
}: Props) {
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<ProjectDialog | null>(null);
  const [notice, setNotice] = useState('');
  const opener = useRef<HTMLElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const operation = useOperation();
  const { pinned, recent } = candidateLibraryGroups(entries, query);
  const active = dialog !== null;
  const disabled = active || operation.busy;
  const titleId = useId();
  const launch = (next: ProjectDialog, from: HTMLElement) => { opener.current = from; setDialog(next); };
  const frame = { returnTo: opener.current, fallback: search.current, onDismiss: () => setDialog(null) };
  const groups = [{ label: '固定作品', works: pinned }, { label: '最近作品', works: recent }];
  return <main className="gc-candidate authoring-shell candidate-project-library" data-theme={theme}>
    <header className="candidate-library-shell">
      <span><FolderOpen size={17} aria-hidden="true" /> GalCraft Studio</span>
      <div className="candidate-library-actions">
        {onPreferences && <CandidateButton disabled={disabled} variant="ghost" onClick={onPreferences}>个人偏好</CandidateButton>}
        {onReturn && <CandidateButton disabled={disabled} variant="ghost" onClick={onReturn}><ArrowLeft size={15} aria-hidden="true" />返回工作台</CandidateButton>}
      </div>
    </header>
    <section aria-labelledby={titleId} className="candidate-library-content">
      <div className="candidate-library-heading">
        <div><h1 id={titleId}>作品库</h1><p>打开最近的作品，或创建一份新作品。</p></div>
        <div className="candidate-library-actions">
          {onRegister && <CandidateButton disabled={disabled} onClick={event => launch({ kind: 'register' }, event.currentTarget)}>
            <FolderOpen size={16} aria-hidden="true" />登记作品
          </CandidateButton>}
          <CandidateButton disabled={disabled} variant="primary" onClick={event => launch({ kind: 'create' }, event.currentTarget)}>
            <Plus size={16} aria-hidden="true" />新建作品
          </CandidateButton>
        </div>
      </div>
      <label className="candidate-library-search"><Search size={15} aria-hidden="true" />
        <CandidateInput ref={search} type="search" aria-label="搜索作品" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索名称或目录" />
      </label>
      {error && <div className="candidate-library-error" role="alert">{error} <CandidateButton disabled={disabled} onClick={() => void operation.run(onRetry)}>重试打开</CandidateButton></div>}
      <Feedback operation={operation} />
      {notice && !operation.error && <p className="candidate-library-status" role="status">{notice}</p>}
      {groups.map(({ label, works }) => works.length > 0 && <section key={label} className="candidate-library-group" aria-label={label}>
        <h2>{label} <span>{works.length}</span></h2>
        <ul>{works.map(entry => <ProjectRow key={entry.id} entry={entry} busy={disabled}
          onOpen={() => void operation.run(() => onOpen(entry.id))}
          onBackup={() => void operation.run(() => onBackup(entry.id), () => setNotice('已为“' + entry.name + '”创建候选备份。'))}
          onPin={onPin ? () => void operation.run(() => onPin(entry.id, !entry.pinned), () => search.current?.focus()) : undefined}
          showDialog={(kind, from) => launch({ kind, entry }, from)} canRemove={!!onRemove} canRepair={!!onRepair} />)}</ul>
      </section>)}
      {!pinned.length && !recent.length && <div className="candidate-library-empty">
        <Folder size={21} aria-hidden="true" />
        <h2>{query.trim() ? '没有匹配的作品' : '作品库为空'}</h2>
        <p>{query.trim() ? '试试作品名称或目录中的其他词。' : '新建一份作品，或登记已有作品。'}</p>
        {query.trim() && <CandidateButton onClick={() => { setQuery(''); search.current?.focus(); }}>清除搜索</CandidateButton>}
      </div>}
    </section>
    {dialog?.kind === 'create' && <CreateProjectDialog {...frame} onCreate={onCreate} engineVersions={engineVersions} listEngineVersions={listEngineVersions} />}
    {dialog?.kind === 'register' && onRegister && <DirectoryDialog {...frame} run={onRegister} />}
    {dialog?.kind === 'repair' && onRepair && <DirectoryDialog {...frame} entry={dialog.entry} run={directory => onRepair(dialog.entry.id, directory)} />}
    {dialog?.kind === 'restore' && <RestoreProjectDialog {...frame} entry={dialog.entry} onRestore={onRestore} onCheckRestore={onCheckRestore} />}
    {(dialog?.kind === 'close' || dialog?.kind === 'remove') && <ConfirmProjectDialog {...frame} kind={dialog.kind} entry={dialog.entry} onClose={onClose} onRemove={onRemove} />}
  </main>;
}
