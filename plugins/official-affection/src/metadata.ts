import type { PluginManifest } from '@galcraft/plugins/contracts';
export const pluginMetadata: PluginManifest = {
  schemaVersion: 2, id: 'org.galcraft.affection', name: '好感度', version: '0.1.0', description: '角色关系数值、条件与关系页',
  localizations: {
    en: { name: 'Affection', description: 'Character relationship values, conditions and relationship page' },
    ja: { name: '好感度', description: 'キャラクターの関係値、条件と関係ページ' },
  },
  author: 'GalCraft', license: 'MPL-2.0', homepage: null, engineRange: '^0.1.0', sdkMajor: 0, targets: ['web','windows'], dependencies: [],
  entry: { runtime: 'runtime/index.js', editor: null, definition: 'definition/index.js' }, files: [],
  contributions: ([['command','add'],['command','set'],['command','interact'],['condition','compare'],['document','config'],['system','state'],['page','relations'],['component','hud']] as const)
    .map(([kind,key]) => ({ kind, key: `org.galcraft.affection/${key}`, targets: ['web','windows'], required: true })),
  stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [],
};
