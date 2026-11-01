import type { Character, Snapshot } from '@galcraft/contracts';

export function afterstoryUnlocked(character: Character, endings: readonly string[]): boolean {
  return character.narrativeRole === 'main' && !!character.afterstory?.unlockEndingIds.some(id => endings.includes(id));
}
export function afterstoryDirectoryUnlocked(snapshot: Pick<Snapshot, 'characters'>, endings: readonly string[]): boolean {
  return snapshot.characters.some(character => character.narrativeRole === 'main' && character.afterstory &&
    character.personalRoute?.endingIds.some(id => endings.includes(id)));
}
export function afterstoryCharacters(snapshot: Pick<Snapshot, 'characters'>): Character[] {
  return snapshot.characters.filter(character => character.narrativeRole === 'main' && character.afterstory)
    .sort((a, b) => (a.afterstory?.presentation?.order ?? snapshot.characters.indexOf(a)) - (b.afterstory?.presentation?.order ?? snapshot.characters.indexOf(b)));
}
