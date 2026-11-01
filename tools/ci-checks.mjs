import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const plan = JSON.parse(await readFile(join(root, 'tmp/ci-plan.json'), 'utf8'));
const output = join(root, 'test-results/latest/ci');
const report = { result: 'running', packages: plan.packages, checks: [] };
await mkdir(output, { recursive: true });
const commands = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['pnpm'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/);
const candidates = [process.env.npm_execpath, ...commands.flatMap(command => [
  join(dirname(command), 'pnpm.cjs'), join(dirname(command), '../pnpm/bin/pnpm.cjs'),
  join(dirname(command), 'node_modules/pnpm/bin/pnpm.cjs'), join(dirname(command), 'node_modules/corepack/dist/pnpm.js'),
])];
const pnpm = candidates.find(path => path && /(?:pnpm\.(?:c?js))$/.test(path) && existsSync(path));
if (!pnpm) throw new Error('Prepare pnpm 12.3.4 on PATH before running CI checks.');
const run = args => {
  console.log(`pnpm ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [pnpm, ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
  report.checks.push({ args, result: result.status === 0 ? 'passed' : 'failed' });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`Check exited with status ${result.status}`);
};
const filters = plan.packages.flatMap(name => ['--filter', name]);
try {
  if (plan.packages.length) {
    run(['-r', ...plan.packages.flatMap(name => ['--filter', `${name}...`]), '--if-present', 'run', 'build']);
    run(['-r', ...filters, '--if-present', 'run', 'typecheck']);
    run(['-r', '--workspace-concurrency=1', ...filters, '--if-present', 'run', 'test']);
  }
  if (plan.tools) run(['test:tools']);
  if (plan.architecture) run(['check:architecture']);
  if (plan.storybook) run(['storybook:build']);
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.error = String(error); process.exitCode = 1; }
finally { await writeFile(join(output, 'checks.json'), JSON.stringify(report, null, 2)); }
