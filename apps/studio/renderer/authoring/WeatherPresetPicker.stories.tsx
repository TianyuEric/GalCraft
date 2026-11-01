import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { WeatherPresetPicker } from './WeatherPresetPicker.js';
import './shell.css';
function Example({ locale = 'zh-CN', failure = false, theme = 'light' }) {
  const [selected,setSelected]=useState('');
  return <div id="app" className="authoring-shell" data-theme={theme} style={{display:'block',padding:16,maxWidth:360}}><WeatherPresetPicker locale={locale} apply={async key=>{if(failure)throw new Error('纹理导入失败，请重试。');setSelected(key);}}/><output aria-live="polite">{selected}</output></div>;
}
const meta={title:'Product/Studio/Creation/Weather presets',component:Example,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Example>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Default:Story={play:async({canvasElement})=>{const canvas=within(canvasElement);await userEvent.click(canvas.getByRole('button',{name:/^雨$/}));await expect(canvas.getByText('rain')).toBeVisible();}};
export const Failure:Story={args:{failure:true}};
export const Dark:Story={args:{theme:'dark'}};
export const English:Story={args:{locale:'en'}};
export const Japanese:Story={args:{locale:'ja'}};
