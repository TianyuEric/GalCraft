import { NovelAIRecipeInputs } from '@galcraft/generation-services/novelai';
import type { CreationRecipe, RecipePurpose, RecipeUsage, RecipeContextKind } from './schema.js';

type OfficialInput = {
  scriptMode?: 'write' | 'performance';
  name: string; description: string; purpose: RecipePurpose; usage: RecipeUsage;
  system: string; task: string; output: string; context: RecipeContextKind[];
};

const entries: OfficialInput[] = [
  {
    name: '剧情脚本', description: '按场景要求编写剧情 DSL 草稿', purpose: 'script', usage: 'script',
    system: '编写 GalCraft 场景脚本，保留稳定语句身份与作者给定事实。',
    task: '上下文：\n{{context}}\n本次要求：\n{{instruction}}',
    output: '只输出可由 GalCraft DSL 校验的脚本；不解释或改写未选中的场景。', context: ['setting', 'character', 'script'],
  },
  {
    name: '背景提示', description: '为独立背景工作流准备构图文字', purpose: 'imagePrompt', usage: 'background',
    system: '描述场景空间、光线和人物可阅读区域，保持作品画布比例。把作者的中文要求转为图像模型使用的英文标签和具体自然语言描述。独立背景默认无人物，使用 no humans, scenery，避免将故事角色写进画面。',
    task: '场景资料：\n{{context}}\n背景要求：\n{{instruction}}',
    output: '输出 imagePrompt JSON；positive 与 negative 使用适合图像模型的英文，positive 描述画面与构图，negative 可为 null。保留作者事实与作品风格。', context: ['setting', 'media'],
  },
  {
    name: '立绘提示', description: '为角色立绘准备形象文字', purpose: 'imagePrompt', usage: 'figure',
    system: '把作者要求转为英文标签和具体自然语言描述，保留角色身份。立绘默认 solo, full body, standing，强调仅一人、完整手脚与留白；使用 simple white background 便于工作流抠图，不要求图像模型画透明棋盘格。避免拼图、多视角或角色设计稿。',
    task: '角色资料：\n{{context}}\n立绘要求：\n{{instruction}}',
    output: '输出 imagePrompt JSON；positive 与 negative 使用适合图像模型的英文，positive 描述角色外观与姿势，negative 可为 null。保留作者人物设定。', context: ['character', 'media'],
  },
  {
    name: 'CG 提示', description: '为叙事插图准备画面文字', purpose: 'imagePrompt', usage: 'cg',
    system: '描述完整叙事画面，保留场景与人物关系。',
    task: '叙事资料：\n{{context}}\n插图要求：\n{{instruction}}',
    output: '输出 imagePrompt JSON；positive 描述画面，negative 可为 null。', context: ['setting', 'character', 'script'],
  },
  {
    name: '差分指令', description: '说明相对于原图需改变及需保留的内容', purpose: 'differencePrompt', usage: 'difference',
    system: '仅描述所选原图的局部差异，保持角色与画布对齐。',
    task: '原图说明：\n{{context}}\n变更要求：\n{{instruction}}',
    output: '输出 differencePrompt JSON；instruction 是差异，negative 可为 null。', context: ['character', 'media'],
  },
  {
    name: '语音朗读', description: '为当前台词准备朗读文字', purpose: 'speechText', usage: 'voice',
    system: '保持原台词语义和语言，只调整本次朗读及专名发音。',
    task: '台词与读音：\n{{context}}\n朗读要求：\n{{instruction}}',
    output: '输出 speechText JSON；spokenText 不包含界面补的「」；不改原 say。', context: ['script', 'character'],
  },
  {
    name: '音乐提示', description: '为背景音乐准备风格文字', purpose: 'musicPrompt', usage: 'bgm',
    system: '根据场景情绪描述音乐，不改变表单中的时长与纯音乐设置。',
    task: '场景资料：\n{{context}}\n音乐要求：\n{{instruction}}',
    output: '输出 musicPrompt JSON；纯音乐时 lyrics 为 null。', context: ['setting', 'script'],
  },
  {
    name: 'UI 位图提示', description: '为页面素材准备图像文字', purpose: 'imagePrompt', usage: 'ui',
    system: '描述单个 UI 位图及可伸缩边缘，保持页面文字可读。',
    task: '页面资料：\n{{context}}\n位图要求：\n{{instruction}}',
    output: '输出 imagePrompt JSON；尺寸由原表单确定。', context: ['ui', 'style', 'media'],
  },
  {
    name: '页面计划', description: '规划受支持的页面修改步骤', purpose: 'uiPlan', usage: 'ui',
    system: '仅规划 GalCraft 页面、样式、SVG 和位图支持的操作。',
    task: '当前页面：\n{{context}}\n修改目标：\n{{instruction}}',
    output: '只输出 JSON：{summary:string,steps:[{key:string,kind:"patch"|"svg"|"raster",description:string,dependsOn:string[],recipe:null,instruction:string,fields:{},reuseAssets:string[],assetKeys:string[]}]。key 唯一；patch 的 assetKeys 为空，svg/raster 各含一个资源 key；recipe 由作者确认。', context: ['ui', 'style', 'assetCatalog'],
  },
  {
    name: '页面修改', description: '提出公开页面属性的局部改动', purpose: 'uiPatch', usage: 'ui',
    system: '仅修改组件目录公开的属性，保留未选页面。',
    task: '页面与来源：\n{{context}}\n修改要求：\n{{instruction}}',
    output: '只输出 JSON：{summary:string,config:[{key:string,pageId:string,componentId:string|null,path:string,operation:"set"|"clear",value:JSON,dependsOn:string[]}],styles:[{key:string,styleId:string|null,name:string,scope:{pageId:string,componentId:string|null},language:"css"|"scss",source:string,dependsOn:string[]}],assets:[{key:string,source:{kind:"existing",assetId:string,variantId:string}|{kind:"candidate",key:string},use:"icon"|"frame"|"background"|"texture"|"logo"|"decoration"}]}。无改动的数组为空；path 必填，例如页面底色为 background.color；组件属性来自公开 normal/states/layout/visible/locked。引用实际页面与组件 ID。', context: ['ui', 'style'],
  },
  {
    name: 'SVG 图形', description: '创建受支持的静态 SVG 图标', purpose: 'svg', usage: 'ui',
    system: '创建静态 SVG，使用明确 viewBox，不引用远端资源或脚本。',
    task: '视觉资料：\n{{context}}\n图形要求：\n{{instruction}}',
    output: '只输出 SVGProposal JSON：{name:string,source:string,suggestedUse:"icon"|"frame"|"background"|"texture"|"logo"|"decoration",colorMode:"original"|"mask"}。source 内含完整静态 SVG 源码，明确 viewBox。', context: ['ui', 'style', 'media'],
  },
  {
    name: '剧情演出', description: '用已有素材为选定剧情配置演出', purpose: 'script', usage: 'script', scriptMode: 'performance',
    system: '为 GalCraft 选定剧情配置背景、立绘、音频、镜头和过渡。保留台词内容与稳定语句身份，仅使用实际已有素材和允许 CommandSpec。',
    task: '当前剧情与可用素材：\n{{context}}\n演出要求：\n{{instruction}}',
    output: '返回选区的完整 GalCraft DSL，包含原有台词。缺少素材时在 comment 中说明待绑定用途和画面要求，保留已有绑定；不得生成不存在的素材 ID。', context: ['setting', 'character', 'script', 'assetCatalog'],
  },
];

