import type { DocumentView, EditPlan } from '@galcraft/contracts';
import { changedValues, scriptChanges, type SaveChangeGroup } from '../../components/save-changes.js';
import { readableFile } from '../../components/readable-files.js';

/** Describe the reviewed working edit, independently of earlier unsaved edits. */
export function adoptionChanges(plan: EditPlan, documents: DocumentView[], locale: string, names: Record<string, string> = {}): SaveChangeGroup[] {
  const groups = new Map<string, SaveChangeGroup>();
  for (const patch of plan.input.patches) {
    const document = documents.find(item => item.documentId === patch.documentId);
    const paths = patch.kind === 'file' ? [patch.path] : Object.keys(document?.files ?? {});
    const name = names[patch.documentId] ?? (paths[0] ? readableFile(paths[0], locale) : plan.preview.find(item => item.ref.id === patch.documentId)?.description ?? plan.input.label);
    let group = groups.get(patch.documentId);
    if (!group) { group = { documentId: patch.documentId, name, paths, changes: [] }; groups.set(patch.documentId, group); }
    if (patch.kind === 'json') {
      for (const change of patch.changes) {
        if (change.path === '/data/assets' && Array.isArray(change.before) && Array.isArray(change.after)) {
          const before = new Map(change.before.map(value => [String((value as {id: string}).id), value as Record<string, unknown>]));
          const after = new Map(change.after.map(value => [String((value as {id: string}).id), value as Record<string, unknown>]));
          for (const id of new Set([...before.keys(), ...after.keys()])) {
            const old = before.get(id), next = after.get(id), fields = changedValues(old, next);
            if (fields.length) group.changes.push({ kind: !old ? 'add' : !next ? 'delete' : 'update', label: String(next?.name ?? old?.name ?? name), fields: old && next ? fields : undefined });
          }
        } else {
          const fields = changedValues(change.before, change.op === 'remove' ? undefined : change.after, change.path.replace(/^\/data\//, '').replaceAll('/', '.'));
          if (fields.length) group.changes.push({ kind: 'update', label: name, fields });
        }
      }
    } else if (patch.kind === 'text') {
      const before = Object.values(document?.files ?? {})[0] ?? '';
      let after = before;
      for (const edit of [...patch.edits].sort((a, b) => b.start - a.start)) after = after.slice(0, edit.start) + edit.after + after.slice(edit.end);
      group.changes.push(...scriptChanges(patch.documentId, before, after, locale));
    } else if (patch.kind === 'file') {
      if (/\.(gal|galdsl|dsl)$/.test(patch.path)) group.changes.push(...scriptChanges(patch.documentId, patch.before ?? '', patch.after ?? '', locale));
      else group.changes.push({ kind: patch.before === null ? 'add' : patch.after === null ? 'delete' : 'source', label: name, before: patch.before ?? '', after: patch.after ?? '' });
    } else group.changes.push({ kind: patch.op === 'create' ? 'add' : 'delete', label: name });
  }
  return [...groups.values()].filter(group => group.changes.length);
}
