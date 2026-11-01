import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import type { GalCraftPlugin, PluginContext, ResourceProvider } from '@galcraft/plugins/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import { createLive2DResourceProvider } from './model.js';
import { resourceKey, runtimeKey } from './metadata.js';

const fail = <T>(code: string, message: string): import('@galcraft/contracts').Result<T> => {
  const error = { code, message, severity: 'error' as const, owner: 'M06' as const, related: [], actions: ['supplyDependency' as const] };
  return { ok: false, error, issues: [error] };
};
async function loadCore(context: PluginContext) {
  const resolved = await context.runtimeDependencies?.resolve(runtimeKey);
  if (!resolved?.ok) throw new Error(resolved && !resolved.ok ? resolved.error.message : '请先导入并锁定 Cubism Web R4 SDK');
  const expected = resolved.value.expected as { coreVersion: string };
  const sandbox = createContext({ console, TextDecoder, TextEncoder, WebAssembly, setTimeout, clearTimeout, performance, atob });
  runInContext(await readFile(new URL('core/live2dcubismcore.js', new URL('./', resolved.value.url)), 'utf8'), sandbox);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    let value: number | undefined;
    try { value = sandbox.Live2DCubismCore?.Version.csmGetVersion(); } catch { /* Core initializes WebAssembly asynchronously. */ }
    if (value) {
      const actual = `${value >>> 24 & 255}.${value >>> 16 & 255}.${String(value & 65535).padStart(2, '0')}`;
      if (actual !== expected.coreVersion) throw new Error(`Cubism Core ${actual} 与锁定版本 ${expected.coreVersion} 不一致`);
      return sandbox.Live2DCubismCore;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Cubism Core 初始化超时');
}
export function createPlugin(): GalCraftPlugin {
  let core: Promise<any> | null = null;
  return {
    async activate(context) {
      const contributions = emptyContributions();
      const provider: ResourceProvider = { key: resourceKey, kind: 'live2d', extensions: ['.model3.json'], async inspect(rootFile, files, source) {
        if (!source) return fail('MODEL_SOURCE_MISSING', '模型检查需要所属资源组');
        const inspected = await createLive2DResourceProvider(path => source.readText(path), async path => {
          let moc: any, model: any;
          try {
            const sdk = await (core ??= loadCore(context));
            const file = await source.readBytes(path), bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
            moc = sdk.Moc.fromArrayBuffer(bytes);
            if (!moc) return fail('MODEL_MOC_INVALID', `${path}: Cubism Core 无法读取模型`);
            const version = sdk.Version.csmGetMocVersion(moc, bytes);
            model = sdk.Model.fromMoc(moc);
            if (!model) return fail('MODEL_MOC_INVALID', `${path}: Cubism Core 无法创建模型`);
            return { ok: true, warnings: [], value: { version, parameters: Array.from(model.parameters.ids as string[], (id, index) => ({ id,
              min: model.parameters.minimumValues[index], max: model.parameters.maximumValues[index], default: model.parameters.defaultValues[index] })), partIds: [...model.parts.ids] } };
          } catch (error) { core = null; return fail('LIVE2D_MODEL_INSPECTION', `无法读取模型参数：${String(error)}`); }
          finally { model?.release(); moc?._release(); }
        }, { key: resourceKey, version: '0.1.0' }).inspect(rootFile, files, source);
        return inspected.ok ? { ...inspected, value: { ...inspected.value, metadata: {}, typeData: {
          typeVersion: 1, provider: { id: context.pluginId, version: '0.1.0' }, value: { capabilities: inspected.value.capabilities, model: inspected.value.metadata },
        } } } : inspected;
      } };
      contributions.resources.push(provider); return contributions;
    }, async deactivate() { core = null; },
  };
}
