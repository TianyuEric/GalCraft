import { expect, it } from 'vitest';
import type { BuildInput, BuildReceipt } from '@galcraft/contracts';
import { CollaborationReleaseReview, releaseReceiptForProject } from './collaboration-release-review.mts';

const settings = {
  target: 'web', outputDirectory: 'release', releaseVersion: '0.1.1', keepAssets: [], platformPolicy: {},
  font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [],
} satisfies Omit<BuildInput, 'projectId' | 'snapshotId' | 'savedVersions'>;

it('prepares only from the current collaboration session and forgets deleted sessions', () => {
  const review = new CollaborationReleaseReview();
  const documents = [{ documentId: 'Proj01', revision: 2, files: {} }];
  const compiled = { current: true, snapshot: { snapshotId: 'Saved1' }, issues: [] };
  const first = review.check('Round1', compiled, documents, () => ['Draft1']);
  expect(first.dirty).toEqual(['Draft1']);
  expect(() => review.prepare('Round2', 'Work01', settings)).toThrow(expect.objectContaining({ code: 'BUILD_SNAPSHOT_MISSING' }));

  review.check('Round2', { ...compiled, snapshot: { snapshotId: 'Saved2' } }, documents, () => []);
  review.forget(['Round1']);
  expect(() => review.prepare('Round1', 'Work01', settings)).toThrow(expect.objectContaining({ code: 'BUILD_SNAPSHOT_MISSING' }));
  expect(review.prepare('Round2', 'Work01', settings)).toMatchObject({
    projectId: 'Work01', snapshotId: 'Saved2', savedVersions: [{ ref: { kind: 'document', id: 'Proj01' }, revision: 2 }],
  });
});

it('returns only a receipt belonging to the open project', () => {
  const receipt: BuildReceipt = {
    projectId: 'Work01', releaseVersion: '0.1.1', target: 'web', outputDirectory: 'release', entry: 'index.html',
    handoff: { path: 'release', kind: 'directory' }, instructionsPath: 'README.html',
    localTest: { result: 'notExecuted', evidencePaths: [] },
  };
  expect(releaseReceiptForProject('Work01', receipt)).toBe(receipt);
  expect(releaseReceiptForProject('Work02', receipt)).toBeNull();
  expect(releaseReceiptForProject('Work01', null)).toBeNull();
});
