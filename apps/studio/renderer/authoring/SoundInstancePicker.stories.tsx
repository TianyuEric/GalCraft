import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SoundInstancePicker } from './SoundInstancePicker.js';
import './shell.css';
const items = [{ id: 'Rain01', name: '春夜屋檐雨声', source: '店前 · 第 8 条', loop: true, current: true }, { id: 'Bell01', name: '放映前的长铃', source: '店前 · 第 10 条', loop: false, current: true }, { id: 'Wind01', name: '车站海风', source: '告别 · 第 3 条', loop: true, current: false }];
function Example({ locale = 'zh-CN', empty = false, failure = false, theme = 'light' }) { const [value,setValue] = useState('Rain01'), [ready,setReady] = useState(false); useEffect(()=>setReady(true),[]); return <div id="app" data-theme={theme} className="authoring-shell" style={{ display:'block',padding:16,maxWidth:360 }}><div id="studio-portals" data-theme={theme} lang={locale}/>{ready && <SoundInstancePicker value={value} items={empty?[]:items} locale={locale} choose={async value=>{if(failure)throw new Error('提交失败，原声音引用已保留。');setValue(value);}}/>}</div>; }
const meta = { title:'Product/Studio/Creation/Sound instance picker', component:Example, parameters:{layout:'fullscreen'} } satisfies Meta<typeof Example>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Default:Story={play:async({canvas,canvasElement})=>{
  await userEvent.click(canvas.getByText('声音对象引用详情'));
  const id=canvas.getByRole('textbox',{name:'声音对象 ID'});
  await userEvent.clear(id);await userEvent.type(id,'Wind01');await userEvent.tab();
  await expect(canvas.getByLabelText('选择要停止的声音对象')).toHaveTextContent('车站海风');
  await userEvent.click(canvas.getByLabelText('选择要停止的声音对象'));
  const page=within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('option',{name:/放映前的长铃/}));
  await expect(id).toHaveValue('Bell01');
  await userEvent.click(id);await userEvent.tab();
  await expect(canvas.getByLabelText('选择要停止的声音对象')).toHaveTextContent('放映前的长铃');
}};
export const Dark:Story={args:{theme:'dark'}};
export const Empty:Story={args:{empty:true}};
export const Failure:Story={args:{failure:true}};
export const English:Story={args:{locale:'en'}};
export const Japanese:Story={args:{locale:'ja'}};
