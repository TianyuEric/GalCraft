import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createId } from '@galcraft/contracts';
import { readTemplateDocuments, templateEdit } from '@galcraft/templates';
import { mountAuthoring } from './../authoring/view.js';
import { settingsRefinementFixture } from './settings-refinement-fixture.js';
import { studioFixture } from './studio-fixture.js';

function WorkbenchFormDetails({ surface = 'styles', theme = 'light' }: {
  surface?: 'styles' | 'startup' | 'properties';
  theme?: 'light' | 'dark';
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!host.current) return;
    const app = document.createElement('div');
    app.id = 'app'; app.dataset.theme = theme; app.dataset.locale = 'zh-CN';
    host.current.append(app);
    const existingPortals = document.getElementById('studio-portals');
    const portals = existingPortals ?? document.createElement('div');
    if (!existingPortals) { portals.id = 'studio-portals'; document.body.append(portals); }
    portals.dataset.theme = theme; portals.dataset.locale = 'zh-CN';
    let active = true;
    let workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
    setError('');
    void (async () => {
      const { services } = surface === 'startup' ? await settingsRefinementFixture(theme, () => {}) : studioFixture('normal', 'zh-CN', theme);
      if (!active) return;
      if (surface === 'styles') {
        const documents = services.bridge.documents;
        const current = await documents.list();
        if (!current.ok) throw new Error(current.error.message);
        const template = readTemplateDocuments(current.value);
        const page = template.pages.find(item => item.key === 'title')!, styleId = createId(current.value);
        template.styles.push({
          id: styleId, name: '整页夜雨', scope: { pageId: page.id, componentId: null }, language: 'css', activation: 'page',
          sourcePath: `ui/styles/${styleId}.source.css`, sourceRevision: 0, compiledPath: null, compiledSourceRevision: null, assets: [], issues: [],
        });
        const edit = await documents.planEdit(templateEdit(current.value, template, '夹具样式'));
        if (!edit.ok) throw new Error(edit.error.message);
        const applied = await documents.applyEdit(edit.value.planId, edit.value.input.expected);
        if (!applied.ok) throw new Error(applied.error.message);
        const plan = await documents.planSave({ kind: 'all' });
        if (!plan.ok) throw new Error(plan.error.message);
        const saved = await documents.save(plan.value.planId);
        if (!saved.ok) throw new Error(saved.error.message);
      }
      if (!active) return;
      workspace = await mountAuthoring(app, services);
      if (!active) { workspace.dispose(); return; }
      if (surface === 'startup') await workspace.openDocument({ kind: 'startup' });
      else if (surface === 'styles') await workspace.navigate('pages');
    })().catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; workspace?.dispose(); app.remove(); if (!existingPortals) portals.remove(); };
  }, [surface, theme]);
  return <>{error && <p role="alert">{error}</p>}<div className="product-story" ref={host}/></>;
}

const meta = {
  id: 'review-studio-uxf06-workbench-form-details',
  title: 'Product/Studio/Workbench/Workbench Form Details',
  component: WorkbenchFormDetails,
  args: { surface: 'styles', theme: 'light' },
  parameters: { layout: 'fullscreen', docs: { description: { component:
    '使用 Studio 工作台、页面搭建与启动编辑器。内存作品提供正式模板、整页样式和开屏片段，编辑与历史经过原工作区接口。样式编译由实际 Studio 宿主验证。',
  } } },
} satisfies Meta<typeof WorkbenchFormDetails>;

export default meta;
type Story = StoryObj<typeof meta>;
export const StyleTarget: Story = {
  parameters: { docs: { description: { story: '打开样式，查看页面或组件、样式名称和生效方式。画布中选中设置按钮，在图片槽与属性来源展开属性来源，打开「整页夜雨」，对照中央标签及整页范围。' } } },
};
export const StyleTargetDusk: Story = { ...StyleTarget, args: { theme: 'dark' } };
export const StartupHistory: Story = {
  args: { surface: 'startup', theme: 'dark' },
  parameters: { docs: { description: { story: '打开开屏片段，清空停留时长。关闭并保留修改后从工作面重开，核对原选区和输入。撤销、重做和保存从工作台执行。' } } },
};
export const PropertySource: Story = {
  args: { surface: 'properties' },
  parameters: { docs: { description: { story: '从对象属性顶部查看来源，选择指令并固定来源。显示舞台，打开页面搭建，核对舞台以一条提示引导回场景。' } } },
};
