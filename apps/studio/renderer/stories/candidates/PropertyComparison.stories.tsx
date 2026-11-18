import type { Meta, StoryObj } from '@storybook/react-vite';
import { PropertyComparison } from './PropertyComparison.js';

const meta = {id:'product-studio-component-comparison-batch-1',title:'Review/History/Component Comparison/Batch 1',component:PropertyComparison,parameters:{layout:'fullscreen',docs:{description:{component:'历史组件方案对照；保留原实现与候选用于比较，不代表当前 Studio 的完整界面。'}}}} satisfies Meta<typeof PropertyComparison>;
export default meta;
type Story=StoryObj<typeof meta>;
export const TryCandidates:Story={name:'第一批 · 开始体验'};
export const Baseline:Story={name:'第一批 · 原实现',args:{initialKind:'baseline'}};
export const Dusk:Story={name:'第一批 · 深色',args:{initialTheme:'dark'}};
export const Loading:Story={args:{initialMode:'loading'}};
export const Error:Story={args:{initialMode:'error'}};
export const Disabled:Story={args:{initialMode:'disabled'}};
export const Empty:Story={args:{initialMode:'empty'}};
export const LongList:Story={args:{initialMode:'many'}};
