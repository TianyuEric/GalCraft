// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createId, StartupClipSchema, StartupSequenceSchema, type Project } from '@galcraft/contracts';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import { ProjectLanguageEditor, type ProjectLanguageEditorHandle } from './project-languages.js';
import { createPlayerNameEditor } from './player-name.js';
import { StartupEditor, hasStartupFieldInput, type StartupEditorInput, type StartupGuiDraft } from './startup-editor.js';
import { StartupSequenceEditor, type StartupSequenceInput } from './startup-sequence-editor.js';

const disposers: Array<() => void> = [];
afterEach(async () => { await act(async () => { for (const dispose of disposers.splice(0)) dispose(); }); cleanup(); vi.restoreAllMocks(); });
async function apply(input: { applyCurrent(): Promise<boolean> }) { let result = false; await act(async () => { result = await input.applyCurrent(); }); return result; }

it('applies the language input once, including a valid additional voice, and waits for an existing apply', async () => {
  const ref = createRef<ProjectLanguageEditorHandle>();
  let release!: () => void;
  const changed = vi.fn(async (_value: typeof FixtureProject.languages) => await new Promise<void>(resolve => { release = resolve; }));
  const view = render(<ProjectLanguageEditor value={structuredClone(FixtureProject.languages)} locale="en" ref={ref} apply={changed}/>);
  fireEvent.change(view.getByRole('textbox', { name: /Source text language/ }), { target: { value: 'ja' } });
  fireEvent.change(view.getByRole('textbox', { name: 'Add another voice language' }), { target: { value: 'ko' } });
  await act(async () => {
    const first = ref.current!.applyCurrent(), second = ref.current!.applyCurrent();
    await Promise.resolve(); release();
    expect(await first).toBe(true); expect(await second).toBe(true);
    expect(ref.current!.dirty).toBe(false);
    expect(ref.current!.capture()).toMatchObject({ draft: { textDefault: 'ja' }, additional: '' });
    expect(JSON.stringify(ref.current!.capture().draft)).toBe(ref.current!.capture().baseline);
  });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0]![0]).toMatchObject({ textDefault: 'ja', voices: expect.arrayContaining(['ko']) });
  expect(ref.current!.dirty).toBe(false);
});

it('preserves and locates invalid language input, rejects composition, and keeps input after an apply failure', async () => {
  const ref = createRef<ProjectLanguageEditorHandle>(), changed = vi.fn(async () => {});
  const view = render(<ProjectLanguageEditor value={structuredClone(FixtureProject.languages)} locale="en" ref={ref} apply={changed}/>);
  const source = view.getByRole('textbox', { name: /Source text language/ }) as HTMLInputElement;
  fireEvent.change(source, { target: { value: '' } });
  expect(await apply(ref.current!)).toBe(false); expect(document.activeElement).toBe(source); expect(source.value).toBe('');
  fireEvent.change(source, { target: { value: 'ja' } }); fireEvent.compositionStart(source);
  expect(ref.current!.isComposing()).toBe(true); expect(await apply(ref.current!)).toBe(false); expect(changed).not.toHaveBeenCalled();
  fireEvent.compositionEnd(source); changed.mockRejectedValueOnce(new Error('Transaction failed'));
  expect(await apply(ref.current!)).toBe(false); expect(ref.current!.dirty).toBe(true); expect(source.value).toBe('ja');
  expect(await apply(ref.current!)).toBe(true); expect(ref.current!.dirty).toBe(false);
});

async function playerName() {
  const id = createId(), setPlayerName = vi.fn(async (_value: unknown) => ({ ok: true as const, value: undefined, warnings: [] }));
  const controller = { source: { project: { ...structuredClone(FixtureProject), player: { ...FixtureProject.player, name: null } }, characters: [{ id, name: 'Haruki', narrativeRole: 'viewpoint' }], variables: [] }, preferences: { locale: 'en' }, setPlayerName } as unknown as Parameters<typeof createPlayerNameEditor>[0];
  let editor!: NonNullable<ReturnType<typeof createPlayerNameEditor>>;
  await act(async () => { editor = createPlayerNameEditor(controller, vi.fn())!; document.body.append(editor.root); });
  disposers.push(() => { editor.dispose(); editor.root.remove(); });
  fireEvent.change(within(editor.root).getByRole('combobox', { name: 'Name mode' }), { target: { value: 'fixed' } });
  return { editor, setPlayerName, name: within(editor.root).getByRole<HTMLInputElement>('textbox', { name: 'Default name' }) };
}

