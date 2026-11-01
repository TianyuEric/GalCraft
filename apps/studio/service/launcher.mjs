import { spawn } from 'node:child_process';
import { open, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readActiveService } from './server.mjs';
import { requireServicePort, servicePort } from '../main/local-service-ports.mjs';

export async function ensureStudioService({ userData, executable = process.execPath, entry = join(import.meta.dirname, 'entry.mjs'), env = process.env, port }) {
  port = servicePort(port);
  const current = await readActiveService(userData); if (current) { requireServicePort(port, current.origin); return current; }
  await mkdir(join(userData, 'studio-service'), { recursive: true });
  const log = await open(join(userData, 'studio-service', 'service.log'), 'a');
  let child;
  try {
    child = spawn(executable, [entry, '--user-data', userData, ...(port ? ['--port', String(port)] : [])], {
      detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd], env,
    });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref();
  } finally { await log.close(); }
  for (let attempt = 0; attempt < 600; attempt++) {
    const current = await readActiveService(userData); if (current) { requireServicePort(port, current.origin); return current; }
    if (child.exitCode !== null) throw new Error(`Studio service exited (${child.exitCode}). See ${join(userData, 'studio-service', 'service.log')}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Studio service startup timed out. See ${join(userData, 'studio-service', 'service.log')}`);
}

export async function openStudioBrowser(url) {
  const child = process.platform === 'win32'
    ? spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, detached: true, stdio: 'ignore' })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref();
}
