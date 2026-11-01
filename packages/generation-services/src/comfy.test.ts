import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { ServiceEvent, SubmissionContext } from '@galcraft/contracts';
import { HttpGenerationAdapter } from './adapter.js';
const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function context(): Promise<SubmissionContext> {
  const directory = await mkdtemp(join(tmpdir(), 'galcraft-comfy-')); directories.push(directory);
  return { config: { id: 'Conn01', revision: 1, name: 'Comfy', protocol: 'comfyUI', baseUrl: 'http://comfy.test/', credentialId: null, auth: 'none', apiKeyHeader: null, model: 'fixture', purposes: ['image'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null },
    workflow: { id: 'Graph1', revision: 1, name: 'fixture', purpose: 'image', imageUsages: ['background'], graphVersion: '1', editorWorkflowPath: null,
      apiGraph: { '1': { class_type: 'Sampler', inputs: {}, _meta: { title: 'Sampling node' } }, '2': { class_type: 'Save', inputs: { samples: ['1', 0] } } }, inputs: [], uploads: [],
      outputs: [{ nodeId: '2', key: 'images', kind: 'image', decoder: 'comfyFileList', group: 'image', role: 'primary', background: 'unknown' }], requiredNodes: [], modelNotes: [] }, requestId: 'Client1', directory, signal: new AbortController().signal };
}
class Socket extends EventTarget {
  readyState = 1; closed = false;
  send(type: string, data: object) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type, data }) })); }
  close() { this.closed = true; this.readyState = 3; }
}
const input = { purpose: 'image' as const, usage: 'background' as const, positive: 'fixture', negative: '', width: 64, height: 64, count: 1, seed: 1, references: [] };
const json = (value: unknown) => Response.json(value);
describe('ComfyUI real event semantics', () => {
  it('subscribes before the only POST, filters prompts, distinguishes sampling and cached nodes, and verifies history before output', async () => {
    const ctx = await context(), socket = new Socket(), events: ServiceEvent[] = []; let connected = false, posts = 0;
    const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), webSocket: url => { expect(url).toContain('/ws?clientId=Client1'); connected = true; return socket as unknown as WebSocket; }, fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === '/prompt') { expect(connected).toBe(true); posts++; expect(JSON.parse(String(init?.body)).client_id).toBe(ctx.requestId);
        socket.send('progress', { prompt_id: 'another', value: 99, max: 100 }); socket.send('executing', { prompt_id: 'prompt-1', node: '1' });
        socket.send('execution_cached', { prompt_id: 'prompt-1', nodes: ['2'] }); socket.send('progress', { prompt_id: 'prompt-1', node: '1', value: 12, max: 30 });
        socket.send('executing', { prompt_id: 'prompt-1', node: null }); return json({ prompt_id: 'prompt-1' }); }
      if (path.startsWith('/history/')) return json({ 'prompt-1': { status: { completed: true }, outputs: { '2': { images: [{ filename: 'result.png', type: 'output' }] } } } });
      if (path === '/view') return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }); throw new Error(path);
    } });
    for await (const event of adapter.submit(input, ctx)) events.push(event);
    expect(posts).toBe(1); expect(events).toContainEqual(expect.objectContaining({ kind: 'progress', scope: 'sampling', completed: 12, total: 30, nodeName: 'Sampling node', nodeId: '1' }));
    expect(events).toContainEqual(expect.objectContaining({ kind: 'progress', scope: 'nodes', cachedNodes: ['2'], total: null }));
    expect(events.some(event => event.kind === 'progress' && event.completed === 99)).toBe(false);
    expect(events.at(-1)?.kind).toBe('output'); expect(socket.closed).toBe(true);
  });
  it('retains bounded node errors, and history recovery returns the same structured error', async () => {
    const ctx = await context(), socket = new Socket(), events: ServiceEvent[] = [];
    const data = { prompt_id: 'failed-1', node_id: '1', node_type: 'Sampler', exception_type: 'OutOfMemoryError', exception_message: 'allocation failed', traceback: Array(50).fill('frame'.repeat(300)) };
    const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), webSocket: () => socket as unknown as WebSocket, fetch: async url => {
      if (String(url).endsWith('/prompt')) { socket.send('execution_error', data); return json({ prompt_id: 'failed-1' }); }
      return json({ 'failed-1': { status: { status_str: 'error', messages: [['execution_error', data]] } } });
    } });
    for await (const event of adapter.submit(input, ctx)) events.push(event);
    expect(events.at(-1)).toMatchObject({ kind: 'error', remoteStatus: 'failed', details: { promptId: 'failed-1', nodeId: '1', exceptionType: 'OutOfMemoryError' } });
    const error = events.at(-1); if (error?.kind === 'error') { expect(error.details?.traceback).toHaveLength(20); expect(error.details?.traceback[0]).toHaveLength(1000); }
    const recovered = await adapter.query({ protocol: 'comfyUI', id: 'failed-1', connectionId: 'Conn01', submittedAt: new Date().toISOString() }, ctx);
    expect(recovered).toMatchObject({ ok: true, value: { state: 'failed', errorDetails: { nodeId: '1', exceptionType: 'OutOfMemoryError' } } });
  });
});
describe('ComfyUI instance resource release', () => {
  it('waits beyond HTTP200 for worker resource changes, without a generation POST', async () => {
    const ctx = await context(); let frees = 0, stats = 0, prompts = 0;
    const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), resourcePollMs: 1, resourceWaitMs: 20, fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === '/prompt') prompts++;
      if (path === '/free') { frees++; expect(JSON.parse(String(init?.body))).toEqual({ unload_models: true, free_memory: true }); return new Response(); }
      if (path === '/queue') return json({ queue_running: [], queue_pending: [] });
      if (path === '/system_stats') { stats++; return json({ system: { ram_total: 10000, ram_free: 2000 }, devices: [{ name: 'GPU', type: 'cuda', index: 0, vram_total: 8000, vram_free: stats >= 3 ? 7000 : 2000, torch_vram_total: stats >= 3 ? 0 : 5000, torch_vram_free: 0 }] }); }
      throw new Error(path);
    } });
    const result = await adapter.releaseResources(ctx);
    expect(result).toMatchObject({ ok: true, value: { status: 'observed', before: { devices: [{ vramFree: 2000 }] }, after: { devices: [{ vramFree: 7000 }] } } });
    expect(stats).toBeGreaterThanOrEqual(3); expect(frees).toBe(1); expect(prompts).toBe(0);
  });
  it.each([{ busy: true, total: 5000, expected: 'busy' }, { busy: false, total: 5000, expected: 'unverified' }, { busy: false, total: 0, expected: 'idle' }])('reports $expected from actual queue and resource observations', async ({ busy, total, expected }) => {
    const ctx = await context(); let frees = 0;
    const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), resourcePollMs: 1, resourceWaitMs: 3, fetch: async url => {
      const path = new URL(String(url)).pathname;
      if (path === '/free') { frees++; return new Response(); }
      if (path === '/queue') return json({ queue_running: busy ? [[0, 'other-client']] : [], queue_pending: [] });
      return json({ system: { ram_total: 10000, ram_free: 2000 }, devices: [{ name: 'GPU', type: 'cuda', index: 0, torch_vram_total: total }] });
    } });
    expect(await adapter.releaseResources(ctx)).toMatchObject({ ok: true, value: { status: expected } }); expect(frees).toBe(busy ? 0 : 1);
  });
  it('does not retry a rejected free POST or release when the complete queue cannot be read', async () => {
    const ctx = await context(); let frees = 0;
    const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async url => {
      const path = new URL(String(url)).pathname;
      if (path === '/free') { frees++; return new Response('', { status: 500 }); }
      if (path === '/queue') return json({ queue_running: [], queue_pending: [] }); return json({});
    } });
    expect(await adapter.releaseResources(ctx)).toMatchObject({ ok: false, error: { code: 'RESOURCE_RELEASE' } }); expect(frees).toBe(1);
  });
});
