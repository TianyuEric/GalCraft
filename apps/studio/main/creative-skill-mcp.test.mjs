import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { ProjectSession } from '@galcraft/documents';
import { FixtureProject, FixtureScenes, FixtureLock } from '@galcraft/contracts/fixtures';
import { createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { currentProjectScope, creativeSkillFiles } from '@galcraft/collaboration';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import { createAssetIndex } from '@galcraft/assets';
import { builtinProductionOperations } from '@galcraft/authoring/production/operations';
import { StudioCollaboration } from './collaboration-providers.mjs';
import { StudioProduction } from './production-providers.mjs';
import { compile } from '@galcraft/dsl';

let directory, project, owner, client, production;
const value = result => { expect(result.ok, JSON.stringify(result)).toBe(true); return result.value; };
afterEach(async () => {
  await client?.close(); await owner?.close(); await production?.prepareStop(); await project?.dispose('discard');
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = project = owner = client = production = null;
});

it('installs each native project Skill with resolvable progressive references and preserves author-edited reference files', async () => {
  directory = await mkdtemp(join(tmpdir(), 'galcraft-ao8-skill-'));
  project = await ProjectSession.createProject(join(directory, 'work'), 'Skill1', createTemplateDocuments(createOfficialTemplate()));
  owner = new StudioCollaboration({ userData: join(directory, 'profile'), projects: { currentSession: project, currentRoot: join(directory, 'work'), currentSessionId: 'Write1' }, production: { generationProviders: { operations: async () => [] } }, assets: {}, plugins: { externalTools: async () => [] } });
  await owner.ready;
  const installations = [];
  for (const [harness, native] of [['codex', '.agents'], ['claude', '.claude'], ['dsh', '.dsh']]) {
    const configuration = value(await owner.call('configuration', { harness, purpose: 'skill' }));
    expect(configuration.path).toBe(join(directory, 'work', native, 'skills', 'galcraft-create'));
    value(await owner.call('writeConfiguration', configuration));
    const files = creativeSkillFiles(harness), entry = await readFile(join(configuration.path, 'SKILL.md'), 'utf8');
    expect(entry).toContain('name: galcraft-create'); expect(entry).toContain('Target projectId: Skill1');
    expect(Object.keys(files).filter(name => name.endsWith('.md'))).toHaveLength(12);
    const links = [];
    for (const name of Object.keys(files).filter(name => name.endsWith('.md'))) {
      const path = join(configuration.path, name), content = await readFile(path, 'utf8');
      for (const match of content.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
        const target = resolve(dirname(path), match[1]);
        expect(relative(configuration.path, target).startsWith('..')).toBe(false);
        expect(await readFile(target, 'utf8')).not.toBe(''); links.push(relative(configuration.path, target));
      }
    }
    expect(links).toContain(join('references', 'production.md'));
    if (harness === 'codex') expect(await readFile(join(configuration.path, 'agents/openai.yaml'), 'utf8')).toContain('allow_implicit_invocation: true');
    else expect(entry).toContain('user-invocable: true');
    const reference = join(configuration.path, 'references/production.md'), edited = `${await readFile(reference, 'utf8')}\nAuthor's project-specific production instruction.\n`;
    await writeFile(reference, edited);
    const update = value(await owner.call('configuration', { harness, purpose: 'skill' }));
    expect(update.guidance.some(message => message.includes('Kept your edited file'))).toBe(true);
    value(await owner.call('writeConfiguration', update));
    expect(await readFile(reference, 'utf8')).toBe(edited);
    expect(await readFile(`${reference}.galcraft-update`, 'utf8')).toBe(files['references/production.md']);
    installations.push({ harness, native: `${native}/skills/galcraft-create`, markdownFiles: 12, resolvedLinks: links.length, editedReferencePreserved: true });
  }
  const evidence = resolve('../../test-results/latest/authoring-operations/ao8');
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, 'native-skills.json'), JSON.stringify({ environment: 'Real temporary project filesystem / Studio configuration and writer', installations, modelsLaunched: 0, networkGenerationRequests: 0 }, null, 2));
});

