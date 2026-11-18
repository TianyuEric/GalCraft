import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { Issue, Json, Operation, Result, StudioBridge, StudioPreferences } from '@galcraft/contracts';
import { FixtureIds, fixtureId } from '@galcraft/contracts/fixtures';
import { mountAuthoring } from '../authoring/view.js';
import { ok, studioFixture } from './studio-fixture.js';

type Services = Parameters<typeof mountAuthoring>[1];
type ModelResult = Awaited<ReturnType<StudioBridge['assets']['prepareMattingModel']>>;

function failed<T>(issue: Issue): Result<T> { return { ok: false, error: issue, issues: [issue] }; }

function Notifications({ scenario = 'model', locale = 'en', theme = 'light' }: {
  scenario?: 'model' | 'history' | 'save'; locale?: StudioPreferences['locale']; theme?: StudioPreferences['theme'];
}) {
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!root.current) return;
    let active = true, workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const listeners = new Set<(event: Operation<Json>) => void>();
    const services: Services = studioFixture('normal', locale, theme).services;
    let attempt = 0;
    const later = (delay: number, run: () => void) => {
      const timer = setTimeout(() => { timers.delete(timer); if (active) run(); }, delay);
      timers.add(timer);
    };
    services.bridge.operations = {
      cancel: async () => ({ local: 'alreadyFinished', remote: 'notApplicable' }),
      subscribe: callback => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    };
    // Only the service boundary is controlled. The renderer owns progress, feedback and retry.
    services.prepareMattingModel = () => new Promise<ModelResult>(resolve => {
      const current = ++attempt;
      const progress = (phase: string, completed: number) => {
        for (const listener of listeners) listener({ operationId: fixtureId(0x1a00 + current), state: 'running', phase, completed, total: 100 });
      };
      later(500, () => progress('downloading', 25));
      later(1100, () => progress('downloading', 70));
      later(1700, () => progress('verifying', 100));
      later(2400, () => resolve(current === 1 ? failed({ code: 'STORY_MODEL_UNAVAILABLE', severity: 'error', owner: 'M04',
        message: 'Fixture interruption. Retry uses the prepared in-memory result.', related: [], actions: ['retry'] })
        : ok({ bytes: 1024, inputName: 'fixture-image', outputName: 'fixture-mask' })));
    });
    const historyIssue = async (severity: 'warning' | 'error'): Promise<Issue> => {
      const documents = await services.bridge.documents.list();
      const revision = documents.ok ? documents.value.find(document => document.documentId === FixtureIds.streetDocument)?.revision ?? 1 : 1;
      return {
        code: severity === 'warning' ? 'STORY_HISTORY_BUSY' : 'STORY_HISTORY_UNAVAILABLE', severity, owner: 'M02',
        message: severity === 'warning' ? 'Fixture history is busy. Your writing is kept; try Undo again.'
          : 'Fixture history is unavailable. Your writing is kept; locate the source to continue.',
        source: { documentId: FixtureIds.streetDocument, revision, statementId: FixtureIds.statements[1] }, related: [], actions: ['locate'],
      };
    };
    if (scenario === 'history') {
      services.bridge.documents.planUndo = async () => failed(await historyIssue('warning'));
      services.bridge.documents.planRedo = async () => failed(await historyIssue('error'));
    }
    if (scenario === 'save') {
      const planSave = services.bridge.documents.planSave;
      let saveAttempt = 0;
      services.bridge.documents.planSave = async scope => {
        if (++saveAttempt > 1) return planSave(scope);
        const documentId = scope.kind === 'current' ? scope.documentId : FixtureIds.streetDocument;
        const documents = await services.bridge.documents.list();
        const revision = documents.ok ? documents.value.find(document => document.documentId === documentId)?.revision ?? 1 : 1;
        return failed({ code: 'STORY_SAVE_UNAVAILABLE', severity: 'error', owner: 'M02',
          message: 'Fixture save preparation is temporarily unavailable. Your writing is kept. Save again to confirm the document is unchanged.',
          source: { documentId, revision, statementId: FixtureIds.statements[1] }, related: [], actions: ['retry'] });
      };
    }
    const container = document.createElement('div');
    container.id = 'app'; container.dataset.locale = locale; container.dataset.theme = theme;
    root.current.append(container);
    const ownsPortals = !document.getElementById('studio-portals');
    if (ownsPortals) { const portals = document.createElement('div'); portals.id = 'studio-portals'; document.body.append(portals); }
    void mountAuthoring(container, services).then(async mounted => {
      workspace = mounted;
      if (!active) { mounted.dispose(); return; }
      if (scenario === 'model') await mounted.navigate('assets');
      container.dataset.notificationStoryReady = 'true';
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => {
      active = false;
      for (const timer of timers) clearTimeout(timer);
      workspace?.dispose(); container.remove();
      if (ownsPortals) document.getElementById('studio-portals')?.remove();
    };
  }, [scenario, locale, theme]);
  return <>{error && <div role="alert">{error}</div>}<div ref={root} className="product-story" /></>;
}

