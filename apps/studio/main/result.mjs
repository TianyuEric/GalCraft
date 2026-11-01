import { enrichIssue, IssueSchema, JsonSchema } from '@galcraft/contracts';
/** @template T @param {T} value @returns {import('@galcraft/contracts').Result<T>} */
export function ok(value) { return { ok: true, value, warnings: [] }; }

/** @param {string} code @param {string} message @param {import('@galcraft/contracts').Issue['owner']} owner @param {import('@galcraft/contracts').Issue['actions']} actions @returns {Extract<import('@galcraft/contracts').Result<never>, {ok: false}>} */
export function fail(code, message, owner = 'M01', actions = ['retry']) {
  const error = enrichIssue({ code, severity: /** @type {const} */ ('error'), message, owner, related: [], actions });
  return { ok: false, error, issues: [error] };
}

/** @param {unknown} error @param {import('@galcraft/contracts').Issue['owner']} owner */
export function fromError(error, owner = 'M01') {
  const direct = IssueSchema.safeParse(error);
  const nested = error && typeof error === 'object' && 'issue' in error ? IssueSchema.safeParse(error.issue) : null;
  const issue = direct.success ? direct.data : nested?.success ? nested.data : null;
  if (issue) { const preserved = enrichIssue(issue); return { ok: /** @type {const} */ (false), error: preserved, issues: [preserved] }; }
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  const result = fail(error && typeof error === 'object' && 'code' in error ? String(error.code) : 'HOST_IO', message, owner);
  const details = JsonSchema.safeParse(error);
  if (details.success) result.error.details = details.data;
  return result;
}
