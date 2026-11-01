import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { ProjectSession } from '@galcraft/documents';
import { createId, DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import { FixtureProject, FixtureScenes, FixtureLock } from '@galcraft/contracts/fixtures';
import { compile } from '@galcraft/dsl';
import { createAssetIndex } from '@galcraft/assets';
import { createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { StudioProduction } from './production-providers.mjs';
import { StudioCollaboration } from './collaboration-providers.mjs';

let directory, project, production, owner;
const value = result => { if (!result.ok) throw new Error(JSON.stringify(result)); return result.value; };
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data });
afterEach(async () => { await owner?.close(); await production?.prepareStop(); await project?.dispose('discard'); if (directory) await rm(directory, { recursive: true, force: true }); });

it('continues Studio and other-collaboration records through M12 with actual draft versions and unchanged original send identities', async () => {
  directory = await mkdtemp(join(tmpdir(), 'galcraft-ao2-production-'));
  const projectDocumentId = createId(), sceneDocumentId = createId(), index = createAssetIndex(createId()), scene = FixtureScenes[0], template = createOfficialTemplate(), lockId = createId();
  const projectData = { ...FixtureProject, chapters: FixtureProject.chapters.map(chapter => ({ ...chapter, sceneIds: [scene.id] })) };
  project = await ProjectSession.createProject(join(directory, 'project'), FixtureProject.projectId, [
    { documentId: projectDocumentId, revision: 1, format: 'json', files: { 'project.json': envelope(projectDocumentId, projectData) } },
    { documentId: lockId, revision: 1, format: 'json', files: { 'dependencies.lock.json': envelope(lockId, { ...FixtureLock, plugins: [], template: { ...FixtureLock.template, id: template.id, version: template.version } }) } },
    { documentId: sceneDocumentId, revision: 1, format: 'dsl', files: { [`scenes/${scene.id}/scene.json`]: envelope(sceneDocumentId, scene), [`scenes/${scene.id}/script.gal`]: 'end {} @End001;' } },
    { documentId: index.documentId, revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } }, ...createTemplateDocuments(template)]);
  const projects = { currentSession: project, currentRoot: join(directory, 'project'), currentSessionId: 'Write1' };
  const config = { id: 'Conn01', revision: 3, name: 'Configured text', protocol: 'chatCompletions', baseUrl: 'http://controlled.invalid', auth: 'none', credentialId: null, apiKeyHeader: null,
    model: 'controlled-model', purposes: ['text'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  production = new StudioProduction({ userData: directory, projects, language: { compile: async input => ({ ok: true, value: { ...compile(input), current: true }, warnings: [] }) }, assets: { toolDirectory: '' }, connections: { read: async () => ({ config }), list: async () => [config], credential: async () => null }, resources: { register: () => ({ uri: 'test://candidate', release() {} }) } });
  let sends = 0;
  production.adapter = { inspect: async () => ({}), async *submit(_input, context) { await context.beforeSend?.(); sends++;
    yield { kind: 'accepted', remote: { protocol: config.protocol, id: `controlled-remote-${sends}`, connectionId: config.id, submittedAt: new Date().toISOString() } };
    yield { kind: 'textDelta', text: `讨论候选 ${sends}` }; yield { kind: 'output', artifacts: [], usage: { requests: 1 } }; },
    query: async () => ({ ok: true, value: { state: 'completed', output: {}, issues: [] }, warnings: [] }), fetch: async () => ({ ok: true, value: [], warnings: [] }), cancel: async () => ({ local: 'stopped', remote: 'unsupported' }) };
  owner = new StudioCollaboration({ userData: directory, projects, production, assets: {}, plugins: { externalTools: async () => [] } }); await owner.ready;
  const documents = [...project.documents.keys()], scope = { documents, createKinds: [], tools: ['galcraft_production'], operations: ['discuss'], connectionIds: [config.id], models: [config.model], workflowIds: [], maxGenerations: 8 };
  const createSession = goal => owner.core.create({ projectId: project.projectId, writeSessionId: 'Write1', projectName: 'AO2 fixture', goal, harness: 'codex', scope });
  const original = await createSession('Original collaboration'); let reader;
  const originalContext = { projectId: project.projectId, writeSessionId: 'Write1', sessionId: original.id, scopeRevision: 1, callId: 'original-task', toolKey: 'galcraft_production' };
  const ctx = await production.current(), target = { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'script', uiScope: null };
  const variant = { operation: 'discuss', target, fields: { instruction: '讨论角色动机', creationMode: 'discuss' }, context: [], connectionId: config.id, workflowBindingId: null, model: config.model, recipe: null, promptPreparation: null, backgroundRemoval: null, backgroundPreview: null, sourceVersions: [{ ref: { kind: 'document', id: projectDocumentId }, revision: 1 }] };
  const makeTask = async collaboration => { const item = await production.createItem(ctx, { activeUse: 'script' }, variant);
    const plan = value(await ctx.service.planTask({ projectId: project.projectId, name: collaboration ? 'Other collaboration' : 'Studio', context: [], items: [item], policy: 'waitForSelection', selectionRule: null, stagePolicy: collaboration ? 'external' : 'interactive', collaboration }));
    const task = value(await ctx.service.submit(plan.planId)); await ctx.service.drain(); return ctx.service.listTasks().find(current => current.id === task.id); };
  const studioTask = await makeTask(), originalTask = await makeTask(originalContext), originalItem = structuredClone(originalTask.items[0]);
  await owner.core.end({ id: original.id, expectedRevision: 1 }); reader = await createSession('Continue existing project work');
  const draft = value(await ctx.service.saveFormDraft({ schemaVersion: 1, id: createId(), projectId: project.projectId, revision: 0, activeUse: 'script', variants: { script: structuredClone(variant) }, updatedAt: new Date().toISOString(), submittedTaskId: null }, null));
  const invoke = async (input, callId, session = reader) => { let record = await owner.core.invoke('galcraft_production', input, session.id, callId);
    const deadline = Date.now() + 5000; while (['accepted', 'running'].includes(record.state) && Date.now() < deadline) { await delay(5); record = await owner.core.query(session.id, callId); }
    expect(record.state, JSON.stringify(record)).toBe('completed'); return record.result; };
  expect((await invoke({ action: 'tasks' }, 'discover-tasks')).tasks.map(task => task.id).sort()).toEqual([studioTask.id, originalTask.id].sort());
  expect((await invoke({ action: 'drafts' }, 'discover-drafts')).drafts.map(item => item.id)).toContain(draft.id);
  const frozen = await invoke({ action: 'frozen', taskId: originalTask.id }, 'read-frozen');
  expect(frozen.frozen).toMatchObject({ collaboration: originalContext, items: [{ remote: originalItem.remote, attempts: originalItem.attempts }] });
  expect(sends).toBe(2); expect(owner.core.get(reader.id).generations).toBe(0);
  const read = (await invoke({ action: 'draft', draftId: draft.id }, 'read-draft')).draft; read.variants.script.fields.instruction = '复用当前草稿继续讨论';
  const saved = (await invoke({ action: 'saveDraft', draft: read, expectedRevision: read.revision }, 'update-draft')).draft;
  const prepared = await invoke({ action: 'prepareDraft', draftId: saved.id, name: 'Continue Studio draft' }, 'prepare-draft');
  expect((await ctx.service.store.read(ctx.service.store.planPath(prepared.planId))).task.sourceDraftId).toBe(saved.id); expect(prepared.task.items).toHaveLength(1);
  const submitted = await invoke({ action: 'submit', planId: prepared.planId }, 'submit-draft'); await ctx.service.drain();
  await invoke({ action: 'wait', taskId: submitted.task.id, timeoutMs: 0 }, 'wait-draft');
  const continued = await invoke({ action: 'planContinuation', taskId: originalTask.id, candidateId: originalItem.candidateIds[0], instruction: '继续解释动机', mode: 'discuss' }, 'prepare-continuation');
  await invoke({ action: 'submitContinuation', taskId: originalTask.id, planId: continued.planId }, 'submit-continuation'); await ctx.service.drain();
  const after = ctx.service.listTasks().find(task => task.id === originalTask.id);
  expect(after.collaboration).toEqual(originalContext); expect(after.executionCollaboration.sessionId).toBe(reader.id);
  expect(after.items[0].remote).toEqual(originalItem.remote); expect(after.items[0].attempts).toEqual(originalItem.attempts);
  expect(after.items).toHaveLength(2); expect(sends).toBe(4); expect(owner.core.get(original.id).generations).toBe(1); expect(owner.core.get(reader.id).generations).toBe(2);
  await invoke({ action: 'candidate', candidateId: originalItem.candidateIds[0] }, 'read-original-candidate');
  expect(sends).toBe(4); expect(owner.core.get(reader.id).sentRequests).toHaveLength(2);
  const source = project.readDocument(projectDocumentId), renamed = value(project.planEdit({ label: 'Update formal project source', origin: 'field', expected: [{ ref: { kind: 'document', id: projectDocumentId }, revision: source.revision }], preparedAssets: [], requiredRefs: [],
    patches: [{ kind: 'json', documentId: projectDocumentId, changes: [{ path: '/data/name', op: 'set', before: FixtureProject.name, after: '新的作品标题' }] }] }));
  value(project.applyEdit(renamed.planId, renamed.input.expected));
  await ctx.service.sourceChanged({ ref: { kind: 'document', id: projectDocumentId }, revision: source.revision + 1 }, [originalItem.id]);
  const currentVersions = after.items[0].sourceVersions.map(version => version.ref.id === projectDocumentId ? { ...version, revision: source.revision + 1 } : version);
  await invoke({ action: 'keepResults', taskId: originalTask.id, itemId: originalItem.id, versions: currentVersions }, 'retain-results');
  const retained = (await invoke({ action: 'frozen', taskId: originalTask.id, itemId: originalItem.id }, 'read-retained-frozen')).frozen.items[0];
  expect(retained.sourceVersions).toEqual(originalItem.frozenSourceVersions); expect(retained.reviewedSourceVersions).toEqual(currentVersions); expect(retained.remote).toEqual(originalItem.remote); expect(retained.attempts).toEqual(originalItem.attempts); expect(sends).toBe(4);
  await owner.core.end({ id: reader.id, expectedRevision: 1 });
  const restricted = await owner.core.create({ projectId: project.projectId, writeSessionId: 'Write1', projectName: 'AO2 fixture', goal: 'Restricted operation scope', harness: 'codex', scope: { ...scope, operations: [] } });
  expect((await invoke({ action: 'tasks' }, 'restricted-tasks', restricted)).tasks).toEqual([]);
}, 20000);
