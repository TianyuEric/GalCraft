import { LockSchema, ProjectSchema, type DocumentView, type EditInput, type Patch } from '@galcraft/contracts';
import { compile } from '@galcraft/dsl';
import { compileInput } from '../../../authoring/bridge.js';
import { authoringSource, copyCandidateIdentity, documentData, type CandidateSeed } from './documents.js';
import { candidateDirectoryKey } from './project-library.js';
import type { CandidateSession } from './session.js';

type Change = {
  documentId: string;
  path: string;
  base: string | null;
  working: string | null;
  incoming: string | null;
};

type MigrationRequest = { engineVersion: string; name: string; directory: string };
type MigrationPlan = {
  request: MigrationRequest;
  sourceEngine: string;
  sourceId: string;
  copyId: string;
  documents: number;
};

type Snapshot = {
  recovery: { files: number; sourceDrafts: number } | null;
  conflicts: readonly Change[];
  migration: MigrationPlan | null;
};

type Action = 'recovery' | 'conflict' | 'migrationCheck' | 'migrationCommit';

export type CandidateMaintenancePort = ReturnType<typeof createCandidateMaintenance>;

function filesMatch(left: string | null, right: string | null, path: string) {
  if (left === right) return true;
  if (!left || !right || !path.endsWith('.json')) return false;
  const a = JSON.parse(left), b = JSON.parse(right);
  if (a?.documentId && a.schemaVersion === 1) delete a.revision;
  if (b?.documentId && b.schemaVersion === 1) delete b.revision;
  return JSON.stringify(a) === JSON.stringify(b);
}

function compare(base: readonly DocumentView[], working: readonly DocumentView[], incoming: readonly DocumentView[]): Change[] {
  const index = (docs: readonly DocumentView[]) => new Map(docs.map(document => [document.documentId, document.files]));
  const original = index(base), local = index(working), remote = index(incoming);
  return [...new Set([...original.keys(), ...remote.keys()])].flatMap(documentId => {
    const left = original.get(documentId) ?? {}, current = local.get(documentId) ?? {}, right = remote.get(documentId) ?? {};
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap(path => {
      const a = left[path] ?? null, b = right[path] ?? null, working = current[path] ?? null;
      return filesMatch(a, b, path) || filesMatch(working, b, path) ? [] : [{ documentId, path, base: a, working, incoming: b }];
    });
  });
}

function savedDocuments(documents: readonly DocumentView[]): DocumentView[] {
  return documents.map(document => ({ ...document, files: document.savedFiles, revision: document.savedRevision }));
}

function documentImage(document: Pick<DocumentView, 'format' | 'files'>) {
  return { format: document.format, files: document.files };
}

function changeInput(label: string, changes: readonly Change[], current: DocumentView[], incoming: DocumentView[]): EditInput {
  const patches: Patch[] = [];
  const expected: EditInput['expected'] = [];
  for (const documentId of new Set(changes.map(change => change.documentId))) {
    const document = current.find(item => item.documentId === documentId);
    const incomingDocument = incoming.find(item => item.documentId === documentId);
    const files = { ...document?.files };
    for (const change of changes.filter(item => item.documentId === documentId)) {
      if (!filesMatch(files[change.path] ?? null, change.working, change.path)) throw new Error('工作内容已变化，请重新比较。');
      if (change.incoming === null) delete files[change.path];
      else files[change.path] = change.incoming;
    }
    if (document) {
      expected.push({ ref: { kind: 'document', id: documentId }, revision: document.revision });
      if (Object.keys(document.files).length) patches.push({ kind: 'document', op: 'delete', documentId, before: documentImage(document), after: null });
    }
    if (Object.keys(files).length) {
      const format = document?.format ?? incomingDocument?.format;
      if (!format) throw new Error('恢复内容缺少文档格式。');
      patches.push({ kind: 'document', op: 'create', documentId, before: null, after: documentImage({ format, files }) });
    }
  }
  return { label, origin: 'candidate', expected, patches, preparedAssets: [], requiredRefs: [] };
}

