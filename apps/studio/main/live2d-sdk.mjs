import { createId } from '@galcraft/contracts';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { CubismRuntimeManifestSchema } from '@galcraft/contracts';
import { coreVersion } from './live2d-core-version.mjs';
import { collectLive2DRuntime } from './live2d-release.mjs';

export async function installLive2DSDK({ engine, root, sdk, motionSDK }) {
  if (!engine.manifest.entries.live2d) throw new Error('精确引擎没有提供 R4 Framework 适配器');
  const frameworkRoot = dirname(join(engine.directory, engine.manifest.entries.live2d));
  const manifest = CubismRuntimeManifestSchema.parse(JSON.parse(await readFile(join(engine.directory, engine.manifest.entries.live2d), 'utf8')));
  for (const [source, release] of [[sdk, '5-r.4'], ...motionSDK ? [[motionSDK, '5-r.2']] : []]) {
    if ((await readFile(join(source, 'CHANGELOG.md'), 'utf8')).match(/^## \[([^\]]+)\]/m)?.[1] !== release) throw new Error(`需要 SDK ${release}`);
  }
  const core = join(sdk, 'Core/live2dcubismcore.js'), motion = motionSDK ? join(motionSDK, 'Core/CRI/live2dcubismmotionsynccore.js') : null;
  if (!(await readFile(join(sdk, 'Core/RedistributableFiles.txt'), 'utf8')).includes('live2dcubismcore.js')) throw new Error('Cubism Core 不在官方分发清单中');
  if (await coreVersion(core, 'cubism') !== manifest.coreVersion) throw new Error('Cubism Core 与引擎 Framework 所验证版本不符');
  if (motion) {
    if (!(await readFile(join(motionSDK, 'Core/CRI/RedistributableFiles.txt'), 'utf8')).includes('live2dcubismmotionsynccore.js')) throw new Error('MotionSync Core 不在官方分发清单中');
    if (await coreVersion(motion, 'motion') !== manifest.motionSync?.coreVersion) throw new Error('MotionSync Core 版本不符');
  }
  const destination = join(root, manifest.sdkRelease, manifest.coreVersion), staging = `${destination}.staging-${createId()}`;
  const previous = `${destination}.previous-${createId()}`;
  let existing;
  try { existing = CubismRuntimeManifestSchema.parse(JSON.parse(await readFile(join(destination, 'runtime.manifest.json'), 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // An R4-only refresh must retain the R2 Core used by other projects sharing this runtime.
  let motionSource = motion;
  if (!motion && existing?.motionSync) {
    if (existing.motionSync.coreVersion !== manifest.motionSync?.coreVersion) throw new Error('现有 MotionSync 与当前引擎不匹配，请同时导入 R4＋R2 SDK');
    motionSource = join(destination, 'motion/live2dcubismmotionsynccore.js');
    if (await coreVersion(motionSource, 'motion') !== manifest.motionSync.coreVersion) throw new Error('现有 MotionSync Core 不可用，请同时导入 R4＋R2 SDK');
  }
  if (!motionSource) manifest.motionSync = null;
  const lock = { sdkRelease: manifest.sdkRelease, coreVersion: manifest.coreVersion, motionSyncCoreVersion: motion ? manifest.motionSync?.coreVersion ?? null : null,
    sourceUrl: manifest.sourceUrl, instructions: '导入 Cubism Web R4 SDK；使用 MotionSync 时同时导入 R2 SDK。Import Cubism Web R4 and, if needed, MotionSync R2.' };
  let moved = false;
  try {
    await mkdir(staging, { recursive: true });
    for (const file of [...manifest.coreFiles, ...manifest.frameworkFiles, ...manifest.motionSync?.files ?? []]) {
      const source = file.path === 'core/live2dcubismcore.js' ? core : file.path === 'motion/live2dcubismmotionsynccore.js' ? motionSource : join(frameworkRoot, file.path);
      if (!source || (await stat(source)).size !== file.bytes) throw new Error(`运行文件与引擎声明不符：${file.path}`);
      await mkdir(dirname(join(staging, file.path)), { recursive: true }); await copyFile(source, join(staging, file.path));
    }
    await writeFile(join(staging, 'runtime.manifest.json'), JSON.stringify(manifest, null, 2));
    await collectLive2DRuntime({ directory: staging, lock: { ...lock, motionSyncCoreVersion: manifest.motionSync?.coreVersion ?? null },
      target: 'windows', policy: { purpose: 'localTest', licenseConfirmed: false } });
    try { await rename(destination, previous); moved = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(staging, destination); }
    catch (error) { if (moved) await rename(previous, destination); throw error; }
    if (moved) await rm(previous, { recursive: true, force: true });
    return lock;
  } finally { await rm(staging, { recursive: true, force: true }); }
}
