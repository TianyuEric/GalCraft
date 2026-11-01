import { localizeRecipe } from '@galcraft/authoring/recipes/operations';
import { operationTitle, operationDescription } from '@galcraft/plugins/contracts';
import { VoicePresetAdoption } from './VoicePresetAdoption.js';
import { createId, issueFromError, type EditReceipt } from '@galcraft/contracts';
import { IssueNotice } from '../../components/issue-notice.js';
import { TaskItemFeedback } from './TaskItemFeedback.js';
import { ConversationPanel, CandidateUsage } from './ConversationPanel.js';
import { CandidatePlacement } from './CandidatePlacement.js';
import { ServiceConnections } from './ServiceConnections.js';
import { readWorkflow } from './workflow-model.js';
import { WorkflowDialog } from './WorkflowDialog.js';
import { ContextTable } from './ContextTable.js';
import { Disclosure } from '../../components/disclosure.js';
import { SaveChangeList } from '../../components/change-list.js';
import { buildSaveChanges } from '../../components/save-changes.js';
import { adoptionChanges } from './adoption-changes.js';
import { RecipeEditor, presetPurpose, presetIcon, presetSource } from './RecipeEditor.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs.js';
import { requestDialog } from '../../components/request-dialog.js';
import { studioToasts } from '../../components/toast.js';
import { CodeEditor } from '../../components/code-editor.js';
import { suggestedAssetName, validAssetFileName } from '@galcraft/assets/naming';
import { Pagination } from '../../components/pagination.js';
import { CodeBlock } from '../../components/code-block.js';
import { useModalState } from '../../components/motion.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from 'react-dom';
import { ObjectTree } from '../../components/workbench/ObjectTree.js';
import { DocumentTabs, InspectorSection } from '../../components/workbench/WorkbenchShell.js';
import { MessageBox } from '../../components/workbench/MessageBox.js';
import {
  Plus,
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
  WandSparkles,
  Layers,
  RefreshCw,
  Check,
  Play,
  Square,
  FileText,
  Image,
  Music2,
  Trash2,
} from "lucide-react";
import type {
  Candidate,
  RecipeSelection,
  UIAuthoringPlan,
  UIPlanProposal,
} from "@galcraft/authoring/production";
import type { CreationRecipe } from "@galcraft/authoring/recipes";
import type { EditPlan, DocumentView } from "@galcraft/contracts";
import type { UIComposition } from "@galcraft/templates";
import {
  Button,
  Choice,
  Empty,
  Field,
  Modal,
  Badge,
} from "../../components/controls.js";
import { unwrap } from "./bridge.js";
import { ProductionSession } from "./session.js";
import "./production.css";
import { UIPlanEditor } from "./UIPlanEditor.js";
import { CompositionReview } from "./CompositionReview.js";
import type { AuthoringServices } from "../../authoring/controller.js";
import { quickLabels } from './QuickTask.js';
import { ProductionCreateMenu } from './ProductionCreateMenu.js';
import { TaskExecutionStatus } from './TaskExecutionStatus.js';
import { DraftWorkstation } from './DraftWorkstation.js';
import type { ProductionEditorHost } from './ExtensionOperationForm.js';
import { CandidateMediaPreview } from './CandidateMediaPreview.js';
import { OutlineEditor } from './OutlineEditor.js';
import { openAssetPicker } from '../../authoring/asset-picker.js';
import { ScriptCandidatePreview } from './ScriptCandidatePreview.js';
import * as monaco from 'monaco-editor';
import { languageId, monarchLanguage } from '@galcraft/dsl';

export const tr = (locale: string, zh: string, en: string, ja: string) =>
  locale === "en" ? en : locale === "ja" ? ja : zh;
