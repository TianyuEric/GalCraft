import { operationTitle } from '@galcraft/plugins/contracts';
import { defaultOperation, variantOperation, operationPurpose, normalizeProductionDraft, resolveProductionFields } from '@galcraft/authoring/production/draft';
import type { ProductionOperation, SpeechLine } from '@galcraft/authoring/production';
import type { CreationRecipe } from '@galcraft/authoring/recipes';
import { createId, reserveIds, issueFromError, type Issue } from '@galcraft/contracts';
import { workflowSupportsPurpose } from '@galcraft/generation-services/validation';
import type {
  ProductionFormDraft,
  FormVariant,
  TaskPlan,
  Candidate,
} from "@galcraft/authoring/production";
import type { EditPlan } from "@galcraft/contracts";
import type { WorkbenchBridge, Overview } from "./bridge.js";
import { unwrap } from "./bridge.js";
import { validateOperationInput, operationSupportsConnection } from '@galcraft/authoring/production/operations';
import type { ProductionFieldEditorContext } from '@galcraft/plugins/contracts';
export type QuickIntent = 'script' | 'stage' | 'background' | 'figure' | 'page' | 'ui-assets' | 'voice' | 'music' | 'cg' | 'difference';
export type QuickScope = { sceneId?: string | null; statementId?: string | null; statementIds?: string[]; textRange?: { start: number; end: number } | null; pageIds?: string[]; componentIds?: string[] };
export type ContinuationView = { sourceId: string; mode: 'write' | 'performance' | 'discuss'; instruction: string; summary: string };
export type ProductionGuiDraft = {
  workflowDocuments: {id:string;text:string;importText?:string;baseline?:string;paste?:string;title:string;dirty:boolean;draftRevision?:number|null;expectedRevision:number|null;closeRequest:number}[];
  activeWorkflow:string; tab:string; recipe:CreationRecipe|null; recipeBaseline:string;
  uiProposal:import('@galcraft/authoring/production').UIPlanProposal|null;
  uiSource:Pick<Parameters<WorkbenchBridge['production']['prepareUIPlan']>[0],'candidateId'|'expected'|'scope'|'draft'>|null;
  uiBaseline:string;
};

