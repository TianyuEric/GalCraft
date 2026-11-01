import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerHost } from '@galcraft/contracts';
import { createAudioBufferLoader } from './bootstrap.js';

afterEach(() => vi.unstubAllGlobals());

function setup(bytes = 1024, entries = 4) {
  const release = vi.fn();
  const resolve = vi.fn(async (assetId: string, variantId: string) => ({ ok: true, value: { uri: `${assetId}/${variantId}`, release } }));
  const decodeAudioData = vi.fn(async () => ({ length: 16, numberOfChannels: 2 }) as AudioBuffer);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
  const loader = createAudioBufferLoader({ decodeAudioData } as unknown as AudioContext, { resolve } as unknown as PlayerHost['resources'], bytes, entries);
  return { loader, resolve, release, decodeAudioData };
}

describe('mounted Player audio decode reuse', () => {
  it('shares concurrent and subsequent BGM reads for one exact asset and variant', async () => {
    const { loader, resolve, release, decodeAudioData } = setup();
    const [first, repeated] = await Promise.all([loader.load('Music01', 'Normal01'), loader.load('Music01', 'Normal01')]);
    expect(first).toBe(repeated); expect(await loader.load('Music01', 'Normal01')).toBe(first);
    expect(resolve).toHaveBeenCalledTimes(1); expect(decodeAudioData).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
    await loader.load('Music01', 'Variant2'); expect(decodeAudioData).toHaveBeenCalledTimes(2);
  });

  it('retries failed decoding and releases each resolved location', async () => {
    const { loader, release, decodeAudioData } = setup();
    decodeAudioData.mockRejectedValueOnce(new Error('decode failed'));
    await expect(loader.load('Music01', 'Normal01')).rejects.toThrow('decode failed');
    await expect(loader.load('Music01', 'Normal01')).resolves.toBeDefined();
    expect(decodeAudioData).toHaveBeenCalledTimes(2); expect(release).toHaveBeenCalledTimes(2);
  });

  it('bounds decoded memory, evicts least recently used entries and clears on disposal', async () => {
    const { loader, decodeAudioData } = setup(256, 4);
    await loader.load('Music01', 'Normal01'); await loader.load('Music02', 'Normal01');
    await loader.load('Music01', 'Normal01'); await loader.load('Music03', 'Normal01');
    await loader.load('Music01', 'Normal01'); expect(decodeAudioData).toHaveBeenCalledTimes(3);
    await loader.load('Music02', 'Normal01'); expect(decodeAudioData).toHaveBeenCalledTimes(4);
    loader.clear(); await loader.load('Music02', 'Normal01'); expect(decodeAudioData).toHaveBeenCalledTimes(5);
  });
});
