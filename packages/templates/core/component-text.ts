import type { ComponentConfig, RuntimeTemplate } from '@galcraft/contracts';
import { componentDefinition } from './catalog.js';

/** Static label eligibility is shared by the designer, semantic transactions and runtime projection. */
export function componentTextEditable(component: ComponentConfig): boolean {
  return !component.bindings?.text && ['text', 'button', 'tab', 'toggle'].includes(componentDefinition(component.part)?.kind ?? '')
    && (typeof component.content.labelKey === 'string' || component.part.startsWith('basic.') && typeof component.content.text === 'string');
}
export function componentTextOverride(component: ComponentConfig, locales: RuntimeTemplate['locales'], locale: string): string | undefined {
  if (!componentTextEditable(component)) return undefined;
  const key = component.content.labelOverrideKey;
  return typeof key === 'string' && Object.hasOwn(locales[locale] ?? {}, key) ? locales[locale]![key] : undefined;
}
export function setComponentText(template: RuntimeTemplate, component: ComponentConfig, locale: string, text: string | null): void {
  if (!componentTextEditable(component)) throw new Error(`UI_TEXT_DYNAMIC: The component has no editable static label: ${component.id}`);
  if (!Object.hasOwn(template.locales, locale)) throw new Error(`UI_TEXT_LOCALE: Select an existing Player menu locale: ${locale}`);
  const key = typeof component.content.labelOverrideKey === 'string' ? component.content.labelOverrideKey : `component.${component.id}.label`;
  if (text === null) {
    delete template.locales[locale]![key];
    if (!Object.values(template.locales).some(strings => Object.hasOwn(strings, key))) delete component.content.labelOverrideKey;
  } else { component.content.labelOverrideKey = key; template.locales[locale]![key] = text; }
}
export function copyComponentText(locales: RuntimeTemplate['locales'], original: ComponentConfig, copy: ComponentConfig): void {
  const oldKey = original.content.labelOverrideKey;
  if (typeof oldKey !== 'string') return;
  const key = `component.${copy.id}.label`; copy.content.labelOverrideKey = key;
  for (const strings of Object.values(locales)) if (Object.hasOwn(strings, oldKey)) strings[key] = strings[oldKey]!;
}
