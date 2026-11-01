import { describe, expect, it } from 'vitest';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modelPath, normalizedTensor, prepareModel, toolManifest, resizeMask } from './matting.mjs';

describe('BiRefNet input', () => {
  it('keeps a portrait mask single-channel and preserves its spatial axes', async () => {
    const mask = await resizeMask(Buffer.from(Array.from({ length: 16 }, (_, i) => i % 4 < 2 ? 0 : 255)), 4, 4, 4, 8);
    expect(mask).toHaveLength(32);
    for (let row = 0; row < 8; row++) { expect(mask[row * 4]).toBe(0); expect(mask[row * 4 + 3]).toBe(255); }
  });
  it('uses RGB float32 NCHW normalization for the pinned model', () => {
    const rgb = Buffer.alloc(1024 * 1024 * 3);
    rgb[0] = 255;
    rgb[1] = 128;
    rgb[2] = 0;
    const tensor = normalizedTensor(rgb);
    const pixels = 1024 * 1024;
    expect(tensor.length).toBe(3 * pixels);
    expect(tensor[0]).toBeCloseTo((1 - 0.485) / 0.229);
    expect(tensor[pixels]).toBeCloseTo((128 / 255 - 0.456) / 0.224);
    expect(tensor[2 * pixels]).toBeCloseTo((0 - 0.406) / 0.225);
    expect(toolManifest.modelFile).toBe('BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx');
  });
});

describe('model preparation', () => {
  it('reports download progress and rejects an unusable model before marking it ready', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galcraft-matting-'));
    const payload = Buffer.alloc(2 * 1024 * 1024 + 128);
    const previousFetch = globalThis.fetch;
    const states = [];
    globalThis.fetch = async () => new Response(payload, {
      status: 200, headers: { 'content-length': String(payload.length) },
    });
    try {
      await expect(prepareModel(directory, { onState: state => states.push(state) })).rejects.toThrow();
      expect(states.some(state => state.state === 'downloading' && state.bytes >= 1024 * 1024 &&
        state.totalBytes === payload.length)).toBe(true);
      expect(states.at(-1).state).toBe('verifying');
      await expect(stat(modelPath(directory))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      globalThis.fetch = previousFetch;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
