import { expect, it, vi } from 'vitest';
import { decodeMountedImage } from './resource-image.js';

it('waits for decoding on the mounted image before granting readiness', async () => {
  let decoded!: () => void;
  const element = { complete: true, naturalWidth: 1920, decode: vi.fn(() => new Promise<void>(resolve => { decoded = resolve; })) };
  let ready = false;
  const pending = decodeMountedImage(element as unknown as HTMLImageElement).then(() => { ready = true; });
  await Promise.resolve(); expect(ready).toBe(false); expect(element.decode).toHaveBeenCalledTimes(1);
  decoded(); await pending; expect(ready).toBe(true);
});

it('rejects a broken or incomplete actual image instead of granting readiness', async () => {
  await expect(decodeMountedImage({ decode: async () => {}, complete: false, naturalWidth: 1920 } as unknown as HTMLImageElement)).rejects.toThrow('图片未完整加载');
  await expect(decodeMountedImage({ decode: async () => {}, complete: true, naturalWidth: 0 } as unknown as HTMLImageElement)).rejects.toThrow('图片未完整加载');
});
