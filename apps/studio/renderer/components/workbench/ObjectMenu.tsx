import { useEffect, useRef } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from '../ui/dropdown-menu.js';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuLabel, ContextMenuSeparator, ContextMenuItem } from '../ui/context-menu.js';
import { createRoot } from 'react-dom/client';

export type ObjectMenuAction = { label: string; run(): void; disabled?: string; danger?: boolean };
export type ObjectMenuGroup = { label: string; actions: ObjectMenuAction[] };
export type ObjectMenuOrigin = { element: HTMLElement; x?: number; y?: number; kind?: 'context' | 'dropdown' };
/** All object menu entry points share the caller's explicit primary object and selection. */
export function ObjectMenu({ origin, groups, close }: { origin: ObjectMenuOrigin; groups: ObjectMenuGroup[]; close(): void }) {
  const restore = useRef(true);
  useEffect(() => { const row = origin.element.closest<HTMLElement>('.gc-wb-tree-row,.authoring-asset,.authoring-card'); origin.element.dataset.menuOpen = 'true'; if (row) row.dataset.menuOpen = 'true'; return () => { delete origin.element.dataset.menuOpen; if (row) delete row.dataset.menuOpen; }; }, [origin.element]);
  const point = origin.x === undefined ? origin.element : { getBoundingClientRect: () => new DOMRect(origin.x, origin.y, 0, 0) };
  const context = origin.kind === 'context' || origin.x !== undefined || origin.element.matches('[role="treeitem"],[role="tab"]');
  const Root = context ? ContextMenu : DropdownMenu, Content = context ? ContextMenuContent : DropdownMenuContent;
  const Group = context ? ContextMenuGroup : DropdownMenuGroup, Label = context ? ContextMenuLabel : DropdownMenuLabel;
  const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator, Item = context ? ContextMenuItem : DropdownMenuItem;
  return <Root open onOpenChange={(open, details) => { if (!open) { restore.current = details.reason !== 'outside-press'; close(); } }}>
      <Content anchor={point} align="start" sideOffset={4} className="gc-object-menu" finalFocus={() => restore.current && origin.element.isConnected ? origin.element : false}>
        {groups.map((group, index) => <Group key={index}>{index > 0 && <Separator/>}{group.label && <Label className="gc-object-menu-label">{group.label}</Label>}
          {group.actions.map(action => <Item key={action.label} disabled={!!action.disabled} onClick={action.run} data-danger={action.danger || undefined}>
            <span>{action.label}</span>{action.disabled && <small>{action.disabled}</small>}
          </Item>)}
        </Group>)}
      </Content>
  </Root>;
}

export function isObjectMenuKey(event: { key: string; shiftKey: boolean }) { return event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10'; }

/** Opening on a selected member preserves even hidden members and the range anchor. */
export function objectMenuSelection(selected: string[], primary: string) { return selected.includes(primary) ? selected : [primary]; }

/** Adapter for the existing owned DOM editors; menu semantics stay in the shared component. */
export function showObjectMenu(origin: ObjectMenuOrigin, groups: ObjectMenuGroup[]) {
  const host = document.createElement('div'); (document.getElementById('studio-portals') ?? document.body).append(host);
  const root = createRoot(host);
  let closed = false;
  const close = () => { if (closed) return; closed = true; queueMicrotask(() => { root.unmount(); host.remove(); }); };
  root.render(<ObjectMenu origin={origin} groups={groups.map(group => ({ ...group, actions: group.actions.map(action => ({ ...action, run: () => { close(); setTimeout(action.run, 0); } })) }))} close={close}/>);
}
