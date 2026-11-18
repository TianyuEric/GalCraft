import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './dock-action-menu.css';

export type DockMenuTarget = {
  anchor: HTMLElement;
  point?: { x: number; y: number };
};

export type DockMenuAction = {
  id: string;
  label: string;
  run: () => void;
  shortcut?: string;
  disabledReason?: string;
  danger?: boolean;
  separatorBefore?: boolean;
};

export function DockActionMenu({ label, target, actions, portal, onDismiss }: {
  label: string;
  target: DockMenuTarget | null;
  actions: readonly DockMenuAction[];
  portal?: HTMLElement | null;
  onDismiss: () => void;
}) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!target || !menu) return;
    const view = menu.ownerDocument.defaultView;
    if (!view) return;
    menu.showPopover();
    function position() {
      if (!target || !menu || !view) return;
      const bounds = target.anchor.getBoundingClientRect();
      const { width, height } = menu.getBoundingClientRect();
      const margin = 8;
      const x = target.point?.x ?? bounds.left;
      const y = target.point?.y ?? bounds.bottom + 4;
      const top = y + height <= view.innerHeight - margin ? y : (target.point?.y ?? bounds.top) - height - 4;
      menu.style.left = `${Math.max(margin, Math.min(x, view.innerWidth - width - margin))}px`;
      menu.style.top = `${Math.max(margin, Math.min(top, view.innerHeight - height - margin))}px`;
    }
    position();
    (menu.querySelector<HTMLButtonElement>('[role=menuitem]') ?? menu).focus();
    const observer = new ResizeObserver(position);
    observer.observe(menu);
    view.addEventListener('resize', position);
    view.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      view.removeEventListener('resize', position);
      view.removeEventListener('scroll', position, true);
      if (menu.matches(':popover-open')) menu.hidePopover();
    };
  }, [target, portal]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!target || !menu) return;
    const doc = menu.ownerDocument;
    function dismissOutside(event: PointerEvent) {
      if (!event.composedPath().includes(menu!) && !event.composedPath().includes(target!.anchor)) onDismiss();
    }
    doc.addEventListener('pointerdown', dismissOutside, true);
    return () => doc.removeEventListener('pointerdown', dismissOutside, true);
  }, [target, portal, onDismiss]);

  if (!target) return null;
  const dismissAndFocus = () => {
    onDismiss();
    target.anchor.focus({ preventScroll: true });
  };
  const menu = (
    <div
      ref={menuRef}
      className="gc-dock-action-menu"
      role="menu"
      aria-label={label}
      popover="manual"
      tabIndex={-1}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.stopPropagation();
          if (event.key === 'Escape') event.preventDefault();
          dismissAndFocus();
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]'));
        if (!items.length) return;
        const index = items.findIndex(item => item === event.target);
        const step = event.key === 'ArrowUp' ? -1 : 1;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + step + items.length) % items.length;
        event.preventDefault();
        items[next]?.focus();
      }}
    >
      {actions.map(action => (
        <div key={action.id} role="none">
          {action.separatorBefore && <div className="gc-dock-menu-separator" role="separator" />}
          <button
            type="button"
            data-slot="dock-menu-item"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={Boolean(action.disabledReason) || undefined}
            aria-describedby={action.disabledReason ? `${menuId}-${action.id}` : undefined}
            title={action.disabledReason}
            data-danger={action.danger || undefined}
            onClick={() => {
              if (action.disabledReason) return;
              dismissAndFocus();
              action.run();
            }}
          >
            <span>{action.label}</span>
            {action.shortcut && <span className="gc-dock-menu-shortcut">{action.shortcut}</span>}
          </button>
          {action.disabledReason && <span id={`${menuId}-${action.id}`} hidden>{action.disabledReason}</span>}
        </div>
      ))}
    </div>
  );
  return portal ? createPortal(menu, portal) : menu;
}
