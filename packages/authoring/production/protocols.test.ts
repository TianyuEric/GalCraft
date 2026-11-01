import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { zipSync } from 'fflate';
import { DefaultTimeoutSecByPurpose, type ConnectionConfig, type Json } from '@galcraft/contracts';
import { parse, rewriteScriptReferences, scriptOwnedIds } from '@galcraft/dsl';
import { HttpGenerationAdapter } from '@galcraft/generation-services';
import type { GenerationInput, SubmissionContext, WorkflowBinding } from './types.js';
const root = resolve(import.meta.dirname, '../../../tmp/testing/protocols');
beforeEach(async () => { await mkdir(root, { recursive: true }); });
afterEach(async () => { vi.useRealTimers(); await rm(root, { recursive: true, force: true }); });
it.each(['webUI', 'novelAIImage', 'openAIImage', 'openAISpeech', 'miniMaxSpeech', 'elevenLabs', 'miniMaxMusic'] as const)('%s 请求形状和二进制响应', async protocol => {
  const image = ['webUI', 'novelAIImage', 'openAIImage'].includes(protocol), music = protocol === 'miniMaxMusic';
  const input: GenerationInput = image ? { purpose: 'image', usage: 'background', positive: '背景', negative: '', width: 1024, height: 1024, count: 1, seed: null, references: [] }
    : music ? { purpose: 'music', prompt: '钢琴', lyrics: null, instrumental: true, durationSec: 30, seed: null }
      : { purpose: 'speech', text: '你好', language: 'zh', voiceId: 'voice', referenceAudio: null, referenceText: null, referenceLanguage: null, emotion: null, speed: 1 };
  let requests = 0, request: any;
  const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: (image ? { width: 1024, height: 1024 } : { durationMs: 1000 }) as Json }), fetch: async (_url, init) => {
    requests++; request = JSON.parse(String(init?.body));
    if (protocol === 'novelAIImage') return new Response(new Uint8Array(zipSync({ '0.png': Uint8Array.of(1, 2, 3) })), { headers: { 'content-type': 'application/zip' } });
    if (image) return Response.json(protocol === 'webUI' ? { images: ['AQID'] } : { data: [{ b64_json: 'AQID' }] });
    if (protocol.startsWith('miniMax')) return Response.json({ base_resp: { status_code: 0 }, data: { audio: '010203', status: 2 } });
    return new Response(Uint8Array.of(1, 2, 3), { headers: { 'content-type': 'audio/wav' } });
  } });
  const config: ConnectionConfig = { id: randomUUID(), revision: 1, name: protocol, protocol, baseUrl: 'http://protocol.test', auth: 'none', credentialId: null, apiKeyHeader: null, model: 'fixed', purposes: [input.purpose], parameters: {}, timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, workflowBindingId: null, serverFileRoot: null };
  const events = []; for await (const event of adapter.submit(input, { config, workflow: null, requestId: randomUUID(), directory: root, signal: new AbortController().signal })) events.push(event);
  expect(requests).toBe(1); expect(events.at(-1)?.kind).toBe('output');
  expect(JSON.stringify(request)).toContain(image ? '背景' : music ? '钢琴' : '你好');
});
it('GPT-SoVITS 共享音频路径和参考台词按原协议传递', async () => {
  const path = join(root, 'reference.wav'); await writeFile(path, 'audio'); let body: any;
  const config: ConnectionConfig = { id: randomUUID(), revision: 1, name: 'local', protocol: 'gptSoVits', baseUrl: 'http://protocol.test', auth: 'none', credentialId: null, apiKeyHeader: null, model: 'fixed', purposes: ['speech'], parameters: {}, timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, workflowBindingId: null, serverFileRoot: root };
  const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: { durationMs: 1000 } }), fetch: async (_url, init) => { body = JSON.parse(String(init?.body)); return new Response(Uint8Array.of(1), { headers: { 'content-type': 'audio/wav' } }); } });
  for await (const _ of adapter.submit({ purpose: 'speech', text: '目标', language: 'zh', voiceId: null, referenceAudio: { localPath: path, mime: 'audio/wav', assetId: null, variantId: null, candidateId: null, artifactIndex: null }, referenceText: '参考', referenceLanguage: 'ja', emotion: null, speed: null }, { config, workflow: null, requestId: randomUUID(), directory: join(root, 'output'), signal: new AbortController().signal })) {}
  expect(body).toMatchObject({ ref_audio_path: path, prompt_text: '参考', prompt_lang: 'ja', text_lang: 'zh' });
});
it('脚本身份只重写声明与类型引用，正文和注释 UUID 保留', () => {
  const statement = randomUUID(), character = randomUUID(), replacement = randomUUID(), documentId = randomUUID();
  const input = { documentId, revision: 1, text: `// ${character}\nsay {speaker:{kind:"character",id:"${character}"}, text:"${character}"} @${statement};` };
  const result = rewriteScriptReferences(input, { [statement]: replacement, [character]: replacement }, '0.1.0');
  expect(parse({ ...input, text: result }).issues).toEqual([]); expect(result).toContain(`text:"${character}"`); expect(result).toContain(`// ${character}`); expect(result).toContain(`id:"${replacement}"`);
  expect(scriptOwnedIds(input)).toEqual([statement]);
});

