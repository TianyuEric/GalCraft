import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadReleaseFonts } from './fonts.js';

afterEach(() => vi.unstubAllGlobals());

describe('release font preparation', () => {
  function setup(subsets = true) {
    const faces: { family: string; load: ReturnType<typeof vi.fn> }[] = [];
    const registered = new Set<unknown>();
    vi.stubGlobal('FontFace', class {
      load = vi.fn(async () => this);
      constructor(readonly family: string, readonly source: string) { faces.push(this); }
    });
    vi.stubGlobal('document', { fonts: { add: (font: unknown) => registered.add(font), delete: (font: unknown) => registered.delete(font) } });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ fallbackAssetId: null, faces: [
      { family: 'SC', language: 'zh-CN', assetId: null, fullPath: 'full.otf', ...(subsets ? { subset: { family: 'Static', path: 'small.otf' } } : {}) },
      { family: 'Asset', language: null, assetId: 'FontAA', fullPath: 'full.otf', ...(subsets ? { subset: { family: 'Static', path: 'small.otf' } } : {}) },
    ] }) })));
    const properties = new Map<string, string>();
    const root = { style: { setProperty: (key: string, value: string) => properties.set(key, value) } } as unknown as HTMLElement;
    return { faces, registered, properties, root };
  }

  it('loads each shared subset once and registers complete fonts as lazy fallbacks', async () => {
    const { faces, registered, properties, root } = setup();
    const dispose = await loadReleaseFonts(root, new URL('https://example.test/game/'));
    expect(faces.filter(face => face.load.mock.calls.length).map(face => face.family)).toEqual(['Static']);
    expect(registered.size).toBe(3);
    expect(properties.get('--gc-font-FontAA')).toContain('"Static", "Asset"');
    dispose(); expect(registered.size).toBe(0);
  });

  it('loads complete faces when the release chooses full fonts', async () => {
    const { faces, root } = setup(false);
    await loadReleaseFonts(root, new URL('https://example.test/'));
    expect(faces.every(face => face.load.mock.calls.length === 1)).toBe(true);
  });

  it('removes registered faces after a required font fails', async () => {
    const { registered, root } = setup();
    vi.stubGlobal('FontFace', class { load = vi.fn(async () => { throw new Error('Font unavailable'); }); });
    await expect(loadReleaseFonts(root, new URL('https://example.test/'))).rejects.toThrow('Font unavailable');
    expect(registered.size).toBe(0);
  });
});
