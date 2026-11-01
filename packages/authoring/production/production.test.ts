import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectSession } from '@galcraft/documents';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { Asset, ConnectionConfig, ServiceEvent, VersionRef } from '@galcraft/contracts';
import { createOfficialTemplate, createTemplateDocuments, compositionClosure, prepareComposition } from '@galcraft/templates';
import type { UIComposition } from '@galcraft/templates';
import { ProductionService } from './service.js';
import { inputCapability } from './capabilities.js';
import { GenerationConnections } from './connections.js';
import { HttpGenerationAdapter, serviceUrl } from '@galcraft/generation-services';
import { events, lines } from '@galcraft/generation-services';
import { ok, requireValue, topological, validateWorkflow, validateInput } from './validation.js';
import { prepareRecipe, parsePrompt } from './recipe-preparer.js';
import { OfficialRecipes } from '../recipes/official.js';
import type { GenerationAdapter, GenerationInput, ProductionFormDraft, SubmissionContext, TaskItem, WorkflowBinding } from './types.js';

const fixtures = resolve(import.meta.dirname, '../../../tmp/testing/production'), id = randomUUID;
let root: string, session: ProjectSession, docId: string, projectId: string;
const config = (protocol: ConnectionConfig['protocol'] = 'chatCompletions'): ConnectionConfig => ({ id: id(), revision: 1, name: '测试连接', protocol, baseUrl: 'http://local.invalid/v1', credentialId: null,
  auth: 'none', apiKeyHeader: null, model: 'test', purposes: ['text', 'image', 'difference', 'speech', 'music'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null });
const textInput = (): GenerationInput => ({ purpose: 'text', system: '合同', messages: [{ role: 'user', text: '中文日本語', attachments: [] }], maxOutputTokens: 64, temperature: null, seed: null });
function item(connection = config()): TaskItem { return { id: id(), purpose: 'text', target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'script', uiScope: null },
  backgroundRemoval: null, backgroundPreview: null, dependencies: [], input: textInput(), sourceVersions: [], configSnapshot: connection, workflowSnapshot: null, recipeSnapshot: null, state: 'draft', remote: null,
  progress: { phase: '', completed: null, total: null }, attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false, issues: [] }; }
const versions = (): VersionRef[] => [{ ref: { kind: 'document', id: docId }, revision: session.readDocument(docId)!.revision }];
function adapter(send: (input: GenerationInput, ctx: SubmissionContext) => AsyncIterable<ServiceEvent>): GenerationAdapter {
  return { submit: send, inspect: async () => { throw new Error('unused'); }, query: async () => ok({ state: 'unknown', output: null, issues: [] }), fetch: async () => ok([]), cancel: async () => ({ local: 'stopped', remote: 'unsupported' }) };
}
function service(remote: GenerationAdapter): ProductionService { return new ProductionService({ userData: join(root, 'user-data'), project: session, adapter: () => remote,
  review: async (_candidates, expected) => ok({ label: '采用文本', origin: 'candidate', expected, preparedAssets: [], requiredRefs: [], patches: [{ kind: 'json', documentId: docId, changes: [{ path: '/data/value', before: '原文', after: '候选', op: 'set' }] }] }) }); }
