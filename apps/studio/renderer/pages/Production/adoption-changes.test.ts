import { expect, it } from 'vitest';
import type { DocumentView, EditPlan } from '@galcraft/contracts';
import { adoptionChanges } from './adoption-changes.js';

it('reports only the added or changed assets in an adoption that replaces the complete index array', () => {
  const before = [{ id: 'AssetA', name: '原素材.png', revision: 1 }, { id: 'AssetB', name: '另一个素材.png', revision: 1 }];
  const after = [before[0], { ...before[1], name: '新名称.png' }, { id: 'AssetC', name: '采用的立绘.png', revision: 1 }];
  const plan = { input: { label: '采用候选', patches: [{ kind: 'json', documentId: 'IndexA', changes: [{ path: '/data/assets', before, after, op: 'set' }] }] }, preview: [] } as unknown as EditPlan;
  const documents: DocumentView[] = [{ documentId: 'IndexA', revision: 1, savedRevision: 1, format: 'json', dirty: false, savedFiles: { 'assets/index.json': '{}' }, files: { 'assets/index.json': '{}' } }];
  const groups = adoptionChanges(plan, documents, 'zh-CN');
  expect(groups[0].changes.map(change => [change.kind, change.label])).toEqual([['update', '新名称.png'], ['add', '采用的立绘.png']]);
  expect(groups[0].changes[0].fields).toEqual([{ field: 'name', before: '另一个素材.png', after: '新名称.png' }]);
  expect(before[1].name).toBe('另一个素材.png');
});

it('compares a text adoption with the current working script rather than its saved version', () => {
  const current = 'say {speaker: {kind:"narrator"}, text:"尚未保存的原文"} @LineAA;\n';
  const addition = 'say {speaker: {kind:"narrator"}, text:"新采用的对白"} @LineBB;\n';
  const plan = { input: { label: '采用候选', patches: [{ kind: 'text', documentId: 'SceneA', edits: [{ start: current.length, end: current.length, before: '', after: addition }] }] }, preview: [] } as unknown as EditPlan;
  const documents = [{ documentId: 'SceneA', files: { 'scenes/SceneA/script.gal': current }, savedFiles: { 'scenes/SceneA/script.gal': '' } }] as unknown as DocumentView[];
  const changes = adoptionChanges(plan, documents, 'zh-CN')[0].changes;
  expect(changes.filter(change => change.kind === 'add').map(change => change.statementId)).toEqual(['LineBB']);
  expect(documents[0].files['scenes/SceneA/script.gal']).toBe(current);
});
