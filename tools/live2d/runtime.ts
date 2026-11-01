import { CubismFramework } from '@framework/live2dcubismframework';
import { CubismUserModel } from '@framework/model/cubismusermodel';
import { CubismModelSettingJson } from '@framework/cubismmodelsettingjson';
import { CubismMatrix44 } from '@framework/math/cubismmatrix44';
import { CubismEyeBlink } from '@framework/effect/cubismeyeblink';
import { CubismBreath, BreathParameterData } from '@framework/effect/cubismbreath';
import { csmVector } from '@framework/type/csmvector';

declare const Live2DCubismCore: any;
declare const Live2DCubismMotionSyncCore: any;
const loaded = new Map<string, Promise<void>>();
let owners = 0;
function script(url: URL) {
  let pending = loaded.get(url.href);
  if (!pending) { pending = new Promise<void>((resolve, reject) => {
    const element = document.createElement('script'); element.src = url.href;
    element.onload = () => resolve(); element.onerror = () => reject(new Error(`Cannot load Cubism Core: ${url.href}`)); document.head.append(element);
  }); loaded.set(url.href, pending); }
  return pending;
}
function version(value: number) { return `${value >>> 24 & 255}.${value >>> 16 & 255}.${String(value & 65535).padStart(2, '0')}`; }
async function ready(read: () => number) {
  const deadline = performance.now() + 10000;
  while (performance.now() < deadline) { let value;
    try { value = read(); } catch { /* WebAssembly initialization is asynchronous. */ }
    if (typeof value === 'number' && value > 0) return version(value);
    await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error('Cubism Core initialization timed out');
}
export async function inspectRuntime(base: URL, motionSync = false) {
  if (typeof Live2DCubismCore === 'undefined') await script(new URL('core/live2dcubismcore.js', base));
  if (motionSync && typeof Live2DCubismMotionSyncCore === 'undefined') await script(new URL('motion/live2dcubismmotionsynccore.js', base));
  return { coreVersion: await ready(() => Live2DCubismCore.Version.csmGetVersion()),
    motionSyncCoreVersion: motionSync ? await ready(() => Live2DCubismMotionSyncCore.CubismMotionSyncEngine.csmMotionSyncGetEngineVersion()) : null };
}
/** This external artifact supplies licensed SDK bindings; model business remains in the exact plugin. */
export async function createBindings(base: URL, expected: { coreVersion: string; motionSyncCoreVersion: string | null }) {
  const actual = await inspectRuntime(base, !!expected.motionSyncCoreVersion);
  if (actual.coreVersion !== expected.coreVersion || actual.motionSyncCoreVersion !== expected.motionSyncCoreVersion) throw new Error('Cubism runtime version mismatch');
  const CubismMotionSync = expected.motionSyncCoreVersion ? (await import('@motionsyncframework/live2dcubismmotionsync')).CubismMotionSync : undefined;
  return { coreVersion: () => Live2DCubismCore.Version.csmGetVersion(), CubismFramework, CubismUserModel,
    CubismModelSettingJson, CubismMatrix44, CubismEyeBlink, CubismBreath, BreathParameterData, csmVector, CubismMotionSync,
    acquire() { if (!CubismFramework.startUp()) throw new Error('Cubism Framework startup failed'); if (!CubismFramework.isInitialized()) CubismFramework.initialize(); owners++; },
    release() { if (owners > 0 && --owners === 0) CubismFramework.dispose(); } };
}
