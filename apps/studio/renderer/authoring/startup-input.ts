export type StartupNumberOptions = { max?: number; step?: number; nullable?: boolean; end?: number | null; start?: number; total?: number; beforeTotal?: boolean };

export function parseStartupNumber(raw: string, options: StartupNumberOptions = {}): number | null | undefined {
  const next = raw === '' && options.nullable ? null : raw === '' ? NaN : Number(raw);
  if (next === null) return next;
  if (!Number.isFinite(next) || next < 0 || options.max !== undefined && next > options.max
    || (options.step ?? 1) === 1 && !Number.isInteger(next)
    || options.total !== undefined && (options.beforeTotal ? next >= options.total : next > options.total)
    || options.start !== undefined && next <= options.start
    || options.end !== undefined && options.end !== null && next >= options.end) return undefined;
  return next;
}

export const volumePercent = (volume: number) => Number((volume * 100).toFixed(6));
