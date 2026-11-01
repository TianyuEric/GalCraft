import { describe, expect, it } from 'vitest';
import { parsePrompt } from './recipe-preparer.js';
import { defaultNovelAISettings, emptyNovelAIPrompt, novelAIBasePrompt, novelAIRequestDesign } from '@galcraft/generation-services/novelai';
describe('NovelAI fixed prompt contract', () => {
  it('keeps ordered character blocks, individual negatives and positions', () => {
    const value = { ...emptyNovelAIPrompt(), basePrompt: '2girls', characters: [{ name: 'A', prompt: 'long hair', negativePrompt: 'hat', position: { x: 0, y: 1 } }, { name: 'B', prompt: 'short hair', negativePrompt: null, position: null }] };
    expect(parsePrompt(JSON.stringify(value), 'novelaiPrompt')).toEqual({ ok: true, value, warnings: [] });
    expect(parsePrompt(JSON.stringify({ kind: 'imagePrompt', format: 'tags', positive: 'old', negative: null }), 'imagePrompt').ok).toBe(true);
  });
  it('locates invalid structures without accepting a generic image fallback', () => {
    const value = { ...emptyNovelAIPrompt(), characters: [{ name: 'A', prompt: 'hair', negativePrompt: null, position: { x: 2, y: 0 } }] };
    const result = parsePrompt(JSON.stringify(value), 'novelaiPrompt');
    expect(result.ok).toBe(false); if (!result.ok) expect(result.error.message).toContain('characters.0.position.x');
    expect(parsePrompt('{"kind":"novelaiPrompt","basePrompt":"only"}', 'novelaiPrompt').ok).toBe(false);
  });
  it('appends selected quality terms once and keeps the API design explicitly unverified', () => {
    const value = { ...emptyNovelAIPrompt(), basePrompt: 'visual novel sprite, no text, very aesthetic' }, settings = { ...defaultNovelAISettings(), quality: 'standard' as const, transparent: true };
    const expanded = novelAIBasePrompt(value, settings);
    expect(expanded.match(/no text/g)).toHaveLength(1); expect(expanded).toContain('transparent background');
    expect(novelAIRequestDesign(value, settings)).toMatchObject({ exactModel: null, status: 'requires-account-verification', automaticResubmission: false });
  });
});
