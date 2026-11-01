import { useEffect, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AuthoringServices } from '../authoring/controller.js';
import '../authoring/workspace.css';
import { studioFixture } from './studio-fixture.js';
import { MiniStage } from '../authoring/mini-stage.js';
import { DebugRouteIntent } from '../authoring/debug-route-intent.js';
import { startPlaytest } from '../authoring/playtest.js';
function Route() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const services: AuthoringServices = studioFixture('normal', 'zh-CN', 'light').services, intent = new DebugRouteIntent(), host = root.current!;
    let valid = true, generation = 0;
    const compile = services.compilePreview!;
    services.compilePreview = async () => { const result = await compile(); return result.ok && !valid ? { ...result, value: { ...result.value, current: false, issues: [{ code: 'TEST_SYNTAX', message: '语法错误', owner: 'M03', severity: 'error', related: [], actions: [] }] } } : result; };
    const stage = new MiniStage(services, undefined, 'zh-CN', intent); host.append(stage.root);
    const controls = document.createElement('div'); host.prepend(controls);
    const add = (text: string, run: () => void) => { const button = document.createElement('button'); button.textContent = text; button.onclick = run; controls.append(button); };
    let closed = false, playtest: Awaited<ReturnType<typeof startPlaytest>> | undefined;
    void compile().then(result => { if (!result.ok || !result.value.snapshot || closed) return;
      const scene = result.value.snapshot.scenes[1]!, target = { sceneId: scene.scene.id, statementId: scene.instructions[0]!.statementId };
      add('准备唯一可达目标', () => { valid = true; stage.update(String(++generation), target); });
      add('模拟当前语法错误', () => { valid = false; stage.update(String(++generation), target); });
      add('从同一目标试玩', () => { valid = true; void startPlaytest(host, services, target, () => {}, 'zh-CN', intent).then(value => { playtest = value; }); });
    });
    return () => { closed = true; playtest?.close(); stage.dispose(); host.replaceChildren(); };
  }, []);
  return <><div id="studio-portals" data-theme="light" lang="zh-CN"/><div ref={root} className="route-story" style={{ width: 'min(900px, 100%)', minHeight: 640 }}/></>;
}
const meta = { title: 'Product/Studio/Authoring/Route editor', component: Route, parameters: { layout: 'padded' } } satisfies Meta<typeof Route>;
export default meta;
export const UniqueAndLastValid: StoryObj<typeof meta> = {};
