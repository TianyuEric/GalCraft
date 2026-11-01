#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const applicationUrl = version => `https://github.com/TianyuEric/GalCraft/releases/download/v${version}/galcraft-studio-${version}.tgz`;
const pause = () => new Promise(resolvePause => setTimeout(resolvePause, 250));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };

export async function runNode(file, args) {
  const child = spawn(process.execPath, [file, ...args], { stdio: 'inherit', windowsHide: true });
  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  try {
    return await new Promise((resolveRun, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolveRun(code ?? (signal === 'SIGINT' ? 130 : 143)));
    });
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
}

async function installApplication(prefix, url) {
  const configured = process.env.npm_execpath;
  const npm = configured && basename(configured) === 'npm-cli.js'
    ? configured : join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  await access(npm);
  const code = await runNode(npm, ['install', '--prefix', prefix, '--omit=dev', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/', url]);
  if (code !== 0) throw new Error(`GalCraft preparation exited (${code}). Run the same command to retry.`);
}

export async function ensureApplication({ version, cache, install = installApplication, log = console.error }) {
  const prefix = join(cache, 'application');
  const application = join(prefix, 'node_modules/@galcraft/studio');
  const cli = join(application, 'service/cli.mjs');
  const marker = join(cache, 'installed.json');
  const lock = join(cache, 'install.lock');
  const url = applicationUrl(version);
  const ready = async () => {
    try {
      const installed = JSON.parse(await readFile(marker, 'utf8'));
      const metadata = JSON.parse(await readFile(join(application, 'package.json'), 'utf8'));
      if (installed.version !== version || installed.url !== url || metadata.name !== '@galcraft/studio' || metadata.version !== version) return false;
      await access(cli);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return false;
      throw error;
    }
  };
  await mkdir(cache, { recursive: true });
  if (await ready()) return cli;
  let waiting = false, incompleteLockSince;
  for (;;) {
    if (await ready()) return cli;
    try { await writeFile(lock, String(process.pid), { flag: 'wx' }); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    let owner;
    try { owner = Number(await readFile(lock, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (Number.isInteger(owner) && owner > 0) {
      incompleteLockSince = undefined;
      if (!alive(owner)) { await rm(lock, { force: true }); continue; }
    } else {
      incompleteLockSince ??= Date.now();
      if (Date.now() - incompleteLockSince >= 2000) { await rm(lock, { force: true }); continue; }
    }
    if (!waiting) { log('Another GalCraft command is preparing this version. Waiting for it to finish.'); waiting = true; }
    await pause();
  }
  try {
    if (await ready()) return cli;
    log(`Preparing GalCraft Studio ${version} from its GitHub release (about 326 MiB, plus npm dependencies). This first run needs network access; later runs reuse the installed application.`);
    await install(prefix, url);
    const metadata = JSON.parse(await readFile(join(application, 'package.json'), 'utf8'));
    if (metadata.name !== '@galcraft/studio' || metadata.version !== version) throw new Error('The installed GalCraft application has a different name or version.');
    await access(cli);
    const temporary = join(cache, `installed-${process.pid}.json`);
    await writeFile(temporary, JSON.stringify({ version, url }));
    await rename(temporary, marker);
    return cli;
  } finally { await rm(lock, { force: true }); }
}

export async function studioEntry(args = process.argv.slice(2)) {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData/Local');
  const cli = await ensureApplication({ version, cache: join(local, 'GalCraft/npm-studio', version) });
  return runNode(cli, args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  studioEntry().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message ?? error); process.exitCode = 1; });
}
