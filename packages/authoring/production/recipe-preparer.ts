import { PerformanceGuidance, type CapabilityReport, type CommandSpec, type Result, type VersionRef } from '@galcraft/contracts';
import { CreationRecipeSchema } from '../recipes/schema.js';
import type { CreationRecipe, RecipePurpose } from '../recipes/schema.js';
import type { ContextPart, GenerationInput, RecipeSelection, RecipeSnapshot } from './types.js';
import { fail, ok, validateInput } from './validation.js';
import { compactContextParts } from './context-identities.js';
import { NovelAIPromptSchema, NovelAIPromptContract } from '@galcraft/generation-services/novelai';
import type { NovelAIPromptDraft } from '@galcraft/generation-services/novelai';
export const discussionSystem = '你是 GalCraft 剧情创作顾问。本轮仅讨论情节、人物与演出计划，返回可读的普通文本，不生成剧情指令。素材和角色事实以会话资料为准。';
export const speechPreparationInstruction=(text:string,instruction:string)=>`朗读文本：${text}\n本次准备要求：${instruction||'保留原文，核对读音'}`;

export const OutputContracts: Record<RecipePurpose, string> = {
  script: '返回 GalCraft DSL 原文。每条语句使用 <command> <JSON对象> @<6位字母数字ID>; 例如 say {"speaker":{"kind":"narrator"},"text":"旁白"} @Ab3dE6; 。仅使用所提供 CommandSpec、角色和素材 ID。say 显式指定 speaker，text 不包含系统外层引号。新语句使用新的6位 A-Za-z0-9 ID，已有语句保留身份。未知绑定在 comment 的 text 中列出待绑定描述；不要伪造角色/素材 ID，也不要输出未提供的命令。',
  imagePrompt: '{"kind":"imagePrompt","format":"natural或tags","positive":"提示词","negative":null}',
  novelaiPrompt: NovelAIPromptContract,
  differencePrompt: '{"kind":"differencePrompt","instruction":"差分要求","negative":null}',
  speechText: '{"kind":"speechText","spokenText":"朗读文字","pronunciationNotes":"读音说明","emotion":null}',
  musicPrompt: '{"kind":"musicPrompt","prompt":"音乐要求","lyrics":null}',
  uiPlan: '{"summary":"说明","steps":[{"key":"唯一key","kind":"patch或svg或raster","description":"说明","dependsOn":[],"recipe":null,"instruction":"要求","fields":{},"reuseAssets":[],"assetKeys":[]}]}',
  uiPatch: '{"summary":"说明","config":[],"styles":[],"assets":[]}；只修改给定范围内公开字段。资源使用 asset:<id> 或 candidate-asset:<key>。',
  svg: '{"name":"名称","source":"完整静态SVG源码","suggestedUse":"icon","colorMode":"original或mask"}',
};
export function baseTextInput(operation:string,usage:string,context:ContextPart[],instruction:string,maxOutputTokens=4096): Extract<GenerationInput,{purpose:'text'}> {
  if (!Object.hasOwn(OutputContracts, operation) && !['performance', 'discuss'].includes(operation)) throw new Error(`未知文字操作：${operation}`);
  const included=context.filter(part=>part.included);
  const guidance = operation === 'performance' && !included.some(part => part.text?.includes(PerformanceGuidance.shortScene)) ? `\n${PerformanceGuidance.principles}\n\n${PerformanceGuidance.shortScene}` : '';
  return {purpose:'text',system:(OutputContracts[operation as RecipePurpose]??(usage==='script'?OutputContracts.script:'')) + guidance,
    messages:[{role:'user',text:[...included.filter(part=>part.text).map(part=>`[${part.label}]\n${part.text}`),instruction].join('\n\n'),attachments:included.flatMap(part=>part.attachment?[part.attachment]:[])}],maxOutputTokens,temperature:null,seed:null};
}
export function prepareRecipe(input: { recipe: CreationRecipe; selection: RecipeSelection; context: ContextPart[]; instruction: string;
  settings: Pick<Extract<GenerationInput, { purpose: 'text' }>, 'maxOutputTokens' | 'temperature' | 'seed'>; capability: CapabilityReport; sourceVersions: VersionRef[]; engineVersion?: string; pluginCommands?: CommandSpec[] }): Result<RecipeSnapshot> {
  try {
    const recipe = CreationRecipeSchema.parse(input.recipe), selected = input.selection;
    if (recipe.production || recipe.parameterPreset) throw new Error('媒体制作方案不作为文字提示规则执行');
    if (!Object.hasOwn(OutputContracts, selected.purpose)) throw new Error('该操作没有文字输出契约：' + selected.purpose);
    if (recipe.id !== selected.recipeId || recipe.scope !== selected.scope || !recipe.purposes.includes(selected.purpose) || !recipe.uses.includes(selected.usage)) throw new Error('方案用途或身份不匹配');
    const parameters = { ...selected.parameterValues };
    for (const key of Object.keys(parameters)) if (!recipe.parameters.some(parameter => parameter.key === key)) throw new Error(`未知参数 ${key}`);
    for (const parameter of recipe.parameters) {
      const value = parameters[parameter.key] ?? parameter.defaultValue;
      if (parameter.type === 'enum' ? typeof value !== 'string' || !parameter.choices.includes(value) : typeof value !== parameter.type) throw new Error(`参数类型错误 ${parameter.key}`);
      if (typeof value === 'number' && (!Number.isFinite(value) || parameter.min !== null && value < parameter.min || parameter.max !== null && value > parameter.max)) throw new Error(`参数超限 ${parameter.key}`);
      parameters[parameter.key] = value;
    }
    const compacted = compactContextParts(input.context.filter(part => part.included), input.engineVersion, input.pluginCommands);
    const included = compacted.context;
    const context = included.map(part => `[${part.label}]\n${part.text ?? ''}${part.media ? `\n素材：${part.media.mime}` : ''}${part.attachment ? `\n附件：${part.attachment.mime} ${part.attachment.width}×${part.attachment.height}` : ''}`).join('\n\n');
    const capabilities = JSON.stringify({ inputs: input.capability.inputs, promptFormat: input.capability.promptFormat, textVision: input.capability.textVision });
    const substitute = (source: string) => source.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) => {
      if (key === 'instruction') return input.instruction;
      if (key === 'context') return context;
      if (key === 'capabilities') return capabilities;
      if (key.startsWith('parameters.') && key.slice(11) in parameters) return JSON.stringify(parameters[key.slice(11)]);
      throw new Error(`缺少占位符 ${key}`);
    });
    const templates = recipe.systemPrompt + recipe.taskTemplate;
    const text = [recipe.examples.length ? `示例\n${recipe.examples.map(example => `${example.input}\n${example.output}`).join('\n')}` : '', substitute(recipe.taskTemplate),
      templates.includes('{{context}}') ? '' : context, templates.includes('{{instruction}}') ? '' : input.instruction].filter(Boolean).join('\n\n');
    const attachments = included.flatMap(part => part.attachment ? [part.attachment] : []);
    const assembledInput: Extract<GenerationInput, { purpose: 'text' }> = { purpose: 'text', system: `输出契约\n${OutputContracts[selected.purpose]}\n${selected.purpose === 'script' ? '' : '只返回单个JSON对象，不含代码围栏或解释。'}\n方案\n${substitute(recipe.systemPrompt)}\n${recipe.outputGuidance}`,
      messages: [{ role: 'user', text, attachments }], ...input.settings };
    if (recipe.scriptMode === 'performance' && !included.some(part => part.text?.includes(PerformanceGuidance.shortScene))) assembledInput.system += `\n${PerformanceGuidance.principles}\n\n${PerformanceGuidance.shortScene}`;
    validateInput(assembledInput, input.capability);
    return ok(structuredClone({ recipe, purpose: selected.purpose, usage: selected.usage, parameterValues: parameters, contract: selected.purpose, contractVersion: 1,
      assembledInput, omittedPorts: [], context: included, sourceVersions: input.sourceVersions, idAliases: compacted.idAliases }));
  } catch (error) { return fail('RECIPE_PREPARATION', String(error)); }
}
export type PromptDraft = NovelAIPromptDraft | { kind: 'imagePrompt'; format: 'natural' | 'tags'; positive: string; negative: string | null }
  | { kind: 'differencePrompt'; instruction: string; negative: string | null }
  | { kind: 'speechText'; spokenText: string; pronunciationNotes: string; emotion: string | null }
  | { kind: 'musicPrompt'; prompt: string; lyrics: string | null };
