import { useLayoutEffect, useRef, useState } from 'react';
import { FileText, Layers } from 'lucide-react';
import { Badge, Button, Choice } from '../../components/controls.js';
import { Disclosure } from '../../components/disclosure.js';
import { Pagination } from '../../components/pagination.js';
import { Input } from '../../components/ui/input.js';
import type { ProductionDirectoryState, ProductionRecord, ProductionSession } from './session.js';
import './production-directory.css';

export function initialProductionDirectory(): ProductionDirectoryState {
  return { query: '', filter: 'all', scrollTop: 0, taskPage: 0, draftPage: 0, taskHistoryOpen: true, draftHistoryOpen: true, record: null };
}

const runningStates = ['queued', 'submitting', 'running', 'fetching', 'blocked'];
export const taskRunning = (task: ProductionSession['tasks'][number]) => task.items.some(item => runningStates.includes(item.state));

type Props = {
  tasks: ProductionSession['tasks'];
  drafts: ProductionSession['data']['drafts'];
  record: ProductionRecord | null;
  locale: string;
  status(state: string): string;
  loaded: boolean;
  busy?: boolean;
  hidden?: boolean;
  error?: string;
  initial?: ProductionDirectoryState;
  onChange?(state: Partial<ProductionDirectoryState>): void;
  onOpen(record: ProductionRecord): void;
};

