import { it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { AuthoringPreferences, ConnectionVault } from './preferences.mjs';
import { DefaultStudioPreferences } from '@galcraft/contracts';

it('restores each project’s asset tool state and exact preview versions alongside old workspace records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'galcraft-asset-workspace-'));
  try {
    const preferences = new AuthoringPreferences(directory);
    const legacy = { schemaVersion: 1, projectId: 'ProjBB', documentId: 'DocAAA', sceneId: 'SceneA', documentRevision: 2,
      view: 'script', caret: { statementId: null, field: null, offset: 0, documentOffset: 0 },
      previousStatementId: null, nextStatementId: null, scroll: { statementId: null, offsetPx: 0, scrollLeft: 0 },
      updatedAt: '2026-10-25T00:00:00.000Z', workbench: { documents: [], active: 'route:assets' } };
    const query = { kind: 'image', text: '雨站', offset: 80, limit: 40, folder: ['背景'], sort: 'modified', direction: 'desc', typeFields: { alpha: true } };
    const restored = { ...legacy, projectId: 'ProjAA', workbench: { documents: [{ id: 'asset:Art001', title: '雨站.png', kind: 'asset', objectId: 'Art001' }],
      active: 'asset:Art001', assets: { query, selectionQuery: { ...query, offset: 40 }, selectedIds: ['Art001', 'Art002'],
        selectionRevision: 4, primaryId: 'Art002', primaryVersions: [{ assetId: 'Art002', variantId: 'Ver002' }],
        previewVersions: [{ assetId: 'Art001', variantId: 'Ver001' }], inspectorPin: { assetId: 'Art001', variantId: 'Ver003' }, scroll: 370.5 } } };
    await preferences.writeWorkspace(legacy);
    await preferences.writeWorkspace(restored);
    const reopened = new AuthoringPreferences(directory);
    expect(await reopened.readWorkspace('ProjAA')).toEqual(restored);
    expect(await reopened.readWorkspace('ProjBB')).toEqual(legacy);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('restores actual uncommitted fields separately for desktop and browser entries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'galcraft-input-draft-'));
  try {
    const preferences = new AuthoringPreferences(directory);
    const draft = { schemaVersion: 1, projectId: 'ProjAA', entry: 'browser', updatedAt: '2026-10-25T00:00:00.000Z',
      content: { character: { name: '未应用的角色名', description: 'First line\nSecond line' }, scripts: { SceneA: 'say {text:"Draft"};' } } };
    await preferences.writeInputDraft(draft);
    expect(await new AuthoringPreferences(directory).readInputDraft({ projectId: 'ProjAA', entry: 'browser' })).toEqual(draft);
    expect(await preferences.readInputDraft({ projectId: 'ProjAA', entry: 'desktop' })).toBeNull();
    const first = { ...draft, clientId: 'ClienA', updatedAt: '2026-10-25T01:00:00.000Z', content: { name: 'First client' } };
    const second = { ...draft, clientId: 'ClienB', updatedAt: '2026-10-25T02:00:00.000Z', content: { name: 'Second client' } };
    await Promise.all([preferences.writeInputDraft(first), preferences.writeInputDraft(second)]);
    expect((await preferences.readInputDraft({ projectId: 'ProjAA', entry: 'browser', clientId: 'ClienA' })).content.name).toBe('First client');
    expect((await preferences.readInputDraft({ projectId: 'ProjAA', entry: 'browser', clientId: 'ClienB' })).content.name).toBe('Second client');
    expect((await preferences.readInputDraft({ projectId: 'ProjAA', entry: 'browser', clientId: 'ClienC' })).content.name).toBe('Second client');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it.each([undefined, 'neutral', 'blue'])('restores the blue palette for saved preference %s without changing other settings', async palette => {
  const directory = await mkdtemp(join(tmpdir(), 'galcraft-theme-'));
  try {
    const saved = { ...structuredClone(DefaultStudioPreferences), theme: 'dark', locale: 'ja', palette };
    const path = join(directory, 'preferences.json');
    await writeFile(path, JSON.stringify(saved));
    const preferences = new AuthoringPreferences(directory);
    expect(await preferences.readPreferences()).toEqual({ ...saved, palette: 'blue' });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ ...saved, palette: 'blue' });
    expect((await preferences.readPreferences()).palette).toBe('blue');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('preserves blank credentials and removes only unreferenced secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'galcraft-vault-'));
  const vault = new ConnectionVault(directory, { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString() });
  try {
    const id = randomUUID();
    await vault.save({ id, credentialId: null, name: 'first' }, 'fixture-secret');
    await vault.save({ id, credentialId: null, name: 'edited' });
    const original = await vault.read(id);
    expect(original.secret).toBe('fixture-secret');
    const copy = { ...original.config, id: randomUUID() };
    await vault.save(copy);
    await vault.remove(id);
    expect((await vault.read(copy.id)).secret).toBe('fixture-secret');
    const lastCredential = copy.credentialId;
    await vault.remove(copy.id);
    expect(await vault.credential(lastCredential)).toBeNull();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('editing a copied connection key leaves the original key intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'galcraft-vault-'));
  const vault = new ConnectionVault(directory, { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: bytes => bytes.toString() });
  try {
    const id = randomUUID(); await vault.save({ id, credentialId: null }, 'original');
    const source = await vault.read(id), copy = { ...source.config, id: randomUUID() };
    await vault.save(copy); await vault.save(copy, 'replacement');
    expect((await vault.read(id)).secret).toBe('original');
    expect((await vault.read(copy.id)).secret).toBe('replacement');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
