import { useState, useEffect, useId, Children, isValidElement, cloneElement } from 'react';
import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { Check, ChevronDown, Sparkles, X } from 'lucide-react';
import { Combobox } from '@base-ui/react/combobox';
import { Button as UiButton } from './ui/button.js';
import { Badge as UiBadge } from './ui/badge.js';
import { Card } from './ui/card.js';
import { Dialog, DialogContent, DialogTitle, DialogClose } from './ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select.js';
import './controls.css';
import { formHint } from './form-hints.js';

export function Button({ children, tone, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'quiet' | 'danger' }) {
  return <UiButton type="button" variant={tone === 'primary' ? 'default' : tone === 'quiet' ? 'ghost' : tone === 'danger' ? 'destructive' : 'outline'}
    {...props} className={`gc-button ${className ?? ''}`}>{children}</UiButton>;
}
export function Choice({ label, value, options, onChange, disabled, ...accessibility }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange(value: string): void; disabled?: boolean;
  'aria-label'?: string; 'aria-required'?: boolean; 'aria-invalid'?: boolean; 'aria-describedby'?: string;
}) {
  const locale = document.getElementById('studio-portals')?.lang ?? 'zh-CN';
  if (options.length >= 10) return <Combobox.Root items={options} value={options.find(option => option.value === value) ?? null} disabled={disabled}
    isItemEqualToValue={(item, selected) => item.value === selected.value} onValueChange={selected => selected !== null && onChange(selected.value)}>
    <Combobox.Trigger data-slot="choice-trigger" className="gc-choice-trigger" aria-label={label} {...accessibility}><span>{options.find(option => option.value === value)?.label ?? label}</span><ChevronDown size={16} /></Combobox.Trigger>
    <Combobox.Portal container={document.getElementById('studio-portals')}><Combobox.Positioner className="gc-choice-positioner" sideOffset={6} align="start" collisionPadding={16}>
      <Combobox.Popup className="gc-choice-popup"><Combobox.Input data-slot="choice-search" className="gc-choice-search" aria-label={locale === 'en' ? `Search ${label}` : locale === 'ja' ? `${label}を検索` : `搜索${label}`}
        placeholder={locale === 'en' ? 'Type to filter…' : locale === 'ja' ? '入力して絞り込み…' : '输入关键词筛选…'} />
        <Combobox.Empty className="gc-choice-empty">{locale === 'en' ? 'No matches' : locale === 'ja' ? '該当なし' : '没有匹配项'}</Combobox.Empty>
        <Combobox.List className="gc-choice-list">{(option: { value: string; label: string }) => <Combobox.Item key={option.value} value={option} className="gc-choice-item"><span>{option.label}</span><Combobox.ItemIndicator data-slot="choice-item-indicator" className="gc-choice-indicator"><Check size={15} /></Combobox.ItemIndicator></Combobox.Item>}</Combobox.List>
      </Combobox.Popup>
    </Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>;
  return <Select value={value} items={options} disabled={disabled} onValueChange={value => value !== null && onChange(String(value))}>
    <SelectTrigger aria-label={label} {...accessibility} className="w-full"><SelectValue /></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}
