import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startStudioService } from '../apps/studio/service/server.mjs';
import { createNodeStudioHost } from '../apps/studio/service/host.mjs';
import { attachPracticeSourceNotices } from '../apps/studio/main/practice-expansion.mjs';
import { compileCollaborationProject } from '../apps/studio/main/collaboration-compile.mjs';
import { refreshPracticePresentation } from '../apps/studio/main/practice-project.mjs';

// Restore the distributed saved backup without changing its identity, then let
// the actual M11 consumers produce both releases from one compiled snapshot.
const backup = resolve(process.argv[2] ?? 'out/samples/galcraft-tutorial-0.1.0.galproject');
const output = resolve(process.argv[3] ?? 'out/samples/release');
const userData = join(output, 'profile');
await mkdir(output, { recursive: true });
const unwrap = result => { assert(result.ok, JSON.stringify(result)); return result.value; };
const assembly = await startStudioService({ userData, createHost: createNodeStudioHost, frontendDirectory: resolve('apps/studio/dist') });
try {
  // Development startup refreshes bundled versions; install an explicitly selected
  // engine after startup so it remains the M11 input for this delivery.
  if (process.argv[4]) await cp(resolve(process.argv[4]), join(userData, 'engines/0.1.0'), { recursive: true });
  const { host } = assembly;
  const plan = unwrap(await host.backups.prepareRestore({ packagePath: backup, destination: join(output, 'source'), identity: 'restoreOriginal', collision: 'newDirectory' }));
  assert.equal(plan.missing.filter(issue => issue.severity === 'error').length, 0);
  const restored = unwrap(await host.backups.commitRestore(plan.operationDirectory));
  assert.equal(restored.projectId, plan.manifest.projectId);
  unwrap(await host.projects.open(restored.directory));
  let session = host.projects.currentSession;
  await refreshPracticePresentation(host.projects, host.assets);
  const indexDocument = [...session.documents.values()].find(document => document.files['assets/index.json']);
  const beforeIndex = JSON.parse(indexDocument.files['assets/index.json']).data, nextIndex = structuredClone(beforeIndex);
  await attachPracticeSourceNotices(nextIndex, restored.directory, resolve('apps/studio/resources/practice'));
  const expected = [{ ref: { kind: 'document', id: indexDocument.documentId }, revision: indexDocument.revision }];
  const edit = unwrap(session.planEdit({ label: 'Carry sample source and license notices', origin: 'batch', expected, preparedAssets: [], requiredRefs: [], patches: [{ kind: 'json', documentId: indexDocument.documentId, changes: [{ path: '/data', op: 'set', before: beforeIndex, after: nextIndex }] }] }));
  unwrap(session.applyEdit(edit.planId, expected));
  for (const target of ['web', 'windows']) {
    const checked = unwrap(await host.assets.verifyTarget(target));
    assert.equal(checked.issues.filter(issue => issue.severity === 'error').length, 0, JSON.stringify(checked.issues));
  }
  unwrap(await session.save(unwrap(session.planSave({ kind: 'all' })).planId));
  unwrap(await host.backups.createBackup({ source: 'saved', destination: backup }));
  // Reopen the saved projection so compilation uses its persisted document revisions.
  unwrap(await host.projects.close(host.projects.currentSessionId, 'save'));
  unwrap(await host.projects.open(restored.directory));
  session = host.projects.currentSession;
  const compiled = await compileCollaborationProject({ production: host.production, plugins: host.plugins }, session, { publish: true });
  assert(compiled.snapshot); assert.equal(compiled.issues.filter(issue => issue.severity === 'error').length, 0);
  const snapshot = compiled.snapshot;
  await writeFile(join(output, 'saved-snapshot.json'), JSON.stringify(snapshot, null, 2));
  const savedVersions = await session.withSavedSnapshot(async documents => documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })));
  const receipts = [];
  for (const target of ['web', 'windows']) {
    const planned = unwrap(await host.builds.planBuild({ projectId: session.projectId, target, outputDirectory: join(output, target), releaseVersion: snapshot.project.releaseVersion,
      snapshotId: snapshot.snapshotId, savedVersions, keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [], windowsSigning: { mode: 'unsigned' } }));
    assert.equal(planned.issues.filter(issue => issue.severity === 'error').length, 0, JSON.stringify(planned.issues));
    console.log(`Building spring sample ${target}`);
    receipts.push({ target, receipt: unwrap(await host.builds.build(planned.planId)) });
  }
  const report = { result: 'passed', executedAt: new Date().toISOString(), backup, source: restored.directory, projectId: session.projectId, snapshotId: snapshot.snapshotId, receipts };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await assembly.close(); }
