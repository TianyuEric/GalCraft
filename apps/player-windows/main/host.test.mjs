import { describe, expect, it } from 'vitest';
import { WindowsPlayerHost } from './host.mjs';

describe('Windows Player host', () => {
  it('resolves and releases registered resources through a serializable location', async () => {
    let released = 0;
    const host = new WindowsPlayerHost({
      window: {}, dialog: {},
      assetProvider: { resolve: async () => ({ path: process.execPath, mime: 'application/octet-stream' }) },
      resourceRegistry: { register: () => ({ uri: 'galcraft-resource://project/asset/variant/file', release: () => { released += 1; } }) },
    });
    const result = await host.call('resources', 'resolve', 'asset', 'variant');
    expect(result.ok).toBe(true);
    expect(result.value.rangeSupported).toBe(true);
    expect(result.value.bytes).toBeGreaterThan(0);
    await host.call('resources', 'release', result.value.token);
    host.releaseAll();
    expect(released).toBe(1);
  });

  it('does not report unconnected storage as committed', async () => {
    const host = new WindowsPlayerHost({ window: {}, dialog: {} });
    expect((await host.call('storage', 'read', 'save')).error.code).toBe('STORAGE_PROVIDER_UNAVAILABLE');
  });

  it('routes the public close and platform operations to their host providers', async () => {
    let closed = false;
    const host = new WindowsPlayerHost({ window: {}, dialog: {},
      requestClose: async () => { closed = true; return { ok: true, value: undefined, warnings: [] }; },
      platformProvider: async (name, args) => ({ ok: true, value: { name, args }, warnings: [] }),
    });
    expect((await host.call('host', 'platform', 'example.platform/service:unlock', { id: 'first' })).value)
      .toEqual({ name: 'example.platform/service:unlock', args: { id: 'first' } });
    expect((await host.call('host', 'close')).ok).toBe(true);
    expect(closed).toBe(true);
  });
});
