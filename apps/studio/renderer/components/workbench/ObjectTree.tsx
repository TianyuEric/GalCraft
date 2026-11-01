import { Button } from '../controls.js';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { ObjectMenu, isObjectMenuKey, objectMenuSelection, type ObjectMenuGroup, type ObjectMenuOrigin } from './ObjectMenu.js';

export type WorkbenchTreeNode = { id: string; name: string; icon?: ReactNode; children?: WorkbenchTreeNode[]; detail?: ReactNode; container?: boolean };
type VisibleNode = { node: WorkbenchTreeNode; level: number; parent?: string; position: number; siblings: number };

export function ObjectTree({ nodes, selected, onSelect, onOpen, onRename, onMove, onMoveMany, menuGroups, onPrimary, active, label = '作品对象', locale = document.getElementById('studio-portals')?.lang || 'zh-CN' }: {
  nodes: WorkbenchTreeNode[]; selected: string[]; onSelect(ids: string[]): void; onOpen(id: string, pinned: boolean): void;
  onRename?(id: string, name: string): string | void | Promise<string | void>; onMove?(id: string, parentId: string): void; onMoveMany?(ids: string[], parentId: string): void; label?: string;
  menuGroups?(node: WorkbenchTreeNode, scope: string[], hidden: number): ObjectMenuGroup[];
  onPrimary?(id: string): void;
  active?: string; locale?: string;
}) {
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const selectedParents = (items: WorkbenchTreeNode[]): string[] => items.flatMap(node => {
    if (!node.children) return [];
    const nested = selectedParents(node.children);
    return nested.length || node.children.some(child => selected.includes(child.id)) ? [node.id, ...nested] : [];
  });
  const [expanded, setExpanded] = useState(() => new Set([...nodes.filter(node => node.children).map(node => node.id), ...selectedParents(nodes)]));
  const [focused, setFocused] = useState(selected[0] ?? nodes[0]?.id), [editing, setEditing] = useState<string | null>(null), [name, setName] = useState(''), [error, setError] = useState('');
  const [drop, setDrop] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const anchor = useRef(selected[0]), [menu, setMenu] = useState<(ObjectMenuOrigin & { node: WorkbenchTreeNode; scope: string[] }) | null>(null);
  const visible: VisibleNode[] = [];
  const visit = (items: WorkbenchTreeNode[], level: number, parent?: string) => items.forEach((node, index) => {
    visible.push({ node, level, parent, position: index + 1, siblings: items.length });
    if (node.children && expanded.has(node.id)) visit(node.children, level + 1, node.id);
  });
  visit(nodes, 1);
  useEffect(() => { const parents = selectedParents(nodes); setExpanded(current => parents.some(id => !current.has(id)) ? new Set([...current, ...parents]) : current); }, [nodes, selected.join('\0')]);
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);
  const focus = (id: string) => { setFocused(id); requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)?.focus()); };
  const toggle = (id: string) => setExpanded(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const rename = (node: WorkbenchTreeNode) => { if (!onRename || node.container) return; setEditing(node.id); setName(node.name); setError(''); };
  const openMenu = (node: WorkbenchTreeNode, origin: ObjectMenuOrigin) => {
    const scope = node.container ? selected : objectMenuSelection(selected, node.id); if (!node.container && !selected.includes(node.id)) anchor.current = node.id;
    setFocused(node.id); if (!node.container) { onSelect(scope); onPrimary?.(node.id); } setMenu({ ...origin, node, scope });
  };
  const commit = async () => {
    if (!editing || busy) return;
    setBusy(true); const next = name.trim(); let message: string | void;
    try { message = next ? await onRename?.(editing, next) : t('名称不能为空','Name cannot be empty','名前を入力してください'); } catch (reason) { message = String(reason); } finally { setBusy(false); }
    if (message) { setError(message); input.current?.focus(); return; }
    const id = editing; setEditing(null); focus(id);
  };
  const groups = (menu ? menuGroups?.(menu.node, menu.scope, menu.scope.filter(id => !visible.some(item => item.node.id === id)).length) ?? [] : []).map(group => ({ ...group, actions: [...group.actions] }));
  if (menu && !menu.node.container && onRename && !groups.some(group => group.actions.some(action => action.label === t('重命名','Rename','名前を変更')))) {
    const action = { label: t('重命名','Rename','名前を変更'), run: () => rename(menu.node) };
    if (groups.length) groups[0].actions.unshift(action); else groups.push({ label: menu.node.name, actions: [action] });
  }
  return <><div className="gc-wb-tree" ref={root} role="tree" aria-label={label} aria-multiselectable="true">
    {visible.map(({ node, level, parent, position, siblings }, index) => <div key={node.id} role="treeitem" data-node-id={node.id} data-focus-key={`tree:${label}:${node.id}`} data-document-active={node.id === active} aria-current={node.id === active ? 'page' : undefined}
      aria-level={level} aria-posinset={position} aria-setsize={siblings} aria-selected={selected.includes(node.id)} aria-expanded={node.children ? expanded.has(node.id) : undefined}
      tabIndex={(visible.some(item => item.node.id === focused) ? focused === node.id : index === 0) ? 0 : -1}
      data-menu-open={menu?.node.id === node.id}
      className={`gc-wb-tree-row ${drop === node.id ? 'is-drop-target' : ''}`} style={{ paddingLeft: 6 + (level - 1) * 18 }}
      onFocus={event => { if (event.target === event.currentTarget) setFocused(node.id); }}
      onClick={event => {
        if ((event.target as HTMLElement).closest('input,button')) return;
        setFocused(node.id); event.currentTarget.focus();
        if (event.shiftKey) { const from = Math.max(0, visible.findIndex(item => item.node.id === anchor.current)); onSelect(visible.slice(Math.min(from, index), Math.max(from, index) + 1).map(item => item.node.id)); }
        else if (event.ctrlKey || event.metaKey) onSelect(selected.includes(node.id) ? selected.filter(id => id !== node.id) : [...selected, node.id]);
        else { anchor.current = node.id; onSelect([node.id]); if (!node.children) onOpen(node.id, false); }
      }} onDoubleClick={() => { if (!node.children && !editing) onOpen(node.id, true); }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || event.nativeEvent.isComposing) return;
        if (isObjectMenuKey(event) && (onRename || menuGroups)) { event.preventDefault(); event.stopPropagation(); openMenu(node, { element: event.currentTarget }); return; }
        const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        if (offset) { event.preventDefault(); const next = visible[Math.max(0, Math.min(visible.length - 1, index + offset))]; focus(next.node.id); onSelect(event.shiftKey ? [...new Set([...selected,node.id,next.node.id])] : [next.node.id]); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); if (node.children) expanded.has(node.id) ? node.children[0] && focus(node.children[0].id) : toggle(node.id); }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); if (node.children && expanded.has(node.id)) toggle(node.id); else if (parent) focus(parent); }
        else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); const next = visible[event.key === 'Home' ? 0 : visible.length - 1]; focus(next.node.id); }
        else if (event.key === 'Enter') { event.preventDefault(); node.children ? toggle(node.id) : onOpen(node.id, true); }
        else if (event.key === ' ') { event.preventDefault(); onSelect([node.id]); }
        else if (event.key === 'F2') { event.preventDefault(); rename(node); }
      }} onContextMenu={event => { if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]') || !onRename && !menuGroups) return; event.preventDefault(); event.stopPropagation(); openMenu(node, { element: event.currentTarget, x: event.clientX, y: event.clientY }); }} draggable={!!(onMove || onMoveMany) && !editing} onDragStart={event => { event.dataTransfer.setData('application/x-galcraft-tree-node', node.id); event.dataTransfer.setData('application/x-galcraft-tree-selection', JSON.stringify(selected.includes(node.id) ? selected : [node.id])); event.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={event => { if (node.children && (onMove || onMoveMany) && event.dataTransfer.types.includes('application/x-galcraft-tree-node')) { event.preventDefault(); setDrop(node.id); } }}
      onDragLeave={() => setDrop(null)} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData('application/x-galcraft-tree-node'); if (node.children && id) { const raw = event.dataTransfer.getData('application/x-galcraft-tree-selection'); if (onMoveMany) { let ids = [id]; try { const values = JSON.parse(raw); if (Array.isArray(values) && values.every(value => typeof value === 'string')) ids = values; } catch { /* Single-object drag from another tree. */ } onMoveMany(ids, node.id); } else onMove?.(id, node.id); setExpanded(current => new Set([...current, node.id])); } setDrop(null); }} onDragEnd={() => setDrop(null)}>
      {node.children ? <button type="button" data-slot="workbench-tree-toggle" tabIndex={-1} className="gc-wb-tree-toggle" aria-label={`${expanded.has(node.id) ? t('折叠 ','Collapse ','折りたたむ ') : t('展开 ','Expand ','展開する ')}${node.name}`} onClick={() => toggle(node.id)}>{expanded.has(node.id) ? <ChevronDown/> : <ChevronRight/>}</button> : <span className="gc-wb-tree-indent"/>}
      {node.icon}<div className="gc-wb-tree-name">{editing === node.id ? <><input ref={input} aria-label={t('对象名称','Object name','オブジェクト名')} value={name} disabled={busy} aria-invalid={!!error} onChange={event => { setName(event.target.value); setError(''); }} onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') { event.preventDefault(); void commit(); } if (event.key === 'Escape') { event.preventDefault(); setEditing(null); focus(node.id); } }}/>{error && <small role="alert">{error}</small>}</> : <span title={node.name}>{node.name}</span>}</div>
      {node.detail && <small>{node.detail}</small>}
      {(onRename || menuGroups) && !editing && <Button tone="quiet" className="gc-wb-tree-more" aria-label={t(`${node.name}的更多操作`,`More actions for ${node.name}`,`${node.name}の操作`)} onClick={event => { event.stopPropagation(); openMenu(node, { element: event.currentTarget }); }}><MoreHorizontal size={15}/></Button>}
    </div>)}
    {!visible.length && <p className="gc-wb-empty">{t('没有匹配对象','No matching objects','一致するオブジェクトがありません')}</p>}
  </div>{menu && groups.length > 0 && <ObjectMenu origin={menu} groups={groups} close={() => setMenu(null)}/>}</>;
}
