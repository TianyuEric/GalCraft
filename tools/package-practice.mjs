import { mkdir, mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createNodeStudioHost } from '../apps/studio/service/host.mjs';
import { populatePracticeProject } from '../apps/studio/main/practice-project.mjs';
import { compileCollaborationProject } from '../apps/studio/main/collaboration-compile.mjs';
import { components } from '@galcraft/templates';
import { studioVersion } from '../apps/studio/main/studio-version.mjs';
import { bundledEngineVersion } from '../apps/studio/main/bundled-engine-version.mjs';

const repo = resolve(import.meta.dirname, '..'), verifyOnly = process.argv.includes('--verify-only');
const output = resolve(process.argv.slice(2).find(argument => argument !== '--verify-only') ?? join(repo, `out/samples/galcraft-tutorial-${studioVersion}.galproject`));
if (!verifyOnly && await stat(output).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }))
  throw new Error('Tutorial packaging requires a new destination; existing backups are preserved.');
await mkdir(join(repo, 'tmp/testing'), { recursive: true }); await mkdir(dirname(output), { recursive: true });
const work = await mkdtemp(join(repo, 'tmp/testing/sample-package-'));
const unwrap = result => { if (!result.ok) throw new Error(JSON.stringify(result.issues)); return result.value; };
let assembly;
try {
  assembly = await createNodeStudioHost({ userData: join(work, 'profile'), origin: 'http://127.0.0.1:1', requestDialog: async () => ({ canceled: true, filePaths: [] }) });
  const { host } = assembly;
  let manifest;
  if (!verifyOnly) {
    unwrap(await host.projects.create({ path: work, name: '今晚，让春天亮起来', template: 'sample', width: 1920, height: 1080, engineVersion: bundledEngineVersion }));
    await populatePracticeProject(host.projects, host.assets, undefined, host.plugins);
    const session = host.projects.currentSession;
    const document = [...session.documents.values()].find(document => document.files['project.json']);
    const project = JSON.parse(document.files['project.json']).data;
    if (project.releaseVersion !== studioVersion) {
      const expected = [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }];
      const edit = unwrap(session.planEdit({ label: 'Set tutorial release version', origin: 'batch', expected, preparedAssets: [], requiredRefs: [],
        patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data/releaseVersion', op: 'set', before: project.releaseVersion, after: studioVersion }] }] }));
      unwrap(session.applyEdit(edit.planId, expected));
    }
    unwrap(await session.save(unwrap(session.planSave({ kind: 'all' })).planId));
    manifest = unwrap(await host.backups.createBackup({ source: 'saved', destination: output }));
  }
  const plan = unwrap(await host.backups.prepareRestore({ packagePath: output, destination: join(work, 'independent-copy'), identity: 'copyNew', collision: 'newDirectory' }));
  if (plan.missing.some(issue => issue.severity === 'error')) throw new Error(JSON.stringify(plan.missing));
  const restored = unwrap(await host.backups.commitRestore(plan.operationDirectory));
  manifest ??= plan.manifest;
  if (restored.projectId === manifest.projectId) throw new Error('Tutorial copy retained the original project identity.');
  const project = JSON.parse(await readFile(join(restored.directory, 'project.json'), 'utf8')).data;
  if (project.release?.executableName !== 'example.exe' || project.release?.windowsSigning !== 'unsigned' || typeof project.release?.publisher !== 'string' || !project.display.icon)
    throw new Error('The tutorial work branding is incomplete.');
  const lock = JSON.parse(await readFile(join(restored.directory, 'dependencies.lock.json'), 'utf8')).data;
  if (project.engineVersion !== bundledEngineVersion || lock.engine.version !== bundledEngineVersion || manifest.engineVersion !== bundledEngineVersion ||
    project.releaseVersion !== studioVersion || manifest.releaseVersion !== studioVersion)
    throw new Error('Tutorial Project, Lock and backup must use the current release and exact bundled engine.');
  if (lock.plugins.some(plugin => plugin.id === 'org.galcraft.affection')) throw new Error('The tutorial still requires the optional affection example.');
  if (host.projects.currentSession) unwrap(await host.projects.close(host.projects.currentSessionId, 'save'));
  unwrap(await host.projects.open(restored.directory));
  const copySession = host.projects.currentSession;
  const compiled = await compileCollaborationProject({ production: host.production, plugins: host.plugins }, copySession);
  if (!compiled.snapshot || compiled.issues.some(issue => issue.severity === 'error')) throw new Error(JSON.stringify(compiled.issues));
  const snapshot = compiled.snapshot;
  if (snapshot.engineVersion !== bundledEngineVersion || snapshot.lock.engine.version !== bundledEngineVersion || snapshot.releaseVersion !== studioVersion)
    throw new Error('The restored tutorial snapshot has an incorrect release or engine binding.');
  const icon = snapshot.assets.find(asset => asset.assetId === project.display.icon);
  if (!icon || icon.kind !== 'image') throw new Error('The restored tutorial icon is missing from its resource closure.');
  if (snapshot.template.pages.some(page => page.key === 'relations') ||
    snapshot.template.pages.filter(page => page.key === 'story').some(page => components(page.root).some(component => component.bindings?.text?.source === 'variable')) ||
    snapshot.variables.some(variable => variable.scope === 'progress' && variable.type === 'number')) throw new Error('The tutorial still contains its relationship demonstration.');
  const viewpoint = snapshot.characters.find(character => character.narrativeRole === 'viewpoint');
  if (snapshot.characters.length !== 4 || !viewpoint || viewpoint.name !== '玩家' || viewpoint.avatar !== null || viewpoint.groups.length || viewpoint.differences.length || Object.keys(viewpoint.voicePresets).length || viewpoint.defaultVoicing !== 'intentionalSilent') throw new Error('The tutorial viewpoint must be silent and have no visual or voice presets.');
  if (snapshot.project.player.name?.characterId !== viewpoint.id || snapshot.project.player.name?.maxLength !== 8 || snapshot.project.player.name?.promptPolicy !== 'firstAndAfterCompletion') throw new Error('The tutorial protagonist name configuration is incomplete.');
  const characterDifferences = snapshot.characters.filter(character => character.narrativeRole === 'main').map(character => ({ name: character.name, count: character.differences.length,
    initial: character.differences.find(difference => difference.id === character.initialDifferenceId)?.name,
    cropAvatars: character.differences.filter(difference => difference.avatar?.kind === 'crop' && difference.figure?.assetId && difference.figure?.variantId).length }));
  if (characterDifferences.length !== 3 || characterDifferences.some(character => character.count !== 6 || character.cropAvatars !== 6 || character.initial !== '日常')) throw new Error('The tutorial common figure/avatar differences are incomplete.');
  const document = [...copySession.documents.values()].find(document => document.files['project.json']);
  const expected = [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }];
  const edit = unwrap(copySession.planEdit({ label: '编辑独立教学副本', origin: 'field', expected, preparedAssets: [], requiredRefs: [],
    patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data/description', op: 'set', before: project.description, after: '独立教学样例副本。' }] }] }));
  unwrap(copySession.applyEdit(edit.planId, expected)); unwrap(await copySession.save(unwrap(copySession.planSave({ kind: 'all' })).planId));
  unwrap(await host.projects.close(host.projects.currentSessionId, 'save')); unwrap(await host.projects.open(restored.directory));
  const reopened = JSON.parse([...host.projects.currentSession.documents.values()].find(document => document.files['project.json']).files['project.json']).data;
  if (reopened.description !== '独立教学样例副本。') throw new Error('The restored tutorial edit did not survive reopen.');
  if (reopened.display.icon !== project.display.icon || JSON.stringify(reopened.release) !== JSON.stringify(project.release)) throw new Error('Tutorial branding did not survive save and reopen.');
  const reopenedLock = JSON.parse([...host.projects.currentSession.documents.values()].find(document => document.files['dependencies.lock.json']).files['dependencies.lock.json']).data;
  if (reopened.engineVersion !== bundledEngineVersion || reopenedLock.engine.version !== bundledEngineVersion || reopened.releaseVersion !== studioVersion)
    throw new Error('Tutorial release and engine binding did not survive save and reopen.');
  const report = { result: 'passed', packagePath: output, bytes: (await stat(output)).size, originalProjectId: manifest.projectId, copiedProjectId: restored.projectId,
    studioVersion, releaseVersion: reopened.releaseVersion, engineVersion: reopened.engineVersion,
    savedDocuments: manifest.documents.length, files: manifest.files.length, projectName: project.name, dependencies: lock.plugins.map(({ id, version }) => ({ id, version })),
    branding: { iconAssetId: project.display.icon, ...project.release }, characterDifferences,
    checks: ['M02 saved backup', 'M02 copyNew restore', 'new project identity', 'exact dependencies', 'Project/Lock/backup/snapshot release and engine bindings', 'restored copy compiles', 'independent edit saves and reopens', 'work icon and release identity survive restore/save/reopen', 'relationship demonstration removed', 'silent viewpoint and protagonist name configuration', 'three route characters with six common figure/avatar differences'], executedAt: new Date().toISOString() };
  await writeFile(`${output}.report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await assembly?.close(); await rm(work, { recursive: true, force: true }); }
