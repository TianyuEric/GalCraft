import { expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DefaultTimeoutSecByPurpose, validateProductionOperationDefinition } from '@galcraft/contracts';
import type { ConnectionConfig, GenerationInput, Json, ServiceEvent, SubmissionContext } from '@galcraft/contracts';
import { VoiceStudioAdapter } from './services.js';
import { createDefinition, operations, pluginId, providerKey } from './definition.js';

const config = (model = 'omnivoice'): ConnectionConfig => ({ id: 'Conn01', revision: 1, name: 'VoiceStudio test', protocol: 'voiceStudio', providerKey, baseUrl: 'http://voice.test',
  model, auth: 'none', credentialId: null, apiKeyHeader: null, purposes: ['speech'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null });
function fixture() {
  const calls: { path: string; body?: BodyInit | null }[] = [];
  const profile = { id: 'voice01', name: 'Actual saved voice', language: 'English', ref_text: 'reference words', ref_audio_path: 'voice01.wav', kind: 'clone' };
  const wav = Buffer.alloc(46); wav.write('RIFF'); wav.writeUInt32LE(38, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2, 40);
  const state = { model: 'actual/repo', profile, post: async (_path: string, _init?: RequestInit) => new Response(wav, { headers: { 'Content-Type': 'audio/wav', 'X-Audio-Id': 'take01' } }) };
  const request: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, body: init?.body });
    if (init?.method === 'POST') return state.post(path, init);
    const responses: Record<string, unknown> = {
      '/health': { status: 'ok', version: '0.5.6' }, '/engines/tts': { active: 'omnivoice', active_model: state.model, backends: [
        { id: 'omnivoice', display_name: 'Actual OmniVoice', available: true, supports_cloning: true, supports_emotion: false, max_ref_seconds: 20, docs_url: 'https://example.test/omnivoice' },
        { id: 'kittentts', available: true, supports_cloning: false, supports_emotion: false }, { id: 'cosyvoice', available: true, supports_cloning: true }, { id: 'voxcpm2', available: true, supports_cloning: true }, { id: 'missing', available: false, reason: 'not installed' },
      ] }, '/models': { models: [{ repo_id: state.model, label: 'Installed actual weights', engines: ['omnivoice'], installed: true, note: 'Actual model terms' }] },
      '/profiles': [state.profile], '/personalities': [{ id: 'narrator', name: 'Narrator', instruct: 'middle-aged, low pitch' }],
      '/engines/asr': { active: 'faster-whisper', active_model: 'actual/asr-repo', backends: [{ id: 'faster-whisper', available: true }] },
    };
    if (!(path in responses)) throw new Error(`Unexpected request ${path}`);
    return Response.json(responses[path]);
  };
  return { state, calls, request, wav };
}
const fields = (mode: string, patch: Record<string, Json> = {}) => ({ purpose: `${pluginId}/${mode}` as const, fields: { ...Object.fromEntries(operations.find(operation => operation.id.endsWith(`/${mode}`))!.fields.map(field => [field.path, field.default])), text: 'Hello.', ...patch }, references: [] }) as GenerationInput;
async function run(adapter: VoiceStudioAdapter, input: GenerationInput, cfg = config()) {
  const base = resolve(import.meta.dirname, '../../../tmp/testing'); await mkdir(base, { recursive: true }); const directory = await mkdtemp(join(base, 'voicestudio-'));
  const events: ServiceEvent[] = []; let authorizations = 0;
  const context: SubmissionContext = { requestId: 'Req001', config: cfg, directory, workflow: null, signal: new AbortController().signal, beforeSend: async () => { authorizations++; } };
  for await (const event of adapter.submit(input, context)) events.push(event);
  return { directory, events, authorizations, async close() { await rm(directory, { recursive: true, force: true }); } };
}
it('publishes exact ordinary definitions and discovers actual engines/models/voices without generating', async () => {
  const data = fixture(), adapter = new VoiceStudioAdapter(config(), { fetch: data.request, credential: async () => null });
  for (const operation of createDefinition().productionOperations!) validateProductionOperationDefinition(operation, { id: pluginId, version: '0.1.0' });
  const report = await adapter.inspect(config(), 'speech');
  expect(report.status).toBe('unverified'); expect(report.models).toEqual(['omnivoice', 'kittentts', 'cosyvoice', 'voxcpm2']);
  expect(report.speechCatalog?.voices).toContainEqual({ id: 'voice01', name: 'Actual saved voice', kind: 'profile', engine: null, language: 'English' });
  expect(report.speechCatalog?.voices.some(voice => voice.id === 'alloy')).toBe(false);
  expect(report.speechCatalog?.models[0]).toMatchObject({ id: 'actual/repo', installed: true, conditions: 'Actual model terms' });
  expect(data.calls.every(call => !call.body)).toBe(true); expect(report.remote).toEqual({ query: false, cancelQueued: false, cancelRunning: 'none' });
});
it('uploads the exact reference and transcript once, saves returned WAV and keeps frozen model metadata', async () => {
  const data = fixture(), adapter = new VoiceStudioAdapter(config(), { fetch: data.request, credential: async () => null });
  const base = resolve(import.meta.dirname, '../../../tmp/testing'); await mkdir(base, { recursive: true }); const recording = join(base, 'voicestudio-reference.wav'); await writeFile(recording, data.wav);
  const input = fields('clone', { referenceText: 'exact recording words', speed: .95 }); if (!('references' in input)) throw new Error('fixture');
  input.references = [{ assetId: 'Audio1', variantId: 'Var001', candidateId: null, artifactIndex: null, localPath: recording, mime: 'audio/wav', port: 'referenceAudio' }];
  const result = await run(adapter, input);
  try {
    expect(result.events.filter(event => event.kind === 'error')).toEqual([]); expect(result.authorizations).toBe(1);
    const sends = data.calls.filter(call => call.body); expect(sends).toHaveLength(1); expect(sends[0]!.path).toBe('/generate');
    const body = sends[0]!.body as FormData; expect(body.get('ref_text')).toBe('exact recording words'); expect(body.get('engine')).toBe('omnivoice'); expect(body.get('speed')).toBe('0.95');
    expect(new Uint8Array(await (body.get('ref_audio') as Blob).arrayBuffer())).toEqual(new Uint8Array(data.wav));
    const output = result.events.find(event => event.kind === 'output'); if (output?.kind !== 'output') throw new Error('missing output');
    expect(await readFile(output.artifacts[0]!.localPath)).toEqual(data.wav); expect(output.artifacts[0]?.metadata).toMatchObject({ engine: 'omnivoice', models: ['actual/repo'], serviceAudioId: 'take01' });
  } finally { await result.close(); await rm(recording); }
});
it('rejects unsupported OmniVoice emotion/design before sending and preserves a real engine preset identity', async () => {
  const data = fixture(), adapter = new VoiceStudioAdapter(config(), { fetch: data.request, credential: async () => null });
  expect((await adapter.validateInput(fields('design', { voiceDescription: 'happy' }))).ok).toBe(false);
  expect((await adapter.validateInput(fields('design', { voiceDescription: 'male, female' }))).ok).toBe(false);
  expect((await adapter.validateInput(fields('design', { voiceDescription: 'female, young adult, moderate pitch' }))).ok).toBe(true);
  expect((await adapter.validateInput(fields('speech', { performanceInstruction: 'sad' }))).ok).toBe(false);
  const kitten = new VoiceStudioAdapter(config('kittentts'), { fetch: data.request, credential: async () => null });
  const result = await run(kitten, fields('speech', { voiceId: 'preset:expr-voice-2-f' }), config('kittentts'));
  try { const sends = data.calls.filter(call => call.body); expect(sends).toHaveLength(1); expect(sends[0]!.path).toBe('/v1/audio/speech'); expect(JSON.parse(String(sends[0]!.body))).toMatchObject({ model: 'kittentts', voice: 'expr-voice-2-f', response_format: 'wav' }); } finally { await result.close(); }
});
it('blocks changed frozen models or saved voices before any new POST', async () => {
  const data = fixture(), options = { fetch: data.request, credential: async () => null }, adapter = new VoiceStudioAdapter(config(), options);
  const frozen = await adapter.freeze(); data.state.model = 'changed/model';
  const result = await run(new VoiceStudioAdapter(config(), options, frozen), fields('speech', { voiceId: 'voice01' }));
  try { expect(result.events.at(-1)).toMatchObject({ kind: 'error', remoteStatus: 'failed' }); expect(result.authorizations).toBe(0); expect(data.calls.some(call => call.body)).toBe(false); } finally { await result.close(); }
  data.state.model = 'actual/repo'; data.state.profile.ref_text = 'changed reference';
  const voice = await run(new VoiceStudioAdapter(config(), options, frozen), fields('speech', { voiceId: 'voice01' }));
  try { expect(voice.events.at(-1)).toMatchObject({ kind: 'error', remoteStatus: 'failed' }); expect(voice.authorizations).toBe(0); } finally { await voice.close(); }
});
it('uses the actual ASR engine and returns editable plain text with a declared next-stage field', async () => {
  const data = fixture(); data.state.post = async () => Response.json({ text: '作者可以修正这份逐字稿。' });
  const adapter = new VoiceStudioAdapter(config(), { fetch: data.request, credential: async () => null });
  const base = resolve(import.meta.dirname, '../../../tmp/testing'); await mkdir(base, { recursive: true }); const path = join(base, 'voicestudio-transcribe.wav'); await writeFile(path, data.wav);
  const input = { purpose: `${pluginId}/transcribe`, fields: { language: 'zh' }, references: [{ assetId: 'Audio1', variantId: 'Var001', candidateId: null, artifactIndex: null, localPath: path, mime: 'audio/wav', port: 'referenceAudio' }] } as GenerationInput;
  const result = await run(adapter, input);
  try { expect(result.authorizations).toBe(1); const send = data.calls.find(call => call.body)!; expect(send.path).toBe('/v1/audio/transcriptions'); expect((send.body as FormData).get('model')).toBe('faster-whisper');
    const output = result.events.find(event => event.kind === 'output'); if (output?.kind !== 'output') throw new Error('missing output'); expect(await readFile(output.artifacts[0]!.localPath, 'utf8')).toBe('作者可以修正这份逐字稿。');
    expect(operations.find(operation => operation.id.endsWith('/transcribe'))!.textTransfer).toEqual({ operation: `${pluginId}/clone`, field: 'referenceText' });
  } finally { await result.close(); await rm(path); }
});
it('keeps a lost synchronous result unknown, never retries POST or calls a global cancellation endpoint', async () => {
  const data = fixture(); data.state.post = async () => { throw new Error('connection lost after send'); };
  const adapter = new VoiceStudioAdapter(config(), { fetch: data.request, credential: async () => null }); const result = await run(adapter, fields('speech'));
  try { expect(result.authorizations).toBe(1); expect(result.events.at(-1)).toMatchObject({ kind: 'error', remoteStatus: 'unknown' }); expect(data.calls.filter(call => call.body)).toHaveLength(1); expect(await adapter.cancel()).toEqual({ local: 'stopped', remote: 'unsupported' }); expect(data.calls.filter(call => call.body)).toHaveLength(1); } finally { await result.close(); }
});
