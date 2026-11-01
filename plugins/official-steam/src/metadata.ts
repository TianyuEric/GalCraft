import type { PluginManifest } from '@galcraft/plugins/contracts';
export const pluginMetadata: PluginManifest = {
  schemaVersion: 1, id: 'org.galcraft.steam', name: 'Steam', version: '0.1.0', description: 'Windows x64 Steam 成就接入与 Studio 试玩模拟；需作者 AppID 和 Steam 环境，真实账号解锁需另行验证。',
  localizations: {
    en: { name: 'Steam', description: 'Windows x64 Steam achievements and Studio playtest simulation. Requires an author AppID and Steam environment; real account unlocks need separate verification.' },
    ja: { name: 'Steam', description: 'Windows x64 の Steam 実績連携と Studio のテストプレイ用シミュレーション。作者の AppID と Steam 環境が必要で、実アカウントでの解除は別途検証が必要です。' },
  },
  author: 'GalCraft', license: 'MPL-2.0', homepage: null, engineRange: '^0.1.0', sdkMajor: 0, targets: ['web','windows'], dependencies: [],
  entry: { runtime: 'runtime/index.js', editor: null, services: 'services/index.mjs' }, files: [],
  contributions: [{ kind: 'platform', key: 'org.galcraft.steam/achievement', targets: ['web','windows'], required: true },
    { kind: 'publishCheck', key: 'org.galcraft.steam/configuration', targets: ['windows'], required: true }],
  stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [{ target: 'windows', arch: 'x64', entry: 'native/windows-x64/index.mjs' }],
};
