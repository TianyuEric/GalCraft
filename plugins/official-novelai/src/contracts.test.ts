import { expect, it } from 'vitest';
import { validateJsonData } from '@galcraft/contracts';
import { defaultNovelAISettings, emptyNovelAIPrompt } from '@galcraft/generation-services/novelai';
import { createPlugin } from './services.js';
import { imageOperation } from './definition.js';

it('checks native and extension image inputs offline, including actual nested references and null usage', async () => {
  const plugin = createPlugin(), contributions = await plugin.activate({} as never);
  try {
    const provider = contributions.generationProviders!.find(value => value.purposes.includes('org.galcraft.novelai/image'))!;
    const prompt = emptyNovelAIPrompt(), settings = defaultNovelAISettings();
    const native = { purpose: 'image', usage: 'cg', positive: '', negative: '', width: 1024, height: 1024, count: 1, seed: null, references: [], novelai: { prompt, settings } };
    const fields = { novelaiPrompt: prompt, novelaiSettings: settings, width: 1024, height: 1024, count: 1, usage: 'cg' };
    const extension = { purpose: 'org.galcraft.novelai/image', fields, references: [] };
    expect(validateJsonData(provider.inputSchema, native).ok).toBe(true);
    expect(validateJsonData(provider.inputSchema, extension).ok).toBe(true);
    expect(validateJsonData(provider.inputSchema, { ...native, novelai: { prompt: {}, settings: {} } }).ok).toBe(false);
    expect(validateJsonData(provider.inputSchema, { ...extension, fields: { ...fields, novelaiReference: { mode: 'vibe', strength: 2, informationExtracted: 1 } } }).ok).toBe(false);
    expect(validateJsonData(imageOperation.inputSchema, { ...fields, novelaiPromptSource: { candidateId: 'Cand01', taskId: 'Task01', itemId: 'Item01', contract: 'novelaiPrompt', contractVersion: 1 } }).ok).toBe(true);
    expect(validateJsonData(provider.outputSchema, { artifacts: [], usage: null }).ok).toBe(true);
    expect(validateJsonData(provider.outputSchema, { artifacts: [{ kind: 'image', localPath: '/tmp/image.png' }], usage: null }).ok).toBe(false);
  } finally { await plugin.deactivate(); }
});
