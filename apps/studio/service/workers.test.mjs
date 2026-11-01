import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { NodeUtilityTasks } from './workers.mjs';

let directory, script, tasks;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'galcraft-node-utility-'));
  script = join(directory, 'utility.mjs');
  await writeFile(script, `process.parentPort.once('message', ({ data: { input }, ports: [port] }) => {
    port.start();
    if (input.mode === 'cancel') {
      port.on('message', ({ data }) => {
        if (data.type === 'cancel') {
          port.postMessage({ type: 'result', value: 'late result' });
          process.exit(0);
        }
      });
      port.postMessage({ type: 'progress', phase: 'ready' });
      return;
    }
    if (input.exiting) process.on('exit', () => {
      Atomics.store(input.exiting, 0, 1);
      Atomics.notify(input.exiting, 0);
    });
    if (input.mode !== 'exit') {
      port.postMessage({ type: 'progress', phase: 'compiled' });
      port.postMessage(input.message);
    }
    process.exit(0);
  });\n`);
});
afterEach(async () => { await tasks?.close(); });
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

describe('real Node utility worker lifecycle', () => {
  it.each([
    { type: 'result', value: { snapshotId: 'sample' } },
    { type: 'error', code: 'COMPILE_FAILED', message: 'invalid scene' },
  ])('delivers $type before exit when the host resumes after worker completion', async message => {
    tasks = new NodeUtilityTasks();
    const changes = [];
    tasks.on('changed', change => changes.push(change));
    const exiting = new Int32Array(new SharedArrayBuffer(4));
    const pending = tasks.start({ operationId: 'compiled', script, input: { message, exiting }, owner: 'M03' });

    // A busy service can process both notifications after the utility has exited.
    // Hold its event loop through actual worker completion, including teardown.
    expect(Atomics.wait(exiting, 0, 0, 5000)).not.toBe('timed-out');
    Atomics.wait(exiting, 0, 1, 200);

    const result = await pending;
    if (message.type === 'result') expect(result).toMatchObject({ ok: true, value: message.value });
    else expect(result).toMatchObject({ ok: false, error: { code: message.code, message: message.message } });
    expect(changes.some(change => change.phase === 'compiled')).toBe(true);
    expect(changes.filter(change => change.phase === 'finished')).toHaveLength(1);
    expect(tasks.tasks.size).toBe(0);
  });

  it('fails a clean exit that never sent a terminal result', async () => {
    tasks = new NodeUtilityTasks();
    const result = await tasks.start({ operationId: 'missing', script, input: { mode: 'exit' } });
    expect(result).toMatchObject({ ok: false, error: { code: 'WORKER_EXIT', message: '工作线程退出，代码 0' } });
    expect(tasks.tasks.size).toBe(0);
  });

  it('keeps cancellation final when the worker sends a result while stopping', async () => {
    tasks = new NodeUtilityTasks();
    const ready = once(tasks, 'changed').then(async ([event]) => {
      while (event.phase !== 'ready') [event] = await once(tasks, 'changed');
    });
    const pending = tasks.start({ operationId: 'cancelled', script, input: { mode: 'cancel' } });
    await ready;
    expect(await tasks.cancel('cancelled')).toMatchObject({ local: 'stopped' });
    expect(await pending).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(tasks.tasks.size).toBe(0);
  });
});
