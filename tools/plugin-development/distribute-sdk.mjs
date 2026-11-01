import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { copyDistributionLicenses } from '../studio-runtime-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.argv[2] ?? join(root, 'out/sdk'));
await mkdir(output, { recursive: true });
const execute = promisify(execFile);
const manager = process.platform === 'win32' ? process.execPath : 'pnpm';
const managerPrefix = process.platform === 'win32' ? [join(dirname(process.execPath), 'node_modules/corepack/dist/pnpm.js')] : [];
for (const name of ['contracts', 'dsl', 'plugins']) {
  if (name === 'plugins') await rm(join(root, 'packages/plugins/dist'), { recursive: true, force: true });
  await execute(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, `packages/${name}/tsconfig.build.json`)], { cwd: root });
  await cp(join(root, 'LICENSE'), join(root, `packages/${name}/LICENSE`));
  await copyDistributionLicenses(root, join(root, `packages/${name}/dist/licenses/project`));
  await execute(manager, [...managerPrefix, 'pack', '--pack-destination', output], { cwd: join(root, `packages/${name}`) });
}
const contracts = JSON.parse(await readFile(join(root, 'packages/contracts/package.json'), 'utf8'));
const plugins = JSON.parse(await readFile(join(root, 'packages/plugins/package.json'), 'utf8'));
const dsl = JSON.parse(await readFile(join(root, 'packages/dsl/package.json'), 'utf8'));
await writeFile(join(output, 'sdk-distribution.json'), JSON.stringify({ sdkMajor: 0, manifestVersions: [1, 2], engineRange: '^0.1.0',
  contracts: { name: contracts.name, version: contracts.version, artifact: `galcraft-contracts-${contracts.version}.tgz` },
  dsl: { name: dsl.name, version: dsl.version, artifact: `galcraft-dsl-${dsl.version}.tgz`, optional: true },
  plugins: { name: plugins.name, version: plugins.version, artifact: `galcraft-plugins-${plugins.version}.tgz` }, license: 'MPL-2.0', source: 'https://github.com/TianyuEric/GalCraft' }, null, 2));
await copyDistributionLicenses(root, output);
console.log(`SDK distribution: ${output}`);
