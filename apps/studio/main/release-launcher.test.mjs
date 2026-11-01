import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const state = vi.hoisted(() => ({ windows: [], closed: 0, failure: false }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return { BrowserWindow: class extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false; this.loaded = false; this.contents = new EventEmitter();
      this.contents.debugger = { attach: vi.fn(), sendCommand: vi.fn(async () => { if (!this.loaded) throw new Error('Load the validation document before enabling virtual focus'); }), isAttached: () => true, detach: vi.fn() };
      this.contents.startPainting = vi.fn(); this.contents.session = { webRequest: { onBeforeRequest() {} } };
      this.contents.executeJavaScript = vi.fn(async () => { if (state.failure) throw new Error('Actual Player validation failed'); return {}; });
      this.contents.invalidate = () => queueMicrotask(() => this.contents.emit('paint'));
      this.contents.capturePage = vi.fn(async () => ({ toPNG: () => Buffer.from('actual capture') }));
      state.windows.push(this);
    }
    get webContents() { return this.contents; }
    async loadURL() { this.loaded = true; }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  } };
});
vi.mock('./release-server.mjs', () => ({ serveRelease: async () => ({ url: 'http://127.0.0.1:1234/', close: async () => { state.closed++; } }) }));
import { releaseLauncher } from './release-launcher.mjs';
let root;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = null; state.windows = []; state.closed = 0; state.failure = false; });
it('paints the actual hidden Web validation surface before capture and closes its lifecycle', async () => {
  root = await mkdtemp(join(tmpdir(), 'galcraft-release-lifecycle-'));
  const result = await releaseLauncher(root).verify(root, { projectId: 'Proj01', target: 'web' });
  expect(result.ok).toBe(true);
  const window = state.windows[0];
  expect(window.options).toMatchObject({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  expect(window.webContents.debugger.sendCommand).toHaveBeenCalledWith('Emulation.setFocusEmulationEnabled', { enabled: true });
  expect(window.webContents.capturePage).toHaveBeenCalledWith(undefined, { stayHidden: true, stayAwake: true });
  expect(await readFile(result.value.evidencePaths[1], 'utf8')).toBe('actual capture');
  expect(window.webContents.listenerCount('paint')).toBe(0); expect(window.webContents.debugger.detach).toHaveBeenCalledOnce();
  expect(window.destroyed).toBe(true); expect(state.closed).toBe(1);
});
it('preserves a validation failure and releases the hidden window without taking a success screenshot', async () => {
  root = await mkdtemp(join(tmpdir(), 'galcraft-release-failure-')); state.failure = true;
  const result = await releaseLauncher(root).verify(root, { projectId: 'Proj01', target: 'web' });
  expect(result).toMatchObject({ ok: false, error: { code: 'PLAYER_LAUNCH', message: expect.stringContaining('Actual Player validation failed') } });
  const window = state.windows[0];
  expect(window.webContents.capturePage).not.toHaveBeenCalled(); expect(window.webContents.listenerCount('paint')).toBe(0);
  expect(window.destroyed).toBe(true); expect(state.closed).toBe(1);
});
