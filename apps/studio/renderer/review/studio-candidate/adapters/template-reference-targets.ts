import { IdSchema, VariableSchema, type DocumentView, type Variable } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import type { TemplateExternalReference } from '@galcraft/templates';

export type TemplateReferenceTarget = {
  kind: TemplateExternalReference['kind']; id: string; name: string; documentIds: string[];
  variable?: Variable & { sceneId?: string };
};

/** Author choices and plan validation read the same current document identities. */
export function templateReferenceTargets(documents: readonly DocumentView[]): TemplateReferenceTarget[] {
  const targets = new Map<string, TemplateReferenceTarget>();
  const add = (target: Omit<TemplateReferenceTarget, 'documentIds'>, documentId: string) => {
    // The shared switch request accepts Id values. Do not offer a selection
    // (for example an arbitrary DSL ending slug) that it will always reject.
    if (!IdSchema.safeParse(target.id).success) return;
    const key = target.kind + ':' + target.id, previous = targets.get(key);
    targets.set(key, { ...target, documentIds: [...new Set([...(previous?.documentIds ?? []), documentId])] });
  };
  for (const document of documents) for (const [path, raw] of Object.entries(document.files)) {
    if (path.endsWith('.gal')) {
      for (const node of parse({ documentId: document.documentId, revision: document.revision, text: raw }).cst) {
        const args = node.object?.value as Record<string, unknown> | undefined;
        const kind = node.command === 'label' ? 'label' : node.command === 'end' ? 'ending' : undefined;
        const id = kind === 'label' ? args?.labelId : kind === 'ending' ? args?.endingId : undefined;
        if (node.valid && kind && typeof id === 'string') add({ kind, id, name: `${kind === 'label' ? '标签' : '结局'} · ${id}` }, document.documentId);
      }
      continue;
    }
    if (!path.endsWith('.json')) continue;
    let data: { id?: string; name?: string; variables?: unknown[]; locals?: unknown[]; characters?: { id: string; name?: string }[]; flows?: { id: string; name?: string }[] };
    try { data = JSON.parse(raw).data ?? {}; } catch { continue; }
    const variable = (input: unknown, sceneId?: string) => {
      const value = VariableSchema.safeParse(input);
      if (value.success) add({ kind: 'variable', id: value.data.id, name: value.data.name, variable: { ...value.data, ...(sceneId ? { sceneId } : {}) } }, document.documentId);
    };
    if (path.startsWith('variables/')) variable(data);
    for (const item of Array.isArray(data.variables) ? data.variables : []) variable(item);
    for (const item of Array.isArray(data.locals) ? data.locals : []) variable(item, data.id);
    if (data.id) {
      const kind = path.endsWith('/scene.json') ? 'scene' : path.startsWith('characters/') ? 'character' : path.startsWith('flows/') ? 'flow' : undefined;
      if (kind) add({ kind, id: data.id, name: data.name ?? data.id }, document.documentId);
    }
    for (const item of Array.isArray(data.characters) ? data.characters : []) add({ kind: 'character', id: item.id, name: item.name ?? item.id }, document.documentId);
    for (const item of Array.isArray(data.flows) ? data.flows : []) add({ kind: 'flow', id: item.id, name: item.name ?? item.id }, document.documentId);
  }
  return [...targets.values()];
}
