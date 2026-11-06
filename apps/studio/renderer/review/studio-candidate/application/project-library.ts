export type CandidateCreationRequest = {
  name: string;
  template: 'light' | 'standard' | 'rich';
  width: number;
  height: number;
  engineVersion: string;
  directory: string;
};

export type CandidateProjectEntry = {
  id: string;
  name: string;
  dirty: boolean;
  opened: boolean;
  backup: boolean;
  path?: string;
  pathStatus?: 'available' | 'missing';
  pinned?: boolean;
  lastOpenedAt?: number;
  registered?: boolean;
};

export type CandidateRestoreTarget = { kind: 'replace' | 'copy'; directory: string; name: string };
export type CandidateRestoreCheck = { sourceId: string; targetId?: string; missingDependencies: readonly string[] };

/** Candidate host accepts absolute Windows and virtual browser paths. */
export function candidateDirectoryKey(directory: string): string {
  const raw = directory.trim().replace(/\\/g, '/');
  const unc = raw.startsWith('//');
  const path = (unc ? '/' : '') + raw.replace(/\/{2,}/g, '/').replace(/\/$/, '');
  if (!/^(?:[a-z]:\/|\/)/i.test(path) || path === '/' || /(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) {
    throw new Error('请输入完整作品目录，目录须包含文件夹名称。');
  }
  if (unc && path.split('/').length < 5) {
    throw new Error('请选择驱动器或共享位置下的文件夹。');
  }
  return unc || /^[a-z]:\//i.test(path) ? path.toLowerCase() : path;
}

export function candidateLibraryGroups(entries: readonly CandidateProjectEntry[], search: string) {
  const query = search.trim().toLocaleLowerCase();
  const found = entries.filter(entry => entry.registered !== false &&
    (!query || entry.name.toLocaleLowerCase().includes(query) || entry.path?.toLocaleLowerCase().includes(query)));
  return {
    pinned: found.filter(entry => entry.pinned),
    recent: found.filter(entry => !entry.pinned).sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0)),
  };
}

export function assertCandidateRestoreTarget(source: CandidateProjectEntry, target: CandidateRestoreTarget, check: CandidateRestoreCheck) {
  if (check.sourceId !== source.id) throw new Error('备份身份已变化，请重新选择备份。');
  if (target.kind === 'replace' && check.targetId !== source.id) throw new Error('恢复目标身份与备份不一致，请修复原作品路径或选择新副本。');
  if (target.kind === 'copy' && check.targetId) throw new Error('目标已有作品，请选择新的副本目录。');
}
