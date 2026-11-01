import { afterEach, expect, it } from 'vitest';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPlugin, checkPlugin, createPluginProject, packPlugin } from './index.js';
import { PluginHost } from '../registry/host.js';
import { validatePluginData } from '../contracts/validation.js';

const root = resolve('../../tmp/testing/plugin-tooling');
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
it('builds, checks, packs and normally installs the complete public scaffold', async () => {
  const project = join(root, 'complete');
  await createPluginProject({ directory: project, id: 'org.example.complete', template: 'complete' });
  // This local unit fixture resolves installed workspace dependencies; the external acceptance uses SDK tarballs.
  await mkdir(join(project, 'node_modules/@galcraft'), { recursive: true });
  await symlink(resolve('.'), join(project, 'node_modules/@galcraft/plugins'), 'junction');
  await symlink(resolve('../contracts'), join(project, 'node_modules/@galcraft/contracts'), 'junction');
  const built = await buildPlugin(project);
  expect(built.issues).toEqual([]);
  expect(new Set(built.manifest.contributions.map(item => item.kind)).size).toBe(14);
  expect(await checkPlugin(built.directory)).toEqual([]);
  const packed = await packPlugin(built.directory, join(root, 'archives')); if (!packed.ok) throw packed.issues;
  const host = new PluginHost(join(root, 'store'), () => { throw new Error('install does not activate'); });
  const installed = await host.install({ kind: 'archive', path: packed.path });
  expect(installed.ok).toBe(true);
  expect((await readFile(join(built.directory, 'runtime/index.js'), 'utf8')).includes('__GalCraftReact__')).toBe(true);
  await host.dispose();
}, 30_000);
it('cleans generated service and native syntax before measuring manifests while preserving content', async () => {
  const project = join(root, 'whitespace');
  await createPluginProject({ directory: project, id: 'org.example.whitespace', template: 'service-provider' });
  await mkdir(join(project, 'node_modules/@galcraft'), { recursive: true });
  await symlink(resolve('.'), join(project, 'node_modules/@galcraft/plugins'), 'junction');
  await symlink(resolve('../contracts'), join(project, 'node_modules/@galcraft/contracts'), 'junction');
  await symlink(resolve('node_modules/semver'), join(project, 'node_modules/semver'), 'junction');
  const probe = "\nexport { valid as validVersion } from 'semver';\n"
    + 'export const literal = String.raw`first  \n${"middle"}last\t \n`;\n';
  await writeFile(join(project, 'src/services.ts'), await readFile(join(project, 'src/services.ts'), 'utf8') + probe);
  await writeFile(join(project, 'src/native.ts'), 'export function createPlatformProvider() { return { invoke: async () => ({ ok: true, value: null, warnings: [] }) }; }' + probe);
  const configPath = join(project, 'plugin.config.json'), config = JSON.parse(await readFile(configPath, 'utf8'));
  config.manifest.license = 'MIT';
  config.nativeSources = [{ target: 'windows', arch: 'x64', source: 'src/native.ts' }];
  config.include = ['verbatim.txt', 'binary.bin'];
  const includedText = 'author content  \r\nlast\t ', includedBytes = Buffer.from([0xff, 0x20, 0x0a, 0x09, 0x00]);
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(join(project, 'verbatim.txt'), includedText);
  await writeFile(join(project, 'binary.bin'), includedBytes);
  await writeFile(join(project, 'LICENSE'), 'Plugin author license\n');
  await mkdir(join(project, 'licenses'), { recursive: true });
  await writeFile(join(project, 'licenses/upstream.txt'), 'Upstream attribution\n');
  const built = await buildPlugin(project);
  expect(built.issues).toEqual([]);
  for (const entry of ['services/index.js', 'native/windows-x64/index.js']) {
    const code = await readFile(join(built.directory, entry), 'utf8');
    expect(code).toContain('MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER ||\n');
    const module = await import(pathToFileURL(join(built.directory, entry)).href);
    expect(module.validVersion('0.1.0')).toBe('0.1.0');
    expect(module.literal).toBe('first  \nmiddlelast\t \n');
  }
  expect(await readFile(join(built.directory, 'verbatim.txt'), 'utf8')).toBe(includedText);
  expect(await readFile(join(built.directory, 'binary.bin'))).toEqual(includedBytes);
  expect(built.manifest.license).toBe('MIT');
  expect(JSON.parse(await readFile(join(built.directory, 'package.json'), 'utf8')).license).toBe('MIT');
  expect(await readFile(join(built.directory, 'LICENSE'), 'utf8')).toBe('Plugin author license\n');
  expect(await readFile(join(built.directory, 'licenses/upstream.txt'), 'utf8')).toBe('Upstream attribution\n');
  expect(built.manifest.files.some(file => file.path === 'services/licenses/dependencies.md')).toBe(true);
  for (const file of built.manifest.files) expect((await readFile(join(built.directory, file.path))).length).toBe(file.size);
  expect(await checkPlugin(built.directory)).toEqual([]);
}, 30_000);
it('validates nested schema and reports unsupported references before a commit', () => {
  const schema = { type: 'object', properties: { count: { type: 'integer', minimum: 1 }, names: { type: 'array', items: { type: 'string', minLength: 2 } } }, required: ['count'], additionalProperties: false };
  expect(validatePluginData(schema, { count: 2, names: ['abc'] }).ok).toBe(true);
  expect(validatePluginData(schema, { count: 0, names: ['a'], extra: true })).toMatchObject({ ok: false, issues: expect.any(Array) });
  expect(validatePluginData({ $ref: './other.json' }, {})).toMatchObject({ ok: false });
});
