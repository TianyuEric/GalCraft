import type { Issue, Target, WorkspaceResume } from '@galcraft/contracts';
import { Button } from '../components/controls.js';
import { IssueNotice } from '../components/issue-notice.js';
import type { StudioLocale } from './controller.js';
import { tr } from '../pages/Production/Production.js';
import './studio-output.css';

export type OutputState = NonNullable<NonNullable<WorkspaceResume['workbench']>['output']>;
export type OutputFailure = { kind: 'save' | 'build'; id: string; issue?: Issue; cancelled: boolean; target?: Target };

export function StudioOutput({ locale, output, failure, pendingBuild, openDocument, openPublish, openInstructions, restoreLatest }: {
  locale: StudioLocale;
  output: OutputState;
  failure?: OutputFailure;
  pendingBuild?: string;
  openDocument(id: string): void;
  openPublish(): void;
  openInstructions?(id: string): void;
  restoreLatest?(): void;
}) {
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
  const { saved, built } = output;
  return <section className="studio-output" aria-label={t('输出', 'Output', '出力')}>
    {pendingBuild && <div className="studio-output-row" role="status">
      <strong>{t('正在构建', 'Building', 'ビルド中')}</strong><code>{pendingBuild}</code>
    </div>}
    {failure && <div className="studio-output-row" data-output="failure" tabIndex={-1} role={failure.cancelled ? 'status' : 'alert'}>
      <strong>{failure.kind === 'save'
        ? t('保存失败', 'Save failed', '保存に失敗')
        : failure.cancelled ? t('构建已取消', 'Build cancelled', 'ビルドを取り消しました') : t('构建失败', 'Build failed', 'ビルドに失敗')}</strong>
      <code>{failure.id}{failure.target ? ` · ${failure.target}` : ''}</code>
      {failure.issue && <IssueNotice issue={failure.issue} locale={locale} />}
      <div className="studio-output-actions">
        {failure.kind === 'build' && <Button tone="quiet" onClick={openPublish}>{t('前往发布处理', 'Open Publish', '配布で対応')}</Button>}
        {restoreLatest && <Button tone="quiet" onClick={restoreLatest}>{t('返回最近输出', 'Return to latest output', '最新の出力に戻る')}</Button>}
      </div>
    </div>}
    {!saved && !built && !failure && !pendingBuild && <p className="studio-output-empty">{t('保存作品或完成本地构建后，回执会显示在这里。', 'Save the project or complete a local build to see its receipt here.', '作品の保存やローカルビルドが完了すると、結果がここに表示されます。')}</p>}
    {saved && <div className="studio-output-row" data-output="save">
      <strong>{t('最近一次保存', 'Last save', '前回の保存')}</strong>
      <code>{saved.receipt.transactionId}</code>
      <p>{t(`已保存 ${saved.receipt.saved.length} 个文档 · 剩余 ${saved.receipt.remainingDirty.length} 个未保存`, `${saved.receipt.saved.length} documents saved · ${saved.receipt.remainingDirty.length} still unsaved`, `${saved.receipt.saved.length} 件を保存 · ${saved.receipt.remainingDirty.length} 件が未保存`)}</p>
      <div className="studio-output-actions">{saved.source && <Button tone="quiet" onClick={() => openDocument(saved.source!)}>{t('返回保存来源', 'Go to save source', '保存元へ移動')}</Button>}</div>
    </div>}
    {built && <div className="studio-output-row" data-output="build">
      <strong>{t('最近一次成功构建', 'Last successful build', '前回成功したビルド')}</strong>
      <code>{built.planId} · {built.receipt.target} · {built.receipt.releaseVersion}</code>
      <p className="studio-output-path"><code>{built.receipt.entry}</code></p>
      <div className="studio-output-actions">
        <Button tone="quiet" onClick={openPublish}>{t('返回发布', 'Go to Publish', '配布へ移動')}</Button>
        {openInstructions && <Button tone="quiet" onClick={() => openInstructions(built.planId)}>{t('打开交付说明', 'Open handoff instructions', '引き渡し手順を開く')}</Button>}
        <Button tone="quiet" onClick={() => void navigator.clipboard.writeText(built.receipt.entry)}>{t('复制入口路径', 'Copy entry path', '起動パスをコピー')}</Button>
      </div>
    </div>}
  </section>;
}
