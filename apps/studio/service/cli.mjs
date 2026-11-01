#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { studioUserData } from './paths.mjs';
import { readActiveService } from './server.mjs';
import { ensureStudioService, openStudioBrowser } from './launcher.mjs';
import { servicePort } from '../main/local-service-ports.mjs';

export async function studioCli(args = process.argv.slice(2)) {
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'start';
  const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const userData = option('--user-data') ? resolve(option('--user-data')) : studioUserData();
  if (args.includes('--help') || command === 'help') {
    console.log('GalCraft Studio\n\n  galcraft-studio [start] [--no-open] [--port PORT] [--user-data DIRECTORY]\n  galcraft-studio serve [--port PORT] [--user-data DIRECTORY]\n  galcraft-studio status [--user-data DIRECTORY]\n  galcraft-studio stop [--user-data DIRECTORY]\n  galcraft-studio prepare-browser\n\nClosing a window or browser tab keeps the local service running. Use stop or Ctrl+C in serve to stop it.'); return;
  }
  if (command === 'prepare-browser') {
    const cli = createRequire(import.meta.url).resolve('playwright/cli');
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Browser preparation exited (${code}).`))); }); return;
  }
  const port = servicePort(args.includes('--port') ? option('--port') ?? '' : undefined);
  if (command === 'serve') { const { runStudioService } = await import('./entry.mjs'); await runStudioService({ userData, port }); return; }
  if (command === 'status' || command === 'stop') {
    const active = await readActiveService(userData);
    if (!active) { console.log('Studio service is stopped.'); return; }
    if (command === 'status') { console.log(JSON.stringify(active.status, null, 2)); return; }
    const response = await fetch(`${active.origin}/api/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error(`Studio stop returned HTTP ${response.status}`);
    console.log('Studio is saving recovery data and stopping.'); return;
  }
  if (command !== 'start') throw new Error(`Unknown command: ${command}`);
  const service = await ensureStudioService({ userData, port }); console.log(service.origin);
  if (service.addressChange) console.log(`Studio address changed: ${service.addressChange.previous} → ${service.origin}. Reload clients that saved the previous URL.`);
  if (!args.includes('--no-open')) await openStudioBrowser(service.origin);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) studioCli().catch(error => { console.error(error.message ?? error); process.exitCode = 1; });
