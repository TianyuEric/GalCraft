import { expect, it, vi } from 'vitest';
import { waitForTitleFrame } from './title-media.js';

function video() {
  let callback!: () => void;
  const element = Object.assign(new EventTarget(), { readyState: 1, seeking: false, currentTime: 0,
    requestVideoFrameCallback: vi.fn((next: () => void) => { callback = next; return 1; }), cancelVideoFrameCallback: vi.fn() });
  return { element, frame: () => callback(), target: element as unknown as HTMLVideoElement };
}

it('requires the mounted video to present the selected first frame after seeking', async () => {
  const { element, frame, target } = video(); let ready = false;
  const pending = waitForTitleFrame(target, 5, new AbortController().signal).then(() => { ready = true; });
  element.readyState = 2; element.seeking = true; element.currentTime = 5; frame();
  await Promise.resolve(); expect(ready).toBe(false);
  element.seeking = false; element.dispatchEvent(new Event('seeked'));
  await Promise.resolve(); expect(ready).toBe(false);
  frame(); await pending; expect(ready).toBe(true);
});

it('cancels an obsolete frame receipt before the next title can publish readiness', async () => {
  const { element, target } = video(), lifetime = new AbortController();
  const pending = waitForTitleFrame(target, 0, lifetime.signal);
  lifetime.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(element.cancelVideoFrameCallback).toHaveBeenCalledWith(1);
});
