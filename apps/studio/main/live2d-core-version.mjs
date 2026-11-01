import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

export async function loadCore(path, kind) {
  const context = createContext({ console, TextDecoder, TextEncoder, WebAssembly, setTimeout, clearTimeout, performance, atob });
  runInContext(await readFile(path, 'utf8'), context);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    let value;
    try { value = kind === 'cubism' ? context.Live2DCubismCore?.Version.csmGetVersion() :
      context.Live2DCubismMotionSyncCore?.CubismMotionSyncEngine.csmMotionSyncGetEngineVersion(); } catch { /* WebAssembly initialization is asynchronous. */ }
    if (typeof value === 'number' && value > 0) return {
      core: kind === 'cubism' ? context.Live2DCubismCore : context.Live2DCubismMotionSyncCore,
      version: `${value >>> 24 & 255}.${value >>> 16 & 255}.${String(value & 65535).padStart(2, '0')}`,
    };
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Core initialization timed out: ${path}`);
}

export async function coreVersion(path, kind) { return (await loadCore(path, kind)).version; }
