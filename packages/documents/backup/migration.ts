import { mkdir, readFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createId, legacyIdPattern, type Id, type RestoreReceipt } from '@galcraft/contracts';
import { ProjectSession } from '@galcraft/documents';
import { enumerateIdentities, rewriteDocuments, rewriteProjectPath } from './identity.js';
import { exists, listFiles, put, removeOwned, under } from './files.js';
import { projectData, validateProject } from './validation.js';
import type { BackupProviders } from './types.js';

export type LegacyMigrationReceipt = RestoreReceipt & {
  sourceProjectId: Id; backupDirectory: string; idMap: Record<Id, Id>;
};

/** Offline migration retains short identities, author text and an intact original directory. */
export async function migrateLegacyProject(directory: string, providers: BackupProviders): Promise<LegacyMigrationReceipt | null> {
  const root = resolve(directory);
  if (providers.openSession?.(root)) throw new Error('迁移前须保存并关闭作品');
  if (await exists(join(root, '.galcraft/recovery/draft.json'))) throw new Error('迁移前须处理作品恢复草稿');
  const sourceProjectId = JSON.parse(await readFile(join(root, 'project.json'), 'utf8')).data.projectId;
  const source = await ProjectSession.open(root, sourceProjectId);
  let documents;
  try { documents = [...source.documents.values()]; }
  finally { await source.dispose('saved'); }
  const { project, lock } = projectData(documents);
  const dependencies = await providers.validateDependencies(project, lock, '', documents);
  if (dependencies.some(issue => issue.severity === 'error')) throw new Error(dependencies.map(issue => issue.message).join('; '));
  const idMap = enumerateIdentities(documents, providers, id => legacyIdPattern.test(id));
  if (!Object.keys(idMap).length) return null;
  const projectId = idMap[sourceProjectId] ?? sourceProjectId;
  const operationId = createId(documents), staging = `${root}.short-ids-${operationId}.tmp`, backupDirectory = `${root}.before-short-ids-${operationId}`;
  const registryBefore = await providers.registry.capture();
  let moved = false, installed = false, cleanup = true;
  try {
    const rewritten = rewriteDocuments(documents, idMap, providers, project.engineVersion);
    await mkdir(staging);
    // Copy non-document assets byte-for-byte while moving their identity path segments.
    const documentPaths = new Set(documents.flatMap(document => Object.keys(document.files)));
    for (const path of await listFiles(root)) {
      if (!documentPaths.has(path)) await put(under(staging, rewriteProjectPath(path, idMap)), await readFile(under(root, path)));
    }
    for (const document of rewritten) for (const [path, text] of Object.entries(document.files)) await put(under(staging, path), text);
    const staged = await ProjectSession.open(staging, projectId);
    try {
      const current = [...staged.documents.values()];
      const issues = await validateProject(staging, current, providers);
      if (issues.some(issue => issue.severity === 'error')) throw new Error(issues.map(issue => issue.message).join('; '));
      if (Object.keys(enumerateIdentities(current, providers, id => legacyIdPattern.test(id))).length) throw new Error('迁移后仍有旧业务身份');
    } finally { await staged.dispose('saved'); }
    // Keep the original namespace available until disk validation and registration finish.
    await rename(root, backupDirectory); moved = true;
    await rename(staging, root); installed = true;
    const receipt: LegacyMigrationReceipt = { sourceProjectId, projectId, directory: root, backupDirectory, idMap, identity: 'copyNew',
      readiness: { projectId, editing: 'editable', playtest: 'unchecked', publish: 'unchecked', generation: [], issues: [] } };
    await providers.registry.register(receipt);
    return receipt;
  } catch (error) {
    cleanup = false;
    if (installed) await rename(root, staging);
    if (moved) await rename(backupDirectory, root);
    await providers.registry.restore(registryBefore);
    cleanup = true;
    throw error;
  } finally { if (cleanup) await removeOwned(dirname(root), staging); }
}
