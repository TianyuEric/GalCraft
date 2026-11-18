import { parse } from '@galcraft/dsl';
import type { Asset, Character, CharacterDifference, Id } from '@galcraft/contracts';
import type { AuthoringSource, StudioLocale } from '../controller.js';
export { neutralCharacter, characterDraft, characterEdit, characterReferences, removeCharacterEdit, mergeCharacterDraft, normalizeCharacterVoicePresets } from '@galcraft/documents/authoring';
export type { CharacterDraft } from '@galcraft/documents/authoring';

export function newCharacterName(characters: readonly Pick<Character, 'name'>[], locale: StudioLocale): string {
  const base = locale === 'en' ? 'New character' : locale === 'ja' ? '新しいキャラクター' : '新角色';
  const names = new Set(characters.map(character => character.name));
  let name = base;
  for (let suffix = 2; names.has(name); suffix++) name = `${base} ${suffix}`;
  return name;
}

export function characterRoleName(locale: StudioLocale, role: Character['narrativeRole']): string {
  const labels = {
    viewpoint: ['玩家视角', 'Viewpoint', 'プレイヤー視点'],
    main: ['主角色', 'Main character', 'メインキャラクター'],
    supporting: ['配角', 'Supporting', 'サブキャラクター'],
    character: ['未分类', 'Unclassified', '未分類'],
  };
  return labels[role][locale === 'en' ? 1 : locale === 'ja' ? 2 : 0]!;
}

export const defaultDifferenceCrop = { x: .25, y: 0, width: .5, height: .35 };

export function differenceVersionLabel(asset: Asset, variantId: Id, locale: string): string {
  const index = asset.variants.findIndex(variant => variant.id === variantId);
  if (index === -1) return locale === 'en' ? 'Missing version' : locale === 'ja' ? 'バージョンなし' : '版本缺失';
  const current = locale === 'en' ? 'Current' : locale === 'ja' ? '現在' : '当前采用';
  return `${index + 1} · ${asset.variants[index]!.role}${variantId === asset.activeVariantId ? ` · ${current}` : ''}`;
}

type DifferencePortrait = 'default' | 'image' | 'crop';

export function differencePortrait(source: CharacterDifference['figure'], kind: DifferencePortrait, crop = defaultDifferenceCrop): CharacterDifference['avatar'] {
  if (kind === 'image') return { kind, ...source };
  if (kind === 'crop') return { kind, crop: { ...crop } };
  return null;
}

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
