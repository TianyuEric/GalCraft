import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerResourceScheme, ResourceRegistry } from '@galcraft/media-tools/resources';
import { WindowsPlayerHost, registerPlayerIpc } from './host.mjs';
import { WindowsPlayerStorage } from './storage.mjs';

const application = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testing = resolve(application, '../../tmp/testing');
const output = join(testing, 'host-player-smoke.json');
mkdirSync(testing, { recursive: true });
const userData = join(testing, 'host-player-user-data');
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
registerResourceScheme(protocol);

app.whenReady().then(async () => {
  const resources = new ResourceRegistry();
  resources.install(protocol);
  const window = new BrowserWindow({
    show: false,
    webPreferences: { preload: join(application, 'main', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const host = new WindowsPlayerHost({ window, dialog, resourceRegistry: resources,
    assetProvider: { resolve: async (assetId, variantId) => ({
      projectId: '11111111-1111-4111-8111-111111111111', assetId, variantId,
      relative: 'player-runtime.bin', path: process.execPath, mime: 'application/octet-stream',
    }) },
    storageProvider: new WindowsPlayerStorage(join(userData, 'player-data')) });
  registerPlayerIpc(ipcMain, host);
  await window.loadFile(join(application, 'dist', 'index.html'));
  const renderer = await window.webContents.executeJavaScript(`({
    title: document.title,
    host: typeof window.playerHost,
    target: window.playerHost?.target,
    node: typeof window.require,
    nodeAbsent: typeof process === 'undefined',
    viewport: window.playerHost?.viewport(),
    message: document.getElementById('app')?.textContent
  })`);
  const projectId = randomUUID();
  const storage = await window.webContents.executeJavaScript(`(async () => {
    const prefix = 'player/${projectId}/player/default/';
    const committed = await window.playerHost.storage.commit({
      domain: { projectId: '${projectId}', kind: 'player', instance: 'default' },
      expectedRevision: 0,
      writes: [{ key: prefix + 'preferences', bytes: Uint8Array.from([0, 255, 13]) },
        { key: prefix + 'revision', bytes: new TextEncoder().encode('1') }], deletes: [],
    });
    const read = await window.playerHost.storage.read(prefix + 'preferences');
    return { committed, read: read.ok ? { ok: true, bytes: Array.from(read.value) } : read };
  })()`, true);
  if (!storage.committed.ok || storage.committed.value.revision !== 1 ||
      !storage.read.ok || JSON.stringify(storage.read.bytes) !== JSON.stringify([0, 255, 13]))
    throw new Error(`Player IPC storage failed: ${JSON.stringify(storage)}`);
  const resource = await window.webContents.executeJavaScript(`(async () => {
    const result = await window.playerHost.resources.resolve('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
    if (!result.ok) return result;
    const response = await fetch(result.value.uri, { method: 'HEAD' });
    result.value.release();
    return { ok: true, status: response.status, bytes: result.value.bytes,
      serializableTokenHidden: !('token' in result.value), release: typeof result.value.release };
  })()`, true);
  if (!resource.ok || resource.status !== 200 || resource.bytes <= 0 || !resource.serializableTokenHidden || resource.release !== 'function')
    throw new Error(`Player IPC resource failed: ${JSON.stringify(resource)}`);
  writeFileSync(output, JSON.stringify({ versions: process.versions, renderer, storage, resource }));
  window.destroy();
  app.quit();
}).catch(error => {
  writeFileSync(output, JSON.stringify({ error: String(error) }));
  app.quit();
});
