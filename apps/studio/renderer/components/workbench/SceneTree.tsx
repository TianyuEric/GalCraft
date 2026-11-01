import { editorText as translate } from '../editor-fields/editor-text.js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Tree, type NodeRendererProps, type RowRendererProps, type TreeApi } from 'react-arborist';
import { Menu } from '@base-ui/react/menu';
import { ChevronDown, ChevronRight, FileText, Folder, MoreHorizontal } from 'lucide-react';
import { Button } from '../controls.js';
import type { ObjectMenuGroup } from './ObjectMenu.js';
import './scene-tree.css';
export type SceneNode = { id: string; name: string; kind: 'chapter' | 'scene'; detail?: string; children?: SceneNode[] };
function canMove(data: SceneNode[], ids: string[], parent: string | null) {
 const chapters = new Set(data.map(n => n.id));
 const scenes = new Set(data.flatMap(n => n.children?.map(c => c.id) ?? []));
 return ids.length > 0 && (parent === null ? ids.every(id => chapters.has(id)) : chapters.has(parent) && ids.every(id => scenes.has(id)));
}
export type SceneTreeContext = {
  locale?: string; active: string; selected: string[]; hidden: number; readonly: boolean; query: string;
  menuGroups?(id: string, scope: string[], hidden: number): ObjectMenuGroup[];
  data: SceneNode[]; rename(id: string, name: string): Promise<string | void>;
  select(ids: string[]): void; open(id: string, pinned: boolean): void;
  move(ids: string[], parent: string | null, index: number): void;
};
const TreeContext = createContext<SceneTreeContext>(null!);

function RenameInput({ node }: { node: NodeRendererProps<SceneNode>['node'] }) {
  const ctx = useContext(TreeContext), t = (text: string) => translate(text, ctx.locale), ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(node.data.name), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    let message: string | void;
    try { message = await ctx.rename(node.id, name); } catch (error) { message = String(error instanceof Error ? error.message : error); }
    setBusy(false);
    if (message) { setError(message); requestAnimationFrame(() => ref.current?.focus()); }
    else { node.reset(); node.focus(); }
  };
  return <div className="tree-rename" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <input data-slot="studio-tree-control" ref={ref} aria-label={`${t('重命名')} ${node.data.name}`} aria-invalid={!!error} aria-describedby={error ? `rename-error-${node.id}` : undefined} value={name} readOnly={busy} onChange={e => { setName(e.target.value); setError(''); }} onKeyDown={e => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); void submit(); }
      if (e.key === 'Escape' && !busy) { node.reset(); node.focus(); }
    }} />
    <Button disabled={busy} onClick={() => void submit()} aria-label={t("确认重命名")}>{busy ? '…' : '✓'}</Button>
    {error && <span id={`rename-error-${node.id}`} role="alert" className="tree-rename-error">{error}</span>}
  </div>;
}