it('applies protagonist input through its original transaction and waits without duplicating it', async () => {
  const { editor, setPlayerName, name } = await playerName();
  fireEvent.input(name, { target: { value: '春树' } });
  let release!: () => void;
  setPlayerName.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return { ok: true, value: undefined, warnings: [] }; });
  await act(async () => { const first = editor.applyCurrent(), second = editor.applyCurrent(); expect(name.disabled).toBe(true); release(); expect(await first).toBe(true); expect(await second).toBe(true); });
  expect(setPlayerName).toHaveBeenCalledTimes(1); expect(setPlayerName.mock.calls[0]![0]).toMatchObject({ defaultName: '春树' }); expect(editor.dirty).toBe(false);
  expect(name.disabled).toBe(false);
});

it.each(['', ' ', 'A'.repeat(25)])('keeps invalid protagonist input focused without temporarily disabling it (%j)', async value => {
  const { editor, setPlayerName, name } = await playerName();
  fireEvent.input(name, { target: { value } });
  const disabled = vi.spyOn(name, 'disabled', 'set');
  expect(await apply(editor)).toBe(false);
  expect(disabled).not.toHaveBeenCalledWith(true); expect(name.disabled).toBe(false);
  expect(document.activeElement).toBe(name); expect(name.value).toBe(value); expect(editor.dirty).toBe(true); expect(setPlayerName).not.toHaveBeenCalled();
});

it('restores protagonist input after a busy transaction fails', async () => {
  const { editor, setPlayerName, name } = await playerName();
  fireEvent.input(name, { target: { value: 'Haruki edited' } });
  setPlayerName.mockRejectedValueOnce(new Error('Transaction failed'));
  expect(await apply(editor)).toBe(false); expect(editor.dirty).toBe(true); expect(name.disabled).toBe(false); expect(name.value).toBe('Haruki edited');
  expect(await apply(editor)).toBe(true);
});

it('keeps invalid or composing protagonist input outside the working transaction', async () => {
  const { editor, setPlayerName, name } = await playerName();
  fireEvent.input(name, { target: { value: ' ' } });
  expect(await apply(editor)).toBe(false); expect(document.activeElement).toBe(name); expect(name.value).toBe(' ');
  fireEvent.input(name, { target: { value: '春树' } }); fireEvent.compositionStart(name);
  expect(editor.isComposing()).toBe(true); expect(await apply(editor)).toBe(false); expect(setPlayerName).not.toHaveBeenCalled();
  fireEvent.compositionEnd(name); expect(await apply(editor)).toBe(true);
});

function startup(project: Project = structuredClone(FixtureProject), buffers?: Record<string, string>, guiDraft?: StartupGuiDraft) {
  let input: StartupEditorInput | null = null;
  let captured: StartupGuiDraft | null = null;
  const changed = vi.fn(async (_display: Project['display']) => {}), pending = vi.fn();
  const view = render(<StartupEditor project={project} locale="en" assets={[]} chooseAsset={async () => null} onChange={changed} preview={async () => () => {}}
    guiDraft={guiDraft ?? (buffers ? { display: project.display, displayPending: false, buffers, tab: 'splash' } : undefined)}
    onGuiDraftChange={draft => { captured = draft; }}
    onDraftChange={pending} registerInput={value => { input = value; }}/>);
  return { view, changed, pending, input: () => input!, capture: () => captured };
}

