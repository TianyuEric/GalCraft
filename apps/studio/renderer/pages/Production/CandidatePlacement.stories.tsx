import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { CandidateAdoptionChoice } from '@galcraft/authoring/production';
import { CandidatePlacement } from './CandidatePlacement.js';
import '../../authoring/shell.css';

function Example({ locale = 'zh-CN', characterId = null, theme = 'light' }: { locale?: string; characterId?: string | null; theme?: 'light' | 'dark' }) {
  const [value, setValue] = useState<CandidateAdoptionChoice>({ mode: 'bind', placement: 'new' });
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return <div id="app" className="authoring-shell" data-theme={theme} style={{ maxWidth: 560, padding: 20 }}>
    <div id="studio-portals" lang={locale} data-theme={theme} />
    {ready && <CandidatePlacement value={value} characterId={characterId} canReplace locale={locale} onChange={setValue} />}
    <output aria-label="Selected placement">{JSON.stringify(value)}</output>
  </div>;
}
const meta = { title: 'Product/Studio/Production/Candidate placement', component: Example } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Illustration: Story = { play: async ({ canvas, canvasElement }) => {
  const body = within(canvasElement.ownerDocument.body), placement = await canvas.findByRole('combobox', { name: '采用位置' });
  await userEvent.click(placement);
  await userEvent.click(await body.findByRole('option', { name: '替换所选指令的素材' }));
  await expect(canvas.getByLabelText('Selected placement')).toHaveTextContent('"placement":"replace"');
  await userEvent.click(placement);
  await userEvent.click(await body.findByRole('option', { name: '另建舞台对象' }));
  await expect(canvas.getByRole('combobox', { name: '舞台用途' })).toHaveTextContent('独立演出插图');
  canvasElement.dataset.placementVerified = 'true';
} };
export const Dark: Story = { args: { theme: 'dark' } };
export const Character: Story = { args: { characterId: 'Char01' } };
export const English: Story = { args: { locale: 'en' } };
