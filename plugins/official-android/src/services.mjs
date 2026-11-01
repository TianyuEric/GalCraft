import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detect, prepare, versions, sdkLicenseUrl, defaultDirectory, run, ok, failure } from './toolchain.mjs';

const directory = fileURLToPath(new URL('../templates/', import.meta.url));
export const optionsSchema = { type: 'object', additionalProperties: false, required: ['applicationId', 'versionCode', 'output'], properties: {
  applicationId: { type: 'string', pattern: '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$' }, versionCode: { type: 'integer', minimum: 1, maximum: 2100000000 },
  orientation: { enum: ['landscape', 'sensorLandscape'] }, minSdk: { const: 26 }, targetSdk: { const: 35 }, output: { enum: ['androidProject','apk', 'aab'] },
  signingMode:{enum:['test','author']},
  iconAssetId: { type: ['string', 'null'] },
  toolchain: { type: 'object', required: ['directory'], properties: { directory: { type: 'string' }, javaHome: { type: 'string' }, sdkRoot: { type: 'string' } } },
  signing: { type: ['object','null'], properties: { storeFile: { type: 'string' }, keyAlias: { type: 'string' }, storePasswordEnvironment: { type: 'string' }, keyPasswordEnvironment: { type: 'string' } } },
} };
function options(value) {
  if (!value || typeof value !== 'object' || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(value.applicationId ?? '') ||
    !Number.isSafeInteger(value.versionCode) || value.versionCode < 1 || value.versionCode > 2100000000 || !['androidProject','apk', 'aab'].includes(value.output) ||
    value.output!=='androidProject'&&!value.toolchain?.directory?.trim() || value.minSdk !== undefined && value.minSdk !== 26 || value.targetSdk !== undefined && value.targetSdk !== 35 ||
    value.orientation !== undefined && !['landscape', 'sensorLandscape'].includes(value.orientation)) throw new Error('请填写合法应用 ID、正整数构建序号、APK/AAB 及明确工具目录；此目标模板使用 minSdk 26 / targetSdk 35。');
  if (value.signing && ['storeFile', 'keyAlias', 'storePasswordEnvironment', 'keyPasswordEnvironment'].some(key => typeof value.signing[key] !== 'string' || !value.signing[key].trim())) throw new Error('发布签名需要完整密钥库、别名和密码环境变量名；私钥与密码保留在个人环境。');
  if(value.output!=='androidProject'&&((value.output==='aab'&&value.signingMode!=='test'||value.signingMode==='author')&&!value.signing))throw new Error('AAB requires author release signing by default. Choose Android project export, supply an author identity, or explicitly select local test signing.');
  if(value.output!=='androidProject'&&value.signingMode==='test'&&value.signing)throw new Error('Select either local test signing or an author keystore.');
  return value;
}
async function files(root, prefix = '') {
  const result = []; for (const item of await readdir(root, { withFileTypes: true })) {
    const path = `${prefix}${item.name}`; if (item.isDirectory()) result.push(...await files(join(root, item.name), `${path}/`));
    else result.push({ path, size: (await stat(join(root, item.name))).size });
  } return result;
}
const groovy = value => JSON.stringify(value).replaceAll('$', '\\$');
export const builder = {
  key: 'org.galcraft.android/build', version: '0.1.0', target: 'android',
  async describe() { return { key: this.key, version: this.version, name: 'Android', target: this.target, architectures: ['arm64', 'x64'],
    environments: [{ os: 'win32', arch: 'x64', outputs: ['androidProject','apk', 'aab'] }, { os: 'darwin', arch: 'x64', outputs: ['androidProject','apk', 'aab'] }, { os: 'darwin', arch: 'arm64', outputs: ['androidProject','apk', 'aab'] }, { os: 'linux', arch: 'x64', outputs: ['androidProject','apk', 'aab'] }],
    outputs:[{key:'androidProject',requiresTools:false,signingModes:[],defaultSigningMode:null},{key:'apk',requiresTools:true,signingModes:['test','author'],defaultSigningMode:'test'},{key:'aab',requiresTools:true,signingModes:['author','test'],defaultSigningMode:'author'}],
    tools: [{ id: 'jdk', version: '17 or 21', purpose: 'Java compiler', licenseUrl: 'https://adoptium.net/about/faq/', external: true },
      { id: 'android-sdk', version: '35 / build-tools 35.0.0 / command-tools 13114758', purpose: 'APK and AAB packaging', licenseUrl: sdkLicenseUrl, external: true },
      { id: 'gradle', version: versions.gradle, purpose: 'Project wrapper; downloaded into the separate cache', licenseUrl: 'https://gradle.org/license/', external: true }],
    optionsSchema, entry: 'services/services.mjs', toolchain: { directory: defaultDirectory() }, availability: { available: ['win32', 'darwin', 'linux'].includes(process.platform) && (process.arch === 'x64' || process.platform === 'darwin' && process.arch === 'arm64'), issues: [] } }; },
  detect, prepare,
  async validate(value) { try { const selected = options(value), description = await this.describe();
    if (!description.environments.some(environment => environment.os === process.platform && environment.arch === process.arch && environment.outputs.includes(selected.output))) return failure('ANDROID_BUILD_ENVIRONMENT', `此目标工具版本没有 ${process.platform}/${process.arch} 的 ${selected.output} 构建入口`).issues;
    if(selected.output==='androidProject')return [];
    const detected = await detect(selected.toolchain); return detected.ok ? [] : detected.issues;
  } catch (error) { return failure('ANDROID_OPTIONS', String(error)).issues; } },
  async build(input, context) {
    try {
      const selected = options(input.options);
      const { signal, progress } = context, root = input.stagingDirectory, project = join(root, 'android-project');
      signal.throwIfAborted(); await cp(directory, project, { recursive: true });
      const assets = join(project, 'app/src/main/assets/game'); await mkdir(assets, { recursive: true });
      for (const item of await readdir(root, { withFileTypes: true })) if (item.name !== 'android-project') await cp(join(root, item.name), join(assets, item.name), { recursive: true });
      const html = join(assets, input.webEntry); await writeFile(html, (await readFile(html, 'utf8')).replace('<head>', '<head><script src="mobile-host.js"></script>'));
      await cp(join(project, 'mobile-host.js'), join(assets, 'mobile-host.js'));
      const embeddedManifestPath = join(assets, 'release.manifest.json'), embeddedManifest = JSON.parse(await readFile(embeddedManifestPath, 'utf8'));
      for (const path of [input.webEntry, 'mobile-host.js']) { const file = { path, size: (await stat(join(assets, path))).size }, existing = embeddedManifest.files.find(item => item.path === path); if (existing) existing.size = file.size; else embeddedManifest.files.push(file); }
      await writeFile(embeddedManifestPath, JSON.stringify(embeddedManifest, null, 2));
      const iconId = selected.iconAssetId ?? input.project.display?.icon;
      if (iconId) {
        const snapshot = JSON.parse(await readFile(join(root, 'game/snapshot.json'), 'utf8')), icon = snapshot.assets.find(asset => asset.assetId === iconId);
        const mime = icon?.files.find(file => file.path === icon.entry)?.mime, extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime];
        if (!icon || !extension) throw new Error('Android 图标需要已保留的 PNG、JPEG 或 WebP 图像素材。');
        await rm(join(project, 'app/src/main/res/drawable/galcraft_icon.xml'), { force: true });
        await cp(join(root, icon.entry), join(project, `app/src/main/res/drawable/galcraft_icon.${extension}`));
      }
      const signing = selected.output==='androidProject'?null:selected.signing;
      let signingConfig = 'signingConfig signingConfigs.debug';
      if (signing) {
        if (!process.env[signing.storePasswordEnvironment] || !process.env[signing.keyPasswordEnvironment]) throw new Error('发布签名密码环境变量未设置。');
        signingConfig = `signingConfig signingConfigs.author`;
      }
      const signingBlock = signing ? `signingConfigs { author { storeFile file(${groovy(signing.storeFile)})\nstorePassword System.getenv(${groovy(signing.storePasswordEnvironment)})\nkeyAlias ${groovy(signing.keyAlias)}\nkeyPassword System.getenv(${groovy(signing.keyPasswordEnvironment)}) } }` : '';
      await writeFile(join(project, 'app/build.gradle'), `plugins { id 'com.android.application' }\nandroid { namespace 'org.galcraft.player'\ncompileSdk 35\nbuildToolsVersion '35.0.0'\ndefaultConfig { applicationId ${groovy(selected.applicationId)}; minSdk 26; targetSdk 35; versionCode ${selected.versionCode}; versionName ${groovy(input.plan.input.releaseVersion)}; manifestPlaceholders = [appLabel: ${groovy(input.project.name)}, orientation: ${groovy(selected.orientation ?? 'landscape')}] }\n${signingBlock}\nbuildTypes { debug { }; release { minifyEnabled false; ${signingConfig} } }\ncompileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n}\n`);
      const cleanProject=async()=>{await writeFile(join(project,'app/build.gradle'),(await readFile(join(project,'app/build.gradle'),'utf8')).replace(signingBlock,'').replace('signingConfig signingConfigs.author','').replace('signingConfig signingConfigs.debug',''));await rm(join(project,'local.properties'),{force:true});await writeFile(join(project,'GALCRAFT-TOOLS.json'),JSON.stringify({...versions,signing:'Configure signing in Android Studio'},null,2));};
      if(selected.output==='androidProject'){
        await cleanProject();await writeFile(join(project,'README.md'),'Open this complete project in Android Studio. Configure your own SDK, JDK and signing identity there. Studio did not detect, install or run the build toolchain.\n');
        const contents=await files(project);return ok({entry:'android-project',handoff:{path:'android-project',kind:'directory'},artifacts:[{path:'android-project',kind:'androidProject',bytes:contents.reduce((total,file)=>total+file.size,0)}],signing:{mode:'notApplied',identity:null,status:'notApplied'}});
      }
      const detected=await detect(selected.toolchain);if(!detected.ok)return detected;const tools=detected.value;
      const env = { JAVA_HOME: tools.javaHome, ANDROID_HOME: tools.sdkRoot, ANDROID_SDK_ROOT: tools.sdkRoot, GRADLE_USER_HOME: tools.cacheDirectory };
      const task = selected.output === 'apk' ? signing ? 'assembleRelease' : 'assembleDebug' : 'bundleRelease';
      progress({ phase: 'building', message: `Gradle ${task}`, completed: 0, total: null });
      await run(join(tools.javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'), ['-classpath', join(project, 'gradle/wrapper/gradle-wrapper.jar'), 'org.gradle.wrapper.GradleWrapperMain', '--no-daemon', '--console=plain', task],
        { signal, cwd: project, env, progress: text => progress({ phase: 'building', message: text.trim().slice(-1000), completed: 0, total: null }) });
      const mode = task === 'assembleDebug' ? 'debug' : 'release';
      const generated = selected.output === 'apk' ? `app/build/outputs/apk/${mode}/app-${mode}.apk` : 'app/build/outputs/bundle/release/app-release.aab';
      const entry = `artifacts/${input.project.projectId}-${input.plan.input.releaseVersion}.${selected.output}`;
      await mkdir(join(root, 'artifacts'), { recursive: true }); await cp(join(project, generated), join(root, entry));
      await rm(join(project, 'app/build'), { recursive: true, force: true }); await rm(join(project, '.gradle'), { recursive: true, force: true });
      await cleanProject();
      progress({ phase: 'completed', message: entry, completed: 1, total: 1 });
      return ok({ entry, handoff: { path: entry, kind: 'file' }, artifacts: [{ path: entry, kind: selected.output, bytes: (await stat(join(root, entry))).size }],signing:{mode:signing?'author':'test',identity:signing?.keyAlias??'Android debug',status:'signed'} });
    } catch (error) { return failure(context.signal.aborted ? 'BUILD_CANCELLED' : 'ANDROID_BUILD_FAILED', String(error)); }
  },
};
export function createPlugin() { return { activate: async () => ({ commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [], pages: [], components: [], systems: [], platform: [], targetBuilders: [builder] }), deactivate: async () => {} }; }
