// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CharacterDifference, Result } from '@galcraft/contracts';
import { FixtureCharacters, FixtureIds, FixtureProject } from '@galcraft/contracts/fixtures';
import type { AuthoringSource } from '../controller.js';
import { CharacterManager, type CharacterInput, type CharacterManagerProps } from './CharacterManager.js';
import { SharedDifferencesEditor } from './SharedDifferencesEditor.js';
import { assetPickerRefinementFixture, pickerPinnedVersion } from '../../stories/asset-picker-refinement-fixture.js';

vi.mock('monaco-editor', () => ({}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });

it('appends an explicitly chosen reference once, retaining notes, cancellation and the current character transaction', async () => {
  const fixture = assetPickerRefinementFixture();
  const character = { ...structuredClone(FixtureCharacters[0]!), appearance: { notes: 'Original appearance', referenceAssets: [fixture.original.id] } };
  const source: AuthoringSource = { project: FixtureProject, projectDocumentId: FixtureIds.projectA, projectRevision: 1,
    projectSavedRevision: 1, projectDirty: false, scenes: [], characters: [character] };
  const choice = { asset: fixture.imported, assetId: fixture.imported.id, variantId: null };
  const chooseAsset = vi.fn<NonNullable<CharacterManagerProps['chooseAsset']>>().mockResolvedValueOnce(null).mockResolvedValue(choice);
  const apply = vi.fn<CharacterManagerProps['apply']>(async () => ok(source));
  const report = vi.fn(); let input: CharacterInput | null = null;
  render(<CharacterManager source={source} locale="en" embedded objectId={character.id} close={vi.fn()} apply={apply}
    remove={async () => ok(source)} history={async () => ok(source)} assets={[...fixture.assets, fixture.imported]}
    chooseAsset={chooseAsset} onGuiDraftChange={report} registerInput={value => { input = value; }} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Description and story notes' }), { target: { value: 'Retained story notes' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Appearance notes' }), { target: { value: 'Retained appearance notes' } });
  const trigger = screen.getByRole('button', { name: 'Choose or import reference image' }); trigger.focus();
  fireEvent.click(trigger);
  await waitFor(() => expect(chooseAsset).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(report.mock.lastCall?.[0].drafts[character.id].appearance.referenceAssets).toEqual([fixture.original.id]);
  fireEvent.click(trigger);
  await waitFor(() => expect(report.mock.lastCall?.[0].drafts[character.id].appearance.referenceAssets).toEqual([fixture.original.id, fixture.imported.id]));
  fireEvent.click(trigger);
  await waitFor(() => expect(chooseAsset).toHaveBeenCalledTimes(3));
  expect(chooseAsset.mock.calls[0]?.[0]).toEqual({ characterId: character.id, allowedKinds: ['image'], purpose: 'reference' });
  await act(async () => { expect(await input!.applyCurrent()).toBe(true); });
  expect(apply.mock.calls[0]?.[0][0]).toMatchObject({ id: character.id, description: 'Retained story notes',
    appearance: { notes: 'Retained appearance notes', referenceAssets: [fixture.original.id, fixture.imported.id] } });
});

it('keeps exact and floating figure/portrait references through the original shared-difference update', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const fixture = assetPickerRefinementFixture();
  const initial: CharacterDifference = { id: FixtureIds.friend, name: 'Retained difference',
    figure: { assetId: fixture.original.id, variantId: pickerPinnedVersion },
    avatar: { kind: 'image', assetId: fixture.original.id, variantId: null } };
  const chosen = { asset: fixture.imported, assetId: fixture.imported.id, variantId: fixture.imported.activeVariantId };
  const chooseAsset = vi.fn<NonNullable<React.ComponentProps<typeof SharedDifferencesEditor>['chooseAsset']>>()
    .mockResolvedValueOnce(chosen).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...chosen, variantId: null });
  const change = vi.fn();
  function Editor() {
    const [value, setValue] = useState([initial]);
    return <SharedDifferencesEditor value={value} initialId={initial.id} assets={[fixture.original, fixture.imported]} locale="en"
      chooseAsset={chooseAsset} change={(value, id) => { change(value, id); setValue(value); }} />;
  }
  render(<Editor />);
  const figure = screen.getByRole('button', { name: 'Choose or import figure' }), portrait = screen.getByRole('button', { name: 'Choose or import portrait' });
  figure!.focus(); fireEvent.click(figure!);
  await waitFor(() => expect(change).toHaveBeenCalledTimes(1));
  expect(chooseAsset.mock.calls[0]).toEqual([initial.figure, 'difference-figure']);
  expect(change.mock.lastCall?.[0][0]).toMatchObject({ figure: { assetId: fixture.imported.id, variantId: chosen.variantId }, avatar: initial.avatar });
  await waitFor(() => expect(document.activeElement).toBe(figure));
  fireEvent.click(portrait!);
  await waitFor(() => expect(chooseAsset).toHaveBeenCalledTimes(2));
  expect(change).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(portrait!.hasAttribute('disabled')).toBe(false)); fireEvent.click(portrait!);
  await waitFor(() => expect(change).toHaveBeenCalledTimes(2));
  expect(chooseAsset.mock.calls[2]).toEqual([{ kind: 'image', assetId: fixture.original.id, variantId: null }, 'difference-avatar']);
  expect(change.mock.lastCall?.[0][0]).toMatchObject({ figure: { assetId: fixture.imported.id, variantId: chosen.variantId }, avatar: { kind: 'image', assetId: fixture.imported.id, variantId: null } });
  expect(change.mock.lastCall?.[1]).toBe(initial.id);
});
