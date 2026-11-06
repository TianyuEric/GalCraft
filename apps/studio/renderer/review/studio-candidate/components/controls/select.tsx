import { Children, Fragment, isValidElement, useId, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { CandidateButton, CandidateInput } from './primitives.js';

type Option = { value: string; label: ReactNode; text: string; disabled?: boolean };
type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean; label?: string };

function labelText(value: ReactNode): string {
  return Children.toArray(value).map(child => isValidElement<{ children?: ReactNode }>(child) ? labelText(child.props.children) : String(child ?? '')).join('');
}

function optionsOf(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<OptionProps>(child)) return [];
    if (child.type === Fragment || child.type === 'optgroup') return optionsOf(child.props.children).map(option => ({ ...option, disabled: option.disabled || child.props.disabled }));
    if (child.type !== 'option') return [];
    const text = child.props.label ?? labelText(child.props.children);
    return [{ value: String(child.props.value ?? text), label: child.props.children ?? text, text, disabled: child.props.disabled }];
  });
}

export type CandidateSelectProps = Omit<ComponentPropsWithoutRef<'button'>, 'value' | 'defaultValue' | 'onChange' | 'children' | 'type'> & {
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  density?: 'compact' | 'standard';
  placeholder?: string;
  name?: string;
  readOnly?: boolean;
  searchLabel?: string;
  required?: boolean;
};

