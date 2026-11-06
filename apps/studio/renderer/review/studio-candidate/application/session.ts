import { createId, type Result, type VersionRef, type EditInput, type EditReceipt, type DocumentView, type UndoPlan, type CommandSpec, type SavePlan, type SaveScope } from '@galcraft/contracts';
import { prepareAuthoringEdit, rebaseAuthoringOperation, type AuthorOperation } from '@galcraft/documents/authoring';
import { compileInput } from '../../../authoring/bridge.js';
import { PublishHistoryPaths } from '../../../pages/Publish/publish-identity.js';
import { createCandidateTasks } from '../adapters/task-services.js';
import { parse, validateAuthoringCommands } from '@galcraft/dsl';
import type { editor } from 'monaco-editor';
import { AuthoringController, type AuthoringServices } from '../../../authoring/controller.js';
import { sourceLine, type InlineEvent, type Panel, type Project, type ReviewState, type Source, type UiState } from '../../../studio-r0/model.js';
import { createCandidateHost, type CandidateHostOptions } from '../adapters/candidate-host.js';
import { authoringSource, prepareCandidateEdit, projectProjection, withSourceAnchors, type CandidateSeed } from './documents.js';
import { extendCandidateAuthoringEdit } from './authoring-extensions.js';
import { fail, ok } from './services.js';
import { replaceSceneRange, type TextContents, type TextSpan, type TextPoint } from './text-range.js';
import { CandidatePreferences } from './preferences.js';
import type { StudioPreferences } from '@galcraft/contracts';

export type CandidateHost = ReturnType<typeof createCandidateHost>;
export type CandidateServicesFactory = (host: CandidateHost) => AuthoringServices;
export type CandidateState = ReviewState & { ready: boolean; activeView: string; openViews: readonly string[]; commandTarget: string; canSaveCurrent: boolean; projectActive:boolean; pendingViews:readonly string[]; historyReview:UndoPlan|null; saveReview:{plan:SavePlan;documents:DocumentView[];scope:Exclude<SaveScope,{kind:'objects'}>}|null };
type HistoryGuard = (plan: UndoPlan) => Result<void>;
const productionView = (id: string) => id === 'production' || id.startsWith('production-');
const productionDraftView = (id: string) => id === 'production' || id === 'production-inspector';
const nonDocumentView = (id: string) => productionView(id) || id === 'collaboration' || id.startsWith('collaboration-') || id === 'outline' || id === 'preferences';

