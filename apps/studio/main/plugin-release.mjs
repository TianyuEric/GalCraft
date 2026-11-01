import { readFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { init, parse } from 'es-module-lexer';
import { pluginDependencies } from '@galcraft/plugins/contracts';

const runtimeKinds = new Set(['command', 'condition', 'resource', 'stage', 'page', 'component', 'system', 'platform']);
export function runtimePluginClosure(lock, manifests, target) {
  const result = new Set(), visiting = new Set();
  const visit = id => {
    if (result.has(id)) return;
    if (visiting.has(id)) throw new Error(`Runtime dependency cycle: ${id}`);
    const manifest = manifests.get(id), dependency = lock.plugins.find(item => item.id === id);
    if (!manifest || !dependency || !dependency.targets.includes(target)) throw new Error(`Missing exact runtime dependency: ${id}`);
    visiting.add(id);
    for (const needed of pluginDependencies(manifest, 'runtime', target)) visit(needed.id);
    visiting.delete(id); result.add(id);
  };
  for (const dependency of lock.plugins) {
    const manifest = manifests.get(dependency.id);
    if (dependency.targets.includes(target) && manifest?.entry.runtime) visit(dependency.id);
  }
  return result;
}

/** New packages carry only the runtime module graph and the selected native architecture. */
export async function runtimePluginFiles(directory, manifest, target, arch) {
  await init;
  const native = manifest.native.filter(item => item.target === target && item.arch === arch);
  const selected = new Set(['package.json']), listed = new Map(manifest.files.map(file => [file.path, file]));
  const visit = async path => {
    if (selected.has(path)) return;
    if (!listed.has(path)) throw new Error(`Runtime module is absent from file list: ${path}`);
    selected.add(path);
    if (!/\.(?:m?js|cjs)$/.test(path)) return;
    const source = await readFile(join(directory, path), 'utf8');
    const references = [];
    for (const item of parse(source, path)[0]) {
      if (item.d === -2) {
        const asset = source.slice(0, item.s).match(/new\s+URL\s*\(\s*(['"])([^'"\r\n]+)\1\s*,\s*$/);
        if (asset && !asset[2].endsWith('/') && asset[2] !== '.') references.push(asset[2]);
      } else if (item.n) references.push(item.n);
    }
    if (/\.cjs$/.test(path)) for (const match of source.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)) references.push(match[2]);
    for (const reference of references) {
      if (!reference.startsWith('.')) continue;
      const dependency = posix.normalize(posix.join(posix.dirname(path), reference.split(/[?#]/)[0]));
      if (dependency.startsWith('../')) throw new Error(`Runtime import leaves its package: ${path}`);
      await visit(dependency);
    }
  };
  if (manifest.schemaVersion === 1) {
    for (const file of manifest.files) if (file.path !== manifest.entry.editor && !file.path.startsWith('editor/') && !file.path.endsWith('.map')) selected.add(file.path);
  } else {
    if (manifest.entry.runtime) await visit(manifest.entry.runtime);
    // Runtime-owned assets and lazy modules may be selected by data rather than literal imports.
    const runtimeRoot = manifest.entry.runtime && posix.dirname(manifest.entry.runtime);
    if (runtimeRoot && runtimeRoot !== '.') for (const file of manifest.files) if (file.path.startsWith(`${runtimeRoot}/`) && !file.path.endsWith('.map')) await visit(file.path);
  }
  for (const item of native) {
    await visit(item.entry);
    const folder = posix.dirname(item.entry);
    for (const file of manifest.files) if (folder !== '.' && file.path.startsWith(`${folder}/`) && !file.path.endsWith('.map')) selected.add(file.path);
  }
  const otherNative = manifest.native.filter(item => !native.includes(item));
  const files = manifest.files.filter(file => selected.has(file.path) && !otherNative.some(item => file.path === item.entry || posix.dirname(item.entry) !== '.' && posix.dirname(item.entry) !== posix.dirname(native[0]?.entry ?? '') && file.path.startsWith(`${posix.dirname(item.entry)}/`)));
  return { files, native };
}

export function runtimeManifest(manifest, files, native, target) {
  const { studio, environmentDependencies, ...rest } = manifest;
  return { ...rest, schemaVersion: 1, entry: { runtime: manifest.entry.runtime, editor: null },
    dependencies: pluginDependencies(manifest, 'runtime', target).map(({ id, range }) => ({ id, range })),
    contributions: manifest.contributions.filter(item => runtimeKinds.has(item.kind) && !(item.kind === 'resource' && manifest.entry.services) && item.targets.includes(target)), native, files };
}
