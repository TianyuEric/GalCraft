import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DefaultTimeoutSecByPurpose, type ConnectionConfig, type GenerationInput, type WorkflowBinding } from '@galcraft/contracts';
import { HttpGenerationAdapter } from './adapter.js';
let root: string, server: Server;
afterEach(async () => { if (server) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); if (root) await rm(root, { recursive: true, force: true }); });
const binding = (): WorkflowBinding => ({ id: 'AudioFlow', revision: 1, name: 'Reference audio', purpose: 'speech', imageUsages: null, graphVersion: '1', editorWorkflowPath: null,
  apiGraph: { '1': { class_type: 'LoadAudio', inputs: { audio: '' } }, '2': { class_type: 'SaveAudio', inputs: { audio: ['1', 0] } } },
  inputs: [{ port: 'referenceAudio', nodeId: '1', classType: 'LoadAudio', input: 'audio', valueType: 'audioFile', transform: 'identity', required: true }], uploads: [{ port: 'referenceAudio', method: 'comfyImage', subfolder: 'requested', serverRoot: null }],
  outputs: [{ nodeId: '2', key: 'audio', kind: 'audio', decoder: 'comfyFileList', group: 'main', role: 'primary', background: 'unknown' }], requiredNodes: [], modelNotes: [] });
it.each(['comfyImage', 'serverPath'] as const)('delivers reference audio using %s with real HTTP and disk paths', async method => {
  const parent = resolve(import.meta.dirname, '../../../tmp/testing/user-data'); await mkdir(parent, { recursive: true }); root = await mkdtemp(join(parent, 'workflow-transfer-'));
  const source = join(root, 'voice.wav'), bytes = Buffer.from('RIFF controlled audio'); await writeFile(source, bytes);
  let uploaded = '', graph: any; const requests: string[] = [];
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks);
    requests.push(`${request.method} ${request.url}`); response.setHeader('Content-Type', 'application/json');
    if (request.url === '/upload/image') { uploaded = body.toString(); response.end(JSON.stringify({ name: 'server-renamed.wav', subfolder: 'actual', type: 'input' })); }
    else if (request.url === '/prompt') { graph = JSON.parse(body.toString()).prompt; response.end(JSON.stringify({ prompt_id: 'original-request' })); }
    else if (request.url === '/history/original-request') response.end(JSON.stringify({ 'original-request': { status: { completed: true }, outputs: { '2': { audio: [{ filename: 'result.wav', subfolder: 'outputs', type: 'output' }] } } } }));
    else if (request.url?.startsWith('/view?')) { response.setHeader('Content-Type', 'audio/wav'); response.end(bytes); }
    else { response.statusCode = 404; response.end('{}'); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address() as { port: number }, config: ConnectionConfig = { id: 'AudioConnection', revision: 1, name: 'Controlled HTTP', protocol: 'comfyUI', baseUrl: `http://127.0.0.1:${address.port}`, auth: 'none', credentialId: null, apiKeyHeader: null, model: '', purposes: ['speech'], parameters: {}, timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, workflowBindingId: null, serverFileRoot: join(root, 'shared'), serverReadRoot: '/input' };
  const workflow = binding(); workflow.uploads[0]!.method = method;
  const input: GenerationInput = { purpose: 'speech', text: 'hello', language: 'en', voiceId: null, referenceAudio: { localPath: source, mime: 'audio/wav', assetId: null, variantId: null, candidateId: null, artifactIndex: null }, referenceText: null, referenceLanguage: null, emotion: null, speed: null };
  const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch });
  const events = []; for await (const event of adapter.submit(input, { config, workflow, requestId: 'RequestTransfer', directory: join(root, 'result'), signal: AbortSignal.timeout(10000) })) events.push(event);
  expect(events.at(-1)?.kind).toBe('output'); expect(requests.filter(request => request === 'POST /prompt')).toHaveLength(1);
  if (method === 'comfyImage') { expect(uploaded).toContain('Content-Type: audio/wav'); expect(uploaded).toContain('RIFF controlled audio'); expect(graph['1'].inputs.audio).toBe('actual/server-renamed.wav'); }
  else { expect(uploaded).toBe(''); expect(graph['1'].inputs.audio).toBe('/input/requested/RequestTransfer-voice.wav'); expect(await readFile(join(root, 'shared/requested/RequestTransfer-voice.wav'))).toEqual(bytes); }
  expect(requests.some(request => request.startsWith('GET /view?filename=result.wav&subfolder=outputs&type=output'))).toBe(true);
});