export class ProductionSession {
  data: Overview = {
    canvas: { width: 1920, height: 1080 },
    scenes: [],
    pages: [],
    characters: [],
    tasks: [],
    drafts: [],
    candidates: [],
    recipes: [],
    assets: [],
    connections: [],
    workflows: [],
    versions: [],
  };
  draft: ProductionFormDraft | null = null;
  guiDraft: ProductionGuiDraft | null = null;
  connectionGuiDraft:{edit:import('@galcraft/contracts').ConnectionConfig|null;provider:string;secret:string;advanced:string|null;baseline:string;selection:string[]}|null=null;
  connectionDirty=false;
  taskId: string | null = null;
  selected = new Set<string>();
  candidateText = new Map<string, string>();
  private continuationViews = new Map<string, ContinuationView>();
  plan: TaskPlan | null = null;
  adoption: EditPlan | null = null;
  origin: {
    page: string;
    sceneId: string | null;
    statementId: string | null;
    pageIds: string[];
    componentIds: string[];
  } | null = null;
  error = "";
  diagnostic: Issue | null = null;
  quickIntent: QuickIntent | null = null;
  quickOpen = false;
  revision = 0;
  draftDirty = false;
  draftSaving = false;
  private draftEdit = 0;
  private savedDraft: ProductionFormDraft | null = null;
  private listeners = new Set<() => void>();
  private saving: Promise<void> = Promise.resolve();
  private autosave: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private saveLifecycle = 0;
  private suspended = false;
  private visible = true;
  constructor(
    readonly bridge: WorkbenchBridge,
    readonly projectId: string,
    public displayLocale: () => string = () => 'zh-CN',
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.revision;
  changed() {
    this.revision++;
    this.listeners.forEach((l) => l());
  }
  private refreshRequest = 0;
  private completedRefresh = 0;
  async refresh() {
    if (this.suspended) return;
    const request = ++this.refreshRequest;
    const taskId = this.taskId;
    const response = await this.bridge.production.overview({ taskId });
    if (taskId !== this.taskId) return;
    if (request < this.completedRefresh) return;
    const data = unwrap(response);
    this.completedRefresh = request;
    this.data = data;
    reserveIds(this.data);
    this.data.drafts.forEach(normalizeProductionDraft);
    if (!this.draft) {
      const draft = this.data.drafts.find((d) => !d.submittedTaskId);
      this.draft = draft ? structuredClone(draft) : null;
      this.savedDraft = this.draft ? structuredClone(this.draft) : null;
      if (this.draft?.origin) this.origin = this.draft.origin;
    } else {
      const saved = this.data.drafts.find(d => d.id === this.draft!.id);
      if (saved && (!this.savedDraft || saved.revision > this.savedDraft.revision)) this.savedDraft = structuredClone(saved);
    }
    if (!this.taskId && !this.draft) this.taskId = this.data.tasks.at(-1)?.id ?? null;
    this.changed();
  }
  start() {
    if (this.poll) return;
    this.suspended = false;
    this.scheduleSave();
    const refresh = () => {
      if (this.polling || !this.visible || typeof document !== 'undefined' && document.hidden) return;
      this.polling = true;
      void this.refresh().catch((e) => {
        this.error = String(e); this.diagnostic = issueFromError(e, 'M10');
        this.changed();
      }).finally(() => { this.polling = false; });
    };
    refresh();
    this.poll = setInterval(refresh, 1800);
  }
  setVisible(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible;
    if (visible && this.poll) void this.refresh().catch(error => { this.error = String(error); this.diagnostic = issueFromError(error, 'M10'); this.changed(); });
  }
  stop() {
    this.suspended = true;
    this.saveLifecycle++;
    this.completedRefresh=++this.refreshRequest;
    if (this.autosave) clearTimeout(this.autosave);
    this.autosave = null;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }
  get task() {
    return this.data.tasks.find((t) => t.id === this.taskId);
  }
  get tasks() { return this.data.taskSummaries ?? this.data.tasks; }
  continuationView(taskId: string): ContinuationView {
    let view = this.continuationViews.get(taskId);
    if (!view) {
      view = { sourceId: '', mode: 'write', instruction: '', summary: '' };
      this.continuationViews.set(taskId, view);
    }
    return view;
  }
  updateContinuation(taskId: string, patch: Partial<ContinuationView>) {
    this.continuationViews.set(taskId, { ...this.continuationView(taskId), ...patch });
    this.changed();
  }
  get variant() {
    return this.draft?.variants[this.draft.activeUse];
  }
  async startQuick(intent: QuickIntent, scope: QuickScope = {}) {
    return this.openProductionDraft(intent, scope);
  }
  async openProductionDraft(intent: QuickIntent, scope: QuickScope = {}, recipe?: CreationRecipe) {
    if (this.draftDirty && this.draft && !this.draft.submittedTaskId) await this.saveDraft(true);
    await this.refresh();
    this.quickIntent = intent;
    const script = intent === 'script' || intent === 'stage';
    this.origin = { page: intent === 'page' || intent === 'ui-assets' ? 'pages' : 'editor', sceneId: scope.sceneId ?? (script ? this.origin?.sceneId : null) ?? null,
      statementId: scope.statementId ?? null, pageIds: scope.pageIds ?? (intent === 'page' ? this.origin?.pageIds : []) ?? [], componentIds: scope.componentIds ?? [] };
    const usage = intent === 'page' || intent === 'ui-assets' ? 'ui' : intent === 'music' ? 'bgm' : intent === 'stage' ? 'script' : intent;
    this.newDraft(usage);
    const variant = this.variant!;
    variant.fields.creationMode = intent === 'stage' ? 'performance' : 'write';
    variant.operation = intent === 'stage' ? 'performance' : intent === 'page' ? 'uiPatch' : defaultOperation(usage);
    this.configureQuickScope(scope);
    const purpose = intent === 'page' ? 'uiPatch' : 'script';
    const official = this.data.recipes.filter(item => !item.production && !item.parameterPreset && item.scope === 'official' && item.uses.includes(usage));
    const chosen = recipe ?? this.data.recipes.find(item => item.id === this.data.defaults?.recipes[intent])
      ?? (script || intent === 'page' ? official.find(item => item.purposes.includes(purpose) && (intent === 'stage' ? item.scriptMode === 'performance' : item.scriptMode !== 'performance')) : undefined);
    if (chosen) {
      if (chosen.production) {
        variant.productionRecipeId = chosen.id;
        variant.operation = chosen.production.operation;
        variant.operationSnapshot = structuredClone(chosen.operationSnapshot ?? this.data.operations?.find(item => item.id === chosen.production!.operation));
        if (variant.operationSnapshot?.provider) {
          variant.fields = Object.fromEntries(variant.operationSnapshot.definition.fields.map(field => [field.path, structuredClone(field.default)]));
          variant.parameterOverrides = {};
        }
        Object.assign(variant.fields, structuredClone(chosen.production.defaults));
      } else {
        variant.recipe = this.selection(chosen, chosen.purposes[0]!);
        variant.operation = chosen.purposes[0] === 'script' ? chosen.scriptMode === 'performance' ? 'performance' : 'script' : chosen.purposes[0]!;
      }
    }
    this.applyDefaults();
    if (intent !== 'voice' && intent !== 'music') {
      variant.context = unwrap(await this.bridge.production.context({ ...this.origin, characterId: variant.target.characterId, statementIds: scope.statementIds, textRange: scope.textRange, usage, performance: variant.operation === 'performance' }));
      this.applyContextDefaults();
    }
    if (intent === 'voice') {
      const ids = scope.statementIds ?? (scope.statementId ? [scope.statementId] : []);
      const lines: SpeechLine[] = this.data.scenes.filter(scene => scene.id === scope.sceneId).flatMap(scene => scene.statements.filter(statement => statement.command === 'say' && ids.includes(statement.id)).map(statement => ({
        id: createId(this.data), sceneId: scene.id, statementId: statement.id, characterId: statement.characterId ?? null,
        original: statement.label, text: statement.label, language: String(variant.fields.language), voiceId: null, selected: !statement.silent,
      })));
      variant.fields.speechLines = lines as unknown as import('@galcraft/contracts').Json;
    }
    this.captureDraftSources();
    this.draft!.origin = { ...this.origin, statementIds: scope.statementIds };
    this.draft!.name = `${chosen?.name ?? ({ script: '写剧情', stage: '配演出', background: '背景', figure: '立绘', cg: 'CG', difference: '差分', voice: '配音', music: '音乐', page: '页面', 'ui-assets': 'UI 素材' } as const)[intent]} · ${this.data.scenes.find(scene => scene.id === scope.sceneId)?.name ?? '新制作'}`;
    this.taskId = null;
    this.quickOpen = true;
    this.draftDirty = false;
    if (variant.operationSnapshot?.provider) {
      this.quickIntent = null;
      this.update({});
      await this.saveDraft(true);
    }
    this.changed();
  }
  async openRecipe(recipe: CreationRecipe, usage = recipe.uses[0]!) {
    if (recipe.parameterPreset) {
      const scheme = this.data.recipes.find(item => item.id === recipe.parameterPreset!.recipeId);
      if (!scheme?.production) throw new Error('参数预设引用的制作方案不可用');
      await this.openRecipe(scheme, usage);
      this.variant!.parameterPresetId = recipe.id;
      Object.assign(this.variant!.fields, resolveProductionFields(this.variant!, scheme, recipe));
      this.changed(); return;
    }
    const intent: QuickIntent = usage === 'ui' ? recipe.purposes.includes('uiPlan') || recipe.purposes.includes('uiPatch') ? 'page' : 'ui-assets' : usage === 'bgm' ? 'music' : usage as QuickIntent;
    await this.openProductionDraft(intent, {}, recipe);
  }
  async openDraft(id: string) {
    if (this.draftDirty && this.draft && !this.draft.submittedTaskId) await this.saveDraft(true);
    const draft = this.data.drafts.find(item => item.id === id);
    if (!draft) throw new Error('制作草稿不存在');
    this.draft = normalizeProductionDraft(structuredClone(draft));
    this.savedDraft = structuredClone(this.draft);
    this.origin = draft.origin ?? null;
    this.quickIntent = null; this.taskId = null; this.plan = null; this.draftDirty = false; this.changed();
  }
  private configureQuickScope(scope: QuickScope = {}) {
    if (!this.variant) return;
    const target = this.variant.target;
    target.statementId = scope.statementId ?? null;
    target.replaceStatementIds = scope.statementIds?.length ? [...scope.statementIds] : scope.statementId ? [scope.statementId] : [];
    if ((this.quickIntent === 'script' || this.quickIntent === 'stage') && !target.replaceStatementIds.length) {
      const statements = this.data.scenes.find(scene => scene.id === target.sceneId)?.statements ?? [];
      if (this.quickIntent === 'stage') target.replaceStatementIds = statements.map(statement => statement.id);
      else if (['end', 'changeScene', 'jumpLabel', 'return'].includes(statements.at(-1)?.command ?? '')) target.statementId = statements.at(-1)!.id;
    }
  }
  async setQuickScene(sceneId: string | null) {
    if (!this.variant) return;
    this.update({ target: { ...this.variant.target, sceneId } });
    this.configureQuickScope();
    await this.captureContext();
  }
  private selection(recipe: import('@galcraft/authoring/recipes').CreationRecipe, purpose: import('@galcraft/authoring/production').RecipeSelection['purpose']) {
    return { recipeId: recipe.id, scope: recipe.scope, purpose, usage: this.draft!.activeUse, parameterValues: Object.fromEntries(recipe.parameters.map(parameter => [parameter.key, parameter.defaultValue])) };
  }
  get operation(): ProductionOperation {
    return this.variant && this.draft ? variantOperation(this.variant, this.draft.activeUse) : 'script';
  }
  get operationDefinition() {
    const frozen = this.variant?.operationSnapshot;
    return this.data.operations?.find(item => item.id === this.operation && (!frozen || item.version === frozen.version && item.provider?.version === frozen.provider?.version));
  }
  async openOperation(snapshot: import('@galcraft/contracts').ProductionOperationSnapshot, locale = 'zh-CN') {
    if (!snapshot.provider) throw new Error('请选择扩展制作操作');
    if (this.draftDirty) await this.saveDraft(true);
    const usage = snapshot.definition.adoption.kind === 'asset' ? snapshot.definition.adoption.usages[0] : 'script';
    if (!['script', 'background', 'figure', 'cg', 'difference', 'voice', 'bgm', 'ui', 'animation'].includes(usage!)) throw new Error(`不支持的采用用途：${usage}`);
    this.newDraft(usage as ProductionFormDraft['activeUse'], snapshot.id);
    const variant = this.variant!;
    Object.assign(variant, { operation: snapshot.id, operationSnapshot: structuredClone(snapshot), fields: Object.fromEntries(snapshot.definition.fields.map(field => [field.path, structuredClone(field.default)])), parameterOverrides: {}, recipe: null, promptPreparation: null });
    this.draft!.name = operationTitle(snapshot, locale);
    this.origin = null; this.quickIntent = null; this.quickOpen = false; this.taskId = null;
    this.applyDefaults(); this.update({}); await this.saveDraft(true);
  }
  productionEditorContext(): ProductionFieldEditorContext {
    const draft = this.draft!, variant = this.variant!, snapshot = variant.operationSnapshot;
    if (!snapshot?.provider) throw new Error('制作操作没有专用编辑上下文');
    const edit = this.draftEdit;
    const schema = snapshot.definition.inputSchema as { properties?: Record<string, unknown> };
    const fieldKeys = new Set([...snapshot.definition.fields.map(field => field.path), ...Object.keys(schema?.properties ?? {})]);
    const fail = (code: string, message: string) => { const error = { code, message, severity: 'error' as const, owner: 'M10' as const, related: [], actions: ['edit' as const] }; return { ok: false as const, error, issues: [error] }; };
    return { kind: 'production', operation: { id: snapshot.id, version: snapshot.version }, draftId: draft.id, revision: draft.revision,
      fields: structuredClone(Object.fromEntries(Object.entries(variant.fields).filter(([key]) => fieldKeys.has(key)))), references: structuredClone((variant.fields.references ?? []) as unknown as import('@galcraft/authoring/production').MediaInput[]), readonly: !!draft.submittedTaskId,
      resolveReference: input => this.bridge.production.mediaInput(input),
      connection: variant.connectionId ? { id: variant.connectionId, name: this.data.connections.find(connection => connection.id === variant.connectionId)?.name ?? variant.connectionId,
        model: variant.model ?? this.data.connections.find(connection => connection.id === variant.connectionId)?.model ?? '' } : null,
      inspectConnection: async () => {
        if (!variant.connectionId) return fail('CONNECTION_MISSING', '请先选择服务连接');
        const result = await this.bridge.connections.test({ connectionId: variant.connectionId, purpose: (snapshot.definition.connection?.purpose ?? snapshot.definition.purpose) as import('@galcraft/contracts').Purpose,
          imageUsage: null, workflowBindingId: variant.workflowBindingId, model: variant.model ?? this.data.connections.find(connection => connection.id === variant.connectionId)?.model ?? '' });
        return result;
      },
      commit: async input => {
        if (this.draft?.id !== draft.id || this.draft.submittedTaskId || this.draft.revision !== input.expectedRevision || this.draftEdit !== edit) return fail('DRAFT_CONFLICT', '制作草稿版本已变化，请重新载入当前输入');
        try {
          const missingMedia = snapshot.definition.inputs.filter(port => port.type !== 'text' && !input.references.some(reference => reference.port === port.key)).map(port => port.key);
          validateOperationInput({ purpose: snapshot.id as import('@galcraft/contracts').ExtensionOperationId, fields: input.fields, references: input.references }, snapshot, missingMedia);
          const parameterOverrides = { ...(variant.parameterOverrides ?? variant.fields) };
          for (const key of fieldKeys) if (!(key in input.fields)) delete parameterOverrides[key];
          for (const [key, value] of Object.entries(input.fields)) if (JSON.stringify(value) !== JSON.stringify(variant.fields[key])) parameterOverrides[key] = value;
          const retained = Object.fromEntries(Object.entries(variant.fields).filter(([key]) => !fieldKeys.has(key) && key !== 'references'));
          this.update({ fields: { ...retained, ...structuredClone(input.fields), references: structuredClone(input.references) as unknown as import('@galcraft/contracts').Json }, parameterOverrides });
          await this.saveDraft(true);
          return { ok: true, value: { revision: this.draft.revision }, warnings: [] };
        } catch (error) { return fail('PRODUCTION_INPUT', String(error).replace(/^Error: /, '')); }
      },
    };
  }
  get purpose() { return operationPurpose(this.operation); }
  setOperation(operation: ProductionOperation) {
    this.update({ operation }); this.applyDefaults(); this.changed();
  }
  matchingWorkflows() {
    return this.data.workflows.filter(workflow => (!workflow.operation || workflow.operation === this.variant?.operation) && workflowSupportsPurpose(workflow, this.purpose, this.draft!.activeUse as import('@galcraft/contracts').ImageUsage));
  }
  applyDefaults() {
    const variant = this.variant;
    if (!variant || !this.draft) return;
    const route = this.purpose === 'image' ? this.data.imageRoutes?.[this.draft.activeUse as 'background' | 'figure' | 'cg' | 'ui'] : null;
    const scheme = this.data.recipes.find(recipe => recipe.id === variant.productionRecipeId)?.production;
    const connections = this.data.connections.filter(connection => operationSupportsConnection(this.operationDefinition, connection, this.purpose) && (!scheme?.protocol || connection.protocol === scheme.protocol));
    const connection = connections.find(connection => connection.id === route?.connectionId)
      ?? connections.find(connection => connection.id === this.data.defaults?.connections[this.purpose])
      ?? connections.find(connection => connection.protocol !== 'comfyUI') ?? connections[0];
    variant.connectionId = connection?.id ?? null;
    variant.model = route?.model ?? connection?.model ?? null;
    const workflows = this.matchingWorkflows();
    variant.workflowBindingId = connection?.protocol === 'comfyUI' ? workflows.find(workflow => workflow.id === route?.workflowBindingId)?.id
      ?? workflows.find(workflow => workflow.id === connection.workflowBindingId)?.id ?? workflows[0]?.id ?? null : null;
    if (this.operation.includes('/')) return;
    const text = this.data.connections.find(connection => connection.id === this.data.defaults?.connections.text && connection.purposes.includes('text')) ?? this.data.connections.find(connection => connection.purposes.includes('text'));
    variant.fields.promptConnectionId = text?.id ?? null;
    variant.fields.promptModel = text?.model ?? null;
  }
  async rememberImageRoute() {
    if (!this.variant?.connectionId || this.purpose !== 'image') return;
    this.data.imageRoutes = unwrap(await this.bridge.production.saveImageRoutes({ ...this.data.imageRoutes, [this.draft!.activeUse]: { connectionId: this.variant.connectionId, workflowBindingId: this.variant.workflowBindingId, model: this.variant.model ?? '' } }));
    this.changed();
  }
  newDraft(usage: ProductionFormDraft["activeUse"] = "script", operation?: ProductionOperation) {
    if (this.autosave) clearTimeout(this.autosave);
    this.autosave = null;
    this.savedDraft = null;
    this.draft = {
      schemaVersion: 1,
      id: createId(this.data),
      projectId: this.projectId,
      revision: 0,
      activeUse: usage,
      name: this.displayLocale() === 'en' ? 'New production' : this.displayLocale() === 'ja' ? '新しい制作' : '新制作',
      variants: {},
      updatedAt: new Date().toISOString(),
      submittedTaskId: null,
    };
    this.setUsage(usage, operation);
    this.draftDirty = false;
  }
  setUsage(usage: ProductionFormDraft["activeUse"], operation?: ProductionOperation) {
    if (!this.draft || this.draft.submittedTaskId) {
      this.newDraft(usage);
      return;
    }
    if (this.draft.activeUse !== usage) { this.draftDirty = true; this.draftEdit++; }
    this.draft.activeUse = usage;
    this.draft.variants[usage] ??= {
      operation: operation ?? defaultOperation(usage),
      target: {
        sceneId: usage === 'script' || usage === 'voice' ? this.origin?.sceneId ?? null : null,
        statementId: usage === 'script' || usage === 'voice' ? this.origin?.statementId ?? null : null,
        characterId: null,
        locale: null,
        usage,
        uiScope:
          usage === "ui"
            ? {
                pageIds: [],
                componentIds: [],
              }
            : null,
      },
      fields: {
        instruction: "",
        positive: "",
        negative: "",
        width:
          usage === "background"
            ? Math.round(
                this.data.canvas.width *
                  Math.max(
                    1,
                    1920 / this.data.canvas.width,
                    1080 / this.data.canvas.height,
                  ),
              )
            : 1024,
        height:
          usage === "background"
            ? Math.round(
                this.data.canvas.height *
                  Math.max(
                    1,
                    1920 / this.data.canvas.width,
                    1080 / this.data.canvas.height,
                  ),
              )
            : 1024,
        count: 1,
        language: "ja",
        text: "",
        prompt: "",
        durationSec: 30,
      },
      context: [],
      connectionId: null,
      workflowBindingId: null,
      model: null,
      recipe: null,
      promptPreparation: null,
      backgroundRemoval: null,
      backgroundPreview:
        usage === "background"
          ? {
              canvas: this.data.canvas,
              frame: { fit: "cover", positionX: 0.5, positionY: 0.5 },
            }
          : null,
      sourceVersions: [],
    };
    if (!this.draft.variants[usage]!.connectionId) this.applyDefaults();
    this.captureDraftSources();
    this.plan = null;
    this.scheduleSave();
    this.changed();
  }
  async captureContext() {
    if (!this.variant || !this.draft) return;
    const variant = this.variant;
    const previousContext = variant.context;
    const defaults = this.data.recipes.find(recipe => recipe.id === (variant.recipe ?? variant.promptPreparation)?.recipeId)?.contextDefaults;
    const captured = unwrap(await this.bridge.production.context({ characterId: variant.target.characterId, sceneId: variant.target.sceneId,
      pageIds: this.operation === 'uiPatch' || this.operation === 'uiPlan' ? variant.target.uiScope?.pageIds ?? [] : [],
      componentIds: variant.target.uiScope?.componentIds ?? [], statementId: variant.target.statementId,
      statementIds: variant.target.replaceStatementIds, usage: this.draft.activeUse, performance: variant.operation === 'performance' }));
    variant.context = captured.map(part => {
      const old = previousContext.find(value => value.kind === part.kind && value.source?.ref.id === part.source?.ref.id && value.label === part.label);
      return old?.authorEdited ? { ...old, ...(old.source?.revision !== part.source?.revision && old.text !== part.text ? { sourceText: part.text } : {}), source: part.source } : { ...part, included: old?.included ?? (defaults && part.kind !== 'instruction' ? defaults.includes(part.kind) : part.included) };
    });
    for (const old of previousContext.filter(part => part.authorEdited)) if (!captured.some(part => part.kind === old.kind && part.source?.ref.id === old.source?.ref.id && part.label === old.label)) variant.context.push({ ...old, sourceRemoved: true });
    this.captureDraftSources(true);
    this.update({ context: variant.context });
  }
  private applyContextDefaults() {
    const variant = this.variant;
    const recipe = this.data.recipes.find(recipe => recipe.id === (variant?.recipe ?? variant?.promptPreparation)?.recipeId);
    if (!variant || !recipe) return;
    for (const part of variant.context) if (part.kind !== 'instruction' && !recipe.contextDefaults.includes(part.kind)) part.included = false;
  }
  private captureDraftSources(reviewed = false) {
    const variant = this.variant; if (!variant) return;
    const related = new Map<string, import('@galcraft/contracts').VersionRef>();
    const add = (source: import('@galcraft/contracts').VersionRef | undefined | null) => { if (source && !related.has(source.ref.id)) related.set(source.ref.id, source); };
    for (const part of variant.context) if (part.included) add(part.source);
    const sceneIds = new Set([variant.target.sceneId, ...(Array.isArray(variant.fields.speechLines) ? variant.fields.speechLines as unknown as SpeechLine[] : []).filter(line => line.selected).map(line => line.sceneId)].filter(Boolean));
    for (const scene of this.data.scenes) if (sceneIds.has(scene.id) && scene.documentId && scene.revision !== undefined) add({ ref: { kind: 'document', id: scene.documentId }, revision: scene.revision });
    for (const page of this.data.pages) if (variant.target.uiScope?.pageIds.includes(page.id) && page.documentId && page.revision !== undefined) add({ ref: { kind: 'document', id: page.documentId }, revision: page.revision });
    if (variant.fields.sizeMode === 'project') add(this.data.projectVersion);
    const references = [variant.fields.reference, variant.fields.referenceAudio, ...(Array.isArray(variant.fields.references) ? variant.fields.references : [])];
    if (references.some(reference => reference && typeof reference === 'object' && !Array.isArray(reference) && reference.assetId)) add(this.data.assetsVersion);
    variant.sourceVersions = [...related.values()].map(current => reviewed ? current : variant.sourceVersions.find(expected => expected.ref.id === current.ref.id) ?? current);
  }
  async reviewAdoptionTarget() { await this.refresh(); this.captureDraftSources(true); this.update({}); }
  update(patch: Partial<FormVariant>) {
    this.draftDirty = true; this.draftEdit++;
    Object.assign(this.variant!, patch);
    this.captureDraftSources(!!patch.target);
    this.plan = null;
    this.scheduleSave();
    this.changed();
  }
  field(name: string, value: import("@galcraft/contracts").Json) {
    this.draftDirty = true; this.draftEdit++;
    this.variant!.fields[name] = value;
    (this.variant!.parameterOverrides ??= {})[name] = value;
    this.captureDraftSources();
    this.plan = null;
    this.scheduleSave();
    this.changed();
  }
  resetParameter(key: string, value: import('@galcraft/contracts').Json) {
    const overrides = { ...this.variant!.parameterOverrides }; delete overrides[key];
    const variant = { ...this.variant!, parameterOverrides: overrides, explicitFields: this.variant!.explicitFields?.filter(field => field !== key), fields: { ...this.variant!.fields, [key]: value } };
    const scheme = this.data.recipes.find(recipe => recipe.id === variant.productionRecipeId) ?? null;
    const preset = this.data.recipes.find(recipe => recipe.id === variant.parameterPresetId) ?? null;
    this.update({ ...variant, fields: resolveProductionFields(variant, scheme, preset) });
  }
  private scheduleSave() {
    if (this.autosave) clearTimeout(this.autosave);
    if (!this.draft || this.draft.submittedTaskId || !this.draftDirty) return;
    this.autosave = setTimeout(() => {
      this.autosave = null;
      void this.saveDraft().catch((error) => {
        this.error = String(error); this.diagnostic = issueFromError(error, 'M10');
        this.changed();
      });
    }, 1000);
  }
  async saveDraft(explicit = false) {
    if (this.suspended) return;
    if (this.autosave) clearTimeout(this.autosave);
    this.autosave = null;
    if (!this.draft || this.draft.submittedTaskId || this.draft.revision && !this.draftDirty) return;
    if (!explicit && !this.draftDirty) return;
    const draft = structuredClone(this.draft), edit = this.draftEdit, lifecycle = this.saveLifecycle;
    this.draftSaving = true; this.changed();
    const operation = this.saving
      .catch(() => {})
      .then(async () => {
        if (lifecycle !== this.saveLifecycle) return;
        const saved = unwrap(
          await this.bridge.production.saveDraft({
            draft,
            expectedRevision:
              this.draft?.id === draft.id
                ? this.draft.revision || null
                : draft.revision || null,
          }),
        );
        if (this.draft?.id === draft.id) {
          this.savedDraft = structuredClone(saved);
          this.draft.revision = saved.revision;
          this.draft.updatedAt = saved.updatedAt;
          if (edit === this.draftEdit) this.draftDirty = false;
        }
      });
    this.saving = operation;
    try { await operation; } finally { this.draftSaving = false; this.changed(); }
  }
  async abandonDraftChanges() {
    if (!this.draft || this.draft.submittedTaskId) return;
    const id = this.draft.id;
    if (this.autosave) clearTimeout(this.autosave);
    this.autosave = null;
    await this.saving.catch(() => {});
    let saved: ProductionFormDraft | undefined;
    if (this.draft?.revision || this.savedDraft?.id === id || this.data.drafts.some(d => d.id === id)) {
      await this.refresh();
      saved = this.data.drafts.find(d => d.id === id);
      this.savedDraft = saved ? structuredClone(saved) : null;
    }
    this.draft = saved ? normalizeProductionDraft(structuredClone(saved)) : null;
    this.origin = this.draft?.origin ?? null;
    if (!this.draft) { this.quickIntent = null; this.quickOpen = false; }
    this.draftEdit++;
    this.draftDirty = false; this.draftSaving = false; this.plan = null; this.error = '';
    this.changed();
  }
  async discardDraft(id = this.draft?.id) {
    if (!id) return;
    if (this.draft?.id === id) { if (this.autosave) clearTimeout(this.autosave); this.autosave = null; }
    await this.saving.catch(() => {});
    if (this.data.drafts.some(d => d.id === id) || (this.draft?.id === id && this.draft.revision))
      unwrap(await this.bridge.production.discardDraft(id));
    if (this.draft?.id === id) { this.draft = null; this.draftDirty = false; this.plan = null; }
    this.data.drafts = this.data.drafts.filter(d => d.id !== id);
    this.changed();
  }
  candidates(): Candidate[] {
    return this.data.candidates
      .filter((c) => c.candidate.taskId === this.taskId)
      .map((c) => c.candidate);
  }
}
