import { prepareModel, removeBackground, toolManifest } from './matting.mjs';

process.parentPort.once('message', event => {
  const [port] = event.ports;
  const { input, outputDirectory } = event.data;
  const abort = new AbortController();
  port.on('message', message => {
    if (message.data?.type === 'cancel') abort.abort();
  });
  port.start();
  const work = input.kind === 'prepareModel'
    ? prepareModel(input.modelDirectory, {
      signal: abort.signal,
      onState: state => port.postMessage({ type: 'progress', phase: state.state,
        completed: state.bytes, total: state.totalBytes }),
    }).then(ready => ({ state: 'ready', modelVersion: toolManifest.release, ...ready }))
    : removeBackground(input.inputPath, outputDirectory, input.modelDirectory, { signal: abort.signal });
  work
    .then(value => port.postMessage({ type: 'result', value }))
    .catch(error => port.postMessage({ type: 'error', code: abort.signal.aborted ? 'CANCELLED' : 'MATTING_FAILED', message: String(error) }))
    .finally(() => setTimeout(() => process.exit(0), 50));
});
