import type { Task } from '@galcraft/authoring/production';
import { Button } from '../../components/controls.js';
import { Progress } from '../../components/ui/progress.js';
import './task-execution-status.css';
import { progressCount, progressPhase } from './task-progress.js';

export function TaskExecutionStatus({ task, locale, statusLabel, showSteps }: { task: Task; locale: string; statusLabel(state: string): string; showSteps(): void }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const active = task.items.filter(item => ['queued', 'submitting', 'running', 'fetching', 'blocked'].includes(item.state));
  const attention = task.items.filter(item => ['failed', 'interrupted', 'cancelled'].includes(item.state));
  const completed = task.items.filter(item => item.state === 'review').length;
  return <section className="task-execution-status" aria-label={t('任务执行状态', 'Task execution status', 'タスク実行状況')}>
    <div className="task-execution-summary"><p role="status">{t(`生成完成 ${completed}/${task.items.length} 步 · 进行中 ${active.length} · 需处理 ${attention.length}`, `${completed}/${task.items.length} steps generated · ${active.length} active · ${attention.length} need attention`, `生成完了 ${completed}/${task.items.length} ステップ・実行中 ${active.length}・要確認 ${attention.length}`)}</p><Button tone="quiet" onClick={showSteps}>{attention.length ? t('处理执行问题', 'Review execution issues', '実行の問題を確認') : t('查看执行步骤', 'View execution steps', '実行ステップを表示')}</Button></div>
    {active.map(item => {
      const { completed: done, total } = item.progress;
      const measured = item.state === 'running' && done !== null && total !== null && total > 0;
      return <div className="task-execution-current" key={item.id}><p><strong>{statusLabel(item.state)}</strong><span>{item.configSnapshot?.name ?? t('本地组合', 'Local composition', 'ローカル結合')}{item.progress.phase ? ` · ${progressPhase(item.progress, locale)}` : ''}{item.progress.nodeName ? ` · ${item.progress.nodeName}` : ''}</span><span>{progressCount(item.progress, locale)}</span></p>{['running', 'submitting', 'fetching'].includes(item.state) && <Progress aria-label={`${statusLabel(item.state)} · ${item.configSnapshot?.name ?? item.id}`} value={measured ? done / total * 100 : null}/>}</div>;
    })}
    {!!attention.length && <p className="task-execution-attention">{t('已有结果继续保留。重取结果确认远端状态；新增请求重试需再次审阅。', 'Existing results are kept. Reconcile checks the remote state; retrying a new request requires review.', '既存の結果を保持します。再取得でリモート状態を確認し、新規リクエストの再試行は再確認します。')}</p>}
  </section>;
}
