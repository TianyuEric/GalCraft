import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { mountAuthoring } from '../authoring/view.js';
import { componentSceneRequest } from './page-component-fixture.js';
import { productSnapshot } from './product-fixture.js';
import { studioFixture } from './studio-fixture.js';

function PageBuildingReview({ theme = 'light', initialPage = 'title' }: {
  theme?: 'light' | 'dark';
  initialPage?: 'title' | 'component-workspace';
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!host.current) return;
    const app = document.createElement('div');
    app.id = 'app';
    app.dataset.locale = 'zh-CN';
    app.dataset.theme = theme;
    host.current.append(app);
    const previousPortals = document.getElementById('studio-portals');
    const portals = previousPortals ?? document.createElement('div');
    if (!previousPortals) { portals.id = 'studio-portals'; document.body.append(portals); }
    portals.dataset.locale = 'zh-CN';
    portals.dataset.theme = theme;
    const { services } = studioFixture('normal', 'zh-CN', theme);
    let active = true;
    let workspace: Awaited<ReturnType<typeof mountAuthoring>> | undefined;
    setError('');
    void (async () => {
      const prepared = await services.bridge.templates.preparePageEdit(componentSceneRequest(productSnapshot()));
      if (!prepared.ok) throw new Error(prepared.error.message);
      const edit = await services.bridge.documents.planEdit(prepared.value.edit);
      if (!edit.ok) throw new Error(edit.error.message);
      const applied = await services.bridge.documents.applyEdit(edit.value.planId, prepared.value.edit.expected);
      if (!applied.ok) throw new Error(applied.error.message);
      const baseline = await services.bridge.documents.planSave({ kind: 'all' });
      if (!baseline.ok) throw new Error(baseline.error.message);
      const saved = await services.bridge.documents.save(baseline.value.planId);
      if (!saved.ok) throw new Error(saved.error.message);
      if (!active) return;
      workspace = await mountAuthoring(app, services);
      if (!active) { workspace.dispose(); return; }
      await workspace.navigate('pages');
      if (active && initialPage === 'component-workspace') {
        await workspace.openDocument({ kind: 'page', objectId: 'component-workspace', title: '基础组件' });
      }
    })().catch(reason => { if (active) setError(String(reason)); });
    return () => {
      active = false;
      workspace?.dispose();
      app.remove();
      if (!previousPortals) portals.remove();
    };
  }, [theme, initialPage]);
  return <>{error && <p className="product-story-error" role="alert">{error}</p>}<div ref={host} className="product-story"/></>;
}

const meta = {
  id: 'review-studio-uxf06-page-building',
  title: 'Product/Studio/Workbench/Page Building',
  component: PageBuildingReview,
  parameters: { layout: 'fullscreen', docs: { description: { component:
    '装配现行 Studio、真实页面搭建、Dock 与 Player。内存作品提供标题页、基础组件工作页及页面跳转；保存、历史和采用按夹具服务运行。磁盘、原生与远端能力沿实际宿主验证。',
  } } },
} satisfies Meta<typeof PageBuildingReview>;

export default meta;
type Story = StoryObj<typeof meta>;
export const PageBuilding: Story = {};
export const Dusk: Story = { args: { theme: 'dark' } };
export const ComponentModes: Story = { args: { initialPage: 'component-workspace' } };
