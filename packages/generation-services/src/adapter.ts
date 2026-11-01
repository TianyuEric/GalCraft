import { novelAINativeRequest } from './novelai.js';
import { createId } from '@galcraft/contracts';

import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { unzipSync } from 'fflate';
import type { Artifact, CapabilityReport, CancelResult, ConnectionConfig, GenerationProgress, Json, Purpose, RemoteRef, RemoteStatus, Result, ServiceEvent } from '@galcraft/contracts';
import type { GenerationAdapter, GenerationInput, MediaInput, SubmissionContext, WorkflowBinding } from '@galcraft/contracts';
import { events, inactivityResponse, lines } from './streams.js';
import { fail, issue, ok, validateInput, validateWorkflow, workflowSupportsPurpose } from './validation.js';
import { ComfyEvents } from './comfy-events.js';
import { inspectComfyResources, releaseComfyResources } from './comfy-resources.js';

export function serviceUrl(base: string, path: string): string {
  let prefix = base.replace(/\/+$/, '');
  if (prefix.endsWith('/v1') && path.startsWith('/v1/')) prefix = prefix.slice(0, -3);
  return prefix + path;
}
export type AdapterOptions = { credential: (id: string) => Promise<string | null>; fetch?: typeof fetch;
  probe: (path: string, mime: string) => Promise<{ metadata: Json; hasAlpha?: boolean; hasTransparency?: boolean }>;
  pollMs?: number; webSocket?: ((url: string) => WebSocket) | null; resourcePollMs?: number; resourceWaitMs?: number;
  beforeSend?: (config: ConnectionConfig, purpose: Purpose) => Promise<void> };
