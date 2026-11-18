import { useLayoutEffect, useRef, type ComponentPropsWithoutRef, type MouseEvent, type ReactNode } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { DockMenuTarget } from './DockActionMenu.js';
import './dock-tabs.css';

// Tab structure and overflow behavior adapted from NarraLeaf Studio 08c973cd64d3c2bc54b3c44e5e38307e79d9fef5
// (src/renderer/apps/workspace/components/layout/EditorGroup.tsx, MPL-2.0).
const revealMargin = 12;

function revealActiveTab(strip: HTMLDivElement) {
  const tab = strip.querySelector<HTMLElement>('[data-dock-tab][data-current=true]');
  if (!tab || strip.scrollWidth <= strip.clientWidth) return;
  const viewport = strip.getBoundingClientRect();
  const bounds = tab.getBoundingClientRect();
  const margin = Math.min(revealMargin, Math.max(0, (strip.clientWidth - bounds.width) / 2));
  const left = bounds.left - viewport.left;
  const right = bounds.right - viewport.left;
  if (left < margin) strip.scrollLeft += left - margin;
  else if (right > strip.clientWidth - margin) strip.scrollLeft += right - strip.clientWidth + margin;
}

function syncOverflow(strip: HTMLDivElement) {
  strip.toggleAttribute('data-fade-start', strip.scrollLeft > 1);
  strip.toggleAttribute('data-fade-end', strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
}

export function DockTabList({ activeView, views, onActivate, children, label = '工作面标签', className, onKeyDown }: {
  activeView: string;
  views: readonly string[];
  onActivate?(id: string): void;
  children: ReactNode;
  label?: string;
  className?: string;
  onKeyDown?: ComponentPropsWithoutRef<'div'>['onKeyDown'];
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const order = views.join('\n');

  useLayoutEffect(() => {
    const strip = viewport.current!;
    const sync = () => syncOverflow(strip);
    const resize = new ResizeObserver(() => {
      revealActiveTab(strip);
      sync();
    });
    resize.observe(strip);
    resize.observe(content.current!);

    function wheel(event: WheelEvent) {
      // Native horizontal gestures already scroll this viewport. Translate a vertical mouse wheel.
      if (event.ctrlKey || event.metaKey || event.deltaX || !event.deltaY || strip.scrollWidth <= strip.clientWidth) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
      strip.scrollLeft += event.deltaY * unit;
    }

    strip.addEventListener('scroll', sync, { passive: true });
    strip.addEventListener('wheel', wheel, { passive: false });
    return () => {
      resize.disconnect();
      strip.removeEventListener('scroll', sync);
      strip.removeEventListener('wheel', wheel);
    };
  }, []);

  useLayoutEffect(() => {
    const strip = viewport.current!;
    revealActiveTab(strip);
    syncOverflow(strip);
  }, [activeView, order]);

  return (
    <div ref={viewport} className={['gc-dock-tabs', className].filter(Boolean).join(' ')} role="tablist" aria-label={label}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.altKey) return;
        const target = event.target as HTMLElement;
        const index = views.indexOf(target.dataset.tabView ?? '');
        if (index < 0) return;
        const { key } = event;
        if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;
        const step = key === 'ArrowLeft' ? -1 : 1;
        const next = key === 'Home' ? 0 : key === 'End' ? views.length - 1 : (index + step + views.length) % views.length;
        event.preventDefault();
        if (onActivate) onActivate(views[next]!);
        else event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
      }}>
      <div ref={content} className="gc-dock-tabs-content" role="presentation">{children}</div>
    </div>
  );
}

export function DockTab({
  viewId, title, tabId, controls, active, groupActive = true, preview, dirty, error, description, icon, menuOpen,
  onActivate, onClose, closeLabel = `关闭 ${title}`, onKeep, onMenu, ...props
}: Omit<ComponentPropsWithoutRef<'div'>, 'title' | 'children'> & {
  viewId: string;
  title: string;
  tabId: string;
  controls: string;
  active: boolean;
  groupActive?: boolean;
  preview?: boolean;
  dirty?: boolean;
  error?: string;
  description?: string;
  icon?: ReactNode;
  menuOpen?: boolean;
  onActivate(event: MouseEvent<HTMLButtonElement>): void;
  closeLabel?: string;
  onClose?(): void;
  onKeep?(): void;
  onMenu?(target: DockMenuTarget): void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div {...props} className={['gc-dock-tab', props.className].filter(Boolean).join(' ')} data-dock-tab={viewId} data-current={active}
      data-global-current={active && groupActive} data-retention={preview ? 'preview' : 'retained'}
      data-dirty={dirty || undefined}
      data-has-action={Boolean(onClose || dirty) || undefined}
      onDoubleClick={event => {
        if ((event.target as HTMLElement).closest('.gc-dock-tab-close')) return;
        onKeep?.();
      }}
      onContextMenu={event => {
        if (!onMenu) return;
        event.preventDefault();
        event.stopPropagation();
        onMenu({ anchor: trigger.current!, point: { x: event.clientX, y: event.clientY } });
      }}
      onKeyDown={event => {
        if (onMenu && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
          event.preventDefault();
          event.stopPropagation();
          onMenu({ anchor: trigger.current! });
        } else if (onClose && event.key === 'Delete' && event.target === trigger.current) {
          event.preventDefault();
          onClose();
        }
      }}>
      <button type="button" data-slot="dock-tab" ref={trigger} className="gc-dock-tab-trigger"
        id={tabId} data-tab-view={viewId} role="tab" aria-selected={active} aria-controls={controls}
        aria-description={description ?? error ?? (dirty ? '有未保存或未应用的修改' : undefined)}
        aria-haspopup={onMenu ? 'menu' : undefined} aria-expanded={menuOpen || undefined}
        tabIndex={active ? 0 : -1} title={title} onClick={onActivate}>
        {icon && <span className="gc-dock-tab-icon" aria-hidden="true">{icon}</span>}
        <span className="gc-dock-tab-label">{title}</span>
        {error && <span className="gc-dock-tab-error" title={error} aria-hidden="true"><AlertCircle size={14}/></span>}
      </button>
      {(onClose || dirty) && <span className="gc-dock-tab-action">
        {dirty && <span className="gc-dock-tab-dirty gc-unsaved-dot" aria-hidden="true"/>}
        {onClose && <button type="button" data-slot="dock-tab-close" className="gc-dock-tab-close" aria-label={closeLabel}
          tabIndex={active ? 0 : -1} onClick={onClose}>
          <X size={12} aria-hidden="true"/>
        </button>}
      </span>}
    </div>
  );
}