function updateVersion(seed: CandidateSeed, path: string, change: (data: Record<string, unknown>) => void) {
  const document = seed.documents.find(document => path in document.files);
  if (!document) throw new Error('迁移副本缺少 ' + path);
  const envelope = JSON.parse(document.files[path]!);
  change(envelope.data);
  document.files[path] = JSON.stringify(envelope, null, 2) + '\n';
  document.savedFiles[path] = document.files[path]!;
}

/** Memory-host operations use the same authoring session as the workface. Frozen inputs stay private until explicitly applied. */
export function createCandidateMaintenance(session: CandidateSession, host: {
  capture(saved?: boolean): CandidateSeed;
  addCopy(seed: CandidateSeed, directory: string): void | Promise<void>;
  engineVersions?(): Promise<readonly string[]>;
}) {
  const projectId = authoringSource(session.host.list()).project.projectId;
  const listeners = new Set<() => void>();
  const nextFailure = new Map<Action, string>();
  let snapshot: Snapshot = { recovery: null, conflicts: [], migration: null };
  let recovery: CandidateSeed | null = null;
  let external: { base: DocumentView[]; incoming: DocumentView[] } | null = null;
  let migration: { seed: CandidateSeed; plan: MigrationPlan; sourceVersions: string } | null = null;

  const publish = (next: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };
  const failIfQueued = (action: Action) => {
    const error = nextFailure.get(action);
    nextFailure.delete(action);
    if (error) throw new Error(error);
  };
  const assertIdentity = (seed: CandidateSeed) => {
    if (authoringSource(seed.documents).project.projectId !== projectId) throw new Error('恢复内容属于另一份作品。');
  };
  const listEngines = async () => {
    if (host.engineVersions) return host.engineVersions();
    const versions = await session.services.bridge.engines?.listCreationVersions();
    if (!versions) return [];
    if (!versions.ok) throw new Error(versions.error.message);
    return versions.value;
  };
  const sourceVersions = () => JSON.stringify(session.host.list().map(({ documentId, revision, savedRevision }) => [documentId, revision, savedRevision]));
  const apply = (label: string, changes: readonly Change[], current: DocumentView[], incoming: DocumentView[]) => {
    if (!changes.length) return;
    const input = changeInput(label, changes, current, incoming);
    session.host.endEditGroup();
    const result = session.host.commit(input);
    if (!result.ok) throw new Error(result.error.message);
    session.refreshFromHost();
  };
  function inspectConflict() {
    const changes = external ? compare(external.base, session.host.list(), external.incoming) : [];
    publish({ conflicts: changes });
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    currentEngine: () => authoringSource(session.host.list()).project.engineVersion,
    projectName: () => authoringSource(session.host.list()).project.name,
    listEngines,
    queueRecovery(seed: CandidateSeed) {
      assertIdentity(seed);
      recovery = structuredClone(seed);
      const drafts = Object.keys(seed.ui.sourceDrafts).length;
      const files = compare(savedDocuments(seed.documents), savedDocuments(seed.documents), seed.documents).length;
      publish({ recovery: { sourceDrafts: drafts, files } });
    },
    restoreRecovery() {
      if (!recovery) throw new Error('恢复草稿已不存在。');
      failIfQueued('recovery');
      const current = session.host.list();
      const changes = compare(savedDocuments(recovery.documents), current, recovery.documents);
      const conflicts = changes.filter(change => !filesMatch(change.working, change.base, change.path));
      const drafts = Object.entries(recovery.ui.sourceDrafts);
      const local = session.getSnapshot().ui.sourceDrafts;
      if (conflicts.length || drafts.some(([scene, text]) => local[scene] !== undefined && local[scene] !== text)) {
        throw new Error('当前作品存在不同的工作内容。先处理当前修改，再恢复草稿。');
      }
      const scenes = authoringSource(recovery.documents).scenes;
      for (const [sceneId] of drafts) {
        const incoming = scenes.find(scene => scene.sceneId === sceneId);
        const actual = session.sceneSource(sceneId);
        const base = incoming && recovery.documents.find(document => document.documentId === incoming.documentId)?.savedFiles['scenes/' + sceneId + '/script.gal'];
        if (!incoming || (actual && actual.text !== base && actual.text !== incoming.text)) throw new Error('源码草稿的工作基线已变化，请先处理当前修改。');
      }
      apply('恢复候选草稿', changes, current, recovery.documents);
      for (const [scene, text] of drafts) session.sourceDraft(scene, text);
      recovery = null;
      publish({ recovery: null });
    },
    discardRecovery() { recovery = null; publish({ recovery: null }); },
    queueConflict(seed: CandidateSeed) {
      assertIdentity(seed);
      external = { base: savedDocuments(session.host.list()), incoming: structuredClone(seed.documents) };
      inspectConflict();
    },
    inspectConflict,
    resolveConflict(choice: 'working' | 'external') {
      if (!external || !snapshot.conflicts.length) throw new Error('没有待处理的外部修改。');
      failIfQueued('conflict');
      const current = session.host.list();
      const latest = compare(external.base, current, external.incoming);
      if (JSON.stringify(latest) !== JSON.stringify(snapshot.conflicts)) throw new Error('比较内容已变化，请重新比较。');
      if (choice === 'external') {
        const drafts = session.getSnapshot().ui.sourceDrafts;
        if (latest.some(change => change.path.endsWith('/script.gal') && drafts[change.path.split('/')[1]!] !== undefined)) {
          throw new Error('受影响场景还有未应用源码，请处理草稿后重新比较。');
        }
        apply('采用候选外部版本', latest, current, external.incoming);
      }
      external = null;
      publish({ conflicts: [] });
    },
    async prepareMigration(request: MigrationRequest) {
      migration = null;
      publish({ migration: null });
      const directory = request.directory.trim(), name = request.name.trim();
      candidateDirectoryKey(directory);
      if (!name) throw new Error('请输入迁移副本名称。');
      failIfQueued('migrationCheck');
      if (!(await listEngines()).includes(request.engineVersion)) throw new Error('目标引擎未就绪，请检查可用版本。');
      const sourceVersionsAtCheck = sourceVersions();
      const source = session.getSnapshot();
      if (source.dirty || source.pendingViews.length || Object.keys(source.ui.sourceDrafts).length) throw new Error('先保存作品并处理未应用输入，再准备迁移。');
      const original = host.capture(true), sourceEngine = authoringSource(original.documents).project.engineVersion;
      if (sourceEngine === request.engineVersion) throw new Error('请选择与当前作品不同的引擎版本。');
      const seed = copyCandidateIdentity(original, name);
      updateVersion(seed, 'project.json', data => { data.engineVersion = request.engineVersion; ProjectSchema.parse(data); });
      updateVersion(seed, 'dependencies.lock.json', data => {
        data.engine = { ...(data.engine as Record<string, unknown>), version: request.engineVersion };
        LockSchema.parse(data);
      });
      const lock = LockSchema.parse(documentData(seed.documents, 'dependencies.lock.json'));
      if (lock.engine.version !== authoringSource(seed.documents).project.engineVersion) throw new Error('迁移副本的作品与依赖引擎不一致。');
      const input = compileInput(seed.documents);
      if (!input.ok) throw new Error(input.error.message);
      const compiled = compile(input.value);
      if (!compiled.snapshot) throw new Error(compiled.issues.map(issue => issue.message).join('；') || '迁移副本未通过编译。');
      const plan = { request: { ...request, name, directory }, sourceEngine, sourceId: projectId, copyId: seed.presentation.id, documents: seed.documents.length };
      migration = { seed, plan, sourceVersions: sourceVersionsAtCheck };
      publish({ migration: plan });
    },
    async commitMigration() {
      if (!migration) throw new Error('请先准备并验证迁移副本。');
      const prepared = migration;
      failIfQueued('migrationCommit');
      if (!(await listEngines()).includes(prepared.plan.request.engineVersion)) throw new Error('目标引擎已变化，请重新检查。');
      const source = session.getSnapshot();
      if (sourceVersions() !== prepared.sourceVersions || source.pendingViews.length || Object.keys(source.ui.sourceDrafts).length) {
        throw new Error('原作品在检查后已变化，请重新准备迁移。');
      }
      await host.addCopy(structuredClone(prepared.seed), prepared.plan.request.directory);
      migration = null;
      publish({ migration: null });
      return prepared.plan;
    },
    rollbackMigration() { migration = null; publish({ migration: null }); },
    failNext(action: Action, message: string) { nextFailure.set(action, message); },
  };
}
