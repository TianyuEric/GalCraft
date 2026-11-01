import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GenerationOutputJsonSchema, generationInputJsonSchema, SpeechServiceCatalogSchema, validateJsonData } from '@galcraft/contracts';
import type { Artifact, CapabilityReport, ConnectionConfig, GenerationAdapter, GenerationInput, Issue, Json, Purpose, Result, SpeechServiceCatalog, SubmissionContext } from '@galcraft/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import { capabilities, operations, pluginId, providerKey } from './definition.js';

type RecordValue = Record<string, any>;
type Runtime = { catalog: SpeechServiceCatalog; profiles: RecordValue[] };
type Options = { fetch?: typeof fetch; credential(id: string): Promise<string | null>; probe?(path: string, mime: string): Promise<{ metadata: Json }> };
const issue = (code: string, message: string): Issue => ({ code, message, owner: 'M10', severity: 'error', related: [], actions: ['edit'] });
const failure = <T>(code: string, message: string): Result<T> => { const error = issue(code, message); return { ok: false, error, issues: [error] }; };
const emptyCatalog = (): SpeechServiceCatalog => ({ activeEngine: '', activeModel: null, engines: [], models: [], voices: [], designPresets: [], transcription: null });
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): RecordValue[] => Array.isArray(value) ? value.map(record) : [];
const text = (value: unknown): string | null => typeof value === 'string' && value ? value : null;
const designMode = (id: string): 'none' | 'tags' | 'description' => ['omnivoice', 'omnivoice-subprocess', 'omnivoice-gguf'].includes(id) ? 'tags' : id === 'voxcpm2' ? 'description' : 'none';
// Voice-design vocabulary verified against the installed service's public model controls.
const designGroups = [
  ['male', 'female', '男', '女'], ['child', 'teenager', 'young adult', 'middle-aged', 'elderly', '儿童', '少年', '青年', '中年', '老年'],
  ['very low pitch', 'low pitch', 'moderate pitch', 'high pitch', 'very high pitch', '极低音调', '低音调', '中音调', '高音调', '极高音调'], ['whisper', '耳语'],
  ['american accent', 'british accent', 'australian accent', 'chinese accent', 'canadian accent', 'indian accent', 'korean accent', 'portuguese accent', 'russian accent', 'japanese accent'],
  ['河南话', '陕西话', '四川话', '贵州话', '云南话', '桂林话', '济南话', '石家庄话', '甘肃话', '宁夏话', '青岛话', '东北话'],
];
function validateDesignTags(value: string) {
  const tags = value.split(/[,，]/).map(tag => tag.trim().toLowerCase()).filter(Boolean), seen = new Set<number>();
  if (tags.some(tag => /[\u4e00-\u9fff]/.test(tag)) && tags.some(tag => !/[\u4e00-\u9fff]/.test(tag))) throw new Error('OmniVoice design attributes must use one language.');
  for (const tag of tags) { const group = designGroups.findIndex(group => group.includes(tag)); if (group < 0) throw new Error(`Unsupported OmniVoice design attribute: ${tag}. Use the service design presets or its declared gender/age/pitch/accent attributes.`); if (seen.has(group)) throw new Error('Choose only one OmniVoice attribute in each category.'); seen.add(group); }
}
const profileFacts = (profile: RecordValue) => Object.fromEntries(['id', 'name', 'kind', 'language', 'ref_text', 'instruct', 'ref_audio_path', 'locked_audio_path', 'is_locked', 'seed'].map(key => [key, profile[key] ?? null]));
const modelFacts = (catalog: SpeechServiceCatalog, engine: string) => ({ active: catalog.activeEngine === engine ? catalog.activeModel : null,
  models: catalog.models.filter(model => model.engines.includes(engine) && model.installed).map(model => model.id).sort() });

