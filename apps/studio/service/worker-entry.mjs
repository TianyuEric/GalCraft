import { parentPort, workerData } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';

// Electron utility workers receive MessageEvent-shaped data. Keep that protocol at
// this boundary so their domain implementation and cancellation remain shared.
const parent = new EventEmitter();
process.parentPort = parent;
await import(pathToFileURL(workerData.script).href);
parentPort.on('message', event => {
  parent.emit('message', { data: event.data, ports: event.ports.map(native => {
    const port = new EventEmitter();
    native.on('message', data => port.emit('message', { data }));
    // Keep replies on the Worker's own channel so the host receives them before
    // exit; the transferred port continues to carry cancellation into the task.
    port.postMessage = value => parentPort.postMessage(value);
    port.start = () => native.start();
    port.close = () => native.close();
    return port;
  }) });
});
