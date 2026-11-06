import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { CandidateStudio } from '../../../review/studio-candidate/CandidateStudio.js';
import { createCandidateSeed } from '../../../review/studio-candidate/application/documents.js';
import { createCandidateServices } from '../../../review/studio-candidate/application/services.js';
import { createReviewSeed } from '../studio-r0/galcraft/fixtures.js';

function assetFixture(theme: 'light' | 'dark') {
  const review = createReviewSeed('balanced', theme);
  const image = review.project.assets[0]!;
  for (let i = 1; i <= 28; i++) {
    const number = String(i).padStart(2, '0');
    review.project.assets.push({ ...image, id: 'panel-asset-' + number, name: 'Panel review ' + number + '.png' });
  }
  return {
    seed: createCandidateSeed(review),
    createServices: (host: Parameters<typeof createCandidateServices>[0]) => createCandidateServices(host, theme),
    initialView: 'assets',
  };
}

const meta = {
  title: 'Review/Studio/候选 Studio/素材工作面', component: CandidateStudio, parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CandidateStudio>;
export default meta;
type Story = StoryObj<typeof meta>;

async function expectPreviewVersion(preview: ReturnType<typeof within>, user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const picker = await preview.findByRole('combobox', { name: '预览版本' });
  await waitFor(() => expect(picker).toBeEnabled());
  await user.click(picker);
  const versions = within(await preview.findByRole('listbox', { name: '预览版本' }));
  await expect(await versions.findByRole('option', { name })).toBeVisible();
  await user.keyboard('{Escape}');
}

export const CrossPageSelection: Story = {
  name: '跨页选区与完整批量确认',
  args: { ...assetFixture('light'), preferenceKey: 'asset-cross-page' },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const search = await canvas.findByRole('searchbox', { name: '搜索素材' });
    const library = within(search.closest('section')!);
    await user.type(search, 'Panel review');
    await user.click(await library.findByRole('option', { name: /Panel review 01/ }));
    await user.keyboard('{Shift>}');
    await user.click(library.getByRole('option', { name: /Panel review 03/ }));
    await user.keyboard('{/Shift}');
    await expect(library.getByText('已选 3 项 · 本页 3 · 其他页或筛选外 0')).toBeVisible();
    await user.click(library.getByRole('button', { name: '下一页' }));
    const hiddenPageItem = await library.findByRole('option', { name: /Panel review 25/ });
    await user.keyboard('{Control>}');
    await user.click(hiddenPageItem);
    await user.keyboard('{/Control}');
    await expect(library.getByText('已选 4 项 · 本页 1 · 其他页或筛选外 3')).toBeVisible();
    await user.click(library.getByRole('button', { name: /^查看所选$/ }));
    const dialog = within(await within(document.body).findByRole('dialog', { name: '查看所选素材' }));
    await expect(dialog.getAllByRole('listitem')).toHaveLength(4);
    await expect(dialog.getByRole('list', { name: '本次涉及的全部素材' })).toHaveTextContent('Panel review 01.png');
    await user.click(dialog.getByRole('button', { name: '返回素材库' }));
    await user.click(library.getByText('选择操作'));
    await user.click(within(document.body).getByRole('menuitem', { name: '批量改名' }));
    const rename = within(await within(document.body).findByRole('dialog', { name: '批量改名' }));
    await user.click(rename.getByRole('button', { name: '预览命名' }));
    await expect(await rename.findByText(/Panel review 25-4\.png/)).toBeVisible();
    await user.click(rename.getByRole('button', { name: '应用改名' }));
    await expect(await library.findByText('已重命名 4 项素材。')).toBeVisible();
  },
};

export const Dark: Story = { name: '深色素材库', args: { ...assetFixture('dark'), preferenceKey: 'asset-workfaces-dark' } };


export const FileImportAndTransparency: Story = {
  name: '文件导入与透明版本',
  args: { ...assetFixture('light'), preferenceKey: 'asset-import-transparency' },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const search = await canvas.findByRole('searchbox', { name: '搜索素材' });
    const library = within(search.closest('section')!);
    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#faf3dc"/><circle cx="12" cy="12" r="6" fill="#6526af"/></svg>'], '实文件透明化.svg', { type: 'image/svg+xml' });
    const rejected = new File(['invalid'], '无法登记.txt', { type: 'text/plain' });
    await user.upload(library.getByLabelText('选择素材文件'), [file, rejected]);
    await expect(await library.findByText(/无法登记.txt/, { selector: 'strong' })).toBeVisible();
    await user.click(library.getByRole('button', { name: '重试未导入项' }));
    await expect(await library.findByText('已导入 1 项 · 未导入 1 项')).toBeVisible();
    await user.type(search, '实文件透明化');
    await user.dblClick(await library.findByRole('option', { name: /实文件透明化/ }));
    const preview = within(await canvas.findByRole('region', { name: '素材预览' }));
    await user.click(preview.getByRole('button', { name: '去背与版本影响' }));
    await user.click(preview.getByRole('button', { name: '准备透明版本' }));
    await expect(await preview.findByRole('img', { name: '原图' })).toBeVisible();
    await expect(await preview.findByRole('img', { name: '候选透明图' })).toBeVisible();
    await user.click(preview.getByRole('button', { name: '应用透明版本' }));
    await expectPreviewVersion(preview, user, /透明/);
    await user.click(canvas.getByRole('button', { name: '撤销当前目标' }));
    await expect(await preview.findByText('当前固定版本已失效，可恢复跟随。')).toBeVisible();
    await user.click(preview.getByRole('button', { name: '恢复跟随' }));
    await expect(await preview.findByRole('img', { name: '实文件透明化.svg' })).toBeVisible();
  },
};

