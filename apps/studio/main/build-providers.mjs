import { createId } from '@galcraft/contracts';

import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { assetFieldReferences, assetReferenceTarget, BuildInputSchema, IssueSchema, readPluginDocumentInstances, round5AssetBindings } from '@galcraft/contracts';
import { AssetCatalog, AssetTypeRegistry, assetFilePath } from '@galcraft/assets';
import { templateIssues } from '@galcraft/templates';
import { ReleaseBuilder, buildIssue, sameSavedVersions } from '@galcraft/publishing/build';
import { readWindowsExecutableArchitecture } from '@galcraft/publishing/engine';
import { PluginManifestSchema } from '@galcraft/plugins/contracts';
import { ContributionRegistry } from '@galcraft/plugins/registry';
import { loadPluginDefinition, loadPluginServices } from '@galcraft/plugins/host';
import { runtimePluginClosure, runtimePluginFiles, runtimeManifest } from './plugin-release.mjs';
import { createCommandRegistry } from '@galcraft/dsl';
import { fail, ok } from './result.mjs';
import { prepareReleaseFonts } from './release-fonts.mjs';
import { collectEngineConversions } from './engine-conversions.mjs';
import { collectLive2DRuntime } from './live2d-release.mjs';
import { authorSigningCertificates, signAuthorExecutable } from './author-signing.mjs';
import { StudioBuildTargets } from './build-targets.mjs';

