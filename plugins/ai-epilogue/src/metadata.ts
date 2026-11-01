import type { PluginManifest } from '@galcraft/plugins/contracts';
import { pluginId } from './model.js';

export const pluginMetadata: PluginManifest = {
  schemaVersion: 2, id: pluginId, name: 'AI 后日谈 · 作者配置', version: '0.1.0',
  description: '目前提供作者配置和上下文预览；玩家互动、轮次保存及恢复尚未完整交付，暂不推荐使用。',
  localizations: {
    en: { name: 'AI Epilogue · Author Settings', description: 'Currently provides author settings and context previews. Player interaction, turn saving and restoration are not fully delivered; use is not recommended yet.' },
    ja: { name: 'AI アフターストーリー · 作者設定', description: '現在は作者設定とコンテキストのプレビューを提供します。プレイヤーとの対話、ターンの保存と復元は未完成のため、現時点では利用を推奨しません。' },
  },
  author: 'GalCraft', license: 'MPL-2.0', homepage: null, engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [],
  entry: { runtime: null, editor: 'editor/index.js', definition: 'definition/index.js' }, files: [],
  contributions: [{ kind: 'document', key: `${pluginId}/config`, targets: ['web', 'windows'], required: false }],
  studio: [{ key: `${pluginId}/authoring`, kind: 'workbench', slot: 'extensions.navigation' },
    { key: `${pluginId}/settings`, kind: 'panel', slot: 'plugins.configuration' },
    { key: `${pluginId}/context-preview`, kind: 'dialog', slot: 'plugins.configuration' }],
  stateVersions: { document: 1, progress: 0, longTerm: 0 }, native: [],
};
