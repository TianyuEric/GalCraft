import type { Character, Id, PresentationState, StageObject } from '@galcraft/contracts';

export type ReadingPortrait = { kind: 'image'; assetId: Id } | { kind: 'crop'; object: StageObject } | { kind: 'shared'; characterId: Id } | null;
/** A missing explicit image never selects a lower-priority source or another speaker. */
export function readingPortrait(objects: readonly StageObject[], text: PresentationState['text'], characters: readonly Pick<Character, 'id' | 'avatar'>[], differences?: PresentationState['characterDifferences']): ReadingPortrait {
  if (text.reading?.mode === 'nvl') return null;
  const sentence = text.avatarSelection ?? (text.avatarId ? { mode: 'image' as const, assetId: text.avatarId } : { mode: 'auto' as const });
  const current = text.speakerId ? text.characterAvatars?.[text.speakerId] : undefined;
  const shared = text.speakerId ? differences?.[text.speakerId] : undefined;
  if (sentence.mode === 'hidden' || current?.mode === 'hidden' || shared?.avatarVisible === false) return null;
  if (sentence.mode === 'image') return { kind: 'image', assetId: sentence.assetId };
  if (current?.mode === 'image') return { kind: 'image', assetId: current.assetId };
  if (!text.speakerId) return null;
  if (shared?.avatar) return { kind: 'shared', characterId: text.speakerId };
  const avatar = characters.find(character => character.id === text.speakerId)?.avatar;
  if (avatar) return { kind: 'image', assetId: avatar };
  const object = dialoguePortrait(objects, text); return object ? { kind: 'crop', object } : null;
}
export function stageObjectVisible(object: StageObject, reading: PresentationState['text']['reading']): boolean {
  if (object.visible === false) return false;
  const purpose = object.purpose ?? (object.layer === 'figure' ? 'figure' : null);
  return reading?.mode !== 'nvl' || purpose !== 'figure' && (purpose !== 'illustration' || reading.retainIllustrations);
}

/** Only an explicitly enabled portrait is displayed. No previous speaker fallback. */
export function dialoguePortrait(objects: readonly StageObject[], text: PresentationState['text']): StageObject | null {
  if (!text.speakerId) return null;
  const available = objects.filter(object => object.layer === 'figure' && object.purpose !== 'illustration' && object.characterId === text.speakerId && object.current.opacity > 0);
  const object = text.portraitObjectId ? available.find(item => item.id === text.portraitObjectId) : available.length === 1 ? available[0] : null;
  return object?.portrait?.enabled ? object : null;
}

export function portraitSourceRect(object: StageObject, source: { width: number; height: number; offsetX?: number; offsetY?: number }, texture: { width: number; height: number }) {
  const crop = object.portrait!.crop;
  const x = crop.x * source.width, y = crop.y * source.height;
  const width = crop.width * source.width, height = crop.height * source.height;
  const left = Math.max(x, source.offsetX ?? 0), top = Math.max(y, source.offsetY ?? 0);
  const right = Math.min(x + width, (source.offsetX ?? 0) + texture.width);
  const bottom = Math.min(y + height, (source.offsetY ?? 0) + texture.height);
  return { x: left - (source.offsetX ?? 0), y: top - (source.offsetY ?? 0), width: Math.max(0, right - left), height: Math.max(0, bottom - top),
    offsetX: (left - x) / width, offsetY: (top - y) / height, scaleX: Math.max(0, right - left) / width, scaleY: Math.max(0, bottom - top) / height };
}
