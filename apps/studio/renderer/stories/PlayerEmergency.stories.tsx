import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createId, StartupSequenceSchema, type OfficialAction, type PlayerHost } from '@galcraft/contracts';
import { mountPlayer, PreviewHost, type PlayerMount } from '@galcraft/player-ui';
import { components } from '@galcraft/templates';
import { productSnapshot, productMedia } from './product-fixture.js';
import '@galcraft/player-ui/player.css';

function EmergencyPlayer({ appearance = 'paper', blank = false }: { appearance?: 'paper' | 'night'; blank?: boolean }) {
  const container = useRef<HTMLDivElement>(null), mounted = useRef<PlayerMount | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = document.createElement('div'); element.className = 'emergency-story-player'; container.current!.append(element);
    Object.assign(element.style, { width: '100%', height: '100%' });
    const snapshot = productSnapshot('standard', appearance), scene = snapshot.scenes[0]!, base = scene.instructions.find(instruction => instruction.opcode === 'say')!;
    snapshot.project.player.autosave = false;
    const variableId = createId(); snapshot.variables.push({ id: variableId, name: '回答', type: 'string', scope: 'progress', initial: '' });
    delete scene.scene.presentation;
    scene.instructions = [{ ...base, statementId: createId(), opcode: 'getUserInput', args: { prompt: '留下你的回答', variableId, maxLength: 80, defaultText: '', allowEmpty: false } }, { ...base, statementId: createId(), args: { speaker: { kind: 'narrator' }, text: '回到阅读位置，回答与进度保持。' } }];
    const emergency = snapshot.template.pages.find(page => page.key === 'emergency')!;
    if (blank) emergency.root.children = [];
    else {
      const restore = components(emergency.root).find(component => component.part === 'emergency.restore')!;
      restore.content = { text: '恢复阅读' }; restore.layout.x = { unit: 'px', value: 96 }; restore.layout.y = { unit: 'px', value: 96 };
      const commands: { label: string; action: OfficialAction }[] = [{ label: '推进剧情', action: { kind: 'advance' } }, { label: '快速存档', action: { kind: 'quickSave' } }, { label: '读取存档', action: { kind: 'quickLoad' } }, { label: '返回标题', action: { kind: 'returnTitle' } }];
      for (const [index, command] of commands.entries()) { const component = structuredClone(restore); component.id = createId(); component.content = { text: command.label }; component.layout.y = { unit: 'px', value: 184 + index * 88 }; component.interactions = [{ event: 'click', actions: [{ kind: 'official', action: command.action }] }]; emergency.root.children.push(component); }
    }
    const media = { ...productMedia };
    const resources: PlayerHost['resources'] = { resolve: async (assetId, variantId) => {
      const source = media[assetId] ?? '';
      return { ok: true, value: { uri: source ? new URL(source, window.location.href).href : '', mime: snapshot.assets.find(asset => asset.assetId === assetId)?.kind === 'audio' ? 'audio/ogg' : 'image/png', bytes: 1, rangeSupported: true, release() {} }, warnings: [] };
    } };
    const host = new PreviewHost({ projectId: snapshot.projectId, kind: 'sample', instance: createId() }, resources, element);
    let active = true, dispose: (() => void) | undefined;
    void mountPlayer(element, host, snapshot, host.domain).then(async result => {
      if (!result.ok) throw new Error(result.error.message);
      if (!active) { result.value.view.dispose(); host.dispose(); return; }
      mounted.current = result.value; dispose = () => { result.value.view.dispose(); host.dispose(); };
      Object.assign(element, { emergencyFixture: { mounted: result.value, snapshot, media } });
      element.dataset.emergencyReady = 'true'; element.focus();
    }).catch(error => { if (active) setError(String(error)); });
    return () => { active = false; mounted.current = null; element.remove(); queueMicrotask(() => dispose?.()); };
  }, [appearance, blank]);
  const opening = () => { const player = mounted.current; if (!player) return; const display = { ...productSnapshot().project.display, startupSequence: StartupSequenceSchema.parse({ background: '#000000', clips: [{ id: createId(), kind: 'text', name: '开屏', text: { 'zh-CN': '一封来信' }, holdMs: 8000 }] }) }; void player.view.previewStartup('startup', display); };
  return <><nav aria-label="回避验收场景"><button onClick={() => void mounted.current?.view.newGame()}>等待输入</button><button onClick={opening}>开屏演出</button><button onClick={() => mounted.current?.view.setEmergency(true)}>显示回避页</button></nav>{error && <p role="alert">{error}</p>}<div ref={container} style={{ height: 'calc(100vh - 40px)' }} /></>;
}

const meta = { title: 'Product/Player/Emergency', component: EmergencyPlayer, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof EmergencyPlayer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AuthoredPage: Story = {};
export const AuthoredPageNight: Story = { args: { appearance: 'night' } };
export const BlankPage: Story = { args: { blank: true } };
