import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { installStudioClose } from './close-window.mjs';

class Window extends EventEmitter {
  destroyed = false;
  webContents = Object.assign(new EventEmitter(), { send: vi.fn() });
  close() {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    this.emit('close', event);
    if (!event.prevented) { this.destroyed = true; this.emit('closed'); }
  }
}

const settled = () => new Promise(resolve => setTimeout(resolve, 0));
const sessionId = '11111111-1111-4111-8111-111111111111';

function rendererFixture() {
  const window = new Window();
  const ipcMain = new EventEmitter();
  const projects = { currentSessionId: sessionId,
    currentSession: { projectId: sessionId, dirtyIds: () => [sessionId] },
    close: vi.fn(async () => ({ ok: true })) };
  const assets = { discardPending: vi.fn(async () => ({ ok: true })) };
  const dialog = { showMessageBox: vi.fn(async () => ({ response: 0 })) };
  installStudioClose(window, dialog, projects, assets, ipcMain);
  const respond = response => ipcMain.emit('studio:closePrepared', { sender: window.webContents },
    window.webContents.send.mock.lastCall[1], response);
  return { window, ipcMain, projects, assets, dialog, respond };
}

describe('Studio window close', () => {
  it.each(['save', 'discard'])('waits for the renderer %s choice before disposing the session', async choice => {
    const { window, ipcMain, projects, assets, dialog, respond } = rendererFixture();
    window.close();
    await settled();
    expect(projects.close).not.toHaveBeenCalled();
    expect(assets.discardPending).not.toHaveBeenCalled();
    expect(window.destroyed).toBe(false);
    const id = window.webContents.send.mock.lastCall[1];
    ipcMain.emit('studio:closePrepared', { sender: new EventEmitter() }, id, { choice });
    ipcMain.emit('studio:closePrepared', { sender: window.webContents }, id + 1, { choice });
    await settled();
    expect(projects.close).not.toHaveBeenCalled();
    respond({ choice });
    await settled();
    expect(projects.close).toHaveBeenCalledExactlyOnceWith(sessionId, choice);
    expect(assets.discardPending).toHaveBeenCalledExactlyOnceWith(sessionId);
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    expect(window.destroyed).toBe(true);
    expect(ipcMain.listenerCount('studio:closePrepared')).toBe(0);
  });

  it('keeps the current session after renderer cancellation and allows a later close', async () => {
    const { window, projects, assets, dialog, respond } = rendererFixture();
    window.close();
    respond({ choice: 'cancel' });
    await settled();
    expect(projects.currentSessionId).toBe(sessionId);
    expect(projects.close).not.toHaveBeenCalled();
    expect(assets.discardPending).not.toHaveBeenCalled();
    expect(window.destroyed).toBe(false);
    expect(dialog.showMessageBox).not.toHaveBeenCalled();
    window.close();
    respond({ choice: 'save' });
    await settled();
    expect(window.destroyed).toBe(true);
  });

  it.each([{ error: 'M10 草稿保存失败' }, { choice: 'invalid' }])('preserves the session when renderer preparation fails: %j', async response => {
    const { window, projects, assets, dialog, respond } = rendererFixture();
    window.close();
    respond(response);
    await settled();
    expect(projects.close).not.toHaveBeenCalled();
    expect(assets.discardPending).not.toHaveBeenCalled();
    expect(window.destroyed).toBe(false);
    expect(dialog.showMessageBox).toHaveBeenCalledExactlyOnceWith(window,
      expect.objectContaining({ type: 'error', message: '作品尚未关闭' }));
  });

  it('preserves the session when the renderer stops while preparing to close', async () => {
    const { window, projects, assets, dialog } = rendererFixture();
    window.close();
    window.webContents.emit('render-process-gone');
    await settled();
    expect(projects.close).not.toHaveBeenCalled();
    expect(assets.discardPending).not.toHaveBeenCalled();
    expect(window.destroyed).toBe(false);
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the renderer has not registered close preparation', async () => {
    const { window, projects, dialog, respond } = rendererFixture();
    window.close();
    respond({ choice: null });
    await settled();
    expect(dialog.showMessageBox).toHaveBeenCalledExactlyOnceWith(window,
      expect.objectContaining({ type: 'error', detail: 'Error: 编辑界面的关闭准备尚未就绪' }));
    expect(projects.close).not.toHaveBeenCalled();
    expect(window.destroyed).toBe(false);
  });

  it('routes renderer window close requests through the native close preparation', async () => {
    const { window, ipcMain, projects, respond } = rendererFixture();
    ipcMain.emit('studio:requestClose', { sender: new EventEmitter() });
    expect(window.webContents.send).not.toHaveBeenCalled();
    ipcMain.emit('studio:requestClose', { sender: window.webContents });
    expect(window.webContents.send).toHaveBeenCalledExactlyOnceWith('studio:closeRequested', 1);
    respond({ choice: 'cancel' });
    await settled();
    expect(projects.close).not.toHaveBeenCalled();
    expect(window.destroyed).toBe(false);
  });

  it('handles repeated native close requests through one preparation and project close', async () => {
    const { window, projects, respond } = rendererFixture();
    let finish;
    projects.close.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    window.close();
    window.close();
    expect(window.webContents.send).toHaveBeenCalledTimes(1);
    respond({ choice: 'save' });
    await settled();
    window.close();
    expect(projects.close).toHaveBeenCalledTimes(1);
    expect(window.webContents.send).toHaveBeenCalledTimes(1);
    expect(window.destroyed).toBe(false);
    finish({ ok: true });
    await settled();
    expect(window.destroyed).toBe(true);
  });

  it('honors cancel and waits for a successful save before closing', async () => {
    const window = new Window();
    const projects = { currentSessionId: sessionId, currentSession: { projectId: sessionId, dirtyIds: () => [sessionId] }, close: vi.fn(async () => ({ ok: true, value: undefined, warnings: [] })) };
    const assets = { discardPending: vi.fn(async () => ({ ok: true, value: undefined, warnings: [] })) };
    const dialog = { showMessageBox: vi.fn().mockResolvedValueOnce({ response: 2 }).mockResolvedValueOnce({ response: 0 }) };
    installStudioClose(window, dialog, projects, assets);
    window.close();
    await settled();
    expect(window.destroyed).toBe(false);
    expect(projects.close).not.toHaveBeenCalled();
    expect(assets.discardPending).not.toHaveBeenCalled();
    window.close();
    await settled();
    expect(assets.discardPending).toHaveBeenCalledWith(sessionId);
    expect(projects.close).toHaveBeenCalledWith(sessionId, 'save');
    expect(window.destroyed).toBe(true);
  });

  it('keeps the window open when discarding cannot complete', async () => {
    const window = new Window();
    const projects = { currentSessionId: sessionId, currentSession: { dirtyIds: () => [sessionId] }, close: vi.fn().mockResolvedValueOnce({ ok: false, error: { message: '保存仍在进行中' } }).mockResolvedValueOnce({ ok: true }) };
    const dialog = { showMessageBox: vi.fn().mockResolvedValueOnce({ response: 1 }).mockResolvedValueOnce({ response: 0 }).mockResolvedValueOnce({ response: 1 }) };
    installStudioClose(window, dialog, projects);
    window.close();
    await settled();
    expect(window.destroyed).toBe(false);
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(2);
    window.close();
    await settled();
    expect(window.destroyed).toBe(true);
    expect(projects.close).toHaveBeenLastCalledWith(sessionId, 'discard');
  });

  it('preserves pending assets when saving the project fails', async () => {
    const window = new Window();
    const projects = { currentSessionId: sessionId,
      currentSession: { projectId: sessionId, dirtyIds: () => [sessionId] },
      close: vi.fn().mockResolvedValueOnce({ ok: false, error: { message: '保存失败' } })
        .mockResolvedValueOnce({ ok: true, value: undefined, warnings: [] }) };
    const assets = { discardPending: vi.fn(async () => ({ ok: true, value: undefined, warnings: [] })) };
    const dialog = { showMessageBox: vi.fn().mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 0 }).mockResolvedValueOnce({ response: 0 }) };
    installStudioClose(window, dialog, projects, assets);
    window.close();
    await settled();
    expect(window.destroyed).toBe(false);
    expect(assets.discardPending).not.toHaveBeenCalled();
    window.close();
    await settled();
    expect(projects.close).toHaveBeenCalledTimes(2);
    expect(assets.discardPending).toHaveBeenCalledExactlyOnceWith(sessionId);
    expect(window.destroyed).toBe(true);
  });
});

