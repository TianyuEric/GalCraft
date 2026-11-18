import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { DocumentView, Json } from '@galcraft/contracts';
import { ProjectDraftReview } from './ProjectDraftReview.js';
import type { StudioLocale } from '../../authoring/controller.js';
import '../../authoring/shell.css';
import './projects.css';

const saved: DocumentView[] = [{
  documentId: 'sceneA', format: 'dsl', revision: 5, savedRevision: 4, dirty: true,
  files: { 'scenes/station.gal': 'live working text' }, savedFiles: { 'scenes/station.gal': 'changed on disk' },
}];
const draft: Json = {
  savedAt: '2026-11-10T07:30:00Z',
  documents: [{ documentId: 'sceneA', baseRevision: 2, workingRevision: 3,
    baseFiles: { 'scenes/station.gal': 'original baseline' }, files: { 'scenes/station.gal': 'retained station draft' } },
  { documentId: 'sceneB', baseRevision: 0, workingRevision: 1, baseFiles: {}, files: { 'scenes/new.gal': 'new scene draft' } }],
};

function ReviewExample({ locale = 'en', theme = 'light' }: { locale?: StudioLocale; theme?: 'light' | 'dark' }) {
  const [choice, setChoice] = useState<'restore' | 'discard'>('restore');
  return <div id="app" data-theme={theme} className="authoring-shell" style={{ display: 'block', height: '100vh', overflow: 'auto', padding: 16, background: 'var(--background)', color: 'var(--foreground)' }}>
    <div id="studio-portals" lang={locale} data-theme={theme}/>
    <main className="project-workbench"><ProjectDraftReview locale={locale} saved={saved} draft={draft} onChoice={setChoice}/>
      <output>{choice}</output></main>
  </div>;
}

const meta = { title: 'Product/Studio/Projects/Compare retained draft', component: ReviewExample, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof ReviewExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ChangedAndNew: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText('scenes/station.gal'));
  await expect(canvas.getByText('Currently saved · r4')).toBeVisible();
  await expect(canvas.getByText('changed on disk')).toBeVisible();
  await expect(canvas.queryByText('live working text')).not.toBeInTheDocument();
  await expect(canvas.getByText('Draft baseline · r2')).toBeVisible();
  await expect(canvas.getByText('retained station draft')).toBeVisible();
  await userEvent.click(canvas.getByText('scenes/new.gal'));
  await expect(canvas.getByText('This version has no file at this path.')).toBeVisible();
  await expect(canvas.getByText('new scene draft')).toBeVisible();
  await userEvent.click(canvas.getByRole('radio', { name: 'Discard draft and use saved content' }));
  await expect(canvas.getByText('discard')).toBeVisible();
} };
export const DarkChinese: Story = { args: { theme: 'dark', locale: 'zh-CN' } };