/** Options describe data; the trigger and list are candidate-owned visible controls. */
export function CandidateSelect({ value, defaultValue, onValueChange, children, density, placeholder = '请选择', className,
  disabled, readOnly, name, searchLabel, required, onKeyDown, onClick, title, ...props }: CandidateSelectProps) {
  const options = optionsOf(children);
  const [localValue, setLocalValue] = useState(String(defaultValue ?? options[0]?.value ?? ''));
  const selected = String(value ?? localValue);
  const selectedOption = options.find(option => option.value === selected);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [requiredError, setRequiredError] = useState(false);
  const shown = options.filter(option => !query.trim() || option.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const typed = useRef({ text: '', at: 0 });
  const dismiss = (focus = false) => { setOpen(false); setQuery(''); if (focus) trigger.current?.focus({ preventScroll: true }); };
  const commit = (option: Option) => {
    if (disabled || readOnly || option.disabled) return;
    setLocalValue(option.value);
    setRequiredError(false);
    onValueChange?.(option.value);
    dismiss(true);
  };
  const enabledItems = () => Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role=option]:not([aria-disabled=true])') ?? []);

  useLayoutEffect(() => {
    const menu = popup.current, anchor = trigger.current;
    if (!open || !menu || !anchor) return;
    const view = anchor.ownerDocument.defaultView!;
    menu.showPopover();
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      const roomBelow = view.innerHeight - bounds.bottom - 12;
      const roomAbove = bounds.top - 12;
      const below = roomBelow >= Math.min(menu.scrollHeight, 240) || roomBelow >= roomAbove;
      menu.style.width = `${Math.min(Math.max(bounds.width, 160), view.innerWidth - 16)}px`;
      menu.style.maxHeight = `${Math.max(32, Math.min(240, below ? roomBelow : roomAbove))}px`;
      const size = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(bounds.left, view.innerWidth - size.width - 8))}px`;
      menu.style.top = `${Math.max(8, below ? bounds.bottom + 4 : bounds.top - size.height - 4)}px`;
    };
    position();
    const first = (searchLabel ? menu.querySelector<HTMLInputElement>('input') : null) ?? menu.querySelector<HTMLButtonElement>('[aria-selected=true]') ?? enabledItems()[0];
    first?.focus({ preventScroll: true }); first?.scrollIntoView({ block: 'nearest' });
    const observer = new ResizeObserver(position); observer.observe(anchor); observer.observe(menu);
    const outside = (event: PointerEvent) => { if (!event.composedPath().includes(menu) && !event.composedPath().includes(anchor)) { setOpen(false); setQuery(''); } };
    anchor.ownerDocument.addEventListener('pointerdown', outside, true);
    view.addEventListener('resize', position);
    view.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      anchor.ownerDocument.removeEventListener('pointerdown', outside, true);
      view.removeEventListener('resize', position);
      view.removeEventListener('scroll', position, true);
      if (menu.matches(':popover-open')) menu.hidePopover();
    };
  }, [open]);

  const typeahead = (key: string) => {
    if (key.length !== 1 || key === ' ') return false;
    const now = Date.now();
    typed.current = { text: (now - typed.current.at > 700 ? '' : typed.current.text) + key.toLocaleLowerCase(), at: now };
    const matching = options.find(option => !option.disabled && option.text.toLocaleLowerCase().startsWith(typed.current.text));
    if (!matching) return false;
    if (open) Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? []).find(item => item.dataset.value === matching.value)?.focus();
    else commit(matching);
    return true;
  };

  return <>
    <CandidateButton {...props} id={props.id ?? `${id}-trigger`} ref={trigger} density={density} variant="outline" className={['gc-candidate-select', 'gc-candidate-input', className].filter(Boolean).join(' ')}
      role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} aria-readonly={readOnly || undefined}
      aria-required={required || undefined} aria-invalid={requiredError || props['aria-invalid']} aria-describedby={[props['aria-describedby'], requiredError ? `${id}-required` : ''].filter(Boolean).join(' ') || undefined}
      disabled={disabled} title={title ?? selectedOption?.text} onClick={event => { onClick?.(event); if (!event.defaultPrevented) { setQuery(''); setOpen(current => !current); } }}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.nativeEvent.isComposing) return;
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); setOpen(true); }
        else if (typeahead(event.key)) { event.preventDefault(); event.stopPropagation(); }
      }}>
      <span>{selectedOption?.label ?? (selected || placeholder)}</span><ChevronDown size={16} aria-hidden="true"/>
    </CandidateButton>
    {(name || required) && <input type={required ? 'text' : 'hidden'} className="gc-candidate-validation-input" tabIndex={-1} aria-hidden="true"
      name={name} value={selected} onChange={() => {}} required={required} disabled={disabled || readOnly}
      onInvalid={event => { event.preventDefault(); setRequiredError(true); trigger.current?.focus(); }}/>}
    {requiredError && <span id={`${id}-required`} className="gc-candidate-field-error">请选择一项。</span>}
    {open && <div ref={popup} className="gc-candidate-select-popup" popover="manual" onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); event.stopPropagation(); dismiss(true); return; }
        const items = enabledItems();
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          const index = items.indexOf(event.target as HTMLButtonElement), step = event.key === 'ArrowUp' ? -1 : event.key === 'PageUp' ? -8 : event.key === 'PageDown' ? 8 : 1;
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + step));
          items[next]?.focus();
        } else if (event.target instanceof HTMLInputElement) {
          if (event.key === 'Enter') { event.preventDefault(); enabledItems()[0]?.click(); }
        } else if (typeahead(event.key)) { event.preventDefault(); event.stopPropagation(); }
      }}>
      {searchLabel && <div className="gc-candidate-select-search"><CandidateInput type="search" density="compact" aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event => setQuery(event.currentTarget.value)}/></div>}
      <div id={id} role="listbox" aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby'] ?? (props['aria-label'] ? undefined : trigger.current?.labels?.[0]?.id || props.id || `${id}-trigger`)}>
      {shown.map((option, index) => <CandidateButton key={`${option.value}:${index}`} role="option" tabIndex={-1} data-value={option.value}
        aria-selected={selected === option.value} aria-disabled={option.disabled || readOnly || undefined} title={option.text}
        onClick={() => commit(option)}><Check size={16} aria-hidden="true" data-selected={selected === option.value}/><span>{option.label}</span></CandidateButton>)}
      </div>
      {!shown.length && <p className="gc-candidate-select-empty" role="status">没有匹配项</p>}
    </div>}
  </>;
}
