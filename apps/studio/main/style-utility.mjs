import { compileStyle } from '@galcraft/templates/compiler';
process.parentPort.once('message', event => {
  const [port] = event.ports; port.start();
  try { port.postMessage({ type: 'result', value: compileStyle(event.data.input) }); }
  catch (error) { port.postMessage({ type: 'error', code: 'STYLE_COMPILE', message: String(error) }); }
  setTimeout(() => { port.close(); process.exit(0); }, 50);
});
