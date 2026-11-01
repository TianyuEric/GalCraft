import { displayMessage, localizedFields } from '@galcraft/plugins/contracts';
import type { DocumentWorkspace } from '../../components/workbench/document-workspace.js';
import { createId, LockSchema, type DocumentView, type EditInput, type EditReceipt, type Issue, type Json, type Result, type Source, type StudioBridge } from '@galcraft/contracts';
import { PluginManifestSchema, type PluginManifest, type StudioContribution, type StudioContributionDeclaration,
  type StudioPlugin, type StudioPluginContext, type StudioSlot, type GalCraftPlugin, type Contributions, type PluginContext,
  type PluginDefinition, type PluginToolResult, type StudioScope, type StudioCorePage, type ToolContribution } from '@galcraft/plugins/contracts';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ContributionRegistry, createRuntimeDependencyAccess } from '@galcraft/plugins/registry';
import { AuthorContributions, ToolRunner, ToolResult, type AuthorContributionServices, type AuthorDocument, type AuthorDocumentEntry, type AuthorToolEntry } from './author-contributions.js';
import { pluginReferencesFromDocuments, type PluginReference, type PublicFieldEditor } from './plugin-fields.js';
import { mountStudioDialog } from './studio-dialog.js';
import { installStudioPluginRuntimes, readPluginDefinition } from './plugin-runtimes.js';
import './studio-plugins.css';
import { AssetUiHost, validateAssetUi } from './asset-ui-host.js';