function modalContents(children: ReactNode): ReactNode {
  const items = Children.toArray(children);
  const only = items.length === 1 && isValidElement<{ children?: ReactNode; className?: string }>(items[0]) ? items[0] : null;
  if (only?.type === 'form') return cloneElement(only, { className: `${only.props.className ?? ''} gc-dialog-form` }, modalContents(only.props.children));
  const last = items.at(-1);
  const footer = isValidElement<{ className?: string }>(last) && (last.type === 'footer' || last.props.className?.split(' ').includes('dialog-actions')) ? last : null;
  return <><div className="gc-dialog-body">{footer ? items.slice(0, -1) : items}</div>{footer && cloneElement(footer, { className: `${footer.props.className ?? ''} gc-dialog-footer` })}</>;
}
export function Modal({ title, children, close, wide = false, size = wide ? 'wide' : 'default', presentation = 'dialog', className = '' }: {
  title: string; children: ReactNode; close(): void; wide?: boolean; size?: 'default' | 'wide' | 'tutorial' | 'full'; presentation?: 'dialog' | 'sheet'; className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setOpen(true)); return () => cancelAnimationFrame(frame); }, []);
  const [returnFocus] = useState(() => document.activeElement as HTMLElement | null);
  const locale = document.getElementById('studio-portals')?.lang;
  return <Dialog open={open} onOpenChange={value => { if (!value) close(); else setOpen(true); }}>
    <DialogContent aria-modal="true" className={`gc-dialog ${size === 'wide' ? 'wide' : ''} ${size === 'tutorial' ? 'gc-tutorial' : ''} ${size === 'full' ? 'gc-dialog-full' : ''} ${presentation === 'sheet' ? 'gc-sheet' : ''} ${className}`} showCloseButton={false} finalFocus={() => returnFocus?.isConnected ? returnFocus : null}>
      <header><DialogTitle>{title}</DialogTitle>
        <DialogClose render={<UiButton variant="ghost" size="icon" />} aria-label={locale === 'en' ? 'Close' : locale === 'ja' ? '閉じる' : '关闭'}><X /></DialogClose>
      </header>
      {modalContents(children)}
    </DialogContent>
  </Dialog>;
}
export function Field({ label, children, help, required = false, error, name }: { label: string; children: ReactNode; help?: string; required?: boolean; error?: string; name?: string }) {
  const id = useId(), [nativeError, setNativeError] = useState('');
  const locale = document.getElementById('studio-portals')?.lang ?? 'zh-CN';
  const child = Children.count(children) === 1 && isValidElement<Record<string, unknown>>(children) ? children : null;
  const needed = required || child?.props.required === true, message = error || nativeError;
  const content = child ? cloneElement(child, { ...(!['checkbox','radio','range','file','color'].includes(String(child.props.type)) && !child.props.options ? { placeholder: child.props.placeholder ?? help ?? formHint(locale, label, String(child.props.type ?? 'text'), { min: child.props.min as number | undefined, max: child.props.max as number | undefined }) } : {}), 'aria-label': child.props['aria-label'] ?? label, 'aria-required': needed || undefined, 'aria-invalid': !!message || undefined, 'aria-describedby': message ? `${id}-error` : help ? `${id}-help` : undefined }) : children;
  return <div className="gc-field" data-field={name} onInputCapture={() => setNativeError('')} onChangeCapture={() => setNativeError('')}
    onInvalidCapture={event => { const control = event.target as HTMLInputElement; setNativeError(control.validity.valueMissing ? (locale === 'en' ? `Enter ${label}` : locale === 'ja' ? `${label}を入力してください` : `请填写${label}`) : control.validationMessage); }}>
    <span>{label}{needed && <small className="field-required">{locale === 'en' ? 'Required' : locale === 'ja' ? '必須' : '必填'}</small>}</span>
    {content}{help && <small id={`${id}-help`}>{help}</small>}{message && <small className="field-error" id={`${id}-error`} role="alert">{message}</small>}
  </div>;
}
export function Empty({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return <Card className="gc-empty border-dashed shadow-none"><span className="gc-empty-mark"><Sparkles size={24} /></span>
    <h2>{title}</h2><p>{detail}</p>{children}</Card>;
}
export function Badge({ children, tone = '', source }: { children: ReactNode; tone?: string; source?: 'official' | 'personal' | 'project' }) {
  return <UiBadge className={source ? 'gc-source-badge' : undefined} data-source={source}
    variant={source ? 'outline' : tone === 'error' ? 'danger' : tone === 'warm' ? 'warning' : tone === 'good' ? 'success' : 'secondary'}>{children}</UiBadge>;
}
