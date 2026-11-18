import type { Character, Result } from '@galcraft/contracts';
import { FixtureCharacters, FixtureIds, FixtureProject, fixtureId } from '@galcraft/contracts/fixtures';
import type { AuthoringSource } from '../authoring/controller.js';
import { assetPickerRefinementFixture, pickerPinnedVersion } from './asset-picker-refinement-fixture.js';

/** Real CharacterManager/AssetPicker; file selection, import and persistence remain in memory. */
export function characterAssetFieldsFixture(emptyDifferences = false) {
  const picker = assetPickerRefinementFixture();
  const character: Character = { ...structuredClone(FixtureCharacters[0]!), id: FixtureIds.an, name: '林舟', narrativeRole: 'supporting',
    description: '林舟在雨后的站台值守，替旅人保管未能寄出的信。',
    appearance: { notes: '深色短发，灰蓝外套。外套口袋露出一角旧信封。', referenceAssets: [picker.original.id] },
    differences: [{ id: fixtureId(0xf470), name: '站台 · 平静', figure: { assetId: picker.original.id, variantId: pickerPinnedVersion },
      avatar: { kind: 'image', assetId: picker.original.id, variantId: null } }], initialDifferenceId: fixtureId(0xf470) };
  if (emptyDifferences) { picker.assets.length = 0; character.differences = []; character.initialDifferenceId = null; character.appearance!.referenceAssets = []; }
  const source: AuthoringSource = { project: structuredClone(FixtureProject), projectDocumentId: FixtureIds.projectA,
    projectRevision: 1, projectSavedRevision: 1, projectDirty: false, scenes: [], characters: [character] };
  const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
  const resources = { resolveRuntime: async () => ok({ leaseId: 'character-fields-review', uri: '/practice/backgrounds/spring-station.png', mime: 'image/png', bytes: 1 }), releaseRuntime: async () => ok(undefined) };
  return { ...picker, source, character, resources };
}
