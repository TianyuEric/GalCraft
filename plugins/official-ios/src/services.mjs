import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const templates = fileURLToPath(new URL('../templates/', import.meta.url));
const ok = value => ({ ok: true, value, warnings: [] });
const fail = (code, message) => { const error = { code, message, owner: 'M11', severity: 'error', related: [], actions: ['edit'] }; return { ok: false, error, issues: [error] }; };
export const optionsSchema = { type: 'object', required: ['bundleId', 'buildNumber', 'output'], additionalProperties: false, properties: {
  bundleId: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9-]*(\\.[A-Za-z][A-Za-z0-9-]*)+$' }, buildNumber: { type: 'string', pattern: '^\\d+(\\.\\d+){0,2}$' },
  orientation: { enum: ['landscape', 'sensorLandscape'] }, minimumOSVersion: { const: '15.0' }, output: { enum: ['xcodeProject', 'archive'] },
  developmentTeam: { type: 'string' }, signingProfileId: { type: ['string', 'null'] },
} };
function options(value) {
  if (!value || typeof value !== 'object' || !/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/.test(value.bundleId ?? '') || !/^\d+(\.\d+){0,2}$/.test(value.buildNumber ?? '') || !['xcodeProject', 'archive'].includes(value.output) ||
    value.minimumOSVersion !== undefined && value.minimumOSVersion !== '15.0' || value.orientation !== undefined && !['landscape', 'sensorLandscape'].includes(value.orientation)) throw new Error('请填写合法 Bundle ID、构建序号和输出；此工程最低 iOS 15.0。');
  if (value.output === 'archive' && process.platform !== 'darwin') throw new Error('Xcode 归档需要 macOS；当前系统可导出完整 Xcode 工程。');
  if (value.output === 'archive' && !/^[A-Z0-9]{10}$/.test(value.developmentTeam ?? '')) throw new Error('请填写 Apple 开发团队 ID，或选择工程导出后在 Xcode 配置签名。');
  return value;
}
function xcode(args, signal, progress) { return new Promise((resolve, reject) => { const child = spawn('xcodebuild', args, { windowsHide: true }); let output = '';
  const abort = () => child.kill('SIGTERM'); signal.addEventListener('abort', abort, { once: true });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output = (output + data).slice(-100000); progress({ phase: 'building', message: String(data).trim().slice(-1000), completed: 0, total: null }); });
  child.on('error', reject); child.on('close', code => { signal.removeEventListener('abort', abort); code || signal.aborted ? reject(new Error(signal.aborted ? 'BUILD_CANCELLED' : output)) : resolve(); }); }); }
