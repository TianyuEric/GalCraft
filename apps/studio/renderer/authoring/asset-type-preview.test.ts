import { afterEach, expect, it, vi } from 'vitest';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import { previewResource } from './asset-type-preview.js';

afterEach(() => vi.unstubAllGlobals());
it('reads only declared files from the selected variant root and propagates its cancellation signal', async () => {
  const variant = structuredClone(FixtureAsset.variants[0]!); variant.entry = 'models/source.shape.json';
  variant.files = [{ path: variant.entry, bytes: 3, mime: 'application/json', role: 'entry' }];
  const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))); vi.stubGlobal('fetch', fetch);
  const abort = new AbortController(), resource = previewResource('galcraft-resource://project/asset/version/models/source.shape.json', variant, abort.signal);
  expect(resource.root).toBe('galcraft-resource://project/asset/version/'); expect([...await resource.read(variant.entry)]).toEqual([1, 2, 3]);
  expect(fetch).toHaveBeenCalledWith('galcraft-resource://project/asset/version/models/source.shape.json', { signal: abort.signal });
  await expect(resource.read('../other.json')).rejects.toThrow('Undeclared asset file'); expect(fetch).toHaveBeenCalledTimes(1);
});
