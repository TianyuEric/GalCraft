import { describe, it, expect } from 'vitest';
import { continueConversation, generationUsage, performanceConflicts } from './conversation.js';
import type { Candidate, GenerationInput, TaskItem } from './types.js';
import { discussionSystem } from './recipe-preparer.js';

const id = '12345678-1234-4234-8234-123456789abc';
const say = `say {"speaker":{"kind":"narrator"},"text":"星光亮了"} @${id};`;
const input: Extract<GenerationInput, { purpose: 'text' }> = { purpose: 'text', system: 'DSL contract', messages: [{ role: 'user', text: '固定人物资料和本轮要求', attachments: [] }], maxOutputTokens: 100, temperature: null, seed: null };
const item = { id, input, dependencies: [], candidateIds: [id], sourceVersions: [], target: { usage: 'script' }, recipeSnapshot: { assembledInput: input }, state: 'review' } as unknown as TaskItem;
const candidate = { id, partial: false } as Candidate;
describe('持续创作', () => {
  it('keeps the first discussion system prompt and complete message prefix byte-stable on later discussion rounds',()=>{
    const first={...item,creationMode:'discuss' as const,input:{...input,system:discussionSystem}};
    const next=continueConversation(first,candidate,'建议先约定动机',{instruction:'继续讨论',mode:'discuss'});
    expect((next.input as typeof input).system).toBe(discussionSystem);
    expect((next.input as typeof input).messages.slice(0,1)).toEqual(first.input.messages);
  });
  it('appends selected candidate and instruction without rewriting the earlier request', () => {
    const next = continueConversation(item, candidate, say, { instruction: '改最后一句', mode: 'write' });
    const request = next.input as typeof input;
    expect(request.messages.slice(0, 1)).toEqual(input.messages);
    expect(request.messages[1]).toEqual({ role: 'assistant', text: say, attachments: [] });
    expect(request.messages[2]!.text).toContain('改最后一句');
    expect(input.messages).toHaveLength(1);
    expect(next.conversation?.parentCandidateId).toBe(candidate.id);
  });
  it('keeps initial facts while replacing intermediate turns with an author-confirmed summary', () => {
    const old = { ...item, input: { ...input, messages: [...input.messages, { role: 'assistant', text: '旧版本', attachments: [] }, { role: 'user', text: '旧要求', attachments: [] }] } } as TaskItem;
    const next = continueConversation(old, candidate, say, { instruction: '继续', mode: 'write', summary: '已经约定明天出发' });
    const request = next.input as typeof input;
    expect(request.messages[0]).toEqual(input.messages[0]);
    expect(request.messages.map(m => m.text).join('\n')).toContain('已经约定明天出发');
    expect(request.messages.map(m => m.text)).not.toContain('旧版本');
  });
  it('restores the original script contract after a discussion round', () => {
    const discussion = continueConversation(item, candidate, '建议先铺垫矛盾', { instruction: '讨论一下', mode: 'discuss' });
    const next = continueConversation(discussion, candidate, '好，确定了', { instruction: '写出剧情', mode: 'write' });
    expect((next.input as typeof input).system).toBe(input.system);
  });
  it('rejects dialogue/branch changes while allowing voice and stage additions', () => {
    expect(performanceConflicts(say, say.replace('星光亮了', '天亮了'))[0]?.code).toBe('PERFORMANCE_TEXT_CHANGED');
    expect(performanceConflicts(say, say.replace('"text":"星光亮了"', '"text":"星光亮了","voice":null'))).toEqual([]);
    const branch = `getUserInput {"variableId":"${id}","prompt":"姓名"} @12345678-1234-4234-8234-123456789abd;`;
    expect(performanceConflicts(say + branch, say)).toHaveLength(1);
    expect(performanceConflicts(say, `wait {"durationMs":100} @12345678-1234-4234-8234-123456789abe;\n${say}`)).toEqual([]);
  });
  it('distinguishes an actual zero from missing usage', () => {
    expect(generationUsage(null).cacheHit).toBeNull();
    expect(generationUsage({ prompt_tokens: 200, completion_tokens: 12, prompt_cache_hit_tokens: 0 }).cacheHit).toBe(0);
    expect(generationUsage({ prompt_tokens_details: { cached_tokens: 128 } }).cacheHit).toBe(128);
  });
});
