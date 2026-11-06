import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { fixtureId } from '@galcraft/contracts/fixtures';
import { CandidateStudio } from '../../../review/studio-candidate/CandidateStudio.js';
import { candidateFixture } from './fixtures.js';

const meta = { title: 'Review/Studio/候选 Studio/剧情导航与语义查找', component: CandidateStudio, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof CandidateStudio>;
export default meta;
type Story = StoryObj<typeof meta>;

function withInterleavedCommands() {
  const fixture = candidateFixture(), sceneId = fixture.seed.ui.sceneId;
  const path = `scenes/${sceneId}/script.gal`, document = fixture.seed.documents.find(item => path in item.files)!;
  const lines = document.files[path]!.trimEnd().split('\n'), first = lines.findIndex(line => line.startsWith('say '));
  lines.splice(first + 1, 0, `wait {"durationMs":80} @${fixtureId(0xcfa0)};`);
  lines.push(`bgm {"op":"stop"} @${fixtureId(0xcfa1)};`);
  document.files[path] = document.savedFiles[path] = lines.join('\n') + '\n';
  return { ...fixture, initialView: `writing:${sceneId}` };
}

export const InterleavedCommands: Story = {
  name: '文稿中的指令依源码排序',
  args: { ...withInterleavedCommands(), preferenceKey: 'navigation-ordered-writing' },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const editor = await canvas.findByRole('textbox', { name: /文稿正文/ });
    const marker = await within(editor).findByRole('button', { name: /定位指令 wait/ });
    const row = marker.parentElement!;
    await expect(row.previousElementSibling).toHaveAttribute('data-r0-line');
    await expect(row.nextElementSibling).toHaveAttribute('data-r0-line');
    await expect(row).toHaveAttribute('contenteditable', 'false');
    await user.click(marker);
    const list = await canvas.findByRole('listbox', { name: '场景指令' });
    await expect(list.querySelector('[data-command="wait"]')).toHaveAttribute('aria-selected', 'true');
  },
};

export const OutlineCreation: Story = {
  name: '剧情目录创建并定位',
  args: { ...candidateFixture(), preferenceKey: 'navigation-outline-create' },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const outline = within(await canvas.findByRole('complementary', { name: '剧情目录' }));
    await user.click(outline.getByRole('button', { name: '新建章节' }));
    const chapter = within(await canvas.findByRole('form', { name: '新建章节' }));
    await user.type(chapter.getByLabelText('名称'), '车站余音');
    await user.click(chapter.getByRole('button', { name: '创建' }));
    await expect(await canvas.findByRole('textbox', { name: '名称' })).toHaveValue('车站余音');
    await user.click(await outline.findByRole('button', { name: '车站余音：新建场景' }));
    const scene = within(await canvas.findByRole('form', { name: '新建场景' }));
    await user.type(scene.getByLabelText('名称'), '旅人回信');
    await user.click(scene.getByRole('button', { name: '创建' }));
    await expect(await canvas.findByRole('button', { name: '添加第一句' })).toBeVisible();
    await user.click(outline.getByRole('button', { name: '旅人回信：新建局部变量' }));
    const variable = within(await canvas.findByRole('form', { name: '新建局部变量' }));
    await user.type(variable.getByLabelText('名称'), '回信次数');
    await user.click(variable.getByRole('button', { name: '创建' }));
    await expect(await canvas.findByDisplayValue('回信次数')).toBeVisible();
    await user.click(outline.getByRole('button', { name: '新建作品变量' }));
    const global = within(await canvas.findByRole('form', { name: '新建作品变量' }));
    await user.type(global.getByLabelText('名称'), '旅人来过');
    await user.click(global.getByRole('combobox', { name: '作用域' }));
    await user.click(global.getByRole('option', { name: '长期变量' }));
    await user.click(global.getByRole('combobox', { name: '类型' }));
    await user.click(global.getByRole('option', { name: '布尔' }));
    await user.click(global.getByRole('combobox', { name: '初值' }));
    await user.click(global.getByRole('option', { name: '是' }));
    await user.click(global.getByRole('button', { name: '创建' }));
    await expect(await canvas.findByDisplayValue('旅人来过')).toBeVisible();
  },
};

