import type { AssetTypeDefinition, PluginDefinition } from '@galcraft/plugins/contracts';
import { ResourceCapabilitiesSchema } from '@galcraft/contracts';
import { legacyResolver, pluginId, resourceKey, stageKey } from './metadata.js';
export const modelType: AssetTypeDefinition = {
  contractVersion: 1, key: `${pluginId}/model`, builtinKind: 'live2d', typeVersion: 1,
  title: 'Live2D', description: 'Cubism model3 model resource group', titleKey: `${pluginId}/model/title`, descriptionKey: `${pluginId}/model/description`,
  messages: { 'zh-CN': { [`${pluginId}/model/title`]: 'Live2D', [`${pluginId}/model/description`]: 'Cubism model3 模型资源组' }, en: { [`${pluginId}/model/title`]: 'Live2D', [`${pluginId}/model/description`]: 'Cubism model3 model resource group' }, ja: { [`${pluginId}/model/title`]: 'Live2D', [`${pluginId}/model/description`]: 'Cubism model3 モデルの素材グループ' } }, icon: 'person-standing', group: 'visual',
  schema: { type: 'object', required: ['capabilities', 'model'], additionalProperties: false,
    properties: { capabilities: { type: 'object' }, model: { type: 'object' } } }, fields: [], extensions: ['.model3.json'], targets: ['web', 'windows'],
  resourceProviderKey: resourceKey, resourceProviderAliases: [legacyResolver], stageProviderKey: stageKey,
  editorKey: `${pluginId}/inspector`, previewKey: `${pluginId}/preview`, thumbnailKey: `${pluginId}/thumbnail`,
  capabilities: ['visual', 'motion', 'expression', 'parameters', 'amplitudeLip', 'motionSync', 'capture', 'pause'],
  validate(value) {
    const data = value as { capabilities?: unknown; model?: unknown };
    const checked = ResourceCapabilitiesSchema.safeParse(data?.capabilities);
    if (checked.success && checked.data.resolver === resourceKey && checked.data.resolverVersion === '0.1.0' && data.model && typeof data.model === 'object' && !Array.isArray(data.model)) return { ok: true, value, warnings: [] };
    const error = { code: 'LIVE2D_TYPE_DATA', message: 'Live2D 模型能力与精确提供方数据不符', severity: 'error' as const, owner: 'M04' as const, related: [], actions: ['supplyDependency' as const] };
    return { ok: false, error, issues: [error] };
  },
  collectReferences: () => [], rewriteReferences: value => ({ ok: true, value, warnings: [] }),
};
export const definition: PluginDefinition = { assetTypes: [modelType], messages: modelType.messages };
