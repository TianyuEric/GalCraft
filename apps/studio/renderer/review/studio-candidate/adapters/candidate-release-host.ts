import { BuildInputSchema, LockSchema, ProjectSchema, createId, readPluginDocumentInstances, type BuildInput, type BuildReceipt, type DocumentView, type EditInput, type Issue, type Json, type PluginDocumentInstance, type Result, type StudioBridge, type UpgradePlan, type VersionRef } from '@galcraft/contracts';
import type { PluginManifest } from '@galcraft/plugins/contracts';
import { ContributionRegistry } from '@galcraft/plugins/registry';
import type { WorkbenchBridge } from '../../../../desktop-bridge.js';
import type { AuthoringServices } from '../../../authoring/controller.js';
import { pluginMetadata as affectionMetadata } from '../../../../../../plugins/official-affection/src/metadata.js';
import { affectionCommandSpecs, createDefinition } from '../../../../../../plugins/official-affection/src/definition.js';
import { AffectionConfigSchema } from '../../../../../../plugins/official-affection/src/config.js';
import affectionDefinitionSource from './candidate-affection-definition.ts?raw';
import affectionRuntimeSource from './candidate-affection-runtime.ts?raw';

type PackageSource = Parameters<StudioBridge['plugins']['inspectPackage']>[0];
export type CandidatePluginPackage = { manifest: PluginManifest; source?: PackageSource; development?: boolean; studioService?: boolean;
  runtimeUrl?: string; definitionUrl?: string; editorUrl?: string; loadEntries?(): Promise<{ definitionUrl: string; runtimeUrl: string }> };
type Options = {
  documents: StudioBridge['documents'];
  plugins: StudioBridge['plugins'];
  files: StudioBridge['files'];
  compile: NonNullable<AuthoringServices['compilePreview']>;
  packages?: CandidatePluginPackage[];
  notice?(message: string): void;
};
type Build = { input: BuildInput; entry: string; issues: Issue[]; cancelled: boolean; running: boolean; replaces?: string; receipt: BuildReceipt | null };
const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const issue = (code: string, message: string, owner: Issue['owner'] = 'M11'): Issue => ({ code, message, owner, severity: 'error', related: [], actions: ['retry'] });
const fail = (error: Issue): Result<never> => ({ ok: false, error, issues: [error] });
const missing = () => fail(issue('CANDIDATE_BUILD_MISSING', '此审核构建尚未完成或已失效。'));
export const candidateReleaseVersions = (documents: DocumentView[]): VersionRef[] => documents
  .filter(doc => Object.keys(doc.savedFiles).length > 0)
  .map(doc => ({ ref: { kind: 'document' as const, id: doc.documentId }, revision: doc.savedRevision }))
  .sort((a, b) => a.ref.id.localeCompare(b.ref.id));
const buildPath = (input: BuildInput) => `${input.outputDirectory.replace(/[\\/]+$/, '')}/GalCraft-${input.releaseVersion}-${input.target}`;
const sameVersions = (left: VersionRef[], right: VersionRef[]) => left.length === right.length && left.every(item => right.some(other =>
  item.ref.kind === other.ref.kind && item.ref.id === other.ref.id && item.revision === other.revision));

