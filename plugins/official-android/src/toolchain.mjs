import { spawn } from 'node:child_process';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const versions = { java: '17', commandLineTools: '13114758', compileSdk: 35, buildTools: '35.0.0', gradle: '8.9', agp: '8.7.3' };
export const sdkLicenseUrl = 'https://developer.android.com/studio/terms';
export const ok = value => ({ ok: true, value, warnings: [] });
export const failure = (code, message) => { const error = { code, message, owner: 'M11', severity: 'error', related: [], actions: ['edit', 'retry'] }; return { ok: false, error, issues: [error] }; };
export async function exists(path) { try { return (await stat(path)).isFile(); } catch { return false; } }
export async function run(file, args, { signal, env, cwd, progress, input } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolveRun, reject) => {
    const process = spawn(file, args, { cwd, env: { ...globalThis.process.env, ...env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', settled = false;
    const abort = () => {
      if (globalThis.process.platform === 'win32') spawn('taskkill.exe', ['/pid', String(process.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      else process.kill('SIGTERM');
    };
    signal?.addEventListener('abort', abort, { once: true });
    const collect = chunk => { const value = String(chunk); output = (output + value).slice(-100000); progress?.(value); };
    process.stdout.on('data', collect); process.stderr.on('data', collect);
    process.on('error', error => { settled = true; signal?.removeEventListener('abort', abort); reject(error); });
    process.on('close', code => { if (settled) return; signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(new Error('BUILD_CANCELLED')); else if (code) reject(new Error(`${file} exited ${code}\n${output}`)); else resolveRun(output); });
    process.stdin.end(input ?? '');
  });
}
async function javaHome(selected) {
  const file = selected ? join(selected, 'bin', globalThis.process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  try { const text = await run(file, ['-XshowSettings:properties', '-version']);
    const major = Number(text.match(/java.version\s*=\s*(\d+)/)?.[1]);
    const home = text.match(/java.home\s*=\s*([^\r\n]+)/)?.[1]?.trim();
    if (![17, 21].includes(major) || !home || !await exists(join(home, 'bin', globalThis.process.platform === 'win32' ? 'javac.exe' : 'javac'))) return null;
    return home;
  } catch { return null; }
}
export function defaultDirectory() { return join(homedir(), '.galcraft', 'tools'); }
export async function locations(input) {
  const directory = resolve(input.directory || defaultDirectory()), own = join(directory, 'galcraft-android-0.1.0');
  let saved = {}; try { saved = JSON.parse(await readFile(join(own, 'toolchain.json'), 'utf8')); } catch {}
  let java = await javaHome(input.javaHome ?? saved.javaHome);
  if (!java && !input.javaHome && !saved.javaHome) {
    const installed = await readdir(join(own, 'jdk'), { withFileTypes: true }).catch(() => []);
    for (const item of installed.filter(item => item.isDirectory())) {
      java = await javaHome(join(own, 'jdk', item.name, ...(process.platform === 'darwin' ? ['Contents', 'Home'] : []))); if (java) break;
    }
  }
  const sdkRoot = resolve(input.sdkRoot ?? saved.sdkRoot ?? join(own, 'sdk'));
  return { directory, own, javaHome: java, sdkRoot, cacheDirectory: join(own, 'gradle-cache') };
}
async function bytes(path, exclusions = []) {
  if (exclusions.includes(resolve(path))) return 0;
  const info = await stat(path).catch(() => null); if (!info) return 0; if (info.isFile()) return info.size;
  let result = 0; for (const item of await readdir(path)) result += await bytes(join(path, item), exclusions); return result;
}
export async function detect(input) {
  const paths = await locations(input), missing = [];
  if (!paths.javaHome) missing.push('JDK 17 或 21（含 javac）');
  for (const [file, name] of [[join(paths.sdkRoot, 'platforms', 'android-35', 'android.jar'), 'Android SDK Platform 35'],
    [join(paths.sdkRoot, 'build-tools', versions.buildTools, globalThis.process.platform === 'win32' ? 'aapt2.exe' : 'aapt2'), `Build Tools ${versions.buildTools}`]]) if (!await exists(file)) missing.push(name);
  if (missing.length) return failure('ANDROID_TOOLS_MISSING', `缺少：${missing.join('、')}。选择兼容工具路径，或准备环境。`);
  const toolsBytes = await bytes(paths.own, [resolve(paths.sdkRoot), resolve(paths.cacheDirectory)]) + await bytes(paths.sdkRoot);
  return ok({ directory: paths.directory, javaHome: paths.javaHome, sdkRoot: paths.sdkRoot, cacheDirectory: paths.cacheDirectory, space: { toolsBytes, cacheBytes: await bytes(paths.cacheDirectory) } });
}
async function download(url, destination, context) {
  const { signal, progress } = context; signal.throwIfAborted();
  await mkdir(dirname(destination), { recursive: true });
  const response = await fetch(url, { signal }); if (!response.ok) throw new Error(`下载失败 ${response.status}: ${url}`);
  const total = Number(response.headers.get('content-length')) || null, temporary = `${destination}.partial`;
  const file = await open(temporary, 'w'); let completed = 0;
  try { for await (const chunk of response.body) { signal.throwIfAborted(); await file.write(chunk); completed += chunk.length;
    progress({ phase: 'downloading', message: url.split('/').at(-1), completed, total }); }
  } finally { await file.close(); }
  await rename(temporary, destination);
}
export async function prepare(input, context) {
  try {
    if (!input.acceptLicenses) return failure('ANDROID_LICENSE_REQUIRED', `请先阅读并确认 Android SDK 许可：${sdkLicenseUrl}`);
    const { signal, progress } = context, paths = await locations(input); signal.throwIfAborted();
    progress({ phase: 'detecting', message: '检测已有 Android 工具', completed: 0, total: null });
    await mkdir(paths.own, { recursive: true });
    const os = globalThis.process.platform, arch = globalThis.process.arch;
    if (!['win32', 'darwin', 'linux'].includes(os) || !['x64', 'arm64'].includes(arch) || os === 'win32' && arch !== 'x64') throw new Error(`此工具版本不支持 ${os}/${arch}`);
    if (!paths.javaHome) {
      if (input.javaHome) throw new Error('所选 JDK 路径不可用；请修正路径或清空后准备 JDK');
      const archive = join(paths.own, `jdk-${versions.java}.${os === 'win32' ? 'zip' : 'tar.gz'}`), unpacked = join(paths.own, 'jdk');
      const release = '17.0.17+10', platform = os === 'win32' ? 'windows' : os === 'darwin' ? 'mac' : 'linux';
      const url = `https://api.adoptium.net/v3/binary/version/jdk-${encodeURIComponent(release)}/${platform}/${arch === 'x64' ? 'x64' : 'aarch64'}/jdk/hotspot/normal/eclipse`;
      if (!await exists(archive)) await download(url, archive, context);
      await mkdir(unpacked, { recursive: true }); await run('tar', ['-xf', archive, '-C', unpacked], { signal });
      const root = (await readdir(unpacked, { withFileTypes: true })).find(item => item.isDirectory());
      paths.javaHome = await javaHome(join(unpacked, root.name, ...(os === 'darwin' ? ['Contents', 'Home'] : [])));
      if (!paths.javaHome) throw new Error('下载的 JDK 未通过 Java/javac 检查');
    }
    let manager = join(paths.sdkRoot, 'cmdline-tools', versions.commandLineTools, 'lib', 'sdkmanager-classpath.jar');
    if (!await exists(manager)) {
      const archive = join(paths.own, `commandlinetools-${versions.commandLineTools}.zip`), unpacked = join(paths.own, 'command-tools-unpack');
      const platform = os === 'win32' ? 'win' : os === 'darwin' ? 'mac' : 'linux';
      if (!await exists(archive)) await download(`https://dl.google.com/android/repository/commandlinetools-${platform}-${versions.commandLineTools}_latest.zip`, archive, context);
      await mkdir(unpacked, { recursive: true }); await run('tar', ['-xf', archive, '-C', unpacked], { signal });
      await mkdir(dirname(dirname(dirname(manager))), { recursive: true });
      await rename(join(unpacked, 'cmdline-tools'), dirname(dirname(manager))); await rm(unpacked, { recursive: true, force: true });
    }
    const java = join(paths.javaHome, 'bin', os === 'win32' ? 'java.exe' : 'java');
    const args = ['-classpath', manager, 'com.android.sdklib.tool.sdkmanager.SdkManagerCli', `--sdk_root=${paths.sdkRoot}`];
    const output = text => progress({ phase: 'installing', message: text.trim().slice(-500), completed: 0, total: null });
    await run(java, [...args, 'platforms;android-35', `build-tools;${versions.buildTools}`], { signal, input: 'y\n'.repeat(100), progress: output });
    const result = await detect({ ...paths, javaHome: paths.javaHome });
    if (!result.ok) return result;
    await writeFile(join(paths.own, 'toolchain.json'), JSON.stringify(result.value, null, 2));
    progress({ phase: 'completed', message: 'Android 环境可用', completed: 1, total: 1 }); return result;
  } catch (error) { context.progress({ phase: context.signal.aborted ? 'cancelled' : 'installing', message: String(error), completed: 0, total: null });
    return failure(context.signal.aborted ? 'BUILD_CANCELLED' : 'ANDROID_PREPARE_FAILED', String(error)); }
}
