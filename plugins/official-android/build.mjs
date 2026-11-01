import { stageOfficialPluginLicenses } from '../../tools/plugin-development/license-notices.mjs';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
await mkdir('package/services', { recursive: true });
await writeFile('package/definition.mjs', 'export const definition = {};\n');
for (const name of ['services.mjs', 'toolchain.mjs']) await cp(`src/${name}`, `package/services/${name}`);
await cp('templates', 'package/templates', { recursive: true });
await writeFile('package/package.json', '{"type":"module","license":"MPL-2.0"}');
await stageOfficialPluginLicenses('package');
const files = [];
async function walk(path, prefix = '') { for (const item of await readdir(path, { withFileTypes: true })) { const name = `${prefix}${item.name}`;
  if (item.isDirectory()) await walk(join(path, item.name), `${name}/`); else if (name !== 'manifest.json') files.push({ path: name, size: (await readFile(join(path, item.name))).length }); } }
await walk('package');
await writeFile('package/manifest.json', JSON.stringify({ schemaVersion: 2, id: 'org.galcraft.android', name: 'Android target', version: '0.1.0',
  description: '导出 WebView Player 的 Android 工程，或使用外部 JDK、Android SDK 和 Gradle 构建 APK/AAB；发行签名由作者配置，设备运行需另行验证。',
  localizations: {
    en: { name: 'Android target', description: 'Export a WebView Player Android project, or build APK/AAB with an external JDK, Android SDK and Gradle toolchain. Authors configure release signing; device execution needs separate verification.' },
    ja: { name: 'Android ターゲット', description: 'WebView Player の Android 工程を出力し、外部の JDK・Android SDK・Gradle で APK/AAB をビルドします。配布用署名は作者が設定し、実機動作は別途検証が必要です。' },
  },
  author: 'GalCraft', license: 'MPL-2.0', homepage: 'https://developer.android.com/', engineRange: '^0.1.0', sdkMajor: 0,
  targets: ['android'], dependencies: [], entry: { definition: 'definition.mjs', runtime: null, editor: null, services: 'services/services.mjs' }, files,
  contributions: [{ kind: 'targetBuilder', key: 'org.galcraft.android/build', targets: ['android'], required: true }], stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] }, null, 2));
