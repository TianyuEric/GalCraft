// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Result } from '@galcraft/contracts';
import { FixtureCharacters, FixtureIds, FixtureProject } from '@galcraft/contracts/fixtures';
import type { AuthoringSource } from '../../authoring/controller.js';
import { CharacterManager } from '../../authoring/characters/CharacterManager.js';
import { Command, CommandInput } from './command.js';
import { Textarea } from './textarea.js';

vi.mock('monaco-editor', () => ({}));
afterEach(cleanup);

it.each([undefined, false, true])('maps disabled=%s to the presence marker for shared text inputs', disabled => {
  render(<><Textarea aria-label="Notes" disabled={disabled}/><Command label="Search"><CommandInput disabled={disabled}/></Command></>);
  for (const control of [screen.getByRole('textbox', { name: 'Notes' }), screen.getByRole('combobox', { name: 'Search' })]) {
    expect(control.hasAttribute('data-disabled')).toBe(disabled === true);
    expect((control as HTMLInputElement | HTMLTextAreaElement).disabled).toBe(disabled === true);
  }
});

it('keeps character notes editable before and after the pending transaction', async () => {
  const character = FixtureCharacters[0]!;
  const source: AuthoringSource = { project: FixtureProject, projectDocumentId: FixtureIds.projectA, projectRevision: 1,
    projectSavedRevision: 1, projectDirty: false, scenes: [], characters: [character] };
  let complete!: (result: Result<AuthoringSource>) => void;
  const apply = vi.fn<Parameters<typeof CharacterManager>[0]['apply']>(() => new Promise<Result<AuthoringSource>>(resolve => { complete = resolve; }));
  const ok = { ok: true as const, value: source, warnings: [] };
  render(<CharacterManager source={source} assets={[]} locale="en" embedded objectId={character.id} apply={apply}
    close={() => {}} remove={async () => ok} history={async () => ok}/>);
  const notes = screen.getByRole('textbox', { name: 'Description and story notes' }) as HTMLTextAreaElement;
  const appearance = screen.getByRole('textbox', { name: 'Appearance notes' }) as HTMLTextAreaElement;
  expect(notes.hasAttribute('data-disabled')).toBe(false);
  expect(appearance.hasAttribute('data-disabled')).toBe(false);
  fireEvent.change(notes, { target: { value: 'New character notes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
  await waitFor(() => expect(notes.disabled).toBe(true));
  expect(notes.hasAttribute('data-disabled')).toBe(true);
  complete({ ok: true, value: { ...source, characters: [{ ...character, description: 'New character notes' }] }, warnings: [] });
  await waitFor(() => expect(notes.disabled).toBe(false));
  expect(notes.hasAttribute('data-disabled')).toBe(false);
  expect(appearance.hasAttribute('data-disabled')).toBe(false);
  expect(notes.value).toBe('New character notes');
  expect(apply.mock.calls[0]?.[0]).toEqual([{ ...character, description: 'New character notes' }]);
});
