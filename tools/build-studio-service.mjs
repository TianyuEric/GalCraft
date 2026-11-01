import { rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';

const repo = resolve(import.meta.dirname, '..'), studio = join(repo, 'apps/studio');
// All five entries share this output. Clean once before the first build so an
// obsolete help tree or retired entry cannot survive into a new distribution.
const output = resolve(studio, 'dist-service/service');
if (!output.startsWith(studio + sep)) throw new Error('Service output must remain inside Studio.');
await rm(output, { recursive: true, force: true });
for (const mode of ['service', 'cli', 'worker', 'compiler', 'style']) {
  execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'vite', 'build', '--config', 'vite.service.config.ts', '--mode', mode],
    { cwd: studio, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
}
