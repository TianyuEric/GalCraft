import type { PluginManifest } from '@galcraft/plugins/contracts';
import { pluginId, operationId, scoreDocumentKey } from './score.js';
export const editorKey = `${pluginId}/workstation`;
export const documentEditorKey = `${pluginId}/scoreEditor`;
export const writingOperationId = `${pluginId}/writeScore` as const;
export const writingPreparationKey = `${pluginId}/writing` as const;
export const renderProviderKey = `${pluginId}/renderProvider`;
export const soundbankToolKey = `${pluginId}/soundbankInfo`;
export const pluginMetadata: PluginManifest = {
  schemaVersion: 2, id: pluginId, name: '可编辑编曲', version: '0.1.0', description: '编辑多轨乐谱、试听采样音色并在本机渲染音乐；需已安装乐谱指定的精确音色库，文字作曲另需兼容文字连接。', author: 'GalCraft', license: 'MPL-2.0', homepage: null,
  localizations: {
    en: { name: 'Editable Music Composition', description: 'Edit multitrack scores, preview sampled instruments and render music locally. Requires the exact soundbank selected by the score; text-assisted composition also needs a compatible text connection.' },
    ja: { name: '編集可能な編曲', description: 'マルチトラック楽譜を編集し、サンプル音源の試聴とローカル音楽レンダリングを行います。楽譜が指定する正確な音源が必要で、文章からの作曲には対応テキスト接続も必要です。' },
  },
  engineRange: '^0.1.0', sdkMajor: 0, targets: ['windows', 'web'], dependencies: [],
  externalRuntimeDependencies: [`${pluginId}/hq`, `${pluginId}/basic`, `${pluginId}/soundbanks`],
  externalTools:[soundbankToolKey],
  entry: { definition: 'definition/index.js', editor: 'editor/index.js', services: 'services/index.js', runtime: null }, files: [],
  contributions: [
    {kind:'tool',key:soundbankToolKey,targets:['windows'],required:true},
    { kind: 'productionOperation', key: writingOperationId, targets: ['windows'], required: true },
    { kind: 'textPreparation', key: writingPreparationKey, targets: ['windows'], required: true },
    { kind: 'document', key: scoreDocumentKey, targets: ['windows', 'web'], required: true },
    { kind: 'productionOperation', key: operationId, targets: ['windows'], required: true },
    { kind: 'fieldEditor', key: editorKey, targets: ['windows'], required: true },
    { kind: 'fieldEditor', key: `${editorKey}-writing`, targets: ['windows'], required: true },
    { kind: 'fieldEditor', key: documentEditorKey, targets: ['windows', 'web'], required: true },
    { kind: 'generationProvider', key: renderProviderKey, targets: ['windows'], required: true },
  ], stateVersions: { document: 1, progress: 0, longTerm: 0 }, native: [],
};
