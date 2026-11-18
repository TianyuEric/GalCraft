// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Character, Result } from '@galcraft/contracts';
import { FixtureCharacters, FixtureIds, FixtureProject } from '@galcraft/contracts/fixtures';
import type { AuthoringSource } from '../controller.js';
import { CharacterManager, type CharacterGuiDraft, type CharacterInput, type CharacterManagerProps } from './CharacterManager.js';

vi.mock('monaco-editor', () => ({}));
afterEach(cleanup);
const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const [first, second] = FixtureCharacters as [Character, Character];
const source: AuthoringSource = { project: FixtureProject, projectDocumentId: FixtureIds.projectA, projectRevision: 1,
  projectSavedRevision: 1, projectDirty: false, scenes: [], characters: [first, second] };

function fixture(overrides: Partial<CharacterManagerProps> = {}) {
  let input: CharacterInput | null = null;
  const apply = vi.fn<CharacterManagerProps['apply']>(async drafts => ok({ ...source, characters: source.characters.map(character => ({ ...character, ...drafts.find(draft => draft.id === character.id) })) }));
  const report = vi.fn(), registerInput = vi.fn((value: CharacterInput | null) => { input = value; });
  const props: CharacterManagerProps = { source, locale: 'en', embedded: true, objectId: first.id, close: vi.fn(), apply,
    remove: vi.fn(async () => ok(source)), history: vi.fn(async () => ok(source)), registerInput, onGuiDraftChange: report, ...overrides };
  const view = render(<CharacterManager {...props} />);
  const applyCurrent = async () => { let result = false; await act(async () => { result = await input!.applyCurrent(); }); return result; };
  return { ...view, props, apply, report, registerInput, input: () => input, applyCurrent };
}

it('applies only the current stable identity from recovered multi-character input and unregisters without discarding it', async () => {
  const guiDraft: CharacterGuiDraft = { drafts: { [first.id]: { ...first, description: 'First retained notes' }, [second.id]: { ...second, description: 'Second retained notes' } },
    bases: { [first.id]: first, [second.id]: second }, selected: second.id, search: '' };
  const firstView = fixture({ guiDraft });
  expect((screen.getByRole('textbox', { name: 'Description and story notes' }) as HTMLTextAreaElement).value).toBe('First retained notes');
  expect(firstView.report.mock.lastCall?.[0].drafts).not.toHaveProperty(second.id);
  expect(await firstView.applyCurrent()).toBe(true);
  expect(firstView.apply.mock.calls[0]?.[0].map(draft => draft.id)).toEqual([first.id]);
  firstView.unmount();
  expect(firstView.registerInput.mock.lastCall).toEqual([null]);
  expect(guiDraft.drafts[second.id]!.description).toBe('Second retained notes');
  const secondView = fixture({ guiDraft, objectId: second.id });
  expect((screen.getByRole('textbox', { name: 'Description and story notes' }) as HTMLTextAreaElement).value).toBe('Second retained notes');
  secondView.unmount();
  expect(secondView.report.mock.lastCall?.[0].drafts[second.id].description).toBe('Second retained notes');
});

it('retains invalid input, locates the name field, and does not apply until the current name is repaired', async () => {
  const view = fixture();
  const name = screen.getByRole('textbox', { name: /Character name/ }) as HTMLInputElement;
  fireEvent.change(name, { target: { value: '' } });
  expect(await view.applyCurrent()).toBe(false);
  expect(view.apply).not.toHaveBeenCalled();
  expect(name.value).toBe('');
  expect(document.activeElement).toBe(name);
  expect(screen.getByRole('alert').textContent).toBe('Enter a character name.');
  fireEvent.change(name, { target: { value: 'Repaired name' } });
  expect(await view.applyCurrent()).toBe(true);
  expect(view.apply.mock.calls[0]?.[0][0]?.name).toBe('Repaired name');
});

it('holds composing input and exposes its state to menu save until composition ends', async () => {
  const view = fixture();
  const description = screen.getByRole('textbox', { name: 'Description and story notes' });
  fireEvent.compositionStart(description);
  fireEvent.change(description, { target: { value: '正在输入' } });
  expect(view.input()!.isComposing()).toBe(true);
  expect(await view.applyCurrent()).toBe(false);
  expect(view.apply).not.toHaveBeenCalled();
  fireEvent.compositionEnd(description);
  expect(view.input()!.isComposing()).toBe(false);
  expect(await view.applyCurrent()).toBe(true);
  expect(view.apply.mock.calls[0]?.[0][0]?.description).toBe('正在输入');
});

it('keeps input and prevents duplicate applications while the current transaction is pending', async () => {
  let resolve!: (value: Result<AuthoringSource>) => void;
  const apply = vi.fn<CharacterManagerProps['apply']>(() => new Promise(done => { resolve = done; }));
  const view = fixture({ apply });
  const description = screen.getByRole('textbox', { name: 'Description and story notes' }) as HTMLTextAreaElement;
  fireEvent.change(description, { target: { value: 'Busy notes' } });
  let firstApplication!: Promise<boolean>;
  act(() => { firstApplication = view.input()!.applyCurrent(); });
  expect(description.disabled).toBe(true);
  expect(await view.applyCurrent()).toBe(false);
  expect(apply).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ ok: false, error: { code: 'EDIT_FAILED', message: 'Retained failure', severity: 'error', owner: 'M02', related: [], actions: [] }, issues: [] }); await firstApplication; });
  expect(description.disabled).toBe(false);
  expect(description.value).toBe('Busy notes');
  expect(view.report.mock.lastCall?.[0].drafts[first.id].description).toBe('Busy notes');
});

