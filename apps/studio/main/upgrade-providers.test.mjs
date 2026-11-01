import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EngineCatalog } from '@galcraft/publishing/engine';
import { StudioUpgrades } from './upgrade-providers.mjs';
import { StudioBackups } from './backup-providers.mjs';
import { ProjectAccess } from './project-access.mjs';
import { ProjectDocuments } from './document-providers.mjs';

const root = resolve('../../tmp/testing/upgrade-provider'), userData = join(root, 'studio');
const value = result => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const expected = projects => [...projects.currentSession.documents.values()].map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }));
const conversionSource = `export async function convertProject({directory,to}) {
  const {readFile,writeFile}=await import('node:fs/promises');const {join}=await import('node:path');
  for(const path of ['project.json','dependencies.lock.json']) {
    const document=JSON.parse(await readFile(join(directory,path),'utf8'));
    if(path==='project.json'){document.data.engineVersion=to;document.data.name+=' converted';}
    else document.data.engine.version=to;
    document.revision++; await writeFile(join(directory,path),JSON.stringify(document));
  }
}`;
async function engine(version, conversion = false) {
  const directory = join(userData, 'engines', version); await mkdir(directory, { recursive: true });
  const contents = { 'compiler.mjs': 'fixture', 'web.html': 'fixture', 'windows.exe': 'fixture', 'notes.md': version,
    ...(conversion ? { 'upgrade.mjs': conversionSource } : {}) };
  for (const [path, contentsValue] of Object.entries(contents)) await writeFile(join(directory, path), contentsValue);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ schemaVersion: 1, id: 'galcraft', version, targets: ['web', 'windows'],
    projectSchemaVersions: [1], saveSchemaVersions: [1], sdkMajor: 0, dslVersion: '1', templateSchemaVersions: [1],
    entries: { compiler: 'compiler.mjs', playerWeb: 'web.html', playerWindows: 'windows.exe', upgrade: conversion ? 'upgrade.mjs' : null },
    host: { electron: '43.7.0', supportedWindows: ['fixture'], supportedBrowsers: [] },
    conversions: conversion ? [{ from: '0.1.0', to: version, entry: 'upgrade.mjs' }] : [],
    files: Object.entries(contents).map(([path, text]) => ({ path, size: Buffer.byteLength(text) })), releaseNotes: 'notes.md' }));
}
async function setup(check = 'pass') {
  await engine('0.1.0'); await engine('1.1.0', true); await engine('2.0.0');
  const catalog = new EngineCatalog(userData), projects = new ProjectDocuments(new ProjectAccess(), undefined, catalog);
  value(await projects.create({ path: root, name: 'Original', template: 'standard', width: 1280, height: 720, engineVersion: '0.1.0' }));
  const backups = new StudioBackups({ userData, projects, engineCatalog: catalog });
  const upgrades = new StudioUpgrades({ userData, projects, engineCatalog: catalog, backups,
    validate: async ({ targets }) => ({ validatedAt: new Date().toISOString(), sourceVersions: [], checks: targets.flatMap(target =>
      ['dsl', 'template', 'plugin', 'resource', 'save', 'playtest'].map(kind => ({ kind, target, result: kind === 'save' ? check : 'pass', issues: [] }))) }) });
  return { projects, upgrades, backups };
}
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
describe('declared upgrade copies and M02 commits', () => {
  it('validates and confirms an existing 0.1.0 project with the refreshed 0.1.0 engine without changing its documents or Lock', async () => {
    const { projects, upgrades } = await setup();
    const before = Object.fromEntries([...projects.currentSession.documents.values()].flatMap(document => Object.entries(document.files)));
    const projectId = projects.currentSession.projectId;
    const plan = value(await upgrades.plan({ projectId, toVersion: '0.1.0', expected: expected(projects), representativeSaves: [] }));
    expect(plan.from).toBe('0.1.0'); expect(plan.to).toBe('0.1.0');
    expect(plan.changes).toEqual([]); expect(plan.dependencyChanges).toEqual([]);
    expect(plan.validation.checks).toHaveLength(12);
    expect((await upgrades.commit(plan.id)).ok).toBe(true);
    const after = Object.fromEntries([...projects.currentSession.documents.values()].flatMap(document => Object.entries(document.files)));
    expect(after).toEqual(before); expect(projects.currentSession.projectId).toBe(projectId);
    expect(JSON.parse(after['dependencies.lock.json']).data.engine.version).toBe('0.1.0');
    await projects.close(projects.currentSessionId, 'discard');
  });
  it('blocks same-version confirmation when an existing save is incompatible', async () => {
    const { projects, upgrades } = await setup('fail');
    const plan = value(await upgrades.plan({ projectId: projects.currentSession.projectId, toVersion: '0.1.0', expected: expected(projects), representativeSaves: ['old-save.json'] }));
    expect((await upgrades.commit(plan.id)).error.code).toBe('UPGRADE_VALIDATION_REQUIRED');
    await projects.close(projects.currentSessionId, 'discard');
  });
  it('cancels preparation before the plan call returns an id', async () => {
    const { projects, upgrades } = await setup(), session = projects.currentSession;
    const original = session.withSavedSnapshot.bind(session);
    let enter, release;
    const entered = new Promise(resolve => { enter = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    session.withSavedSnapshot = async callback => { enter(); await held; return original(callback); };
    const operationId = randomUUID();
    const pending = upgrades.plan({ projectId: session.projectId, operationId, toVersion: '1.1.0', expected: expected(projects), representativeSaves: [] });
    await entered;
    expect(value(upgrades.cancel(operationId)).local).toBe('stopped');
    release();
    expect((await pending).error.code).toBe('CANCELLED');
    expect(JSON.parse(await readFile(join(projects.currentRoot, 'project.json'), 'utf8')).data.engineVersion).toBe('0.1.0');
    await projects.close(projects.currentSessionId, 'discard');
  });
  it('rejects undeclared conversion without editing the source', async () => {
    const { projects, upgrades } = await setup(), before = await readFile(join(projects.currentRoot, 'project.json'), 'utf8');
    const result = await upgrades.plan({ projectId: projects.currentSession.projectId, toVersion: '2.0.0', expected: expected(projects), representativeSaves: [] });
    expect(result.ok || result.error.code).toBe('UPGRADE_UNSUPPORTED');
    expect(await readFile(join(projects.currentRoot, 'project.json'), 'utf8')).toBe(before);
    await projects.close(projects.currentSessionId, 'discard');
  });
  it('keeps the original when validation fails and refuses confirmation', async () => {
    const { projects, upgrades } = await setup('fail');
    const plan = value(await upgrades.plan({ projectId: projects.currentSession.projectId, toVersion: '1.1.0', expected: expected(projects), representativeSaves: [] }));
    expect(plan.changes.map(item => item.file)).toContain('project.json');
    expect((await upgrades.commit(plan.id)).ok).toBe(false);
    expect(JSON.parse(await readFile(join(projects.currentRoot, 'project.json'), 'utf8')).data.engineVersion).toBe('0.1.0');
    await projects.close(projects.currentSessionId, 'discard');
  });
  it('detects edits after validation, commits a fresh copy and restores the original with a current backup', async () => {
    const { projects, upgrades } = await setup();
    const request = () => ({ projectId: projects.currentSession.projectId, toVersion: '1.1.0', expected: expected(projects), representativeSaves: [] });
    const first = value(await upgrades.plan(request()));
    const document = [...projects.currentSession.documents.values()].find(document => document.files['project.json']);
    const edit = value(projects.currentSession.planEdit({ origin: 'field', label: 'Rename', expected: expected(projects),
      patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data/name', before: 'Original', after: 'Edited', op: 'set' }] }], preparedAssets: [], requiredRefs: [] }));
    value(await projects.currentSession.applyEdit(edit.planId, expected(projects)));
    expect((await upgrades.commit(first.id)).ok).toBe(false);
    value(await projects.currentSession.save(value(projects.currentSession.planSave({ kind: 'all' })).planId));
    const second = value(await upgrades.plan(request())), sessionId = projects.currentSessionId;
    value(await upgrades.commit(second.id)); expect(projects.currentSessionId).toBe(sessionId);
    const upgraded = JSON.parse(await readFile(join(projects.currentRoot, 'project.json'), 'utf8')).data;
    expect(upgraded.engineVersion).toBe('1.1.0'); expect(upgraded.name).toBe('Edited converted');
    const restored = value(await upgrades.restore(second.id)); expect((await stat(restored.backup)).size).toBeGreaterThan(0);
    const original = JSON.parse(await readFile(join(projects.currentRoot, 'project.json'), 'utf8')).data;
    expect(original.engineVersion).toBe('0.1.0'); expect(original.name).toBe('Edited');
    await projects.close(projects.currentSessionId, 'discard');
  });
  it('reports a committed upgrade when writing its history fails after M02 commits', async () => {
    const { projects, upgrades } = await setup();
    const plan = value(await upgrades.plan({ projectId: projects.currentSession.projectId, toVersion: '1.1.0', expected: expected(projects), representativeSaves: [] }));
    const persist = upgrades.persist.bind(upgrades);
    upgrades.persist = record => record.state === 'committed' ? Promise.reject(new Error('disk full')) : persist(record);
    const receipt = await upgrades.commit(plan.id);
    expect(receipt.ok).toBe(true);
    expect(receipt.warnings.map(issue => issue.code)).toContain('UPGRADE_RECORD_WRITE');
    expect(JSON.parse(await readFile(join(projects.currentRoot, 'project.json'), 'utf8')).data.engineVersion).toBe('1.1.0');
    await projects.close(projects.currentSessionId, 'discard');
  });
  it('reports a restored project when writing its history fails after M02 restores', async () => {
    const { projects, upgrades } = await setup();
    const plan = value(await upgrades.plan({ projectId: projects.currentSession.projectId, toVersion: '1.1.0', expected: expected(projects), representativeSaves: [] }));
    value(await upgrades.commit(plan.id));
    const persist = upgrades.persist.bind(upgrades);
    upgrades.persist = record => record.state === 'restored' ? Promise.reject(new Error('disk full')) : persist(record);
    const receipt = await upgrades.restore(plan.id);
    expect(receipt.ok).toBe(true);
    expect(receipt.warnings.map(issue => issue.code)).toContain('UPGRADE_RECORD_WRITE');
    expect(JSON.parse(await readFile(join(projects.currentRoot, 'project.json'), 'utf8')).data.engineVersion).toBe('0.1.0');
    await projects.close(projects.currentSessionId, 'discard');
  });
});
