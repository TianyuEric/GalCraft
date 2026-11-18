import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import { issueDetails, localizeIssue, type Issue } from '@galcraft/contracts';
import { ChevronRight, CircleX, Info, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select.js';
import './problems.css';

export type WorkbenchProblem = {
  id: string;
  issue: Issue;
  group: string;
  summary?: string;
  action?: { label: string; run(): void };
  stale?: boolean;
  attemptKeys?: string[];
  ignored?: boolean;
};

export type ProblemsState = {
  query: string;
  severity: 'all' | 'error' | 'warning';
  selected: string | null;
  scrollTop: number;
  showIgnored?: boolean;
  expanded?: string | null;
};

type ProblemsProps = {
  problems: WorkbenchProblem[];
  locale: string;
  state: ProblemsState;
  onStateChange(state: ProblemsState): void;
  pending?: boolean;
  onToggleIgnore?(problem: WorkbenchProblem): void;
  onRecheck?(): void;
  checking?: boolean;
};

const copy = {
  en: { search: 'Search problems', severity: 'Severity', all: 'All severities', error: 'Error', warning: 'Warning', info: 'Information', details: 'Diagnostic details', stale: 'Needs recheck', pending: 'Check incomplete. Previous results are kept.', empty: 'No current problems.', filtered: 'No problems match these filters.', recheck: 'Recheck', checking: 'Checking…', recheckHint: 'Check current diagnostics again.', ignored: 'Ignored', ignoredBadge: 'Ignored this attempt', ignore: 'Ignore this attempt', ignoreHint: 'Hide this attempt’s problem and keep the original receipt.', restore: 'Bring back', restoreHint: 'Return this problem to pending problems.', showIgnored: 'Show ignored problems', showPending: 'Show pending problems', emptyIgnored: 'No ignored problems.', noPending: (count: number) => `No pending problems. ${count} ignored.` },
  ja: { search: '問題を検索', severity: '重要度', all: 'すべての重要度', error: 'エラー', warning: '警告', info: '情報', details: '診断の詳細', stale: '再確認が必要', pending: '確認は完了していません。前回の結果を保持しています。', empty: '現在、問題はありません。', filtered: '条件に一致する問題はありません。', recheck: '再確認', checking: '確認中…', recheckHint: '現在の診断を再確認します。', ignored: '無視した問題', ignoredBadge: '今回のみ無視', ignore: '今回のみ無視', ignoreHint: '今回の操作の問題を非表示にし、元の記録を保持します。', restore: '再び表示', restoreHint: 'この問題を未対応の問題に戻します。', showIgnored: '無視した問題を表示', showPending: '未対応の問題を表示', emptyIgnored: '無視した問題はありません。', noPending: (count: number) => `未対応の問題はありません。${count}件を無視しています。` },
  zh: { search: '搜索问题', severity: '严重程度', all: '全部级别', error: '错误', warning: '警告', info: '信息', details: '诊断详情', stale: '需要重新检查', pending: '检查尚未完成，已保留上次结果。', empty: '当前没有问题。', filtered: '没有符合筛选条件的问题。', recheck: '重新检查', checking: '检查中…', recheckHint: '重新检查当前诊断。', ignored: '已忽略', ignoredBadge: '已忽略本次', ignore: '忽略本次', ignoreHint: '只隐藏本次操作问题，保留原始回执。', restore: '重新关注', restoreHint: '将本次问题重新列入待处理问题。', showIgnored: '显示已忽略的问题', showPending: '返回待处理问题', emptyIgnored: '当前没有已忽略的问题。', noPending: (count: number) => `当前没有待处理问题，已忽略 ${count} 项。` },
};
const severityOrder = { error: 0, warning: 1, info: 2 };
const severityIcons = { error: CircleX, warning: TriangleAlert, info: Info };

/** The workbench owns result lifetimes and navigation; this pane owns only presentation. */
export function Problems({ problems, locale, state, onStateChange, pending = false, onToggleIgnore, onRecheck, checking = false }: ProblemsProps) {
  const text = copy[locale.startsWith('en') ? 'en' : locale.startsWith('ja') ? 'ja' : 'zh'];
  const list = useRef<HTMLDivElement>(null);
  const currentState = useRef(state);
  currentState.current = state;
  const expanded = state.expanded ?? null;
  const instanceId = useId();
  const showIgnored = state.showIgnored ?? false;
  const isIgnored = (problem: WorkbenchProblem) => Boolean(problem.attemptKeys?.length && problem.ignored);
  const ignoredCount = problems.filter(isIgnored).length;
  const modeCount = showIgnored ? ignoredCount : problems.length - ignoredCount;
  const update = (change: Partial<ProblemsState>) => {
    const next = { ...currentState.current, ...change };
    currentState.current = next;
    onStateChange(next);
  };

  const groups = useMemo(() => {
    const query = state.query.trim().toLocaleLowerCase(locale);
    const visible = problems.filter(problem => {
      if (Boolean(problem.attemptKeys?.length && problem.ignored) !== showIgnored) return false;
      if (state.severity !== 'all' && problem.issue.severity !== state.severity) return false;
      return !query || [problem.group, problem.summary, localizeIssue(problem.issue, locale), problem.issue.messageParams?.object, problem.issue.code]
        .filter(value => value !== undefined).join(' ').toLocaleLowerCase(locale).includes(query);
    }).sort((a, b) => severityOrder[a.issue.severity] - severityOrder[b.issue.severity]);
    const result = new Map<string, WorkbenchProblem[]>();
    for (const problem of visible) {
      const group = result.get(problem.group);
      if (group) group.push(problem);
      else result.set(problem.group, [problem]);
    }
    return [...result];
  }, [problems, locale, state.query, state.severity, showIgnored]);

  useLayoutEffect(() => {
    if (list.current && Math.abs(list.current.scrollTop - state.scrollTop) > 1) list.current.scrollTop = state.scrollTop;
  }, [state.scrollTop, showIgnored, groups, expanded]);

  return <div className="gc-workbench-problems">
    <div className="gc-problems-toolbar" role="search" aria-label={text.search}>
      <Input type="search" value={state.query} aria-label={text.search} placeholder={text.search}
        leadingIcon={<Search aria-hidden="true" />} inputContainerClassName="gc-problems-search" className="gc-problems-search-input"
        onChange={event => update({ query: event.currentTarget.value, scrollTop: 0 })} />
      <Select value={state.severity} items={[
        { value: 'all', label: text.all }, { value: 'error', label: text.error }, { value: 'warning', label: text.warning },
      ]} onValueChange={value => { if (value === 'all' || value === 'error' || value === 'warning') update({ severity: value, scrollTop: 0 }); }}>
        <SelectTrigger size="sm" className="gc-problems-severity" aria-label={text.severity}><SelectValue /></SelectTrigger>
        <SelectContent>{(['all', 'error', 'warning'] as const).map(value => <SelectItem key={value} value={value}>{text[value]}</SelectItem>)}</SelectContent>
      </Select>
      <div className="gc-problems-toolbar-actions">
        {(ignoredCount > 0 || showIgnored) && <Button type="button" variant="ghost" size="sm" className="gc-problems-ignored-toggle"
          aria-pressed={showIgnored} title={showIgnored ? text.showPending : text.showIgnored}
          onClick={() => update({ showIgnored: !showIgnored })}>{text.ignored} ({ignoredCount})</Button>}
        {onRecheck && <Button type="button" variant="ghost" size="sm" className="gc-problems-recheck"
          aria-label={text.recheck} aria-disabled={checking} aria-busy={checking} title={checking ? text.checking : text.recheckHint}
          onClick={() => { if (!checking) onRecheck(); }}>
          <RefreshCw size={16} aria-hidden="true" className={checking ? 'gc-problems-checking-icon' : undefined} />
          <span>{checking ? text.checking : text.recheck}</span>
        </Button>}
      </div>
    </div>
    <div ref={list} className="gc-problems-list" onScroll={event => {
      const scrollTop = event.currentTarget.scrollTop;
      if (Math.abs(scrollTop - currentState.current.scrollTop) > 1) update({ scrollTop });
    }}>
      {pending && <p className="gc-problems-pending" role="status">{text.pending}</p>}
      {groups.map(([name, entries]) => <section className="gc-problems-group" key={name} aria-label={name}>
        <h3 title={name}>{name}</h3>
        {entries.map(problem => {
          const { issue } = problem;
          const Icon = severityIcons[issue.severity];
          const explanation = problem.summary ?? localizeIssue(issue, locale);
          const object = issue.messageParams?.object;
          const identity = object === undefined ? name : String(object);
          const detailsId = `${instanceId}-${encodeURIComponent(problem.id)}`;
          const isExpanded = expanded === problem.id;
          return <div className="gc-problem-row" key={problem.id} data-problem-id={problem.id} data-issue-code={issue.code}
            data-severity={issue.severity} data-selected={state.selected === problem.id}>
            <Button type="button" variant="ghost" className="gc-problem-select" aria-pressed={state.selected === problem.id}
              onClick={() => update({ selected: problem.id })}>
              <Icon className="gc-problem-icon" size={16} aria-hidden="true" />
              <span className="gc-problem-copy"><span className="gc-problem-reason">{explanation}</span>
                {explanation !== issue.message && <span className="gc-problem-cause">{issue.message}</span>}
                <span className="gc-problem-identity"><span className="gc-problem-severity-label">{text[issue.severity]}</span><span title={identity}>{identity}</span>{problem.stale && <span>{text.stale}</span>}{isIgnored(problem) && <span className="gc-problem-ignored-badge">{text.ignoredBadge}</span>}</span>
              </span>
            </Button>
            {problem.action && <Button type="button" variant="ghost" size="sm" className="gc-problem-action" onClick={problem.action.run}>{problem.action.label}</Button>}
            {onToggleIgnore && Boolean(problem.attemptKeys?.length) && <Button type="button" variant="ghost" size="sm" className="gc-problem-ignore"
              title={isIgnored(problem) ? text.restoreHint : text.ignoreHint} onClick={() => onToggleIgnore(problem)}>
              {isIgnored(problem) ? text.restore : text.ignore}
            </Button>}
            <Button type="button" variant="ghost" size="icon-sm" className="gc-problem-disclosure" title={text.details}
              aria-label={`${text.details}: ${explanation}`} aria-expanded={isExpanded} aria-controls={detailsId}
              onClick={() => update({ selected: problem.id, expanded: isExpanded ? null : problem.id })}>
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
            <pre id={detailsId} hidden={!isExpanded} className="gc-problem-details">{isExpanded ? issueDetails(issue) : null}</pre>
          </div>;
        })}
      </section>)}
      {!groups.length && (modeCount > 0 || !pending) && <p className="gc-problems-empty" role="status">
        {modeCount > 0 ? text.filtered : showIgnored ? text.emptyIgnored : ignoredCount > 0 ? text.noPending(ignoredCount) : text.empty}
      </p>}
    </div>
  </div>;
}