describe('Studio preload close preparation', () => {
  it('keeps one IPC listener and forwards choices, exceptions, and unsubscription', async () => {
    const ipcRenderer = Object.assign(new EventEmitter(), { invoke: vi.fn(), send: vi.fn() });
    let bridge;
    const listeners = new Map();
    const rendererWindow = { addEventListener: (type, listener) => listeners.set(type, listener),
      dispatchEvent: event => listeners.get(event.type)?.(event) };
    runInNewContext(readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8'), {
      require: () => ({ ipcRenderer, contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; },
        executeInMainWorld: ({ func }) => func() } }),
      window: rendererWindow, Event: class { constructor(type) { this.type = type; } },
    });
    rendererWindow.close();
    expect(ipcRenderer.send).toHaveBeenLastCalledWith('studio:requestClose');
    expect(listeners.has('beforeunload')).toBe(false);
    ipcRenderer.emit('studio:closeRequested', {}, 1);
    await settled();
    expect(ipcRenderer.send).toHaveBeenLastCalledWith('studio:closePrepared', 1, { choice: null });
    const unsubscribe = bridge.onCloseRequested(async () => 'cancel');
    ipcRenderer.emit('studio:closeRequested', {}, 2);
    await settled();
    expect(ipcRenderer.send).toHaveBeenLastCalledWith('studio:closePrepared', 2, { choice: 'cancel' });
    bridge.onCloseRequested(async () => { throw new Error('保存失败'); });
    unsubscribe();
    ipcRenderer.emit('studio:closeRequested', {}, 3);
    await settled();
    expect(ipcRenderer.send).toHaveBeenLastCalledWith('studio:closePrepared', 3, { error: '保存失败' });
    const unsubscribeCurrent = bridge.onCloseRequested(async () => 'save');
    unsubscribeCurrent();
    ipcRenderer.emit('studio:closeRequested', {}, 4);
    await settled();
    expect(ipcRenderer.send).toHaveBeenLastCalledWith('studio:closePrepared', 4, { choice: null });
    expect(ipcRenderer.listenerCount('studio:closeRequested')).toBe(1);
  });
});