export class HttpGenerationAdapter implements GenerationAdapter {
  private fetcher: typeof fetch;
  constructor(private options: AdapterOptions) { this.fetcher = options.fetch ?? fetch; }
  private async headers(config: ConnectionConfig): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    if (config.auth !== 'none') {
      const key = config.credentialId && await this.options.credential(config.credentialId);
      if (!key) throw new Error('凭据尚未连接');
      if (config.auth === 'bearer') headers.Authorization = `Bearer ${key}`;
      else if (config.auth === 'basic') headers.Authorization = `Basic ${key}`;
      else headers[config.apiKeyHeader ?? (config.protocol === 'anthropic' ? 'x-api-key' : config.protocol === 'gemini' ? 'x-goog-api-key' : 'xi-api-key')] = key;
    }
    if (config.protocol === 'anthropic') headers['anthropic-version'] = '2023-06-01';
    return headers;
  }
  private async request(ctx: SubmissionContext, path: string, body?: unknown, generation = false): Promise<Response> {
    const headers = await this.headers(ctx.config), form = body instanceof FormData;
    if (generation) { ctx.signal.throwIfAborted(); await ctx.beforeSend?.(); await this.options.beforeSend?.(ctx.config, (body as any)?.purpose ?? ctx.workflow?.purpose ?? ctx.config.purposes[0]!); }
    if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
    return this.receive(ctx, serviceUrl(ctx.config.baseUrl, path), { method: body === undefined ? 'GET' : 'POST', headers,
      ...(body !== undefined ? { body: form ? body : JSON.stringify(body) } : {}) });
  }
  private async receive(ctx: SubmissionContext, url: string, init: RequestInit = {}): Promise<Response> {
    const timeoutMs = (ctx.config.timeoutSecByPurpose[ctx.workflow?.purpose ?? ctx.config.purposes[0]!] ?? 600) * 1000;
    const post = init.method === 'POST';
    let response: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      try { response = await inactivityResponse(this.fetcher, url, init, ctx.signal, timeoutMs);
        if (post || response.status < 500 || attempt === 3) break;
        await response.body?.cancel();
      } catch (error) { if (post || attempt === 3 || ctx.signal.aborted || error instanceof Error && error.name === 'TimeoutError') throw error; }
      await delay([1000, 2000, 5000][attempt]!, undefined, { signal: ctx.signal });
    }
    if (!response) throw new Error('服务未响应');
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}${response.status === 429 ? ` Retry-After=${response.headers.get('retry-after') ?? 'unknown'}` : ''}`); }
    return response;
  }
  async inspect(config: ConnectionConfig, purpose: Purpose): Promise<CapabilityReport> {
    const report: CapabilityReport = { connectionId: config.id, connectionRevision: config.revision, checkedAt: new Date().toISOString(), serviceVersion: null,
      purpose, status: 'unverified', inputs: purpose.includes('/') ? [{ port: 'fields', required: true, supported: true, limits: {} }, { port: 'references', required: false, supported: true, limits: {} }] : [], output: purpose === 'text' ? 'text' : ['speech', 'music'].includes(purpose) ? 'audio' : 'image', models: null,
      promptFormat: purpose === 'image' || purpose === 'difference' ? 'either' : null,
      textVision: purpose === 'text' ? { supported: config.parameters.textVision === true, mimeTypes: ['image/png', 'image/jpeg', 'image/webp'], maxImages: null, maxBytes: null } : null,
      remote: { query: config.protocol === 'comfyUI', cancelQueued: config.protocol === 'comfyUI', cancelRunning: config.protocol === 'comfyUI' || config.protocol === 'webUI' ? 'globalOnly' : 'none' }, issues: [] };
    try {
      if (!config.purposes.includes(purpose)) throw new Error('连接不支持所选用途');
      const path = config.protocol === 'comfyUI' ? '/system_stats' : config.protocol === 'ollama' ? '/api/tags' : config.protocol === 'webUI' ? '/sdapi/v1/sd-models' : '/v1/models';
      const response = await this.request({ config: { ...config, purposes: [purpose] }, workflow: null, requestId: createId(), directory: '', signal: new AbortController().signal }, path);
      const body = await response.json() as any;
      report.serviceVersion = body.system?.comfyui_version ?? null;
      report.models = Array.isArray(body.data) ? body.data.map((item: any) => item.id) : Array.isArray(body.models) ? body.models.map((item: any) => item.name) : null;
    } catch (error) { report.status = 'unavailable'; report.issues = [issue('CONNECTION_UNAVAILABLE', String(error))]; }
    return report;
  }
  async checkWorkflow(config: ConnectionConfig, workflow: WorkflowBinding): Promise<Result<void>> {
    try { const ctx = { config, workflow, requestId: createId(), directory: '', signal: new AbortController().signal };
      validateWorkflow(workflow, await (await this.request(ctx, '/object_info')).json() as Record<string, any>); return ok(undefined);
    } catch (error) { return fail('WORKFLOW_BINDING', String(error)); }
  }
  async discoverWorkflowOutputs(config: ConnectionConfig, workflow: WorkflowBinding, historyId?: string): Promise<Result<import('@galcraft/contracts').WorkflowOutputCandidate[]>> {
    try {
      const ctx = { config, workflow, requestId: createId(), directory: '', signal: AbortSignal.timeout(15000) };
      const info = await (await this.request(ctx, '/object_info')).json() as Record<string, any>;
      const history = historyId ? (await (await this.request(ctx, `/history/${encodeURIComponent(historyId)}`)).json() as Record<string, any>)[historyId]?.outputs : null;
      const candidates: import('@galcraft/contracts').WorkflowOutputCandidate[] = [];
      for (const [nodeId, node] of Object.entries(workflow.apiGraph)) {
        const outputs = history?.[nodeId];
        if (outputs) for (const [key, files] of Object.entries(outputs)) {
          if (Array.isArray(files) && files.length && files.every(file => file && typeof file.filename === 'string' && ['input', 'output', 'temp'].includes(file.type))) candidates.push({ nodeId, classType: node.class_type, key, kind: key === 'images' ? 'image' : key === 'audio' ? 'audio' : workflow.outputs.find(output => output.nodeId === nodeId && output.key === key)?.kind ?? null, source: 'history', confirmed: true });
        }
        const kind = node.class_type === 'SaveImage' ? 'image' : ['SaveAudio', 'SaveAudioMP3', 'SaveAudioOpus'].includes(node.class_type) ? 'audio' : null;
        if (kind) candidates.push({ nodeId, classType: node.class_type, key: kind === 'image' ? 'images' : 'audio', kind, source: 'standard', confirmed: false });
        else if (info[node.class_type]?.output_node === true) candidates.push({ nodeId, classType: node.class_type, key: null, kind: null, source: 'metadata', confirmed: false });
      }
      return ok(candidates);
    } catch (error) { return fail('WORKFLOW_OUTPUT_DISCOVERY', String(error)); }
  }
  private async artifact(ctx: SubmissionContext, bytes: Uint8Array, mime: string, groupId: string, role: 'primary' | 'mask' = 'primary', declared: 'removed' | 'unchanged' | 'unknown' = 'unknown'): Promise<Artifact> {
    if (!bytes.length) throw new Error('OUTPUT_EMPTY');
    const extension = mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : mime.includes('wav') ? 'wav' : mime.includes('ogg') ? 'ogg' : mime.startsWith('audio/') ? 'mp3' : 'txt';
    if (!mime.startsWith('image/') && !mime.startsWith('audio/') && mime !== 'text/plain') throw new Error('响应不是媒体');
    await mkdir(ctx.directory, { recursive: true }); const path = join(ctx.directory, `${createId()}.${extension}`), partial = `${path}.partial`;
    await writeFile(partial, bytes); const isText = mime === 'text/plain';
    // The probe consumes the final extension while the candidate remains unpublished.
    await rename(partial, path);
    const probed = isText ? { metadata: {}, hasAlpha: false, hasTransparency: false } : await this.options.probe(path, mime);
    return { kind: isText ? 'text' : mime.startsWith('image/') ? 'image' : 'audio', localPath: path, mime, bytes: bytes.length, metadata: probed.metadata,
      groupId, role, background: mime.startsWith('image/') ? { declared, hasAlpha: probed.hasAlpha ?? false, hasTransparency: probed.hasTransparency ?? false } : null };
  }
  private async base64(media: { localPath: string }): Promise<string> { return (await readFile(media.localPath)).toString('base64'); }
  private async comfyInput(input: GenerationInput, ctx: SubmissionContext) {
    const binding = ctx.workflow!; validateWorkflow(binding);
    const graph = structuredClone(binding.apiGraph), values = { ...input, ...('fields' in input ? input.fields : {}) } as Record<string, any>;
    if ('fields' in input) for (const media of input.references) {
      if (!media.port) throw new Error('扩展媒体缺少公开端口身份');
      if (Object.hasOwn(input.fields, media.port)) throw new Error(`媒体端口不能同时绑定标量：${media.port}`);
      values[media.port] = values[media.port] ? [...(Array.isArray(values[media.port]) ? values[media.port] : [values[media.port]]), media] : media;
    }
    for (const upload of binding.uploads) {
      const source = values[upload.port]; if (!source) continue;
      const media: MediaInput = Array.isArray(source) ? source[0] : source;
      if (!media?.localPath) throw new Error(`媒体端口无文件：${upload.port}`);
      if (upload.method === 'comfyImage') {
        const form = new FormData(); form.set('image', new Blob([await readFile(media.localPath)], { type: media.mime }), basename(media.localPath));
        form.set('type', 'input'); form.set('subfolder', upload.subfolder); form.set('overwrite', 'false');
        const result = await (await this.request(ctx, '/upload/image', form)).json() as any;
        if (!result.name || result.type !== 'input') throw new Error('上传回执无效');
        values[upload.port] = [result.subfolder, result.name].filter(Boolean).join('/');
      } else {
        if (!ctx.config.serverFileRoot) throw new Error('请在连接中配置 GalCraft 可写的共享目录');
        const root = resolve(ctx.config.serverFileRoot), target = resolve(root, upload.subfolder, `${ctx.requestId}-${basename(media.localPath)}`);
        if (!target.startsWith(root + sep)) throw new Error('上传目录越界');
        await mkdir(resolve(target, '..'), { recursive: true }); await copyFile(media.localPath, target);
        const relativeName = [upload.subfolder, basename(target)].filter(Boolean).join('/');
        const serverRoot = upload.serverRoot ?? ctx.config.serverReadRoot ?? ctx.config.serverFileRoot;
        if (upload.serverPathFormat !== 'relative' && !/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(serverRoot)) throw new Error('服务端读取前缀需为绝对路径；也可明确选择相对文件名格式。');
        values[upload.port] = upload.serverPathFormat === 'relative' ? relativeName : `${serverRoot.replace(/[\\/]+$/, '')}/${relativeName}`;
      }
    }
    for (const port of binding.inputs) {
      let value = values[port.port]; if (value === null || value === undefined) { if (port.required) throw new Error(`缺少 ${port.port}`); continue; }
      if (typeof value !== (port.valueType.endsWith('File') ? 'string' : port.valueType)) throw new Error(`端口类型错误：${port.port}`);
      if (port.transform === 'round') value = Math.round(value); if (port.transform === 'secondsToMs') value *= 1000;
      graph[port.nodeId]!.inputs[port.input] = value;
    }
    return graph;
  }
  async *submit(input: GenerationInput, original: SubmissionContext): AsyncIterable<ServiceEvent> {
    const ctx = { ...original, config: { ...original.config, purposes: [input.purpose] } };
    try {
      validateInput(input); const config = ctx.config, protocol = config.protocol, model = config.model;
      if (protocol === 'comfyUI') {
        if (!ctx.workflow) throw new Error('工作流未绑定');
        if (!workflowSupportsPurpose(ctx.workflow, input.purpose, input.purpose === 'image' ? input.usage : null)) {
          yield { kind: 'error', issue: issue('WORKFLOW_PURPOSE', 'The workflow does not support the requested purpose or image use.'), remoteStatus: 'failed' }; return;
        }
        const graph = await this.comfyInput(input, ctx);
        const subscription = new ComfyEvents(), started = Date.now();
        // Native WebSocket has no authentication-header API. Authenticated proxies keep the query fallback.
        const factory = this.options.webSocket !== undefined ? this.options.webSocket : this.options.fetch || config.auth !== 'none' || typeof WebSocket === 'undefined' ? null : (url: string) => new WebSocket(url);
        await subscription.connect(config.baseUrl, ctx.requestId, factory, ctx.signal);
        try {
          const response = await (await this.request(ctx, '/prompt', { prompt: graph, client_id: ctx.requestId }, true)).json() as any;
          if (!response.prompt_id || Object.keys(response.node_errors ?? {}).length) throw new Error('Comfy 节点拒绝请求');
          const remote: RemoteRef = { protocol, id: response.prompt_id, connectionId: config.id, submittedAt: new Date().toISOString() };
          yield { kind: 'accepted', remote };
          let nextQuery = 0, lastDetail = 0, terminalEventAt = 0, latestProgress: GenerationProgress | undefined;
          while (!ctx.signal.aborted) {
            for (const message of subscription.drain(remote.id)) {
              if (message.type === 'execution_error' || message.type === 'execution_interrupted') {
                const details = subscription.error(message, remote.id);
                yield { kind: 'error', issue: issue('COMFY_EXECUTION', details.message), remoteStatus: 'failed', details }; return;
              }
              const progress = subscription.progress(message, ctx.workflow);
              if (progress) { lastDetail = Date.now(); latestProgress = progress; yield { kind: 'progress', ...progress }; }
              if (message.type === 'execution_success' || message.type === 'executing' && message.data.node == null) { terminalEventAt = Date.now(); nextQuery = 0; }
            }
            if (Date.now() >= nextQuery) {
              const status = await this.query(remote, ctx); if (!status.ok) throw new Error(status.error.message);
              if (!lastDetail || Date.now() - lastDetail > 5000) yield { ...latestProgress, kind: 'progress', phase: status.value.state, completed: null, total: null, scope: 'unknown', elapsedMs: Date.now() - started, updatedAt: new Date().toISOString() };
              if (status.value.state === 'completed') { const files = await this.fetch(remote, status.value.output!, ctx); if (!files.ok) throw new Error(files.error.message);
                yield { kind: 'progress', phase: 'completed', completed: null, total: null, scope: 'unknown', elapsedMs: Date.now() - started, updatedAt: new Date().toISOString() };
                yield { kind: 'output', artifacts: files.value, usage: null }; return; }
              if (status.value.state === 'failed' || status.value.state === 'cancelled') { yield { kind: 'error', issue: issue('REMOTE_FAILED', status.value.issues.map(item => item.message).join('; ')), remoteStatus: 'failed', ...(status.value.errorDetails ? { details: status.value.errorDetails } : {}) }; return; }
              if (status.value.state === 'unknown' && (!terminalEventAt || Date.now() - terminalEventAt > 5000)) throw new Error('远端状态未知，请查询原任务');
              nextQuery = Date.now() + (this.options.pollMs ?? 1000);
            }
            await subscription.wait(Math.max(1, nextQuery - Date.now()), ctx.signal);
          }
          throw new Error('远端等待中断，请查询原任务');
        } finally { subscription.close(); }
      }
      let path = '', body: any, format: 'text' | 'jsonImage' | 'audio' | 'novelZip' | 'miniMax' = 'text';
      const settings = config.parameters.request as Record<string, Json> ?? {};
      if (input.purpose === 'text') {
        const messages = await Promise.all(input.messages.map(async message => ({ role: message.role, text: message.text,
          attachments: await Promise.all(message.attachments.map(async attachment => ({ mime: attachment.mime, data: await this.base64(attachment) }))) })));
        const stream = config.parameters.stream === true;
        if (protocol === 'chatCompletions') { path = '/v1/chat/completions'; body = { ...settings, model, messages: [{ role: 'system', content: input.system }, ...messages.map(message => ({ role: message.role,
          content: message.attachments.length ? [{ type: 'text', text: message.text }, ...message.attachments.map(attachment => ({ type: 'image_url', image_url: { url: `data:${attachment.mime};base64,${attachment.data}` } }))] : message.text }))], stream,
          ...(stream ? { stream_options: { include_usage: true } } : {}),
          [config.parameters.maxTokenField === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens']: input.maxOutputTokens, ...(input.temperature !== null ? { temperature: input.temperature } : {}), ...(input.seed !== null ? { seed: input.seed } : {}) }; }
        else if (protocol === 'anthropic') { path = '/v1/messages'; body = { ...settings, model, system: input.system, max_tokens: input.maxOutputTokens, stream, ...(input.temperature !== null ? { temperature: input.temperature } : {}), messages: messages.map(message => ({ role: message.role,
          content: [{ type: 'text', text: message.text }, ...message.attachments.map(attachment => ({ type: 'image', source: { type: 'base64', media_type: attachment.mime, data: attachment.data } }))] })) }; }
        else if (protocol === 'gemini') { path = `/v1beta/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`; body = { ...settings, systemInstruction: { parts: [{ text: input.system }] }, contents: messages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.text }, ...message.attachments.map(attachment => ({ inlineData: { mimeType: attachment.mime, data: attachment.data } }))] })), generationConfig: { maxOutputTokens: input.maxOutputTokens, ...(input.temperature !== null ? { temperature: input.temperature } : {}) } }; }
        else if (protocol === 'ollama') { path = '/api/chat'; body = { ...settings, model, stream, messages: [{ role: 'system', content: input.system }, ...messages.map(message => ({ role: message.role, content: message.text, images: message.attachments.map(value => value.data) }))], options: { num_predict: input.maxOutputTokens, ...(input.temperature !== null ? { temperature: input.temperature } : {}) } }; }
        else if (protocol === 'novelAIText') { if (messages.some(message => message.attachments.length)) throw new Error('文本连接不支持图像'); path = '/ai/generate'; body = { input: [input.system, ...messages.map(message => `${message.role}: ${message.text}`)].join('\n'), model, parameters: { ...settings, use_string: true, max_length: input.maxOutputTokens, ...(input.temperature !== null ? { temperature: input.temperature } : {}), ...(input.seed !== null ? { seed: input.seed } : {}) } }; }
        else throw new Error('协议不支持文本');
      } else if (input.purpose === 'image' || input.purpose === 'difference') {
        const prompt = input.purpose === 'image' ? input.positive : input.instruction, references = input.purpose === 'image' ? input.references : [input.reference];
        if (protocol === 'webUI') { path = references.length ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img'; body = { ...settings, prompt, negative_prompt: input.negative, width: input.width, height: input.height, seed: input.seed, batch_size: input.count,
          ...(references.length ? { init_images: await Promise.all(references.map(media => this.base64(media))) } : {}) }; format = 'jsonImage'; }
        else if (protocol === 'novelAIImage') { path = '/ai/generate-image'; body = input.purpose==='image' && input.novelai ? novelAINativeRequest(input,config,await Promise.all(references.map(reference=>this.base64(reference)))) : {action:references.length?'img2img':'generate',input:prompt,model,parameters:{...settings,width:input.width,height:input.height,seed:input.seed,n_samples:input.count,negative_prompt:input.negative,...(references.length?{image:await this.base64(references[0]!)}:{})}}; format = 'novelZip'; }
        else if (protocol === 'openAIImage') { format = 'jsonImage';
          if (references.length) { path = '/v1/images/edits'; const form = new FormData();
            for (const [key, value] of Object.entries(settings)) if (value !== null) form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
            form.set('model', model); form.set('prompt', prompt); form.set('size', `${input.width}x${input.height}`); form.set('n', String(input.count));
            for (const media of references) form.append('image', new Blob([await readFile(media.localPath)], { type: media.mime }), basename(media.localPath)); body = form;
          } else { path = '/v1/images/generations'; body = { ...settings, model, prompt, size: `${input.width}x${input.height}`, n: input.count }; }
        } else throw new Error('协议不支持图像');
      } else if (input.purpose === 'speech') {
        format = 'audio';
        if (protocol === 'openAISpeech') { path = '/v1/audio/speech'; body = { ...settings, model, input: input.text, voice: input.voiceId, response_format: settings.response_format ?? 'wav', ...(input.speed !== null ? { speed: input.speed } : {}) }; }
        else if (protocol === 'gptSoVits') { if (!input.referenceAudio || !config.serverFileRoot) throw new Error('参考音频共享目录未确认');
          const root = resolve(config.serverFileRoot), source = resolve(input.referenceAudio.localPath);
          const referencePath = source.startsWith(root + sep) ? source : join(root, `${ctx.requestId}-${basename(source)}`);
          if (referencePath !== source) await copyFile(source, referencePath);
          path = '/tts'; body = { ...settings, text: input.text, text_lang: input.language, ref_audio_path: referencePath, prompt_lang: input.referenceLanguage, prompt_text: input.referenceText, aux_ref_audio_paths: [], media_type: 'wav', streaming_mode: false }; }
        else if (protocol === 'miniMaxSpeech') { path = '/v1/t2a_v2'; body = { ...settings, model, text: input.text, voice_setting: { voice_id: input.voiceId, ...(input.speed !== null ? { speed: input.speed } : {}), ...(input.emotion ? { emotion: input.emotion } : {}) }, language_boost: input.language }; format = 'miniMax'; }
        else if (protocol === 'elevenLabs') { path = `/v1/text-to-speech/${encodeURIComponent(input.voiceId ?? '')}`; body = { ...settings, text: input.text, model_id: model, language_code: input.language }; }
        else throw new Error('协议不支持语音');
      } else if (input.purpose === 'music' && protocol === 'miniMaxMusic') { path = '/v1/music_generation'; body = { ...settings, model, prompt: input.prompt, lyrics: input.lyrics, is_instrumental: input.instrumental }; format = 'miniMax'; }
      else throw new Error('协议不支持该用途');
      const response = await this.request(ctx, path, body, true); yield { kind: 'accepted', remote: null };
      const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
      if (format === 'text' && (contentType.includes('event-stream') || contentType.includes('ndjson'))) {
        let complete = false; let usage: Json | null = null;
        if (contentType.includes('ndjson')) { for await (const line of lines(response.body!)) { if (!line.trim()) continue; const value = JSON.parse(line); if (value.error) throw new Error('服务流返回错误'); if (value.message?.content ?? value.response) yield { kind: 'textDelta', text: value.message?.content ?? value.response }; if (value.done) { if(value.done_reason==='length')throw new Error('输出达到长度上限，保留部分文字');complete = true; usage = { ...(value.prompt_eval_count !== undefined ? { prompt_tokens: value.prompt_eval_count } : {}), ...(value.eval_count !== undefined ? { completion_tokens: value.eval_count } : {}) }; break; } } }
        else for await (const event of events(response.body!)) { if (event.data === '[DONE]') { complete = true; break; } const value = JSON.parse(event.data); if (event.event === 'error' || value.error || value.type === 'error') throw new Error('服务流返回错误');
          const text = value.choices?.[0]?.delta?.content ?? value.delta?.text ?? value.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join(''); if (text) yield { kind: 'textDelta', text };if(['length','max_tokens','MAX_TOKENS'].includes(value.choices?.[0]?.finish_reason??value.delta?.stop_reason??value.candidates?.[0]?.finishReason))throw new Error('输出达到长度上限，保留部分文字');
          const reported = value.usage ?? value.usageMetadata ?? value.message?.usage;
          if (reported) usage = { ...(usage && typeof usage === 'object' && !Array.isArray(usage) ? usage : {}), ...reported };
          if (value.type === 'message_stop' || value.candidates?.[0]?.finishReason) { complete = true; break; }
        }
        if (!complete) throw new Error('流提前结束，保留部分文字');
        yield { kind: 'output', artifacts: [], usage }; return;
      }
      const artifacts: Artifact[] = []; let usage: Json | null = null;
      if (format === 'audio') artifacts.push(await this.artifact(ctx, new Uint8Array(await response.arrayBuffer()), contentType, 'audio/0'));
      else if (format === 'novelZip' && (contentType.includes('zip') || contentType === 'application/octet-stream')) {
        for (const [name, bytes] of Object.entries(unzipSync(new Uint8Array(await response.arrayBuffer())))) if (/\.(png|jpg|webp)$/i.test(name)) artifacts.push(await this.artifact(ctx, bytes, name.endsWith('.webp') ? 'image/webp' : name.endsWith('.jpg') ? 'image/jpeg' : 'image/png', `image/${artifacts.length}`));
      } else {
        const data = await response.json() as any; if (data.error || data.base_resp && data.base_resp.status_code !== 0) throw new Error('服务返回错误'); usage = data.usage ?? data.usageMetadata ?? null;
        if (format === 'text') { const text = data.choices?.[0]?.message?.content ?? data.content?.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('') ?? data.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('') ?? data.message?.content ?? data.output;
          if (typeof text !== 'string' || !text) throw new Error('OUTPUT_MISSING');if(['length','max_tokens','MAX_TOKENS'].includes(data.choices?.[0]?.finish_reason??data.stop_reason??data.candidates?.[0]?.finishReason??data.done_reason)){yield {kind:'textDelta',text};throw new Error('输出达到长度上限，保留部分文字');} artifacts.push(await this.artifact(ctx, Buffer.from(text), 'text/plain', 'text/0')); }
        else if (format === 'miniMax') { if (data.data?.status !== undefined && data.data.status !== 2) throw new Error('音频尚未完整');
          const audio = data.data?.audio ?? data.audio; if (!audio) throw new Error('OUTPUT_MISSING');
          const bytes = /^https?:/.test(audio) ? new Uint8Array(await (await this.receive(ctx, audio)).arrayBuffer()) : /^[\da-f]+$/i.test(audio) && audio.length % 2 === 0 ? Buffer.from(audio, 'hex') : null;
          if (!bytes) throw new Error('音频十六进制无效'); artifacts.push(await this.artifact(ctx, bytes, 'audio/mpeg', 'audio/0')); }
        else for (const item of (Array.isArray(data) ? data : data.data ?? data.images ?? [])) { const bytes = typeof item === 'string' ? Buffer.from(item.replace(/^data:[^,]+,/, ''), 'base64') : item.b64_json ? Buffer.from(item.b64_json, 'base64') : new Uint8Array(await (await this.receive(ctx, item.url)).arrayBuffer());
          artifacts.push(await this.artifact(ctx, bytes, 'image/png', `image/${artifacts.length}`)); }
      }
      if (!artifacts.length) throw new Error('OUTPUT_MISSING'); yield { kind: 'output', artifacts, usage };
    } catch (error) { yield { kind: 'error', issue: issue('SERVICE_INTERRUPTED', String(error)), remoteStatus: /^Error: HTTP 4\d\d|Comfy 节点拒绝/.test(String(error)) ? 'failed' : 'unknown' }; }
  }
  async query(ref: RemoteRef, ctx: SubmissionContext): Promise<Result<RemoteStatus>> {
    if (ref.protocol !== 'comfyUI') return ok({ state: 'unknown', output: null, issues: [] });
    try {
      const history = await (await this.request(ctx, `/history/${encodeURIComponent(ref.id)}`)).json() as any, entry = history[ref.id];
      if (entry?.status?.status_str === 'error') {
        const reported = entry.status.messages?.find((message: any[]) => message[0] === 'execution_error');
        const errorDetails = reported ? new ComfyEvents().error({ type: reported[0], data: reported[1] }, ref.id) : undefined;
        return ok({ state: 'failed', output: null, issues: [issue('COMFY_EXECUTION', errorDetails?.message ?? JSON.stringify(entry.status.messages ?? []).slice(0, 4000))], ...(errorDetails ? { errorDetails } : {}) });
      }
      if (entry?.status?.completed || entry?.status?.status_str === 'success') return ok({ state: 'completed', output: entry.outputs, issues: [] });
      const queue = await (await this.request(ctx, '/queue')).json() as any;
      return ok({ state: queue.queue_running?.some((entry: any[]) => entry[1] === ref.id) ? 'running' : queue.queue_pending?.some((entry: any[]) => entry[1] === ref.id) ? 'queued' : 'unknown', output: null, issues: [] });
    } catch (error) { return fail('REMOTE_QUERY', String(error)); }
  }
  async fetch(_ref: RemoteRef, output: Json, ctx: SubmissionContext): Promise<Result<Artifact[]>> {
    try {
      const artifacts: Artifact[] = [], binding = ctx.workflow; if (!binding) throw new Error('缺少输出绑定');
      for (const port of binding.outputs) {
        const files = (output as any)?.[port.nodeId]?.[port.key]; if (!Array.isArray(files) || !files.length) throw new Error(`OUTPUT_MISSING ${port.nodeId}.${port.key}; available fields: ${Object.keys((output as any)?.[port.nodeId] ?? {}).join(', ') || '(none)'}. Correct the file-list field and refetch the original task.`);
        for (const [index, file] of files.entries()) {
          if (!file.filename || !['output', 'temp', 'input'].includes(file.type)) throw new Error('输出文件描述无效');
          const response = await this.request(ctx, `/view?${new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? '', type: file.type })}`);
          const mime = response.headers.get('content-type')?.split(';')[0] ?? (port.kind === 'image' ? 'image/png' : 'audio/wav');
          artifacts.push({ ...await this.artifact(ctx, new Uint8Array(await response.arrayBuffer()), mime, `${port.group}/${index}`, port.role, port.background), ...(port.port ? { port: port.port } : {}) });
        }
      }
      for (const mask of artifacts.filter(artifact => artifact.role === 'mask')) { const primary = artifacts.find(artifact => artifact.groupId === mask.groupId && artifact.role === 'primary');
        if (!primary || (primary.metadata as any).width !== (mask.metadata as any).width || (primary.metadata as any).height !== (mask.metadata as any).height) throw new Error('蒙版与主图数量或尺寸不一致'); }
      return ok(artifacts);
    } catch (error) { return fail('OUTPUT_FETCH', String(error)); }
  }
  async cancel(ref: RemoteRef, ctx: SubmissionContext): Promise<CancelResult> {
    if (ref.protocol === 'comfyUI') { const state = await this.query(ref, ctx);
      if (state.ok && state.value.state === 'queued') { await this.request(ctx, '/queue', { delete: [ref.id] }); const next = await this.query(ref, ctx);
        if (next.ok && next.value.state === 'unknown') return { local: 'stopped', remote: 'confirmed' }; }
    }
    return { local: 'stopped', remote: 'unsupported' };
  }
  inspectResources(ctx: SubmissionContext) { return inspectComfyResources({ ...ctx, signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(10000)]) }, (context, path, body) => this.request(context, path, body)); }
  releaseResources(ctx: SubmissionContext) { return releaseComfyResources({ ...ctx, signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(30000)]) }, (context, path, body) => this.request(context, path, body), this.options.resourcePollMs, this.options.resourceWaitMs); }
}
