// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BuildInput, BuildReceipt, DocumentView, Issue, Result } from '@galcraft/contracts';
import { FixtureIds, FixtureProject, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import type { AuthoringServices, AuthoringSource } from '../../authoring/controller.js';
import { workbenchBridge } from '../Production/bridge.js';
import { Publish, type PublishGuiDraft } from './Publish.js';

vi.mock('../Production/Production.js', () => ({ tr: (locale: string, zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh }));

const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const blocker: Issue = { code: 'BUILD_OUTPUT_BLOCKED', owner: 'M11', severity: 'error', message: 'Choose another output directory', related: [], actions: ['retry'] };
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const fixture = () => {
  const project = structuredClone(FixtureProject);
  const source: AuthoringSource = { projectDocumentId: FixtureIds.projectA, projectRevision: 1, projectSavedRevision: 1,
    projectDirty: false, project, scenes: [], characters: [], anyDirty: false };
  const files = { 'project.json': JSON.stringify({ schemaVersion: 1, documentId: FixtureIds.projectA, revision: 1, data: project }) };
  const document: DocumentView = { documentId: FixtureIds.projectA, revision: 1, savedRevision: 1, format: 'json', files, savedFiles: files, dirty: false };
  const services = {
    bridge: { documents: { list: vi.fn(async () => ok([document])) }, assets: {},
      builds: { status: async () => ok({ ready: true }),
        planBuild: vi.fn(async (input: BuildInput) => ok({ planId: 'CheckedRelease', input, issues: [] as Issue[] })),
        build: vi.fn(async (): Promise<Result<BuildReceipt>> => ({ ok: false, error: blocker, issues: [] })),
        compatibility: async () => ok(null) } },
    queryAssets: async () => ok({ items: [], total: 0, indexRevision: 1 }),
    compilePreview: vi.fn(async () => ok({ snapshot: { ...FixtureSnapshot, project }, lastValid: null, current: true, issues: [] as Issue[] })),
  } as unknown as AuthoringServices;
  const onCheckIssues = vi.fn(), onBuildStarted = vi.fn(), onBuildFailure = vi.fn(), onHistoryReady = vi.fn();
  const props = { source, services, locale: 'en', changed: async () => {}, saveAll: async () => {}, openProjectMaintenance: () => {},
    guiDraft: { output: 'D:/release' } as PublishGuiDraft, onCheckIssues, onBuildStarted, onBuildFailure, onHistoryReady };
  return { props, services, builds: workbenchBridge(services.bridge).builds, onCheckIssues, onBuildStarted, onBuildFailure, onHistoryReady };
};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('registers a stable external check that uses current release input and hooks without building, saving or changing focus', async () => {
  const { props, builds, onCheckIssues } = fixture();
  const onRecheckReady = vi.fn(), currentIssues = vi.fn(), saveAll = vi.fn(async () => {}), changed = vi.fn(async () => {});
  const view = render(<><input aria-label="Other authoring draft" /><Publish {...props} saveAll={saveAll} changed={changed} onRecheckReady={onRecheckReady} /></>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check only' }).hasAttribute('disabled')).toBe(false));
  const check = onRecheckReady.mock.calls[0]![0] as () => Promise<void>;
  fireEvent.change(screen.getByLabelText('Output directory'), { target: { value: 'D:/current-release' } });
  fireEvent.click(screen.getByRole('button', { name: /^Windows/ }));
  view.rerender(<><input aria-label="Other authoring draft" /><Publish {...props} saveAll={saveAll} changed={changed} onCheckIssues={currentIssues} onRecheckReady={onRecheckReady} /></>);
  const draft = screen.getByLabelText('Other authoring draft'); draft.focus();
  await act(async () => { await check(); });
  expect(onRecheckReady).toHaveBeenCalledTimes(1);
  expect(builds.planBuild).toHaveBeenCalledWith(expect.objectContaining({ target: 'windows', outputDirectory: 'D:/current-release' }));
  expect(currentIssues).toHaveBeenLastCalledWith([], 'complete'); expect(onCheckIssues).not.toHaveBeenCalled();
  expect(builds.build).not.toHaveBeenCalled(); expect(saveAll).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(draft);
});

it('coalesces simultaneous external checks and unregisters its retained callback when unmounted', async () => {
  const { props, services, builds, onCheckIssues } = fixture(), onRecheckReady = vi.fn();
  const pending = deferred<Awaited<ReturnType<NonNullable<AuthoringServices['compilePreview']>>>>();
  vi.mocked(services.compilePreview!).mockReturnValueOnce(pending.promise);
  const view = render(<Publish {...props} onRecheckReady={onRecheckReady} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check only' }).hasAttribute('disabled')).toBe(false));
  const check = onRecheckReady.mock.calls[0]![0] as () => Promise<void>;
  let first!: Promise<void>, second!: Promise<void>;
  act(() => { first = check(); second = check(); });
  expect(second).toBe(first);
  await waitFor(() => expect(services.compilePreview).toHaveBeenCalledTimes(1));
  expect(onCheckIssues).toHaveBeenLastCalledWith([], 'checking');
  await act(async () => { pending.resolve(ok({ snapshot: FixtureSnapshot, lastValid: null, current: true, issues: [] })); await Promise.all([first, second]); });
  expect(builds.planBuild).toHaveBeenCalledTimes(1); expect(builds.build).not.toHaveBeenCalled();
  expect(onCheckIssues).toHaveBeenLastCalledWith([], 'complete');
  view.unmount(); expect(onRecheckReady).toHaveBeenLastCalledWith(null);
  await check();
  expect(services.compilePreview).toHaveBeenCalledTimes(1); expect(builds.planBuild).toHaveBeenCalledTimes(1);
});

it.each([
  { field: 'Output directory', value: '', message: 'Choose an output directory' },
  { field: 'Release version', value: 'invalid-version', message: 'Enter a version, such as 0.1.0' },
])('preserves external focus when an external check rejects invalid $field', async ({ field, value, message }) => {
  const { props, services, builds, onCheckIssues } = fixture(), onRecheckReady = vi.fn();
  render(<><input aria-label="Other authoring draft" /><Publish {...props} onRecheckReady={onRecheckReady} /></>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check only' }).hasAttribute('disabled')).toBe(false));
  fireEvent.change(screen.getByLabelText(field), { target: { value } });
  const draft = screen.getByLabelText('Other authoring draft'); draft.focus();
  const check = onRecheckReady.mock.calls[0]![0] as () => Promise<void>;
  const scrolls = vi.mocked(HTMLElement.prototype.scrollIntoView).mock.calls.length;
  await act(async () => { await check(); });
  expect(onCheckIssues).toHaveBeenLastCalledWith([expect.objectContaining({ code: 'BUILD_CHECK_FAILED', message })], 'failed');
  expect(document.activeElement).toBe(draft); expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(scrolls);
  expect(services.compilePreview).not.toHaveBeenCalled(); expect(builds.planBuild).not.toHaveBeenCalled(); expect(builds.build).not.toHaveBeenCalled();
});

it('reports a local incomplete release form only beside the required field', async () => {
  const { props, services, builds, onCheckIssues } = fixture();
  render(<Publish {...props} />);
  const check = screen.getByRole('button', { name: 'Check only' });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  const output = screen.getByLabelText('Output directory');
  fireEvent.change(output, { target: { value: '' } });
  fireEvent.click(check);
  await waitFor(() => expect(document.activeElement).toBe(output));
  expect(screen.getAllByText('Choose an output directory')).toHaveLength(1);
  expect(onCheckIssues).not.toHaveBeenCalled();
  expect(services.compilePreview).not.toHaveBeenCalled();
  expect(builds.planBuild).not.toHaveBeenCalled();
});

it('publishes completed empty checks and marks later input changes stale without emitting on mount', async () => {
  const { props, onCheckIssues } = fixture(); render(<Publish {...props} />);
  const check = screen.getByRole('button', { name: 'Check only' });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  expect(onCheckIssues).not.toHaveBeenCalled();
  fireEvent.click(check);
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([], 'complete'));
  fireEvent.change(screen.getByLabelText('Output directory'), { target: { value: 'D:/new-release' } });
  expect(onCheckIssues).toHaveBeenLastCalledWith([], 'stale');
});

it.each(['Check only', 'Check and build'])('restores %s focus when a blocked check disables and blurs its initiating button', async action => {
  const { props, builds, onCheckIssues } = fixture();
  const pending = deferred<Awaited<ReturnType<typeof builds.planBuild>>>();
  vi.mocked(builds.planBuild).mockReturnValueOnce(pending.promise);
  render(<Publish {...props} />);
  const check = screen.getByRole('button', { name: action });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  check.focus(); fireEvent.click(check);
  await waitFor(() => expect(builds.planBuild).toHaveBeenCalled());
  expect(check.hasAttribute('disabled')).toBe(true);
  // Chromium drops focus when the focused button becomes disabled; jsdom retains it.
  check.blur(); expect(document.activeElement).toBe(document.body);
  await act(async () => { pending.resolve(ok({ planId: 'BlockedRelease', issues: [blocker] })); });
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([blocker], 'complete'));
  expect(document.activeElement).toBe(check); expect(check.hasAttribute('disabled')).toBe(false);
  expect(builds.build).not.toHaveBeenCalled();
});

it('restores the initiating check focus after a failed call loses focus to the document body', async () => {
  const { props, builds, onCheckIssues } = fixture();
  const pending = deferred<Awaited<ReturnType<typeof builds.planBuild>>>();
  vi.mocked(builds.planBuild).mockReturnValueOnce(pending.promise);
  render(<Publish {...props} />);
  const check = screen.getByRole('button', { name: 'Check only' });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  check.focus(); fireEvent.click(check);
  await waitFor(() => expect(builds.planBuild).toHaveBeenCalled());
  check.blur(); expect(document.activeElement).toBe(document.body);
  await act(async () => { pending.reject(new Error('The output drive is offline')); });
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([expect.objectContaining({ code: 'BUILD_CHECK_FAILED' })], 'failed'));
  expect(document.activeElement).toBe(check);
});

it.each([false, true])('restores the ready plan build action after failure only when the author has not moved focus (moved: %s)', async moved => {
  const { props, builds, onBuildFailure } = fixture();
  const pending = deferred<Result<BuildReceipt>>();
  vi.mocked(builds.build).mockReturnValueOnce(pending.promise);
  render(<><input aria-label="Other authoring draft" /><Publish {...props} /></>);
  const check = screen.getByRole('button', { name: 'Check only' });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  fireEvent.click(check);
  const build = await screen.findByRole('button', { name: 'Build Web' });
  build.focus(); fireEvent.click(build);
  await waitFor(() => expect(builds.build).toHaveBeenCalledWith('CheckedRelease'));
  // Building replaces the initiating action with Cancel build, dropping browser focus.
  expect(build.isConnected).toBe(false);
  expect(document.activeElement).toBe(document.body);
  if (moved) {
    const draft = screen.getByLabelText('Other authoring draft'); draft.focus(); draft.blur();
  }
  const error: Issue = { ...blocker, code: 'BUILD_OUTPUT_INVALID' };
  await act(async () => { pending.resolve({ ok: false, error, issues: [structuredClone(error)] }); });
  await waitFor(() => expect(onBuildFailure).toHaveBeenCalledWith('CheckedRelease', error, false, 'web'));
  const currentBuild = screen.getByRole('button', { name: 'Build Web' });
  expect(currentBuild.hasAttribute('disabled')).toBe(false);
  expect(document.activeElement).toBe(moved ? document.body : currentBuild);
  expect(builds.planBuild).toHaveBeenCalledTimes(1);
});

it('does not restore the initiating check focus after the author focuses elsewhere and later blurs', async () => {
  const { props, builds } = fixture();
  const pending = deferred<Awaited<ReturnType<typeof builds.planBuild>>>();
  vi.mocked(builds.planBuild).mockReturnValueOnce(pending.promise);
  render(<><input aria-label="Other authoring draft" /><Publish {...props} /></>);
  const check = screen.getByRole('button', { name: 'Check only' });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  check.focus(); fireEvent.click(check);
  await waitFor(() => expect(builds.planBuild).toHaveBeenCalled());
  check.blur();
  const draft = screen.getByLabelText('Other authoring draft'); draft.focus(); draft.blur();
  expect(document.activeElement).toBe(document.body);
  await act(async () => { pending.resolve(ok({ planId: 'BlockedRelease', issues: [blocker] })); });
  expect(document.activeElement).toBe(document.body);
});

it('does not restore focus lost during an external read-only check', async () => {
  const { props, builds } = fixture(), onRecheckReady = vi.fn();
  const pending = deferred<Awaited<ReturnType<typeof builds.planBuild>>>();
  vi.mocked(builds.planBuild).mockReturnValueOnce(pending.promise);
  render(<Publish {...props} onRecheckReady={onRecheckReady} />);
  const button = screen.getByRole('button', { name: 'Check only' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  button.focus();
  const check = onRecheckReady.mock.calls[0]![0] as () => Promise<void>;
  let result!: Promise<void>;
  act(() => { result = check(); });
  await waitFor(() => expect(builds.planBuild).toHaveBeenCalled());
  button.blur();
  await act(async () => { pending.resolve(ok({ planId: 'BlockedRelease', issues: [blocker] })); await result; });
  expect(document.activeElement).toBe(document.body);
});

it('reports a transported planner primary error once and retains a distinct diagnostic with the same code', async () => {
  const { props, builds, onCheckIssues } = fixture();
  const error: Issue = { ...blocker, code: 'BUILD_OUTPUT_INVALID', details: { output: 'D:/release', reason: 'existingFile' } };
  const transported: Issue = { details: { reason: 'existingFile', output: 'D:/release' }, ...structuredClone(blocker), code: error.code };
  const other: Issue = { ...error, details: { output: 'D:/other-release', reason: 'existingFile' } };
  vi.mocked(builds.planBuild).mockResolvedValueOnce({ ok: false, error, issues: [transported, other] });
  render(<Publish {...props} />);
  const check = screen.getByRole('button', { name: 'Check only' });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  fireEvent.click(check);
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([transported, other], 'complete'));
  fireEvent.change(screen.getByLabelText('Output directory'), { target: { value: 'D:/new-release' } });
  expect(onCheckIssues).toHaveBeenLastCalledWith([transported, other], 'stale');
});

it('reports a transported compiler primary error once', async () => {
  const { props, services, builds, onCheckIssues } = fixture();
  const error: Issue = { ...blocker, code: 'COMPILER_UNAVAILABLE', owner: 'M03' };
  const transported = structuredClone(error);
  vi.mocked(services.compilePreview!).mockResolvedValueOnce({ ok: false, error, issues: [transported] });
  render(<Publish {...props} />);
  const check = screen.getByRole('button', { name: 'Check only' });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  fireEvent.click(check);
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([transported], 'failed'));
  expect(builds.planBuild).not.toHaveBeenCalled();
});

it('retains prior diagnostics while retrying, reports call failures and preserves the current input focus', async () => {
  const { props, builds, onCheckIssues } = fixture();
  vi.mocked(builds.planBuild).mockResolvedValueOnce(ok({ planId: 'BlockedRelease', issues: [blocker] }));
  render(<><input aria-label="Other authoring draft" /><Publish {...props} /></>);
  const check = screen.getByRole('button', { name: 'Check only' });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  fireEvent.click(check);
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([blocker], 'complete'));
  const pending = deferred<Awaited<ReturnType<typeof builds.planBuild>>>();
  vi.mocked(builds.planBuild).mockReturnValueOnce(pending.promise);
  fireEvent.click(check);
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([blocker], 'checking'));
  const draft = screen.getByLabelText('Other authoring draft'); draft.focus();
  await act(async () => { pending.reject(new Error('The output drive is offline')); });
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([expect.objectContaining({ code: 'BUILD_CHECK_FAILED', message: 'The output drive is offline' })], 'failed'));
  expect(document.activeElement).toBe(draft);
  const retry = deferred<Awaited<ReturnType<typeof builds.planBuild>>>();
  vi.mocked(builds.planBuild).mockReturnValueOnce(retry.promise);
  fireEvent.click(check);
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([blocker], 'checking'));
  await act(async () => { retry.resolve(ok({ planId: 'RetriedRelease', issues: [] })); });
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([], 'complete'));
});

