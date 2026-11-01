import type { Json, Result } from '@galcraft/contracts';
export type ExternalRuntimeDescriptor = { url: string; expected: Json };
/** Hosts resolve already prepared external files. A plugin can access only its declared keys. */
export function createRuntimeDependencyAccess<T extends ExternalRuntimeDescriptor>(declarations: readonly string[], resolve: (key: string) => Promise<Result<T>>) {
  const lookup = (key: string): Promise<Result<T>> => {
    if (declarations.includes(key)) return resolve(key);
    const error = { code: 'RUNTIME_DEPENDENCY_UNDECLARED', message: `Undeclared external runtime dependency: ${key}`,
      severity: 'error' as const, owner: 'M09' as const, related: [], actions: ['supplyDependency' as const] };
    return Promise.resolve({ ok: false, error, issues: [error] });
  };
  return { resolve: lookup, load: async (key: string): Promise<Result<T & { module: Record<string, unknown> }>> => {
    const resolved = await lookup(key); if (!resolved.ok) return resolved;
    try { return { ok: true, value: { ...resolved.value, module: await import(/* @vite-ignore */ resolved.value.url) }, warnings: resolved.warnings }; }
    catch (error) {
      if ('release' in resolved.value && typeof resolved.value.release === 'function') resolved.value.release();
      const issue = { code: 'RUNTIME_DEPENDENCY_LOAD', message: `${key}: ${String(error)}`, severity: 'error' as const,
        owner: 'M06' as const, related: [], actions: ['supplyDependency' as const] };
      return { ok: false, error: issue, issues: [issue] };
    }
  } };
}
