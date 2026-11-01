import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ handlers: new Map(), listeners: new Map(), contents: new Map(), errors: [], loaded: '', sent: [], closes: 0, shown: false }));
const ensure = vi.hoisted(() => vi.fn(async () => ({ origin: 'http://127.0.0.1:12345', reused: true })));
vi.mock('../service/launcher.mjs', () => ({ ensureStudioService: ensure }));
vi.mock('../service/paths.mjs', () => ({ studioUserData: () => 'test-user-data' }));
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => 'test-user-data', setPath() {}, setAppUserModelId() {}, whenReady: async () => {}, on() {}, quit() {} },
  BrowserWindow: class {
    webContents = { on: (name, listener) => state.contents.set(name, listener), send: (...args) => state.sent.push(args), setWindowOpenHandler() {}, isDestroyed: () => false, getURL: () => state.loaded };
    on(name, listener) { state.listeners.set(name, listener); }
    close() { state.closes++; }
    show() { state.shown = true; }
    async loadURL(url) { state.loaded = url; }
  },
  dialog: { showErrorBox: (...args) => state.errors.push(args) }, shell: { openExternal: vi.fn() }, ipcMain: { handle: (key, fn) => state.handlers.set(key, fn), on: (key, fn) => state.handlers.set(key, fn) }, Menu: { setApplicationMenu() {} },
}));
afterEach(() => vi.unstubAllGlobals());

it('connects a window to the existing service and detaches without stopping domain services', async () => {
  const attachRuntime = vi.fn(async () => ({ ok: true })); vi.stubGlobal('fetch', attachRuntime);
  await import('./main.mjs'); await vi.waitFor(() => expect(state.shown).toBe(true));
  expect(attachRuntime).toHaveBeenCalledWith('http://127.0.0.1:12345/api/desktop-runtime', expect.objectContaining({ method: 'POST' }));
  expect(ensure).toHaveBeenCalledWith(expect.objectContaining({ userData: 'test-user-data', env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }) }));
  expect(state.loaded).toBe('http://127.0.0.1:12345/?entry=desktop'); expect(state.errors).toEqual([]);
  const preventDefault = vi.fn(); state.listeners.get('close')({ preventDefault });
  expect(preventDefault).toHaveBeenCalled(); expect(state.sent).toEqual([['studio:detachRequested']]);
  expect([...state.handlers.keys()]).toEqual(['studio:localDialog', 'studio:openExternal', 'studio:setAppearance', 'studio:detachReady']);
});
