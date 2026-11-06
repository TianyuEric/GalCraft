import { assetFieldReferences, type AssetReference, type DocumentView, type EditInput, type Id, type Json, type Source } from '@galcraft/contracts';
import { CoreCommandSpecs, parse, patchFields } from '@galcraft/dsl';
import { compileInput } from '../../../authoring/bridge.js';
import type { CandidateAppearance } from '../workfaces/psd-import-model.js';
import { appearancePath, type CandidateSceneCast } from './appearance-composition.js';

const fields = new Map(CoreCommandSpecs.map(spec => [spec.key, spec.fields]));
const fieldValue = (value: unknown, path: string[]) => path.reduce<unknown>(
  (data, part) => data && typeof data === 'object' ? (data as Record<string, unknown>)[part] : undefined, value,
);
const parts = (pointer: string) => pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
export const assetReferenceKey = (source: Source) => JSON.stringify([source.documentId, source.revision, source.statementId ?? null, source.field ?? null, source.range ?? null]);

const compositionPartSource = /^\/data\/appearances\/[^/]+\/parts\/\d+\/source$/;

function compositionAssetReferences(document: DocumentView, assetId: Id): AssetReference[] {
  const references: AssetReference[] = [];
  const push = (owner: AssetReference['owner'], field: string, variantId: string | null | undefined, usage: string) => {
    references.push({ assetId, owner, variantId: variantId ?? null, required: true, usage,
      source: { documentId: document.documentId, revision: document.revision, field } });
  };
  const appearance = document.files[appearancePath];
  if (appearance !== undefined) {
    const data = JSON.parse(appearance).data as { appearances: Record<string, CandidateAppearance> };
    for (const [characterId, character] of Object.entries(data.appearances)) {
      for (const [index, part] of character.parts.entries()) {
        if (part.source === 'asset:' + assetId) push({ kind: 'character', id: characterId },
          `/data/appearances/${characterId}/parts/${index}/source`, part.compositionVariantId, '角色组合图层 · ' + part.name);
      }
    }
  }
  const scene = Object.entries(document.files).find(([path]) => path.startsWith('candidate/scenes/') && path.endsWith('.json'))?.[1];
  if (scene !== undefined) {
    const data = JSON.parse(scene).data as { sceneId: Id; cast: Record<string, CandidateSceneCast> };
    for (const [characterId, cast] of Object.entries(data.cast)) {
      for (const [index, layer] of cast.composition?.layers.entries() ?? []) {
        if (layer.assetId === assetId) push({ kind: 'scene', id: data.sceneId },
          `/data/cast/${characterId}/composition/layers/${index}/assetId`, layer.variantId, '场景实例图层 · ' + (layer.name ?? layer.id));
      }
    }
  }
  return references;
}

export function candidateAssetReferences(documents: DocumentView[], assetId: Id): AssetReference[] {
  const input = compileInput(documents);
  const references = input.ok ? (input.value.assetReferences ?? []).filter(item => item.assetId === assetId) : [];
  for (const document of documents) {
    references.push(...compositionAssetReferences(document, assetId));
    const script = Object.entries(document.files).find(([path]) => path.endsWith('.gal'))?.[1];
    if (script === undefined) continue;
    const tree = parse({ documentId: document.documentId, revision: document.revision, text: script });
    for (const node of tree.cst) {
      if (!node.valid || !node.id) continue;
      const value = node.object?.value;
      const occurrences = assetFieldReferences(value, fields.get(node.command) ?? []);
      if (node.command === 'say') {
        const voices = fieldValue(value, ['voiceByLocale']);
        if (voices && typeof voices === 'object') for (const [locale, id] of Object.entries(voices))
          if (id === assetId) occurrences.push({ ref: { kind: 'asset', id }, path: ['voiceByLocale', locale] });
      }
      for (const { ref, path } of occurrences) {
        if (ref.kind !== 'asset' || ref.id !== assetId) continue;
        const variant = fieldValue(value, [...path.slice(0, -1), 'variantId']);
        references.push({ assetId, owner: { kind: 'statement', id: node.id }, variantId: typeof variant === 'string' ? variant : null,
          source: { documentId: document.documentId, revision: document.revision, statementId: node.id, field: path.join('.') },
          usage: node.command + ' · ' + path.join('.'), required: true });
      }
    }
  }
  return references;
}

