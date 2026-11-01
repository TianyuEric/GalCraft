import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { app, BrowserWindow, net, protocol } from 'electron';
import { registerResourceScheme, ResourceRegistry } from './resources.mjs';

const output = resolve(import.meta.dirname, '../../../test-results/latest/resource-short-id');
await mkdir(join(output, 'fixture-user-data'), { recursive: true });
app.setPath('userData', join(output, 'fixture-user-data'));
registerResourceScheme(protocol);
const report = { versions: process.versions, checks: [], result: 'failed' };

app.whenReady().then(async () => {
  let window;
  try {
    const registry = new ResourceRegistry();
    registry.install(protocol);
    window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    await window.loadURL('about:blank');
    const path = join(output, '春日 来信.png');
    await writeFile(path, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=', 'base64'));
    for (const projectId of ['bLb3jI', 'jD5Wu3', '123456', '11111111-1111-4111-8111-111111111111']) {
      const first = registry.register({ projectId, assetId: 'YC8mKh', variantId: 'Uga7Ji', relative: 'images/春日 来信.png', path, mime: 'image/png' });
      const second = registry.register({ projectId, assetId: 'YC8mKh', variantId: 'Uga7Ji', relative: 'images/春日 来信.png', path, mime: 'image/png' });
      try {
        const response = await net.fetch(first.uri);
        assert.equal(response.status, 200, first.uri);
        assert.equal(response.headers.get('content-type'), 'image/png');
        await response.arrayBuffer();
        const image = await window.webContents.executeJavaScript(`(async () => {
          const image = new Image(); image.src = ${JSON.stringify(first.uri)};
          await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight };
        })()`);
        assert.deepEqual(image, { width: 1, height: 1 });
        const head = await net.fetch(first.uri, { method: 'HEAD' });
        assert.equal(head.status, 200);
        const partial = await net.fetch(first.uri, { headers: { Range: 'bytes=0-7' } });
        assert.equal(partial.status, 206);
        assert.equal((await partial.arrayBuffer()).byteLength, 8);
        first.release();
        assert.equal((await net.fetch(second.uri, { method: 'HEAD' })).status, 200);
        second.release();
        assert.equal((await net.fetch(first.uri, { method: 'HEAD' })).status, 404);
        report.checks.push({ projectId, uri: first.uri, image, get: response.status, head: head.status, range: partial.status, result: 'passed' });
      } finally { first.release(); second.release(); }
    }
    report.result = 'passed';
  } catch (error) { report.error = String(error); }
  finally {
    await writeFile(join(output, 'electron-fixtures.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
    window?.destroy();
    app.exit(report.result === 'passed' ? 0 : 1);
  }
});