it('retains conflicting fields and uses the existing explicit resolution before applying', async () => {
  const view = fixture();
  fireEvent.change(screen.getByRole('textbox', { name: 'Description and story notes' }), { target: { value: 'My notes' } });
  const latest = { ...source, characters: [{ ...first, name: 'External name', description: 'External notes' }, second] };
  view.rerender(<CharacterManager {...view.props} source={latest} />);
  expect(await view.applyCurrent()).toBe(false);
  expect(view.apply).not.toHaveBeenCalled();
  expect((screen.getByRole('textbox', { name: 'Description and story notes' }) as HTMLTextAreaElement).value).toBe('My notes');
  fireEvent.click(screen.getByRole('button', { name: 'Use my conflicting fields' }));
  await waitFor(() => expect(view.apply).toHaveBeenCalledTimes(1));
  expect(view.apply.mock.calls[0]?.[0][0]).toMatchObject({ id: first.id, name: 'External name', description: 'My notes' });
});

it('keeps save distinct from the secondary workspace application and leaves reference-bound profiles editable', async () => {
  const saveCurrent = vi.fn();
  const view = fixture({ saveCurrent });
  const description = screen.getByRole('textbox', { name: 'Description and story notes' }) as HTMLTextAreaElement;
  expect(description.disabled).toBe(false);
  fireEvent.change(description, { target: { value: 'Editable profile' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save current character' }));
  expect(saveCurrent).toHaveBeenCalledTimes(1);
  expect(view.apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply to workspace only' }));
  await waitFor(() => expect(view.apply).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('status').textContent).toContain('Applied to the workspace');
});

it('keeps unknown recovered identities protected instead of recreating deleted characters', async () => {
  const id = 'OldChr';
  const view = fixture({ objectId: id, guiDraft: { drafts: { [id]: { ...first, id, description: 'Unknown retained notes' } }, selected: id, search: '' } });
  expect(await view.applyCurrent()).toBe(false);
  expect(view.apply).not.toHaveBeenCalled();
  expect(view.report.mock.lastCall?.[0].drafts[id].description).toBe('Unknown retained notes');
  expect(screen.getByRole('alert').textContent).toContain('This character was removed');
});

it('creates an explicitly recovered new character through the original stable identity', async () => {
  const id = 'OldNew', draft = { id, name: 'Recovered new character', description: 'Retained new notes', narrativeRole: 'supporting' as const };
  const apply = vi.fn<CharacterManagerProps['apply']>(async drafts => ok({ ...source, characters: [...source.characters, { ...first, ...drafts[0]!, id }] }));
  const view = fixture({ objectId: id, recoveringDraft: true, saveCurrent: vi.fn(), apply,
    guiDraft: { drafts: { [id]: draft }, selected: id, search: '' } });
  expect((screen.getByRole('textbox', { name: 'Description and story notes' }) as HTMLTextAreaElement).value).toBe('Retained new notes');
  expect(screen.getByRole('status').textContent).toContain('Applying it creates this character');
  fireEvent.click(screen.getByRole('button', { name: 'Apply to workspace only' }));
  await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
  expect(apply.mock.calls[0]).toEqual([[draft]]);
  await waitFor(() => expect(view.report.mock.lastCall?.[0].drafts).not.toHaveProperty(id));
  expect(screen.getByRole('heading', { name: draft.name })).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('Applied to the workspace');
});

it('retains explicitly recovered new input when validation or its creation transaction fails', async () => {
  const id = 'OldNew', draft = { id, name: '', description: 'Keep these new notes', narrativeRole: 'supporting' as const };
  const apply = vi.fn<CharacterManagerProps['apply']>(async () => ({ ok: false,
    error: { code: 'EDIT_FAILED', message: 'Creation failed', severity: 'error', owner: 'M02', related: [], actions: [] }, issues: [] }));
  const view = fixture({ objectId: id, recoveringDraft: true, apply, guiDraft: { drafts: { [id]: draft }, selected: id, search: '' } });
  expect(await view.applyCurrent()).toBe(false);
  expect(apply).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: /Character name/ }), { target: { value: 'Recovered new character' } });
  expect(await view.applyCurrent()).toBe(false);
  expect(apply.mock.calls[0]?.[0][0]).toMatchObject({ id, name: 'Recovered new character', description: draft.description });
  expect(view.report.mock.lastCall?.[0].drafts[id].description).toBe(draft.description);
  expect(screen.getByRole('alert').textContent).toBe('Creation failed');
  expect((screen.getByRole('textbox', { name: 'Description and story notes' }) as HTMLTextAreaElement).value).toBe(draft.description);
});

it('keeps a deleted character with an existing form base protected even when recovery is requested', async () => {
  const id = 'OldChr';
  const view = fixture({ objectId: id, recoveringDraft: true,
    guiDraft: { drafts: { [id]: { ...first, id, description: 'Deleted retained notes' } }, bases: { [id]: { ...first, id } }, selected: id, search: '' } });
  expect(await view.applyCurrent()).toBe(false);
  expect(view.apply).not.toHaveBeenCalled();
  expect(view.report.mock.lastCall?.[0].drafts[id].description).toBe('Deleted retained notes');
  expect(screen.queryByRole('textbox', { name: 'Description and story notes' })).toBeNull();
});
