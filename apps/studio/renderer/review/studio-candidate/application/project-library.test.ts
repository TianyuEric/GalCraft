import { describe, expect, it, vi } from 'vitest';
import { candidateFixture } from '../../../stories/review/studio-candidate/fixtures.js';
import { authoringSource, documentData, type CandidateSeed } from './documents.js';
import { assertCandidateRestoreTarget, candidateDirectoryKey, candidateLibraryGroups, type CandidateProjectEntry } from './project-library.js';
import { createCandidateMaintenance } from './project-maintenance.js';
import { CandidateSession } from './session.js';

function changeDescription(seed: CandidateSeed, description: string) {
  const document = seed.documents.find(document => 'project.json' in document.files)!;
  const envelope = JSON.parse(document.files['project.json']!);
  envelope.data.description = description;
  document.files['project.json'] = JSON.stringify(envelope);
}

async function fixture() {
  const { seed, createServices } = candidateFixture();
  const session = new CandidateSession(seed, createServices);
  await session.open();
  const capture = (saved = false): CandidateSeed => ({
    ...structuredClone(seed),
    documents: session.host.list().map(document => saved ? { ...document, files: document.savedFiles, revision: document.savedRevision, dirty: false } : document),
    ui: structuredClone(session.getSnapshot().ui),
  });
  const addCopy = vi.fn<(seed: CandidateSeed, directory: string) => void>();
  const port = createCandidateMaintenance(session, { capture, addCopy, engineVersions: async () => ['0.1.0', '0.1.1'] });
  return { session, capture, port, addCopy };
}

describe('candidate project library', () => {
  it('keeps a single group per registration and recognizes path aliases', () => {
    const entry = (id: string, path: string, changed: Partial<CandidateProjectEntry> = {}): CandidateProjectEntry =>
      ({ id, path, name: id, opened: false, dirty: false, backup: false, ...changed });
    const pinned = entry('first', '/candidate/works/教学', { pinned: true });
    const recent = entry('third', '/candidate/works/教学乙', { lastOpenedAt: 3 });
    const old = entry('second', '/candidate/works/教学甲', { lastOpenedAt: 2 });
    expect(candidateLibraryGroups([old, pinned, recent, entry('hidden', '/candidate/works/教学丙', { registered: false })], '教学'))
      .toEqual({ pinned: [pinned], recent: [recent, old] });
    expect(candidateDirectoryKey(' D:\\GalCraft\\Work\\ ')).toBe(candidateDirectoryKey('d:/galcraft/work'));
    expect(() => candidateDirectoryKey('/candidate/works/../Other')).toThrow('完整作品目录');
    expect(() => assertCandidateRestoreTarget(pinned, { kind: 'replace', name: pinned.name, directory: pinned.path! }, {
      sourceId: pinned.id, targetId: recent.id, missingDependencies: [],
    })).toThrow('身份');
  });
});

describe('candidate maintenance', () => {
  it('keeps the original and the pending capture after a failed recovery, then commits the draft', async () => {
    const { session, capture, port } = await fixture();
    try {
      const recovery = capture();
      changeDescription(recovery, '上次草稿的描述');
      const scene = authoringSource(recovery.documents).scenes[0]!;
      recovery.ui.sourceDrafts[scene.sceneId] = scene.text + '\n// 尚未应用的源码\n';
      port.queueRecovery(recovery);
      port.failNext('recovery', '候选读取失败');
      expect(() => port.restoreRecovery()).toThrow('候选读取失败');
      expect(port.getSnapshot().recovery).toEqual({ files: 1, sourceDrafts: 1 });
      expect(authoringSource(session.host.list()).project.description).not.toBe('上次草稿的描述');
      port.restoreRecovery();
      expect(authoringSource(session.host.list()).project.description).toBe('上次草稿的描述');
      expect(session.getSnapshot().ui.sourceDrafts[scene.sceneId]).toContain('尚未应用');
      expect(port.getSnapshot().recovery).toBeNull();
    } finally { session.dispose(); }
  });

  it('requires review again after intervening edits and applies only the external files', async () => {
    const { session, capture, port } = await fixture();
    try {
      const external = capture(true);
      changeDescription(external, '外部修订');
      port.queueConflict(external);
      expect(port.getSnapshot().conflicts.map(conflict => conflict.path)).toEqual(['project.json']);
      const current = capture();
      changeDescription(current, '本地修订');
      port.queueRecovery(current);
      port.restoreRecovery();
      expect(() => port.resolveConflict('external')).toThrow('重新比较');
      expect(authoringSource(session.host.list()).project.description).toBe('本地修订');
      port.inspectConflict();
      port.failNext('conflict', '外部版本读取失败');
      expect(() => port.resolveConflict('external')).toThrow('读取失败');
      expect(port.getSnapshot().conflicts).toHaveLength(1);
      port.resolveConflict('external');
      expect(authoringSource(session.host.list()).project.description).toBe('外部修订');
      expect(port.getSnapshot().conflicts).toHaveLength(0);
      expect(session.host.list().find(document => 'project.json' in document.files)?.dirty).toBe(true);
    } finally { session.dispose(); }
  });

  it('validates a copy, keeps its plan on commit failure, and preserves the source engine after registering it', async () => {
    const { session, port, addCopy } = await fixture();
    try {
      const request = { engineVersion: '0.1.1', name: '迁移的新作品', directory: '/candidate/works/migrated' };
      await expect(port.prepareMigration({ ...request, engineVersion: '0.9.9' })).rejects.toThrow('引擎未就绪');
      await port.prepareMigration(request);
      const firstPlan = port.getSnapshot().migration!;
      expect(firstPlan.copyId).not.toBe(firstPlan.sourceId);
      port.rollbackMigration();
      expect(port.getSnapshot().migration).toBeNull();
      expect(addCopy).not.toHaveBeenCalled();
      await port.prepareMigration(request);
      port.failNext('migrationCommit', '候选登记失败');
      await expect(port.commitMigration()).rejects.toThrow('登记失败');
      expect(port.getSnapshot().migration).not.toBeNull();
      await port.commitMigration();
      const [copy, directory] = addCopy.mock.calls[0]!;
      expect(directory).toBe(request.directory);
      expect(authoringSource(copy.documents).project.engineVersion).toBe(request.engineVersion);
      expect(documentData<{ engine: { version: string } }>(copy.documents, 'dependencies.lock.json')?.engine.version).toBe(request.engineVersion);
      expect(authoringSource(session.host.list()).project.engineVersion).toBe('0.1.0');
      expect(port.getSnapshot().migration).toBeNull();
    } finally { session.dispose(); }
  });
});
