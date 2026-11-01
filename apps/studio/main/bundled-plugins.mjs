import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The catalog only selects distributable package directories; the ordinary installer owns their contents. */
export async function readBundledPlugins(root) {
  const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
  const packages = {};
  for (const { id, version, directory } of catalog) {
    packages[id] ??= {};
    if (packages[id][version]) throw new Error(`重复预置插件 ${id}@${version}`);
    packages[id][version] = join(root, directory);
  }
  return packages;
}

export async function installBundledPlugins(plugins, packages) {
  for (const [id, versions] of Object.entries(packages)) for (const [version, directory] of Object.entries(versions)) {
    const inspected = await plugins.inspectPackage({ kind: 'directory', path: directory });
    if (!inspected.ok) throw new Error(inspected.error.message);
    if (inspected.value.manifest.id !== id || inspected.value.manifest.version !== version)
      throw new Error(`预置目录与精确插件不符：${id}@${version}`);
    const installed = await plugins.install({ kind: 'directory', path: directory });
    if (!installed.ok) throw new Error(installed.error.message);
  }
}

export async function readBundledServicePackages(root) {
  return JSON.parse(await readFile(join(root,'catalog.json'),'utf8')).filter(entry=>entry.studioService).map(({id,version})=>({id,version}));
}
