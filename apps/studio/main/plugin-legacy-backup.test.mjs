import { afterAll, beforeAll, expect, it } from 'vitest';
import { appendFileSync, existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixtureId, FixtureCharacters, FixtureLock, FixtureProject, FixtureScenes } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { compile, parse } from '@galcraft/dsl';
import { createOfficialTemplate, createTemplateDocuments, readTemplateDocuments } from '@galcraft/templates';
import { StudioBackups } from './backup-providers.mjs';

const root = resolve(import.meta.dirname, '../../../tmp/testing/plugin-development/runtime/legacy-backup');
const evidence = resolve(import.meta.dirname, '../../../test-results/latest/plugin-development/legacy-backup.json');
const pluginId = 'org.example.legacy-backup', command = `${pluginId}/visit`;
const sceneId = FixtureScenes[0].id, characterId = FixtureCharacters[0].id, statementId = fixtureId(0xda4);
const records = [], fixtures = [];
const value = result => { if (!result.ok) throw new Error(JSON.stringify(result)); return result.value; };
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data });
const document = (documentId, path, data) => ({ documentId, revision: 1, format: 'json', files: { [path]: envelope(documentId, data) } });
const field = (path, refKind) => ({ path, label: path, description: path, type: 'ref', refKind, required: true,
  nullable: false, default: null, unit: 'none', group: 'basic', summary: true, keywords: [] });
const spec = { key: command, version: '0.1.0', name: '旧运行指令', description: '角色与场景引用', icon: 'visit', category: 'plugin',
  keywords: [], fields: [field('characterId', 'character'), field('sceneId', 'scene')], continuation: 'continue', skippable: false,
  executor: pluginId, targetCapabilities: [], constraints: [] };

beforeAll(async () => { await rm(root, { recursive: true, force: true }); });
afterAll(async () => {
  for (const fixture of fixtures) { await fixture.backups.plugins.dispose(); await fixture.session.dispose('saved'); }
  await mkdir(resolve(evidence, '..'), { recursive: true });
  await writeFile(evidence, JSON.stringify({ result: records.length === 5 ? 'pass' : 'incomplete',
    environment: { runtime: process.version, disk: root, temp: process.env.TEMP },
    evidence: fixtures.map(fixture => ({ directory: fixture.directory, lifecycle: fixture.eventsPath })), records }, null, 2));
});