const uses = [
  ["script", "剧本", "Script", "シナリオ"],
  ["background", "背景", "Background", "背景"],
  ["figure", "立绘", "Character art", "立ち絵"],
  ["difference", "差分", "Variation", "差分"],
  ["cg", "CG", "CG", "CG"],
  ["voice", "语音", "Speech", "音声"],
  ["bgm", "音乐", "Music", "音楽"],
  ["ui", "UI 素材", "UI assets", "UI 素材"],
] as const;
const states: Record<string, [string, string, string]> = {
  draft: ["草稿", "Draft", "下書き"],
  blocked: ["等待依赖", "Waiting for inputs", "入力待ち"],
  queued: ["排队中", "Queued", "待機中"],
  submitting: ["提交中", "Submitting", "送信中"],
  running: ["生成中", "Running", "生成中"],
  fetching: ["下载结果", "Fetching", "取得中"],
  review: ["执行：生成完成", "Execution: generated", "実行：生成完了"],
  interrupted: ["状态待确认", "Needs reconciliation", "状態確認待ち"],
  failed: ["失败", "Failed", "失敗"],
  cancelled: ["已取消", "Cancelled", "キャンセル済み"],
  unadopted: ["未采用", "Not adopted", "未採用"],
  adopted: ["已采用 · 未保存", "Adopted · unsaved", "採用済み・未保存"],
  saved: ["采用内容已保存", "Adoption saved", "採用内容を保存済み"],
};
export function Production({
  session: s,
  locale,
  page = "production",
  navigate,
  changed,
  services,
  documentActive = true,
  inspectorContainer,
  explorerContainer,
  revealInspector,
  onUnappliedChange,
  onReviewChange,
  productionHost,
}: {
  session: ProductionSession;
  locale: string;
  page?: string;
  navigate(page: string): void;
  changed(receipt?: EditReceipt): Promise<void>;
  services: AuthoringServices;
  documentActive?: boolean;
  inspectorContainer?: HTMLElement;
  explorerContainer?: HTMLElement;
  revealInspector?(): void;
  onUnappliedChange?(dirty: boolean): void;
  onReviewChange?(reviewing: boolean): void;
  productionHost?: ProductionEditorHost | null;
}) {
  s.displayLocale = () => locale;
  useSyncExternalStore(s.subscribe, s.snapshot);
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
  const mediaRoot = useRef<HTMLElement>(null), taskSidebar = useRef<HTMLElement>(null);
  const changeSection = (value: string) => {
    for (const element of mediaRoot.current?.querySelectorAll<HTMLMediaElement>('audio,video') ?? []) { element.pause(); element.currentTime = 0; }
    setActiveReview('');
    setTab(value);
  };
  const [searches, setSearches] = useState<Record<string, string>>({ tasks: '', recipes: '', connections: '' }), [taskFilter, setTaskFilter] = useState('all');
  const [recipeCategory, setRecipeCategory] = useState('all'), [recipeScope, setRecipeScope] = useState('all');
  const [librarySelection, setLibrarySelection] = useState<string[]>([]);
  const [workflowDocuments, setWorkflowDocuments] = useState<NonNullable<ProductionSession['guiDraft']>['workflowDocuments']>(s.guiDraft?.workflowDocuments??[]);
  const [activeWorkflow, setActiveWorkflow] = useState(s.guiDraft?.activeWorkflow??'');
  const [removeTask, setRemoveTask] = useState<{id:string;name:string}|null>(null);
  const [removeDraft, setRemoveDraft] = useState<{ id: string; name: string } | null>(null);
  const closeWorkflow = (id: string) => { setWorkflowDocuments(items => items.filter(item => item.id !== id)); setActiveWorkflow(current => current === id ? '' : current); };
  const selectWorkflow = (id?: string, importText?: string) => {
    const resumeDraft = id?.startsWith('workflow-draft:') ?? false;
    id = id?.replace(/^workflow-draft:/, '');
    const opened = id && workflowDocuments.find(item => (readWorkflow(item.text)?.id ?? item.id) === id);
    if (opened) { setActiveWorkflow(opened.id); return; }
    const existing = s.data.workflows.find(w => w.id === id);
    const storedDraft = s.data.workflowDrafts?.find(draft => draft.id === id);
    const workflow = (resumeDraft ? storedDraft?.workflow : existing) ?? storedDraft?.workflow ?? existing ?? { id: createId(s.data), revision: 0, name: '', purpose: null, imageUsages: null, graphVersion: '1', apiGraph: {}, editorWorkflowPath: null, inputs: [], uploads: [], outputs: [], requiredNodes: [], modelNotes: [] };
    setWorkflowDocuments(items => items.some(item => item.id === workflow.id) ? items : [...items, { id: workflow.id, text: JSON.stringify(workflow, null, 2), title: workflow.name || t('未命名工作流', 'Untitled workflow', '無題ワークフロー'), dirty: Boolean(importText), importText, paste: resumeDraft ? storedDraft?.paste ?? '' : '', draftRevision: storedDraft?.revision ?? null, expectedRevision: resumeDraft && storedDraft ? storedDraft.availableRevision : existing?.revision ?? null, closeRequest: 0 }]);
    setActiveWorkflow(workflow.id);
  };
  const [tab, setTab] = useState(s.guiDraft?.tab??"tasks"),
    [modal, setModal] = useModalState(""),
    [busy, setBusy] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [taskPage, setTaskPage] = useState(0), [draftPage, setDraftPage] = useState(0), [candidatePage, setCandidatePage] = useState(0);
  const [taskDetailsOpen, setTaskDetailsOpen] = useState(false), [taskHistoryOpen, setTaskHistoryOpen] = useState(true), [draftHistoryOpen, setDraftHistoryOpen] = useState(true);
  useEffect(() => { s.setVisible(documentActive); }, [s, documentActive]);
  useEffect(() => { setTaskPage(0); setDraftPage(0); setTaskHistoryOpen(true); if (searches.tasks) setDraftHistoryOpen(true); }, [searches.tasks, taskFilter]);
  useEffect(() => { setCandidatePage(0); setTaskDetailsOpen(false); }, [s.taskId]);

  const [retryPlan,setRetryPlan]=useState<import('@galcraft/authoring/production').TaskPlan|null>(null);
  const taskSearch = searches[tab] ?? '';
  const setTaskSearch = (value: string) => setSearches(previous => ({ ...previous, [tab]: value }));
  const [recipeBaseline, setRecipeBaseline] = useState(s.guiDraft?.recipeBaseline??'');
  const [recipe, setRecipe] = useState<CreationRecipe | null>(s.guiDraft?.recipe??null),
    [content, setContent] = useState<
      Record<string, { text: string; media: { uri: string; mime: string }[] }>
    >({});
  const [uiPlan, setUiPlan] = useState<UIAuthoringPlan | null>(null),
    [composition, setComposition] = useState<UIComposition | null>(null);
  const [adoptions, setAdoptions] = useState<
    Record<
      string,
      {
        mode: "library" | "bind" | "voicePreset";
        voicePreset?: import('@galcraft/authoring/production').CandidateAdoptionChoice['voicePreset'];
        name?: string;
        placement?: 'new' | 'replace';
        use?: 'figure' | 'illustration';
        frame: {
          fit: "cover" | "contain" | "native";
          positionX: number;
          positionY: number;
        };
      }
    >
  >({});
  const [recipeImport, setRecipeImport] = useState<
    import("@galcraft/authoring/recipes").RecipeImportPlan | null
  >(null);
  const [uiProposal, setUiProposal] = useState<UIPlanProposal | null>(s.guiDraft?.uiProposal??null);
  type ReviewKind = 'adopt' | 'recipe-import' | 'ui-plan' | 'save';
  const [savePinned, setSavePinned] = useState(false);
  const [activeReview, setActiveReview] = useState<ReviewKind | ''>(s.guiDraft?.uiProposal?'ui-plan':'');
  const [adoption, setAdoption] = useState<EditPlan | null>(null);
  const [adoptionDocuments, setAdoptionDocuments] = useState<DocumentView[]>([]);
  const [pendingReceipt, setPendingReceipt] = useState<EditReceipt | null>(null);
  const [refreshError, setRefreshError] = useState('');
  const adoptionGroups = useMemo(() => adoption ? adoptionChanges(adoption, adoptionDocuments, locale, Object.fromEntries(s.data.scenes.map(scene => [scene.documentId, scene.name]))) : [], [adoption, adoptionDocuments, locale]);
  const adoptionJson = useMemo(() => adoption ? JSON.stringify(adoption.input.patches, null, 2) : '', [adoption]);
  useEffect(() => { onReviewChange?.(!!activeReview); }, [activeReview, onReviewChange]);
  useEffect(() => () => onReviewChange?.(false), [onReviewChange]);
  const [uiSource, setUiSource] = useState<Pick<Parameters<typeof s.bridge.production.prepareUIPlan>[0], 'candidateId' | 'expected' | 'scope' | 'draft'> | null>(s.guiDraft?.uiSource??null);
  const [uiBaseline, setUiBaseline] = useState(s.guiDraft?.uiBaseline??'');
  const [discardReview, setDiscardReview] = useState(false);
  const reviewTitle = (id: string) => id === 'save' ? t('保存审阅', 'Save review', '保存レビュー') : id === 'adopt' ? t('采用审阅', 'Adoption review', '採用レビュー') : id === 'recipe-import' ? t('导入审阅', 'Import review', '読み込みレビュー') : t('UI 计划与请求', 'UI plan & requests', 'UI 計画とリクエスト');
  const uiDirty = !!uiProposal && JSON.stringify(uiProposal) !== uiBaseline;
  const unapplied = s.connectionDirty || uiDirty || workflowDocuments.some(item => item.dirty) || !!recipe && recipe.scope !== 'official' && JSON.stringify(recipe) !== recipeBaseline;
  useEffect(()=>{s.guiDraft={workflowDocuments,activeWorkflow,tab,recipe,recipeBaseline,uiProposal,uiSource,uiBaseline};},[s,workflowDocuments,activeWorkflow,tab,recipe,recipeBaseline,uiProposal,uiSource,uiBaseline]);
  useEffect(() => { onUnappliedChange?.(unapplied); }, [unapplied, onUnappliedChange]);
  useEffect(() => () => onUnappliedChange?.(false), []);
  const finishReview = (id: ReviewKind) => {
    if (id === 'save') { setSavePinned(false); setSavePlan(null); }
    if (id === 'adopt') { setAdoption(null); s.adoption = null; }
    if (id === 'recipe-import') setRecipeImport(null);
    if (id === 'ui-plan') { setUiProposal(null); setUiPlan(null); setUiSource(null); }
    setActiveReview(current => current === id ? '' : current);
  };
  const closeReview = async (id: ReviewKind) => {
    if (busy) return;
    if (id === 'ui-plan' && uiDirty) { setDiscardReview(true); return; }
    if (id === 'adopt' && adoption) { const result = await s.bridge.production.discardAdoption(adoption.planId); unwrap(result); }
    finishReview(id);
  };
  const reviewHeading = (id: ReviewKind) => <header className="production-review-heading"><h2>{reviewTitle(id)}{id === 'ui-plan' && uiDirty ? ' •' : ''}</h2><Button disabled={busy} onClick={() => void run(() => closeReview(id))}>{t('关闭文档', 'Close document', '文書を閉じる')}</Button></header>;

  const [planText, setPlanText] = useState(""),
    [changes, setChanges] = useState<string[]>([]),
    [savePlan, setSavePlan] = useState<
      import("@galcraft/contracts").SavePlan | null
    >(null);
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});
  const [saveDocuments, setSaveDocuments] = useState<DocumentView[]>([]);
  const saveGroups = savePlan ? buildSaveChanges(savePlan.files, saveDocuments, {}, locale) : [];
  const saveChangeCount = saveGroups.reduce((count, group) => count + group.changes.length, 0);
  const [previewCandidate, setPreviewCandidate] = useState<string | null>(null);
  const candidateName = (candidate: Candidate) => {
    const fields = candidate.input && typeof candidate.input === 'object' && !Array.isArray(candidate.input) && 'fields' in candidate.input ? candidate.input.fields : null;
    const original = fields && typeof fields === 'object' && !Array.isArray(fields) && 'assetId' in fields ? s.data.assets.find(asset => asset.id === fields.assetId) : undefined;
    if (original?.kind === 'animation') return original.name;
    const target = s.data.tasks.find(task => task.id === candidate.taskId)?.items.find(item => item.id === candidate.itemId)?.target;
    const artifact = candidate.artifacts.find(artifact => artifact.role === 'primary' && artifact.kind !== 'text');
    return suggestedAssetName({ usage: target?.usage ?? 'image', sceneName: s.data.scenes.find(scene => scene.id === target?.sceneId)?.name,
      characterName: s.data.characters.find(character => character.id === target?.characterId)?.name, extension: artifact?.localPath.split('.').at(-1) ?? 'png' }, s.data.assets.map(asset => asset.name));
  };
  const running = useRef(false);
  const run = async (action: () => Promise<void>, refresh = true) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    s.error = "";
    s.diagnostic = null;
    try {
      await action();
      if (refresh) await s.refresh();
    } catch (e) {
      s.error = String(e); s.diagnostic = issueFromError(e, 'M10');
      s.changed();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    s.start();
    return () => s.stop();
  }, [s]);
  useEffect(() => { if (!monaco.languages.getLanguages().some(language => language.id === languageId)) { monaco.languages.register({ id: languageId }); monaco.languages.setMonarchTokensProvider(languageId, monarchLanguage as unknown as monaco.languages.IMonarchLanguage); } }, []);
  useEffect(() => { if (s.quickOpen) { s.quickOpen = false; setActiveReview(''); setModal(''); setTab('tasks'); } }, [s, s.revision]);
  useEffect(() => {
    const onBlur = () => {
      if (s.draft && !s.draft.submittedTaskId)
        void s.saveDraft().catch((e) => {
          s.error = String(e); s.diagnostic = issueFromError(e, 'M10');
          s.changed();
        });
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [s]);
  const v = s.variant,
    draft = s.draft;
  const status = (state: string) =>
    states[state] ? t(...states[state]) : state;
  const selectCandidate = async (candidate: Candidate) => {
    if (s.selected.has(candidate.id)) s.selected.delete(candidate.id);
    else s.selected.add(candidate.id);
    s.changed();
    if (!content[candidate.id]) {
      const c = unwrap(
        await s.bridge.production.candidateContent(candidate.id),
      );
      setContent((old) => ({ ...old, [candidate.id]: c }));
    }
  };
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const clearError = (key: string) => setFormErrors(errors => { const next = { ...errors }; delete next[key]; return next; });
  const openRecipeEditor = async (next: CreationRecipe) => {
    const stored = recipe && s.data.recipes.find(item => item.id === recipe.id);
    const dirty = recipe && recipe.scope !== 'official' && JSON.stringify(recipe) !== (stored ? JSON.stringify(stored) : recipeBaseline);
    if (dirty && await requestDialog({ title: t('放弃未保存的方案修改？', 'Discard unsaved scheme changes?', '未保存の変更を破棄しますか？'), description: t('继续编辑会保留当前输入。放弃后再打开所选方案或新建内容。', 'Cancel keeps the current input. Discard before opening or creating another scheme.', 'キャンセルすると入力を保持。破棄後に別の制作方法を開きます。'), locale, destructive: true, confirmLabel: t('放弃更改', 'Discard changes', '変更を破棄') }) === null) return;
    setRecipe(next); setRecipeBaseline(JSON.stringify(next)); setLibrarySelection([next.id]);
  };
  const useRecipe = async (r: CreationRecipe) => { await s.openRecipe(r, r.uses.includes(recipeCategory as CreationRecipe['uses'][number]) ? recipeCategory as CreationRecipe['uses'][number] : r.uses[0]); setTab('tasks'); setModal(''); };
  const begin = () => void run(() => s.startQuick(page === 'pages' ? 'page' : 'script'));
  const active = s.task;
  const candidates = s.candidates();
  const currentCandidatePage = Math.min(candidatePage, Math.max(0, Math.ceil(candidates.length / 12) - 1));
  const pageCandidates = candidates.slice(currentCandidatePage * 12, (currentCandidatePage + 1) * 12);
  const candidateIds = pageCandidates.map(candidate => candidate.id).join(',');
  useEffect(() => { setContent({}); }, [s.taskId]);
  useEffect(() => {
    let active = true;
    if (!documentActive || tab !== 'tasks' || activeReview) return;
    const missing = pageCandidates.filter(candidate => !content[candidate.id]);
    void Promise.allSettled(missing.map(async candidate => ({ id: candidate.id, content: unwrap(await s.bridge.production.candidateContent(candidate.id)) }))).then(results => {
      if (!active) return;
      const loaded = Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [[result.value.id, result.value.content]] : []));
      if (Object.keys(loaded).length) setContent(previous => ({ ...previous, ...loaded }));
    });
    return () => { active = false; };
  }, [s, s.taskId, candidateIds, documentActive, tab, activeReview]);
  const refreshAdoption = async (receipt: EditReceipt, notify = true) => {
    setPendingReceipt(receipt); setRefreshError('');
    try {
      const results = await Promise.allSettled([s.refresh(), changed(notify ? receipt : undefined)]);
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      setPendingReceipt(null);
    }
    catch (error) { setRefreshError(String(error)); }
  };
  const adoptionDialog = async (plan: EditPlan) => {
    if (adoption) { void s.bridge.production.discardAdoption(plan.planId); setActiveReview('adopt'); return; }
    const documents = await services.bridge.documents.list();
    setAdoptionDocuments(documents.ok ? documents.value : []);
    s.adoption = plan; setAdoption(plan); setActiveReview('adopt'); setModal('');
  };
  const placeExplorer = (node: ReactNode) => explorerContainer ? createPortal(node, explorerContainer) : node;
  const recipeKind = (item: CreationRecipe) => item.parameterPreset ? 'parameters' : item.production ? 'scheme' : 'promptRule';
  const recipeKindLabel = (kind: string) => kind === 'parameters' ? t('参数预设', 'Parameter presets', 'パラメータプリセット') : kind === 'scheme' ? t('制作方案', 'Production schemes', '制作方法') : t('提示规则', 'Prompt rules', 'プロンプトルール');
  const filteredRecipes = s.data.recipes.map(item => localizeRecipe(item, locale)).filter(item => item.name.toLocaleLowerCase().includes(searches.recipes!.toLocaleLowerCase()) && (recipeScope === 'all' || item.scope === recipeScope) && (recipeCategory === 'all' || recipeCategory === 'promptRule' ? recipeCategory !== 'promptRule' || recipeKind(item) === 'promptRule' : item.uses.includes(recipeCategory as CreationRecipe['uses'][number])));
  const visibleTasks = [...s.tasks].reverse().filter(task => task.name.toLocaleLowerCase().includes(searches.tasks!.toLocaleLowerCase()) && (taskFilter === 'all' || task.items.some(item => taskFilter === 'active' ? ['queued','submitting','running','fetching','blocked'].includes(item.state) : taskFilter === 'review' ? item.state === 'review' : ['failed','interrupted'].includes(item.state))));
  const visibleDrafts = s.data.drafts.filter(draft => !draft.submittedTaskId && (draft.name ?? draft.activeUse).toLocaleLowerCase().includes(searches.tasks!.toLocaleLowerCase()));
  const currentTaskPage = Math.min(taskPage, Math.max(0, Math.ceil(visibleTasks.length / 20) - 1));
  const currentDraftPage = Math.min(draftPage, Math.max(0, Math.ceil(visibleDrafts.length / 20) - 1));
  useEffect(() => { const index = visibleTasks.findIndex(task => task.id === s.taskId); if (index >= 0) setTaskPage(Math.floor(index / 20)); }, [s.taskId]);
  const showExecutionSteps = () => { setStepsOpen(true); requestAnimationFrame(() => { const destination = mediaRoot.current?.querySelector<HTMLElement>('[data-production-sources] summary'); destination?.scrollIntoView({block:'start'}); destination?.focus({preventScroll:true}); }); };
  return (
    <Tabs className="production-page" data-review-active={!!activeReview} data-inspector-external={!!inspectorContainer} data-explorer-external={!!explorerContainer} render={<main ref={mediaRoot}/>} variant="underline" value={tab} onValueChange={value => changeSection(String(value))}>
      {placeExplorer(<nav className="production-explorer-sections" hidden={!documentActive} aria-label={t('制作分区','Production sections','制作の区分')}>
        <TabsList className="workbench-tabs" aria-label={t('制作工作台分区', 'Production sections', '制作ワークスペースの区分')}>
          {[['tasks', t('制作与候选', 'Production & candidates', '制作と候補')], ['recipes', t('方案库', 'Scheme library', '制作方法ライブラリ')], ['connections', t('连接与工具', 'Connections & tools', '接続とツール')]].map(([id, label]) => <TabsTrigger key={id} value={id}>{id==='tasks'?<WandSparkles size={15}/>:id==='recipes'?<Layers size={15}/>:<SlidersHorizontal size={15}/>} {label}</TabsTrigger>)}
        </TabsList>
        <Input className="production-global-search" aria-label={t('搜索当前制作分区', 'Search the current production section', '現在の制作区分を検索')} placeholder={t('搜索当前分区…', 'Search this section…', 'この区分を検索…')} value={taskSearch} onChange={e => setTaskSearch(e.target.value)}/>
      </nav>)}
      {(adoption || recipeImport || uiProposal || savePinned) && <div className="production-review-navigation"><DocumentTabs active={activeReview || 'overview'} documents={[
        { id: 'overview', title: t('制作工作台', 'Production workspace', '制作ワークスペース'), icon: <Layers size={15}/>, closable: false },
        ...(['adopt', 'recipe-import', 'ui-plan', 'save'] as const).filter(id => id === 'adopt' ? adoption : id === 'recipe-import' ? recipeImport : id === 'save' ? savePinned : uiProposal).map(id => ({ id, title: reviewTitle(id), icon: <FileText size={15}/>, dirty: id === 'ui-plan' && uiDirty })),
      ]} onSelect={id => setActiveReview(id === 'overview' ? '' : id as ReviewKind)} onPin={() => {}} onClose={async id => { if (id === 'overview') return false; await run(() => closeReview(id as ReviewKind)); return false; }}/></div>}
      {pendingReceipt && <div className="production-adoption-refresh" role="status"><p>{t('内容已采用，正在同步工作区。', 'Content adopted; synchronizing the workspace.', '採用済み。ワークスペースを同期しています。')}</p>{refreshError && <><p role="alert">{t('工作区刷新失败；采用已经完成，请重试刷新。', 'Workspace refresh failed. Adoption completed; retry refreshing.', '更新に失敗しました。採用済みです。更新を再試行してください。')} {refreshError}</p><Button disabled={busy} onClick={() => void run(() => refreshAdoption(pendingReceipt, false), false)}>{t('重试刷新', 'Retry refresh', '更新を再試行')}</Button></>}</div>}
      {documentActive && activeReview === 'ui-plan' && uiProposal && placeExplorer(<nav className="production-plan-outline" aria-label={t('计划步骤', 'Plan steps', '計画のステップ')}><h3>{t('计划步骤与依赖', 'Plan steps and dependencies', '計画のステップと依存関係')}</h3>{uiProposal.steps.map((step, index) => <Button key={step.key} onClick={() => mediaRoot.current?.querySelectorAll('.plan-step-editor')[index]?.scrollIntoView({block:'start',behavior:'smooth'})}><span>{index + 1}. {step.description || step.key}<small>{t('先完成', 'After', '先行ステップ')}: {step.dependsOn.join(', ') || '—'}</small></span></Button>)}</nav>)}
      <header className="production-workbench-toolbar">
        <div className="production-section-select"><Choice label={t('制作分区','Production section','制作の区分')} value={tab} onChange={changeSection} options={[{value:'tasks',label:t('制作与候选','Production & candidates','制作と候補')},{value:'recipes',label:t('方案库','Scheme library','制作方法ライブラリ')},{value:'connections',label:t('连接与工具','Connections & tools','接続とツール')}]}/></div>
        <ProductionCreateMenu locale={locale} busy={busy} entries={[
          ...(['script', 'stage', 'background', 'figure', 'cg', 'difference', 'voice', 'music', 'page', 'ui-assets'] as const).map(intent => ({ id:intent, label:t(...quickLabels[intent]), group:['script','stage'].includes(intent) ? t('剧情与演出','Story & staging','シナリオと演出') : ['voice','music'].includes(intent) ? t('声音','Sound','音声') : ['page','ui-assets'].includes(intent) ? t('页面与界面','Pages & UI','ページとUI') : t('画面素材','Artwork','画像素材'), run:() => { setTab('tasks'); setActiveReview(''); void run(() => s.startQuick(intent)); } })),
          ...(s.data.operations ?? []).filter(operation => operation.provider).map(operation => ({ id:operation.id, label:operationTitle(operation, locale), group:t('插件制作','Plugin production','プラグイン制作'), detail:operationDescription(operation, locale), run:() => { setTab('tasks'); setActiveReview(''); void run(() => s.openOperation(operation, locale)); } })),
        ]}/>
        {tab==='tasks'&&<Button tone="quiet" onClick={() => setModal(modal === 'outline' ? '' : 'outline')}><FileText size={15}/>{t('作品大纲', 'Project outline', '作品のあらすじ')}</Button>}
      </header>
      {!!s.data.migrationIssues?.length && <Disclosure><span>{t('制作数据需要处理','Production data needs attention','制作データの確認が必要です')} ({s.data.migrationIssues.length})</span><ul>{s.data.migrationIssues.map((message,index)=><li key={index}>{message}</li>)}</ul></Disclosure>}
      {s.error && (
        <div role="alert" className="workbench-error">
          {s.diagnostic ? <IssueNotice issue={s.diagnostic} locale={locale}/> : <>
          <p>{/Cannot read|TypeError|undefined|SyntaxError/.test(s.error) ? t('无法完成此操作，请检查当前表单或重新打开工作台。详细信息可用于定位问题。', 'This action could not complete. Check the form or reopen the workbench; details can help diagnose it.', '処理できませんでした。フォームを確認するか、制作画面を開き直してください。') : s.error.replace(/^Error: /, '')}</p>
          {/Cannot read|TypeError|undefined|SyntaxError/.test(s.error) && <Disclosure><span>{t('详细信息', 'Details', '詳細')}</span><CodeBlock code={s.error} language="text" locale={locale}/></Disclosure>}
          </>}
          <Button tone="quiet" onClick={() => { s.error = ''; s.diagnostic = null; s.changed(); }}>{t('关闭提示', 'Dismiss', '閉じる')}</Button>
        </div>
      )}
      <TabsContent keepMounted value="tasks" className="production-layout" data-section-active={tab === 'tasks'}>
          {placeExplorer(<aside ref={taskSidebar} className="task-sidebar" hidden={!documentActive || tab !== 'tasks' || activeReview === 'ui-plan'}>
            <div className="task-list-title">
              <h2>{t("制作任务", "Production tasks", "制作タスク")}</h2>
              <Badge>{s.tasks.length}</Badge>
            </div>
            {!s.tasks.length && !s.data.drafts.length && <p className="task-empty">{t('任务会保留在这里，你可以随时回来继续。', 'Your tasks stay here, ready to continue.', 'タスクはここに保存され、いつでも再開できます。')}</p>}
            <div className="task-filters">
            <Choice label={t("任务状态","Task status","タスクの状態")} value={taskFilter} options={[{value:'all',label:t("全部任务","All tasks","すべてのタスク")},{value:'active',label:t("进行中","In progress","進行中")},{value:'review',label:t("待审阅","Ready for review","レビュー待ち")},{value:'failed',label:t("失败或中断","Failed or interrupted","失敗・中断")}]} onChange={setTaskFilter}/>
            </div>
            {!visibleTasks.length && !visibleDrafts.length && (!!searches.tasks || taskFilter !== 'all') && <p className="task-empty">{t('没有匹配的任务或草稿。清除搜索或切换状态可查看其他记录。','No matching tasks or drafts. Clear search or change status to see other records.','一致するタスクや下書きがありません。検索をクリアするか状態を変更してください。')}<Button tone="quiet" onClick={() => { setTaskSearch(''); setTaskFilter('all'); }}>{t('显示全部任务','Show all tasks','すべてのタスクを表示')}</Button></p>}
            <Disclosure open={taskHistoryOpen} onOpenChange={setTaskHistoryOpen}><span>{t('制作记录','Production history','制作履歴')} · {visibleTasks.length}</span>
            <Pagination total={visibleTasks.length} page={currentTaskPage} pageSize={20} onPageChange={page=>{setTaskPage(page);taskSidebar.current?.scrollIntoView({block:'start'});}} locale={locale} label={t('制作记录分页','Production history pages','制作履歴のページ')}/>
            {visibleTasks.slice(currentTaskPage * 20, (currentTaskPage + 1) * 20).map((task) => (
              <div key={task.id} className="draft-row"><button
                key={task.id}
                data-task-id={task.id}
                className={`task-row ${s.taskId === task.id ? "selected" : ""}`}
                onClick={() => {
                  setActiveReview(''); s.taskId = task.id;
                  s.selected.clear();
                  s.changed(); void run(() => s.refresh(), false);
                }}
              >
                <span>
                  <Layers size={15} />
                  <strong title={task.name}>{task.name.length > 40 ? `${task.name.slice(0, 40)}…` : task.name}</strong>
                </span>
                <small>
                  {task.items.length} {t("个步骤", "steps", "ステップ")} ·{" "}
                  {new Date(task.createdAt).toLocaleDateString(locale)}
                </small>
                <Badge>{status(task.items.at(-1)?.state ?? "draft")}</Badge>
              </button><Button tone="quiet" className="task-remove" aria-label={t('移除记录', 'Remove record', '記録を削除')} disabled={task.items.some(item => ['queued','submitting','running','fetching','blocked'].includes(item.state))} title={t('移除记录，保留已采用内容和来源文件', 'Remove the record; keep adopted content and source files', '記録を削除し、採用した内容と元ファイルを保持')} onClick={() => setRemoveTask({id:task.id,name:task.name})}><Trash2 size={14}/></Button></div>
            ))}
            </Disclosure>
            <Disclosure open={draftHistoryOpen} onOpenChange={setDraftHistoryOpen}><span>{t('制作草稿','Drafts','下書き')} · {visibleDrafts.length}</span>
            <Pagination total={visibleDrafts.length} page={currentDraftPage} pageSize={20} onPageChange={setDraftPage} locale={locale} label={t('制作草稿分页','Draft pages','下書きのページ')}/>
            {visibleDrafts.slice(currentDraftPage * 20, (currentDraftPage + 1) * 20)
              .map((d) => (
                <div key={d.id} className="draft-row"><button
                  key={d.id}
                  data-draft-id={d.id}
                  className="task-row"
                  onClick={() => {
                    void run(() => s.openDraft(d.id));
                    setModal("");
                  }}
                >
                  <FileText size={15} />
                  {d.name ?? uses.find((u) => u[0] === d.activeUse)?.[
                      locale === "en" ? 2 : locale === "ja" ? 3 : 1
                    ]
                  }
                  <small>{new Date(d.updatedAt).toLocaleString(locale)}</small>
                </button><Button tone="quiet" className="task-remove" aria-label={t('删除草稿', 'Delete draft', '下書きを削除')} title={t('删除草稿', 'Delete draft', '下書きを削除')} onClick={() => setRemoveDraft({ id: d.id, name: d.name || t('未命名草稿', 'Untitled draft', '無題の下書き') })}><Trash2 size={14}/></Button></div>
              ))}
            </Disclosure>
          </aside>)}
          <section className="task-detail">
            {draft && v && !draft.submittedTaskId && <div className="production-draft-view" hidden={!!active || modal === 'outline'}><DraftWorkstation productionHost={productionHost} key={draft.id} session={s} locale={locale} services={services} busy={busy} run={run} generated={() => setModal('')} navigate={navigate} active={documentActive && !activeReview && tab === 'tasks' && !active && modal !== 'outline'} inspectorContainer={inspectorContainer} revealInspector={revealInspector}/></div>}
            {modal === 'outline' ? <OutlineEditor inline session={s} locale={locale} changed={changed} close={() => setModal('')}/> : !active && draft && v && !draft.submittedTaskId ? null : !active ? (
              <Empty
                title={t(
                  "开始下一项制作",
                  "Start your next production",
                  "次の制作を始める",
                )}
                detail={t(
                  "选择剧本、画面或声音。确认发送计划后，结果会保留在这里。",
                  "Choose a script, image or sound. Results stay here after you confirm the request.",
                  "シナリオ、画像、音声を選択。送信内容を確認すると、結果がここに保存されます。",
                )}
              >
                <Button tone="primary" onClick={begin}>
                  <Plus size={16} />
                  {t("创建制作草稿", "Create a draft", "下書きを作成")}
                </Button>
              </Empty>
            ) : (
              <>
                <div className="task-detail-heading">
                  <div>
                    <h2>{active.name}</h2>
                    <Disclosure open={taskDetailsOpen} onOpenChange={setTaskDetailsOpen}><span>{t('制作详情', 'Production details', '制作の詳細')}</span>{taskDetailsOpen&&<CodeBlock code={JSON.stringify({ taskId: active.id, name: active.name, steps: active.items.map(item => ({ id: item.id, requestId: item.remote?.id ?? null, service: item.configSnapshot?.name ?? null, model: item.configSnapshot?.model ?? null, input: item.input })) }, null, 2)} language="json" locale={locale}/>}</Disclosure>
                  </div>
                  <div className="gc-actions">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          unwrap(await s.bridge.production.resume(active.id));
                        })
                      }
                    >
                      <RefreshCw size={14} />
                      {t("重取结果", "Reconcile result", "結果を再取得")}
                    </Button>
                    <Button disabled={busy} onClick={() => setModal("cancel")}>
                      <Square size={13} />
                      {t("取消任务", "Cancel task", "キャンセル")}
                    </Button>
                  </div>
                </div>
                <TaskExecutionStatus task={active} locale={locale} statusLabel={status} showSteps={showExecutionSteps}/>
                <div className="candidate-heading">
                  <h2>{t("候选比较", "Compare candidates", "候補を比較")}</h2>
                  <span>
                    {s.selected.size} {t("项选中", "selected", "選択")}
                  </span>
                  {active.items.some(item => item.sourceVersions.some(version => s.data.versions.some(current => current.ref.id === version.ref.id && current.revision !== version.revision))) && <Button tone="quiet" onClick={() => { setStepsOpen(true); requestAnimationFrame(() => mediaRoot.current?.querySelector('[data-production-sources]')?.scrollIntoView({block:'start'})); }}>{t('来源已变化 · 复核来源', 'Source changed · Review sources', '出典が変更・確認')}</Button>}
                  <div className="gc-actions">
                    <Button
                      disabled={!s.selected.size || busy || !!pendingReceipt}
                      onClick={() =>
                        void run(async () => {
                          const selected = s
                            .candidates()
                            .filter((c) => s.selected.has(c.id));
                          unwrap(
                            await s.bridge.production.select({
                              taskId: active.id,
                              selections: selected.map((c) => ({
                                itemId: c.itemId,
                                candidateId: c.id,
                              })),
                              target: "taskOnly",
                              expected: s.data.versions,
                            }),
                          );
                        })
                      }
                    >
                      {t("用于后续步骤", "Use in next steps", "後続に使用")}
                    </Button>
                    <Button
                      tone="primary"
                      disabled={!s.selected.size || busy || !!pendingReceipt}
                      onClick={() =>
                        void run(async () => {
                          const errors: Record<string, string> = {};
                          for (const candidate of s.candidates().filter(candidate => s.selected.has(candidate.id))) {
                            const artifact = candidate.artifacts.find(artifact => artifact.role === 'primary' && artifact.kind !== 'text');
                            if (!artifact) continue;
                            const name = adoptions[candidate.id]?.name ?? candidateName(candidate);
                            if (!validAssetFileName(name)) errors[candidate.id] = t('请填写有效素材名称，避免文件名保留字符，最多 120 字。', 'Enter a valid filename, at most 120 characters.', '有効なファイル名を120文字以内で入力してください。');
                            else if (name.split('.').at(-1)?.toLowerCase() !== artifact.localPath.split('.').at(-1)?.toLowerCase()) errors[candidate.id] = t('请保留素材原扩展名。', 'Keep the original extension.', '元の拡張子を保持してください。');
                          }
                          setNameErrors(errors);
                          if (Object.keys(errors).length) { requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-field="asset-name-${Object.keys(errors)[0]}"] input`)?.focus()); return; }
                          const result = unwrap(
                            await s.bridge.production.select({
                              taskId: active.id,
                              selections: s
                                .candidates()
                                .filter((c) => s.selected.has(c.id))
                                .map((c) => ({
                                  itemId: c.itemId,
                                  candidateId: c.id,
                                })),
                              target: "project",
                              expected: s.data.versions,
                              adoptions: Object.fromEntries(s.candidates().map(candidate => [candidate.id, { ...adoptions[candidate.id], mode: adoptions[candidate.id]?.mode ?? 'library', name: adoptions[candidate.id]?.name ?? candidateName(candidate) }])),
                            }),
                          );
                          if ("planId" in result) await adoptionDialog(result);
                        })
                      }
                    >
                      <Check size={15} />
                      {t("审阅采用", "Review adoption", "採用を確認")}
                    </Button>
                  </div>
                </div>
                {!s.candidates().length ? (
                  <Empty
                    title={t(
                      "结果将在这里出现",
                      "Results will appear here",
                      "結果はここに表示されます",
                    )}
                    detail={t(
                      "你可以继续写作。任务状态更新不会移动当前焦点。",
                      "Keep writing while this task runs. Status updates preserve your focus.",
                      "制作中も執筆を続けられます。状態の更新でフォーカスは移動しません。",
                    )}
                  />
                ) : (
                  <div className="candidate-page">
                  <Pagination total={candidates.length} page={currentCandidatePage} pageSize={12} onPageChange={setCandidatePage} locale={locale} label={t('候选分页','Candidate pages','候補のページ')}/>
                  <div className="candidate-grid">
                    {pageCandidates.map((c) => (
                      <article
                        className={`candidate-card ${s.selected.has(c.id) ? "selected" : ""}`}
                        key={c.id}
                        data-candidate-id={c.id}
                      >
                        <button
                          className="candidate-select"
                          disabled={busy || active.items.find(item => item.id === c.itemId)?.creationMode === 'discuss'}
                          title={active.items.find(item => item.id === c.itemId)?.creationMode === 'discuss' ? t('讨论稿用于继续创作，请生成剧情后采用。', 'Continue from this discussion and generate a script before adopting.', 'この相談内容からシナリオを生成してから採用してください。') : undefined}
                          aria-pressed={s.selected.has(c.id)}
                          onClick={() => void run(() => selectCandidate(c))}
                        >
                          <span>
                            {c.provenance.connectionName} · {c.provenance.model}
                          </span>
                          <Badge>
                            {status(
                              s.data.candidates.find(
                                (v) => v.candidate.id === c.id,
                              )!.adoption,
                            )}
                          </Badge>
                        </button>
                        {documentActive && tab === 'tasks' && !activeReview && content[c.id]?.media.map((m, index) => <CandidateMediaPreview key={m.uri} candidate={c} index={index} media={content[c.id]!.media} services={services} locale={locale} editAnimation={async animation => { unwrap(await s.bridge.production.editCandidate({ id: c.id, text: JSON.stringify(animation) })); await s.refresh(); }} label={t("生成候选", "Generated candidate", "生成候補")}/>)}
                        {c.artifacts.some(
                          (a) => a.kind !== "text" && a.role === "primary",
                        ) && (
                          <><Field label={t('素材名称', 'Asset filename', '素材ファイル名')} name={`asset-name-${c.id}`} error={nameErrors[c.id]} required help={t('保留扩展名；同名素材自动增加序号。', 'Keep the extension; duplicates receive a sequence number.', '拡張子を保持。同名は連番になります。')}>
                            <Input value={adoptions[c.id]?.name ?? candidateName(c)} onChange={event => setAdoptions(previous => ({ ...previous, [c.id]: { ...previous[c.id], mode: previous[c.id]?.mode ?? 'library', frame: previous[c.id]?.frame ?? { fit: 'cover', positionX: .5, positionY: .5 }, name: event.target.value } }))} />
                          </Field><Field
                            label={t(
                              "采用位置",
                              "Adoption destination",
                              "採用先",
                            )}
                          >
                            <Choice
                              label="Adoption destination"
                              value={adoptions[c.id]?.mode ?? "library"}
                              options={[
                                {
                                  value: "library",
                                  label: t(
                                    "仅入素材库",
                                    "Add to asset library",
                                    "素材ライブラリに追加",
                                  ),
                                },
                                ...(active.items.find(item => item.id === c.itemId)?.target.usage === 'voice' ? [{ value: 'voicePreset', label: t('设为角色参考音色', 'Set as character reference voice', 'キャラクターの参照音声に設定') }] : []),
                                ...(active.items.find((i) => i.id === c.itemId)
                                  ?.target.sceneId
                                  ? [
                                      {
                                        value: "bind",
                                        label: t(
                                          "绑定到来源场景",
                                          "Bind to source scene",
                                          "元のシーンに適用",
                                        ),
                                      },
                                    ]
                                  : []),
                              ]}
                              onChange={(mode) =>
                                setAdoptions({
                                  ...adoptions,
                                  [c.id]: {
                                    ...adoptions[c.id],
                                    mode: mode as "bind" | "library" | "voicePreset",
                                    ...(mode === 'voicePreset' ? { voicePreset: adoptions[c.id]?.voicePreset ?? { characterId: active.items.find(item => item.id === c.itemId)?.target.characterId ?? s.data.characters[0]?.id ?? '', locale: String((c.input as any)?.fields?.language ?? (c.input as any)?.language ?? 'ja'), referenceLocale: String((c.input as any)?.fields?.language ?? (c.input as any)?.language ?? 'ja'), transcript: String((c.input as any)?.fields?.text ?? (c.input as any)?.text ?? ''), connectionId: active.items.find(item => item.id === c.itemId)?.configSnapshot?.id ?? '', model: c.provenance.model ?? '' } } : {}),
                                    ...(['figure', 'difference', 'cg'].includes(active.items.find(item => item.id === c.itemId)?.target.usage ?? '')
                                      ? { placement: adoptions[c.id]?.placement ?? 'new' as const } : {}),
                                    frame: adoptions[c.id]?.frame ?? {
                                      fit: "cover",
                                      positionX: 0.5,
                                      positionY: 0.5,
                                    },
                                  },
                                })
                              }
                            />
                          </Field>
                          {adoptions[c.id]?.mode === 'voicePreset' && adoptions[c.id]?.voicePreset && <VoicePresetAdoption value={adoptions[c.id]!.voicePreset!} change={voicePreset => setAdoptions(previous => ({ ...previous, [c.id]: { ...previous[c.id]!, voicePreset } }))} characters={s.data.characters} connections={s.data.connections} locale={locale}/>}
                          {adoptions[c.id]?.mode === 'bind' && ['figure', 'difference', 'cg'].includes(active.items.find(item => item.id === c.itemId)?.target.usage ?? '') &&
                            <CandidatePlacement value={adoptions[c.id]} characterId={active.items.find(item => item.id === c.itemId)?.target.characterId ?? null}
                              canReplace={s.data.scenes.some(scene => scene.id === active.items.find(item => item.id === c.itemId)?.target.sceneId &&
                                scene.statements.some(statement => statement.id === active.items.find(item => item.id === c.itemId)?.target.statementId &&
                                  ['changeFigure', 'changeIllustration', 'changeIllustrationDiff'].includes(statement.command)))} locale={locale}
                              onChange={value => setAdoptions(previous => ({ ...previous, [c.id]: { ...previous[c.id], ...value, frame: previous[c.id]?.frame ?? { fit: 'cover', positionX: .5, positionY: .5 } } }))} />}
                          </>
                        )}

                        {active.items.find((i) => i.id === c.itemId)?.target
                          .usage === "background" &&
                          content[c.id]?.media[0] && (
                            <>
                              <div
                                className="background-crop"
                                style={{
                                  aspectRatio: `${s.data.canvas.width}/${s.data.canvas.height}`,
                                }}
                              >
                                <img
                                  src={content[c.id].media[0].uri}
                                  alt={t(
                                    "作品取景",
                                    "Project framing",
                                    "作品の表示範囲",
                                  )}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    maxHeight: "none",
                                    objectFit:
                                      adoptions[c.id]?.frame.fit === "native"
                                        ? "none"
                                        : ((adoptions[c.id]?.frame.fit ??
                                            "cover") as "cover" | "contain"),
                                    objectPosition: `${(adoptions[c.id]?.frame.positionX ?? 0.5) * 100}% ${(adoptions[c.id]?.frame.positionY ?? 0.5) * 100}%`,
                                  }}
                                />
                              </div>
                              <Choice
                                label="Background fit"
                                value={
                                  (adoptions[c.id]?.frame.fit ?? "cover") as
                                    | "cover"
                                    | "contain"
                                }
                                options={["cover", "contain", "native"].map(
                                  (value, i) => ({
                                    value,
                                    label: [
                                      t("覆盖", "Cover", "カバー"),
                                      t("完整显示", "Contain", "全体表示"),
                                      t("原始尺寸", "Native size", "原寸"),
                                    ][i],
                                  }),
                                )}
                                onChange={(fit) =>
                                  setAdoptions({
                                    ...adoptions,
                                    [c.id]: {
                                      ...adoptions[c.id],
                                      mode: adoptions[c.id]?.mode ?? "library",
                                      frame: {
                                        ...(adoptions[c.id]?.frame ?? {
                                          positionX: 0.5,
                                          positionY: 0.5,
                                        }),
                                        fit: fit as
                                          | "cover"
                                          | "contain"
                                          | "native",
                                      },
                                    },
                                  })
                                }
                              />
                              {(["positionX", "positionY"] as const).map(
                                (key, i) => (
                                  <Field
                                    key={key}
                                    label={
                                      i
                                        ? t(
                                            "垂直位置",
                                            "Vertical position",
                                            "縦位置",
                                          )
                                        : t(
                                            "水平位置",
                                            "Horizontal position",
                                            "横位置",
                                          )
                                    }
                                  >
                                    <input
                                      type="range"
                                      min="0"
                                      max="1"
                                      step="0.01"
                                      value={adoptions[c.id]?.frame[key] ?? 0.5}
                                      onChange={(e) =>
                                        setAdoptions({
                                          ...adoptions,
                                          [c.id]: {
                                            ...adoptions[c.id],
                                            mode:
                                              adoptions[c.id]?.mode ??
                                              "library",
                                            frame: {
                                              ...(adoptions[c.id]?.frame ?? {
                                                fit: "cover",
                                                positionX: 0.5,
                                                positionY: 0.5,
                                              }),
                                              [key]: Number(e.target.value),
                                            },
                                          },
                                        })
                                      }
                                    />
                                  </Field>
                                ),
                              )}
                            </>
                          )}
                        {content[c.id]?.text && (
                          <CodeEditor
                            locale={locale}
                            language={(c.recipeSnapshot?.purpose ?? c.operation) === 'script' ? languageId : c.recipeSnapshot ? 'json' : 'plaintext'}
                            label={t(
                              "候选源码",
                              "Candidate source",
                              "候補ソース",
                            )}
                            value={
                              s.candidateText.get(c.id) ?? content[c.id].text
                            }
                            onChange={(text) => {
                              s.candidateText.set(c.id, text);
                              s.changed();
                            }}
                          />
                        )}
                        {!content[c.id] && (
                          <Button
                            onClick={() =>
                              void run(async () => {
                                setContent((old) => old);
                                const data = unwrap(
                                  await s.bridge.production.candidateContent(
                                    c.id,
                                  ),
                                );
                                setContent((old) => ({ ...old, [c.id]: data }));
                              })
                            }
                          >
                            {t("打开候选", "Open candidate", "候補を開く")}
                          </Button>
                        )}
                        <Disclosure><span>{t("来源与用量", "Source and usage", "出典と使用量")}</span><CandidateUsage candidate={c} locale={locale}/></Disclosure>
                        <div className="candidate-meta">
                          <small>
                            {c.partial
                              ? t("部分输出", "Partial output", "部分出力")
                              : t(
                                  "完整输出",
                                  "Complete output",
                                  "完全な出力",
                                )}{" "}
                            · {c.artifacts.length}{" "}
                            {t("项产物", "artifacts", "生成物")}
                          </small>
                          {c.checks.map((i) => (
                            <IssueNotice key={i.code} issue={i} locale={locale}/>
                          ))}
                        </div>
                        <div className="gc-actions">
                          {(c.recipeSnapshot?.purpose ?? c.operation) === 'script' && <Button disabled={c.partial || c.checks.some(issue => issue.severity === 'error')} onClick={() => { setPreviewCandidate(c.id); setModal('script-preview'); }}><Play size={14}/>{t('试玩候选', 'Play candidate', '候補を試す')}</Button>}
                          {content[c.id]?.text && <Button
                            disabled={!s.candidateText.has(c.id)}
                            onClick={() =>
                              void run(async () => {
                                if(active.items.find(item=>item.id===c.itemId)?.textPreparationSnapshot){
                                  unwrap(await s.bridge.production.reprocess({taskId:active.id,itemId:c.itemId,candidateId:c.id,text:s.candidateText.get(c.id)!}));return;
                                }
                                unwrap(
                                  await s.bridge.production.editCandidate({
                                    id: c.id,
                                    text: s.candidateText.get(c.id)!,
                                  }),
                                );
                              })
                            }
                          >
                            {active.items.find(item=>item.id===c.itemId)?.textPreparationSnapshot?t('修正并重新处理','Correct and reprocess','修正して再処理'):t(
                              "保留为新候选",
                              "Save as new candidate",
                              "新しい候補を保存",
                            )}
                          </Button>}
                          {(c.recipeSnapshot?.purpose ?? c.operation) === "uiPlan" && (
                            <Button
                              onClick={() =>
                                void run(async () => {
                                  if (uiProposal) { setActiveReview('ui-plan'); return; }
                                  const text =
                                    s.candidateText.get(c.id) ??
                                    content[c.id]?.text ??
                                    unwrap(
                                      await s.bridge.production.candidateContent(
                                        c.id,
                                      ),
                                    ).text;
                                  const proposal = JSON.parse(text);
                                  if (
                                    typeof proposal.summary !== "string" ||
                                    !Array.isArray(proposal.steps) ||
                                    proposal.steps.some(
                                      (step: any) =>
                                        !step ||
                                        typeof step.key !== "string" ||
                                        !["patch", "svg", "raster"].includes(
                                          step.kind,
                                        ) ||
                                        typeof step.instruction !== "string" ||
                                        !step.fields ||
                                        !Array.isArray(step.dependsOn) ||
                                        !Array.isArray(step.reuseAssets) ||
                                        !Array.isArray(step.assetKeys),
                                    )
                                  )
                                    throw new Error(
                                      t(
                                        "页面计划格式不完整，请编辑候选源码后重试",
                                        "Incomplete UI plan. Edit the candidate source and try again.",
                                        "ページ計画が不完全です。候補ソースを編集してください。",
                                      ),
                                    );
                                  const sourceTask = s.data.tasks.find(task => task.id === c.taskId);
                                  const sourceDraft = s.data.drafts.find(item => item.id === sourceTask?.sourceDraftId || item.submittedTaskId === c.taskId) ?? (draft?.submittedTaskId === c.taskId ? draft : null);
                                  if (!sourceDraft?.variants.ui?.target.uiScope) throw new Error(t('请先打开此候选的 UI 制作草稿。', 'Open the UI production draft for this candidate first.', 'この候補の UI 制作下書きを先に開いてください。'));
                                  setUiSource(structuredClone({ candidateId: c.id, expected: s.data.versions, scope: sourceDraft.variants.ui.target.uiScope, draft: sourceDraft }));
                                  setUiBaseline(JSON.stringify(proposal)); setUiPlan(null);
                                  setUiProposal(proposal);
                                  s.selected = new Set([c.id]);
                                  setActiveReview("ui-plan");
                                })
                              }
                            >
                              {t(
                                "审阅 UI 计划",
                                "Review UI plan",
                                "UI 計画を確認",
                              )}
                            </Button>
                          )}
                          {(c.recipeSnapshot?.purpose ?? c.operation) === "uiPatch" && (
                            <Button
                              onClick={() =>
                                void run(async () => {
                                  const proposal = JSON.parse(
                                    s.candidateText.get(c.id) ??
                                      content[c.id]?.text ??
                                      "",
                                  );
                                  const result = unwrap(
                                    await s.bridge.production.saveComposition({
                                      candidateId: c.id,
                                      planId: c.taskId,
                                      proposal,
                                      resources: [],
                                    }),
                                  );
                                  setComposition(result);
                                  setChanges(
                                    [
                                      ...result.proposal.config,
                                      ...result.proposal.styles,
                                      ...result.proposal.assets,
                                    ].map((v) => v.key),
                                  );
                                  setModal("composition");
                                })
                              }
                            >
                              {t(
                                "审阅组合",
                                "Review composition",
                                "組み合わせを確認",
                              )}
                            </Button>
                          )}
                          {(active.items.find(item=>item.id===c.itemId)?.textPreparationSnapshot?.transferOperation ?? active.items.find(item=>item.id===c.itemId)?.operationSnapshot?.definition.textTransfer?.operation) && <Button disabled={busy||c.partial||c.checks.some(issue=>issue.severity==='error')} onClick={()=>void run(async()=>{
                            const sourceItem=active.items.find(item=>item.id===c.itemId)!;
                            const targetId=sourceItem.textPreparationSnapshot?.transferOperation ?? sourceItem.operationSnapshot!.definition.textTransfer!.operation;
                            const target=s.data.operations?.find(operation=>operation.id===targetId);if(!target)throw new Error(t('下一阶段的精确操作包缺失，请先补齐该能力。','The exact operation for the next stage is missing. Supply it first.','次の段階の正確な操作パッケージを用意してください。'));
                            await s.openOperation(target);s.draft=unwrap(await s.bridge.production.transferPrompt({candidateId:c.id,draftId:s.draft!.id,usage:s.draft!.activeUse,expectedDraftRevision:s.draft!.revision,acceptedFields:[],omittedPorts:[]}));s.quickIntent=null;s.taskId=null;setModal('');s.changed();
                          })}>{t('转入下一制作阶段','Use in the next production stage','次の制作段階に反映')}</Button>}
                          {[
                            "imagePrompt",
                            "novelaiPrompt",
                            "differencePrompt",
                            "speechText",
                            "musicPrompt",
                          ].includes((c.recipeSnapshot?.purpose ?? c.operation) ?? "") && (
                            <Button
                              disabled={!draft}
                              onClick={() =>
                                void run(async () => {
                                  const text = JSON.parse(
                                    s.candidateText.get(c.id) ??
                                      content[c.id]?.text ??
                                      "",
                                  );
                                  if (s.draft?.submittedTaskId) {
                                    s.draft = {
                                      ...structuredClone(s.draft),
                                      id: createId(s.data),
                                      revision: 0,
                                      submittedTaskId: null,
                                    };
                                    s.draft.variants[
                                      s.draft.activeUse
                                    ]!.recipe = null;
                                    s.draft.variants[s.draft.activeUse]!.promptPreparation = null;
                                  }
                                  await s.saveDraft(true);
                                  s.draft = unwrap(
                                    await s.bridge.production.transferPrompt({
                                      candidateId: c.id,
                                      draftId: s.draft!.id,
                                      usage: s.draft!.activeUse,
                                      expectedDraftRevision: s.draft!.revision,
                                      acceptedFields: Object.keys(text).filter(
                                        (k) =>
                                          ![
                                            "kind",
                                            "format",
                                            "pronunciationNotes",
                                          ].includes(k),
                                      ),
                                      omittedPorts: [],
                                    }),
                                  );
                                  s.quickIntent = null;
                                  s.setOperation(text.kind === 'novelaiPrompt' ? 'novelaiPrompt' : s.draft!.activeUse === 'voice' ? 'speech' : s.draft!.activeUse === 'bgm' ? 'music' : s.draft!.activeUse === 'difference' ? 'difference' : 'image');
                                  s.taskId = null; setModal("");
                                })
                              }
                            >
                              {t(
                                "采用到制作表单",
                                "Use in production form",
                                "制作フォームに反映",
                              )}
                            </Button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  </div>
                )}
                <div data-production-sources><Disclosure open={stepsOpen} onOpenChange={setStepsOpen}><span>{t("执行步骤与来源", "Execution steps and sources", "実行ステップと出典")}</span>
                <div className="production-steps">
                  {active.items.map((item, index) => (
                    <article key={item.id} className="production-step">
                      <span className="step-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>
                          {uses.find(use => use[0] === item.target.usage) ? t(...uses.find(use => use[0] === item.target.usage)!.slice(1) as [string, string, string]) : item.target.usage} ·{" "}
                          {item.configSnapshot?.name ??
                            t("本地组合", "Local composition", "ローカル結合")}
                        </strong>
                        <p>
                          {status(item.state)}
                        </p>
                        <TaskItemFeedback item={item} taskId={active.id} bridge={s.bridge.production} locale={locale}/>
                        {item.sourceVersions.some((v) =>
                          s.data.versions.some(
                            (n) =>
                              n.ref.id === v.ref.id &&
                              n.revision !== v.revision,
                          ),
                        ) && (
                          <div>
                            <Badge tone="warm">
                              {t(
                                "来源已变化",
                                "Source changed",
                                "出典が変更されました",
                              )}
                            </Badge>
                            <Button
                              onClick={() =>
                                void run(async () => {
                                  unwrap(
                                    await s.bridge.production.keepResults({
                                      taskId: active.id,
                                      itemId: item.id,
                                      versions: s.data.versions,
                                    }),
                                  );
                                })
                              }
                            >
                              {t(
                                "已比较，保留现有结果",
                                "Compared: keep these results",
                                "比較済み・現在の結果を保持",
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                      <Badge tone={item.state === "failed" ? "error" : ""}>
                        {status(item.state)}
                      </Badge>
                      {item.dependencies.length>0&&['blocked','queued'].includes(item.state)&&!item.stageAuthorized&&active.stagePolicy!=='external'&&<Button disabled={busy||item.needsReview} onClick={()=>void run(async()=>{unwrap(await s.bridge.production.authorizeStage({taskId:active.id,itemId:item.id}));})}>{t('确认并开始此阶段','Confirm and start this stage','確認してこの段階を開始')} ({active.items.filter(value=>(value.id===item.id||!!item.stageId&&value.stageId===item.stageId)&&['blocked','queued'].includes(value.state)&&!value.attempts.length).length})</Button>}
                      {["failed", "interrupted", "cancelled"].includes(
                        item.state,
                      ) && (
                        <Button
                          disabled={busy}
                          onClick={() => {
                            setPlanText(item.id);
                            setModal("retry");
                          }}
                        >
                          {t(
                            "新增请求重试",
                            "Retry with new request",
                            "新しいリクエストで再試行",
                          )}
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
                </Disclosure></div>
                <ConversationPanel key={active.id} session={s} task={active} view={s.continuationView(active.id)} locale={locale}/>
                <footer className="production-footer">
                  <Button onClick={() => navigate(s.origin?.page ?? "editor")}>
                    <ArrowLeft size={14} />
                    {t("返回来源", "Return to source", "元の場所に戻る")}
                  </Button>
                  <Button
                    onClick={() =>
                      void run(async () => {
                        if (savePinned) { setActiveReview('save'); return; }
                        const [plan, documents] = await Promise.all([s.bridge.documents.planSave({ kind: 'all' }), s.bridge.documents.list()]);
                        setSavePlan(unwrap(plan)); setSaveDocuments(unwrap(documents));
                        setModal("save");
                      })
                    }
                  >
                    {t("保存作品…", "Save project…", "作品を保存…")}
                  </Button>
                </footer>
              </>
            )}
          </section>
        </TabsContent>
      <TabsContent keepMounted value="recipes" className="production-library-layout" data-section-active={tab === 'recipes'}>
        {placeExplorer(<aside className="production-library-list" hidden={!documentActive || !!activeReview || tab !== 'recipes'}><h2>{t('方案库', 'Scheme library', '制作方法ライブラリ')}</h2>
          <div className="production-library-filters">
          <Choice label={t('用途分类', 'Use category', '用途の分類')} value={recipeCategory} options={[{ value: 'all', label: t('全部用途', 'All uses', 'すべての用途') }, { value: 'promptRule', label: t('提示规则', 'Prompt rules', 'プロンプトルール') }, ...uses.map(use => ({ value: use[0]!, label: use[locale === 'en' ? 2 : locale === 'ja' ? 3 : 1]! }))]} onChange={setRecipeCategory}/>
          <Choice label={t('方案归属', 'Scheme scope', '所有範囲')} value={recipeScope} options={['all', 'official', 'personal', 'project'].map(scope => ({ value: scope, label: scope === 'all' ? t('全部归属', 'All scopes', 'すべて') : presetSource(scope as CreationRecipe['scope'], locale) }))} onChange={setRecipeScope}/>
          </div><div className="production-library-create gc-actions">
            <Button tone="primary" onClick={() => { const now = new Date().toISOString(); void openRecipeEditor({ schemaVersion: 1, id: createId(s.data), revision: 0, scope: 'personal', projectId: null, name: t('我的创作预设', 'My creation preset', '自分の創作プリセット'), description: '', purposes: ['script'], uses: ['script'], systemPrompt: '按作者要求创作，保留已确认的事实和人物设定。', taskTemplate: '创作资料：\n{{context}}\n本轮要求：\n{{instruction}}', outputGuidance: '', contextDefaults: ['setting','character','script'], parameters: [], examples: [], createdAt: now, updatedAt: now }); setModal(''); }}><Plus size={15}/>{t("新建预设","New preset","プリセットを作成")}</Button>
            <Button
              onClick={() =>
                void run(async () => {
                  if (recipeImport) { setActiveReview('recipe-import'); return; }
                  const paths = unwrap(await s.bridge.files.pickRecipes());
                  if (paths[0]) {
                    setRecipeImport(
                      unwrap(
                        await s.bridge.production.planRecipeImport({
                          filePath: paths[0],
                          destination: "project",
                          projectId: s.projectId,
                        }),
                      ),
                    );
                    setActiveReview("recipe-import");
                  }
                })
              }
            >
              {t(
                "导入预设",
                "Import presets",
                "プリセットを読み込む",
              )}
            </Button>
          </div>
          <Button onClick={() => { const source = s.data.recipes.find(item => item.production && (recipeCategory === 'all' || item.uses.includes(recipeCategory as CreationRecipe['uses'][number]))) ?? s.data.recipes.find(item => item.production); if (source) { const now = new Date().toISOString(); void openRecipeEditor({ ...structuredClone(localizeRecipe(source, locale)), id: createId(s.data), revision: 0, scope: 'personal', projectId: null, name: t('我的制作方案', 'My production scheme', '自分の制作方法'), createdAt: now, updatedAt: now }); } }}><Plus size={14}/>{t('新建制作方案', 'New production scheme', '制作方法を作成')}</Button>
          <ObjectTree label={t('方案库对象', 'Scheme library objects', '制作方法ライブラリの項目')} selected={librarySelection} onSelect={setLibrarySelection} onOpen={id => { const item = s.data.recipes.find(item => item.id === id); if (item) void openRecipeEditor(structuredClone(item)); }} nodes={['scheme', 'parameters', 'promptRule'].map(kind => ({ id: `recipe-group:${kind}`, name: recipeKindLabel(kind), icon: <Layers size={15}/>, detail: String(filteredRecipes.filter(item => recipeKind(item) === kind).length), children: filteredRecipes.filter(item => recipeKind(item) === kind).map(item => { const Icon = presetIcon(item); return { id: item.id, name: item.name, icon: <Icon size={15}/>, detail: presetSource(item.scope, locale) }; }) }))}/>
          {!filteredRecipes.length && <p className="field-help">{t('没有符合筛选条件的方案。', 'No schemes match these filters.', '条件に合う制作方法はありません。')}</p>}
        </aside>)}<section className="production-library-document">
          {recipe && <RecipeEditor inline recipe={recipe} locale={locale} busy={busy}
        persisted={s.data.recipes.some(item => item.id === recipe.id)} savedRecipe={s.data.recipes.find(item => item.id === recipe.id)} projectId={s.projectId} workflows={s.data.workflows} recipes={s.data.recipes} operations={s.data.operations}
        error={formErrors.recipeName} close={() => setRecipe(null)}
        onChange={next => { clearError('recipeName'); setRecipe(next); }}
        use={() => void run(() => useRecipe(recipe))}
        save={useAfter => void run(async () => {
          if (!recipe.name.trim()) { setFormErrors({ recipeName: t('请输入预设名称', 'Enter a preset name', 'プリセット名を入力してください') }); return; }
          const saved = unwrap(await s.bridge.production.saveRecipe({ recipe, expectedRevision: s.data.recipes.some(item => item.id === recipe.id) ? recipe.revision : null }));
          setRecipe(saved); await changed(); await s.refresh();
          studioToasts.add({ title: t('创作预设已保存', 'Creation preset saved', '創作プリセットを保存しました') });
          if (useAfter) await useRecipe(saved);
        })}
        manage={action => {
          if (action === 'delete') { setModal('delete-recipe'); return; }
          void run(async () => {
            if (action === 'personal' || action === 'project') {
              setRecipe(unwrap(await s.bridge.production.copyRecipe({ recipeId: recipe.id, sourceScope: recipe.scope, locale, scope: action, projectId: action === 'project' ? s.projectId : null })));
              studioToasts.add({ title: t('已创建预设副本', 'Preset copy created', 'プリセットをコピーしました') });
            } else if (action === 'export') {
              const directory = unwrap(await s.bridge.projects.chooseDirectory());
              if (directory) { unwrap(await s.bridge.production.exportRecipes({ recipeIds: [recipe.id], destinationPath: `${directory}/recipes.galrecipe.json` })); studioToasts.add({ title: t('预设已导出', 'Preset exported', 'プリセットを書き出しました') }); }
            } else {
              const defaults = s.data.defaults ?? { connections: {}, recipes: {} };
              unwrap(await s.bridge.production.saveDefaults({ ...defaults, recipes: { ...defaults.recipes, [action === 'writing-default' ? 'script' : 'stage']: recipe.id } }));
              studioToasts.add({ title: t('已更新默认预设', 'Default preset updated', '既定のプリセットを更新しました') });
            }
          });
        }}/>}
          {!recipe && <Empty title={t('选择方案或提示规则', 'Choose a scheme or prompt rule', '制作方法またはルールを選択')} detail={t('制作方案决定实际执行能力；提示规则只参与明确的文字步骤。', 'Schemes choose execution capabilities. Prompt rules apply only to explicit text steps.', '制作方法は実行能力を指定。ルールは明示したテキスト処理に使用します。')}/>}</section>
      </TabsContent>
      <TabsContent keepMounted value="connections" data-section-active={tab === 'connections'}><ServiceConnections session={s} locale={locale} search={searches.connections} active={documentActive && !activeReview && tab === 'connections'} explorerContainer={explorerContainer} inspectorContainer={inspectorContainer} workflowActive={!!activeWorkflow} selectedWorkflow={readWorkflow(workflowDocuments.find(item => item.id === activeWorkflow)?.text ?? '')?.id ?? activeWorkflow} showConnection={() => setActiveWorkflow('')} workflowEditor={workflowDocuments.length ? <section className="workflow-documents" hidden={!activeWorkflow}>
        <DocumentTabs documents={workflowDocuments.map(item => ({ ...item, icon: <Layers/> }))} active={activeWorkflow} onSelect={setActiveWorkflow} onPin={() => {}} onReorder={ids => setWorkflowDocuments(items => ids.map(id => items.find(item => item.id === id)!))} onClose={id => setWorkflowDocuments(items => items.map(item => item.id === id ? { ...item, closeRequest: item.closeRequest + 1 } : item))}/>
        {workflowDocuments.map(item => <div key={item.id} hidden={item.id !== activeWorkflow} className="workflow-document-content"><WorkflowDialog inline initialText={item.text} initialImportText={item.importText} initialBaseline={item.baseline} initialPaste={item.paste} operations={s.data.operations} outputConnections={s.data.connections.filter(connection => connection.protocol === 'comfyUI')} discoverOutputs={async (connectionId, workflow, historyTaskId) => { if (!workflow.purpose) throw new Error(t('请先选择用途或操作。', 'Choose a purpose or operation first.', '用途・操作を選択してください。')); return unwrap(await s.bridge.production.discoverWorkflowOutputs({ connectionId, workflow: { ...workflow, purpose: workflow.purpose }, historyTaskId })); }} existingWorkflows={s.data.workflows} availableRevision={item.expectedRevision} onIdentityChange={expectedRevision => setWorkflowDocuments(items => items.map(current => current.id === item.id ? { ...current, expectedRevision, draftRevision: null } : current))} saveDraft={async (workflow, paste) => { const result = unwrap(await s.bridge.production.saveWorkflowDraft({ draft: { schemaVersion: 1, id: workflow.id, revision: item.draftRevision ?? 0, name: workflow.name, workflow, paste, availableRevision: item.expectedRevision, updatedAt: new Date().toISOString() }, expectedRevision: item.draftRevision ?? null })); setWorkflowDocuments(items => items.map(current => current.id === item.id ? { ...current, draftRevision: result.revision } : current)); await s.refresh(); }} locale={locale} closeRequest={item.closeRequest} chooseImport={s.bridge.files.readImport ? async () => unwrap(await s.bridge.files.readImport!({ purpose: 'production', extensions: ['json'] })) : undefined} onState={state => setWorkflowDocuments(items => items.map(current => current.id === item.id ? { ...current, ...state, importText: undefined } : current))} close={() => closeWorkflow(item.id)} save={async workflow => {
          const updated = unwrap(await s.bridge.production.saveWorkflow({ workflow, expectedRevision: item.expectedRevision }));
          setWorkflowDocuments(items => items.map(current => current.id === item.id ? { ...current, expectedRevision: updated.revision } : current)); await s.refresh(); return updated;
        }}/></div>)}
      </section> : undefined} editWorkflow={selectWorkflow} importWorkflow={s.bridge.files.readImport ? async () => { const selected = unwrap(await s.bridge.files.readImport!({ purpose: 'production', extensions: ['json'] })); if (selected) selectWorkflow(undefined, selected.text); } : undefined}/></TabsContent>      {inspectorContainer && createPortal(<aside className="production-section-inspector" hidden={!documentActive || !!activeReview || tab !== 'recipes'}>
        <InspectorSection title={recipe ? localizeRecipe(recipe, locale).name : t('方案库', 'Scheme library', '制作方法ライブラリ')}>
          {recipe ? <><Badge>{recipeKindLabel(recipeKind(recipe))}</Badge><p>{localizeRecipe(recipe, locale).description || t('在中央工作区查看与编辑方案。', 'View and edit this scheme in the document area.', '中央のワークスペースで制作方法を確認・編集できます。')}</p><dl className="production-object-summary"><dt>{t('归属', 'Scope', '所有範囲')}</dt><dd>{presetSource(recipe.scope, locale)}</dd><dt>{t('编辑状态', 'Editing state', '編集状態')}</dt><dd>{recipe.scope === 'official' ? t('官方只读 · 可复制', 'Official · copy to edit', '公式・コピーして編集') : JSON.stringify(recipe) !== JSON.stringify(s.data.recipes.find(item => item.id === recipe.id)) ? t('有未保存修改', 'Unsaved changes', '未保存の変更') : t('已保存', 'Saved', '保存済み')}</dd><dt>{t('适用用途', 'Uses', '用途')}</dt><dd>{recipe.uses.map(use => uses.find(item => item[0] === use)?.[locale === 'en' ? 2 : locale === 'ja' ? 3 : 1] ?? use).join(' · ')}</dd></dl></> : <p>{t('从 Explorer 选择制作方案、参数预设或提示规则。', 'Select a production scheme, parameter preset, or prompt rule in Explorer.', 'Explorer から制作方法、パラメータプリセット、ルールを選択してください。')}</p>}
        </InspectorSection><InspectorSection title={t('使用与保存', 'Using and saving', '使用と保存')}><p>{t('保存更新可复用内容；使用会进入对应制作草稿。检查实际输入后再发送生成请求。', 'Save updates reusable content. Use opens a production draft; review the actual input before sending a request.', '保存は再利用内容を更新し、使用は制作下書きを開きます。生成前に実際の入力を確認してください。')}</p></InspectorSection>
      </aside>, inspectorContainer)}
      {inspectorContainer && createPortal(<aside className="production-section-inspector" hidden={!documentActive || !!activeReview || tab !== 'tasks' || !!draft && !!v && !draft.submittedTaskId && !active && modal !== 'outline'}><InspectorSection title={t('候选来源', 'Candidate sources', '候補の出典')}>
        {!s.selected.size ? <p>{t('选择候选查看服务来源；执行步骤和请求在中央详情中查看。', 'Select a candidate to inspect its service source. Steps and requests are in the central details.', '候補を選択してサービスの出典を確認。ステップとリクエストは中央の詳細にあります。')}</p> : s.candidates().filter(candidate => s.selected.has(candidate.id)).map(candidate => <dl className="production-object-summary" key={candidate.id}>
          <dt>{t('候选', 'Candidate', '候補')}</dt><dd>{candidate.artifacts.some(artifact => artifact.kind !== 'text' && artifact.role === 'primary') ? adoptions[candidate.id]?.name ?? candidateName(candidate) : t('文本候选', 'Text candidate', 'テキスト候補')}</dd>
          <dt>{t('服务', 'Service', 'サービス')}</dt><dd>{candidate.provenance.connectionName}</dd>
          <dt>{t('模型', 'Model', 'モデル')}</dt><dd>{candidate.provenance.model || t('服务未提供', 'Not reported', '未提供')}</dd>
          <dt>{t('生成时间', 'Generated', '生成日時')}</dt><dd>{new Date(candidate.createdAt).toLocaleString(locale)}</dd>
        </dl>)}
      </InspectorSection></aside>, inspectorContainer)}
      {removeTask && <MessageBox title={t('移除任务记录','Remove task record','タスク記録を削除')} description={`${removeTask.name} · ${t('保留已采用内容和来源文件。移除的任务记录无法撤销。','Adopted content and source files remain. Removing the record cannot be undone.','採用済み内容と元ファイルを保持。削除した記録は元に戻せません。')}`} cancelLabel={t('取消','Cancel','キャンセル')} onClose={()=>setRemoveTask(null)} actions={[{label:t('移除记录','Remove record','記録を削除'),tone:'danger',run:async()=>{unwrap(await s.bridge.production.removeTaskRecord(removeTask.id));if(s.taskId===removeTask.id)s.taskId=null;await s.refresh();}}]}/>}
      {removeDraft && <MessageBox title={t('删除制作草稿？', 'Delete production draft?', '制作下書きを削除しますか？')} description={t(`删除“${removeDraft.name}”及其未提交输入。已生成任务与候选保持，删除的草稿无法撤销。`, `Delete “${removeDraft.name}” and its unsubmitted input. Tasks and candidates remain. Draft deletion cannot be undone.`, `「${removeDraft.name}」と未送信の入力を削除します。タスクと候補は保持されます。元に戻せません。`)} cancelLabel={t('取消', 'Cancel', 'キャンセル')} onClose={() => setRemoveDraft(null)} actions={[{ label: t('删除草稿', 'Delete draft', '下書きを削除'), tone: 'danger', run: async () => { await s.discardDraft(removeDraft.id); await s.refresh(); } }]}/>}
      {modal === 'script-preview' && previewCandidate && <ScriptCandidatePreview session={s} candidateId={previewCandidate} services={services} locale={locale} close={() => setModal('')}/>}
      {adoption && (<section className="production-review-document" hidden={activeReview !== 'adopt'}>{reviewHeading('adopt')}
          <p>
            {t(
              "采用更新工作内容，保存后写入作品。",
              "Adoption updates working content. Save writes it to the project.",
              "採用で作業内容を更新し、保存で作品に書き込みます。",
            )}
          </p>
          {adoptionGroups.length > 0 && <SaveChangeList files={[]} groups={adoptionGroups} locale={locale} context="adopt"/>}
          {adoptionGroups.length > 0 && <p className="adoption-destination">{t('采用位置：', 'Destination: ', '採用先：')}{adoptionGroups.every(group => group.paths.length > 0 && group.paths.every(path => path === 'assets/index.json')) ? t('仅入素材库', 'Asset library only', '素材ライブラリのみ') : adoptionGroups.map(group => group.name).join('、')}</p>}
          <div className="receipt-summary">
            {adoption.preview.map((entry, index) => (
              <article key={index}>
                <Check size={16} />
                <div>
                  <strong>{entry.description}</strong>
                </div>
              </article>
            ))}
          </div>
          <Disclosure>
            <span>
              {t("技术详情 · 查看完整变更", "Technical details · Full changes", "技術詳細・すべての変更")}
            </span>
            <CodeBlock code={adoptionJson} locale={locale} />
          </Disclosure>
          <div className="gc-actions">
            <Button
              onClick={() => {
                void run(() => closeReview('adopt'));
              }}
            >
              {t("取消", "Cancel", "キャンセル")}
            </Button>
            <Button
              tone="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const receipt = unwrap(
                    await s.bridge.production.apply({
                      planId: adoption!.planId,
                      expected: adoption!.input.expected,
                    }),
                  );
                  finishReview("adopt");
                  studioToasts.add({ title: t('已采用到工作内容 · 尚未保存', 'Adopted into working content · unsaved', '作業内容に採用済み・未保存') });
                  await refreshAdoption(receipt);
                }, false)
              }
            >
              {t(
                "采用到工作内容",
                "Adopt into working content",
                "作業内容に採用",
              )}
            </Button>
          </div>
        </section>
      )}
      {savePlan && (modal === 'save' || savePinned) && (() => {
        const body = <><p>{t(`本次保存包含 ${saveChangeCount} 项修改。`, `This save includes ${saveChangeCount} changes.`, `今回の保存には ${saveChangeCount} 件の変更が含まれます。`)}</p>
          {s.error && <p role="alert" className="workbench-error">{s.error}</p>}
          <SaveChangeList files={savePlan.files} locale={locale} documents={saveDocuments} groups={saveGroups}/>
          <footer className="dialog-actions">
            <Button disabled={busy} onClick={() => { setModal(''); finishReview('save'); }}>{t('取消', 'Cancel', 'キャンセル')}</Button>
            {!savePinned && <Button disabled={busy} onClick={() => { setSavePinned(true); setActiveReview('save'); setModal(''); }}>{t('固定到工作区', 'Pin to workspace', 'ワークスペースに固定')}</Button>}
            <Button tone="primary" disabled={busy} onClick={() => void run(async () => { unwrap(await s.bridge.documents.save(savePlan.planId)); await changed(); setModal(''); finishReview('save'); })}>{t('确认保存', 'Confirm save', '保存を確認')}</Button>
          </footer></>;
        return savePinned ? <section className="production-review-document" hidden={activeReview !== 'save'}>{reviewHeading('save')}{body}</section> : <Modal title={t('保存关联内容', 'Save related content', '関連内容を保存')} close={() => { if (!busy) setModal(''); }}>{body}</Modal>;
      })()}
      {modal === 'cancel' && active && <MessageBox title={t('取消任务', 'Cancel task', 'タスクをキャンセル')} description={t('保留已完成候选。远端是否停止以服务回执为准。', 'Completed candidates remain. Remote cancellation follows the service receipt.', '完成済みの候補を保持。リモート停止はサービスの結果に従います。')} cancelLabel={t('返回', 'Back', '戻る')} onClose={() => setModal('')} actions={[{ label: t('确认取消', 'Confirm cancellation', 'キャンセルを確認'), tone: 'danger', run: async () => { const result = unwrap(await s.bridge.production.cancel(active.id)); s.error = `${t('取消回执', 'Cancellation receipt', 'キャンセル結果')}: ${result.local} / ${result.remote}`; await s.refresh(); } }]}/>}
      {modal === 'retry' && active && <Modal title={t('准备新增请求','Prepare a new request','新規リクエストを準備')} close={()=>{setModal('');setRetryPlan(null);}}><p>{t('原任务和候选保持可查询。按当前配置准备关联新计划，确认后发送。','The original task remains available. Review a linked plan using current configuration before sending.','元のタスクを保持します。現在の設定で新しい計画を確認して送信します。')}</p>{retryPlan&&<><p>{retryPlan.task.name}</p><ul>{retryPlan.sendSummary.map(row=><li key={row.itemId}>{row.destination} · {row.model} · {row.requests} {t('次请求','requests','回の要求')} · {row.textCharacters} {t('字','characters','文字')}</li>)}</ul><Disclosure><summary>{t('检查冻结输入','Inspect frozen input','固定入力を確認')}</summary><pre>{JSON.stringify(retryPlan.task.items.map(item=>({input:item.input,workflow:item.workflowSnapshot,operation:item.operationSnapshot})),null,2)}</pre></Disclosure></>}<footer className="dialog-actions"><Button disabled={busy} onClick={()=>{setModal('');setRetryPlan(null);}}>{t('取消','Cancel','キャンセル')}</Button><Button tone="primary" disabled={busy} onClick={()=>void run(async()=>{if(!retryPlan){setRetryPlan(unwrap(await s.bridge.production.retry({taskId:active.id,itemId:planText,confirmNewRequest:true})));}else{const task=unwrap(await s.bridge.production.submit(retryPlan.planId));s.taskId=task.id;setRetryPlan(null);setModal('');}})}>{retryPlan?t('确认发送新计划','Send new plan','新しい計画を送信'):t('准备计划','Prepare plan','計画を準備')}</Button></footer></Modal>}

      {discardReview && <MessageBox title={t('放弃 UI 计划的修改？', 'Discard UI plan changes?', 'UI 計画の変更を破棄しますか？')} description={t('保留原始候选；未应用的计划输入会被丢弃。', 'The original candidate remains; unapplied plan input will be discarded.', '元の候補を保持し、未適用の計画入力を破棄します。')} cancelLabel={t('继续编辑', 'Keep editing', '編集を続ける')} onClose={() => setDiscardReview(false)} actions={[{ label: t('放弃并关闭', 'Discard and close', '破棄して閉じる'), tone: 'danger', run: () => finishReview('ui-plan') }]}/>}
      {modal === 'delete-recipe' && recipe && <MessageBox title={t('删除创作预设', 'Delete creation preset', '制作プリセットを削除')} description={t(`删除“${recipe.name}”及未提交编辑，清除关联默认用途；草稿需要重新选择预设。历史任务保留冻结内容。`, `Delete “${recipe.name}” and its unsaved edits and clear its defaults. Drafts need another preset. Historical tasks retain their snapshots.`, `「${recipe.name}」と未保存の編集・既定用途を削除します。下書きで別のプリセットを選択してください。過去のタスクは当時の版を保持します。`)} cancelLabel={t('取消','Cancel','キャンセル')} onClose={() => setModal('')} actions={[{ label: t('删除预设','Delete preset','プリセットを削除'), tone: 'danger', run: async () => { unwrap(await s.bridge.production.deleteRecipe({ recipeId: recipe.id, scope: recipe.scope, expectedRevision: recipe.revision, confirmed: true })); setRecipe(null); setRecipeBaseline(''); await s.refresh(); await changed(); } }]}/>}
      {recipeImport && (<section className="production-review-document" hidden={activeReview !== 'recipe-import'}>{reviewHeading('recipe-import')}
          <ul>
            {recipeImport.recipes.map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
          <p>
            {t(
              "导入到作品工作内容，保存后写入磁盘。",
              "Import into working content, then save to disk.",
              "作業内容に読み込み、保存でディスクに書き込みます。",
            )}
          </p>
          <Button
            tone="primary" disabled={busy}
            onClick={() =>
              void run(async () => {
                unwrap(
                  await s.bridge.production.applyRecipeImport(
                    recipeImport.planId,
                  ),
                );
                await changed();
                finishReview("recipe-import");
              })
            }
          >
            {t("确认导入", "Confirm import", "読み込みを確認")}
          </Button>
        </section>
      )}
      {uiProposal && (<section className="production-review-document" hidden={activeReview !== 'ui-plan'}>{reviewHeading('ui-plan')}
          <UIPlanEditor
            value={uiProposal}
            connectionId={uiSource?.draft.variants.ui?.connectionId}
            onChange={(value) => {
              setUiProposal(value);
              setUiPlan(null);
            }}
            session={s}
            locale={locale}
          />
          <footer className="gc-actions production-review-actions">
          <p>
            {t(
              "每步确认连接、方案与请求参数。费用未知。",
              "Confirm each connection, recipe and request. Cost is unknown.",
              "接続・レシピ・各リクエストを確認します。料金は不明です。",
            )}
          </p>
          <Button
            disabled={busy || !uiSource}
            onClick={() =>
              void run(async () => {
                setUiPlan(
                  unwrap(
                    await s.bridge.production.prepareUIPlan({
                      candidateId: uiSource!.candidateId,
                      proposal: uiProposal,
                      expected: uiSource!.expected,
                      scope: uiSource!.scope,
                      selectedAssets: [
                        ...new Set(
                          uiProposal.steps.flatMap((step) => step.reuseAssets),
                        ),
                      ],
                      draft: uiSource!.draft,
                    }),
                  ),
                );
              })
            }
          >
            {t("准备计划", "Prepare plan", "計画を準備")}
          </Button>
          {uiPlan && (
            <Button
              tone="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const task = unwrap(
                    await s.bridge.production.confirmUIPlan({
                      planId: uiPlan.id,
                      revision: uiPlan.revision,
                    }),
                  );
                  s.taskId = task.id;
                  finishReview("ui-plan");
                })
              }
            >
              {t(
                "确认计划并生成",
                "Confirm plan & generate",
                "計画を確認して生成",
              )}
            </Button>
          )}
          </footer>
        </section>
      )}
      {modal === "composition" && composition && (
        <Modal
          wide
          title={t("组合采用", "Adopt composition", "組み合わせを採用")}
          close={() => setModal("")}
        >
          <CompositionReview
            composition={composition}
            session={s}
            locale={locale}
            services={services}
            adopt={adoptionDialog}
          />
        </Modal>
      )}
    </Tabs>
  );
}
