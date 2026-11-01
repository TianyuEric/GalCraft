import { describe, expect, it } from 'vitest';
import { configEdit, configIssues, configPath, contextPreview, createDefinition, parseConfig, pluginMetadata, type AiEpilogueConfig } from './index.js';
import type { DocumentView, Json } from '@galcraft/contracts';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ProjectSession } from '@galcraft/documents';
const characterId = '00000000-0000-4000-8000-000000000001', entryId = '00000000-0000-4000-8000-000000000002';
const config: AiEpilogueConfig = { entries: [{ id: entryId, characterId, title: '杏的夏日', characterSetting: '喜欢雨天的杏',
  startingPoint: '路线完结后的暑假', publicFacts: ['已经共同旅行'], interactionRules: '聊暑假计划', endingCondition: '约定明天见', unlockEndingIds: ['an-ending'], assetIds: [] }] };
const view = (id: string, path: string, data: unknown, revision = 1): DocumentView => ({ documentId: id, revision, savedRevision: 1,
  format: 'json', dirty: revision !== 1, savedFiles: {}, files: { [path]: JSON.stringify({ schemaVersion: 1, documentId: id, revision, data }) } });
const characters = [view(characterId,`characters/${characterId}.json`, { id: characterId, name: '杏', description: '不得发送的秘密设定',
  narrativeRole: 'main', personalRoute: { endingIds: ['an-ending'] } })];
