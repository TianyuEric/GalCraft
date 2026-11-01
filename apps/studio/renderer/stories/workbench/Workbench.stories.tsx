import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkbenchReview } from './WorkbenchReview.js';

const meta = {
  title: 'Product/Studio/Workbench/Layout fixtures', component: WorkbenchReview, parameters: { layout: 'fullscreen', docs: { description: { component: '用户选定组合：文档工作台 + 制作工位 + 聚焦画布。使用共享正式控件与内存示例数据；无真实生成、磁盘写入或M02/M10接线。' } } },
  args: { page:'scene', theme:'light', scenario:'normal', productionKind:'speech', productionTab:'drafts', initialConfirm:'none', inspectorState:'selected', focusCanvas:false },
  argTypes: { theme:{control:'select',options:['light','dark']},page:{control:'select',options:['scene','production','canvas']},scenario:{control:'select',options:['normal','empty','failed','save-failed','long','mixed']},productionKind:{control:'select',options:['speech','image','ui','music']},productionTab:{control:'select',options:['drafts','library','connections']},initialConfirm:{control:'select',options:['none','delete','save']},inspectorState:{control:'select',options:['selected','empty','mixed']} },
  render: args => <WorkbenchReview key={`${args.page}-${args.theme}-${args.scenario}-${args.productionKind}-${args.productionTab}-${args.initialConfirm}-${args.inspectorState}-${args.focusCanvas}`} {...args}/>,
} satisfies Meta<typeof WorkbenchReview>;
export default meta;
type Story=StoryObj<typeof meta>;

export const DocumentWorkbench:Story={name:'文档工作台 · 场景与Explorer'};
export const SpeechWorkstation:Story={name:'制作工位 · 逐句配音',args:{page:'production'}};
export const BackgroundWorkstation:Story={name:'制作工位 · 背景与可选提示准备',args:{page:'production',productionKind:'image'}};
export const UiAssetWorkstation:Story={name:'制作工位 · UI素材',args:{page:'production',productionKind:'ui'}};
export const MusicWorkstation:Story={name:'制作工位 · 音乐方案',args:{page:'production',productionKind:'music'}};
export const RecipeLibrary:Story={name:'方案库 · 常驻管理与专用方案',args:{page:'production',productionTab:'library'}};
export const Connections:Story={name:'连接与工具 · 持久编辑',args:{page:'production',productionTab:'connections'}};
export const PageCanvas:Story={name:'页面 · 画布与Inspector',args:{page:'canvas'}};
export const FocusedCanvas:Story={name:'页面 · 聚焦画布',args:{page:'canvas',focusCanvas:true}};
export const PartialFailure:Story={name:'状态 · 配音部分失败',args:{page:'production',scenario:'failed'}};
export const EmptyInput:Story={name:'状态 · 空输入与就近校验',args:{page:'production',scenario:'empty'}};
export const SaveFailure:Story={name:'状态 · 草稿保存失败',args:{page:'production',scenario:'save-failed'}};
export const LongNamesDark:Story={name:'状态 · 长名称与深色',args:{theme:'dark',scenario:'long'}};
export const NoSelection:Story={name:'Inspector · 无选择',args:{inspectorState:'empty'}};
export const MixedSelection:Story={name:'Inspector · 多选混合值',args:{inspectorState:'mixed'}};
export const DeleteConfirmation:Story={name:'MessageBox · 删除确认',args:{initialConfirm:'delete'}};
export const SaveConfirmation:Story={name:'MessageBox · 保存与失败',args:{initialConfirm:'save'}};
