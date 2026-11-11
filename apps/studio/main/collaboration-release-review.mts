import { CollaborationError } from '@galcraft/collaboration';
import type { BuildInput, BuildReceipt, Id, Issue, Snapshot } from '@galcraft/contracts';
import { savedBuildVersions } from './build-saved-input.mts';

type SavedReview = Pick<BuildInput, 'snapshotId' | 'savedVersions'>;
type ReleaseSettings = Omit<BuildInput, 'projectId' | keyof SavedReview>;
type ReviewCompile = { current: boolean; snapshot: Pick<Snapshot, 'snapshotId'> | null; issues: Issue[] };

export class CollaborationReleaseReview {
  #checked = new Map<Id, SavedReview>();

  check(sessionId: Id, compiled: ReviewCompile, documents: Parameters<typeof savedBuildVersions>[0], dirtyIds: () => Id[]) {
    if (!compiled.current) {
      this.#checked.delete(sessionId);
      throw new CollaborationError('COMPILE_SUPERSEDED', 'A newer project compilation superseded this saved-snapshot check. Read the current project state and run galcraft_release check again. No release was prepared.');
    }
    const snapshotId = compiled.snapshot?.snapshotId ?? null;
    const savedVersions = savedBuildVersions(documents);
    const dirty = dirtyIds();
    if (snapshotId) this.#checked.set(sessionId, { snapshotId, savedVersions });
    else this.#checked.delete(sessionId);
    return { action: 'check' as const, snapshotId, savedVersions, dirty, issues: compiled.issues };
  }

  prepare(sessionId: Id, projectId: Id, settings: ReleaseSettings): BuildInput {
    const checked = this.#checked.get(sessionId);
    if (!checked) throw new CollaborationError('BUILD_SNAPSHOT_MISSING', 'Run galcraft_release check on the saved project first.');
    return { ...settings, projectId, ...checked };
  }

  forget(sessionIds: readonly Id[]) {
    for (const sessionId of sessionIds) this.#checked.delete(sessionId);
  }
}

export function releaseReceiptForProject(projectId: Id, receipt: BuildReceipt | null | undefined): BuildReceipt | null {
  return receipt?.projectId === projectId ? receipt : null;
}
