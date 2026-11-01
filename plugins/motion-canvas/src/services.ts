import { localGenerationOutputJsonSchema, MediaInputSchema } from '@galcraft/contracts';
import { readFile, mkdir } from 'node:fs/promises';
import type { Artifact, CapabilityReport, Json, ServiceEvent } from '@galcraft/contracts';
import type { GalCraftPlugin, PluginContext, PluginGenerationAdapter } from '@galcraft/plugins/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import { motionIssue, motionProjectSchema, operationId, parseMotionProject, pluginId, projectDocumentKey, renderProviderKey, toolchainKey } from './project.js';
import { projectInfoTool } from './tools.js';
type Runtime = {renderMotionProject(input: {project: import('./project.js').MotionProject; resources: {alias: string; mime: string; bytes: Uint8Array}[]; directory: string; requestId: string; signal: AbortSignal; expected: Json; onProgress(event: {phase: string; completed: number | null; total: number | null}): void}): Promise<{localPath: string; mime: string; bytes: number; metadata: Json}>};
async function runtime(context: Pick<PluginContext, 'runtimeDependencies'>) {
  const resolved = await context.runtimeDependencies?.load?.(toolchainKey);
  if (!resolved?.ok) throw new Error(resolved && !resolved.ok ? resolved.error.message : 'Prepare and install the optional local Motion Canvas toolchain.');
  if (typeof resolved.value.module.renderMotionProject !== 'function') throw new Error('The Motion Canvas toolchain lacks the public renderMotionProject entry.');
  return {module: resolved.value.module as unknown as Runtime, expected: resolved.value.expected};
}
function sameRuntime(actual: Json, frozen: Json): boolean {
  const a = actual as Record<string, any>, b = frozen as Record<string, any>;
  const fields = ['id','version','motionCanvas','vite','playwright'];
  return fields.every(key => a[key] === b[key]) && a.browser?.name === b.browser?.name && a.browser?.version === b.browser?.version
    && ['ffmpegVersion','ffprobeVersion','videoEncoder','audioEncoder','pixelFormat'].every(key => a.encoding?.[key] === b.encoding?.[key])
    && Object.keys(a.dependencies ?? {}).length === Object.keys(b.dependencies ?? {}).length
    && Object.entries(b.dependencies ?? {}).every(([key,value]) => a.dependencies?.[key] === value);
}
export function createMotionRenderAdapter(context: Pick<PluginContext, 'runtimeDependencies'>, frozenRuntime?: Json): PluginGenerationAdapter {
  return {
    async validateInput(input){
      if(input.purpose!==operationId||!('fields' in input)){const error=motionIssue('MOTION_OPERATION','Choose the Motion Canvas render operation.');return {ok:false,error,issues:[error]};}
      const parsed=parseMotionProject(input.fields.project);if(!parsed.ok)return parsed;
      const missing=parsed.value.bindings.find(binding=>!input.references.some(ref=>ref.assetId===binding.assetId&&ref.variantId===binding.variantId&&ref.port===binding.port));
      if(missing){const error=motionIssue('MOTION_RESOURCE',`Asset ${missing.alias} needs its exact frozen ${missing.port} reference (${missing.assetId}/${missing.variantId}).`);return {ok:false,error,issues:[error]};}
      return {ok:true,warnings:[],value:undefined};
    },
    async freeze() {return structuredClone((await runtime(context)).expected);},
    async inspect(config, purpose): Promise<CapabilityReport> {
      const issues = []; try {await runtime(context);} catch (error) {issues.push({...motionIssue('MOTION_RUNTIME', String(error)), actions: ['supplyDependency' as const]});}
      return {connectionId: config.id, connectionRevision: config.revision, checkedAt: new Date().toISOString(), serviceVersion: '0.1.0', purpose, status: purpose === operationId && !issues.length ? 'verified' : 'unavailable', inputs: [{port: 'fields', required: true, supported: true, limits: {}}, {port: 'references', required: false, supported: true, limits: {}}], output: 'video', models: ['Motion Canvas 3.17.2'], promptFormat: null, textVision: null, remote: {query: false, cancelQueued: false, cancelRunning: 'perTask'}, issues};
    },
    async *submit(input, submission): AsyncIterable<ServiceEvent> {
      if (input.purpose !== operationId || !('fields' in input)) {yield {kind: 'error', issue: motionIssue('MOTION_OPERATION', 'Select the Motion Canvas render operation.'), remoteStatus: 'failed'}; return;}
      const parsed = parseMotionProject(input.fields.project);
      if (!parsed.ok) {for (const issue of parsed.issues) yield {kind: 'error', issue, remoteStatus: 'failed'}; return;}
      let loaded; try {loaded = await runtime(context);} catch (error) {yield {kind: 'error', issue: {...motionIssue('MOTION_RUNTIME', String(error)), actions: ['supplyDependency']}, remoteStatus: 'failed'}; return;}
      if (frozenRuntime !== undefined && !sameRuntime(loaded.expected, frozenRuntime)) {yield {kind: 'error', issue: motionIssue('MOTION_RUNTIME_CHANGED', 'The actual toolchain changed. Read its current version and review a new production plan.'), remoteStatus: 'failed'}; return;}
      const project = parsed.value;
      submission.signal.throwIfAborted(); await mkdir(submission.directory, {recursive: true});
      const resources = [];
      try {
        for (const binding of project.bindings) {
          const reference = input.references.find(item => item.assetId === binding.assetId && item.variantId === binding.variantId && item.port === binding.port);
          if (!reference) throw new Error(`Asset ${binding.alias} lacks its frozen input: ${binding.assetId}/${binding.variantId}/${binding.port}`);
          resources.push({alias: binding.alias, mime: reference.mime, bytes: new Uint8Array(await readFile(reference.localPath))});
        }
      } catch (error) {yield {kind: 'error', issue: motionIssue('MOTION_RESOURCE', String(error)), remoteStatus: 'failed'}; return;}
      yield {kind: 'accepted', remote: null};
      const queue: ServiceEvent[] = []; let done = false, wake: (() => void) | undefined;
      const push = (event: ServiceEvent) => {queue.push(event); wake?.(); wake = undefined;};
      const deadline = new AbortController(), timeoutSec = submission.config.timeoutSecByPurpose[operationId] ?? 600;
      const signal = AbortSignal.any([submission.signal, deadline.signal]);
      const timer = setTimeout(() => deadline.abort(new DOMException(`Motion Canvas rendering timed out after ${timeoutSec} seconds.`, 'TimeoutError')), timeoutSec * 1000);
      const rendering = loaded.module.renderMotionProject({project, resources, directory: submission.directory, requestId: submission.requestId, signal, expected: loaded.expected,
        onProgress(event) {push({kind: 'progress', ...event});},
      }).then(output => {
        signal.throwIfAborted();
        const artifact: Artifact = {kind: 'video', localPath: output.localPath, mime: output.mime, bytes: output.bytes, port: 'video', groupId: submission.requestId, role: 'primary', background: null,
          metadata: {...output.metadata as Record<string, Json>, motionCanvasSource: {pluginId, pluginVersion: '0.1.0', project: project as unknown as Json}, authorDocument: {pluginId, contributionKey: projectDocumentKey, stateVersion: 1, data: {project: project as unknown as Json}, name: project.title}}};
        push({kind: 'output', artifacts: [artifact], usage: {engine: 'Motion Canvas', version: '3.17.2', requests: 1}});
      }).catch(error => {if (!submission.signal.aborted) push({kind: 'error', issue: motionIssue(deadline.signal.aborted ? 'MOTION_TIMEOUT' : 'MOTION_RENDER', `${error.stage ?? 'rendering'}: ${deadline.signal.aborted ? deadline.signal.reason.message : error.message}`), remoteStatus: 'failed'});}).finally(() => {done = true; wake?.();});
      try {while (!done || queue.length) {submission.signal.throwIfAborted(); if (!queue.length) {await new Promise<void>(resolve => {wake = resolve;}); continue;} yield queue.shift()!;}}
      finally {clearTimeout(timer); await rendering;}
    },
    async query() {const error = motionIssue('MOTION_LOCAL', 'Local task states and candidates are stored by M10.'); return {ok: false, error, issues: [error]};},
    async fetch() {const error = motionIssue('MOTION_LOCAL', 'Read existing video candidates. Create a new execution for an explicit render.'); return {ok: false, error, issues: [error]};},
    async cancel() {return {local: 'stopped', remote: 'notApplicable'};},
  };
}
export function createPlugin(): GalCraftPlugin {return {async activate(context) {
  const contributions = emptyContributions(); contributions.tools = [projectInfoTool(context)]; contributions.generationProviders = [{key: renderProviderKey, execution: 'local', version: '0.1.0', purposes: [operationId], configFields: [],
    inputSchema: {type: 'object', properties: {purpose: {const: operationId}, fields: {type: 'object', properties: {project: motionProjectSchema}, required: ['project'], additionalProperties: false}, references: {type: 'array',items:MediaInputSchema.toJSONSchema({io:'input'}) as Json}}, required: ['purpose','fields','references'], additionalProperties: false},
    outputSchema: localGenerationOutputJsonSchema('video','video/mp4','video','Motion Canvas','3.17.2'),
    capabilities: {query: false, refetch: false, cancelPerTask: true, resume: false}, create: (_config, frozenRuntime) => createMotionRenderAdapter(context, frozenRuntime)}]; return contributions;
}, async deactivate() {}};}