const entryBytes = (source: string) => new TextEncoder().encode(source).byteLength;
const affection: CandidatePluginPackage = {
  manifest: { ...affectionMetadata, files: [
    { path: affectionMetadata.entry.definition!, size: entryBytes(affectionDefinitionSource) },
    { path: affectionMetadata.entry.runtime!, size: entryBytes(affectionRuntimeSource) },
  ] },
  async loadEntries() {
    // Let Vite transform the tracked source and retain each entry's formal exports in its own module.
    const [definition, runtime] = await Promise.all([import('./candidate-affection-definition.js'), import('./candidate-affection-runtime.js')]);
    if (typeof definition.createDefinition !== 'function' || typeof runtime.createPlugin !== 'function') throw new Error('审核插件入口缺少正式导出。');
    return { definitionUrl: definition.moduleUrl, runtimeUrl: runtime.moduleUrl };
  },
};
const reviewDevelopment: PluginManifest = { schemaVersion: 1, id: 'org.galcraft.review-example', version: '0.1.0', name: '审核开发样例',
  description: '在浏览器审核中演示开发目录登记、作品启用与停用。', author: 'GalCraft', license: 'MPL-2.0', homepage: null,
  engineRange: '^0.1.0', sdkMajor: 0, targets: ['web', 'windows'], dependencies: [], entry: { runtime: null, editor: null },
  files: [], contributions: [], stateVersions: { document: 1, progress: 1, longTerm: 1 }, native: [] };
const defaultPackages: CandidatePluginPackage[] = [affection,
  { ...affection, source: { kind: 'archive', path: 'candidate://packages/affection.galplugin' } },
  { manifest: reviewDevelopment, source: { kind: 'directory', path: 'candidate://plugins/review-example' }, development: true }];
const affectionDocument = createDefinition().documents![0]!;
type ReleaseNotice = { message: string; receipt: BuildReceipt };
const releaseEvents = new WeakMap<WorkbenchBridge['builds'], Set<(event: ReleaseNotice) => void>>();
export function subscribeCandidateRelease(bridge: WorkbenchBridge['builds'], listener: (event: ReleaseNotice) => void) {
  const listeners = releaseEvents.get(bridge);
  listeners?.add(listener);
  return () => { listeners?.delete(listener); };
}
const versionOf = (document: Pick<DocumentView, 'documentId' | 'revision'>): VersionRef => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision });
const disabledDocument = () => fail(issue('CANDIDATE_PLUGIN_DOCUMENT_UNAVAILABLE', '此插件文档类型未启用或无法在审核宿主中编辑。', 'M09'));
const invalidDocument = (message: string) => fail(issue('CANDIDATE_PLUGIN_DOCUMENT_INPUT', message, 'M09'));
const staleDocument = () => fail(issue('CANDIDATE_PLUGIN_DOCUMENT_STALE', '插件文档已变化，请重新打开当前版本。', 'M09'));

function affectionEnabled(documents: DocumentView[]) {
  const raw = documents.find(doc => doc.files['dependencies.lock.json'])?.files['dependencies.lock.json'];
  return raw && LockSchema.parse(JSON.parse(raw).data).plugins.some(item => item.id === affection.manifest.id && item.version === affection.manifest.version);
}

function makePluginDocument(documents: DocumentView[], pluginId: string, contributionKey: string, name: string, data: Json): Result<EditInput> {
  if (pluginId !== affection.manifest.id || contributionKey !== affectionDocument.key || !affectionEnabled(documents)) return disabledDocument();
  const checked = AffectionConfigSchema.safeParse(data);
  if (!checked.success) return invalidDocument(checked.error.message);
  if (!name.trim()) return invalidDocument('请填写插件文档名称。');
  const documentId = createId([documents]);
  const path = `plugins/${pluginId}/documents/${documentId}.json`;
  return ok({ label: `新建插件文档 · ${name}`, origin: 'plugin', expected: [], preparedAssets: [], requiredRefs: affectionDocument.collectReferences(checked.data),
    patches: [{ kind: 'document', documentId, op: 'create', before: null, after: { format: 'json', files: { [path]: JSON.stringify({
      schemaVersion: 1, documentId, revision: 0, data: checked.data, pluginDocument: { pluginId, contributionKey, name, stateVersion: affectionDocument.stateVersion },
    }) } } }] });
}

