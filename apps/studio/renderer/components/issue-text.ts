import { localizeIssue, type Diagnostic } from '@galcraft/contracts';
/** Product explanation; technical and provider details are rendered separately by IssueNotice. */
export function issueText(issue: Diagnostic, locale: string): string { return localizeIssue(issue, locale); }
