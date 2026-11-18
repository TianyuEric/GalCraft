// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Issue } from '@galcraft/contracts';
import { ConnectionWorkbench } from './ConnectionWorkbench.js';
import { ProductionSession, type WorkflowGuiDraft } from './session.js';
import type { WorkbenchBridge } from './bridge.js';
import type { WorkflowDraft } from './workflow-model.js';

// Exercise the actual workbench, dialog and editor; only Monaco is replaced by an editable textarea.
vi.mock('../../components/code-editor.js', () => ({
  CodeEditor: ({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) =>
    <textarea aria-label={label} value={value} onChange={event => onChange(event.target.value)}/>,
}));

const issue: Issue = { code: 'WORKFLOW_DRAFT_WRITE_FAILED', message: 'Original disk write failed',
  owner: 'M10', severity: 'error', related: [], actions: [] };
const workflow: WorkflowDraft = { id: 'FlowAA', revision: 0, name: 'Available editing copy', purpose: null,
  imageUsages: null, graphVersion: '1', apiGraph: {}, editorWorkflowPath: null,
  inputs: [], uploads: [], outputs: [], requiredNodes: [], modelNotes: [] };
const document = (id: string, name: string, draftSource: boolean): WorkflowGuiDraft['workflowDocuments'][number] => ({
  id, text: JSON.stringify({ ...workflow, name }), title: name, dirty: true, draftSource,
  expectedRevision: null, closeRequest: 0,
});
const fixture = (both = false) => {
  const saveWorkflowDraft = vi.fn(async (_input: Parameters<WorkbenchBridge['production']['saveWorkflowDraft']>[0]) => ({ ok: false as const, error: issue, issues: [issue] }));
  const session = new ProductionSession({ production: { saveWorkflowDraft }, files: {} } as unknown as WorkbenchBridge, 'ProjAA');
  session.workflowGuiDraft = { workflowDocuments: [
    ...(both ? [document('FlowAA', 'Available editing copy', false)] : []),
    document('workflow-draft:FlowAA', 'Original failed draft copy', true),
  ], activeWorkflow: 'workflow-draft:FlowAA' };
  const view = render(<ConnectionWorkbench session={session} locale="en" embedded={{ search: '' }}/>);
  const editor = () => view.container.querySelector<HTMLElement>('.workflow-document-content:not([hidden])')!;
  return { session, saveWorkflowDraft, view, editor };
};

let originalGetAnimations: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  originalGetAnimations = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations');
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  if (originalGetAnimations) Object.defineProperty(Element.prototype, 'getAnimations', originalGetAnimations);
  else Reflect.deleteProperty(Element.prototype, 'getAnimations');
});

it('shows new local JSON validation after recovery while retaining and later reselecting the original receipt', async () => {
  const { session, saveWorkflowDraft, editor } = fixture();
  await act(async () => { fireEvent.click(within(editor()).getByRole('button', { name: 'Save configuration draft' })); });
  const retained = session.feedback[0]!;
  expect(session.error).toBe('');
  expect(within(editor()).getAllByText(issue.message)).toHaveLength(1);
  act(() => { session.revealFeedback(retained.key); });
  expect(within(editor()).getByText(issue.message).textContent).toBe(issue.message);
  fireEvent.click(within(editor()).getByText('Advanced: binding JSON and node dependencies', { exact: true }));
  fireEvent.change(within(editor()).getByLabelText('WorkflowBinding JSON'), { target: { value: '{' } });
  await act(async () => { fireEvent.click(within(editor()).getByRole('button', { name: 'Save configuration draft' })); });
  await waitFor(() => expect(within(editor()).getByRole('alert').textContent).toBe('Correct the configuration JSON structure. Incomplete mappings can be kept.'));
  expect(within(editor()).queryByText(issue.message)).toBeNull();
  expect(session.revealedFeedback).toBeNull(); expect(session.feedback).toEqual([retained]);
  expect(session.workflowGuiDraft!.workflowDocuments[0]!.text).toBe('{');
  act(() => { session.revealFeedback(retained.key); });
  expect(within(editor()).getAllByText(issue.message)).toHaveLength(1);
  expect((within(editor()).getByLabelText('WorkflowBinding JSON') as HTMLTextAreaElement).value).toBe('{');
  expect(saveWorkflowDraft).toHaveBeenCalledTimes(1);
});

it('returns to the exact draft editor that initiated a failed save when an available copy shares its workflow ID', async () => {
  const { session, saveWorkflowDraft, view, editor } = fixture(true);
  await act(async () => { fireEvent.click(within(editor()).getByRole('button', { name: 'Save configuration draft' })); });
  const retained = session.feedback[0]!;
  expect(retained.editorId).toBe('workflow-draft:FlowAA');
  fireEvent.click(view.getByRole('tab', { name: /Available editing copy/ }));
  await waitFor(() => expect(session.workflowGuiDraft!.activeWorkflow).toBe('FlowAA'));
  expect(within(editor()).getByRole('heading', { name: 'Available editing copy' })).toBeTruthy();
  act(() => { session.revealFeedback(retained.key); });
  await waitFor(() => expect(session.workflowGuiDraft!.activeWorkflow).toBe('workflow-draft:FlowAA'));
  expect(within(editor()).getByRole('heading', { name: 'Original failed draft copy' })).toBeTruthy();
  expect(within(editor()).getAllByText(issue.message)).toHaveLength(1);
  expect(session.workflowGuiDraft!.workflowDocuments.map(item => JSON.parse(item.text).name)).toEqual(['Available editing copy', 'Original failed draft copy']);
  expect(saveWorkflowDraft).toHaveBeenCalledTimes(1);
  expect(saveWorkflowDraft.mock.calls[0]![0]).not.toHaveProperty('editorId');
});

it('keeps a known missing editor receipt outside another editing copy with the same workflow ID', async () => {
  const { session, saveWorkflowDraft, view, editor } = fixture(true);
  await act(async () => { fireEvent.click(within(editor()).getByRole('button', { name: 'Save configuration draft' })); });
  const retained = session.feedback[0]!;
  view.unmount();
  session.workflowGuiDraft = { workflowDocuments: [session.workflowGuiDraft!.workflowDocuments[0]!], activeWorkflow: 'FlowAA' };
  const reopened = render(<ConnectionWorkbench session={session} locale="en" embedded={{ search: '' }}/>);
  act(() => { session.revealFeedback(retained.key); });
  expect(session.workflowGuiDraft.activeWorkflow).toBe('FlowAA');
  const available = reopened.container.querySelector<HTMLElement>('.workflow-document-content:not([hidden])')!;
  expect(within(available).queryByText(issue.message)).toBeNull();
  expect(reopened.getAllByText(issue.message)).toHaveLength(1);
  expect(saveWorkflowDraft).toHaveBeenCalledTimes(1);
});
