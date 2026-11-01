import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProjectLibraryEntry, Result, StudioBridge } from '@galcraft/contracts';
import { Archive, Clock3, Copy, FolderOpen, LayoutGrid, List, MapPin, Pin, Search, Trash2 } from 'lucide-react';
import { Button } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import type { StudioLocale } from '../../authoring/controller.js';
import { tr } from '../Production/Production.js';
import { ObjectTree } from '../../components/workbench/ObjectTree.js';
import { InspectorSection } from '../../components/workbench/WorkbenchShell.js';
import { MessageBox } from '../../components/workbench/MessageBox.js';

export type ProjectLibraryActions = Pick<StudioBridge['projects'], 'listRecent' | 'setPinned' | 'forget' | 'relocate' | 'chooseDirectory' | 'revealDirectory'>;
export function ProjectLibrary({ locale, library, currentId, revision, open, copy, backup, explorerContainer, inspectorContainer, revealInspector }: {
  locale: StudioLocale; library?: ProjectLibraryActions; currentId?: string; revision?: number;
  open(directory: string): Promise<void>; copy(directory?: string): Promise<void>; backup?(directory?: string): Promise<void>;
  explorerContainer?: HTMLElement; inspectorContainer?: HTMLElement; revealInspector?(): void;
}) {
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
  const [entries, setEntries] = useState<ProjectLibraryEntry[]>([]), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [filter, setFilter] = useState<'recent' | 'all' | 'pinned'>('recent');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [forget, setForget] = useState<ProjectLibraryEntry | null>(null);
  function value<T>(result: Result<T>): T { if (!result.ok) throw new Error(result.error.message); return result.value; }
  const refresh = async () => {
    if (!library?.listRecent) { setEntries([]); setLoading(false); return; }
    try { setEntries(value(await library.listRecent())); }
    catch (reason) { setError(String(reason instanceof Error ? reason.message : reason)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [currentId, revision]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (reason) { setError(String(reason instanceof Error ? reason.message : reason)); }
    finally { setBusy(false); }
  };
  const query = search.trim().toLocaleLowerCase();
  const filtered = entries.filter(entry => (filter !== 'pinned' || entry.pinned)
    && (!query || `${entry.name} ${entry.directory}`.toLocaleLowerCase().includes(query)));
  const visible = [...filtered].sort((a, b) => filter === 'all' ? a.name.localeCompare(b.name, locale)
    : (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''));
  const date = (iso: string | null) => iso ? new Date(iso).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : t('尚未记录时间', 'No opening time recorded', '日時の記録なし');
  const selected = entries.find(entry => entry.directory === selectedDirectory) ?? (selectedDirectory === null ? entries.find(entry => entry.projectId === currentId) ?? visible[0] : undefined);
  const inspect = (entry: ProjectLibraryEntry) => { setSelectedDirectory(entry.directory); revealInspector?.(); };
  const filters = [['recent', t('最近打开', 'Recent', '最近')], ['all', t('全部作品', 'All projects', 'すべて')], ['pinned', t('已固定', 'Pinned', '固定済み')]] as const;
  const explorer = <div className="project-library-explorer"><ObjectTree label={t('作品范围', 'Project collections', '作品の範囲')}
    nodes={filters.map(([id, name]) => ({ id, name, icon: id === 'pinned' ? <Pin/> : id === 'recent' ? <Clock3/> : <FolderOpen/>, detail: String(id === 'pinned' ? entries.filter(entry => entry.pinned).length : entries.length) }))}
    selected={[filter]} onSelect={ids => { if (ids[0]) setFilter(ids[0] as typeof filter); }} onOpen={() => {}} />
    <h3 className="gc-wb-tree-section-title">{t('作品', 'Projects', '作品')}</h3>
    <ObjectTree label={t('登记作品', 'Registered projects', '登録作品')} nodes={visible.map(entry => ({ id: entry.directory, name: entry.name, icon: <FolderOpen/>, detail: entry.projectId === currentId ? t('当前', 'Open', '現在') : entry.pinned ? '●' : undefined }))}
      selected={selected ? [selected.directory] : []} onSelect={ids => { const entry = entries.find(entry => entry.directory === ids[0]); if (entry) inspect(entry); }}
      onOpen={(id, pinned) => { const entry = entries.find(entry => entry.directory === id); if (entry && pinned && entry.status === 'available') void run(() => open(id)); }} />
    {!visible.length && <p className="project-library-hint">{t('打开或创建作品后，作品会显示在这里。', 'Opened and created projects appear here.', '開いた作品や新しい作品がここに表示されます。')}</p>}
  </div>;
  const inspector = <div className="project-library-inspector"><InspectorSection title={selected?.name ?? t('作品库概要', 'Library overview', 'ライブラリ概要')}>
    {selected ? <><p>{selected.description || t('尚未填写作品简介', 'No description yet', '作品の説明は未入力です')}</p>
      <dl><dt>{t('状态', 'Status', '状態')}</dt><dd>{selected.status === 'available' ? t('可以打开', 'Ready to open', '開くことができます') : selected.status === 'missing' ? t('目录需要重新定位', 'Locate the project folder', 'フォルダーを再指定') : t('作品配置需要检查', 'Check project configuration', '作品設定を確認')}</dd>
        <dt>{t('引擎', 'Engine', 'エンジン')}</dt><dd>{selected.engineVersion || '—'}</dd><dt>{t('最近打开', 'Last opened', '最終利用')}</dt><dd>{date(selected.lastOpenedAt)}</dd></dl>
      <Button tone="primary" disabled={busy || selected.status !== 'available'} onClick={() => void run(() => open(selected.directory))}><FolderOpen/>{t('打开作品', 'Open project', '作品を開く')}</Button>
    </> : <p>{t(`已登记 ${entries.length} 部作品。打开本机作品或创建一个新作品开始。`, `${entries.length} registered projects. Open a local project or create one to begin.`, `${entries.length} 件の作品。作品を開くか、新規作成してください。`)}</p>}
  </InspectorSection>{selected && <InspectorSection title={t('作品管理', 'Manage project', '作品の管理')}><div className="project-inspector-actions">
    <Button disabled={busy} onClick={() => void run(async () => { if (library) value(await library.setPinned({ directory: selected.directory, pinned: !selected.pinned })); })}><Pin/>{selected.pinned ? t('取消固定', 'Unpin', '固定解除') : t('固定作品', 'Pin project', '作品を固定')}</Button>
    <Button disabled={busy || selected.status !== 'available'} onClick={() => void run(async () => { if (library) value(await library.revealDirectory(selected.directory)); })}><FolderOpen/>{t('所在目录', 'Show folder', 'フォルダー')}</Button>
    <Button tone="quiet" disabled={busy || selected.status !== 'available'} onClick={() => void run(() => copy(selected.projectId === currentId ? undefined : selected.directory))}><Copy/>{t('复制作品', 'Duplicate', '複製')}</Button>
    {backup && <Button disabled={busy || selected.status !== 'available'} onClick={() => void run(() => backup(selected.projectId === currentId ? undefined : selected.directory))}><Archive/>{t('备份作品', 'Back up', 'バックアップ')}</Button>}
    {selected.status !== 'available' && <Button disabled={busy} onClick={() => void run(async () => { if (!library) return; const replacement = value(await library.chooseDirectory()); if (replacement) { value(await library.relocate({ directory: selected.directory, replacement })); setSelectedDirectory(replacement); } })}><MapPin/>{t('重新定位', 'Locate folder', '再指定')}</Button>}
    <Button tone="quiet" disabled={busy} onClick={() => setForget(selected)}><Trash2/>{t('移除记录，保留文件', 'Remove record, keep files', '記録のみ削除')}</Button>
  </div><details><summary>{t('目录与标识', 'Folder and identity', 'フォルダーとID')}</summary><p>{selected.directory}</p><code>{selected.projectId}</code></details></InspectorSection>}</div>;
  return <section className="project-library" aria-label={t('作品列表', 'Project library', '作品一覧')}>
    {explorerContainer && createPortal(explorer, explorerContainer)}
    {inspectorContainer && createPortal(inspector, inspectorContainer)}
    <div className="project-library-toolbar">
      <div hidden={!!explorerContainer} className="project-library-tabs" role="group" aria-label={t('作品范围', 'Project filter', '作品の絞り込み')}>
        {([['recent', t('最近打开', 'Recent', '最近')], ['all', t('全部作品', 'All projects', 'すべて')], ['pinned', t('已固定', 'Pinned', '固定済み')]] as const).map(([key, label]) =>
          <Button key={key} tone={filter === key ? 'primary' : 'quiet'} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}
            <small>{key === 'pinned' ? entries.filter(entry => entry.pinned).length : entries.length}</small></Button>)}
      </div>
      <div className="project-library-tools">
        <label className="project-search"><Search size={16} /><Input aria-label={t('搜索作品名称或路径', 'Search project name or path', '作品名・パスを検索')}
          placeholder={t('搜索作品或路径', 'Search name or path', '作品名・パスを検索')} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="project-view-switch" role="group" aria-label={t('列表外观', 'Library view', '一覧表示')}>
          <Button tone="quiet" aria-label={t('卡片视图', 'Card view', 'カード表示')} title={t('卡片视图', 'Card view', 'カード表示')} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid size={17} /></Button>
          <Button tone="quiet" aria-label={t('列表视图', 'List view', 'リスト表示')} title={t('列表视图', 'List view', 'リスト表示')} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={17} /></Button>
        </div>
      </div>
    </div>
    {error && <div className="project-library-error" role="alert">{error}<Button tone="quiet" onClick={() => void run(refresh)}>{t('重新读取', 'Reload', '再読み込み')}</Button></div>}
    {loading ? <p className="project-library-empty" role="status">{t('正在读取作品…', 'Loading projects…', '作品を読み込み中…')}</p> : visible.length === 0 ?
      <div className="project-library-empty"><FolderOpen size={26} /><h3>{query ? t('没有匹配的作品', 'No matching projects', '一致する作品がありません')
        : filter === 'pinned' ? t('把常用作品固定在这里', 'Pin the projects you return to', 'よく使う作品を固定しましょう') : t('你的作品会显示在这里', 'Your projects will appear here', '作品はここに表示されます')}</h3>
        <p>{query ? t('试试名称或存放路径中的其他关键词。', 'Try another part of the name or folder path.', '別の作品名やパスで検索してください。')
          : t('创建或打开本地作品后会自动加入列表。移除记录不会删除作品文件。', 'Created and opened projects appear automatically. Removing a record keeps its files.', '作成・開いた作品が自動で追加されます。一覧から削除してもファイルは残ります。')}</p></div>
      : <div className={`project-library-items ${layout}`} aria-busy={busy}>{visible.map(entry => {
        const active = entry.projectId === currentId, available = entry.status === 'available';
        const label = (zh: string, en: string, ja: string) => `${t(zh, en, ja)} · ${entry.name}`;
        const action = (zh: string, en: string, ja: string) => label(zh, en, ja);
        return <article className={`project-library-item ${active ? 'current' : ''} ${selected?.directory === entry.directory && inspectorContainer ? 'inspected' : ''}`} key={entry.directory}>
          <button className="project-library-main" disabled={busy || (!inspectorContainer && !available)} onClick={() => inspectorContainer ? inspect(entry) : void run(() => open(entry.directory))} onDoubleClick={() => { if (inspectorContainer && available) void run(() => open(entry.directory)); }}>
            <span className="project-library-cover" aria-hidden="true">{entry.name.slice(0, 1)}</span>
            <span className="project-library-info"><span className="project-library-title"><strong>{entry.name}</strong>{entry.pinned && <Pin size={13} />}
              {active && <small>{t('当前', 'Open', '現在')}</small>}</span>
              <span className="project-library-description">{entry.description || t('尚未填写作品简介', 'No description yet', '作品の説明は未入力です')}</span>
              <span className="project-library-path" title={entry.directory}>{entry.directory}</span>
            </span>
          </button>
          <div className="project-library-meta"><span><Clock3 size={12} />{date(entry.lastOpenedAt)}</span>
            <span>{entry.engineVersion ? `Engine ${entry.engineVersion}` : '—'}</span></div>
          {!available && <div className="project-library-unavailable"><span>{entry.status === 'missing' ? t('目录已移动或无法访问', 'Folder moved or unavailable', 'フォルダーが移動・利用不可') : t('作品配置需要检查', 'Project configuration needs attention', '作品設定を確認してください')}</span>
            <Button disabled={busy} onClick={() => void run(async () => { if (!library) return; const replacement = value(await library.chooseDirectory()); if (replacement) value(await library.relocate({ directory: entry.directory, replacement })); })}>
              <MapPin size={14} />{t('重新定位', 'Locate folder', '再指定')}</Button></div>}
          <footer hidden={!!inspectorContainer} className="project-library-actions">
            <Button tone="quiet" disabled={busy} aria-pressed={entry.pinned} aria-label={action(entry.pinned ? '取消固定' : '固定作品', entry.pinned ? 'Unpin' : 'Pin project', entry.pinned ? '固定を解除' : '作品を固定')}
              title={action(entry.pinned ? '取消固定' : '固定作品', entry.pinned ? 'Unpin' : 'Pin project', entry.pinned ? '固定を解除' : '作品を固定')}
              onClick={() => void run(async () => { if (library) value(await library.setPinned({ directory: entry.directory, pinned: !entry.pinned })); })}><Pin size={15} /></Button>
            <Button tone="quiet" disabled={busy || !available} aria-label={action('所在目录', 'Show folder', 'フォルダーを開く')} title={action('所在目录', 'Show folder', 'フォルダーを開く')}
              onClick={() => void run(async () => { if (library) value(await library.revealDirectory(entry.directory)); })}><FolderOpen size={15} /></Button>
            <Button tone="quiet" disabled={busy || !available} aria-label={action('打开并复制作品', 'Open and duplicate', '開いて複製')} title={action('打开并复制作品', 'Open and duplicate', '開いて複製')}
              onClick={() => void run(() => copy(active ? undefined : entry.directory))}><Copy size={15} /></Button>
            {backup && <Button tone="quiet" disabled={busy || !available} aria-label={action('打开并备份作品', 'Open and back up', '開いてバックアップ')} title={action('打开并备份作品', 'Open and back up', '開いてバックアップ')}
              onClick={() => void run(() => backup(active ? undefined : entry.directory))}><Archive size={15} /></Button>}
            <Button tone="quiet" className="project-forget" disabled={busy} aria-label={action('从列表移除，保留文件', 'Remove record, keep files', '一覧から削除（ファイルは保持）')} title={action('从列表移除，保留文件', 'Remove record, keep files', '一覧から削除（ファイルは保持）')}
              onClick={() => setForget(entry)}><Trash2 size={15} /></Button>
          </footer>
        </article>;
      })}</div>}
    {forget && <MessageBox title={t('移除作品记录', 'Remove project record', '作品の記録を削除')} description={t(`从作品库移除“${forget.name}”的登记。作品文件保留，可通过打开作品重新登记。`, `Remove “${forget.name}” from the library. Files remain; open the project to register it again.`, `「${forget.name}」の記録を削除します。ファイルは保持され、作品を開くと再登録できます。`)} cancelLabel={t('取消', 'Cancel', 'キャンセル')} onClose={() => setForget(null)} actions={[{ label: t('移除记录，保留文件', 'Remove record, keep files', '記録のみ削除'), tone: 'danger', run: async () => { if (!library) return; value(await library.forget(forget.directory)); setSelectedDirectory(visible.find(entry => entry.directory !== forget.directory)?.directory ?? null); await refresh(); } }]}/>}
  </section>;
}