export function canMigrateAssetReference(reference: AssetReference) {
  return Boolean(reference.source?.field?.startsWith('/data/') || reference.source?.statementId && reference.source.field)
    && (reference.variantId === null || Boolean(reference.source?.field && (
      reference.source.field.endsWith('assetId') || compositionPartSource.test(reference.source.field))));
}

export function candidateAssetReferencePatches(documents: DocumentView[], references: AssetReference[], assetId: Id, variantId: Id): EditInput['patches'] {
  const patches: EditInput['patches'] = [];
  for (const documentId of new Set(references.map(reference => reference.source!.documentId))) {
    const document = documents.find(item => item.documentId === documentId);
    const items = references.filter(reference => reference.source!.documentId === documentId);
    if (!document || items.some(reference => reference.source!.revision !== document.revision || !canMigrateAssetReference(reference)))
      throw new Error('引用位置已变化或不可迁移，请重新准备处理。');
    const script = Object.entries(document.files).find(([path]) => path.endsWith('.gal'))?.[1];
    const edits: Array<{ start: number; end: number; before: string; after: string }> = [];
    const changes = new Map<string, { path: string; op: 'set'; before: Json; after: Json }>();
    const envelope = Object.entries(document.files).find(([path]) => path.endsWith('.json'))?.[1];
    const json: unknown = envelope === undefined ? null : JSON.parse(envelope);
    const tree = script === undefined ? undefined : parse({ documentId, revision: document.revision, text: script });
    for (const reference of items) {
      const source = reference.source!;
      const field = source.field!;
      const partSource = compositionPartSource.test(field);
      const change = [{ path: field, before: partSource ? 'asset:' + reference.assetId : reference.assetId, after: partSource ? 'asset:' + assetId : assetId }];
      if (reference.variantId !== null) change.push({ path: partSource ? field.replace(/source$/, 'compositionVariantId') : field.replace(/assetId$/, 'variantId'),
        before: reference.variantId, after: variantId });
      if (source.statementId && tree && !field.startsWith('/')) {
        const node = tree.cst.find(item => item.id === source.statementId && item.valid);
        if (!node || change.some(item => fieldValue(node.object?.value, item.path.split('.')) !== item.before))
          throw new Error('脚本引用已变化，请重新准备处理。');
        const result = patchFields(tree, { documentId, revision: document.revision, statementIds: [source.statementId],
          changes: change.map(item => ({ field: item.path, op: 'set', value: item.after })) });
        if (!result.ok) throw new Error(result.error.message);
        edits.push(...result.value.map(edit => ({ start: edit.start, end: edit.end, before: edit.oldText, after: edit.text })));
      } else {
        for (const item of change) {
          const path = parts(item.path);
          if (fieldValue(json, path) !== item.before) throw new Error('配置引用已变化，请重新准备处理。');
          const parent = fieldValue(json, path.slice(0, -1));
          if (Array.isArray(parent)) {
            const parentPath = item.path.slice(0, item.path.lastIndexOf('/'));
            const array = changes.get(parentPath)?.after as Json[] | undefined ?? structuredClone(parent);
            array[Number(path.at(-1))] = item.after;
            changes.set(parentPath, { path: parentPath, op: 'set', before: parent, after: array });
          } else changes.set(item.path, { ...item, op: 'set' });
        }
      }
    }
    if (edits.length) patches.push({ kind: 'text', documentId, edits });
    if (changes.size) patches.push({ kind: 'json', documentId, changes: [...changes.values()] });
  }
  return patches;
}
