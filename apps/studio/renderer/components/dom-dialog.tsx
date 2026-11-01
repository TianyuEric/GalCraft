import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog.js';
import { OwnedDom } from './owned-dom.js';
/** The legacy DOM API keeps its content and close event; 9ui Dialog owns modality. */
export function mountDomDialog(dialog: HTMLDialogElement, finish: () => void) {
  const host = document.createElement('div'), origin = document.activeElement as HTMLElement | null;
  (document.getElementById('studio-portals') ?? document.body).append(host);
  const root = createRoot(host); let disposed = false;
  const cleanup = () => { if(disposed)return;disposed=true;root.unmount();host.remove();finish();if(origin?.isConnected)origin.focus({preventScroll:true}); };
  const render = (open: boolean) => root.render(<Dialog open={open} onOpenChange={next => {
    if(next)return;const cancel=new Event('cancel',{cancelable:true});if(dialog.dispatchEvent(cancel))dialog.close();
  }} onOpenChangeComplete={open => { if(!open)queueMicrotask(cleanup); }}>
    <DialogContent className="gc-dom-dialog-surface" showCloseButton={false} initialFocus={() => dialog.querySelector<HTMLElement>('[autofocus],input:not([disabled]),button:not([disabled]),textarea:not([disabled])')} finalFocus={false}>
      <DialogTitle className="sr-only">{dialog.querySelector('h2')?.textContent ?? dialog.ariaLabel ?? 'Dialog'}</DialogTitle>
      <OwnedDom node={dialog}/>
    </DialogContent>
  </Dialog>);
  dialog.classList.add('gc-owned-dialog');dialog.setAttribute('role','presentation');dialog.open=true;
  flushSync(()=>render(true));
  return {close:()=>render(false)};
}
