import { editorText as translate } from '../components/editor-fields/editor-text.js';
import { useEffect, useState } from 'react';
import { SceneTree, type SceneNode } from '../components/workbench/SceneTree.js';
import { Button } from '../components/controls.js';
import type { ObjectTree } from '../components/workbench/ObjectTree.js';

type Props = Parameters<typeof ObjectTree>[0] & {
  query: string; onClearSearch(): void;
  onMoveAt(ids: string[], parent: string | null, index?: number): Promise<void>;
};
/** Scene data and editing remain owned by the existing workbench/controller. */
export function SceneExplorerTree(props: Props) {
  const t = (text: string) => translate(text, props.locale);
  const [height, setHeight] = useState(() => Math.min(420, window.innerHeight * .42));
  useEffect(() => { const resize = () => setHeight(Math.min(420, window.innerHeight * .42)); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const data: SceneNode[] = props.nodes.map(chapter => ({ id: chapter.id, name: chapter.name, kind: 'chapter', children: chapter.children?.map(scene => ({ id: scene.id, name: scene.name, detail: typeof scene.detail === 'string' ? scene.detail : undefined, kind: 'scene' })) ?? [] }));
  const all = props.nodes.flatMap(n => [n, ...n.children ?? []]);
  const query = props.query.trim().toLocaleLowerCase();
  const matched = new Set(data.flatMap(chapter => {
    const children = chapter.children!.filter(child => !query || child.name.toLocaleLowerCase().includes(query));
    return !query || chapter.name.toLocaleLowerCase().includes(query) ? [chapter.id, ...chapter.children!.map(child => child.id)] : children.length ? [chapter.id, ...children.map(child => child.id)] : [];
  }));
  const hidden = props.selected.filter(id => !matched.has(id)).length;
  return <><p className="scene-tree-selection">{t('已选')} {props.selected.length} {t('项')}{hidden > 0 && ` · ${t('隐藏')} ${hidden} ${t('项')}`}</p>
    {props.query && matched.size === 0 && <div className="scene-tree-selection" role="status">{t("没有匹配的章节或场景。")}<Button tone="quiet" onClick={props.onClearSearch}>{t("清除筛选")}</Button></div>}
    <div className="scene-tree-create-slot"/>
    <SceneTree height={height} ctx={{ locale: props.locale, data, selected: props.selected, active: props.active ?? '', hidden, query: props.query, readonly: !props.onRename,
      select: props.onSelect, open: props.onOpen, rename: async (id, name) => props.onRename?.(id, name),
      move: (ids, parent, index) => { void props.onMoveAt(ids, parent, index); },
      menuGroups: (id, scope, count) => props.menuGroups?.(all.find(n => n.id === id)!, scope, count) ?? [],
    }}/></>;
}
