import React, { type ReactElement, type ReactNode } from 'react';
import type { ComponentConfig } from '@galcraft/contracts';
import type { UIValueContext } from '@galcraft/templates/editor';
type PartElement = ReactElement<Record<string, unknown> & { children?: ReactNode; ref?: {gcPart?:string} }>;
const publicPart = (element: PartElement): string | undefined => element.props.ref?.gcPart ?? element.props['data-gc-part'] as string | undefined;
/** Preserve native business handlers while letting the authored tree own their composition. */
export function businessParts(source: ReactNode) {
  const parts = new Map<string, { key: string | null; element: PartElement }[]>();
  const visit = (node: ReactNode, itemKey: string | null = null) => {
    React.Children.forEach(node, child => {
      if (!React.isValidElement(child)) return;
      const element = child as PartElement, key = element.key === null ? itemKey : String(element.key);
      const part = publicPart(element); if (part) parts.set(part, [...parts.get(part) ?? [], { key, element }]);
      visit(element.props.children, key);
    });
  };
  const residual = (node: ReactNode): ReactNode => React.Children.map(node, child => {
    if (!React.isValidElement(child)) return child;
    const element = child as PartElement; if (publicPart(element)) return null;
    if (element.props.children === undefined) return element;
    const children = residual(element.props.children); return React.Children.count(children) ? React.cloneElement(element, {}, children) : null;
  });
  visit(source);
  const match = (part: string, context?: UIValueContext) => {
    const candidates = parts.get(part), id = (context?.item as {id?:unknown} | undefined)?.id;
    return id === undefined ? candidates?.[0] : candidates?.find(item => item.key === String(id)) ?? candidates?.find(item => item.key === null);
  };
  return { residual: residual(source), has:(part:string,context?:UIValueContext)=>!!match(part,context), render(component: ComponentConfig, children: ReactNode, context: UIValueContext): ReactNode | undefined {
    const candidates = parts.get(component.part); if (!candidates?.length) return undefined;
    const entry = match(component.part,context); if (!entry) return null;
    if(typeof entry.element.type==='string'&&['input','img','br','hr','source','track','area','base','col','embed','link','meta','param','wbr'].includes(entry.element.type))return entry.element;
    return React.cloneElement(entry.element, {}, <>{residual(entry.element.props.children)}{children}</>);
  } };
}
