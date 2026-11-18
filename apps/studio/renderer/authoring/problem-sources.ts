import type { AssetImportBatch, Issue, Json } from '@galcraft/contracts';
import type { ProductionProblemSnapshot } from '@galcraft/authoring/production';
import type { WorkbenchProblem } from './problems.js';

const copy = {
  zh: { import: '资源导入', openImport: '查看导入结果', openTask: '查看制作任务',
    importSummary: (count: number) => `本批 ${count} 项未导入`, taskSummary: (count: number) => `${count} 项制作未完成` },
  en: { import: 'Asset import', openImport: 'Open import results', openTask: 'Open task',
    importSummary: (count: number) => `${count} ${count === 1 ? 'item was' : 'items were'} not imported in this batch`,
    taskSummary: (count: number) => `${count} production ${count === 1 ? 'item is' : 'items are'} incomplete` },
  ja: { import: '素材インポート', openImport: 'インポート結果を開く', openTask: '制作タスクを開く',
    importSummary: (count: number) => `今回の ${count} 件をインポートできませんでした`, taskSummary: (count: number) => `${count} 件の制作が未完了です` },
};
const textFor = (locale: string) => copy[locale.startsWith('en') ? 'en' : locale.startsWith('ja') ? 'ja' : 'zh'];
const worstIssue = (issues: Issue[]) => issues.find(issue => issue.severity === 'error') ?? issues.find(issue => issue.severity === 'warning');

/** Keep the representative provider cause and the complete source context separate from the row summary. */
function withContext(issue: Issue, context: Record<string, unknown>): Issue {
  return { ...structuredClone(issue), details: structuredClone({ originalIssue: issue, ...context }) as Json };
}

export function importBatchProblems(batches: AssetImportBatch[], ignored: ReadonlySet<string>, locale: string, open: (batchId: string) => void): WorkbenchProblem[] {
  const text = textFor(locale);
  return batches.flatMap(batch => {
    const failures = batch.failed.filter(item => item.issue.severity !== 'info');
    const issue = worstIssue(failures.map(item => item.issue));
    if (!issue) return [];
    const attempt = batch.attempts.at(-1), attemptId = attempt?.id ?? batch.id;
    const key = `import:${batch.id}:${attemptId}`;
    const createdAt = new Date(batch.createdAt);
    const date = Number.isNaN(createdAt.getTime()) ? '' : createdAt.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return [{
      id: `import:${batch.id}`, group: date ? `${text.import} · ${date}` : text.import,
      summary: text.importSummary(failures.length), attemptKeys: [key], ignored: ignored.has(key),
      issue: withContext(issue, { projectId: batch.projectId, batchId: batch.id, revision: batch.revision, attemptId, failures: batch.failed }),
      action: { label: text.openImport, run: () => open(batch.id) },
    }];
  });
}

export function productionTaskProblems(snapshot: ProductionProblemSnapshot | null, ignored: ReadonlySet<string>, locale: string, openTask: (taskId: string) => void): WorkbenchProblem[] {
  if (!snapshot) return [];
  const text = textFor(locale);
  return snapshot.tasks.flatMap(task => {
    const failures = task.failures.filter(item => item.issues.some(issue => issue.severity !== 'info'));
    const keyFor = (item: typeof failures[number]) => `production:${task.id}:${item.itemId}:${item.attemptId}`;
    return [false, true].flatMap(isIgnored => {
      const subset = failures.filter(item => ignored.has(keyFor(item)) === isIgnored);
      const issue = worstIssue(subset.flatMap(item => item.issues));
      if (!issue) return [];
      return [{
        id: `production:${task.id}${isIgnored ? ':ignored' : ''}`, group: task.name,
        summary: text.taskSummary(subset.length), attemptKeys: subset.map(keyFor), ignored: isIgnored,
        issue: withContext(issue, { projectId: snapshot.projectId, taskId: task.id, revision: task.revision, failures: subset }),
        action: { label: text.openTask, run: () => openTask(task.id) },
      }];
    });
  });
}

/** The next complete list owns membership; only an older revision of a listed task keeps its prior projection. */
export function mergeProductionProblems(previous: ProductionProblemSnapshot | null, next: ProductionProblemSnapshot): ProductionProblemSnapshot {
  if (!previous || previous.projectId !== next.projectId) return next;
  const prior = new Map(previous.tasks.map(task => [task.id, task]));
  return { ...next, tasks: next.tasks.map(task => {
    const current = prior.get(task.id);
    return current && current.revision > task.revision ? current : task;
  }) };
}
