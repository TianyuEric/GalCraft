import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type CSSProperties, type ComponentProps } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { CandidateButton, CandidateIconButton } from './primitives.js';

import { DockActionMenu as CandidateActionMenu, type DockMenuTarget as CandidateMenuTarget, type DockMenuAction as CandidateMenuAction } from '../../../../components/workbench/DockActionMenu.js';
export { CandidateActionMenu };
export type { CandidateMenuTarget, CandidateMenuAction };

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
