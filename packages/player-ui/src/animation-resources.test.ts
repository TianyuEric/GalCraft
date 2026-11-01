import { describe, expect, it } from 'vitest';
import { FixtureIds, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import type { PlayerHost } from '@galcraft/contracts';
import { animationResourceReader } from './animation-resources.js';

describe('locked animation resource reader', () => {
  it('reads real JSON bytes at the snapshot version and releases the acquired location once', async () => {
    const snapshot = structuredClone(FixtureSnapshot), asset = { ...snapshot.assets[0]!, kind: 'animation' as const };
    snapshot.assets = [asset]; let released = 0; const requested: unknown[] = [];
    const content = { type: 'galcraft.animation', version: 1, durationMs: 100, parameters: { distance: 25 },
      tracks: [{ path: '/x', mode: 'add', keyframes: [{ timeMs: 100, value: { parameter: 'distance' } }] }] };
    const resources: PlayerHost['resources'] = { resolve: async (...ids) => { requested.push(ids); return { ok: true as const, warnings: [],
      value: { uri: `data:application/json,${encodeURIComponent(JSON.stringify(content))}`, mime: 'application/json', bytes: JSON.stringify(content).length,
        rangeSupported: false, release: () => { released++; } } }; } };
    const result = await animationResourceReader(snapshot, resources)(asset.assetId, { distance: 100 });
    expect(result.ok).toBe(true); if (!result.ok) throw result.error;
    expect(result.value).toMatchObject({ type: 'galcraft.animation', tracks: [{ path: '/x', mode: 'add', keyframes: [{ value: 100 }] }] });
    expect(requested).toEqual([[asset.assetId, asset.variantId]]); expect(released).toBe(1);
    const missing = await animationResourceReader(snapshot, resources)(FixtureIds.session, {});
    expect(missing.ok).toBe(false); expect(released).toBe(1);
  });
});
