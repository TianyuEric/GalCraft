import type { GenerationProgress } from '@galcraft/contracts';
const pick = (locale: string, zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
export function progressPhase(progress: GenerationProgress, locale: string): string {
  const labels: Record<string, [string, string, string]> = { queued: ['排队中', 'Queued', '待機中'], running: ['执行中', 'Running', '実行中'], executing: ['执行节点', 'Executing node', 'ノード実行中'], cached: ['复用缓存', 'Reusing cache', 'キャッシュ再利用'], fetching: ['取回产物', 'Fetching outputs', '出力取得中'], completed: ['执行完成', 'Completed', '完了'], failed: ['执行失败', 'Failed', '失敗'], unknown: ['状态待确认', 'State unconfirmed', '状態未確認'], releasingResources: ['释放资源', 'Releasing resources', 'リソース解放中'] };
  const label = labels[progress.phase];
  return label ? pick(locale, ...label) : progress.phase;
}
export function progressCount(progress: GenerationProgress, locale: string): string {
  const scope = progress.scope === 'sampling' ? pick(locale, '当前采样节点', 'Current sampling node', '現在のサンプリングノード') : progress.scope === 'nodes' ? pick(locale, '工作流节点', 'Workflow nodes', 'ワークフローノード') : pick(locale, '当前阶段', 'Current phase', '現在の段階');
  const knownTotal = progress.total !== null && progress.total > 0;
  if (progress.completed === null) return `${scope} · ${pick(locale, '数量未知', 'Count unknown', '数量不明')}`;
  return `${scope} ${progress.completed} / ${knownTotal ? progress.total : pick(locale, '总量未知', 'total unknown', '総数不明')}`;
}