async function setup(name, definition = false, legacyDocument = false) {
  const directory = join(root, name), userData = join(directory, 'user-data'), source = join(directory, 'source-plugin');
  const eventsPath = join(directory, 'events.jsonl');
  const files = {
    'helpers.mjs': `export const emit = (log, event, extra = {}) => log({ code: 'TEST_LIFECYCLE', severity: 'warning', owner: 'M09',
      message: JSON.stringify({ event, directory: import.meta.dirname, ...extra }), related: [], actions: [] });`,
    'runtime.mjs': definition ? 'throw new Error("backup imported runtime");' : `import { emit } from './helpers.mjs';
      const spec = ${JSON.stringify(spec)};
      export function createPlugin() {
        let active = false, log;
        return {
          async activate(context) {
            active = true; log = context.log; emit(log, 'activate', { domain: context.domain.kind, target: context.target });
            if (context.domain.kind !== 'sample' || context.documents.propose({}).ok) throw new Error('backup context must be read-only sample');
            if (!context.documents.read({ kind: 'document', id: ${JSON.stringify(fixtureId(0xda1))} }).ok) throw new Error('saved project must be readable');
            context.onDispose(() => emit(log, 'dispose', { aborted: context.signal.aborted }));
            if (context.config.failActivation) throw new Error('activation rejected');
            return { commands: [{ get spec() {
              if (!active) throw new Error('command lease ended during backup');
              emit(log, 'spec'); return spec;
            }, execute: async () => { throw new Error('backup executed runtime'); } }] };
          },
          async deactivate() { active = false; emit(log, 'deactivate'); }
        };
      }`,
    ...(definition ? { 'definition.mjs': `export const definition = { commands: [${JSON.stringify(spec)}] };`,
      'services.mjs': 'throw new Error("backup imported services");', 'editor.mjs': 'throw new Error("backup imported editor");' }
      : legacyDocument ? { 'editor.mjs': 'throw new Error("backup imported legacy document editor");' } : {}),
  };
  await mkdir(source, { recursive: true });
  for (const [path, content] of Object.entries(files)) await writeFile(join(source, path), content);
  await writeFile(join(source, 'manifest.json'), JSON.stringify({ schemaVersion: definition ? 2 : 1, id: pluginId, version: '0.1.0',
    name: 'Legacy backup test', description: '', author: 'GalCraft test', license: 'MIT', homepage: null, engineRange: '^0.1.0', sdkMajor: 0,
    targets: ['web', 'windows'], dependencies: [], entry: { runtime: 'runtime.mjs', editor: definition || legacyDocument ? 'editor.mjs' : null,
      ...(definition ? { definition: 'definition.mjs', services: 'services.mjs' } : {}) },
    files: Object.entries(files).map(([path, content]) => ({ path, size: Buffer.byteLength(content) })),
    contributions: [{ kind: 'command', key: command, targets: ['web', 'windows'], required: true },
      ...(legacyDocument ? [{ kind: 'document', key: `${pluginId}/config`, targets: ['web', 'windows'], required: true }] : [])],
    stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] }));
  const template = createOfficialTemplate({ kind: 'standard' }), projectRoot = join(directory, 'project');
  const project = { ...FixtureProject, chapters: [{ ...FixtureProject.chapters[0], sceneIds: [sceneId] }] };
  const lock = { ...FixtureLock, template: { ...FixtureLock.template, id: template.id, version: template.version },
    plugins: [{ kind: 'plugin', id: pluginId, version: '0.1.0', targets: ['web', 'windows'], required: true }] };
  const session = await ProjectSession.createProject(projectRoot, project.projectId, [
    document(fixtureId(0xda1), 'project.json', project), document(fixtureId(0xda2), 'dependencies.lock.json', lock),
    document(fixtureId(0xda3), 'assets/index.json', { assets: [] }), document(fixtureId(0xda5), `characters/${characterId}.json`, FixtureCharacters[0]),
    { documentId: fixtureId(0xda6), revision: 1, format: 'dsl', files: {
      [`scenes/${sceneId}/scene.json`]: envelope(fixtureId(0xda6), FixtureScenes[0]),
      [`scenes/${sceneId}/script.gal`]: `${command} {characterId:"${characterId}",sceneId:"${sceneId}"} @${statementId};\nend {} @${fixtureId(0xda7)};`,
    } }, ...createTemplateDocuments(template),
  ]);
  const projects = { currentSession: session, currentRoot: projectRoot }, backups = new StudioBackups({ userData, projects,
    engineCatalog: { resolveProjectEngine: async () => ({ ok: true, value: {}, warnings: [] }) },
    officialPackages: definition ? { [pluginId]: { '0.1.0': source } } : {} });
  value(await backups.plugins.install({ kind: 'directory', path: source }));
  const fixture = { directory, session, backups, projectRoot, eventsPath, failActivation: false, packagePath: join(directory, 'work.galproject'),
    installed: join(userData, 'plugins', pluginId, '0.1.0'), project, lock };
  const context = backups.pluginContext;
  backups.pluginContext = (id, target) => ({ ...context(id, target), config: { failActivation: fixture.failActivation }, log: issue => {
    const entry = JSON.parse(issue.message); expect(existsSync(entry.directory)).toBe(true);
    appendFileSync(eventsPath, JSON.stringify(entry) + '\n');
  } });
  fixtures.push(fixture); return fixture;
}