function impactFixture() {
  const fixture = assetFixture('light'), { seed } = fixture;
  const scene = seed.documents.find(document => document.documentId === seed.sceneDocuments[seed.ui.sceneId])!;
  const source = Object.entries(scene.files).find(([path]) => path.endsWith('.gal'))![1];
  const assetId = JSON.parse(source.match(/^changeBg (.+) @/m)![1]!).assetId;
  const index = seed.documents.find(document => 'assets/index.json' in document.files)!;
  const assets = JSON.parse(index.files['assets/index.json']!);
  assets.data.assets.find((asset: { id: string }) => asset.id === assetId).name = '版本影响原图.svg';
  index.savedFiles['assets/index.json'] = index.files['assets/index.json'] = JSON.stringify(assets);
  const resources = seed.documents.find(document => 'candidate/resources.json' in document.files)!;
  const resourceData = JSON.parse(resources.files['candidate/resources.json']!);
  resourceData.data.locations[assetId] = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#faf3dc"/><circle cx="12" cy="12" r="6" fill="#6526af"/></svg>');
  resources.savedFiles['candidate/resources.json'] = resources.files['candidate/resources.json'] = JSON.stringify(resourceData);
  const character = seed.documents.find(document => Object.keys(document.files).some(path => path.startsWith('characters/')))!;
  const path = Object.keys(character.files)[0]!;
  const data = JSON.parse(character.files[path]!);
  data.data.avatar = assetId;
  character.savedFiles[path] = character.files[path] = JSON.stringify(data);
  return { ...fixture, initialView: 'assets:' + assetId };
}

export const TransparencyImpact: Story = {
  name: '透明版本的活动替换与选择迁移',
  args: { ...impactFixture(), preferenceKey: 'asset-transparent-impact' },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const preview = within(await canvas.findByRole('region', { name: '素材预览' }));
    async function prepare() {
      await user.click(preview.getByRole('button', { name: '去背与版本影响' }));
      await user.click(preview.getByRole('button', { name: '准备透明版本' }));
      await expect(await preview.findByRole('img', { name: '候选透明图' })).toBeVisible();
    }
    await prepare();
    await user.click(preview.getByRole('radio', { name: /透明版本设为活动版本/ }));
    await user.click(preview.getByRole('button', { name: '应用透明版本' }));
    await expectPreviewVersion(preview, user, /透明 · 活动/);
    await user.click(canvas.getByRole('button', { name: '撤销当前目标' }));
    await expect(await preview.findByText('当前固定版本已失效，可恢复跟随。')).toBeVisible();
    await user.click(preview.getByRole('button', { name: '恢复跟随' }));
    await prepare();
    await user.click(preview.getByRole('radio', { name: /创建独立素材/ }));
    const reference = preview.getAllByRole('checkbox', { name: /changeBg · assetId/ })[0]!;
    await user.click(reference);
    await user.click(preview.getByRole('button', { name: '应用透明版本' }));
    await expect(await canvas.findByRole('img', { name: /版本影响原图 · 透明.png/ })).toBeVisible();
  },
};

export const ReferenceReturn: Story = {
  name: '素材引用定位与返回',
  args: { ...impactFixture(), initialView: 'assets', preferenceKey: 'asset-reference-return' },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const search = await canvas.findByRole('searchbox', { name: '搜索素材' });
    const library = within(search.closest('section')!);
    await user.type(search, '版本影响原图');
    await user.click(await library.findByRole('option', { name: /版本影响原图/ }));
    await user.click(library.getByRole('button', { name: '素材属性' }));
    const inspector = within(await canvas.findByRole('region', { name: '素材属性与引用' }));
    await user.click(inspector.getByRole('button', { name: '查看引用' }));
    await user.click((await inspector.findAllByRole('button', { name: /changeBg · assetId/ }))[0]!);
    await expect(await canvas.findByRole('listbox', { name: '场景指令' })).toBeVisible();
    await user.click(library.getByRole('button', { name: '返回 版本影响原图.svg' }));
    await expect(search).toHaveValue('版本影响原图');
    await expect(library.getByRole('option', { name: /版本影响原图/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(await inspector.findByRole('button', { name: /characters\/.+ · avatar/ }));
    await expect(await library.findByRole('button', { name: '返回 版本影响原图.svg' })).toBeVisible();
    await user.click(library.getByRole('button', { name: '返回 版本影响原图.svg' }));
    await expect(search).toHaveValue('版本影响原图');
    await user.click(library.getByText('选择操作'));
    await user.click(within(document.body).getByRole('menuitem', { name: '移除所选' }));
    const remove = within(await within(document.body).findByRole('dialog', { name: '确认移除素材' }));
    await expect(await remove.findByText(/当前引用 [1-9]/)).toBeVisible();
    await expect(remove.getByRole('button', { name: '确认移除' })).toBeDisabled();
    await user.click(remove.getByRole('button', { name: '取消' }));
  },
};
