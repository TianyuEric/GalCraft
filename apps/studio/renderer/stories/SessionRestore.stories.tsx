import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { StudioServiceStatus } from '../browser-bridge.js';
import { mountAuthoring } from '../authoring/view.js';
import { studioFixture } from './studio-fixture.js';
import '../authoring/shell.css';

function RestoredSessionWorkspace() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false), [closed, setClosed] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true, workspace: Awaited<ReturnType<typeof mountAuthoring>> | null = null;
    const { services: fixtureServices } = studioFixture('normal', 'zh-CN', 'light');
    const services: Parameters<typeof mountAuthoring>[1] = fixtureServices;
    const container = document.createElement('div'); container.id = 'app'; host.current?.append(container);
    let current: StudioServiceStatus['project'] = null;
    Object.assign(services.bridge, { service: { status: async (): Promise<StudioServiceStatus> => ({ pid: 1, origin: location.origin, state: 'ready', project: current }) } });
    const close = services.bridge.projects.close;
    services.bridge.projects.close = async (sessionId, choice) => {
      if (!current || current.sessionId !== sessionId) {
        const issue = { code: 'PROJECT_SESSION_MISSING', message: '作品会话不存在', severity: 'error' as const, owner: 'M02' as const, related: [], actions: [] };
        return { ok: false, error: issue, issues: [issue] };
      }
      const result = await close(sessionId, choice);
      if (result.ok) { current = null; setClosed(true); }
      return result;
    };
    services.closeProject = (sessionId, choice) => services.bridge.projects.close(sessionId, choice);
    void (async () => {
      const directory = 'D:\\GalCraft\\春日来信', opened = await services.bridge.projects.open(directory);
      if (!opened.ok) throw new Error(opened.error.message);
      current = { ...opened.value, directory };
      // The shared host keeps its project while the renderer is replaced.
      workspace = await mountAuthoring(container, services);
      workspace.dispose(); container.replaceChildren();
      workspace = await mountAuthoring(container, services);
      if (!active) { workspace.dispose(); return; }
      setReady(true);
    })().catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; workspace?.dispose(); container.remove(); };
  }, []);
  return <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}><div className="authoring-shell" style={{ display: 'block', padding: 12, height: 'auto', flexShrink: 0 }}><span>{ready ? '重连工作区已就绪' : '正在重连工作区'}</span><output aria-label="宿主作品会话">{closed ? '已关闭' : '已打开'}</output>{error && <p role="alert">{error}</p>}</div><div ref={host} style={{ flex: 1, minHeight: 0 }}/></div>;
}

const meta = { title: 'Product/Studio/Project/Session restore', component: RestoredSessionWorkspace, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof RestoredSessionWorkspace>;
export default meta;
export const CloseAfterRendererReload: StoryObj<typeof meta> = {
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText('重连工作区已就绪', {}, { timeout: 60000 });
    await expect(canvas.getByLabelText('宿主作品会话')).toHaveTextContent('已打开');
    await expect(canvas.getByRole('button', { name: /^保存全部$/ })).toBeEnabled();
    await userEvent.click(canvas.getByRole('menuitem', { name: /^文件$/ }));
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole('menuitem', { name: /^关闭作品$/ }));
    await expect(await canvas.findByText('打开最近作品，或创建新的作品。')).toBeVisible();
    await expect(canvas.getByLabelText('宿主作品会话')).toHaveTextContent('已关闭');
  },
};
