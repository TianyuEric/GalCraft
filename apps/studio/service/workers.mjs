import { EventEmitter } from 'node:events';
import { Worker as NodeWorker, MessageChannel } from 'node:worker_threads';
import { fail, ok } from '../main/result.mjs';

/** Runs the existing compiler, style and matting protocols in ordinary Node workers. */
export class NodeUtilityTasks extends EventEmitter {
  tasks = new Map();
  constructor({ cancelWaitMs = 5000 } = {}) { super(); this.cancelWaitMs = cancelWaitMs; }
  start({ operationId, script, input, outputDirectory, owner = 'M03' }) {
    if (this.closing) throw new Error('Studio operations are stopping');
    if (this.tasks.has(operationId)) throw new Error('Operation already running');
    const workerEntry = new URL(/* @vite-ignore */ './worker-entry.mjs', import.meta.url);
    const child = new NodeWorker(workerEntry, { workerData: { script }, execArgv: [] });
    const { port1, port2 } = new MessageChannel();
    const task = { child, port: port2, state: 'running', settled: false };
    this.tasks.set(operationId, task);
    child.once('online', () => this.emit('spawned', { operationId, pid: process.pid, threadId: child.threadId }));
    this.emit('changed', { operationId, state: 'running', phase: 'starting' });
    task.promise = new Promise(resolve => {
      const finish = result => {
        if (task.settled) return;
        task.settled = true; clearTimeout(task.timer); port2.close();
        const stopped = () => {
          this.tasks.delete(operationId);
          this.emit('changed', { operationId, state: result.ok ? 'completed' : task.state === 'cancelled' ? 'cancelled' : 'failed', phase: 'finished', result });
          resolve(result);
        };
        void child.terminate().then(stopped, stopped);
      };
      // Worker messages are drained before its exit event. A separate
      // MessagePort has no such ordering and can lose an already-posted result.
      child.on('message', message => {
        if (task.state === 'cancelled') { if (message?.type === 'result' || message?.type === 'error') finish(fail('CANCELLED', '操作已取消', owner, ['retry'])); return; }
        if (message?.type === 'progress') this.emit('changed', { operationId, state: 'running', phase: message.phase, completed: message.completed, total: message.total });
        else if (message?.type === 'result') finish(ok(message.value));
        else if (message?.type === 'error') finish(fail(message.code ?? 'WORKER_FAILED', message.message ?? '工作线程失败', owner));
      });
      child.once('error', error => finish(fail('WORKER_FAILED', String(error.message), owner, ['retry'])));
      child.once('exit', code => finish(task.state === 'cancelled' ? fail('CANCELLED', '操作已取消', owner, ['retry']) : fail('WORKER_EXIT', `工作线程退出，代码 ${code}`, owner, ['retry'])));
    });
    child.postMessage({ data: { type: 'connect', operationId, input, outputDirectory }, ports: [port1] }, [port1]);
    return task.promise;
  }
  async cancel(operationId) {
    const task = this.tasks.get(operationId);
    if (!task) return { local: 'alreadyFinished', remote: 'notApplicable' };
    if (task.state !== 'cancelled') { task.state = 'cancelled'; task.port.postMessage({ type: 'cancel' }); task.timer = setTimeout(() => void task.child.terminate(), this.cancelWaitMs); }
    await task.promise; return { local: 'stopped', remote: 'notApplicable' };
  }
  close() { return this.closing ??= Promise.all([...this.tasks.keys()].map(id => this.cancel(id))).then(() => undefined); }
}
