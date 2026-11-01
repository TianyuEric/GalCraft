import { issueDetails, localizeIssue, type Diagnostic } from '@galcraft/contracts';
import { X } from 'lucide-react';
import { Button } from './controls.js';
import './issue-notice.css';

export function IssueNotice({ issue, locale, dismiss, recovery }: { issue: Diagnostic; locale: string; dismiss?(): void; recovery?: { label: string; run(): void } }) {
  const details = locale === 'en' ? 'Diagnostic details' : locale === 'ja' ? '診断の詳細' : '诊断详情';
  const explanation = localizeIssue(issue, locale);
  return <div className="gc-issue-notice" data-severity={issue.severity ?? 'error'}>
    <div className="gc-issue-heading"><p role={issue.severity === 'info' ? 'status' : 'alert'}>{explanation}</p>
      {dismiss && <Button tone="quiet" className="gc-issue-dismiss" aria-label={locale === 'en' ? 'Dismiss notification' : locale === 'ja' ? '通知を閉じる' : '关闭提示'} onClick={dismiss}><X/></Button>}</div>
    {(issue.severity === undefined || issue.severity === 'error') && explanation !== issue.message && <p className="gc-issue-reason">{issue.message}</p>}
    {recovery && <Button onClick={recovery.run}>{recovery.label}</Button>}
    <details><summary>{details}</summary><pre>{issueDetails(issue)}</pre></details>
  </div>;
}
