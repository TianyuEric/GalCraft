// @ts-check
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { startStudioService } from './server.mjs';
import { studioUserData } from './paths.mjs';
import { servicePort } from '../main/local-service-ports.mjs';
import { studioApplicationRoot } from '../main/application-root.mjs';

/** @param {{ userData?: string; port?: number }} [options] */
export async function runStudioService({ userData = studioUserData(), port } = {}) {
  const { createNodeStudioHost } = await import('./host.mjs');
  const service = await startStudioService({ userData, port, frontendDirectory: join(studioApplicationRoot(), 'dist'), createHost: createNodeStudioHost });
  console.log(`GalCraft Studio ${service.origin}${service.reused ? ' (existing service)' : ''}`);
  if (service.addressChange) console.log(`Studio address changed: ${service.addressChange.previous} → ${service.origin}. Reload clients that saved the previous URL.`);
  if (!service.reused) {
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; try { await service.close(); process.exitCode = 0; } catch (error) { console.error(error); process.exitCode = 1; } };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }
  return service;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  /** @param {string} name */
  const option = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
  Promise.resolve().then(() => runStudioService({ userData: option('--user-data') ?? studioUserData(), port: servicePort(process.argv.includes('--port') ? option('--port') ?? '' : undefined) })).catch(error => { console.error(error); process.exitCode = 1; });
}
