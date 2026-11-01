import { productionMessages } from '@galcraft/plugins/contracts';
import translations from './display-translations.json' with { type: 'json' };
import type { FieldSpec, Json, ProductionOperationDefinition } from '@galcraft/contracts';
import type { PluginDefinition } from '@galcraft/plugins/contracts';

export const pluginId = 'org.galcraft.voicestudio';
export const providerKey = `${pluginId}/voiceStudio`;
export const capabilities = { query: false, refetch: false, cancelPerTask: false, resume: false };
const field = (path: string, label: string, type: FieldSpec['type'], value: Json, extra: Partial<FieldSpec> = {}): FieldSpec => ({ path, label, type, default: value,
  required: false, nullable: value === null, description: '', unit: 'none', group: 'basic', summary: true, keywords: [], ...extra });
const audio = { key: 'referenceAudio', type: 'audio' as const, required: false, multiple: false, mimeTypes: ['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/webm'] };
const common = [field('text', 'Spoken text', 'string', ''), field('language', 'Target language', 'string', 'en'),
  field('voiceId', 'Saved voice / engine preset', 'string', '', { nullable: true }), field('referenceText', 'Exact reference transcript', 'string', '', { nullable: true }),
  field('voiceDescription', 'Voice design attributes / description', 'string', ''), field('performanceInstruction', 'Performance instruction', 'string', ''),
  field('speed', 'Speed', 'number', 1, { min: .25, max: 4 }), field('seed', 'Seed', 'integer', null, { group: 'advanced' })];
export const operations: ProductionOperationDefinition[] = (['speech', 'design', 'clone', 'transcribe'] as const).map(mode => {
  const transcribe = mode === 'transcribe';
  const fields = transcribe ? [field('language', 'Recording language (optional ISO code)', 'string', '')] : common;
  const properties: Record<string, Json> = Object.fromEntries(fields.map((item): [string, Json] => [item.path, item.type === 'number' ? { type: 'number', minimum: .25, maximum: 4 }
    : item.type === 'integer' ? { type: ['integer', 'null'] } : { type: item.nullable ? ['string', 'null'] : 'string' }]));
  return { contractVersion: 1, id: `${pluginId}/${mode}`, version: 1, purpose: `${pluginId}/${mode}`, providerKey,
    title: ({ speech: 'VoiceStudio · Speech', design: 'VoiceStudio · Voice design', clone: 'VoiceStudio · Reference clone', transcribe: 'VoiceStudio · Reference transcription' })[mode],
    description: transcribe ? 'Transcribe reference audio with the actual active ASR engine. Review and edit the text candidate, then transfer it to the clone draft. No speech is generated.'
      : 'Use the selected connection’s actual engine, model and saved voice. OmniVoice accepts voice-design attributes; performance instructions are exposed only for a confirmed engine endpoint. Review the installed model’s source and conditions before use. Local abort does not confirm remote cancellation.',
    connection: { purpose: 'speech', protocols: ['voiceStudio'] }, execution: 'remote', fields,
    fieldEditorKey: `${pluginId}/${mode}Editor`,
    inputSchema: { type: 'object', properties, additionalProperties: false },
    inputs: transcribe || mode === 'clone' ? [{ ...audio, required: true }] : mode === 'speech' ? [audio] : [],
    outputs: [{ key: transcribe ? 'transcript' : 'audio', type: transcribe ? 'text' : 'audio', required: true, multiple: false, mimeTypes: [transcribe ? 'text/plain' : 'audio/wav'] }],
    capabilities, adoption: transcribe ? { kind: 'text' } : { kind: 'asset', assetKind: 'audio', usages: ['voice'] },
    ...(transcribe ? { textTransfer: { operation: `${pluginId}/clone` as const, field: 'referenceText' } } : {}),
    presets: [{ id: ({ speech: 'VsSpch', design: 'VsDsgn', clone: 'VsClon', transcribe: 'VsTrns' })[mode], name: `VoiceStudio ${mode}`, description: 'Discover the selected connection, fill the actual inputs and review the frozen plan.', defaults: {} }],
  };
});
const messages = productionMessages(operations, translations);
export function createDefinition(): PluginDefinition { return { productionOperations: operations, messages }; }
