import { IdSchema, LastValidSceneSourceSchema } from '@galcraft/contracts';
import type { Id, Issue, LastValidSceneSource, Result } from '@galcraft/contracts';
import { dialogueEventSource, parse } from '@galcraft/dsl';
import type { FileChange } from './file-transaction.js';

type SceneDocument = { documentId: Id; revision: number; format: 'dsl' | 'json'; files: Record<string, string> };

export function sceneSourcePath(documentId: Id): string {
  return `.galcraft/scene-sources/${IdSchema.parse(documentId)}.json`;
}

export function sceneSource(document: SceneDocument | undefined): LastValidSceneSource | null {
  if (document?.format !== 'dsl') return null;
  const scene = Object.keys(document.files).find(path => /^scenes\/[^/]+\/scene\.json$/.test(path));
  const text = scene && document.files[scene.replace(/scene\.json$/, 'script.gal')];
  return typeof text === 'string' ? { revision: document.revision, text } : null;
}

export function sceneSourceIssue(documentId: Id, source: LastValidSceneSource): Issue | null {
  return parse({ documentId, ...source }).issues.find(issue => issue.severity === 'error') ?? null;
}

/** Validate the resulting scene event graph for semantic transactions. */
export function sceneEventEditIssue(before: ReadonlyMap<Id, SceneDocument>, after: ReadonlyMap<Id, SceneDocument>, members: Id[], validateAnchors = true): Issue | null {
  const identities = (documentId: Id, document: SceneDocument | undefined) => {
    const source = sceneSource(document);
    if (!source || !source.text.includes('events') && !source.text.includes('\\u')) return { issues: [], events: [] };
    const parsed = parse({ documentId, ...source });
    const events = parsed.cst.filter(node => node.valid && node.command === 'say').flatMap(node =>
      (node.fields.find(field => field.key === 'events')?.valueNode.items ?? []).flatMap((_, index) => {
        const source = dialogueEventSource(parsed, node, index, 'id');
        return source.eventId ? [{ id: source.eventId, source }] : [];
      }));
    return { issues: parsed.issues.filter(issue => issue.code.startsWith('DIALOGUE_EVENT')), events };
  };
  const introduced = new Map<Id, Issue>();
  for (const id of members) {
    const current = sceneSource(before.get(id)), next = sceneSource(after.get(id));
    if (!next || next.text === current?.text) continue;
    const { issues, events } = identities(id, after.get(id));
    if (validateAnchors && issues.length) return issues[0]!;
    const prior = new Set(identities(id, before.get(id)).events.map(event => event.id));
    for (const event of events) {
      if (prior.has(event.id)) continue;
      const duplicate: Issue = { code: 'DIALOGUE_EVENT_DUPLICATE', severity: 'error', message: 'Dialogue event ID is already in use',
        owner: 'M02', source: event.source, related: [], actions: ['locate', 'compare'] };
      if (introduced.has(event.id)) return duplicate;
      introduced.set(event.id, duplicate);
    }
  }
  if (!introduced.size) return null;
  for (const [id, document] of after) for (const event of identities(id, document).events) {
    const issue = introduced.get(event.id);
    if (issue && issue.source?.documentId !== id) return issue;
  }
  return null;
}

export function invalidSceneEdit(invalid: Issue): Result<never> {
  const error: Issue = { code: 'SCENE_SOURCE_INVALID', message: 'Repair the scene source before applying a semantic edit.',
    severity: 'error', owner: 'M02', source: invalid.source, related: [], actions: ['locate', 'edit'] };
  return { ok: false, error, issues: [error, invalid] };
}

export function verifiedPriorSceneSource(documentId: Id, revision: number, candidate: unknown): LastValidSceneSource | null {
  const checked = LastValidSceneSourceSchema.safeParse(candidate);
  if (!checked.success || checked.data.revision >= revision) return null;
  const source = checked.data;
  return sceneSourceIssue(documentId, source) ? null : source;
}

export function readSavedSceneSource(projectId: Id, document: SceneDocument, raw: string): LastValidSceneSource | null {
  try {
    const value = JSON.parse(raw);
    if (value?.schemaVersion !== 1 || value.projectId !== projectId || value.documentId !== document.documentId || value.revision !== document.revision) return null;
    return verifiedPriorSceneSource(document.documentId, document.revision, value.source);
  } catch { return null; }
}

export function savedSceneSourceChange(projectId: Id, document: SceneDocument, source: LastValidSceneSource | null): FileChange {
  const { documentId, revision } = document;
  const content = source ? JSON.stringify({ schemaVersion: 1, projectId, documentId, revision, source }) : null;
  return { path: sceneSourcePath(documentId), documentId, revision, content };
}
