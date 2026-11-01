import { CharacterSchema, createId } from '@galcraft/contracts';
import type { Character, DocumentView, EditInput, Id, Project } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';

export type CharacterDraft = Pick<Character, 'id' | 'name' | 'description' | 'narrativeRole' | 'personalRoute'> &
  Partial<Pick<Character, 'avatar' | 'voicePresets' | 'differences' | 'initialDifferenceId' | 'afterstory' | 'appearance' | 'groups' | 'defaultEffects' | 'defaultVoicing'>>;
export type CharacterAuthoringSource = { project: Project; characters: Character[] };
export function neutralCharacter(id: Id, name: string, _project?: Project, narrativeRole: Character['narrativeRole'] = 'supporting'): Character {
  return CharacterSchema.parse({ id, name, narrativeRole, description: '', avatar: null,
    appearance: { referenceAssets: [], notes: '' }, groups: [],
    defaultEffects: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1, blur: 0,
      brightness: 1, contrast: 1, saturation: 1, gamma: 1, rgb: [255, 255, 255],
      bloom: { intensity: 0, brightness: 1, blur: 0, threshold: 0 },
      bevel: { opacity: 0, thickness: 0, rotationDeg: 0, softness: 0, rgb: [255, 255, 255] },
      filters: { oldFilm: false, dot: false, reflection: false, glitch: false, rgbSplit: false, godray: false },
      blend: 'normal', z: 0 }, voicePresets: {}, defaultVoicing: narrativeRole === 'viewpoint' ? 'intentionalSilent' : 'required' });
}
export const characterDraft = (character: Character): CharacterDraft => structuredClone(character);
/** Merge only fields actually edited in the form, retaining the original form base. */
export function mergeCharacterDraft(base: CharacterDraft, draft: CharacterDraft, latest: CharacterDraft, resolution?: 'draft' | 'current'): { value: CharacterDraft; conflicts: string[] } {
  const conflicts: string[] = [], same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const merge = (before: unknown, entered: unknown, current: unknown, path: string): unknown => {
    if (same(before, entered)) return structuredClone(current);
    if (object(before) && object(entered) && object(current)) return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(entered), ...Object.keys(current)])].map(key => [key, merge(before[key], entered[key], current[key], path ? `${path}.${key}` : key)]));
    if (!same(before, current) && !same(entered, current)) { conflicts.push(path); if (resolution === 'current') return structuredClone(current); }
    return structuredClone(entered);
  };
  return { value: merge(base, draft, latest, '') as CharacterDraft, conflicts };
}
export function characterDocument(documents: DocumentView[], id: Id) {
  return documents.find(document => Object.keys(document.files).includes(`characters/${id}.json`));
}
/** Project locale identity is authoritative; ambiguous aliases remain unchanged. */
export function normalizeCharacterVoicePresets(character: Character, languages: Project['languages']): Character {
  const result = structuredClone(character), presets: Character['voicePresets'] = {};
  for (const [key, preset] of Object.entries(result.voicePresets)) {
    const candidates = languages.voices.filter(locale => locale === key || locale.split('-')[0] === key.split('-')[0]);
    if (!languages.voices.includes(key) && candidates.length > 1) throw new Error(`VOICE_LOCALE_CONFLICT: ${key} matches multiple project voice languages`);
    const locale = languages.voices.includes(key) ? key : candidates.length === 1 ? candidates[0]! : key;
    if (presets[locale]) throw new Error(`VOICE_LOCALE_CONFLICT: ${locale} has multiple presets; choose the intended preset before applying`);
    const alias=preset.locale.split('-')[0]===locale.split('-')[0]&&(!preset.locale.includes('-')||!locale.includes('-'));
    if (preset.locale !== key && preset.locale !== locale && !alias) throw new Error(`VOICE_LOCALE_CONFLICT: preset ${preset.id} locale differs from its key`);
    presets[locale] = { ...preset, locale };
  }
  result.voicePresets = presets;
  return result;
}
export function characterEdit(source: CharacterAuthoringSource, documents: DocumentView[], drafts: CharacterDraft[]): EditInput {
  const editedIds = new Set(drafts.map(draft => draft.id));
  if (editedIds.size !== drafts.length) throw new Error('Duplicate character identity');
  const names = new Set(source.characters.filter(character => !editedIds.has(character.id)).map(character => character.name));
  const patches: EditInput['patches'] = [], expected: EditInput['expected'] = [];
  for (const draft of drafts) {
    const name = draft.name.trim();
    if (!name) throw new Error('Character name is required');
    if (names.has(name)) throw new Error(`Character name ${name} already exists`);
    names.add(name);
    const previous = source.characters.find(character => character.id === draft.id);
    const next = normalizeCharacterVoicePresets(CharacterSchema.parse({ ...(previous ?? neutralCharacter(draft.id, name, source.project, draft.narrativeRole)), ...draft, name }), source.project.languages);
    if (next.narrativeRole !== 'main' && next.afterstory) throw new Error('Remove the afterstory entry before changing the narrative role');
    if (source.project.player.name?.characterId === next.id && next.narrativeRole !== 'viewpoint') throw new Error('Change the player-name association before changing the narrative role');
    if (next.narrativeRole !== 'main' && next.personalRoute && (next.personalRoute.sceneIds.length || next.personalRoute.endingIds.length)) throw new Error('Remove the personal route before changing the narrative role');
    if (next.narrativeRole !== 'main') delete next.personalRoute;
    else if (next.personalRoute) next.personalRoute = { sceneIds: [...new Set(next.personalRoute.sceneIds)], endingIds: [...new Set(next.personalRoute.endingIds)] };
    next.groups=next.groups.map(group=>({...group,name:group.name.trim()}));if(next.groups.some(group=>!group.name))throw new Error('Character group names are required');
    const differences = next.differences ?? [];
    if (new Set(differences.map(item => item.id)).size !== differences.length) throw new Error('Character difference identities must be unique');
    if (next.initialDifferenceId && !differences.some(item => item.id === next.initialDifferenceId)) throw new Error('Initial difference must reference a configured difference');
    for(const removed of previous?.differences??[])if(!differences.some(item=>item.id===removed.id)){
      const consumers=characterReferences(documents,removed.id).filter(path=>path!==`characters/${draft.id}.json`);
      if(consumers.length)throw new Error(`DIFFERENCE_IN_USE: ${removed.name} is used by ${consumers.join(', ')}; replace its consumers before removing it`);
    }
    if(new Set(next.groups.map(group=>group.id)).size!==next.groups.length)throw new Error('Character group identities must be unique');
    const document = characterDocument(documents, draft.id);
    if (previous && !document) throw new Error('Character document is unavailable');
    if (document) {
      const before = JSON.parse(document.files[`characters/${draft.id}.json`]!).data;
      patches.push({ kind: 'json', documentId: document.documentId, changes: [{ path: '/data', before, after: JSON.parse(JSON.stringify(next)), op: 'set' }] });
      expected.push({ ref: { kind: 'document', id: document.documentId }, revision: document.revision });
    } else {
      const documentId = createId([source, documents, drafts]);
      patches.push({ kind: 'document', documentId, op: 'create', before: null,
        after: { format: 'json', files: { [`characters/${draft.id}.json`]: JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data: next }, null, 2) + '\n' } } });
    }
  }
  return { label: 'Edit characters', origin: 'field', expected, patches, preparedAssets: [], requiredRefs: [] };
}
function containsId(value: unknown, id: Id): boolean {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some(item => containsId(item, id));
  return !!value && typeof value === 'object' && Object.values(value).some(item => containsId(item, id));
}
export function characterReferences(documents: DocumentView[], id: Id): string[] {
  const own = characterDocument(documents, id);
  return documents.filter(document => document.documentId !== own?.documentId).flatMap(document => Object.entries(document.files).filter(([path, raw]) => {
    if (path.endsWith('.gal')) return parse({ documentId: document.documentId, revision: document.revision, text: raw }).cst.some(node => containsId(node.object?.value, id));
    if (!path.endsWith('.json')) return false;
    try { return containsId(JSON.parse(raw).data, id); } catch { return false; }
  }).map(([path]) => path));
}
export function removeCharacterEdit(documents: DocumentView[], id: Id): EditInput {
  const document = characterDocument(documents, id);
  if (!document) throw new Error('Character document is unavailable');
  const references = characterReferences(documents, id);
  if (references.length) throw new Error(`Character is still referenced: ${references.join(', ')}`);
  return { label: 'Remove character', origin: 'field', expected: [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }],
    patches: [{ kind: 'document', documentId: document.documentId, op: 'delete', before: { format: document.format, files: document.files }, after: null }], preparedAssets: [], requiredRefs: [] };
}
