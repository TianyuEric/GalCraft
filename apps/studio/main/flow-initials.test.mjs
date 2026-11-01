import { expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ProjectSession } from '@galcraft/documents';
import { SnapshotSchema } from '@galcraft/contracts';
import { FixtureIds, FixtureLock, FixtureProject, FixtureScenes, FixtureVariables } from '@galcraft/contracts/fixtures';
import { compile } from '@galcraft/dsl';
import { createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { ProjectAccess } from './project-access.mjs';
import { ProjectDocuments } from './document-providers.mjs';
import { compileInput } from '../renderer/authoring/bridge.js';

const unwrap = result => { if (!result.ok) throw new Error(JSON.stringify(result)); return result.value; };
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data });
it('compiles the saved authoring/debug envelope through the actual Studio source and preserves only the referenced initial in a disk snapshot', async () => {
  await mkdir(resolve('../../tmp/testing'), { recursive: true });
  const parent = await mkdtemp(resolve('../../tmp/testing/flow-initial-')), root = join(parent, 'project');
  const template = createOfficialTemplate({ kind: 'light' }), scene = FixtureScenes[0];
  const project = structuredClone(FixtureProject); project.templateDocumentId = template.instanceId;
  project.chapters[0].sceneIds = [scene.id];
  const lock = { ...FixtureLock, plugins: [], template: template.dependencies.find(dependency => dependency.kind === 'template') };
  const scenario = { schemaVersion: 1, id: 'InitAA', name: '作者独立初值', projectId: project.projectId,
    entry: { sceneId: scene.id, statementId: null }, target: { sceneId: scene.id, statementId: null },
    initialProgress: { [FixtureIds.relation]: 7 }, pluginInitial: {}, route: [], playerInputs: [], externalPolicy: 'simulate', engineVersion: project.engineVersion,
    pluginVersions: [lock.engine, lock.template] };
  const flow = { id: 'FlowAA', name: '正式回想', roots: ['NodeAA'], nodes: [{ id: 'NodeAA', name: '独立初值', x: 0, y: 0,
    sceneId: scene.id, statementId: null, unlock: { kind: 'literal', value: true }, lockedView: 'locked', entry: { kind: 'initial', debugScenarioId: scenario.id } }], edges: [] };
  const json = (documentId, path, data) => ({ documentId, revision: 1, format: 'json', files: { [path]: envelope(documentId, data) } });
  const created = await ProjectSession.createProject(root, project.projectId, [
    json('ProjAA', 'project.json', project), json('LockAA', 'dependencies.lock.json', lock), json('Assets', 'assets/index.json', { assets: [] }),
    json('VarAAA', `variables/${FixtureIds.relation}.json`, FixtureVariables[0]), json('FlowDC', 'flows/FlowAA.json', flow),
    json('DebugA', 'authoring/debug/InitAA.json', scenario), json('DebugB', 'authoring/debug/Unused.json', { id: 'Unused', privateNote: '只留在作者资料' }),
    { documentId: 'Script', revision: 1, format: 'dsl', files: { [`scenes/${scene.id}/scene.json`]: envelope('Script', scene),
      [`scenes/${scene.id}/script.gal`]: 'say {speaker:{kind:"narrator"},text:"从真实作者初值进入"} @Recall;' } }, ...createTemplateDocuments(template),
  ]);
  await created.dispose('saved');
  const documents = new ProjectDocuments(new ProjectAccess(), undefined, { resolveEngine: async () => ({ ok: true, value: { version: '0.1.0', manifest: { targets: ['web','windows'] } }, warnings: [] }) });
  const opened = unwrap(await documents.open(root));
  try {
    const input = unwrap(compileInput(unwrap(documents.list())));
    expect(input.debugScenarios).toContainEqual({ documentId: 'DebugA', revision: 1, data: scenario });
    const result = compile(input); expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    const output = join(root, 'compiled.snapshot.json'); await writeFile(output, JSON.stringify(result.snapshot));
    const snapshot = SnapshotSchema.parse(JSON.parse(await readFile(output, 'utf8')));
    expect(snapshot.flowInitials).toHaveLength(1); expect(snapshot.flowInitials[0].initialProgress).toEqual({ [FixtureIds.relation]: 7 });
    expect(snapshot.flowInitials[0].entry.statementId).toBe('Recall'); expect(JSON.stringify(snapshot)).not.toContain('只留在作者资料');
    expect(snapshot.documents).toContainEqual({ documentId: 'DebugA', revision: 1 });
    expect(snapshot.documents.some(document => document.documentId === 'DebugB')).toBe(false);
  } finally { unwrap(await documents.close(opened.sessionId, 'discard')); }
});
