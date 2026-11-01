import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { createId, DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { Asset, CapabilityReport, Character, ConnectionConfig, SpeechServiceCatalog } from '@galcraft/contracts';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import { VoicePresetEditor } from './VoicePresetEditor.js';
import '../shell.css';
const audioAssets: Asset[] = [{ ...structuredClone(FixtureAsset), kind: 'audio', name: '角色参考样音.mp3' }];
const connection: ConnectionConfig = { id: '00000000-0000-4000-8000-000000009801', revision: 1, name: '本机 VoiceStudio（离线夹具）', model: 'omnivoice', protocol: 'voiceStudio', providerKey: 'org.galcraft.voicestudio/voiceStudio', baseUrl: 'http://voicestudio.example.invalid', auth: 'none', credentialId: null, apiKeyHeader: null, purposes: ['speech'], parameters: {}, concurrency: 1, workflowBindingId: null, serverFileRoot: null, timeoutSecByPurpose: DefaultTimeoutSecByPurpose };
const speechCatalog: SpeechServiceCatalog = {
  activeEngine: 'omnivoice', activeModel: 'k2-fsa/OmniVoice',
  engines: [
    { id: 'omnivoice', name: 'OmniVoice', available: true, reason: null, cloning: true, speed: true, design: 'tags', performance: 'none', languages: null, maxReferenceSeconds: 20, source: null },
    { id: 'kittentts', name: 'KittenTTS', available: true, reason: null, cloning: false, speed: true, design: 'none', performance: 'none', languages: ['en'], maxReferenceSeconds: null, source: null },
  ],
  models: [{ id: 'k2-fsa/OmniVoice', name: 'OmniVoice（离线发现夹具）', engines: ['omnivoice'], installed: true, source: 'https://huggingface.co/k2-fsa/OmniVoice', conditions: null }],
  voices: [
    { id: 'voice01', name: '澪 · 已保存角色声音', kind: 'profile', engine: null, language: 'English' },
    { id: 'preset:expr-voice-2-f', name: 'KittenTTS 2 f', kind: 'preset', engine: 'kittentts', language: 'en' },
  ],
  designPresets: [], transcription: { engine: 'faster-whisper', model: '离线 ASR 夹具', available: true },
};
const inspectConnection = async (connectionId: string) => ({ ok: true as const, warnings: [], value: {
  connectionId, connectionRevision: connection.revision, checkedAt: '2026-10-23T00:00:00.000Z', serviceVersion: '0.5.6', purpose: 'speech', status: 'unverified',
  inputs: [], output: 'audio', models: speechCatalog.engines.map(engine => engine.id), promptFormat: null, textVision: null,
  remote: { query: false, cancelQueued: false, cancelRunning: 'none' }, issues: [], speechCatalog,
} satisfies CapabilityReport });
function Example({ theme = 'light', empty = false }: { theme?: 'light' | 'dark'; empty?: boolean }) {
  const [value, setValue] = useState<Character['voicePresets']>(empty ? {} : { zh: { id: createId(), revision: 1, connectionId: connection.id, model: connection.model, locale: 'zh', voice: { kind: 'reference', assetId: audioAssets[0]!.id, transcript: '你终于来了，我们一起开始今天的故事吧。', locale: 'zh' }, speed: 1, emotion: null, advanced: { performanceInstruction: '保持参考声线，温柔自然。' } } });
  return <div data-theme={theme}><div id="studio-portals" data-theme={theme}/><div className="authoring-shell" style={{ display: 'block', padding: 20, height: '100vh', overflow: 'auto', minHeight: '100vh', background: 'var(--workbench-editor)' }}><div data-voice-presets={JSON.stringify(value)} style={{ maxWidth: 720, margin: 'auto' }}><VoicePresetEditor value={value} change={setValue} assets={audioAssets} connections={empty ? [] : [connection]} locale="zh-CN" inspectConnection={inspectConnection}/></div></div></div>;
}
const meta = { title: 'Product/Studio/Authoring/Reference Voice', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Editor: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const MissingConnection: Story = { args: { empty: true } };
export const ServiceVoiceDiscovery: Story = { args: { theme: 'light' }, play: async ({ canvas, canvasElement }) => {
  await userEvent.click(canvas.getByRole('button', { name: '读取实际引擎与声音' }));
  const engine = await canvas.findByRole('combobox', { name: '模型 / 引擎' });
  await userEvent.click(canvas.getByRole('combobox', { name: '音色来源' }));
  await userEvent.click(await canvas.findByRole('option', { name: '服务声音标识' }));
  await userEvent.click(engine);
  await userEvent.click(await canvas.findByRole('option', { name: /^KittenTTS$/ }));
  await userEvent.click(canvas.getByRole('combobox', { name: '服务声音' }));
  await expect(await canvas.findByRole('option', { name: 'KittenTTS 2 f · en' })).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await userEvent.click(engine);
  await userEvent.click(await canvas.findByRole('option', { name: /^OmniVoice$/ }));
  await userEvent.click(canvas.getByRole('combobox', { name: '服务声音' }));
  await expect(canvas.queryByRole('option', { name: 'KittenTTS 2 f · en' })).toBeNull();
  await userEvent.click(await canvas.findByRole('option', { name: '澪 · 已保存角色声音 · English' }));
  await waitFor(() => {
    const saved = JSON.parse(canvasElement.querySelector('[data-voice-presets]')!.getAttribute('data-voice-presets')!);
    expect(saved.zh).toMatchObject({ connectionId: connection.id, model: 'omnivoice', locale: 'zh', voice: { kind: 'id', value: 'voice01' } });
  });
} };
