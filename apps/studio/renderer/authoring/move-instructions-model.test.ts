import { describe, expect, it } from 'vitest';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import type { AuthoringSource } from './controller.js';
import { buildMoveInstructionsModel, resolveMovePosition } from './move-instructions-model.js';

const first = 'StmtAA', second = 'StmtBB', third = 'StmtCC';
const source: AuthoringSource = { projectDocumentId: 'PrjDoc', projectRevision: 1, projectSavedRevision: 1, projectDirty: false,
  project: FixtureProject, characters: [], scenes: [
    { sceneId: 'SceneA', documentId: 'DocAAA', name: '移动来源', text: `say {speaker:{kind:"narrator"},text:"第一句"} @${first};\nwait {durationMs:300} @${second};\nsay {speaker:{kind:"narrator"},text:"第三句"} @${third};\n` },
    { sceneId: 'SceneB', documentId: 'DocBBB', name: '同名目标', text: 'say {speaker:{kind:"narrator"},text:"目标第一句"} @TargAA;\nwait {durationMs:300} @TargBB;\n' },
    { sceneId: 'SceneC', documentId: 'DocCCC', name: '空场景', text: '' },
    { sceneId: 'SceneD', documentId: 'DocDDD', name: '源码错误', text: 'say {' },
  ].map(scene => ({ ...scene, chapterId: FixtureProject.chapters[0]!.id, revision: 1, savedRevision: 1, dirty: false })) };

describe('move instructions choices', () => {
  it('shows source order and draft text while keeping all destination scenes explicitly available', () => {
    const model = buildMoveInstructionsModel(source, 'SceneA', [third, first], 'zh-CN', new Map([[first, '尚未提交的正文']]));
    expect(model.error).toBe(''); expect(model.instructions.map(item => item.id)).toEqual([first, third]);
    expect(model.instructions[0]?.preview).toBe('尚未提交的正文');
    expect(model.scenes.map(scene => scene.id)).toEqual(['SceneB', 'SceneC', 'SceneD']);
    expect(model.scenes[0]?.label).toBe(`${FixtureProject.chapters[0]!.name} / 同名目标`);
    expect(model.scenes[2]?.error).toContain('源码存在语法错误');
  });
  it('resolves end, start and a specific instruction without silently falling back from a missing position', () => {
    const target = buildMoveInstructionsModel(source, 'SceneA', [first], 'en').scenes[0]!;
    expect(resolveMovePosition(target, 'end', null, 'en')).toEqual({ beforeId: null, error: '' });
    expect(resolveMovePosition(target, 'start', null, 'en')).toEqual({ beforeId: 'TargAA', error: '' });
    expect(resolveMovePosition(target, 'before', 'TargBB', 'en')).toEqual({ beforeId: 'TargBB', error: '' });
    expect(resolveMovePosition(target, 'before', 'Missing', 'en').error).toContain('Choose the instruction');
  });
  it('accepts start or end in an empty target and gives a persistent reason for before or invalid source', () => {
    const model = buildMoveInstructionsModel(source, 'SceneA', [first], 'zh-CN');
    const empty = model.scenes.find(scene => scene.id === 'SceneC')!, invalid = model.scenes.find(scene => scene.id === 'SceneD')!;
    expect(resolveMovePosition(empty, 'start', null, 'zh-CN')).toEqual({ beforeId: null, error: '' });
    expect(resolveMovePosition(empty, 'end', null, 'zh-CN')).toEqual({ beforeId: null, error: '' });
    expect(resolveMovePosition(empty, 'before', null, 'zh-CN').error).toContain('目标场景为空');
    expect(resolveMovePosition(invalid, 'end', null, 'zh-CN').error).toContain('源码存在语法错误');
    expect(buildMoveInstructionsModel(source, 'SceneD', ['Missing'], 'zh-CN').error).toContain('源码存在语法错误');
  });
  it('blocks stale and empty selection and avoids raw IDs in a brief preview', () => {
    expect(buildMoveInstructionsModel(source, 'SceneA', ['Missing'], 'zh-CN').error).toContain('重新选择');
    expect(buildMoveInstructionsModel(source, 'SceneA', [], 'zh-CN').error).toContain('重新选择');
    const long = structuredClone(source); long.scenes[0]!.text = `say {speaker:{kind:"narrator"},text:"${'长正文'.repeat(80)}"} @${first};`;
    expect(buildMoveInstructionsModel(long, 'SceneA', [first], 'zh-CN').instructions[0]?.preview).toHaveLength(91);
  });
});
