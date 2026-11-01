import { useRef, useState, type ReactNode } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription } from '../ui/alert-dialog.js';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { Button } from '../controls.js';
import { Button as UiButton } from '../ui/button.js';
import './workbench.css';

export type MessageBoxAction = { label: string; tone?: 'primary' | 'danger'; run(): void | Promise<void> };
/** Small decisions only. The calling editor remains mounted while this box is open. */
export function MessageBox({ title, description, cancelLabel = '取消', actions, onClose, returnFocus }: {
  title: string; description: ReactNode; cancelLabel?: string; actions: MessageBoxAction[]; onClose(): void; returnFocus?(): HTMLElement | null;
}) {
  const cancel = useRef<HTMLButtonElement>(null), [returnTo] = useState(() => document.activeElement as HTMLElement | null);
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const run = async (action: MessageBoxAction) => { if (busy) return; setBusy(action.label); setError(''); try { await action.run(); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(null); } };
  return <AlertDialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <AlertDialogContent className="gc-wb-message" initialFocus={cancel} finalFocus={() => returnTo?.isConnected ? returnTo : returnFocus?.() ?? document.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"], [role="tab"][aria-selected="true"]')}>
        <AlertDialogTitle className="gc-wb-message-title"><CircleAlert/>{title}</AlertDialogTitle>
        <AlertDialogDescription render={<div />} className="gc-wb-message-description">{description}</AlertDialogDescription>
        {error && <p role="alert" className="gc-wb-error">{error}</p>}
        <div className="gc-wb-message-actions"><UiButton className="gc-button" variant="outline" ref={cancel} disabled={!!busy} onClick={onClose}>{cancelLabel}</UiButton>
          {actions.map(action => <Button key={action.label} tone={action.tone} disabled={!!busy} onClick={() => void run(action)}>{busy === action.label && <LoaderCircle className="gc-wb-spin"/>}{action.label}</Button>)}</div>
      </AlertDialogContent>
  </AlertDialog>;
}
