import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { AuthoringToolbar, type AuthoringToolbarProps } from './AuthoringToolbar.js';

function Specimen({ theme = 'light', locale = 'zh-CN', dirty = false, readOnly = false, hasSelection = true, saveState = 'idle' }) {
  const [view, setView] = useState<AuthoringToolbarProps['view']>('writing'), [result, setResult] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return <div className="authoring-shell authoring-pilot-scope" data-theme={theme} style={{ height:300, padding:16 }}>
    <div id="studio-portals" data-authoring-pilot="true" data-theme={theme} lang={locale}/>
    {ready && <AuthoringToolbar locale={locale} view={view} dirty={dirty} saveState={saveState} readOnly={readOnly} hasSelection={hasSelection} hasStatements={hasSelection} pluginTools={true} changeView={setView} play={setResult} action={setResult}/>}
    <p>{view}</p><output>{result}</output>
  </div>;
}
const meta = { title:'Product/Studio/Authoring/Toolbar', component:Specimen, parameters:{ layout:'fullscreen' } } satisfies Meta<typeof Specimen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Writing: Story = { play:async({canvasElement})=>{
  const canvas=within(canvasElement); await userEvent.click(canvas.getByRole('button',{name:'演出'}));
  await expect(canvas.getByRole('button',{name:'演出'})).toHaveAttribute('aria-pressed','true');
  await userEvent.click(canvas.getByRole('button',{name:'更多创作工具'}));
  const menu=within(document.body); await userEvent.click(await menu.findByRole('menuitem',{name:'场景关系图'}));
  await expect(canvas.getByText('graph')).toBeVisible();
}};
export const Dusk: Story = { args:{theme:'dark',dirty:true} };
export const Empty: Story = { args:{hasSelection:false} };
export const Saving: Story = { args:{saveState:'saving',dirty:true} };
export const InvalidSource: Story = { args:{readOnly:true,saveState:'failed'} };
export const English: Story = { args:{locale:'en'} };
export const Japanese: Story = { args:{locale:'ja',theme:'dark'} };
