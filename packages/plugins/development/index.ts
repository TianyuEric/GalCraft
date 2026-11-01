import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import type { PluginManifest } from '../contracts/manifest.js';
import { PluginManifestSchema } from '../contracts/manifest.js';
import type { Issue } from '@galcraft/contracts';
import { RelativePathSchema, TargetSchema } from '@galcraft/contracts';
import { PluginHost } from '../registry/host.js';
import { checkPluginImplementations } from '../registry/package-check.js';
import { scaffoldFiles } from './templates.js';
import { sharedRuntimePlugin } from './shared-runtime.js';
import { normalizeGeneratedCode } from './generated-code.js';
export { checkPackageGraph, checkPluginDefinition, checkPluginImplementations } from '../registry/package-check.js';
export { sharedRuntimePlugin } from './shared-runtime.js';

export type PluginBuildConfig = { manifest: Omit<PluginManifest, 'files' | 'entry'>;
  sources: { definition: string; editor?: string; runtime?: string; services?: string }; output?: string; include?: string[];
  nativeSources?: { target: import('@galcraft/contracts').Target; arch: 'x64' | 'arm64'; source: string }[] };
export async function buildPlugin(directory: string): Promise<{ directory: string; manifest: PluginManifest; issues: Issue[] }> {
  const root = resolve(directory), config: PluginBuildConfig = JSON.parse(await readFile(join(root, 'plugin.config.json'), 'utf8'));
  const output = resolve(root, config.output ?? 'package');
  if (output === root || !relative(root, output) || relative(root, output).startsWith('..')) throw new Error('Build output must be a child of the plugin project');
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  const { build, parseAst } = await import('vite');
  const runtimeBridge = await sharedRuntimePlugin();
  const entry: PluginManifest['entry'] = { runtime: null, editor: null, definition: null, services: null };
  const native = [...config.manifest.native];
  for (const [environment, source] of Object.entries(config.sources)) {
    if (!['definition', 'editor', 'runtime', 'services'].includes(environment) || !source) throw new Error(`Unknown source environment ${environment}`);
    const key = environment as keyof PluginManifest['entry'];
    await build({ configFile: false, root, plugins: [runtimeBridge], logLevel: 'warn', build: { license: { fileName: 'licenses/dependencies.md' }, target: environment === 'services' ? 'node22.12' : undefined, outDir: join(output, environment), emptyOutDir: true,
      minify: false, lib: { entry: resolve(root, source), formats: ['es'], fileName: () => 'index.js' },
      rolldownOptions: { external: [/^node:/] } } });
    entry[key] = `${environment}/index.js`;
  }
  for (const source of config.nativeSources ?? []) {
    const target = TargetSchema.parse(source.target);
    if (!['x64', 'arm64'].includes(source.arch)) throw new Error('Native architecture must be x64 or arm64');
    const environment = `native/${target}-${source.arch}`;
    await build({ configFile: false, root, logLevel: 'warn', build: { license: { fileName: 'licenses/dependencies.md' }, target: 'node22.12', outDir: join(output, environment), emptyOutDir: true,
      minify: false, lib: { entry: resolve(root, RelativePathSchema.parse(source.source)), formats: ['es'], fileName: () => 'index.js' }, rolldownOptions: { external: [/^node:/] } } });
    native.push({ target, arch: source.arch, entry: `${environment}/index.js` });
  }
  await normalizeGeneratedCode(output, parseAst);
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (item.isFile() && /^(?:LICENSE|COPYING|NOTICE)(?:[.-].*)?$/i.test(item.name) || item.isDirectory() && item.name === 'licenses')
      await cp(join(root, item.name), join(output, item.name), { recursive: true });
  }
  for (const included of config.include ?? []) {
    const path = RelativePathSchema.parse(included);
    if (path === 'manifest.json' || path === 'package.json') throw new Error(`Reserved output file ${path}`);
    await mkdir(join(output, path, '..'), { recursive: true }); await writeFile(join(output, path), await readFile(join(root, path)));
  }
  await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module', license: config.manifest.license }));
  const files: PluginManifest['files'] = [];
  const collect = async (directory: string) => {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.name === 'manifest.json' || item.name === '.galcraft-load') continue;
      const path = join(directory, item.name);
      if (item.isDirectory()) await collect(path);
      else files.push({ path: relative(output, path).replaceAll('\\', '/'), size: (await readFile(path)).length });
    }
  };
  await collect(output);
  const manifest = PluginManifestSchema.parse({ ...config.manifest, schemaVersion: 2, entry, native, files });
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { directory: output, manifest, issues: await checkPluginImplementations(output, manifest) };
}
export async function checkPlugin(directory: string): Promise<Issue[]> {
  const manifest = PluginManifestSchema.parse(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')));
  const host = new PluginHost(join(directory, '.galcraft-check'), () => { throw new Error('check must not start a runtime'); });
  const inspected = await host.inspectPackage({ kind: 'directory', path: directory });
  if (!inspected.ok) return inspected.issues;
  return checkPluginImplementations(directory, manifest);
}
export async function packPlugin(directory: string, outputDirectory: string) {
  const issues = await checkPlugin(directory);
  if (issues.some(item => item.severity === 'error')) return { ok: false as const, issues };
  const host = new PluginHost(join(directory, '.galcraft-check'), () => { throw new Error('pack must not start a runtime'); });
  const packed = await host.packPlugin({ directory, outputDirectory });
  return packed.ok ? { ok: true as const, path: packed.value.path, manifest: packed.value.manifest, issues } : { ok: false as const, issues: packed.issues };
}
export type PluginTemplate = 'author-tool' | 'game-system' | 'resource-stage' | 'service-provider' | 'complete';
export async function createPluginProject(input: { directory: string; id: string; template: PluginTemplate; sdkVersion?: string }) {
  const files = scaffoldFiles(input.id, input.template, input.sdkVersion ?? '0.1.0');
  await mkdir(input.directory, { recursive: true });
  if ((await readdir(input.directory)).length) throw new Error('Scaffold destination must be empty');
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(input.directory, path, '..'), { recursive: true });
    await writeFile(join(input.directory, path), contents);
  }
  return { directory: resolve(input.directory), name: basename(input.directory) };
}
