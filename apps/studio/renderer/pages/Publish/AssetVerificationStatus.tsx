import type { AssetVerificationProgress } from '@galcraft/contracts';
import { Progress } from '../../components/ui/progress.js';

export function AssetVerificationStatus({ progress, locale }: { progress: AssetVerificationProgress | null; locale: string }) {
  if (!progress) return null;
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const labels = { preparing: t('准备验证', 'Preparing verification', '検証を準備'), checking: t('验证素材版本', 'Checking asset versions', '素材バージョンを検証'), applying: t('更新验证结果', 'Applying verification results', '検証結果を適用'), complete: t('验证完成 · 请审阅保存', 'Verification complete · review and save', '検証完了・確認して保存'), failed: t('验证未完成', 'Verification incomplete', '検証未完了') };
  const { completed, total, issueCount, phase } = progress;
  return <div className="publish-verification-progress" role="status" aria-live="polite">
    <strong>{labels[phase]}</strong>
    <Progress aria-label={t('目标素材版本验证进度', 'Target asset version verification', '対象素材バージョンの検証進捗')} aria-valuetext={`${labels[phase]}${total === null ? '' : ` · ${completed}/${total}`}`} value={phase === 'preparing' || total === null ? null : total === 0 ? phase === 'complete' ? 100 : 0 : completed / total * 100}/>
    {total !== null && <p>{total === 0 ? t('本次没有待执行版本', 'No versions to check', '検証対象のバージョンはありません') : t(`已检查 ${completed}/${total} 个版本 · ${issueCount} 项问题`, `Checked ${completed}/${total} versions · ${issueCount} issues`, `${completed}/${total} バージョンを検証・問題 ${issueCount} 件`)}</p>}
    {progress.name && phase === 'checking' && <p>{progress.name}</p>}
    {progress.message && <p role="alert">{progress.message}</p>}
  </div>;
}
