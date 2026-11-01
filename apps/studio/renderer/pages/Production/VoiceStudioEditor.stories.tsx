import { useEffect, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, waitFor } from 'storybook/test';
import { mountVoiceStudioEditor } from '@galcraft/official-voicestudio/editor';
import { operations } from '@galcraft/official-voicestudio/definition';
import type { CapabilityReport, SpeechServiceCatalog } from '@galcraft/contracts';
import '../../authoring/shell.css';

const catalog: SpeechServiceCatalog = { activeEngine: 'omnivoice', activeModel: 'k2-fsa/OmniVoice', engines: [{ id: 'omnivoice', name: 'OmniVoice', available: true, reason: null,
  cloning: true, speed: true, design: 'tags', performance: 'none', languages: null, maxReferenceSeconds: 20, source: null }],
  models: [{ id: 'k2-fsa/OmniVoice', name: 'OmniVoice (Storybook discovery fixture)', engines: ['omnivoice'], installed: true, source: 'https://huggingface.co/k2-fsa/OmniVoice', conditions: '请检查实际模型卡中的使用条件。' }],
  voices: [{ id: 'demo0001', name: '已保存角色声音', kind: 'profile', engine: null, language: 'English' }],
  designPresets: [{ id: 'narrator', name: 'Narrator', instruction: 'middle-aged, low pitch', language: 'English' }],
  transcription: { engine: 'faster-whisper', model: 'actual-asr-model (Storybook fixture)', available: true } };
const discoveryResolvers = new WeakMap<HTMLElement, () => void>();
function Example({ dark = false, mode = 'speech', failure = false, empty = false, longName = false, holdDiscovery = false, locale = 'zh-CN' }: { dark?: boolean; mode?: string; failure?: boolean; empty?: boolean; longName?: boolean; holdDiscovery?: boolean; locale?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current!, signal = new AbortController(), operation = operations.find(operation => operation.id.endsWith(`/${mode}`))!;
    let revision = 1;
    const fields = { ...Object.fromEntries(operation.fields.map(field => [field.path, structuredClone(field.default)])), ...(mode !== 'transcribe' ? { text: 'Hello. Let us begin a new story.', language: 'en', voiceDescription: mode === 'design' ? 'female, young adult, moderate pitch' : '' } : {}) };
    const release = mountVoiceStudioEditor(element, { locale, value: fields, signal: signal.signal, studio: {} as never, commit: async () => ({ ok: true, value: undefined, warnings: [] }),
      target: { kind: 'production', operation: { id: operation.id, version: 1 }, draftId: 'Draft1', revision, fields, references: [], readonly: false,
        connection: empty ? null : { id: 'Conn01', name: longName ? '本机已经安装并且由作者明确配置的长名称语音服务连接'.repeat(8) : '本机 VoiceStudio', model: 'omnivoice' },
        resolveReference: async () => { throw new Error('unused'); },
        inspectConnection: async () => { if (holdDiscovery) await new Promise<void>(resolve => discoveryResolvers.set(element, resolve)); if (failure) { const error = { code: 'SERVICE_UNAVAILABLE', message: 'fetch failed: ECONNREFUSED 127.0.0.1:19119', severity: 'error' as const, owner: 'M10' as const, related: [], actions: ['edit' as const] }; return { ok: false, error, issues: [error] }; }
          const report: CapabilityReport = { connectionId: 'Conn01', connectionRevision: 1, checkedAt: new Date().toISOString(), serviceVersion: '0.5.6', purpose: 'speech', status: 'unverified', inputs: [], output: 'audio', models: ['omnivoice'], promptFormat: null, textVision: null, remote: { query: false, cancelQueued: false, cancelRunning: 'none' }, issues: [], speechCatalog: empty ? { ...catalog, engines: [], voices: [], models: [] } : catalog };
          return { ok: true, value: report, warnings: [] }; },
        commit: async input => { element.dataset.committed = JSON.stringify(input.fields); return { ok: true, value: { revision: ++revision }, warnings: [] }; },
      } });
    return () => { signal.abort(); release(); };
  }, [mode, failure, empty, longName, holdDiscovery, locale]);
  return <div className="studio-root"><main className="authoring-shell" data-theme={dark ? 'dark' : 'light'} style={{ display: 'block', boxSizing: 'border-box', height: '100dvh', overflow: 'auto', padding: 20, background: 'var(--background)', color: 'var(--foreground)' }}><section style={{ maxWidth: 720, margin: 'auto' }}><h2 style={{ margin: 0, fontSize: 18, lineHeight: '26px', fontWeight: 600 }}>VoiceStudio 制作输入</h2><p style={{ margin: '8px 0 16px', color: 'var(--muted-foreground)', fontSize: 13, lineHeight: '20px' }}>此 Story 使用明确的服务发现替身，不发送生成请求。</p><div ref={root}/></section></main></div>;
}
const meta = { title: 'Product/Studio/Production/VoiceStudio', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Speech: Story = { play: async ({ canvasElement }) => { const canvas = within(canvasElement); const voice = await canvas.findByLabelText('已保存声音 / 引擎预设'); await waitFor(() => expect(within(voice).getByRole('option', { name: /已保存角色声音/ })).toBeInTheDocument()); await userEvent.selectOptions(voice, 'demo0001'); await waitFor(() => expect(canvasElement.querySelector('[data-committed]')?.getAttribute('data-committed')).toContain('demo0001')); } };
export const Dark: Story = { args: { dark: true } };
export const Design: Story = { args: { mode: 'design' } };
export const Clone: Story = { args: { mode: 'clone' } };
export const Transcription: Story = { args: { mode: 'transcribe' } };
export const FailedService: Story = { args: { failure: true } };
export const FailedServiceEnglish: Story = { args: { failure: true, locale: 'en' } };
export const FailedServiceJapanese: Story = { args: { failure: true, locale: 'ja', dark: true } };
export const EmptyService: Story = { args: { empty: true } };
export const LongNameNarrow: Story = { args: { longName: true }, globals: { viewport: { value: 'tablet', isRotated: false } } };
export const DelayedDiscovery: Story = { args: { holdDiscovery: true }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement), input = await canvas.findByLabelText('朗读文本') as HTMLTextAreaElement, root = canvasElement.querySelector<HTMLElement>('.voicestudio-editor')!;
  await userEvent.click(input); await userEvent.type(input, ' typed before discovery'); const before = input.value, position = input.selectionStart;
  discoveryResolvers.get(root)!(); await canvas.findByRole('option', { name: /已保存角色声音/ });
  expect(canvas.getByLabelText('朗读文本')).toBe(input); expect(input).toHaveValue(before); expect(document.activeElement).toBe(input); expect(input.selectionStart).toBe(position);
  await userEvent.click(canvas.getByRole('button', { name: '刷新引擎与声音' })); await userEvent.click(input); await userEvent.type(input, ' and during refresh'); const refreshed = input.value;
  discoveryResolvers.get(root)!(); await waitFor(() => expect(canvas.getByRole('button', { name: '刷新引擎与声音' })).toBeEnabled());
  expect(canvas.getByLabelText('朗读文本')).toBe(input); expect(input).toHaveValue(refreshed); expect(document.activeElement).toBe(input); root.dataset.discoveryInput = 'passed';
} };
