import { createRoot } from 'react-dom/client';
import { Popover, PopoverContent } from '../ui/popover-base.js';
import { OwnedDom } from '../owned-dom.js';
/** Existing DOM editors use the same 9ui-derived Popover as React pages. */
export function showContentPopover(content: HTMLElement, anchor: HTMLElement | null, label: string, closed?: () => void) {
  const host = document.createElement('div');
  (document.getElementById('studio-portals') ?? document.body).append(host);
  const root = createRoot(host); let disposed = false;
  const close = () => { if (disposed) return; disposed = true; queueMicrotask(() => { root.unmount(); host.remove(); closed?.(); }); };
  root.render(<Popover open onOpenChange={open => { if (!open) close(); }}><PopoverContent anchor={anchor} align="start" aria-label={label} className="studio-content-popover"
    initialFocus={() => content.querySelector<HTMLElement>('input,button,textarea')} finalFocus={() => anchor?.isConnected ? anchor : false}
    onKeyDownCapture={event => { if (event.nativeEvent.isComposing && ['Enter','Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); } }}>
    <OwnedDom node={content}/>
  </PopoverContent></Popover>);
  return { root: host, close };
}