describe('AI afterstory author configuration', () => {
  it('provides a DOM-free definition that validates and rewrites declared author references', () => {
    const document = createDefinition().documents![0]!;
    expect(pluginMetadata.schemaVersion).toBe(2); expect(pluginMetadata.entry.definition).toBe('definition/index.js');
    expect(document.validate!({ entries: [] }).ok).toBe(true);
    expect(document.validate!({ entries: [{}] }).ok).toBe(false);
    expect(document.collectReferences(config as unknown as Json)).toContainEqual({ kind: 'character', id: characterId });
    expect(document.rewriteReferences(config as unknown as Json, { [characterId]: 'CharBB', [entryId]: 'EntryB' })).toMatchObject({
      ok: true, value: { entries: [{ id: 'EntryB', characterId: 'CharBB', title: '杏的夏日' }] },
    });
  });
  it('builds an M02 create/edit plan with the config revision and reference-source revisions', () => {
    const created = configEdit(characters,config); expect(created.patches[0]).toMatchObject({ kind: 'document', op: 'create', before: null });
    expect(created.patches[0]!.documentId).toMatch(/^[A-Za-z0-9]{6}$/);
    const doc = view(entryId,configPath,config,4), next = structuredClone(config); next.entries[0]!.title = '新标题';
    const edited = configEdit([...characters,doc],next); expect(edited.expected).toContainEqual({ ref: { kind: 'document', id: entryId }, revision: 4 });
    expect(edited.patches[0]).toMatchObject({ kind: 'json', changes: [{ path:'/data',before:config,after:next,op:'set' }] });
    expect(config.entries[0]!.title).toBe('杏的夏日');
  });
  it('rejects role, unlock and removed-asset conflicts before committing', () => {
    const supporting = view(characterId,`characters/${characterId}.json`, { id:characterId,narrativeRole:'supporting' });
    expect(() => configEdit([supporting],config)).toThrow('主角色');
    const changed = structuredClone(config); changed.entries[0]!.unlockEndingIds = ['missing-ending']; expect(() => configEdit(characters,changed)).toThrow('解锁结局');
    changed.entries[0]!.unlockEndingIds = ['an-ending']; changed.entries[0]!.assetIds = [entryId]; expect(() => configEdit(characters,changed)).toThrow('素材已移除');
    expect(() => parseConfig({entries:[config.entries[0],config.entries[0]]})).toThrow('每位主角色');
  });
  it('previews only explicitly permitted fields and defines separate Studio contribution placements', () => {
    const preview = contextPreview(characters,config,entryId); expect(preview.character.setting).toBe('喜欢雨天的杏');
    expect(JSON.stringify(preview)).not.toContain('不得发送的秘密设定'); expect(preview.allowedFacts).toEqual(['已经共同旅行']);
    expect(pluginMetadata.entry.runtime).toBeNull(); expect(pluginMetadata.studio?.map(item => item.kind)).toEqual(['workbench','panel','dialog']);
  });
  it('reports missing references as individual field blockers and allows a local repair without replacing the entry', () => {
    const changed = structuredClone(config); changed.entries[0]!.unlockEndingIds.push('removed-ending'); changed.entries[0]!.assetIds = [entryId];
    expect(configIssues(changed, 'en', characters)).toEqual(expect.arrayContaining([
      expect.objectContaining({ entryId, field: 'unlockEndingIds' }), expect.objectContaining({ entryId, field: 'assetIds' }),
    ]));
    changed.entries[0]!.unlockEndingIds.splice(1, 1); changed.entries[0]!.assetIds.splice(0, 1);
    const edit = configEdit(characters, changed); expect(edit.patches).toHaveLength(1); expect(changed.entries[0]!.id).toBe(entryId);
  });
  it.each(['en', 'ja'])('uses the active %s locale for field, identity, reference and preview errors', locale => {
    const changed = structuredClone(config); changed.entries[0]!.characterSetting = ''; changed.entries[0]!.assetIds = [entryId]; changed.entries[0]!.unlockEndingIds = [];
    const issues = configIssues(changed, locale, characters); expect(issues.map(issue => issue.field)).toEqual(expect.arrayContaining(['characterSetting', 'assetIds', 'unlockEndingIds']));
    expect(issues.some(issue => /请|后日谈|素材已移除|身份无效/.test(issue.message))).toBe(false);
    expect(() => configEdit(characters, changed, locale)).toThrow(issues[0]!.message);
    expect(() => contextPreview(characters, { entries: [] }, undefined, locale)).toThrow(locale === 'en' ? 'Create an AI afterstory entry first.' : 'AI アフターストーリーの入口を作成してください。');
  });
  it('applies through real M02, saves and reopens the same authored identity and permission scope', async () => {
    const parent = resolve('test-results/latest/ai-epilogue-config'); await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(join(parent, 'project-')), root = join(directory, 'work'); const sessions: ProjectSession[] = [];
    try {
      const session = await ProjectSession.createProject(root, characterId, characters.map(({ documentId, revision, format, files }) => ({ documentId, revision, format, files }))); sessions.push(session);
      const input = configEdit([...session.documents.values()], config), plan = session.planEdit(input); expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      const result = session.applyEdit(plan.value.planId, input.expected); expect(result.ok).toBe(true);
      const document = [...session.documents.values()].find(document => configPath in document.files)!; expect(document.dirty).toBe(true);
      expect(parseConfig(JSON.parse(document.files[configPath]!).data)).toEqual(config);
      const save = session.planSave({ kind: 'all' }); expect(save.ok).toBe(true); if (!save.ok) return;
      expect((await session.save(save.value.planId)).ok).toBe(true);
      const disk = parseConfig(JSON.parse(await readFile(join(root, ...configPath.split('/')), 'utf8')).data); expect(disk).toEqual(config);
      const reopened = await ProjectSession.open(root, characterId); sessions.push(reopened);
      const restored = [...reopened.documents.values()].find(document => configPath in document.files)!;
      expect(restored.dirty).toBe(false); expect(parseConfig(JSON.parse(restored.files[configPath]!).data)).toEqual(config);
    } finally {
      for (const session of sessions) await session.dispose('discard');
      if (!directory.startsWith(`${parent}\\`) && !directory.startsWith(`${parent}/`)) throw new Error('Test project must stay in the evidence directory');
      await rm(directory, { recursive: true, force: true });
    }
  });
});
