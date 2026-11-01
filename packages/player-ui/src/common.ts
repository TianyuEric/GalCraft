import type { Issue, Result } from '@galcraft/contracts';
import { enrichIssue } from '@galcraft/contracts';

export const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
export const problem = (code: string, message: string, actions: Issue['actions'] = ['retry']): Issue =>
  enrichIssue({ code, message, severity: 'error', owner: 'M07', related: [], actions });
export const fail = <T>(code: string, message: string, actions?: Issue['actions']): Result<T> => {
  const error = problem(code, message, actions);
  return { ok: false, error, issues: [error] };
};
export const clone = <T>(value: T): T => structuredClone(value);