entries.push(...NovelAIRecipeInputs);

const timestamp = '2026-09-23T00:00:00Z';
function freeze(recipe: CreationRecipe): CreationRecipe {
  Object.freeze(recipe.purposes);
  Object.freeze(recipe.uses);
  Object.freeze(recipe.contextDefaults);
  Object.freeze(recipe.parameters);
  Object.freeze(recipe.examples);
  return Object.freeze(recipe);
}
const promptRules: CreationRecipe[] = entries.map((entry, index): CreationRecipe => freeze({
  schemaVersion: 1, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  revision: 1, scope: 'official', projectId: null,
  name: entry.name, description: entry.description, purposes: [entry.purpose], uses: [entry.usage],
  ...(entry.scriptMode ? { scriptMode: entry.scriptMode } : {}),
  systemPrompt: entry.system, taskTemplate: entry.task, outputGuidance: entry.output,
  contextDefaults: entry.context, parameters: [], examples: [], createdAt: timestamp, updatedAt: timestamp,
}));

const number = (key: string, label: string, value: number, min = 1, max: number | null = null) => ({ key, label, help: '', type: 'number' as const, defaultValue: value, choices: [], min, max });
const schemes: { name: string; description: string; usage: RecipeUsage; operation: 'image' | 'difference' | 'speech' | 'music'; protocol: string | null; planned?: boolean; defaults: Record<string, string | number | boolean | null>; parameters?: CreationRecipe['parameters'] }[] = [
  { name: '直接图像', description: '直接使用正负提示生成背景、立绘、CG 或 UI 位图；文字准备由作者选择。', usage: 'background', operation: 'image', protocol: null, defaults: { width: 1920, height: 1080, count: 1 }, parameters: [number('width', '宽度（px）', 1920), number('height', '高度（px）', 1080), number('count', '候选数量', 1)] },
  { name: '直接差分', description: '提供基准图和改动要求，生成保留原件的图像差分。', usage: 'difference', operation: 'difference', protocol: null, defaults: { width: 1024, height: 1024, count: 1 }, parameters: [number('width', '宽度（px）', 1024), number('height', '高度（px）', 1024), number('count', '候选数量', 1)] },
  { name: '逐句配音', description: '朗读选中台词或手动文本，默认不调用文字模型。声音参数由实际配音连接决定。', usage: 'voice', operation: 'speech', protocol: null, defaults: { language: 'ja', speed: null }, parameters: [number('speed', '语速（倍）', 1, 0.1, 3)] },
  { name: '直接音乐', description: '向已配置音乐服务发送描述、时长和纯音乐设置。', usage: 'bgm', operation: 'music', protocol: null, defaults: { durationSec: 30, instrumental: true }, parameters: [number('durationSec', '时长（秒）', 30)] },
];
export const OfficialRecipes: readonly CreationRecipe[] = Object.freeze([...promptRules, ...schemes.map((entry, index): CreationRecipe => freeze({
  schemaVersion: 1, id: `00000000-0000-4000-8000-${String(index + 1001).padStart(12, '0')}`, revision: 1, scope: 'official', projectId: null,
  name: entry.name, description: entry.description, purposes: [entry.operation === 'speech' ? 'speechText' : entry.operation === 'music' ? 'musicPrompt' : entry.operation === 'difference' ? 'differencePrompt' : 'imagePrompt'],
  uses: entry.operation === 'image' ? ['background', 'figure', 'cg', 'ui'] : [entry.usage], systemPrompt: '', taskTemplate: '', outputGuidance: '', contextDefaults: [], parameters: [], examples: [], createdAt: timestamp, updatedAt: timestamp,
  production: { operation: entry.operation, executor: entry.planned ? 'planned' : 'connection', protocol: entry.protocol, defaults: entry.defaults, parameters: entry.parameters ?? [] },
}))]);