async function events(fixture) { return (await readFile(fixture.eventsPath, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
async function released(fixture) {
  const log = await events(fixture), activations = log.filter(item => item.event === 'activate');
  expect(log.filter(item => item.event === 'deactivate')).toHaveLength(activations.length);
  expect(log.filter(item => item.event === 'dispose')).toHaveLength(activations.length);
  expect(log.filter(item => item.event === 'dispose').every(item => item.aborted)).toBe(true);
  expect(await readdir(join(fixture.installed, '.galcraft-load')).catch(() => [])).toEqual([]);
  for (const item of log) expect(existsSync(item.directory)).toBe(false);
  return log;
}

async function compiledCopy(directory, projectId, expected) {
  const reopened = await ProjectSession.open(directory, projectId);
  try {
    const documents = [...reopened.documents.values()], files = Object.assign({}, ...documents.map(document => document.files));
    const data = path => JSON.parse(files[path]).data, sceneDocument = documents.find(document => document.format === 'dsl');
    const scene = data(Object.keys(sceneDocument.files).find(path => path.endsWith('/scene.json')));
    const text = Object.entries(sceneDocument.files).find(([path]) => path.endsWith('/script.gal'))[1];
    const result = compile({ projectId, project: data('project.json'), lock: data('dependencies.lock.json'), engineVersion: '0.1.0',
      documents: [{ documentId: sceneDocument.documentId, revision: sceneDocument.revision, kind: 'scene', sceneId: scene.id, text }],
      scenes: [scene], characters: [data(Object.keys(files).find(path => path.startsWith('characters/')))], variables: [], assets: [], gallery: [], flows: [],
      template: readTemplateDocuments(documents), pluginCommands: [spec], cancelOperationId: fixtureId(0xda8) });
    expect(result.issues.filter(item => item.severity === 'error')).toEqual([]); expect(result.snapshot).not.toBeNull();
    const parsed = parse({ documentId: sceneDocument.documentId, revision: sceneDocument.revision, text });
    const visit = parsed.cst.find(item => item.command === command);
    expect(visit.object.value).toEqual({ characterId: expected.characterId, sceneId: expected.sceneId });
    expect(visit.id).toBe(expected.statementId); expect(scene.id).toBe(expected.sceneId);
    return { projectId, sceneId: scene.id, statementId: visit.id, args: visit.object.value };
  } finally { await reopened.dispose('saved'); }
}

it('backs up and restores legacy runtime commands, and copyNew rewrites their internal IDs on real disk', async () => {
  const fixture = await setup('success'), { backups, packagePath } = fixture;
  value(await backups.createBackup({ source: 'saved', destination: packagePath })); await released(fixture);
  const plan = value(await backups.prepareRestore({ packagePath, destination: join(fixture.directory, 'copy'), identity: 'copyNew', collision: 'newDirectory' }));
  expect(plan.missing).toEqual([]); await released(fixture);
  const copied = value(await backups.commitRestore(plan.operationDirectory)); await released(fixture);
  const copiedResult = await compiledCopy(copied.directory, copied.projectId, { characterId: plan.idMap[characterId], sceneId: plan.idMap[sceneId], statementId: plan.idMap[statementId] });
  expect(copied.projectId).not.toBe(fixture.project.projectId);
  const originalPlan = value(await backups.prepareRestore({ packagePath, destination: join(fixture.directory, 'restored'), identity: 'restoreOriginal', collision: 'newDirectory' }));
  expect(originalPlan.missing).toEqual([]);
  const original = value(await backups.commitRestore(originalPlan.operationDirectory)); await released(fixture);
  await compiledCopy(original.directory, original.projectId, { characterId, sceneId, statementId });
  const currentCopy = value(await backups.copyCurrentProject()); await released(fixture);
  expect(currentCopy.projectId).not.toBe(fixture.project.projectId);
  const log = await events(fixture); expect(log.some(item => item.event === 'spec')).toBe(true);
  records.push({ target: 'PD-T08 legacy runtime backup/copyNew/restoreOriginal/copyCurrentProject', data: 'schemaVersion 1 runtime-only custom command with character/scene references',
    expected: 'saved command compiles; copies rewrite project, scene, character and statement IDs; original restoration preserves IDs; all leases deactivate and remove load graphs',
    actual: { copied: copiedResult, restored: original.projectId, currentCopy: currentCopy.projectId, activations: log.filter(item => item.event === 'activate').length }, result: 'pass' });
}, 60000); // Executes saved backup, two restores and a copy through real plugin graphs and disk.

it('releases the runtime instance and load graph when activation fails', async () => {
  const fixture = await setup('activation-failure'); fixture.failActivation = true;
  const result = await fixture.backups.createBackup({ source: 'saved', destination: fixture.packagePath });
  expect(result.ok).toBe(false); expect(result.error.code).toBe('PLUGIN_DEFINITION');
  const log = await released(fixture); expect(log.filter(item => item.event === 'activate')).toHaveLength(1);
  records.push({ target: 'PD-T08 legacy activation failure cleanup', data: 'runtime activate throws after registering disposal', expected: 'backup fails and deactivation, disposal and graph removal complete', actual: result.error.code, result: 'pass' });
});

it('holds the legacy lease through commit and releases it when destination registration fails', async () => {
  const fixture = await setup('commit-failure'), { backups, packagePath } = fixture;
  value(await backups.createBackup({ source: 'saved', destination: packagePath }));
  const plan = value(await backups.prepareRestore({ packagePath, destination: join(fixture.directory, 'copy'), identity: 'copyNew', collision: 'newDirectory' }));
  expect(plan.missing).toEqual([]);
  let heldAtRegistration = false;
  backups.projectLibrary.register = async () => {
    const log = await events(fixture), latest = log.filter(item => item.event === 'activate').at(-1);
    heldAtRegistration = existsSync(latest.directory); expect(heldAtRegistration).toBe(true);
    throw new Error('destination registration failed');
  };
  const result = await backups.commitRestore(plan.operationDirectory); expect(result.ok).toBe(false);
  await released(fixture); expect(heldAtRegistration).toBe(true);
  records.push({ target: 'PD-T08 legacy commit failure cleanup', data: 'registry registration rejects after real staging and identity rewriting', expected: 'lease stays active until commit finishes and releases on failure', actual: { error: result.error.code, heldAtRegistration }, result: 'pass' });
}, 30_000);

it('releases legacy leases from the direct upgrade consumer on commit failure', async () => {
  const fixture = await setup('upgrade-failure'), candidate = join(fixture.directory, 'upgrade');
  await cp(fixture.projectRoot, candidate, { recursive: true, filter: path => resolve(path) !== resolve(fixture.projectRoot, '.galcraft') });
  const versions = [...fixture.session.documents.values()].map(item => ({ ref: { kind: 'document', id: item.documentId }, revision: item.revision }));
  fixture.backups.projectLibrary.register = async () => { throw new Error('upgrade registration failed'); };
  const result = await fixture.backups.service.commitUpgrade(fixture.session, { directory: candidate, expected: { working: versions, saved: versions } });
  expect(result.ok).toBe(false); const log = await released(fixture);
  expect(log.filter(item => item.event === 'activate')).toHaveLength(1); expect(log.some(item => item.event === 'spec')).toBe(true);
  records.push({ target: 'PD-T08 direct upgrade consumer failure cleanup', data: 'real saved upgrade candidate with legacy runtime command; registry rejects commit',
    expected: 'upgrade failure releases runtime instance and load graph', actual: result.error.code, result: 'pass' });
});

it('uses only the definition entry for current packages and keeps legacy author-document warnings', async () => {
  const current = await setup('definition-only', true);
  const manifest = value(await current.backups.createBackup({ source: 'saved', destination: current.packagePath }));
  expect(manifest.files.some(item => item.path.includes('/.galcraft-load/'))).toBe(false);
  expect(await events(current)).toEqual([]); await released(current);
  const legacy = await setup('legacy-document', false, true);
  const issues = await legacy.backups.service.providers.validateDependencies(legacy.project, legacy.lock, '', [...legacy.session.documents.values()]);
  expect(issues).toContainEqual(expect.objectContaining({ code: 'PLUGIN_DEFINITION_LEGACY', severity: 'warning' }));
  await legacy.backups.plugins.dispose(); await released(legacy);
  records.push({ target: 'PD-T08 definition isolation and legacy document restriction', data: 'v2 definition with throwing runtime/editor/services entries; v1 author document without definition',
    expected: 'definition-only backup succeeds without UI/service imports; legacy document conversion warning remains; dispose releases legacy lease', actual: issues.map(item => item.code), result: 'pass' });
});
