import type { Issue, Result } from '@galcraft/contracts';

export const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
export function fail<T>(code: string, message: string, actions: Issue['actions'] = ['retry']): Result<T> {
  const error: Issue = { code, severity: 'error', message, owner: 'M06', related: [], actions };
  return { ok: false, error, issues: [error] };
}
export const copy = <T>(value: T): T => structuredClone(value);
export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
