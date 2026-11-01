import { useEffect, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { mountMusicWorkstation, mountMusicWritingEditor } from '@galcraft/music-composition/editor';
import { createMusicScore } from '@galcraft/music-composition';
import type { Json } from '@galcraft/contracts';
import type { FieldEditorContribution } from '@galcraft/plugins/contracts';
import { expect, userEvent } from 'storybook/test';
import '../../authoring/shell.css';
import '../../authoring/workspace.css';
function Example({ theme = 'light', locale = 'zh-CN', empty = false, error = false, source = false, writing = false }: { theme?: string; locale?: string; empty?: boolean; error?: boolean; source?: boolean; writing?:boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const abort = new AbortController(), score = createMusicScore(); if (empty) score.tracks[0]!.notes = [];
    if (error) score.tracks[0]!.instrumentId = 'melodic:9:9:99';
    score.tracks[0]!.name = '钢琴 · 午后书房里逐渐展开的很长主题名称';
    let commits = 0;
    root.current!.dataset.commits = '0';
    const commit = async () => { root.current!.dataset.commits = String(++commits); return { ok: true as const, warnings: [], value: { revision: commits + 1 } }; };
    const context = { value: (source ? score : { score }) as unknown as Json, locale, signal: abort.signal,
      target: source ? undefined : { kind: 'production' as const, operation: { id: 'org.galcraft.music-composition/render', version: 1 }, draftId: `music-story-${locale}-${crypto.randomUUID()}`, revision: 1, fields: { score } as unknown as Record<string, Json>, references: [], readonly: false,
        resolveReference: async () => { throw new Error('Storybook example'); }, commit }, commit: async () => ({ ok: true as const, warnings: [], value: undefined }),
      studio: { projectId: '00000000-0000-4000-8000-000000000001', production: source ? {
        connections: async () => ({ ok: true, warnings: [], value: [{ id: 'storybook-local', name: '本地采样渲染', providerKey: 'org.galcraft.music-composition/renderProvider', purposes: ['org.galcraft.music-composition/render'] }] }),
        prepare: async () => ({ ok: true, warnings: [], value: { planId: 'storybook-plan', issues: [] } }),
        submit: async () => ({ ok: true, warnings: [], value: { id: 'storybook-task' } }),
      } : undefined } } as unknown as Parameters<FieldEditorContribution['mount']>[1];
    if (writing && context.target) { context.target.fields = {description:'为雨后初晴的校园场景写一段轻快的音乐。',musicConstraints:{}}; context.target.operation.id = 'org.galcraft.music-composition/writeScore'; }
    const release = writing ? mountMusicWritingEditor(root.current!,context) : mountMusicWorkstation(root.current!, context, { instruments: [{ id: 'melodic:0:0:0', name: 'Grand Piano', bankMSB: 0, bankLSB: 0, program: 0, drum: false, minPitch: 0, maxPitch: 127, controllers: [1, 7, 10, 11, 64, 91, 93] }] });
    return () => { abort.abort(); release(); };
  }, [locale, empty, error, source, writing]);
  return <div data-theme={theme} lang={locale}><div className="authoring-shell" style={{ display: 'block', height: '100vh', overflow: 'auto', background: 'var(--background)' }}><div ref={root}/></div></div>;
}
const meta = { title: 'Product/Studio/Plugins/Music composition', component: Example, args: { theme: 'light', locale: 'zh-CN', empty: false, error: false, source: false }, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Workstation: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const CustomWriting: Story = { args: {writing:true} };
export const CustomWritingDark: Story = { args: {writing:true,theme:'dark'} };
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja', theme: 'dark' } };
export const Empty: Story = { args: { empty: true } };
export const MissingInstrument: Story = { args: { error: true } };
export const SourceDocument: Story = { args: { source: true } };
export const DarkSourceDocument: Story = { args: { source: true, theme: 'dark' } };
export const KeyboardAndLocalizedError: Story = { args: { locale: 'en' }, play: async ({ canvas, canvasElement }) => {
  const note = canvas.getByRole('button', { name: /C4 0:0:0 velocity 88/ });
  await userEvent.click(note); await userEvent.keyboard('{ArrowUp}');
  await expect(canvasElement.querySelector('[data-commits]')).toHaveAttribute('data-commits', '1');
  await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
  await expect(canvas.getByRole('button', { name: /C4 0:0:0 velocity 88/ })).toBeInTheDocument();
  (canvasElement.querySelector('[data-score-json]')!.closest('details') as HTMLDetailsElement).open = true;
  const json = canvas.getByRole('textbox', { name: 'Score JSON' });
  await userEvent.clear(json); await userEvent.type(json, 'invalid JSON');
  await userEvent.click(canvas.getByRole('button', { name: 'Validate and apply JSON' }));
  await expect(canvas.getByRole('alert')).toHaveTextContent('The composition result is not complete JSON.');
  await expect(json).toHaveValue('invalid JSON');
} };
