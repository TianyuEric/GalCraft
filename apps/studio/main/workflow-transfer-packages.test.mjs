import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { DefaultTimeoutSecByPurpose, validateJsonData } from '@galcraft/contracts';

it('uploads reference audio through the rebuilt ordinary exact ComfyUI provider package', async () => {
  const testing = resolve(import.meta.dirname, '../../../tmp/testing');
  const root = join(testing, 'user-data/mwp-packaged-workflow');
  expect(root.startsWith(testing + sep)).toBe(true);
  await rm(root, { recursive: true, force: true }); await mkdir(root, { recursive: true });
  const bytes = Buffer.from('RIFF controlled transport bytes'), source = join(root, 'voice.wav'); await writeFile(source, bytes);
  const rows = []; let uploaded = '', sent;
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks);
    response.setHeader('content-type', 'application/json');
    if (request.url === '/upload/image') { uploaded = body.toString(); response.end(JSON.stringify({ name: 'renamed.wav', subfolder: 'actual', type: 'input' })); }
    else if (request.url === '/prompt') { sent = JSON.parse(body.toString()).prompt; response.end(JSON.stringify({ prompt_id: 'controlled' })); }
    else if (request.url === '/history/controlled') response.end(JSON.stringify({ controlled: { status: { completed: true }, outputs: { '2': { audio: [{ filename: 'result.wav', subfolder: 'out', type: 'output' }] } } } }));
    else if (request.url?.startsWith('/view?')) { response.setHeader('content-type', 'audio/wav'); response.end(bytes); }
    else { response.statusCode = 404; response.end('{}'); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  try {
    const config = { id: 'AudioConn', revision: 1, name: 'Controlled exact package', protocol: 'comfyUI', baseUrl: `http://127.0.0.1:${server.address().port}`, auth: 'none', credentialId: null, apiKeyHeader: null, model: '', purposes: ['speech'], parameters: {}, timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, workflowBindingId: null, serverFileRoot: null };
    const workflow = { id: 'AudioFlow', revision: 1, name: 'Audio input', purpose: 'speech', imageUsages: null, graphVersion: '1', editorWorkflowPath: null,
      apiGraph: { '1': { class_type: 'LoadAudio', inputs: { audio: '' } }, '2': { class_type: 'SaveAudio', inputs: { audio: ['1', 0] } } },
      inputs: [{ port: 'referenceAudio', nodeId: '1', classType: 'LoadAudio', input: 'audio', valueType: 'audioFile', transform: 'identity', required: true }],
      uploads: [{ port: 'referenceAudio', method: 'comfyImage', subfolder: 'requested', serverRoot: null }], outputs: [{ nodeId: '2', key: 'audio', kind: 'audio', decoder: 'comfyFileList', group: 'main', role: 'primary', background: 'unknown' }], requiredNodes: [], modelNotes: [] };
    const input = { purpose: 'speech', text: 'cue', language: 'en', voiceId: null, referenceAudio: { localPath: source, mime: 'audio/wav', assetId: null, variantId: null, candidateId: null, artifactIndex: null }, referenceText: null, referenceLanguage: null, emotion: null, speed: null };
    for (const folder of ['official-comfyui']) {
      const instance = (await import(`../../../plugins/${folder}/package/services/index.js`)).createPlugin();
      try {
        const contributions = await instance.activate({ media: { probe: async () => ({ metadata: {} }) } });
        const provider = contributions.generationProviders.find(entry => entry.protocols.includes('comfyUI'));
        expect(provider, folder).toBeTruthy(); expect(provider.version).toBe('0.1.0'); expect(validateJsonData(provider.inputSchema, input).ok).toBe(true);
        const events = []; for await (const event of provider.create(config).submit(input, { config, workflow, requestId: 'Transfer1', directory: join(root, folder), signal: AbortSignal.timeout(10000) })) events.push(event);
        expect(events.at(-1), folder).toMatchObject({ kind: 'output' }); expect(uploaded).toContain('Content-Type: audio/wav'); expect(sent['1'].inputs.audio).toBe('actual/renamed.wav');
        expect(await readFile(events.at(-1).artifacts[0].localPath)).toEqual(bytes);
        rows.push({ folder, version: provider.version, inputSchema: 'passed', upload: 'audio/wav multipart', nodeValue: sent['1'].inputs.audio, fetch: 'same bytes', result: 'passed' });
      } finally { await instance.deactivate(); }
    }
    const evidence = resolve(import.meta.dirname, '../../../test-results/latest/music-workflow-ports/media'); await mkdir(evidence, { recursive: true });
    await writeFile(join(evidence, 'ordinary-packages.json'), JSON.stringify({ executedAt: new Date().toISOString(), environment: 'Windows Node; real loopback HTTP and disk; controlled file probe', rows, externalGenerationRequests: 0, limits: 'Transport/package evidence; no real ComfyUI or audio decoder validation.' }, null, 2));
  } finally { await new Promise(done => server.close(done)); await rm(root, { recursive: true, force: true }); }
}, 20000);
