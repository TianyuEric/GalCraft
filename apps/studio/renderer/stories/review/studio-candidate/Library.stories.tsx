import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { CandidateStudio } from '../../../review/studio-candidate/CandidateStudio.js';
import type { CandidateServicesFactory } from '../../../review/studio-candidate/application/session.js';
import { candidateFixture } from './fixtures.js';

const meta = {
  title: 'Review/Studio/候选 Studio/集成状态/作品库与维护',
  component: CandidateStudio,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CandidateStudio>;

export default meta;
type Story = StoryObj<typeof meta>;

const teaching = candidateFixture();
const title = teaching.seed.presentation.name;

export const Registration: Story = {
  name: '固定、路径修复与重新登记',
  args: { ...teaching, preferenceKey: 'library-registration', initialProjectState: 'center' },
  play: async ({ canvas }) => {
    const search = await canvas.findByRole('searchbox', { name: '搜索作品' });
    await userEvent.type(search, '匹配不到的名称');
    await expect(canvas.getByText('没有匹配的作品')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '清除搜索' }));
    await userEvent.click(canvas.getByRole('button', { name: '固定 ' + title }));
    await expect(within(canvas.getByRole('region', { name: '固定作品' })).getByText(title)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '取消固定 ' + title }));
    await expect(within(canvas.getByRole('region', { name: '最近作品' })).getByText(title)).toBeVisible();
    await userEvent.click(canvas.getByText('审核辅助', { exact: true }));
    await userEvent.click(canvas.getByRole('button', { name: '标记当前路径失效' }));
    await expect(canvas.getByText('路径失效', { exact: true })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '修复路径' }));
    const repair = within(await canvas.findByRole('dialog', { name: '修复作品路径' }));
    const directory = '/candidate/works/' + teaching.seed.presentation.id + '-moved';
    await userEvent.type(repair.getByRole('textbox', { name: '新作品目录' }), directory);
    await userEvent.click(repair.getByRole('button', { name: '验证并修复' }));
    await expect(await canvas.findByText(directory)).toBeVisible();
    const menu = canvas.getByLabelText(title + '的作品操作');
    await userEvent.click(menu);
    await userEvent.click(canvas.getByRole('menuitem', { name: '移除登记' }));
    await userEvent.click(within(await canvas.findByRole('dialog', { name: '移除作品登记' })).getByRole('button', { name: '移除登记' }));
    await expect(await canvas.findByText('作品库为空')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '登记作品' }));
    const register = within(await canvas.findByRole('dialog', { name: '登记作品' }));
    await userEvent.type(register.getByRole('textbox', { name: '已有作品目录' }), directory);
    await userEvent.click(register.getByRole('button', { name: '登记' }));
    await expect(within(await canvas.findByRole('region', { name: '最近作品' })).getByText(title)).toBeVisible();
    await userEvent.click(canvas.getByText('审核辅助', { exact: true }));
  },
};

const creationRetryCatalog: CandidateServicesFactory = host => {
  const services = teaching.createServices(host);
  const engines = services.bridge.engines!;
  let first = true;
  return {
    ...services,
    bridge: { ...services.bridge, engines: {
      ...engines,
      listCreationVersions: async () => {
        if (!first) return engines.listCreationVersions();
        first = false;
        const error = { code: 'ENGINE_UNAVAILABLE', severity: 'error' as const, owner: 'M11' as const,
          message: '引擎目录暂时无法读取。', related: [], actions: ['retry' as const] };
        return { ok: false, error, issues: [error] };
      },
    } },
  };
};

export const CreationRetry: Story = {
  name: '新建作品失败保留与重试',
  args: { ...teaching, createServices: creationRetryCatalog, preferenceKey: 'library-creation', initialProjectState: 'center' },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByText('审核辅助', { exact: true }));
    await userEvent.click(canvas.getByRole('button', { name: '下一次新建失败' }));
    await userEvent.click(canvas.getByRole('button', { name: '新建作品' }));
    const form = within(await canvas.findByRole('dialog', { name: '新建作品' }));
    const name = form.getByRole('textbox', { name: '新作品名称' });
    const template = form.getByRole('combobox', { name: /作品模板/ });
    const width = form.getByRole('spinbutton', { name: '画布宽度（px）' });
    const path = form.getByRole('textbox', { name: '作品目录' });
    await expect(await form.findByText('引擎目录暂时无法读取。')).toBeVisible();
    await expect(form.getByRole('button', { name: '创建并打开' })).toBeDisabled();
    await userEvent.type(name, '候选新作');
    await userEvent.click(form.getByRole('button', { name: '重试读取引擎' }));
    await waitFor(() => expect(form.getByRole('combobox', { name: '引擎版本' })).toHaveTextContent('0.1.0'));
    await expect(name).toHaveValue('候选新作');
    await userEvent.click(template);
    await userEvent.click(form.getByRole('option', { name: '丰富' }));
    await userEvent.clear(width);
    await userEvent.type(width, '1440');
    await userEvent.type(path, '/candidate/works/候选新作');
    await userEvent.click(form.getByRole('button', { name: '创建并打开' }));
    const alert = await form.findByRole('alert');
    await expect(alert).toHaveTextContent('本次创建失败');
    await expect(alert).toHaveFocus();
    await expect(name).toHaveValue('候选新作');
    await expect(template).toHaveTextContent('丰富');
    await expect(width).toHaveValue(1440);
    await expect(path).toHaveValue('/candidate/works/候选新作');
    await userEvent.click(form.getByRole('button', { name: '创建并打开' }));
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: '新建作品' })).not.toBeInTheDocument());
    await expect(await canvas.findByRole('button', { name: '候选新作' })).toBeVisible();
  },
};

