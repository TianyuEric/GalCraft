import type { FieldSpec, ProductionOperationDefinition } from '@galcraft/contracts';
import type { PluginDefinition } from '@galcraft/plugins/contracts';
export const operationId = 'org.example.video/generate' as const;
export const capabilities = { query: true, refetch: true, cancelPerTask: true, resume: true };
const field = (path: string, label: string, type: FieldSpec['type'], value: FieldSpec['default'], extra: Partial<FieldSpec> = {}): FieldSpec => ({ path, label, type, default: value, required: true, nullable: false, description: '', unit: 'none', group: 'basic', summary: true, keywords: [], ...extra });
export const fields = [field('prompt', '视频描述 / Prompt', 'string', 'A calm blue ocean at sunset'), field('model', '模型 / Model', 'enum', 'MiniMax H3', { enumValues: ['MiniMax H3'] }), field('resolution', '分辨率 / Resolution', 'enum', '768P', { enumValues: ['768P', '1080P'] }), field('ratio', '画幅 / Ratio', 'enum', '16:9', { enumValues: ['16:9', '9:16', '1:1'] }), field('duration', '时长（秒） / Duration', 'integer', 5, { min: 1, max: 15 }), field('seed', '种子 / Seed', 'integer', 42, { min: 0, max: 2147483647 }), field('watermark', '水印 / Watermark', 'boolean', false)];
export const operation: ProductionOperationDefinition = {
  contractVersion: 1, id: operationId, version: 1, title: '视频 · MiniMax H3 模拟 API', description: '本地协议模拟；真实可播放视频验证，未连接模型或供应商。Local simulation; no model or supplier validation.',
  providerKey: 'org.example.video/provider', purpose: operationId, fields,
  inputSchema: { type: 'object', required: fields.map(field => field.path), additionalProperties: false, properties: { prompt: { type: 'string', minLength: 1 }, model: { const: 'MiniMax H3' }, resolution: { enum: ['768P', '1080P'] }, ratio: { enum: ['16:9', '9:16', '1:1'] }, duration: { type: 'integer', minimum: 1, maximum: 15 }, seed: { type: 'integer', minimum: 0, maximum: 2147483647 }, watermark: { type: 'boolean' } } },
  inputs: [{ key: 'prompt', type: 'text', required: true, multiple: false, mimeTypes: ['text/plain'] }, { key: 'references', type: 'image', required: false, multiple: true, mimeTypes: ['image/png', 'image/jpeg', 'image/webp'] }],
  outputs: [{ key: 'video', type: 'video', required: true, multiple: false, mimeTypes: ['video/mp4'] }],
  capabilities, fieldEditorKey: 'org.example.video/input', adoption: { kind: 'asset', assetKind: 'video', usages: ['background', 'cg'] },
};
export function createDefinition(): PluginDefinition { return { productionOperations: [operation] }; }
