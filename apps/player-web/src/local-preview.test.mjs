import { test } from 'vitest';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '../../../tmp/testing/web-local-preview');
async function fixture(action) {
  await mkdir(base, { recursive: true }); const directory = await mkdtemp(join(base, '中文 preview-'));
  try {
    await copyFile(new URL('../public/preview.mjs', import.meta.url), join(directory, 'preview.mjs'));
    await copyFile(new URL('../public/preview.cmd', import.meta.url), join(directory, 'preview.cmd'));
    await action(directory);
  } finally { assert(dirname(directory) === base); await rm(directory, { recursive: true, force: true }); }
}

test('the standalone server serves the release with correct MIME, HEAD and media range responses', async () => fixture(async directory => {
  await writeFile(join(directory, 'index.html'), '<h1>Local game</h1>');
  await writeFile(join(directory, '样例.mp4'), Buffer.from([0, 1, 2, 3, 4, 5]));
  await writeFile(join(directory, 'core.wasm'), Buffer.from([0, 97, 115, 109]));
  const { startPreview } = await import(pathToFileURL(join(directory, 'preview.mjs')).href);
  const { server, url } = await startPreview({ openBrowser: false });
  try {
    assert.equal(server.address().address, '127.0.0.1');
    assert.equal(await (await fetch(url)).text(), '<h1>Local game</h1>');
    const head = await fetch(url + encodeURIComponent('样例.mp4'), { method: 'HEAD' });
    assert.equal(head.headers.get('content-type'), 'video/mp4'); assert.equal(head.headers.get('content-length'), '6'); assert.equal((await head.arrayBuffer()).byteLength, 0);
    for (const [range, expected] of [['bytes=1-3', [1, 2, 3]], ['bytes=-2', [4, 5]], ['bytes=4-', [4, 5]]]) {
      const response = await fetch(url + encodeURIComponent('样例.mp4'), { headers: { range } });
      assert.equal(response.status, 206); assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], expected);
    }
    assert.equal((await fetch(url + 'core.wasm')).headers.get('content-type'), 'application/wasm');
    assert.equal((await fetch(url + encodeURIComponent('样例.mp4'), { headers: { range: 'bytes=99-' } })).status, 416);
    assert.equal((await fetch(url + '..%2Foutside.txt')).status, 404);
    assert.equal((await fetch(url + 'missing')).status, 404);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
    const another = await startPreview({ openBrowser: false });
    try { assert.notEqual(another.url, url); assert.equal(await (await fetch(another.url)).text(), '<h1>Local game</h1>'); }
    finally { another.server.closeAllConnections(); await new Promise(accept => another.server.close(accept)); }
  } finally { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
}));

test('the Windows launcher explains a missing Node.js installation', { skip: process.platform !== 'win32' }, async () => fixture(async directory => {
  const child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'preview.cmd'], { cwd: directory, windowsHide: true,
    env: { ...process.env, PATH: join(process.env.SystemRoot, 'System32') }, stdio: 'pipe' });
  let text = ''; child.stdout.on('data', chunk => { text += chunk; if (text.includes('Node.js is required') && !child.stdin.writableEnded) child.stdin.end('\r\n'); });
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', accept); });
  assert.equal(code, 1); assert(text.includes('Install Node.js')); assert(text.includes('preview.cmd again'));
}));
