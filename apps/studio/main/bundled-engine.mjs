import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { EngineCatalog } from '@galcraft/publishing/engine';
import { renameWithSharingRetry } from '@galcraft/documents';

export async function installBundledEngine(catalog, bundleRoot, version) {
  const bundled = await new EngineCatalog(bundleRoot).resolveEngine(version, 'web');
  if (!bundled.ok) throw new Error(`Studio 默认引擎不可用：${bundled.error.message}。请运行 pnpm --filter @galcraft/studio desktop:prepare。`);
  const installed = await catalog.resolveEngine(version, 'web');
  if (installed.ok) {
    const source = bundled.value.directory, destination = installed.value.directory;
    let same = (await readFile(join(source, 'manifest.json'))).equals(await readFile(join(destination, 'manifest.json')));
    if (same) for (const file of bundled.value.manifest.files) {
      if (!(await readFile(join(source, file.path))).equals(await readFile(join(destination, file.path)))) { same = false; break; }
    }
    if (same) return;
  }
  await mkdir(catalog.directory, { recursive: true });
  const staging = join(catalog.directory, `.install-${version}`);
  const previous = join(catalog.directory, `.previous-${version}`), destination = join(catalog.directory, version);
  let moved = false, committed = false;
  try {
    await rm(staging, { recursive: true, force: true });
    await cp(bundled.value.directory, staging, { recursive: true });
    if (installed.ok || await stat(destination).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) {
      await rm(previous, { recursive: true, force: true });
      await renameWithSharingRetry(destination, previous); moved = true;
    }
    try { await renameWithSharingRetry(staging, destination); committed = true; }
    catch (error) { if (moved) await renameWithSharingRetry(previous, destination); throw error; }
  } finally {
    await rm(staging, { recursive: true, force: true });
    if (committed) await rm(previous, { recursive: true, force: true });
  }
}