type Entry = { declaration: StudioContributionDeclaration; contribution: StudioContribution; context: StudioPluginContext };
type AuthorEntry = { manifest: PluginManifest; contributions: Contributions; definition: PluginDefinition; context: StudioPluginContext };
type Active = { instance: { deactivate(): Promise<void> }; abort: AbortController; releases: (() => void | Promise<void>)[] };
type PluginDocumentsBridge = {
  pluginList(input: { pluginId: string; contributionKey: string }): Promise<Result<AuthorDocument[]>>;
  pluginCreate(input: { pluginId: string; contributionKey: string; name: string; data?: Json }): Promise<Result<EditInput>>;
  pluginCopy(input: { documentId: string; name: string }): Promise<Result<EditInput>>;
  pluginDelete(input: { documentId: string; expectedRevision: number }): Promise<Result<EditInput>>;
  pluginUpdate(input: { documentId: string; expectedRevision: number; data: Json }): Promise<Result<EditInput>>;
};
export type StudioHostOptions = {
  workspace?: DocumentWorkspace;
  scope(): StudioScope;
  navigate(page: StudioCorePage, result?: PluginToolResult): Promise<Result<void>>;
  locate(source: Source): Promise<Result<void>>;
  services?: Pick<StudioPluginContext, 'semantic' | 'assets' | 'production' | 'playerUi' | 'runtimeDependencies' | 'soundbanks'>;
};
const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const fail = <T>(message: string): Result<T> => {
  const error = { code: 'PLUGIN_LOAD', severity: 'error' as const, owner: 'M09' as const, message, related: [], actions: ['retry' as const] };
  return { ok: false, error, issues: [error] };
};
export function matchStudioContributions(manifest: PluginManifest, offered: StudioContribution[]): Result<StudioContribution[]> {
  const declarations = manifest.studio ?? [];
  for (const item of offered) if (!declarations.some(declaration => declaration.key === item.key) || typeof item.mount !== 'function')
    return fail(`插件 ${manifest.id} 返回未声明或无效的 Studio 贡献 ${item.key}`);
  for (const item of offered) if (!item.title || ['zh-CN', 'en', 'ja'].some(locale => typeof item.title[locale as keyof typeof item.title] !== 'string' || !item.title[locale as keyof typeof item.title].trim()))
    return fail(`Studio 贡献 ${item.key} 缺少三语言标题`);
  for (const declaration of declarations) if (offered.filter(item => item.key === declaration.key).length !== 1)
    return fail(`Studio 贡献 ${declaration.key} 需要唯一实现`);
  return ok(offered);
}
export class StudioPluginHost {
  readonly assetUi = new AssetUiHost(() => this.authors, () => this.locale(), error => this.diagnostics.push({ code: 'PLUGIN_ASSET_UI_RELEASE', severity: 'warning', owner: 'M09', message: String(error), related: [], actions: [] }));
  private entries: Entry[] = [];
  private authors: AuthorEntry[] = [];
  private active: Active[] = [];
  private snapshot: DocumentView[] = [];
  private listeners = new Set<(scope: StudioScope) => void>();
  private scopeValue: StudioScope | null = null;
  private documentContexts = new Set<AuthorDocument>();
  private publicViews = new Map<string, { root: HTMLElement; dispose(): void }>();
  private publicRenders = new Map<string, () => void>();
  loadError = '';
  readonly diagnostics: Issue[] = [];
  private handle: string | null = null;
  private views = new Map<string, { root: HTMLElement; dispose(): void }>();
  private documentReleases = new Set<() => void>();
  private dialogs = new Set<{ dispose(): void }>();
  private generation = 0;
  constructor(private bridge: Pick<StudioBridge, 'documents' | 'plugins'>, readonly projectId: string, private locale: () => string,
    private navigate: (key: string) => Promise<void>, private changed: (receipt?: EditReceipt, input?: EditInput) => Promise<void>, private options?: StudioHostOptions) {}
  title(item: StudioContribution) { return item.title[this.locale() as keyof typeof item.title] ?? item.title['zh-CN']; }
  workbenches() { return this.entries.filter(item => item.declaration.kind === 'workbench').map(item => item.contribution); }
  commandSpecs() { return this.authors.flatMap(entry => (entry.definition.commands ?? entry.contributions.commands.map(command => command.spec)).map(command => ({ ...command, name: displayMessage(entry.definition.messages, this.locale(), command.nameKey, command.name), description: displayMessage(entry.definition.messages, this.locale(), command.descriptionKey, command.description), fields: localizedFields(command.fields, entry.definition.messages, this.locale()) }))); }
  conditionMetadata() { return this.authors.flatMap(entry => (entry.definition.conditions ?? entry.contributions.conditions.map(condition => ({ key: condition.key, fields: condition.fields }))).map(condition => ({ ...condition, fields: localizedFields(condition.fields, entry.definition.messages, this.locale()) }))); }
  componentDefinitions() { return this.authors.flatMap(entry => entry.contributions.components); }
  inspect(pluginId: string) {
    const author = this.authors.find(item => item.manifest.id === pluginId);
    const keys = author ? Object.values(author.contributions as unknown as Record<string, ({ key: string } | { id: string } | { spec: { key: string } })[] | undefined>).flatMap(collection => collection ?? []).map(item => 'spec' in item ? item.spec.key : 'id' in item ? item.id : item.key) : [];
    const definedKeys = author ? Object.values(author.definition).filter(Array.isArray).flat().map(item => 'id' in item ? item.id : item.key) as string[] : [];
    return { manifest: author?.manifest ?? null, definedKeys, activeKeys: [...keys, ...this.entries.filter(item => item.context.pluginId === pluginId).map(item => item.contribution.key)], issues: [...this.diagnostics], loadError: this.loadError };
  }
  scope(): StudioScope {
    const scope = structuredClone(this.options?.scope() ?? { page: 'plugins', sceneId: null, documentId: null, statementIds: [], textRange: null, assetIds: [], insertion: null, versions: [] });
    const document = [...this.documentContexts].at(-1);
    if (document) { scope.documentId = document.documentId; scope.sceneId = null; scope.statementIds = []; scope.textRange = null; scope.insertion = null; scope.versions = [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }]; }
    const revisions = new Map(this.snapshot.map(item => [item.documentId, { ref: { kind: 'document' as const, id: item.documentId }, revision: item.revision }]));
    for (const version of scope.versions) if (version.ref.kind === 'document') revisions.set(version.ref.id, { ref: { kind: 'document', id: version.ref.id }, revision: version.revision });
    scope.versions = [...revisions.values()]; return scope;
  }
  publishScope() {
    const next = this.scope();
    if (JSON.stringify(next) === JSON.stringify(this.scopeValue)) return;
    this.scopeValue = next; for (const listener of this.listeners) listener(structuredClone(next));
  }
  private async retire(active: Active[]) {
    for (const item of active) item.abort.abort();
    const releases = new Set(active.flatMap(item => item.releases));
    const outcomes = await Promise.allSettled([...active.map(item => Promise.resolve().then(() => item.instance.deactivate())), ...[...releases].map(release => Promise.resolve().then(release))]);
    for (const outcome of outcomes) if (outcome.status === 'rejected') this.diagnostics.push({ code: 'PLUGIN_RELEASE', severity: 'warning', owner: 'M09', message: String(outcome.reason), related: [], actions: [] });
  }
  private async apply(input: EditInput): Promise<Result<EditReceipt>> {
    const plan = await this.bridge.documents.planEdit({ ...input, origin: 'plugin' }); if (!plan.ok) return plan;
    const applied = await this.bridge.documents.applyEdit(plan.value.planId, plan.value.input.expected);
    if (applied.ok) { const snapshot = await this.bridge.documents.list(); if (snapshot.ok) this.snapshot = snapshot.value; await this.changed(applied.value, input); }
    return applied;
  }
  private context(manifest: PluginManifest, abort: AbortController, releases: Active['releases']): StudioPluginContext {
    const docs = this.bridge.documents as StudioBridge['documents'] & PluginDocumentsBridge;
    return { pluginId: manifest.id, projectId: this.projectId, target: 'windows', signal: abort.signal,
      onDispose: release => { releases.push(release); },
      scope: { read: () => this.scope(), subscribe: listener => { this.listeners.add(listener); const release = () => { this.listeners.delete(listener); }; releases.push(release); return release; } },
      navigation: { openCore: page => this.options?.navigate(page) ?? Promise.resolve(fail('核心页面导航不可用')), locate: source => this.options?.locate(source) ?? Promise.resolve(fail('源位置定位不可用')) },
      ...this.options?.services,
      soundbanks: manifest.externalRuntimeDependencies?.includes('org.galcraft.music-composition/soundbanks') ? this.options?.services?.soundbanks : undefined,
        runtimeDependencies: this.options?.services?.runtimeDependencies ? createRuntimeDependencyAccess(manifest.externalRuntimeDependencies ?? [], key => this.options!.services!.runtimeDependencies!.resolve(key)) : undefined,
      documents: { list: () => this.bridge.documents.list(), read: async id => { const listed = await this.bridge.documents.list(); if (!listed.ok) return listed; const item = listed.value.find(value => value.documentId === id); return item ? ok(item) : fail('文档已移除'); },
        apply: input => this.apply(input), prepare: async input => { const plan = await this.bridge.documents.planEdit({ ...input, origin: 'plugin' }); if (plan.ok) this.plans.set(plan.value.planId, plan.value.input); return plan; },
        applyPlan: async id => { const plan = this.plans.get(id); if (!plan) return fail('请重新准备编辑计划'); const result = await this.bridge.documents.applyEdit(id, plan.expected); if (result.ok) { this.plans.delete(id); await this.changed(result.value, plan); } return result; },
        create: async input => { const planned = await docs.pluginCreate({ pluginId: manifest.id, contributionKey: input.contributionKey, name: input.contributionKey.split('/').at(-1)!, data: input.data }); return planned.ok ? this.apply(planned.value) : planned; },
        copy: async documentId => { const planned = await docs.pluginCopy({ documentId, name: this.locale() === 'en' ? 'Copy' : this.locale() === 'ja' ? 'コピー' : '副本' }); return planned.ok ? this.apply(planned.value) : planned; },
        remove: async documentId => { const listed = await this.bridge.documents.list(); if (!listed.ok) return listed; const document = listed.value.find(item => item.documentId === documentId); if (!document) return fail('文档已移除'); const planned = await docs.pluginDelete({ documentId, expectedRevision: document.revision }); return planned.ok ? this.apply(planned.value) : planned; } },
      results: { show: async result => { this.showResult(result); return ok(undefined); } },
      open: (key, input = null) => this.open(key, input, manifest.id) };
  }
  private plans = new Map<string, EditInput>();
  private pluginContext(entry: AuthorEntry, scope: StudioScope, signal?: AbortSignal, documents = this.snapshot): PluginContext {
    return { pluginId: entry.manifest.id, target: 'windows', domain: { projectId: this.projectId, kind: 'sample', instance: 'studio' }, studio: entry.context, scope, signal,
      onDispose: release => entry.context.onDispose?.(release),
      documents: { read: ref => { const document = documents.find(item => item.documentId === ref.id); if (!document) return fail('文档不在本次作品快照');
        const raw = Object.values(document.files).find(value => value.trimStart().startsWith('{')); if (!raw) return fail('此文档没有 JSON 数据');
        try { return ok((JSON.parse(raw) as { data: Json }).data); } catch { return fail('文档数据无法解析'); } }, propose: () => fail('请使用异步 studio.documents.prepare 或返回编辑提案') },
      assets: { resolve: async ref => { const result = await entry.context.assets?.read(ref.id); if (!result) return fail('素材服务不可用'); if (!result.ok) return result;
        const asset = result.value, variant = asset.variants.find(value => value.id === asset.activeVariantId); if (!variant) return fail('素材当前版本不可用');
        return ok({ assetId: asset.id, variantId: variant.id, kind: asset.kind, entry: variant.entry, files: variant.files.map(({ path, bytes, mime }) => ({ path, bytes, mime })), metadata: variant.metadata, canvas: variant.canvas, provider: variant.groupCapabilities?.resolver ?? null }); } },
      pages: { open: async (key, input) => { const opened = await this.open(key, input, entry.manifest.id); return opened.ok ? ok(null) : opened; } },
      log: issue => { this.diagnostics.push(issue); } };
  }
  async load(): Promise<Result<void>> {
    installStudioPluginRuntimes();
    const generation = ++this.generation, listed = await this.bridge.documents.list();
    if (!listed.ok) { this.loadError = listed.error.message; return listed; }
    const raw = listed.value.flatMap(item => Object.entries(item.files)).find(([path]) => path === 'dependencies.lock.json')?.[1];
    if (!raw) return fail('缺少作品依赖锁');
    const lock = LockSchema.parse(JSON.parse(raw).data), resolved = await this.bridge.plugins.resolve(lock);
    if (!resolved.ok) { this.loadError = resolved.error.message; return resolved; }
    const instances: Active[] = [], entries: Entry[] = [], authors: AuthorEntry[] = [];
    try {
      const registry = new ContributionRegistry();
      for (const item of resolved.value.packages) {
        const registered = registry.registerInstalled(PluginManifestSchema.parse(item.manifest));
        if (!registered.ok) throw new Error(registered.error.message);
      }
      const prepared = registry.prepareContributions({...lock,plugins:[...lock.plugins,...resolved.value.packages.map(item=>PluginManifestSchema.parse(item.manifest)).filter(manifest=>!lock.plugins.some(item=>item.id===manifest.id)).map(manifest=>({kind:'plugin' as const,id:manifest.id,version:manifest.version,targets:manifest.targets,required:true}))]}, 'windows', ['definition', 'editor']);
      if (!prepared.ok) throw new Error(prepared.error.message);
      for (const provider of prepared.value.loadOrder) {
        const item = resolved.value.packages.find(item => {
          const manifest = item.manifest as PluginManifest;
          return manifest.id === provider.id && manifest.version === provider.version;
        })!;
        const manifest = PluginManifestSchema.parse(item.manifest);
        const hasAuthor = manifest.contributions.some(value => ['document', 'tool', 'fieldEditor', 'command', 'component', 'assetType', 'assetEditor', 'assetPreview', 'assetThumbnail', 'productionOperation'].includes(value.kind));
        if (!manifest.studio?.length && !hasAuthor) continue;
        const abort = new AbortController(), releases: Active['releases'] = [], context = this.context(manifest, abort, releases);
        let definition: PluginDefinition = {};
        const definitionUrl = (item as typeof item & { definitionUrl?: string | null }).definitionUrl;
        if (definitionUrl) definition = await readPluginDefinition(definitionUrl);
        if (!item.editorUrl && (manifest.studio?.length || manifest.contributions.some(value => value.kind === 'fieldEditor' || value.kind === 'tool' && !manifest.externalTools?.includes(value.key)))) throw new Error(`插件 ${manifest.id} 缺少 Studio 编辑入口`);
        const requiresLegacyMetadata = manifest.contributions.some(value => value.kind === 'command' && !definition.commands?.length || value.kind === 'component' && !definition.components?.length);
        const authorUrl = item.editorUrl ?? (requiresLegacyMetadata ? item.runtimeUrl : null);
        const module = authorUrl ? await import(/* @vite-ignore */ authorUrl) as { createStudioPlugin?: () => StudioPlugin; createPlugin?: () => GalCraftPlugin } : {};
        const author: AuthorEntry = { manifest, definition, context, contributions: { commands: [], conditions: [], documents: definition.documents ?? [], tools: [], resources: [], stages: [], pages: [], components: definition.components ?? [], systems: [], platform: [] } };
        if (module.createPlugin) {
          const instance = module.createPlugin(); instances.push({ instance, abort, releases });
          const contributions = await instance.activate(this.pluginContext(author, this.scope(), abort.signal, listed.value));
          author.contributions = { ...contributions, documents: definition.documents ?? contributions.documents, components: definition.components ?? contributions.components };
        }
        for (const kind of ['document', 'tool', 'fieldEditor'] as const) {
          const collection = kind === 'document' ? author.contributions.documents : kind === 'tool' ? author.contributions.tools : author.contributions.fieldEditors ?? [];
          for (const value of collection) if (!manifest.contributions.some(declaration => declaration.kind === kind && declaration.key === value.key)) throw new Error(`插件 ${manifest.id} 返回未声明的 ${kind} ${value.key}`);
          for (const declaration of manifest.contributions.filter(value => value.kind === kind)) {
            const count = collection.filter(value => value.key === declaration.key).length;
            if (count === 0 && kind === 'tool' && manifest.externalTools?.includes(declaration.key)) continue;
            if (count !== 1) throw new Error(`贡献 ${declaration.key} 需要唯一实现`);
          }
        }
        for (const editor of author.contributions.fieldEditors ?? []) if (!editor.contributionKey.startsWith(`${manifest.id}/`) || ![...author.contributions.documents.map(value => value.key), ...(definition.commands ?? author.contributions.commands.map(value => value.spec)).map(value => value.key), ...(definition.productionOperations ?? []).map(value => value.id)].includes(editor.contributionKey)) throw new Error(`字段编辑器 ${editor.key} 只能编辑本插件公开贡献`);
        validateAssetUi(author);
        authors.push(author);
        if (manifest.studio?.length) {
          const instance = module.createStudioPlugin?.(); if (!instance || typeof instance.activateStudio !== 'function' || typeof instance.deactivate !== 'function') throw new Error(`插件 ${manifest.id} 编辑入口须导出 createStudioPlugin`);
          instances.push({ instance, abort, releases }); const offered = matchStudioContributions(manifest, await instance.activateStudio(context)); if (!offered.ok) throw new Error(offered.error.message);
          for (const declaration of manifest.studio) entries.push({ declaration, contribution: offered.value.find(value => value.key === declaration.key)!, context });
        }
        if (!instances.some(value => value.abort === abort)) instances.push({ instance: { deactivate: async () => {} }, abort, releases });
      }
      if (generation !== this.generation) throw new Error('作品插件加载已取消');
      this.unmountViews(); for (const release of this.documentReleases) release(); this.documentReleases.clear();
      const previous = this.active, previousHandle = this.handle;
      this.entries = []; this.authors = []; this.active = []; this.handle = null;
      await this.retire(previous);
      if (previousHandle) await this.bridge.plugins.release(previousHandle);
      if (generation !== this.generation) throw new Error('作品插件加载已取消');
      this.entries = entries; this.authors = authors; this.active = instances; this.handle = resolved.value.handleId; this.snapshot = listed.value;
      this.loadError = '';
      return ok(undefined);
    } catch (error) {
      await this.retire(instances);
      await this.bridge.plugins.release(resolved.value.handleId);
      this.loadError = String(error); return fail(this.loadError);
    }
  }
  private view(entry: Entry, input: Json = null, close: () => void = () => {}) {
    const root = document.createElement('section'); root.className = 'studio-plugin-contribution'; root.dataset.contribution = entry.contribution.key;
    let cleanup: void | (() => void);
    try { cleanup = entry.contribution.mount(root, { ...entry.context, locale: this.locale(), input, close }); }
    catch (error) { root.setAttribute('role', 'alert'); root.textContent = `${entry.contribution.key}: ${String(error)}`; }
    return { root, dispose: () => { try { if (typeof cleanup === 'function') cleanup(); } finally { root.remove(); } } };
  }
  mountWorkbench(key: string, parent: HTMLElement) {
    const entry = this.entries.find(item => item.contribution.key === key && item.declaration.kind === 'workbench');
    if (!entry) { const message = document.createElement('p'); message.textContent = '此作品的插件工作台已停用'; parent.append(message); return; }
    this.mountEntry(entry, parent);
  }
  private mountEntry(entry: Entry, parent: HTMLElement) {
    let view = this.views.get(entry.contribution.key);
    if (!view) { view = this.view(entry); this.views.set(entry.contribution.key, view); }
    parent.append(view.root);
  }
  mountSlot(slot: StudioSlot, parent: HTMLElement) {
    const entries = this.entries.filter(item => item.declaration.slot === slot);
    const publicLocation = slot === 'plugins.configuration' ? 'tools.list' : slot;
    const publicContent = this.tools(publicLocation).length > 0 || slot === 'plugins.configuration' && this.documentTypes().length > 0;
    if (!entries.length && !publicContent) return;
    const region = document.createElement('aside'); region.className = 'studio-plugin-slot'; region.dataset.slot = slot;
    for (const entry of entries) {
      if (entry.declaration.kind === 'dialog') {
        const button = document.createElement('button'); button.className = 'studio-button'; button.textContent = this.title(entry.contribution);
        button.onclick = () => { void this.open(entry.contribution.key); }; region.append(button);
      } else this.mountEntry(entry, region);
    }
    if (publicContent) {
      let view = this.publicViews.get(slot);
      if (!view) {
        const root = document.createElement('div'), react = createRoot(root);
        const render = () => react.render(createElement(AuthorContributions, { services: this.authorServices, locale: this.locale(), location: publicLocation, documents: slot === 'plugins.configuration' }));
        this.publicRenders.set(slot, render); render();
        view = { root, dispose: () => { react.unmount(); root.remove(); } }; this.publicViews.set(slot, view);
      }
      else this.publicRenders.get(slot)?.();
      region.append(view.root);
    }
    parent.append(region);
  }
  translate(pluginId: string, key: string): string {
    const messages = this.authors.find(entry => entry.manifest.id === pluginId)?.definition.messages;
    return messages?.[this.locale()]?.[key] ?? messages?.['zh-CN']?.[key] ?? messages?.en?.[key] ?? key.split('/').at(-1) ?? key;
  }
  tools(location: string): AuthorToolEntry[] {
    const scope = this.scope();
    return this.authors.flatMap(entry => entry.contributions.tools.filter(tool => (tool.locations ?? ['tools.list']).includes(location as never)).map(tool => {
      let available = true, reason = '';
      if (tool.scope?.pages?.length && !tool.scope.pages.includes(scope.page)) { available = false; reason = this.locale() === 'en' ? 'Open the required page' : this.locale() === 'ja' ? '対象ページを開いてください' : '请先打开适用页面'; }
      const selection = tool.scope?.selection;
      if (selection === 'statements' && !scope.statementIds.length || selection === 'assets' && !scope.assetIds.length || selection === 'documents' && !scope.documentId) {
        available = false; reason = this.locale() === 'en' ? `Select ${selection} first` : this.locale() === 'ja' ? '対象を選択してください' : selection === 'statements' ? '请先选择语句' : selection === 'assets' ? '请先选择素材' : '请先选择文档';
      }
      if (available && tool.applicable) { try { const applicability = tool.applicable(scope); available = applicability.available; reason = applicability.reason ?? (this.locale() === 'en' ? 'The selected scope is unavailable' : this.locale() === 'ja' ? '選択範囲を利用できません' : '当前选择不适用于此工具'); } catch (e) { available = false; reason = String(e); } }
      return { tool, title: this.translate(entry.manifest.id, tool.titleKey), pluginId: entry.manifest.id, available, reason };
    }));
  }
  documentTypes(): AuthorDocumentEntry[] { return this.authors.flatMap(entry => entry.contributions.documents.map(definition => ({ definition, pluginId: entry.manifest.id, title: this.translate(entry.manifest.id, definition.titleKey ?? definition.key) }))); }
  editor(pluginId: string, contribution: string, field: string): PublicFieldEditor | undefined {
    const entry = this.authors.find(item => item.manifest.id === pluginId), editor = entry?.contributions.fieldEditors?.find(item => item.contributionKey === contribution && item.fieldKey === field);
    if (!entry || !editor) return undefined;
    return { mount: (root, value, commit) => { const abort = new AbortController(); const cleanup = editor.mount(root, { value, locale: this.locale(), signal: abort.signal, commit: next => abort.signal.aborted ? Promise.resolve(fail('字段编辑器已卸载，请重新打开当前字段')) : commit(next), studio: entry.context }); return () => { abort.abort(); if (typeof cleanup === 'function') cleanup(); }; } };
  }
  mountFieldEditor(contribution: string, field: string, root: HTMLElement, value: Json, commit: (value: Json) => Promise<Result<void>>): boolean {
    const pluginId = contribution.split('/')[0]!, editor = this.editor(pluginId, contribution, field); if (!editor) return false;
    const key = `field:${contribution}:${field}`, previous = this.publicViews.get(key); previous?.dispose();
    try { const release = editor.mount(root, value, commit); this.publicViews.set(key, { root, dispose: release }); } catch (error) { root.setAttribute('role', 'alert'); root.textContent = String(error); }
    return true;
  }
  clearFieldEditors() { for (const [key, view] of this.publicViews) if (key.startsWith('field:')) { view.dispose(); this.publicViews.delete(key); } }
  mountProductionFieldEditor(operationId: string, editorKey: string, root: HTMLElement, target: import('@galcraft/plugins/contracts').ProductionFieldEditorContext): (() => void) | null {
    const entry = this.authors.find(item => item.definition.productionOperations?.some(operation => operation.id === operationId && operation.version === target.operation.version && operation.fieldEditorKey === editorKey));
    const editor = entry?.contributions.fieldEditors?.find(item => item.key === editorKey && item.contributionKey === operationId);
    if (!entry || !editor || target.operation.id !== operationId) return null;
    const abort = new AbortController(), key = `production:${operationId}:${target.draftId}`;
    this.publicViews.get(key)?.dispose();
    let cleanup: void | (() => void);
    const dispose = () => { if (abort.signal.aborted) return; abort.abort(); if (cleanup) cleanup(); if (this.publicViews.get(key)?.root === root) this.publicViews.delete(key); root.replaceChildren(); };
    const commit: typeof target.commit = input => abort.signal.aborted || target.readonly ? Promise.resolve(fail('制作输入上下文已关闭或为只读')) : target.commit(input);
    try { cleanup = editor.mount(root, { value: structuredClone(target.fields), locale: this.locale(), signal: abort.signal, target: { ...target, commit }, studio: entry.context,
      commit: async value => { if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('制作字段必须是对象');
        const result = await commit({ expectedRevision: target.revision, fields: value, references: target.references }); return result.ok ? ok(undefined) : result; } });
    } catch (error) { root.textContent = String(error); root.setAttribute('role', 'alert'); }
    this.publicViews.set(key, { root, dispose }); return dispose;
  }
  async references(): Promise<PluginReference[]> {
    const listed = await this.bridge.documents.list(); if (!listed.ok) throw new Error(listed.error.message);
    this.snapshot = listed.value;
    return pluginReferencesFromDocuments(listed.value);
  }
  readonly authorServices: AuthorContributionServices = {
    workspace: { open: (id, title, mount) => {
      if (!this.options?.workspace) throw new Error('文档工作区不可用');
      let release: () => void;
      release = this.options.workspace.open(id, title, (done, changed) => {
        const editor = mount(done, changed);
        return { ...editor, dispose: () => { editor.dispose(); this.documentReleases.delete(release); } };
      });
      this.documentReleases.add(release); return release;
    } },
    tools: location => this.tools(location), documentTypes: () => this.documentTypes(), scope: () => this.scope(), references: () => this.references(),
    translate: (pluginId, key) => this.translate(pluginId, key), editor: (pluginId, contribution, field) => this.editor(pluginId, contribution, field),
    documentContext: document => { const context = { ...document }; this.documentContexts.add(context); this.publishScope(); return () => { this.documentContexts.delete(context); this.publishScope(); }; },
    documents: {
      list: entry => (this.bridge.documents as StudioBridge['documents'] & PluginDocumentsBridge).pluginList({ pluginId: entry.pluginId, contributionKey: entry.definition.key }),
      create: async (entry, name) => { const planned = await (this.bridge.documents as StudioBridge['documents'] & PluginDocumentsBridge).pluginCreate({ pluginId: entry.pluginId, contributionKey: entry.definition.key, name }); return this.applyPrepared(planned); },
      copy: async (document, name) => this.applyPrepared(await (this.bridge.documents as StudioBridge['documents'] & PluginDocumentsBridge).pluginCopy({ documentId: document.documentId, name })),
      remove: async document => this.applyPrepared(await (this.bridge.documents as StudioBridge['documents'] & PluginDocumentsBridge).pluginDelete({ documentId: document.documentId, expectedRevision: document.revision })),
      update: async (document, data) => this.applyPrepared(await (this.bridge.documents as StudioBridge['documents'] & PluginDocumentsBridge).pluginUpdate({ documentId: document.documentId, expectedRevision: document.revision, data })),
    },
    run: async (entry, input, scope, signal) => { const author = this.authors.find(value => value.manifest.id === entry.pluginId); if (!author) return fail('工具已停用');
      const documents = await this.bridge.documents.list(); if (!documents.ok) return documents;
      if (scope.versions.some(version => version.ref.kind === 'document' && documents.value.find(item => item.documentId === version.ref.id)?.revision !== version.revision)) return fail('工具打开后作品内容已变化，请重新打开工具取得当前范围；已有结果仍可审阅');
      const releases: (() => void | Promise<void>)[] = [], context = this.pluginContext(author, structuredClone(scope), signal, documents.value);
      context.onDispose = release => { releases.push(release); };
      try { return await entry.tool.run(structuredClone(input), context, signal); } finally { await Promise.allSettled(releases.map(release => Promise.resolve().then(release))); } },
    apply: async input => this.applyPrepared(ok(input)),
    locate: issue => issue.source ? this.options?.locate(issue.source) ?? Promise.resolve(fail('源位置定位不可用')) : issue.entity?.kind === 'asset' ? this.options?.navigate('assets') ?? Promise.resolve(fail('素材导航不可用')) : Promise.resolve(fail('此结果没有可定位的源位置')),
    openProduction: result => this.options?.navigate('production', result) ?? Promise.resolve(fail('制作导航不可用')),
  };
  private async applyPrepared(planned: Result<EditInput>): Promise<Result<void>> { if (!planned.ok) return planned; const applied = await this.apply(planned.value); return applied.ok ? ok(undefined) : applied; }
  openPublicTool(pluginId: string, key: string) {
    const entry = this.tools('commands.palette').find(item => item.pluginId === pluginId && item.tool.key === key);
    if (!entry?.available) return;
    const node = document.createElement('div'); (document.getElementById('studio-portals') ?? document.body).append(node);
    const root = createRoot(node), view = { dispose: () => { root.unmount(); node.remove(); this.dialogs.delete(view); } };
    this.dialogs.add(view); root.render(createElement(ToolRunner, { entry, services: this.authorServices, locale: this.locale(), close: () => queueMicrotask(view.dispose) }));
  }
  openTools(location: 'commands.palette' | 'context.menu') {
    const dialog = mountStudioDialog({ title: this.locale() === 'en' ? 'Plugin tools' : this.locale() === 'ja' ? 'プラグインツール' : '插件工具', locale: this.locale(), disposed: () => this.dialogs.delete(dialog),
      mount: () => { const root = document.createElement('div'), react = createRoot(root); react.render(createElement(AuthorContributions, { services: this.authorServices, locale: this.locale(), location })); return { root, dispose: () => { react.unmount(); root.remove(); } }; } }); this.dialogs.add(dialog);
  }
  private showResult(result: PluginToolResult) {
    const dialog = mountStudioDialog({ title: this.locale() === 'en' ? 'Plugin result' : this.locale() === 'ja' ? 'プラグインの結果' : '插件结果', locale: this.locale(), disposed: () => this.dialogs.delete(dialog),
      mount: () => { const root = document.createElement('div'), react = createRoot(root); react.render(createElement(ToolResult, { services: this.authorServices, locale: this.locale(), result })); return { root, dispose: () => { react.unmount(); root.remove(); } }; } }); this.dialogs.add(dialog);
  }
  async open(key: string, input: Json = null, pluginId?: string): Promise<Result<void>> {
    const entry = this.entries.find(item => item.contribution.key === key && (!pluginId || item.context.pluginId === pluginId));
    if (!entry) return fail(`Studio 贡献 ${key} 未启用`);
    if (entry.declaration.kind === 'workbench') { await this.navigate(key); return ok(undefined); }
    if (entry.declaration.kind !== 'dialog') return fail('表单和面板由所属页面槽呈现');
    const dialog = mountStudioDialog({ title: this.title(entry.contribution), locale: this.locale(),
      mount: close => this.view(entry, input, close), disposed: () => this.dialogs.delete(dialog) });
    this.dialogs.add(dialog);
    return ok(undefined);
  }
  unmountViews() {
    this.assetUi.dispose();
    for (const view of [...this.views.values(), ...this.publicViews.values(), ...this.dialogs]) try { view.dispose(); } catch (error) { this.diagnostics.push({ code: 'PLUGIN_VIEW_RELEASE', severity: 'warning', owner: 'M09', message: String(error), related: [], actions: [] }); }
    this.views.clear(); this.publicViews.clear(); this.publicRenders.clear();
  }
  async dispose() { ++this.generation; this.unmountViews(); for (const release of this.documentReleases) release(); this.documentReleases.clear();
    const active = this.active, handle = this.handle;
    this.active = []; this.handle = null; this.entries = []; this.authors = []; this.listeners.clear(); this.documentContexts.clear(); this.plans.clear();
    await this.retire(active); if (handle) await this.bridge.plugins.release(handle); }
}