describe('HTTP 无活动等待', () => {
  const text: GenerationInput = { purpose: 'text', system: '', messages: [{ role: 'user', text: '继续', attachments: [] }], maxOutputTokens: 64, temperature: null, seed: null };
  function context(protocol: ConnectionConfig['protocol'] = 'chatCompletions'): SubmissionContext {
    return { config: { id: randomUUID(), revision: 1, name: '活动时限', protocol, baseUrl: 'http://protocol.test', auth: 'none', credentialId: null, apiKeyHeader: null,
      model: 'fixed', purposes: ['text'], parameters: { stream: true }, timeoutSecByPurpose: { ...DefaultTimeoutSecByPurpose, text: 1 }, concurrency: 1, workflowBindingId: null, serverFileRoot: null },
    workflow: null, requestId: randomUUID(), directory: root, signal: new AbortController().signal };
  }
  const collect = async (adapter: HttpGenerationAdapter, ctx: SubmissionContext, output: any[], input: GenerationInput = text) => { for await (const event of adapter.submit(input, ctx)) output.push(event); };
  it.each([
    {protocol:'chatCompletions' as const,body:JSON.stringify({choices:[{message:{content:'未完成'},finish_reason:'length'}]}),mime:'application/json'},
    {protocol:'chatCompletions' as const,body:'data: {"choices":[{"delta":{"content":"未完成"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',mime:'text/event-stream'},
    {protocol:'anthropic' as const,body:JSON.stringify({content:[{type:'text',text:'未完成'}],stop_reason:'max_tokens'}),mime:'application/json'},
    {protocol:'gemini' as const,body:JSON.stringify({candidates:[{content:{parts:[{text:'未完成'}]},finishReason:'MAX_TOKENS'}]}),mime:'application/json'},
    {protocol:'ollama' as const,body:JSON.stringify({message:{content:'未完成'},done:true,done_reason:'length'})+'\n',mime:'application/x-ndjson'},
    {protocol:'ollama' as const,body:JSON.stringify({message:{content:'未完成'},done:true,done_reason:'length'}),mime:'application/json'},
  ])('$protocol $mime retains truncated text without publishing a complete output or repeating the request',async({protocol,body,mime})=>{
    let sends=0;const output:any[]=[];const adapter=new HttpGenerationAdapter({credential:async()=>null,probe:async()=>({metadata:{}}),fetch:async()=>{sends++;return new Response(body,{headers:{'content-type':mime}});}});
    await collect(adapter,context(protocol),output);expect(output).toContainEqual({kind:'textDelta',text:'未完成'});expect(output.at(-1)?.kind).toBe('error');expect(output.some(event=>event.kind==='output')).toBe(false);expect(sends).toBe(1);
  });
  it.each(['chatCompletions', 'ollama'] as const)('%s 持续数据超过配置时限仍完成，停止数据后才超时并释放读取器', async protocol => {
    vi.useFakeTimers();
    let source!: ReadableStreamDefaultController<Uint8Array>, cancelled = 0, sends = 0;
    let body!: ReadableStream<Uint8Array>;
    const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async () => {
      sends++; body = new ReadableStream({ start(controller) { source = controller; }, cancel() { cancelled++; } });
      return new Response(body, { headers: { 'content-type': protocol === 'ollama' ? 'application/x-ndjson' : 'text/event-stream' } });
    } });
    const chunk = (done = false) => Buffer.from(protocol === 'ollama' ? `${JSON.stringify(done ? { done: true } : { message: { content: '字' } })}\n` : done ? 'data: [DONE]\n\n' : 'data: {"choices":[{"delta":{"content":"字"}}]}\n\n');
    for (const finish of [true, false]) {
      const output: any[] = [], pending = collect(adapter, context(protocol), output); await vi.advanceTimersByTimeAsync(0);
      for (let count = 0; count < 4; count++) { await vi.advanceTimersByTimeAsync(800); source.enqueue(chunk()); await vi.advanceTimersByTimeAsync(0); }
      expect(output.filter(event => event.kind === 'textDelta')).toHaveLength(4); expect(output.some(event => event.kind === 'error')).toBe(false);
      if (finish) source.enqueue(chunk(true)); else await vi.advanceTimersByTimeAsync(1000);
      await pending;
      expect(output.at(-1)).toMatchObject(finish ? { kind: 'output' } : { kind: 'error', remoteStatus: 'unknown', issue: { message: expect.stringContaining('无活动超时') } });
      expect(body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
    }
    expect(sends).toBe(2); expect(cancelled).toBe(2);
  });
  it('响应头无活动超时及用户取消立即终止，生成 POST 各只发送一次', async () => {
    vi.useFakeTimers(); const signals: AbortSignal[] = [];
    const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async (_url, init) => {
      signals.push(init!.signal!); return new Promise<Response>(() => {});
    } });
    const first: any[] = [], timeout = collect(adapter, context(), first); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(999); expect(first).toEqual([]); await vi.advanceTimersByTimeAsync(1); await timeout;
    expect(first.at(-1)).toMatchObject({ kind: 'error', remoteStatus: 'unknown' }); expect(signals[0]!.reason.name).toBe('TimeoutError');
    const controller = new AbortController(), second: any[] = [], cancel = collect(adapter, { ...context(), signal: controller.signal }, second);
    await vi.advanceTimersByTimeAsync(0); controller.abort(); await cancel;
    expect(signals).toHaveLength(2); expect(signals.every(signal => signal.aborted)).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('各用途使用冻结的无活动时限，媒体正文等待同样受控', async () => {
    vi.useFakeTimers(); let cancelled = 0;
    const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async () =>
      new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled++; } }), { headers: { 'content-type': 'audio/wav' } }) });
    const original = context().config; original.purposes = ['text', 'speech']; original.timeoutSecByPurpose.speech = 3;
    const frozen = structuredClone(original), first: any[] = [], second: any[] = [];
    const textWait = collect(adapter, { ...context(), config: frozen }, first);
    const audioWait = collect(adapter, { ...context('openAISpeech'), config: { ...frozen, protocol: 'openAISpeech' } }, second,
      { purpose: 'speech', text: '发声', language: 'zh', voiceId: 'voice', referenceAudio: null, referenceText: null, referenceLanguage: null, emotion: null, speed: 1 });
    original.timeoutSecByPurpose.text = 100; original.timeoutSecByPurpose.speech = 100;
    await vi.advanceTimersByTimeAsync(1000); await textWait; expect(first.at(-1)?.kind).toBe('error'); expect(second.at(-1)?.kind).toBe('accepted');
    await vi.advanceTimersByTimeAsync(2000); await audioWait; expect(second.at(-1)?.kind).toBe('error'); expect(cancelled).toBe(2); expect(vi.getTimerCount()).toBe(0);
  });
  function comfyContext(): SubmissionContext {
    const ctx = context('comfyUI'); ctx.workflow = { id: randomUUID(), revision: 1, name: '测试绑定', purpose: 'text', imageUsages: null, graphVersion: '1', editorWorkflowPath: null,
      apiGraph: { '1': { class_type: 'Text', inputs: { text: '' } } }, inputs: [], uploads: [],
      outputs: [{ nodeId: '1', key: 'images', kind: 'image', decoder: 'comfyFileList', group: 'image', role: 'primary', background: 'unknown' }], requiredNodes: [], modelNotes: [] } satisfies WorkflowBinding;
    return ctx;
  }
  it('Comfy queued/running 跨过累计时限继续查询，可取消且不增加生成 POST', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); let posts = 0, queries = 0;
    const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), pollMs: 1, fetch: async (url, init) => {
      if (init?.method === 'POST') { posts++; return Response.json({ prompt_id: 'original' }); }
      if (String(url).includes('/history/')) { queries++; return Response.json({}); }
      return Response.json(queries < 5 ? { queue_pending: [[0, 'original']] } : { queue_running: [[0, 'original']] });
    } });
    const controller = new AbortController(), output: any[] = [], pending = collect(adapter, { ...comfyContext(), signal: controller.signal }, output);
    await expect.poll(() => queries).toBeGreaterThan(3); vi.setSystemTime(Date.now() + 4000);
    await expect.poll(() => queries).toBeGreaterThan(10);
    expect(output.some(event => event.kind === 'error')).toBe(false); expect(output.some(event => event.phase === 'queued')).toBe(true); expect(output.at(-1)).toMatchObject({ kind: 'progress', phase: 'running' });
    controller.abort(); await pending;
    expect(output[0]).toMatchObject({ kind: 'accepted', remote: { id: 'original' } }); expect(posts).toBe(1); expect(queries).toBeGreaterThan(10); expect(vi.getTimerCount()).toBe(0);
  });
  it('Comfy 查询无响应时中断并保留原身份，查询不触发第二次 POST', async () => {
    vi.useFakeTimers(); let posts = 0;
    const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async (_url, init) => {
      if (init?.method === 'POST') { posts++; return Response.json({ prompt_id: 'original' }); }
      return new Promise<Response>(() => {});
    } });
    const output: any[] = [], pending = collect(adapter, comfyContext(), output); await vi.advanceTimersByTimeAsync(1000); await pending;
    expect(output[0]).toMatchObject({ kind: 'accepted', remote: { id: 'original' } }); expect(output.at(-1)).toMatchObject({ kind: 'error', remoteStatus: 'unknown' });
    expect(posts).toBe(1); expect(vi.getTimerCount()).toBe(0);
  });
});
