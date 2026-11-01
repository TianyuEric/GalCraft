import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { mountAuthoring } from '../authoring/view.js';
import { studioFixture } from './studio-fixture.js';

function IllustrationInspector({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const root = useRef<HTMLDivElement>(null), [source, setSource] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    let active = true, mounted: Awaited<ReturnType<typeof mountAuthoring>> | null = null;
    const { services } = studioFixture('normal', 'zh-CN', theme), container = document.createElement('div');
    container.id = 'app'; root.current!.append(container);
    const portals = document.createElement('div'); portals.id = 'studio-portals'; portals.dataset.theme = theme; document.body.append(portals);
    void (async () => {
      const current = await services.read(); if (!current.ok) throw current.error;
      const scene = current.value.scenes[0]!, asset = current.value.references!.find(item => item.kind === 'asset')!;
      const text = `changeIllustration {objectId:"Ill001",assetId:"${asset.id}",illustrationFrame:{widthRatio:0.5,heightRatio:0.5,fit:"contain"},states:[{name:"calm",assetId:"${asset.id}"}]} @IllS01;\nchangeIllustrationDiff {objectId:"Ill001",stateName:"calm"} @IllS02;\nsay {speaker:{kind:"narrator"},text:"无角色独立插图"} @IllS03;\n`;
      const plan = await services.bridge.documents.planEdit({ label: 'Inspector Storybook fixture', origin: 'batch',
        expected: [{ ref: { kind: 'document', id: scene.documentId }, revision: scene.revision }], preparedAssets: [], requiredRefs: [],
        patches: [{ kind: 'text', documentId: scene.documentId, edits: [{ start: 0, end: scene.text.length, before: scene.text, after: text }] }] });
      if (!plan.ok) throw plan.error;
      await services.bridge.documents.applyEdit(plan.value.planId, plan.value.input.expected); setSource(text);
      const apply = services.bridge.documents.applyEdit;
      services.bridge.documents.applyEdit = async (...args) => { const result = await apply(...args), next = await services.read(); if (next.ok && active) setSource(next.value.scenes[0]!.text); return result; };
      mounted = await mountAuthoring(container, services); if (!active) mounted.dispose();
    })().catch(reason => setError(String(reason)));
    return () => { active = false; mounted?.dispose(); container.remove(); portals.remove(); };
  }, [theme]);
  return <div data-theme={theme} style={{ height: '100vh' }}><div ref={root}/>{error && <p role="alert">{error}</p>}
    <output aria-label="Inspector source" style={{ position: 'fixed', left: -10000, top: 0 }}>{source}</output></div>;
}
const meta = { title: 'Product/Studio/Authoring/Illustration inspector', component: IllustrationInspector, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof IllustrationInspector>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NamedState: Story = { play: async ({ canvas, canvasElement }) => {
  await userEvent.click(await waitFor(() => { const card = canvasElement.querySelector('[data-statement-id="IllS01"]'); expect(card).not.toBeNull(); return card!; }));
  const toggle = canvasElement.querySelector('button[data-workbench-action="inspector"]');
  if (toggle?.getAttribute('aria-pressed') !== 'true') await userEvent.click(toggle!);
  let inspector = within(canvasElement.querySelector('.authoring-inspector')!);
  await userEvent.click(inspector.getByText('更多属性', { exact: true }));
  const width = inspector.getByRole('spinbutton', { name: /^画布宽度比例$/ });
  await userEvent.clear(width); await userEvent.type(width, '0.6'); await userEvent.tab();
  await waitFor(() => expect(canvas.getByLabelText('Inspector source')).toHaveTextContent('widthRatio:0.6'));
  inspector = within(canvasElement.querySelector('.authoring-inspector')!);
  const name = inspector.getByRole('textbox', { name: /^名称$/ });
  await userEvent.clear(name); await userEvent.type(name, 'night'); await userEvent.tab();
  await waitFor(() => expect(canvas.getByLabelText('Inspector source')).toHaveTextContent('name:"night"'));
  await userEvent.click(canvasElement.querySelector('[data-statement-id="IllS02"]')!);
  inspector = within(canvasElement.querySelector('.authoring-inspector')!);
  const state = inspector.getByRole('textbox', { name: /^差分名称$/ });
  await userEvent.clear(state); await userEvent.type(state, 'night'); await userEvent.tab();
  await waitFor(() => expect(canvas.getByLabelText('Inspector source')).toHaveTextContent('stateName:"night"'));
  canvasElement.dataset.w12InspectorVerified = 'true';
} };
export const Dusk: Story = { args: { theme: 'dark' } };
