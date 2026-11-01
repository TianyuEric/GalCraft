import type { PluginManifest } from '@galcraft/plugins/contracts';
export const pluginId = 'org.galcraft.live2d';
export const resourceKey = `${pluginId}/resource`;
export const stageKey = `${pluginId}/stage`;
export const runtimeKey = `${pluginId}/cubism`;
export const legacyResolver = 'galcraft.live2d';
export const pluginMetadata: PluginManifest = {
  schemaVersion: 2, id: pluginId, name: 'Live2D', version: '0.1.0', description: '导入、编辑和演出 Cubism 模型；需另行导入匹配的官方 Cubism 运行时，启用 MotionSync 时还需对应 Core。',
  localizations: {
    en: { name: 'Live2D', description: 'Import, edit and animate Cubism models. Import a matching official Cubism runtime separately, plus the corresponding Core when using MotionSync.' },
    ja: { name: 'Live2D', description: 'Cubism モデルを読み込み、編集・演出します。対応する公式 Cubism ランタイムを別途導入し、MotionSync を使う場合は対応 Core も用意してください。' },
  },
  author: 'GalCraft', license: 'MPL-2.0', homepage: 'https://www.live2d.com/', engineRange: '^0.1.0', sdkMajor: 0,
  targets: ['web', 'windows'], dependencies: [],
  externalRuntimeDependencies: [runtimeKey],
  entry: { definition: 'definition/index.js', services: 'services/index.js', runtime: 'runtime/index.js', editor: 'editor/index.js' }, files: [],
  contributions: [['assetType', 'model'], ['resource', 'resource'], ['stage', 'stage'], ['assetEditor', 'inspector'], ['assetPreview', 'preview'], ['assetThumbnail', 'thumbnail']].map(([kind, key]) => ({
    kind: kind as PluginManifest['contributions'][number]['kind'], key: `${pluginId}/${key}`, targets: ['web', 'windows'], required: true,
  })),
  stateVersions: { document: 0, progress: 1, longTerm: 0 }, native: [],
};
