export type SceneNode = { id: string; name: string; kind: 'chapter' | 'scene'; children?: SceneNode[] };

export function treeFixture(large = false): SceneNode[] {
  if (large) return Array.from({ length: 100 }, (_, c) => ({ id: `chapter-${c}`, name: `第 ${c + 1} 章 · 合成数据`, kind: 'chapter', children: Array.from({ length: 50 }, (_, s) => ({ id: `scene-${c}-${s}`, name: `场景 ${c + 1}-${s + 1} · 站台来信`, kind: 'scene' })) }));
  return [
    { id: 'ch1', name: '第一章 · 雨站来信', kind: 'chapter', children: [
      { id: 's1', name: '站台', kind: 'scene' }, { id: 's2', name: '街角', kind: 'scene' },
      { id: 's3', name: '旧书店 · 雨停后灯光映在玻璃上的傍晚（最终修订）', kind: 'scene' },
    ] },
    { id: 'ch2', name: '第二章 · 重逢', kind: 'chapter', children: [
      { id: 's4', name: '站台', kind: 'scene' }, { id: 's5', name: '天台', kind: 'scene' },
    ] },
    { id: 'ch3', name: '第三章 · 告别', kind: 'chapter', children: [{ id: 's6', name: '归途', kind: 'scene' }] },
  ];
}
export const flattenTree = (nodes: SceneNode[]): SceneNode[] => nodes.flatMap(n => [n, ...(n.children ?? [])]);
export function filterTree(nodes: SceneNode[], query: string): SceneNode[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return nodes;
  return nodes.flatMap(node => {
    const children = node.children?.filter(child => child.name.toLocaleLowerCase().includes(term));
    return node.name.toLocaleLowerCase().includes(term) || children?.length ? [{ ...node, children }] : [];
  });
}
export function renameTree(nodes: SceneNode[], id: string, name: string): { nodes: SceneNode[]; error?: string } {
  const item = flattenTree(nodes).find(n => n.id === id), next = name.trim();
  if (!item) return { nodes, error: '对象已不存在。' };
  if (!next) return { nodes, error: '请输入名称。' };
  if (item.name === next) return { nodes };
  return { nodes: nodes.map(n => n.id === id ? { ...n, name: next } : { ...n, children: n.children?.map(c => c.id === id ? { ...c, name: next } : c) }) };
}
export function canMove(nodes: SceneNode[], ids: string[], parent: string | null): boolean {
  const items = flattenTree(nodes).filter(n => ids.includes(n.id));
  return items.length > 0 && items.length === new Set(ids).size && (parent === null
    ? items.every(n => n.kind === 'chapter')
    : nodes.some(n => n.id === parent) && items.every(n => n.kind === 'scene'));
}
/** index is the slot in the destination BEFORE removal, matching Arborist onMove. */
export function moveTree(nodes: SceneNode[], ids: string[], parent: string | null, index: number): SceneNode[] {
  if (!canMove(nodes, ids, parent)) return nodes;
  const moving = flattenTree(nodes).filter(n => ids.includes(n.id));
  const siblings = parent === null ? nodes : nodes.find(n => n.id === parent)!.children!;
  const slot = Math.max(0, Math.min(index, siblings.length));
  const adjusted = slot - siblings.slice(0, slot).filter(n => ids.includes(n.id)).length;
  const remaining = siblings.filter(n => !ids.includes(n.id));
  remaining.splice(adjusted, 0, ...moving);
  const result = parent === null ? remaining : nodes.map(n => ({ ...n, children: n.id === parent ? remaining : n.children!.filter(c => !ids.includes(c.id)) }));
  return JSON.stringify(result) === JSON.stringify(nodes) ? nodes : result;
}