export const SemanticLocation: Story = {
  name: '查找 BGM 指令并返回文稿',
  args: { ...withInterleavedCommands(), preferenceKey: 'navigation-semantic-search' },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const editor = await canvas.findByRole('textbox', { name: /文稿正文/ });
    await user.click(editor.querySelector<HTMLElement>('[data-r0-body]')!);
    const outline = within(await canvas.findByRole('complementary', { name: '剧情目录' }));
    await user.click(outline.getByRole('button', { name: '语义查找' }));
    const search = within(await canvas.findByRole('complementary', { name: '语义查找' }));
    await user.click(search.getByRole('combobox', { name: '查找类型' }));
    await user.click(search.getByRole('option', { name: 'BGM' }));
    await user.click(search.getByRole('combobox', { name: '查找范围' }));
    await user.click(search.getByRole('option', { name: /^当前场景/ }));
    await user.click(search.getByRole('button', { name: /^查找$/ }));
    await user.click(await search.findByRole('button', { name: /停止 BGM/ }));
    const list = await canvas.findByRole('listbox', { name: '场景指令' });
    await expect(list.querySelector('[data-command="bgm"]')).toHaveAttribute('aria-selected', 'true');
    await user.click(search.getByRole('button', { name: '返回原位置' }));
    await expect(await canvas.findByRole('textbox', { name: /文稿正文/ })).toBeVisible();
  },
};

function withFindMatches() {
  const fixture = withInterleavedCommands(), active = fixture.seed.ui.sceneId;
  for (const sceneId of Object.keys(fixture.seed.sceneDocuments)) {
    const path = `scenes/${sceneId}/script.gal`, document = fixture.seed.documents.find(item => path in item.files)!;
    let remaining = sceneId === active ? 2 : 1;
    const text = document.files[path]!.replace(/^say (\{.+\}) (@[a-zA-Z0-9]+;)$/gm, (statement, fields, id) => {
      if (remaining-- <= 0) return statement;
      const dialogue = JSON.parse(fields) as { text: string };
      dialogue.text += ' 远航信号灯。';
      return `say ${JSON.stringify(dialogue)} ${id}`;
    });
    document.files[path] = document.savedFiles[path] = text;
  }
  return fixture;
}

export const WritingFind: Story = {
  name: '文稿 Ctrl+F、替换和撤销',
  args: { ...withFindMatches(), preferenceKey: 'navigation-writing-find' },
  play: async ({ canvas }) => {
    const user = userEvent.setup();
    const editor = await canvas.findByRole('textbox', { name: /文稿正文/ }, { timeout: 10_000 });
    editor.focus();
    await expect(editor).toHaveFocus();
    await user.keyboard('{Control>}f{/Control}');
    const finder = within(await canvas.findByRole('search', { name: '当前场景文稿查找' }, { timeout: 5000 }));
    const query = finder.getByRole('searchbox', { name: '查找文字' });
    await expect(query).toHaveFocus();
    await user.type(query, '远航信号灯');
    await expect(finder.getByRole('status')).toHaveTextContent('1 / 2');
    await user.keyboard('{Enter}');
    await expect(finder.getByRole('status')).toHaveTextContent('2 / 2');
    await user.click(finder.getByRole('button', { name: '上一个匹配' }));
    await expect(finder.getByRole('status')).toHaveTextContent('1 / 2');
    await user.type(finder.getByRole('textbox', { name: '替换文字' }), '夜航灯');
    await user.click(finder.getByRole('button', { name: '替换当前' }));
    await expect(finder.getByRole('status')).toHaveTextContent('1 / 1');
    const undo = within(editor.closest('.gc-candidate-writing-view') as HTMLElement).getByRole('button', { name: /^撤销$/ });
    await user.click(undo);
    await waitFor(() => expect(finder.getByRole('status')).toHaveTextContent('1 / 2'));
    await user.click(finder.getByRole('button', { name: '替换全部' }));
    await expect(finder.getByRole('status')).toHaveTextContent('无结果');
    await expect(within(editor).getAllByText(/夜航灯/)).toHaveLength(2);
    await user.click(undo);
    await waitFor(() => expect(within(editor).getAllByText(/远航信号灯/)).toHaveLength(2));
    await user.click(query);
    await user.keyboard('{Escape}');
    await expect(canvas.queryByRole('search', { name: '当前场景文稿查找' })).not.toBeInTheDocument();
    await expect(editor).toHaveFocus();
  },
};
