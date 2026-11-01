import { it, expect } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ResourceRegistry } from '@galcraft/media-tools/resources';
import { startStudioService, readActiveService } from './server.mjs';

it('constructs one data owner for two clients, broadcasts mutations, and retains it after detach', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'galcraft-service-')); let constructed = 0, closed = 0;
  let current = null;
  let entry;
  const createHost = async ({ requestContext }) => { constructed++; return { host: { projects: { get currentSession() { return current; }, get currentSessionId() { return current?.sessionId; }, get currentRoot() { return current?.directory; } }, handlers: { projects: { open: true }, documents: { list: true } },
    async call(group, method, ...args) { entry = requestContext()?.entry; if (method === 'open') current = { projectId: 'abcDEF', sessionId: 'defABC', directory: args[0] }; return { ok: true, value: current, warnings: [] }; } }, close: async () => { await writeFile(join(userData, 'recovered.json'), JSON.stringify(current)); closed++; } }; };
  const first = await startStudioService({ userData, createHost });
  try {
    const second = await startStudioService({ userData, createHost });
    expect(second.reused).toBe(true); expect(second.origin).toBe(first.origin); expect(constructed).toBe(1);
    const controller = new AbortController();
    const events = await fetch(`${first.origin}/api/events?client=second`, { signal: controller.signal });
    const reader = events.body.getReader(); await reader.read();
    const response = await fetch(`${first.origin}/api/bridge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group: 'projects', method: 'open', args: ['first-project'], clientId: 'first', entry: 'browser' }) });
    expect((await response.json()).ok).toBe(true);
    expect(entry).toBe('browser');
    const message = new TextDecoder().decode((await reader.read()).value); expect(message).toContain('projectChanged');
    controller.abort();
    expect((await readActiveService(userData)).status.project.directory).toBe('first-project');
    expect(closed).toBe(0);
    const denied = await fetch(`${first.origin}/api/bridge`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.com' }, body: '{}' }); expect(denied.status).toBe(403);
    const inherited = await fetch(`${first.origin}/api/bridge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group: 'constructor', method: 'call', args: [] }) }); expect(inherited.status).toBe(404);
    await first.close(); expect(closed).toBe(1); expect(JSON.parse(await readFile(join(userData, 'recovered.json'), 'utf8')).directory).toBe('first-project');
    expect(await readActiveService(userData)).toBeNull();
  } finally { await first.close(); await rm(userData, { recursive: true, force: true }); }
});

it('serves registered media with real Range and HEAD semantics', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'galcraft-resource-http-'));
  const resources = new ResourceRegistry(), file = join(userData, 'media.bin'); await writeFile(file, Buffer.from([0, 1, 2, 3, 4, 5]));
  const lease = resources.register({ projectId: 'abcDEF', assetId: 'ghiJKL', variantId: 'mnoPQR', relative: 'media.bin', path: file, mime: 'application/octet-stream' });
  const service = await startStudioService({ userData, createHost: async () => ({ host: { handlers: {} }, resources }) });
  try {
    const url = `${service.origin}/resources/${lease.uri.slice('galcraft-resource://'.length)}`;
    const response = await fetch(url, { headers: { range: 'bytes=2-4' } }); expect(response.status).toBe(206); expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3, 4]); expect(response.headers.get('content-range')).toBe('bytes 2-4/6');
    const head = await fetch(url, { method: 'HEAD' }); expect(head.headers.get('content-length')).toBe('6'); expect((await head.arrayBuffer()).byteLength).toBe(0);
    const missing = await fetch(url, { headers: { range: 'bytes=9-' } }); expect(missing.status).toBe(416);
  } finally { lease.release(); await service.close(); await rm(userData, { recursive: true, force: true }); }
});

it('stops a pending owned operation before draining and exposes real local directory entries', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'galcraft-stop-'));
  await writeFile(join(userData, 'chosen.txt'), 'selected local file');
  let release, started; const running = new Promise(resolve => started = resolve); let saved = false;
  const service = await startStudioService({ userData, createHost: async () => ({ host: { handlers: { builds: { test: true } }, call: () => { started(); return new Promise(resolve => release = resolve); } },
    prepareStop: () => release({ ok: false, error: { code: 'CANCELLED' }, issues: [] }), close: async () => { saved = true; } }) });
  try {
    const directory = await fetch(`${service.origin}/api/files/list`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ directory: userData }) }).then(response => response.json());
    expect(directory.entries).toContainEqual({ name: 'chosen.txt', path: join(userData, 'chosen.txt'), kind: 'file' });
    const pending = fetch(`${service.origin}/api/bridge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group: 'builds', method: 'test', args: ['receipt'] }) });
    await running;
    const stop = await fetch(`${service.origin}/api/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); expect(stop.ok).toBe(true);
    expect((await (await pending).json()).error.code).toBe('CANCELLED');
    await service.close(); expect(saved).toBe(true);
  } finally { await service.close(); await rm(userData, { recursive: true, force: true }); }
});
