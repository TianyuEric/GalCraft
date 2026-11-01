import type { Json, Result } from '@galcraft/contracts';
import type { ComponentContribution, ComponentRenderContext } from '@galcraft/plugins/contracts';
import { validatePluginData } from '@galcraft/plugins/contracts';
import { fail, ok } from './common.js';

function atPath(value: Json, path: string): Json | undefined {
  let current: Json | undefined = value;
  for (const part of path.replace(/^\//, '').split(/[/.]/).filter(Boolean)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = Array.isArray(current) ? current[Number(part)] : current[part];
  }
  return current;
}

export function renderPluginComponent(contribution: ComponentContribution, context: ComponentRenderContext): Result<unknown> {
  if (!contribution.render) return fail('PLUGIN_COMPONENT_RENDER', `组件 ${contribution.key} 没有渲染实现`);
  const raw = context.props ?? contribution.sampleProps ?? {};
  const props = raw && typeof raw === 'object' && !Array.isArray(raw) ? structuredClone(raw) : raw;
  for (const binding of contribution.stateBindings ?? []) {
    if (!props || typeof props !== 'object' || Array.isArray(props)) return fail('PLUGIN_COMPONENT_PROPS', '状态绑定需要对象属性');
    const value = atPath(context[binding.domain], binding.path);
    if (value !== undefined) props[binding.property] = structuredClone(value);
  }
  const checked = validatePluginData(contribution.propsSchema ?? {}, props);
  if (!checked.ok) return checked;
  try { return ok(contribution.render({ ...context, props: checked.value })); }
  catch (error) { return fail('PLUGIN_COMPONENT_RENDER', `${contribution.key}: ${String(error)}`); }
}
