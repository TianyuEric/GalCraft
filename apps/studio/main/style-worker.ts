import { StyleCompileInputSchema } from '@galcraft/contracts';
import { compileStyle, type CompiledStyle } from '@galcraft/templates/compiler';
import type { UtilityConnection } from '../service/worker-protocol.js';

process.parentPort.once('message', (event: UtilityConnection<unknown, CompiledStyle>) => {
  const [port] = event.ports;
  if (!port) throw new Error('Style compilation requires a utility reply port.');
  let cancelled = false;
  port.on('message', ({ data }) => { if (data.type === 'cancel') cancelled = true; });
  port.start();
  setImmediate(() => {
    try {
      if (cancelled) return;
      const input = StyleCompileInputSchema.parse(event.data.input);
      port.postMessage({ type: 'result', value: compileStyle(input) });
    } catch (error) {
      port.postMessage({ type: 'error', code: 'STYLE_COMPILE', message: String(error) });
    } finally {
      setTimeout(() => { port.close(); process.exit(0); }, 50);
    }
  });
});
