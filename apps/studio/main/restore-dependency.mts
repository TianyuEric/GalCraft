import { cp, mkdir, mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { LockSchema, normalizeProjectAuthoringData, ProjectSchema } from '@galcraft/contracts';
import type { Dependency, Issue } from '@galcraft/contracts';
import type { ProjectSession } from '@galcraft/documents';
import { EngineManifestSchema, type EngineCatalog } from '@galcraft/publishing/engine';

export function dependencyIssue(issue: Issue, dependency: Dependency): Issue {
  const { kind, id, version } = dependency;
  const details = issue.details;
  return { ...issue, details: { ...(details && typeof details === 'object' && !Array.isArray(details) ? details : {}), dependency: { kind, id, version } } };
}

export function savedProjectEngine(session: ProjectSession) {
  const saved = (path: string) => {
    const source = [...session.documents.values()].find(document => Object.hasOwn(document.savedFiles, path))?.savedFiles[path];
    if (!source) throw new Error(`找不到作品文件 ${path}`);
    return JSON.parse(source).data;
  };
  return {
    project: ProjectSchema.parse(normalizeProjectAuthoringData(saved('project.json'))),
    lock: LockSchema.parse(saved('dependencies.lock.json')),
  };
}

export async function checkProjectEngine(catalog: EngineCatalog, session: ProjectSession) {
  const { project, lock } = savedProjectEngine(session);
  const engine = await catalog.resolveProjectEngine(project, lock, 'web');
  const issues = engine.ok ? [] : engine.issues.map(issue => dependencyIssue(issue, lock.engine));
  session.writeBlocked = issues.find(issue => issue.severity === 'error') ?? null;
  return { version: lock.engine.version, issues };
}

export async function installRestoreEngine(catalog: EngineCatalog, dependency: Dependency, source: string, replaceInvalid = false): Promise<void> {
  const manifest = EngineManifestSchema.parse(JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8')));
  if (manifest.id !== dependency.id || manifest.version !== dependency.version)
    throw new Error(`请选择 ${dependency.id}@${dependency.version} 的精确依赖目录`);
  if (!manifest.targets.includes('web')) throw new Error('恢复作品需要包含 Web 创作与预览能力的精确引擎包');
  const destination = join(catalog.directory, dependency.version);
  await mkdir(dirname(destination), { recursive: true });
  const staging = await mkdtemp(join(dirname(destination), '.restore-engine-'));
  const previous = join(staging, 'previous');
  let moved = false, keepPrevious = false;
  try {
    const copied = join(staging, 'engine');
    await cp(source, copied, { recursive: true, errorOnExist: true, force: false });
    for (const file of manifest.files) {
      const actual = await stat(join(copied, file.path));
      if (!actual.isFile() || actual.size !== file.size) throw new Error(`引擎文件与清单不符：${file.path}`);
    }
    const exists = await stat(destination).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (exists) {
      if (!replaceInvalid || (await catalog.resolveEngine(dependency.version, 'web')).ok)
        throw new Error(`本机依赖目录已存在，请检查该目录后重新检查恢复：${destination}`);
      await rename(destination, previous);
      moved = true;
    }
    await rename(copied, destination);
  } catch (error) {
    if (moved) {
      try { await rename(previous, destination); }
      catch (rollback) {
        keepPrevious = true;
        throw new AggregateError([error, rollback], `原引擎目录仍保留在 ${previous}`);
      }
    }
    throw error;
  } finally {
    if (!keepPrevious) await rm(staging, { recursive: true, force: true });
  }
  const installed = await catalog.resolveEngine(dependency.version, 'web');
  if (!installed.ok) throw new Error(installed.error.message);
}
