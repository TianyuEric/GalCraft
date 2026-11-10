import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Folder, Info, List, Search, TriangleAlert } from 'lucide-react';
import { Button } from '../controls.js';
import { Input } from '../ui/input.js';
import { DockWorkspace, type DockHandle } from './DockWorkspace.js';
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

    const explorer = canvas.getByRole('button', { name: 'Tool actions for Explorer' });
    explorer.focus();
    await userEvent.keyboard('{Enter}');
    const menu = await within(canvasElement.ownerDocument.body).findByRole('menu', { name: 'Tool actions for Explorer' });
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Move to the right sidebar' }));
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Explorer' }).closest('[data-zone]')).toHaveAttribute('data-zone', 'right'));
  },
};

const alignmentTitles: Record<string, string> = {
  draft: 'Draft', notes: 'Notes', beats: 'Beats', stage: 'Stage', scene: 'New scene',
  outline: 'Outline', directory: 'Asset directory', details: 'Asset details', library: 'Asset library', problems: 'Problems',
};
const alignmentZones: Record<string, Zone> = { outline: 'left', directory: 'left', details: 'right', library: 'bottom', problems: 'bottom' };
const alignmentIcons = { outline: List, directory: Folder, details: Info, library: Search, problems: TriangleAlert };
function AlignmentExample() {
  const dock = useRef<DockHandle>(null);
  const [active, setActive] = useState('draft');
  const [narrow, setNarrow] = useState(false);
  const [documentViews, setDocuments] = useState([{ id: 'draft' }, { id: 'notes' }, { id: 'beats' }]);
  const [layoutChanges, setLayoutChanges] = useState(0);
  const tools = ['directory', 'library', 'details'];
  const focusOrder = ['library', 'directory', 'details'];
  return <div className="authoring-shell" data-theme="dark" lang="en" style={{
    width: narrow ? 900 : '100%', height: '100dvh', maxWidth: '100%', display: 'flex', flexDirection: 'column',
    color: 'var(--foreground)', background: 'var(--workbench-editor)', font: '14px/1.5 var(--font-sans)',
  }}>
    <div style={{ display: 'flex', gap: 8, padding: 8 }}>
      <Button onClick={() => dock.current?.openCombination(tools, { focusOrder })}>Open asset management</Button>
      <Button onClick={() => dock.current?.reveal('details')}>Return to asset details</Button>
      <Button onClick={() => setNarrow(!narrow)}>Resize workspace</Button>
      <Button onClick={() => dock.current?.openCombination(['details'], { focusOrder: ['details'] })}>Show details only</Button>
      <Button onClick={() => {
        setDocuments(old => [...old, { id: 'scene' }]);
        setActive('scene');
      }}>Open new scene</Button>
      <output aria-label="Layout changes">{layoutChanges}</output>
    </div>
    <DockWorkspace ref={dock} locale="en" activeView={active} documentViews={documentViews}
      viewIds={Object.keys(alignmentTitles)} title={id => alignmentTitles[id]!} zone={id => alignmentZones[id] ?? 'center'}
      icon={id => { const Icon = alignmentIcons[id as keyof typeof alignmentIcons]; return Icon && <Icon aria-hidden="true"/>; }}
      createDefaultLayout={() => {
        const layout = emptyLayout();
        layout.tree = { kind: 'split', id: 'split', axis: 'y', ratio: .5,
          first: group('first', ['draft', 'notes']), second: group('second', ['beats', 'stage']) };
        layout.activeGroup = 'first';
        layout.left = group('left', ['outline', 'directory', 'details']);
        layout.left.active = 'details';
        layout.widths = { left: 240, right: 240 };
        return layout;
      }}
      onActivate={id => { if (documentViews.some(view => view.id === id)) setActive(id); }}
      onLayoutChange={() => setLayoutChanges(value => value + 1)} notice={() => {}}
      renderView={id => <label style={{ display: 'grid', alignContent: 'start', gap: 8, padding: 12 }}>
        {id === 'library' ? 'Search assets' : alignmentTitles[id]}
        <Input data-dock-focus defaultValue=""/>
      </label>}/>
  </div>;
}

export const Alignment: Story = {
  render: () => <AlignmentExample/>,
  play: async ({ canvas, canvasElement }) => {
    const combo = canvas.getByRole('button', { name: 'Open asset management' });
    const details = () => canvas.getByRole('textbox', { name: 'Asset details' });
    const changes = canvas.getByLabelText('Layout changes');
    await userEvent.type(details(), 'chosen version');

    const before = Number(changes.textContent);
    await userEvent.click(combo);
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'Search assets' })).toHaveFocus());
    await expect(changes).toHaveTextContent(String(before + 1));
    await expect(canvas.getByRole('heading', { name: 'Asset details' })).toBeVisible();
    await expect(canvas.queryByRole('tab', { name: 'Asset details' })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Outline' }));
    await userEvent.click(combo);
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Asset directory' })).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: 'Stow Asset directory' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Return to asset details' }));
    await waitFor(() => expect(details()).toHaveFocus());
    await expect(details()).toHaveValue('chosen version');
    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByRole('heading', { name: 'Asset details' })).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Asset details' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Tool actions for Asset details' }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole('menuitem', { name: 'Move to the right sidebar' }));
    await waitFor(() => expect(canvas.getByRole('region', { name: 'Asset details' })).toHaveAttribute('data-zone', 'right'));
    await userEvent.click(canvas.getByRole('button', { name: 'Tool actions for Asset details' }));
    await userEvent.click(body.getByRole('menuitem', { name: 'Close tool' }));
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Asset details' })).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole('button', { name: 'Return to asset details' }));
    await waitFor(() => expect(details()).toHaveValue('chosen version'));
    await expect(canvas.getByRole('region', { name: 'Asset details' })).toHaveAttribute('data-zone', 'right');

    const detailsHeader = within(canvas.getByRole('heading', { name: 'Asset details' }).closest<HTMLElement>('[data-group]')!);
    const beforeMaximize = changes.textContent;
    await userEvent.click(detailsHeader.getByRole('button', { name: 'Maximize group' }));
    await expect(canvas.queryByRole('tab', { name: 'Draft' })).not.toBeInTheDocument();
    await userEvent.click(detailsHeader.getByRole('button', { name: 'Restore work surface' }));
    await expect(canvas.getByRole('tab', { name: 'Draft' })).toBeVisible();
    await expect(changes).toHaveTextContent(beforeMaximize!);

    const draft = canvas.getByRole('tab', { name: 'Draft' });
    const stage = canvas.getByRole('tab', { name: 'Stage' });
    const beats = canvas.getByRole('tab', { name: 'Beats' });
    await userEvent.click(stage);
    await userEvent.click(canvas.getByRole('textbox', { name: 'Stage' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Open new scene' }));
    const scene = await canvas.findByRole('tab', { name: 'New scene' });
    await expect(scene.closest('[data-group]')).toBe(draft.closest('[data-group]'));
    await expect(stage).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(beats);
    await waitFor(() => expect(beats).toHaveAttribute('aria-selected', 'true'));
    await expect(scene).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(canvas.getByRole('button', { name: 'Resize workspace' }));
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Asset details' })).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole('button', { name: 'Show details only' }));
    await waitFor(() => expect(canvas.getByRole('button', { name: /^Asset details$/ })).toHaveFocus());
    await expect(canvas.queryByRole('region', { name: 'Asset details' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Return to asset details' }));
    await waitFor(() => expect(details()).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByRole('region', { name: 'Asset details' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Resize workspace' }));
    await waitFor(() => expect(details()).toBeVisible());
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
