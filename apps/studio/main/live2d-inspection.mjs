import { pathToFileURL } from 'node:url';
import { collectLive2DRuntime } from './live2d-release.mjs';
import { fail, ok } from './result.mjs';

/** Supplies only a verified external runtime descriptor; ordinary packages own inspection. */
export function externalRuntimeDependencies(root, lock, target = 'windows') {
  return { async resolve(key) {
    if (key !== 'org.galcraft.live2d/cubism') return fail('RUNTIME_DEPENDENCY_MISSING', `外部运行时 ${key} 未准备`, 'M06', ['supplyDependency']);
    try {
      const runtime = await collectLive2DRuntime({ root, lock, target, policy: { purpose: 'localTest', licenseConfirmed: false } });
      const entry = runtime.files.find(file => file.path === `runtime/live2d/${runtime.manifest.entry}`);
      if (!entry) return fail('RUNTIME_DEPENDENCY_MISSING', 'Cubism Framework 入口缺失', 'M06', ['supplyDependency']);
      return ok({ url: pathToFileURL(entry.source).href, expected: lock });
    } catch (error) { return fail('LIVE2D_RUNTIME_MISSING', String(error), 'M06', ['supplyDependency']); }
  } };
}
