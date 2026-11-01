import { useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type Ref } from 'react';
import { createPortal } from 'react-dom';

export type PlayerSelectOption = { value: string; label: string; disabled?: boolean };
type PartProps = HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> };
export type PlayerSelectProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange'> & {
  value: string; options: PlayerSelectOption[]; onValueChange(value: string): void;
  ref?: Ref<HTMLButtonElement>; listProps?: PartProps; itemProps?: PartProps;
};
const assign = <T,>(ref: Ref<T> | undefined, node: T | null) => { if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; };

/** A listbox in the Player's logical canvas. Its portal inherits the work's theme and is never scaled twice. */
export function PlayerSelect({ value, options, onValueChange, listProps, itemProps, ref, className, disabled, children: _children, ...triggerProps }: PlayerSelectProps) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null), [position, setPosition] = useState({ left: 0, top: 0, width: 240, maxHeight: 360 });
  const search = useRef({ text: '', at: 0 });
  const selected = options.findIndex(option => option.value === value), enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const close = () => setOpen(false);
  const show = (last = false) => { if (disabled || !enabled.length) return; setActive(selected >= 0 && !options[selected]?.disabled ? selected : last ? enabled.at(-1)! : enabled[0]!); setOpen(true); };
  const choose = (index: number) => { const option = options[index]; if (!option || option.disabled) return; close(); if (option.value !== value) onValueChange(option.value); trigger.current?.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    if (!open || !trigger.current || disabled) { if (disabled) close(); return; }
    const button = trigger.current, canvas = button.closest<HTMLElement>('.gc-canvas') ?? button.closest<HTMLElement>('.galcraft-player');
    if (!canvas) return;
    const host = document.createElement('div'); host.className = 'gc-select-portal';
    const page = button.closest<HTMLElement>('[data-gc-page]');
    for (const name of ['gcPage', 'gcPageId']) if (page?.dataset[name]) host.dataset[name] = page.dataset[name];
    if (button.dataset.gcComponent) host.dataset.gcComponent = button.dataset.gcComponent;
    const computed = getComputedStyle(button); host.style.font = computed.font; host.style.color = computed.color;
    canvas.append(host); setPortal(host);
    const positionList = () => {
      const bounds = button.getBoundingClientRect(), frame = canvas.getBoundingClientRect(), sx = frame.width / canvas.offsetWidth || 1, sy = frame.height / canvas.offsetHeight || 1;
      const below = (frame.bottom - bounds.bottom) / sy - 12, above = (bounds.top - frame.top) / sy - 12;
      const upward = below < 160 && above > below, maxHeight = Math.max(48, Math.min(360, upward ? above : below));
      const width = Math.min(bounds.width / sx, canvas.offsetWidth - 16), left = Math.max(8, Math.min((bounds.left - frame.left) / sx, canvas.offsetWidth - width - 8));
      setPosition({ left, top: upward ? (bounds.top - frame.top) / sy - 6 : (bounds.bottom - frame.top) / sy + 6, width, maxHeight });
      host.dataset.upward = String(upward);
    };
    positionList();
    const outside = (event: PointerEvent) => { if (!button.contains(event.target as Node) && !host.contains(event.target as Node)) close(); };
    const focus = (event: FocusEvent) => { if (!button.contains(event.target as Node) && !host.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside); document.addEventListener('focusin', focus);
    window.addEventListener('resize', positionList);
    const observer = new ResizeObserver(positionList); observer.observe(canvas); observer.observe(button);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', focus); window.removeEventListener('resize', positionList); observer.disconnect(); host.remove(); setPortal(null); };
  }, [open, disabled]);
  useLayoutEffect(() => { if (open) list.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [open, active, portal]);
  const move = (delta: number) => { const index = enabled.indexOf(active); setActive(enabled[(index + delta + enabled.length) % enabled.length] ?? 0); };
  return <><button {...triggerProps} type="button" disabled={disabled || !enabled.length} className={`gc-select-trigger ${className ?? ''}`} style={{...triggerProps.style,minHeight:triggerProps.style?.minHeight||48,padding:!triggerProps.style?.padding||/^(0px ?)+$/.test(String(triggerProps.style.padding))?'8px 12px':triggerProps.style.padding,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}} ref={node => { trigger.current = node; assign(ref, node); }}
    role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined}
    onClick={event => { triggerProps.onClick?.(event); if (!event.defaultPrevented) open ? close() : show(); }}
    onKeyDown={event => {
      triggerProps.onKeyDown?.(event); if (event.defaultPrevented) return;
      if (event.key === 'Tab') { close(); return; }
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); if (!open) { show(event.key === 'ArrowUp' || event.key === 'End'); return; }
        if (event.key === 'Enter' || event.key === ' ') choose(active);
        else if (event.key === 'Home') setActive(enabled[0]!); else if (event.key === 'End') setActive(enabled.at(-1)!);
        else move(event.key === 'ArrowUp' ? -1 : event.key === 'PageUp' ? -8 : event.key === 'PageDown' ? 8 : 1);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const now = Date.now(), text = (now - search.current.at < 700 ? search.current.text : '') + event.key.toLocaleLowerCase(); search.current = { text, at: now };
        const match = enabled.find(index => options[index]!.label.toLocaleLowerCase().startsWith(text)); if (match !== undefined) { if (!open) show(); setActive(match); }
      }
    }}><span className="gc-select-value">{options[selected]?.label ?? value}</span><svg className="gc-select-chevron" aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></button>
    {open && portal && createPortal(<div {...listProps} data-gc-select-part="list" id={id} role="listbox" aria-label={triggerProps['aria-label']} className={`gc-select-list ${listProps?.className ?? ''}`} ref={node => { list.current = node; assign(listProps?.ref, node); if(node)Object.assign(node.style,{position:'absolute',display:'block',left:`${position.left}px`,top:`${position.top}px`,minWidth:`${position.width}px`,width:`${position.width}px`,height:'auto',maxHeight:`${position.maxHeight}px`,overflow:'auto'}); }}
      style={{ ...listProps?.style, position: 'absolute', left: position.left, top: position.top, minWidth: position.width, width: position.width, maxHeight: position.maxHeight, ...(portal.dataset.upward === 'true' ? { transform: 'translateY(-100%)' } : {}) }} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      {options.map((option, index) => <div {...itemProps} data-gc-select-part="item" key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined} data-option-index={index} data-active={index === active || undefined}
        ref={node=>{assign(itemProps?.ref,node);if(node)Object.assign(node.style,{display:'flex',flexDirection:'row',alignItems:'center',justifyContent:'space-between',height:'auto'});}}
        data-gc-state={option.disabled ? 'disabled' : index === active ? 'focus' : option.value === value ? 'selected' : 'normal'} className={`gc-select-item ${itemProps?.className ?? ''}`}
        onPointerMove={() => { if (!option.disabled) setActive(index); }} onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}>
        <span>{option.label}</span><svg className="gc-select-check" aria-hidden="true" viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
      </div>)}
    </div>, portal)}</>;
}