function ArboristNode({ node, style, dragHandle }: NodeRendererProps<SceneNode>) {
  const ctx = useContext(TreeContext), t = (text: string) => translate(text, ctx.locale), [menu, setMenu] = useState(false);
  const scope = ctx.selected.includes(node.id) ? ctx.selected : [node.id];
  const prepareMenu = () => { if (!ctx.selected.includes(node.id)) ctx.select([node.id]); node.focus(); };
  return <Menu.Root open={menu} onOpenChange={open => { if (open) prepareMenu(); setMenu(open); }}>
    <div style={style} ref={dragHandle} data-node-id={node.id} data-kind={node.data.kind} aria-current={ctx.active === node.id ? 'page' : undefined}
      className={`arborist-node${node.isSelected ? ' is-selected' : ''}${node.isFocused ? ' is-focused' : ''}${node.willReceiveDrop ? ' is-drop-target' : ''}${node.isDragging ? ' is-dragging' : ''}`}
      onClick={e => { if (!node.isEditing) node.handleClick(e); }} onDoubleClick={() => { if (!node.isEditing && node.isLeaf) ctx.open(node.id, true); }}
      onContextMenu={e => { e.preventDefault(); prepareMenu(); setMenu(true); }}
      onKeyDown={e => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); prepareMenu(); setMenu(true); } }}>
      {node.isInternal ? <button data-slot="studio-tree-control" className="arborist-toggle" tabIndex={-1} aria-label={`${node.isOpen ? t("折叠") : t("展开")} ${node.data.name}`} onClick={e => { e.stopPropagation(); node.toggle(); }}>{node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="arborist-indent" />}
      {node.isInternal ? <Folder size={14} className="tree-icon" /> : <FileText size={14} className="tree-icon" />}
      {node.isEditing ? <RenameInput node={node} /> : <><span className="arborist-name" title={node.data.name}>{node.data.name}</span>{node.data.detail && <span className="arborist-dirty" aria-label={t("未保存")}>{node.data.detail}</span>}{node.isInternal && <span className="arborist-count">{node.data.children?.length}</span>}
        <Menu.Trigger data-slot="studio-tree-control" className="arborist-more" tabIndex={-1} aria-label={`${node.data.name} · ${t('操作')}`} onClick={e => e.stopPropagation()}><MoreHorizontal size={14} /></Menu.Trigger></>}
    </div>
    <Menu.Portal container={document.getElementById('studio-portals')}><Menu.Positioner side="right" align="start" sideOffset={4} className="tree-menu-position"><Menu.Popup className="tree-menu">
      <p>{t('已选')} {scope.length} {t('项')}{ctx.hidden ? ` · ${t('其中')} ${ctx.hidden} ${t('项不在当前结果')}` : ''}</p>
      {!ctx.menuGroups && node.isLeaf && <Menu.Item onClick={() => ctx.open(node.id, true)}>{t("打开场景")}</Menu.Item>}
      <Menu.Item disabled={ctx.readonly || scope.length !== 1} onClick={() => { node.edit(); }}>{t('重命名')} <kbd>F2</kbd></Menu.Item>
      {ctx.menuGroups ? ctx.menuGroups(node.id, scope, ctx.hidden).map((group, i) => <Menu.Group key={i}>{group.label && <Menu.GroupLabel>{group.label}</Menu.GroupLabel>}{group.actions.map((action, j) => <Menu.Item key={j} disabled={!!action.disabled} title={typeof action.disabled === 'string' ? action.disabled : undefined} onClick={() => { void action.run(); }}>{action.label}</Menu.Item>)}</Menu.Group>) : node.isLeaf && ctx.data.map(chapter => <Menu.Item key={chapter.id} disabled={ctx.readonly || !!ctx.query || !canMove(ctx.data, scope, chapter.id)} onClick={() => ctx.move(scope, chapter.id, chapter.children!.length)}>{t('移动到')} {chapter.name}</Menu.Item>)}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

function ArboristRow({ attrs, innerRef, children }: RowRendererProps<SceneNode>) {
  return <div {...attrs} style={{ ...attrs.style, minWidth: 0 }} ref={innerRef} onFocus={e => e.stopPropagation()} onKeyDown={e => {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault(); e.stopPropagation(); e.currentTarget.querySelector<HTMLButtonElement>('.arborist-more')?.click();
    }
  }}>{children}</div>;
}

export function SceneTree({ ctx, height = 320, clearToken = 0 }: { ctx: SceneTreeContext; height?: number; clearToken?: number }) {
  const t = (text: string) => translate(text, ctx.locale);
  const ref = useRef<TreeApi<SceneNode>>(null), syncing = useRef(true);
  // Keep one authoritative selection outside virtualization/filtering; synchronize only external commands.
  useEffect(() => {
    const tree = ref.current; if (!tree) return;
    const current = tree.selectedIds;
    if (current.size === ctx.selected.length && ctx.selected.every(id => current.has(id))) { syncing.current = false; return; }
    syncing.current = true;
    tree.deselectAll(); ctx.selected.forEach(id => tree.selectMulti(id, { focus: false }));
    syncing.current = false;
  }, [ctx.selected, clearToken]);
  return <TreeContext.Provider value={ctx}><div onKeyDownCapture={e => {
    const tree = ref.current, node = tree?.focusedNode;
    if (!node || tree?.isEditing || (e.target as HTMLElement).closest('button,[role="menu"]')) return;
    if (e.key === 'F2' && !ctx.readonly) { e.preventDefault(); e.stopPropagation(); void node.edit(); }
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      if (node.isLeaf) { node.select(); ctx.open(node.id, true); } else node.toggle();
    }
  }}><Tree<SceneNode> ref={ref} data={ctx.data} aria-label={t("作品对象")} width="100%" height={height} rowHeight={28} indent={16} overscanCount={4} paddingTop={4} paddingBottom={4}
    openByDefault selectionFollowsFocus={false} disableEdit={ctx.readonly} disableDrag={ctx.readonly || !!ctx.query}
    disableDrop={({ parentNode, dragNodes }) => ctx.readonly || !!ctx.query || !canMove(ctx.data, dragNodes.map(n => n.id), parentNode.isRoot ? null : parentNode.id)}
    searchTerm={ctx.query} searchMatch={(node, term) => node.data.name.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase())}
    onRename={async ({ id, name }) => { await ctx.rename(id, name); }}
    onMove={({ dragIds, parentId, index }) => ctx.move(dragIds, parentId, index)}
    onActivate={node => { if (node.isLeaf) ctx.open(node.id, false); }}
    onSelect={() => { if (!syncing.current) ctx.select(Array.from(ref.current?.selectedIds ?? [])); }}
    className="candidate-arborist" rowClassName="candidate-arborist-row" renderRow={ArboristRow}
    renderCursor={({ top, left, indent }) => <div className="tree-drop-cursor" style={{ top, left: left + indent, right: 8 }} />}
  >{ArboristNode}</Tree></div></TreeContext.Provider>;
}
