import { createId } from '@galcraft/contracts';

import { isDeepStrictEqual } from 'node:util';
import { parse, CoreCommandSpecs } from '@galcraft/dsl';
import type { Candidate, GenerationInput, TaskItem } from './types.js';
import type { Json, Issue } from '@galcraft/contracts';
import { rewriteContextText } from './context-identities.js';
import { discussionSystem } from './recipe-preparer.js';

export function continueConversation(item: TaskItem, candidate: Candidate, text: string,
  input: { instruction: string; mode: 'write' | 'performance' | 'discuss'; summary?: string }): TaskItem {
  if (!input.instruction.trim()) throw new Error('请填写本轮要求');
  if (candidate.partial) throw new Error('请等待完整候选后继续');
  const previous = item.input as GenerationInput;
  if (previous.purpose !== 'text') throw new Error('此步骤不是文字创作');
  const messages: Extract<GenerationInput, { purpose: 'text' }>['messages'] = input.summary?.trim()
    ? [structuredClone(previous.messages[0]!), { role: 'user' as const, text: `会话摘要 / Conversation summary\n${input.summary.trim()}`, attachments: [] }]
    : structuredClone(previous.messages);
  const aliases = item.idAliases ?? item.recipeSnapshot?.idAliases ?? {};
  const modelText = rewriteContextText(text, Object.fromEntries(Object.entries(aliases).map(([alias, real]) => [real, alias])), 'script', '0.1.0', item.idCommands);
  messages.push({ role: 'assistant', text: modelText, attachments: [] });
  const rule = input.mode === 'performance' ? '\n保持所有台词、说话者、已有语句身份和控制分支，只补充演出。'
    : input.mode === 'discuss' ? '\n本轮只讨论创作计划，返回普通文本，不生成或采用剧情指令。'
    : '\n返回修改后的完整候选剧本，保留未修改语句的身份。';
  messages.push({ role: 'user', text: input.instruction.trim() + rule, attachments: [] });
  const originalSystem = item.writingSystem ?? item.recipeSnapshot?.assembledInput.system ?? previous.system;
  const system = input.mode === 'discuss' ? discussionSystem : originalSystem;
  return { ...structuredClone(item), id: createId([item, candidate]), input: { ...previous, system, messages }, dependencies: [], protectedScript: undefined, creationMode: input.mode, writingSystem: originalSystem,
    conversation: { parentCandidateId: candidate.id, instruction: input.instruction.trim(), mode: input.mode,
      ...(input.mode === 'performance' ? { protectedScript: text } : {}), ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}) },
    state: 'draft', remote: null, attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false,
    progress: { phase: '', completed: null, total: null }, issues: [] };
}

const protectedCommands = new Set(CoreCommandSpecs.filter(spec => spec.executor === 'M05' && !['wait', 'showVars'].includes(spec.key)).map(spec => spec.key));
export function performanceConflicts(before: string, after: string): Issue[] {
  const read = (text: string) => parse({ documentId: 'CtxDoc', revision: 1, text }).cst
    .filter(node => node.valid && node.id && protectedCommands.has(node.command))
    .map(node => {
      const args = node.object?.value as Record<string, unknown> ?? {};
      return { id: node.id, command: node.command, args: node.command === 'say'
        ? Object.fromEntries(['speaker', 'text', 'textLocale', 'append', 'when'].filter(key => key in args).map(key => [key, args[key]])) : args };
    });
  const original = read(before), next = read(after);
  return isDeepStrictEqual(original, next) ? [] : [{ code: 'PERFORMANCE_TEXT_CHANGED', severity: 'error', owner: 'M10',
    message: '演出候选修改了台词、说话者、语句身份或分支。请要求保持原剧情后重新生成，或使用写剧情模式。', related: [], actions: ['edit'] }];
}

export function generationUsage(raw: Json | null) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
  const number = (...values: unknown[]): number | null => values.find(item => typeof item === 'number' && Number.isFinite(item)) as number | undefined ?? null;
  return { input: number(value.prompt_tokens, value.input_tokens, value.promptTokenCount),
    output: number(value.completion_tokens, value.output_tokens, value.candidatesTokenCount),
    cacheHit: number(value.prompt_cache_hit_tokens, value.cache_read_input_tokens, value.prompt_tokens_details?.cached_tokens),
    cacheMiss: number(value.prompt_cache_miss_tokens) };
}