async function submit(production: ProductionService, items: TaskItem[], sourceDraftId: string | null = null) {
  const plan = requireValue(await production.planTask({ projectId, name: '制作', items, context: [], policy: 'waitForSelection', selectionRule: null, sourceDraftId }));
  return { plan, task: requireValue(await production.submit(plan.planId)) };
}
describe('插件生成提供者的持久任务', () => {
  it('projects navigation summaries separately from exact task input and candidate media', async () => {
    const production = service(adapter(async function* () { yield { kind: 'textDelta', text: 'candidate' }; yield { kind: 'output', artifacts: [], usage: null }; }));
    const source = item(); source.input = { ...textInput(), system: 'Frozen input '.repeat(30000) } as GenerationInput;
    const { task } = await submit(production, [source]); await production.drain();
    const summary = production.listTaskSummaries(); expect(summary).toHaveLength(1); expect(JSON.stringify(summary).length).toBeLessThan(600);
    expect(summary[0]).toMatchObject({ id: task.id, items: [{ id: source.id, state: 'review' }] });
    expect(production.getTask(task.id)!.items[0]!.input).toEqual(source.input);
    summary[0]!.items[0]!.state = 'failed'; expect(production.listTaskSummaries()[0]!.items[0]!.state).toBe('review');
    expect(production.listImageCandidates()).toEqual([]); await production.close();
  });
  it('records a complete text domain failure as failed and reprocesses retained text without another remote request', async () => {
    const operation='org.example.music/writeScore' as const, preparationKey='org.example.music/writing';
    let requests=0, valid=false;
    const remote=adapter(async function*(){requests++;yield {kind:'textDelta',text:'complete score JSON'};yield {kind:'output',artifacts:[],usage:{requests:1}};});
    const production=new ProductionService({...service(remote).options,acquireTextPreparation:async()=>({packageVersion:'0.1.0',async release(){},provider:{key:preparationKey,version:'0.1.0',prepare:()=>textInput() as Extract<GenerationInput,{purpose:'text'}>,async process(raw,_input,ctx){
      if(!valid)throw new Error('musicConstraints.fixedBpm: received 96; required 120');
      const path=join(ctx.directory,'unit-audio.wav');await mkdir(ctx.directory,{recursive:true});await writeFile(path,raw);
      return [{kind:'audio' as const,localPath:path,mime:'audio/wav',bytes:raw.length,metadata:{},groupId:'audio',role:'primary' as const,background:null}];
    }}})});
    const source=item();source.purpose=operation;source.operation=operation;source.configSnapshot!.purposes.push(operation);
    source.input={purpose:operation,fields:{description:'cue',musicConstraints:{fixedBpm:120}},references:[]};
    source.operationSnapshot={id:operation,version:1,provider:{id:'org.example.music',version:'0.1.0'},definition:{contractVersion:1,id:operation,version:1,title:'Write score',description:'',purpose:operation,providerKey:preparationKey,textPreparationKey:preparationKey,execution:'remote',fields:[],inputSchema:true,inputs:[],outputs:[{key:'audio',type:'audio',required:true,multiple:false,mimeTypes:['audio/wav']}],capabilities:{query:false,refetch:false,cancelPerTask:false,resume:false},adoption:{kind:'asset',assetKind:'audio',usages:['bgm']}}};
    const {task}=await submit(production,[source]);await production.drain();
    const failed=production.listTasks()[0]!.items[0]!;
    expect(failed).toMatchObject({state:'failed',rawOutput:'complete score JSON',attempts:[{outcome:'failed'}],issues:[{code:'PREPARATION_RESULT_INVALID'}]});
    expect(failed.issues[0]!.message).toContain('musicConstraints.fixedBpm');expect(failed.candidateIds).toHaveLength(1);
    valid=true;const fixed=requireValue(await production.reprocess(task.id,source.id,'corrected score JSON'));
    expect(fixed.items[0]!.state).toBe('review');expect(fixed.items[0]!.issues).toEqual([]);expect(fixed.items[0]!.progress.phase).toBe('review');expect(fixed.items[0]!.attempts).toMatchObject([{outcome:'failed'}]);expect(requests).toBe(1);
    await production.close();
  });
  it('persists original selection and edited-candidate identities with their collaboration calls',async()=>{
    const production=service(adapter(async function*(){yield {kind:'textDelta',text:'first'};yield {kind:'output',artifacts:[],usage:null};}));
    const {task}=await submit(production,[item()]);await production.drain();const original=production.listTasks()[0]!.items[0]!,candidateId=original.candidateIds[0]!;
    const context={sessionId:'Sess01',callId:'edit-text',scopeRevision:1,projectId,writeSessionId:'Write1',toolKey:'galcraft_production'};
    const edited=requireValue(await production.editCandidate(candidateId,'changed',context));
    expect((await production.store.read<import('./types.js').Task>(production.store.taskPath(task.id)))!.externalActions!['Sess01-edit-text']).toEqual({action:'editCandidate',candidateId:edited.id,itemId:original.id});
    const selected=requireValue(await production.selectCandidates({taskId:task.id,selections:[{itemId:original.id,candidateId:edited.id}],target:'taskOnly',expected:[],collaboration:{...context,callId:'select-text'}}));
    expect('items' in selected&&selected.items[0]!.selectedCandidateId).toBe(edited.id);
    expect((await production.store.read<import('./types.js').Task>(production.store.taskPath(task.id)))!.externalActions!['Sess01-select-text']).toEqual({action:'select'});await production.close();
  });

  it('retains noncredential token budgets in connection and task snapshots while keeping authentication in the credential store', async () => {
    const connection = config(); connection.parameters = { maxTokens: 256, tokenLimit: 128 };
    const production = service(adapter(async function* () {})), connections = new GenerationConnections(production.store,
      new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }) }));
    expect((await connections.saveConnection(connection, null)).ok).toBe(true);
    const plan = requireValue(await production.planTask({ projectId, name: '配置冻结', items: [item(connection)], context: [], policy: 'waitForSelection', selectionRule: null }));
    expect(plan.task.items[0]!.configSnapshot!.parameters).toEqual(connection.parameters);
    connection.parameters.accessToken = 'not-a-real-key';
    expect((await connections.saveConnection(connection, 1)).ok).toBe(false);
    const rejected = await production.planTask({ projectId, name: '凭据不入任务', items: [item(connection)], context: [], policy: 'waitForSelection', selectionRule: null });
    expect(rejected.ok).toBe(false); if (!rejected.ok) expect(rejected.error.message).toContain('credentialId');
  });
  it('queries and refetches known outputs independently from resuming remote execution', async () => {
    const connection = { ...config(), providerKey: 'test.service/generate' }, source = item(connection);
    const remote = adapter(async function* () { yield { kind: 'accepted', remote: { protocol: 'plugin', id: 'job', connectionId: connection.id, submittedAt: new Date().toISOString() } }; });
    remote.query = async () => ok({ state: 'completed', output: { file: 'result' }, issues: [] });
    remote.fetch = async (_ref, _output, ctx) => { await mkdir(ctx.directory, { recursive: true }); const path = join(ctx.directory, 'result.txt'); await writeFile(path, '已知成果');
      return ok([{ kind: 'text', localPath: path, mime: 'text/plain', bytes: 12, metadata: {}, role: 'primary', groupId: 'result', background: null }]); };
    const production = new ProductionService({ ...service(remote).options,
      freezeProvider: async (frozen, input) => ({ providerKey: frozen.providerKey!, packageVersion: '0.1.0', capabilities: { query: true, refetch: true, cancelPerTask: false, resume: false }, capability: inputCapability(frozen, input, null) }),
      acquireAdapter: async () => ({ adapter: remote, release() {} }) });
    const { task } = await submit(production, [source]); await production.drain(); await production.resume(task.id);
    expect(production.listTasks()[0]!.items[0]!.issues[0]?.code).toBe('REMOTE_RESUME_UNSUPPORTED');
    requireValue(await production.queryRemote(task.id, source.id)); const result = requireValue(await production.refetch(task.id, source.id));
    expect(result.items[0]!.state).toBe('review'); expect(result.items[0]!.candidateIds).toHaveLength(1);
  });
  it('freezes provider version and configuration, resumes with that adapter after restart, and never resubmits unknown status', async () => {
    const connection = { ...config(), providerKey: 'test.service/generate' }, source = item(connection);
    let version = '0.1.0', sends = 0, releases = 0;
    const observed: { version: string; model: string }[] = [];
    let remoteState: 'unknown' | 'completed' = 'unknown';
    const remote = adapter(async function* () {
      sends++; yield { kind: 'accepted', remote: { protocol: 'plugin', id: 'request-1', connectionId: connection.id, submittedAt: new Date().toISOString() } };
    });
    remote.query = async () => ok({ state: remoteState, output: { file: 'result.txt' }, issues: [] });
    remote.fetch = async (_ref, _output, ctx) => {
      await mkdir(ctx.directory, { recursive: true }); const path = join(ctx.directory, 'result.txt'); await writeFile(path, '原任务成果');
      return ok([{ kind: 'text', localPath: path, mime: 'text/plain', bytes: Buffer.byteLength('原任务成果'), metadata: {}, groupId: 'text/0', role: 'primary', background: null }]);
    };
    const options = () => ({ ...service(remote).options,
      freezeProvider: async (frozen: ConnectionConfig, input: GenerationInput) => ({ providerKey: frozen.providerKey!, packageVersion: version,
        capabilities: { query: true, refetch: true, cancelPerTask: false, resume: true }, capability: inputCapability(frozen, input, null) }),
      acquireAdapter: async (frozen: ConnectionConfig, snapshot: any) => { observed.push({ version: snapshot.packageVersion, model: frozen.model }); return { adapter: remote, release() { releases++; } }; } });
    const production = new ProductionService(options()), { task } = await submit(production, [source]);
    version = '2.0.0'; connection.model = 'changed'; await production.drain();
    expect(sends).toBe(1); expect(observed[0]).toEqual({ version: '0.1.0', model: 'test' });
    const reopened = new ProductionService(options()); await reopened.open(); await reopened.resume(task.id); await reopened.drain();
    expect(sends).toBe(1); expect(reopened.listTasks()[0]!.items[0]!.progress.phase).toBe('unknown');
    remoteState = 'completed'; await reopened.resume(task.id);
    const completed = reopened.listTasks()[0]!.items[0]!;
    expect(completed.state).toBe('review'); expect(completed.candidateIds).toHaveLength(1);
    expect(reopened.getCandidate(completed.candidateIds[0]!)!.provenance).toMatchObject({ providerKey: connection.providerKey, packageVersion: '0.1.0' });
    expect(observed.every(entry => entry.version === '0.1.0' && entry.model === 'test')).toBe(true); expect(releases).toBe(observed.length);
    expect((await reopened.retryItem(task.id, source.id, false)).ok).toBe(false); expect(sends).toBe(1);
  });
  it('reports unsupported cancellation without calling a global stop and retains a missing-provider task', async () => {
    let cancels = 0, sends = 0;
    const connection = { ...config(), providerKey: 'test.service/generate' }, source = item(connection);
    const remote = adapter(async function* () { sends++; yield { kind: 'accepted', remote: { protocol: 'plugin', id: 'job', connectionId: connection.id, submittedAt: new Date().toISOString() } }; });
    remote.cancel = async () => { cancels++; return { local: 'stopped', remote: 'confirmed' }; };
    const production = new ProductionService({ ...service(remote).options,
      freezeProvider: async (frozen, input) => ({ providerKey: frozen.providerKey!, packageVersion: '0.1.0', capabilities: { query: true, refetch: false, cancelPerTask: false, resume: true }, capability: inputCapability(frozen, input, null) }),
      acquireAdapter: async () => ({ adapter: remote, release() {} }) });
    const { task } = await submit(production, [source]); await production.drain();
    expect(requireValue(await production.cancel(task.id))).toEqual({ local: 'stopped', remote: 'unsupported' }); expect(cancels).toBe(0);
    const missing = service(remote); await missing.open(); await missing.resume(task.id);
    expect(missing.listTasks()[0]!.items[0]!.issues[0]).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', actions: ['supplyDependency'] }); expect(sends).toBe(1);
    expect(missing.listTasks()[0]!.items[0]!.remote?.id).toBe('job');
  });
  it('separates queries, refetch, and view subscriptions, and holds execution leases until close has interrupted the request', async () => {
    let release = 0, notified = 0, querying = 0, sends = 0;
    let accepted!: () => void; const started = new Promise<void>(resolve => { accepted = resolve; });
    const connection = { ...config(), providerKey: 'test.service/generate' }, source = item(connection);
    const remote = adapter(async function* (_input, ctx) {
      sends++;
      yield { kind: 'accepted', remote: { protocol: 'plugin', id: 'job', connectionId: connection.id, submittedAt: new Date().toISOString() } }; accepted();
      await new Promise<void>(resolve => ctx.signal.addEventListener('abort', () => resolve(), { once: true }));
    });
    remote.query = async () => { querying++; return ok({ state: 'completed', output: {}, issues: [] }); };
    const production = new ProductionService({ ...service(remote).options,
      freezeProvider: async (frozen, input) => ({ providerKey: frozen.providerKey!, packageVersion: '0.1.0', capabilities: { query: true, refetch: false, cancelPerTask: false, resume: true }, capability: inputCapability(frozen, input, null) }),
      acquireAdapter: async () => ({ adapter: remote, release() { release++; } }) });
    const { task } = await submit(production, [source]); const unsubscribe = production.subscribe(() => { notified++; });
    const draining = production.drain(); await started; unsubscribe(); const count = notified;
    const original = production.listTasks()[0]!.items[0]!, waiting = production.waitForTask(task.id, { timeoutMs: 30000 });
    expect(release).toBe(0); const closing = production.close(); expect(production.close()).toBe(closing); await closing; await draining;
    expect(await waiting).toMatchObject({ ok: false, error: { code: 'TASK_CLOSED' } });
    expect(await production.waitForTask(task.id)).toMatchObject({ ok: false, error: { code: 'TASK_CLOSED' } });
    expect(release).toBe(1); expect(notified).toBe(count);
    const reopened = new ProductionService(production.options); await reopened.open();
    expect(reopened.listTasks()[0]!.items[0]).toMatchObject({ state: 'interrupted', remote: original.remote, configSnapshot: original.configSnapshot,
      attempts: [{ id: original.attempts[0]!.id, remote: original.remote, outcome: 'unknown' }] });
    await reopened.resume(task.id);
    expect(querying).toBe(1); expect(reopened.listTasks()[0]!.items[0]!.issues[0]?.code).toBe('REMOTE_REFETCH_UNSUPPORTED');
    expect(sends).toBe(1); expect(reopened.listTasks()[0]!.items[0]!.attempts).toHaveLength(1); await reopened.close();
  });
});
beforeEach(async context => {
  await mkdir(fixtures, { recursive: true });
  const directory = await mkdtemp(join(fixtures, 'case-'));
  let project: ProjectSession | undefined;
  context.onTestFinished(async () => {
    try { if (project) await project.dispose('discard'); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  root = directory; docId = id(); projectId = id();
  const projectDirectory = join(root, 'project');
  await mkdir(projectDirectory);
  await writeFile(join(projectDirectory, 'project.json'), JSON.stringify({ schemaVersion: 1, documentId: docId, revision: 1, data: { projectId, value: '原文' } }));
  session = project = await ProjectSession.open(projectDirectory, projectId);
});
describe('持久任务与采用', () => {
  it('retains usage sent in the final streaming event', async () => {
    const connection = config(); connection.parameters.stream = true;
    const remote = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async (_url, init) => {
      expect(JSON.parse(String(init?.body)).stream_options).toEqual({ include_usage: true });
      return new Response('data: {"choices":[{"delta":{"content":"候选"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":200,"completion_tokens":20,"prompt_cache_hit_tokens":128,"prompt_cache_miss_tokens":72}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    } });
    const output = [];
    for await (const event of remote.submit(textInput(), { config: connection, workflow: null, requestId: id(), directory: join(root, 'stream'), signal: new AbortController().signal })) output.push(event);
    expect(output.find(event => event.kind === 'output')).toMatchObject({ usage: { prompt_tokens: 200, completion_tokens: 20, prompt_cache_hit_tokens: 128, prompt_cache_miss_tokens: 72 } });
  });
  it('validates prompt preparation and transfers only parsed prompt fields before sending the dependent image request', async () => {
    const inputs: GenerationInput[] = [];
    const remote = adapter(async function* (input) {
      inputs.push(structuredClone(input));
      yield { kind: 'textDelta', text: input.purpose === 'text' ? JSON.stringify({ kind: 'imagePrompt', format: 'natural', positive: 'sunset beach', negative: null }) : 'image output' };
      yield { kind: 'output', artifacts: [], usage: null };
    });
    const production = service(remote), prepare = item(), image = item(config('webUI'));
    const recipe = OfficialRecipes.find(recipe => recipe.purposes.includes('imagePrompt') && recipe.uses.includes('background'))!;
    prepare.recipeSnapshot = { recipe, purpose: 'imagePrompt', usage: 'background', parameterValues: {}, contract: 'imagePrompt', contractVersion: 1, assembledInput: prepare.input as Extract<GenerationInput, { purpose: 'text' }>, omittedPorts: [], context: [], sourceVersions: [] };
    prepare.target.usage = 'background';
    image.purpose = 'image'; image.target.usage = 'background';
    image.input = { purpose: 'image', usage: 'background', positive: 'author requirement', negative: '', width: 1920, height: 1080, count: 1, seed: null, references: [] };
    image.dependencies = [{ itemId: prepare.id, output: 'prompt', selectedCandidateId: null }];
    const plan = requireValue(await production.planTask({ projectId, name: 'Prompt → image', context: [], items: [prepare, image], stagePolicy:'external', policy: 'continueWithRule', selectionRule: 'firstValid' }));
    await production.submit(plan.planId); await production.drain();
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toMatchObject({ purpose: 'image', positive: 'sunset beach', negative: '', width: 1920, height: 1080 });
    const task = production.listTasks()[0]!;
    expect(production.getCandidate(task.items[1]!.candidateIds[0]!)!.parentCandidateIds).toEqual([task.items[0]!.selectedCandidateId]);
  });
  it('keeps an invalid prompt candidate for editing and blocks its image dependency without sending it', async () => {
    let sends = 0;
    const production = service(adapter(async function* () { sends++; yield { kind: 'textDelta', text: 'invalid prompt' }; yield { kind: 'output', artifacts: [], usage: null }; }));
    const prepare = item(), image = item(config('webUI'));
    const recipe = OfficialRecipes.find(recipe => recipe.purposes.includes('imagePrompt') && recipe.uses.includes('background'))!;
    prepare.recipeSnapshot = { recipe, purpose: 'imagePrompt', usage: 'background', parameterValues: {}, contract: 'imagePrompt', contractVersion: 1, assembledInput: prepare.input as Extract<GenerationInput, { purpose: 'text' }>, omittedPorts: [], context: [], sourceVersions: [] };
    prepare.target.usage = 'background'; image.purpose = 'image'; image.target.usage = 'background';
    image.input = { purpose: 'image', usage: 'background', positive: 'author requirement', negative: '', width: 1920, height: 1080, count: 1, seed: null, references: [] };
    image.dependencies = [{ itemId: prepare.id, output: 'prompt', selectedCandidateId: null }];
    const plan = requireValue(await production.planTask({ projectId, name: 'Prompt → image', context: [], items: [prepare, image], stagePolicy:'external', policy: 'continueWithRule', selectionRule: 'firstValid' }));
    await production.submit(plan.planId); await production.drain();
    expect(sends).toBe(1);
    const task = production.listTasks()[0]!;
    expect(task.items[1]!.state).toBe('blocked');
    expect(production.getCandidate(task.items[0]!.candidateIds[0]!)!.checks[0]!.code).toBe('PROMPT_OUTPUT');
  });
  it('removes only finished task records and retains candidates across restart',async()=>{
    const remote=adapter(async function*(){yield {kind:'textDelta',text:'keep candidate'};yield {kind:'output',artifacts:[],usage:null};});
    const production=service(remote),{plan,task}=await submit(production,[item()]);
    expect((await production.removeTaskRecord(task.id)).ok).toBe(false);
    await production.drain();const candidateId=production.listTasks()[0]!.items[0]!.candidateIds[0]!;
    requireValue(await production.removeTaskRecord(task.id));expect(production.listTasks()).toHaveLength(0);expect(production.getCandidate(candidateId)).not.toBeNull();
    const reopened=service(remote);await reopened.open();expect(reopened.listTasks()).toHaveLength(0);expect(reopened.getCandidate(candidateId)).not.toBeNull();
    const duplicate=await reopened.submit(plan.planId);expect(duplicate.ok).toBe(false);if(!duplicate.ok)expect(duplicate.error.code).toBe('TASK_RECORD_REMOVED');
  });
  it('UI 后续计划保留同一任务，重复确认与重开不重发步骤', async () => {
    const production=service(adapter(async function*(){yield {kind:'textDelta',text:'candidate'};yield {kind:'output',artifacts:[],usage:null};}));
    const first=await submit(production,[item()]);await production.drain();
    const candidateId=production.listTasks()[0]!.items[0]!.candidateIds[0];
    const next=requireValue(await production.planTask({projectId,name:'UI steps',items:[item()],context:[],policy:'waitForSelection',selectionRule:null,expected:versions()}));
    const continued=requireValue(await production.submitContinuation(next.planId,first.task.id));
    expect(continued.id).toBe(first.task.id);expect(continued.items).toHaveLength(2);expect(continued.items[0]!.candidateIds).toContain(candidateId);
    expect(requireValue(await production.submitContinuation(next.planId,first.task.id)).items).toHaveLength(2);
    const reopened=service(adapter(async function*(){}));await reopened.open();
    expect(requireValue(await reopened.submitContinuation(next.planId,first.task.id)).items).toHaveLength(2);
    expect(reopened.listTasks()).toHaveLength(1);
  });
  it('等待选定上游，仅发送依赖就绪项；采用、保存和撤销有独立状态', async () => {
    let sends = 0; const remote = adapter(async function* () { sends++; yield { kind: 'textDelta', text: '结果' }; yield { kind: 'output', artifacts: [], usage: null }; });
    const production = service(remote), first = item(), second = item(first.configSnapshot!); second.dependencies = [{ itemId: first.id, output: 'context', selectedCandidateId: null }];
    const { task } = await submit(production, [first, second]); await production.drain(); expect(sends).toBe(1);
    const candidateId = production.listTasks()[0]!.items[0]!.candidateIds[0]!;
    requireValue(await production.selectCandidates({ taskId: task.id, selections: [{ itemId: first.id, candidateId }], target: 'taskOnly', expected: [] }));await production.drain();expect(sends).toBe(1);requireValue(await production.authorizeStage(task.id,second.id));await production.drain();expect(sends).toBe(2);
    const plan = requireValue(await production.selectCandidates({ taskId: task.id, selections: [{ itemId: first.id, candidateId }], target: 'project', expected: versions() })); expect('planId' in plan).toBe(true);
    const receipt = requireValue(await production.applyAdoption((plan as any).planId, versions())); expect(production.adoptionState(candidateId)).toBe('adopted');
    requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId)); expect(production.adoptionState(candidateId)).toBe('saved');
    requireValue(session.undo(requireValue(session.planUndo(docId, receipt.operationId)).planId)); expect(production.adoptionState(candidateId)).toBe('unadopted');
    expect(production.getCandidate(candidateId)).not.toBeNull();
  });
  async function adoptedMedia() {
    const remote = adapter(async function* () { yield { kind: 'textDelta', text: '完整候选' }; yield { kind: 'output', artifacts: [], usage: null }; });
    let production = service(remote);
    const { task } = await submit(production, [item()]); await production.drain();
    const candidateId = production.listTasks()[0]!.items[0]!.candidateIds[0]!, indexId = id(), authorId = id(), variantId = id();
    const sourcePath = `plugins/org.test.music/score/${authorId}.json`;
    const sourceFiles = { [sourcePath]: JSON.stringify({ schemaVersion: 1, documentId: authorId, revision: 0,
      pluginDocument: { pluginId: 'org.test.music', contributionKey: 'org.test.music/score', stateVersion: 1, name: '原乐谱' }, data: { title: '原乐谱', notes: [60] } }) };
    const asset: Asset = { id: id(), revision: 1, name: '完成音频', kind: 'audio', folder: [], tags: [], locales: [], characterId: null, sceneIds: [], groupId: null,
      originalVariantId: variantId, activeVariantId: variantId, variants: [{ id: variantId, parentId: null, role: 'original',
        files: [{ path: 'composition.wav', bytes: 8, mime: 'audio/wav', role: 'entry' }], entry: 'composition.wav',
        metadata: { durationSec: 1, authorDocument: { documentId: authorId, pluginId: 'org.test.music', contributionKey: 'org.test.music/score', stateVersion: 1 } },
        canvas: null, processing: null, targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null }], sourceName: 'composition.wav',
      source: { kind: 'generation', description: '完整候选', usage: 'localReview', taskId: task.id, candidateId }, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() };
    const unrelated = structuredClone(asset); unrelated.id = id(); unrelated.name = '其他素材'; unrelated.variants[0]!.metadata = { durationSec: 1 };
    const indexFiles = { 'assets/index.json': JSON.stringify({ schemaVersion: 1, documentId: indexId, revision: 1, data: { assets: [unrelated] } }) };
    await mkdir(join(session.root, 'assets')); await writeFile(join(session.root, 'assets/index.json'), indexFiles['assets/index.json']);
    session.registerDocument({ documentId: indexId, revision: 1, format: 'json', files: indexFiles });
    const expected: VersionRef[] = [{ ref: { kind: 'document', id: indexId }, revision: 1 }];
    const plan = requireValue(session.planEdit({ label: '采用音频及作者源', origin: 'candidate', expected, preparedAssets: [asset.id], requiredRefs: [], patches: [
      { kind: 'document', documentId: authorId, op: 'create', before: null, after: { documentId: authorId, revision: 0, format: 'json', files: sourceFiles } },
      { kind: 'json', documentId: indexId, changes: [{ path: '/data/assets', before: [unrelated], after: [unrelated, asset], op: 'set' }] },
    ] }));
    production.registerAdoption(plan, [candidateId]);
    const receipt = requireValue(await production.applyAdoption(plan.planId, expected));
    const save = async () => { requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId)); };
    const edit = (documentId: string, changes: import('@galcraft/contracts').Patch & { kind: 'json' }) => {
      const expected: VersionRef[] = [{ ref: { kind: 'document', id: documentId }, revision: session.readDocument(documentId)!.revision }];
      const plan = requireValue(session.planEdit({ label: '继续编辑', origin: 'field', expected, preparedAssets: [], requiredRefs: [], patches: [changes] }));
      return requireValue(session.applyEdit(plan.planId, expected));
    };
    const assets = (): Asset[] => JSON.parse(session.readDocument(indexId)!.files['assets/index.json']!).data.assets;
    return { candidateId, indexId, authorId, asset, receipt, save, edit, assets,
      get production() { return production; },
      async reopen() { await production.close(); await session.dispose('discard'); session = await ProjectSession.open(join(root, 'project'), projectId); production = service(remote); await production.open(); return production; },
      async close() { await production.close(); await session.dispose('discard'); } };
  }
  it.each([false,true])('recovers the original adoption after a candidate metadata write fails (external=%s)',async external=>{
    let sends=0;const remote=adapter(async function*(){sends++;yield {kind:'textDelta',text:'完整候选'};yield {kind:'output',artifacts:[],usage:null};});
    const production=service(remote);const {task}=await submit(production,[item()]);await production.drain();
    const candidateId=production.listTasks()[0]!.items[0]!.candidateIds[0]!;
    const plan=requireValue(await production.selectCandidates({taskId:task.id,selections:[{itemId:task.items[0]!.id,candidateId}],target:'project',expected:versions()})) as import('@galcraft/contracts').EditPlan;
    const context=external?{sessionId:'Collab01',callId:'Adopt01',scopeRevision:1,projectId,writeSessionId:'Write1'}:undefined;
    const saveCandidate=production.store.saveCandidate.bind(production.store);production.store.saveCandidate=async()=>{throw new Error('candidate disk full');};
    let confirmed=0;await expect(production.applyAdoption(plan.planId,versions(),context,async()=>{confirmed++;})).rejects.toThrow('candidate disk full');
    expect(confirmed).toBe(1);expect(session.operations.filter(op=>op.label==='采用文本')).toHaveLength(1);expect(production.getCandidate(candidateId)!.adoption).toHaveLength(0);
    production.store.saveCandidate=saveCandidate;await production.close();await session.dispose('keep');
    session=await ProjectSession.open(join(root,'project'),projectId);requireValue(await session.recover('restore'));
    const reopened=service(remote);await reopened.open();expect(reopened.getCandidate(candidateId)!.adoption).toHaveLength(1);expect(reopened.adoptionState(candidateId)).toBe('adopted');
    const receipt=external?requireValue((await session.lookupExternalCall(context!))!):(await session.lookupTrackedEdit(plan.planId))!;
    expect(reopened.getCandidate(candidateId)!.adoption[0]!.groupId).toBe(receipt.groupId);expect(sends).toBe(1);
    expect(await reopened.reconcileAdoption(plan.planId)).toBeUndefined();expect(reopened.getCandidate(candidateId)!.adoption).toHaveLength(1);await reopened.close();
  });
  it('recovers the intended adopted content when the first post-commit intent write fails',async()=>{
    const remote=adapter(async function*(){yield {kind:'textDelta',text:'完整候选'};yield {kind:'output',artifacts:[],usage:null};}),production=service(remote);
    const {task}=await submit(production,[item()]);await production.drain();const candidateId=production.listTasks()[0]!.items[0]!.candidateIds[0]!;
    const plan=requireValue(await production.selectCandidates({taskId:task.id,selections:[{itemId:task.items[0]!.id,candidateId}],target:'project',expected:versions()})) as import('@galcraft/contracts').EditPlan;
    const write=production.store.write.bind(production.store);let writes=0;production.store.write=async(path,value)=>{if(path.endsWith('adoptions.json')&&++writes===2)throw new Error('intent response lost');await write(path,value);};
    await expect(production.applyAdoption(plan.planId,versions())).rejects.toThrow('intent response lost');await production.close();await session.dispose('keep');
    session=await ProjectSession.open(join(root,'project'),projectId);const reopened=service(remote);await reopened.open();expect(reopened.hasPendingAdoption(plan.planId)).toBe(false);expect(reopened.getCandidate(candidateId)!.adoption).toHaveLength(1);expect(reopened.adoptionState(candidateId)).toBe('unadopted');
    requireValue(await session.recover('restore'));await reopened.reconcileAdoptions();expect(reopened.hasPendingAdoption(plan.planId)).toBe(false);expect(reopened.getCandidate(candidateId)!.adoption).toHaveLength(1);expect(reopened.adoptionState(candidateId)).toBe('adopted');await reopened.close();
  });
  it('重开保留已编辑作者源的历史采用，并忽略无关素材和平台验证变化', async () => {
    const fixture = await adoptedMedia();
    try {
      expect(fixture.production.adoptionState(fixture.candidateId)).toBe('adopted'); await fixture.save();
      fixture.edit(fixture.authorId, { kind: 'json', documentId: fixture.authorId, changes: [
        { path: '/data/title', before: '原乐谱', after: '继续编曲', op: 'set' }, { path: '/data/notes', before: [60], after: [64], op: 'set' },
      ] });
      const before = fixture.assets(), after = structuredClone(before); after[0]!.name = '其他素材已改名'; after[1]!.variants[0]!.targets.web = 'direct';
      fixture.edit(fixture.indexId, { kind: 'json', documentId: fixture.indexId, changes: [{ path: '/data/assets', before, after, op: 'set' }] });
      await fixture.save(); const reopened = await fixture.reopen();
      expect(reopened.adoptionState(fixture.candidateId)).toBe('saved');
      expect(JSON.parse(Object.values(session.readDocument(fixture.authorId)!.files)[0]!).data).toEqual({ title: '继续编曲', notes: [64] });
      expect(reopened.getCandidate(fixture.candidateId)!.adoption[0]!.files).toBeDefined();
    } finally { await fixture.close(); }
  });
  it('新增活动派生版本后重开仍保留原精确版本的采用事实', async () => {
    const fixture = await adoptedMedia();
    try {
      const before = fixture.assets(), after = structuredClone(before), asset = after[1]!, derived = structuredClone(asset.variants[0]!);
      derived.id = id(); derived.parentId = asset.activeVariantId; derived.entry = 'derived.wav'; derived.files[0]!.path = 'derived.wav';
      asset.variants.push(derived); asset.activeVariantId = derived.id;
      fixture.edit(fixture.indexId, { kind: 'json', documentId: fixture.indexId, changes: [{ path: '/data/assets', before, after, op: 'set' }] });
      await fixture.save(); expect((await fixture.reopen()).adoptionState(fixture.candidateId)).toBe('saved');
    } finally { await fixture.close(); }
  });
  it.each(['asset', 'variant', 'source', 'binding'] as const)('重开识别已移除的采用%s，不凭文档存在误记采用', async removed => {
    const fixture = await adoptedMedia();
    try {
      if (removed === 'source') {
        const source = session.readDocument(fixture.authorId)!;
        const expected: VersionRef[] = [{ ref: { kind: 'document', id: fixture.authorId }, revision: source.revision }];
        const plan = requireValue(session.planEdit({ label: '移除作者源', origin: 'field', expected, preparedAssets: [], requiredRefs: [], patches: [
          { kind: 'document', documentId: fixture.authorId, op: 'delete', before: { format: source.format, files: source.files }, after: null },
        ] })); requireValue(session.applyEdit(plan.planId, expected));
      } else {
        const before = fixture.assets(), after = structuredClone(before);
        if (removed === 'asset') after.pop();
        else if (removed === 'variant') after[1]!.variants = [];
        else delete after[1]!.variants[0]!.metadata.authorDocument;
        fixture.edit(fixture.indexId, { kind: 'json', documentId: fixture.indexId, changes: [{ path: '/data/assets', before, after, op: 'set' }] });
      }
      await fixture.save(); expect((await fixture.reopen()).adoptionState(fixture.candidateId)).toBe('unadopted');
    } finally { await fixture.close(); }
  });
  it('整组撤销保存重开后保持未采用，纯文本替换也保持严格判定', async () => {
    const fixture = await adoptedMedia();
    try {
      await fixture.save(); const undo = requireValue(session.planUndo(fixture.indexId, fixture.receipt.operationId)); requireValue(session.undo(undo.planId));
      expect(fixture.production.adoptionState(fixture.candidateId)).toBe('unadopted');
      await fixture.save(); expect((await fixture.reopen()).adoptionState(fixture.candidateId)).toBe('unadopted');
    } finally { await fixture.close(); }
    session = await ProjectSession.open(join(root, 'project'), projectId);
    const production = service(adapter(async function* () { yield { kind: 'textDelta', text: '候选' }; yield { kind: 'output', artifacts: [], usage: null }; }));
    try {
      const first = item(), { task } = await submit(production, [first]); await production.drain();
      const candidateId = production.listTasks().find(value => value.id === task.id)!.items[0]!.candidateIds[0]!;
      const plan = requireValue(await production.selectCandidates({ taskId: task.id, selections: [{ itemId: first.id, candidateId }], target: 'project', expected: versions() }));
      if (!('planId' in plan)) throw new Error('采用计划不存在');
      requireValue(await production.applyAdoption(plan.planId, versions()));
      const expected = versions(), replacement = requireValue(session.planEdit({ label: '替换文本', origin: 'field', expected, preparedAssets: [], requiredRefs: [], patches: [
        { kind: 'json', documentId: docId, changes: [{ path: '/data/value', before: '候选', after: '作者新文本', op: 'set' }] },
      ] })); requireValue(session.applyEdit(replacement.planId, expected));
      requireValue(await session.save(requireValue(session.planSave({ kind: 'all' })).planId)); await production.close(); await session.dispose('discard');
      session = await ProjectSession.open(join(root, 'project'), projectId); const reopened = service(production.options.adapter(config()));
      await reopened.open(); expect(reopened.adoptionState(candidateId)).toBe('unadopted'); await reopened.close();
    } finally { await production.close(); await session.dispose('discard'); }
  });
  it('未知提交重开不重复 POST，明确确认只重试指定项', async () => {
    let sends = 0; const remote = adapter(async function* () { sends++; throw new Error('断线'); }); const production = service(remote);
    const first = item(), second = item(); const { task } = await submit(production, [first, second]); await production.drain(); expect(sends).toBe(2);
    const reopened = service(remote); await reopened.open(); requireValue(await reopened.resume(task.id)); await reopened.drain(); expect(sends).toBe(2);
    expect((await reopened.retryItem(task.id, first.id, false)).ok).toBe(false); const retry=requireValue(await reopened.retryItem(task.id, first.id, true));expect(sends).toBe(2);expect(retry.task.previousTaskId).toBe(task.id);requireValue(await reopened.submit(retry.planId));await reopened.drain(); expect(sends).toBe(3);
  });
  it('retries one failed step without resending a successful step', async () => {
    const sends = { ready: 0, retry: 0 };
    const remote = adapter(async function* (input) {
      const key = (input as Extract<GenerationInput, { purpose: 'text' }>).messages[0]!.text === 'retry' ? 'retry' : 'ready';
      sends[key]++;
      if (key === 'retry' && sends.retry === 1) {
        yield { kind: 'error', remoteStatus: 'failed', issue: { code: 'CONTROLLED_FAILURE', message: 'retry this step', severity: 'error', owner: 'M10', related: [], actions: ['retry'] } };
      } else { yield { kind: 'textDelta', text: key }; yield { kind: 'output', artifacts: [], usage: null }; }
    });
    const production = service(remote), first = item(), second = item();
    (second.input as Extract<GenerationInput, { purpose: 'text' }>).messages[0]!.text = 'retry';
    const { task } = await submit(production, [first, second]); await production.drain();
    expect(sends).toEqual({ ready: 1, retry: 1 });
    const readyCandidate = production.listTasks()[0]!.items[0]!.candidateIds[0];
    expect(readyCandidate).toBeDefined();
    const retry=requireValue(await production.retryItem(task.id, second.id, true));expect(sends.retry).toBe(1);requireValue(await production.submit(retry.planId));await production.drain();
    expect(sends).toEqual({ ready: 1, retry: 2 });
    expect(production.listTasks()[0]!.items[0]!.candidateIds).toContain(readyCandidate);
    expect(production.listTasks()[0]!.items[1]!.candidateIds).toHaveLength(0);expect(production.listTasks()[1]!.items[0]!.candidateIds).toHaveLength(1);
  });
  it('计划和 sourceDraftId 重复提交返回同一任务，半填草稿按用途保留', async () => {
    const production = service(adapter(async function* () {})), draft: ProductionFormDraft = { schemaVersion: 1, id: id(), projectId, revision: 0, activeUse: 'background', variants: {}, updatedAt: new Date().toISOString(), submittedTaskId: null };
    requireValue(await production.saveFormDraft(draft, null)); const { plan, task } = await submit(production, [item()], draft.id);
    expect(requireValue(await production.submit(plan.planId)).id).toBe(task.id);
    const reopened = service(adapter(async function* () {})); await reopened.open(); expect(requireValue(await reopened.submit(plan.planId)).id).toBe(task.id);
    expect(requireValue(await reopened.loadFormDraft(draft.id))?.submittedTaskId).toBe(task.id);
    expect((await reopened.saveFormDraft({ ...draft, revision: 1 }, 1)).ok).toBe(false);
  });
  it('源版本冲突不会提交候选', async () => {
    const production = service(adapter(async function* () { yield { kind: 'textDelta', text: '新文字' }; yield { kind: 'output', artifacts: [], usage: null }; }));
    const step = item(); step.sourceVersions = versions(); const { task } = await submit(production, [step]); await production.drain();
    const edit = requireValue(session.planEdit({ label: '作者编辑', origin: 'field', expected: versions(), patches: [{ kind: 'json', documentId: docId, changes: [{ path: '/data/value', before: '原文', after: '作者新文', op: 'set' }] }], preparedAssets: [], requiredRefs: [] })); requireValue(session.applyEdit(edit.planId, versions()));
    expect((await production.selectCandidates({ taskId: task.id, selections: [{ itemId: step.id, candidateId: production.listTasks()[0]!.items[0]!.candidateIds[0]! }], target: 'project', expected: versions() })).ok).toBe(false);
  });
  it('部分文字可保留但不能采用，DAG 环返回具体路径', async () => {
    const production = service(adapter(async function* () { yield { kind: 'textDelta', text: '半句' }; yield { kind: 'error', remoteStatus: 'unknown', issue: { code: 'EOF', message: '未结束', severity: 'error', owner: 'M10', related: [], actions: [] } }; }));
    const step = item(); const { task } = await submit(production, [step]); await production.drain(); const candidate = production.listTasks()[0]!.items[0]!.candidateIds[0]!;
    expect(production.getCandidate(candidate)?.partial).toBe(true); expect((await production.selectCandidates({ taskId: task.id, selections: [{ itemId: step.id, candidateId: candidate }], target: 'project', expected: versions() })).ok).toBe(false);
    expect(() => topological([{ id: 'a', dependencies: [{ itemId: 'b' }] }, { id: 'b', dependencies: [{ itemId: 'a' }] }])).toThrow('a → b → a');
  });
});
describe('按连接身份调度', () => {
  it('插件释放异常保留已完成候选并继续调度同连接后继', async () => {
    let submissions = 0;
    const remote = adapter(async function* () { submissions++; yield { kind: 'textDelta', text: '完成' }; yield { kind: 'output', artifacts: [], usage: null }; });
    const production = service(remote), connection = config();
    production.options.acquireAdapter = async () => ({ adapter: remote, release: async () => { throw new Error('插件释放失败'); } });
    await submit(production, [item(connection), item(connection)]);
    await expect(production.drain()).resolves.toBeUndefined();
    expect(submissions).toBe(2);
    const items = production.listTasks()[0]!.items;
    expect(items.every(item => item.state === 'review' && item.candidateIds.length === 1)).toBe(true);
    expect(items.every(item => item.issues.some(issue => issue.code === 'PROVIDER_RELEASE_FAILED' && issue.severity === 'warning'))).toBe(true);
    await production.close();
  });
  function controlled() {
    const starts: string[] = [], exits: string[] = [], active = new Map<string, number>(), maximum = new Map<string, number>();
    const release = new Map<string, (outcome?: 'success' | 'failed' | 'exception') => void>();
    let owner!: ProductionService; const persistedAttempts = new Set<string>();
    function observe(production: ProductionService) {
      owner = production; const save = production.store.saveTask.bind(production.store);
      production.store.saveTask = async task => {
        const snapshot = structuredClone(task); await save(task);
        for (const item of snapshot.items) if (item.state === 'submitting' && item.attempts.length) persistedAttempts.add(item.attempts.at(-1)!.id);
      };
    }
    const remote = adapter(async function* (input, ctx) {
      const name = (input as Extract<GenerationInput, { purpose: 'text' }>).messages[0]!.text;
      expect(persistedAttempts.has(ctx.requestId)).toBe(true);
      expect(owner.listTasks().some(task => task.items.some(item => item.attempts.at(-1)?.id === ctx.requestId))).toBe(true);
      const key = ctx.config.id, count = (active.get(key) ?? 0) + 1; active.set(key, count); maximum.set(key, Math.max(maximum.get(key) ?? 0, count));
      const outcome = new Promise<'success' | 'failed' | 'exception' | 'cancelled'>(resolve => {
        release.set(name, (value = 'success') => resolve(value));
        ctx.signal.addEventListener('abort', () => resolve('cancelled'), { once: true });
        if (ctx.signal.aborted) resolve('cancelled');
      });
      starts.push(name);
      try {
        yield { kind: 'accepted', remote: null };
        const result = await outcome;
        if (result === 'cancelled') return;
        if (result === 'exception') throw new Error('受控异常');
        if (result === 'failed') { yield { kind: 'error', remoteStatus: 'failed', issue: { code: 'CONTROLLED_FAILURE', message: '受控失败', owner: 'M10', severity: 'error', related: [], actions: ['retry'] } }; return; }
        yield { kind: 'textDelta', text: name }; yield { kind: 'output', artifacts: [], usage: null };
      } finally { active.set(key, active.get(key)! - 1); exits.push(name); }
    });
    const production = service(remote); observe(production);
    return { production, remote, starts, exits, maximum, release, observe };
  }
  function named(name: string, connection: ConnectionConfig): TaskItem {
    const value = item(connection); (value.input as Extract<GenerationInput, { purpose: 'text' }>).messages[0]!.text = name; return value;
  }
  it('同连接 concurrency=2 只进入两个请求，不同连接同 URL 独立，释放后立即补位', async () => {
    const work = controlled(), connection = { ...config(), concurrency: 2 }, other = config();
    await submit(work.production, [named('a1', connection), named('a2', connection), named('a3', connection), named('b1', other)]);
    const draining = work.production.drain();
    try {
      await expect.poll(() => ({ starts: work.starts, issues: work.production.listTasks()[0]!.items.flatMap(item => item.issues) })).toEqual({ starts: ['a1', 'a2', 'b1'], issues: [] });
      work.release.get('a1')!(); await expect.poll(() => work.starts).toEqual(['a1', 'a2', 'b1', 'a3']);
      expect(work.exits).toContain('a1'); expect(work.exits).not.toContain('b1');
      work.release.get('a2')!(); work.release.get('a3')!(); work.release.get('b1')!(); await draining;
      expect(work.maximum.get(connection.id)).toBe(2); expect(work.maximum.get(other.id)).toBe(1);
    } finally { await work.production.close(); }
  });
  it('新旧 revision/URL 共享最小冻结额度，保留较早可运行项顺序且不抢占运行项', async () => {
    const work = controlled(), old = config(), increased = { ...old, revision: 2, baseUrl: 'http://changed.invalid', concurrency: 3 }, reduced = { ...increased, revision: 3, concurrency: 1 };
    await submit(work.production, [named('old', old), named('up1', increased), named('up2', increased), named('down', reduced), named('later', increased)]);
    old.concurrency = 9;
    const draining = work.production.drain();
    try {
      await expect.poll(() => work.starts).toEqual(['old']); expect(work.production.listTasks()[0]!.items[0]!.configSnapshot!.concurrency).toBe(1);
      work.release.get('old')!(); await expect.poll(() => work.starts).toEqual(['old', 'up1', 'up2']);
      expect(work.exits).not.toContain('up1'); expect(work.exits).not.toContain('up2');
      work.release.get('up1')!(); await expect.poll(() => work.exits).toContain('up1');
      expect(work.starts).toEqual(['old', 'up1', 'up2']);
      work.release.get('up2')!(); await expect.poll(() => work.starts).toEqual(['old', 'up1', 'up2', 'down']);
      work.release.get('down')!(); await expect.poll(() => work.starts).toEqual(['old', 'up1', 'up2', 'down', 'later']);
      work.release.get('later')!(); await draining; expect(work.maximum.get(old.id)).toBe(2);
      expect(work.production.listTasks()[0]!.items.map(item => item.configSnapshot!.concurrency)).toEqual([1, 3, 3, 1, 3]);
    } finally { await work.production.close(); }
  });
  it('旧磁盘快照缺少 concurrency 时按 1 排队且不改写快照', async () => {
    const initial = service(adapter(async function* () {})), connection = config();
    const { task } = await submit(initial, [named('first', connection), named('second', connection)]);
    const legacy = structuredClone(task); for (const item of legacy.items) delete (item.configSnapshot as Partial<ConnectionConfig>).concurrency;
    await initial.store.saveTask(legacy); await initial.close();
    const work = controlled(); await work.production.open(); const draining = work.production.drain();
    try {
      await expect.poll(() => work.starts).toEqual(['first']); work.release.get('first')!();
      await expect.poll(() => work.starts).toEqual(['first', 'second']); work.release.get('second')!(); await draining;
      expect(work.maximum.get(connection.id)).toBe(1); expect(work.production.listTasks()[0]!.items[0]!.configSnapshot).not.toHaveProperty('concurrency');
    } finally { await work.production.close(); }
  });
  it.each(['failed', 'exception'] as const)('%s 释放槽且重复 drain 不重复启动', async outcome => {
    const work = controlled(), connection = config(); await submit(work.production, [named('first', connection), named('second', connection)]);
    const draining = work.production.drain(), duplicate = work.production.drain();
    try {
      await expect.poll(() => work.starts).toEqual(['first']); work.release.get('first')!(outcome);
      await expect.poll(() => work.starts).toEqual(['first', 'second']); work.release.get('second')!(); await Promise.all([draining, duplicate]);
      expect(work.starts).toEqual(['first', 'second']); expect(work.maximum.get(connection.id)).toBe(1);
    } finally { await work.production.close(); }
  });
  it('取消先停止整张任务图，再释放槽运行另一任务，未发送后继保持取消', async () => {
    const work = controlled(), connection = config(), first = named('first', connection), child = named('child', connection);
    child.dependencies = [{ itemId: first.id, output: 'context', selectedCandidateId: null }];
    const { task } = await submit(work.production, [first, named('unsent', connection), child]); await submit(work.production, [named('other', connection)]);
    const draining = work.production.drain();
    try {
      await expect.poll(() => work.starts).toEqual(['first']); await work.production.cancel(task.id);
      await expect.poll(() => work.starts).toEqual(['first', 'other']); work.release.get('other')!(); await draining;
      expect(work.production.listTasks().find(value => value.id === task.id)!.items.every(item => item.state === 'cancelled')).toBe(true);
      expect(work.starts).not.toContain('unsent'); expect(work.starts).not.toContain('child');
    } finally { await work.production.close(); }
  });
  it('所有本地透明化项共用单槽，并独立于仍在运行的远端连接补位', async () => {
    const work = controlled(), localStarts: string[] = [], release = new Map<string, () => void>();
    work.production.options.localStep = async (item, _parents, directory, signal) => {
      const name = String((item.input as Record<string, unknown>).name); localStarts.push(name);
      await new Promise<void>(resolve => { release.set(name, resolve); signal.addEventListener('abort', () => resolve(), { once: true }); });
      signal.throwIfAborted(); await mkdir(directory, { recursive: true }); const path = join(directory, 'local.txt'); await writeFile(path, name);
      return [{ kind: 'text', localPath: path, mime: 'text/plain', bytes: name.length, metadata: {}, groupId: 'local', role: 'primary', background: null }];
    };
    const locals = ['l1', 'l2'].map(name => ({ ...item(), purpose: 'audioProcess' as const, configSnapshot: null, input: { name } }));
    await submit(work.production, [named('remote', config()), ...locals]); const draining = work.production.drain();
    try {
      await expect.poll(() => localStarts).toEqual(['l1']); await expect.poll(() => work.starts).toEqual(['remote']);
      release.get('l1')!(); await expect.poll(() => localStarts).toEqual(['l1', 'l2']); expect(work.exits).not.toContain('remote');
      release.get('l2')!(); work.release.get('remote')!(); await draining;
    } finally { await work.production.close(); }
  });
  it('重开后已接收项与恢复查询占槽，原任务取消后立即启动等待项且不重发 POST', async () => {
    const connection = { ...config(), providerKey: 'test.service/generate' }, source = named('original', connection);
    const work = controlled(); let initialSends = 0, queries = 0, unblock!: () => void;
    const remote = adapter(async function* () { initialSends++; yield { kind: 'accepted', remote: { protocol: 'plugin', id: 'known', connectionId: connection.id, submittedAt: new Date().toISOString() } }; });
    const options = { ...work.production.options, adapter: () => remote,
      freezeProvider: async (config: ConnectionConfig, input: GenerationInput) => ({ providerKey: config.providerKey!, packageVersion: '0.1.0', capabilities: { query: true, refetch: true, resume: true, cancelPerTask: false }, capability: inputCapability(config, input, null) }),
      acquireAdapter: async () => ({ adapter: remote, release() {} }) };
    const initial = new ProductionService(options), { task } = await submit(initial, [source]); await initial.drain();
    await submit(initial, [named('waiting', connection)]); await initial.close();
    remote.submit = work.remote.submit;
    remote.query = async () => { queries++; await new Promise<void>(resolve => { unblock = resolve; }); return ok({ state: 'running', output: null, issues: [] }); };
    const reopened = new ProductionService({ ...options, ...{ userData: options.userData } });
    work.observe(reopened);
    await reopened.open(); await reopened.drain(); expect(work.starts).toEqual([]);
    const resumed = reopened.resume(task.id); await expect.poll(() => queries).toBe(1);
    const draining = reopened.drain(); expect(work.starts).toEqual([]); unblock();
    await expect.poll(() => reopened.listTasks().find(value => value.id === task.id)!.items[0]!.progress.phase).toBe('running');
    try {
      await reopened.cancel(task.id); await resumed; await expect.poll(() => work.starts).toEqual(['waiting']);
      work.release.get('waiting')!(); await draining;
      expect(initialSends).toBe(1); expect(queries).toBe(1); expect(reopened.listTasks().find(value => value.id === task.id)!.items[0]!.remote?.id).toBe('known');
    } finally { await reopened.close(); await work.production.close(); }
  });
  it('已接收项查询为失败时释放静止队列中的槽并自动扫描', async () => {
    const connection = { ...config(), providerKey: 'test.service/generate' }; let sends = 0;
    const remote = adapter(async function* () { sends++; yield { kind: 'accepted', remote: { protocol: 'plugin', id: `known-${sends}`, connectionId: connection.id, submittedAt: new Date().toISOString() } }; });
    remote.query = async () => ok({ state: 'failed', output: null, issues: [] });
    const production = new ProductionService({ ...service(remote).options,
      freezeProvider: async (config, input) => ({ providerKey: config.providerKey!, packageVersion: '0.1.0', capabilities: { query: true, refetch: true, resume: true, cancelPerTask: false }, capability: inputCapability(config, input, null) }),
      acquireAdapter: async () => ({ adapter: remote, release() {} }) });
    const { task } = await submit(production, [named('first', connection), named('next', connection)]); await production.drain(); expect(sends).toBe(1);
    try { requireValue(await production.queryRemote(task.id, task.items[0]!.id)); await expect.poll(() => sends).toBe(2); await production.drain(); }
    finally { await production.close(); }
  });
  it.each(['queued', 'running'] as const)('取消项恢复为远端 %s 前等待同连接槽，沿用请求身份且关闭可中止恢复', async state => {
    const work = controlled(), connection = { ...config(), providerKey: 'test.service/generate' };
    const remote = adapter(async function* () { yield { kind: 'accepted', remote: { protocol: 'plugin', id: 'known', connectionId: connection.id, submittedAt: new Date().toISOString() } }; });
    let queries = 0; const requests: string[] = [];
    remote.query = async (ref, ctx) => { queries++; requests.push(ctx.requestId); expect(ref.id).toBe('known'); return ok({ state, output: null, issues: [] }); };
    const production = new ProductionService({ ...work.production.options, adapter: () => remote,
      freezeProvider: async (config, input) => ({ providerKey: config.providerKey!, packageVersion: '0.1.0', capabilities: { query: true, refetch: true, resume: true, cancelPerTask: false }, capability: inputCapability(config, input, null) }),
      acquireAdapter: async () => ({ adapter: remote, release() {} }) });
    work.observe(production);
    try {
      const { task } = await submit(production, [named('original', connection)]); await production.drain();
      const original = production.listTasks()[0]!.items[0]!; requireValue(await production.cancel(task.id));
      remote.submit = work.remote.submit;
      await submit(production, [named('busy', connection)]); const draining = production.drain();
      await expect.poll(() => work.starts).toEqual(['busy']);
      const resumed = production.resume(task.id);
      await new Promise<void>(resolve => setImmediate(resolve)); expect(queries).toBe(0);
      work.release.get('busy')!(); await expect.poll(() => queries).toBe(1);
      expect(requests).toEqual([original.attempts[0]!.id]);
      await production.close(); await Promise.all([draining, resumed]);
      const recovered = production.listTasks().find(value => value.id === task.id)!.items[0]!;
      expect(recovered.remote).toEqual(original.remote); expect(recovered.configSnapshot).toEqual(original.configSnapshot);
      expect(recovered.attempts).toHaveLength(1); expect(recovered.attempts[0]!.id).toBe(original.attempts[0]!.id);
      expect(work.starts).toEqual(['busy']);
    } finally { await production.close(); await work.production.close(); }
  });
  it('取消项恢复遵守较早可运行项的冻结额度，关闭清理尚未准入的恢复', async () => {
    const work = controlled(), connection = { ...config(), concurrency: 2, providerKey: 'test.service/generate' };
    const options = { ...work.production.options,
      freezeProvider: async (config: ConnectionConfig, input: GenerationInput) => ({ providerKey: config.providerKey!, packageVersion: '0.1.0', capabilities: { query: true, refetch: true, resume: true, cancelPerTask: false }, capability: inputCapability(config, input, null) }),
      acquireAdapter: async () => ({ adapter: work.remote, release() {} }) };
    const initial = new ProductionService(options), busy = named('busy', connection), earlier = named('earlier', { ...connection, concurrency: 1 }), restored = named('restored', connection);
    await submit(initial, [busy, earlier]); const { task } = await submit(initial, [restored]);
    const saved = structuredClone(task), last = saved.items[0]!;
    last.state = 'cancelled'; last.remote = { protocol: 'plugin', id: 'known', connectionId: connection.id, submittedAt: new Date().toISOString() };
    last.remoteOutput = {};
    last.attempts = [{ id: id(), createdAt: new Date().toISOString(), remote: last.remote, outcome: 'cancelled' }];
    await initial.store.saveTask(saved); await initial.close();
    let queries = 0; work.remote.query = async () => { queries++; return ok({ state: 'running', output: null, issues: [] }); };
    const production = new ProductionService(options);
    work.observe(production); await production.open();
    try {
      const draining = production.drain(); await expect.poll(() => work.starts).toEqual(['busy']);
      const resumed = production.resume(task.id);
      await new Promise<void>(resolve => setImmediate(resolve)); expect(queries).toBe(0);
      expect((await production.retryItem(task.id, restored.id, true)).ok).toBe(false);
      expect((await production.refetch(task.id, restored.id)).ok).toBe(false);
      expect((await production.removeTaskRecord(task.id)).ok).toBe(false);
      work.release.get('busy')!(); await expect.poll(() => work.starts).toEqual(['busy', 'earlier']);
      expect(queries).toBe(0);
      await production.close(); await Promise.all([draining, resumed]);
      expect(production.listTasks().find(value => value.id === task.id)!.items[0]).toMatchObject({ state: 'cancelled', remote: last.remote, attempts: last.attempts });
    } finally { await production.close(); await work.production.close(); }
  });
  it('取消租约释放异常记录警告并唤醒没有活动执行的同连接队列', async () => {
    const connection = { ...config(), providerKey: 'test.service/generate' }; let sends = 0, failRelease = false;
    const remote = adapter(async function* () { sends++; yield { kind: 'accepted', remote: { protocol: 'plugin', id: `known-${sends}`, connectionId: connection.id, submittedAt: new Date().toISOString() } }; });
    remote.cancel = async () => { failRelease = true; return { local: 'stopped', remote: 'confirmed' }; };
    const production = new ProductionService({ ...service(remote).options,
      freezeProvider: async (config, input) => ({ providerKey: config.providerKey!, packageVersion: '0.1.0', capabilities: { query: true, refetch: true, resume: true, cancelPerTask: true }, capability: inputCapability(config, input, null) }),
      acquireAdapter: async () => ({ adapter: remote, release() { if (failRelease) { failRelease = false; throw new Error('取消租约停用失败'); } } }) });
    try {
      const { task } = await submit(production, [named('first', connection)]); await submit(production, [named('next', connection)]);
      await production.drain(); expect(sends).toBe(1);
      expect(requireValue(await production.cancel(task.id))).toEqual({ local: 'stopped', remote: 'confirmed' });
      await expect.poll(() => sends).toBe(2);
      const saved = JSON.parse(await readFile(production.store.taskPath(task.id), 'utf8'));
      expect(saved.items[0]).toMatchObject({ state: 'cancelled', issues: [expect.objectContaining({ code: 'PROVIDER_RELEASE_FAILED', severity: 'warning', message: expect.stringContaining('取消租约停用失败') })] });
    } finally { await production.close(); }
  });
  it.each(['resume', 'refetch'] as const)('%s 在产物下载期间取消时保留取消状态和远端身份，不登记迟到产物', async operation => {
    const connection = { ...config(), providerKey: 'test.service/generate' };
    let fetching!: () => void; const entered = new Promise<void>(resolve => { fetching = resolve; });
    const remote = adapter(async function* () { yield { kind: 'accepted', remote: { protocol: 'plugin', id: 'known', connectionId: connection.id, submittedAt: new Date().toISOString() } }; });
    remote.query = async () => ok({ state: 'completed', output: {}, issues: [] });
    remote.fetch = async (_ref, _output, ctx) => {
      await mkdir(ctx.directory, { recursive: true }); const path = join(ctx.directory, 'late.txt'); await writeFile(path, '迟到'); fetching();
      await new Promise<void>(resolve => { ctx.signal.addEventListener('abort', () => resolve(), { once: true }); if (ctx.signal.aborted) resolve(); });
      return ok([{ kind: 'text', localPath: path, mime: 'text/plain', bytes: 6, metadata: {}, groupId: 'text', role: 'primary', background: null }]);
    };
    const production = new ProductionService({ ...service(remote).options,
      freezeProvider: async (config, input) => ({ providerKey: config.providerKey!, packageVersion: '0.1.0', capabilities: { query: true, refetch: true, resume: true, cancelPerTask: false }, capability: inputCapability(config, input, null) }),
      acquireAdapter: async () => ({ adapter: remote, release() {} }) });
    try {
      const { task } = await submit(production, [item(connection)]); await production.drain();
      if (operation === 'refetch') requireValue(await production.queryRemote(task.id, task.items[0]!.id));
      const pending = operation === 'resume' ? production.resume(task.id) : production.refetch(task.id, task.items[0]!.id);
      await entered; await production.cancel(task.id); await pending;
      expect(production.listTasks()[0]!.items[0]).toMatchObject({ state: 'cancelled', remote: { id: 'known' }, candidateIds: [], attempts: [{ outcome: 'cancelled' }] });
    } finally { await production.close(); }
  });
});

describe('候选结果来源复核', () => {
  const currentVersions = (): VersionRef[] => [...session.documents.values()].map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }));
  const version = (documentId: string): VersionRef => ({ ref: { kind: 'document', id: documentId }, revision: session.readDocument(documentId)!.revision });
  function scene(name: string) {
    const sceneId = id(), documentId = id();
    session.registerDocument({ documentId, revision: 1, format: 'json', files: { [`scenes/${sceneId}/scene.json`]: JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data: { id: sceneId, name } }) } });
    return { sceneId, documentId };
  }
  function renameScene(documentId: string, before: string, after: string) {
    const expected = [version(documentId)], plan = requireValue(session.planEdit({ label: '修改场景', origin: 'field', expected,
      patches: [{ kind: 'json', documentId, changes: [{ path: '/data/name', before, after, op: 'set' }] }], preparedAssets: [], requiredRefs: [] }));
    requireValue(session.applyEdit(plan.planId, expected));
  }
  function mediaStep(purpose: 'image' | 'speech', sceneId: string | null): TaskItem {
    const step = item(config(purpose === 'image' ? 'webUI' : 'openAISpeech')); step.purpose = purpose; step.target.sceneId = sceneId; step.target.usage = purpose === 'image' ? 'background' : 'voice';
    step.input = purpose === 'image'
      ? { purpose: 'image', usage: 'background', positive: '场景背景', negative: '', width: 1920, height: 1080, count: 1, seed: null, references: [] }
      : { purpose: 'speech', text: '你好', language: 'zh', voiceId: 'voice', referenceAudio: null, referenceText: null, referenceLanguage: null, emotion: null, speed: null };
    return step;
  }
  const mediaAdapter = () => adapter(async function* (input, ctx) {
    const image = input.purpose === 'image', path = join(ctx.directory, image ? 'result.png' : 'result.wav');
    const metadata: Record<string, number> = image ? { width: 1920, height: 1080 } : { durationMs: 1000 };
    await mkdir(ctx.directory, { recursive: true }); await writeFile(path, Uint8Array.of(1, 2, 3));
    yield { kind: 'output', artifacts: [{ kind: image ? 'image' : 'audio', localPath: path, mime: image ? 'image/png' : 'audio/wav', bytes: 3,
      metadata, role: 'primary', groupId: 'result', background: null }], usage: null };
  });
  it.each(['image', 'speech'] as const)('保留 %s 候选仅更新原有场景来源，无关场景修改后仍可准备采用', async purpose => {
    const source = scene('场景 A'), unrelated = scene('场景 B'), step = mediaStep(purpose, source.sceneId); step.sourceVersions = [version(source.documentId)];
    const remote = mediaAdapter(), production = service(remote), { task } = await submit(production, [step]); await production.drain();
    const candidateId = production.listTasks()[0]!.items[0]!.candidateIds[0]!;
    renameScene(source.documentId, '场景 A', '场景 A 已修改'); await production.sourceChanged(version(source.documentId), [step.id]);
    expect(production.listTasks()[0]!.items[0]!.needsReview).toBe(true);
    requireValue(await production.keepResults(task.id, step.id, currentVersions()));
    expect(production.listTasks()[0]!.items[0]).toMatchObject({ sourceVersions: [version(source.documentId)], needsReview: false });
    const reopened = service(remote); await reopened.open();
    expect(reopened.listTasks()[0]!.items[0]!.sourceVersions).toEqual([version(source.documentId)]);
    renameScene(unrelated.documentId, '场景 B', '场景 B 已修改'); await reopened.sourceChanged(version(unrelated.documentId), [step.id]);
    expect(reopened.listTasks()[0]!.items[0]!.needsReview).toBe(false);
    expect((await reopened.selectCandidates({ taskId: task.id, selections: [{ itemId: step.id, candidateId }], target: 'project', expected: currentVersions() })).ok).toBe(true);
    renameScene(source.documentId, '场景 A 已修改', '场景 A 再次修改');
    const conflict = await reopened.selectCandidates({ taskId: task.id, selections: [{ itemId: step.id, candidateId }], target: 'project', expected: currentVersions() });
    expect(conflict.ok).toBe(false); if (!conflict.ok) expect(conflict.error.code).toBe('ADOPTION_CONFLICT');
    await reopened.sourceChanged(version(source.documentId), [step.id]); expect(reopened.listTasks()[0]!.items[0]!.needsReview).toBe(true);
  });
  it('复核遗漏或携带过期来源时拒绝保留，并持久保留待复核状态', async () => {
    const source = scene('场景 A'), unrelated = scene('场景 B'), step = mediaStep('image', source.sceneId); step.sourceVersions = [version(source.documentId)];
    const remote = mediaAdapter(), production = service(remote), { task } = await submit(production, [step]); await production.drain();
    renameScene(source.documentId, '场景 A', '场景 A 已修改'); await production.sourceChanged(version(source.documentId), [step.id]);
    const before = production.listTasks()[0]!;
    for (const expected of [[version(unrelated.documentId)], step.sourceVersions]) {
      const result = await production.keepResults(task.id, step.id, expected);
      expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe('REVIEW_CONFLICT');
      expect(production.listTasks()[0]).toEqual(before);
    }
    const reopened = service(remote); await reopened.open();
    expect(reopened.listTasks()[0]!.items[0]).toMatchObject({ sourceVersions: step.sourceVersions, needsReview: true });
  });
  it('独立媒体候选保留结果后仍无作品来源依赖', async () => {
    const unrelated = scene('场景 B'), step = mediaStep('image', null), remote = mediaAdapter(), production = service(remote), { task } = await submit(production, [step]); await production.drain();
    const candidateId = production.listTasks()[0]!.items[0]!.candidateIds[0]!;
    requireValue(await production.keepResults(task.id, step.id, currentVersions()));
    expect(production.listTasks()[0]!.items[0]!.sourceVersions).toEqual([]);
    const reopened = service(remote); await reopened.open();
    renameScene(unrelated.documentId, '场景 B', '场景 B 已修改'); await reopened.sourceChanged(version(unrelated.documentId), [step.id]);
    expect(reopened.listTasks()[0]!.items[0]).toMatchObject({ sourceVersions: [], needsReview: false });
    expect((await reopened.selectCandidates({ taskId: task.id, selections: [{ itemId: step.id, candidateId }], target: 'project', expected: currentVersions() })).ok).toBe(true);
  });
});
describe('协议边界', () => {
  it('真实 HTTP 的 Comfy 长轮询停止响应后保留磁盘身份，重开仅查询并取回原产物', async () => {
    const requests: { method: string; path: string }[] = []; let mode: 'active' | 'silent' | 'completed' = 'active', submittedClientId = '';
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
    const server = createServer((request, response) => {
      const path = request.url!; requests.push({ method: request.method!, path });
      const json = (value: unknown) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
      if (path === '/prompt') { let body = ''; request.on('data', chunk => { body += chunk; }); request.on('end', () => { submittedClientId = JSON.parse(body).client_id; json({ prompt_id: 'http-original' }); }); }
      else if (path === '/history/http-original') {
        if (mode === 'silent') return;
        json(mode === 'completed' ? { 'http-original': { status: { completed: true }, outputs: { '1': { images: [{ filename: 'original.png', type: 'output' }] } } } } : {});
      } else if (path === '/queue') json({ queue_running: [[0, 'http-original']], queue_pending: [] });
      else if (path.startsWith('/view?')) { response.setHeader('Content-Type', 'image/png'); response.end(png); }
      else { response.statusCode = 404; response.end(); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('HTTP 监听地址缺失');
    const connection = config('comfyUI'); connection.baseUrl = `http://127.0.0.1:${address.port}`; connection.timeoutSecByPurpose = { ...DefaultTimeoutSecByPurpose, image: 0.15 };
    const source = item(connection); source.purpose = 'image'; source.target.usage = 'background';
    source.input = { purpose: 'image', usage: 'background', positive: '背景', negative: '', width: 1, height: 1, count: 1, seed: null, references: [] };
    source.workflowSnapshot = { id: id(), revision: 1, name: 'HTTP 验证', purpose: 'image', imageUsages: ['background'], graphVersion: '1', editorWorkflowPath: null,
      apiGraph: { '1': { class_type: 'Image', inputs: { positive: '', width: 1, height: 1, count: 1 } } },
      inputs: ['positive', 'width', 'height', 'count'].map(port => ({ port, nodeId: '1', classType: 'Image', input: port, valueType: port === 'positive' ? 'string' : 'number', required: true, transform: 'identity' })), uploads: [],
      outputs: [{ nodeId: '1', key: 'images', kind: 'image', decoder: 'comfyFileList', group: 'image', role: 'primary', background: 'unknown' }], requiredNodes: [], modelNotes: [] };
    const remote = new HttpGenerationAdapter({ credential: async () => null, pollMs: 10, probe: async () => ({ metadata: { width: 1, height: 1 } }) });
    const production = service(remote); let reopened: ProductionService | undefined;
    try {
      const { task } = await submit(production, [source]), draining = production.drain();
      await expect.poll(() => requests.filter(request => request.path === '/queue').length).toBeGreaterThan(10);
      await new Promise(resolve => setTimeout(resolve, 160)); expect(production.listTasks()[0]!.items[0]!.state).toBe('running');
      mode = 'silent'; await draining;
      const interrupted = JSON.parse(await readFile(production.store.taskPath(task.id), 'utf8')).items[0] as TaskItem;
      expect(interrupted).toMatchObject({ state: 'interrupted', remote: { id: 'http-original' }, attempts: [{ outcome: 'unknown', remote: { id: 'http-original' } }] });
      const attemptId = interrupted.attempts[0]!.id; expect(submittedClientId).toBe(attemptId); await production.close(); mode = 'completed';
      reopened = service(remote); await reopened.open(); requireValue(await reopened.resume(task.id));
      const recovered = JSON.parse(await readFile(reopened.store.taskPath(task.id), 'utf8')).items[0] as TaskItem;
      expect(recovered.state).toBe('review'); expect(recovered.attempts).toHaveLength(1); expect(recovered.attempts[0]!.id).toBe(attemptId);
      expect(recovered.remote!.id).toBe('http-original'); expect(recovered.candidateIds).toHaveLength(1);
      expect(await readFile(reopened.getCandidate(recovered.candidateIds[0]!)!.artifacts[0]!.localPath)).toEqual(png);
      expect(requests.filter(request => request.method === 'POST')).toEqual([{ method: 'POST', path: '/prompt' }]);
      const evidence = resolve(import.meta.dirname, '../../../test-results/architecture-d1-d2'); await mkdir(evidence, { recursive: true });
      await writeFile(join(evidence, 'http-recovery.json'), JSON.stringify({ executedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform }, submittedClientId, requests, interrupted, recovered, candidateBytes: png.length }, null, 2));
    } finally { await production.close(); await reopened?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it('文本正文无活动中断保留部分候选与原 attempt，重开不会再次发送', async () => {
    let sends = 0;
    const remote = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async () => {
      sends++; return new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('data: {"choices":[{"delta":{"content":"保留部分文字"}}]}\n\n')); } }), { headers: { 'content-type': 'text/event-stream' } });
    } });
    const connection = config(); connection.parameters.stream = true; connection.timeoutSecByPurpose = { ...DefaultTimeoutSecByPurpose, text: 0.05 };
    const production = service(remote), { task } = await submit(production, [item(connection)]);
    await production.drain(); const interrupted = production.listTasks()[0]!.items[0]!;
    expect(interrupted.state).toBe('interrupted'); expect(interrupted.attempts[0]!.outcome).toBe('unknown');
    const candidate = production.getCandidate(interrupted.candidateIds[0]!)!; expect(candidate.partial).toBe(true); expect(await production.store.text(candidate)).toBe('保留部分文字');
    await production.close(); const reopened = service(remote); await reopened.open(); requireValue(await reopened.resume(task.id)); await reopened.drain();
    expect(sends).toBe(1); expect(reopened.listTasks()[0]!.items[0]!.attempts[0]!.id).toBe(interrupted.attempts[0]!.id); await reopened.close();
  });
  it.each(['openAISpeech', 'miniMaxMusic'] as const)('%s 从任务计划提交到可审阅候选', async protocol => {
    let request: any;
    const remote = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: { durationMs: 1000 } }), fetch: async (_url, init) => {
      request = JSON.parse(String(init?.body));
      return protocol === 'openAISpeech' ? new Response(Uint8Array.of(1, 2, 3), { headers: { 'content-type': 'audio/wav' } })
        : Response.json({ base_resp: { status_code: 0 }, data: { audio: '010203', status: 2 } });
    } });
    const step = item(config(protocol)); step.purpose = protocol === 'openAISpeech' ? 'speech' : 'music'; step.target.usage = protocol === 'openAISpeech' ? 'voice' : 'bgm';
    step.input = protocol === 'openAISpeech'
      ? { purpose: 'speech', text: '你好', language: 'zh', voiceId: 'voice', referenceAudio: null, referenceText: null, referenceLanguage: null, emotion: null, speed: null }
      : { purpose: 'music', prompt: '钢琴', durationSec: 30, instrumental: true, lyrics: null, seed: null };
    const production = service(remote); await submit(production, [step]); await production.drain();
    expect(production.listTasks()[0]!.items[0]!.state).toBe('review');
    expect(request[protocol === 'openAISpeech' ? 'input' : 'prompt']).toBe(protocol === 'openAISpeech' ? '你好' : '钢琴');
  });
  it('GPT-SoVITS 使用冻结的参考音频并提交服务共享路径', async () => {
    const shared = join(root, 'gpt-shared'), source = join(shared, 'reference.wav'); await mkdir(shared, { recursive: true }); await writeFile(source, 'audio');
    let request: any;
    const remote = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: { durationMs: 1000 } }), fetch: async (_url, init) => {
      request = JSON.parse(String(init?.body)); return new Response(Uint8Array.of(1, 2, 3), { headers: { 'content-type': 'audio/wav' } });
    } });
    const connection = config('gptSoVits'); connection.serverFileRoot = shared;
    const step = item(connection); step.purpose = 'speech'; step.target.usage = 'voice';
    step.input = { purpose: 'speech', text: '目标', language: 'zh', voiceId: null, referenceAudio: { localPath: source, mime: 'audio/wav', assetId: null, variantId: null, candidateId: null, artifactIndex: null }, referenceText: '参考', referenceLanguage: 'ja', emotion: null, speed: null };
    const production = service(remote), { task } = await submit(production, [step]);
    const frozen = (task.items[0]!.input as Extract<GenerationInput, { purpose: 'speech' }>).referenceAudio!.localPath;
    expect(frozen).not.toBe(source); expect(await readFile(frozen, 'utf8')).toBe('audio');
    await production.drain();
    expect(production.listTasks()[0]!.items[0]!.state).toBe('review');
    expect(request.ref_audio_path).not.toBe(source); expect(request.ref_audio_path.startsWith(shared + sep)).toBe(true);
    expect(await readFile(request.ref_audio_path, 'utf8')).toBe('audio');
  });
  it('SSE/NDJSON 按事件和 UTF8 边界解析', async () => {
    const bytes = Buffer.from('data: {"text":"中文日本語"}\r\n\r\ndata: [DONE]\n\n'), stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
    const output = []; for await (const event of events(stream)) output.push(event.data); expect(output).toEqual(['{"text":"中文日本語"}', '[DONE]']);
    const nd = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(Buffer.from('{"a":1}\n{"a":2}')); controller.close(); } }); const result = []; for await (const line of lines(nd)) result.push(JSON.parse(line)); expect(result).toEqual([{ a: 1 }, { a: 2 }]);
  });
  it.each(['chatCompletions', 'anthropic', 'gemini', 'ollama', 'novelAIText'] as const)('%s 使用对应请求字段，不暴露本机路径', async protocol => {
    let request: any, url = ''; const remote = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async (address, init) => { url = String(address); request = JSON.parse(String(init?.body));
      return Response.json(protocol === 'chatCompletions' ? { choices: [{ message: { content: '答复' } }] } : protocol === 'anthropic' ? { content: [{ type: 'text', text: '答复' }] } : protocol === 'gemini' ? { candidates: [{ content: { parts: [{ text: '答复' }] } }] } : protocol === 'ollama' ? { message: { content: '答复' } } : { output: '答复' }); } });
    const result = []; for await (const event of remote.submit(textInput(), { requestId: id(), config: config(protocol), workflow: null, directory: join(root, 'output'), signal: new AbortController().signal })) result.push(event);
    expect(result.at(-1)?.kind).toBe('output'); expect(url).not.toContain('/v1/v1/'); expect(JSON.stringify(request)).not.toContain('localPath');
    if (protocol === 'anthropic') expect(request.system).toBe('合同'); if (protocol === 'novelAIText') expect(request.parameters.use_string).toBe(true);
  });
  it('HTTP200 JSON 错误不能成为音频；流无结束标记保留 unknown', async () => {
    const remote = new HttpGenerationAdapter({ credential: async () => null, probe: async () => { throw new Error('不可探测'); }, fetch: async () => Response.json({ error: '失败' }) });
    const events = []; for await (const event of remote.submit({ purpose: 'speech', text: '你好', language: 'zh', voiceId: 'voice', referenceAudio: null, referenceText: null, referenceLanguage: null, emotion: null, speed: null }, { requestId: id(), config: config('openAISpeech'), workflow: null, directory: root, signal: new AbortController().signal })) events.push(event);
    expect(events.at(-1)?.kind).toBe('error');
  });
  it('Comfy 绑定不能覆盖链接；运行取消不发送全局 interrupt', async () => {
    const workflow = { name: 'Linked input', purpose: 'image', imageUsages: ['figure'], uploads: [], apiGraph: { '1': { class_type: 'Text', inputs: { text: ['2', 0] } } }, inputs: [{ nodeId: '1', classType: 'Text', input: 'text' }], outputs: [{ nodeId: '1', key: 'images', kind: 'image', role: 'primary' }] } as unknown as WorkflowBinding;
    expect(() => validateWorkflow(workflow)).toThrow('node link');
    const paths: string[] = []; const remote = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async url => { paths.push(String(url)); return Response.json(String(url).endsWith('/queue') ? { queue_running: [[0, 'ours']], queue_pending: [] } : {}); } });
    const conf = config('comfyUI'); expect((await remote.cancel({ protocol: 'comfyUI', id: 'ours', connectionId: conf.id, submittedAt: new Date().toISOString() }, { requestId: id(), config: conf, workflow: null, directory: root, signal: new AbortController().signal })).remote).toBe('unsupported'); expect(paths.some(path => path.includes('interrupt'))).toBe(false);
  });
});
describe('方案及 UI 组合', () => {
  it('方案替换一次，未被模板引用的上下文仍发送，任务快照独立', () => {
    const recipe = structuredClone(OfficialRecipes[0]!); recipe.taskTemplate = '{{instruction}}'; recipe.systemPrompt = 'style';
    const result = requireValue(prepareRecipe({ recipe, selection: { recipeId: recipe.id, scope: recipe.scope, purpose: recipe.purposes[0]!, usage: recipe.uses[0]!, parameterValues: {} }, instruction: '{{context}}', context: [{ id: id(), kind: 'setting', label: '已选', included: true, source: null, text: '世界观', media: null, attachment: null, authorEdited: false }], settings: { maxOutputTokens: 64, temperature: null, seed: null }, sourceVersions: [], capability: { connectionId: id(), connectionRevision: 1, checkedAt: new Date().toISOString(), serviceVersion: null, purpose: 'text', status: 'unverified', inputs: [], output: 'text', models: null, promptFormat: null, textVision: { supported: false, mimeTypes: [], maxImages: null, maxBytes: null }, remote: { query: false, cancelQueued: false, cancelRunning: 'none' }, issues: [] } }));
    expect(result.assembledInput.messages[0]!.text).toContain('{{context}}'); expect(result.assembledInput.messages[0]!.text).toContain('世界观'); recipe.systemPrompt = 'changed'; expect(result.recipe.systemPrompt).toBe('style'); expect(parsePrompt('```json\n{}\n```', 'imagePrompt').ok).toBe(false);
  });
  it('组合实际资源依赖闭包、CSS编译、关联保存重开与撤销', async () => {
    const template = createOfficialTemplate({ kind: 'standard' }); for (const document of createTemplateDocuments(template)) session.registerDocument(document);
    const page = template.pages[0]!, composition: UIComposition = { id: id(), revision: 1, planId: id(), candidateId: id(), baseVersions: [], resources: [], propertyOwners: [], issues: [], proposal: { summary: '样式', config: [], assets: [{ key: 'image', source: { kind: 'candidate', key: 'image' }, use: 'background' }], styles: [{ key: 'style', name: '新样式', styleId: null, scope: { pageId: page.id, componentId: null }, language: 'css', source: '[data-gc-part="title.background"] { background-image: url("candidate-asset:image"); }', dependsOn: [] }] } };
    expect(compositionClosure(composition, ['style'], [])).toEqual(['image', 'style']);
    expect(() => prepareComposition({ composition, documents: [...session.documents.values()], keys: ['style'], assets: new Map(), validateAsset: () => true })).toThrow('尚未准备');
    const assetId = id(), variantId = id(), prepared = prepareComposition({ composition, documents: [...session.documents.values()], keys: ['style', 'image'], assets: new Map([['image', { assetId, variantId, active: true }]]), validateAsset: () => true });
    expect(JSON.stringify(prepared.edit)).not.toContain('candidate-asset:'); expect(prepared.template.styles[0]!.assets).toEqual([assetId]);
    const plan = requireValue(session.planEdit(prepared.edit)); requireValue(session.applyEdit(plan.planId, prepared.edit.expected)); expect(session.dirtyIds()).toContain(template.instanceId);
  });
});
