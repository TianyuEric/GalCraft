import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createNodeStudioHost } from '../../apps/studio/service/host.mjs';
import { startStudioService } from '../../apps/studio/service/server.mjs';
import { compileCollaborationProject } from '../../apps/studio/main/collaboration-compile.mjs';
import { ensureProjectFixture } from './project-fixture.mjs';
import { prepareResults, prepareWorkspace, removeWorkspace, checkEvidenceBudget } from './workspace.mjs';

const releaseTargets = process.argv.slice(2);
assert(releaseTargets.every(target => ['web', 'windows'].includes(target)), 'Usage: node tests/e2e/project-backup-release.mjs [web] [windows]');
const work = await prepareWorkspace('project-backup-release');
const output = await prepareResults('project-backup-release');
const project = await ensureProjectFixture(join(work, 'source'));
const original = JSON.parse(await readFile(join(project, 'project.json'), 'utf8')).data;
const value = result => { assert(result.ok, JSON.stringify(result)); return result.value; };
let assembly;
const report = { result: 'failed', checks: [], targets: [] };
try {
  assembly = await startStudioService({ userData: join(work, 'profile'), createHost: createNodeStudioHost, frontendDirectory: resolve('apps/studio/dist') });
  const { host } = assembly;
  value(await host.projects.open(project));
  const backup = join(work, 'project.galproject');
  value(await host.backups.createBackup({ source: 'saved', destination: backup }));
  assert((await stat(backup)).size > 0);
  const plan = value(await host.backups.prepareRestore({ packagePath: backup, destination: join(work, 'restored'), identity: 'copyNew', collision: 'newDirectory' }));
  assert(!plan.missing.some(issue => issue.severity === 'error'), JSON.stringify(plan.missing));
  const restored = value(await host.backups.commitRestore(plan.operationDirectory));
  assert.notEqual(restored.projectId, original.projectId);
  value(await host.projects.close(host.projects.currentSessionId, 'save'));
  value(await host.projects.open(restored.directory));
  let session = host.projects.currentSession;
  const compile = async () => {
    const result = await compileCollaborationProject({ production: host.production, plugins: host.plugins }, session, { publish: true });
    assert(result.snapshot && !result.issues.some(issue => issue.severity === 'error'), JSON.stringify(result.issues));
    return result.snapshot;
  };
  const snapshot = await compile();
  assert.equal(snapshot.projectId, restored.projectId);
  assert.equal(snapshot.scenes.length, 2);
  const assets = JSON.parse([...session.documents.values()].find(document => document.files['assets/index.json']).files['assets/index.json']).data.assets;
  for (const asset of assets) for (const variant of asset.variants) for (const file of variant.files) {
    assert.equal((await stat(join(restored.directory, 'assets/files', asset.id, variant.id, file.path))).size, file.bytes);
  }
  report.checks.push('Saved backup restores a new project identity with exact dependencies, authored media and compilable scenes');
  const settings = [...session.documents.values()].find(document => document.files['project.json']);
  const before = JSON.parse(settings.files['project.json']).data.description;
  const after = `${before} Independent restored edit.`;
  const expected = [{ ref: { kind: 'document', id: settings.documentId }, revision: settings.revision }];
  const edit = value(session.planEdit({ label: 'Edit restored copy', origin: 'field', expected, preparedAssets: [], requiredRefs: [], patches: [{ kind: 'json', documentId: settings.documentId, changes: [{ path: '/data/description', op: 'set', before, after }] }] }));
  value(session.applyEdit(edit.planId, expected));
  value(await session.save(value(session.planSave({ kind: 'all' })).planId));
  value(await host.projects.close(host.projects.currentSessionId, 'save'));
  value(await host.projects.open(restored.directory)); session = host.projects.currentSession;
  const reopened = JSON.parse([...session.documents.values()].find(document => document.files['project.json']).files['project.json']).data;
  assert.equal(reopened.description, after);
  assert.equal(JSON.parse(await readFile(join(project, 'project.json'), 'utf8')).data.description, before);
  report.checks.push('Independent copy saves and reopens its edit while the source remains unchanged');
  for (const target of releaseTargets) {
    const checked = value(await host.assets.verifyTarget(target));
    assert(!checked.issues.some(issue => issue.severity === 'error'), JSON.stringify(checked.issues));
  }
  if (releaseTargets.length) value(await session.save(value(session.planSave({ kind: 'all' })).planId));
  const savedSnapshot = await compile();
  const savedVersions = await session.withSavedSnapshot(async documents => documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })));
  for (const target of releaseTargets) {
    const directory = join(work, 'releases', target);
    const planned = value(await host.builds.planBuild({ projectId: session.projectId, target, outputDirectory: directory, releaseVersion: savedSnapshot.project.releaseVersion,
      snapshotId: savedSnapshot.snapshotId, savedVersions, keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [], windowsSigning: { mode: 'unsigned' } }));
    assert(!planned.issues.some(issue => issue.severity === 'error'), JSON.stringify(planned.issues));
    const receipt = value(await host.builds.build(planned.planId));
    const manifest = JSON.parse(await readFile(join(directory, 'release.manifest.json'), 'utf8'));
    const actualSnapshot = JSON.parse(await readFile(join(directory, manifest.snapshot), 'utf8'));
    assert.equal(manifest.projectId, restored.projectId);
    assert.equal(manifest.version, receipt.releaseVersion);
    assert.equal(manifest.version, actualSnapshot.releaseVersion);
    for (const file of manifest.files) assert.equal((await stat(join(directory, file.path))).size, file.size);
    report.targets.push({ target, files: manifest.files.length, releaseVersion: manifest.version, localTest: receipt.localTest });
  }
  report.result = 'passed';
} catch (error) { report.error = error.stack ?? String(error); throw error; }
finally {
  await assembly?.close();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  await removeWorkspace(work);
  await checkEvidenceBudget();
}
console.log(JSON.stringify(report));
