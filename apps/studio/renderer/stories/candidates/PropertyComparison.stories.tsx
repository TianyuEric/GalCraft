import type { Meta, StoryObj } from '@storybook/react-vite';
import { PropertyComparison } from './PropertyComparison.js';

const meta = {title:'Product/Studio/Component Comparison/Batch 1',component:PropertyComparison,parameters:{layout:'fullscreen'}} satisfies Meta<typeof PropertyComparison>;
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
