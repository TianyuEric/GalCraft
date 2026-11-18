// @ts-check
import { EventEmitter } from 'node:events';
import { Worker as NodeWorker, MessageChannel } from 'node:worker_threads';
import { fail, ok } from '../main/result.mjs';

/** @typedef {import('@galcraft/contracts').Result<unknown>} WorkerResult */
/** @typedef {{ child: NodeWorker; port: import('node:worker_threads').MessagePort; state: 'running' | 'cancelled'; settled: boolean; timer?: NodeJS.Timeout; promise?: Promise<WorkerResult> }} RunningTask */

/** Runs the existing compiler, style and matting protocols in ordinary Node workers. */
export class NodeUtilityTasks extends EventEmitter {
  /** @type {Map<string, RunningTask>} */
  tasks = new Map();
  /** @type {Promise<void> | undefined} */
  closing;
  constructor({ cancelWaitMs = 5000 } = {}) { super(); this.cancelWaitMs = cancelWaitMs; }
  /**
   * @template Input, Output
   * @param {import('./worker-protocol.js').UtilityTaskRequest<Input>} request
   * @returns {Promise<import('@galcraft/contracts').Result<Output>>}
   */
  start({ operationId, script, input, outputDirectory, owner = 'M03' }) {
    if (this.closing) throw new Error('Studio operations are stopping');
    if (this.tasks.has(operationId)) throw new Error('Operation already running');
    const workerEntry = new URL(/* @vite-ignore */ './worker-entry.mjs', import.meta.url);
    const child = new NodeWorker(workerEntry, { workerData: { script }, execArgv: [] });
    const { port1, port2 } = new MessageChannel();
    /** @type {RunningTask} */
    const task = { child, port: port2, state: 'running', settled: false };
    this.tasks.set(operationId, task);
    child.once('online', () => this.emit('spawned', { operationId, pid: process.pid, threadId: child.threadId }));
    this.emit('changed', { operationId, state: 'running', phase: 'starting' });
    /** @type {Promise<import('@galcraft/contracts').Result<Output>>} */
    const promise = new Promise(resolve => {
      /** @param {import('@galcraft/contracts').Result<Output>} result */
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
      child.on('message', (/** @type {import('./worker-protocol.js').UtilityReply<Output> | null | undefined} */ message) => {
        if (task.state === 'cancelled') { if (message?.type === 'result' || message?.type === 'error') finish(fail('CANCELLED', '操作已取消', owner, ['retry'])); return; }
        if (message?.type === 'progress') this.emit('changed', { operationId, state: 'running', phase: message.phase, completed: message.completed, total: message.total });
        else if (message?.type === 'result') finish(ok(message.value));
        else if (message?.type === 'error') finish(fail(message.code ?? 'WORKER_FAILED', message.message ?? '工作线程失败', owner));
      });
      child.once('error', error => finish(fail('WORKER_FAILED', String(error.message), owner, ['retry'])));
      child.once('exit', code => finish(task.state === 'cancelled' ? fail('CANCELLED', '操作已取消', owner, ['retry']) : fail('WORKER_EXIT', `工作线程退出，代码 ${code}`, owner, ['retry'])));
    });
    task.promise = promise;
    /** @type {import('./worker-protocol.js').WorkerConnection<Input>} */
    const connection = { data: { type: 'connect', operationId, input, outputDirectory }, ports: [port1] };
    child.postMessage(connection, [port1]);
    return promise;
  }
  /** @param {import('@galcraft/contracts').Id} operationId @returns {Promise<import('@galcraft/contracts').CancelResult>} */
  async cancel(operationId) {
    const task = this.tasks.get(operationId);
    if (!task) return { local: 'alreadyFinished', remote: 'notApplicable' };
    if (task.state !== 'cancelled') {
      task.state = 'cancelled';
      /** @type {import('./worker-protocol.js').UtilityCancel} */
      const cancel = { type: 'cancel' };
      task.port.postMessage(cancel);
      task.timer = setTimeout(() => void task.child.terminate(), this.cancelWaitMs);
    }
    await task.promise; return { local: 'stopped', remote: 'notApplicable' };
  }
  close() { return this.closing ??= Promise.all([...this.tasks.keys()].map(id => this.cancel(id))).then(() => undefined); }
}
