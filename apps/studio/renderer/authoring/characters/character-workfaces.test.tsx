// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Character, Result } from '@galcraft/contracts';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureProject } from '@galcraft/contracts/fixtures';
import type { AuthoringSource } from '../controller.js';
import { BindCharacterDifference } from './BindCharacterDifference.js';
import { CharacterManager, type CharacterGuiDraft } from './CharacterManager.js';

vi.mock('monaco-editor', () => ({}));
afterEach(cleanup);
const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });

it('binds the displayed older version and keeps the entered name after a failed transaction', async () => {
  const asset = { ...FixtureAsset, name: 'Mira.png', activeVariantId: 'Active', variants: [FixtureAsset.variants[0]!, { ...FixtureAsset.variants[0]!, id: 'Active' }] };
  const issue = { code: 'EDIT_CONFLICT', message: 'Working revision changed', severity: 'error', owner: 'M02', related: [], actions: [] } as const;
  const apply = vi.fn<Parameters<typeof BindCharacterDifference>[0]['apply']>()
    .mockResolvedValueOnce({ ok: false, error: { ...issue, related: [], actions: [] }, issues: [] })
    .mockResolvedValueOnce(ok(undefined));
  const close = vi.fn(), openCharacter = vi.fn();
  render(<><div id="studio-portals" lang="en" /><BindCharacterDifference asset={asset} variantId={FixtureAsset.activeVariantId} characters={FixtureCharacters} locale="en" apply={apply} close={close} openCharacter={openCharacter} /></>);
  const dialog = await screen.findByRole('dialog', { name: 'Bind shared difference' });
  const name = within(dialog).getByRole('textbox', { name: 'Difference name' }) as HTMLInputElement;
  fireEvent.change(name, { target: { value: 'Mira · listening' } });
  const bind = within(dialog).getByRole('button', { name: 'Bind difference' });
  fireEvent.click(bind);
  expect((await within(dialog).findByRole('alert')).textContent).toBe(issue.message);
  expect(name.value).toBe('Mira · listening');
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(bind);
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  const operation = { op: 'character.difference.create', characterId: FixtureCharacters[0]!.id, name: 'Mira · listening',
    figure: { assetId: asset.id, variantId: FixtureAsset.activeVariantId }, avatar: { kind: 'crop', crop: { x: .25, y: 0, width: .5, height: .35 } }, initial: true };
  expect(apply.mock.calls).toEqual([[operation], [operation]]);
  expect(openCharacter).toHaveBeenCalledWith(FixtureCharacters[0]!.id);
});

it('keeps the formal character tab tied to one identity and exposes a newly bound version beside retained input', async () => {
  const [first, second] = FixtureCharacters as [Character, Character];
  const source: AuthoringSource = { project: FixtureProject, projectDocumentId: FixtureIds.projectA, projectRevision: 1,
    projectSavedRevision: 1, projectDirty: false, scenes: [], characters: [first, second] };
  const guiDraft: CharacterGuiDraft = {
    drafts: { [first.id]: { ...first, description: 'Local notes' }, [second.id]: { ...second, description: 'Other notes' } },
    bases: { [first.id]: first, [second.id]: second }, selected: second.id, search: '', section: 'basics',
  };
  const next: AuthoringSource = { ...source, characters: [{ ...first, differences: [{ id: 'DiffAA', name: 'Exact image',
    figure: { assetId: FixtureAsset.id, variantId: FixtureAsset.activeVariantId }, avatar: null }], initialDifferenceId: 'DiffAA' }, second] };
  const capture = vi.fn(), previewAsset = vi.fn(), apply = vi.fn(async () => ok(next));
  const props = { locale: 'en', embedded: true, guiDraft, objectId: first.id, onGuiDraftChange: capture, previewAsset, discardDraft: { characterId: first.id, request: 1 },
    close: vi.fn(), apply, remove: vi.fn(async () => ok(next)), history: vi.fn(async () => ok(next)) } as const;
  const view = render(<CharacterManager {...props} assets={[FixtureAsset]} source={source} />);
  expect(screen.queryByRole('navigation', { name: 'Character list' })).toBeNull();
  expect(screen.getByRole('heading', { name: first.name })).toBeTruthy();
  expect((screen.getByRole('textbox', { name: 'Description and story notes' }) as HTMLTextAreaElement).value).toBe('Local notes');
  expect(capture.mock.lastCall?.[0].drafts).not.toHaveProperty(second.id);
  view.rerender(<CharacterManager {...props} assets={[FixtureAsset]} source={next} sectionRequest={{ section: 'figures', request: 1, differenceId: 'DiffAA' }} />);
  expect(screen.getByRole('button', { name: /^Exact image/ }).getAttribute('aria-current')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'View source' }));
  expect(previewAsset).toHaveBeenCalledWith(FixtureAsset.id, FixtureAsset.activeVariantId);
  fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
  await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
  expect(apply.mock.calls[0]).toEqual([[{ ...next.characters[0], description: 'Local notes' }]]);
});