async function size(path) { const info = await stat(path); if (info.isFile()) return info.size; let total = 0; for (const item of await readdir(path)) total += await size(join(path, item)); return total; }
export const builder = {
  key: 'org.galcraft.ios/build', version: '0.1.0', target: 'ios',
  async describe() { return { key: this.key, version: this.version, target: this.target, name: 'iOS', architectures: ['arm64'],
    environments: [{ os: 'win32', arch: 'x64', outputs: ['xcodeProject'] }, { os: 'darwin', arch: 'arm64', outputs: ['xcodeProject', 'archive'] }, { os: 'darwin', arch: 'x64', outputs: ['xcodeProject', 'archive'] }, { os: 'linux', arch: 'x64', outputs: ['xcodeProject'] }],
    tools: [{ id: 'xcode', version: '16 or later / iOS 15 deployment target', purpose: 'macOS archive and signing; project export requires no Xcode', licenseUrl: 'https://developer.apple.com/support/terms/', external: true }],
    optionsSchema, entry: 'services/services.mjs', availability: { available: true, issues: [] } }; },
  async detect(input) { return ok({ directory: input.directory }); },
  async prepare(input) { return process.platform === 'darwin' ? ok({ directory: input.directory }) : fail('IOS_XCODE_MACOS', '当前系统可直接导出工程；请在 macOS 安装 Xcode 后打开工程或运行 build.sh。'); },
  async validate(value) { try { options(value); return []; } catch (error) { return fail('IOS_OPTIONS', String(error)).issues; } },
  async build(input, context) {
    try {
      const selected = options(input.options), root = input.stagingDirectory, project = join(root, 'ios-project');
      context.signal.throwIfAborted(); await cp(templates, project, { recursive: true });
      const assets = join(project, 'GalCraftPlayer/Game'); await mkdir(assets, { recursive: true });
      for (const item of await readdir(root)) if (item !== 'ios-project') await cp(join(root, item), join(assets, item), { recursive: true });
      const html = join(assets, input.webEntry); await writeFile(html, (await readFile(html, 'utf8')).replace('<head>', '<head><script src="mobile-host.js"></script>'));
      await cp(join(project, 'mobile-host.js'), join(assets, 'mobile-host.js'));
      const embeddedManifestPath = join(assets, 'release.manifest.json'), embeddedManifest = JSON.parse(await readFile(embeddedManifestPath, 'utf8'));
      for (const path of [input.webEntry, 'mobile-host.js']) { const file = { path, size: (await stat(join(assets, path))).size }, existing = embeddedManifest.files.find(item => item.path === path); if (existing) existing.size = file.size; else embeddedManifest.files.push(file); }
      await writeFile(embeddedManifestPath, JSON.stringify(embeddedManifest, null, 2));
      const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      const plist = join(project, 'GalCraftPlayer/Info.plist'); await writeFile(plist, (await readFile(plist, 'utf8')).replaceAll('__TITLE__', xml(input.project.name)).replaceAll('__VERSION__', input.plan.input.releaseVersion).replaceAll('__BUILD__', selected.buildNumber).replaceAll('__ORIENTATIONS__', selected.orientation === 'sensorLandscape' ? '<string>UIInterfaceOrientationLandscapeLeft</string><string>UIInterfaceOrientationLandscapeRight</string>' : '<string>UIInterfaceOrientationLandscapeLeft</string>'));
      const pbx = join(project, 'GalCraftPlayer.xcodeproj/project.pbxproj'); await writeFile(pbx, (await readFile(pbx, 'utf8')).replaceAll('__BUNDLE_ID__', selected.bundleId));
      context.progress({ phase: 'building', message: '完整 Xcode 工程已导出', completed: 1, total: 1 });
      let entry = 'ios-project/GalCraftPlayer.xcodeproj/project.pbxproj', handoff = { path: 'ios-project', kind: 'directory' };
      const artifacts = [{ path: 'ios-project', kind: 'xcodeProject', bytes: await size(project) }];
      if (selected.output === 'archive') {
        const destination = join(root, 'artifacts', 'GalCraftPlayer.xcarchive'); await mkdir(join(root, 'artifacts'), { recursive: true });
        const args = ['-project', join(project, 'GalCraftPlayer.xcodeproj'), '-scheme', 'GalCraftPlayer', '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-archivePath', destination,
          `DEVELOPMENT_TEAM=${selected.developmentTeam}`, selected.signingProfileId ? 'CODE_SIGN_STYLE=Manual' : 'CODE_SIGN_STYLE=Automatic', ...(selected.signingProfileId ? [`PROVISIONING_PROFILE_SPECIFIER=${selected.signingProfileId}`] : []), 'archive'];
        await xcode(args, context.signal, context.progress); artifacts.push({ path: 'artifacts/GalCraftPlayer.xcarchive', kind: 'archive', bytes: await size(destination) });
        entry = 'artifacts/GalCraftPlayer.xcarchive/Info.plist'; handoff = { path: 'artifacts/GalCraftPlayer.xcarchive', kind: 'archive' };
      }
      return ok({ entry, handoff, artifacts });
    } catch (error) { return fail(context.signal.aborted ? 'BUILD_CANCELLED' : 'IOS_BUILD_FAILED', String(error)); }
  },
};
export function createPlugin() { return { activate: async () => ({ commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [], pages: [], components: [], systems: [], platform: [], targetBuilders: [builder] }), deactivate: async () => {} }; }
