import { stageOfficialPluginLicenses } from '../../tools/plugin-development/license-notices.mjs';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
await mkdir('package/services', { recursive: true }); await cp('src/services.mjs', 'package/services/services.mjs');
await cp('templates', 'package/templates', { recursive: true }); await writeFile('package/definition.mjs', 'export const definition = {};\n'); await writeFile('package/package.json', '{"type":"module","license":"MPL-2.0"}');
await stageOfficialPluginLicenses('package');
const files = [];
async function walk(path, prefix = '') { for (const item of await readdir(path, { withFileTypes: true })) { const name = `${prefix}${item.name}`;
  if (item.isDirectory()) await walk(join(path, item.name), `${name}/`); else if (name !== 'manifest.json') files.push({ path: name, size: (await readFile(join(path, item.name))).length }); } }
await walk('package');
await writeFile('package/manifest.json', JSON.stringify({ schemaVersion: 2, id: 'org.galcraft.ios', name: 'iOS target', version: '0.1.0',
  description: '导出 WKWebView Player 的 Xcode 工程；归档需 macOS、Xcode 和作者的 Apple 签名配置，设备运行需另行验证。',
  localizations: {
    en: { name: 'iOS target', description: 'Export a WKWebView Player Xcode project. Archiving requires macOS, Xcode and the author’s Apple signing configuration; device execution needs separate verification.' },
    ja: { name: 'iOS ターゲット', description: 'WKWebView Player の Xcode プロジェクトを出力します。アーカイブには macOS、Xcode と作者の Apple 署名設定が必要で、実機動作は別途検証が必要です。' },
  },
  author: 'GalCraft', license: 'MPL-2.0', homepage: 'https://developer.apple.com/', engineRange: '^0.1.0', sdkMajor: 0,
  targets: ['ios'], dependencies: [], entry: { definition: 'definition.mjs', runtime: null, editor: null, services: 'services/services.mjs' }, files,
  contributions: [{ kind: 'targetBuilder', key: 'org.galcraft.ios/build', targets: ['ios'], required: true }], stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] }, null, 2));
