import { createId } from '@galcraft/contracts';
import { IdSchema, normalizeRuntimeTemplate, normalizeTemplateSourceRecord, TemplateSourceRecordSchema } from '@galcraft/contracts';
import type { Id, RuntimeTemplate, TemplateSourceRecord } from '@galcraft/contracts';

export type TemplateDocument = { documentId: Id; revision: number; format: 'json'; files: Record<string, string> };
export type TemplateDocumentSource = { files: Record<string, string> };

function document(documentId: Id, path: string, data: unknown): TemplateDocument {
  return { documentId, revision: 1, format: 'json',
    files: { [path]: JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }, null, 2) + '\n' } };
}

export function createTemplateDocuments(template: RuntimeTemplate, nextId: () => Id = () => createId(template), sourceRecord: TemplateSourceRecord | null = createTemplateSource(template)): TemplateDocument[] {
  template=normalizeRuntimeTemplate(template);
  const localeIds = Object.fromEntries(Object.keys(template.locales).map(locale => [locale, nextId()]));
  const { pages, locales, ...base } = template;
  return [
    document(template.instanceId, 'ui/template.json', { template: base, pageIds: pages.map(page => page.id), localeIds }),
    ...pages.map(page => document(page.id, `ui/pages/${page.id}.json`, page)),
    ...Object.entries(locales).map(([locale, strings]) =>
      document(localeIds[locale]!, `ui/locales/${locale}.json`, { schemaVersion: 1, locale, strings })),
    ...(sourceRecord ? [document(nextId(), 'ui/template-source.json', TemplateSourceRecordSchema.parse(sourceRecord))] : []),
  ];
}

export function createTemplateSource(source: RuntimeTemplate, identities: Record<Id, Id> = {}, sourceFiles: Record<string, string> = {}): TemplateSourceRecord {
  const collect = (value: unknown): void => { if (!value || typeof value !== 'object') return;
    if ('id' in value && typeof value.id === 'string' && IdSchema.safeParse(value.id).success && !identities[value.id]) identities[value.id] = value.id;
    for (const item of Object.values(value)) if (Array.isArray(item)) item.forEach(collect); else collect(item);
  };
  collect(source); identities[source.instanceId] ??= source.instanceId;
  for (const page of source.pages) identities[page.portalRootId] ??= page.portalRootId;
  return TemplateSourceRecordSchema.parse({ schemaVersion: 1, source: normalizeRuntimeTemplate(source), identities, sourceFiles, hiddenPages: [] });
}

export function readTemplateSource(documents: readonly TemplateDocumentSource[]): TemplateSourceRecord | null {
  const raw = documents.flatMap(document => Object.entries(document.files)).find(([path]) => path === 'ui/template-source.json')?.[1];
  return raw ? normalizeTemplateSourceRecord(JSON.parse(raw).data) : null;
}

export function readTemplateDocuments(documents: readonly TemplateDocumentSource[]): RuntimeTemplate {
  const values = new Map<string, Record<string, unknown>>();
  for (const source of documents) for (const [path, raw] of Object.entries(source.files)) {
    if (path.startsWith('ui/') && path.endsWith('.json')) values.set(path, JSON.parse(raw) as Record<string, unknown>);
  }
  const root = values.get('ui/template.json')?.data as Record<string, unknown> | undefined;
  if (!root || !root.template || !Array.isArray(root.pageIds)) throw new Error('Template document is missing');
  const pages = root.pageIds.map(id => {
    const page = values.get(`ui/pages/${id}.json`)?.data;
    if (!page) throw new Error(`Missing page ${id}`);
    return page;
  });
  const localeIds = root.localeIds as Record<string, string>;
  const locales = Object.fromEntries(Object.keys(localeIds).map(locale => {
    const value = values.get(`ui/locales/${locale}.json`)?.data as Record<string, unknown> | undefined;
    if (!value?.strings) throw new Error(`Missing locale ${locale}`);
    return [locale, value.strings];
  }));
  return normalizeRuntimeTemplate({ ...(root.template as object), pages, locales });
}
