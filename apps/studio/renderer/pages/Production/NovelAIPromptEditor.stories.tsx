import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Json } from '@galcraft/contracts';
import { defaultNovelAISettings, emptyNovelAIPrompt } from '@galcraft/generation-services/novelai';
import { NovelAIPromptEditor } from './NovelAIPromptEditor.js';
import '../../authoring/shell.css';
function Example({ theme = 'light', empty = false, locale = 'zh-CN' }: { theme?: 'light' | 'dark'; empty?: boolean; locale?: string }) {
  const [fields, setFields] = useState<Record<string, Json>>({ novelaiPrompt: { ...emptyNovelAIPrompt(), ...(empty ? {} : { basePrompt: 'visual novel cg, evening station, 2girls, warm light', characters: [{ name: '灯里', prompt: '1girl, long dark hair, gentle smile, blue coat', negativePrompt: 'hat', position: { x: .25, y: .5 } }, { name: '真白', prompt: '1girl, short silver hair, surprised, red scarf', negativePrompt: null, position: { x: .75, y: .5 } }] }) }, novelaiSettings: defaultNovelAISettings() as unknown as Json });
  return <div data-theme={theme}><div id="studio-portals" data-theme={theme}/><div className="authoring-shell" style={{ padding: 20, display: 'block', background: 'var(--workbench-editor)', height: '100vh', overflow: 'auto', minHeight: '100vh' }}><div data-novelai-saved={JSON.stringify(fields)} style={{ maxWidth: 760, margin: '0 auto' }}><NovelAIPromptEditor fields={fields} change={(key, value) => setFields(previous => ({ ...previous, [key]: value }))} locale={locale}/></div></div></div>;
}
const meta = { title: 'Product/Studio/Production/NovelAI Prompt', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CharacterBlocks: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const Empty: Story = { args: { empty: true } };
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja', theme: 'dark' } };
