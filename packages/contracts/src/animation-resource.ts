import { NativeAnimationSchema } from './animation.js';
import { SegmentSchema } from './presentation.js';
import type { NativeAnimation } from './animation.js';
import type { Segment } from './presentation.js';
import type { Result } from './common.js';
const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function fail<T>(code: string, message: string, actions: ('locate')[]): Result<T> {
  const error = { code, message, severity: 'error' as const, owner: 'M04' as const, related: [], actions };
  return { ok: false, error, issues: [error] };
}

export type ExecutableAnimation = NativeAnimation | Segment[];
/** Parameter references are data leaves: {parameter: 'distance'}. They never execute expressions. */
export function parseAnimationResource(raw: unknown, parameters: Record<string, unknown> = {}): Result<ExecutableAnimation> {
  try {
    const source = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
    const envelope = record(source), defaults = record(envelope.parameters);
    const values = { ...defaults, ...parameters };
    const substitute = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(substitute);
      if (value !== null && typeof value === 'object') {
        const object = record(value);
        if (Object.keys(object).length === 1 && typeof object.parameter === 'string') {
          if (!Object.hasOwn(values, object.parameter)) throw new Error(`Missing animation parameter ${object.parameter}`);
          return values[object.parameter];
        }
        return Object.fromEntries(Object.entries(object).filter(([key]) => key !== 'parameters').map(([key, child]) => [key, substitute(child)]));
      }
      return value;
    };
    const resolved = substitute(source);
    const segments = Array.isArray(resolved) ? resolved : record(resolved).segments;
    if (segments !== undefined) {
      const checked = SegmentSchema.array().min(1).safeParse(segments);
      return checked.success ? ok(checked.data) : fail('ANIMATION_RESOURCE_SCHEMA', checked.error.message, ['locate']);
    }
    const checked = NativeAnimationSchema.safeParse(resolved);
    return checked.success ? ok(checked.data) : fail('ANIMATION_RESOURCE_SCHEMA', checked.error.message, ['locate']);
  } catch (error) { return fail('ANIMATION_RESOURCE_SCHEMA', String(error), ['locate']); }
}
