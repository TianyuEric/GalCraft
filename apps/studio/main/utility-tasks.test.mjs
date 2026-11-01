import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { UtilityTasks } from './utility-tasks.mjs';

class Port extends EventEmitter {
  postMessage(value) { queueMicrotask(() => this.peer.emit('message', { data: value })); }
  start() {}
  close() {}
}

class Channel {
  constructor() {
    this.port1 = new Port();
    this.port2 = new Port();
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

function manager() {
  const children = [];
  const tasks = new UtilityTasks({
    MessageChannelMain: Channel,
    utilityProcess: {
      fork: () => {
        const child = new EventEmitter();
        child.postMessage = (_message, ports) => { child.port = ports[0]; };
        child.kill = () => { child.emit('exit', 1); return true; };
        children.push(child);
        return child;
      },
    },
    cancelWaitMs: 10,
  });
  return { tasks, children };
}

describe('utility task lifecycle', () => {
  it('reports worker exit without a result and accepts a fresh retry', async () => {
    const { tasks, children } = manager();
    const first = tasks.start({ operationId: 'one', script: 'compiler.mjs', input: { version: 2 }, outputDirectory: 'staging' });
    children[0].emit('exit', 1);
    expect((await first).error.code).toBe('WORKER_EXIT');
    const second = tasks.start({ operationId: 'two', script: 'compiler.mjs', input: { version: 2 }, outputDirectory: 'staging' });
    children[1].port.postMessage({ type: 'result', value: { version: 2 } });
    expect(await second).toMatchObject({ ok: true, value: { version: 2 } });
  });

  it('does not accept a late result after cancellation', async () => {
    const { tasks, children } = manager();
    const running = tasks.start({ operationId: 'one', script: 'compiler.mjs', input: {}, outputDirectory: 'staging' });
    const cancelled = tasks.cancel('one');
    children[0].port.postMessage({ type: 'result', value: 'stale' });
    children[0].emit('exit', 1);
    expect(await cancelled).toMatchObject({ local: 'stopped' });
    expect((await running).error.code).toBe('CANCELLED');
  });
});
