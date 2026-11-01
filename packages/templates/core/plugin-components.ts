import { createId, JsonSchema, RuntimeTemplateSchema } from '@galcraft/contracts';
import type { ComponentConfig, FieldSpec, Id, Json, RuntimeTemplate } from '@galcraft/contracts';
import { components } from './editing.js';

export type PluginComponentDefinition = { key: string; componentKey: string; publicParts: string[];
  propsSchema?: Json; fields?: FieldSpec[]; sampleProps?: Json;
  stateBindings?: { property: string; domain: 'progress' | 'longTerm'; path: string }[] };

export function pluginComponentCatalog(definitions: readonly PluginComponentDefinition[]) {
  return definitions.map(definition => ({ ...definition, fields: definition.fields ?? [], sampleProps: definition.sampleProps ?? {}, stateBindings: definition.stateBindings ?? [] }));
}

/** Adds an authored component instance without changing the page's core actions or navigation. */
export function insertPluginComponent(template: RuntimeTemplate, pageId: Id, parentId: Id,
  definition: PluginComponentDefinition, props: Json = definition.sampleProps ?? {}): { template: RuntimeTemplate; componentId: Id } {
  const next = structuredClone(template), page = next.pages.find(item => item.id === pageId);
  const parent = page && components(page.root).find(item => item.id === parentId);
  if (!parent) throw new Error('插件组件需要当前页面中的容器');
  const componentId = createId(next);
  const component: ComponentConfig = { id: componentId, part: definition.componentKey,
    layout: { ...structuredClone(parent.layout), mode: 'column', anchorX: 0, anchorY: 0,
      x: { unit: 'px', value: 0 }, y: { unit: 'px', value: 0 }, width: { unit: 'percent', value: 100 }, height: { unit: 'auto' }, z: 0 },
    visible: true, locked: false, content: {}, normal: {}, states: {}, children: [], animations: {},
    plugin: { key: definition.key, props: JsonSchema.parse(props) } };
  for (const part of definition.publicParts) component.children.push({ ...structuredClone(component), id: createId([next, component]), part,
    plugin: undefined, children: [], layout: { ...structuredClone(component.layout), height: { unit: 'auto' } } });
  parent.children.push(component);
  return { template: RuntimeTemplateSchema.parse(next), componentId };
}
