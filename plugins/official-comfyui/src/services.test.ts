import { afterEach, expect, it, vi } from 'vitest';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { ConnectionConfig, SubmissionContext } from '@galcraft/contracts';
import type { PluginContext } from '@galcraft/plugins/contracts';
import { createPlugin } from './services.js';
afterEach(() => vi.unstubAllGlobals());
it('exposes actual resource ports through the public provider adapter', async () => {
  const paths: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => { const path = new URL(url).pathname; paths.push(path);
    return Response.json(path === '/queue' ? { queue_running: [[1, 'another-client']], queue_pending: [] } : { system: { ram_total: 1000, ram_free: 500 }, devices: [] }); });
  const plugin = createPlugin(), contributions = await plugin.activate({} as PluginContext);
  const provider = contributions!.generationProviders![0]!;
  const config: ConnectionConfig = { id: 'Conn01', revision: 1, name: 'Comfy', protocol: 'comfyUI', baseUrl: 'http://comfy.test', credentialId: null, auth: 'none', apiKeyHeader: null, model: '', purposes: ['image'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  const adapter = await provider.create(config);
  const context: SubmissionContext = { config, requestId: 'Req001', directory: '', signal: new AbortController().signal, workflow: null };
  expect(await adapter.inspectResources!(context)).toMatchObject({ ok: true, value: { queue: { running: ['another-client'] } } });
  expect(await adapter.releaseResources!(context)).toMatchObject({ ok: true, value: { status: 'busy' } });
  expect(paths).not.toContain('/free'); expect(paths).not.toContain('/prompt');
});
