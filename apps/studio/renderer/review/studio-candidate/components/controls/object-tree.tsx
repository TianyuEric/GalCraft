import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { CandidateIconButton, CandidateInput } from './primitives.js';
import { CandidateActionMenu, type CandidateMenuAction, type CandidateMenuTarget } from './overlays.js';
import './object-tree.css';

type TreeNode = { id: string; name: string; icon?: ReactNode; detail?: ReactNode; children?: TreeNode[] };
type TreeRow = { node: TreeNode; level: number; parent?: string; position: number; siblings: number };
const dragType = 'application/x-galcraft-tree-node';
const selectionDragType = 'application/x-galcraft-tree-selection';

function selectedParents(nodes: TreeNode[], selected: string[]): string[] {
  return nodes.flatMap(node => {
    if (!node.children) return [];
    const descendants = selectedParents(node.children, selected);
    return descendants.length || node.children.some(child => selected.includes(child.id)) ? [node.id, ...descendants] : [];
  });
}

function visibleRows(nodes: TreeNode[], expanded: ReadonlySet<string>, level = 1, parent?: string): TreeRow[] {
  return nodes.flatMap((node, index) => [
    { node, level, parent, position: index + 1, siblings: nodes.length },
    ...(node.children && expanded.has(node.id) ? visibleRows(node.children, expanded, level + 1, node.id) : []),
  ]);
}

