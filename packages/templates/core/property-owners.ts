import selectorParser from 'postcss-selector-parser';
import type { ComponentConfig, Id, PageConfig } from '@galcraft/contracts';
import { components } from './editing.js';

const sides = ['top', 'right', 'bottom', 'left'];
const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
export function cssLeaves(property: string): string[] {
  if (['padding', 'margin', 'inset'].includes(property)) return sides.map(side => property === 'inset' ? side : `${property}-${side}`);
  if (property === 'border') return sides.flatMap(side => ['width', 'style', 'color'].map(kind => `border-${side}-${kind}`));
  if (/^border-(width|style|color)$/.test(property)) return sides.map(side => `border-${side}-${property.slice(7)}`);
  if (/^border-(top|right|bottom|left)$/.test(property)) return ['width', 'style', 'color'].map(kind => `${property}-${kind}`);
  if (property === 'border-radius') return corners.map(corner => `border-${corner}-radius`);
  if (property === 'background') return ['background-color', 'background-image', 'background-position', 'background-size', 'background-repeat', 'background-origin', 'background-clip', 'background-attachment'];
  if (property === 'font') return ['font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'font-variant', 'line-height'];
  if (property === 'gap') return ['row-gap', 'column-gap'];
  return [property];
}
export function configProperties(path: string): { state: string; properties: string[] } {
  const parts = path.split(/[/.]/).filter(Boolean), state = parts[0] === 'states' ? parts.splice(0, 2)[1]! : (parts[0] !== 'background' && parts.shift(), 'normal');
  const field = parts[0]!, nested = parts[1];
  if (['padding', 'margin'].includes(field)) return { state, properties: nested ? [`${field}-${nested}`] : cssLeaves(field) };
  if (field === 'background') {
    const map: Record<string, string> = { color: 'background-color', colorOpacity: 'background-color', imageId: 'background-image', imageOpacity: 'background-image', fit: 'background-size', x: 'background-position', y: 'background-position' };
    return { state, properties: nested ? [map[nested] ?? `background-${nested}`] : cssLeaves('background') };
  }
  const property = ({ color: 'color', fontId: 'font-family', fontSize: 'font-size', radius: 'border-radius', borderColor: 'border-color', borderWidth: 'border-width', shadow: 'box-shadow', wrap: 'white-space', x: 'left', y: 'top', z: 'z-index', anchorX: 'transform', anchorY: 'transform', align: 'align-items', justify: 'justify-content', columns: 'grid-template-columns' } as Record<string, string>)[field] ?? field.replace(/[A-Z]/g, value => `-${value.toLowerCase()}`);
  return { state, properties: cssLeaves(property) };
}

export type StyleTarget = { componentId: Id; state: string };
export type StyleMatchRequest = { pageId: Id; componentId: Id | null; selector: string; property: string; value: string };
export type StyleMatchResolver = (input: StyleMatchRequest) => StyleTarget[] | null;
export type PreviewStyleMatch = StyleMatchRequest & { targets: StyleTarget[] };
export function styleMatchKey(input: StyleMatchRequest): string {
  return JSON.stringify([input.pageId, input.componentId, input.selector, input.property]);
}
export function styleTargets(page: PageConfig, componentId: Id | null, selector: string, property: string, value: string, resolve?: StyleMatchResolver, pending?: StyleMatchRequest[]): StyleTarget[] {
  const all = components(page.root), scope = componentId ? all.find(component => component.id === componentId) : page.root;
  const scoped = scope ? components(scope) : [];
  const targets: StyleTarget[] = [];
  const ast = selectorParser().astSync(selector);
  let uncertain = property.startsWith('--') || /var\(/.test(value);
  ast.each(branch => {
    let state = 'normal'; const predicates: ((component: ComponentConfig) => boolean)[] = [];
    branch.each(node => {
      if (node.type === 'attribute' && node.operator === '=') {
        if (node.attribute === 'data-gc-part') predicates.push(component => component.part === node.value);
        else if (node.attribute === 'data-gc-component') predicates.push(component => component.id === node.value);
        else if (node.attribute === 'data-gc-page') predicates.push(() => page.key === node.value || page.id === node.value);
        else if (node.attribute === 'data-gc-state' && ['hover', 'pressed', 'focus', 'disabled'].includes(node.value!)) state = node.value!;
        else uncertain = true;
      } else if (node.type === 'class') predicates.push(component => `gc-${component.part.replaceAll('.', '-')}` === node.value);
      else if (node.type === 'pseudo' && [':hover', ':active', ':focus', ':disabled'].includes(node.value)) state = node.value === ':active' ? 'pressed' : node.value.slice(1);
      else uncertain = true;
    });
    for (const component of scoped.filter(component => predicates.every(predicate => predicate(component)))) targets.push({ componentId: component.id, state });
  });
  if (uncertain) {
    const request = { pageId: page.id, componentId, selector, property, value }, actual = resolve?.(request);
    if (!actual) {
      if (pending) { if (!pending.some(item => styleMatchKey(item) === styleMatchKey(request))) pending.push(request); return []; }
      throw new Error(`属性归属需要实际组件预览：${selector} / ${property}`);
    }
    if (actual.some(target => !scoped.some(component => component.id === target.componentId) || !['normal', 'hover', 'pressed', 'focus', 'disabled'].includes(target.state))) throw new Error('预览属性归属超出了样式范围');
    return actual;
  }
  return targets;
}