/** The plugin owns its HTTP mapping. The host supplies credentials and ordinary media probing only. */
export class VoiceStudioAdapter implements GenerationAdapter {
  private runtime?: Runtime;
  private readonly request: typeof fetch;
  constructor(private config: ConnectionConfig, private options: Options, frozen?: Json) {
    this.config = structuredClone(config);
    this.request = options.fetch ?? fetch;
    if (frozen) { const raw = record(frozen); this.runtime = { catalog: SpeechServiceCatalogSchema.parse(raw.catalog), profiles: list(raw.profiles) }; }
  }
  private url(path: string) { return `${this.config.baseUrl.replace(/\/+$/, '')}${path}`; }
  private async headers() {
    const headers: Record<string, string> = {};
    if (this.config.auth !== 'none') {
      const credential = this.config.credentialId ? await this.options.credential(this.config.credentialId) : null;
      if (!credential) throw new Error('VoiceStudio authentication credential is missing.');
      headers[this.config.auth === 'apiKey' ? this.config.apiKeyHeader ?? 'X-API-Key' : 'Authorization'] = this.config.auth === 'bearer' ? `Bearer ${credential}` : this.config.auth === 'basic' ? `Basic ${credential}` : credential;
    }
    return headers;
  }
  private async get(path: string, signal?: AbortSignal): Promise<unknown> {
    const response = await this.request(this.url(path), { headers: await this.headers(), signal: signal ?? AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`VoiceStudio ${path}: HTTP ${response.status} ${await response.text()}`);
    return response.json();
  }
  private async discover(): Promise<Runtime> {
    const [health, ttsValue, modelValue, profileValue, personalities, asrValue] = await Promise.all([
      this.get('/health'), this.get('/engines/tts'), this.get('/models'), this.get('/profiles'), this.get('/personalities'), this.get('/engines/asr'),
    ]);
    if (record(health).status !== 'ok') throw new Error('VoiceStudio health check did not report ok.');
    const tts = record(ttsValue), asr = record(asrValue), profiles = list(profileValue);
    const engines: SpeechServiceCatalog['engines'] = list(tts.backends).map(value => ({ id: String(value.id), name: String(value.display_name ?? value.id), available: value.available === true,
      reason: text(value.reason), cloning: value.supports_cloning === true, speed: ['omnivoice', 'omnivoice-subprocess', 'kittentts', 'mlx-audio', 'gpt-sovits', 'sherpa-onnx'].includes(String(value.id)), design: designMode(String(value.id)), performance: value.id === 'cosyvoice' ? 'instruction' : 'none',
      languages: Array.isArray(value.supported_language_names) ? value.supported_language_names.map(String) : null,
      maxReferenceSeconds: typeof value.max_ref_seconds === 'number' && value.max_ref_seconds > 0 ? value.max_ref_seconds : null, source: text(value.docs_url) }));
    const models: SpeechServiceCatalog['models'] = list(record(modelValue).models).map(value => ({ id: String(value.repo_id), name: String(value.label ?? value.repo_id),
      engines: Array.isArray(value.engines) ? value.engines.map(String) : [], installed: value.installed === true,
      source: `https://huggingface.co/${String(value.repo_id)}`, conditions: text(value.note) ?? (value.repo_id === 'k2-fsa/OmniVoice' ? 'OmniVoice weights have non-commercial conditions. Review the model card and VoiceStudio LICENSE-NOTICE before use.' : null) }));
    const voices: SpeechServiceCatalog['voices'] = profiles.filter(value => typeof value.id === 'string').map(value => ({ id: value.id, name: String(value.name ?? value.id), kind: 'profile', engine: null, language: text(value.language) }));
    // These are the preset identities declared by the checked KittenTTS endpoint implementation.
    if (engines.some(engine => engine.id === 'kittentts' && engine.available)) for (const number of [2, 3, 4, 5]) for (const gender of ['m', 'f']) voices.push({ id: `preset:expr-voice-${number}-${gender}`, name: `KittenTTS ${number} ${gender}`, kind: 'preset', engine: 'kittentts', language: 'en' });
    const catalog = SpeechServiceCatalogSchema.parse({ activeEngine: String(tts.active ?? ''), activeModel: text(tts.active_model), engines, models, voices,
      designPresets: list(personalities).filter(value => text(value.instruct)).map(value => ({ id: String(value.id), name: String(value.name ?? value.id), instruction: String(value.instruct), language: text(value.language) })),
      transcription: { engine: String(asr.active ?? ''), model: text(asr.active_model), available: list(asr.backends).some(value => value.id === asr.active && value.available === true) } });
    return { catalog, profiles: profiles.map(profileFacts), ...({ serviceVersion: text(record(health).version) }) } as Runtime;
  }
  async inspect(config: ConnectionConfig, purpose: Purpose): Promise<CapabilityReport> {
    const report: CapabilityReport = { connectionId: config.id, connectionRevision: config.revision, checkedAt: new Date().toISOString(), serviceVersion: null,
      purpose, status: 'unverified', inputs: [], output: purpose === `${pluginId}/transcribe` ? 'text' : 'audio', models: [], promptFormat: null, textVision: null,
      remote: { query: false, cancelQueued: false, cancelRunning: 'none' }, issues: [] };
    try {
      const current = await this.discover(); this.runtime ??= current;
      report.serviceVersion = (current as Runtime & { serviceVersion?: string }).serviceVersion ?? null;
      report.speechCatalog = current.catalog;
      report.models = current.catalog.engines.filter(engine => engine.available).map(engine => engine.id);
      const engine = current.catalog.engines.find(engine => engine.id === config.model);
      const transcribe = purpose === `${pluginId}/transcribe`;
      if (transcribe ? !current.catalog.transcription?.available : config.model && !engine?.available) throw new Error(transcribe ? 'The active VoiceStudio transcription engine is unavailable.' : `VoiceStudio engine ${config.model} is missing or unavailable. Select an engine reported by this connection.`);
      report.inputs = purpose.includes('/') ? [{ port: 'fields', required: true, supported: true, limits: {} }, { port: 'references', required: false, supported: true, limits: {} }]
        : ['text', 'language', 'voiceId', 'referenceAudio', 'referenceText', 'referenceLanguage', 'speed', 'emotion'].map(port => ({ port, required: port === 'text', supported: port !== 'emotion' && (port !== 'referenceAudio' || engine?.cloning === true) && (port !== 'speed' || engine?.speed === true), limits: {} }));
    } catch (error) { report.status = 'unavailable'; report.issues.push(issue('VOICESTUDIO_DISCOVERY', String(error))); report.speechCatalog ??= emptyCatalog(); }
    return report;
  }
  async freeze(): Promise<Json> { this.runtime ??= await this.discover(); return structuredClone(this.runtime) as unknown as Json; }
  private normalize(input: GenerationInput) {
    if (input.purpose === 'speech' && 'text' in input) return { mode: 'speech', fields: { text: input.text, language: input.language, voiceId: input.voiceId ?? '', referenceText: input.referenceText ?? '',
      voiceDescription: '', performanceInstruction: input.emotion ?? '', speed: input.speed ?? 1, seed: null } as Record<string, Json>, references: input.referenceAudio ? [{ ...input.referenceAudio, port: 'referenceAudio' }] : [] };
    if (!('fields' in input) || !operations.some(operation => operation.id === input.purpose)) throw new Error('This input is not a VoiceStudio operation.');
    return { mode: input.purpose.split('/')[1]!, fields: input.fields, references: input.references };
  }
  async validateInput(input: GenerationInput): Promise<Result<void>> {
    try {
      const { mode, fields, references } = this.normalize(input);
      if ('fields' in input) { const schema = operations.find(operation => operation.id === input.purpose)!.inputSchema, checked = validateJsonData(schema, fields); if (!checked.ok) throw new Error(checked.issues.map(value => value.message).join('; ')); }
      this.runtime ??= await this.discover();
      const engine = this.runtime.catalog.engines.find(engine => engine.id === this.config.model);
      if (mode !== 'transcribe' && !engine?.available) throw new Error('Select an available VoiceStudio engine before preparing speech.');
      const audio = references.find(reference => reference.port === 'referenceAudio');
      if (mode === 'transcribe') { if (!audio) throw new Error('Select the recording to transcribe.'); if (!this.runtime.catalog.transcription?.available) throw new Error('The active transcription engine is unavailable.'); return { ok: true, value: undefined, warnings: [] }; }
      if (!String(fields.text ?? '').trim()) throw new Error('Spoken text is required.');
      if ((mode === 'clone' || audio) && !engine!.cloning) throw new Error('This engine does not support reference cloning.');
      if (mode === 'clone' && !audio) throw new Error('Reference clone requires an audio recording.');
      if (mode === 'design' && engine!.design === 'none') throw new Error('This engine has no confirmed voice-design HTTP endpoint.');
      if (mode === 'design' && !String(fields.voiceDescription ?? '').trim()) throw new Error('Describe the voice or choose its design attributes.');
      if (fields.voiceDescription && engine!.design === 'none') throw new Error('Voice design is unavailable on this engine endpoint.');
      if (fields.voiceDescription && engine!.design === 'tags') validateDesignTags(String(fields.voiceDescription));
      if (fields.performanceInstruction && engine!.performance === 'none') throw new Error('This engine HTTP endpoint does not accept performance instructions. OmniVoice uses voice-design attributes instead of emotion labels.');
      if (fields.voiceId && !audio) { const voice = this.runtime.catalog.voices.find(voice => voice.id === fields.voiceId); if (!voice || voice.engine && voice.engine !== engine!.id) throw new Error('The selected voice is missing or belongs to a different engine. Rebind the voice.'); if (voice.kind === 'profile' && !engine!.cloning) throw new Error('This engine accepts its own preset voices and cannot use a saved reference profile.'); }
      if (typeof fields.speed === 'number' && (fields.speed < .25 || fields.speed > 4)) throw new Error('Speed must be between 0.25 and 4.');
      if (typeof fields.speed === 'number' && fields.speed !== 1 && !engine!.speed) throw new Error('This engine HTTP endpoint does not support a speed override. Set speed to 1 or select a compatible engine.');
      return { ok: true, value: undefined, warnings: [] };
    } catch (error) { return failure('VOICESTUDIO_INPUT', String(error)); }
  }
  async *submit(input: GenerationInput, context: SubmissionContext) {
    let sent = false;
    try {
      const checked = await this.validateInput(input); if (!checked.ok) throw new Error(checked.error.message);
      const { mode, fields, references } = this.normalize(input), frozen = this.runtime!, current = await this.discover();
      if (mode === 'transcribe' ? JSON.stringify(frozen.catalog.transcription) !== JSON.stringify(current.catalog.transcription)
        : JSON.stringify(modelFacts(frozen.catalog, this.config.model)) !== JSON.stringify(modelFacts(current.catalog, this.config.model))) throw new Error('The VoiceStudio engine/model changed. Review a new plan before submitting.');
      const voiceId = String(fields.voiceId ?? ''), reference = references.find(reference => reference.port === 'referenceAudio');
      if (voiceId && !reference && !voiceId.startsWith('preset:') && JSON.stringify(frozen.profiles.find(profile => profile.id === voiceId)) !== JSON.stringify(current.profiles.find(profile => profile.id === voiceId))) throw new Error('The saved voice changed. Rebind it and review a new plan.');
      const headers = await this.headers(), form = new FormData(); let path: string, body: BodyInit;
      if (mode === 'transcribe') {
        path = '/v1/audio/transcriptions'; form.set('model', frozen.catalog.transcription!.engine); form.set('response_format', 'json');
        if (fields.language) form.set('language', String(fields.language));
        form.set('file', new Blob([await readFile(reference!.localPath)], { type: reference!.mime }), 'reference.wav'); body = form;
      } else if (!reference && (voiceId.startsWith('preset:') || frozen.catalog.engines.find(engine => engine.id === this.config.model)?.design === 'description' && fields.voiceDescription)) {
        path = '/v1/audio/speech'; headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ model: this.config.model, input: fields.text, voice: voiceId.replace(/^preset:/, '') || 'default', language: fields.language || undefined,
          response_format: 'wav', speed: fields.speed ?? 1, seed: fields.seed ?? undefined, description: fields.voiceDescription || undefined, instruct: fields.performanceInstruction || undefined });
      } else {
        path = '/generate'; form.set('text', String(fields.text)); form.set('engine', this.config.model); form.set('stream', 'false'); form.set('effect_preset', 'raw');
        for (const [key, value] of Object.entries({ language: fields.language, ref_text: fields.referenceText, speed: fields.speed, seed: fields.seed,
          instruct: fields.voiceDescription || fields.performanceInstruction })) if (value !== undefined && value !== null && value !== '') form.set(key, String(value));
        if (reference) form.set('ref_audio', new Blob([await readFile(reference.localPath)], { type: reference.mime }), 'reference.wav');
        else if (voiceId) form.set('profile_id', voiceId);
        body = form;
      }
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout((context.config.timeoutSecByPurpose[input.purpose] ?? context.config.timeoutSecByPurpose.speech) * 1000)]);
      context.signal.throwIfAborted(); await context.beforeSend?.(); sent = true;
      const response = await this.request(this.url(path), { method: 'POST', headers, body, signal });
      if (!response.ok) { const detail = await response.text(); yield { kind: 'error' as const, issue: issue('VOICESTUDIO_HTTP', `VoiceStudio HTTP ${response.status}: ${detail}`), remoteStatus: 'failed' as const }; return; }
      yield { kind: 'accepted' as const, remote: null };
      await mkdir(context.directory, { recursive: true });
      let artifact: Artifact;
      if (mode === 'transcribe') {
        const transcript = record(await response.json()).text; if (typeof transcript !== 'string' || !transcript.trim()) throw new Error('VoiceStudio returned an empty transcript.');
        const localPath = join(context.directory, 'reference-transcript.txt'); await writeFile(localPath, transcript);
        artifact = { kind: 'text', port: 'transcript', localPath, mime: 'text/plain', bytes: Buffer.byteLength(transcript), metadata: { engine: frozen.catalog.transcription!.engine, model: frozen.catalog.transcription!.model }, groupId: context.requestId, role: 'primary', background: null };
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('audio/') || bytes.byteLength < 44 || Buffer.from(bytes.slice(0, 4)).toString() !== 'RIFF' || Buffer.from(bytes.slice(8, 12)).toString() !== 'WAVE' || new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true) + 8 > bytes.byteLength) throw new Error('VoiceStudio did not return a complete WAV audio response.');
        const localPath = join(context.directory, 'voicestudio.wav'); await writeFile(localPath, bytes);
        const metadata = this.options.probe ? (await this.options.probe(localPath, 'audio/wav')).metadata : {};
        artifact = { kind: 'audio', port: 'audio', localPath, mime: 'audio/wav', bytes: bytes.byteLength,
          metadata: { ...record(metadata), engine: this.config.model, models: modelFacts(frozen.catalog, this.config.model).models, voiceId: voiceId || null,
            serviceAudioId: response.headers.get('X-Audio-Id'), service: 'VoiceStudio' }, groupId: context.requestId, role: 'primary', background: null };
      }
      yield { kind: 'output' as const, artifacts: [artifact], usage: null };
    } catch (error) { yield { kind: 'error' as const, issue: issue('VOICESTUDIO_REQUEST', String(error)), remoteStatus: sent ? 'unknown' as const : 'failed' as const }; }
  }
  async query(): Promise<Result<import('@galcraft/contracts').RemoteStatus>> { return failure('REMOTE_UNSUPPORTED', 'The VoiceStudio synchronous endpoint has no resumable task identity. Review the original request before starting another.'); }
  async fetch(): Promise<Result<Artifact[]>> { return failure('REMOTE_UNSUPPORTED', 'This VoiceStudio endpoint delivers the WAV in the original response.'); }
  async cancel(): Promise<import('@galcraft/contracts').CancelResult> { return { local: 'stopped', remote: 'unsupported' }; }
}
export function createPlugin(): GalCraftPlugin { return { async activate(context) { return { ...emptyContributions(), generationProviders: [{ key: providerKey, version: '0.1.0',
  purposes: ['speech', ...operations.map(operation => operation.purpose as Purpose)], protocols: ['voiceStudio'], execution: 'remote', configFields: [], capabilities,
  inputSchema: generationInputJsonSchema(['speech'], operations.map(operation => ({ purpose: operation.purpose, fields: operation.inputSchema }))), outputSchema: GenerationOutputJsonSchema,
  create(config, frozen) { if (config.protocol !== 'voiceStudio') throw new Error('The connection does not use VoiceStudio.'); return new VoiceStudioAdapter(config, { credential: id => context.credentials?.read(id) ?? Promise.resolve(null),
    probe: async (path, mime) => { if (!context.media) throw new Error('The media probe provider is unavailable.'); return context.media.probe(path, mime); } }, frozen); },
}] }; }, async deactivate() {} }; }