const meta = {
  title: 'Product/Studio/Workbench/Notifications', component: Notifications,
  args: { scenario: 'model', locale: 'en', theme: 'light' },
  argTypes: { scenario: { control: 'select', options: ['model', 'history', 'save'] }, locale: { control: 'select', options: ['en', 'zh-CN', 'ja'] }, theme: { control: 'select', options: ['light', 'dark'] } },
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Accepted UXF-01 notification and UXF-02 intake flows using the real Studio renderer and in-memory fixture services. No files, model downloads, generation or paid calls. In Local model, open Local background removal and prepare: the first attempt fails and the next succeeds. Progress updates the same Message; dismiss it while preparing to keep working. In Authoring results, Undo produces a warning without opening the bottom panel. Closing Message preserves the problem and writing. Open Problems, locate the source and return using the document toolbar. Redo adds its own error. Save recovery leaves a failed save visible in Problems: use Open save source, then Save again; the unchanged document reports no changes and clears its save failure.' } } },
} satisfies Meta<typeof Notifications>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LocalModel: Story = {
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-notification-story-ready]')).toBeTruthy());
    await userEvent.click(canvas.getByRole('button', { name: 'Local background removal' }));
    const shell = canvasElement.querySelector<HTMLElement>('.gc-studio-chrome')!;
    const before = shell.getBoundingClientRect();
    await userEvent.click(canvas.getByRole('button', { name: 'Prepare background removal model' }));
    await waitFor(() => expect(canvasElement.ownerDocument.querySelector('.studio-toast')).toHaveAttribute('data-message-type', 'info'));
    const message = canvasElement.ownerDocument.querySelector<HTMLElement>('.studio-toast')!;
    await waitFor(() => expect(message).toHaveTextContent('Downloading model 25%'));
    await expect(message).toHaveAttribute('data-message-type', 'info');
    await expect(shell.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
    await expect(canvasElement.querySelector('.authoring-notice')).toBeNull();
    await waitFor(() => expect(message).toHaveAttribute('data-message-type', 'error'), { timeout: 6000 });
    await expect(canvasElement.querySelector('.asset-model-status')).toHaveTextContent('Could not prepare the model');
    await expect(canvasElement.querySelector('[data-tool-view="studio-problems"]')).toHaveTextContent('Problems · 1');
    await expect(canvasElement.querySelector('[data-tool-view="studio-problems"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(canvasElement.querySelector('.gc-studio-workbench-notice')).toBeNull();
  },
};
export const LocalModelDusk: Story = { ...LocalModel, args: { theme: 'dark' } };

export const AuthoringResults: Story = {
  args: { scenario: 'history' },
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-notification-story-ready]')).toBeTruthy());
    await userEvent.click(canvas.getByRole('button', { name: 'Writing' }));
    const writing = canvasElement.querySelector<HTMLTextAreaElement>('.authoring-writing-input')!;
    await userEvent.type(writing, ' This writing remains after the failure.');
    const text = writing.value;
    const dock = canvasElement.querySelector<HTMLElement>('.gc-dock')!;
    const before = dock.getBoundingClientRect();
    const problemsTool = () => canvasElement.querySelector<HTMLElement>('[data-tool-view="studio-problems"]')!;
    await expect(problemsTool()).toHaveAttribute('aria-pressed', 'false');
    const undo = canvasElement.querySelector<HTMLElement>('.gc-studio-chrome [data-action="undo"]')!;
    await userEvent.click(undo);
    const currentMessage = () => canvasElement.ownerDocument.querySelector<HTMLElement>('.studio-toast:not([data-ending-style])');
    await waitFor(() => expect(currentMessage()).toHaveAttribute('data-message-type', 'warning'));
    await expect(problemsTool()).toHaveTextContent('Problems · 1');
    await expect(problemsTool()).toHaveAttribute('aria-pressed', 'false');
    await expect(dock.getBoundingClientRect().y).toBe(before.y);
    await expect(dock.getBoundingClientRect().height).toBe(before.height);
    await expect(canvasElement.querySelector('.gc-studio-workbench-notice')).toBeNull();
    await expect(currentMessage()).toHaveTextContent('Fixture history is busy. Your writing is kept; try Undo again.');
    await expect(within(currentMessage()!).getByRole('button', { name: 'View problems' })).toBeTruthy();
    await userEvent.keyboard('{F6}');
    await userEvent.click(within(currentMessage()!).getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(currentMessage()).toBeNull());
    await expect(canvasElement.querySelector<HTMLTextAreaElement>('.authoring-writing-input')!.value).toBe(text);
    await userEvent.click(problemsTool());
    const row = canvasElement.querySelector<HTMLElement>('[data-problem-id][data-issue-code="STORY_HISTORY_BUSY"]')!;
    await expect(row).toHaveAttribute('data-severity', 'warning');
    await userEvent.click(within(row).getByRole('button', { name: /^Diagnostic details:/ }));
    await expect(row.querySelector('.gc-problem-details')).toHaveTextContent('Fixture history is busy. Your writing is kept; try Undo again.');
    await userEvent.click(within(row).getByRole('button', { name: 'Locate issue' }));
    const back = await canvas.findByRole('button', { name: 'Return to Problems' });
    await expect(back.closest('[data-view]')).toHaveAttribute('data-view', `scene:${FixtureIds.street}`);
    await expect(canvasElement.querySelector('.gc-studio-workbench-notice')).toBeNull();
    await userEvent.click(back);
    await expect(canvasElement.querySelector('[data-view="studio-problems"]')).not.toHaveAttribute('hidden');
    await userEvent.click(canvasElement.querySelector<HTMLElement>('.gc-studio-chrome [data-action="redo"]')!);
    await waitFor(() => expect(currentMessage()).toHaveAttribute('data-message-type', 'error'));
    await expect(problemsTool()).toHaveTextContent('Problems · 2');
    await expect(canvasElement.querySelectorAll('.gc-workbench-problems [data-problem-id]')).toHaveLength(2);
    await expect(canvasElement.querySelector('.authoring-notice')).toBeNull();
  },
};
export const AuthoringResultsDusk: Story = { ...AuthoringResults, args: { scenario: 'history', theme: 'dark' } };

