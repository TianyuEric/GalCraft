import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { studioFixture } from '../../stories/studio-fixture.js';
import { Production } from './Production.js';
import { ProductionSession } from './session.js';
import { unwrap, type WorkbenchBridge } from './bridge.js';
import '../../authoring/shell.css';

function AdoptionPage({ usage = 'figure', statementCommand = 'say' }: {
  usage?: 'figure' | 'background' | 'bgm'; statementCommand?: string;
}) {
  const [model, setModel] = useState<{ session: ProductionSession; services: ReturnType<typeof studioFixture>['services'] } | null>(null);
  const [selection, setSelection] = useState('');
  useEffect(() => {
    let active = true;
    const { services } = studioFixture('normal', 'zh-CN', 'light'), bridge = services.bridge as unknown as WorkbenchBridge;
    void bridge.production.overview().then(result => {
      const data = unwrap(result), task = structuredClone(data.tasks[1]!), candidate = structuredClone(data.candidates[0]!.candidate);
      const scene = data.scenes[0]!, statement = scene.statements[0]!;
      statement.command = statementCommand;
      task.name = '采用方式回归 · 正式制作页面'; task.items[0]!.needsReview = false;
      task.items[0]!.target = { ...task.items[0]!.target, sceneId: scene.id, statementId: statement.id, characterId: null, usage };
      candidate.editedText = null;
      candidate.artifacts = [{ kind: usage === 'bgm' ? 'audio' : 'image', localPath: usage === 'bgm' ? 'authored.wav' : 'authored.png',
        mime: usage === 'bgm' ? 'audio/wav' : 'image/png', bytes: 1, metadata: {}, groupId: 'local/0', role: 'primary', background: null }];
      data.tasks = [task]; data.drafts = []; data.candidates = [{ candidate, adoption: 'unadopted' }];
      bridge.production.overview = async () => ({ ok: true, value: structuredClone(data), warnings: [] });
      bridge.production.candidateContent = async () => ({ ok: true, value: { text: '', media: [] }, warnings: [] });
      bridge.production.select = async input => {
        setSelection(JSON.stringify(input.adoptions?.[candidate.id]));
        return { ok: true, value: { planId: 'AdoptA', input: { origin: 'candidate', label: '采用候选', expected: [], patches: [], preparedAssets: [], requiredRefs: [] },
          members: [], issues: [], before: {}, preview: [] }, warnings: [] };
      };
      const session = new ProductionSession(bridge, task.projectId); session.data = data; session.taskId = task.id;
      if (active) setModel({ session, services });
    });
    return () => { active = false; };
  }, [usage, statementCommand]);
  return <div id="app" className="authoring-shell" data-theme="light" style={{ height: '100vh', display: 'flex' }}>
    <div id="studio-portals" data-theme="light"/>
    {model && <Production session={model.session} services={model.services} locale="zh-CN" navigate={() => {}} changed={async () => {}}/>}
    <output aria-label="Reviewed adoption choice" style={{ position: 'fixed', bottom: 0 }}>{selection}</output>
  </div>;
}
const meta = { title: 'Product/Studio/Production/Adoption page', component: AdoptionPage, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof AdoptionPage>;
export default meta;
type Story = StoryObj<typeof meta>;
const bindAndReview: NonNullable<Story['play']> = async ({ canvas, canvasElement }) => {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(await canvas.findByRole('combobox', { name: '采用位置' }));
  await userEvent.click(await body.findByRole('option', { name: '绑定到来源场景' }));
  await userEvent.click(canvasElement.querySelector('.candidate-select')!);
  await userEvent.click(canvas.getByRole('button', { name: '审阅采用' }));
  await waitFor(() => expect(canvas.getByLabelText('Reviewed adoption choice')).toHaveTextContent('"mode":"bind"'));
};
export const BackgroundKeepsExistingPlacement: Story = { args: { usage: 'background', statementCommand: 'changeBg' }, play: async context => {
  await bindAndReview(context); await expect(context.canvas.getByLabelText('Reviewed adoption choice')).not.toHaveTextContent('placement');
  context.canvasElement.dataset.w12PageVerified = 'true';
} };
export const MusicKeepsExistingPlacement: Story = { args: { usage: 'bgm', statementCommand: 'bgm' }, play: async context => {
  await bindAndReview(context); await expect(context.canvas.getByLabelText('Reviewed adoption choice')).not.toHaveTextContent('placement');
  context.canvasElement.dataset.w12PageVerified = 'true';
} };
export const NarrationCreatesIllustration: Story = { play: async ({ canvas, canvasElement }) => {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(await canvas.findByRole('combobox', { name: '采用位置' }));
  await userEvent.click(await body.findByRole('option', { name: '绑定到来源场景' }));
  await expect(canvas.getByRole('combobox', { name: '舞台用途' })).toHaveTextContent('独立演出插图');
  await userEvent.click(canvas.getAllByRole('combobox', { name: '采用位置' })[1]!);
  await expect(body.queryByRole('option', { name: '替换所选指令的素材' })).toBeNull();
  await userEvent.keyboard('{Escape}');
  await userEvent.click(canvasElement.querySelector('.candidate-select')!);
  await userEvent.click(canvas.getByRole('button', { name: '审阅采用' }));
  await waitFor(() => expect(canvas.getByLabelText('Reviewed adoption choice')).toHaveTextContent('"placement":"new"'));
  canvasElement.dataset.w12PageVerified = 'true';
} };
