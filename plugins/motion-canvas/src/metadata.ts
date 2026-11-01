import type { PluginManifest } from '@galcraft/plugins/contracts';
import { pluginId, projectDocumentKey, operationId, renderProviderKey, toolchainKey } from './project.js';
import { projectToolKey } from './tools.js';
export const pluginMetadata: PluginManifest = {schemaVersion: 2, id: pluginId, name: 'Motion Canvas 视频', version: '0.1.0', description: '编辑并保留 TS/TSX 动画源，在本机渲染标准 MP4；需另行准备 Motion Canvas 工具链、Chromium 浏览器和媒体工具。',
  localizations: {
    en: {name: 'Motion Canvas Video', description: 'Edit and retain TS/TSX animation sources, then render standard MP4 locally. Requires a separately prepared Motion Canvas toolchain, Chromium browser and media tools.'},
    ja: {name: 'Motion Canvas 動画', description: 'TS/TSX のアニメーションソースを編集・保存し、ローカルで標準 MP4 をレンダリングします。Motion Canvas ツールチェーン、Chromium ブラウザーとメディアツールを別途用意してください。'},
  },
  author: 'GalCraft', license: 'MPL-2.0', homepage: 'https://github.com/motion-canvas/motion-canvas', engineRange: '^0.1.0', sdkMajor: 0, targets: ['windows','web'], dependencies: [], externalRuntimeDependencies: [toolchainKey],
  entry: {definition: 'definition/index.js', editor: 'editor/index.js', services: 'services/index.js', runtime: null}, files: [], externalTools: [projectToolKey], contributions: [
    {kind: 'document', key: projectDocumentKey, targets: ['windows','web'], required: true}, {kind: 'productionOperation', key: operationId, targets: ['windows'], required: true}, {kind: 'generationProvider', key: renderProviderKey, targets: ['windows'], required: true}, {kind: 'tool', key: projectToolKey, targets: ['windows'], required: true},
  ], stateVersions: {document: 1, progress: 0, longTerm: 0}, native: []};
