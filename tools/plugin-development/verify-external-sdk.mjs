import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sdk = resolve(process.argv[2] ?? join(root, 'out/sdk'));
const example = process.argv[3] ?? 'complete';
if (!['complete', 'custom-asset', 'video-generation'].includes(example)) throw new Error('Choose a supported independent SDK example');
const testing = join(root, 'tmp/testing'), external = join(testing, 'plugin-sdk-maintenance');
await mkdir(testing, { recursive: true });
await mkdir(external);
const temporary = join(external, 'runtime');
const project = join(external, example);
const execute = promisify(execFile), npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const environment = { ...process.env, TEMP: temporary, TMP: temporary };
const pathKey = Object.keys(environment).find(key => key.toLowerCase() === 'path') ?? 'PATH';
environment[pathKey] = `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${environment[pathKey] ?? ''}`;
const run = async args => execute(process.execPath, [npm, '--cache', join(external, 'npm-cache'), ...args], {
  cwd: project, env: environment, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
let failure, phase = 'prepare';
try {
  await mkdir(temporary);
  await cp(join(root, 'plugins/development-examples', example), project, { recursive: true,
    filter: path => !/(?:^|[\\/])(?:node_modules|package|dist)(?:[\\/]|$)/.test(path) });
  const distribution = JSON.parse(await readFile(join(sdk, 'sdk-distribution.json'), 'utf8'));
  phase = 'install';
  await run(['install', join(sdk, distribution.contracts.artifact), join(sdk, distribution.plugins.artifact), '--ignore-scripts', '--no-audit', '--no-fund']);
  const cli = join(project, 'node_modules/@galcraft/plugins/dist/development/cli.js');
  phase = 'create';
  await execute(process.execPath, [cli, 'create', join(external, 'scaffold'), 'org.example.minimum-node', 'author-tool'], {
    cwd: project, env: environment, windowsHide: true, maxBuffer: 1024 * 1024 });
  for (const script of ['typecheck', 'build', 'check', 'pack']) { phase = script; await run(['run', script]); }
  const lock = JSON.parse(await readFile(join(project, 'package-lock.json'), 'utf8'));
  if (Object.values(lock.packages).some(value => value.link || String(value.resolved ?? '').includes('workspace:'))) throw new Error('External dependency is linked to a workspace');
  const imports = await readFile(join(project, 'src/runtime.ts'), 'utf8');
  if (imports.includes('/registry') || imports.includes('/host')) throw new Error('Example imports an internal host');
} catch (error) { failure = error; }
finally {
  try {
    const path = relative(resolve(testing), resolve(external));
    if (isAbsolute(path) || path !== 'plugin-sdk-maintenance') throw new Error(`Unexpected cleanup target: ${external}`);
    await rm(external, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) { failure = failure ? new AggregateError([failure, error], `SDK check and cleanup failed at ${external}`) : error; }
}
console.log(JSON.stringify({ result: failure ? 'failed' : 'passed', node: process.version, example,
  checks: ['independent tarball install', 'CLI create', 'typecheck', 'CLI build/check/pack', 'closed dependencies'], cleaned: !existsSync(external),
  ...(failure ? { phase, error: String(failure), details: String(failure.stdout ?? '').slice(-4096) + String(failure.stderr ?? '').slice(-4096) } : {}) }));
if (failure) process.exitCode = 1;
