import { expect, it } from 'vitest';
import { fromError } from './result.mjs';
import { DiagnosticError, IssueSchema } from '@galcraft/contracts';
it('preserves structured diagnostics when a real host boundary receives an issue or a diagnostic exception', () => {
  const original = { code: 'COMFY_EXECUTION', severity: 'error', message: '原始错误', summary: 'A provider node failed.', messageKey: 'diagnostic.service.execution', messageParams: { object: '雨站来信.png' }, details: { traceback: ['node failed'] }, owner: 'M10', related: [], actions: ['retry'] };
  for (const value of [original, new DiagnosticError(IssueSchema.parse(original))]) {
    const result = fromError(value);
    expect(result).toMatchObject({ ok: false, error: original, issues: [original] });
  }
});
it('keeps an unknown provider JSON response intact for expandable details', () => {
  const source = { code: 'THIRD_PARTY_ERROR', message: 'Original provider response', status: 503, body: { reason: 'maintenance' } };
  expect(fromError(source)).toMatchObject({ ok: false, error: { code: source.code, message: source.message, details: source } });
});
