import { parse } from '@galcraft/dsl';
import type { AuthoringSource } from '../controller.js';
export { neutralCharacter, characterDraft, characterEdit, characterReferences, removeCharacterEdit, mergeCharacterDraft, normalizeCharacterVoicePresets } from '@galcraft/documents/authoring';
export type { CharacterDraft } from '@galcraft/documents/authoring';

export function endingOptions(source: AuthoringSource): { id: string; scenes: string[] }[] {
  const endings = new Map<string, Set<string>>();
  for (const scene of source.scenes) for (const node of parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).cst) {
    if (!node.valid || node.command !== 'end') continue;
    const id = (node.object?.value as { endingId?: string } | undefined)?.endingId;
    if (!id) continue;
    if (!endings.has(id)) endings.set(id, new Set());
    endings.get(id)!.add(scene.name);
  }
  return [...endings].map(([id, scenes]) => ({ id, scenes: [...scenes] }));
}