it('confirms focused and restored startup number buffers through the original display queue', async () => {
  const { view, changed, pending, input } = startup(undefined, { 'splash.fade-in': '350', 'music.volume': '29' });
  fireEvent.change(view.getByRole('spinbutton', { name: 'Hold duration · ms' }), { target: { value: '4200' } });
  await act(async () => { const first = input().applyCurrent(), second = input().applyCurrent(); expect(await first).toBe(true); expect(await second).toBe(true); });
  expect(changed).toHaveBeenCalledTimes(3);
  expect(changed.mock.calls.at(-1)![0].splashPlayback).toMatchObject({ durationMs: 4200, fadeInMs: 350 });
  expect(changed.mock.calls.at(-1)![0].titleMusicPlayback?.volume).toBe(.29);
  expect(pending).toHaveBeenLastCalledWith(false);
});

it('retains invalid, composing and failed startup numbers and locates the invalid field', async () => {
  const { view, changed, input } = startup();
  let hold = view.getByRole('spinbutton', { name: 'Hold duration · ms' }) as HTMLInputElement;
  fireEvent.change(hold, { target: { value: '' } });
  expect(await apply(input())).toBe(false); hold = view.getByRole('spinbutton', { name: 'Hold duration · ms' }) as HTMLInputElement; expect(document.activeElement).toBe(hold); expect(hold.value).toBe('');
  fireEvent.change(hold, { target: { value: '4200' } }); fireEvent.compositionStart(hold);
  expect(input().isComposing()).toBe(true); expect(await apply(input())).toBe(false); expect(changed).not.toHaveBeenCalled();
  fireEvent.compositionEnd(hold); changed.mockRejectedValueOnce(new Error('Display transaction failed'));
  expect(await apply(input())).toBe(false); expect(hold.value).toBe('4200');
  expect(await apply(input())).toBe(true);
});

it('waits for automatically applied startup changes and unregisters its input handle', async () => {
  const { view, changed, input } = startup(); let release!: () => void;
  changed.mockImplementationOnce(async () => await new Promise<void>(resolve => { release = resolve; }));
  fireEvent.click(view.getByRole('checkbox', { name: 'Allow skipping splash' }));
  await act(async () => {
    const result = input().applyCurrent(); let completed = false; void result.then(() => { completed = true; });
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1)); expect(completed).toBe(false); release(); expect(await result).toBe(true);
  });
  expect(changed).toHaveBeenCalledTimes(1);
  view.unmount(); expect(input()).toBeNull();
});

it('confirms sequence buffers as ordinary startup input while preserving all fields in the same sequence', async () => {
  const project = structuredClone(FixtureProject);
  project.display.startupSequence = StartupSequenceSchema.parse({ clips: [StartupClipSchema.parse({ id: createId(), kind: 'text', name: 'Notice', text: { en: 'Hello' } })] });
  const { view, changed, pending, input } = startup(project);
  const hold = view.getByRole('spinbutton', { name: 'Clip hold · ms' }) as HTMLInputElement;
  fireEvent.change(hold, { target: { value: '3200' } }); fireEvent.compositionStart(hold);
  expect(input().isComposing()).toBe(true); expect(await apply(input())).toBe(false); expect(changed).not.toHaveBeenCalled();
  fireEvent.compositionEnd(hold);
  fireEvent.change(hold, { target: { value: '' } });
  expect(await apply(input())).toBe(false); expect(document.activeElement).toBe(hold); expect(changed).not.toHaveBeenCalled();
  fireEvent.change(hold, { target: { value: '3200' } });
  fireEvent.change(view.getByRole('spinbutton', { name: 'Reveal home · ms' }), { target: { value: '600' } });
  expect(await apply(input())).toBe(true);
  expect(changed.mock.calls.at(-1)![0].startupSequence).toMatchObject({ revealMs: 600, clips: [expect.objectContaining({ holdMs: 3200 })] });
  expect(pending).toHaveBeenLastCalledWith(false);
});

