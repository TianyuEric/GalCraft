import type { Issue, Result } from '@galcraft/contracts';

export function issue(code: string, message: string, actions: Issue['actions'] = ['edit']): Issue {
  return { code, message, severity: 'error', owner: 'M10', related: [], actions };
}
export function ok<T>(value: T): Result<T> { return { ok: true, value, warnings: [] }; }
export function fail<T>(code: string, message: string, actions?: Issue['actions']): Result<T> {
  const error = issue(code, message, actions);
  return { ok: false, error, issues: [error] };
}
