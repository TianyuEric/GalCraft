import type { FieldSpec, ProductionOperationDefinition, ProductionOperationSnapshot } from '@galcraft/contracts';

export type DisplayMessages = Record<string, Record<string, string>>;
export type DisplayTranslations = Record<string, readonly string[]>;

/** Attach namespaced display keys. Source strings remain the English machine contract. */
export function productionMessages(operations: ProductionOperationDefinition[], translations: DisplayTranslations, messages: DisplayMessages = {}): DisplayMessages {
  const add = (key: string, source: string) => {
    const translated = translations[source];
    if (!translated) throw new Error(`Missing official display translation: ${source}`);
    for (const [locale, value] of [['zh-CN', translated[0]], ['en', source], ['ja', translated[1]]]) (messages[locale!] ??= {})[key] = value!;
    return key;
  };
  const field = (spec: FieldSpec, prefix: string) => {
    spec.labelKey = add(`${prefix}/label`, spec.label);
    if (spec.description) spec.descriptionKey = add(`${prefix}/description`, spec.description);
    if (spec.placeholder) spec.placeholderKey = add(`${prefix}/placeholder`, spec.placeholder);
    if (spec.enumValues) spec.enumLabelKeys = Object.fromEntries(spec.enumValues.map(value => [value, add(`${prefix}/options/${value}`, value)]));
    spec.children?.forEach(child => field(child, `${prefix}/${child.path}`));
    if (spec.item) field(spec.item, `${prefix}/item`);
  };
  for (const operation of operations) {
    operation.fields = structuredClone(operation.fields);
    operation.titleKey = add(`${operation.id}/title`, operation.title);
    operation.descriptionKey = add(`${operation.id}/description`, operation.description);
    operation.fields.forEach(spec => field(spec, `${operation.id}/fields/${spec.path}`));
    operation.presets?.forEach(preset => {
      preset.nameKey = add(`${operation.id}/presets/${preset.id}/name`, preset.name);
      preset.descriptionKey = add(`${operation.id}/presets/${preset.id}/description`, preset.description);
    });
  }
  return messages;
}

export function displayMessage(messages: DisplayMessages | undefined, locale: string, key: string | undefined, source: string): string {
  return key ? messages?.[locale]?.[key] ?? messages?.en?.[key] ?? messages?.['zh-CN']?.[key] ?? source : source;
}
export function operationTitle(snapshot: ProductionOperationSnapshot, locale: string): string {
  return displayMessage(snapshot.messages, locale, snapshot.definition.titleKey, snapshot.definition.title);
}
export function operationDescription(snapshot: ProductionOperationSnapshot, locale: string): string {
  return displayMessage(snapshot.messages, locale, snapshot.definition.descriptionKey, snapshot.definition.description);
}

export function localizedFields(fields: FieldSpec[], messages: DisplayMessages | undefined, locale: string): FieldSpec[] {
  return fields.map(field => ({ ...field, label: displayMessage(messages, locale, field.labelKey, field.label), description: displayMessage(messages, locale, field.descriptionKey, field.description), ...(field.children ? { children: localizedFields(field.children, messages, locale) } : {}), ...(field.item ? { item: localizedFields([field.item], messages, locale)[0]! } : {}) }));
}