it('restores the selected startup clip and its invalid number from the captured input draft', async () => {
  const project = structuredClone(FixtureProject), first = createId(), second = createId();
  project.display.startupSequence = StartupSequenceSchema.parse({ clips: [
    StartupClipSchema.parse({ id: first, kind: 'text', name: 'First notice', holdMs: 2400 }),
    StartupClipSchema.parse({ id: second, kind: 'text', name: 'Second notice', holdMs: 2800 }),
  ] });
  const original = startup(project);
  fireEvent.click(original.view.getByRole('button', { name: 'Second notice' }));
  fireEvent.change(original.view.getByRole('spinbutton', { name: 'Clip hold · ms' }), { target: { value: '' } });
  const stored: StartupGuiDraft = JSON.parse(JSON.stringify(original.capture()));
  expect(hasStartupFieldInput(stored)).toBe(true);
  expect(stored.sequence).toMatchObject({ selected: second, buffers: { [`${second}.hold`]: '' } });
  original.view.unmount();

  const restored = startup(project, undefined, stored);
  const hold = restored.view.getByRole('spinbutton', { name: 'Clip hold · ms' }) as HTMLInputElement;
  expect(hold.value).toBe('');
  expect(await apply(restored.input())).toBe(false);
  expect(document.activeElement).toBe(hold);
  expect(restored.changed).not.toHaveBeenCalled();
  fireEvent.change(hold, { target: { value: '3500' } });
  expect(await apply(restored.input())).toBe(true);
  expect(restored.changed.mock.calls.at(-1)![0].startupSequence?.clips.map(clip => clip.holdMs)).toEqual([2400, 3500]);
  expect(hasStartupFieldInput(restored.capture())).toBe(false);
});

it.each([false, true])('clears only a successfully deleted sequence clip input (other invalid input: %s)', async retainOther => {
  const project = structuredClone(FixtureProject), first = createId(), removed = createId();
  project.display.startupSequence = StartupSequenceSchema.parse({ revealMs: 600, clips: [
    StartupClipSchema.parse({ id: first, kind: 'text', name: 'First notice', holdMs: 3200, text: { en: 'First' } }),
    StartupClipSchema.parse({ id: removed, kind: 'text', name: 'Removed notice', text: { en: 'Removed' } }),
  ] });
  const { view, changed, pending, input } = startup(project);
  if (retainOther) fireEvent.change(view.getByRole('spinbutton', { name: 'Clip hold · ms' }), { target: { value: '' } });
  await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Removed notice' })); });
  fireEvent.change(view.getByRole('spinbutton', { name: 'Clip hold · ms' }), { target: { value: '' } });
  await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Delete clip' })); });
  expect(changed.mock.calls.at(-1)![0].startupSequence?.clips.map(clip => clip.id)).toEqual([first]);
  if (retainOther) {
    expect(await apply(input())).toBe(false);
    expect((view.getByRole('spinbutton', { name: 'Clip hold · ms' }) as HTMLInputElement).value).toBe('');
    expect(pending).toHaveBeenLastCalledWith(true);
    fireEvent.change(view.getByRole('spinbutton', { name: 'Clip hold · ms' }), { target: { value: '3200' } });
  }
  expect(await apply(input())).toBe(true); expect(pending).toHaveBeenLastCalledWith(false);
});

it('retains a clip and its invalid input when deleting the clip fails', async () => {
  const sequence = StartupSequenceSchema.parse({ clips: [StartupClipSchema.parse({ id: createId(), kind: 'text', name: 'Retained notice', text: { en: 'Retained' } })] });
  const changed = vi.fn(async () => { throw new Error('Delete failed'); }), pending = vi.fn();
  let input: StartupSequenceInput | null = null;
  const view = render(<StartupSequenceEditor sequence={sequence} locale="en" assets={[]} onChange={changed} chooseAsset={async () => null} preview={() => {}}
    onDraftChange={pending} registerInput={value => { input = value; }}/>);
  fireEvent.change(view.getByRole('spinbutton', { name: 'Clip hold · ms' }), { target: { value: '' } });
  await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Delete clip' })); });
  expect((view.getByRole('spinbutton', { name: 'Clip hold · ms' }) as HTMLInputElement).value).toBe('');
  expect(pending).toHaveBeenLastCalledWith(true); expect(await apply(input!)).toBe(false); expect(changed).toHaveBeenCalledTimes(1);
});
