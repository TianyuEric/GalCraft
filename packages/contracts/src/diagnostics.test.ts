import { describe, expect, it } from 'vitest';
import { IssueSchema, resultSchema } from './common.js';
import { z } from 'zod';
import { DiagnosticError, enrichIssue, issueDetails, issueFromError, issueSummary, localizeIssue } from './diagnostics.js';

describe('structured diagnostic language', () => {
  it('shows exact unknown provider warning/info and preserves the complete Issue', () => {
    for (const severity of ['warning', 'info'] as const) {
      const issue = enrichIssue({ code: 'PROVIDER_NOTE', severity, owner: 'M09' as const, message: 'Missing ending: add an end with endingId.', related: [], actions: ['edit' as const], summary: 'Provider summary' });
      for (const locale of ['zh-CN', 'en', 'ja']) expect(localizeIssue(issue, locale)).toBe(issue.message);
      expect(JSON.parse(issueDetails(issue))).toEqual(issue);
    }
    for (const code of ['GALLERY_ENDING_REQUIRED', 'STEAM_APP_ID']) {
      for (const locale of ['zh-CN', 'en', 'ja']) expect(localizeIssue(enrichIssue({ code, message: 'original', severity: 'warning' }), locale)).not.toMatch(/操作未完成|could not finish|操作を完了/);
    }
  });
  it('preserves provider detail, source identity and recovery across JSON and Result validation', () => {
    const original = { code: 'COMFY_EXECUTION', severity: 'error' as const, owner: 'M10' as const, message: '原始提供方异常', messageParams: { object: '雨站来信.png', count: 2 }, details: { nodeId: '42', traceback: ['原始堆栈', 'RuntimeError: missing model'] }, entity: { kind: 'task' as const, id: 'TaskAA' }, related: [], actions: ['retry' as const] };
    const issue = enrichIssue(original), result = resultSchema(z.null()).parse(JSON.parse(JSON.stringify({ ok: false, error: issue, issues: [issue] })));
    expect(result).toMatchObject({ ok: false, error: { ...original, messageKey: 'diagnostic.service.execution' } });
    if (result.ok) throw Error('Expected failure');
    expect(issueSummary(result.error)).toContain('execution failure');
    expect(issueSummary(result.error)).not.toContain('原始提供方异常');
    for (const locale of ['zh-CN', 'en', 'ja']) expect(localizeIssue(result.error, locale)).toContain('雨站来信.png');
    expect(localizeIssue(result.error, 'en')).not.toContain('原始提供方异常');
    expect(issueDetails(result.error)).toContain('原始堆栈');
    expect(issueFromError(new DiagnosticError(result.error))).toEqual(result.error);
  });
  it('keeps unknown provider text in expandable details and uses product locale fallback', () => {
    const unknown = enrichIssue({ code: 'THIRD_PARTY_FAILURE', message: '提供方の原文', severity: 'error' as const, owner: 'M04' as const, related: [], actions: [] });
    expect(IssueSchema.parse(unknown)).toEqual(unknown);
    expect(localizeIssue(unknown, 'en-US')).toContain('Expand the diagnostic details');
    expect(localizeIssue(unknown, 'ja')).toContain('診断の詳細');
    expect(localizeIssue(unknown, 'zh-CN')).toContain('诊断详情');
    expect(issueDetails(unknown)).toContain('提供方の原文');
  });
});
