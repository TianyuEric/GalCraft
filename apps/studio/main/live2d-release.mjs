import { createId } from '@galcraft/contracts';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { CubismRuntimeManifestSchema } from '@galcraft/contracts';

export async function collectLive2DRuntime({ root, lock, target, policy, directory: preparedDirectory }) {
  if (!lock || lock.sdkRelease !== '5-r.4') throw new Error('作品未锁定 Cubism Web R4 运行时');
  if (!policy || policy.purpose === 'distribution' && !policy.licenseConfirmed) throw new Error('请确认作品的 SDK 发布资格，或选择仅用于本地验收');
  const directory = preparedDirectory ?? join(root, lock.sdkRelease, lock.coreVersion);
  const manifest = CubismRuntimeManifestSchema.parse(JSON.parse(await readFile(join(directory, 'runtime.manifest.json'), 'utf8')));
  if (manifest.sdkRelease !== lock.sdkRelease || manifest.coreVersion !== lock.coreVersion || manifest.frameworkVersion !== lock.sdkRelease ||
    lock.motionSyncCoreVersion && manifest.motionSync?.coreVersion !== lock.motionSyncCoreVersion) throw new Error('Cubism/MotionSync 精确版本不匹配');
  if (!manifest.verifiedTargets.includes(target)) throw new Error(`Cubism 运行时尚未通过 ${target} 目标验证`);
  if (!lock.motionSyncCoreVersion) manifest.motionSync = null;
  const definitions = [...manifest.coreFiles, ...manifest.frameworkFiles, ...manifest.motionSync?.files ?? []];
  const allowed = new Set([...manifest.redistributableFiles, ...manifest.motionSync?.redistributableFiles ?? []]);
  const declarations = [...manifest.notices, ...manifest.motionSync?.notices ?? []];
  if (!definitions.some(file => file.path === manifest.entry) || !declarations.length || declarations.some(path => !definitions.some(file => file.path === path)))
    throw new Error('Cubism 运行入口或许可文件未列入运行包');
  const files = [];
  for (const file of definitions) {
    if (!allowed.has(file.path)) throw new Error(`运行文件未获声明再分发：${file.path}`);
    const source = join(directory, file.path);
    if ((await stat(source)).size !== file.bytes) throw new Error(`运行文件缺失或大小不符：${file.path}`);
    files.push({ source, path: `runtime/live2d/${file.path}`, size: file.bytes, role: declarations.includes(file.path) ? 'license' : 'runtime' });
  }
  return { manifest, files };
}

export async function leaseLive2DRuntime(resources, root, lock, target = 'windows') {
  const runtime = await collectLive2DRuntime({ root, lock, target, policy: { purpose: 'localTest', licenseConfirmed: false } });
  const handleId = createId(), leases = [];
  try {
    let url;
    for (const file of runtime.files) {
      const path = file.path.slice('runtime/live2d/'.length);
      const lease = resources.register({ projectId: 'runtimes', assetId: lock.sdkRelease, variantId: handleId,
        relative: path, path: file.source, mime: /\.m?js$/.test(path) ? 'text/javascript' : 'application/octet-stream' });
      leases.push(lease); if (path === runtime.manifest.entry) url = lease.uri;
    }
    return { url, expected: lock, release: () => leases.forEach(lease => lease.release()) };
  } catch (error) { leases.forEach(lease => lease.release()); throw error; }
}
