import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../controls.js';
import { DockWorkspace } from './DockWorkspace.js';
import { emptyLayout, group, type Zone } from './zoned-layout.js';

const titles: Record<string, string> = { draft: 'Draft', notes: 'Notes', explorer: 'Explorer', inspector: 'Inspector', problems: 'Problems', source: 'Draft source' };
const zones: Record<string, Zone> = { explorer: 'left', inspector: 'right', problems: 'bottom' };
const documents = [{ id: 'draft' }, { id: 'notes', preview: true }];

function Example({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const [active, setActive] = useState('draft');
  const [draft, setDraft] = useState('The lights come on at the station.');
  const [allow, setAllow] = useState(false);
  const [source, setSource] = useState(false);
  return <div className="authoring-shell" data-theme={theme} lang="en" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', color: 'var(--foreground)', background: 'var(--workbench-editor)', font: '14px/1.5 var(--font-sans)' }}>
    <div style={{ display: 'flex', gap: 8, padding: 8 }}>
      <Button onClick={() => setAllow(true)}>Allow document switch</Button>
      <Button onClick={() => setSource(true)}>Open source alongside</Button>
    </div>
    <DockWorkspace locale="en" activeView={active} documentViews={documents} viewIds={Object.keys(titles).filter(id => id !== 'source' || source && active === 'draft')}
      companion={source && active === 'draft' ? { id: 'source', document: 'draft' } : undefined}
      retainStowedView={id => id === 'source' && source && active !== 'draft'}
      onClose={id => { if (id === 'source') setSource(false); return true; }}
      createDefaultLayout={() => {
        const layout = emptyLayout();
        layout.tree = group('document', ['draft', 'notes']);
        layout.left = group('left', ['explorer']);
        layout.right = group('right', ['inspector']);
        layout.bottom = group('bottom', ['problems']);
        return layout;
      }}
      title={id => titles[id] ?? id} zone={id => zones[id] ?? 'center'} canCloseView={id => !(id in zones)}
      onActivate={id => { if (id === 'draft' || id === 'notes' && allow) setActive(id); }} notice={() => {}}
      renderView={id => id === 'draft'
        ? <label style={{ display: 'grid', gap: 8, padding: 12 }}>Draft text<textarea rows={3} value={draft} onChange={event => setDraft(event.target.value)}/></label>
        : <p style={{ padding: 12 }}>{titles[id]} content</p>}/>
  </div>;
}

const meta = { title: 'Components/Workbench/Dock Workspace', component: Example, tags: ['autodocs'] } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Zones: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const GuardedDocumentAndSideTool: Story = {
  play: async ({ canvas, canvasElement }) => {
    const draft = canvas.getByRole('tab', { name: 'Draft' });
    const notes = canvas.getByRole('tab', { name: 'Notes' });
    const text = canvas.getByRole('textbox', { name: 'Draft text' });
    await userEvent.type(text, ' An edit.');
    draft.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(draft).toHaveAttribute('aria-selected', 'true');
    await expect(text).toHaveValue('The lights come on at the station. An edit.');
    await expect(notes).toHaveAttribute('aria-selected', 'false');

    await userEvent.click(canvas.getByRole('button', { name: 'Allow document switch' }));
    draft.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(notes).toHaveFocus());
    await expect(notes).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(draft).toHaveFocus());
    await expect(text).toHaveValue('The lights come on at the station. An edit.');

    const explorer = canvas.getByRole('tab', { name: 'Explorer' });
    explorer.focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    const menu = await within(canvasElement.ownerDocument.body).findByRole('menu', { name: 'Tab actions for Explorer' });
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Move to the right sidebar' }));
    await waitFor(() => expect(canvas.getByRole('tab', { name: 'Explorer' }).closest('[data-zone]')).toHaveAttribute('data-zone', 'right'));
  },
};

export const Companion: Story = {
  play: async ({ canvas }) => {
    const draft = canvas.getByRole('tab', { name: 'Draft' });
    await userEvent.click(canvas.getByRole('button', { name: 'Open source alongside' }));
    const source = await canvas.findByRole('tab', { name: 'Draft source' });
    await expect(draft.closest('[data-group]')).not.toBe(source.closest('[data-group]'));
    await expect(canvas.getByRole('region', { name: /^Draft$/ })).toBeVisible();
    const pane = canvas.getByRole('region', { name: 'Draft source' });
    await expect(pane).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Stow Draft source' }));
    await expect(pane).not.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Allow document switch' }));
    await userEvent.click(canvas.getByRole('tab', { name: 'Notes' }));
    await waitFor(() => expect(canvas.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true'));
    await userEvent.click(draft);
    await waitFor(() => expect(draft).toHaveAttribute('aria-selected', 'true'));
    await expect(pane).not.toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: 'Restore stowed · Draft source' }));
    await expect(pane).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Close Draft source' }));
    await waitFor(() => expect(pane).not.toBeInTheDocument());
    await expect(canvas.getByRole('textbox', { name: 'Draft text' })).toBeVisible();
  },
};
