import { afterEach, expect, test, vi } from 'vitest';
import { PreviewHost } from './preview-host.js';

afterEach(() => vi.unstubAllGlobals());

test('preview forwards focus lifecycle and releases the subscription', () => {
  const windowEvents = new EventTarget();
  vi.stubGlobal('window', windowEvents);
  const host = new PreviewHost({ kind: 'playtest', projectId: 'project', instance: 'playtest' }, {} as never, {} as HTMLElement);
  const listener = vi.fn();
  const release = host.subscribeLifecycle(listener);
  windowEvents.dispatchEvent(new Event('blur'));
  windowEvents.dispatchEvent(new Event('focus'));
  expect(listener.mock.calls.map(([event]) => event.type)).toEqual(['blur', 'focus']);
  release();
  windowEvents.dispatchEvent(new Event('blur'));
  expect(listener).toHaveBeenCalledTimes(2);
});