it('uses the Skill short discovery/edit/page/recovery path through the public SDK while preserving existing authored text', async () => {
  directory = await mkdtemp(join(tmpdir(), 'galcraft-ao8-public-'));
  const template = createOfficialTemplate(), scene = FixtureScenes[0], script = 'say {speaker:{kind:"narrator"},text:"已有剧本，保留原句。"} @Line01;\nend {} @End001;';
  const projectData = { ...FixtureProject, chapters: FixtureProject.chapters.map(chapter => ({ ...chapter, sceneIds: [scene.id] })) }, index = createAssetIndex('AsstDc');
  const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data });
  project = await ProjectSession.createProject(join(directory, 'work'), FixtureProject.projectId, [
    ...createTemplateDocuments(template),
    { documentId: 'ProjDc', revision: 1, format: 'json', files: { 'project.json': envelope('ProjDc', projectData) } },
    { documentId: 'ScenDc', revision: 1, format: 'dsl', files: { [`scenes/${scene.id}/scene.json`]: envelope('ScenDc', scene), [`scenes/${scene.id}/script.gal`]: script } },
    { documentId: index.documentId, revision: 1, format: 'json', files: { 'assets/index.json': JSON.stringify(index) } },
    { documentId: 'LockDc', revision: 1, format: 'json', files: { 'dependencies.lock.json': envelope('LockDc', { ...FixtureLock, plugins: [], template: { ...FixtureLock.template, id: template.id, version: template.version } }) } },
  ]);
  const plugins = { externalTools: async () => [], dependencies: () => [], acquireDefinitions: async () => ({ ok: true, value: { commands: [], documents: [], components: [], pages: [], release: async () => {} } }) };
  const projects = { currentSession: project, currentRoot: join(directory, 'work'), currentSessionId: 'Write1' };
  const connection = { id: 'Conn01', revision: 3, name: 'Already configured text', protocol: 'chatCompletions', baseUrl: 'http://controlled.invalid', auth: 'none', credentialId: null, apiKeyHeader: null,
    model: 'controlled-model', purposes: ['text'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  production = new StudioProduction({ userData: join(directory, 'profile'), projects, language: { compile: async input => ({ ok: true, value: { ...compile(input), current: true }, warnings: [] }) }, assets: { toolDirectory: '' }, generationProviders: { operations: async () => builtinProductionOperations }, connections: { read: async () => ({ config: connection }), list: async () => [connection], credential: async () => null }, resources: { register: () => ({ uri: 'test://candidate', release() {} }) } });
  let actualSends = 0, releaseOutput;
  const outputGate = new Promise(resolve => { releaseOutput = resolve; });
  production.adapter = { async *submit(input, context) {
    expect(JSON.stringify(input)).toContain('直接输入的既有提示'); await context.beforeSend?.(); actualSends++;
    yield { kind: 'accepted', remote: { protocol: connection.protocol, id: 'controlled-original', connectionId: connection.id, submittedAt: new Date().toISOString() } };
    await outputGate;
    yield { kind: 'textDelta', text: 'say {speaker:{kind:"narrator"},text:"新增的一句。"} @Line02;' };
    yield { kind: 'output', artifacts: [], usage: { requests: 1 } };
  }, query: async () => ({ ok: true, value: { state: 'completed', output: {}, issues: [] }, warnings: [] }), fetch: async () => ({ ok: true, value: [], warnings: [] }), cancel: async () => ({ local: 'stopped', remote: 'unsupported' }) };
  owner = new StudioCollaboration({ userData: join(directory, 'profile'), projects, production, assets: {}, plugins }); await owner.ready;
  const session = await owner.core.create({ projectId: project.projectId, projectRoot: join(directory, 'work'), writeSessionId: 'Write1', projectName: 'Existing script', goal: 'Add a chapter and change one page gap, retain story', harness: 'codex', scope: currentProjectScope() });
  client = new Client({ name: 'galcraft-skill-acceptance', version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } });
  await client.connect(new StreamableHTTPClientTransport(new URL((await owner.mcp.start()).endpoint)));
  const calls = [];
  const call = async (name, input, callId) => {
    const response = await client.callTool({ name, arguments: { projectId: project.projectId, sessionId: session.id, ...(callId ? { callId } : {}), input } });
    expect(response.isError, JSON.stringify(response)).not.toBe(true); const record = response.structuredContent;
    expect(record.state, JSON.stringify(record)).toBe('completed'); calls.push({ name, action: input.action ?? input.operation?.op ?? null, callId: record.callId, state: record.state }); return record.result;
  };
  const discovered = await call('galcraft_catalog', { category: 'operations', text: 'chapter', limit: 5 });
  expect(discovered.entries.every(row => row.inputSchema === undefined)).toBe(true);
  const key = discovered.entries.find(row => row.key === 'chapter.create').key;
  const contract = await call('galcraft_catalog', { category: 'operations', key });
  expect(contract.entries[0].inputSchema.properties.operation).toBeTruthy();
  const expected = [{ ref: { kind: 'document', id: 'ProjDc' }, revision: 1 }];
  const prepared = await call('galcraft_edit_prepare', { operation: { op: key, name: '保留原剧本的新章节' }, expected }, 'chapter-prepare');
  expect(prepared.plan.input?.patches).toBeUndefined(); expect(prepared.plan.expected).toEqual(expected);
  await call('galcraft_edit_apply', { planId: prepared.plan.planId, expected: prepared.plan.expected }, 'chapter-apply');
  const page = template.pages.find(page => page.key === 'title');
  await call('galcraft_pages', { action: 'read', pageId: page.id });
  await call('galcraft_pages', { action: 'catalog', part: 'page', operationKinds: ['component.update'], fieldGroup: 'layout' });
  const changed = await call('galcraft_pages', { action: 'prepare', request: { label: 'Only title gap', operations: [{ kind: 'component.update', pageId: page.id, componentId: page.root.id, changes: { layout: { gap: 37 } } }] } }, 'page-prepare');
  await call('galcraft_pages', { action: 'apply', planId: changed.plan.planId, expected: changed.plan.expected }, 'page-apply');
  const operationCount = project.operations.length;
  const recovered = await client.callTool({ name: 'galcraft_call', arguments: { projectId: project.projectId, sessionId: session.id, callId: 'page-apply' } });
  expect(recovered.isError).not.toBe(true); expect(recovered.structuredContent.state).toBe('completed');
  expect(project.operations).toHaveLength(operationCount); expect(project.readDocument('ScenDc').files[`scenes/${scene.id}/script.gal`]).toBe(script);
  expect(JSON.parse(project.readDocument(page.id).files[`ui/pages/${page.key}.json`] ?? Object.values(project.readDocument(page.id).files)[0]).data.root.layout.gap).toBe(37);
  expect(owner.core.get(session.id).sentRequests).toHaveLength(0);
  await call('galcraft_catalog', { category: 'tools', key: 'galcraft_production', action: 'prepare' });
  const direct = await call('galcraft_production', { action: 'prepare', operation: 'script', connectionId: connection.id, fields: { instruction: '直接输入的既有提示：追加一句旁白，保留原句。', creationMode: 'write' }, target: { sceneId: scene.id }, sourceVersions: [{ ref: { kind: 'document', id: 'ScenDc' }, revision: 1 }] }, 'direct-prepare');
  expect(direct.task.items).toHaveLength(1); expect(actualSends).toBe(0);
  const submitted = await call('galcraft_production', { action: 'submit', planId: direct.planId }, 'direct-submit');
  expect(submitted.task.items[0].candidateIds).toEqual([]);
  releaseOutput();
  let completed = await call('galcraft_production', { action: 'wait', taskId: submitted.task.id, timeoutMs: 5000 });
  if (!completed.task.items[0].candidateIds.length) completed = await call('galcraft_production', { action: 'wait', taskId: submitted.task.id, timeoutMs: 5000 });
  const item = completed.task.items[0], candidateId = item.candidateIds[0]; expect(candidateId).toBeTruthy();
  expect(project.operations).toHaveLength(operationCount); // Candidates-only endpoint leaves the project unchanged.
  const candidate = await call('galcraft_production', { action: 'candidate', candidateId }); expect(candidate.content.text).toContain('新增的一句');
  expect({ partial: candidate.candidate.partial, checks: candidate.candidate.checks, needsReview: item.needsReview }, JSON.stringify({ completed, candidate })).toEqual({ partial: false, checks: [], needsReview: false });
  const versions = [...project.documents.values()].map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }));
  const adoption = await call('galcraft_production', { action: 'prepareAdoption', taskId: submitted.task.id, selections: [{ itemId: item.id, candidateId }], expected: versions }, 'direct-adoption-plan');
  await call('galcraft_production', { action: 'adopt', planId: adoption.plan.planId, expected: adoption.plan.expected }, 'direct-adopt');
  const adopted = project.readDocument('ScenDc').files[`scenes/${scene.id}/script.gal`]; expect(adopted).toContain('已有剧本，保留原句。'); expect(adopted).toContain('新增的一句。');
  expect(actualSends).toBe(1); expect(owner.core.get(session.id).sentRequests).toHaveLength(1);
  const queried = await client.callTool({ name: 'galcraft_call', arguments: { projectId: project.projectId, sessionId: session.id, callId: 'direct-submit' } }); expect(queried.isError).not.toBe(true); expect(actualSends).toBe(1);
  const evidence = resolve('../../test-results/latest/authoring-operations/ao8'); await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, 'public-short-path.json'), JSON.stringify({ transport: 'Official MCP SDK / real M02, M08 and M10 / controlled adapter without network', calls, originalTextPreserved: true, transactions: project.operations.length, recoveredWithoutNewTransaction: true, actualGenerationSends: actualSends, networkGenerationRequests: 0, additionalPromptPreparationRequests: 0, candidatesOnlyPreservesProject: true, configuredConnection: { id: connection.id, revision: connection.revision, model: connection.model }, endpoint: 'Candidates first, then explicitly authorized script adoption preserving original prose; save not requested' }, null, 2));
}, 20000);
