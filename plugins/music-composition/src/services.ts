import { localGenerationOutputJsonSchema, MediaInputSchema } from '@galcraft/contracts';
import { Worker as NodeRenderWorker } from 'node:worker_threads';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CapabilityReport, Issue, Json, ServiceEvent, GenerationInput, Result } from '@galcraft/contracts';
import type { GalCraftPlugin, PluginContext, PluginGenerationAdapter } from '@galcraft/plugins/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import { writingPreparationKey } from './metadata.js';
import { musicScoreSchema, operationId, parseGeneratedMusicScore, parseMusicScore } from './score.js';
import { soundBankKeys, parseMusicInstruments, readSoundBank, validateScoreInstruments } from './catalog.js';
import { soundbankInfoTool } from './tools.js';
import { resolveMusicWritingInput, prepareMusicWritingInput } from './writing-input.js';
import { musicConstraintViolations, parseMusicConstraints } from './constraints.js';
const issue = (code: string, message: string): Issue => ({ code, message, severity: 'error', owner: 'M10', related: [], actions: ['edit'] });
async function validateMusicInput(context:Pick<PluginContext,'runtimeDependencies'|'soundbanks'>,input:GenerationInput):Promise<Result<void>>{
  try{
    if(input.purpose.endsWith('/writeScore')) { await resolveMusicWritingInput(context,input,async url=>{const bytes=await readFile(new URL(url));return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);});return {ok:true,warnings:[],value:undefined}; }
    if(!('fields' in input))throw new Error('Music domain fields are missing.');
    const score=parseMusicScore(input.fields.score);if(!score.ok)return score;
    const resolved=context.soundbanks?await context.soundbanks.resolve(score.value.soundbank):soundBankKeys[score.value.soundbank.id]?await context.runtimeDependencies?.resolve(soundBankKeys[score.value.soundbank.id]!):undefined;
    if(!resolved?.ok)throw new Error(resolved&&!resolved.ok?resolved.error.message:'The exact required soundbank is not installed.');
    const bytes=await readFile(new URL(resolved.value.url)),actual=await readSoundBank(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const problems=validateScoreInstruments(score.value,actual.instruments);if(problems.length)throw new Error(problems.join('; '));
    return {ok:true,warnings:[],value:undefined};
  }catch(error){const errorIssue=issue('MUSIC_INPUT',error instanceof Error?error.message:String(error));return {ok:false,error:errorIssue,issues:[errorIssue]};}
}
export const renderProviderKey = 'org.galcraft.music-composition/renderProvider';
export function createMusicRenderAdapter(context: Pick<PluginContext, 'runtimeDependencies' | 'soundbanks'>): PluginGenerationAdapter {
  return {
    validateInput:input=>validateMusicInput(context,input),
    async inspect(config, purpose): Promise<CapabilityReport> {
      return { connectionId: config.id, connectionRevision: config.revision, checkedAt: new Date().toISOString(), serviceVersion: '0.1.0', purpose,
        status: purpose === operationId ? 'verified' : 'unavailable', inputs: [{ port: 'fields', required: true, supported: true, limits: {} }, { port: 'references', required: false, supported: true, limits: {} }], output: 'audio',
        models: ['SpessaSynth 4.3.22'], promptFormat: null, textVision: null,
        remote: { query: false, cancelQueued: false, cancelRunning: 'perTask' }, issues: [] };
    },
    async *submit(input, submission): AsyncIterable<ServiceEvent> {
      if (input.purpose !== operationId || !('fields' in input)) { yield { kind: 'error', issue: issue('MUSIC_OPERATION', 'Choose the editable composition render operation.'), remoteStatus: 'failed' }; return; }
      const parsed = parseMusicScore(input.fields.score);
      if (!parsed.ok) { for (const error of parsed.issues) yield { kind: 'error', issue: error, remoteStatus: 'failed' }; return; }
      const resolved = context.soundbanks ? await context.soundbanks.resolve(parsed.value.soundbank) : soundBankKeys[parsed.value.soundbank.id] ? await context.runtimeDependencies?.resolve(soundBankKeys[parsed.value.soundbank.id]!) : undefined;
      if (!resolved?.ok) { yield { kind: 'error', issue: resolved && !resolved.ok ? resolved.error : issue('SOUNDBANK_MISSING', 'Install the exact required soundbank.'), remoteStatus: 'failed' }; return; }
      const descriptor = resolved.value.expected as { id?: string; version?: string };
      if (descriptor.id !== parsed.value.soundbank.id || descriptor.version !== parsed.value.soundbank.version) { yield { kind: 'error', issue: issue('SOUNDBANK_VERSION', 'The installed soundbank identity differs from the frozen score.'), remoteStatus: 'failed' }; return; }
      submission.signal.throwIfAborted(); await mkdir(submission.directory, { recursive: true });
      yield { kind: 'accepted', remote: null };
      const worker = new NodeRenderWorker(new URL(/* @vite-ignore */ './render-worker.js', import.meta.url), { workerData: { score: parsed.value, descriptor: resolved.value.expected,
        soundbankUrl: resolved.value.url, directory: submission.directory, requestId: submission.requestId } });
      const queue: unknown[] = []; let wake: (() => void) | undefined, done = false;
      const push = (message: unknown) => { queue.push(message); wake?.(); wake = undefined; };
      worker.on('message', push); worker.on('error', error => push({ kind: 'failure', message: error.message }));
      worker.on('exit', code => { done = true; if (code && !submission.signal.aborted) push({ kind: 'failure', message: `The render process exited (${code}).` }); else wake?.(); });
      const abort = () => { done = true; void worker.terminate(); wake?.(); };
      submission.signal.addEventListener('abort', abort, { once: true });
      try {
        while (!done || queue.length) {
          submission.signal.throwIfAborted();
          if (!queue.length) { await new Promise<void>(resolve => { wake = resolve; }); continue; }
          const message = queue.shift() as { kind: string; completed?: number; total?: number; artifact?: import('@galcraft/contracts').Artifact; message?: string };
          if (message.kind === 'progress') yield { kind: 'progress', phase: 'Offline sampled-instrument rendering', completed: message.completed!, total: message.total! };
          else if (message.kind === 'output') { yield { kind: 'output', artifacts: [message.artifact!], usage: { engine: 'spessasynth_core', version: '4.3.22', requests: 1 } }; return; }
          else if (message.kind === 'failure') { yield { kind: 'error', issue: issue('MUSIC_RENDER', message.message!), remoteStatus: 'failed' }; return; }
        }
      } finally { submission.signal.removeEventListener('abort', abort); await worker.terminate();
        await rm(join(submission.directory, 'composition.wav.part'), { force: true }); }
    },
    async query() { const error = issue('MUSIC_LOCAL_TASK', 'Local rendering has no remote query identity.'); return { ok: false, error, issues: [error] }; },
    async fetch() { const error = issue('MUSIC_LOCAL_TASK', 'Create a new task to render again. Complete local candidates remain available.'); return { ok: false, error, issues: [error] }; },
    async cancel() { return { local: 'stopped', remote: 'notApplicable' }; },
  };
}
export function createPlugin(): GalCraftPlugin {
  return { async activate(context) { const contributions = emptyContributions();
    contributions.tools=[soundbankInfoTool(context,async url=>{const bytes=await readFile(new URL(url));return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);})];
    contributions.textPreparations=[{
      key:writingPreparationKey,version:'0.1.0',
      validateInput:input=>validateMusicInput(context,input),
      prepare:prepareMusicWritingInput,
      async process(raw,input,submission){if(!('fields' in input))throw new Error('Score-writing fields are missing.');const parsed=parseGeneratedMusicScore(raw);if(!parsed.ok)throw new Error(parsed.error.message);
        const frozen=(input.fields.soundbank??(input.fields.score as {soundbank?:Json}|undefined)?.soundbank) as {id:string;version:string};
        if(parsed.value.soundbank.id!==frozen.id||parsed.value.soundbank.version!==frozen.version)throw new Error('The written score changed the frozen soundbank identity.');
        if(Object.entries(input.fields.render as Record<string,Json>).some(([key,value])=>parsed.value.render[key as keyof typeof parsed.value.render]!==value))throw new Error('The written score changed the frozen rendering settings.');
        const problems=[...validateScoreInstruments(parsed.value,parseMusicInstruments(input.fields.instruments)),...musicConstraintViolations(parsed.value,parseMusicConstraints(input.fields.musicConstraints))];if(problems.length)throw new Error(problems.join('\n'));
        const adapter=createMusicRenderAdapter(context);for await(const event of adapter.submit({purpose:operationId,fields:{score:parsed.value as unknown as Json},references:[]},submission)){
          if(event.kind==='error')throw new Error(event.issue.message);if(event.kind==='output')return event.artifacts;
        }throw new Error('Local rendering did not produce a complete output.');
      }
    }];
    contributions.generationProviders = [{ key: renderProviderKey, execution:'local', version: '0.1.0', purposes: [operationId], configFields: [],
      inputSchema: { type: 'object', properties: { purpose: { const: operationId }, fields: { type: 'object', properties: { score: musicScoreSchema }, required: ['score'], additionalProperties: false }, references: { type: 'array', items:MediaInputSchema.toJSONSchema({io:'input'}) as Json } }, required: ['purpose', 'fields', 'references'], additionalProperties: false },
      outputSchema: localGenerationOutputJsonSchema('audio','audio/wav','audio','spessasynth_core','4.3.22'),
      capabilities: { query: false, refetch: false, cancelPerTask: true, resume: false }, create: () => createMusicRenderAdapter(context) }];
    return contributions;
  }, async deactivate() {} };
}
