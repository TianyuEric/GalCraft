import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import type { FieldSpec, Json } from '@galcraft/contracts';
import { EffectField } from './effect-field.js';
import './shell.css';
const number = (path: string, min?: number, max?: number): FieldSpec => ({ path, type: 'number', required: false, nullable: true, default: 0, label:path, description:'', unit:'none', group:'effect', summary:false, keywords:[], ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) });
function Effects({ locale = 'zh-CN', theme = 'light' }: { locale?: string; theme?: string }) {
  const [values, setValues] = useState<Record<string, Json>>({ opacity: null, rotationDeg: null, thickness: null, rgb: [255,255,255] });
  const fields = [number('opacity',0,1), number('rotationDeg'), number('thickness',0), { path:'rgb',type:'array',required:false,nullable:true,default:null } as FieldSpec];
  return <div data-theme={theme}><div id="studio-portals" lang={locale} data-theme={theme}/><section className="authoring-shell" style={{ display:'block', height:'auto', minHeight:'100vh', padding:16 }}><div className="effects-fields" style={{maxWidth:320}}>{fields.map(spec => <EffectField key={spec.path} spec={spec} value={values[spec.path]} locale={locale} change={value => setValues(current => ({...current,[spec.path]:value}))}/>)}</div><output data-testid="effect-draft">{JSON.stringify(values)}</output></section></div>;
}
const meta = { title:'Product/Studio/Authoring/Visual effect fields', component:Effects, parameters:{layout:'fullscreen'} } satisfies Meta<typeof Effects>;
export default meta;
type Story = StoryObj<typeof meta>;
export const OptionalValues: Story = { play: async ({canvas}) => {
  const opacity = canvas.getByLabelText(/^不透明度$/);
  await userEvent.type(opacity,'0.5'); await userEvent.keyboard('{Enter}');
  await expect(canvas.getByTestId('effect-draft')).toHaveTextContent('"opacity":0.5');
  await userEvent.clear(opacity); await userEvent.keyboard('{Enter}');
  await expect(canvas.getByTestId('effect-draft')).toHaveTextContent('"opacity":null');
} };
export const DuskEnglish: Story = { args:{locale:'en',theme:'dark'} };