const dark = candidateFixture('balanced', 'dark');
const restoreCatalog: CandidateServicesFactory = host => {
  const services = dark.createServices(host);
  const engines = services.bridge.engines!;
  let first = true;
  return {
    ...services,
    bridge: { ...services.bridge, engines: {
      ...engines,
      listCreationVersions: async () => {
        if (!first) return engines.listCreationVersions();
        first = false;
        return { ok: true, value: [], warnings: [] };
      },
    } },
  };
};

export const RestoreTarget: Story = {
  name: '恢复缺依赖、重查与取消',
  args: { ...dark, createServices: restoreCatalog, preferenceKey: 'library-restore', initialProjectState: 'recovery' },
  play: async ({ canvas }) => {
    const trigger = await canvas.findByLabelText(title + '的作品操作');
    await userEvent.click(trigger);
    await userEvent.click(canvas.getByRole('menuitem', { name: '恢复备份' }));
    const dialog = within(await canvas.findByRole('dialog', { name: '恢复备份' }));
    await userEvent.click(dialog.getByRole('combobox', { name: '恢复目标' }));
    await userEvent.click(dialog.getByRole('option', { name: '恢复为独立副本' }));
    await userEvent.type(dialog.getByRole('textbox', { name: '恢复副本目录' }), '/candidate/works/春灯恢复副本');
    await userEvent.click(dialog.getByRole('button', { name: '检查恢复目标' }));
    await expect(await dialog.findByText('缺少以下依赖')).toBeVisible();
    await expect(dialog.getByText('引擎 0.1.0')).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: '重新检查依赖' }));
    await expect(await dialog.findByText(/独立作品身份.*备份依赖检查通过/)).toBeVisible();
    await userEvent.click(dialog.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(canvas.queryByRole('dialog', { name: '恢复备份' })).not.toBeInTheDocument();
  },
};

const creationCatalog: CandidateServicesFactory = host => {
  const services = teaching.createServices(host);
  return {
    ...services,
    bridge: { ...services.bridge, engines: {
      ...services.bridge.engines!,
      listCreationVersions: async () => ({ ok: true, value: ['0.1.0', '0.1.1'], warnings: [] }),
    } },
  };
};

export const Maintenance: Story = {
  name: '迁移回退、提交重试与草稿恢复',
  args: { ...teaching, createServices: creationCatalog, preferenceKey: 'library-maintenance', initialView: 'maintenance', showIntegration: true },
  play: async ({ canvas }) => {
    const workface = within(await canvas.findByRole('region', { name: '作品维护' }));
    await waitFor(() => expect(workface.getByRole('combobox', { name: '目标引擎' })).toHaveTextContent(/^0\.1\.1$/));
    await userEvent.type(workface.getByRole('textbox', { name: '迁移副本目录' }), '/candidate/works/engine-migration');
    await userEvent.click(workface.getByRole('button', { name: '准备并验证副本' }));
    await expect(await workface.findByText('0.1.0 → 0.1.1')).toBeVisible();
    await userEvent.click(workface.getByRole('button', { name: '回退迁移计划' }));
    await expect(await workface.findByText(/已回退本次准备/)).toBeVisible();
    await userEvent.click(workface.getByRole('button', { name: '准备并验证副本' }));
    await userEvent.click(await canvas.findByRole('button', { name: '下一次迁移提交失败' }));
    await userEvent.click(await workface.findByRole('button', { name: '提交迁移副本' }));
    await expect(await workface.findByRole('alert')).toHaveTextContent('迁移计划保留');
    await userEvent.click(workface.getByRole('button', { name: '提交迁移副本' }));
    await expect(await workface.findByText('迁移副本已登记到作品库。')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '准备崩溃草稿审核输入' }));
    await userEvent.click(await workface.findByRole('button', { name: '恢复草稿' }));
    await expect(await workface.findByText('草稿已恢复到当前工作会话。')).toBeVisible();
  },
};