/** An isolated review host for native actions used by the formal plugin and release pages. */
export function createCandidateReleaseHost({ documents, plugins: basePlugins, files: baseFiles, compile, packages = defaultPackages, notice }: Options):
  Pick<WorkbenchBridge, 'documents' | 'plugins' | 'files' | 'builds' | 'upgrades'> {
  const registered = packages.filter(item => !item.source);
  const builds = new Map<string, Build>();
  const buildOutputs = new Map<string, string>();
  const upgrades = new Map<string, UpgradePlan>();
  const upgradeHistory = new Map<string, { id: string; from: string; to: string; originalCopy: string; state: string }>();
  const listeners = new Set<(event: ReleaseNotice) => void>();
  const announce = (message: string, receipt: BuildReceipt) => { notice?.(message); for (const listener of listeners) listener({ message, receipt }); };
  const registeredPackage = (id: string, version: string) => registered.find(item => item.manifest.id === id && item.manifest.version === version);
  const sourcePackage = (source: PackageSource) => packages.find(item => item.source?.kind === source.kind && item.source.path === source.path);
  const packageError = () => fail(issue('CANDIDATE_PACKAGE_UNAVAILABLE', '候选宿主只读取审核样例中登记的插件包和开发目录。', 'M09'));
  const inspect = (item: CandidatePluginPackage) => ({ manifest: item.manifest, compatible: true, issues: [], installedVersion: registered.find(entry => entry.manifest.id === item.manifest.id)?.manifest.version ?? null });
  const install = (source: PackageSource) => {
    const item = sourcePackage(source);
    if (!item) return packageError();
    const result = inspect(item);
    if (!registeredPackage(item.manifest.id, item.manifest.version)) registered.push(item);
    return ok(result);
  };
  const findInstance = (documents: DocumentView[], id: string): PluginDocumentInstance | undefined => readPluginDocumentInstances(documents).find(item => item.documentId === id);
  const documentBridge: StudioBridge['documents'] = {
    ...documents,
    async pluginList(input) {
      const listed = await documents.list(); if (!listed.ok) return listed;
      return ok(readPluginDocumentInstances(listed.value).filter(item => item.pluginId === input.pluginId && (!input.contributionKey || item.contributionKey === input.contributionKey)));
    },
    async pluginCreate(input) {
      const listed = await documents.list(); if (!listed.ok) return listed;
      return makePluginDocument(listed.value, input.pluginId, input.contributionKey, input.name ?? affectionDocument.key, input.data ?? affectionDocument.initial);
    },
    async pluginCopy(input) {
      const listed = await documents.list(); if (!listed.ok) return listed;
      const instance = findInstance(listed.value, input.documentId); if (!instance) return staleDocument();
      const edit = makePluginDocument(listed.value, instance.pluginId, instance.contributionKey, input.name ?? `${instance.name} 副本`, instance.data);
      if (edit.ok) edit.value.expected.push(versionOf(instance));
      return edit;
    },
    async pluginDelete(input) {
      const listed = await documents.list(); if (!listed.ok) return listed;
      const instance = findInstance(listed.value, input.documentId), document = listed.value.find(doc => doc.documentId === input.documentId);
      if (!instance || !document || instance.revision !== input.expectedRevision) return staleDocument();
      return ok({ label: `移除插件文档 · ${instance.name}`, origin: 'plugin', expected: [versionOf(instance)], preparedAssets: [], requiredRefs: [],
        patches: [{ kind: 'document', documentId: instance.documentId, op: 'delete', before: { format: document.format, files: document.files }, after: null }] });
    },
    async pluginUpdate(input) {
      const listed = await documents.list(); if (!listed.ok) return listed;
      const instance = findInstance(listed.value, input.documentId);
      if (!instance || instance.revision !== input.expectedRevision) return staleDocument();
      if (instance.pluginId !== affection.manifest.id || instance.contributionKey !== affectionDocument.key || !affectionEnabled(listed.value)) return disabledDocument();
      const checked = AffectionConfigSchema.safeParse(input.data);
      if (!checked.success) return invalidDocument(checked.error.message);
      return ok({ label: `修改插件文档 · ${instance.name}`, origin: 'plugin', expected: [versionOf(instance)], preparedAssets: [], requiredRefs: affectionDocument.collectReferences(checked.data),
        patches: [{ kind: 'json', documentId: instance.documentId, changes: [{ path: '/data', before: instance.data, after: checked.data, op: 'set' }] }] });
    },
  };
  const plugins: WorkbenchBridge['plugins'] = {
    ...basePlugins,
    async resolve(lock) {
      const base = await basePlugins.resolve(lock); if (!base.ok) return base;
      const entries = lock.plugins.flatMap(item => {
        const entry = registeredPackage(item.id, item.version);
        if (!entry || base.value.packages.some(item => (item.manifest as PluginManifest).id === entry.manifest.id && (item.manifest as PluginManifest).version === entry.manifest.version)) return [];
        return [entry];
      });
      try {
        const local = await Promise.all(entries.map(async entry => ({
          manifest: entry.manifest, definitionUrl: entry.definitionUrl ?? null, runtimeUrl: entry.runtimeUrl ?? null,
          editorUrl: entry.editorUrl ?? null, ...await entry.loadEntries?.(),
        })));
        return ok({ ...base.value, packages: [...base.value.packages, ...local] });
      } catch (reason) {
        await basePlugins.release(base.value.handleId);
        return fail(issue('CANDIDATE_PLUGIN_ENTRY', String(reason), 'M09'));
      }
    },
    async commandSpecs() {
      const base = await basePlugins.commandSpecs?.(); if (base && !base.ok) return base;
      const listed = await plugins.list(); if (!listed.ok) return listed;
      const previous = base?.value ?? [];
      const enabled = listed.value.lock?.plugins.some(item => item.id === affection.manifest.id && item.version === affection.manifest.version);
      return ok(enabled ? [...previous, ...affectionCommandSpecs().filter(spec => !previous.some(item => item.key === spec.key))] : previous);
    },
    async list() {
      const listed = await documents.list(); if (!listed.ok) return listed;
      const raw = listed.value.find(doc => doc.files['dependencies.lock.json'])?.files['dependencies.lock.json'];
      return ok({ entries: registered.map(item => ({ manifest: structuredClone(item.manifest), development: item.development ?? false, studioService: item.studioService })),
        lock: raw ? LockSchema.parse(JSON.parse(raw).data) : null });
    },
    async inspectPackage(source) { const item = sourcePackage(source); return item ? ok(inspect(item)) : packageError(); },
    async install(source) { return install(source); },
    async loadDevelopment({ directory }) { return install({ kind: 'directory', path: directory }); },
    async planChange({ pluginId, version }) {
      const listed = await documents.list(); if (!listed.ok) return listed;
      const lockDocument = listed.value.find(doc => doc.files['dependencies.lock.json']);
      if (!lockDocument) return fail(issue('CANDIDATE_LOCK_MISSING', '作品缺少依赖锁定文档。', 'M09'));
      const lock = LockSchema.parse(JSON.parse(lockDocument.files['dependencies.lock.json']!).data);
      const previous = lock.plugins.find(item => item.id === pluginId);
      const selected = version ? registeredPackage(pluginId, version) : null;
      if (version && !selected) return packageError();
      const dependency = selected ? { kind: 'plugin' as const, id: pluginId, version: selected.manifest.version, targets: selected.manifest.targets, required: true } : null;
      const targetLock = { ...lock, plugins: [...lock.plugins.filter(item => item.id !== pluginId), ...(dependency ? [dependency] : [])] };
      const registry = new ContributionRegistry();
      for (const entry of registered) {
        const installed = registry.registerInstalled(entry.manifest);
        if (!installed.ok) return installed;
      }
      for (const target of lock.engine.targets) {
        const prepared = registry.prepareContributions(targetLock, target);
        if (!prepared.ok) return prepared;
      }
      const expected: VersionRef[] = [{ ref: { kind: 'document', id: lockDocument.documentId }, revision: lockDocument.revision }];
      const edit = await documents.planEdit({ label: version ? `启用插件 ${pluginId}` : `停用插件 ${pluginId}`, origin: 'plugin', expected,
        patches: [{ kind: 'json', documentId: lockDocument.documentId, changes: [{ path: '/data/plugins', before: lock.plugins, after: targetLock.plugins, op: 'set' }] }], preparedAssets: [], requiredRefs: [] });
      if (!edit.ok) return edit;
      return ok({ edit: edit.value, change: { planId: edit.value.planId, expected, targetLock, preparedDirectory: 'candidate://plugins', changes: [{
        pluginId, from: previous?.version ?? null, to: version, affected: [{ kind: 'document', id: lockDocument.documentId },
          ...readPluginDocumentInstances(listed.value).filter(document => document.pluginId === pluginId).map(document => ({ kind: 'document' as const, id: document.documentId }))],
        savedData: ['document', 'progress', 'longTerm'], dependencies: targetLock.plugins, conversions: [], issues: [],
      }] } });
    },
  };

  const buildBridge: WorkbenchBridge['builds'] = {
    status: async () => ok({ ready: true }), targets: async () => ok([]),
    detectToolchain: async () => fail(issue('CANDIDATE_MOBILE_TOOLCHAIN', '候选浏览器没有本机移动端工具链。')),
    prepareToolchain: async () => fail(issue('CANDIDATE_MOBILE_TOOLCHAIN', '候选浏览器没有本机移动端工具链。')),
    cancelToolchain: async () => ok({ cancelled: false }), signingCertificates: async () => ok([]),
    chooseOldSaves: async () => fail(issue('CANDIDATE_SAVEDATA_PICKER', '此审核作品没有已登记的旧存档样本。')),
    async planBuild(value) {
      const parsed = BuildInputSchema.safeParse(value);
      if (!parsed.success) return fail(issue('CANDIDATE_BUILD_INPUT', parsed.error.message));
      const input = parsed.data, listed = await documents.list(); if (!listed.ok) return listed;
      if (!sameVersions(input.savedVersions, candidateReleaseVersions(listed.value))) return fail(issue('CANDIDATE_BUILD_STALE', '已保存的作品内容发生变化，请重新检查。'));
      const compiled = await compile(true, listed.value); if (!compiled.ok) return compiled;
      const snapshot = compiled.value.snapshot;
      const issues = [...compiled.value.issues];
      if (!snapshot || snapshot.projectId !== input.projectId || snapshot.project.releaseVersion !== input.releaseVersion)
        return { ok: false, error: issue('CANDIDATE_BUILD_SNAPSHOT', '已保存内容没有匹配的有效编译结果。'), issues };
      if (input.target === 'ios' || input.target === 'android') issues.push(issue('CANDIDATE_MOBILE_TOOLCHAIN', '移动端构建需要本机工具链。请在桌面 Studio 准备目标工具链，或选择 Web / Windows。'));
      if (input.target === 'windows' && (input.windowsSigning?.mode === 'certificate' || snapshot.project.release?.windowsSigning === 'certificate'))
        issues.push(issue('CANDIDATE_SIGNING_CERTIFICATE', '所选保存版本使用本机证书签名。请在桌面 Studio 读取证书，或在作品中改用其他签名方式后保存。'));
      if (!input.outputDirectory.trim() || /\.(zip|exe|html?)$/i.test(input.outputDirectory))
        issues.push(issue('CANDIDATE_BUILD_DIRECTORY', '输出位置需要指向目录。'));
      const live2d = snapshot.lock.live2dRuntime || snapshot.lock.plugins.some(plugin => plugin.id === 'org.galcraft.live2d');
      if (live2d && (!input.live2d || input.live2d.purpose === 'distribution' && !input.live2d.licenseConfirmed))
        issues.push(issue('CANDIDATE_LIVE2D_LICENSE', '请确认 Live2D SDK 发布资格，或选择本机验收。'));
      if (!snapshot.lock.engine.targets.includes(input.target))
        issues.push(issue('CANDIDATE_BUILD_ENGINE_TARGET', `保存版本锁定的引擎不支持 ${input.target}。`));
      for (const dependency of snapshot.lock.plugins) if (dependency.required && !dependency.targets.includes(input.target))
        issues.push(issue('CANDIDATE_BUILD_PLUGIN_TARGET', `${dependency.id}@${dependency.version} 不支持 ${input.target}。`, 'M09'));
      const path = buildPath(input);
      const replaces = buildOutputs.get(path);
      if (replaces) issues.push({ ...issue('CANDIDATE_BUILD_REPLACE', `确认后会替换此位置的候选审核回执 · ${path}`), severity: 'warning' });
      const planId = createId([builds]);
      builds.set(planId, { input, entry: input.target === 'web' ? 'index.html' : snapshot.project.release?.executableName ?? 'Game.exe', issues, cancelled: false, running: false, replaces, receipt: null });
      return ok({ planId, input, issues, capabilityResults: [] });
    },
    async build(id) {
      const build = builds.get(id); if (!build) return missing();
      const blocked = build.issues.find(item => item.severity === 'error'); if (blocked) return fail(blocked);
      if (build.receipt) return ok(build.receipt);
      if (build.running) return fail(issue('CANDIDATE_BUILD_RUNNING', '此候选构建正在进行。'));
      build.running = true;
      try {
        const cancelled = () => fail(issue('CANDIDATE_BUILD_CANCELLED', '已取消候选构建。请重新检查后开始构建。'));
        if (build.cancelled) return cancelled();
        await new Promise(resolve => setTimeout(resolve, 140));
        const listed = await documents.list(); if (!listed.ok) return listed;
        if (build.cancelled) return cancelled();
        if (!sameVersions(build.input.savedVersions, candidateReleaseVersions(listed.value))) return fail(issue('CANDIDATE_BUILD_STALE', '已保存的作品内容发生变化，请重新检查。'));
        const path = buildPath(build.input);
        if (buildOutputs.get(path) !== build.replaces) return fail(issue('CANDIDATE_BUILD_OUTPUT_STALE', '输出位置的审核回执已变化，请重新检查后审阅替换。'));
        const { projectId, releaseVersion, target, outputDirectory } = build.input;
        build.receipt = { projectId, releaseVersion, target, outputDirectory, entry: build.entry,
          handoff: { path, kind: 'directory' }, instructionsPath: `${path}/交付说明.html`, localTest: { result: 'notExecuted', evidencePaths: [] } };
        buildOutputs.set(path, id);
        return ok(build.receipt);
      } finally { build.running = false; }
    },
    async cancel(id) { const build = builds.get(id); if (!build) return missing(); if (!build.receipt) build.cancelled = true; return ok(undefined); },
    async test(id) {
      const build = builds.get(id); if (!build?.receipt) return missing();
      const compiled = await compile(true); if (!compiled.ok) return compiled;
      if (!compiled.value.snapshot) return fail(issue('CANDIDATE_BUILD_SNAPSHOT', '当前没有可体验的已保存作品。'));
      announce('候选浏览器已复核已保存快照。本机程序体验由桌面 Studio 执行。', build.receipt);
      return ok(build.receipt);
    },
    async instructions(id) { const receipt = builds.get(id)?.receipt; if (!receipt) return missing(); announce(`候选交付说明 · ${receipt.releaseVersion} · ${receipt.target} · 入口 ${receipt.entry}`, receipt); return ok(undefined); },
    async compatibility(id) { return builds.get(id)?.receipt ? ok(null) : missing(); },
  };
  const upgradesBridge: WorkbenchBridge['upgrades'] = {
    async list() {
      const result = await documents.list(); if (!result.ok) return result;
      const file = result.value.find(doc => doc.files['project.json'])?.files['project.json'];
      return ok(file ? [{ version: ProjectSchema.parse(JSON.parse(file).data).engineVersion, targets: ['web', 'windows'], conversions: [] }] : []);
    },
    async history() { return ok([...upgradeHistory.values()]); },
    async plan(input) {
      const result = await documents.list(); if (!result.ok) return result;
      if (result.value.some(doc => doc.dirty) || !sameVersions(input.expected, candidateReleaseVersions(result.value))) return fail(issue('CANDIDATE_UPGRADE_STALE', '请保存作品，再准备检查副本。'));
      const file = result.value.find(doc => doc.savedFiles['project.json'])?.savedFiles['project.json'];
      if (!file) return fail(issue('CANDIDATE_UPGRADE_PROJECT', '作品缺少已保存的项目文档。'));
      const project = ProjectSchema.parse(JSON.parse(file).data);
      if (project.projectId !== input.projectId || project.engineVersion !== input.toVersion) return fail(issue('CANDIDATE_UPGRADE_ENGINE', '候选宿主仅提供当前引擎的作品检查。'));
      const compiled = await compile(true, result.value); if (!compiled.ok) return compiled;
      const id = input.operationId ?? createId([upgrades]);
      const plan: UpgradePlan = { id, from: project.engineVersion, to: input.toVersion, base: input.expected,
        originalCopy: `candidate://engine/${id}/original`, workingCopy: `candidate://engine/${id}/check`, changes: [], dependencyChanges: [],
        validation: { validatedAt: new Date().toISOString(), sourceVersions: input.expected, checks: [{ kind: 'dsl', target: 'web', result: compiled.value.snapshot ? 'pass' : 'fail', issues: compiled.value.issues }] } };
      upgrades.set(id, plan); return ok(plan);
    },
    async commit(id) {
      const plan = upgrades.get(id); if (!plan) return missing();
      const current = await documents.list(); if (!current.ok) return current;
      if (current.value.some(doc => doc.dirty) || !sameVersions(plan.base, candidateReleaseVersions(current.value))) return fail(issue('CANDIDATE_UPGRADE_STALE', '作品已变化，请重新准备检查副本。'));
      if (plan.validation?.checks.some(check => check.result === 'fail')) return fail(issue('CANDIDATE_UPGRADE_INVALID', '检查副本存在阻塞问题。'));
      upgrades.delete(id); upgradeHistory.set(id, { id, from: plan.from, to: plan.to, originalCopy: plan.originalCopy, state: 'committed' }); return ok(undefined);
    },
    async restore(id) {
      const record = upgradeHistory.get(id); if (!record) return missing();
      return fail(issue('CANDIDATE_UPGRADE_READ_ONLY', '此回执记录同版本检查，作品内容没有转换。'));
    },
    async cancel(id) { return ok({ local: upgrades.delete(id) ? 'stopped' : 'alreadyFinished', remote: 'notApplicable' }); },
  };
  const files: WorkbenchBridge['files'] = {
    ...baseFiles,
    async chooseImport(input) {
      if (input.purpose !== 'packages') return baseFiles.chooseImport ? baseFiles.chooseImport(input) : ok([]);
      const source = packages.find(item => item.source?.kind === (input.directory ? 'directory' : 'archive'))?.source;
      return ok(source ? [source.path] : []);
    },
    async openBuild(id) { const receipt = builds.get(id)?.receipt; if (!receipt) return missing(); announce(`候选输出 · ${receipt.handoff.path}`, receipt); return ok(undefined); },
  };
  releaseEvents.set(buildBridge, listeners);
  return { documents: documentBridge, plugins, files, builds: buildBridge, upgrades: upgradesBridge };
}