const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export class StudioBuilds {
  constructor({ projects, language, engineCatalog, pluginRoot, pluginPackages, toolchainProgress, officialPackages = {}, verify, changed, test, instructions, fontSubsetScript, inputRoot = join(pluginRoot, '..', 'build-inputs') }) {
    this.fontSubsetScript = fontSubsetScript;
    Object.assign(this, { projects, language, engineCatalog, pluginRoot, officialPackages, testRelease: test, openInstructions: instructions });
    this.targetBuilders = new StudioBuildTargets(pluginPackages, () => projects.currentSession, toolchainProgress);
    this.builder = new ReleaseBuilder(verify, changed, signAuthorExecutable, (input, signal) => this.targetBuilders.build(input, signal));
    this.inputRoot = inputRoot;
    this.plans = new Map();
    this.latestPlans = new Map();
  }
  async planBuild(rawInput) {
    const input = BuildInputSchema.parse(rawInput), session = this.projects.currentSession;
    this.latestPlans.delete(input.projectId);
    if (!session || session.projectId !== input.projectId) return fail('PROJECT_SESSION_MISSING', '请先打开所选作品', 'M11');
    const output = resolve(input.outputDirectory), projectRoot = this.projects.currentRoot;
    const nested = (parent, child) => { const part = relative(parent, child); return part === '' || !part.startsWith('..') && !part.includes(':'); };
    if (nested(output, projectRoot) || nested(projectRoot, output)) return fail('BUILD_OUTPUT_PROJECT', '发行目录应位于作品目录之外', 'M11');
    const checked = await this.builder.checkOutput(input); if (!checked.ok) return checked;
    return session.withSavedSnapshot(async documents => {
      const savedVersions = documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }));
      if (!sameSavedVersions(savedVersions, input.savedVersions)) return fail('BUILD_VERSION_MISMATCH', '所选保存版本已经变化，请重新检查', 'M11');
      const compiled = this.language.lastValid(input.projectId);
      if (!compiled.ok || !compiled.value || compiled.value.snapshotId !== input.snapshotId) return fail('BUILD_SNAPSHOT_MISSING', '请选择有效的已保存快照', 'M11');
      const snapshot = structuredClone(compiled.value), allFiles = Object.assign({}, ...documents.map(document => document.files));
      const project = JSON.parse(allFiles['project.json']).data;
      const resolved = await this.engineCatalog.resolveProjectEngine(project, snapshot.lock, input.target);
      if (!resolved.ok) return resolved;
      const engine = resolved.value, files = [], textFiles = {}, issues = templateIssues(snapshot.template).map(message => buildIssue('BUILD_TEMPLATE', message)), capabilities = [];
      const playerArch = input.target === 'windows' ? await readWindowsExecutableArchitecture(join(engine.directory, engine.manifest.entries.playerWindows)) : undefined;
      if (input.targetBuilder || ['android', 'ios'].includes(input.target)) issues.push(...await this.targetBuilders.validate(input));
      capabilities.push({ provider: 'galcraft.engine', feature: engine.manifest.version, target: input.target,
        treatment: 'native', reason: '使用作品锁定的精确引擎版本', sources: [], required: true });
      const index = JSON.parse(allFiles['assets/index.json']);
      const references = [];
      const add = (assetId, variantId = null, source) => references.push({ assetId, variantId, owner: { kind: 'project', id: project.projectId },
        ...(source ? { source } : {}), usage: 'release', required: true });
      const fields = new Set(['assetId', 'icon', 'splash', 'titleBackground', 'titleMusic', 'titleVideo', 'emergencyImage', 'imageId', 'fontId', 'avatar', 'cover']);
      const arrays = new Set(['assets', 'dynamicAssets', 'fallbackFonts']);
      const visit = value => {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
          if (fields.has(key) && typeof item === 'string') add(item, value.variantId ?? null);
          else if (arrays.has(key) && Array.isArray(item)) item.forEach(id => { if (typeof id === 'string') add(id); });
          else if (value.kind === 'asset' && key === 'id' && typeof item === 'string') add(item);
          else visit(item);
        }
      };
      const commandRegistry = createCommandRegistry(snapshot.engineVersion, this.language.currentInput(input.projectId)?.pluginCommands ?? []);
      const commandRefs = (value, specs, source) => {
        for (const { ref, path } of assetFieldReferences(value, specs)) {
          const target = assetReferenceTarget(ref, index.data.assets);
          const position = source?.field ? { ...source, field: `${source.field}/${path.map(part => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}` } : source;
          if (target) add(target.assetId, target.variantId, position);
          else issues.push({ ...buildIssue('BUILD_ASSET_REFERENCE', `引用了缺少的素材或版本 ${ref.id}`), ...(position ? { source: position } : {}), related: [ref] });
        }
      };
      for (const scene of snapshot.scenes) for (const instruction of scene.instructions) {
        const spec = commandRegistry.get(instruction.opcode);
        if (!spec) issues.push(buildIssue('BUILD_COMMAND_MISSING', instruction.opcode));
        else commandRefs(instruction.args, spec.fields, instruction.source);
        if (instruction.opcode === 'say' && instruction.args.voiceByLocale) Object.values(instruction.args.voiceByLocale).forEach(id => { if (id) add(id, null, instruction.source); });
      }
      if(snapshot.template.pages.some(page=>['cg','music'].includes(page.key))&&!snapshot.scenes.some(scene=>scene.instructions.some(instruction=>instruction.opcode==='end'&&typeof instruction.args.endingId==='string'&&instruction.args.endingId.trim())))issues.push({...buildIssue('GALLERY_ENDING_REQUIRED','鉴赏页面需要至少一个带结局标识的 end'),severity:'warning'});
      visit([snapshot.project, snapshot.scenes.map(scene=>scene.scene), snapshot.characters, snapshot.gallery, snapshot.flows, snapshot.template]);
      for(const binding of [...round5AssetBindings({project:snapshot.project}),...snapshot.scenes.flatMap(scene=>round5AssetBindings({scene:scene.scene})),...snapshot.characters.flatMap(character=>round5AssetBindings({character}))])add(binding.assetId,binding.variantId);
      input.keepAssets.forEach(id => add(id)); if (input.font.fallbackAssetId) add(input.font.fallbackAssetId);
      const prefix = `${input.target === 'windows' ? 'windows' : 'web'}/`;
      for (const file of engine.manifest.files.filter(file => file.path.startsWith(prefix))) files.push({ path: file.path.slice(prefix.length), size: file.size, source: join(engine.directory, file.path), role: 'runtime' });
      if (engine.manifest.conversions.length) {
        try { files.push(...await collectEngineConversions(engine)); }
        catch (error) { issues.push(buildIssue('BUILD_CONVERSION_CLOSURE', String(error))); }
        textFiles['runtime/engine-conversions.json'] = JSON.stringify(engine.manifest.conversions.map(item => ({ ...item, entry: `runtime/engine-upgrade/${item.entry}` })));
      }
      const registry = new ContributionRegistry(), assetTypes = new AssetTypeRegistry(), runtimeDependencies = [], pluginNotices = [], manifests = new Map(), directories = new Map();
      const pluginDocuments = readPluginDocumentInstances(documents);
      for (const dependency of snapshot.lock.plugins) {
        const directory = join(this.pluginRoot, dependency.id, dependency.version);
        try {
          const manifest = PluginManifestSchema.parse(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')));
          if (manifest.id !== dependency.id || manifest.version !== dependency.version) throw new Error('精确插件版本不一致');
          const registered = registry.registerInstalled(manifest); if (!registered.ok) { issues.push(...registered.issues); continue; }
          manifests.set(manifest.id, manifest); directories.set(manifest.id, directory);
          const definition = await loadPluginDefinition(directory, manifest);
          for (const type of definition.assetTypes ?? []) assetTypes.register({ definition: type, provider: { id: manifest.id, version: manifest.version } });
          const visitComponents = (component, source, path = '/data/root') => {
            if (component.plugin) {
              const provider = definition.components?.find(item => item.key === component.plugin.key);
              if (provider) commandRefs(component.plugin.props, provider.fields ?? [], source ? { ...source, field: `${path}/plugin/props` } : undefined);
            }
            component.children.forEach((child, childIndex) => visitComponents(child, source, `${path}/children/${childIndex}`));
          };
          snapshot.template.pages.forEach(page => {
            const document = documents.find(document => Object.entries(document.files).some(([path, raw]) => path.startsWith('ui/pages/') && path.endsWith('.json') && JSON.parse(raw).data.id === page.id));
            visitComponents(page.root, document ? { documentId: document.documentId, revision: document.revision } : undefined);
          });
          for (const document of pluginDocuments.filter(item => item.pluginId === manifest.id)) {
            const provider = definition.documents?.find(item => item.key === document.contributionKey);
            if (!provider) { issues.push({ ...buildIssue('BUILD_PLUGIN_DEFINITION', `${manifest.id}@${manifest.version} 缺少文档 ${document.contributionKey} 的独立定义；请安装提供定义入口的包后重新检查`), source: { documentId: document.documentId, revision: document.revision } }); continue; }
            for (const ref of provider.collectReferences(document.data)) {
              if (ref.kind === 'asset' || ref.kind === 'variant') {
                const target = assetReferenceTarget(ref, index.data.assets), source = { documentId: document.documentId, revision: document.revision };
                if (target) add(target.assetId, target.variantId, source);
                else issues.push({ ...buildIssue('BUILD_PLUGIN_REFERENCE', `文档 ${document.contributionKey} 引用了缺少的素材或版本 ${ref.id}`), source, related: [ref] });
              }
              else if (ref.kind === 'document' && !documents.some(item => item.documentId === ref.id)) issues.push({ ...buildIssue('BUILD_PLUGIN_REFERENCE', `文档 ${document.contributionKey} 引用了缺少的文档 ${ref.id}`), source: { documentId: document.documentId, revision: document.revision } });
            }
          }
          const checks = manifest.contributions.filter(item => item.kind === 'publishCheck' && item.targets.includes(input.target));
          if (checks.length) {
            const service = await loadPluginServices(directory, manifest);
            try {
              const readonly = () => fail('BUILD_READ_ONLY', '发布检查使用固定已保存快照', 'M11');
              const offered = await service.activate({ pluginId: manifest.id, target: input.target, domain: { kind: 'sample', projectId: input.projectId, instance: `build-${input.snapshotId}` }, config: snapshot.pluginDocuments[manifest.id], documents: { read: readonly, propose: readonly }, assets: { resolve: readonly }, pages: { open: readonly }, log: issue => issues.push(issue) });
              for (const declaration of checks) {
                const check = offered.publishChecks?.find(item => item.key === declaration.key);
                if (!check) throw new Error(`缺少发布检查：${declaration.key}`);
                const diagnostics = await check.check({ snapshot: structuredClone(snapshot), lock: structuredClone(snapshot.lock), target: input.target, settings: structuredClone(input) });
                for (const diagnostic of diagnostics) issues.push(IssueSchema.parse(diagnostic));
              }
            } finally { await service.deactivate(); }
          }
          if (manifest.entry.runtime && !dependency.targets.includes(input.target)) capabilities.push({ provider: dependency.id, feature: 'runtime', target: input.target,
            treatment: dependency.required ? 'blocked' : 'skipped', reason: `锁定运行插件 ${dependency.id}@${dependency.version} 未声明该目标`, sources: [], required: dependency.required });
        } catch (error) { issues.push(buildIssue('BUILD_PLUGIN', `${dependency.id}@${dependency.version}: ${error}`)); }
      }
      let runtimeIds = new Set();
      try { runtimeIds = runtimePluginClosure(snapshot.lock, manifests, input.target); } catch (error) { issues.push(buildIssue('BUILD_PLUGIN_CLOSURE', String(error))); }
      for (const dependency of snapshot.lock.plugins.filter(item => runtimeIds.has(item.id))) {
        const manifest = manifests.get(dependency.id), directory = directories.get(dependency.id);
        try {
          runtimeDependencies.push(dependency);
          pluginNotices.push({ id: manifest.id, version: manifest.version, license: manifest.license, homepage: manifest.homepage });
          const packageRoot = `plugins/runtime/${manifest.id}/${manifest.version}`;
          const { files: runtimeFiles, native } = await runtimePluginFiles(directory, manifest, input.target, playerArch);
          textFiles[`${packageRoot}/manifest.json`] = JSON.stringify(runtimeManifest(manifest, runtimeFiles, native, input.target));
          for (const file of runtimeFiles) files.push({ path: `${packageRoot}/${file.path}`, size: file.size, source: join(directory, file.path), role: 'plugin' });
          capabilities.push({ provider: manifest.id, feature: 'runtime', target: input.target, treatment: manifest.targets.includes(input.target) ? 'native' : 'blocked', reason: manifest.targets.includes(input.target) ? '' : '插件未声明目标支持', sources: [], required: dependency.required });
          for (const declaration of manifest.contributions.filter(item => item.kind === 'platform' && item.targets.includes(input.target))) {
            const instructions = snapshot.scenes.flatMap(scene => scene.instructions).filter(instruction => instruction.opcode === 'callSteam' && declaration.key === 'org.galcraft.steam/achievement');
            const required = input.platformPolicy[declaration.key] === 'required' || instructions.some(instruction => instruction.args.unavailable === 'required');
            const available = manifest.native.length > 0 ? native.length > 0 : true;
            capabilities.push({ provider: manifest.id, feature: declaration.key.slice(manifest.id.length + 1), target: input.target, treatment: available ? 'native' : required ? 'blocked' : 'skipped', required,
              reason: available ? `Windows ${playerArch} 原生提供者；实际调用结果由宿主返回` : `该目标没有原生提供者，可选动作采用声明的替代行为`, sources: instructions.map(instruction => instruction.source) });
          }
        } catch (error) { issues.push(buildIssue('BUILD_PLUGIN', `${dependency.id}@${dependency.version}: ${error}`)); }
      }
      snapshot.lock.plugins = runtimeDependencies;
      for (const scenario of snapshot.flowInitials ?? []) {
        scenario.pluginVersions = scenario.pluginVersions.filter(dependency => dependency.kind !== 'plugin' || runtimeIds.has(dependency.id));
        scenario.pluginInitial = Object.fromEntries(Object.entries(scenario.pluginInitial).filter(([id]) => runtimeIds.has(id)));
      }
      const runtimeTable = registry.prepareContributions(snapshot.lock, input.target, ['runtime']); if (!runtimeTable.ok) issues.push(...runtimeTable.issues);
      const collected = new AssetCatalog(index, assetTypes).collectAssets(references, input.target); issues.push(...collected.issues);
      for (const asset of collected.assets) {
        if (asset.provider) {
          const key = assetTypes.resolveResourceProviderKey(asset.provider), declaration = runtimeTable.ok ? runtimeTable.value.byKey[key] : null;
          if (declaration?.kind !== 'resource') issues.push({ ...buildIssue('BUILD_RESOURCE_PROVIDER_MISSING', `资源 ${asset.assetId} 缺少作品锁定的提供者 ${asset.provider}`), related: [{ kind: 'asset', id: asset.assetId }] });
        }
        const indexed = index.data.assets.find(item => item.id === asset.assetId);
        const variant = indexed?.variants.find(item => item.id === asset.variantId);
        const status = variant?.targets[input.target];
        capabilities.push({ provider: 'M04', feature: `${asset.kind}/${asset.assetId}/${asset.variantId}`, target: input.target,
          treatment: status === 'converted' ? 'converted' : status === 'direct' ? 'native' : 'blocked',
          reason: status === 'converted' ? `已采用兼容版本：${indexed?.name ?? asset.assetId}` :
            status === 'direct' ? `已验证原版：${indexed?.name ?? asset.assetId}` : `目标尚未验证：${indexed?.name ?? asset.assetId}`,
          sources: references.filter(ref => ref.assetId === asset.assetId && (ref.variantId === null || ref.variantId === asset.variantId))
            .flatMap(ref => ref.source ? [ref.source] : []), required: true });
      }
      const activeVariants = new Map(index.data.assets.map(asset => [asset.id, asset.activeVariantId]));
      const selectedAssets = [...collected.assets].sort((left, right) => Number(left.variantId !== activeVariants.get(left.assetId)) - Number(right.variantId !== activeVariants.get(right.assetId)));
      snapshot.assets = selectedAssets.map(asset => {
        const metadata = structuredClone(asset.metadata);
        delete metadata.authorDocument;
        return { ...asset, metadata, entry: assetFilePath(asset.assetId, asset.variantId, asset.entry),
          files: asset.files.map(file => ({ ...file, path: assetFilePath(asset.assetId, asset.variantId, file.path) })) };
      });
      for (const file of collected.files) files.push({ path: file.path, size: file.bytes, source: join(projectRoot, file.path), role: 'asset' });
      let live2dRuntime;
      if (snapshot.assets.some(asset => asset.kind === 'live2d')) {
        try {
          const runtime = await collectLive2DRuntime({ root: join(this.pluginRoot, '..', 'runtimes/live2d'), lock: snapshot.lock.live2dRuntime,
            target: input.target, policy: input.live2d });
          live2dRuntime = runtime.manifest; files.push(...runtime.files);
          capabilities.push({ provider: 'galcraft.live2d', feature: 'runtime', target: input.target, treatment: 'native',
            reason: input.live2d.purpose === 'localTest' ? '仅用于本地验收 / Local testing only / ローカル検証専用' : '', sources: [], required: true });
        } catch (error) { issues.push(buildIssue('BUILD_LIVE2D_RUNTIME', String(error))); }
      }
      for (const style of snapshot.template.styles) if (style.compiledPath) {
        const css = allFiles[style.compiledPath];
        if (css === undefined) issues.push(buildIssue('BUILD_STYLE_MISSING', style.compiledPath));
        else textFiles[style.compiledPath] = css;
      }
      textFiles['game/style.css'] = '';
      const frozenDirectory = join(this.inputRoot, createId());
      issues.push(...await prepareReleaseFonts({ input, snapshot, engine, files, textFiles, directory: join(frozenDirectory, 'fonts'), subsetScript: this.fontSubsetScript }));
      for (const file of files.filter(file => file.role === 'asset' && nested(projectRoot, file.source))) {
        try {
          const source = await stat(file.source);
          if (source.size !== file.size) {
            issues.push(buildIssue('BUILD_ASSET_SOURCE', `资源文件大小与已存索引不一致：${file.path}`));
            continue;
          }
          const destination = join(frozenDirectory, file.path);
          await mkdir(dirname(destination), { recursive: true }); await copyFile(file.source, destination);
          file.source = destination;
        } catch (error) {
          issues.push(buildIssue('BUILD_ASSET_SOURCE', `无法读取已存资源：${file.path} (${error.code ?? String(error)})`));
        }
      }
      let entry = (input.target === 'windows' ? engine.manifest.entries.playerWindows : engine.manifest.entries.playerWeb).slice(prefix.length);
      if (input.target === 'windows' && project.release?.executableName) {
        const executable = files.find(file => file.path === entry);
        if (!executable || files.some(file => file !== executable && file.path.toLowerCase() === project.release.executableName.toLowerCase()))
          issues.push(buildIssue('BUILD_EXECUTABLE_NAME', '作品入口文件名与发行文件冲突'));
        else { executable.path = project.release.executableName; entry = executable.path; }
      }
      const icon = snapshot.project.display.icon ? snapshot.assets.find(asset => asset.assetId === snapshot.project.display.icon) : null;
      if (icon && icon.kind !== 'image') issues.push(buildIssue('BUILD_ICON_KIND', '作品图标应使用图像素材'));
      const windowsBrand = input.target === 'windows' ? { icon: icon?.entry ?? null } : undefined;
      const notices = pluginNotices.length ? `<h2>插件许可 / Plugin licenses / プラグインライセンス</h2><ul>${pluginNotices.map(item =>
        `<li>${escape(item.id)}@${escape(item.version)} · ${escape(item.license)}${item.homepage ? ` · <a href="${escape(item.homepage)}">${escape(item.homepage)}</a>` : ''}</li>`).join('')}</ul>` : '';
      const nativeInstructions = input.target === 'android' && input.targetOptions?.output==='androidProject' ? '在 Android Studio 打开 android-project，配置自己的 SDK、JDK 和签名。此输出没有执行 Gradle 或签名。Open android-project in Android Studio and configure your tools and signing. No Gradle build or signing was performed.' : input.target === 'android' ? '使用回执中的 APK 在 Android 设备安装；AAB 用于配置作者发布签名后的商店交付。源工程可用所选 JDK、SDK 和 Gradle Wrapper 重建。Install the APK on an Android device; distribution AAB files require your release signing. Android 端末に APK をインストールし、ストア配布には作者の配布署名を使用してください。' : input.target === 'ios' ? '在 macOS 使用 Xcode 打开导出的工程，配置作者团队与签名后构建或归档。可运行 sh build.sh 并设置 GALCRAFT_DEVELOPMENT_TEAM。Open the exported project in Xcode on macOS and configure your team/signing. macOS の Xcode で出力したプロジェクトを開き、チームと署名を設定してください。' : `交付整个目录并运行 ${escape(entry)}。Deliver the entire directory. ディレクトリ全体を配布してください。`;
      const instructions = `<!doctype html><meta charset="utf-8"><title>${escape(project.name)}</title><h1>${escape(project.name)} ${snapshot.releaseVersion}</h1><p>${input.target === 'web' ? '部署整个目录到静态 HTTP 服务，通过 HTTP 或 HTTPS 地址打开 index.html。Windows 本机预览：先安装 Node.js，再双击目录中的 preview.cmd；脚本自动选择空闲端口并打开浏览器。运行期间保持预览窗口开启，关闭窗口或按 Ctrl+C 停止。预览仅监听本机地址。Deploy the entire folder using HTTP/HTTPS. For local preview on Windows, install Node.js and double-click preview.cmd. Keep the preview window open; close it or press Ctrl+C to stop. Windows のローカルプレビューは Node.js をインストールし、preview.cmd をダブルクリックしてください。' : nativeInstructions}</p>${live2dRuntime && input.live2d.purpose === 'localTest' ? '<p>本包仅用于本地验收。Local testing only. ローカル検証専用。</p>' : ''}${notices}`;
      const compatibilityFiles = [];
      for (const file of input.oldSaveFiles) {
        try { compatibilityFiles.push({ file, bytes: [...await readFile(file)] }); }
        catch (error) { issues.push(buildIssue('COMPATIBILITY_FILE', `${file}: ${error}`)); }
      }
      const planned = this.builder.planBuild(input, { project, snapshot, savedVersions, engine, files, textFiles, capabilities, issues, entry, gameDirectory: 'game', instructions, compatibilityFiles, live2dRuntime, windowsBrand });
      if (planned.ok) { this.plans.set(planned.value.planId, { input: structuredClone(input), lock: structuredClone(compiled.value.lock) }); this.latestPlans.set(input.projectId, planned.value.planId); }
      return planned;
    });
  }
  async build(id) {
    const plan = this.plans.get(id), session = this.projects.currentSession;
    if (!plan || !session || session.projectId !== plan.input.projectId || this.latestPlans.get(plan.input.projectId) !== id) return fail('BUILD_PLAN_STALE', '请重新检查当前作品的发行计划', 'M11');
    return session.withSavedSnapshot(async documents => {
      const versions = documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }));
      const current = this.language.lastValid(plan.input.projectId);
      if (!sameSavedVersions(versions, plan.input.savedVersions) || !current.ok || current.value?.snapshotId !== plan.input.snapshotId || JSON.stringify(current.value.lock) !== JSON.stringify(plan.lock)) return fail('BUILD_PLAN_STALE', '保存快照或精确依赖已变化，请重新检查', 'M11');
      return this.builder.build(id);
    });
  }
  cancel(id) { return ok(this.builder.cancel(id)); }
  targets() { return this.targetBuilders.catalog(); }
  detectToolchain(input) { return this.targetBuilders.detect(input); }
  prepareToolchain(input) { return this.targetBuilders.prepare(input); }
  cancelToolchain(operationId) { return this.targetBuilders.cancel(operationId); }
  prepareStop() { this.builder.cancelAll(); this.targetBuilders.dispose(); }
  async signingCertificates() {
    try { return ok(await authorSigningCertificates()); }
    catch (error) { return fail('BUILD_CERTIFICATES_UNAVAILABLE', String(error), 'M11'); }
  }
  receipt(id) { return this.builder.receipt(id); }
  compatibility(id) { return this.builder.compatibility(id); }
  resolveDirectory(id) { return this.builder.resolveDirectory(id); }
  async test(id) { const receipt = this.builder.receipt(id); return receipt.ok && receipt.value ? this.testRelease(receipt.value) : fail('BUILD_RECEIPT_MISSING', '尚无发行回执', 'M11'); }
  async instructions(id) { const receipt = this.builder.receipt(id); return receipt.ok && receipt.value ? this.openInstructions(receipt.value.instructionsPath) : fail('BUILD_RECEIPT_MISSING', '尚无发行回执', 'M11'); }
}
