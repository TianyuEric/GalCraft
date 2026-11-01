import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WindowsPlayerStorage } from './storage.mjs';
import { WindowsPlayerHost } from './host.mjs';
import { PlayerDataService } from '@galcraft/player-ui/data';

const projectId = '11111111-1111-4111-8111-111111111111';
const otherProjectId = '22222222-2222-4222-8222-222222222222';
const domain = { projectId, kind: 'player', instance: 'default' };
const key = (suffix, owner = domain) =>
  `player/${owner.projectId}/${owner.kind}/${encodeURIComponent(owner.instance)}/${suffix}`;
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const created = [];

afterEach(async () => {
  for (const path of created.splice(0)) {
    if (!resolve(path).startsWith(resolve(tmpdir()) + sep)) throw new Error('Temporary storage path escaped the test directory');
    await rm(path, { recursive: true, force: true });
  }
});

describe('Windows Player storage', () => {
  it('opens and persists the M07 current main story through the actual disk provider', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galcraft-player-name-')); created.push(root);
    const create = () => new PlayerDataService({ target: 'windows', storage: new WindowsPlayerStorage(root) }, domain, 'zh-CN', 'ja');
    const data = create(); expect((await data.open()).ok).toBe(true);
    const current = { characterId: 'Hero01', variableId: 'Name01', effectiveName: '春', completed: true };
    expect((await data.saveCurrentMainStory(current)).ok).toBe(true);
    const reopened = create(); expect((await reopened.open()).ok).toBe(true);
    expect(reopened.current().currentMainStory).toEqual(current);
    expect((await reopened.clear(['saves'])).ok).toBe(true);
    const cleared = create(); expect((await cleared.open()).ok).toBe(true);
    expect(cleared.current().currentMainStory).toBeNull();
  });
  it('persists and reopens short project and save identities on the real Windows filesystem', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galcraft-player-short-')); created.push(root);
    const owner = { projectId: 'Proj01', kind: 'player', instance: 'default' }, recordId = 'Save01';
    const storage = new WindowsPlayerStorage(root);
    const batch = { domain: owner, expectedRevision: 0, writes: [
      { key: key(`records/${recordId}`, owner), bytes: bytes({ recordId }) },
      { key: key('index', owner), bytes: bytes({ recordId }) },
      { key: key('revision', owner), bytes: bytes(1) },
    ], deletes: [] };
    expect((await storage.commit(batch)).ok).toBe(true);
    const reopened = new WindowsPlayerStorage(root), saved = await reopened.read(key(`records/${recordId}`, owner));
    expect(saved.ok).toBe(true);
    expect(saved.value).toEqual(bytes({ recordId }));
  });
  it('commits a binary save batch, reopens it and rejects a stale batch unchanged', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galcraft-player-storage-')); created.push(root);
    const storage = new WindowsPlayerStorage(root);
    const host = new WindowsPlayerHost({ window: {}, dialog: {}, storageProvider: storage });
    const recordId = '33333333-3333-4333-8333-333333333333';
    const thumbnail = Uint8Array.from([0, 255, 12, 13]);
    const first = { domain, expectedRevision: 0, writes: [
      { key: key(`records/${recordId}`), bytes: bytes({ recordId }) },
      { key: key(`thumbnails/${recordId}`), bytes: thumbnail },
      { key: key('index'), bytes: bytes({ recordId }) },
      { key: key('revision'), bytes: bytes(1) },
    ], deletes: [] };
    expect((await host.call('storage', 'commit', first)).value.revision).toBe(1);
    const reopened = new WindowsPlayerStorage(root);
    expect((await reopened.read(key(`thumbnails/${recordId}`))).value).toEqual(thumbnail);
    expect(JSON.parse(new TextDecoder().decode((await reopened.read(key('index'))).value))).toEqual({ recordId });
    const stale = { ...first, writes: [{ key: key('revision'), bytes: bytes(1) },
      { key: key('index'), bytes: bytes({ recordId: 'stale' }) }] };
    expect((await reopened.commit(stale)).error.code).toBe('STORAGE_STALE');
    expect(JSON.parse(new TextDecoder().decode((await reopened.read(key('index'))).value))).toEqual({ recordId });
  });

  it('keeps player domains separate and rejects a cross-domain batch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galcraft-player-storage-')); created.push(root);
    const storage = new WindowsPlayerStorage(root);
    const second = { projectId: otherProjectId, kind: 'player', instance: 'default' };
    const batch = { domain, expectedRevision: 0, writes: [
      { key: key('preferences'), bytes: bytes({ volume: 70 }) },
      { key: key('revision'), bytes: bytes(1) },
    ], deletes: [] };
    expect((await storage.commit(batch)).ok).toBe(true);
    expect((await storage.read(key('preferences', second))).value).toBeNull();
    expect((await storage.commit({ ...batch, expectedRevision: 1, writes: [
      { key: key('revision'), bytes: bytes(2) },
      { key: key('preferences', second), bytes: bytes({ volume: 20 }) },
    ] })).error.code).toBe('STORAGE_DOMAIN');
    expect((await storage.read(key('revision'))).value).toEqual(bytes(1));
  });
});
