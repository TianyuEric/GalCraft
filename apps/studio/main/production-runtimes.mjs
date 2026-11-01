import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, ok } from './result.mjs';

/** The host supplies prepared tools; the declared ordinary package owns production behavior. */
export function productionRuntimeDependencies({ directory, entry }) {
  return { async resolve(key) {
    if (key !== 'org.galcraft.motion-canvas/toolchain') return fail('RUNTIME_DEPENDENCY_MISSING', `外部运行时 ${key} 未准备`, 'M09', ['supplyDependency']);
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
      if (manifest.id !== key || manifest.version !== '0.1.0') return fail('MOTION_CANVAS_RUNTIME_INVALID', 'Motion Canvas 工具链清单身份不匹配，请重新准备本机工具链', 'M09', ['supplyDependency']);
      await access(entry);
      return ok({ url: pathToFileURL(entry).href, expected: manifest });
    } catch (error) { return fail('MOTION_CANVAS_RUNTIME_MISSING', `请先运行 Motion Canvas 工具链准备命令：${error.message}`, 'M09', ['supplyDependency']); }
  } };
}