export function parsePrompt(text: string, purpose: RecipePurpose): Result<PromptDraft> {
  try {
    const value = JSON.parse(text);
    if (purpose === 'novelaiPrompt') {
      const parsed = NovelAIPromptSchema.safeParse(value);
      if (!parsed.success) throw new Error(parsed.error.issues.map(issue => `${issue.path.join('.') || 'prompt'}: ${issue.message}`).join('; '));
      return ok(parsed.data);
    }
    const fields: Record<string, string[]> = { imagePrompt: ['positive'], differencePrompt: ['instruction'], speechText: ['spokenText', 'pronunciationNotes'], musicPrompt: ['prompt'] };
    if (!fields[purpose] || value.kind !== purpose || fields[purpose]!.some(key => typeof value[key] !== 'string')) throw new Error('输出形状与用途不匹配');
    const nullable = purpose === 'imagePrompt' || purpose === 'differencePrompt' ? 'negative' : purpose === 'speechText' ? 'emotion' : 'lyrics';
    if (value[nullable] !== null && typeof value[nullable] !== 'string') throw new Error(`无效字段 ${nullable}`);
    if (purpose === 'imagePrompt' && !['natural', 'tags'].includes(value.format)) throw new Error('无效提示词格式');
    return ok(value);
  } catch (error) { return fail('PROMPT_OUTPUT', String(error)); }
}
