// @ts-check
import { parentPort, workerData } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';

// Electron utility workers receive MessageEvent-shaped data. Keep that protocol at
// this boundary so their domain implementation and cancellation remain shared.
if (!parentPort) throw new Error('Studio utility entry requires a worker thread');
const nativeParent = parentPort;
/** @type {EventEmitter<{ message: [import('./worker-protocol.js').UtilityConnection<unknown, unknown>] }>} */
const parent = new EventEmitter();
Object.assign(process, { parentPort: parent });
/** @type {{ script: string }} */
const { script } = workerData;
await import(pathToFileURL(script).href);
nativeParent.on('message', (/** @type {import('./worker-protocol.js').WorkerConnection<unknown>} */ event) => {
  parent.emit('message', { data: event.data, ports: event.ports.map(native => {
    /** @type {EventEmitter<{ message: [{ data: import('./worker-protocol.js').UtilityCancel }] }>} */
    const port = new EventEmitter();
    native.on('message', data => port.emit('message', { data }));
    // Keep replies on the Worker's own channel so the host receives them before
    // exit; the transferred port continues to carry cancellation into the task.
    /** @type {import('./worker-protocol.js').UtilityPort<unknown>} */
    const adapter = Object.assign(port, {
      postMessage: (/** @type {import('./worker-protocol.js').UtilityReply<unknown>} */ value) => nativeParent.postMessage(value),
      start: () => native.start(),
      close: () => native.close(),
    });
    return adapter;
  }) });
});
