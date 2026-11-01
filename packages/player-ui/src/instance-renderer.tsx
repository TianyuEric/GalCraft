import React, { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ComponentConfig, Json, UIAction, UIInteraction, Visual } from '@galcraft/contracts';
import { componentDefinition } from '@galcraft/templates';
import { PlayerSelect } from './select.js';
import { evaluateUICondition, readUIPath, readUIValue, type UIValueContext } from '@galcraft/templates/editor';

export type ComponentInstanceProps = { root: ComponentConfig; context: UIValueContext; label(key: string): string;
  textOverride?(component: ComponentConfig): string | undefined;
  page?: {id:string;key:string};
  contentsOnly?: boolean;
  /** Player's named-style layer applies interactive visuals after author CSS. */
  externalVisualStates?:boolean;
  action(action: UIAction, context: UIValueContext): void | Promise<void>;
  activate?(component: ComponentConfig, context: UIValueContext): void | Promise<void>;
  register?(component: ComponentConfig, element: HTMLElement | null, instance: string): void;
  business?(component: ComponentConfig, children: ReactNode, context: UIValueContext): ReactNode | undefined;
  state?(component: ComponentConfig, context: UIValueContext): { disabled?: boolean; locked?:boolean; selected?: boolean; visible?: boolean; text?: string; value?: unknown };
};
export type BusinessPageAdapter = Pick<ComponentInstanceProps, 'state' | 'business' | 'activate'> & { data: Record<string, unknown> };
const length = (value: ComponentConfig['layout']['width']) => value.unit === 'auto' ? 'auto' : `${value.value}${value.unit === 'px' ? 'px' : '%'}`;
const box = (value: ComponentConfig['layout']['padding']) => `${value.top}px ${value.right}px ${value.bottom}px ${value.left}px`;
export function componentInstanceStyle(component: ComponentConfig, parent?: ComponentConfig, root = false, visual: Partial<Visual> = component.normal): CSSProperties {
  const layout = component.layout, free = !root && (layout.position ? layout.position === 'free' : layout.mode === 'absolute' || parent?.layout.mode === 'absolute');
  const style: CSSProperties = { boxSizing: 'border-box', position: free ? 'absolute' : 'relative', width: root ? '100%' : length(layout.width), height: root ? '100%' : length(layout.height),
    minWidth: layout.minWidth, minHeight: layout.minHeight, maxWidth: layout.maxWidth ?? undefined, maxHeight: layout.maxHeight ?? undefined,
    padding: box(layout.padding), margin: box(layout.margin), gap: layout.gap, zIndex: layout.z, isolation: 'isolate', flexShrink: 0,
    overflow: layout.overflow === 'scroll' ? 'auto' : layout.overflow === 'clip' ? 'hidden' : 'visible',
    display: layout.mode === 'grid' ? 'grid' : layout.mode === 'absolute' ? 'block' : 'flex', flexDirection: layout.mode === 'row' ? 'row' : 'column',
    // A native range's internal track must stretch across the authored control box.
    alignItems: componentDefinition(component.part)?.kind === 'slider' ? 'stretch' : ({ start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch' } as const)[layout.align],
    justifyContent: ({ start: 'flex-start', end: 'flex-end', center: 'center', spaceBetween: 'space-between' } as const)[layout.justify],
    ...(layout.mode === 'grid' ? { gridTemplateColumns: `repeat(${layout.columns}, minmax(0,1fr))` } : {}),
    ...(free ? { left: `calc(${layout.anchorX * 100}% + ${length(layout.x)})`, top: `calc(${layout.anchorY * 100}% + ${length(layout.y)})`, translate: `${-layout.anchorX * 100}% ${-layout.anchorY * 100}%` } : {}),
    ...(component.visualScale !== undefined ? { scale: String(component.visualScale), transformOrigin: 'top left' } : {}),
    ...(visual.color !== undefined ? { color: visual.color } : {}), ...(visual.fontSize !== undefined ? { fontSize: visual.fontSize } : {}),
    ...(visual.fontId ? { fontFamily: `var(--gc-font-${visual.fontId},inherit)` } : {}), ...(visual.lineHeight !== undefined ? { lineHeight: visual.lineHeight } : {}),
    ...(visual.textAlign !== undefined ? { textAlign: visual.textAlign } : {}), ...(visual.wrap !== undefined ? { whiteSpace: visual.wrap ? 'pre-wrap' : 'nowrap' } : {}),
    ...(visual.background ? { backgroundColor: `color-mix(in srgb, ${visual.background.color} ${visual.background.colorOpacity * 100}%, transparent)` } : {}),
    ...(visual.borderColor !== undefined ? { borderColor: visual.borderColor } : {}), ...(visual.borderWidth !== undefined ? { borderWidth: visual.borderWidth, borderStyle: 'solid' } : {}),
    ...(visual.radius !== undefined ? { borderRadius: visual.radius } : {}), ...(visual.opacity !== undefined ? { opacity: visual.opacity } : {}),
    ...(visual.shadow ? { boxShadow: `${visual.shadow.x}px ${visual.shadow.y}px ${visual.shadow.blur}px ${visual.shadow.spread}px ${visual.shadow.color}` } : {}),
  };
  return style;
}
function Instance({ component, parent, context, props, root = false }: { component: ComponentConfig; parent?: ComponentConfig; context: UIValueContext; props: ComponentInstanceProps; root?: boolean }) {
  const [draft, setDraft] = useState<unknown>(component.content.value ?? ''), [interactionState, setInteractionState] = useState<'normal' | 'hover' | 'pressed' | 'focus'>('normal'), composing = useRef(false);
  const showState=(state:typeof interactionState)=>{if(!props.externalVisualStates)setInteractionState(state);};
  const definition=componentDefinition(component.part),kind = definition?.kind ?? 'container', business = props.state?.(component, context) ?? {},activatableContainer=kind==='container'&&!!definition?.action;
  const bound = (key: string, fallback: unknown) => component.bindings?.[key] ? readUIValue(component.bindings[key]!, context) : fallback;
  const visible = component.visible && business.visible !== false && bound('visible', true) !== false;
  const locked=business.locked===true,disabled = locked || business.disabled === true || bound('disabled', false) === true, selected = !locked&&bound('selected',business.selected === true) === true;
  const textBinding = component.bindings?.text;
  const missingText = textBinding?.source === 'variable' ? textBinding.missingText ?? '—' : '';
  const override = props.textOverride?.(component);
  const value = bound('value', business.value ?? draft), text = String(bound('text', override ?? business.text ?? component.content.text ?? (component.content.labelKey ? props.label(String(component.content.labelKey)) : '')) ?? missingText);
  const identity = `${context.instance ?? ''}/${component.id}`;
  const run = async (event: UIInteraction['event'], eventValue?: unknown) => {
    if (disabled) return;
    const current = { ...context, instance: identity, event: { value: eventValue ?? value, checked: Boolean(eventValue ?? value) } };
    if (event === 'click' && !component.interactions?.some(interaction => interaction.event === 'click')) await props.activate?.(component, current);
    for (const interaction of component.interactions ?? []) if (interaction.event === event && evaluateUICondition(interaction.condition, current)) for (const action of interaction.actions) await props.action(action, current);
  };
  const change = async (next: unknown, event: 'input' | 'change' = 'change') => {
    setDraft(next); const target = component.bindings?.value;
    if (target?.source === 'local') await props.action({ kind: 'setLocal', key: target.path, value: { source: 'literal', value: next as Json } }, context);
    else if (target?.source === 'data' && target.path.startsWith('preferences.')) await props.action({ kind: 'official', action: { kind: 'preference', path: target.path.slice(12), value: next as Json } }, context);
    await run(event, next);
  };
  const state = locked ? 'locked' : disabled ? 'disabled' : selected ? 'selected' : interactionState;
  const visual = { ...component.normal, ...(state === 'normal' ? {} : component.states[state]) };
  const style = componentInstanceStyle(component, parent, root, visual);
  if(kind==='text'){style.display='block';if(textBinding?.source==='variable')style.overflowWrap='anywhere';}
  const common = { hidden:!visible, inert:!visible, 'data-gc-part': component.part, 'data-part': component.part, 'data-gc-component': component.id, 'data-gc-instance': identity, 'data-gc-instance-rendered': 'true', 'data-gc-state': state,
    ...(locked?{'data-locked':true}:{}),
    ...(activatableContainer?{role:'button',tabIndex:disabled?-1:0,'aria-disabled':disabled,'aria-pressed':selected,
      onClick:(event:React.MouseEvent<HTMLElement>)=>{const target=event.target as HTMLElement;if(target!==event.currentTarget&&target.closest('button,input,select,textarea,a,[role="button"]')!==event.currentTarget)return;void run('click');},
      onKeyDown:(event:React.KeyboardEvent<HTMLElement>)=>{if(event.target!==event.currentTarget||!['Enter',' '].includes(event.key))return;event.preventDefault();if(!event.repeat)void run('click');}}:{}),
    ...(root&&props.page?{'data-gc-page':props.page.key,'data-gc-page-id':props.page.id}:{}),
    className: `gc-instance gc-${component.part.replaceAll('.', '-')}`, style, ref: (element: HTMLElement | null) => props.register?.(component, element, identity),
    onPointerEnter: () => { if(disabled)return;showState('hover'); void run('pointerEnter'); }, onPointerLeave: () => { if(disabled)return;showState('normal'); void run('pointerLeave'); },
    onPointerDown: () => { if (!disabled) showState('pressed'); }, onPointerUp: () => { if (!disabled) showState('hover'); },
    onFocus: (event:React.FocusEvent<HTMLElement>) => { if(event.target!==event.currentTarget&&kind!=='toggle')return;showState('focus'); void run('focus'); }, onBlur: (event:React.FocusEvent<HTMLElement>) => { if(event.target!==event.currentTarget&&kind!=='toggle')return;showState('normal'); void run('blur'); } };
  const childrenAt = (itemContext: UIValueContext) => component.children.map(child => <Instance key={child.id} component={child} parent={component} context={itemContext} props={props}/>);
  let children: ReactNode = childrenAt(context);
  if (component.repeat) {
    const collection = readUIValue(component.repeat.source, context);
    const records = Array.isArray(collection) ? collection : [];
    children = records.length ? records.map((item, index) => { const key = String(readUIPath(item, component.repeat!.key) ?? index); return <React.Fragment key={key}>{childrenAt({ ...context, item, instance: `${identity}:${key}` })}</React.Fragment>; })
      : <p className="gc-instance-empty" role="status" data-gc-empty="true">{component.repeat.emptyText ?? ''}</p>;
  }
  const supplied = props.business?.(component, children, context);
  if (supplied === null) return null;
  if (supplied !== undefined) {
    if (React.isValidElement<{ style?: CSSProperties; className?: string; children?: ReactNode; ref?: React.Ref<HTMLElement>; onClick?: (event: React.MouseEvent<HTMLElement>)=>void;onChange?:React.ChangeEventHandler<HTMLElement>;onInput?:React.FormEventHandler<HTMLElement>;onKeyDown?:React.KeyboardEventHandler<HTMLElement>;onFocus?:React.FocusEventHandler<HTMLElement>;onBlur?:React.FocusEventHandler<HTMLElement>;onPointerEnter?:React.PointerEventHandler<HTMLElement>;onPointerLeave?:React.PointerEventHandler<HTMLElement> }>(supplied)) {
      const ref = supplied.props.ref;
      const listens=(event:UIInteraction['event'])=>component.interactions?.some(interaction=>interaction.event===event);
      const eventValue=(event:React.SyntheticEvent<HTMLElement>)=>{const target=event.target as HTMLInputElement;return target.type==='checkbox'?target.checked:target.type==='number'||target.type==='range'?Number.isFinite(target.valueAsNumber)?target.valueAsNumber:'':target.value;};
      return React.cloneElement(supplied, { ...common, ...supplied.props, className: `${common.className} ${supplied.props.className ?? ''}`, style: { ...style, ...supplied.props.style },
        ...(component.bindings?.text||component.content.text!==undefined||override!==undefined?{children:<>{text}{children}</>}:{}),
        ...(component.interactions?.some(interaction=>interaction.event==='click')?{onClick:activatableContainer?common.onClick:()=>{void run('click');}}:{}),
        ...(listens('change')?{onChange:(event:React.ChangeEvent<HTMLElement>)=>{supplied.props.onChange?.(event);void run('change',eventValue(event));}}:{}),
        ...(listens('input')?{onInput:(event:React.FormEvent<HTMLElement>)=>{supplied.props.onInput?.(event);void run('input',eventValue(event));}}:{}),
        ...(listens('submit')?{onKeyDown:(event:React.KeyboardEvent<HTMLElement>)=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();void run('submit',eventValue(event));}else supplied.props.onKeyDown?.(event);}}:{}),
        ...(listens('focus')?{onFocus:(event:React.FocusEvent<HTMLElement>)=>{supplied.props.onFocus?.(event);common.onFocus(event);}}:{}),
        ...(listens('blur')?{onBlur:(event:React.FocusEvent<HTMLElement>)=>{supplied.props.onBlur?.(event);common.onBlur(event);}}:{}),
        ...(listens('pointerEnter')?{onPointerEnter:(event:React.PointerEvent<HTMLElement>)=>{supplied.props.onPointerEnter?.(event);common.onPointerEnter();}}:{}),
        ...(listens('pointerLeave')?{onPointerLeave:(event:React.PointerEvent<HTMLElement>)=>{supplied.props.onPointerLeave?.(event);common.onPointerLeave();}}:{}),
        ref:(element:HTMLElement|null)=>{common.ref(element);if(typeof ref==='function')ref(element);else if(ref)ref.current=element;},
      });
    }
    return <div {...common}>{supplied}</div>;
  }
  if (component.part.endsWith('.background') || component.part.endsWith('.scrim') || component.part === 'story.stageFrame') return null;
  if (kind === 'text') return <span {...common}>{text}{children}</span>;
  if (kind === 'decoration') return <span {...common} aria-hidden="true" style={{ ...style, pointerEvents: 'none' }}>{children}</span>;
  if (kind === 'image') return <div {...common} role={component.name ? 'img' : undefined} aria-label={component.name}>{children}</div>;
  if (kind === 'input') return <input {...common} aria-label={component.name ?? text} disabled={disabled} type={component.content.inputType === 'number' ? 'number' : 'text'} value={String(value ?? '')}
    placeholder={String(component.content.placeholder ?? '')} required={component.content.required === true} min={component.content.min as number | undefined} max={component.content.max as number | undefined}
    minLength={component.content.minLength as number | undefined} maxLength={component.content.maxLength as number | undefined}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onInput={event => { const next = event.currentTarget.type === 'number' ? Number.isFinite(event.currentTarget.valueAsNumber)?event.currentTarget.valueAsNumber:'' : event.currentTarget.value; setDraft(next); void run('input', next); }}
    onChange={event => { void change(event.currentTarget.type === 'number' ? Number.isFinite(event.currentTarget.valueAsNumber)?event.currentTarget.valueAsNumber:'' : event.currentTarget.value); }}
    onKeyDown={event => { if (event.key === 'Enter' && !composing.current && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); if(event.currentTarget.checkValidity())void run('submit', event.currentTarget.value);else event.currentTarget.reportValidity(); } }}/ >;
  if (kind === 'slider') return <input {...common} aria-label={component.name ?? text} type="range" disabled={disabled} min={Number(component.content.min ?? 0)} max={Number(component.content.max ?? 100)} step={Number(component.content.step ?? 1)} value={Number(value ?? 0)} onInput={event=>{void run('input',event.currentTarget.valueAsNumber);}} onChange={event => { void change(event.currentTarget.valueAsNumber); }}/ >;
  if (kind === 'toggle') return <label {...common}><input aria-label={component.name ?? text} type="checkbox" disabled={disabled} checked={Boolean(value)} onInput={event=>{void run('input',event.currentTarget.checked);}} onChange={event => { void change(event.currentTarget.checked); }}/><span>{text}</span>{children}</label>;
  if (kind === 'select') return <PlayerSelect {...common} aria-label={component.name ?? text} disabled={disabled} value={String(value ?? '')} options={component.options ?? []} onValueChange={next => { void run('input', next); void change(next); }}/>;
  if (component.part === 'basic.tabs') {
    const options = component.options ?? [], active = String(value || options[0]?.value || ''),tabIdentity=(value:string)=>`${component.id}-${encodeURIComponent(context.instance??'root')}-${encodeURIComponent(value)}`;
    return <section {...common}><div role="tablist" aria-label={component.name}>{options.map((option, index) => <button key={option.value} type="button" id={tabIdentity(option.value)} aria-controls={`${tabIdentity(option.value)}-panel`} role="tab" aria-selected={active === option.value} tabIndex={active === option.value ? 0 : -1} disabled={disabled} onClick={() => { void change(option.value); }} onKeyDown={event => { const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (!delta && event.key !== 'Home' && event.key !== 'End') return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + delta + options.length) % options.length; void change(options[next]!.value); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); }}>{option.label}</button>)}</div>{component.children.map((child, index) => <div key={child.id} id={`${tabIdentity(String(child.content.tabValue??options[index]?.value??''))}-panel`} role="tabpanel" aria-labelledby={tabIdentity(String(child.content.tabValue??options[index]?.value??''))} tabIndex={0} hidden={String(child.content.tabValue ?? options[index]?.value ?? '') !== active}><Instance component={child} parent={component} context={context} props={props}/></div>)}</section>;
  }
  if (!activatableContainer&&(kind === 'button' || kind === 'tab' || definition?.action || component.interactions?.some(item => item.event === 'click'))) return <button {...common} type="button" disabled={disabled} aria-label={!text?component.name:undefined} aria-pressed={selected || undefined} data-focus-key={identity} onClick={() => { void run('click'); }}>{text}{children}</button>;
  return <div {...common}>{text}{children}</div>;
}
/** The same authored instance tree is used by Studio previews and standalone Players. */
export function ComponentInstances(props: ComponentInstanceProps) { return props.contentsOnly ? <>{props.root.children.map(child=><Instance key={child.id} component={child} parent={props.root} context={props.context} props={props}/>)}</> : <Instance component={props.root} context={props.context} props={props} root/>; }
