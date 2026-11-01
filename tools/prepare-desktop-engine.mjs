import { access, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { prepareMediaTools } from './media/prepare.mjs';

const repo = resolve(import.meta.dirname, '..');
const pluginCatalog = JSON.parse(await readFile(join(repo, 'plugins/catalog.json'), 'utf8'));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
for (const name of new Set(pluginCatalog.map(item => item.buildPackage).filter(Boolean))) {
  execFileSync(pnpm, ['--filter', name, 'build'], { cwd: repo, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
}
execFileSync(process.execPath, [join(repo, 'tools/prepare-branding.mjs')], { cwd: repo, stdio: 'inherit' });
await prepareMediaTools();
const fonts = resolve(process.env.GALCRAFT_FONT_DIR ?? join(repo, 'tools/fonts/cache'));
try {
  const catalog = JSON.parse(await readFile(join(fonts, 'fonts.json'), 'utf8'));
  await Promise.all([...catalog.fonts.map(font => font.path), catalog.license, 'UPSTREAM.md'].map(file => access(join(fonts, file))));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  execFileSync(process.execPath, [join(repo, 'tools/fonts/prepare.mjs'), fonts], { cwd: repo, stdio: 'inherit' });
}
const buildRoot = join(repo, 'build/desktop');
const version = '0.1.0';
const destination = resolve(buildRoot, 'engines', version);
if (!destination.startsWith(resolve(buildRoot) + sep)) throw new Error('Engine output must stay inside the desktop build directory');
await rm(destination, { recursive: true, force: true });
execFileSync(process.execPath, [join(repo, 'tools/package-engine.mjs'), destination, version], { cwd: repo, stdio: 'inherit' });
