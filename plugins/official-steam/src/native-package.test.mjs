import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

it('ships an executable native child entry and the exact Windows SDK surface without initializing an account', async () => {
  const base = new URL('../package/native/windows-x64/', import.meta.url);
  const source = await readFile(new URL('index.mjs', base), 'utf8');
  expect(source).not.toContain('data:text/javascript');
  expect(source).toContain('./steam-worker.mjs');
  const child = fork(fileURLToPath(new URL('steam-worker.mjs', base)), [], { execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
  try {
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => reject(new Error(`Native worker stopped before loading: ${code}`))); child.on('message', message => { if (message.type === 'loaded') resolve(); }); });
    const exited = new Promise(resolve => child.once('exit', resolve)); child.send({ type: 'close' }); expect(await exited).toBe(0);
  } finally { if (child.exitCode === null) child.kill(); }
  if (process.platform === 'win32' && process.arch === 'x64') {
    const sdk = createRequire(import.meta.url)(fileURLToPath(new URL('steamworksjs.win32-x64-msvc.node', base)));
    for (const method of [sdk.init, sdk.runCallbacks, sdk.achievement.activate, sdk.stats.store]) expect(typeof method).toBe('function');
    expect(sdk.shutdown).toBeUndefined();
  }
});