export function ProductionDirectory({ tasks, drafts, record, locale, status, loaded, busy, hidden, error, initial, onChange, onOpen }: Props) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [state, setState] = useState(() => initial ?? initialProductionDirectory());
  const { query, filter, taskPage, draftPage, taskHistoryOpen, draftHistoryOpen } = state;
  const scroll = useRef<HTMLElement>(null);
  const scrollTop = useRef(state.scrollTop);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const restore = () => { if (node.clientHeight) node.scrollTop = scrollTop.current; };
    const resize = new ResizeObserver(restore);
    resize.observe(node);
    restore();
    return () => resize.disconnect();
  }, [loaded]);

  const update = (patch: Partial<ProductionDirectoryState>) => {
    setState(current => ({ ...current, ...patch }));
    onChange?.(patch);
  };
  const term = query.trim().toLocaleLowerCase();
  const matches = (name: string) => name.toLocaleLowerCase().includes(term);
  const availableTasks = [...tasks].reverse().filter(task => matches(task.name) && (
    filter === 'all' || (filter === 'active' ? taskRunning(task)
      : task.items.some(item => filter === 'review' ? item.state === 'review' : ['failed', 'interrupted'].includes(item.state)))
  ));
  const availableDrafts = drafts.filter(draft => !draft.submittedTaskId && matches(draft.name ?? draft.activeUse));
  const taskIndex = Math.min(taskPage, Math.max(0, Math.ceil(availableTasks.length / 20) - 1));
  const draftIndex = Math.min(draftPage, Math.max(0, Math.ceil(availableDrafts.length / 20) - 1));
  const noMatch = loaded && !availableTasks.length && !availableDrafts.length && (term || filter !== 'all');
  const changeQuery = (value: string, nextFilter = filter) => update({
    query: value, filter: nextFilter, taskPage: 0, draftPage: 0, taskHistoryOpen: true,
    draftHistoryOpen: value ? true : draftHistoryOpen,
  });

  return <aside ref={scroll} className="task-sidebar production-directory" hidden={hidden} onScroll={event => {
    if (!event.currentTarget.clientHeight) return;
    const next = Math.max(0, event.currentTarget.scrollTop);
    if (next === scrollTop.current) return;
    scrollTop.current = next;
    onChange?.({ scrollTop: next });
  }}>
    <div className="task-filters">
      <Input data-dock-focus aria-label={t('查找制作记录', 'Find production records', '制作履歴を検索')} placeholder={t('查找制作记录…', 'Find production records…', '制作履歴を検索…')} value={query} onChange={event => changeQuery(event.target.value)}/>
      <Choice label={t('任务状态', 'Task status', 'タスクの状態')} value={filter} options={[
        { value: 'all', label: t('全部任务', 'All tasks', 'すべてのタスク') },
        { value: 'active', label: t('进行中', 'In progress', '進行中') },
        { value: 'review', label: t('待审阅', 'Ready for review', 'レビュー待ち') },
        { value: 'failed', label: t('失败或中断', 'Failed or interrupted', '失敗・中断') },
      ]} onChange={value => changeQuery(query, value as ProductionDirectoryState['filter'])}/>
    </div>
    {error && <p className="task-empty" role="alert">{error}</p>}
    {!loaded && !error && <p className="task-empty" role="status">{t('正在读取制作记录…', 'Reading production records…', '制作履歴を読み込んでいます…')}</p>}
    {loaded && !tasks.length && !drafts.some(draft => !draft.submittedTaskId) && !noMatch && <p className="task-empty">
      {t('提交任务或保存草稿后，可在这里继续制作。', 'Resume here after submitting a task or saving a draft.', 'タスクの送信や下書きの保存後、ここから再開できます。')}
    </p>}
    {noMatch && <div className="task-empty" role="status">
      <p>{t('没有匹配的任务或草稿。', 'No matching tasks or drafts.', '一致するタスクや下書きがありません。')}</p>
      <Button tone="quiet" onClick={() => changeQuery('', 'all')}>{t('清除搜索和筛选', 'Clear search and filter', '検索と絞り込みをクリア')}</Button>
    </div>}
    <Disclosure open={taskHistoryOpen} onOpenChange={value => update({ taskHistoryOpen: value })}>
      <span>{t('制作记录', 'Production history', '制作履歴')} · {availableTasks.length}</span>
      <Pagination total={availableTasks.length} page={taskIndex} pageSize={20} onPageChange={value => update({ taskPage: value })} locale={locale} label={t('制作记录分页', 'Production history pages', '制作履歴のページ')}/>
      {availableTasks.slice(taskIndex * 20, (taskIndex + 1) * 20).map(task => {
        const selected = record?.kind === 'task' && record.id === task.id;
        return <button key={task.id} data-task-id={task.id} type="button" className={`task-row${selected ? ' selected' : ''}`} aria-current={selected || undefined} disabled={busy} onClick={() => onOpen({ kind: 'task', id: task.id })}>
          <span><Layers size={15} aria-hidden="true"/><strong title={task.name}>{task.name}</strong></span>
          <small>{task.items.length} {t('个步骤', 'steps', 'ステップ')} · {new Date(task.createdAt).toLocaleDateString(locale)}</small>
          <Badge>{status(task.items.at(-1)?.state ?? 'draft')}</Badge>
        </button>;
      })}
    </Disclosure>
    <Disclosure open={draftHistoryOpen} onOpenChange={value => update({ draftHistoryOpen: value })}>
      <span>{t('制作草稿', 'Drafts', '下書き')} · {availableDrafts.length}</span>
      <Pagination total={availableDrafts.length} page={draftIndex} pageSize={20} onPageChange={value => update({ draftPage: value })} locale={locale} label={t('制作草稿分页', 'Draft pages', '下書きのページ')}/>
      {availableDrafts.slice(draftIndex * 20, (draftIndex + 1) * 20).map(draft => {
        const name = draft.name || t('未命名草稿', 'Untitled draft', '無題の下書き');
        const selected = record?.kind === 'draft' && record.id === draft.id;
        return <button key={draft.id} data-draft-id={draft.id} type="button" className={`task-row${selected ? ' selected' : ''}`} aria-current={selected || undefined} disabled={busy} onClick={() => onOpen({ kind: 'draft', id: draft.id })}>
          <span><FileText size={15} aria-hidden="true"/><strong title={name}>{name}</strong></span>
          <small>{new Date(draft.updatedAt).toLocaleString(locale)}</small>
        </button>;
      })}
    </Disclosure>
  </aside>;
}
