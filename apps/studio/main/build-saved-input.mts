import { isDeepStrictEqual } from 'node:util';
import { LockSchema, type BuildInput, type Lock, type VersionRef } from '@galcraft/contracts';
import { sameSavedVersions } from '@galcraft/publishing/build';

type SavedDocument = { documentId: string; revision: number; files: Record<string, string> };

export function savedBuildVersions(documents: readonly SavedDocument[]): VersionRef[] {
  return documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }));
}

export function matchesSavedBuild(documents: readonly SavedDocument[], input: BuildInput, lock: Lock): boolean {
  if (!sameSavedVersions(savedBuildVersions(documents), input.savedVersions)) return false;
  const path = 'dependencies.lock.json';
  const source = documents.find(document => Object.hasOwn(document.files, path))?.files[path];
  if (!source) return false;
  try {
    const parsed = LockSchema.safeParse(JSON.parse(source).data);
    return parsed.success && isDeepStrictEqual(parsed.data, lock);
  } catch {
    return false;
  }
}
