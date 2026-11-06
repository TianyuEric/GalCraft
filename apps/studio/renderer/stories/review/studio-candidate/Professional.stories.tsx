import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { fixtureId } from '@galcraft/contracts/fixtures';
import type { Asset } from '@galcraft/contracts';
import { CandidateStudio } from '../../../review/studio-candidate/CandidateStudio.js';
import { professionalCommandViewId } from '../../../review/studio-candidate/workfaces/CandidateCommandProfessionalView.js';
import { candidateFixture } from './fixtures.js';
import { initialAnimation } from '../../../authoring/animation-timeline.js';

const meta = { title: 'Review/Studio/候选 Studio/专业编辑', component: CandidateStudio, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof CandidateStudio>;
export default meta;
type Story = StoryObj<typeof meta>;

async function expectVersionCount(preview: ReturnType<typeof within>, user: ReturnType<typeof userEvent.setup>, count: number) {
  const picker = preview.getByRole('combobox', { name: '预览版本' });
  await waitFor(() => expect(picker).toBeEnabled());
  await user.click(picker);
  const options = within(await preview.findByRole('listbox', { name: '预览版本' }));
  await waitFor(() => expect(options.getAllByRole('option')).toHaveLength(count));
  await user.keyboard('{Escape}');
}

function animationFixture() {
  const fixture = candidateFixture('balanced', 'dark'), { seed } = fixture;
  const assetId = fixtureId(0xee00), variantId = fixtureId(0xee01);
  const index = seed.documents.find(item => 'assets/index.json' in item.files)!;
  const resources = seed.documents.find(item => 'candidate/resources.json' in item.files)!;
  const content = JSON.parse(index.files['assets/index.json']!);
  const asset: Asset = structuredClone(content.data.assets[0]);
  const animation = initialAnimation();
  const json = JSON.stringify(animation);
  content.data.assets.push({ ...asset, id: assetId, kind: 'animation', name: '镜头运动', originalVariantId: variantId, activeVariantId: variantId, variants: [{
    ...asset.variants[0], id: variantId, entry: 'motion.gca', metadata: { durationSec: animation.durationMs / 1000 },
    files: [{ path: 'motion.gca', mime: 'application/vnd.galcraft.animation+json', bytes: new TextEncoder().encode(json).length, role: 'primary' }],
  }] });
  index.savedFiles['assets/index.json'] = index.files['assets/index.json'] = JSON.stringify(content);
  const resourceContent = JSON.parse(resources.files['candidate/resources.json']!);
  resourceContent.data.locations[assetId] = 'data:application/json,' + encodeURIComponent(json);
  resources.savedFiles['candidate/resources.json'] = resources.files['candidate/resources.json'] = JSON.stringify(resourceContent);
  return { ...fixture, initialView: 'assets:' + assetId };
}

export const AnimationAsset: Story = {
  name: '动画素材关键帧与版本撤销',
  args: { ...animationFixture(), preferenceKey: 'professional-animation-asset' },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const preview = within(await canvas.findByRole('region', { name: '素材预览' }));
    const player = within(await preview.findByRole('region', { name: '动画画面预览' }));
    await expect(player.getByRole('combobox', { name: '预览对象类型' })).toBeVisible();
    await expectVersionCount(preview, user, 2);
    await user.click(preview.getByRole('button', { name: '专业编辑' }));
    await expect(await preview.findByRole('heading', { name: '动画与关键帧' })).toBeVisible();
    const value = await preview.findByLabelText('数值');
    await user.clear(value);
    await user.type(value, '-120{Enter}');
    await expectVersionCount(preview, user, 3);
    await waitFor(() => expect(preview.getByLabelText('数值')).toHaveValue('-120'));
    await user.click(canvas.getByRole('button', { name: '撤销当前目标' }));
    await expectVersionCount(preview, user, 2);
    await waitFor(() => expect(preview.getByLabelText('数值')).toHaveValue('100'));
  },
};

function framingFixture() {
  const fixture = candidateFixture('balanced', 'light'), { seed } = fixture;
  const sceneId = seed.ui.sceneId;
  const document = seed.documents.find(item => item.documentId === seed.sceneDocuments[sceneId])!;
  const path = Object.keys(document.files).find(file => file.endsWith('.gal'))!;
  const backgroundId = fixtureId(0xee20);
  const image = JSON.parse(seed.documents.find(item => 'assets/index.json' in item.files)!.files['assets/index.json']!).data.assets.find((item: Asset) => item.kind === 'image');
  const instruction = 'changeBg ' + JSON.stringify({ op: 'show', assetId: image.id, fit: 'cover', positionX: 0.5, positionY: 0.5 }) + ' @' + backgroundId + ';\n';
  document.savedFiles[path] = document.files[path] = instruction + document.files[path];
  return { ...fixture, initialView: professionalCommandViewId(sceneId, backgroundId) };
}

export const Framing: Story = {
  name: '背景取景草稿与正式舞台',
  args: { ...framingFixture(), preferenceKey: 'professional-framing' },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const professional = within(await canvas.findByRole('region', { name: '指令专业编辑' }));
    const horizontal = professional.getByRole('textbox', { name: '水平位置' });
    await user.clear(horizontal);
    await user.type(horizontal, '0.25');
    await user.click(professional.getByRole('button', { name: '预览草稿' }));
    const stage = await professional.findByRole('region', { name: '草稿 Player 预览' });
    await waitFor(() => expect(stage.querySelector('.studio-mini-stage')).toHaveAttribute('data-stale', 'false'), { timeout: 15_000 });
    await user.click(professional.getByRole('button', { name: '应用到原指令' }));
    await expect(await professional.findByText(/已写回原指令/)).toBeVisible();
    await user.click(canvas.getByRole('button', { name: '撤销当前目标' }));
    await waitFor(() => expect(professional.getByRole('textbox', { name: '水平位置' })).toHaveValue('0.5'));
  },
};

function audioFixture() {
  const fixture = candidateFixture('balanced', 'light'), { seed } = fixture;
  const assets = JSON.parse(seed.documents.find(item => 'assets/index.json' in item.files)!.files['assets/index.json']!).data.assets as Asset[];
  const audio = assets.find(asset => asset.kind === 'audio')!;
  return { ...fixture, initialView: 'assets:' + audio.id };
}

export const AudioLoop: Story = {
  name: '真实波形与循环版本',
  args: { ...audioFixture(), preferenceKey: 'professional-audio-loop' },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const preview = within(await canvas.findByRole('region', { name: '素材预览' }));
    await user.click(preview.getByRole('button', { name: '专业编辑' }));
    await expect(await preview.findByRole('img', { name: '实际音频的振幅波形' }, { timeout: 15_000 })).toBeVisible();
    const start = preview.getByLabelText('循环起点');
    const initial = (start as HTMLInputElement).value;
    await user.clear(start);
    await user.type(start, '0.5{Enter}');
    await waitFor(() => expect(preview.getByText('起点 0.50s')).toBeVisible());
    await expectVersionCount(preview, user, 3);
    await user.click(preview.getByRole('button', { name: '定位循环起点' }));
    await expect(preview.getByLabelText('声音播放位置')).toHaveTextContent('0.50 s');
    await user.click(canvas.getByRole('button', { name: '撤销当前目标' }));
    await expectVersionCount(preview, user, 2);
    await waitFor(() => expect(preview.getByLabelText('循环起点')).toHaveValue(initial), { timeout: 15_000 });
  },
};
