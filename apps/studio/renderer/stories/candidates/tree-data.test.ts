import { describe, expect, it } from 'vitest';
import { canMove, filterTree, moveTree, renameTree, treeFixture } from './tree-data.js';

describe('tree candidate chapter/scene transactions', () => {
  it('adjusts same-parent pre-removal slots and preserves selected source order', () => {
    const data = treeFixture();
    expect(moveTree(data, ['s1'], 'ch1', 3)[0]!.children!.map(n => n.id)).toEqual(['s2', 's3', 's1']);
    expect(moveTree(data, ['s3', 's1'], 'ch2', 1)[1]!.children!.map(n => n.id)).toEqual(['s4', 's1', 's3', 's5']);
  });
  it('retains identity on no-op, allows root order, rejects invalid nesting/mixed kinds', () => {
    const data = treeFixture();
    expect(moveTree(data, ['s1'], 'ch1', 1)).toBe(data);
    expect(moveTree(data, ['ch1'], null, 3).map(n => n.id)).toEqual(['ch2', 'ch3', 'ch1']);
    for (const [ids, parent] of [[['ch1'], 'ch2'], [['s1'], null], [['s1'], 's4'], [['s1', 'ch1'], 'ch2']] as const) expect(canMove(data, [...ids], parent)).toBe(false);
  });
  it('validates nonempty names, retains stable id, and allows duplicate display names like the authoring controller', () => {
    const data = treeFixture();
    expect(renameTree(data, 's2', '  ').error).toBeTruthy();
    expect(renameTree(data, 's2', '站台').nodes[0]!.children![1]).toMatchObject({ id: 's2', name: '站台' });
    const renamed = renameTree(data, 's2', ' 天台 ');
    expect(renamed.error).toBeUndefined(); expect(renamed.nodes[0]!.children![1]).toMatchObject({ id: 's2', name: '天台' });
  });
  it('keeps matching ancestors and does not mutate data when filtering', () => {
    const data = treeFixture();
    expect(filterTree(data, '站台').map(n => [n.id, n.children!.map(c => c.id)])).toEqual([['ch1', ['s1']], ['ch2', ['s4']]]);
    expect(filterTree(data, '')).toBe(data);
    expect(treeFixture(true).reduce((n, ch) => n + 1 + ch.children!.length, 0)).toBe(5100);
  });
});
