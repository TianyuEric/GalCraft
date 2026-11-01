import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextPreview } from './text-preview.js';
import { StudioToaster, studioToasts } from './toast.js';
import { Button, Field } from './controls.js';
import './controls.css';

function Example({theme='light'}:{theme?:'light'|'dark'}) {
  return <div id="app" data-theme={theme} style={{padding:24,maxWidth:680}}><div id="studio-portals" data-theme={theme} lang="zh-CN"/><StudioToaster locale="zh-CN"/>
    <Field label="每轮任务模板"><TextPreview text={'上下文：\n{{context}}\n本次要求：\n{{instruction}}'}/></Field>
    <Field label="较长提示词"><TextPreview text={'保留已确认的事实和角色设定，以自然对白推进剧情。\n'.repeat(30)}/></Field>
    <Button onClick={()=>studioToasts.add({title:'预设已保存'})}>短通知</Button>{' '}<Button onClick={()=>studioToasts.add({title:'已保存创作预设，可以继续填写本轮要求。'})}>长通知</Button>
  </div>;
}
const meta={title:'Components/Reading and feedback',component:Example,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Example>;
export default meta;
export const Light:StoryObj<typeof meta>={};
export const Dark:StoryObj<typeof meta>={args:{theme:'dark'}};
