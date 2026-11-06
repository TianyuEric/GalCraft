import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { Scene } from '@galcraft/contracts';
import { prepareAuthoringEdit } from '@galcraft/documents/authoring';
import type { CandidateHost } from '../../../review/studio-candidate/adapters/candidate-host.js';
import { CandidateStudio } from '../../../review/studio-candidate/CandidateStudio.js';
import { candidateFixture } from './fixtures.js';

const meta = { title: 'Review/Studio/候选 Studio/剧情结构与变量', component: CandidateStudio, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof CandidateStudio>;
export default meta;
type Story = StoryObj<typeof meta>;

function referencedSceneFixture() {
  const fixture = candidateFixture();
  const [caller, target] = Object.keys(fixture.seed.sceneDocuments);
  const path = `scenes/${caller}/script.gal`;
  const source = fixture.seed.documents.find(document => path in document.files)!;
  source.files[path] = source.savedFiles[path] = `${source.files[path]}callScene {sceneId:"${target}",parameters:{}} @QoneA1;\n`;
  fixture.seed.ui.sceneId = target!;
  return fixture;
}

export const ReferencedScene: Story = {
  name: '跨场景调用与移除影响',
  args: { ...referencedSceneFixture(), preferenceKey: 'structure-references', initialView: 'structure' },
};

const fixture = candidateFixture();
let conflictHost: CandidateHost | undefined;
export const CrossVersion: Story = {
  name: '保留输入并审阅跨版本字段',
  args: { ...fixture, preferenceKey: 'structure-cross-version', initialView: 'structure',
    createServices(host) { conflictHost = host; return fixture.createServices(host); } },
  play: async ({ canvas, canvasElement }) => {
    const user = userEvent.setup();
    const workspace = within(await canvas.findByRole('region', { name: '剧情结构与变量' }));
    const name = workspace.getByRole('textbox', { name: '名称' });
    await user.clear(name);
    await user.type(name, '作者保留的场景名');
    const host = conflictHost!;
    const prepared = prepareAuthoringEdit(host.list(), {
      op: 'scene.update', id: fixture.seed.ui.sceneId, changes: { name: '工作区的新场景名' },
    });
    if (!prepared.ok) throw new Error(prepared.error.message);
    const plan = await host.bridge.documents.planEdit(prepared.value);
    if (!plan.ok) throw new Error(plan.error.message);
    const applied = await host.bridge.documents.applyEdit(plan.value.planId, prepared.value.expected);
    if (!applied.ok) throw new Error(applied.error.message);
    await expect(name).toHaveValue('作者保留的场景名');
    await user.click(workspace.getByRole('button', { name: '应用名称' }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: '审阅冲突字段' });
    await expect(within(dialog).getByText('工作区的新场景名')).toBeVisible();
    await expect(within(dialog).getByText('作者保留的场景名')).toBeVisible();
  },
};

const legacy = candidateFixture();
const legacyPath = `scenes/${legacy.seed.ui.sceneId}/scene.json`;
const legacyDocument = legacy.seed.documents.find(document => legacyPath in document.files)!;
const legacyScene = JSON.parse(legacyDocument.files[legacyPath]!) as { data: Scene };
legacyScene.data.locals = [
  { id: 'Qzero1', name: '零值参数', type: 'number', scope: 'local', initial: 1 },
  { id: 'Qnone1', name: '无默认参数', type: 'number', scope: 'local', initial: 2 },
];
const legacyParameters = [
  { variableId: 'Qzero1', required: true, defaultValue: 0 },
  { variableId: 'Qnone1', required: false, defaultValue: null },
];
legacyScene.data.parameters = legacyParameters;
legacyDocument.files[legacyPath] = legacyDocument.savedFiles[legacyPath] = JSON.stringify(legacyScene);
let legacyHost: CandidateHost | undefined;

export const LegacyDefaults: Story = {
  name: '保留已有参数的默认值和兼容标记',
  args: { ...legacy, preferenceKey: 'structure-legacy-defaults', initialView: 'structure',
    createServices(host) { legacyHost = host; return legacy.createServices(host); } },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const workspace = within(await canvas.findByRole('region', { name: '剧情结构与变量' }));
    const declarations = within(workspace.getByRole('region', { name: '局部变量与子场景接口' }));
    const withDefault = within(declarations.getByRole('group', { name: '零值参数' }));
    const withoutDefault = within(declarations.getByRole('group', { name: '无默认参数' }));
    await expect(withDefault.getByRole('combobox', { name: '参数形式' })).toHaveTextContent('可省略，使用默认值');
    await expect(withDefault.getByRole('textbox', { name: '省略时的默认值' })).toHaveValue('0');
    await expect(withoutDefault.getByRole('combobox', { name: '参数形式' })).toHaveTextContent('必须传入');
    await user.click(declarations.getByRole('combobox', { name: '返回类型' }));
    await user.click(declarations.getByRole('option', { name: '数字' }));
    await user.click(declarations.getByRole('button', { name: '应用声明' }));
    await expect(await workspace.findByRole('status')).toHaveTextContent('已应用到工作区');
    const saved = legacyHost!.list().find(document => legacyPath in document.files)!;
    const { data } = JSON.parse(saved.files[legacyPath]!) as { data: Scene };
    await expect(data.returns).toBe('number');
    await expect(data.parameters).toEqual(legacyParameters);
  },
};