it('ignores a check result superseded by working document changes before compilation returns', async () => {
  const { props, services, builds, onCheckIssues } = fixture();
  const pending = deferred<Awaited<ReturnType<NonNullable<AuthoringServices['compilePreview']>>>>();
  vi.mocked(services.compilePreview!).mockReturnValueOnce(pending.promise);
  const view = render(<Publish {...props} />);
  const check = screen.getByRole('button', { name: 'Check and build' });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  fireEvent.click(check);
  await waitFor(() => expect(services.compilePreview).toHaveBeenCalled());
  view.rerender(<Publish {...props} source={{ ...props.source, projectRevision: 2 }} />);
  expect(onCheckIssues).toHaveBeenLastCalledWith([], 'stale');
  await act(async () => { pending.resolve(ok({ snapshot: FixtureSnapshot, lastValid: null, current: true, issues: [] })); });
  expect(onCheckIssues.mock.calls.some(([, state]) => state === 'complete')).toBe(false);
  expect(builds.planBuild).not.toHaveBeenCalled();
  expect(builds.build).not.toHaveBeenCalled();
});

it('separates a failed compiler call from completed authored-content diagnostics', async () => {
  const { props, services, builds, onCheckIssues } = fixture();
  vi.mocked(builds.planBuild).mockResolvedValueOnce(ok({ planId: 'BlockedRelease', issues: [blocker] }));
  render(<Publish {...props} />);
  const check = screen.getByRole('button', { name: 'Check only' });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  fireEvent.click(check);
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([blocker], 'complete'));
  const failedCall: Issue = { ...blocker, code: 'COMPILER_UNAVAILABLE', owner: 'M03', message: 'The compiler service is unavailable' };
  vi.mocked(services.compilePreview!).mockResolvedValueOnce({ ok: false, error: failedCall, issues: [] });
  fireEvent.click(check);
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([failedCall], 'failed'));
  const pending = deferred<Awaited<ReturnType<NonNullable<AuthoringServices['compilePreview']>>>>();
  vi.mocked(services.compilePreview!).mockReturnValueOnce(pending.promise);
  fireEvent.click(check);
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([blocker], 'checking'));
  const authoredIssue: Issue = { ...failedCall, code: 'DSL_INVALID', message: 'The authored statement is invalid' };
  await act(async () => { pending.resolve(ok({ snapshot: null, lastValid: FixtureSnapshot, current: false, issues: [authoredIssue] })); });
  await waitFor(() => expect(onCheckIssues).toHaveBeenLastCalledWith([authoredIssue], 'complete'));
});

it('keeps build callbacks attached to the frozen target when the author edits another target', async () => {
  const { props, builds, onBuildStarted, onBuildFailure, onHistoryReady } = fixture();
  const pending = deferred<Result<BuildReceipt>>();
  vi.mocked(builds.build).mockReturnValueOnce(pending.promise);
  render(<><input aria-label="Other authoring draft" /><Publish {...props} /></>);
  const check = screen.getByRole('button', { name: 'Check and build' });
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /^Windows/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Web/ }));
  fireEvent.click(check);
  await waitFor(() => expect(onBuildStarted).toHaveBeenCalledWith('CheckedRelease', 'web'));
  act(() => { onHistoryReady.mock.calls.at(-1)?.[0]?.('undo'); });
  expect(screen.getByRole('button', { name: /^Windows/ }).getAttribute('aria-pressed')).toBe('true');
  const draft = screen.getByLabelText('Other authoring draft'); draft.focus();
  await act(async () => { pending.resolve({ ok: false, error: blocker, issues: [] }); });
  await waitFor(() => expect(onBuildFailure).toHaveBeenCalledWith('CheckedRelease', blocker, false, 'web'));
  expect(document.activeElement).toBe(draft);
});
