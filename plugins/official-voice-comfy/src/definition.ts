import { productionMessages } from '@galcraft/plugins/contracts';
import translations from './display-translations.json' with { type: 'json' };
import type { FieldSpec, Json, ProductionOperationDefinition } from '@galcraft/contracts';
import type { PluginDefinition } from '@galcraft/plugins/contracts';
import workflows from './workflows.json' with { type: 'json' };
export const pluginId = 'org.galcraft.voice-comfy';
export const providerKey = 'org.galcraft.comfyui/comfyUI';
export const capabilities = { query: true, refetch: true, cancelPerTask: true, resume: true };
const field = (path: string, label: string, type: FieldSpec['type'], value: Json, extra: Partial<FieldSpec> = {}): FieldSpec => ({ path, label, type, default: value, required: true, nullable: false, description: '', unit: 'none', group: 'basic', summary: true, keywords: [], ...extra });
const modes = [
  ['breezeDesign', 'Breeze · Voice design', 'voiceDescription', false],
  ['breezeClone', 'Breeze · Reference clone', null, true],
  ['breezeDirection', 'Breeze · Performance direction', 'performanceInstruction', true],
  ['irodoriDesign', 'Irodori · Voice design', 'voiceDescription', false],
  ['irodoriClone', 'Irodori · Reference clone', null, true],
  ['irodoriDirection', 'Irodori · Reference and direction', 'performanceInstruction', true],
] as const;
export const operations: ProductionOperationDefinition[] = modes.map(([mode, title, instruction, reference]) => {
  const breeze = mode.startsWith('breeze');
  const fields = [field('text', 'Spoken text', 'string', ''), field('language', 'Target language', 'enum', breeze ? 'zh' : 'ja', { enumValues: breeze ? ['zh', 'en'] : ['ja'] }),
    ...(instruction ? [field(instruction, instruction === 'voiceDescription' ? 'Voice description' : 'Performance', 'string', '')] : []),
    ...(reference && breeze ? [field('referenceText', 'Exact reference transcript', 'string', '')] : []),
    field('seed', 'Seed', 'integer', 42, { min: 0, max: 2147483647, group: 'advanced' })];
  const properties: Record<string, Json> = Object.fromEntries(fields.map((f): [string, Json] => [f.path, f.type === 'integer' ? { type: 'integer', minimum: f.min!, maximum: f.max! } : f.type === 'enum' ? { enum: f.enumValues! } : { type: 'string', minLength: 1 }]));
  return { contractVersion: 1, id: `${pluginId}/${mode}`, version: 1, title,
    description: breeze ? 'ComfyUI Breeze TTS 2 supports Chinese and English. Design uses voiceDescription. Clone and Direction require referenceAudio plus its exact referenceText; Direction also uses performanceInstruction. These fields enter separate workflow nodes. Check applicable model and output licenses.' : 'ComfyUI Irodori v4.1 Small supports Japanese. Design uses voiceDescription; Clone uses referenceAudio; Direction adds performanceInstruction. The current reference workflow has no transcript input. caption carries voice description or performance according to the chosen mode.',
    providerKey, connection: {purpose:'speech',protocols:['comfyUI']}, execution:'remote', purpose: `${pluginId}/${mode}`, fields,
    inputSchema: { type: 'object', required: fields.map(f => f.path), additionalProperties: false, properties },
    inputs: [{ key: 'text', type: 'text', required: true, multiple: false, mimeTypes: ['text/plain'] }, ...(reference ? [{ key: 'referenceAudio', type: 'audio' as const, required: true, multiple: false, mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac'] }] : [])],
    outputs: [{ key: 'audio', type: 'audio', required: true, multiple: false, mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg'] }], capabilities,
    presets: [{ id: ({ breezeDesign: 'BzDsgn', breezeClone: 'BzClon', breezeDirection: 'BzDrct', irodoriDesign: 'IrDsgn', irodoriClone: 'IrClon', irodoriDirection: 'IrDrct' } as const)[mode],
      name: title, description: `Prepare ${breeze ? 'Chinese or English' : 'Japanese'} speech. ${reference ? `Choose reference audio${breeze ? ' and its exact transcript' : ''}. ` : ''}Fill the spoken text and review the frozen execution plan.`,
      defaults: { language: breeze ? 'zh' : 'ja', seed: 42,
        ...(instruction ? { [instruction]: instruction === 'voiceDescription' ? breeze ? '自然、温和、清晰的年轻成人声音，适合叙事对白。' : '自然で落ち着いた若い大人の声。物語の会話向け。' : breeze ? '语气温柔、节奏自然，保持参考声线。' : '参照音声の声質を保ち、穏やかで自然な口調で話す。' } : {}) } }],
    adoption: { kind: 'asset', assetKind: 'audio', usages: ['voice'] }, workflow: (workflows as unknown as Record<string, Json>)[mode]!,
  };
});
const messages = productionMessages(operations, translations);
export function createDefinition(): PluginDefinition { return { productionOperations: operations, messages }; }