// Selection, rename and drag behavior follow the formal workbench ObjectTree.
export function CandidateObjectTree({ label, nodes, selected, onSelect, onRename, onMove, menuActions }: {
  label: string;
  nodes: TreeNode[];
  selected: string[];
  onSelect(ids: string[]): void;
  onRename?(id: string, name: string): string | void | Promise<string | void>;
  onMove?(ids: string[], parent: string): void;
  menuActions?(node: TreeNode, scope: string[]): CandidateMenuAction[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef(selected[0]);
  const [expanded, setExpanded] = useState(() => new Set([...nodes.filter(node => node.children).map(node => node.id), ...selectedParents(nodes, selected)]));
  const [focused, setFocused] = useState(selected[0] ?? nodes[0]?.id);
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drop, setDrop] = useState<string>();
  const [menu, setMenu] = useState<{ target: CandidateMenuTarget; node: TreeNode; scope: string[] }>();
  const visible = visibleRows(nodes, expanded);
  const tabbable = visible.some(row => row.node.id === focused) ? focused : visible[0]?.node.id;
  const hasMenu = !!(onRename || menuActions);

  useEffect(() => {
    const parents = selectedParents(nodes, selected);
    setExpanded(current => parents.some(id => !current.has(id)) ? new Set([...current, ...parents]) : current);
  }, [nodes, selected.join('\0')]);
  useEffect(() => {
    if (editing) { input.current?.focus(); input.current?.select(); }
  }, [editing]);

  const focus = (id: string) => {
    setFocused(id);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)?.focus());
  };
  const toggle = (id: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const rename = (node: TreeNode) => {
    if (!onRename) return;
    setEditing(node.id); setName(node.name); setError('');
  };
  const commit = async () => {
    if (!editing || !onRename || busy) return;
    const next = name.trim();
    if (!next) { setError('名称不能为空'); return; }
    setBusy(true);
    try {
      const message = await onRename(editing, next);
      if (message) { setError(message); return; }
      setEditing(undefined); focus(editing);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const openMenu = (node: TreeNode, target: CandidateMenuTarget) => {
    if (!hasMenu) return;
    const scope = selected.includes(node.id) ? selected : [node.id];
    if (scope !== selected) { anchor.current = node.id; onSelect(scope); }
    setMenu({ target, node, scope });
  };
  const actions = menu ? [
    ...(onRename ? [{ id: 'rename', label: '重命名', shortcut: 'F2', run: () => rename(menu.node) }] : []),
    ...(menuActions?.(menu.node, menu.scope) ?? []),
  ] : [];

  const handleKeys = (event: KeyboardEvent<HTMLDivElement>, row: TreeRow, index: number) => {
    if (event.target !== event.currentTarget || event.nativeEvent.isComposing) return;
    const { node, parent } = row;
    const { key } = event;
    if (hasMenu && (key === 'ContextMenu' || event.shiftKey && key === 'F10')) {
      event.preventDefault(); event.stopPropagation(); openMenu(node, { anchor: event.currentTarget });
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const next = visible[Math.max(0, Math.min(visible.length - 1, index + (key === 'ArrowUp' ? -1 : 1)))]!.node.id;
      focus(next);
      onSelect(event.shiftKey ? [...new Set([...selected, node.id, next])] : [next]);
    } else if (key === 'ArrowRight') {
      event.preventDefault();
      if (node.children) {
        if (!expanded.has(node.id)) toggle(node.id);
        else if (node.children[0]) focus(node.children[0].id);
      }
    } else if (key === 'ArrowLeft') {
      event.preventDefault();
      if (node.children && expanded.has(node.id)) toggle(node.id);
      else if (parent) focus(parent);
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault(); focus(visible[key === 'Home' ? 0 : visible.length - 1]!.node.id);
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (key === 'Enter' && node.children) toggle(node.id); else onSelect([node.id]);
    } else if (key === 'F2') {
      event.preventDefault(); rename(node);
    }
  };

  return <>
    <div ref={root} role="tree" aria-label={label} aria-multiselectable="true">
      {visible.map((row, index) => {
        const { node, level, position, siblings } = row;
        const chosen = selected.includes(node.id);
        const open = node.children ? expanded.has(node.id) : undefined;
        const menuLabel = `${node.name}的更多操作`;
        return <div key={node.id} role="treeitem" tabIndex={tabbable === node.id ? 0 : -1}
          className="gc-candidate-object-row gc-candidate-tree-row" data-node-id={node.id} data-focus-key={`tree:${label}:${node.id}`}
          data-current={chosen || undefined} data-drop-target={drop === node.id || undefined}
          aria-selected={chosen} aria-expanded={open} aria-level={level} aria-posinset={position} aria-setsize={siblings}
          style={{ paddingInlineStart: 4 + (level - 1) * 14 }}
          onFocus={event => { if (event.target === event.currentTarget) setFocused(node.id); }}
          onClick={event => {
            if ((event.target as Element).closest('button,input')) return;
            event.currentTarget.focus();
            if (event.shiftKey) {
              const from = Math.max(0, visible.findIndex(item => item.node.id === anchor.current));
              onSelect(visible.slice(Math.min(from, index), Math.max(from, index) + 1).map(item => item.node.id));
            } else if (event.ctrlKey || event.metaKey) onSelect(chosen ? selected.filter(id => id !== node.id) : [...selected, node.id]);
            else { anchor.current = node.id; onSelect([node.id]); }
          }}
          onDoubleClick={() => { if (!node.children && !editing) onSelect([node.id]); }}
          onKeyDown={event => handleKeys(event, row, index)}
          onContextMenu={event => {
            if (!hasMenu || (event.target as Element).closest('input')) return;
            event.preventDefault(); event.stopPropagation();
            openMenu(node, { anchor: event.currentTarget, point: { x: event.clientX, y: event.clientY } });
          }}
          draggable={!!onMove && !editing} onDragStart={event => {
            event.dataTransfer.setData(dragType, node.id);
            event.dataTransfer.setData(selectionDragType, JSON.stringify(chosen ? selected : [node.id]));
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={event => {
            if (onMove && node.children && event.dataTransfer.types.includes(dragType)) { event.preventDefault(); setDrop(node.id); }
          }}
          onDragLeave={() => setDrop(undefined)} onDragEnd={() => setDrop(undefined)} onDrop={event => {
            setDrop(undefined);
            const id = event.dataTransfer.getData(dragType);
            if (!onMove || !node.children || !id) return;
            event.preventDefault();
            let ids = [id];
            try {
              const values = JSON.parse(event.dataTransfer.getData(selectionDragType));
              if (Array.isArray(values) && values.every(value => typeof value === 'string')) ids = values;
            } catch { /* A drag from another tree may contain only the primary object. */ }
            onMove(ids, node.id);
            setExpanded(current => new Set([...current, node.id]));
          }}>
          {node.children ? <CandidateIconButton className="gc-candidate-tree-toggle" tabIndex={-1} label={`${open ? '折叠' : '展开'} ${node.name}`}
            onClick={() => toggle(node.id)}>{open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}</CandidateIconButton>
            : <span className="gc-candidate-tree-indent" aria-hidden="true"/>}
          {node.icon && <span className="gc-candidate-object-icon" aria-hidden="true">{node.icon}</span>}
          {editing === node.id ? <div className="gc-candidate-tree-edit">
            <CandidateInput density="compact" ref={input} aria-label="对象名称" aria-invalid={!!error} value={name} disabled={busy}
              onChange={event => { setName(event.currentTarget.value); setError(''); }} onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); void commit(); }
                if (event.key === 'Escape') { event.preventDefault(); setEditing(undefined); focus(node.id); }
              }}/>
            {error && <small className="gc-candidate-field-error" role="alert">{error}</small>}
          </div> : <span className="gc-candidate-object-label" title={node.name}>{node.name}</span>}
          {node.detail && <span className="gc-candidate-object-meta">{node.detail}</span>}
          {hasMenu && !editing && <CandidateIconButton label={menuLabel} className="gc-candidate-tree-menu" aria-haspopup="menu"
            aria-expanded={menu?.node.id === node.id} onClick={event => openMenu(node, { anchor: event.currentTarget })}><MoreHorizontal size={14}/></CandidateIconButton>}
        </div>;
      })}
      {!visible.length && <p className="gc-candidate-tree-empty" role="status">没有匹配对象</p>}
    </div>
    <CandidateActionMenu label={menu?.node.name ?? label} actions={actions} target={actions.length ? menu?.target ?? null : null} onDismiss={() => setMenu(undefined)}/>
  </>;
}