export class CandidateSession {
  readonly host: CandidateHost;
  readonly controller: AuthoringController;
  readonly services: AuthoringServices;
  readonly writeSessionId = createId();
  readonly tasks: ReturnType<typeof createCandidateTasks>;
  private commands = new Map<string,string|null>();
  private pluginCommands:CommandSpec[]=[];
  private pluginLockRevision=-1;
  private viewTargets = new Map<string,string>();
  private historyReviewAnswer:((value:boolean)=>void)|null=null;
  private viewStates = new Map<string,unknown>();
  private viewGuards = new Map<string,()=>boolean|Promise<boolean>>();
  private historyGuards = new Set<HistoryGuard>();
  private viewHistory=new Map<string,(action:'undo'|'redo')=>boolean>();
  private viewRedo=new Map<string,number>();
  private lastSaveScope:Exclude<SaveScope,{kind:'objects'}>={kind:'all'};
  private state: CandidateState;
  private listeners = new Set<() => void>();
  private alive = true;
  private unsubscribe: () => void;
  private refreshQueue = Promise.resolve();
  private draftBases = new Map<string, string>();
  private editorFlush = new Map<string, () => Promise<boolean>>();
  private lastContentScene: string;
  private writingPositions = new Map<string, { span: TextSpan | null; scroll: number }>();
  private sourcePositions = new Map<string, editor.ICodeEditorViewState | null>();
  private releasePreferences?: () => void;
  private recoveryProviders=new Map<string,(saved:boolean)=>unknown>();
  private projectionCache?: { snapshot: ReturnType<CandidateHost['getSnapshot']>; source: ReturnType<typeof authoringSource>; graphSource: ReturnType<typeof authoringSource>; project: Project };
  private projections() {
    const snapshot = this.host.getSnapshot();
    if (this.projectionCache?.snapshot === snapshot) return this.projectionCache;
    const graph = this.host.graphDocuments();
    return this.projectionCache = { snapshot, source: authoringSource(snapshot.documents), graphSource: authoringSource(graph), project: projectProjection(graph, this.seed) };
  }
  constructor(readonly seed: CandidateSeed, createServices: CandidateServicesFactory, options?: CandidateHostOptions, personal?: CandidatePreferences) {
    this.lastContentScene = seed.ui.sceneId;
    this.host = createCandidateHost(seed.documents, { resolveRequiredRef: (ref, documents) => {
      if(ref.kind==='asset') return documents.some(document=>Object.entries(document.files).some(([path,raw])=>path==='assets/index.json'&&JSON.parse(raw).data.assets.some((asset:{id:string})=>asset.id===ref.id)));
      const found=(value:unknown):boolean=>!!value&&typeof value==='object'&&(Array.isArray(value)?value.some(found):('id' in value&&value.id===ref.id)||Object.values(value).some(found));
      return documents.some(document=>Object.entries(document.files).some(([path,raw])=>path.endsWith('.json')?found(JSON.parse(raw).data):path.endsWith('.gal')&&parse({documentId:document.documentId,revision:document.revision,text:raw}).cst.some(node=>node.id===ref.id)));
    }, ...options, sourceRecovery: seed.sourceRecovery, savedSourceRecovery: seed.savedSourceRecovery, historyScope: documentId => {
      const documents=this.host?.list()??seed.documents;
      const document=documents.find(item=>item.documentId===documentId),path=document&&Object.keys(document.files).find(path=>/^(scenes|candidate\/scenes)\//.test(path));
      const scene=path?.match(/^(?:scenes\/|candidate\/scenes\/)([^/.]+)/)?.[1];
      return scene?documents.filter(item=>`scenes/${scene}/scene.json` in item.files||`candidate/scenes/${scene}.json` in item.files).map(item=>item.documentId):[documentId];
    } });
    const baseServices = createServices(this.host), services = personal?.bind(baseServices) ?? baseServices;
    const baseDocuments = services.bridge.documents;
    const preparedVersions = new Map<string, VersionRef[]>();
    const historyPlans = new Map<string, UndoPlan>();
    const prepareHistory = (result: Result<UndoPlan>): Result<UndoPlan> => {
      if (!result.ok) return result;
      const check = this.checkHistoryGuards(result.value);
      if (!check.ok) return check;
      historyPlans.set(result.value.planId, result.value);
      return result;
    };
    const applyHistory = async (action: 'undo' | 'redo', planId: string) => {
      const plan = historyPlans.get(planId);
      if (!plan) return fail('历史计划已失效', 'HISTORY_PLAN_MISSING');
      historyPlans.delete(planId);
      const check = this.checkHistoryGuards(plan);
      return check.ok ? baseDocuments[action](planId) : check;
    };
    const documents: typeof baseDocuments = { ...baseDocuments,
      planUndo: async (...args) => prepareHistory(await baseDocuments.planUndo(...args)),
      planRedo: async (...args) => prepareHistory(await baseDocuments.planRedo(...args)),
      undo: planId => applyHistory('undo', planId),
      redo: planId => applyHistory('redo', planId),
    };
    this.services = { ...services, bridge: { ...services.bridge, documents } };
    this.controller = new AuthoringController({ ...this.services, bridge: { ...this.services.bridge, documents: { ...documents,
      planEdit: async input => {
        try { const combined = withSourceAnchors(input, this.host.list(), seed, this.host.graphDocuments()); const result = await this.host.bridge.documents.planEdit(combined); if (result.ok) preparedVersions.set(result.value.planId, combined.expected); return result; }
        catch (cause) { const error = { code: 'CANDIDATE_ANCHOR_RANGE', message: cause instanceof Error ? cause.message : String(cause), severity: 'error' as const, owner: 'M02' as const, related: [], actions: [] }; return { ok: false, error, issues: [error] }; }
      },
      applyEdit: async (planId, expected) => { const versions = preparedVersions.get(planId) ?? expected; preparedVersions.delete(planId); return this.host.bridge.documents.applyEdit(planId, versions); },
    } } });
    this.state = { project: projectProjection(this.host.graphDocuments(), seed), ui: structuredClone(seed.ui), dirty: false, saving: false, error: null, canUndo: false, canRedo: false, undoLabel: '', revision: 0, ready: false, activeView: `writing:${seed.ui.sceneId}`, openViews: [], commandTarget: seed.ui.sceneId, canSaveCurrent: Boolean(seed.ui.sceneId), projectActive:true,pendingViews:[],historyReview:null,saveReview:null };
    this.controller.reviewHistory = async plan => {
      if (!this.host.historyPlanNeedsReview(plan.planId)) return true;
      this.historyReviewAnswer?.(false);
      const answer = new Promise<boolean>(resolve => { this.historyReviewAnswer = resolve; });
      this.state = { ...this.state, historyReview: plan };
      this.emit();
      const accepted = await answer;
      if (!accepted) historyPlans.delete(plan.planId);
      return accepted;
    };
    this.tasks=createCandidateTasks(this);
    this.unsubscribe = this.host.subscribe(() => this.refresh());
    this.releasePreferences = personal?.subscribe(preferences => { this.controller.preferences = preferences; this.updateUi(ui => {ui.theme = preferences.theme;}); });
  }
  getSnapshot = () => this.state;
  recoveryState<T>(key:string):T|undefined { return structuredClone(this.seed.taskRecovery?.[key]) as T|undefined; }
  registerRecovery(key:string,capture:(saved:boolean)=>unknown) { this.recoveryProviders.set(key,capture);return()=>{this.recoveryProviders.delete(key);}; }
  captureRecovery(saved=false):Record<string,unknown> { return Object.fromEntries([...this.recoveryProviders].map(([key,capture])=>[key,structuredClone(capture(saved))])); }
  async updatePreferences(change: (preferences: StudioPreferences) => void) {
    const preferences = structuredClone(this.controller.preferences); change(preferences);
    const result = await this.services.writePreferences(preferences);
    if (result.ok) { this.controller.preferences = preferences; this.updateUi(ui => { ui.theme = preferences.theme; }); }
    else this.notice(result.error.message);
  }
  confirmHistory(accepted:boolean){const resolve=this.historyReviewAnswer;this.historyReviewAnswer=null;this.state={...this.state,historyReview:null};this.emit();resolve?.(accepted);}
  rememberViewState(id:string,value:unknown) {this.viewStates.set(id,structuredClone(value));}
  viewState<T=unknown>(id:string):T|undefined {return this.viewStates.get(id) as T|undefined;}
  setViewPending(id:string,pending:boolean) {if(this.state.pendingViews.includes(id)===pending)return;this.state={...this.state,pendingViews:pending?[...this.state.pendingViews,id]:this.state.pendingViews.filter(item=>item!==id)};this.refresh();}
  setViewHistory(id:string,handler:((action:'undo'|'redo')=>boolean)|null){if(handler)this.viewHistory.set(id,handler);else this.viewHistory.delete(id);this.refresh();}
  registerViewGuard(id:string,guard:()=>boolean|Promise<boolean>) {this.viewGuards.set(id,guard);return()=>{this.viewGuards.delete(id);};}
  registerHistoryGuard(guard: HistoryGuard) {
    this.historyGuards.add(guard);
    return () => { this.historyGuards.delete(guard); };
  }
  private checkHistoryGuards(plan: UndoPlan): Result<void> {
    for (const guard of this.historyGuards) {
      const result = guard(plan);
      if (!result.ok) return result;
    }
    return ok(undefined);
  }
  setProjectActive(active:boolean) { if(this.state.projectActive===active)return;this.state={...this.state,projectActive:active,ui:{...this.state.ui,preview:{...this.state.ui.preview,status:'paused'}}};this.emit(); }
  refreshFromHost = () => { this.refresh(); void this.controller.refresh(); };
  async applyEdit(input: EditInput): Promise<Result<EditReceipt>> {
    try {
      const combined = withSourceAnchors({...input,origin:'script'},this.host.list(),this.seed,this.host.graphDocuments()); combined.origin=input.origin;
      const result=this.host.commit(combined);
      if (result.ok) await this.controller.acceptExternalEdit(result.value,input.patches[0]?.documentId ?? this.documentId(this.state.commandTarget)); else this.notice(result.error.message);
      return result;
    } catch(cause) { const error={code:'CANDIDATE_EDIT',message:String(cause),severity:'error' as const,owner:'M02' as const,related:[],actions:[]}; this.notice(error.message); return {ok:false,error,issues:[error]}; }
  }
  async authorOperation(operation: AuthorOperation,baseline?:DocumentView[],resolution?:'draft'|'current'): Promise<Result<EditReceipt>> {
    const documents=this.host.list();
    if(baseline){const rebased=rebaseAuthoringOperation(baseline,documents,operation,resolution);if(rebased.conflicts.length&&!resolution){const error={code:'AUTHOR_CONFLICT',message:'目标字段已变化，请比较当前版本。',severity:'error' as const,owner:'M02' as const,related:[],actions:[]};return {ok:false,error,issues:[error]};}operation=rebased.operation;}
    const prepared=prepareAuthoringEdit(documents.filter(document=>!Object.keys(document.files).some(path=>path.startsWith('candidate/'))),operation,this.pluginCommands);if(!prepared.ok)return prepared;
    const extended=extendCandidateAuthoringEdit(documents,operation,prepared.value);if(!extended.ok){this.notice(extended.error.message);return extended;}
    const input=extended.value;
    if(this.state.activeView==='structure'){const primary=input.patches.find(patch=>documents.some(document=>document.documentId===patch.documentId&&document.format==='dsl'))??input.patches[0];if(primary)this.target(primary.documentId);}
    return this.applyEdit(input);
  }
  commandSelection(sceneId:string) { return this.commands.get(sceneId) ?? null; }
  editingStatement(sceneId = this.state.ui.sceneId) {
    const origin = this.viewState<string>('script:editorOrigin');
    if (origin?.startsWith(`professional:${sceneId}:`)) return origin.split(':')[2] ?? null;
    if (origin === `commands:${sceneId}` || origin === `source:${sceneId}`) return this.commandSelection(sceneId);
    return sceneId === this.state.ui.sceneId ? this.state.ui.lineId : null;
  }
  selectCommand(sceneId:string,statementId:string|null) { this.commands.set(sceneId,statementId);this.controller.selectScene(sceneId);this.controller.select(statementId?[statementId]:[]);this.target(sceneId); }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { if (this.alive) for (const listener of this.listeners) listener(); }
  async open() {
    await this.refreshPluginCommands();
    const opened = await this.controller.open();
    if (!this.alive) return;
    for (const scene of authoringSource(this.host.graphDocuments()).scenes) if (this.host.sourceIsInvalid(scene.documentId)) {
      this.controller.lastValid.set(scene.sceneId, parse({documentId: scene.documentId, revision: scene.revision, text: scene.text}));
    }
    this.state = { ...this.state, ready: opened.ok, error: opened.ok ? null : opened.error.message };
    if (opened.ok) this.state.ui.theme = this.controller.preferences.theme;
    if (opened.ok) { this.controller.selectScene(this.state.ui.sceneId); this.controller.select([this.state.ui.lineId]); }
    this.emit();
  }
  private async refreshPluginCommands(){const lock=this.host.list().find(document=>'dependencies.lock.json' in document.files);const revision=lock?.revision??0;if(revision===this.pluginLockRevision)return;this.pluginLockRevision=revision;const result=await this.services.bridge.plugins.commandSpecs?.();if(result?.ok&&this.alive){this.pluginCommands=result.value;this.state={...this.state};this.emit();}}
  private refresh() {
    if (!this.alive) return;
    void this.refreshPluginCommands();
    const { snapshot: host, project } = this.projections(), ui = this.state.ui;
    const sceneIds=new Set(project.scenes.map(scene=>scene.id));
    for(const id of new Set([...Object.keys(ui.sourceDrafts),...Object.keys(ui.sourceErrors),...this.draftBases.keys(),...this.editorFlush.keys(),...this.sourcePositions.keys(),...this.writingPositions.keys(),...this.commands.keys()])) if(!sceneIds.has(id)){delete ui.sourceDrafts[id];delete ui.sourceErrors[id];if(ui.documentPositions)delete ui.documentPositions[id];this.draftBases.delete(id);this.editorFlush.delete(id);this.sourcePositions.delete(id);this.writingPositions.delete(id);this.commands.delete(id);}
    const removedView=(id:string)=>{const match=/^(writing|source|commands|command-stage):(.+)$/.exec(id);return !!match&&!sceneIds.has(match[2]!);};
    for(const id of this.viewStates.keys())if(removedView(id)){this.viewStates.delete(id);this.viewGuards.delete(id);this.viewTargets.delete(id);}
    for(const id of this.viewGuards.keys())if(removedView(id))this.viewGuards.delete(id);
    this.state={...this.state,pendingViews:this.state.pendingViews.filter(id=>!removedView(id))};
    const scene = project.scenes.find(scene => scene.id === ui.sceneId) ?? project.scenes[0];
    if (scene && !scene.lines.some(line => line.id === ui.lineId)) {
      const found = sourceLine(project, ui.selected).line;
      const old = this.state.project.scenes.find(item => item.id === scene.id);
      const ordinal = Math.max(0, old?.lines.findIndex(line => line.id === ui.lineId) ?? 0);
      const line = found ?? scene.lines[Math.min(ordinal, scene.lines.length - 1)];
      ui.sceneId = scene.id; ui.lineId = line?.id ?? ''; ui.selection = line ? { lineId: line.id, start: 0, end: 0 } : null;
      if (!found) ui.selected = { kind: 'line', documentId: scene.id, id: ui.lineId };
    }
    const previewScene = project.scenes.find(scene => scene.id === ui.preview.sceneId);
    if (!previewScene?.lines.some(line => line.id === ui.preview.lineId)) ui.preview = { ...ui.preview, sceneId: ui.sceneId, lineId: ui.lineId, offset: 0, status: 'stopped' };
    const { activeView, commandTarget } = this.state;
    const history = commandTarget ? this.history(commandTarget) : null;
    this.state = { ...this.state, project, ui: { ...ui }, dirty: host.documents.some(document => document.dirty), saving: host.saving, error: host.saveError,
      canSaveCurrent: Boolean(commandTarget) || productionDraftView(activeView),
      canUndo: Boolean(history?.canUndo) || this.viewHistory.has(activeView) && this.state.pendingViews.includes(activeView),
      canRedo: Boolean(history?.canRedo) || (this.viewRedo.get(activeView) ?? 0) > 0,
      undoLabel: history?.undoLabel ?? '', revision: this.state.revision + 1 };
    this.emit();
  }
  documentId(id: string) { const {snapshot:{documents},source}=this.projections();if(documents.some(document=>document.documentId===id))return id;return source.scenes.find(scene=>scene.sceneId===id)?.documentId??documents.find(document=>Object.entries(document.files).some(([path,raw])=>(path.startsWith('characters/')||path.startsWith('ui/pages/'))&&path.endsWith('.json')&&JSON.parse(raw).data.id===id))?.documentId??id; }
  sceneSource(sceneId: string) { return this.projections().source.scenes.find(scene => scene.sceneId === sceneId); }
  graphSceneSource(sceneId: string) { return this.projections().graphSource.scenes.find(scene => scene.sceneId === sceneId); }
  sourceReadOnly(sceneId: string) { return this.host.sourceIsInvalid(this.documentId(sceneId)); }
  sourceRecoveryNotice(sceneId:string) { return this.host.sourceRecovery().scenes.some(scene=>scene.sceneId===sceneId)?'源码无效，图形编辑显示最后有效版本并保持只读。请在源码模式修复。':'源码无效且缺少可校验的最后有效基线；图形内容不可用。请在源码模式恢复原文。'; }
  updateUi(change: (ui: UiState) => void) {
    const ui = structuredClone(this.state.ui); change(ui);
    this.state = { ...this.state, ui };
    this.emit();
  }
  notice(message: string) { this.updateUi(ui => { ui.notice = message; }); }
  activateDocument(sceneId: string) {
    const scene = this.state.project.scenes.find(scene => scene.id === sceneId); if (!scene) return;
    this.endEditGroup();
    this.updateUi(ui => {
      ui.documentPositions ??= {};
      ui.documentPositions[ui.sceneId] = { lineId: ui.lineId, offset: ui.selection?.start ?? 0 };
      const position = ui.documentPositions[sceneId], line = scene.lines.find(line => line.id === position?.lineId) ?? scene.lines[0];
      const offset = Math.min(position?.offset ?? 0, line?.text.length ?? 0);
      ui.sceneId = sceneId; ui.lineId = line?.id ?? ''; ui.focusDocument = sceneId;
      ui.selected = { kind: 'line', documentId: sceneId, id: ui.lineId };
      ui.selection = line ? { lineId: line.id, start: offset, end: offset } : null;
    });
    this.controller.selectScene(sceneId);
    this.target(sceneId,false);
  }
  activateView(id: string) {
    if (/^(writing|source|commands|professional):/.test(id)) this.rememberViewState('script:editorOrigin', id);
    if (/^(writing|source|commands|professional|character|page):/.test(id) || ['settings','structure','overview','production','collaboration','plugins','publish','maintenance'].includes(id)) this.rememberViewState('inspector:origin', id);
    if (id.startsWith('page:')) this.rememberViewState('page:lastActive',id);
    const sceneId = /^(writing|source|commands|command-stage):(.+)$/.exec(id)?.[2] ?? (id.startsWith('professional:')?id.split(':')[1]:undefined);
    if (sceneId && sceneId !== this.state.ui.sceneId) this.activateDocument(sceneId);
    const defaultPath=id==='assets'||id==='asset-inspector'||id.startsWith('assets:')?'assets/index.json':id==='plugins'||id==='plugin-package'?'dependencies.lock.json':id==='pages'?'ui/template.json':id==='appearances'?'candidate/appearances.json':['settings','publish','structure','characters'].includes(id)?'project.json':null;
    const defaultDocument=defaultPath?this.host.list().find(document=>defaultPath in document.files)?.documentId:undefined;
    const objectTarget=id.startsWith('character:')?this.documentId(id.slice(10)):undefined;
    const target = (id.startsWith('plugin-document:')?id.slice(16):undefined) ?? objectTarget ?? sceneId ?? (id === 'inspector' ? this.inspectorDocument() : id === 'stage' ? this.source('stage').documentId : this.viewTargets.get(id)??defaultDocument??'');
    this.state = { ...this.state, activeView: id }; this.target(target,false);
  }
  inspectorView() { return this.state.ui.pins.inspector ? undefined : this.viewState<string>('inspector:fixedObject') ?? this.viewState<string>('inspector:origin'); }
  inspectorDocument() {
    const view = this.inspectorView();
    if (!view || /^(writing|source|commands|professional):/.test(view)) return this.source('inspector').documentId;
    if (view.startsWith('character:')) return this.documentId(view.slice(10));
    if (view.startsWith('page:')) return this.host.list().find(document => Object.entries(document.files).some(([path, raw]) => path.startsWith('ui/pages/') && JSON.parse(raw).data.key === view.slice(5)))?.documentId ?? this.viewTargets.get(view) ?? '';
    return this.viewTargets.get(view) ?? '';
  }
  pinInspectorObject(viewId?: string) {
    this.rememberViewState('inspector:fixedObject', viewId);
    if (this.state.ui.pins.inspector) this.updateUi(ui => { delete ui.pins.inspector; });
    if (this.state.activeView === 'inspector') this.target(this.inspectorDocument(), false); else this.refresh();
  }
  target(id: string, remember = true) {
    const view = this.state.activeView;
    const commandTarget = nonDocumentView(view) ? '' : id;
    if (remember && commandTarget) this.viewTargets.set(view, commandTarget);
    this.state = { ...this.state, commandTarget };
    this.refresh();
  }
  viewsChanged(ids: readonly string[]) {
    this.state = { ...this.state, openViews: [...ids] }; this.emit();
  }
  async closeView(id: string) {
    if(productionView(id)&&!await this.flushProductionDraft())return false;
    if(this.state.pendingViews.some(item=>item===id||item.startsWith(id+'/'))||this.viewGuards.has(id)&&!await this.viewGuards.get(id)!()){this.notice('此工作面有未应用的修改，请先应用或还原输入再关闭。');return false;}
    if (id === 'stage') { this.updateUi(ui => { ui.preview.status = 'stopped'; ui.preview.offset = 0; }); return true; }
    if (!id.startsWith('source:')) return true;
    const sceneId = id.slice(7), flush = this.editorFlush.get(sceneId);
    if (this.state.ui.sourceDrafts[sceneId] !== undefined) { this.notice('此源码有未应用的输入。请先应用原文、保存，或还原未应用修改，再关闭标签。'); return false; }
    if (flush && !await flush()) { this.notice('源码草稿未通过校验，请修正或恢复有效源码后关闭。'); return false; }
    if (this.state.ui.sourceErrors[sceneId]) return false;
    this.updateUi(ui => { delete ui.sourceDrafts[sceneId]; delete ui.sourceErrors[sceneId]; });
    this.draftBases.delete(sceneId); return true;
  }
  async canCloseViews(ids:readonly string[]) {
    for(const id of ids){
      if(id.startsWith('source:')&&this.state.ui.sourceDrafts[id.slice(7)]!==undefined){this.notice('此源码有未应用的输入。请先应用、保存或还原，再关闭标签。');return false;}
      if(this.state.pendingViews.some(item=>item===id||item.startsWith(id+'/'))||this.viewGuards.has(id)&&!await this.viewGuards.get(id)!()){this.notice('此工作面有未应用的修改；本次关闭已取消。');return false;}
      if(productionView(id)&&this.tasks.production.draftDirty){this.notice('制作草稿尚未保存；请先保存草稿或还原，再关闭标签。');return false;}
    }
    return true;
  }
  registerEditor(sceneId: string, flush: () => Promise<boolean>) { this.editorFlush.set(sceneId, flush); return () => { this.editorFlush.delete(sceneId); }; }
  rememberWriting(sceneId: string, position: { span: TextSpan | null; scroll: number }) { this.writingPositions.set(sceneId, structuredClone(position)); }
  writingPosition(sceneId: string) { return this.writingPositions.get(sceneId); }
  rememberSource(sceneId: string, position: editor.ICodeEditorViewState | null) { this.sourcePositions.set(sceneId, position); }
  sourcePosition(sceneId: string) { return this.sourcePositions.get(sceneId); }
  replaceTextSelection(sceneId: string, span: TextSpan, text: string, group = ''): TextPoint | null {
    let point: TextPoint | null = null; const contents: TextContents = {};
    this.edit('编辑文稿', draft => { const scene = draft.scenes.find(scene => scene.id === sceneId), source = this.sceneSource(sceneId); if (!scene || !source) return; const result = replaceSceneRange(scene, source, span, text); Object.assign(contents, result.contents); point = result.point; }, group, contents);
    return point;
  }
  edit(label: string, change: (project: Project) => void, group = '', contents: TextContents = {}) {
    try {
      const next = structuredClone(this.state.project); change(next);
      for (const scene of next.scenes) if (this.sourceReadOnly(scene.id) && JSON.stringify(scene) !== JSON.stringify(this.state.project.scenes.find(value => value.id === scene.id))) {
        this.notice('此场景的源码无效；请先在源码模式修复。最后有效文稿保持只读。'); return;
      }
      const input = prepareCandidateEdit(this.host.list(), this.seed, this.state.project, next, label, contents);
      if (!input.patches.length) return;
      const first = input.patches[0]!.documentId;
      this.lastContentScene = Object.keys(this.seed.sceneDocuments).find(id => this.seed.sceneDocuments[id] === first || this.seed.extensionDocuments[id] === first) ?? this.state.ui.sceneId;
      const result = this.host.commit(input, group);
      if (!result.ok) { this.notice(result.error.message); return; }
      const documentId = this.documentId(this.lastContentScene);
      this.refreshQueue = this.refreshQueue.then(() => this.controller.acceptExternalEdit(result.value, documentId));
    } catch (error) { this.notice(error instanceof Error ? error.message : String(error)); }
  }
  endEditGroup() { this.host.endEditGroup(); }
  updateText(sceneId: string, lineId: string, text: string) {
    this.edit('编辑文稿', project => {
      const line = project.scenes.find(scene => scene.id === sceneId)?.lines.find(line => line.id === lineId); if (!line) return;
      let prefix = 0, suffix = 0;
      while (prefix < line.text.length && prefix < text.length && line.text[prefix] === text[prefix]) prefix++;
      while (suffix < line.text.length - prefix && suffix < text.length - prefix && line.text.at(-1 - suffix) === text.at(-1 - suffix)) suffix++;
      const end = line.text.length - suffix, delta = text.length - line.text.length;
      for (const event of line.events) event.offset = Math.max(0, Math.min(text.length, event.offset >= end ? event.offset + delta : event.offset > prefix ? prefix : event.offset));
      line.text = text;
    }, `text:${sceneId}:${lineId}`);
  }
  insertEvent(sceneId: string, lineId: string, kind: InlineEvent['kind'], offset: number) {
    const id = createId(); this.endEditGroup();
    this.edit('插入句内事件', project => {
      const line = project.scenes.find(scene => scene.id === sceneId)?.lines.find(line => line.id === lineId); if (!line) return;
      line.events.push({ id, kind, offset: Math.min(Math.max(0, offset), line.text.length), characterId: line.speakerId ?? project.characters[1]?.id, value: kind === 'expression' ? 'surprised' : kind === 'sound' ? '通电' : '', durationMs: kind === 'pause' ? 600 : 0 }); line.events.sort((a, b) => a.offset - b.offset);
    });
    this.select({ kind: 'event', documentId: sceneId, id, lineId });
  }
  selectLine(sceneId: string, lineId: string, offset = 0) {
    this.commands.set(sceneId,lineId);
    this.updateUi(ui => { ui.sceneId = sceneId; ui.lineId = lineId; ui.focusDocument = sceneId; ui.documentPositions ??= {}; ui.documentPositions[sceneId] = { lineId, offset }; ui.selected = { kind: 'line', documentId: sceneId, id: lineId }; ui.selection = { lineId, start: offset, end: offset }; });
    this.controller.selectScene(sceneId); this.controller.select([lineId]); this.target(sceneId);
  }
  select(source: Source) { this.updateUi(ui => { ui.selected = source; }); }
  revealLine(sceneId: string, lineId: string, offset = 0) { this.selectLine(sceneId, lineId, offset); this.updateUi(ui => { ui.reveal = { sceneId, lineId, offset, serial: (ui.reveal?.serial ?? 0) + 1 }; }); }
  source(panel: Panel): Source { return this.state.ui.pins[panel] ?? (panel === 'stage' ? { kind: 'line', documentId: this.state.ui.sceneId, id: this.viewState('stage:mode')==='runtime' ? this.editingStatement()??this.state.ui.lineId : this.state.ui.lineId } : this.state.ui.selected); }
  pin(panel: Panel, source?: Source) { const next = source ?? this.source(panel); this.updateUi(ui => { if (ui.pins[panel]) delete ui.pins[panel]; else ui.pins[panel] = structuredClone(next); }); if (this.state.activeView === panel) this.target(this.source(panel).documentId); }
  history(sceneId: string) { return this.host.history(this.documentId(sceneId)); }
  undo(id?: string) { return this.changeHistory('undo', id); }
  redo(id?: string) { return this.changeHistory('redo', id); }
  private async changeHistory(action: 'undo' | 'redo', id = this.state.commandTarget) {
    const { activeView, commandTarget } = this.state;
    if (id === commandTarget && this.viewHistory.get(activeView)?.(action)) {
      const count = this.viewRedo.get(activeView) ?? 0;
      this.viewRedo.set(activeView, action === 'undo' ? count + 1 : Math.max(0, count - 1));
      this.refresh();
      return;
    }
    if (!id) {
      this.notice(activeView === 'preferences' ? '个人偏好不进入作品历史' : '当前工作面没有作品历史目标。');
      return;
    }
    const documentId = this.documentId(id);
    this.endEditGroup();
    await this.refreshQueue;
    this.report(await this.controller[action]({ documentId, ...(id === commandTarget && activeView === 'publish' ? { paths: PublishHistoryPaths } : {}) }));
    this.refresh();
  }
  private report(result: Result<unknown>) { if (!result.ok) this.notice(result.error.message); }
  validateSource(sceneId: string, text: string): string | null {
    const documents = this.host.list(), current = this.sceneSource(sceneId); if (!current) return '场景已关闭';
    const parsed = parse({ documentId: current.documentId, revision: current.revision, text });
    const syntax = parsed.issues.find(issue => issue.severity === 'error'); if (syntax) return syntax.message;
    const source = authoringSource(documents);
    const prepared=compileInput(documents);if(!prepared.ok)return prepared.error.message;
    const input=prepared.value;
    const issues = validateAuthoringCommands(parsed, parsed.cst.flatMap(node => node.id ? [node.id] : []), input.scenes.find(scene => scene.id === sceneId)!, { engineVersion: source.project.engineVersion, pluginCommands: this.pluginCommands, scenes:input.scenes, characters: source.characters, variables: source.variables??[], assets:input.assets, gallery:input.gallery, documents: input.documents.map(document=>document.kind==='scene'&&document.sceneId===sceneId?{...document,text}:document) });
    return issues.find(issue => issue.severity === 'error' && issue.code !== 'TEXT_EMPTY')?.message ?? null;
  }
  sourceDraft(sceneId: string, text: string | null) {
    const current = this.sceneSource(sceneId); if (!current) return;
    if (text !== null && !this.draftBases.has(sceneId)) this.draftBases.set(sceneId, current.text);
    if (text === null) this.draftBases.delete(sceneId);
    const conflict = text !== null && this.draftBases.get(sceneId) !== current.text && text !== current.text;
    const error = text === null ? null : conflict ? '文稿已在源码草稿期间更新。请恢复有效源码后重新修改。' : this.validateSource(sceneId, text);
    this.updateUi(ui => { if (text === null) { delete ui.sourceDrafts[sceneId]; delete ui.sourceErrors[sceneId]; } else { ui.sourceDrafts[sceneId] = text; if (error) ui.sourceErrors[sceneId] = error; else delete ui.sourceErrors[sceneId]; } });
  }
  async commitSource(sceneId: string, text: string) {
    await this.refreshQueue;
    const current = this.sceneSource(sceneId); if (!current) return false;
    if (this.draftBases.has(sceneId) && this.draftBases.get(sceneId) !== current.text && text !== current.text) {
      this.updateUi(ui => { ui.sourceErrors[sceneId] = '文稿已在源码草稿期间更新。请恢复有效源码后重新修改。'; }); return false;
    }
    if (text === current.text) { this.sourceDraft(sceneId, null); return true; }
    await this.controller.refresh();
    const result = await this.controller.editScript(text, sceneId); this.report(result);
    if (result.ok) {
      const newer = this.state.ui.sourceDrafts[sceneId];
      if (newer !== undefined && newer !== text) { this.draftBases.set(sceneId, text); this.sourceDraft(sceneId, newer); }
      else this.sourceDraft(sceneId, null);
    }
    return result.ok;
  }
  private async flushProductionDraft() {
    try {
      await this.tasks.production.saveDraft(true);
      return true;
    } catch (error) {
      this.notice(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  private async prepareSave(scope: Exclude<SaveScope, { kind: 'objects' }>) {
    if (this.state.saving) return false;
    const { activeView } = this.state;
    const all = scope.kind === 'all';
    if (all && !await this.flushProductionDraft()) return false;
    const relevant=(id:string)=>all||id===activeView||id.startsWith(activeView+'/');
    for(const [id,guard] of this.viewGuards)if(relevant(id)&&!await guard()){this.notice('工作面有未应用的修改，请先应用或恢复输入后保存。');return false;}
    if(this.state.pendingViews.some(relevant)){this.notice('工作面有未应用的修改，请先应用或恢复输入后保存。');return false;}
    const includesDocument = (id: string) => all || this.documentId(id) === scope.documentId;
    for (const [id,flush] of this.editorFlush) if (includesDocument(id)&&!await flush()) { this.notice('源码有未解决的草稿，请修正或恢复有效源码再保存。'); return false; }
    for (const [id,text] of Object.entries(this.state.ui.sourceDrafts)) if (includesDocument(id) && !await this.commitSource(id,text)) return false;
    if (Object.keys(this.state.ui.sourceErrors).some(includesDocument)) { this.notice('源码草稿尚未通过校验。'); return false; }
    await this.refreshQueue;
    return true;
  }
  async save(all = true, documentId?: string) {
    const { activeView, commandTarget } = this.state;
    if (!all && documentId === undefined) {
      if (activeView === 'preferences') { this.notice('个人偏好即时保存，不写入作品'); return true; }
      if (productionDraftView(activeView)) {
        if (this.state.saving || !await this.flushProductionDraft()) return false;
        const draft = this.tasks.production.draft;
        this.notice(draft && !draft.submittedTaskId ? '制作草稿已保存。' : '当前没有待保存的制作草稿。');
        return true;
      }
      documentId = commandTarget ? this.documentId(commandTarget) : undefined;
    }
    const scope = all ? { kind: 'all' as const } : { kind: 'current' as const, documentId: documentId ?? '' };
    if (scope.kind === 'current' && !scope.documentId) { this.notice('当前工作面没有可保存的作品目标。'); return false; }
    if (!await this.prepareSave(scope)) return false;
    this.lastSaveScope = scope;
    const planned=await this.services.bridge.documents.planSave(scope);if(!planned.ok){this.report(planned);return false;}
    return this.savePlan(planned.value);
  }
  async savePlan(plan:SavePlan){const result=await this.controller.savePlanned(plan);this.report(result);this.refresh();if(result.ok)this.notice(result.value.remainingDirty.length?'所选对象已保存；其余修改继续保留。':'审核会话已保存到内存宿主。');return result.ok&&!this.host.list().some(document=>plan.members.includes(document.documentId)&&document.dirty);}
  retrySave(){return this.save(this.lastSaveScope.kind==='all',this.lastSaveScope.kind==='current'?this.lastSaveScope.documentId:undefined);}
  async reviewSave(all = true) {
    const { commandTarget } = this.state;
    if (!all && !commandTarget) { this.notice('当前工作面没有可审阅的作品目标。'); return; }
    const scope = all ? { kind: 'all' as const } : { kind: 'current' as const, documentId: this.documentId(commandTarget) };
    if (!await this.prepareSave(scope)) return;
    const result = await this.services.bridge.documents.planSave(scope);
    if (!result.ok) { this.report(result); return; }
    if (!result.value.files.length) { this.notice('当前范围没有待保存的修改。'); return; }
    this.lastSaveScope = scope;
    this.state = { ...this.state, saveReview: { plan: result.value, documents: this.host.list(), scope } };
    this.emit();
  }
  closeSaveReview(){this.state={...this.state,saveReview:null};this.emit();}
  preview() {
    const { scene, line } = sourceLine(this.state.project, this.source('stage')); if (!scene || !line) { this.notice('当前舞台来源已不存在，请恢复跟随。'); return; }
    this.updateUi(ui => { const same = ui.preview.sceneId === scene.id && ui.preview.lineId === line.id; const offset = same ? ui.preview.offset : ui.selection?.lineId === line.id ? ui.selection.start : 0; ui.preview = { ...ui.preview, sceneId: scene.id, lineId: line.id, offset: offset >= line.text.length ? 0 : offset, status: same && ui.preview.status === 'playing' ? 'paused' : 'playing' }; });
  }
  dispose() { this.historyReviewAnswer?.(false);this.historyReviewAnswer=null; this.alive = false; this.releasePreferences?.(); this.unsubscribe(); this.tasks.dispose(); this.controller.close(); this.host.dispose(); this.listeners.clear(); this.editorFlush.clear(); }
}
