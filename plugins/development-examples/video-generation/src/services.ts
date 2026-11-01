import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin, PluginSubmissionContext } from '@galcraft/plugins/contracts';
import type { Artifact, Json, RemoteRef, RemoteStatus, Result } from '@galcraft/contracts';
import { operation, operationId, capabilities } from './definition.js';
const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
export function createPlugin(): GalCraftPlugin { return { activate: async () => ({ ...emptyContributions(), generationProviders: [{
  key: 'org.example.video/provider', version: '0.1.0', purposes: [operationId], configFields: [], capabilities,
  inputSchema: { type: 'object', required: ['purpose', 'fields', 'references'], properties: { purpose: { const: operationId }, fields: operation.inputSchema, references: { type: 'array' } }, additionalProperties: false },
  outputSchema: { type: 'object', required: ['artifacts', 'usage'], properties: { artifacts: { type: 'array', minItems: 1, items: { type: 'object', required: ['kind', 'mime', 'port'], properties: { kind: { const: 'video' }, mime: { const: 'video/mp4' }, port: { const: 'video' } } } }, usage: {} } },
  create(config) {
    const request = async (path: string, ctx: PluginSubmissionContext, body?: unknown): Promise<Response> => {
      const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout((config.timeoutSecByPurpose[operationId] ?? 600) * 1000)]);
      const response = await fetch(config.baseUrl.replace(/\/$/, '') + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal });
      if (!response.ok) throw new Error(`Simulation HTTP ${response.status}`); return response;
    };
    const query = async (ref: RemoteRef, ctx: PluginSubmissionContext): Promise<Result<RemoteStatus>> => ok(await (await request(`/history/${encodeURIComponent(ref.id)}`, ctx)).json() as RemoteStatus);
    const fetchOutput = async (ref: RemoteRef, output: Json, ctx: PluginSubmissionContext): Promise<Result<Artifact[]>> => {
      const data = output as { filename: string; metadata: Json };
      const bytes = new Uint8Array(await (await request(`/view/${encodeURIComponent(ref.id)}`, ctx)).arrayBuffer());
      await mkdir(ctx.directory, { recursive: true }); const path = join(ctx.directory, 'result.mp4'); await writeFile(path, bytes);
      return ok([{ kind: 'video', typeVersion: 1, port: 'video', localPath: path, mime: 'video/mp4', bytes: bytes.length, metadata: data.metadata, groupId: ref.id, role: 'primary', background: null }]);
    };
    return {
      inspect: async (_config, purpose) => ({ connectionId: config.id, connectionRevision: config.revision, checkedAt: new Date().toISOString(), serviceVersion: 'minimax-h3-local-simulation/1', purpose, status: 'verified', inputs: [{ port: 'fields', required: true, supported: true, limits: {} }, { port: 'references', required: false, supported: true, limits: {} }], output: 'video', models: ['MiniMax H3'], promptFormat: 'natural', textVision: null, remote: { query: true, cancelQueued: true, cancelRunning: 'perTask' }, issues: [] }),
      async *submit(input, ctx) {
        if (input.purpose !== operationId) throw new Error('Unsupported operation');
        const references = await Promise.all(input.references.map(async media => ({ mime: media.mime, bytes: Buffer.from(await readFile(media.localPath)).toString('base64') })));
        const node = references.length ? 'MinimaxHailuo03ReferenceNode' : 'MinimaxHailuo03TextToVideoNode';
        const response = await request('/prompt', ctx, { request_id: ctx.requestId, prompt: { '23': { class_type: node, inputs: input.fields }, '8': { class_type: 'SaveVideo', inputs: { video: ['23', 0], filename_prefix: 'video/MiniMax_H3' } } }, references });
        const accepted = await response.json() as { prompt_id: string };
        const ref: RemoteRef = { protocol: 'plugin', id: accepted.prompt_id, connectionId: config.id, submittedAt: new Date().toISOString() };
        yield { kind: 'accepted', remote: ref };
        while (true) {
          const status = await query(ref, ctx); if (!status.ok) throw new Error(status.error.message);
          if (status.value.state === 'completed') { const result = await fetchOutput(ref, status.value.output!, ctx); if (!result.ok) throw new Error(result.error.message); yield { kind: 'output', artifacts: result.value, usage: { simulation: true } }; return; }
          if (!['queued', 'running'].includes(status.value.state)) throw new Error(`Simulation task ${status.value.state}`);
          yield { kind: 'progress', phase: status.value.state, completed: null, total: null };
          await delay(80, undefined, { signal: ctx.signal });
        }
      }, query, fetch: fetchOutput,
      cancel: async (ref, ctx) => { await request(`/cancel/${encodeURIComponent(ref.id)}`, ctx, {}); return { local: 'stopped', remote: 'confirmed' }; },
    };
  },
}] }), deactivate: async () => {} }; }
