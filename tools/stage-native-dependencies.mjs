import { cp, mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve, sep, relative } from 'node:path';

// Resolve the installed production graph for the requested Studio host, not the build machine.
export async function stageNativeDependencies(sourcePackage, destination, { platform = process.platform, arch = process.arch, dependencies = ['sharp', 'onnxruntime-node'] } = {}) {
  const copied = new Map();
  await mkdir(join(destination, 'node_modules'), { recursive: true });
  async function visit(name, parentPackage, optional = false) {
    const require = createRequire(parentPackage);
    let packageDirectory;
    for (const searchPath of require.resolve.paths(name) ?? []) {
      const candidate = join(searchPath, name);
      try { if ((await stat(join(candidate, 'package.json'))).isFile()) { packageDirectory = await realpath(candidate); break; } }
      catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
    }
    if (!packageDirectory) { if (optional) return; throw new Error(`Installed native dependency is unavailable: ${name}`); }
    const manifestPath = join(packageDirectory, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const supports = (list, value) => !list || ((!list.some(item => !item.startsWith('!')) || list.includes(value)) && !list.includes(`!${value}`));
    if (optional && (!supports(manifest.os, platform) || !supports(manifest.cpu, arch) || !supports(manifest.libc, 'glibc'))) return;
    if (copied.has(name)) {
      if (copied.get(name) !== manifest.version) throw new Error(`Native graph contains conflicting versions of ${name}`);
      return;
    }
    copied.set(name, manifest.version);
    const nativeRoot = name === 'onnxruntime-node' ? join(packageDirectory, 'bin/napi-v6') : null;
    const nativeTarget = nativeRoot ? join(nativeRoot, platform, arch) : null;
    if (nativeTarget) await stat(join(nativeTarget, 'onnxruntime_binding.node')).catch(error => { if (error.code === 'ENOENT') throw new Error(`onnxruntime-node ${manifest.version} lacks ${platform}/${arch}; prepare matching native files and pass --native-source package.json.`); throw error; });
    const target = join(destination, 'node_modules', name);
    await mkdir(resolve(target, '..'), { recursive: true });
    await cp(packageDirectory, target, { recursive: true, dereference: true,
      filter: path => {
        if (path === join(packageDirectory, 'node_modules') || path.startsWith(join(packageDirectory, 'node_modules') + sep)) return false;
        if (nativeRoot && path.startsWith(nativeRoot + sep)) {
          const parts = relative(nativeRoot, path).split(sep);
          return parts[0] === platform && (parts.length < 2 || parts[1] === arch);
        }
        return true;
      } });
    const optionalDependencies = manifest.optionalDependencies ?? {};
    for (const dependency of Object.keys(manifest.dependencies ?? {})) await visit(dependency, manifestPath, dependency in optionalDependencies);
    for (const dependency of Object.keys(optionalDependencies)) await visit(dependency, manifestPath, true);
  }
  for (const dependency of dependencies) await visit(typeof dependency === 'string' ? dependency : dependency.name, typeof dependency === 'string' ? sourcePackage : dependency.sourcePackage);
  const nativePackages = [
    ...(copied.has('sharp') ? [`@img/sharp-${platform}-${arch}`, ...(['linux', 'darwin'].includes(platform) ? [`@img/sharp-libvips-${platform}-${arch}`] : [])] : []),
    ...(copied.has('@resvg/resvg-js') ? [`@resvg/resvg-js-${platform}-${arch}${platform === 'linux' ? '-gnu' : platform === 'win32' ? '-msvc' : ''}`] : []),
  ];
  for (const dependency of nativePackages) if (!copied.has(dependency)) throw new Error(`Install the exact ${platform}/${arch} optional dependency before staging: ${dependency}`);
  return Object.fromEntries(copied);
}
