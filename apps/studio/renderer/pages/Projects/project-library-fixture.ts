import type { ProjectLibraryEntry, Result, StudioBridge } from '@galcraft/contracts';
import { FixtureIds, FixtureProject, fixtureId } from '@galcraft/contracts/fixtures';

const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
export function projectLibraryFixture(empty = false, currentId = FixtureProject.projectId): StudioBridge['projects'] {
  let entries: ProjectLibraryEntry[] = empty ? [] : [
    { projectId: currentId, directory: 'D:\\GalCraft\\春日来信', name: '春日来信', description: '在放映会开始以前，找到各自想要留下的故事。', engineVersion: '0.1.0', lastOpenedAt: '2026-10-01T09:30:00+08:00', pinned: true, status: 'available' },
    { projectId: fixtureId(0xe002), directory: 'D:\\GalCraft\\雨后的车站', name: '雨后的车站', description: '一段关于相遇、错过和重新出发的短篇。', engineVersion: '0.1.0', lastOpenedAt: '2026-09-30T18:15:00+08:00', pinned: false, status: 'available' },
    { projectId: fixtureId(0xe003), directory: 'E:\\作品备份\\漫长夏日与尚未寄出的信', name: '漫长夏日与尚未寄出的信', description: '', engineVersion: '0.1.0', lastOpenedAt: '2026-09-26T12:10:00+08:00', pinned: true, status: 'missing' },
    { projectId: fixtureId(0xe004), directory: 'D:\\GalCraft\\习作\\一小时的故事', name: '一小时的故事', description: '制作练习', engineVersion: '0.1.0', lastOpenedAt: null, pinned: false, status: 'available' },
  ];
  return {
    listRecent: async () => ok(structuredClone(entries)),
    setPinned: async ({ directory, pinned }) => { entries = entries.map(item => item.directory === directory ? { ...item, pinned } : item); return ok(undefined); },
    forget: async directory => { entries = entries.filter(item => item.directory !== directory); return ok(undefined); },
    relocate: async ({ directory, replacement }) => { const entry = entries.find(item => item.directory === directory)!; Object.assign(entry, { directory: replacement, status: 'available' }); return ok(undefined); },
    chooseDirectory: async () => ok('D:\\GalCraft\\已重新定位'),
    chooseBackupFile: async () => ok(null), supplyRestoreDependency: async () => ok(null),
    revealDirectory: async () => ok(undefined),
    inspect: async directory => ok(entries.find(item => item.directory === directory) ?? entries[0]!),
    open: async () => ok({ projectId: currentId, sessionId: FixtureIds.session }),
    switch: async () => ok({ projectId: currentId, sessionId: FixtureIds.session }),
    create: async () => ok({ projectId: currentId, sessionId: FixtureIds.session }),
    copy: async () => ok({ projectId: currentId, directory: entries[0]?.directory ?? '' }),
    close: async () => ok(undefined), backup: async () => ok(null),
  };
}
