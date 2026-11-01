import selectorParser from 'postcss-selector-parser';
import type { StyleMatchRequest, StyleTarget } from './property-owners.js';

const states = ['normal', 'hover', 'pressed', 'focus', 'disabled'];

/** Resolve public selectors against the mounted Player's component structure and state samples. */
export function resolvePreviewStyleMatches(root: HTMLElement, request: StyleMatchRequest): StyleTarget[] {
  const page = root.querySelector<HTMLElement>(`[data-gc-page-id="${request.pageId}"]`);
  if (!page) throw new Error(`候选预览未挂载页面：${request.pageId}`);
  const ast = selectorParser().astSync(request.selector), targets: StyleTarget[] = [];
  ast.walkPseudos(node => {
    const state = ({ ':hover': 'hover', ':active': 'pressed', ':focus': 'focus', ':focus-visible': 'focus', ':disabled': 'disabled' } as Record<string, string>)[node.value];
    if (state) node.replaceWith(selectorParser.attribute({ attribute: 'data-gc-state', operator: '=', value: state, quoteMark: '"', raws: {} }));
    else if (node.value.startsWith('::')) throw new Error(`预览无法确定伪元素归属：${request.selector}`);
  });
  const elements = Array.from(page.querySelectorAll<HTMLElement>('[data-gc-component]'));
  const matchCompound = (element: Element, selector: string, state: string): boolean => {
    const before = element.getAttribute('data-gc-state');
    if (element.hasAttribute('data-gc-component')) element.setAttribute('data-gc-state', state);
    try { return element.matches(selector); }
    finally { if (before === null) element.removeAttribute('data-gc-state'); else element.setAttribute('data-gc-state', before); }
  };
  ast.each(branch => {
    const compounds: string[] = [], relations: string[] = []; let compound = '';
    branch.each(node => {
      if (node.type === 'combinator') { compounds.push(compound); compound = ''; relations.push(node.value.trim() || ' '); }
      else compound += node.toString();
    });
    compounds.push(compound);
    const match = (element: Element, index: number, state: string): boolean => {
      if (!matchCompound(element, compounds[index]!, state)) return false;
      if (!index) return true;
      const candidates: Element[] = [], relation = relations[index - 1];
      if (relation === ' ' || relation === '>') {
        let parent = element.parentElement;
        while (parent && page.contains(parent)) { candidates.push(parent); if (relation === '>') break; parent = parent.parentElement; }
      } else if (relation === '+' || relation === '~') {
        let previous = element.previousElementSibling;
        while (previous) { candidates.push(previous); if (relation === '+') break; previous = previous.previousElementSibling; }
      } else throw new Error(`预览不支持选择器关系：${relation}`);
      return candidates.some(candidate => states.some(value => match(candidate, index - 1, value)));
    };
    for (const element of elements) {
      if (request.componentId && !element.closest(`[data-gc-component="${request.componentId}"]`)) continue;
      const matching = states.filter(state => match(element, compounds.length - 1, state));
      // A normal rule also covers state inheritance; keep one canonical source.
      for (const state of matching.includes('normal') ? ['normal'] : matching) {
        const target = { componentId: element.dataset.gcComponent!, state };
        if (!targets.some(value => value.componentId === target.componentId && value.state === state)) targets.push(target);
      }
    }
  });
  return targets;
}
