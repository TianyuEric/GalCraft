import { describe, expect, it } from 'vitest';
import { applyTextEdits } from '@galcraft/dsl';
import type { AssetReference, DocumentView } from '@galcraft/contracts';
import { candidateAssetReferencePatches } from '../adapters/candidate-asset-references.js';
import { droppedAssetCommand, replaceAssetSelection, selectAssetRow } from './asset-workspace.js';

describe('candidate asset selection', () => {
  it('uses one collection for row replacement and modifier toggles', () => {
    const first = replaceAssetSelection(['a']);
    const added = selectAssetRow(first, 'b', ['a', 'b'], { toggle: true });
    expect(added).toEqual({ activeId: 'b', selectedIds: ['a', 'b'], rangeAnchor: 'b' });
    expect(selectAssetRow(added, 'a', ['a', 'b'], { toggle: true })).toEqual({
      activeId: 'a', selectedIds: ['b'], rangeAnchor: 'a',
    });
    expect(selectAssetRow(added, 'a', ['a', 'b'])).toEqual(first);
  });

  it('extends the range on the visible page while preserving earlier selections', () => {
    const order = ['a', 'b', 'c', 'd'];
    const selection = replaceAssetSelection(['b', 'other-page']);
    const wide = selectAssetRow(selection, 'd', order, { range: true });
    expect(wide).toEqual({ activeId: 'd', selectedIds: ['b', 'other-page', 'c', 'd'], rangeAnchor: 'b' });
    expect(selectAssetRow(wide, 'a', order, { range: true }).selectedIds).toEqual(['b', 'other-page', 'c', 'd', 'a']);
  });

  it('starts a new visible range if its anchor is hidden and supports moving focus alone', () => {
    const first = replaceAssetSelection(['hidden']);
    const focused = selectAssetRow(first, 'b', ['a', 'b'], { focusOnly: true });
    expect(focused).toEqual({ activeId: 'b', selectedIds: ['hidden'], rangeAnchor: 'hidden' });
    expect(selectAssetRow(focused, 'a', ['a', 'b'], { range: true })).toEqual({
      activeId: 'a', selectedIds: ['hidden', 'a'], rangeAnchor: 'a',
    });
  });
});


describe('candidate asset impact', () => {
  it('limits drop insertion to supported commands', () => {
    expect(droppedAssetCommand('image')).toBe('changeBg');
    expect(droppedAssetCommand('audio')).toBe('bgm');
    expect(droppedAssetCommand('animation')).toBe('setComplexAnimation');
    expect(droppedAssetCommand('font')).toBeUndefined();
  });

  it('retargets exactly the selected script use and checks its document revision', () => {
    const script = 'changeBg {assetId:"AssetA"} @Cmd001;\nchangeBg {assetId:"AssetA"} @Cmd002;\n';
    const files = { 'scenes/SceneA/script.gal': script };
    const document: DocumentView = { documentId: 'Doc001', revision: 3, savedRevision: 3, format: 'dsl', dirty: false, files, savedFiles: files };
    const reference: AssetReference = { assetId: 'AssetA', variantId: null, required: true, usage: '背景',
      owner: { kind: 'statement', id: 'Cmd002' }, source: { documentId: 'Doc001', statementId: 'Cmd002', revision: 3, field: 'assetId' } };
    const [patch] = candidateAssetReferencePatches([document], [reference], 'AssetB', 'NewV01');
    expect(patch?.kind).toBe('text');
    if (patch?.kind !== 'text') throw new Error('Expected a script patch');
    expect(applyTextEdits(script, patch.edits.map(edit => ({ start: edit.start, end: edit.end, text: edit.after, oldText: edit.before }))))
      .toBe('changeBg {assetId:"AssetA"} @Cmd001;\nchangeBg {assetId:"AssetB"} @Cmd002;\n');
    expect(() => candidateAssetReferencePatches([{ ...document, revision: 4 }], [reference], 'AssetB', 'NewV01')).toThrow('引用位置已变化');
  });

  it('moves an explicit asset and version pair in the same JSON patch', () => {
    const path = 'characters/Char01.json';
    const files = { [path]: JSON.stringify({ data: { avatar: { assetId: 'AssetA', variantId: 'OldV01' } } }) };
    const document: DocumentView = { documentId: 'Doc001', revision: 3, savedRevision: 3, format: 'json', dirty: false, files, savedFiles: files };
    const reference: AssetReference = { assetId: 'AssetA', variantId: 'OldV01', required: true, usage: '头像',
      owner: { kind: 'document', id: 'Doc001' }, source: { documentId: 'Doc001', revision: 3, field: '/data/avatar/assetId' } };
    const [patch] = candidateAssetReferencePatches([document], [reference], 'AssetB', 'NewV01');
    expect(patch).toMatchObject({ kind: 'json', changes: [
      { path: '/data/avatar/assetId', before: 'AssetA', after: 'AssetB' },
      { path: '/data/avatar/variantId', before: 'OldV01', after: 'NewV01' },
    ] });
  });
});
