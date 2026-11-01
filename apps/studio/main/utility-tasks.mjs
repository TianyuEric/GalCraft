import { EventEmitter } from 'node:events';
import { fail, ok } from './result.mjs';

export class UtilityTasks extends EventEmitter {
  #tasks = new Map();

  constructor({ utilityProcess, MessageChannelMain, cancelWaitMs = 5000 }) {
    super();
    this.utilityProcess = utilityProcess;
    this.MessageChannelMain = MessageChannelMain;
    this.cancelWaitMs = cancelWaitMs;
  }

  start({ operationId, script, input, outputDirectory, owner = 'M03' }) {
    if (this.#tasks.has(operationId)) throw new Error('Operation already running');
    const child = this.utilityProcess.fork(script, [], { stdio: 'ignore' });
    child.on('spawn', () => this.emit('spawned', { operationId, pid: child.pid }));
    const { port1, port2 } = new this.MessageChannelMain();
    const task = { child, port: port2, state: 'running', timer: undefined, settled: false };
    this.#tasks.set(operationId, task);
    this.emit('changed', { operationId, state: 'running', phase: 'starting' });
    const promise = new Promise(resolve => {
      const finish = result => {
        if (task.settled) return;
        task.settled = true;
        clearTimeout(task.timer);
        port2.close();
        this.#tasks.delete(operationId);
        this.emit('changed', { operationId, state: result.ok ? 'completed' : task.state === 'cancelled' ? 'cancelled' : 'failed', phase: 'finished', result });
        resolve(result);
      };
      port2.on('message', event => {
        const message = event.data;
        if (task.state === 'cancelled') return;
        if (message?.type === 'progress') this.emit('changed', { operationId, state: 'running', phase: message.phase, completed: message.completed, total: message.total });
        else if (message?.type === 'result') finish(ok(message.value));
        else if (message?.type === 'error') finish(fail(message.code ?? 'WORKER_FAILED', message.message ?? '工作进程失败', owner));
      });
      port2.start();
      child.on('exit', code => {
        finish(task.state === 'cancelled' ? fail('CANCELLED', '操作已取消', owner, ['retry']) : fail('WORKER_EXIT', `工作进程退出，代码 ${code}`, owner, ['retry']));
      });
    });
    task.promise = promise;
    child.postMessage({ type: 'connect', operationId, input, outputDirectory }, [port1]);
    return promise;
  }

  async cancel(operationId) {
    const task = this.#tasks.get(operationId);
    if (!task) return { local: 'alreadyFinished', remote: 'notApplicable' };
    if (task.state === 'cancelled') return { local: 'stopped', remote: 'notApplicable' };
    task.state = 'cancelled';
    task.port.postMessage({ type: 'cancel' });
    task.timer = setTimeout(() => task.child.kill(), this.cancelWaitMs);
    await task.promise;
    return { local: 'stopped', remote: 'notApplicable' };
  }
}