export const SaveRecovery: Story = {
  args: { scenario: 'save' },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-notification-story-ready]')).toBeTruthy());
    await userEvent.click(canvasElement.querySelector<HTMLElement>('.gc-studio-chrome [data-action="save"]')!);
    const currentMessage = () => canvasElement.ownerDocument.querySelector<HTMLElement>('.studio-toast:not([data-ending-style])');
    await waitFor(() => expect(currentMessage()).toHaveAttribute('data-message-type', 'error'));
    const problemsTool = canvasElement.querySelector<HTMLElement>('[data-tool-view="studio-problems"]')!;
    await expect(problemsTool).toHaveTextContent('Problems · 1');
    await expect(problemsTool).toHaveAttribute('aria-pressed', 'false');
    await expect(canvasElement.querySelector('.gc-studio-workbench-notice')).toBeNull();
    await userEvent.click(within(currentMessage()!).getByRole('button', { name: 'View problems' }));
    await expect(canvasElement.querySelector('[data-view="studio-problems"]')).not.toHaveAttribute('hidden');
    const row = canvasElement.querySelector<HTMLElement>('[data-problem-id][data-issue-code="STORY_SAVE_UNAVAILABLE"]')!;
    await expect(row).toHaveAttribute('data-severity', 'error');
    await expect(within(row).getByRole('button', { name: 'Open save source' })).toBeTruthy();
    await userEvent.click(within(row).getByRole('button', { name: /^Diagnostic details:/ }));
    await expect(row.querySelector('.gc-problem-details')).toHaveTextContent('Fixture save preparation is temporarily unavailable. Your writing is kept. Save again to confirm the document is unchanged.');
  },
};
export const SaveRecoveryDusk: Story = { ...SaveRecovery, args: { scenario: 'save', theme: 'dark' } };
