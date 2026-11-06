import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type CSSProperties, type ComponentProps } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { CandidateButton, CandidateIconButton } from './primitives.js';

export type CandidateMenuTarget = {
  anchor: HTMLElement;
  point?: { x: number; y: number };
};

export type CandidateMenuAction = {
  id: string;
  label: string;
  run: () => void;
  shortcut?: string;
  disabledReason?: string;
  danger?: boolean;
  separatorBefore?: boolean;
};

export function CandidateMenuButton({ label, actions, children, onKeyDown, ...props }: Omit<ComponentProps<typeof CandidateButton>, 'onClick'> & {
  label: string;
  actions: readonly CandidateMenuAction[];
}) {
  const [target, setTarget] = useState<CandidateMenuTarget | null>(null);
  return <>
    <CandidateButton {...props} aria-label={props['aria-label'] ?? label} aria-haspopup="menu" aria-expanded={!!target}
      onClick={event => setTarget(current => current ? null : { anchor: event.currentTarget })}
      onKeyDown={event => { onKeyDown?.(event); if (!event.defaultPrevented && event.key === 'ArrowDown') { event.preventDefault(); setTarget({ anchor: event.currentTarget }); } }}>
      {children ?? label}<ChevronDown size={12}/>
    </CandidateButton>
    <CandidateActionMenu label={label} actions={actions} target={target} onDismiss={() => setTarget(null)}/>
  </>;
}

export function CandidateActionMenu({ label, target, actions, portal, onDismiss }: {
  label: string;
  target: CandidateMenuTarget | null;
  actions: readonly CandidateMenuAction[];
  portal?: HTMLElement | null;
  onDismiss: () => void;
}) {
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
      className="gc-candidate-action-menu"
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
          {action.separatorBefore && <div className="gc-candidate-menu-separator" role="separator" />}
          <CandidateButton
            role="menuitem"
            density="compact"
            tabIndex={-1}
            disabledReason={action.disabledReason}
            data-danger={action.danger || undefined}
            onClick={() => {
              dismissAndFocus();
              action.run();
            }}
          >
            <span>{action.label}</span>
            {action.shortcut && <span className="gc-candidate-menu-shortcut">{action.shortcut}</span>}
          </CandidateButton>
        </div>
      ))}
    </div>
  );
  return portal ? createPortal(menu, portal) : menu;
}

export function CandidateReviewDialog({ open, title, description, actions, children, portal, initialFocus, onDismiss, className, style, closeLabel = '关闭', busy }: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  portal?: HTMLElement | null;
  initialFocus?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  className?: string;
  style?: CSSProperties;
  closeLabel?: string;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = dialog.ownerDocument.activeElement as HTMLElement | null;
    dialog.showModal();
    initialFocus?.current?.focus();
    return () => { dialog.close(); queueMicrotask(() => { if (previous?.isConnected) previous.focus({ preventScroll: true }); }); };
  }, [open, portal, initialFocus]);

  const dialog = (
    <dialog
      ref={ref}
      className={['gc-candidate-review-dialog', className].filter(Boolean).join(' ')}
      style={style}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={event => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
    >
      <header className="gc-candidate-review-header"><h2 id={titleId}>{title}</h2><CandidateIconButton density="compact" label={closeLabel} disabled={busy} onClick={onDismiss}><X size={20} aria-hidden="true"/></CandidateIconButton></header>
      {(description || children) && <div className="gc-candidate-review-content">
        {description && <p id={descriptionId}>{description}</p>}
        {children}
      </div>}
      {actions && <footer className="gc-candidate-review-actions">{actions}</footer>}
    </dialog>
  );
  return portal ? createPortal(dialog, portal) : dialog;
}
