import { ProjectSettingsEditor } from './ProjectSettingsEditor.js';
import { Collaboration } from '../pages/Collaboration/Collaboration.js';
import { domButton } from '../components/dom-button.js';
import { AuthoringToolbar } from './AuthoringToolbar.js';
import { issueText } from '../components/issue-text.js';
import { IssueNotice } from '../components/issue-notice.js';
import { showContentPopover } from '../components/workbench/content-popover.js';
import type { DocumentWorkspace } from '../components/workbench/document-workspace.js';
import { createId, DefaultStudioPreferences, NativeAnimationSchema, StageWeatherPresets } from '@galcraft/contracts';
import { readTemplateDocuments } from '@galcraft/templates';
import { dialoguePortraitField } from './dialogue-portrait-field.js';
import { dialogueTextField } from './dialogue-text-field.js';
import { InlineWaitFields, waitEventValues, type WaitInput } from './inline-wait-fields.js';
import { DialogueContentSchema, DialogueEventSchema, dialogueAnchorOffsets, dialoguePlainText, replaceDialogueText } from '@galcraft/contracts';
import type { DialogueEvent } from '@galcraft/contracts';
import { createAssetInspector, disposeAssetInspector } from './asset-inspector.js';
import { assetReferenceSourceKey } from './asset-inspector-references.js';
import { createAssetDetails } from './asset-details.js';
import { showObjectMenu, isObjectMenuKey, objectMenuSelection } from '../components/workbench/ObjectMenu.js';
import { assetPagination } from './asset-pagination.js';
import { AssetImportSummary } from './asset-import-result.js';
import { failedAssetPaths, mergeAssetImportResult, type AssetImportResult } from './asset-import-model.js';
import { mountSelectedAssetsSheet } from './selected-assets-sheet.js';
import { createPlayerNameEditor } from './player-name.js';
import { ProjectLanguageEditor, type ProjectLanguageEditorHandle } from './project-languages.js';
import { StoryStructureEditor } from './StoryStructureEditor.js';
import { SoundInstancePicker } from './SoundInstancePicker.js';
import { soundInstances } from './sound-instances.js';
import { WeatherPresetPicker } from './WeatherPresetPicker.js';
import { mountColorField } from '../components/color-field.js';
import { commandName, createCommandPicker } from './command-picker.js';
import { MiniStage } from './mini-stage.js';
import { AnimationTargetPicker, groupAnimationTargets, type AnimationTargetAvailability, type AnimationTargetOption } from './AnimationTargetPicker.js';
import { CharacterDifferencePicker } from './characters/CharacterDifferencePicker.js';
import { SceneDecorEditor, SceneEntryEditor } from './scene-entry-editor.js';
import { SceneDecorLayerSchema, SceneEntryPresentationSchema, round5AssetBindings } from '@galcraft/contracts';
import { Disclosure } from '../components/disclosure.js';
import { createBatchDialogueEditor } from './batch-dialogue.js';
import { DebugRouteIntent } from './debug-route-intent.js';
import { showCommandCenter, type CommandEntry, type CommandMode } from '../components/workbench/CommandCenter.js';
import { names as fieldNames, extendedFieldLabel as fieldLabel, fieldHint, initialFieldValue, ownsIdentity, enumLabel } from './field-help.js';
import { completeFormHints, observeFormHints } from '../components/form-hints.js';
import { codeBlock } from '../components/code-block.js';
import { prepareNativeDialog } from '../components/motion.js';
import { installTransientScrollbars } from '@galcraft/player-ui';
/// <reference types="vite/client" />
import type { Asset, AssetKind, AssetListIdentity, BackgroundAdoptionScope, BackgroundReference, BuildReceipt, CharacterDifference, FieldSpec, Id, Issue, Json, Ref, Result, SceneDecorLayer, SceneEntryPresentation, Source, StudioBridge, StudioPreferences } from '@galcraft/contracts';
import { IdSchema } from '@galcraft/contracts';
import { createCommandRegistry, parse, parseExpression, printExpression } from '@galcraft/dsl';
import { AuthoringController, classifyAssetDrop, mergeDialoguePaste, previewDialoguePaste } from './controller.js';
import type { AssetQuery, AuthoringServices, AuthoringSource, StatementEditTarget, StudioLocale } from './controller.js';
import { mountScriptEditor } from './script-editor.js';
import './workspace.css';
import { type PreviewPlayback } from './audio-preview.js';
import { attachCardReorder } from './card-reorder.js';
import { framingPresets, portraitFraming, type FramingPreset } from './framing-presets.js';
import { commandIcon } from './command-icon.js';
import { actionIcon } from '../components/action-icon.js';
import type { ShellAction } from '../components/shell-header.js';
import { requestDialog } from '../components/request-dialog.js';
import { reviewFileConflicts } from '../components/document-recovery.js';
import { SaveChangeList, readableDocument } from '../components/change-list.js';
import { SaveReview, requestSaveReview, revisionedSaveReviewScope, type SaveReviewScope } from '../components/save-review.js';
import type { RailItem } from '../components/rail-navigation.js';
import type { DockHandle } from '../components/workbench/DockWorkspace.js';
import { captureAuthoringFocus, hasLocalTextHistory, markAuthoringFocus, restoreAuthoringFocus } from './focus.js';
import { SceneVisualFields } from './scene-visual-fields.js';
import { EffectField } from './effect-field.js';
import { BackgroundObjectField } from './background-object-field.js';
import { BackgroundTransition } from './background-transition.js';
import { ruleImageField } from './rule-image-field.js';
import { SceneGraph, mountSceneGraphDialog } from './scene-graph.js';
import { mountMoveInstructionsDialog } from './move-instructions-dialog.js';
import { buildMoveInstructionsModel, resolveMovePosition } from './move-instructions-model.js';
import { studioToasts } from '../components/toast.js';
import { validateFields, commandFields } from './field-validation.js';
import { openAssetPicker, recordAssetsPicked } from './asset-picker.js';
import { createAssetDirectory } from './asset-directory.js';
import { createAssetWorkbenchPreview } from './asset-workbench-preview.js';
import { loadVisibleAssetThumbnails } from './asset-picker-thumbnails.js';
import { assetTypeName, assetTypeIcon, uniqueAssetTypes } from './asset-type-catalog.js';
import type { AssetTypeCatalogEntry } from '@galcraft/contracts';
import { createAuthoringSidebar, initialSidebarState, type SidebarState } from './sidebar.js';
import { renderPortraitModel, type FieldCommit } from './portrait-model.js';
import { PageDesigner } from './page-designer.js';
import { PublishHistoryPaths } from '../pages/Publish/publish-identity.js';
import { requestHistoryReview } from '../components/history-review.js';
import { startPlaytest } from './playtest.js';
import { designerText } from './designer-strings.js';
import { designerPageName } from './designer-labels.js';
import { createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createPortal, flushSync } from 'react-dom';
import { AuthoringWorkbench, DomRegion, authoringDockTools, openAuthorDocument, productionDocumentId, restoredAuthorDocumentId, type AuthorDocument, type AuthorDocumentRegion, type AuthorSceneCompanion, type AuthoringWorkbenchProps } from './workbench-host.js';
import { allGroups, groups, validLayout } from '../components/workbench/zoned-layout.js';
import './assets-workbench.css';
import { createWorkbenchChapter, moveWorkbenchObjects, renameWorkbenchObject } from './workbench-objects.js';
import type { EditInput, EditReceipt, SavePlan } from '@galcraft/contracts';
import { Production, tr } from '../pages/Production/Production.js';
import { ProductionSession, type ProductionDirectoryState } from '../pages/Production/session.js';
import { initialProductionDirectory } from '../pages/Production/ProductionDirectory.js';
import { unwrap as unwrapProduction, workbenchBridge } from '../pages/Production/bridge.js';
import { Plugins } from '../pages/Plugins/Plugins.js';
import { Publish, type PublishGuiDraft } from '../pages/Publish/Publish.js';
import './shell.css';
import './refinements.css';
import './creation-refinements.css';
import { Projects, type ProjectDraft } from '../pages/Projects/Projects.js';
import { ProjectDraftReview } from '../pages/Projects/ProjectDraftReview.js';
import { ProjectMaintenance } from '../pages/Projects/ProjectMaintenance.js';
import { WorkbenchPreferences } from './WorkbenchPreferences.js';
import { ConnectionWorkbench } from '../pages/Production/ConnectionWorkbench.js';
import { StudioOutput, type OutputFailure, type OutputState } from './StudioOutput.js';
import { CharacterManager, type CharacterGuiDraft, type CharacterManagerProps } from './characters/CharacterManager.js';
import { CharacterDirectory } from './characters/CharacterDirectory.js';
import { BindCharacterDifference } from './characters/BindCharacterDifference.js';
import { newCharacterName } from './characters/model.js';
import { StudioPluginHost } from '../pages/Plugins/studio-host.js';
import type { StudioSlot, StudioScope, StudioCorePage, PluginToolResult } from '@galcraft/plugins/contracts';
import { createStudioAuthorServices } from '../pages/Plugins/author-services.js';
import { ResourceProcessors, type ResourceProcessorGuiDraft } from '../pages/Plugins/resource-processors.js';
import { StartupEditor, type StartupAssetField, type StartupPreviewKind } from './startup-editor.js';
import { initialAnimation } from './animation-timeline.js';
import { AnimationWorkbench } from './professional/AnimationWorkbench.js';
import { AnimationPresetPicker } from './professional/AnimationPresetPicker.js';
import type { AppliedAnimationPreset } from '@galcraft/stage';
import { animationSourceChanges, segmentAnimation } from './animation-source.js';
import { parseAnimationResource } from '@galcraft/contracts';
import { chooseAnimationPreviewTarget } from './animation-preview-target.js';
import { AnimationGenerationRequestSchema } from '@galcraft/contracts';
import { LeasedAudioLoopEditor } from './professional/LeasedAudioLoopEditor.js';
import { openPlayerPreview } from './player-preview.js';
import { attachWritingHistory, resetWritingHistory } from './writing-history.js';
import { InputDraftStore, captureFieldInputs, type FieldInputDraft } from './input-drafts.js';
import { retainedWorkspaceInput, workspaceInputVersionsMatch } from './input-recovery.js';
import { RecoveredInput, type RecoveredInputGroup } from './RecoveredInput.js';
import { publishIdentityChanges } from '../pages/Publish/publish-identity.js';

type PersistentWorkspaceInput = {
  unapplied?: boolean; otherUnapplied?: boolean; recoveryReviewed?: boolean;
  version: 1; projectId: string; versions: { documentId: string; revision: number }[];
  scripts: [string,string][]; writing: [string,string][]; designer: ReturnType<PageDesigner['capture']> | null;
  publish: PublishGuiDraft | null; resourceProcessor: ResourceProcessorGuiDraft | null;
  character: CharacterSessionDraft | null;
  startup: import('./startup-editor.js').StartupGuiDraft | null;
  language: import('./project-languages.js').ProjectLanguageGuiDraft | null;
  playerName: import('./player-name.js').PlayerNameGuiDraft | null;
  production: { gui: ProductionSession['guiDraft']; connection: Omit<NonNullable<ProductionSession['connectionGuiDraft']>, 'secret'> | null; workflow?: ProductionSession['workflowGuiDraft']; candidateText: [string,string][] } | null;
  projectCreate: ProjectDraft; documents: AuthorDocument[]; active: string; page: Page; sceneId: string | null; view: AuthoringController['view'];
  forms: { id: string; title: string; fields: FieldInputDraft[]; adapter?: Json }[];
  retained?: Json | null;
};

type CharacterSessionDraft = CharacterGuiDraft & { views?: Record<Id, Pick<CharacterGuiDraft, 'section' | 'differenceId'>> };
type Page = 'projects' | 'editor' | 'assets' | 'pages' | 'production' | 'assistant' | 'collaboration' | 'plugins' | 'connections' | 'maintenance' | 'publish' | `extension:${string}`;
const supportPages = ['collaboration', 'plugins', 'connections', 'maintenance', 'publish'] as const;
type SupportPage = typeof supportPages[number];
const isSupportPage = (page: Page): page is SupportPage => (supportPages as readonly Page[]).includes(page);
const restoredAuthorDocuments = (documents: AuthorDocument[]) => {
  const restored = new Map<string, AuthorDocument>();
  for (const document of documents) {
    if (document.id === 'route:assets') continue;
    const id = restoredAuthorDocumentId(document.id);
    if (id !== document.id && restored.has(id)) continue;
    restored.set(id, id === document.id ? document : { ...document, id, objectId: 'production' });
  }
  return [...restored.values()];
};
type SceneStageSource = { sceneId: Id; documentId: Id; statementId: Id | null; eventId?: Id; projectId?: Id; revision?: number };
type SceneStatementSource = SceneStageSource & { statementId: Id };
type PasteSpeaker = { kind: 'character'; id: Id } | { kind: 'narrator' };
type PasteMapping = { speakers: Record<string, PasteSpeaker>; newCharacters: { id: Id; name: string }[] };
type ShellServices = AuthoringServices & {
  bridge: AuthoringServices['bridge'] & Pick<StudioBridge, 'projects'> & { service?: Pick<import('../browser-bridge.js').BrowserStudioBridge['service'], 'status'> };
  chooseDirectory(): Promise<Result<string | null>>;
  openProject(path: string): Promise<Result<{ projectId: Id; sessionId: Id }>>;
  copyProject?(): Promise<Result<{ projectId: Id; directory: string }>>;
  closeProject(sessionId: Id, choice: 'save' | 'discard' | 'cancel'): Promise<Result<void>>;
  createProject?(input: { path: string; name: string; template: 'empty' | 'light' | 'standard' | 'rich'; width: number; height: number; engineVersion: string; closeChoice?: 'save' | 'discard' }): Promise<Result<{ projectId: Id; sessionId: Id }>>;
  pickAssetFiles(): Promise<Result<string[]>>;
  revealEntity(ref: { kind: 'project' | 'asset'; id: Id }): Promise<Result<void>>;
};

const words = {
  'zh-CN': { projects: '作品', editor: '创作', assets: '素材', open: '打开作品文件夹', create: '创建作品', directory: '选择目录',
    name: '作品名称', template: '模板', engine: '引擎版本', save: '保存当前', saveAll: '保存全部', undo: '撤销', redo: '恢复',
    cards: '演出', writing: '写作', script: '源码', inspector: '属性', search: '搜索', import: '导入素材', settings: '作品设置',
    autosave: '自动存档', dirty: '有未保存修改', saved: '已保存', saving: '正在保存', failed: '保存失败', lastValid: '预览仍为上次有效内容',
    addDialogue: '插入对白', paste: '批量粘贴', selected: '已选择', selectPage: '选择本页', selectAll: '选择全部筛选结果', clear: '清空选择',
    chooseUse: '选择音频用途', bgm: '背景音乐', effect: '音效', cancel: '取消', apply: '应用', preview: '预览', moveScene: '移动所选指令…',
    sceneName: '场景名称', addCommand: '添加指令', copy: '复制', dialogueText: '对白正文', pasteLines: '每行一条对白', all: '全部', openDirectory: '打开所在目录',
    problems: '问题', noProblems: '当前没有问题' },
  en: { projects: 'Projects', editor: 'Author', assets: 'Assets', open: 'Open project folder', create: 'Create project', directory: 'Choose directory',
    name: 'Project name', template: 'Template', engine: 'Engine version', save: 'Save current', saveAll: 'Save all', undo: 'Undo', redo: 'Redo',
    cards: 'Direction', writing: 'Writing', script: 'Source', inspector: 'Properties', search: 'Search', import: 'Import assets', settings: 'Project settings',
    autosave: 'Autosave', dirty: 'Unsaved changes', saved: 'Saved', saving: 'Saving', failed: 'Save failed', lastValid: 'Preview shows last valid content',
    addDialogue: 'Add dialogue', paste: 'Paste lines', selected: 'Selected', selectPage: 'Select page', selectAll: 'Select all results', clear: 'Clear selection',
    chooseUse: 'Choose audio use', bgm: 'Music', effect: 'Sound effect', cancel: 'Cancel', apply: 'Apply', preview: 'Preview', moveScene: 'Move selected instructions…',
    sceneName: 'Scene name', addCommand: 'Add command', copy: 'Copy', dialogueText: 'Dialogue text', pasteLines: 'One dialogue per line', all: 'All', openDirectory: 'Open containing folder',
    problems: 'Problems', noProblems: 'No current problems' },
  ja: { projects: '作品', editor: '創作', assets: '素材', open: '作品フォルダーを開く', create: '作品を作成', directory: 'フォルダーを選択',
    name: '作品名', template: 'テンプレート', engine: 'エンジン版', save: '現在を保存', saveAll: 'すべて保存', undo: '元に戻す', redo: 'やり直す',
    cards: '演出', writing: '執筆', script: 'スクリプト', inspector: 'プロパティ', search: '検索', import: '素材を追加', settings: '作品設定',
    autosave: '自動保存', dirty: '未保存の変更', saved: '保存済み', saving: '保存中', failed: '保存失敗', lastValid: '前回の有効な内容を表示中',
    addDialogue: 'セリフを追加', paste: '複数行を貼付', selected: '選択', selectPage: 'ページを選択', selectAll: '検索結果をすべて選択', clear: '選択解除',
    chooseUse: '音声の用途', bgm: '音楽', effect: '効果音', cancel: 'キャンセル', apply: '適用', preview: 'プレビュー', moveScene: '選択した命令を移動…',
    sceneName: 'シーン名', addCommand: 'コマンドを追加', copy: 'コピー', dialogueText: 'セリフ本文', pasteLines: '一行に一つのセリフ', all: 'すべて', openDirectory: '保存場所を開く',
    problems: '問題', noProblems: '現在の問題はありません' },
} as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (node instanceof HTMLDialogElement) prepareNativeDialog(node); if (className) node.className = className; if (text) node.textContent = text; return node;
}
function button(label: string, action: () => void | Promise<void>, className = ''): HTMLButtonElement {
  const actions = { save: 'save', saveAll: 'save', undo: 'undo', redo: 'redo', addDialogue: 'dialogue', paste: 'paste', addCommand: 'plus', copy: 'copy', search: 'search', import: 'upload', openDirectory: 'folder', clear: 'close', selectPage: 'check', selectAll: 'check', preview: 'play', cards: 'cards', writing: 'edit', script: 'code' } as const;
  const key = Object.keys(actions).find(key => Object.values(words).some(locale => locale[key as keyof typeof actions] === label)) as keyof typeof actions | undefined;
  const extra: Record<string, string> = { '复制标识': 'copy', 'Copy ID': 'copy', 'ID をコピー': 'copy', '从此句试玩': 'play', 'Play from here': 'play', '详情': 'info', '查看所选': 'check', '批量命名': 'edit', '移除所选': 'trash', '新建场景': 'plus' };
  const icon = key ? actions[key] : extra[label];
  const node = domButton(label, action, `${className}${icon === 'copy' ? ' authoring-copy-action' : ''}`);
  if (icon) node.prepend(actionIcon(icon));
  return node;
}
function hasWorkbenchModal(): boolean {
  return [...document.querySelectorAll('dialog[open],[aria-modal="true"]')]
    .some(dialog => !dialog.closest('.designer-canvas[data-mode="design"]'));
}
function fieldValue(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, source);
}
function asJson(value: unknown): Json { return value === undefined ? null : value as Json; }
function commandAssetIds(fields: readonly FieldSpec[], value: Record<string, unknown>): Id[] {
  const ids = fields.flatMap(field => {
    const item = value[field.path];
    if (field.refKind === 'asset') return typeof item === 'string' && IdSchema.safeParse(item).success ? [item] : [];
    if (field.type === 'object' && item && typeof item === 'object') return commandAssetIds(field.children ?? [], item as Record<string, unknown>);
    if (field.type === 'array' && Array.isArray(item) && field.item) return item.flatMap(entry => commandAssetIds([field.item!], { [field.item!.path]: entry }));
    return [];
  }); return [...new Set(ids)];
}
type ReferenceOption = Ref & AnimationTargetOption;
type FieldContext = { services: ShellServices; projectId: Id; scope: HTMLElement; sceneId?: Id; characterId?: Id; voiceLocale?: string; modelAsset?: Asset; figureKind?: 'image' | 'live2d'; command?: string; draft?: boolean; fieldPath?: string;
  animationInstances?: { id: string; name: string }[];
differences?: readonly CharacterDifference[]; characterName?: string;
  highlightObject?(id: string): void; locateObject?(option: AnimationTargetOption): void;
  targetAvailability?(id: string): AnimationTargetAvailability;
  animationEditor?(root: HTMLElement, value: unknown, commit: FieldCommit): void;
  visualEffectField?(root: HTMLElement, spec: FieldSpec, value: unknown, change: FieldCommit): void;
  audioEditor?(root: HTMLElement): void;
  assetEditor?(root: HTMLElement, value: Json, commit: FieldCommit): boolean;
  publicEditor?(contribution: string, field: string, root: HTMLElement, value: Json, commit: FieldCommit): boolean; cache(asset: Asset): void };
function inputFor(spec: FieldSpec, value: unknown, onCommit: FieldCommit, assets: readonly Asset[] = [], references: readonly ReferenceOption[] = [], locale: StudioLocale = 'zh-CN', ownIdentity = false, framingSize?: () => { sourceHeight: number; canvasHeight: number } | null, context?: FieldContext): HTMLElement {
  if (context?.visualEffectField && (spec.type === 'number' || spec.type === 'integer' || spec.path === 'rgb' && spec.type === 'array')) {
    const root = el('div', spec.path === 'rgb' ? 'effect-color-field' : 'effect-number-field'); context.visualEffectField(root, spec, value, onCommit); return root;
  }
  if (context?.command === 'say' && spec.path === 'text') return dialogueTextField(value, locale, onCommit);
  if (spec.path === 'ruleImage' && context) return ruleImageField(value, onCommit, assets, locale, context);
  const label = (field: FieldSpec) => fieldLabel(field, locale, context?.command);
  const hint = (field: FieldSpec) => fieldHint(field, label(field), locale, context?.command);
  if (spec.path === 'animationId' && context?.command === 'stopAnimation') {
    const group = el('div'), input = el('select'); input.ariaLabel = label(spec);
    input.append(new Option(tr(locale, '选择启动动画实例', 'Choose a started animation instance', '開始済みアニメーションを選択'), ''));
    for (const item of context.animationInstances ?? []) input.append(new Option(item.name, item.id));
    if (value && !(context.animationInstances ?? []).some(item => item.id === value)) input.append(new Option(tr(locale, '原实例引用不可用', 'Original instance reference unavailable', '元の参照がありません'), String(value)));
    input.value = String(value ?? ''); input.onchange = () => { void onCommit(input.value); };
    group.append(input, el('p', 'field-help', tr(locale, '选择实例并指定同一作用对象。停止临时动作恢复其起态；移动停在当前位置。', 'Choose an instance and its original target. Temporary actions return to their starting state; movement stops at its current position.', 'インスタンスと開始時の対象を選択。一時動作は開始状態に戻り、移動は現在位置で停止します。'))); return group;
  }
  if (spec.path === 'animation' && context?.animationEditor) { const root = el('div'); context.animationEditor(root, value, onCommit); return root; }
  if (spec.path === 'loopStartSec' && context?.audioEditor) { const root = el('div', 'authoring-audio-loop-entry'); context.audioEditor(root); root.append(inputFor(spec, value, onCommit, assets, references, locale, ownIdentity, framingSize, { ...context, audioEditor: undefined })); return root; }
  if (spec.path === 'portrait' && spec.type === 'object') return dialoguePortraitField(value, context?.modelAsset, locale, onCommit, () => { if(context)void loadVisibleAssetThumbnails(context.services); });
  if(spec.path==='differenceId'&&context&&['characterDifference','changeFigure'].includes(context.command??'')){
    const root=el('div','authoring-difference-field'),current=String(value??''),differences=context.differences??[],selected=differences.find(item=>item.id===current);
    const trigger=button(selected?.name??(current?tr(locale,'原差分不可用','Original difference unavailable','元の差分がありません'):tr(locale,'选择共同差分','Choose a shared difference','共通差分を選択')),()=>{
      const content=el('div'),picker=createRoot(content);let popover:ReturnType<typeof showContentPopover>;
      picker.render(createElement(CharacterDifferencePicker,{differences,assets,value:current,locale,refreshThumbnails:()=>{void loadVisibleAssetThumbnails(context.services);},choose:async id=>{const result=await onCommit(id);if(!result||result.ok)popover.close();}}));
      popover=showContentPopover(content,trigger,label(spec),()=>picker.unmount());
    },'authoring-difference-trigger');trigger.ariaLabel=label(spec);trigger.disabled=!differences.length;
    if(selected){const variantId=selected.figure.variantId??assets.find(asset=>asset.id===selected.figure.assetId)?.activeVariantId;if(variantId){const image=el('img');image.alt='';image.dataset.assetId=selected.figure.assetId;image.dataset.variantId=variantId;trigger.prepend(image);}}
    root.append(trigger);if(!context.characterName||!differences.length||current&&!selected)root.append(el('p','field-help',!context.characterName?tr(locale,'先选择角色，再选择共同差分。','Choose a character before selecting a shared difference.','キャラクターを選んでから共通差分を選択してください。'):!differences.length?tr(locale,'此角色尚未配置共同差分；当前引用保持。','This character has no shared differences. The current reference is retained.','共通差分が未設定です。現在の参照は保持します。'):tr(locale,'原差分不可用，已保留当前引用。请选择有效差分。','The original difference is unavailable; its reference is retained. Choose an available difference.','元の差分がありません。参照を保持しています。有効な差分を選択してください。')));
    if(current){const details=el('details');details.append(el('summary','',tr(locale,'当前引用详情','Current reference details','現在の参照の詳細')),el('code','',current));root.append(details);}return root;
  }
  if (ownIdentity || spec.path === 'id' && spec.refKind === 'statement') {
    const identity = el('input'); identity.readOnly = true; identity.value = String(value ?? ''); identity.ariaLabel = tr(locale, '自动生成的标识', 'Automatically generated ID', '自動生成された ID');
    identity.title = tr(locale, '系统生成并维护，修改正文不会改变标识', 'Managed by the system; editing text keeps this ID', '自動生成され、本文の編集では変更されません');
    const details=el('details','authoring-identity'); details.append(el('summary','',tr(locale,'标识（自动生成）','ID (generated)','ID（自動生成）')),identity,button(tr(locale,'复制标识','Copy ID','ID をコピー'),()=>navigator.clipboard.writeText(identity.value)));
    return details;
  }
  if (context?.command && context.publicEditor) { const root = el('div'); if (context.publicEditor(context.command, context.fieldPath ?? spec.path, root, asJson(value ?? spec.default), onCommit)) return root; }
  if (spec.path === 'rgb' && spec.type === 'array') {
    return mountColorField(value, onCommit, locale);
  }
  if (spec.path === 'framing' && spec.type === 'object') {
    const group = el('div', 'authoring-framing'), presets = el('select');
    presets.ariaLabel = tr(locale, '立绘取景预设', 'Character framing preset', '立ち絵の構図プリセット');
    const labels: Record<FramingPreset, [string,string,string]> = { upper:['上半身（默认）','Upper body (default)','上半身（既定）'], far:['远景','Long shot','遠景'], medium:['中景','Medium shot','中景'], near:['近景','Close-up','近景'], full:['全身','Full body','全身'] };
    for (const preset of framingPresets) { const option = el('option','',tr(locale,...labels[preset])); option.value=preset;presets.append(option); }
    const custom = el('option','',tr(locale,'自定义','Custom','カスタム'));custom.value='custom';presets.append(custom);
    const size = framingSize?.(); presets.disabled = !size;
    if (!size) presets.title = tr(locale,'选择具有尺寸信息的立绘素材后使用预设','Choose a portrait asset with known dimensions','サイズ情報のある立ち絵素材を選択してください');
    presets.value = value == null ? 'upper' : size ? framingPresets.find(preset => {
      const candidate=portraitFraming(preset,size.sourceHeight,size.canvasHeight), current=value as Record<string,unknown>;
      return current.mode===candidate.mode && current.crop==null && current.offsetX===0 && Math.abs(Number(current.scale)-candidate.scale)<.00001 && Math.abs(Number(current.offsetY)-candidate.offsetY)<.01;
    }) ?? 'custom' : 'custom';
    presets.onchange=()=>{const nextSize=framingSize?.();if(nextSize && presets.value!=='custom')onCommit(portraitFraming(presets.value as FramingPreset,nextSize.sourceHeight,nextSize.canvasHeight));};
    const details=el('details','framing-custom');details.append(el('summary','',tr(locale,'微调取景','Adjust framing','構図を調整')));
    details.append(inputFor({...spec,path:'framing-custom'},value,onCommit,assets,references,locale,false,framingSize,context));
    group.append(presets,details);return group;
  }
  if (spec.path === 'speaker' && spec.type === 'object') {
    const input = el('select'); input.ariaLabel = label(spec);
    const narrator = el('option', '', tr(locale, '旁白', 'Narrator', 'ナレーター')); narrator.value = ''; input.append(narrator);
    for (const character of references.filter(item => item.kind === 'character')) { const option = el('option', '', character.name); option.value = character.id; input.append(option); }
    const speaker = value as { kind?: string; id?: string } | null;
    if (speaker?.id && !references.some(item => item.id === speaker.id)) { const option = el('option', '', speaker.id); option.value = speaker.id; input.append(option); }
    input.value = speaker?.kind === 'character' ? speaker.id ?? '' : '';
    input.addEventListener('change', () => onCommit(input.value ? { kind: 'character', id: input.value } : { kind: 'narrator' })); return input;
  }
  if (spec.path === 'model' && context?.modelAsset) {
    const root = el('section', 'portrait-model-controls');
    if (context.assetEditor?.(root, (value ?? {}) as Json, onCommit)) return root;
  }
  if (spec.path === 'model' && context) return renderPortraitModel(
    context.modelAsset?.kind === 'live2d' ? 'live2d' : context.figureKind ?? 'image', locale);
  if (spec.type === 'object') {
    let current = value && typeof value === 'object' && !Array.isArray(value) ? { ...value as Record<string, Json> } : {} as Record<string, Json>;
    if (!spec.children?.length) {
      const empty = el('p', 'authoring-field-empty', tr(locale, '此指令没有可调整的自定义参数。', 'This command has no custom parameters to adjust.', 'このコマンドには調整できるカスタムパラメーターがありません。'));
      return empty;
    }
    const group = el('fieldset', 'authoring-field-group'); group.append(el('legend', '', label(spec)));
    if (spec.path === 'target' && spec.children?.some(child => child.refKind === 'object')) group.classList.add('animation-target-fields');
    if(['effects','bloom','bevel'].includes(spec.path))group.append(el('p','field-help',hint(spec)));
    if(context?.command==='end' && spec.path==='target')group.append(el('p','field-help',hint(spec)));
    const sections=new Map<string,HTMLElement>();
    const sectionFor=(path:string)=>{
      if(spec.path!=='effects')return group;
      const name=['x','y','scaleX','scaleY','rotationDeg','station','z'].includes(path)?tr(locale,'位置与尺寸','Position & size','位置・サイズ'):
        ['opacity','blur','brightness','contrast','saturation','gamma','rgb','blend'].includes(path)?tr(locale,'颜色与质感','Color & appearance','色・質感'):tr(locale,'附加效果','Additional effects','追加エフェクト');
      if(!sections.has(name)){const section=el('section','effects-section');section.append(el('h3','',name));sections.set(name,section);group.append(section);}
      return sections.get(name)!;
    };
    for (const originalChild of spec.children ?? []) {
      if (spec.path === 'target' && ['object','station','stage'].includes(String(current.kind)) && (originalChild.path === 'id' && current.kind !== 'object' || originalChild.path === 'station' && current.kind !== 'station')) continue;
      const child = context?.command === 'end' && spec.path === 'target' && (current.kind === 'scene' && originalChild.path === 'sceneId' || current.kind === 'page' && originalChild.path === 'pageId') ? { ...originalChild, required: true } : originalChild;
      if (context?.command === 'end' && spec.path === 'target' && child.path !== 'kind') {
        const kind = current.kind ?? 'title';
        if (kind === 'title' || kind === 'page' && child.path !== 'pageId' || kind === 'scene' && !['sceneId', 'labelId'].includes(child.path)) continue;
      }
      const path = child.path; const row = el(context?.visualEffectField || child.refKind === 'object' ? 'div' : 'label', 'authoring-field');
      const childLabel=child.refKind==='object'?tr(locale,'舞台对象','Stage object','舞台オブジェクト'):label(child);
      row.append(el('span', '', childLabel + (child.required && !(child.path==='id'&&child.refKind==='statement') ? tr(locale, ' · 必填', ' · Required', ' · 必須') : ''))); row.append(inputFor(child, current[path],
        next => { current = { ...current, [path]: next }; if (next === null && !child.required && !child.nullable) delete current[path]; const result = onCommit(current);
          if (path === 'kind' && context?.command === 'end' && spec.path === 'target') group.replaceWith(inputFor(spec,current,onCommit,assets,references,locale,false,framingSize,context));
          return result; }, assets, references, locale, false, framingSize, context ? { ...context, fieldPath: `${context.fieldPath ?? spec.path}.${child.path}` } : context));
      sectionFor(path).append(row);
    }
    return group;
  }
  if (spec.type === 'array') {
    const list = el('div', 'authoring-array'); let values = Array.isArray(value) ? [...value] : [];
    const draw = () => {
      list.replaceChildren();
      values.forEach((item, index) => {
        const row = el('div', 'authoring-array-row');
        row.append(inputFor(spec.item!, item, next => { values[index] = next; return onCommit([...values] as Json); }, assets, references, locale, false, framingSize, context ? { ...context, fieldPath: `${context.fieldPath ?? spec.path}.${index}` } : context));
        row.append(button('−', () => { values = values.filter((_, at) => at !== index); onCommit([...values] as Json); draw(); }));
        list.append(row);
      });
      list.append(button(tr(locale, '添加一项', 'Add item', '項目を追加'), () => { values.push(asJson(spec.item ? initialFieldValue(spec.item) : null)); onCommit([...values] as Json); draw(); }));
    };
    draw();
    return list;
  }
  if (spec.type === 'ref') {
    if (spec.refKind === 'asset' && context) {
      const group = el('div', 'authoring-asset-reference'), selected = assets.find(asset => asset.id === value);
      const allowedKinds: AssetKind[] = spec.assetKinds?.length ? spec.assetKinds : [...new Set(assets.map(asset => asset.kind))];
      const trigger = button('', async () => { const catalog = !spec.assetKinds?.length ? await context.services.assetTypeCatalog?.() : null;
        const kinds = catalog?.ok ? uniqueAssetTypes(catalog.value).map(item => item.descriptor.key) : allowedKinds;
        await openAssetPicker({ services: context.services, projectId: context.projectId, allowedKinds: kinds,
        locale, sceneId: context.sceneId, characterId: context.characterId, assetLocale: spec.path==='voice'?context.voiceLocale:undefined, currentAssetId: typeof value === 'string' ? value : null,
        currentName: selected?.name, purpose: label(spec), mode: 'compact', scope: context.scope, returnFocus: trigger, remember: !context.draft,
        onApply: async choice => { context.cache(choice.asset); const result = await onCommit(choice.assetId);
          if ((!result||result.ok) && group.isConnected) { group.replaceWith(inputFor(spec,choice.assetId,onCommit,[...assets.filter(item=>item.id!==choice.assetId),choice.asset],references,locale,ownIdentity,framingSize,context));void loadVisibleAssetThumbnails(context.services); }
          return result ?? { ok: true, value: undefined, warnings: [] }; } }); }, 'asset-reference-trigger');
      if (selected?.kind === 'image') { const image=el('img'); image.alt='';image.dataset.assetId=selected.id;image.dataset.variantId=selected.activeVariantId;trigger.append(image); }
      else trigger.append(actionIcon(selected?.kind === 'audio' ? 'play' : 'folder'));
      const caption=el('span','asset-reference-caption',selected?.name ?? (value ? tr(locale,'当前引用 · 未载入','Current reference · not loaded','現在の参照 · 未読込') : tr(locale,'搜索并选择素材','Search and choose an asset','素材を検索して選択')));
      caption.append(el('small','',selected ? `${selected.kind} · ${selected.folder.join('/') || selected.sourceName}` : allowedKinds.join(' / ')));trigger.append(caption,actionIcon('search'));group.append(trigger);
      if (value && spec.nullable) { const clear=button('',()=>{void onCommit(null);},'asset-reference-clear'); clear.ariaLabel=tr(locale,'清除素材引用','Clear asset reference','素材参照を解除');clear.append(actionIcon('close'));group.append(clear); }
      const advanced=el('details','reference-manual');advanced.append(el('summary','',tr(locale,'按标识指定','Specify ID','ID で指定')));
      const manual=el('input');manual.value=typeof value==='string'?value:'';manual.placeholder=tr(locale,'粘贴已有素材的 ID','Paste an existing asset ID','既存素材の ID');manual.ariaLabel=`${label(spec)} ID`;
      manual.onchange=()=>{void(async()=>{if(!manual.value&&spec.nullable){void onCommit(null);return;}const parsed=IdSchema.safeParse(manual.value);
        const found=parsed.success?await context.services.getAsset?.(parsed.data):undefined;
        const asset=found?.ok?found.value:null;const valid=asset&&allowedKinds.includes(asset.kind);manual.setCustomValidity(valid?'':tr(locale,'请选择存在且类型匹配的素材','Choose an existing asset of an allowed type','対応する種類の既存素材を選択してください'));
        if(!valid||!asset){manual.reportValidity();return;}context.cache(asset);const result=await onCommit(asset.id);if(result?.ok&&!context.draft)await recordAssetsPicked(context.services,context.projectId,[asset.id]);})();};
      advanced.append(manual);group.append(advanced);return group;
    }
    if (spec.refKind === 'object') {
      const group = el('div', 'authoring-reference animation-target-reference'), options = references.filter(item => item.kind === 'object'), selected = options.find(item => item.id === value);
      const trigger = button(selected?.name ?? tr(locale, '选择舞台对象', 'Choose stage object', '舞台対象を選択'), () => {
        const content = el('div'), root = createRoot(content);
        const popover = showContentPopover(content, trigger, tr(locale, '动画执行目标', 'Animation target', 'アニメーション対象'), () => root.unmount());
        root.render(createElement(AnimationTargetPicker, { options: options.map(option => ({ ...option, availability: context?.targetAvailability?.(option.id) ?? 'unknown' })), value: String(value ?? ''), locale,
          choose: id => { void Promise.resolve(onCommit(id)).then(result => { if (!result || result.ok) { context?.highlightObject?.(id); popover.close(); } }); },
          locate: context?.locateObject ? option => { popover.close(); context.locateObject!(option); } : undefined }));
      });
      trigger.classList.add('animation-target-trigger'); trigger.ariaLabel = tr(locale,'选择动画目标','Choose animation target','アニメーション対象を選択'); trigger.setAttribute('aria-haspopup','dialog');
      trigger.replaceChildren(el('strong','',selected?.name ?? (value ? tr(locale,'原目标未找到','Original target not found','元の対象が見つかりません'):tr(locale,'选择舞台对象','Choose stage object','舞台オブジェクトを選択'))));
      if(selected?.appearance)trigger.append(el('small','',tr(locale,'出场示例：','Appearance example: ','登場例：')+selected.appearance));
      group.append(trigger);
      if (selected?.sources?.length) { const sources = el('details'); sources.append(el('summary','',tr(locale,`出场来源（${selected.sources.length}处）`,`Appearances (${selected.sources.length})`,`登場箇所（${selected.sources.length}件）`))); for(const source of selected.sources)sources.append(el('p','',source.label ?? selected.detail)); group.append(sources); }
      else if(value)group.append(el('p','field-help',tr(locale,'未找到此对象的出场指令，原标识已保留。请检查来源或重新选择。','No appearance command found. The original ID remains. Check its source or choose another target.','登場命令が見つかりません。元のIDを保持しています。定義を確認するか、対象を選び直してください。')));
      const details = el('details'), manual = el('input'); manual.value = typeof value === 'string' ? value : ''; manual.ariaLabel = `${label(spec)} ID`; manual.onchange = () => { if (IdSchema.safeParse(manual.value).success) { void onCommit(manual.value); context?.highlightObject?.(manual.value); } else manual.setCustomValidity(tr(locale, '请输入有效 ID', 'Enter a valid ID', '有効な ID を入力してください')); }; details.append(el('summary', '', tr(locale, '按标识指定', 'Specify ID', 'ID で指定')), manual); group.append(details); return group;
    }
    const input = el('select'); input.ariaLabel = label(spec); const blank = el('option', '', '—'); blank.value = ''; input.append(blank);
    const options = spec.refKind === 'asset' ? assets.filter(item => !spec.assetKinds?.length || spec.assetKinds.includes(item.kind))
      .map(asset => ({ kind: asset.kind, id: asset.id, name: asset.name })) : references.filter(item => item.kind === spec.refKind);
    for (const reference of options) {
      const option = el('option', '', `${reference.name} (${reference.kind})`); option.value = reference.id; input.append(option);
    }
    if (typeof value === 'string' && !options.some(item => item.id === value)) { const missing = el('option', '', value); missing.value = value; input.append(missing); }
    input.value = typeof value === 'string' ? value : '';
    input.addEventListener('change', () => onCommit(input.value || null));
    const group = el('span', 'authoring-reference'); group.append(input);
    const manual = el('input'); manual.placeholder = tr(locale,'高级：粘贴已有对象的 ID','Advanced: paste an existing object ID','詳細：既存オブジェクトの ID'); manual.setAttribute('aria-label', `${label(spec)} ID`);
    manual.value = typeof value === 'string' ? value : '';
    manual.addEventListener('change', () => {
      if (!manual.value && spec.nullable) { manual.setCustomValidity(''); onCommit(null); return; }
      const valid = IdSchema.safeParse(manual.value);
      manual.setCustomValidity(valid.success ? '' : tr(locale,'请输入有效 ID','Enter a valid ID','有効な ID を入力してください'));
      if (valid.success) onCommit(valid.data); else manual.reportValidity();
    });
    const advanced = el('details', 'reference-manual'); advanced.append(el('summary', '', tr(locale, '按标识指定', 'Specify ID', 'ID で指定')), manual);
    group.append(advanced); return group;
  }
  if (spec.type === 'boolean') {
    const input = el('input'); input.type = 'checkbox'; input.ariaLabel=label(spec); input.title=hint(spec); input.checked = (value ?? spec.default) === true; input.addEventListener('change', () => onCommit(input.checked)); return input;
  }
  if (spec.type === 'enum') {
    const input = el('select'); input.ariaLabel = label(spec); input.setAttribute('aria-required', String(spec.required));
    if (value == null && spec.default == null) { const blank = el('option', '', tr(locale, '请选择', 'Choose…', '選択してください')); blank.value = ''; input.append(blank); }
    for (const option of spec.enumValues ?? []) { const node = el('option', '', enumLabel(option,locale,context?.command)); node.value = option; input.append(node); }
    input.value = typeof value === 'string' ? value : String(spec.default ?? ''); input.addEventListener('change', () => onCommit(input.value)); return input;
  }
  const input = spec.type === 'string' && spec.path === 'text' ? el('textarea') : el('input');
  if (input instanceof HTMLInputElement) input.type = spec.type === 'number' || spec.type === 'integer' ? 'number' : 'text';
  input.ariaLabel = label(spec); input.setAttribute('aria-required', String(spec.required));
  input.placeholder = hint(spec); input.title = input.placeholder;
  if (input instanceof HTMLInputElement && input.type === 'number') { if (spec.min !== undefined) input.min = String(spec.min); if (spec.max !== undefined) input.max = String(spec.max); input.step = spec.type === 'integer' ? '1' : 'any'; }
  input.value = value === undefined || value === null ? '' : spec.type === 'expression' && typeof value === 'object' ? printExpression(value as Parameters<typeof printExpression>[0]) : typeof value === 'object' ? JSON.stringify(value) : String(value);
  input.addEventListener('change', () => {
    if (spec.type === 'number' || spec.type === 'integer') { if (!input.value.trim()) { onCommit(null); return; } const number = Number(input.value); if (!input.reportValidity()) return; onCommit(number); }
    else if (spec.type === 'expression') {
      const parsed = parseExpression(input.value);
      if (parsed.ok) { input.setCustomValidity(''); onCommit(parsed.expr as Json); }
      else { input.setCustomValidity(parsed.message); input.reportValidity(); }
    }
    else onCommit(input.value);
  });
  const numericKey=/Ms$/.test(spec.path)?'durationMs':/Volume$/.test(spec.path)?'volume':({scale:'scaleX',offsetX:'x',offsetY:'y',positionX:'position',positionY:'position'} as Record<string,string>)[spec.path]??spec.path;
  if(input instanceof HTMLInputElement && input.type==='number' && ['x','y','scaleX','scaleY','rotationDeg','opacity','blur','brightness','contrast','saturation','gamma','volume','durationMs','position'].includes(numericKey)) {
    const group=el('span','authoring-number'), slider=el('input'); slider.type='range';slider.ariaLabel=label(spec);
    const defaults:Record<string,[number,number,number]>={x:[-1920,1920,1],y:[-1080,1080,1],scaleX:[0,3,.01],scaleY:[0,3,.01],rotationDeg:[-180,180,1],opacity:[0,1,.01],blur:[0,40,.1],brightness:[0,3,.01],contrast:[0,3,.01],saturation:[0,3,.01],gamma:[.01,3,.01],volume:[0,100,1],durationMs:[0,5000,50],position:[0,1,.01]};
    const [min,max,step]=defaults[numericKey]!;slider.min=String(spec.min??min);slider.max=String(spec.max??max);slider.step=String(step);slider.value=input.value||String(spec.default??min);
    input.addEventListener('input',()=>{if(input.value)slider.value=input.value;});slider.oninput=()=>{input.value=slider.value;};slider.onchange=()=>input.dispatchEvent(new Event('change'));
    const presets=el('select','authoring-number-presets');presets.ariaLabel=tr(locale,`${label(spec)}预设`,`${label(spec)} presets`,`${label(spec)}プリセット`);
    const blank=el('option','',tr(locale,'选择常用值','Common values','よく使う値'));blank.value='';presets.append(blank);
    const common:Record<string,number[]>={x:[-960,-480,0,480,960],y:[-540,-270,0,270,540],scaleX:[.5,.75,1,1.25,1.5,2],scaleY:[.5,.75,1,1.25,1.5,2],rotationDeg:[-90,-45,0,45,90,180],opacity:[0,.25,.5,.75,1],blur:[0,2,5,10,20],brightness:[.5,.75,1,1.25,1.5,2],contrast:[.5,.75,1,1.25,1.5,2],saturation:[0,.5,1,1.5,2],gamma:[.5,.75,1,1.25,1.5,2],volume:[0,25,50,75,100],durationMs:[0,150,300,500,1000,2000]};
    common.position=[0,.25,.5,.75,1];
    for(const number of common[numericKey]??[]){if(spec.min!==undefined&&number<spec.min||spec.max!==undefined&&number>spec.max)continue;const option=el('option','',numericKey==='durationMs'?`${number} ms`:numericKey==='volume'?`${number}%`:String(number));option.value=String(number);presets.append(option);}
    presets.onchange=()=>{if(!presets.value)return;input.value=slider.value=presets.value;input.dispatchEvent(new Event('change'));};
    group.append(input,slider,presets);return group;
  }
  return input;
}

export class AuthoringWorkspace {
  private disposed=false;
  private recoveryPending = false;
  private recoveryReviewOpen = false;
  private importingAssets = false;
  private inspectorMoreOpen = false;
  private production: ProductionSession | null = null;
  private productionUnapplied = false;
  private publishUnapplied = false;
  private releaseIssues: Issue[] = [];
  private issueReturn: 'publish' | 'problems' | null = null;
  private output: OutputState = { scrollTop: 0 };
  private outputFailure?: OutputFailure;
  private pendingBuild?: string;
  private outputNode = el('div', 'studio-output-scroll');
  private outputRoot: Root | null = null;
  private preferencesNode = el('div', 'workbench-preferences-mount');
  private preferencesRoot: Root | null = null;
  private connectionOrigin: ProductionSession['selectedRecord'] = null;
  private connectionUnapplied = false;
  private setConnectionUnapplied = (dirty: boolean) => {
    if (this.connectionUnapplied === dirty) return;
    this.connectionUnapplied = dirty;
    this.persistInputDraft();
  };
  private missingPlugin: { id: string; version: string } | null = null;
  private projectCenterOrigin: string | null = null;
  private publishGuiDraft:PublishGuiDraft|null=null;
  private capturePublishGui=(draft:PublishGuiDraft)=>{this.publishGuiDraft=draft;this.persistInputDraft();};
  private setPublishUnapplied = (dirty: boolean) => { this.publishUnapplied = dirty; this.documents = this.documents.map(document => document.id === 'route:publish' ? { ...document, dirty: dirty || this.controller.source?.projectDirty } : document); this.refreshDocumentTabs();void this.reportAuthoringDrafts(); };
  private productionReview = false;
  private setProductionReview = (reviewing: boolean) => { if (this.productionReview === reviewing) return; this.productionReview = reviewing; queueMicrotask(() => this.render()); };
  private setProductionUnapplied = (dirty: boolean) => { this.productionUnapplied = dirty;void this.reportAuthoringDrafts(); };
  private productionSubscription: (() => void) | null = null;
  private productionDirectoryState = initialProductionDirectory();
  private productionDirectoryRequested = false;
  private productionChanged = () => {
    if (!this.production) return;
    const record = this.production.selectedRecord, previous = this.productionDirectoryState.record;
    if (record?.id !== previous?.id || record?.kind !== previous?.kind) {
      this.productionDirectoryState = { ...this.productionDirectoryState, record };
      this.rememberWorkbench();
    }
    const dirty = this.production.draftDirty || this.production.draftSaving;
    if (!this.documents.some(document => document.id === productionDocumentId && !!document.dirty !== dirty)) return;
    this.documents = this.documents.map(document => document.id === productionDocumentId ? { ...document, dirty } : document);
    this.refreshDocumentTabs();
  };
  private closeSubscription: (() => void) | null = null;
  private studioPlugins: StudioPluginHost | null = null;
  private pluginRenderLocale = '';
  private projectsNode = el('div', 'project-mount');
  private projectsRoot: Root | null = null;
  private dock = { current: null as DockHandle | null };
  private dockLayout: Json | undefined;
  private stageRegion: HTMLElement | null = null;
  private inspectorRoots: Root[] = [];
  private resourceProcessorRoot: Root | null = null;
  private resourceProcessorUnapplied = false;
  private resourceProcessorGuiDraft:ResourceProcessorGuiDraft|null=null;
  private captureResourceProcessorGui=(draft:ResourceProcessorGuiDraft)=>{this.resourceProcessorGuiDraft=draft;this.persistInputDraft();};
  private setResourceProcessorUnapplied = (dirty: boolean) => { this.resourceProcessorUnapplied=dirty;void this.reportAuthoringDrafts(); };
  private resourceProcessorNode = el('div');
  private renderedSceneId: Id | null = null;
  private focusRenderSequence = 0;
  private projectCreateUnapplied = false;
  private setProjectCreateUnapplied = (dirty: boolean) => { this.projectCreateUnapplied = dirty; };
  private projectDraft: ProjectDraft = { name: '', template: 'standard', width: 1920, height: 1080, engineVersion: '' };
  private workbenchNode = el('div', 'workbench-mount');
  private supportNodes = new Map(supportPages.map(page => [page, el('div', 'workbench-mount')]));
  private workbench: Root | null = null;
  private collaborationSubscriptions: (()=>void)[] = [];
  private productionInspector = el('div', 'production-inspector-mount');
  private productionDirectory = el('div', 'production-directory-mount');
  private productionDocument = el('div', 'studio-content workbench-route-host production-document-host');
  private productionNode = el('div', 'workbench-mount');
  private productionRoot: Root | null = null;
  private shellNode = el('div', 'production-workbench-mount authoring-shell');
  private shellRoot: Root | null = null;
  private shellProps: AuthoringWorkbenchProps | null = null;
  private documents: AuthorDocument[] = [];
  private readonly documentRegions = new Map<string, AuthorDocumentRegion>();
  private readonly retainedCompanions = new Map<string, AuthorSceneCompanion>();
  private outlineQuery = '';
  private outlineScrollTop = 0;
  private recentObjects: string[] = [];
  private cardRangeAnchor: {sceneId: string; id: string} | null = null;
  private treeCreateEditor: HTMLElement | null = null;
  private insertions = new Map<string, { beforeId: Id | null; node: HTMLElement; placeholder: HTMLElement; dirty(): boolean; capture?(): Json }>();
  private resourceProcessorInspector = document.createElement('div');
  private readonly documentWorkspace: DocumentWorkspace = { open: (id, title, mount) => {
    if (this.formDocuments.has(id)) { void this.openDocument(this.documents.find(item => item.id === id)!); return () => this.finishFormDocument(id); }
    const editor = mount(() => queueMicrotask(() => this.finishFormDocument(id)), () => { const form = this.formDocuments.get(id); if (form) { this.documents = this.documents.map(item => item.id === id ? { ...item, dirty: form.dirty() } : item); this.refreshDocumentTabs(); } });
    const container=el('section');container.append(editor.node);this.openFormDocument(id, title, container, editor.dirty, editor.dispose, editor.activate); return () => this.finishFormDocument(id);
  } };
  private formDocuments = new Map<string, { node: HTMLElement; page: Page; source: string; dirty(): boolean; capture?(): Json; dispose?(): void; activate?(active: boolean): void; locateDecor?(id: Id): void; inspector?: HTMLElement; scope?: import('@galcraft/contracts').DiscardScope }>();
  private activeDocument = '';
  private treeSelected: string[] = [];
  private sceneContexts = new Map<Id, { view: AuthoringController['view']; selection: AuthoringController['selection']; caret: AuthoringController['caret']; scroll: AuthoringController['scroll'] }>();
  private sceneViewContexts = new Map<Id, Map<AuthoringController['view'], { selection: AuthoringController['selection']; caret: AuthoringController['caret']; scroll: AuthoringController['scroll'] }>>();
  private splitSceneViews = new Map<Id, [AuthoringController['view'], AuthoringController['view']]>();
  private fixedStageSource: SceneStageSource | null = null;
  private fixedInspectorSource: SceneStatementSource | null = null;
  private focusedWorkbenchTool: string | null = null;
  private focusedDialogueEvent: { sceneId: Id; statementId: Id; eventId: Id } | null = null;
  private composingSceneInputs = new Set<HTMLElement>();
  private deferredSceneRender = false;
  private scriptMounts = new Map<Id, Parameters<typeof mountScriptEditor>[0]>();
  private scriptSessions = new Map<Id, { node: HTMLElement; editor: Awaited<ReturnType<typeof mountScriptEditor>> }>();
  private writingInputs = new Map<Id, HTMLTextAreaElement>();
  private projectNode = el('section', 'authoring-settings-document');
  private projectGeneral = el('div');
  private playerNameEditor: ReturnType<typeof createPlayerNameEditor> | null = null;
  private languageEditor = createRef<ProjectLanguageEditorHandle>();
  private languageNode = el('div');
  private languageRoot: Root | null = null;
  private assetRangeAnchor: Id | null = null;
  private assetInspectorView: { asset: Asset; variantId: Id | null; pinned: boolean; referenceRevision: string; locale: string; node: HTMLElement; summary: HTMLElement; visibility: HTMLElement } | null = null;
  private assetRows = new Map<Id,{asset:Asset;locale:string;node:HTMLElement}>();
  private characterNode = el('div', 'character-document');
  private readonly characterRegions = new Map<Id, { node: HTMLElement; root: Root }>();
  private characterExplorer = el('div', 'character-explorer');
  private characterSelected: Id | undefined;
  private readonly characterDirectoryNode = el('div', 'character-explorer');
  private characterDirectoryRoot: Root | null = null;
  private characterSearch = '';
  private characterSectionRequest: (NonNullable<CharacterManagerProps['sectionRequest']> & { characterId: Id }) | null = null;
  private characterSectionSequence = 0;
  private characterDocumentIds = new Map<Id, Id>();
  private characterHistory = new Map<Id, NonNullable<CharacterManagerProps['historyState']>>();
  private characterAsset: Asset | null = null;
  private characterRoot: Root | null = null;
  private characterDraft = false;
  private graphNode = el('div', 'scene-graph-document');
  private sceneToolbars = new Map<Id, { node: HTMLElement; root: Root }>();
  private graphRoot: Root | null = null;
  private startupNode = el('div', 'startup-document');
  private startupRoot: Root | null = null;
  private startupInspector = el('div', 'startup-inspector-mount');
  private startupDraft = false;
  private characterDiscardRequest: { characterId: string; request: number } | undefined;
  private voiceConnections: import('@galcraft/contracts').ConnectionConfig[] = [];
  private voiceConnectionProject: string | null = null;
  private stopStartup: (() => void) | null = null;
  private startupGeneration = 0;
  private fieldPreview: { sceneId: Id; statementId: Id; field: string; value: Json } | null = null;
  private effectEditor: { sceneId: Id; statementId: Id; field: string; draft: Json; node: HTMLElement; dispose(): void } | null = null;
  private assetToolsOpen = false;
  private modelPreparationStatus = '';
  private documentConfirm: import('./workbench-host.js').AuthoringWorkbenchProps['confirm'] = null;
  private designerResume: ReturnType<PageDesigner['capture']> | null = null;
  private projectGuiDrafts = new Map<Id, ReturnType<AuthoringWorkspace['captureProjectGui']>>();
  private switchingProject=false;
  private guiDraftReports = new Map<Id,{revision:number;summary:string}>();
  private inputDraftStore: InputDraftStore;
  private inputDraftReady = false;
  private inputDraftRestoring = false;
  private inputDraftRestoredProject: string | null = null;
  private retainedInput: Json | null = null;
  private recoveryReviewed = false;
  private publishDraftRevision = 0;
  private recoveredForms: PersistentWorkspaceInput['forms'] = [];
  private characterGuiDraft: CharacterSessionDraft | null = null;
  private publishHistory: ((action: 'undo' | 'redo') => boolean) | null = null;
  private setPublishHistory = (handler: ((action: 'undo' | 'redo') => boolean) | null) => { this.publishHistory = handler; };
  private startupGuiDraft: import('./startup-editor.js').StartupGuiDraft | null = null;
  private languageGuiDraft: import('./project-languages.js').ProjectLanguageGuiDraft | null = null;
  private playerNameGuiDraft: import('./player-name.js').PlayerNameGuiDraft | null = null;
  private professionalInputs = new Map<string,Json>();
  private productionGuiResume: PersistentWorkspaceInput['production'] = null;
  private captureCharacterGui = (draft: CharacterGuiDraft, owner?: Id) => {
    const id = draft.selected, current = this.characterGuiDraft;
    if (id && (id === owner || this.activeDocument === 'character:' + id)) {
      const drafts = { ...current?.drafts }, bases = { ...current?.bases };
      if (draft.drafts[id]) drafts[id] = draft.drafts[id]; else delete drafts[id];
      if (draft.bases?.[id]) bases[id] = draft.bases[id]; else delete bases[id];
      this.characterGuiDraft = { ...draft, selected: this.activeDocument === `character:${id}` ? id : current?.selected ?? id, drafts, bases, views: {
        ...current?.views, [id]: { section: draft.section, differenceId: draft.differenceId },
      } };
      const request = this.characterSectionRequest;
      if (request?.characterId === id && draft.section === request.section && (!request.differenceId || draft.differenceId === request.differenceId))
        this.characterSectionRequest = null;
    } else if (this.activeDocument === 'characters') this.characterGuiDraft = draft;
    this.persistInputDraft();
  };
  private captureStartupGui = (draft: import('./startup-editor.js').StartupGuiDraft) => { this.startupGuiDraft = draft; this.persistInputDraft(); };
  private captureLanguageGui = (draft: import('./project-languages.js').ProjectLanguageGuiDraft) => { this.languageGuiDraft = draft; this.persistInputDraft(); };
  private designer: PageDesigner | null = null;
  private pageDirectoryRequested = false;
  private designerProjectRevision: number | null = null;
  private designerSceneRevisions = new Map<Id, number>();
  readonly controller: AuthoringController;
  page: Page = 'projects';
  private readonly debugRouteIntent = new DebugRouteIntent();
  private miniStage: MiniStage | null = null;
  private animationMiniStage: MiniStage | null = null;
  private get animationStage() { return this.animationMiniStage ?? this.miniStage; }
  private renderedPage: Page | null = null;
  private pageScroll = new Map<Page, number>();
  private messageValue = '';
  private noticeIssue: import('@galcraft/contracts').Issue | null = null;
  private noticeRecovery: { label: string; run(): void } | undefined;
  get message() { return this.messageValue; }
  set message(value: string) { this.messageValue = value; this.noticeIssue = null; this.noticeRecovery = undefined; }
  private messageTone = 'info';
  private noticeAsset: string | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeText = '';
  private noticeExpires = 0;
  private assetTypes: AssetTypeCatalogEntry[] = [];
  private assetProjectEpoch = 0;
  private assetQueryGeneration = 0;
  private assetRequestedRevision: number | null | undefined;
  private assetQueryPending = false;
  private assetQueryError: string | null = null;
  assetQuery: AssetQuery = { kind: null, text: '', offset: 0, limit: 40 };
  assetPage: { items: Asset[]; total: number; indexRevision: number } | null = null;
  selectedAssets = new Set<Id>();
  selectedAtIndexRevision: number | null = null;
  queryAtSelection: AssetQuery | null = null;
  private assetCache = new Map<Id, Asset>();
  private selectedDetails: AssetListIdentity[] | null = null;
  private missingSelected: Id[] = [];
  private assetImportResults: { id: number; result: AssetImportResult }[] = [];
  private assetImportSequence = 0;
  private focusedAssetId: Id | null = null;
  private get focusedAsset(): Asset | null { return this.focusedAssetId ? this.assetCache.get(this.focusedAssetId) ?? null : null; }
  private readonly assetDirectory = createAssetDirectory();
  private readonly assetVariants = new Map<Id, Id>();
  private readonly assetPreviewVersions = new Map<Id, Id>();
  private readonly assetPreviews = new Map<Id, { revision: number; variantId: Id; locale: string; view: ReturnType<typeof createAssetWorkbenchPreview> }>();
  private assetInspectorPin: { assetId: Id; variantId: Id } | null = null;
  private assetFocusGeneration = 0;
  private assetPreviewGeneration = 0;
  private assetLibraryScroll = 0;
  private assetReferenceOrigin: { assetId: Id; variantId: Id; pinned: boolean; primaryId: Id | null; query: AssetQuery; selectedIds: Id[];
    selectionRevision: number | null; selectionQuery: AssetQuery | null; scroll: number; focus: string } | null = null;
  private assetReferenceReturnFocus: { assetId: Id; key: string } | null = null;
  private closeAssetBindDialog: (() => void) | null = null;
  private thumbnailGeneration = 0;
  private inspectorShown = () => {
    if (this.controller.source) requestAnimationFrame(() => { if (this.controller.source) void this.loadThumbnails(this.thumbnailGeneration); });
  };
  private thumbnailsActive = false;
  private mattingCandidate: { assetId: Id; preparationId: Id; previewUri: string; references: BackgroundReference[]; selectedSourceKeys: Set<string> } | null = null;
  private mattingBusy = false;
  private preparingModel = false;
  private sidebarState = initialSidebarState();
  private sidebarView: { view: ReturnType<typeof createAuthoringSidebar>; locale: StudioLocale; state: SidebarState } | null = null;
  private searchOrigin: {
    document: AuthorDocument;
    scene?: { revision: number; view: AuthoringController['view']; selection: AuthoringController['selection']; caret: AuthoringController['caret']; scroll: AuthoringController['scroll'] };
  } | null = null;
  private scriptEditor: Awaited<ReturnType<typeof mountScriptEditor>> | null = null;
  private scriptReveal: { documentId: Id; revision: number; offset: number } | null = null;
  private scriptDrafts = new Map<Id, string>();
  private scriptDraftOrigins = new Map<Id, number>();
  private writingDrafts = new Map<Id, string>();
  private writingDraftOrigin: { documentId: Id; revision: number } | null = null;
  private writingPending = Promise.resolve(true);
  private sessionId: Id | null = null;
  private commandShortcut = (event: KeyboardEvent) => {
    if (!this.root.isConnected || event.defaultPrevented || event.isComposing || this.composingSceneInputs.size || event.altKey || !(event.ctrlKey || event.metaKey) || hasWorkbenchModal()) return;
    const key = event.key.toLowerCase();
    if (key === 'p') { event.preventDefault(); this.openCommandCenter(event.shiftKey ? 'commands' : 'objects'); }
    else if (key === 's') { event.preventDefault(); void this.save(event.shiftKey); }
    else if (['z','y'].includes(key) && event.target === document.body) { event.preventDefault(); void this.shellAction(key === 'y' || event.shiftKey ? 'redo' : 'undo'); }
  };
  constructor(readonly root: HTMLElement, readonly services: ShellServices) { this.controller = new AuthoringController(services); this.inputDraftStore = new InputDraftStore(services.bridge.authoringPreferences, message => { this.messageTone = 'error'; this.message = tr(this.controller.preferences.locale, '未应用输入保存失败：', 'Unable to retain unapplied input: ', '未適用入力を保存できません：') + message; }); installTransientScrollbars(root); observeFormHints(root); }
  private t(key: keyof typeof words['zh-CN']): string { return words[this.controller.preferences.locale][key]; }
  private references(): ReferenceOption[] {
    const source = this.controller.source;
    const locale = this.controller.preferences.locale;
    const objects: ReferenceOption[] = (source?.scenes ?? []).flatMap(scene => parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).cst.flatMap((node, order) => {
      const args = node.object?.value as Record<string, unknown> | undefined;
      if (!node.valid || !node.id || !['changeBg', 'changeFigure', 'changeIllustration'].includes(node.command) || (args?.op ?? 'show') !== 'show' || typeof args?.objectId !== 'string') return [];
      const character = source!.characters.find(item => item.id === args.characterId), asset = this.assetCache.get(String(args.assetId ?? ''));
      return [{ kind: 'object' as const, id: args.objectId, name: character?.name ?? (node.command === 'changeBg' ? tr(locale, '背景', 'Background', '背景') : node.command === 'changeFigure' ? tr(locale, '立绘', 'Figure', '立ち絵') : tr(locale, '插图', 'Illustration', 'イラスト')),
        appearance: `${node.command === 'changeBg' ? tr(locale,'背景','Background','背景') : node.command === 'changeFigure' ? tr(locale,'立绘','Figure','立ち絵'):tr(locale,'插图','Illustration','イラスト')} · ${asset?.name ?? tr(locale, '素材引用', 'Asset reference', '素材参照')} · ${enumLabel(String(args.station ?? 'center'), locale)}`,
        detail: `${source!.project.chapters.find(item => item.id === scene.chapterId)?.name ?? ''} / ${scene.name} · ${tr(locale, '指令', 'Command', 'コマンド')} ${order + 1}`,
        source: { sceneId: scene.sceneId, statementId: node.id, documentId: scene.documentId, order } }];
    }));
    return [...(source?.characters.map(item => ({ kind: 'character' as const, id: item.id, name: item.name })) ?? []),
      ...(source?.scenes.map(item => ({ kind: 'scene' as const, id: item.sceneId, name: item.name })) ?? []),
      ...(source?.variables?.map(item => ({ kind: 'variable' as const, id: item.id, name: item.name })) ?? []),
      ...(source?.references?.filter(item => item.kind !== 'object') ?? []), ...groupAnimationTargets(objects).map(option => ({ ...option, kind: 'object' as const }))];
  }
  async start(): Promise<void> {
    this.controller.reviewHistory = async plan => { const listed = await this.services.bridge.documents.list(); return listed.ok && requestHistoryReview(plan, listed.value, this.controller.preferences.locale); };
    await this.controller.open();
    if (!this.controller.source) await this.reopenLastProject();
    this.page = this.controller.source ? 'editor' : 'projects';
    if (this.controller.source) {
      await this.rememberOpenProject();
      await this.refreshEngineHealth();
      await this.loadQuickAssets(); await this.refreshStudioPlugins();
    }
    this.restoreSceneLayout();
    const active = this.restoreWorkbenchDocuments();
    this.restoreAssetWorkspace();
    await this.restoreInputDraft(); this.inputDraftReady = true;
    await this.resumeWorkbench(active);
    if (this.controller.source) void this.checkRecovery();
    const collaborationBridge=this.services.bridge as import('../../desktop-bridge.js').DesktopBridge;
    if (collaborationBridge.onCollaborationChanged) this.collaborationSubscriptions.push(collaborationBridge.onCollaborationChanged(() => {
      void (async () => {
        if (this.controller.engineIssue) await this.refreshEngineHealth();
        if (!await this.flushScript()) return;
        await this.controller.refresh();
        if (this.assetPage?.indexRevision !== this.controller.source?.assetIndexRevision) await this.showAssets();
        else this.render();
      })();
    }));
    if(collaborationBridge.onCollaborationNavigate)this.collaborationSubscriptions.push(collaborationBridge.onCollaborationNavigate(input=>{void (async()=>{if(input.projectChanged){await this.refreshCollaborationProject();return;}if(input.documentId){const scene=this.controller.source?.scenes.find(item=>item.documentId===input.documentId);if(scene){await this.openDocument({kind:'scene',objectId:scene.sceneId});return;}}await this.navigate(input.page==='creation'?'editor':input.page==='player-ui'?'pages':input.page as Page);if(input.taskId&&this.activeDocument===productionDocumentId)await this.production?.openTask(input.taskId);})();}));
    this.closeSubscription = this.services.bridge.onCloseRequested?.(() => this.choiceForClose('exit')) ?? null;
    window.addEventListener('keydown', this.commandShortcut, true);
    window.addEventListener('unload', () => this.dispose(), { once: true });
    this.root.addEventListener('input', () => queueMicrotask(() => this.persistInputDraft()), true);
    this.root.addEventListener('change', () => queueMicrotask(() => this.persistInputDraft()), true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) void this.flushInputDrafts().catch(() => {}); });
    window.addEventListener('pagehide', () => { void this.flushInputDrafts().catch(() => {}); });
    this.root.addEventListener('contextmenu', event => {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || !this.studioPlugins || target.closest('input,textarea,[contenteditable="true"],.monaco-editor') || !this.studioPlugins.tools('context.menu').length) return;
      const card = target.closest<HTMLElement>('[data-statement-id]'), asset = target.closest<HTMLElement>('[data-plugin-asset-id]');
      if (!card && !asset) return;
      event.preventDefault(); if (card?.dataset.statementId && !this.controller.selection?.statementIds.includes(card.dataset.statementId)) this.controller.select([card.dataset.statementId]);
      void (async () => { if (!await this.flushScript()) return; this.studioPlugins?.publishScope(); this.studioPlugins?.openTools('context.menu'); })();
    });
    this.root.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.isComposing || this.composingSceneInputs.size || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement;
      if (hasWorkbenchModal()) return;
      const key = event.key.toLowerCase();
      if (key === 'p') { event.preventDefault(); this.openCommandCenter(event.shiftKey ? 'commands' : 'objects'); return; }
      if (key === 's') { event.preventDefault(); void this.save(event.shiftKey); return; }
      if (hasLocalTextHistory(target)) return;
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        void this.shellAction(key === 'y' || event.shiftKey ? 'redo' : 'undo');
      }
    }, true);
  }
  private async reopenLastProject(): Promise<void> {
    const preferences = await this.services.readPreferences();
    if (!preferences.ok) return;
    this.controller.preferences = preferences.value;
    const remembered = preferences.value.resumeProject;
    if (!remembered || !this.services.bridge.service) return;
    const inspected = await this.services.bridge.projects.inspect(remembered.directory);
    const opened = inspected.ok && inspected.value.projectId === remembered.projectId
      ? await this.services.openProject(remembered.directory) : null;
    if (opened?.ok) {
      this.sessionId = opened.value.sessionId;
      const loaded = await this.controller.open();
      if (loaded.ok) return;
    }
    const locale = this.controller.preferences.locale;
    const issue = opened && !opened.ok ? issueText(opened.error, locale) : !inspected.ok ? issueText(inspected.error, locale) : remembered.directory;
    this.message = `${tr(locale, '上次作品暂时无法打开', 'Could not reopen the last project', '前回の作品を開けませんでした')} · ${issue}`;
    this.messageTone = 'error';
  }
  private async rememberOpenProject(): Promise<void> {
    const current = (await this.services.bridge.service?.status())?.project;
    if (!current || current.projectId !== this.controller.source?.project.projectId) return;
    this.sessionId = current.sessionId;
    const saved = this.controller.preferences.resumeProject;
    if (saved?.projectId !== current.projectId || saved.directory !== current.directory) {
      const result = await this.controller.setPreference(prefs => ({ ...prefs, resumeProject: { projectId: current.projectId, directory: current.directory } }));
      if (!result.ok) this.notice(result);
    }
  }
  private async refreshEngineHealth(): Promise<void> {
    const projectId = this.controller.source?.project.projectId;
    if (!projectId || !this.services.bridge.engines?.health) return;
    const health = await this.services.bridge.engines.health().catch(() => null);
    if (health?.ok && projectId === this.controller.source?.project.projectId)
      this.controller.engineIssue = health.value.issues.find(issue => issue.severity === 'error') ?? null;
  }
  dispose(): void {
    this.sidebarView?.view.dispose();
    this.scriptMounts.clear();
    void this.flushInputDrafts().catch(() => {});
    this.disposed=true;
    for(const cached of this.projectGuiDrafts.values()){cached.production?.stop();cached.startup.root?.unmount();cached.character.root?.unmount();cached.project.languageRoot?.unmount();cached.project.playerNameEditor?.dispose();for(const form of cached.forms.values())form.dispose?.();}this.projectGuiDrafts.clear();
    window.removeEventListener('keydown', this.commandShortcut, true);
    this.insertions.clear();
    for (const form of this.formDocuments.values()) form.dispose?.(); this.formDocuments.clear();
    this.assetDirectory.dispose(); this.disposeAssetPreview(); this.closeAssetBindDialog?.(); this.characterDirectoryRoot?.unmount();
    if (this.assetInspectorView) disposeAssetInspector(this.assetInspectorView.node);
    this.collaborationSubscriptions.splice(0).forEach(unsubscribe=>unsubscribe());
    this.closeSubscription?.(); this.closeSubscription = null; this.productionSubscription?.(); this.productionSubscription = null; this.production?.stop();
    this.stopStartup?.(); this.designer?.dispose(); this.miniStage?.dispose(); this.animationMiniStage?.dispose(); this.effectEditor?.dispose();
    for (const session of this.scriptSessions.values()) session.editor.dispose(); this.scriptSessions.clear(); this.writingInputs.clear();
    this.resourceProcessorRoot?.unmount(); this.resourceProcessorRoot = null;
    this.disposeCharacterRegions();
    this.playerNameEditor?.dispose();this.languageRoot?.unmount(); this.startupRoot?.unmount(); this.characterRoot?.unmount(); this.graphRoot?.unmount(); this.projectsRoot?.unmount(); this.workbench?.unmount(); this.productionRoot?.unmount();
    for (const toolbar of this.sceneToolbars.values()) toolbar.root.unmount();
    this.sceneToolbars.clear();
    this.outputRoot?.unmount(); this.preferencesRoot?.unmount();
    this.shellRoot?.unmount(); this.shellRoot = null; this.controller.close(); void this.studioPlugins?.dispose();
  }
  private presetLifecycle(args: Record<string, unknown>, preset: AppliedAnimationPreset) {
    const object = this.animationStage?.animationTarget(args.target);
    if (!object) throw new Error(tr(this.controller.preferences.locale, '先在当前舞台确认具体对象，再应用出入场预设。', 'Confirm the specific object on the current stage before applying an entrance or exit preset.', '現在の舞台で対象を確認してから登退場プリセットを適用してください。'));
    const background = object.layer === 'background', command = background ? 'changeBg' : object.purpose === 'illustration' ? 'changeIllustration' : 'changeFigure';
    const transition = { preset: 'custom', direction: 'left', resourceId: null, animation: preset.animation,
      durationMs: preset.animation.durationMs, easing: { family: 'linear', direction: 'in' } };
    const next = preset.lifecycle === 'exit' ? { op: background ? 'clear' : 'exit', ...(!background ? { objectId: object.id } : {}), transition: { exit: transition } }
      : { op: 'show', objectId: object.id, assetId: object.assetId, ...(!background ? { ...(object.characterId ? { characterId: object.characterId } : {}), ...(command === 'changeFigure' ? { station: object.station, framing: object.framing, z: object.current.z } : { illustrationFrame: object.illustrationFrame }) } : { ...object.backgroundFrame }), effects: object.current, transition: { enter: transition, exit: object.transition.exit } };
    return { command, args: next };
  }
  private async applyComplexPreset(args: Record<string, unknown>, preset: AppliedAnimationPreset, draft: boolean, commit: FieldCommit, statementId?: Id, replaceDraft?: (command:string,args:Record<string,Json>)=>void) {
    if (draft && preset.lifecycle !== 'property' && replaceDraft) { const next=this.presetLifecycle(args,preset);replaceDraft(next.command,next.args as Record<string,Json>);return; }
    if (!draft && preset.lifecycle !== 'property') {
      const source = this.controller.scene, node = this.controller.parsed()?.parsed.cst.find(item => item.id === statementId);
      if (!source || !node?.id) throw new Error('来源指令不可用');
      const next = this.presetLifecycle(args, preset);
      const error = await this.applyWorkbenchObject({ label: tr(this.controller.preferences.locale,'应用出入场预设','Apply entrance or exit preset','登退場プリセットを適用'), origin:'field',
        expected:[{ref:{kind:'document',id:source.documentId},revision:source.revision}], patches:[{kind:'text',documentId:source.documentId,edits:[{start:node.start,end:node.end,before:source.text.slice(node.start,node.end),after:`${next.command} ${JSON.stringify(next.args)} @${node.id};`}]}],preparedAssets:[],requiredRefs:[] });
      if (error) throw new Error(error); this.render(); return;
    }
    const animationId = typeof args.animationId === 'string' ? args.animationId : createId(this.controller.source);
    const changes = [...animationSourceChanges(args,'animation',preset.animation as unknown as Json), {field:'animationId',op:'set' as const,value:animationId}, {field:'keepFinal',op:'set' as const,value:preset.keepFinal}, {field:'loop',op:'set' as const,value:preset.loop}];
    if (draft) {
      delete args.segments; delete args.resourceId; Object.assign(args,{animation:preset.animation,animationId,keepFinal:preset.keepFinal,loop:preset.loop});
      const result=await commit(preset.animation as unknown as Json); if(result&&!result.ok)throw new Error(result.error.message);
    } else { const result=await this.controller.editFields(changes,statementId?[statementId]:[]); if(!result.ok)throw new Error(result.error.message); this.render(); }
  }
  private fieldContext(args: Record<string, unknown>, scope = this.root, draft = false, figureKind?: 'image' | 'live2d', replaceDraft?: (command:string,args:Record<string,Json>)=>void): FieldContext {
    const speaker=args.speaker as {kind?:string;id?:string}|undefined;
    const characterId=typeof args.characterId==='string'?args.characterId:speaker?.kind==='character'?speaker.id:undefined,character=this.controller.source?.characters.find(item=>item.id===characterId);
    const scene = this.controller.scene, selection = JSON.stringify(this.controller.selection?.statementIds ?? []);
    return { services: this.services, projectId: this.controller.source!.project.projectId, scope,
      animationInstances: (this.controller.source?.scenes ?? []).flatMap(source => parse({ documentId: source.documentId, revision: source.revision, text: source.text }).cst.flatMap((node, index) => {
        const current = node.object?.value as Record<string, unknown> | undefined;
        if (!node.valid || !['setAnimation', 'setComplexAnimation'].includes(node.command) || typeof current?.animationId !== 'string') return [];
        const target = current.target as { kind?: string; id?: string; station?: string } | undefined;
        const objectName = target?.kind === 'object' ? this.references().find(ref => ref.kind === 'object' && ref.id === target.id)?.name ?? target.id
          : target?.kind === 'stage' ? tr(this.controller.preferences.locale, '相机', 'Camera', 'カメラ') : target?.station;
        const material = this.assetCache.get(String(current.resourceId ?? current.presetId))?.name;
        return [{ id: current.animationId, name: `${source.name} · ${objectName ?? tr(this.controller.preferences.locale, '目标待设置', 'Choose target', '対象未設定')} · ${material ?? tr(this.controller.preferences.locale, '动画', 'Animation', 'アニメーション')} · ${index + 1}${current.loop ? tr(this.controller.preferences.locale, ' · 循环', ' · Loop', '・ループ') : ''}` }];
      })),
      highlightObject: id => this.miniStage?.highlightObject(id),
      targetAvailability: id => scene && this.controller.selection?.primaryId ? this.miniStage?.objectAvailability(id, { sceneId: scene.sceneId, statementId: this.controller.selection.primaryId }) ?? 'unknown' : 'unknown',
      locateObject: option => { if (option.source) void this.openDocument({ kind: 'scene', objectId: option.source.sceneId }).then(() => { this.controller.select([option.source!.statementId], option.source!.statementId); this.render(); }); },
      animationEditor: (mount, value, commit) => {
        const presets=document.createElement('div'),presetRoot=createRoot(presets);this.inspectorRoots.push(presetRoot);mount.append(presets);
        presetRoot.render(createElement(AnimationPresetPicker,{locale:this.controller.preferences.locale,context:this.miniStage?.animationContext(args.target)??{stageWidth:this.controller.source!.project.canvas.width},apply:preset=>this.applyComplexPreset(args,preset,draft,commit,this.controller.selection?.primaryId??undefined,replaceDraft)}));
        mount.append(el('p','field-help',tr(this.controller.preferences.locale,args.resourceId?'引用动画素材':args.segments?'此处编辑的动画分段':'此处编辑的动画',args.resourceId?'Referenced animation asset':args.segments?'Inline animation segments':'Inline animation',args.resourceId?'アニメーション素材を参照':'この指令のアニメーション')));
        mount.append(button(tr(this.controller.preferences.locale,'打开动画时间轴','Open animation timeline','タイムラインを開く'), async () => {
        try {
        let actual=args.animation??value;
        if(args.resourceId){const asset=this.assetCache.get(String(args.resourceId));if(!asset)throw new Error('动画素材不可用');const lease=await this.services.runtimeAssets?.resolveRuntime(asset.id,asset.activeVariantId);if(!lease?.ok)throw new Error('动画素材无法读取');try{const loaded=parseAnimationResource(await(await fetch(lease.value.uri)).json(),args.parameters as Record<string,unknown>??{});if(!loaded.ok)throw new Error(loaded.error.message);actual=Array.isArray(loaded.value)?segmentAnimation(loaded.value,this.miniStage?.animationTarget(args.target)?.current):loaded.value;}finally{await this.services.runtimeAssets?.releaseRuntime(lease.value.leaseId);}}
        else if(Array.isArray(args.segments)&&args.segments.length)actual=segmentAnimation(args.segments,this.miniStage?.animationTarget(args.target)?.current);
        value=actual;
        if (value != null && !NativeAnimationSchema.safeParse(value).success) { this.messageTone = 'error'; this.message = NativeAnimationSchema.safeParse(value).error!.message; this.updateStatus(); return; }
        const id = `animation:${scene?.sceneId}:${this.controller.selection?.primaryId ?? 'draft'}`;
        if (this.formDocuments.has(id)) { void this.openDocument(this.documents.find(document => document.id === id)!); return; }
        const container = el('section','animation-workspace'), editor = el('div'), preview = el('div','animation-stage-preview'), targets = el('section','animation-target-editor'), root = createRoot(editor); container.append(targets, editor); let dirty = false, animationTarget = args.target, animationValue = NativeAnimationSchema.safeParse(value).data ?? initialAnimation();
        const statementId = this.controller.selection?.primaryId;let editRevision=scene?.revision;
        const draw = (active = true) => { const current = !draft && statementId ? this.controller.parsed()?.parsed.cst.find(node => node.id === statementId)?.object?.value as Record<string, unknown> | undefined : undefined;
        if (!dirty) animationValue = NativeAnimationSchema.safeParse(current?.animation ?? value).data ?? animationValue;
        animationTarget = current?.target ?? animationTarget;
        if (animationTarget && typeof animationTarget === 'object' && (animationTarget as { kind?: string }).kind === 'object') this.animationStage?.highlightObject(String((animationTarget as { id?: string }).id));
        const target = createCommandRegistry(this.controller.source!.project.engineVersion).get('setComplexAnimation')?.fields.find(field => field.path === 'target');
        if (target) targets.replaceChildren(inputFor(target, animationTarget, async next => { animationTarget = next; args.target = next;
          if (draft) return; const result = await this.controller.editFields([{ field: 'target', op: 'set', value: next }], statementId ? [statementId] : []); if (this.notice(result)) this.render(); return result;
        }, [...this.assetCache.values()], this.references(), this.controller.preferences.locale, false, undefined, this.fieldContext(args, targets, draft)));
        flushSync(() => root.render(createElement(AnimationWorkbench, { guiDraft:this.professionalInputs.get(id) as unknown as import('./professional/AnimationWorkbench.js').AnimationGuiDraft,onGuiDraftChange:state=>{this.professionalInputs.set(id,asJson(state));this.persistInputDraft();},animation: animationValue, locale: this.controller.preferences.locale, active,
          preview: createElement(DomRegion, { node: preview }), statusLabel: tr(this.controller.preferences.locale,'确认后进入作品，保存后落盘','Apply to working content; save to disk','確定して作品に適用、保存してディスクへ'),
          targetLabel: tr(this.controller.preferences.locale,'上方选择预览与执行目标','Choose the preview and execution target above','上で対象を選択'),
          presetContext: this.animationStage?.animationContext(animationTarget) ?? { stageWidth: this.controller.source!.project.canvas.width },
          onGenerate: request => { const object = this.animationStage?.animationTarget(animationTarget); return this.createAnimationWithAi({ ...request, targetContext: JSON.stringify({ canvas: this.controller.source!.project.canvas, target: animationTarget, object: object ? { id: object.id, assetId: object.assetId, variantId: object.variantId, layer: object.layer, station: object.station, current: object.current, framing: object.framing, backgroundFrame: object.backgroundFrame } : null }) }, { sceneId: scene?.sceneId, statementId }); },
          onPreset: async preset => { await this.applyComplexPreset(args,preset,draft,commit,statementId??undefined,replaceDraft); animationValue=preset.animation;editRevision=this.controller.scene?.revision; if(preset.lifecycle!=='property')this.finishFormDocument(id); },
          onDraftChange: next => { dirty = next; this.documents = this.documents.map(document => document.id === id ? { ...document, dirty: next || this.controller.scene?.dirty } : document); this.refreshDocumentTabs(); },
          onChange: async next => { if (!draft && (this.controller.scene?.sceneId !== scene?.sceneId||this.controller.scene?.revision!==editRevision)) throw new Error(tr(this.controller.preferences.locale,'请返回来源场景后重试。','Return to the source scene and retry.','元のシーンを開いて再試行してください。')); const result = await commit(next as unknown as Json); if (result && !result.ok) throw new Error(result.error.message); animationValue = next;editRevision=this.controller.scene?.revision; },
          onPreview: (next, time) => { if (active) void this.animationStage?.sampleAnimation(next, time, animationTarget); },
          onSave: async (name, animation) => { const result = await this.services.saveAnimation?.({ name, animation }); if (!result) throw new Error('动画资源保存服务不可用'); if (!result.ok) throw new Error(result.error.message);
            const asset = await this.services.getAsset?.(result.value.assetId); if (asset?.ok && asset.value) this.assetCache.set(asset.value.id, asset.value);
            await this.controller.refresh(); return tr(this.controller.preferences.locale,'动画已入库，可在演出预设或出入场中选择。','Animation saved. Select it in a preset or transition.','保存済み。プリセットや切り替えで選択できます。'); },
        }))); }; draw(); this.openFormDocument(id, tr(this.controller.preferences.locale,'动画时间轴','Animation timeline','アニメーションタイムライン'), container, () => dirty, () => root.unmount(), draw);this.formDocuments.get(id)!.capture=()=>asJson({kind:'animation',sceneId:scene?.sceneId,statementId,args,draft,gui:this.professionalInputs.get(id)}); if (scene && !draft) this.formDocuments.get(id)!.scope = { documentId: scene.documentId };
        } catch (error) { this.messageTone = 'error'; this.message = error instanceof Error ? error.message : String(error); this.updateStatus(); }
        }));
      },
      audioEditor: !draft && scene && this.controller.selection?.primaryId ? mount => {
        mount.append(button(tr(this.controller.preferences.locale,'编辑声音循环','Edit audio loop','音声ループを編集'), () => {
          const statementId = this.controller.selection?.primaryId; if (!statementId) return;
          const id = `audio-loop:${scene.sceneId}:${statementId}`;
          if (this.formDocuments.has(id)) { void this.openDocument(this.documents.find(document => document.id === id)!); return; }
          const container = el('section', 'audio-loop-workspace'), editor = el('div'), root = createRoot(editor); container.append(editor);
          let dirty = false,editRevision=scene.revision, loop: PreviewPlayback = { loopStartSec: typeof args.loopStartSec === 'number' ? args.loopStartSec : null, loopEndSec: typeof args.loopEndSec === 'number' ? args.loopEndSec : null };
          const draw = (active = true) => {
            const node = this.controller.parsed()?.parsed.cst.find(node => node.id === statementId), current = node?.object?.value as Record<string, unknown> | undefined;
            if (!dirty && current) loop = { loopStartSec: typeof current.loopStartSec === 'number' ? current.loopStartSec : null, loopEndSec: typeof current.loopEndSec === 'number' ? current.loopEndSec : null };
            const asset = this.assetCache.get(String(current?.assetId ?? args.assetId ?? ''));
            const inherited = node?.command === 'bgm' ? asset?.variants.find(variant => variant.id === asset.activeVariantId)?.metadata.loop : undefined;
            const fallback: PreviewPlayback = { loopStartSec: current?.loopStartSec === undefined && inherited ? inherited.startSec : typeof current?.startSec === 'number' ? current.startSec : 0, loopEndSec: current?.loopEndSec === undefined && inherited ? inherited.endSec : null };
            root.render(createElement(LeasedAudioLoopEditor, { guiDraft:this.professionalInputs.get(id) as unknown as import('./professional/AudioLoopWorkbench.js').AudioLoopGuiDraft,onGuiDraftChange:state=>{this.professionalInputs.set(id,asJson(state));this.persistInputDraft();},asset: asset?.kind === 'audio' ? asset : undefined, resources: this.services.runtimeAssets, value: loop, fallback, locale: this.controller.preferences.locale, active, loop: typeof current?.loop === 'boolean' ? current.loop : node?.command === 'bgm',
              onDraftChange: next => { dirty = next; this.documents = this.documents.map(document => document.id === id ? { ...document, dirty: next || this.controller.scene?.dirty } : document); this.refreshDocumentTabs(); },
              onChange: async next => {
                if (this.controller.scene?.sceneId !== scene.sceneId||this.controller.scene?.revision!==editRevision) throw new Error(tr(this.controller.preferences.locale,'请返回来源场景后重试。','Return to the source scene and retry.','元のシーンを開いて再試行してください。'));
                const result = await this.controller.editFields([{ field: 'loopStartSec', op: next.loopStartSec === null ? 'inherit' : 'set', value: next.loopStartSec }, { field: 'loopEndSec', op: next.loopEndSec === null ? 'inherit' : 'set', value: next.loopEndSec }], [statementId]);
                if (!result.ok) throw new Error(result.error.message); loop = next;editRevision=this.controller.scene!.revision; dirty = false; this.render();
              } }));
          };
          draw(); this.openFormDocument(id, tr(this.controller.preferences.locale,'声音循环','Audio loop','音声ループ'), container, () => dirty, () => root.unmount(), draw);this.formDocuments.get(id)!.capture=()=>asJson({kind:'audio',sceneId:scene.sceneId,statementId,args,gui:this.professionalInputs.get(id)}); this.formDocuments.get(id)!.scope = { documentId: scene.documentId };
        }));
      } : undefined,
      sceneId: this.controller.scene?.sceneId, characterId, characterName:character?.name,differences:character?.differences??[],
      voiceLocale:this.controller.source!.project.languages.voiceDefault,
      modelAsset: this.assetCache.get(String(args.assetId ?? '')), figureKind, draft, cache: asset => this.assetCache.set(asset.id,asset),
      assetEditor: (root, value, commit) => {
        const asset = this.assetCache.get(String(args.assetId ?? ''));
        const variant = asset?.variants.find(item => item.id === (typeof args.variantId === 'string' ? args.variantId : asset.activeVariantId));
        if (!asset || !variant || !scene) return false;
        const type = this.assetTypes.find(item => item.descriptor.key === asset.kind && (!variant.typeData || item.provider?.id === variant.typeData.provider.id && item.provider.version === variant.typeData.provider.version));
        if (!type?.provider || !type.descriptor.editorKey || !this.services.assetUi) return false;
        const statementId = this.controller.selection?.statementIds[0]; if (!statementId) return false;
        const release = this.services.assetUi.mountEditor(root, { target: { kind: 'command', documentId: scene.documentId, statementId, expectedRevision: scene.revision, readonly: false },
          kind: asset.kind, resource: { assetId: asset.id, variant }, value,
          typeData: variant.typeData ?? { typeVersion: 1, provider: type.provider, value: {} },
          commit: async next => {
            if (!draft && (this.controller.scene?.documentId !== scene.documentId || this.controller.scene.revision !== scene.revision || JSON.stringify(this.controller.selection?.statementIds ?? []) !== selection)) {
              const error = { code: 'PLUGIN_FIELD_CONTEXT_CHANGED', severity: 'error' as const, owner: 'M01' as const, message: '字段来源或选择已变化，请重新打开字段', related: [], actions: [] }; return { ok: false, error, issues: [error] };
            }
            const result = await commit(next); return result && !result.ok ? result : { ok: true, value: undefined, warnings: [] };
          } });
        return !!release;
      },
      publicEditor: (contribution, field, root, value, commit) => this.studioPlugins?.mountFieldEditor(contribution, field, root, value, async next => {
        if (!draft && (this.controller.scene?.documentId !== scene?.documentId || this.controller.scene?.revision !== scene?.revision || JSON.stringify(this.controller.selection?.statementIds ?? []) !== selection)) {
          const error = { code: 'PLUGIN_FIELD_CONTEXT_CHANGED', severity: 'error' as const, owner: 'M01' as const, message: '字段来源或选择已变化，请重新打开字段', related: [], actions: [] }; return { ok: false, error, issues: [error] };
        }
        const result = await commit(next); return result && !result.ok ? result : { ok: true, value: undefined, warnings: [] };
      }) ?? false };
  }
  private async loadQuickAssets(): Promise<void> {
    const result = await this.services.queryAssets({ kind: null, text: '', offset: 0, limit: 40 });
    if (!result.ok) { this.message = result.error.message; return; }
    result.value.items.forEach(asset => this.assetCache.set(asset.id, asset));
    const source=this.controller.source;if(!source||!this.services.getAsset)return;
    const registry=createCommandRegistry(source.project.engineVersion), ids=new Set<Id>();
    for (const key of ['splash', 'titleBackground', 'titleMusic', 'titleVideo'] as const) { const id = source.project.display[key]; if (id) ids.add(id); }
    for (const character of source.characters) {
      if (character.avatar) ids.add(character.avatar);
      for (const id of character.appearance?.referenceAssets ?? []) ids.add(id);
      for (const group of character.groups ?? []) for (const id of group.assetIds) ids.add(id);
      for (const difference of character.differences ?? []) {
        ids.add(difference.figure.assetId);
        if (difference.avatar?.kind === 'image') ids.add(difference.avatar.assetId);
      }
      if (character.afterstory?.presentation) ids.add(character.afterstory.presentation.figure.assetId);
    }
    for(const scene of source.scenes)for(const node of parse({documentId:scene.documentId,revision:scene.revision,text:scene.text}).cst){
      const spec=registry.get(node.command);if(spec&&node.object)commandAssetIds(spec.fields,node.object.value as Record<string,unknown>).forEach(id=>ids.add(id));
    }
    await Promise.all([...ids].filter(id=>!this.assetCache.has(id)).map(async id=>{const asset=await this.services.getAsset!(id);if(asset.ok&&asset.value)this.assetCache.set(id,asset.value);}));
  }
  private lastInputContent = new Map<string, string>();
  private inputOriginVersions: PersistentWorkspaceInput["versions"] | null = null;
  private captureInputDraft(): PersistentWorkspaceInput | null {
    const source = this.controller.source; if (!source) return null;
    const connection = this.production?.connectionGuiDraft;
    const designer=this.designer?.capture()??this.designerResume;
    const currentVersions=source.documentVersions??[{ documentId: source.projectDocumentId, revision: source.projectRevision }, ...source.scenes.map(scene => ({ documentId: scene.documentId, revision: scene.revision }))];
    const language=this.languageEditor.current?.capture()??this.languageGuiDraft,playerName=this.playerNameEditor?.capture()??this.playerNameGuiDraft;
    const otherDirty=!!(this.scriptDrafts.size||this.writingDrafts.size||this.unappliedInput(true,false)||language&&(JSON.stringify(language.draft)!==language.baseline||language.additional)||playerName&&JSON.stringify(playerName.values)!==JSON.stringify(playerName.baseline)||Object.keys(this.characterGuiDraft?.drafts??{}).length||Object.keys(this.startupGuiDraft?.buffers??{}).length||Object.keys(designer?.fieldInputs??{}).length||Object.keys(designer?.behaviorDrafts??{}).length||[...this.formDocuments.values()].some(form=>form.dirty()));
    const dirty=otherDirty||this.publishUnapplied;
    if(dirty&&!this.inputOriginVersions)this.inputOriginVersions=structuredClone(currentVersions);
    if(!dirty)this.inputOriginVersions=null;
    return { version: 1, projectId: source.project.projectId, unapplied: dirty, otherUnapplied: otherDirty, recoveryReviewed: this.recoveryReviewed,
      versions: this.inputOriginVersions??currentVersions,
      scripts: [...this.scriptDrafts], writing: [...this.writingDrafts], designer: this.designer?.capture() ?? this.designerResume,
      publish: this.publishGuiDraft, resourceProcessor: this.resourceProcessorGuiDraft, character: this.characterGuiDraft,
      startup: this.startupGuiDraft, language: this.languageEditor.current?.capture() ?? this.languageGuiDraft,
      playerName: this.playerNameEditor?.capture() ?? this.playerNameGuiDraft,
      production: this.production ? { gui: this.production.guiDraft, connection: connection ? { edit: connection.edit, provider: connection.provider, advanced: connection.advanced, baseline: connection.baseline, selection: connection.selection } : null, workflow: this.production.workflowGuiDraft, candidateText: [...this.production.candidateText] } : this.productionGuiResume,
      projectCreate: this.projectDraft, documents: this.documents.filter(document => !this.formDocuments.has(document.id) || document.id.startsWith('plugin-document:')), active: this.activeDocument, page: this.page,
      sceneId: this.controller.scene?.sceneId ?? null, view: this.controller.view,
      forms: [...this.recoveredForms, ...[...this.formDocuments].filter(([,form]) => form.dirty()||!!form.capture).map(([id, form]) => ({ id, title: this.documents.find(document => document.id === id)?.title ?? id, fields: captureFieldInputs(form.node), adapter:form.capture?.() })), ...[...this.insertions].filter(([,form]) => form.dirty()).map(([id,form]) => ({ id: `insertion:${id}`, title: tr(this.controller.preferences.locale,'待插入内容','Pending insertion','挿入待ちの内容'), fields: captureFieldInputs(form.node),adapter:form.capture?.() }))],
      retained: retainedWorkspaceInput(this.retainedInput, source.project) };
  }
  private persistInputDraft() {
    if (!this.inputDraftReady || this.inputDraftRestoring || this.switchingProject || this.disposed) return;
    const draft = this.captureInputDraft(); if (!draft) return;
    const serialized = JSON.stringify(draft);
    if (this.lastInputContent.get(draft.projectId) === serialized) return;
    this.lastInputContent.set(draft.projectId, serialized);
    this.inputDraftStore.schedule(draft.projectId, JSON.parse(serialized) as Json);
  }
  async flushInputDrafts(): Promise<void> {
    this.persistInputDraft();
    await this.inputDraftStore.flush();
    const resume = await this.controller.flushResume();
    if (!resume.ok) throw new Error(issueText(resume.error, this.controller.preferences.locale));
  }
  private async restoreInputDraft() {
    const source = this.controller.source; if (!source || this.inputDraftRestoredProject === source.project.projectId) return;
    const projectId = source.project.projectId; this.inputDraftRestoring = true; let original: Json | null = null;
    try {
      const content = await this.inputDraftStore.read(projectId); original = content;
      if (!content || this.controller.source?.project.projectId !== projectId) return;
      const draft = content as unknown as PersistentWorkspaceInput;
      if (draft.version !== 1 || draft.projectId !== projectId || !Array.isArray(draft.versions)) { this.retainedInput = content; return; }
      const versions = new Map((source.documentVersions??[{ documentId: source.projectDocumentId, revision: source.projectRevision }, ...source.scenes.map(scene => ({ documentId: scene.documentId, revision: scene.revision }))]).map(item => [item.documentId, item.revision]));
      const matches = workspaceInputVersionsMatch(content, source.project, source.projectDocumentId, versions);
      this.recoveryReviewed = draft.recoveryReviewed ?? false;
      if (!matches) {
        this.retainedInput = retainedWorkspaceInput(content, source.project); this.recoveryReviewed = false;
        this.message = tr(this.controller.preferences.locale,'部分输入的来源已变化。请复核保留的输入后继续。','The source of some inputs changed. Review the retained inputs before continuing.','一部の入力元が変更されました。保持した入力を確認してください。');
      } else {
        this.inputOriginVersions=structuredClone(draft.versions);this.scriptDrafts = new Map(draft.scripts); this.writingDrafts = new Map(draft.writing); this.designerResume = draft.designer;
        for (const scene of source.scenes) {
          const revision = draft.versions.find(item => item.documentId === scene.documentId)?.revision;
          if (revision === undefined) continue;
          if (this.scriptDrafts.has(scene.sceneId)) this.scriptDraftOrigins.set(scene.sceneId, revision);
          if (this.writingDrafts.size && scene.sceneId === draft.sceneId) this.writingDraftOrigin = { documentId: scene.documentId, revision };
        }
        this.publishGuiDraft = draft.publish; this.resourceProcessorGuiDraft = draft.resourceProcessor;
        this.characterGuiDraft = draft.character; this.characterSelected = draft.character?.selected ?? undefined;
        this.startupGuiDraft = draft.startup && {
          ...draft.startup,
          displayPending: draft.startup.displayPending ?? draft.otherUnapplied ?? draft.unapplied ?? false,
        };
        this.startupDraft = !!this.startupGuiDraft && (Object.keys(this.startupGuiDraft.buffers).length > 0 ||
          !!this.startupGuiDraft.displayPending && JSON.stringify(this.startupGuiDraft.display) !== JSON.stringify(source.project.display));
        this.languageGuiDraft = draft.language; this.playerNameGuiDraft = draft.playerName;
        this.productionGuiResume = draft.production; this.projectDraft = draft.projectCreate;
        this.recoveredForms = []; this.retainedInput = retainedWorkspaceInput(draft.retained, source.project);
        this.documents = restoredAuthorDocuments(draft.documents.filter(document => document.kind !== 'scene' || source.scenes.some(scene => scene.sceneId === document.objectId)));
        const active = restoredAuthorDocumentId(draft.active), page = draft.page === 'assistant' ? 'production' : draft.page;
        this.activeDocument = active; this.page = page;
        if (draft.sceneId && source.scenes.some(scene => scene.sceneId === draft.sceneId)) this.controller.selectScene(draft.sceneId);
        this.controller.changeView(draft.view);
        for (const form of [...draft.forms ?? []].sort((a,b)=>Number(!a.id.startsWith('insertion:'))-Number(!b.id.startsWith('insertion:')))) { if (!await this.restoreFormInput(form)) this.recoveredForms.push(form); }
        if (this.documents.some(document => document.id === active)) { this.activeDocument = active; this.page = page; }
      }
      if ((this.recoveredForms.length || this.retainedInput) && !this.recoveryReviewed) this.openRecoveredInput();
    } finally { this.inputDraftRestoredProject = projectId; const normalized=this.captureInputDraft();if(normalized){const serialized=JSON.stringify(normalized);this.lastInputContent.set(projectId,serialized);if(original&&serialized!==JSON.stringify(original))this.inputDraftStore.schedule(projectId,JSON.parse(serialized) as Json);}this.inputDraftRestoring = false; }
  }
  private openRecoveredInput() {
    const opened=this.documents.find(document=>document.id==='recovered-input');if(opened){void this.openDocument(opened);return;}
    const locale = this.controller.preferences.locale, node = el('section'), source=this.controller.source;
    const groups:RecoveredInputGroup[]=this.recoveredForms.map(form=>({title:form.title,fields:form.fields.map(field=>({label:field.label,value:field.checked===undefined?field.value:String(field.checked)}))}));
    let retained=this.retainedInput;
    while(retained&&typeof retained==='object'&&!Array.isArray(retained)){
      const draft=retained as unknown as Partial<PersistentWorkspaceInput>;
      if(draft.publish&&source){const pending=draft.publish,fields=publishIdentityChanges(pending,source.project);if(fields.length)groups.push({title:tr(locale,'发行配置','Release settings','配布設定'),fields:fields.map(field=>({label:({steamAppId:'Steam AppID',version:tr(locale,'发行版本','Release version','配布バージョン'),brandName:tr(locale,'作品名称','Work name','作品名'),brandIcon:tr(locale,'作品图标','Work icon','作品アイコン'),executableName:tr(locale,'可执行文件名','Executable filename','実行ファイル名'),publisher:tr(locale,'发行者','Publisher','配布者'),windowsSigning:tr(locale,'Windows 签名','Windows signing','Windows 署名')})[field],value:field==='windowsSigning'?pending.windowsSigning==='certificate'?tr(locale,'使用本机证书签名','Sign with a local certificate','ローカル証明書で署名'):tr(locale,'明确不签名','Leave unsigned','署名しない'):String(pending[field]??'')})),open:()=>{this.publishGuiDraft=pending;this.publishDraftRevision++;this.recoveryReviewed=true;this.finishFormDocument('recovered-input');void this.navigate('publish');}});}
      for(const [id,text] of draft.scripts??[])groups.push({title:source?.scenes.find(scene=>scene.sceneId===id)?.name??tr(locale,'剧本输入','Script input','脚本の入力'),fields:[{label:tr(locale,'未应用文本','Unapplied text','未適用のテキスト'),value:text}]});
      for(const form of draft.forms??[]){const kind=form.adapter&&typeof form.adapter==='object'&&!Array.isArray(form.adapter)?form.adapter.kind:null;
        groups.push({title:form.title,fields:form.fields.map(field=>({label:field.label,value:field.checked===undefined?field.value:String(field.checked)})),...(['projectSettings','storyStructure'].includes(String(kind))?{open:()=>{this.recoveryReviewed=true;draft.forms=(draft.forms??[]).filter(item=>item.id!==form.id);delete draft.unapplied;delete draft.otherUnapplied;this.finishFormDocument('recovered-input');void this.restoreFormInput(form).then(()=>this.persistInputDraft());}}:{})});}
      retained=draft.retained??null;
    }
    const mount=el('div');node.append(mount);const react=createRoot(mount),close=()=>{this.recoveryReviewed=true;this.finishFormDocument('recovered-input');this.persistInputDraft();};
    react.render(createElement(RecoveredInput,{locale,groups,raw:this.retainedInput,close,discard:()=>{this.retainedInput=null;this.recoveredForms=[];close();}}));
    this.openFormDocument('recovered-input',tr(locale,'恢复的输入','Recovered input','復元した入力'),node,()=>false,()=>{this.recoveryReviewed=true;react.unmount();this.persistInputDraft();});
  }
  private async restoreFormInput(form: PersistentWorkspaceInput['forms'][number]): Promise<boolean> {
    if (!form.adapter || typeof form.adapter !== 'object' || Array.isArray(form.adapter)) return false;
    const adapter = form.adapter as Record<string, Json>;
    const scene = typeof adapter.sceneId === 'string' ? this.controller.source?.scenes.find(scene => scene.sceneId === adapter.sceneId) : null;
    if (adapter.sceneId && !scene) return false;
    if (scene) this.controller.selectScene(scene.sceneId);
    const beforeId = typeof adapter.beforeId === 'string' ? adapter.beforeId : null;
    if (adapter.kind === 'entry') await this.openEntryPresentation(adapter.entryKind as 'chapter'|'scene', String(adapter.objectId), {
      draft: adapter.draft as unknown as SceneEntryPresentation, original: String(adapter.original),
      decorDraft: Array.isArray(adapter.decorDraft) ? SceneDecorLayerSchema.array().parse(adapter.decorDraft) : undefined,
      decorOriginal: typeof adapter.decorOriginal === 'string' ? adapter.decorOriginal : undefined,
    });
    else if(adapter.kind==='projectSettings')await this.openProjectSettings(adapter.draft as unknown as import('./ProjectSettingsEditor.js').ProjectSettingsGuiDraft);
    else if(adapter.kind==='storyStructure')await this.openStoryStructure(adapter.draft as unknown as import('./StoryStructureEditor.js').StoryStructureGuiDraft);
    else if (adapter.kind === 'paste') await this.pasteDialog({beforeId,draft:adapter.draft as unknown as import('./batch-dialogue.js').BatchDialogueGuiDraft});
    else if (adapter.kind === 'dialogue') await this.dialogueDialog({beforeId,text:String(adapter.text),speaker:String(adapter.speaker)});
    else if (adapter.kind === 'command') this.commandDialog(beforeId,{command:String(adapter.command),args:adapter.args as Record<string,Json>});
    else if (adapter.kind === 'batchRename') { this.selectedAssets=new Set(adapter.ids as string[]); await this.renameSelected({template:String(adapter.template)}); }
    else if (adapter.kind === 'animationAsset') { const asset=await this.services.getAsset?.(String(adapter.assetId));if(!asset?.ok||!asset.value)return false;this.professionalInputs.set(form.id,adapter.gui??null);await this.openAnimationAsset(asset.value); }
    else if (adapter.kind === 'animation' || adapter.kind === 'audio') {
      if(!scene)return false;
      this.professionalInputs.set(form.id,adapter.gui??null);
      const statementId=typeof adapter.statementId==='string'?adapter.statementId:null;
      if(statementId)this.controller.select([statementId]);
      const args=adapter.args as Record<string,unknown>,mount=el('div');
      if(adapter.kind==='animation'&&adapter.draft){const insertion=this.insertions.get(scene.sceneId);const open=[...insertion?.node.querySelectorAll('button')??[]].find(button=>button.textContent?.includes(tr(this.controller.preferences.locale,'打开动画时间轴','Open animation timeline','タイムラインを開く')));if(!open)return false;open.click();}
      else { const context=this.fieldContext(args);let expectedRevision=scene.revision;
        if(adapter.kind==='audio')context.audioEditor?.(mount);
        else context.animationEditor?.(mount,args.animation??(adapter.gui as Record<string,Json>)?.accepted,async next=>{if(this.controller.scene?.sceneId!==scene.sceneId||this.controller.scene.revision!==expectedRevision)throw new Error(tr(this.controller.preferences.locale,'来源版本已变化，当前输入已保留。','The source version changed; input is retained.','元のバージョンが変更されました。入力を保持します。'));const result=await this.controller.editFields([{field:'animation',op:'set',value:next},...(['segments','resourceId'] as const).filter(key=>args[key]!==undefined).map(field=>({field,op:'inherit' as const,value:null}))],statementId?[statementId]:[]);if(result.ok)expectedRevision=this.controller.scene!.revision;return result;});
        const open=[...mount.querySelectorAll('button')].find(button=>button.textContent?.includes(tr(this.controller.preferences.locale,adapter.kind==='audio'?'编辑声音循环':'打开动画时间轴',adapter.kind==='audio'?'Edit audio loop':'Open animation timeline',adapter.kind==='audio'?'音声ループを編集':'タイムラインを開く')));if(!open)return false;open.click();
      }
      for(let attempt=0;attempt<20&&!this.formDocuments.has(form.id);attempt++)await new Promise(resolve=>setTimeout(resolve,25));
    }
    else return false;
    return this.formDocuments.has(form.id) || !!scene && this.insertions.has(scene.sceneId);
  }
  private captureProjectGui() {
    this.rememberScene();
    return { designer:this.designer?.capture()??this.designerResume, scripts:new Map(this.scriptDrafts),writing:new Map(this.writingDrafts),
      production:this.production,productionUnapplied:this.productionUnapplied,publish:this.publishGuiDraft,publishUnapplied:this.publishUnapplied,resourceProcessor:this.resourceProcessorGuiDraft,resourceProcessorUnapplied:this.resourceProcessorUnapplied,
      startup:{node:this.startupNode,root:this.startupRoot,inspector:this.startupInspector,dirty:this.startupDraft},
      character:{node:this.characterNode,root:this.characterRoot,explorer:this.characterExplorer,dirty:this.characterDraft,selected:this.characterSelected,gui:this.characterGuiDraft,search:this.characterSearch,documentIds:this.characterDocumentIds,history:this.characterHistory},
      project:{node:this.projectNode,general:this.projectGeneral,languageNode:this.languageNode,languageRoot:this.languageRoot,languageEditor:this.languageEditor,playerNameEditor:this.playerNameEditor},
      forms:this.formDocuments,insertions:this.insertions,documents:this.documents,active:this.activeDocument,page:this.page,scenes:new Map(this.sceneContexts),selected:this.treeSelected };
  }
  private async reportAuthoringDrafts() {
    this.persistInputDraft();
    if(this.switchingProject)return;
    const source=this.controller.source,bridge=(this.services.bridge as import('../../desktop-bridge.js').DesktopBridge).collaboration;
    if(!source||!bridge?.reportAuthoringDrafts)return;
    const documents:{id:string;name:string;kind:string}[]=[];
    const add=(id:string,name:string,kind:string)=>{if(!documents.some(item=>item.id===id))documents.push({id,name,kind});};
    for(const id of this.scriptDrafts.keys())add(`scene:${id}`,source.scenes.find(scene=>scene.sceneId===id)?.name??id,'scene');
    if(this.writingDrafts.size&&this.controller.scene)add(`scene:${this.controller.scene.sceneId}`,this.controller.scene.name,'scene');
    for(const [id,form] of this.formDocuments)if(form.dirty())add(id,this.documents.find(item=>item.id===id)?.title??id,'form');
    for(const [id,insertion] of this.insertions)if(insertion.dirty())add(`insertion:${id}`,source.scenes.find(scene=>scene.sceneId===id)?.name??id,'insertion');
    const designer=this.designer?.capture()??this.designerResume;
    for(const key of Object.keys(designer?.styleDrafts??{}))add(`style:${key}`,designer?.styleDraftOptions?.[key]?.name??'CSS / SCSS','style');
    if(this.designer?.hasAnimationDraft())add('ui-animation',tr(this.controller.preferences.locale,'界面动画','Interface animation','UIアニメーション'),'animation');
    if(this.startupDraft)add('startup',tr(this.controller.preferences.locale,'启动与主页','Startup & home','起動とホーム'),'startup');
    if(this.characterDraft)add('characters',tr(this.controller.preferences.locale,'角色与路线','Characters & routes','キャラクターとルート'),'characters');
    if(this.languageEditor.current?.dirty||this.playerNameEditor?.dirty)add('project',tr(this.controller.preferences.locale,'作品设置','Project settings','作品設定'),'project');
    if(this.productionUnapplied||this.production?.draftDirty)add('production',tr(this.controller.preferences.locale,'制作草稿','Production draft','制作の下書き'),'production');
    if(this.publishUnapplied)add('publish',tr(this.controller.preferences.locale,'发行配置','Release settings','配布設定'),'publish');
    if(this.resourceProcessorUnapplied)add('resource-processing',tr(this.controller.preferences.locale,'资源处理','Resource processing','素材処理'),'resource');
    documents.sort((a,b)=>a.id.localeCompare(b.id));const summary=JSON.stringify(documents),previous=this.guiDraftReports.get(source.project.projectId);
    if(previous?.summary===summary)return;
    const report={summary,revision:(previous?.revision??0)+1};this.guiDraftReports.set(source.project.projectId,report);
    const result=await bridge.reportAuthoringDrafts({projectId:source.project.projectId,revision:report.revision,documents});
    if(!result.ok&&this.guiDraftReports.get(source.project.projectId)===report)this.guiDraftReports.delete(source.project.projectId);
  }
  private async refreshCollaborationProject() {
    const oldId=this.controller.source?.project.projectId;
    if(oldId){await this.reportAuthoringDrafts();await this.inputDraftStore.flush();}
    this.switchingProject=true;
    try{
    // The host already changed its write binding. Keep author input with its old project.
    if(oldId){
      if(this.startupRoot)this.startupDocument(false);this.stopStartup?.();this.stopStartup=null;
      for(const form of this.formDocuments.values())form.activate?.(false);
      this.projectGuiDrafts.set(oldId,this.captureProjectGui());
      this.production?.stop();this.productionSubscription?.();this.productionSubscription=null;this.production=null;
      this.startupRoot=null;this.startupNode=el('div','startup-document');this.startupInspector=el('div','startup-inspector-mount');this.startupDraft=false;
      this.characterRoot=null;this.characterNode=el('div','character-document');this.characterExplorer=el('div','character-explorer');this.characterDraft=false;
      this.languageRoot=null;this.projectNode=el('section','authoring-settings-document');this.projectGeneral=el('div');this.languageNode=el('div');this.languageEditor=createRef<ProjectLanguageEditorHandle>();this.playerNameEditor=null;
      this.formDocuments=new Map();this.insertions=new Map();
    }
    this.controller.close();this.scriptDrafts.clear();this.writingDrafts.clear();
    const opened=await this.controller.open();if(!this.notice(opened)){this.render();return;}
    await this.projectChanged();
    const currentId=this.controller.source?.project.projectId, cached=currentId&&this.projectGuiDrafts.get(currentId);
    if(cached){
      this.projectGuiDrafts.delete(currentId!);this.designerResume=cached.designer;this.scriptDrafts=cached.scripts;this.writingDrafts=cached.writing;
      this.production=cached.production;this.productionUnapplied=cached.productionUnapplied;this.publishGuiDraft=cached.publish;this.publishUnapplied=cached.publishUnapplied;this.resourceProcessorGuiDraft=cached.resourceProcessor;this.resourceProcessorUnapplied=cached.resourceProcessorUnapplied;
      this.startupNode=cached.startup.node;this.startupRoot=cached.startup.root;this.startupInspector=cached.startup.inspector;this.startupDraft=cached.startup.dirty;
      this.characterNode=cached.character.node;this.characterRoot=cached.character.root;this.characterExplorer=cached.character.explorer;this.characterDraft=cached.character.dirty;this.characterSelected=cached.character.selected;this.characterGuiDraft=cached.character.gui;this.characterSearch=cached.character.search;
      this.characterDocumentIds = cached.character.documentIds; this.characterHistory = cached.character.history;
      this.projectNode=cached.project.node;this.projectGeneral=cached.project.general;this.languageNode=cached.project.languageNode;this.languageRoot=cached.project.languageRoot;this.languageEditor=cached.project.languageEditor;this.playerNameEditor=cached.project.playerNameEditor;
      this.formDocuments=cached.forms;this.insertions=cached.insertions;this.documents=cached.documents;this.activeDocument=cached.active;this.page=cached.page;this.sceneContexts=cached.scenes;this.treeSelected=cached.selected;
      if(this.production){this.productionSubscription=this.production.subscribe(this.productionChanged);this.production.start();}
      this.message=tr(this.controller.preferences.locale,'已恢复此作品的编辑位置和未应用草稿。','Restored this project’s editing position and unapplied drafts.','この作品の編集位置と未適用の下書きを復元しました。');
    }else if(oldId)this.message=tr(this.controller.preferences.locale,'已打开协作作品。原作品的未应用草稿保留在本次 Studio 会话中。','Collaboration project opened. Unapplied drafts for the previous project remain in this Studio session.','連携作品を開きました。前の作品の未適用の下書きは、この Studio セッションで保持されます。');
    this.render();
    }finally{this.switchingProject=false;void this.reportAuthoringDrafts();}
  }
  private async projectChanged(): Promise<void> {
    this.assetProjectEpoch++;
    this.assetQueryGeneration++; this.assetFocusGeneration++; this.assetPreviewGeneration++;
    this.importingAssets = false;
    this.mattingBusy = false;
    const prepared = this.mattingCandidate;
    this.mattingCandidate = null;
    if (prepared) void this.services.discardBackground?.(prepared.preparationId).catch(() => {});
    this.inputDraftRestoredProject = null; this.professionalInputs.clear();this.inputOriginVersions=null;this.characterGuiDraft = null; this.startupGuiDraft = null; this.languageGuiDraft = null; this.playerNameGuiDraft = null; this.productionGuiResume = null; this.recoveredForms = []; this.retainedInput = null;this.recoveryReviewed=false;
    this.characterDocumentIds = new Map(); this.characterHistory = new Map();
    this.publishGuiDraft=null;this.publishUnapplied=false;this.resourceProcessorGuiDraft=null;this.resourceProcessorUnapplied=false;
    this.releaseIssues = []; this.issueReturn = null; this.outputFailure = undefined; this.pendingBuild = undefined;
    this.connectionOrigin = null; this.connectionUnapplied = false; this.missingPlugin = null; this.projectCenterOrigin = null;
    this.resourceProcessorRoot?.unmount(); this.resourceProcessorRoot=null; this.resourceProcessorInspector.replaceChildren();
    this.production?.stop(); this.production = null; this.designer?.dispose(); this.designer = null; this.designerResume = null; this.miniStage?.dispose(); this.miniStage = null;
    this.animationMiniStage?.dispose(); this.animationMiniStage = null;
    this.productionSubscription?.(); this.productionSubscription = null;
    this.designerProjectRevision = null; this.designerSceneRevisions.clear();
    this.workbench?.unmount(); this.workbench = null;
    this.productionRoot?.unmount(); this.productionRoot = null;
    for (const session of this.scriptSessions.values()) session.editor.dispose(); this.scriptSessions.clear(); this.scriptMounts.clear(); this.scriptEditor = null;
    this.writingInputs.clear();
    for(const form of this.formDocuments.values())form.dispose?.(); this.formDocuments.clear(); this.productionUnapplied=false; this.insertions.clear(); this.recentObjects=[];this.cardRangeAnchor=null;this.treeCreateEditor=null; this.debugRouteIntent.clear(); this.characterSelected=undefined;this.characterAsset=null;this.characterSearch='';this.characterSectionRequest=null;
    this.documents = []; this.activeDocument = ''; this.sceneContexts.clear(); this.sceneViewContexts.clear(); this.scriptDraftOrigins.clear(); this.scriptReveal = null; this.writingDraftOrigin = null; this.composingSceneInputs.clear(); this.treeSelected = [];
    this.restoreSceneLayout();
    this.playerNameEditor?.dispose();this.playerNameEditor = null; this.languageRoot?.unmount(); this.languageRoot=null; this.projectNode.replaceChildren(); this.characterRoot?.unmount(); this.characterRoot = null; this.characterDraft = false; this.graphRoot?.unmount(); this.graphRoot = null;
    this.startupRoot?.unmount(); this.startupRoot = null; this.stopStartup?.(); this.stopStartup = null; this.startupDraft = false; this.startupGeneration++;
    this.effectEditor?.dispose(); this.effectEditor = null;
    await this.services.stopAssetPreview?.();
    this.assetCache.clear(); this.selectedAssets.clear(); this.assetPage = null; this.assetRequestedRevision = undefined;
    this.assetQueryPending = false; this.assetQueryError = null;
    this.selectedDetails = null; this.missingSelected = []; this.focusedAssetId = null; this.assetVariants.clear();
    this.assetPreviewVersions.clear(); this.disposeAssetPreview(); this.assetInspectorPin = null;
    this.assetLibraryScroll = 0;
    this.assetRangeAnchor = null; this.assetReferenceOrigin = null; this.assetReferenceReturnFocus = null; this.assetRows.clear(); this.closeAssetBindDialog?.();
    this.assetImportResults = [];
    this.selectedAtIndexRevision = null; this.queryAtSelection = null;
    this.assetQuery = { kind: null, text: '', offset: 0, limit: 40 };
    await this.studioPlugins?.dispose(); this.studioPlugins = null; this.services.assetUi = undefined; this.assetTypes = [];
    this.assetInspectorView && disposeAssetInspector(this.assetInspectorView.node); this.assetInspectorView = null;
    if (this.controller.source) { await this.rememberOpenProject(); await this.refreshEngineHealth(); await this.loadQuickAssets(); }
    await this.refreshStudioPlugins(); this.page = this.controller.source ? 'editor' : 'projects';
    const active = this.restoreWorkbenchDocuments();
    this.restoreAssetWorkspace();
    await this.restoreInputDraft();
    await this.resumeWorkbench(active);
  }
  private rememberScene(): void {
    if (this.controller.scene) this.sceneContexts.set(this.controller.scene.sceneId, { view: this.controller.view, selection: structuredClone(this.controller.selection), caret: { ...this.controller.caret }, scroll: { ...this.controller.scroll } });
  }
  private restoreSceneLayout(): void {
    const workbench = this.controller.workbench;
    for (const toolbar of this.sceneToolbars.values()) toolbar.root.unmount();
    this.sceneToolbars.clear();
    this.dockLayout = workbench?.dockLayout;
    this.pageDirectoryRequested = validLayout(this.dockLayout)
      && allGroups(this.dockLayout).some(group => group.tabs.includes(authoringDockTools.pageDirectory));
    this.productionDirectoryRequested = validLayout(this.dockLayout)
      && allGroups(this.dockLayout).some(group => group.tabs.includes(authoringDockTools.productionDirectory));
    this.productionDirectoryState = workbench?.productionDirectory ?? initialProductionDirectory();
    this.documentRegions.clear();
    this.retainedCompanions.clear();
    this.disposeCharacterRegions();
    this.outlineQuery = workbench?.outline?.query ?? '';
    this.outlineScrollTop = workbench?.outline?.scrollTop ?? 0;
    const source = this.controller.source;
    this.treeSelected = workbench?.outline?.selected.filter(id => source?.scenes.some(scene => scene.sceneId === id) || source?.project.chapters.some(chapter => chapter.id === id)) ?? [];
    this.characterSearch = workbench?.characterQuery ?? '';
    for (const { sceneId, revision, beside, ...context } of workbench?.sceneContexts ?? []) {
      const scene = source?.scenes.find(item => item.sceneId === sceneId);
      if (!scene || scene.revision !== revision || context.selection && context.selection.documentId !== scene.documentId) continue;
      this.sceneContexts.set(sceneId, context);
      this.sceneViewContexts.set(sceneId, new Map(beside.map(({ view, ...pane }) => [view, pane])));
    }
    this.stageRegion = null;
    this.splitSceneViews = new Map(workbench?.sceneSplits?.map(({ sceneId, views }) => [sceneId, views]));
    this.fixedStageSource = workbench?.stageSource ?? null;
    this.fixedInspectorSource = workbench?.inspectorSource ?? null;
    this.focusedWorkbenchTool = null;
    this.sidebarView?.view.dispose();
    this.sidebarState = initialSidebarState(workbench?.semanticSearch); this.sidebarView = null; this.searchOrigin = null;
    this.focusedDialogueEvent = null;
  }
  private restoreWorkbenchDocuments(): AuthorDocument | undefined {
    const workbench = this.controller.workbench;
    this.output = workbench?.output ?? { scrollTop: 0 };
    this.outputNode.scrollTop = 0;
    this.projectCenterOrigin = workbench?.projectCenterOrigin ?? null;
    this.connectionOrigin = workbench?.connectionOrigin ?? null;
    this.documents = restoredAuthorDocuments(workbench?.documents ?? []);
    const active = restoredAuthorDocumentId(workbench?.active ?? '');
    return this.documents.find(document => document.id === active)
      ?? (active.startsWith('plugin-document:') ? { id: active, kind: 'route', objectId: 'plugins', title: active } : undefined);
  }
  private missingDocument(document: Pick<AuthorDocument, 'kind' | 'objectId'> | undefined): boolean {
    const source = this.controller.source;
    if (!source || !document) return false;
    return document.kind === 'scene' && !source.scenes.some(scene => scene.sceneId === document.objectId)
      || document.kind === 'character' && !source.characters.some(character => character.id === document.objectId)
      || document.kind === 'page' && Boolean(document.objectId && this.designer?.hasWorkbenchPage(document.objectId) === false);
  }
  private async openCharacterDifference(id: Id): Promise<void> {
    const character = this.controller.source?.characters.find(item => item.id === id);
    if (!character) return;
    this.requestCharacterSection(id, 'figures');
    await this.openDocument({ kind: 'character', objectId: id, title: character.name });
    this.dock.current?.focusView(`character:${id}`);
  }
  private async openWritingStage(id: Id): Promise<void> {
    await this.openDocument({ kind: 'scene', objectId: id });
    if (this.activeDocument !== `scene:${id}` || this.missingDocument({ kind: 'scene', objectId: id })) return;
    await this.changeSceneView('writing');
    this.dock.current?.split(authoringDockTools.stage, 'y');
    this.dock.current?.focusView(`scene:${id}`);
  }
  private async resumeWorkbench(active: AuthorDocument | undefined): Promise<void> {
    const pluginId = this.activeDocument.startsWith('plugin-document:') ? this.activeDocument : active?.id.startsWith('plugin-document:') ? active.id : null;
    if (pluginId && !this.formDocuments.has(this.activeDocument)) {
      const plugin = this.documents.find(document => document.id === pluginId)
        ?? (active?.id === pluginId ? active : { id: pluginId, kind: 'route', objectId: 'plugins', title: pluginId } as const);
      this.activeDocument = 'route:plugins';
      this.page = 'plugins';
      await this.openDocument(plugin);
      return;
    }
    if (active && !this.activeDocument) {
      await this.openDocument(active);
      if (this.activeDocument) return;
    }
    this.render();
  }
  private rememberWorkbench(): void {
    const { mode, term, target, targetLabel, scope, variableAccess, offset, hasSearched, searchScrollTop } = this.sidebarState;
    this.rememberScene();
    const sceneContexts = [...this.sceneContexts].flatMap(([sceneId, context]) => {
      const scene = this.controller.source?.scenes.find(item => item.sceneId === sceneId);
      return scene ? [{ sceneId, revision: scene.revision, ...context, beside: [...(this.sceneViewContexts.get(sceneId) ?? [])].map(([view, pane]) => ({ view, ...pane })) }] : [];
    });
    this.controller.rememberWorkbench({
      documents: this.documents.filter(doc => !doc.preview && (!this.formDocuments.has(doc.id) || doc.id.startsWith('plugin-document:'))).map(({ id, title, kind, objectId }) => ({ id, title, kind, ...(objectId ? { objectId } : {}) })),
      active: this.activeDocument.startsWith('plugin-document:') ? this.activeDocument : this.formDocuments.get(this.activeDocument)?.source ?? this.activeDocument,
      ...(this.splitSceneViews.size ? { sceneSplits: [...this.splitSceneViews].map(([sceneId, views]) => ({ sceneId, views })) } : {}),
      sceneContexts,
      pageViews: this.designer?.workbenchViews() ?? this.controller.workbench?.pageViews,
      outline: { query: this.outlineQuery, scrollTop: this.outlineScrollTop, selected: this.treeSelected },
      productionDirectory: this.productionDirectoryState,
      characterQuery: this.characterSearch,
      ...(this.fixedStageSource ? { stageSource: this.fixedStageSource } : {}),
      ...(this.fixedInspectorSource ? { inspectorSource: this.fixedInspectorSource } : {}),
      semanticSearch: { mode, term, target, targetLabel, scope, variableAccess, offset, hasSearched, searchScrollTop },
      ...(this.dockLayout ? { dockLayout: this.dockLayout } : {}),
      assets: this.captureAssetWorkspace(),
      output: this.output,
      ...(this.projectCenterOrigin ? { projectCenterOrigin: this.projectCenterOrigin } : {}),
      ...(this.connectionOrigin ? { connectionOrigin: this.connectionOrigin } : {}),
    });
  }
  private captureAssetWorkspace(): NonNullable<NonNullable<import('@galcraft/contracts').WorkspaceResume['workbench']>['assets']> {
    const previewIds = new Set(this.documents.filter(doc => doc.kind === 'asset' && !doc.preview).map(doc => doc.objectId));
    return { query: structuredClone(this.assetQuery), selectionQuery: structuredClone(this.queryAtSelection),
      selectedIds: [...this.selectedAssets], selectionRevision: this.selectedAtIndexRevision, primaryId: this.focusedAssetId,
      primaryVersions: [...this.assetVariants].map(([assetId, variantId]) => ({ assetId, variantId })),
      previewVersions: [...this.assetPreviewVersions].filter(([id]) => previewIds.has(id)).map(([assetId, variantId]) => ({ assetId, variantId })),
      inspectorPin: this.assetInspectorPin, scroll: this.assetLibraryScroll };
  }
  private restoreAssetWorkspace(): void {
    const assets = this.controller.workbench?.assets;
    if (assets) {
      this.assetQuery = assets.query;
      this.queryAtSelection = assets.selectionQuery;
      this.selectedAssets = new Set(assets.selectedIds);
      this.selectedAtIndexRevision = assets.selectionRevision;
      this.focusedAssetId = assets.primaryId;
      this.assetInspectorPin = assets.inspectorPin;
      this.assetLibraryScroll = assets.scroll;
      for (const { assetId, variantId } of assets.primaryVersions) this.assetVariants.set(assetId, variantId);
      for (const { assetId, variantId } of assets.previewVersions) this.assetPreviewVersions.set(assetId, variantId);
    }
  }
  private sceneViews(sceneId = this.controller.scene?.sceneId): readonly AuthoringController['view'][] {
    const current = sceneId === this.controller.scene?.sceneId ? this.controller.view : (sceneId ? this.sceneContexts.get(sceneId)?.view : undefined) ?? 'cards';
    const split = sceneId ? this.splitSceneViews.get(sceneId) : null;
    return split ? split.includes(current) ? split : [split[0], current] : [current];
  }
  private sceneViewContext() {
    return { selection: structuredClone(this.controller.selection), caret: { ...this.controller.caret }, scroll: { ...this.controller.scroll } };
  }
  private scenePaneContext(sceneId: Id, view: AuthoringController['view']) {
    const own = this.sceneViewContexts.get(sceneId)?.get(view);
    if (this.controller.scene?.sceneId === sceneId) return this.controller.view === view ? this.sceneViewContext() : own ?? this.sceneViewContext();
    return own ?? this.sceneContexts.get(sceneId)
      ?? { selection: null, caret: { statementId: null, field: null, offset: 0, documentOffset: 0 },
        scroll: { statementId: null, offsetPx: 0, scrollLeft: 0 } };
  }
  private setScenePaneScroll(sceneId: Id, view: AuthoringController['view'], scroll: AuthoringController['scroll']): void {
    if (this.controller.scene?.sceneId === sceneId && view === this.controller.view) {
      this.controller.setScroll(scroll.statementId, scroll.offsetPx, scroll.scrollLeft); return;
    }
    const context = this.scenePaneContext(sceneId, view);
    const views = this.sceneViewContexts.get(sceneId) ?? new Map();
    views.set(view, { ...context, scroll });
    this.sceneViewContexts.set(sceneId, views);
    if (this.controller.scene?.sceneId !== sceneId && (this.sceneContexts.get(sceneId)?.view ?? view) === view)
      this.sceneContexts.set(sceneId, { ...context, view, scroll });
    this.rememberWorkbench();
  }
  private retainedSceneRegion(document: AuthorDocument): AuthorDocumentRegion | undefined {
    const source = this.controller.source;
    const scene = document.kind === 'scene' && source?.scenes.find(item => item.sceneId === document.objectId);
    if (!source || !scene) return undefined;
    const existing = this.documentRegions.get(document.id);
    if (existing?.node.dataset.sceneDocument === scene.documentId
      && existing.node.dataset.sceneRevision === String(scene.revision)
      && existing.node.dataset.sceneLocale === this.controller.preferences.locale) return existing;
    const [view = 'cards'] = this.sceneViews(scene.sceneId);
    return { node: this.sceneViewsNode(source, scene, [view]), toolbar: this.renderAuthoringToolbar(scene, view), interactive: true };
  }
  private activateVisibleScene(id: string): boolean {
    if (this.activeDocument === id && this.followedScene()) return true;
    const document = this.documents.find(item => item.id === id && item.kind === 'scene');
    const scene = document && this.controller.source?.scenes.find(item => item.sceneId === document.objectId);
    const region = this.documentRegions.get(id)?.node;
    if (!scene || !region || region.dataset.sceneDocument !== scene.documentId || region.dataset.sceneRevision !== String(scene.revision)
      || region.dataset.sceneLocale !== this.controller.preferences.locale
      || this.composingSceneInputs.size || this.writingDrafts.size
      || this.controller.scene && this.scriptDrafts.has(this.controller.scene.sceneId) || this.production?.draftDirty) return false;
    this.rememberScene();
    this.freezeDocumentRegion();
    const pane = region.querySelector<HTMLElement>('[data-scene-view]')?.dataset.sceneView;
    const view = pane === 'script' || pane === 'writing' ? pane : 'cards';
    const context = this.scenePaneContext(scene.sceneId, view);
    if (this.controller.scene?.sceneId !== scene.sceneId) this.controller.selectScene(scene.sceneId);
    this.controller.changeView(view);
    this.controller.selection = structuredClone(context.selection) ?? { documentId: scene.documentId, statementIds: [], primaryId: null, textRange: null };
    this.controller.caret = { ...context.caret };
    this.controller.scroll = { ...context.scroll };
    this.scriptEditor = this.scriptSessions.get(scene.sceneId)?.editor ?? null;
    this.activeDocument = id; this.page = 'editor'; this.focusedWorkbenchTool = id;
    this.recentObjects = [id, ...this.recentObjects.filter(item => item !== id)].slice(0, 50);
    const renderSequence = this.focusRenderSequence;
    queueMicrotask(() => { if (this.activeDocument === id && this.focusRenderSequence === renderSequence) this.render(); });
    return true;
  }
  private activateSceneView(view: AuthoringController['view']): void {
    const scene = this.controller.scene, current = this.controller.view;
    if (!scene || current === view) return;
    const context = this.sceneViewContext();
    const views = this.sceneViewContexts.get(scene.sceneId) ?? new Map();
    views.set(current, context);
    this.sceneViewContexts.set(scene.sceneId, views);
    const next = views.get(view) ?? context;
    this.controller.changeView(view);
    this.controller.selection = structuredClone(next.selection);
    this.controller.caret = { ...next.caret };
    this.controller.scroll = { ...next.scroll };
  }
  private async changeSceneView(view: AuthoringController['view']): Promise<void> {
    const scene = this.controller.scene;
    if (!scene || !await this.flushScript() || this.controller.scene?.sceneId !== scene.sceneId) return;
    this.chooseSceneView(view);
    this.render();
  }
  private chooseSceneView(view: AuthoringController['view']): void {
    const scene = this.controller.scene;
    if (!scene) return;
    const split = this.splitSceneViews.get(scene.sceneId);
    if (split && !split.includes(view)) {
      this.splitSceneViews.set(scene.sceneId, split[0] === this.controller.view ? [view, split[1]] : [split[0], view]);
    }
    this.activateSceneView(view);
  }
  private async splitScene(view: AuthoringController['view'] | null): Promise<boolean> {
    const scene = this.controller.scene;
    if (!scene || !await this.flushScript() || this.controller.scene?.sceneId !== scene.sceneId) return false;
    if (!view) this.splitSceneViews.delete(scene.sceneId);
    else if (this.controller.view !== view) this.splitSceneViews.set(scene.sceneId, [this.controller.view, view]);
    this.render();
    return true;
  }
  private setSceneComposition(input: HTMLElement, active: boolean): void {
    if (active) this.composingSceneInputs.add(input);
    else this.composingSceneInputs.delete(input);
    if (!active && !this.composingSceneInputs.size && this.deferredSceneRender) {
      this.deferredSceneRender = false;
      requestAnimationFrame(() => this.render());
    }
  }
  private selectedSceneSource(eventId?: Id): SceneStatementSource | null {
    const scene = this.controller.scene, statementId = this.controller.selection?.primaryId;
    if (!scene || !statementId) { this.focusedDialogueEvent = null; return null; }
    const target = { sceneId: scene.sceneId, documentId: scene.documentId, statementId,
      projectId: this.controller.source?.project.projectId, revision: scene.revision };
    if (eventId) return { ...target, eventId };
    const focused = this.focusedDialogueEvent;
    if (focused?.sceneId === scene.sceneId && focused.statementId === statementId) {
      const eventTarget = { ...target, eventId: focused.eventId };
      if (this.resolveSceneSource(eventTarget)) return eventTarget;
    }
    this.focusedDialogueEvent = null;
    return target;
  }
  private followedScene() {
    const scene = this.controller.scene;
    return this.page === 'editor' && scene && this.activeDocument === `scene:${scene.sceneId}` ? scene : null;
  }
  private followedStageSource(): SceneStageSource | null {
    const scene = this.followedScene();
    return scene ? this.selectedSceneSource() ?? {
      sceneId: scene.sceneId, documentId: scene.documentId, statementId: null,
      projectId: this.controller.source?.project.projectId, revision: scene.revision,
    } : null;
  }
  private sceneForSource(target: SceneStageSource | null) {
    if (!target || target.projectId && target.projectId !== this.controller.source?.project.projectId) return null;
    return this.controller.source?.scenes.find(item => item.sceneId === target.sceneId && item.documentId === target.documentId) ?? null;
  }
  private stageStatement(target: SceneStageSource | null): SceneStatementSource | null {
    if (!target) return null;
    if (target.statementId) return { ...target, statementId: target.statementId };
    const scene = this.sceneForSource(target);
    const first = scene && this.controller.parsed('cards', scene)?.parsed.cst.find(item => item.valid && item.id)?.id;
    return first ? { ...target, statementId: first } : null;
  }
  private resolveSceneSource(target: SceneStatementSource | null, view: AuthoringController['view'] = 'cards') {
    if (!target) return null;
    const scene = this.sceneForSource(target);
    const state = scene && this.controller.parsed(view, scene);
    const node = state?.parsed.cst.find(item => item.valid && item.id === target.statementId);
    if (!scene || !state || !node) return null;
    const values = node.object?.value as Record<string, unknown> | undefined;
    const events = node.command === 'say' && Array.isArray(values?.events) ? values.events : [];
    const parsedEvent = target.eventId ? DialogueEventSchema.safeParse(events.find(event => event && typeof event === 'object' && 'id' in event && event.id === target.eventId)) : undefined;
    if (parsedEvent && !parsedEvent.success) return null;
    return { scene, state, node, event: parsedEvent?.data };
  }
  private fixedInspectorEditScene() {
    if (this.focusedWorkbenchTool !== authoringDockTools.inspector
      || !this.root.querySelector(`[data-view="${authoringDockTools.inspector}"]:not([hidden])`)) return null;
    const resolved = this.resolveSceneSource(this.fixedInspectorSource);
    return resolved && !resolved.state.readOnly ? resolved.scene : null;
  }
  private workbenchEditTargetLabel(): string | undefined {
    return this.fixedInspectorEditScene()?.name ?? this.assetEditTarget()?.label
      ?? this.documents.find(document => document.id === this.activeDocument)?.title;
  }
  private assetEditTarget(): { objectId: Id; documentId: Id | null; label: string; pendingInput: boolean } | null {
    const active = this.documents.find(document => document.id === this.activeDocument);
    const inspectorFocused = this.focusedWorkbenchTool === authoringDockTools.assetInspector
      && this.root.querySelector(`[data-view="${authoringDockTools.assetInspector}"]:not([hidden])`);
    const inspectorId = inspectorFocused ? this.assetInspectorPin?.assetId ?? this.focusedAssetId : null;
    const form = this.formDocuments.get(this.activeDocument);
    const documentId = this.controller.source?.assetIndexDocumentId ?? null;
    const formAssetId = form?.scope && form.scope.documentId === documentId ? form.scope.objectId : undefined;
    const objectId = inspectorId ?? (active?.kind === 'asset' ? active.objectId : formAssetId);
    if (!objectId) return null;
    const title = active && (active.objectId === objectId || form?.scope?.objectId === objectId) ? active.title : undefined;
    return { objectId, documentId, label: this.assetCache.get(objectId)?.name ?? title ?? objectId,
      pendingInput: !inspectorId && objectId === formAssetId && !!form?.dirty() };
  }
  private workbenchHistoryUnavailable(): string | undefined {
    if (this.fixedInspectorEditScene()) return undefined;
    if (this.missingDocument(this.documents.find(document => document.id === this.activeDocument))) return tr(this.controller.preferences.locale,
      '当前文档已缺失，恢复后可以继续编辑。', 'Restore the missing document to continue editing.', '不足している文書を復元すると編集を続けられます。');
    if (!this.assetEditTarget()) return undefined;
    return tr(this.controller.preferences.locale, '素材编辑历史按整次操作记录，单项素材暂不支持撤销或重做。',
      'Asset history tracks whole operations. Undo and redo are unavailable for a single asset.',
      '素材の履歴は操作単位で記録されます。素材単体の元に戻す・やり直しは利用できません。');
  }
  private async openSceneTarget(sceneId: Id): Promise<boolean> {
    const tabId = `scene:${sceneId}`;
    if (this.page !== 'editor' || this.activeDocument !== tabId || this.controller.scene?.sceneId !== sceneId)
      await this.openDocument({ kind: 'scene', objectId: sceneId });
    return this.activeDocument === tabId && this.controller.scene?.sceneId === sceneId;
  }
  private revealScriptOffset(statementId: Id | null, offset: number): void {
    const scene = this.controller.scene;
    if (!scene) return;
    this.controller.setCaret(statementId, offset);
    this.scriptReveal = { documentId: scene.documentId, revision: scene.revision, offset };
  }
  private sourceControls(panel: 'stage' | 'inspector'): HTMLElement {
    const locale = this.controller.preferences.locale, stage = panel === 'stage';
    const fixed = stage ? this.fixedStageSource : this.fixedInspectorSource;
    const followed = this.followedScene();
    const statement = followed ? this.selectedSceneSource() : null;
    const stageSource = stage ? this.followedStageSource() : null;
    const target = fixed ?? (stage ? stageSource : statement);
    const resolved = target?.statementId ? this.resolveSceneSource({ ...target, statementId: target.statementId }) : null;
    const scene = resolved?.scene ?? this.sceneForSource(target) ?? (!fixed ? followed : null);
    const available = Boolean(target && (target.statementId ? resolved : scene));
    const controls = el('div', 'authoring-source-controls');
    controls.dataset.sourcePanel = panel;
    controls.dataset.sourceMode = fixed ? 'fixed' : 'follow';
    if (target) {
      controls.dataset.sourceScene = target.sceneId;
      controls.dataset.sourceDocument = target.documentId;
      if (target.statementId) controls.dataset.sourceStatement = target.statementId;
      if (target.eventId) controls.dataset.sourceEvent = target.eventId;
    }
    if (scene) controls.dataset.sourceRevision = String(scene.revision);
    controls.dataset.sourceAvailable = String(available);
    const label = fixed ? stage ? tr(locale, '恢复舞台跟随', 'Resume stage following', '舞台の追従を再開') : tr(locale, '恢复属性跟随', 'Resume properties following', 'プロパティの追従を再開')
      : stage ? tr(locale, '固定舞台来源', 'Pin stage source', '舞台の出典を固定') : tr(locale, '固定属性来源', 'Pin properties source', 'プロパティの出典を固定');
    const toggle = button(label, () => {
      if (stage) this.fixedStageSource = fixed ? null : stageSource;
      else this.fixedInspectorSource = fixed ? null : statement;
      this.render();
    });
    toggle.dataset.focusKey = `source:${panel}:mode`;
    toggle.disabled = !fixed && !available;
    const mode = fixed ? tr(locale, '固定', 'Pinned', '固定') : tr(locale, '跟随', 'Following', '追従');
    const status = el('p', '', fixed && !available
      ? tr(locale, `固定来源已失效（${fixed.statementId ?? fixed.sceneId}）。恢复跟随后可重新选择。`,
        `The pinned source is unavailable (${fixed.statementId ?? fixed.sceneId}). Resume following to choose again.`,
        `固定した参照元（${fixed.statementId ?? fixed.sceneId}）を利用できません。追従を再開して選び直してください。`)
      : scene ? [mode, scene.name, resolved?.node.command].filter(Boolean).join(' · ')
      : tr(locale, '打开场景文档以恢复跟随。', 'Open a scene document to resume following.', 'シーン文書を開くと追従を再開します。'));
    status.setAttribute('role', 'status');
    controls.append(status);
    if (!stage && scene && !statement && !fixed)
      controls.append(el('p', '', tr(locale, '选择一条指令查看属性。', 'Select a command to inspect its properties.', 'コマンドを選ぶとプロパティを表示します。')));
    controls.append(toggle);
    const sceneId = scene?.sceneId;
    if (stage && sceneId) controls.append(button(tr(locale, '场景布景', 'Scene decor', 'シーンの背景レイヤー'),
      () => this.openEntryPresentation('scene', sceneId, undefined, true)));
    return controls;
  }
  private refreshDocumentTabs(): void {
    void this.reportAuthoringDrafts();
    queueMicrotask(() => {
      if (!this.shellProps || !this.shellRoot) return;
      this.shellProps = { ...this.shellProps, documents: this.documents, chrome: { ...this.shellProps.chrome, dirty: this.workbenchDirty() } };
      this.shellRoot.render(createElement(AuthoringWorkbench, this.shellProps));
    });
  }
  private workbenchDirty(): boolean { return this.controller.status.dirty || this.writingDrafts.size > 0 || this.scriptDrafts.size > 0; }
  private refreshCommandTarget(): void {
    if (!this.shellProps || !this.shellRoot) return;
    const editTarget = this.workbenchEditTargetLabel();
    const historyUnavailable = this.workbenchHistoryUnavailable();
    if (editTarget === this.shellProps.chrome.editTarget && historyUnavailable === this.shellProps.chrome.historyUnavailable) return;
    this.shellProps = { ...this.shellProps, chrome: { ...this.shellProps.chrome, editTarget, historyUnavailable } };
    this.shellRoot.render(createElement(AuthoringWorkbench, this.shellProps));
  }
  private activateVisibleDocument(id: string): boolean {
    if (this.activeDocument === id) return true;
    if (!this.documentRegions.get(id)?.interactive) return false;
    if (id.startsWith('scene:')) return this.activateVisibleScene(id);
    const document = this.documents.find(item => item.id === id);
    const sceneId = this.controller.scene?.sceneId;
    if (!document || id !== productionDocumentId && !['asset', 'character'].includes(document.kind) || this.missingDocument(document)
      || this.composingSceneInputs.size || this.writingDrafts.size || sceneId && this.scriptDrafts.has(sceneId)
      || this.production?.draftDirty) return false;
    this.rememberScene(); this.freezeDocumentRegion();
    this.activeDocument = id; this.focusedWorkbenchTool = null;
    this.page = id === productionDocumentId ? 'production' : document.kind === 'asset' ? 'assets' : 'editor';
    if (document.kind === 'character') { this.characterSelected = document.objectId; this.characterAsset = null; }
    queueMicrotask(() => { if (this.activeDocument === id) this.render(); });
    return true;
  }
  private retainDocumentRegions(node: HTMLElement, toolbar: HTMLElement | null): void {
    const ids = new Set(this.documents.map(document => document.id));
    for (const id of this.documentRegions.keys()) if (!ids.has(id)) this.documentRegions.delete(id);
    for (const id of this.retainedCompanions.keys()) {
      const owner = id.slice('studio-beside:'.length);
      if (!ids.has(owner) || !this.splitSceneViews.has(owner.slice('scene:'.length))) this.retainedCompanions.delete(id);
    }
    this.disposeCharacterRegions(ids);
    if (ids.has(this.activeDocument)) this.documentRegions.set(this.activeDocument, { node, toolbar, interactive: this.activeDocument === productionDocumentId || /^(scene|asset|character):/.test(this.activeDocument) });
    for (const [id, region] of this.documentRegions) {
      if (id !== this.activeDocument && (region.node === node || node.contains(region.node) || region.node.contains(node))) this.documentRegions.delete(id);
    }
    const layout = this.dock.current?.snapshot() ?? this.dockLayout;
    if (!validLayout(layout)) return;
    for (const group of groups(layout.tree)) {
      if (group.active === this.activeDocument) continue;
      const document = this.documents.find(item => item.id === group.active);
      if (document?.id === productionDocumentId && this.productionRoot) this.documentRegions.set(document.id, { node: this.productionDocument, interactive: true });
      else if (document?.kind === 'asset') this.documentRegions.set(document.id, { node: this.renderAssetDocument(document), interactive: true });
      else if (document?.kind === 'character' && document.objectId && !this.missingDocument(document)) {
        this.documentRegions.set(document.id, { node: this.characterDocument(document.objectId), interactive: true });
      } else if (document?.kind === 'scene') {
        const region = this.retainedSceneRegion(document);
        if (region) this.documentRegions.set(document.id, region);
      }
    }
  }
  private freezeDocumentRegion(): void {
    const region = this.documentRegions.get(this.activeDocument);
    if (!region || this.activeDocument === productionDocumentId || this.activeDocument.startsWith('asset:')) return;
    // The legacy page and character shells reuse a single editor root. The other
    // group may keep its document visible while the focused editor changes owner.
    if (this.activeDocument.startsWith('page:') || this.activeDocument.startsWith('route:') || this.activeDocument === 'characters') {
      this.documentRegions.set(this.activeDocument, { node: region.node.cloneNode(true) as HTMLElement, toolbar: region.toolbar?.cloneNode(true) as HTMLElement | undefined });
    }
  }
  /** Public document entrypoint for core pages and plugin consumers. */
  async openDocument(document: Omit<AuthorDocument, 'id' | 'title'> & { id?: string; title?: string }): Promise<void> {
    if (document.id === 'route:assets' || document.kind === 'route' && document.objectId === 'assets') return this.openAssetWorkspace();
    if (document.id === 'route:assistant' || document.kind === 'route' && document.objectId === 'assistant')
      document = { ...document, id: productionDocumentId, objectId: 'production' };
    if (document.kind === 'asset' && document.objectId) {
      return this.previewAsset(document.objectId, this.assetPreviewVersions.get(document.objectId), { focus: false });
    }
    if (!await this.flushScript()) return;
    if (!await this.flushProductionDraft()) return;
    this.rememberScene();
    this.freezeDocumentRegion();
    const form = document.id && this.formDocuments.get(document.id);
    if (form) { this.page = form.page; this.activeDocument = document.id!; this.render(); return; }
    if (document.id?.startsWith('plugin-document:') && this.studioPlugins) {
      const result = await this.studioPlugins.reopenDocument(document.id.slice('plugin-document:'.length));
      if (!this.notice(result)) { await this.navigate('plugins'); this.render(); }
      return;
    }
    if (document.kind === 'characters') {
      const characters = this.controller.source?.characters;
      const selected = this.characterSelected ?? this.characterGuiDraft?.selected;
      const character = characters?.find(item => item.id === selected) ?? characters?.[0];
      if (character && (!selected || character.id === selected || !this.characterGuiDraft?.drafts[selected])) {
        document = { kind: 'character', objectId: character.id, title: character.name };
      }
    }
    const id = document.id ?? (document.kind === 'scene' || document.kind === 'page' || document.kind === 'asset' || document.kind === 'character' ? `${document.kind}:${document.objectId}` : document.kind);
    if (id !== this.activeDocument && this.activeDocument.startsWith('page:')) this.designer?.stopBehaviorPreview();
    let title = document.title ?? id;
    if (this.missingDocument(document)) {
      this.documents = openAuthorDocument(this.documents, { ...document, id, title, preview: false });
      this.page = 'editor'; this.activeDocument = id; this.focusedWorkbenchTool = null; this.render();
      return;
    }
    if (document.kind === 'scene' && document.objectId) {
      const scene = this.controller.source?.scenes.find(item => item.sceneId === document.objectId); if (!scene) return;
      title = scene.name; if (id !== this.activeDocument || scene.sceneId !== this.controller.scene?.sceneId) {
        if (scene.sceneId !== this.controller.scene?.sceneId) this.controller.selectScene(scene.sceneId);
        const context = this.sceneContexts.get(scene.sceneId);
        if (context) { this.controller.changeView(context.view); this.controller.caret = { ...context.caret }; this.controller.scroll = { ...context.scroll }; this.controller.selection = structuredClone(context.selection); }
      }
      this.page = 'editor';
    } else if (document.kind === 'page') { this.page = 'pages';
      // Publish the requested document before awaiting the first Player mount.
      const layout = this.dock.current?.snapshot();
      const group = layout && groups(layout.tree).find(item => item.id === layout.activeGroup);
      this.documents = openAuthorDocument(this.documents, { ...document, id, title }, group?.tabs);
      this.activeDocument = id;
      if (document.objectId && this.designer) await this.designer.openPage(document.objectId);
      if (this.activeDocument !== id) return;
      title = this.designer?.workbenchPages().find(page => page.id === document.objectId)?.name ?? designerPageName(document.objectId ?? id.slice(5), this.controller.preferences.locale); }
    else if (document.kind === 'character') {
      this.page = 'editor';
      if (this.characterSelected !== document.objectId) this.characterAsset = null;
      this.characterSelected = document.objectId;
      title = this.controller.source?.characters.find(item => item.id === document.objectId)?.name ?? title;
    }
    else if (document.kind === 'startup') { this.page = 'pages'; title = document.title ?? '启动与主页'; }
    else if (document.kind === 'route') this.page = document.objectId as Page;
    else this.page = 'editor';
    this.recentObjects=[id,...this.recentObjects.filter(item=>item!==id)].slice(0,50);
    const next: AuthorDocument = { ...document, id, title, preview: document.preview ?? false };
    const layout = this.dock.current?.snapshot();
    const central = layout ? groups(layout.tree).find(group => group.id === layout.activeGroup) : undefined;
    this.documents = openAuthorDocument(this.documents, next, central?.tabs); this.activeDocument = id; this.focusedWorkbenchTool = null; this.render();
  }
  private async discardScope(document: AuthorDocument): Promise<import('@galcraft/contracts').DiscardScope | null> {
    if (this.missingDocument(document)) return null;
    const formScope = this.formDocuments.get(document.id)?.scope; if (formScope) return formScope;
    const source = this.controller.source; if (!source) return null;
    if (document.kind === 'scene') { const scene = source.scenes.find(scene => scene.sceneId === document.objectId); return scene ? { documentId: scene.documentId } : null; }
    if (document.kind === 'startup') return { documentId: source.projectDocumentId, paths: ['/data/display'] };
    if (document.id === 'project') return { documentId: source.projectDocumentId, paths: ['/data/player/autosave', '/data/player/name', '/data/languages'] };
    const listed = await this.services.bridge.documents.list(); if (!listed.ok) throw new Error(listed.error.message);
    if (document.kind === 'character' || document.kind === 'characters') {
      const characterId = document.objectId ?? this.characterSelected ?? source.characters[0]?.id;
      const owner = listed.value.find(item => `characters/${characterId}.json` in item.files);
      const documentId = owner?.documentId ?? (characterId ? this.characterDocumentIds.get(characterId) : undefined);
      return documentId ? { documentId } : null;
    }
    if (document.kind === 'page') { const documentId = this.designer?.workbenchDocumentId(document.objectId); return documentId && listed.value.some(item => item.documentId === documentId) ? { documentId } : null; }
    if (document.id === 'route:publish') return { documentId: source.projectDocumentId, paths: ['/data/name', '/data/releaseVersion', '/data/display/icon', '/data/release'] };
    if (document.kind === 'asset') return source.assetIndexDocumentId ? { documentId: source.assetIndexDocumentId, objectId: document.objectId } : null;
    return null;
  }
  private async discardDocument(document: AuthorDocument): Promise<boolean> {
    const scope = await this.discardScope(document), bridge = this.services.bridge.documents, locale = this.controller.preferences.locale;
    if (!scope || !bridge.planDiscard || !bridge.applyDiscard) throw new Error(tr(locale, '当前对象的放弃服务尚未就绪', 'Discard is unavailable for this object', 'この対象の破棄サービスは準備中です'));
    const result = await bridge.planDiscard(scope); if (!result.ok) throw new Error(result.error.message);
    const plan = result.value, files = plan.preview.flatMap(document => [...new Set([...Object.keys(document.files), ...Object.keys(document.savedFiles)])].map(path => ({ path, documentId: document.documentId, oldExists: path in document.savedFiles, newExists: path in document.files })));
    this.documentConfirm = null; this.render();
    const accepted = await requestDialog({ title: tr(locale, '放弃对象的未保存修改', 'Discard unsaved object changes', '対象の未保存変更を破棄'), locale, review: true,
      description: tr(locale, `请审阅“${document.title}”及关联对象的实际放弃范围。应用后可撤销；作品磁盘文件保留最近保存内容。`, `Review the actual scope for “${document.title}” and its related objects. Undo restores the changes; disk files retain the saved version.`, `「${document.title}」と関連する対象の破棄範囲を確認してください。元に戻すで変更を復元でき、ディスクは保存済みの内容を維持します。`),
      content: createElement(SaveChangeList, { files, documents: plan.preview, locale, context: 'discard' }),
      confirmLabel: tr(locale, '放弃修改并关闭', 'Discard and close', '変更を破棄して閉じる'),
      confirm: async () => { const applied = await bridge.applyDiscard!(plan.planId); if (!applied.ok) throw new Error(applied.error.message); await this.controller.acceptExternalEdit(applied.value, scope.documentId);
        if (document.kind === 'startup') { this.stopStartup?.(); this.startupRoot?.unmount(); this.startupRoot = null; this.startupDraft = false; }
        if (document.kind === 'character' || document.kind === 'characters') {
          const characterId = document.objectId ?? this.characterSelected ?? this.controller.source?.characters[0]?.id;
          if (characterId && this.characterGuiDraft) { delete this.characterGuiDraft.drafts[characterId]; delete this.characterGuiDraft.bases?.[characterId]; }
          if (characterId) this.characterDiscardRequest = { characterId, request: (this.characterDiscardRequest?.request ?? 0) + 1 };
          this.characterDraft = Boolean(Object.keys(this.characterGuiDraft?.drafts ?? {}).length);
        }
        if (document.id === 'project') { this.playerNameEditor?.dispose();this.playerNameEditor?.root.remove(); this.playerNameEditor = null; this.languageEditor.current?.discard(); }
        if (document.kind === 'page' && document.objectId) { this.designer?.discardWorkbenchDrafts(document.objectId); await this.designer?.refresh(); }
        this.render(); },
    });
    return accepted !== null;
  }
  private async closeDocument(id: string): Promise<boolean> {
    if(id==='project')await this.playerNameEditor?.waitForApply();
    if (!await this.flushScript() || !await this.flushProductionDraft()) return false;
    const form = this.formDocuments.get(id);
    if (form && !form.scope) {
      const finish = async () => { this.finishFormDocument(id); };
      if (!form.dirty()) { await finish(); return true; }
      return this.confirmAction('放弃未应用输入并关闭？',`${this.documents.find(item=>item.id===id)?.title} 的未应用输入将被放弃，已保存作品内容保持。`,'放弃输入并关闭',finish);
    }
    const document = this.documents.find(item => item.id === id); if (!document) return true;
    return new Promise(resolve => {
      const finish = async (retainForm = false) => {
        if (form) { this.documentConfirm = null; if (retainForm) { this.documents = this.documents.filter(item => item.id !== id); const origin = this.documents.find(item => item.id === form.source) ?? this.documents.at(-1); if (origin) await this.openDocument(origin); else { this.activeDocument = 'empty'; this.page = 'editor'; this.render(); } } else this.finishFormDocument(id); resolve(true); return; }
        const index = this.documents.findIndex(item => item.id === id); this.documents = this.documents.filter(item => item.id !== id); this.documentConfirm = null;
        const pageCompanion = document.kind === 'page' && document.objectId ? `studio-beside:${document.id}` : null;
        if (pageCompanion) this.designer?.closeBehaviorSplit(document.objectId!, false);
        if (document.kind === 'asset' && document.objectId) {
          this.assetPreviewVersions.delete(document.objectId);
          this.disposeAssetPreview(document.objectId);
        }
        if (this.activeDocument === id) { const next = this.documents[Math.min(index, this.documents.length - 1)]; if (next) await this.openDocument(next); else { this.activeDocument = 'empty'; this.page = this.controller.source ? 'editor' : 'projects'; this.render(); } } else this.render();
        if (pageCompanion) this.dock.current?.close(pageCompanion);
        resolve(true);
      };
      const pageDraft = !!form?.dirty() || document.kind === 'page' && !!this.designer?.workbenchHasDraft(document.objectId ?? '') || (document.kind === 'characters' && this.characterDraft || document.kind === 'character' && !!this.characterGuiDraft?.drafts[document.objectId!]) || document.kind === 'startup' && this.startupDraft || document.id === 'project' && (!!this.playerNameEditor?.dirty || !!this.languageEditor.current?.dirty) || document.id === 'route:publish' && this.publishUnapplied;
      if (id === 'route:connections' && this.connectionUnapplied) {
        const locale = this.controller.preferences.locale;
        this.documentConfirm = {
          title: tr(locale, '关闭连接配置？', 'Close connection settings?', '接続設定を閉じますか？'),
          description: tr(locale, '配置草稿保留在当前工作台。重开连接可继续编辑。', 'The configuration draft stays in this workbench. Reopen Connections to continue editing.', '設定の下書きは作業スペースに保持されます。接続を開くと編集を再開できます。'),
          close: () => { this.documentConfirm = null; this.render(); resolve(false); },
          actions: [{ label: tr(locale, '保留草稿并关闭', 'Keep draft and close', '下書きを保持して閉じる'), run: () => finish() }],
        };
        this.render();
      } else if (document.dirty || pageDraft) {
        const saveAndClose = async () => {
          const scope = await this.discardScope(document);
          if (!scope) throw new Error('当前文档的保存范围不可用');
          this.documentConfirm = null; this.render();
          await this.save(false, scope.documentId, scope.objectId);
          const bridge = this.services.bridge.documents;
          if (scope.objectId) {
            const listed = await bridge.list();
            if (!this.notice(listed)) { resolve(false); return; }
            const exact = revisionedSaveReviewScope({ kind: 'objects', objects: [{ kind: 'asset', documentId: scope.documentId, objectId: scope.objectId }] }, listed.value);
            if (exact.kind === 'objects' && exact.objects.length) { resolve(false); return; }
          } else {
            const pending = await bridge.planSave({ kind: 'current', documentId: scope.documentId });
            if (!pending.ok || pending.value.files.length) { resolve(false); return; }
          }
          await finish();
        };
        this.documentConfirm = { title: '关闭未保存的文档？', description: pageDraft ? '当前输入尚未应用。保留修改后可返回继续编辑；放弃会先展示当前对象及关联内容的实际范围。' : '修改保留在作品工作区；保存和放弃会先展示各自的完整净差异。', close: () => { this.documentConfirm = null; this.render(); resolve(false); }, actions: [{ label: '保留修改并关闭', run: () => finish(true) }, { label: '放弃修改并关闭', tone: 'danger', run: async () => { if (await this.discardDocument(document)) await finish(); } }, ...(!pageDraft ? [{ label: '保存并关闭', tone: 'primary' as const, run: saveAndClose }] : [])] }; this.render();
      } else void finish();
    });
  }  private async applyWorkbenchObject(edit: EditInput | string | null): Promise<string | void> {
    if (typeof edit === 'string') return edit; if (!edit) return;
    const documents = this.services.bridge.documents, planned = await documents.planEdit(edit); if (!planned.ok) return planned.error.message;
    const applied = await documents.applyEdit(planned.value.planId, edit.expected); if (!applied.ok) return applied.error.message;
    await this.controller.acceptExternalEdit(applied.value, edit.patches[0]?.documentId); this.render();
  }
  private async flushProductionDraft(): Promise<boolean> {
    const production = this.production;
    if (!production?.draft || production.draft.submittedTaskId) return true;
    try { production.start(); await production.saveDraft(); return true; }
    catch (error) {
      production.error = String(error); production.changed();
      return new Promise<boolean>(resolve => {
        let continued = false;
        this.documentConfirm = {
          title: '制作草稿保存失败', cancelLabel: '继续编辑',
          description: `${String(error)}。输入仍保留。重试会保存当前输入；明确放弃只恢复最近保存的草稿，已保存草稿、任务和候选继续保留。`,
          close: () => { this.documentConfirm = null; this.render(); resolve(continued); },
          actions: [
            { label: '重试保存并继续', tone: 'primary', run: async () => {
              try { await production.saveDraft(); }
              catch (reason) { production.error = String(reason); production.changed(); throw reason; }
              production.error = ''; production.changed(); continued = true;
            } },
            { label: '放弃未保存输入并继续', tone: 'danger', run: async () => { await production.abandonDraftChanges(); continued = true; } },
          ],
        };
        this.render();
      });
    }
  }
  private async createWorkbenchObject(kind: 'chapter' | 'scene', parent?: string): Promise<void> {
    if (!await this.flushScript() || !this.controller.source) return;
    if(this.treeCreateEditor?.isConnected){this.treeCreateEditor.querySelector('input')?.focus();return;}
    const locale=this.controller.preferences.locale,row=el('div','gc-wb-tree-create'),input=el('input'),error=el('small','field-error');error.setAttribute('role','alert');
    input.ariaLabel=kind==='chapter'?tr(locale,'章节名称','Chapter name','章の名前'):this.t('sceneName');input.placeholder=input.ariaLabel;let busy=false;
    const close=()=>{row.remove();this.treeCreateEditor=null;};
    const commit=async()=>{if(busy)return;const name=input.value.trim();if(!name){error.textContent=tr(locale,'名称不能为空','Name is required','名前を入力してください');input.focus();return;}busy=true;input.disabled=true;
      try { if(kind==='chapter'){const message=await this.applyWorkbenchObject(createWorkbenchChapter(this.controller.source!,name));if(message)throw new Error(message);}
        else if(parent){if(this.controller.source!.scenes.some(scene=>scene.chapterId===parent&&scene.name===name))throw new Error(tr(locale,'同一章节已有此场景名称','This chapter already has a scene with this name','この章には同じ名前のシーンがあります'));const result=await this.controller.createScene(name,parent);if(!result.ok)throw new Error(result.error.message);await this.openDocument({kind:'scene',objectId:this.controller.scene!.sceneId});}close();
      }catch(reason){error.textContent=reason instanceof Error?reason.message:String(reason);input.focus();}finally{busy=false;input.disabled=false;}};
    input.onkeydown=event=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Enter'){event.preventDefault();void commit();}};
    row.append(input,button(tr(locale,'创建','Create','作成'),commit),button(this.t('cancel'),close),error);this.treeCreateEditor=row;
    const parentRow=parent?this.root.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(parent)}"]`):null;
    const createSlot=this.root.querySelector('.scene-tree-create-slot');
    if(createSlot)createSlot.append(row);else if(parentRow)parentRow.after(row);else this.root.querySelector('.gc-wb-explorer .gc-wb-tree')?.prepend(row);input.focus();
  }
  private async openEntryPresentation(kind: 'chapter' | 'scene', objectId: string, resume?: {
    draft: SceneEntryPresentation; original: string; decorDraft?: SceneDecorLayer[]; decorOriginal?: string;
  }, focusDecor = false, decorId?: Id): Promise<void> {
    if (!this.inputDraftRestoring && !await this.flushScript()) return;
    const source = this.controller.source; if (!source) return;
    const showDecor = () => requestAnimationFrame(() => {
      const editor = this.formDocuments.get(id)?.node;
      const layer = decorId && editor?.querySelector<HTMLElement>('[data-decor-layer-id="' + CSS.escape(decorId) + '"]');
      const target = layer ? layer.querySelector<HTMLElement>('button') : editor?.querySelector<HTMLElement>('.scene-decor-heading button');
      if (target?.isConnected) { target.focus(); target.scrollIntoView({ block: 'nearest' }); }
    });
    const id = `entry:${kind}:${objectId}`, opened = this.documents.find(document => document.id === id);
    if (opened) { await this.openDocument(opened); if (decorId) this.formDocuments.get(id)?.locateDecor?.(decorId); if (focusDecor) showDecor(); return; }
    if (this.formDocuments.has(id)) { const locale=this.controller.preferences.locale;const retained: AuthorDocument = { id, kind: 'route', objectId: 'editor', title: `${kind==='chapter'?tr(locale,'章节开场','Chapter opening','章の開始'):tr(locale,'场景开场','Scene opening','シーンの開始')} · ${kind === 'chapter' ? source.project.chapters.find(chapter => chapter.id === objectId)?.name : source.scenes.find(scene => scene.sceneId === objectId)?.name}` }; this.documents = openAuthorDocument(this.documents, retained); await this.openDocument(retained); if (focusDecor) showDecor(); return; }
    const listed = await this.services.bridge.documents.list(); if (!listed.ok) throw new Error(listed.error.message);
    const scene = source.scenes.find(scene => scene.sceneId === objectId), chapter = source.project.chapters.find(chapter => chapter.id === objectId);
    const ownerId = kind === 'chapter' ? source.projectDocumentId : scene?.documentId;
    const owner = listed.value.find(document => document.documentId === ownerId); if (!owner) return;
    const rawPath = Object.keys(owner.files).find(path => path.endsWith('.json'))!, data = JSON.parse(owner.files[rawPath]!).data;
    const originalValue = kind === 'chapter' ? data.chapters.find((chapter: { id: string }) => chapter.id === objectId)?.presentation : data.presentation;
    const normalizePresentation = (value: unknown) => SceneEntryPresentationSchema.parse(value ?? { title: null, interlude: null });
    let original = resume?.original ?? JSON.stringify(originalValue ?? null), draft = resume?.draft ?? normalizePresentation(originalValue), dirty = !!resume, busy = false;
    let decorOriginal = resume?.decorOriginal ?? JSON.stringify(data.decorLayers ?? []);
    let decorDraft = resume?.decorDraft ?? SceneDecorLayerSchema.array().parse(data.decorLayers ?? []);
    const locale = this.controller.preferences.locale, container = el('section','scene-entry-document'), content = el('div'), status = el('p', 'field-help'), error = el('p', 'authoring-form-error'), actions = el('footer', 'authoring-toolbar'), react = createRoot(content);
    status.setAttribute('role','status');
    error.setAttribute('role', 'alert'); container.append(content, status, error, actions);
    const apply = async () => {
      if (busy) return; busy = true; refreshActions(); error.textContent = '';
      try {
        const checked = SceneEntryPresentationSchema.safeParse(draft); if (!checked.success) throw new Error(checked.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n'));
        const current = await this.services.bridge.documents.list(); if (!current.ok) throw new Error(current.error.message);
        const document = current.value.find(document => document.documentId === ownerId); if (!document) throw new Error('入口对象已移除');
        const before = JSON.parse(document.files[rawPath]!).data, old = kind === 'chapter' ? before.chapters.find((chapter: { id: string }) => chapter.id === objectId)?.presentation : before.presentation;
        if (JSON.stringify(old ?? null) !== original || kind === 'scene' && JSON.stringify(before.decorLayers ?? []) !== decorOriginal)
          throw new Error(tr(locale, '场景设置已变化，当前输入仍保留。请还原或比较后重试。', 'Scene settings changed. Your input is retained. Restore or compare the settings before retrying.', 'シーン設定が変更されました。入力は保持されています。復元または比較して再試行してください。'));
        if (kind === 'scene') {
          const presentationChanged = JSON.stringify(checked.data) !== JSON.stringify(normalizePresentation(JSON.parse(original)));
          const decorChanged = JSON.stringify(decorDraft) !== JSON.stringify(SceneDecorLayerSchema.array().parse(JSON.parse(decorOriginal)));
          if (presentationChanged || decorChanged) {
            const result = await this.controller.authorOperation({ op: 'scene.update', id: objectId, changes: {
              ...(presentationChanged ? { presentation: checked.data } : {}), ...(decorChanged ? { decorLayers: decorDraft } : {}),
            } }, current.value);
            if (!result.ok) throw new Error(issueText(result.error, locale));
            if (presentationChanged) original = JSON.stringify(checked.data);
            if (decorChanged) decorOriginal = JSON.stringify(decorDraft);
          }
        } else {
          const after = { ...before, chapters: before.chapters.map((chapter: { id: string }) => chapter.id === objectId ? { ...chapter, presentation: checked.data } : chapter) };
          const bindings = round5AssetBindings({ project: after });
          const result = await this.applyWorkbenchObject({ label: tr(locale, '修改入口演出', 'Edit entry presentation', '入口演出を変更'), origin: 'field', expected: [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }],
            patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data/chapters', before: before.chapters, after: after.chapters, op: 'set' }] }], preparedAssets: [], requiredRefs: bindings.map(binding => ({ kind: binding.variantId ? 'variant' : 'asset', id: binding.variantId ?? binding.assetId })) });
          if (result) throw new Error(result);
          original = JSON.stringify(checked.data);
        }
        dirty = false;
        this.documents = this.documents.map(item => item.id === id ? { ...item, dirty: true } : item); this.refreshDocumentTabs();
        status.textContent = tr(locale, '已应用 · 待保存。保存作品时审阅实际差异。', 'Applied · Unsaved. Review the actual changes when saving.', '適用済み・未保存。作品の保存時に差分を確認してください。');
        if (kind === 'scene') this.render();
      } finally { busy = false; refreshActions(); }
    };
    const changed = () => {
      dirty = true;
      status.textContent = tr(locale, '未应用 · 应用后进入工作区，保存后落盘。', 'Unapplied · Apply to working content, then save to disk.', '未適用・作業内容に適用してから保存してください。');
      this.documents = this.documents.map(item => item.id === id ? { ...item, dirty: true } : item);
      this.refreshDocumentTabs(); refreshActions(); draw();
    };
    let decorLocation = decorId ? { id: decorId, request: 1 } : undefined;
    const draw = () => {
      const assets = [...this.assetCache.values()];
      react.render(createElement('div', {},
        createElement(SceneEntryEditor, { value: draft, assets, locale, change: value => { draft = value; changed(); } }),
        kind === 'scene' && createElement(SceneDecorEditor, {
          layers: decorDraft, assets, locale, locate: decorLocation, change: layers => { decorDraft = layers; changed(); },
          choose: async (layer, origin) => {
            const choice = await openAssetPicker({ services: this.services, projectId: source.project.projectId, sceneId: objectId,
              allowedKinds: ['image'], locale, mode: 'compact', scope: this.root, returnFocus: origin, remember: false,
              purpose: tr(locale, '布景图片', 'Decor image', '背景レイヤーの画像'),
              currentAssetId: layer?.assetId, currentVariantId: layer?.variantId,
              onApply: async () => ({ ok: true, value: undefined, warnings: [] }),
            });
            if (!choice) return null;
            this.assetCache.set(choice.asset.id, choice.asset);
            return SceneDecorLayerSchema.parse({ id: createId(), ...layer, assetId: choice.assetId,
              variantId: choice.variantId ?? choice.asset.activeVariantId });
          },
        }),
      ));
    };
    const reload = async (force = false) => {
      if (dirty && !force || busy) return;
      const current = await this.services.bridge.documents.list(); if (!current.ok || dirty && !force) return;
      const document = current.value.find(document => document.documentId === ownerId); if (!document?.files[rawPath]) return;
      const data = JSON.parse(document.files[rawPath]!).data, value = kind === 'chapter' ? data.chapters.find((chapter: { id: string }) => chapter.id === objectId)?.presentation : data.presentation;
      const next = JSON.stringify(value ?? null), nextDecor = JSON.stringify(data.decorLayers ?? []);
      status.textContent = document.dirty ? tr(locale,'已应用 · 待保存。','Applied · Unsaved.','適用済み・未保存。') : tr(locale,'已保存 · 当前工作区设置。','Saved · Current workspace settings.','保存済み・現在の作業設定。');
      if (this.documents.find(item => item.id === id)?.dirty !== document.dirty) { this.documents = this.documents.map(item => item.id === id ? { ...item, dirty: document.dirty } : item); this.refreshDocumentTabs(); }
      if (next === original && nextDecor === decorOriginal && !force) return;
      original = next; draft = normalizePresentation(value); dirty = false; error.textContent = '';
      decorOriginal = nextDecor; decorDraft = SceneDecorLayerSchema.array().parse(data.decorLayers ?? []);
      this.documents = this.documents.map(item => item.id === id ? { ...item, dirty: document.dirty } : item); this.refreshDocumentTabs(); draw();
      refreshActions();
    };
    const restore = button(tr(locale, '还原为工作区设置', 'Restore workspace settings', '作業設定に戻す'), async () => { if (dirty && !await this.confirm(tr(locale, '还原为工作区设置并放弃此表单尚未应用的输入？', 'Restore workspace settings and discard unapplied input in this form?', '作業設定に戻し、このフォームの未適用入力を破棄しますか？'))) return; await reload(true); });
    const preview = button(tr(locale,'应用并预览','Apply and preview','適用してプレビュー'), async () => { if(busy)return; try { if (dirty) await apply(); busy=true;refreshActions(); const sceneId=kind==='chapter'?this.controller.source?.project.chapters.find(chapter=>chapter.id===objectId)?.sceneIds[0]:objectId;if(sceneId)await this.previewScene(sceneId); }catch(reason){error.textContent=String(reason);}finally{busy=false;refreshActions();} });
    const applyButton = button(tr(locale, '应用更改', 'Apply changes', '変更を適用'), async () => { try { await apply(); } catch (reason) { error.textContent = String(reason); } }, 'authoring-primary');
    const refreshActions=()=>{restore.disabled=busy||!dirty;applyButton.disabled=busy||!dirty;preview.disabled=busy;content.inert=busy;actions.setAttribute('aria-busy',String(busy));};
    actions.append(restore,preview,applyButton);refreshActions();
    status.textContent = owner.dirty ? tr(locale,'已应用 · 待保存。预览会应用当前设置后启动试玩。','Applied · Unsaved. Preview applies these settings before playtesting.','適用済み・未保存。プレビューは設定を適用して試遊します。') : tr(locale,'已保存 · 预览会应用当前设置后启动试玩。','Saved · Preview applies these settings before playtesting.','保存済み・プレビューは設定を適用して試遊します。');
    draw(); this.openFormDocument(id, `${kind==='chapter'?tr(locale,'章节开场','Chapter opening','章の開始'):tr(locale,'场景开场','Scene opening','シーンの開始')} · ${chapter?.name ?? scene?.name}`, container, () => dirty, () => react.unmount(), active => { if (active) void reload(); });
    this.formDocuments.get(id)!.capture = () => asJson({kind:'entry',entryKind:kind,objectId,draft,original,...(kind === 'scene' ? { decorDraft, decorOriginal } : {})});
    this.formDocuments.get(id)!.locateDecor = id => { decorLocation = { id, request: (decorLocation?.request ?? 0) + 1 }; draw(); };
    this.formDocuments.get(id)!.scope = { documentId: owner.documentId, paths: kind === 'chapter' ? ['/data/chapters'] : ['/data/presentation', '/data/decorLayers'] };
    const inspector=el('section','authoring-inspector');inspector.append(el('h2','',chapter?.name??scene?.name??''),el('p','',kind==='chapter'?tr(locale,'章节开场 · 在本章首场景播放','Chapter opening · Plays at the first scene','章の開始・最初のシーンで再生'):tr(locale,'场景开场 · 在本场景正文前播放','Scene opening · Plays before this scene','シーンの開始・本文の前に再生')),el('p','field-help',tr(locale,'短标题卡与全屏间幕在中央设置。应用后进入工作区，保存后落盘。','Configure the title card and fullscreen interlude in the document. Apply to working content, then save to disk.','中央でタイトルと幕間を設定します。作業内容に適用してから保存してください。')));
    this.formDocuments.get(id)!.inspector=inspector;this.render();
    if (focusDecor) showDecor();
    for (let offset = 0;; offset += 100) { const queried = await this.services.queryAssets({ kind: null, text: '', offset, limit: 100 }); if (!queried.ok) break; queried.value.items.forEach(asset => this.assetCache.set(asset.id, asset)); if (offset + queried.value.items.length >= queried.value.total) break; } draw();
  }
  private async previewScene(sceneId: string, entryId?: string): Promise<void> {
    if (!await this.flushScript()) return;
    const scene = this.controller.source?.scenes.find(scene => scene.sceneId === sceneId); if (!scene) return;
    if(entryId){await startPlaytest(this.root,this.services,null,()=>this.render(),this.controller.preferences.locale,this.debugRouteIntent,entryId);return;}
    const first = parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).cst.find(node => node.valid && node.id)?.id;
    if (!first) throw new Error('请先为场景填写可执行剧情');
    await startPlaytest(this.root, this.services, { sceneId, statementId: first }, () => this.render(), this.controller.preferences.locale, this.debugRouteIntent);
  }
  /** Isolated preview: it never activates or mutates the scene playtest session. */
  async previewStartup(kind: StartupPreviewKind, host: HTMLElement, display: import('@galcraft/contracts').Project['display']): Promise<() => void> {
    this.stopStartup?.(); const generation = ++this.startupGeneration;
    const compiled = await this.services.compilePreview?.(); if (!compiled || !compiled.ok) throw new Error(compiled && !compiled.ok ? compiled.error.message : '预览编译服务不可用');
    const snapshot = compiled.value.snapshot ?? compiled.value.lastValid; if (!snapshot) throw new Error('尚无有效预览快照');
    const previewSnapshot = structuredClone(snapshot); previewSnapshot.project.display = structuredClone(display);
    const listed = await this.services.bridge.documents.list(); if (!listed.ok) throw new Error(listed.error.message);
    const player = await openPlayerPreview(host, this.services, previewSnapshot, 'sample', Object.assign({}, ...listed.value.map(document => document.files)));
    let stopped = false; const stop = () => { if (stopped) return; stopped = true; player.view.stopStartupPreview(); player.dispose(); if (this.stopStartup === stop) this.stopStartup = null; };
    if (generation !== this.startupGeneration || this.activeDocument !== 'startup') { stop(); return stop; }
    this.stopStartup = stop; try { await player.view.previewStartup(kind, display); } catch (error) { stop(); throw error; } return stop;
  }
  private startupDocument(active: boolean): HTMLElement {
    const source = this.controller.source; if (!source) return this.startupNode;
    this.startupRoot ??= createRoot(this.startupNode);
    flushSync(() => this.startupRoot!.render(createElement(StartupEditor, { project: source.project, guiDraft:this.startupGuiDraft,onGuiDraftChange:this.captureStartupGui, locale: this.controller.preferences.locale, assets: [...this.assetCache.values()], active, inspectorContainer: this.startupInspector, runtimeAssets: this.services.runtimeAssets,
      chooseAsset: async (field: StartupAssetField) => { const allowedKinds: AssetKind[] = field === 'splash' ? ['image', 'video'] : field === 'titleBackground' ? ['image'] : field === 'titleMusic' ? ['audio'] : ['video'];
        const choice = await openAssetPicker({ services: this.services, projectId: source.project.projectId, allowedKinds, locale: this.controller.preferences.locale, currentAssetId: this.controller.source?.project.display[field], mode: 'compact', scope: this.root, remember: false,
          onApply: async choice => { this.assetCache.set(choice.asset.id, choice.asset); return { ok: true, value: undefined, warnings: [] }; } }); return choice?.assetId ?? null; },
      onChange: async display => { const current = this.controller.source; if (!current || current.project.projectId!==source.project.projectId) throw new Error('请返回此草稿所属作品后继续编辑。');
        const picked = (['splash', 'titleBackground', 'titleMusic', 'titleVideo'] as const).flatMap(key => display[key] && display[key] !== current.project.display[key] ? [display[key]!] : []);
        const error = await this.applyWorkbenchObject({ label: '修改启动与主页', origin: 'field', expected: [{ ref: { kind: 'document', id: current.projectDocumentId }, revision: current.projectRevision }], patches: [{ kind: 'json', documentId: current.projectDocumentId, changes: [{ path: '/data/display', before: current.project.display, after: display, op: 'set' }] }], preparedAssets: [], requiredRefs: picked.map(id => ({ kind: 'asset', id })) }); if (error) throw new Error(error); if (picked.length) await recordAssetsPicked(this.services, current.project.projectId, picked);
      }, history: async action => { await this.shellAction(action); }, preview: (kind, host, display) => this.previewStartup(kind, host, display), onDraftChange: dirty => { this.startupDraft = dirty; this.documents = this.documents.map(document => document.kind === 'startup' ? { ...document, dirty: dirty || this.controller.source?.projectDirty } : document); this.refreshDocumentTabs(); },
    }))); return this.startupNode;
  }
  private async refreshStudioPlugins(): Promise<void> {
    const source = this.controller.source;
    if (!source) { await this.studioPlugins?.dispose(); this.studioPlugins = null; return; }
    this.studioPlugins ??= new StudioPluginHost(this.services.bridge, source.project.projectId,
      () => this.controller.preferences.locale, key => this.navigate(`extension:${key}`),
      async (receipt, input) => { if (receipt) await this.controller.acceptExternalEdit(receipt, input?.patches[0]?.documentId); else await this.controller.refresh(); this.render(); }, {
        workspace: this.documentWorkspace, scope: () => this.pluginScope(), services: createStudioAuthorServices(this.services.bridge as StudioBridge),
        navigate: (page, result) => this.navigatePlugin(page, result), locate: source => this.locatePlugin(source),
      });
    const result = await this.studioPlugins.load();
    this.services.assetUi = this.studioPlugins.assetUi;
    this.assetInspectorView && disposeAssetInspector(this.assetInspectorView.node); this.assetInspectorView = null;
    this.assetRows.clear();
    const catalog = await this.services.assetTypeCatalog?.(); if (catalog?.ok) this.assetTypes = catalog.value;
    if (!result.ok) this.message = result.error.message;
  }
  private pluginScope(): StudioScope {
    const selection = this.controller.selection, scene = this.controller.scene;
    const page: Partial<Record<Page, StudioCorePage>> = { projects: 'overview', editor: 'creation', assets: 'assets', pages: 'player-ui', assistant: 'player-ui', production: 'production', collaboration:'collaboration', plugins: 'plugins', publish: 'publish' };
    return { page: page[this.page] ?? this.page, sceneId: scene?.sceneId ?? null, documentId: selection?.documentId ?? null,
      statementIds: [...selection?.statementIds ?? []], textRange: selection?.textRange ? { ...selection.textRange } : null,
      assetIds: [...this.selectedAssets], insertion: scene ? { documentId: scene.documentId, offset: this.controller.caret.documentOffset } : null,
      versions: scene ? [{ ref: { kind: 'document', id: scene.documentId }, revision: scene.revision }] : [] };
  }
  private async navigatePlugin(page: StudioCorePage, result?: PluginToolResult): Promise<Result<void>> {
    const routes = { overview: 'projects', creation: 'editor', assets: 'assets', 'player-ui': 'pages', production: 'production', collaboration:'collaboration', plugins: 'plugins', publish: 'publish' } as const;
    try { await this.navigate(routes[page]);
      if (this.page !== routes[page]) { const error = { code: 'PLUGIN_NAVIGATION_PENDING', severity: 'error' as const, owner: 'M01' as const, message: '请先处理当前草稿或页面错误，再打开目标页面', related: [], actions: [] }; return { ok: false, error, issues: [error] }; }
      if (result && this.production && (result.kind === 'task' || result.kind === 'candidate')) {
        const session = this.production;
        const candidateIds = result.kind === 'task' ? result.candidateIds ?? [] : [result.candidateId];
        const taskId = result.taskId ?? (result.kind === 'candidate'
          ? unwrapProduction(await session.bridge.production.overview()).candidates.find(item => item.candidate.id === result.candidateId)?.candidate.taskId : undefined);
        if (taskId && session === this.production) await session.openTask(taskId, candidateIds);
        if (!taskId || session !== this.production || session.task?.id !== taskId) { const error = { code: 'PLUGIN_RESULT_MISSING', severity: 'error' as const, owner: 'M01' as const, message: '制作结果已移除或不属于当前作品', related: [], actions: [] }; return { ok: false, error, issues: [error] }; }
      }
      return { ok: true, value: undefined, warnings: [] };
    } catch (e) { const error = { code: 'PLUGIN_NAVIGATION', severity: 'error' as const, owner: 'M01' as const, message: String(e), related: [], actions: [] }; return { ok: false, error, issues: [error] }; }
  }
  private async locatePlugin(source: Source): Promise<Result<void>> {
    if (!await this.flushScript()) { const error = { code: 'PLUGIN_LOCATION_DRAFT', severity: 'error' as const, owner: 'M01' as const, message: '请先处理当前文本草稿', related: [], actions: [] }; return { ok: false, error, issues: [error] }; }
    const found = await this.services.locate?.(source);
    if (found && !found.ok) return found;
    const scene = this.controller.source?.scenes.find(item => item.documentId === source.documentId);
    if (!scene || !found?.value) {
      await this.navigate(scene ? 'editor' : 'plugins');
      const error = { code: 'PLUGIN_LOCATION_CHANGED', severity: 'error' as const, owner: 'M01' as const, message: scene ? '来源已变化，已打开所属文档。请重新执行工具取得当前位置。' : '来源文档已移除，已打开插件文档入口。', related: [], actions: ['retry' as const] }; return { ok: false, error, issues: [error] };
    }
    this.controller.selectScene(scene.sceneId); if (found.value.statementId) this.controller.select([found.value.statementId]);
    this.controller.setCaret(found.value.statementId, found.value.start); this.page = 'editor'; this.render();
    requestAnimationFrame(() => this.root.querySelector<HTMLElement>(`[data-statement-id="${CSS.escape(found.value!.statementId ?? '')}"]`)?.focus({ preventScroll: true }));
    return { ok: true, value: undefined, warnings: [] };
  }
  private async choiceForClose(purpose: 'exit' | 'closeProject' | 'switchProject', creating = false): Promise<'save' | 'discard' | 'cancel'> {
    const focus = captureAuthoringFocus(this.root);
    let choice: 'save' | 'discard' | 'cancel' = 'cancel';
    try { choice = await this.prepareClose(purpose, creating); return choice; }
    finally { if (choice === 'cancel') requestAnimationFrame(() => restoreAuthoringFocus(this.root, focus)); }
  }
  private async prepareClose(purpose: 'exit' | 'closeProject' | 'switchProject', creating = false): Promise<'save' | 'discard' | 'cancel'> {
    await this.playerNameEditor?.waitForApply();
    if (!await this.flushScript()) return 'cancel';
    const t = (zh: string, en: string, ja: string) => tr(this.controller.preferences.locale, zh, en, ja);
    const pending = this.unappliedInput(!creating);
    if (pending) { const abandon = await new Promise<boolean>(resolve => { this.documentConfirm = { title: t('先处理未应用输入', 'Resolve unapplied input', '未適用の入力を確認'), description: t(`${pending}的输入尚未应用。返回可继续编辑；放弃后仍会审阅作品的未保存修改。`, `${pending} has unapplied input. Cancel to keep editing, or discard it and review unsaved project changes.`, `${pending}に未適用の入力があります。キャンセルして編集を続けるか、入力を破棄して作品の未保存の変更を確認してください。`), close: () => { this.documentConfirm = null; this.render(); resolve(false); }, actions: [{ label: t('放弃未应用输入并继续', 'Discard input and continue', '入力を破棄して続行'), tone: 'danger', run: () => { this.documentConfirm = null; resolve(true); } }] }; this.render(); }); if (!abandon) return 'cancel';
      if (this.startupDraft) { this.startupRoot?.unmount(); this.startupRoot = null; this.startupDraft = false; this.stopStartup?.(); }
      if (this.characterDraft) { this.characterRoot?.unmount(); this.characterRoot = null; this.characterDraft = false; }
      if(this.designer?.hasAnimationDraft())this.designer.discardAnimationDraft();
      this.designer?.discardStyleDrafts(); this.playerNameEditor?.discard(); this.languageEditor.current?.discard();
      this.insertions.clear();
      const forms = new Set(this.formDocuments.keys()); for (const form of this.formDocuments.values()) form.dispose?.(); this.formDocuments.clear(); this.documents=this.documents.filter(item=>!forms.has(item.id)); if(forms.has(this.activeDocument))this.activeDocument='';
      if (this.productionUnapplied || this.publishUnapplied) {
        const discardProduction=this.productionUnapplied,discardPublish=this.publishUnapplied;
        this.workbench?.unmount(); this.workbench=null;
        if(discardProduction&&this.production){this.production.guiDraft=null;this.production.connectionGuiDraft=null;this.production.connectionDirty=false;this.production.workflowGuiDraft=null;this.production.workflowDirty=false;}
        if(discardPublish)this.publishGuiDraft=null;
        this.productionUnapplied=false; this.publishUnapplied=false;
      }
      if (!creating && this.projectCreateUnapplied) { this.projectsRoot?.unmount(); this.projectsRoot=null; this.projectCreateUnapplied=false; this.projectDraft={...this.projectDraft,name:''}; }
      if (this.resourceProcessorUnapplied) { this.resourceProcessorRoot?.unmount(); this.resourceProcessorRoot=null; this.resourceProcessorGuiDraft=null; this.resourceProcessorUnapplied=false; }

    }
    if (!await this.flushProductionDraft()) return 'cancel';
    if (!this.controller.source) return 'discard';
    await this.controller.flushResume();
    const source = this.controller.source;
    if (!source.anyDirty && !source.projectDirty && !source.scenes.some(scene => scene.dirty) && !this.controller.status.dirty) return 'save';
    const choice = await new Promise<'save' | 'discard' | 'cancel'>(resolve => {
      const finish = (choice: 'save' | 'discard' | 'cancel') => { this.documentConfirm=null; this.render(); resolve(choice); };
      const labels = purpose === 'exit'
        ? [t('退出前保存修改？','Save changes before exiting?','終了する前に保存しますか？'),t('放弃修改并退出','Discard & exit','変更を破棄して終了'),t('审阅保存并退出','Review, save & exit','確認して保存・終了')]
        : purpose === 'closeProject'
          ? [t('关闭作品前保存修改？','Save before closing the project?','作品を閉じる前に保存しますか？'),t('放弃修改并关闭作品','Discard & close project','変更を破棄して作品を閉じる'),t('审阅保存并关闭作品','Review, save & close project','確認して保存・作品を閉じる')]
          : [t('保存后切换作品？','Save before switching projects?','作品を切り替える前に保存しますか？'),t('放弃修改并切换','Discard & switch','変更を破棄して切り替え'),t('审阅保存并切换','Review, save & switch','確認して保存・切り替え')];
      this.documentConfirm={ title:labels[0]!,description:t(`“${source.project.name}”有未保存的修改。`,`“${source.project.name}” has unsaved changes.`,`「${source.project.name}」に未保存の変更があります。`),close:()=>finish('cancel'),actions:[
        {label:labels[1]!,tone:'danger',run:()=>finish('discard')},
        {label:labels[2]!,run:()=>finish('save')} ]};this.render();
    });
    if (choice === 'save') { await this.save(true); if (this.controller.source?.anyDirty || this.controller.status.dirty) return 'cancel'; }
    return choice;
  }
  private async openedProject(sessionId: Id): Promise<boolean> {
    if (this.mattingCandidate) {
      await this.services.discardBackground?.(this.mattingCandidate.preparationId);
      this.mattingCandidate = null;
    }
    this.sessionId = sessionId; this.controller.close(); this.scriptDrafts.clear(); this.writingDrafts.clear();
    const loaded = await this.controller.open(); if (!this.notice(loaded)) return false;
    this.recoveryPending = false;
    await this.projectChanged(); void this.checkRecovery(); return true;
  }
  private async checkRecovery(): Promise<void> {
    // The shared service already owns these working edits; a newly attached UI
    // only offers disk recovery when no live working changes exist.
    if (this.controller.source?.anyDirty) return;
    const draft = await this.services.bridge.documents.listRecovery();
    if (!draft.ok || !draft.value) return;
    this.recoveryPending = true; this.render(); await this.reviewRecovery();
  }
  private async reviewRecovery(): Promise<void> {
    if (this.recoveryReviewOpen) return;
    this.recoveryReviewOpen = true;
    const locale = this.controller.preferences.locale, api = this.services.bridge.documents;
    try {
      const draft = await api.listRecovery(); if (!draft.ok) throw new Error(draft.error.message); if (!draft.value) { this.recoveryPending = false; return; }
      const saved = await api.list(); if (!saved.ok) throw new Error(saved.error.message);
      let choice: 'restore' | 'discard' = 'restore';
      const result = await requestDialog({ title: tr(locale, '恢复未保存内容', 'Recover unsaved work', '未保存の作業を復元'), locale, review: true,
        description: tr(locale, '检测到上次退出时保留的草稿。恢复后仍需审阅并保存；取消会保留草稿，稍后可继续处理。', 'A draft from the previous session is available. Review and save after restoring. Cancel keeps the draft for later.', '前回の草稿があります。復元後に内容を確認して保存してください。キャンセルすると草稿を保持します。'),
        content: createElement(ProjectDraftReview, { locale, saved: saved.value, draft: draft.value, onChoice: value => { choice = value; } }),
        confirmLabel: tr(locale, '应用恢复选择', 'Apply recovery choice', '復元の選択を適用'), confirm: async () => {
          const recovered = await api.recover(choice);
          if (!recovered.ok) {
            if (recovered.error.code !== 'RECOVERY_CONFLICT') throw new Error(recovered.error.message);
            const rows = await api.getRecoveryConflict(); if (!rows.ok) throw new Error(rows.error.message);
            const resolved = await reviewFileConflicts({ locale, conflicts: rows.value, chooseDirectory: () => this.services.chooseDirectory(), resolve: (decision, path) => api.resolveRecoveryConflict(decision, path), refresh: () => api.getRecoveryConflict() });
            if (!resolved) throw new Error(tr(locale, '草稿继续保留，请完成冲突处理或取消。', 'The draft is kept. Resolve the conflict or cancel.', '草稿を保持しています。競合を解決するかキャンセルしてください。'));
          }
          this.recoveryPending = false; await this.controller.refresh(); await this.projectChanged();
        } });
      if (result !== null) studioToasts.add({ title: tr(locale, '恢复选择已应用', 'Recovery choice applied', '復元の選択を適用しました') });
    } catch (reason) { this.messageTone = 'error'; this.message = String(reason); }
    finally { this.recoveryReviewOpen = false; this.render(); }
  }
  private async switchProject(directory: string): Promise<boolean> {
    const projects = this.services.bridge.projects;
    const recovery = { label: tr(this.controller.preferences.locale, '重新选择作品目录', 'Choose project folder again', '作品フォルダーを選び直す'), run: () => { void this.services.chooseDirectory().then(chosen => { if (this.notice(chosen) && chosen.value) void this.switchProject(chosen.value); }); } };
    const inspected = await projects.inspect(directory); if (!this.notice(inspected, recovery)) return false;
    const choice = await this.choiceForClose('switchProject'); if (choice === 'cancel') return false;
    await this.flushInputDrafts();
    const opened = await projects.switch({ directory, choice }); if (!this.notice(opened, recovery)) return false;
    if (opened.value.sessionId === this.sessionId) return true;
    return this.openedProject(opened.value.sessionId);
  }
  private async flushWriting(): Promise<boolean> {
    this.writingPending = this.writingPending.then(async () => {
      if (this.composingSceneInputs.size) return false;
      for (const [id, text] of this.writingDrafts) {
        const scene = this.controller.scene, project = this.controller.source?.project;
        if (!scene || !project) return false;
        const expected = this.writingDraftOrigin ?? scene;
        const target: StatementEditTarget = { projectId: project.projectId, sceneId: scene.sceneId, documentId: expected.documentId, revision: expected.revision, statementIds: [id] };
        const previous = this.controller.parsed('writing')?.parsed.cst.find(node => node.id === id)?.object?.value as Record<string, unknown> | undefined;
        const content = DialogueContentSchema.safeParse(previous?.text).data ?? '';
        const result = await this.controller.editDialogue({ op: 'dialogue.update', sceneId: scene.sceneId, statementId: id,
          text: replaceDialogueText(content, text) }, target);
        if (!this.notice(result)) { this.updateStatus(); return false; }
        if (this.writingDrafts.get(id) === text) this.writingDrafts.delete(id);
        const revision = result.value.documents.find(item => item.ref.id === scene.documentId)?.revision;
        if (revision !== undefined) this.writingDraftOrigin = { documentId: scene.documentId, revision };
      }
      if (this.writingDrafts.size) return false;
      this.writingDraftOrigin = null;
      return true;
    });
    return this.writingPending;
  }
  private async flushScript(): Promise<boolean> {
    if (this.composingSceneInputs.size) return false;
    if (!await this.flushWriting()) return false;
    if (this.scriptEditor) return this.scriptEditor.flush();
    const scene = this.controller.scene;
    return scene ? this.flushSceneScriptDraft(scene.sceneId) : true;
  }
  private async flushSceneScriptDraft(sceneId: Id): Promise<boolean> {
    const text = this.scriptDrafts.get(sceneId);
    if (text === undefined) return true;
    const cached = this.scriptSessions.get(sceneId);
    if (cached) return cached.editor.flush();
    const result = await this.controller.editScript(text, sceneId, this.scriptDraftOrigins.get(sceneId));
    if (!this.notice(result)) return false;
    this.scriptDrafts.delete(sceneId); this.scriptDraftOrigins.delete(sceneId); return true;
  }
  private async save(all: boolean, documentId: Id | null = null, objectId?: Id): Promise<void> {
    const inspectorScene = !all && !documentId ? this.fixedInspectorEditScene() : null;
    const asset = all || inspectorScene ? null : documentId ? (objectId ? { documentId, objectId, pendingInput: false } : null) : this.assetEditTarget();
    const active = this.documents.find(document => document.id === this.activeDocument);
    const activeScene = this.followedScene();
    const locale = this.controller.preferences.locale;
    if (inspectorScene) {
      documentId = inspectorScene.documentId;
      if (!await (this.controller.scene?.documentId === documentId ? this.flushScript() : this.flushSceneScriptDraft(inspectorScene.sceneId))) return;
    } else if (asset && !asset.pendingInput) documentId = asset.documentId;
    else {
      await this.playerNameEditor?.waitForApply();
      if(this.publishUnapplied){await this.navigate('publish');this.revealInspector();this.messageTone='info';this.message=tr(this.controller.preferences.locale,'发行配置尚未应用。先点击“应用发行配置”，再保存全部。','Release settings are unapplied. Choose Apply release settings, then Save all.','配布設定が未適用です。「配布設定を適用」を選択してからすべて保存してください。');this.render();return;}
      const pending = this.unappliedInput();
      if (pending) { this.messageTone = 'error'; this.message = `${pending}仍有未应用输入。请返回该文档应用有效内容后保存。`; for(const form of this.formDocuments.values()){if(form.dirty()){const status=form.node.querySelector<HTMLElement>(':scope > [role="status"]');if(status)status.textContent=this.message;}} this.render(); return; }
      if (!await this.flushScript()) return;
    }
    if (!all && !asset && !documentId) {
      documentId = active ? (await this.discardScope(active))?.documentId ?? null : activeScene?.documentId ?? null;
    }
    if (asset && !asset.documentId) {
      this.messageTone = 'warning'; this.message = tr(locale, '素材索引不可用，当前素材尚未保存。', 'The asset index is unavailable. The current asset is still unsaved.', '素材インデックスを利用できません。現在の素材は未保存です。');
      this.render(); return;
    }
    if (!all && !documentId) return;
    const scope: SaveReviewScope = asset ? { kind: 'objects', objects: [{ kind: 'asset', documentId: asset.documentId!, objectId: asset.objectId }] }
      : all ? { kind: 'all' } : { kind: 'current', documentId: documentId! };
    const sourceView = asset ? `asset:${asset.objectId}` : inspectorScene ? `scene:${inspectorScene.sceneId}` : this.activeDocument;
    const savingProject = this.controller.source?.project.projectId;
    const listed = await this.services.bridge.documents.list();
    if (!this.notice(listed)) return;
    const plan = await this.services.bridge.documents.planSave(revisionedSaveReviewScope(scope, listed.value));
    if (!this.notice(plan)) return;
    const name = (id: Id) => {
      const scene = this.controller.source?.scenes.find(item => item.documentId === id);
      if (scene) return scene.name;
      if (this.controller.source?.projectDocumentId === id) return this.controller.source.project.name;
      const paths = Object.keys(listed.value.find(item => item.documentId === id)?.files ?? {});
      if (paths.includes('authoring/outline.json')) return tr(this.controller.preferences.locale,'作品大纲','Project outline','作品のあらすじ');
      if (paths.includes('assets/index.json')) return tr(this.controller.preferences.locale,'素材库','Asset library','素材ライブラリ');
      if (paths.includes('dependencies.lock.json')) return tr(this.controller.preferences.locale,'引擎与插件配置','Engine and plugin configuration','エンジンとプラグインの設定');
      return readableDocument(listed.value.find(item => item.documentId === id)?.files ?? {}, this.controller.preferences.locale);
    };
    if (!plan.value.files.length) {
      await this.controller.refresh({ documents: listed.value }); await this.designer?.refresh(); this.render();
      studioToasts.add({ title: asset ? tr(locale, '当前素材没有待保存的修改', 'No changes to save for this asset', '現在の素材に保存する変更はありません')
        : tr(locale, all ? '当前没有待保存的修改' : '当前文档没有待保存的修改', all ? 'No changes to save' : 'No changes to save in this document', all ? '保存する変更はありません' : '現在の文書に保存する変更はありません') }); return;
    }
    const names = Object.fromEntries(listed.value.map(document => [document.documentId, name(document.documentId)]));
    const commit = async (savePlan: SavePlan) => {
      const result = await this.controller.savePlanned(savePlan);
      if (this.controller.source?.project.projectId === savingProject) {
        if (result.ok) {
          this.output.saved = { receipt: result.value, source: sourceView };
          if (this.outputFailure?.kind === 'save') this.outputFailure = undefined;
        } else {
          this.outputFailure = { kind: 'save', id: savePlan.planId, issue: result.error, cancelled: false };
        }
        this.renderOutput();
        this.rememberWorkbench();
      }
      if (!result.ok && result.error.code === 'EXTERNAL_CONFLICT') {
        const api = this.services.bridge.documents, rows = await api.getConflict(savePlan.planId); if (!rows.ok) throw new Error(rows.error.message);
        const resolved = await reviewFileConflicts({ locale, conflicts: rows.value, chooseDirectory: () => this.services.chooseDirectory(), resolve: (choice, path) => api.resolveConflict(savePlan.planId, choice, path), refresh: () => api.getConflict(savePlan.planId) });
        if (!resolved) throw new Error(tr(locale, '尚未保存，工作内容继续保留。', 'Not saved. Your working content is kept.', '未保存です。作業内容を保持しています。'));
        await this.controller.refresh();
        if (resolved === 'copy') { this.render(); studioToasts.add({ title: tr(locale, '副本已保存，原作品的工作内容仍未保存', 'Copy saved. Working changes in the original remain unsaved.', 'コピーを保存しました。元の作品の作業内容は未保存です。') }); return; }
        throw new Error(tr(locale, '文件基线已更新。请刷新修改范围并重新审阅后保存。', 'The file baseline changed. Refresh and review the changes before saving.', 'ファイルの基準が更新されました。変更範囲を更新し、再確認して保存してください。'));
      }
      if (!result.ok) throw new Error(tr(locale, `保存失败，工作内容已保留。排除文件占用或写入问题后可重试。${result.error.message}`, `Save failed. Working content is kept. Resolve the file or write error and retry. ${result.error.message}`, `保存に失敗しました。作業内容を保持しています。ファイルの問題を解消して再試行してください。${result.error.message}`));
      await this.designer?.refresh();
      this.render(); studioToasts.add({ title: result.value.remainingDirty.length ? tr(locale, '所选对象已保存，其他修改继续保留', 'Selected objects saved. Other changes remain in your workspace.', '選択した対象を保存し、その他の変更は保持しています。') : tr(locale, '修改已保存', 'Changes saved', '変更を保存しました') });
    };
    const changed = async (receipt: EditReceipt, owner: Id) => {
      await this.controller.acceptExternalEdit(receipt, owner); this.assetCache.clear();
      await this.showAssets();
    };
    await requestSaveReview({ initialPlan: plan.value, initialDocuments: listed.value, scope, locale, names, bridge: this.services.bridge.documents, save: commit, changed,
      pin: (initialPlan, initialDocuments, initialObjects) => { const id = `save-review:${plan.value.planId}`; this.documentWorkspace.open(id, tr(locale, '保存审阅', 'Save review', '保存レビュー'), done => {
        const node = el('section'), react = createRoot(node); node.style.height = '100%';
        react.render(createElement(SaveReview, { initialPlan, initialDocuments, initialObjects, scope, locale, names, bridge: this.services.bridge.documents, save: commit, changed, close: done }));
        return {node,dirty:()=>false,dispose:()=>react.unmount()};
      }); },
    });
  }
  private unappliedInput(includeProjectDraft = true, includePublish = true): string | null { if(includePublish&&this.publishUnapplied)return tr(this.controller.preferences.locale,"作品发行配置","Work release configuration","作品の配布設定"); if(this.resourceProcessorUnapplied)return tr(this.controller.preferences.locale,"资源处理参数","Resource processing input","素材処理の入力"); if(includeProjectDraft && this.projectCreateUnapplied)return tr(this.controller.preferences.locale,"新建作品","New project","新規作品"); if(this.productionUnapplied) return tr(this.controller.preferences.locale,'制作文档','Production document','制作文書'); for (const insertion of this.insertions.values()) if(insertion.dirty()) return tr(this.controller.preferences.locale,'待插入内容','Pending insertion','挿入待ちの内容'); for (const [id,form] of this.formDocuments) if(form.dirty())return this.documents.find(item=>item.id===id)?.title??'未应用文档'; return this.languageEditor.current?.dirty ? tr(this.controller.preferences.locale,'作品语言','Project languages','作品の言語') : this.playerNameEditor?.dirty ? '主角姓名' : this.startupDraft ? '启动与主页' : this.characterDraft ? '角色与路线' : this.designer?.hasAnimationDraft() ? tr(this.controller.preferences.locale,'界面动画','Interface animation','UIアニメーション') : Object.keys(this.designer?.capture().styleDrafts ?? {}).length ? 'CSS / SCSS' : null; }
  private async inspectSelected(show = false): Promise<boolean> {
    if (!this.services.describeAssets || !this.selectedAssets.size || !this.assetPage) return false;
    const result = await this.services.describeAssets({ assetIds: [...this.selectedAssets], indexRevision: this.selectedAtIndexRevision ?? this.assetPage.indexRevision,
      currentAssetId: null, currentVariantId: null });
    if (!this.notice(result)) return false;
    this.selectedDetails = result.value.items; this.missingSelected = result.value.missingAssetIds;
    if (show || this.missingSelected.length) mountSelectedAssetsSheet({ items: this.selectedDetails,
      missing: this.missingSelected.map(id => ({ id, name: this.assetCache.get(id)?.name })),
      visibleIds: this.assetPage.items.map(item => item.id), locale: this.controller.preferences.locale,
      removeMissing: ids => { ids.forEach(id => this.selectedAssets.delete(id)); this.missingSelected = [];
        this.selectedAtIndexRevision = this.assetPage?.indexRevision ?? null;
        if (!this.selectedAssets.size) { this.selectedAtIndexRevision = null; this.queryAtSelection = null; }
        this.refreshAssetSelection(); },
      closed: changed => { if (!changed) return; this.render(); requestAnimationFrame(() => {
        this.root.querySelector<HTMLElement>(this.selectedAssets.size ? '.asset-inspect-selected' : '.asset-selection-bar button')?.focus({ preventScroll: true }); }); },
    });
    return this.missingSelected.length === 0;
  }
  private assetSelectionBar(): HTMLElement {
    const locale=this.controller.preferences.locale;
    const visibleSelected = this.assetPage?.items.filter(asset => this.selectedAssets.has(asset.id)).length ?? 0;
    const selected = el('div', 'authoring-toolbar asset-selection-bar'); const summary = el('span', '', tr(locale,
      `已选 ${this.selectedAssets.size} 项 · 本页 ${visibleSelected} · 其他页或筛选外 ${this.selectedAssets.size - visibleSelected}`,
      `${this.selectedAssets.size} selected · ${visibleSelected} on page · ${this.selectedAssets.size - visibleSelected} elsewhere`,
      `${this.selectedAssets.size} 件選択 · このページ ${visibleSelected} · その他 ${this.selectedAssets.size - visibleSelected}`)); summary.hidden = !this.selectedAssets.size; selected.append(summary);
    selected.hidden = !this.selectedAssets.size && !this.assetPage?.total;
    selected.append(button(this.t('selectPage'), () => { this.assetPage?.items.forEach(asset => this.selectedAssets.add(asset.id));
      this.selectedAtIndexRevision = this.assetPage?.indexRevision ?? null; this.queryAtSelection = { ...this.assetQuery }; this.render(); }));
    selected.append(button(this.t('selectAll'), async () => { const { offset, limit, ...query } = this.assetQuery, projectId = this.controller.source?.project.projectId;
      const ids = await this.services.allAssetIds?.(query);
      if (projectId === this.controller.source?.project.projectId && ids && this.notice(ids)) {
      ids.value.ids.forEach(id => this.selectedAssets.add(id)); this.selectedAtIndexRevision = ids.value.indexRevision;
      this.queryAtSelection = { ...query, offset, limit }; this.render(); } }));
    selected.append(button(tr(locale, '查看所选', 'Inspect selected', '選択項目を確認'), async () => { await this.inspectSelected(true); }, 'asset-inspect-selected'));
    if (this.selectedAtIndexRevision !== null && this.assetPage && this.selectedAtIndexRevision !== this.assetPage.indexRevision)
      selected.append(button(tr(locale, '重新核对所选', 'Recheck selected', '選択項目を再確認'), async () => { this.selectedAtIndexRevision = this.assetPage!.indexRevision; await this.inspectSelected(true); }));
    selected.append(button(tr(locale, '批量命名', 'Batch rename', '一括名前変更'), () => this.renameSelected()));
    selected.append(button(tr(locale, '移除所选', 'Remove selected', '選択項目を削除'), () => this.removeSelected()));
    selected.append(button(this.t('clear'), () => { this.selectedAssets.clear(); this.selectedDetails = null; this.missingSelected = [];
      this.queryAtSelection = null; this.selectedAtIndexRevision = null; this.render(); }));
    if (!this.selectedAssets.size) for (const control of [...selected.querySelectorAll('button')].slice(2)) control.hidden = true;
    for (const control of [...selected.querySelectorAll('button')].slice(0, 2)) control.disabled = !this.assetPage?.total;
    const missing = this.missingSelected.filter(id => this.selectedAssets.has(id)).length;
    if (missing) {
      const status = el('span', 'field-help', tr(locale, `已勾选素材中 ${missing} 项缺失，请重新核对所选。`, `${missing} checked assets are missing. Recheck the selection.`, `チェックした素材のうち ${missing} 件が見つかりません。選択を再確認してください。`));
      status.setAttribute('role', 'status'); selected.append(status);
    }
    return selected;
  }
  private refreshAssetSelection(): void {
    for (const row of this.root.querySelectorAll<HTMLElement>('.authoring-asset')) {
      const id = row.dataset.pluginAssetId!;
      const primary = id === this.focusedAssetId;
      row.classList.toggle('inspected', primary);
      if (primary) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
      row.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked = this.selectedAssets.has(id);
    }
    this.root.querySelector('.asset-selection-bar')?.replaceWith(this.assetSelectionBar());
    const summary = this.assetInspectorView?.summary;
    const inspected = this.assetInspectorView?.asset;
    if (summary && inspected) {
      summary.textContent = this.assetSelectionSummary(inspected);
      summary.hidden = this.selectedAssets.size < 2;
    }
    this.renderAssetProcessors();
    this.rememberWorkbench();
  }
  private async focusAsset(id: Id): Promise<void> {
    const generation = ++this.assetFocusGeneration;
    const projectId = this.controller.source?.project.projectId;
    if (!projectId) return;
    if (!this.assetCache.has(id)) {
      const result = await this.services.getAsset?.(id);
      if (generation !== this.assetFocusGeneration || projectId !== this.controller.source?.project.projectId) return;
      if (result && this.notice(result) && result.value) this.assetCache.set(id, result.value);
    }
    this.focusedAssetId = id;
    this.render();
  }
  private selectAssetVariant(id: Id, variantId: Id | null): void {
    if (this.assetInspectorPin?.assetId === id) {
      const exact = variantId ?? this.assetCache.get(id)?.activeVariantId;
      if (exact) this.assetInspectorPin = { assetId: id, variantId: exact };
    } else if (this.focusedAssetId === id) {
      if (variantId) this.assetVariants.set(id, variantId); else this.assetVariants.delete(id);
    }
    this.render();
  }
  private disposeAssetPreview(id?: Id): void {
    if (id) { this.assetPreviews.get(id)?.view.dispose(); this.assetPreviews.delete(id); return; }
    for (const preview of this.assetPreviews.values()) preview.view.dispose();
    this.assetPreviews.clear();
  }
  private renderAssetDocument(document: AuthorDocument): HTMLElement {
    const id = document.objectId!;
    const asset = this.assetCache.get(id), locale = this.controller.preferences.locale;
    if (!asset) {
      this.disposeAssetPreview(id);
      const missing = el('section', 'gc-wb-empty asset-library-home');
      missing.append(el('h2', '', tr(locale, '素材无法读取', 'Asset unavailable', '素材を読み込めません')),
        el('p', '', `${document.title} · ${id}`),
        button(tr(locale, '重新读取素材', 'Retry asset', '素材を再読み込み'), () => this.showAssets()),
        button(tr(locale, '选择另一素材', 'Choose another asset', '別の素材を選択'), () => this.chooseInspectorAsset(true)));
      return missing;
    }
    const variantId = this.assetPreviewVersions.get(id) ?? asset.activeVariantId;
    this.assetPreviewVersions.set(id, variantId);
    const preview = this.assetPreviews.get(id);
    if (!preview || preview.revision !== asset.revision || preview.variantId !== variantId || preview.locale !== locale) {
      this.disposeAssetPreview(id);
      this.assetPreviews.set(id, { revision: asset.revision, variantId, locale, view: createAssetWorkbenchPreview(asset, variantId, {
        locale, services: this.services, onBindDifference: (asset, variantId) => this.bindAssetDifference(asset, variantId),
        onProduceDifference: (assetId, variantId) => void this.openFigureProduction({ assetId, variantId }),
        onFollowActive: () => { void this.previewAsset(asset.id, asset.activeVariantId); },
      }) });
    }
    return this.assetPreviews.get(id)!.view.node;
  }
  private syncAssetPreviews(): void {
    for (const { view } of this.assetPreviews.values()) {
      view.setActive(view.node.isConnected && !view.node.closest('[hidden]'));
    }
  }
  private restoreAssetLibraryScroll(): void {
    const library = this.root.querySelector<HTMLElement>(`[data-view="${authoringDockTools.assets}"]:not([hidden]) .authoring-assets`);
    if (library) library.scrollTop = this.assetLibraryScroll;
  }
  private revealInspector(): void {
    const tools = this.root.querySelector<HTMLDetailsElement>(`[data-view="${CSS.escape(this.activeDocument)}"] .gc-studio-document-tools`);
    if (tools) { tools.open = true; return; }
    if (this.shellProps?.inspectorAvailable !== false) this.dock.current?.open(authoringDockTools.inspector, { focus: false });
  }
  private assetInspector(): HTMLElement {
    const root = el('section', 'authoring-inspector asset-workbench-inspector'), locale = this.controller.preferences.locale;
    const pin = this.assetInspectorPin, id = pin?.assetId ?? this.focusedAssetId;
    const asset = id ? this.assetCache.get(id) : null, variantId = pin?.variantId ?? (id ? this.assetVariants.get(id) : null) ?? null;
    const choose = button(tr(locale, '选择素材', 'Choose asset', '素材を選択'), () => this.chooseInspectorAsset());
    choose.dataset.dockFocus = '';
    const sourceControls = el('div', 'asset-inspector-source');
    sourceControls.append(el('span', 'field-help', pin ? tr(locale, '来源 · 固定素材版本', 'Source · Pinned asset version', '参照元 · 固定素材バージョン')
      : tr(locale, '来源 · 素材库主选中', 'Source · Library selection', '参照元 · 素材ライブラリの主選択')), choose);
    if (pin) sourceControls.append(button(tr(locale, '恢复跟随', 'Resume following', '追従を再開'), () => { this.assetInspectorPin = null; this.render(); }));
    else if (asset) sourceControls.append(button(tr(locale, '固定此版本', 'Pin this version', 'このバージョンを固定'), () => {
      this.assetInspectorPin = { assetId: asset.id, variantId: variantId ?? asset.activeVariantId }; this.render();
    }));
    if (!asset) {
      if (this.assetInspectorView) { disposeAssetInspector(this.assetInspectorView.node); this.assetInspectorView = null; }
      root.append(sourceControls);
      if (id) {
        const missing = el('p', 'field-error', tr(locale, `素材 ${id} 无法读取。`, `Asset ${id} is unavailable.`, `素材 ${id} を読み込めません。`));
        missing.setAttribute('role', 'status'); root.append(missing, button(tr(locale, '重新读取素材', 'Retry asset', '素材を再読み込み'), () => this.showAssets()));
        return root;
      }
      root.append(el('h2', '', tr(locale, '素材库概要', 'Asset library', '素材ライブラリ')), el('p', '', tr(locale, `当前筛选共 ${this.assetPage?.total ?? 0} 项素材，已选 ${this.selectedAssets.size} 项。`, `${this.assetPage?.total ?? 0} matching assets; ${this.selectedAssets.size} selected.`, `${this.assetPage?.total ?? 0} 件の素材、${this.selectedAssets.size} 件選択。`)),
        el('p', '', this.assetPage?.total ? tr(locale, '单击素材查看属性，F2 改名，双击缩略图预览。勾选素材后可跨页批量操作。', 'Select to inspect, F2 to rename, double-click a thumbnail to preview. Check assets for batch actions across pages.', 'クリックで属性、ダブルクリックで素材を開きます。チェックで複数ページを一括操作できます。') : tr(locale, '当前没有可显示的素材。调整筛选或导入文件后，可在这里查看属性。筛选外的所选素材会继续保留。', 'No assets are visible. Adjust filters or import files to inspect their properties. Selected assets outside the filters are retained.', '表示できる素材がありません。絞り込みの変更や読み込み後に属性を確認できます。非表示の選択素材は保持されます。')));
      if (this.selectedAssets.size) root.append(button(tr(locale, '查看所选', 'Inspect selected', '選択項目を確認'), () => this.inspectSelected(true).then(() => {})));
      return root;
    }
    const cached=this.assetInspectorView;
    const selectionText = this.assetSelectionSummary(asset);
    const outsidePage = !pin && this.assetPage && !this.assetPage.items.some(item => item.id === asset.id);
    const referenceRevision = JSON.stringify(this.controller.source?.documentVersions ?? []);
    if(cached?.asset===asset&&cached.variantId===variantId&&cached.pinned===!!pin&&cached.referenceRevision===referenceRevision&&cached.locale===locale){cached.summary.textContent=selectionText;cached.summary.hidden=this.selectedAssets.size<2;cached.visibility.hidden=!outsidePage;return cached.node;}
    if (cached) disposeAssetInspector(cached.node);
    const referencesOpen = cached?.asset.id === asset.id && cached.node.querySelector<HTMLDetailsElement>('.asset-inspector-references')?.open;
    const inspector = createAssetInspector(asset, { locale, services: this.services, viewedVariantId: variantId,
      selectVariant: id => this.selectAssetVariant(asset.id, id),
      canLocate: source => this.canLocateAssetReference(source),
      locate: source => { void this.locateAssetReference(source, asset.id, variantId ?? asset.activeVariantId); },
      referencesReady: () => this.focusReturnedAssetReference(true),
      bindDifference: (asset, variantId) => this.bindAssetDifference(asset, variantId),
      activateVariant: this.services.bridge.assets?.prepareVariantSwitch ? id => { void this.activateAssetVariant(asset, id); } : undefined,
      changed: async () => {
      await this.controller.acceptExternalEdit(null, this.controller.source?.assetIndexDocumentId ?? null);
      if (this.assetInspectorView?.node === inspector) this.assetInspectorView = null;
      disposeAssetInspector(inspector); await this.showAssets();
    }, rename: name => this.renameAsset(asset.id, name), preview: variantId => { void this.previewAsset(asset.id, variantId); }, reveal: () => { void this.services.revealEntity({ kind: 'asset', id: asset.id }).then(result => this.notice(result)); }, transparent: () => { void this.removeAssetBackground(asset); } });
    const character = this.controller.source?.characters.find(item => item.id === asset.characterId), scenes = this.controller.source?.scenes.filter(item => asset.sceneIds.includes(item.sceneId)) ?? [];
    inspector.append(el('p', '', [character?.name, ...scenes.map(scene => scene.name)].filter(Boolean).join(' · ')));
    if (referencesOpen) inspector.querySelector<HTMLDetailsElement>('.asset-inspector-references')?.setAttribute('open', '');
    if (asset.kind === 'animation') inspector.append(button(tr(locale,'编辑动画素材','Edit animation asset','アニメーション素材を編集'), ()=>this.openAnimationAsset(asset)));
    const summary=el('p','',selectionText); summary.hidden=this.selectedAssets.size<2;
    const visibility = el('p', 'field-help', tr(locale, '主选素材在当前页或筛选范围之外。', 'The primary asset is outside the current page or filters.', '主選択の素材は現在のページまたは絞り込み条件の範囲外です。'));
    visibility.hidden = !outsidePage; inspector.prepend(sourceControls, summary, visibility);
    this.assetInspectorView={asset,variantId,pinned:!!pin,referenceRevision,locale,node:inspector,summary,visibility};
    return inspector;
  }
  private async chooseInspectorAsset(preview = false): Promise<void> {
    const projectId = this.controller.source?.project.projectId, locale = this.controller.preferences.locale;
    if (!projectId) return;
    const pin = this.assetInspectorPin;
    const catalog = await this.services.assetTypeCatalog?.();
    if (this.controller.source?.project.projectId !== projectId) return;
    const kinds = uniqueAssetTypes(catalog?.ok ? catalog.value : this.assetTypes).map(item => item.descriptor.key);
    await openAssetPicker({ services: this.services, projectId, locale, allowedKinds: kinds.length ? kinds : [...new Set([...this.assetCache.values()].map(asset => asset.kind))],
      currentAssetId: pin?.assetId ?? this.focusedAssetId, currentVariantId: pin?.variantId ?? (this.focusedAssetId ? this.assetVariants.get(this.focusedAssetId) : null),
      mode: 'compact', scope: this.root, remember: false,
      onApply: async choice => {
        if (this.controller.source?.project.projectId === projectId) {
          this.assetCache.set(choice.assetId, choice.asset);
          if (preview) await this.previewAsset(choice.assetId, choice.variantId ?? choice.asset.activeVariantId);
          else {
            if (pin) {
              this.assetInspectorPin = { assetId: choice.assetId, variantId: choice.variantId ?? choice.asset.activeVariantId };
              this.render();
            } else {
              if (choice.variantId) this.assetVariants.set(choice.assetId, choice.variantId); else this.assetVariants.delete(choice.assetId);
              await this.focusAsset(choice.assetId);
            }
          }
        }
        return { ok: true, value: undefined, warnings: [] };
      },
    });
  }
  private assetSelectionSummary(asset: Asset): string {
    const count = this.selectedAssets.size;
    return tr(this.controller.preferences.locale, `已选 ${count} 项 · 当前对象：${asset.name}`,
      `${count} selected · Current: ${asset.name}`, `${count} 件選択 · 現在：${asset.name}`);
  }
  private async openAnimationAsset(asset:Asset):Promise<void>{
    const locale=this.controller.preferences.locale;
      const resource = await this.services.runtimeAssets?.resolveRuntime(asset.id, asset.activeVariantId); if (!resource?.ok) { if (resource) this.notice(resource); return; }
      let animation: unknown; try { animation = await (await fetch(resource.value.uri)).json(); } finally { await this.services.runtimeAssets?.releaseRuntime(resource.value.leaseId); }
      const id = `animation-asset:${asset.id}`; if (this.formDocuments.has(id)) { await this.openDocument(this.documents.find(document => document.id === id)!); return; }
      const container = el('section', 'animation-workspace'), editor = el('div'), root = createRoot(editor); container.append(editor); let dirty = false, revision = asset.revision, disposed = false, checking = false, variantId = asset.activeVariantId, indexRevision = this.controller.source?.assetIndexRevision;
      const save = async (name: string, next: import('@galcraft/contracts').NativeAnimation) => { const result = await this.services.saveAnimation?.({ name, animation: next, assetId: asset.id, expectedRevision: revision }); if (!result) throw new Error('动画保存服务不可用'); if (!result.ok) throw new Error(result.error.message); dirty = false; await this.controller.acceptExternalEdit(null, this.controller.source?.assetIndexDocumentId ?? null); const current = await this.services.getAsset?.(asset.id); if (current?.ok && current.value) { revision = current.value.revision; variantId = current.value.activeVariantId; this.assetCache.set(asset.id, current.value); } else revision++; indexRevision = this.controller.source?.assetIndexRevision; this.updateStatus(); return tr(locale,'动画新版本已进入作品。','New animation variant is in the project.','新しいバージョンを適用しました。'); };
      const checkedAnimation = NativeAnimationSchema.safeParse(animation); if (!checkedAnimation.success) { root.unmount(); this.messageTone = 'error'; this.message = checkedAnimation.error.message; this.updateStatus(); return; }
      let value = checkedAnimation.data;
      const draw = (active = true) => { if (active && !dirty && !checking && indexRevision !== this.controller.source?.assetIndexRevision) void reload(); root.render(createElement(AnimationWorkbench, { guiDraft:this.professionalInputs.get(id) as unknown as import('./professional/AnimationWorkbench.js').AnimationGuiDraft,onGuiDraftChange:state=>{this.professionalInputs.set(id,asJson(state));this.persistInputDraft();},animation: value, locale: this.controller.preferences.locale, targetLabel: asset.name, defaultName: asset.name, active,
        statusLabel: tr(locale,'确认后生成素材新版本，保存作品后落盘','Apply creates a new variant; save the project to disk','確定で新バージョンを作成、作品を保存してディスクへ'),
        choosePreviewTarget: () => chooseAnimationPreviewTarget(this.services, locale),
        onGenerate: request => this.createAnimationWithAi(request.mode === 'new' ? request : { ...request, assetId: asset.id, assetRevision: revision }),
        onDraftChange: next => { dirty = next; this.documents = this.documents.map(document => document.id === id ? { ...document, dirty: next || this.controller.source?.anyDirty } : document); this.refreshDocumentTabs(); }, onChange: async next => { await save(asset.name, next); value = next; }, onSave: save })); };
      const reload = async () => { checking = true; try { const current = await this.services.getAsset?.(asset.id); if (!current?.ok || !current.value || disposed) return; revision = current.value.revision; indexRevision = this.controller.source?.assetIndexRevision; if (variantId === current.value.activeVariantId) return; const lease = await this.services.runtimeAssets?.resolveRuntime(asset.id, current.value.activeVariantId); if (!lease?.ok) return; try { const next = NativeAnimationSchema.parse(await (await fetch(lease.value.uri)).json()); if (!disposed) { value = next; variantId = current.value.activeVariantId; this.assetCache.set(asset.id, current.value); draw(); } } finally { await this.services.runtimeAssets?.releaseRuntime(lease.value.leaseId); } } catch (reason) { if (!disposed) { this.message = String(reason); this.updateStatus(); } } finally { checking = false; } };
      draw(); this.openFormDocument(id, asset.name, container, () => dirty, () => { disposed = true; root.unmount(); }, draw);
      const form = this.formDocuments.get(id)!;
      form.capture = () => asJson({ kind: 'animationAsset', assetId: asset.id, gui: this.professionalInputs.get(id) });
      if (this.controller.source?.assetIndexDocumentId) {
        form.scope = { documentId: this.controller.source.assetIndexDocumentId, objectId: asset.id };
        this.refreshCommandTarget();
      }
  }
  private async renameAsset(id: Id, name: string): Promise<void> {
    if (!this.services.renameAssets) throw new Error('素材改名服务不可用');
    const result = await this.services.renameAssets([{ id, name }]); if (!result.ok) throw new Error(result.error.message);
    this.selectedDetails = null; this.assetCache.delete(id); await this.controller.acceptExternalEdit(result.value); await this.loadQuickAssets();
    const found = await this.services.getAsset?.(id); if (found?.ok && found.value) { this.assetCache.set(id, found.value); if(this.characterAsset?.id===id)this.characterAsset=found.value; }
    await this.showAssets();
  }
  private async activateAssetVariant(asset: Asset, variantId: Id): Promise<void> {
    const bridge = this.services.bridge.assets, locale = this.controller.preferences.locale;
    if (!bridge?.prepareVariantSwitch || !bridge.applyVariantSwitch) return;
    const prepared = await bridge.prepareVariantSwitch({ assetId: asset.id, variantId, expectedRevision: asset.revision });
    if (!this.notice(prepared)) return;
    const { planId, expected, affectedReferences } = prepared.value;
    await requestDialog({
      title: tr(locale, '切换活动版本', 'Switch active version', 'アクティブバージョンの切り替え'),
      description: tr(locale,
        `${asset.name} 的 ${affectedReferences.length} 处跟随引用将切换到所选版本。固定引用保留各自版本。`,
        `${affectedReferences.length} references to ${asset.name} will follow the selected version. Fixed references retain their versions.`,
        `${asset.name} の追従参照 ${affectedReferences.length} 件を切り替えます。固定参照は現在のバージョンを保持します。`),
      locale, review: true,
      content: affectedReferences.length ? createElement('ul', null, affectedReferences.map((reference, index) =>
        createElement('li', { key: index }, reference.label ?? reference.usage))) : undefined,
      confirmLabel: tr(locale, '切换活动版本', 'Switch active version', 'アクティブバージョンを切り替え'),
      confirm: async () => {
        const result = await bridge.applyVariantSwitch!({ planId, expected });
        if (!result.ok) throw new Error(issueText(result.error, locale));
        await this.controller.acceptExternalEdit(result.value, this.controller.source?.assetIndexDocumentId);
        await this.showAssets();
      },
    });
  }
  private async editAssetName(id: Id): Promise<void> {
    if (this.assetInspectorPin && this.assetInspectorPin.assetId !== id) {
      const asset = this.assetCache.get(id);
      if (!asset) return;
      const name = await this.ask(tr(this.controller.preferences.locale, '重命名素材', 'Rename asset', '素材の名前を変更'), asset.name);
      if (typeof name === 'string' && name.trim() && name.trim() !== asset.name) await this.renameAsset(id, name.trim());
      return;
    }
    await this.focusAsset(id); this.dock.current?.open(authoringDockTools.assetInspector, { focus: false });
    requestAnimationFrame(() => this.assetInspectorView?.node.querySelector<HTMLInputElement>(`[data-asset-name="${CSS.escape(id)}"]`)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true })));
  }
  private selectAsset(id: Id, event?: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): void {
    const visible = this.assetPage?.items.map(asset => asset.id) ?? [];
    if (event?.shiftKey && this.assetRangeAnchor && visible.includes(this.assetRangeAnchor)) { const from = visible.indexOf(this.assetRangeAnchor), to = visible.indexOf(id); for(const key of visible.slice(Math.min(from,to),Math.max(from,to)+1))this.selectedAssets.add(key); }
    else if (event?.ctrlKey || event?.metaKey) { this.selectedAssets.has(id) ? this.selectedAssets.delete(id) : this.selectedAssets.add(id); this.assetRangeAnchor=id; }
    else { this.assetRangeAnchor = id; void this.focusAsset(id); return; }
    this.selectedDetails = null; this.selectedAtIndexRevision = this.assetPage?.indexRevision ?? null;
    this.queryAtSelection = { ...this.assetQuery }; this.refreshAssetSelection();
  }
  private assetMenuGroups(id: Id, scope: string[], hidden: number) {
    const asset = this.assetPage?.items.find(item => item.id === id) ?? this.assetCache.get(id);
    return [{ label: `当前对象：${asset?.name ?? id}`, actions: [
      { label: this.t('preview'), run: () => { void this.previewAsset(id); } }, { label: '重命名', run: () => { void this.editAssetName(id); } },
      { label: this.t('openDirectory'), run: () => { void this.services.revealEntity({kind:'asset',id}).then(result=>this.notice(result)); } },
    ] }, ...(scope.length ? [{ label: `所选 ${scope.length} 项${hidden ? ` · 隐藏 ${hidden} 项` : ''}`, actions: [
      { label: `批量命名所选 ${scope.length} 项`, run: () => { void this.renameSelected(); } },
      { label: `移除所选 ${scope.length} 项`, danger:true, run: () => { void this.removeSelected(); } },
    ] }] : [])];
  }

  private renderAssetDirectory(tools: HTMLElement): HTMLElement {
    this.assetDirectory.render({
      locale: this.controller.preferences.locale, catalog: this.assetTypes, query: this.assetQuery, tools,
      folders: this.controller.source?.assetFolders,
      onScopeChange: changes => this.changeAssetQuery(changes),
    });
    return this.assetDirectory.node;
  }
  private changeAssetQuery(changes: Partial<AssetQuery>): void {
    this.assetQuery = { ...this.assetQuery, offset: 0, ...changes };
    this.assetLibraryScroll = 0;
    this.rememberWorkbench();
    void this.showAssets();
  }
  private async openAssetWorkspace(): Promise<void> {
    if (!this.controller.source) return;
    if (!this.shellProps) this.render();
    const dock = this.dock.current;
    const { assetDirectory, assets, assetInspector } = authoringDockTools;
    const asset = this.focusedAsset;
    const variantId = asset && (this.assetVariants.get(asset.id) ?? asset.activeVariantId);
    if (asset && variantId && asset.variants.some(item => item.id === variantId)) {
      dock?.openCombination([assetDirectory, assets, assetInspector]);
      await this.previewAsset(asset.id, variantId);
    } else dock?.openCombination([assetDirectory, assets, assetInspector], { focusOrder: [assets, assetDirectory, assetInspector] });
  }
  private async previewAsset(id: Id, variantId?: Id, options: { focus?: boolean } = {}): Promise<void> {
    const generation = ++this.assetPreviewGeneration, projectId = this.controller.source?.project.projectId;
    const previousDocument = this.activeDocument;
    if (!projectId || !await this.flushScript() || !await this.flushProductionDraft()) return;
    const current = () => generation === this.assetPreviewGeneration && projectId === this.controller.source?.project.projectId && previousDocument === this.activeDocument;
    if (!current()) return;
    let asset = this.assetCache.get(id);
    if (!asset) {
      const result = await this.services.getAsset?.(id);
      if (!current()) return;
      if (result && this.notice(result)) asset = result.value ?? undefined;
    }
    this.rememberScene();
    if (asset) this.assetCache.set(id, asset);
    const exact = variantId ?? this.assetVariants.get(id) ?? asset?.activeVariantId;
    if (exact) this.assetPreviewVersions.set(id, exact);
    const documentId = 'asset:' + id, existing = this.documents.find(doc => doc.id === documentId);
    const document: AuthorDocument = { id: documentId, kind: 'asset', objectId: id, title: asset?.name ?? existing?.title ?? id };
    this.documents = openAuthorDocument(this.documents, document);
    this.activeDocument = document.id;
    this.page = 'assets';
    this.focusedWorkbenchTool = null;
    this.render();
    if (options.focus !== false) this.dock.current?.focusView(document.id);
  }
  private async renameSelected(resume?: {template:string}): Promise<void> {
    const { planBatchRename, applyBatchRename } = this.services;
    if (!planBatchRename || !applyBatchRename) return;
    const selected = [...this.selectedAssets];
    const epoch = this.assetProjectEpoch;
    const stillSelected = () => epoch === this.assetProjectEpoch && selected.length === this.selectedAssets.size
      && selected.every(id => this.selectedAssets.has(id));
    if (!await this.inspectSelected() || !stillSelected() || !this.selectedDetails) return;
    const id = `batch-rename:${selected.join(',')}`;
    const existing = this.documents.find(document => document.id === id);
    if (existing) { await this.openDocument(existing); return; }
    const items = this.selectedDetails;
    const assets = await Promise.all(items.map(item => this.services.getAsset?.(item.assetId)));
    if (!stillSelected()) return;
    const values=items.map((item,index)=>{const asset=assets[index]?.ok?assets[index].value:null,scene=asset?.sceneIds.map(id=>this.controller.source?.scenes.find(value=>value.sceneId===id)).find(Boolean),chapter=this.controller.source?.project.chapters.find(value=>value.id===scene?.chapterId);return{assetId:item.assetId,chapter:chapter?.name??'',character:item.character?.name??'',usage:item.kind};});
    const node=el('section'),scope=el('p','',`所选 ${selected.length} 项素材（包含筛选外及其他页的成员）。只修改名称主体，原后缀、素材标识、版本和文件路径保持。`),input=el('input');input.value=resume?.template??'';input.ariaLabel='批量名称模板';input.placeholder='例如：背景 {number}';
    const table=el('table','asset-rename-table'),error=el('p','field-error');error.setAttribute('role','alert');
    const initial=()=>{table.replaceChildren();const header=el('tr');header.append(el('th','','修改前'),el('th','','修改后'),el('th','','当前版本'));table.append(header);for(const item of items){const row=el('tr');row.append(el('td','',item.name),el('td','','—'),el('td','','—'));table.append(row);}};initial();
    let plan: Awaited<ReturnType<NonNullable<AuthoringServices['planBatchRename']>>>|null=null,busy=false;
    const selectionChanged = () => {
      if (stillSelected()) return false;
      plan = null;
      apply.disabled = true;
      initial();
      error.textContent = '勾选范围已变化，请从当前所选素材重新打开批量命名。';
      return true;
    };
    const apply=button(`应用 ${selected.length} 项改名`,async()=>{
      if (busy || selectionChanged() || !plan?.ok || plan.value.conflicts.length) return;
      busy=true;apply.disabled=true;error.textContent='';
      try{
        const result=await applyBatchRename(plan.value.planId);
        if (epoch !== this.assetProjectEpoch) return;
        if(!result.ok){
          if(result.error.code==='PLAN_STALE'){plan=null;initial();await this.showAssets();}
          error.textContent=result.error.message;return;
        }
        this.selectedDetails=null;this.assetCache.clear();await this.controller.acceptExternalEdit(result.value,this.controller.source?.assetIndexDocumentId??null);
        await this.loadQuickAssets();this.finishFormDocument(id);await this.showAssets();
      }catch(reason){error.textContent=String(reason);}finally{busy=false;apply.disabled=!plan?.ok||plan.value.conflicts.length>0;}
    },'authoring-primary');apply.disabled=true;
    const preview = button('预览命名', async () => {
      if (busy || selectionChanged()) return;
      const template = input.value.trim();
      if (!template) { error.textContent = '请输入名称模板'; return; }
      busy = true;
      preview.disabled = true;
      apply.disabled = true;
      plan = null;
      error.textContent = '';
      try {
        const next = await planBatchRename({ assetIds: selected, template, values });
        if (selectionChanged() || template !== input.value.trim()) return;
        plan = next;
        if (!next.ok) { error.textContent = next.error.message; return; }
        initial();
        next.value.names.forEach((item, index) => {
          const row = table.rows[index + 1];
          if (!row) return;
          row.cells[0]!.textContent = item.before;
          row.cells[1]!.textContent = item.after;
          row.cells[2]!.textContent = item.variantId ?? '—';
        });
        error.textContent = next.value.conflicts.map(item => `名称冲突：${item.name}（${item.assetIds.length} 项）`).join('；');
        apply.disabled = next.value.conflicts.length > 0;
      } catch (reason) { error.textContent = String(reason); }
      finally { busy = false; preview.disabled = false; }
    });
    const controls=el('div','asset-rename-controls');controls.append(input,preview);
    input.oninput=()=>{plan=null;apply.disabled=true;};node.append(scope,controls,table,error,apply);this.openFormDocument(id,`批量命名 · ${selected.length} 项素材`,node,()=>Boolean(input.value));this.formDocuments.get(id)!.capture=()=>asJson({kind:'batchRename',ids:selected,template:input.value});
  }
  private async removeSelected(): Promise<void> {
    const projectId = this.controller.source?.project.projectId;
    const indexRevision = this.selectedAtIndexRevision ?? this.assetPage?.indexRevision;
    if (!projectId || indexRevision === undefined) return;
    if (!await this.inspectSelected() || !this.services.removeAssets || !this.selectedDetails) return;
    const items = this.selectedDetails;
    const ids = items.map(item => item.assetId), locale = this.controller.preferences.locale;
    const stale = tr(locale, '所选素材或版本已变化。请关闭此确认并重新核对所选。', 'The selected assets or versions changed. Close this review and recheck the selection.', '選択した素材またはバージョンが変わりました。この確認を閉じ、選択を再確認してください。');
    const epoch = this.assetProjectEpoch;
    await requestDialog({ locale, review: true, destructive: true,
      title: tr(locale, `移除所选 ${items.length} 项素材`, `Remove ${items.length} checked assets`, `チェックした素材 ${items.length} 件を削除`),
      description: tr(locale, '确认以下全部勾选素材及其当前版本，包含筛选和分页隐藏的素材。此操作从素材索引移除它们，并保留原文件。', 'Review all checked assets and their current versions, including assets outside the page or filters. Removal updates the asset index and keeps the original files.', 'ページや絞り込みの範囲外も含め、チェックしたすべての素材と現在のバージョンを確認してください。素材インデックスから削除し、元のファイルは保持します。'),
      content: createElement('ul', null, items.map(item => createElement('li', { key: item.assetId }, `${item.name} · ${item.shownVariant?.id ?? tr(locale, '版本缺失', 'Version missing', 'バージョンなし')}`))),
      confirmLabel: tr(locale, '移除素材', 'Remove assets', '素材を削除'),
      confirm: async () => {
        if (epoch !== this.assetProjectEpoch || projectId !== this.controller.source?.project.projectId
          || ids.length !== this.selectedAssets.size || ids.some(id => !this.selectedAssets.has(id))) throw new Error(stale);
        const result = await this.services.removeAssets!(ids, { projectId, indexRevision });
        if (epoch !== this.assetProjectEpoch) return;
        if (!result.ok) {
          if (result.error.code !== 'PLAN_STALE') throw new Error(issueText(result.error, locale));
          await this.controller.refresh();
          if (epoch === this.assetProjectEpoch) await this.showAssets();
          throw new Error(stale);
        }
        for (const id of ids) { this.assetCache.delete(id); this.selectedAssets.delete(id); }
        this.selectedDetails = null;
        if (!this.selectedAssets.size) { this.selectedAtIndexRevision = null; this.queryAtSelection = null; }
        await this.controller.refresh();
        if (epoch === this.assetProjectEpoch) await this.showAssets();
      },
    });
  }
  private async removeAssetBackground(asset: Asset): Promise<void> {
    if (!this.services.removeBackground || asset.kind !== 'image') return;
    if (this.mattingBusy) return;
    if (this.mattingCandidate) { this.message = '请先采用或取消当前透明版本候选'; this.render(); return; }
    const epoch = this.assetProjectEpoch;
    const declared = await this.ask('透明化预期：removed / unchanged / unknown', 'unknown');
    if (declared === null || epoch !== this.assetProjectEpoch) return;
    if (!['removed', 'unchanged', 'unknown'].includes(declared)) { this.message = '请选择有效预期'; this.render(); return; }
    this.mattingBusy = true;
    let result: Awaited<ReturnType<NonNullable<AuthoringServices['removeBackground']>>>;
    try {
      result = await this.services.removeBackground({ assetId: asset.id, sourceVariantId: asset.activeVariantId,
        choice: { enabled: true, provider: 'node', connectionId: null, workflowBindingId: null },
        declared: declared as 'removed' | 'unchanged' | 'unknown' });
    } finally { if (epoch === this.assetProjectEpoch) this.mattingBusy = false; }
    if (epoch !== this.assetProjectEpoch) {
      if (result.ok && result.value.preparationId) void this.services.discardBackground?.(result.value.preparationId).catch(() => {});
      return;
    }
    if (!this.notice(result)) return;
    if (result.value.preparationId && result.value.previewUri) this.mattingCandidate = { assetId: asset.id,
      preparationId: result.value.preparationId, previewUri: result.value.previewUri,
      references: result.value.references ?? [], selectedSourceKeys: new Set() };
    else this.message = result.value.status === 'needsReview' ? '需要人工检查素材；未采用透明版本' : result.value.status;
    this.render();
    if (this.mattingCandidate) this.dock.current?.open(authoringDockTools.assets);
  }
  private async confirmBackground(scope: BackgroundAdoptionScope): Promise<void> {
    const candidate = this.mattingCandidate; if (!candidate || !this.services.confirmBackground) return;
    const result = await this.services.confirmBackground(candidate.preparationId, scope);
    if (this.mattingCandidate !== candidate || !this.notice(result)) return;
    this.mattingCandidate = null; await this.controller.refresh(); await this.showAssets();
  }
  private async locateHit(source: Source): Promise<void> {
    if (!await this.flushScript()) return;
    const previous = this.followedScene(), project = this.controller.source;
    const document = this.documents.find(item => item.id === this.activeDocument);
    const origin = document ? { document, ...(previous ? { scene: { revision: previous.revision, view: this.controller.view,
      selection: this.controller.selection, caret: this.controller.caret, scroll: this.controller.scroll } } : {}) } : null;
    const scene = project?.scenes.find(item => item.documentId === source.documentId);
    if (this.canLocateAssetReference(source) && (!scene || !source.statementId)) {
      if (!await this.openAssetReferenceTarget(source)) return;
    } else {
      const found = scene && await this.services.locate?.(source);
      if (found && !this.notice(found)) return;
      if (project?.project.projectId !== this.controller.source?.project.projectId) return;
      if (!scene || !found?.value) {
        const locale = this.controller.preferences.locale;
        this.messageTone = 'warning';
        this.message = tr(locale, '无法定位此查找结果。请重新查找以更新来源。', 'This result could not be located. Search again to refresh its source.', '検索結果の参照元を特定できません。再検索してください。');
        this.render(); return;
      }
      if (!await this.openSceneTarget(scene.sceneId)) return;
      if (found.value.statementId) this.controller.select([found.value.statementId]);
      if (this.controller.view === 'script') this.revealScriptOffset(found.value.statementId, found.value.start);
      else this.controller.setScroll(found.value.statementId, 0, 0);
    }
    this.searchOrigin ??= origin;
    this.sidebarState.located = !!this.searchOrigin;
    this.render();
  }
  private canLocateAssetReference(source: Source): boolean {
    const project = this.controller.source;
    if (!project) return false;
    if (project.scenes.some(scene => scene.documentId === source.documentId))
      return !!source.statementId || !!source.field?.match(/^\/data\/(decorLayers|presentation)(\/|$)/);
    return !!this.characterReferenceSection(source.field)
      && Object.values(project.characterDocuments ?? {}).some(document => document.documentId === source.documentId);
  }
  private characterReferenceSection(field?: string): NonNullable<CharacterManagerProps['sectionRequest']>['section'] | null {
    const part = /^\/data\/([^/]+)/.exec(field ?? '')?.[1];
    if (part === 'differences' || part === 'groups') return 'figures';
    if (part === 'avatar' || part === 'voicePresets') return 'voice';
    if (part === 'referenceAssets' || part === 'appearance') return 'basics';
    return part === 'afterstory' ? 'route' : null;
  }
  private async locateAssetReference(source: Source, assetId: Id, variantId: Id): Promise<void> {
    const origin = { assetId, variantId, pinned: this.assetInspectorPin?.assetId === assetId, primaryId: this.focusedAssetId,
      query: structuredClone(this.assetQuery), selectedIds: [...this.selectedAssets], selectionRevision: this.selectedAtIndexRevision,
      selectionQuery: structuredClone(this.queryAtSelection), scroll: this.assetLibraryScroll, focus: assetReferenceSourceKey(source) };
    if (await this.openAssetReferenceTarget(source)) { this.assetReferenceOrigin = origin; this.render(); }
  }
  private async openAssetReferenceTarget(source: Source): Promise<boolean> {
    const projectId = this.controller.source?.project.projectId;
    if (!projectId || !await this.flushScript() || !await this.flushProductionDraft()) return false;
    await this.controller.refresh();
    const project = this.controller.source;
    if (project?.project.projectId !== projectId) return false;
    const scene = project.scenes.find(item => item.documentId === source.documentId);
    const characterId = Object.entries(project.characterDocuments ?? {}).find(([, document]) => document.documentId === source.documentId)?.[0];
    const owner = project.documentVersions?.find(document => document.documentId === source.documentId) ?? scene;
    const unavailable = () => {
      this.messageTone = 'warning';
      this.message = tr(this.controller.preferences.locale, '引用的精确位置已失效。请重新查看作品引用。', 'The exact reference location is unavailable. Refresh project references to try again.', '参照元の正確な位置を利用できません。作品内の参照を再表示してください。');
      this.render(); return false;
    };
    if (!owner || owner.revision !== source.revision) {
      this.messageTone = 'warning';
      this.message = tr(this.controller.preferences.locale, '引用来源已有更新。请重新查看作品引用。', 'The reference source changed. Reopen project references to refresh it.', '参照元が更新されました。作品内の参照を開き直してください。');
      this.render(); return false;
    }
    if (scene && source.statementId) {
      const found = await this.services.locate?.(source);
      if (!found) return unavailable();
      if (!this.notice(found)) return false;
      if (!found.value) return unavailable();
      if (!await this.openSceneTarget(scene.sceneId)) return false;
      if (this.controller.scene?.revision !== source.revision) return unavailable();
      this.chooseSceneView('script');
      this.controller.select([source.statementId], source.statementId);
      this.revealScriptOffset(source.statementId, found.value.start);
    } else if (scene) {
      if (!source.field?.match(/^\/data\/(decorLayers|presentation)(\/|$)/)) return unavailable();
      const decorIndex = /^\/data\/decorLayers\/(\d+)(\/|$)/.exec(source.field ?? '')?.[1];
      const listed = await this.services.bridge.documents.list();
      if (!this.notice(listed)) return false;
      const owner = listed.value.find(document => document.documentId === scene.documentId && document.revision === source.revision);
      const raw = owner?.files['scenes/' + scene.sceneId + '/scene.json'];
      if (!raw) return unavailable();
      const decorId = decorIndex === undefined ? undefined : (JSON.parse(raw).data.decorLayers?.[Number(decorIndex)]?.id as Id | undefined);
      if (decorIndex !== undefined && !decorId) return unavailable();
      if (!await this.openSceneTarget(scene.sceneId)) return false;
      await this.openEntryPresentation('scene', scene.sceneId, undefined, !!decorId, decorId);
    } else if (characterId) {
      const character = project.characters.find(item => item.id === characterId);
      if (!character) return unavailable();
      const index = /^\/data\/differences\/(\d+)(\/|$)/.exec(source.field ?? '')?.[1];
      const section = this.characterReferenceSection(source.field);
      const differenceId = index === undefined ? undefined : character.differences?.[Number(index)]?.id;
      if (!section || index !== undefined && !differenceId) return unavailable();
      this.requestCharacterSection(characterId, section, differenceId);
      await this.openDocument({ kind: 'character', objectId: characterId, title: character.name });
      if (this.activeDocument !== `character:${characterId}`) return false;
      if (source.field === '/data/avatar') requestAnimationFrame(() => {
        const field = this.characterNode.querySelector<HTMLElement>('[data-character-default-avatar]');
        field?.focus(); field?.scrollIntoView({ block: 'nearest' });
      });
      if (source.field?.startsWith('/data/groups/')) requestAnimationFrame(() => {
        const groups = this.characterNode.querySelector<HTMLDetailsElement>('.character-asset-section');
        if (groups) { groups.open = true; groups.querySelector('summary')?.focus(); }
      });
    } else return unavailable();
    return true;
  }
  private async returnToAssetReferenceOrigin(): Promise<void> {
    const origin = this.assetReferenceOrigin;
    if (!origin) return;
    const projectId = this.controller.source?.project.projectId;
    this.assetReferenceOrigin = null;
    this.assetFocusGeneration++;
    this.assetQuery = origin.query;
    this.selectedAssets = new Set(origin.selectedIds);
    this.selectedAtIndexRevision = origin.selectionRevision;
    this.queryAtSelection = origin.selectionQuery;
    this.selectedDetails = null;
    this.assetLibraryScroll = origin.scroll;
    this.focusedAssetId = origin.primaryId;
    this.assetInspectorPin = origin.pinned ? { assetId: origin.assetId, variantId: origin.variantId } : null;
    if (!origin.pinned) this.assetVariants.set(origin.assetId, origin.variantId);
    await this.showAssets();
    if (this.controller.source?.project.projectId !== projectId) return;
    this.revealAssetReferences({ assetId: origin.assetId, key: origin.focus });
  }
  private revealAssetReferences(focus?: { assetId: Id; key: string }): void {
    this.assetReferenceReturnFocus = focus ?? null;
    this.dock.current?.reveal(authoringDockTools.assetInspector, { focus: false });
    requestAnimationFrame(() => {
      const inspector = this.assetInspectorView?.node;
      if (!inspector || inspector.closest('[hidden]')) { this.dock.current?.focusView(authoringDockTools.assetInspector); return; }
      const references = inspector.querySelector<HTMLDetailsElement>('.asset-inspector-references');
      if (!references) { this.dock.current?.focusView(authoringDockTools.assetInspector); return; }
      references.open = true;
      references.querySelector('summary')?.focus({ preventScroll: true });
      this.focusReturnedAssetReference();
    });
  }
  private focusReturnedAssetReference(loaded = false): void {
    const focus = this.assetReferenceReturnFocus, inspector = this.assetInspectorView;
    if (!focus || inspector?.asset.id !== focus.assetId) return;
    const references = inspector.node.querySelector<HTMLDetailsElement>('.asset-inspector-references');
    if (!references?.open || document.activeElement !== references.querySelector('summary')) return;
    const target = [...references.querySelectorAll<HTMLButtonElement>('[data-asset-reference-source]')].find(button => button.dataset.assetReferenceSource === focus.key);
    if (target || loaded) this.assetReferenceReturnFocus = null;
    target?.focus();
  }
  private requestCharacterSection(characterId: Id, section: NonNullable<CharacterManagerProps['sectionRequest']>['section'], differenceId?: Id): void {
    this.characterSectionRequest = { characterId, section, differenceId, request: ++this.characterSectionSequence };
  }
  private bindAssetDifference(asset: Asset, variantId: Id, suggestedCharacterId?: Id): void {
    const source = this.controller.source;
    if (!source || this.closeAssetBindDialog) return;
    const node = el('div'), root = createRoot(node);
    const close = () => { this.closeAssetBindDialog = null; root.unmount(); node.remove(); };
    this.closeAssetBindDialog = close;
    this.root.append(node);
    let differenceId: Id | undefined;
    root.render(createElement(BindCharacterDifference, {
      asset, variantId, suggestedCharacterId, characters: source.characters, resources: this.services.runtimeAssets,
      locale: this.controller.preferences.locale, close,
      apply: async operation => {
        if (this.controller.source?.project.projectId !== source.project.projectId) return {
          ok: false, error: { code: 'PROJECT_CHANGED', message: 'The active project changed', severity: 'error', owner: 'M01', related: [], actions: [] }, issues: [],
        };
        const before = new Set(this.controller.source.characters.find(character => character.id === operation.characterId)?.differences?.map(item => item.id));
        const result = await this.controller.authorOperation(operation);
        if (result.ok) {
          this.characterHistory.set(operation.characterId, { canUndo: true, canRedo: false });
          differenceId = this.controller.source?.characters.find(character => character.id === operation.characterId)?.differences?.find(item =>
            !before.has(item.id) && item.figure.assetId === asset.id && item.figure.variantId === variantId)?.id;
          this.render();
        }
        return result;
      },
      openCharacter: objectId => {
        this.requestCharacterSection(objectId, 'figures', differenceId);
        void this.openDocument({ kind: 'character', objectId }).then(() => {
          this.root.querySelector<HTMLElement>('[data-tab-view="character:' + CSS.escape(objectId) + '"]')?.focus({ preventScroll: true });
        });
      },
    }));
  }
  private async findAssetReferences(assetId: Id): Promise<void> {
    const projectId = this.controller.source?.project.projectId;
    this.assetInspectorPin = null;
    await this.focusAsset(assetId);
    if (projectId === this.controller.source?.project.projectId) this.revealAssetReferences();
  }
  private async locateIssue(source: Source, origin?: 'publish' | 'problems'): Promise<void> {
    if (!await this.flushScript()) return;
    const scene = this.controller.source?.scenes.find(item => item.documentId === source.documentId);
    if (this.canLocateAssetReference(source) && (!scene || !source.statementId && source.field)) {
      if (await this.openAssetReferenceTarget(source)) { this.issueReturn = origin ?? null; this.render(); }
      return;
    }
    const unavailable = () => {
      this.messageTone = 'warning';
      this.message = tr(this.controller.preferences.locale, '此问题的来源已变化或无法打开。请重新检查作品。', 'The problem source changed or could not be opened. Run the project check again.', '問題の参照元が変わったか、開けません。作品を再確認してください。');
      this.render();
    };
    if (!scene) {
      const project = this.controller.source;
      const listed = await this.services.bridge.documents.list();
      if (!listed.ok || this.controller.source?.project.projectId !== project?.project.projectId) return unavailable();
      const owner = listed.value.find(item => item.documentId === source.documentId && item.revision === source.revision);
      if (!owner || !project) return unavailable();
      if ('project.json' in owner.files) {
        if (source.field?.startsWith('/data/display/startup')) await this.openDocument({ kind: 'startup', title: tr(this.controller.preferences.locale, '启动与主页', 'Startup & home', '起動とホーム') });
        else await this.openDocument({ kind: 'project' });
      } else if ('dependencies.lock.json' in owner.files) {
        await this.navigate('maintenance');
      } else if ('assets/index.json' in owner.files && source.field) {
        const index = /^\/data\/assets\/(\d+)(\/|$)/.exec(source.field)?.[1];
        const asset = index === undefined ? undefined : (JSON.parse(owner.files['assets/index.json']).data.assets[Number(index)] as Asset | undefined);
        if (!asset) return unavailable();
        await this.previewAsset(asset.id, asset.activeVariantId);
      } else if (Object.keys(owner.files).some(path => path.startsWith('plugins/')) && this.studioPlugins) {
        if (!this.notice(await this.studioPlugins.reopenDocument(owner.documentId))) { this.render(); return; }
      } else {
        const page = Object.keys(owner.files).find(path => /^ui\/pages\/[^/]+\.json$/.test(path));
        if (!page) return unavailable();
        await this.openDocument({ kind: 'page', objectId: page.slice('ui/pages/'.length, -'.json'.length) });
      }
      this.issueReturn = origin ?? null; this.render();
      return;
    }
    if (scene.revision !== source.revision) return unavailable();
    if (!await this.openSceneTarget(scene.sceneId)) return;
    if (this.controller.scene?.revision !== source.revision) return unavailable();
    this.chooseSceneView('script');
    this.revealScriptOffset(source.statementId ?? null, source.range?.start ?? 0);
    this.issueReturn = origin ?? null;
    this.render();
  }
  private async locateProblem(issue: Issue, origin: 'problems' | 'publish' = 'problems'): Promise<void> {
    if (issue.source) return this.locateIssue(issue.source, origin);
    const details = issue.details;
    const dependency = details && typeof details === 'object' && !Array.isArray(details) ? details.dependency : null;
    if (dependency && typeof dependency === 'object' && !Array.isArray(dependency)
      && dependency.kind === 'plugin' && typeof dependency.id === 'string' && typeof dependency.version === 'string') {
      this.missingPlugin = { id: dependency.id, version: dependency.version };
      await this.navigate('plugins');
    } else if (issue.code.startsWith('ENGINE_')) await this.navigate('maintenance');
    else if (issue.owner === 'M11') {
      await this.navigate('publish');
      if (issue.code.startsWith('BUILD_OUTPUT_')) requestAnimationFrame(() => {
        this.supportNodes.get('publish')?.querySelector<HTMLElement>('[data-field="output"] input')?.focus();
      });
    }
    else return;
    this.issueReturn = origin; this.render();
  }
  private notice<T>(result: Result<T>, recovery?: { label: string; run(): void }): result is Extract<Result<T>, { ok: true }> {
    if (!result.ok) {
      this.messageTone = result.error.severity; this.noticeText = '';
      this.message = issueText(result.error, this.controller.preferences.locale);
      this.noticeIssue = structuredClone(result.error); this.noticeRecovery = recovery;
      this.noticeAsset = result.error.code === 'ASSET_REFERENCED' ? [...this.assetCache.values()].find(asset => result.error.message.includes(asset.id))?.id ?? null : null;
      this.render(); return false;
    }
    this.message = ''; this.noticeAsset = null; this.messageTone = 'info'; return true;
  }
  async showAssets(): Promise<void> {
    if (!this.controller.source) return;
    const generation = ++this.assetQueryGeneration, projectId = this.controller.source.project.projectId;
    this.assetRequestedRevision = this.controller.source.assetIndexRevision ?? null;
    this.assetQueryPending = true;
    this.assetQueryError = null;
    this.root.querySelector('.authoring-assets')?.setAttribute('aria-busy', 'true');
    const catalog = await this.services.assetTypeCatalog?.();
    if (generation !== this.assetQueryGeneration || this.controller.source?.project.projectId !== projectId) return;
    if (catalog?.ok) this.assetTypes = catalog.value;
    const query = this.assetQuery;
    let queried = await this.services.queryAssets(query);
    if (generation !== this.assetQueryGeneration || this.controller.source?.project.projectId !== projectId) return;
    if (queried.ok) {
      const paging = assetPagination(queried.value.total, query.offset, query.limit);
      if (paging.offset !== query.offset) {
        const adjusted = { ...query, offset: paging.offset };
        queried = await this.services.queryAssets(adjusted);
        if (generation !== this.assetQueryGeneration || this.controller.source?.project.projectId !== projectId) return;
        this.assetQuery = adjusted;
      }
    }
    if (generation !== this.assetQueryGeneration || this.controller.source?.project.projectId !== projectId) return;
    if (!queried.ok) {
      this.assetQueryPending = false;
      this.assetQueryError = issueText(queried.error, this.controller.preferences.locale);
      this.render(); return;
    }
    const previousRevision = this.assetPage?.indexRevision;
    const tracked = new Set([this.focusedAssetId, this.assetInspectorPin?.assetId,
      ...this.documents.filter(doc => doc.kind === 'asset').map(doc => doc.objectId)]);
    const visible = new Set(queried.value.items.map(asset => asset.id));
    const refreshIds = [...tracked].filter((id): id is Id => !!id && !visible.has(id) &&
      (previousRevision !== queried.value.indexRevision || !this.assetCache.has(id)));
    const selection = [...this.selectedAssets];
    const [latest, selected] = await Promise.all([
      Promise.all(refreshIds.map(async id => ({ id, result: await this.services.getAsset?.(id) }))),
      selection.length && (previousRevision !== queried.value.indexRevision || this.selectedAtIndexRevision !== queried.value.indexRevision) ? this.services.describeAssets?.({
        assetIds: selection, indexRevision: queried.value.indexRevision, currentAssetId: null, currentVariantId: null,
      }) : undefined,
    ]);
    if (generation !== this.assetQueryGeneration || this.controller.source?.project.projectId !== projectId) return;
    this.assetPage = queried.value;
    queried.value.items.forEach(asset => this.assetCache.set(asset.id, asset));
    for (const { id, result } of latest) if (result?.ok) {
      if (result.value) this.assetCache.set(id, result.value); else this.assetCache.delete(id);
    }
    if (selected?.ok) this.missingSelected = selected.value.missingAssetIds.filter(id => this.selectedAssets.has(id));
    else if (!selection.length) this.missingSelected = [];
    this.assetQueryPending = false;
    this.render();
  }
  private renderAssetProcessors(): void {
    const bridge = this.services.bridge.assets;
    if (!bridge) return;
    this.resourceProcessorRoot?.render(createElement(ResourceProcessors, {
      guiDraft: this.resourceProcessorGuiDraft, onGuiDraftChange: this.captureResourceProcessorGui,
      onUnappliedChange: this.setResourceProcessorUnapplied, bridge,
      selectedIds: [...this.selectedAssets], locale: this.controller.preferences.locale, inspectorContainer: this.resourceProcessorInspector,
      workspace: this.documentWorkspace, indexRevision: this.assetPage?.indexRevision,
      changed: async receipt => { await this.controller.acceptExternalEdit(receipt); await this.showAssets(); },
    }));
  }
  render(): void {
    if(this.disposed)return;
    if (this.composingSceneInputs.size) { this.deferredSceneRender = true; return; }
    if (this.controller.source && (this.controller.source.assetIndexRevision ?? null) !== this.assetRequestedRevision) void this.showAssets();
    void this.reportAuthoringDrafts();
    const formDocumentId = this.activeDocument, formDocument = this.formDocuments.get(formDocumentId);
    for (const [id, form] of this.formDocuments) form.activate?.(id === formDocumentId);
    this.studioPlugins?.clearFieldEditors();
    this.studioPlugins?.publishScope();
    const focusRenderSequence = ++this.focusRenderSequence;
    const currentDocumentView = this.root.querySelector<HTMLElement>(`[data-view="${CSS.escape(this.activeDocument)}"]`);
    const retainedCenter = currentDocumentView?.querySelector<HTMLElement>('.authoring-scene-views') ?? this.documentRegions.get(this.activeDocument)?.node;
    const retainedCurrentScene = retainedCenter?.dataset.sceneDocument === this.controller.scene?.documentId && this.controller.scene !== null;
    const sameEditor = this.renderedPage === this.page && this.renderedSceneId === (this.controller.scene?.sceneId ?? null) || retainedCurrentScene;
    const focus = sameEditor ? captureAuthoringFocus(this.root) : null;
    const scriptFocused = sameEditor && Boolean(document.activeElement?.closest('.monaco-editor'));
    const previousCenter = sameEditor && this.pluginRenderLocale === this.controller.preferences.locale
      ? retainedCenter ?? null : null;
    const previousBeside = previousCenter ? this.root.querySelector<HTMLElement>(`[data-view="${CSS.escape(`studio-beside:${this.activeDocument}`)}"] .authoring-scene-beside`) : null;
    const sameRevision = previousCenter?.dataset.sceneRevision === String(this.controller.scene?.revision);
    this.renderedSceneId = this.controller.scene?.sceneId ?? null;
    for (const region of this.inspectorRoots) region.unmount(); this.inspectorRoots = [];
    const previousContent = this.root.querySelector<HTMLElement>('.studio-content');
    if (previousContent && this.renderedPage) this.pageScroll.set(this.renderedPage, previousContent.scrollTop);
    const previousPage = this.renderedPage, routeChanged = previousPage !== this.page; this.renderedPage = this.page;
    const assetDocument = this.documents.find(item => item.id === this.activeDocument && item.kind === 'asset');
    for (const [page, node] of this.supportNodes) if (this.page !== page) {
      for (const media of node.querySelectorAll<HTMLMediaElement>('audio,video')) media.pause();
    }
    if (routeChanged || this.pluginRenderLocale !== this.controller.preferences.locale) this.studioPlugins?.unmountViews();
    this.pluginRenderLocale = this.controller.preferences.locale;
    if (this.designer) this.designerResume = this.designer.capture();
    this.scriptEditor = null;

    const locale = this.controller.preferences.locale;
    if (this.root.lang !== locale) { this.miniStage?.dispose(); this.miniStage = null; this.animationMiniStage?.dispose(); this.animationMiniStage = null; this.stageRegion = null; if(this.designer){this.designerResume=this.designer.capture();this.designer.dispose();this.designer=null;} }
    this.root.lang = locale; this.root.dataset.theme = this.controller.preferences.theme;
    const { fontFamily, fontSize } = this.controller.preferences.editor;
    this.root.style.setProperty('--studio-editor-font-family', fontFamily === DefaultStudioPreferences.editor.fontFamily ? 'var(--font-sans)' : fontFamily);
    this.root.style.setProperty('--studio-editor-font-size', `${fontSize}px`);
    let portals = document.getElementById('studio-portals');
    if (!portals) { portals = el('div'); portals.id = 'studio-portals'; document.body.append(portals); installTransientScrollbars(portals); observeFormHints(portals); }
    portals.dataset.theme = this.controller.preferences.theme; portals.lang = locale;
    const routes = [['projects',tr(locale,'项目中心','Project center','作品センター'),'folder'],['editor',this.t('editor'),'edit'],['assets',this.t('assets'),'image'],['production',tr(locale,'制作','Produce','制作'),'spark'],['collaboration',tr(locale,'协作活动','Collaboration activity','連携アクティビティ'),'collaboration'],['pages',designerText('页面',locale),'layout'],['plugins',tr(locale,'插件','Plugins','拡張'),'package'],['connections',tr(locale,'连接','Connections','接続'),'collaboration'],['maintenance',tr(locale,'作品维护','Project maintenance','作品メンテナンス'),'folder'],['publish',tr(locale,'发布','Publish','公開'),'publish']] as const;
    const railItems: RailItem[] = routes.map(([page,label,icon]) => ({key:page,label,icon,current:this.page===page,disabled:page!=='projects'&&!this.controller.source}));
    const extensions = this.studioPlugins?.workbenches() ?? [];
    if (this.controller.source && extensions.length) {
      for (const extension of extensions) {
        const label = this.studioPlugins!.title(extension), key = `extension:${extension.key}` as Page;
        railItems.push({key,label,icon:'package',current:this.page===key,extension:true});
      }
    }
    const content = this.page === 'production' ? this.productionDocument
      : el('div', 'studio-content' + (isSupportPage(this.page) ? ' workbench-route-host' : '') + (routeChanged ? ' route-enter' : ''));
    if (this.studioPlugins?.loadError) { const error = el('p', 'workbench-error', this.studioPlugins.loadError); error.setAttribute('role', 'alert'); content.append(error); }
    if (this.message && !this.noticeIssue) { const notice = el('div', 'authoring-notice'); notice.dataset.tone = this.messageTone; notice.setAttribute('role', this.messageTone === 'error' ? 'alert' : 'status');
      const dismiss = button('', () => { this.message = ''; this.noticeText=''; this.render(); }); dismiss.ariaLabel = tr(locale, '关闭提示', 'Dismiss notification', '通知を閉じる'); dismiss.append(actionIcon('close'));
      if (this.noticeText !== this.message) { this.noticeText = this.message; this.noticeExpires = Date.now() + 5000; }
      if (this.noticeTimer) clearTimeout(this.noticeTimer);
      const dismissLater = (delay: number) => { this.noticeTimer = setTimeout(() => { this.message = ''; this.noticeText = ''; notice.animate([{opacity:1},{opacity:0}],{duration:140}).finished.then(() => notice.remove()); }, delay); };
      if (!this.preparingModel && this.messageTone !== 'error') dismissLater(Math.max(0, this.noticeExpires - Date.now()));
      const pause = () => { if (this.noticeTimer) clearTimeout(this.noticeTimer); };
      notice.onpointerenter = pause; notice.addEventListener('focusin', pause);
      const resume = () => { if (this.messageTone !== 'error') dismissLater(5000); }; notice.onpointerleave = resume; notice.addEventListener('focusout', resume);
      const assetId = this.noticeAsset;
      if (assetId) notice.append(button(tr(locale, '查看引用', 'View references', '参照を表示'),
        () => this.findAssetReferences(assetId)));
      notice.append(actionIcon(this.messageTone === 'success' ? 'check' : 'info'), el('span', '', this.message), dismiss); content.append(notice); }
    if (this.page === 'projects') content.append(this.projects());
    const unavailableDocument = this.documents.find(item => item.id === this.activeDocument && this.missingDocument(item));
    if (this.page === 'editor' && !unavailableDocument) content.append(this.editor());
    let assetLibrary: HTMLElement | null = null, assetDirectory: HTMLElement | null = null, assetProperties: HTMLElement | null = null;
    if (this.controller.source) {
      const library = this.assets();
      assetLibrary = library.node;
      assetDirectory = this.renderAssetDirectory(library.tools);
      assetProperties = this.assetInspector();
      assetProperties.append(this.resourceProcessorInspector);
      assetProperties.querySelector(':scope > .studio-plugin-slot[data-slot="assets.tools"]')?.remove();
      this.studioPlugins?.mountSlot('assets.tools', assetProperties);
      this.resourceProcessorRoot ??= createRoot(this.resourceProcessorNode); assetLibrary.append(this.resourceProcessorNode);
      this.renderAssetProcessors();
    }
    let startDesigner = false, refreshDesigner = false;
    if (this.page === 'pages' || this.pageDirectoryRequested && this.controller.source) { if (!this.designer) { this.designer = new PageDesigner(this.services, async (receipt, refresh) => { if (receipt) await this.controller.acceptExternalEdit(receipt, undefined, refresh); else await this.controller.refresh(); this.refreshDesignerWorkbench(); }, locale, this.designerResume,
      scope => { this.designerResume=this.designer!.capture();void this.openPageUiAssets(scope); }, this.studioPlugins?.componentDefinitions() ?? [], (key, title) => { if (this.activeDocument === 'startup' || this.formDocuments.has(this.activeDocument)) return; const document: AuthorDocument = { id: `page:${key}`, kind: 'page', objectId: key, title }; this.documents = openAuthorDocument(this.documents, document); this.activeDocument = document.id; this.render(); }, () => this.save(false), source => { void this.navigate('editor').then(()=>this.locateIssue(source)); }, () => this.controller.scene&&this.controller.selection?.primaryId?{documentId:this.controller.scene.documentId,revision:this.controller.scene.revision,statementId:this.controller.selection.primaryId}:null,()=>this.refreshDesignerWorkbench(),()=>{void this.reportAuthoringDrafts();});
      this.designer.configureWorkbench({ showDirectory: () => this.dock.current?.open(authoringDockTools.pageDirectory),
        showOutline: () => this.dock.current?.open(authoringDockTools.pageOutline), changed: () => this.render(), remember: () => this.rememberWorkbench() });
      this.designer.restoreWorkbenchViews(this.controller.workbench?.pageViews ?? []);
      startDesigner = true;
    } if (this.page === 'pages') content.append(this.designer.root); }
    if (this.designer && this.controller.source) { const source = this.controller.source; refreshDesigner = !startDesigner && (this.designerProjectRevision !== source.projectRevision || source.scenes.some(scene => this.designerSceneRevisions.get(scene.sceneId) !== scene.revision)); this.designerProjectRevision = source.projectRevision; this.designerSceneRevisions = new Map(source.scenes.map(scene => [scene.sceneId, scene.revision])); }
    const source=this.controller.source;
    const changed = async (receipt?: EditReceipt) => {
      if (receipt) await this.controller.acceptExternalEdit(receipt);
      else await this.controller.refresh();
      this.render();
    };
    if (source && (this.page === 'production' || this.productionRoot || this.productionDirectoryRequested
      || this.documents.some(document => document.id === productionDocumentId))) {
      const session = this.ensureProductionSession()!;
      this.productionSubscription ??= session.subscribe(this.productionChanged);
      if (!this.productionRoot) {
        this.productionDocument.append(this.productionNode);
        this.productionRoot = createRoot(this.productionNode);
      }
      this.productionRoot.render(createElement(Production, {
        productionHost: this.studioPlugins, onUnappliedChange: this.setProductionUnapplied, onReviewChange: this.setProductionReview,
        session, services: this.services, locale, navigate: page => void this.navigate(page as Page), changed,
        openConnections: () => { this.connectionOrigin = session.selectedRecord; void this.navigate('connections'); },
        returnToOrigin: origin => this.returnToProductionOrigin(origin),
        bindFigure: (asset, variantId, characterId) => this.bindAssetDifference(asset, variantId, characterId),
        documentActive: this.page === 'production', inspectorContainer: this.productionInspector, revealInspector: () => this.revealInspector(),
        directory: {
          container: this.productionDirectory, initial: this.productionDirectoryState,
          onChange: state => { this.productionDirectoryState = { ...this.productionDirectoryState, ...state }; this.rememberWorkbench(); },
          open: () => this.dock.current?.open(authoringDockTools.productionDirectory),
          openDocument: () => this.openProductionWorkbench(),
          focusDocument: () => this.dock.current?.focusView(productionDocumentId),
        },
      }));
    }
    if (source && (this.workbench || isSupportPage(this.page))) {
      this.workbench ??= createRoot(this.workbenchNode);
      if (isSupportPage(this.page)) content.append(this.supportNodes.get(this.page)!);
      const bridge = this.services.bridge as import('../../desktop-bridge.js').DesktopBridge;
      const visit = (page: SupportPage) => this.page === page || this.documents.some(document => document.id === `route:${page}`);
      const session = visit('connections') ? this.ensureProductionSession() : null;
      const projectId = source.project.projectId;
      this.workbench.render([
        visit('collaboration') && createPortal(createElement(Collaboration, { bridge: bridge.collaboration, locale, active: this.page === 'collaboration', projectId }), this.supportNodes.get('collaboration')!, 'collaboration'),
        visit('plugins') && createPortal(createElement(Plugins, { bridge: workbenchBridge(this.services.bridge), locale, projectId, authorHost: this.studioPlugins, missingDependency: this.missingPlugin,
          openConnections: () => { this.connectionOrigin = null; void this.navigate('connections'); }, documentActive: this.page === 'plugins',
          changed: async () => { await this.controller.refresh(); await this.refreshStudioPlugins(); this.render(); } }), this.supportNodes.get('plugins')!, 'plugins'),
        session && createPortal(createElement(ConnectionWorkbench, { session, locale, active: this.page === 'connections',
          onReturn: this.connectionOrigin ? () => { void this.returnToConnectionTask(); } : undefined,
          onUnappliedChange: this.setConnectionUnapplied }), this.supportNodes.get('connections')!, 'connections'),
        visit('maintenance') && bridge.upgrades && createPortal(createElement(ProjectMaintenance, { locale, source, upgrades: bridge.upgrades,
          readDocuments: bridge.documents.list, chooseOldSaves: bridge.builds.chooseOldSaves,
          engineRepair: bridge.engines.health && bridge.engines.repair ? bridge.engines as Required<Pick<StudioBridge['engines'], 'health' | 'repair'>> : undefined,
          beforeProjectChange: async () => {
            if (this.unappliedInput() || !await this.flushScript()) return false;
            await this.flushInputDrafts(); return true;
          },
          onProjectChanged: () => this.refreshCollaborationProject() }), this.supportNodes.get('maintenance')!, 'maintenance'),
        visit('publish') && createPortal(createElement(Publish, {
          onHistoryReady: this.setPublishHistory, key: this.publishDraftRevision, guiDraft: this.publishGuiDraft, onGuiDraftChange: this.capturePublishGui,
          services: this.services, source, locale, changed, onUnappliedChange: this.setPublishUnapplied, saveAll: () => this.save(true), documentActive: this.page === 'publish',
          openProjectMaintenance: () => { void this.navigate('maintenance'); },
          locateSource: target => { void this.locateIssue(target, 'publish'); },
          locateDependency: issue => { void this.locateProblem(issue, 'publish'); },
          onCheckIssues: issues => { if (this.controller.source?.project.projectId === projectId) { this.releaseIssues = issues; this.render(); } },
          onBuildStarted: planId => {
            if (this.controller.source?.project.projectId !== projectId) return;
            this.pendingBuild = planId;
            if (this.outputFailure?.kind === 'build') this.outputFailure = undefined;
            this.renderOutput();
          },
          onBuildReceipt: (planId, receipt) => this.recordBuild(planId, receipt),
          onBuildFailure: (planId, issue, cancelled) => {
            if (this.controller.source?.project.projectId !== projectId) return;
            this.pendingBuild = undefined;
            this.outputFailure = { kind: 'build', id: planId, issue, cancelled }; this.renderOutput();
          },
          lastBuild: this.output.built,
        }), this.supportNodes.get('publish')!, 'publish'),
      ]);
    }
    if (source && this.studioPlugins) {
      if (this.page.startsWith('extension:')) this.studioPlugins.mountWorkbench(this.page.slice('extension:'.length), content);
      else {
        const slots: Partial<Record<Page, StudioSlot>> = { projects: 'project.overview', editor: 'creation.tools',
          pages: 'player-ui.tools', assistant: 'player-ui.tools', production: 'production.tools', publish: 'publish.checks' };
        const slot = slots[this.page]; if (slot) this.studioPlugins.mountSlot(slot, content);
      }
    }
    const status=el('div','studio-status');status.id='studio-status';
    let documentContent: HTMLElement = content, documentToolbar: HTMLElement | null = null, explorer: HTMLElement | null = null, inspector: HTMLElement | null = null;
    let beside: AuthoringWorkbenchProps['beside'];
    let activateScenePane: AuthoringWorkbenchProps['activateScenePane'];
    const editor = content.querySelector<HTMLElement>('.authoring-editor');
    if (editor) {
      documentToolbar = this.controller.scene ? this.sceneToolbars.get(this.controller.scene.sceneId)?.node ?? null : null;
      const sceneViews = editor.querySelector<HTMLElement>('.authoring-scene-views');
      const active = this.documents.find(item => item.id === this.activeDocument);
      if (sceneViews && this.activeDocument !== 'empty' && !formDocument && (!active || active.kind === 'scene' || active.kind === 'route')) {
        const panes = this.mountScenePanes(sceneViews, previousCenter, previousBeside, sameRevision);
        documentContent = panes.group;
        const documentId = this.controller.scene?.documentId;
        const [primary, companion] = this.sceneViews();
        const activate = (view: AuthoringController['view']) => {
          if (this.controller.scene?.documentId !== documentId || this.controller.view === view) return;
          this.activateSceneView(view);
          queueMicrotask(() => this.render());
        };
        if (primary) activateScenePane = () => activate(primary);
        if (panes.beside && companion && this.controller.scene) {
          const sceneId = this.controller.scene.sceneId;
          const owner = `scene:${sceneId}`;
          beside = { node: panes.beside, title: this.t(companion), activate: () => {
            if (this.activeDocument === owner || this.activateVisibleScene(owner)) { activate(companion); return; }
            void this.openDocument({ kind: 'scene', objectId: sceneId }).then(() => { if (this.activeDocument === owner) activate(companion); });
          }, close: async () => {
            if (this.activeDocument === owner) return this.splitScene(null);
            this.splitSceneViews.delete(sceneId); this.retainedCompanions.delete(`studio-beside:${owner}`); this.render();
            return true;
          } };
          this.retainedCompanions.set(`studio-beside:${owner}`, beside);
        }
      }
      const insertion = this.insertions.get(this.controller.scene?.sceneId ?? '');
      if (insertion) {
        const selector = `[data-scene-view="${this.controller.view}"]`;
        const view = documentContent.querySelector<HTMLElement>(selector) ?? beside?.node.querySelector<HTMLElement>(selector) ?? documentContent;
        const target = insertion.beforeId ? view.querySelector<HTMLElement>(`[data-statement-id="${CSS.escape(insertion.beforeId)}"]`) : null;
        if (target) target.before(insertion.placeholder); else (view.querySelector('.authoring-card-list,.authoring-writing-list') ?? view).append(insertion.placeholder);
      }
      if (active?.kind === 'project') {
        documentContent = active.objectId === 'preferences' ? this.workbenchPreferences() : this.projectDocument();
        documentToolbar = null; inspector = el('section', 'authoring-inspector'); inspector.append(el('h2','',active.title),el('p','',active.objectId === 'preferences' ? '偏好保存在本机工作台。' : `${source?.project.name} · ${source?.project.engineVersion}`));
      }
      if (active?.kind === 'character' || active?.kind === 'characters') { documentContent = this.characterDocument(active.objectId); documentToolbar = null; inspector = this.characterAsset ? createAssetInspector(this.characterAsset, { locale, rename: name => this.renameAsset(this.characterAsset!.id,name), preview: id => { void this.previewAsset(this.characterAsset!.id,id); }, reveal:()=>{void this.services.revealEntity({kind:'asset',id:this.characterAsset!.id});},transparent:()=>{void this.removeAssetBackground(this.characterAsset!);} }) : el('section','authoring-inspector',tr(locale,'选择差分、头像或声音素材查看属性。','Select a figure, portrait or voice asset to inspect.','差分、ポートレート、音声素材を選択してプロパティを表示します。')); }
      if (active?.kind === 'scene-graph' && source) { this.graphRoot ??= createRoot(this.graphNode); this.graphRoot.render(createElement(SceneGraph, { source, activeSceneId: this.controller.scene?.sceneId ?? null, locale, expanded: true, onNavigate: (sceneId, statementId) => { void this.openDocument({ kind: 'scene', objectId: sceneId }).then(() => { if (statementId) this.controller.select([statementId]); this.render(); }); } })); documentContent = this.graphNode; documentToolbar = null;
        inspector = el('section', 'authoring-inspector'); inspector.append(el('h2', '', tr(locale, '场景关系', 'Scene relationships', 'シーン関係')), el('p', '', tr(locale, '选择节点进入场景，选择连线定位对应指令。虚线表示调用。', 'Select a node to edit its scene, or a connection to locate its command. Dashed lines are calls.', 'ノードでシーンを編集し、接続で命令へ移動します。破線は呼び出しです。')));
      }
      if (this.activeDocument === 'empty') { documentContent = el('section', 'gc-wb-empty', '从对象树打开文档，继续编辑作品。'); documentToolbar = null; inspector = null; }
      else if (!active || active.kind === 'scene' || active.kind === 'route') {
        const scene = this.controller.scene; if (scene) { const document: AuthorDocument = { id: `scene:${scene.sceneId}`, kind: 'scene', objectId: scene.sceneId, title: scene.name, dirty: scene.dirty }; this.documents = openAuthorDocument(this.documents, document); this.activeDocument = document.id; if (!this.treeSelected.length) this.treeSelected = [scene.sceneId]; }
      }
    } else if (unavailableDocument) {
      documentContent = el('section', 'gc-dock-missing-view');
      documentContent.append(el('h2', '', unavailableDocument.title), el('p', '', tr(locale, '此对象暂不可用。恢复原对象，或从目录选择其他对象。', 'This item is unavailable. Restore it or choose another item from the directory.', 'この項目は利用できません。項目を復元するか、一覧から別の項目を選択してください。')));
    } else if (this.page === 'pages' && this.designer) { const regions = this.designer.workbenchRegions(); if (!this.designer.workbenchIsPage(this.activeDocument.slice(5)) && this.designer.hasWorkbenchPage(this.activeDocument.slice(5)) === true) { explorer = regions.tree; inspector = regions.inspector; } if (this.activeDocument === 'startup') { documentContent = this.startupDocument(true); inspector = this.startupInspector; } }
    else if (this.page === 'production') {
      const title = tr(locale, '制作', 'Production', '制作');
      this.documents = openAuthorDocument(this.documents, { id: productionDocumentId, kind: 'route', objectId: 'production', title });
      this.activeDocument = productionDocumentId;
      inspector = el('div', 'production-inspector-host');
      inspector.append(this.productionInspector);
    } else if (this.page !== 'assets') { const title = routes.find(([page]) => page === this.page)?.[1] ?? this.studioPlugins?.workbenches().find(item => `extension:${item.key}` === this.page)?.title ?? this.page;
      const document: AuthorDocument = { id: `route:${this.page}`, title: typeof title === 'string' ? title : this.page, kind: 'route', objectId: this.page }; this.documents = openAuthorDocument(this.documents, document); this.activeDocument = document.id;
    }
    if (assetDocument) documentContent = this.renderAssetDocument(assetDocument);
    for (const slot of content.querySelectorAll<HTMLElement>(':scope > .studio-plugin-slot')) {
      inspector ??= el('aside', 'authoring-inspector'); inspector.append(slot);
    }
    const noticeRegion = el('div');
    if (this.controller.engineIssue && this.page !== 'maintenance') {
      const notice = el('div', 'asset-reference-return');
      notice.setAttribute('role', 'status');
      notice.append(el('span', '', tr(locale, '作品只读 · 精确引擎不可用', 'Project read-only · Exact engine unavailable', '作品は読み取り専用 · エンジンを利用できません')),
        button(tr(locale, '打开作品维护', 'Open project maintenance', '作品メンテナンスを開く'), () => this.navigate('maintenance')));
      noticeRegion.append(notice);
    }
    if (this.issueReturn) {
      const target = this.issueReturn;
      const back = el('div', 'asset-reference-return');
      back.append(button(target === 'publish' ? tr(locale, '返回发布检查', 'Return to release check', '配布チェックへ戻る') : tr(locale, '返回问题', 'Return to Problems', '問題に戻る'), async () => {
        this.issueReturn = null;
        if (target === 'publish') await this.navigate('publish');
        else { this.render(); this.dock.current?.open(authoringDockTools.problems); }
      }));
      noticeRegion.append(back);
    }
    if (this.assetReferenceOrigin) {
      const returnBar = el('div', 'asset-reference-return');
      returnBar.append(button(tr(locale, '返回素材', 'Return to assets', '素材に戻る'), () => this.returnToAssetReferenceOrigin()));
      noticeRegion.append(returnBar);
    }
    for (const notice of content.querySelectorAll<HTMLElement>(':scope > .authoring-notice,:scope > .workbench-error')) noticeRegion.append(notice);
    const noticeAsset = this.noticeAsset;
    const issueNotice = this.noticeIssue ? createElement(IssueNotice, {
      issue: this.noticeIssue, locale, dismiss: () => { this.message = ''; this.render(); },
      recovery: this.noticeRecovery ?? (noticeAsset ? {
        label: tr(locale, '查看引用', 'View references', '参照を表示'),
        run: () => { void this.findAssetReferences(noticeAsset); },
      } : this.noticeIssue.source ? {
        label: tr(locale, '定位问题', 'Locate issue', '問題へ移動'),
        run: () => { void this.locateIssue(this.noticeIssue!.source!); },
      } : undefined),
    }) : undefined;
    const notice = issueNotice && noticeRegion.childElementCount ? createElement('div', null, issueNotice, createElement(DomRegion, { node: noticeRegion }))
      : issueNotice ?? (noticeRegion.childElementCount ? createElement(DomRegion, { node: noticeRegion }) : undefined);
    if (this.activeDocument !== 'startup' || this.page !== 'pages') { if (this.startupRoot) this.startupDocument(false); if (this.stopStartup) { this.startupGeneration++; this.stopStartup(); } }
    if (this.page === 'pages' && !this.documents.some(item => item.id === this.activeDocument && ['page', 'startup'].includes(item.kind))) { const capture = this.designer?.capture(); const key = capture?.page ?? 'title'; const document: AuthorDocument = { id: `page:${key}`, title: capture?.page ?? '页面', kind: 'page', objectId: key }; this.documents = openAuthorDocument(this.documents, document); this.activeDocument = document.id; }
    this.documents = this.documents.map(document => {
      const scene = document.kind === 'scene' ? source?.scenes.find(item => item.sceneId === document.objectId) : null;
      if (scene) {
        const dirty = scene.dirty || scene.sceneId === this.controller.scene?.sceneId && this.writingDrafts.size > 0;
        return { ...document, title: scene.name, dirty, preview: dirty ? false : document.preview };
      }
      if (document.kind === 'character' && document.objectId) {
        const character = source?.characters.find(item => item.id === document.objectId);
        return { ...document, title: character?.name ?? document.title,
          dirty: !!this.characterGuiDraft?.drafts[document.objectId] || !!source?.characterDocuments?.[document.objectId]?.dirty };
      }
      if (document.kind === 'asset' && document.objectId) {
        const asset = this.assetCache.get(document.objectId);
        return asset ? { ...document, title: asset.name } : document;
      }
      return document.id === 'route:publish' ? { ...document, dirty: this.publishUnapplied || !!source?.projectDirty }
        : document.kind === 'startup' ? { ...document, dirty: this.startupDraft || source?.projectDirty }
        : document.kind === 'page' ? { ...document, title: this.designer?.workbenchPages().find(page => page.id === document.objectId)?.name ?? designerPageName(document.objectId ?? document.id.slice(5), locale), dirty: this.designer?.workbenchDirty(document.objectId ?? '') ?? document.dirty } : document;
    });
    this.shellRoot ??= createRoot(this.shellNode); if (this.shellNode.parentNode !== this.root) this.root.append(this.shellNode);
    if (formDocument) { this.activeDocument = formDocumentId; documentContent = formDocument.node; documentToolbar = null; inspector = formDocument.inspector ?? el('section','authoring-inspector',tr(locale,'输入保留在本次编辑会话；应用后进入作品工作区，再通过保存落盘。','Input is kept in this editing session. Apply it to working content, then save to disk.','入力は今回の編集セッションに保持されます。作業内容に適用してから保存してください。')); }
    documentContent.querySelector('.document-recovery-notice')?.remove();
    if (this.recoveryPending && this.page !== 'projects') { const recovery = el('div', 'authoring-toolbar document-recovery-notice'); recovery.setAttribute('role', 'status'); recovery.append(el('span', '', tr(locale, '上次的未保存草稿等待处理，处理后可继续编辑。', 'Resolve the previous unsaved draft to continue editing.', '前回の未保存草稿を処理すると編集を続行できます。')), button(tr(locale, '处理恢复草稿', 'Resolve recovery draft', '復元する草稿を処理'), () => this.reviewRecovery())); documentContent.prepend(recovery); }
    const activeKind = this.documents.find(item => item.id === this.activeDocument)?.kind;
    const pilot = this.page === 'editor' && (!activeKind || activeKind === 'scene' || activeKind === 'scene-graph');
    this.root.dataset.authoringPilot = String(pilot); portals.dataset.authoringPilot = String(pilot);
    const actionFailed = (error: unknown) => { this.message = String(error); this.messageTone = 'error'; this.render(); };
    this.renderCharacterDirectory();
    this.retainDocumentRegions(documentContent, documentToolbar);
    if (source) this.mountDockStage(source);
    const mainInspector = this.sceneInspector();
    const insertion = this.page === 'editor' && activeKind === 'scene' ? this.insertions.get(this.controller.scene?.sceneId ?? '') : undefined;
    if (insertion && insertion.node !== insertion.placeholder) mainInspector?.prepend(insertion.node);
    const companions = new Map(this.retainedCompanions);
    if (this.designer) for (const document of this.documents) {
      const key = document.kind === 'page' && document.objectId;
      if (!key) continue;
      const node = this.designer.workbenchBehaviorCompanion(key);
      if (!node) continue;
      const companion = { node, title: tr(locale, '行为蓝图', 'Behavior blueprint', '動作ブループリント'),
        activate: () => { if (this.activeDocument !== document.id) void this.openDocument(document); },
        close: async () => { this.designer?.closeBehaviorSplit(key); return true; } };
      companions.set(`studio-beside:${document.id}`, companion);
      if (this.activeDocument === document.id) beside = companion;
    }
    this.shellProps = { source: source ?? null, characterExplorer: source ? this.characterDirectoryNode : undefined, locale, page: this.page,
      assetDirectory, assetLibrary, assetInspector: assetProperties, openAssets: () => this.openAssetWorkspace(),
      productionDirectory: source ? this.productionDirectory : undefined,
      prepareProductionDirectory: () => {
        if (this.productionRoot || this.productionDirectoryRequested) return;
        this.productionDirectoryRequested = true;
        queueMicrotask(() => this.render());
      },
      documentRegions: this.documentRegions, openCharacterDifference: id => this.openCharacterDifference(id), openWritingStage: id => this.openWritingStage(id),
      activateVisibleDocument: id => this.activateVisibleDocument(id),
      outlineState: { query: this.outlineQuery, scrollTop: this.outlineScrollTop },
      onOutlineState: value => { this.outlineQuery = value.query; this.outlineScrollTop = value.scrollTop; this.rememberWorkbench(); },
      characterTarget: source?.characters.some(character => character.id === this.characterSelected) ? this.characterSelected : undefined,
      onViewFocus: id => { if (id) { this.focusedWorkbenchTool = id; this.refreshCommandTarget(); } },
      chrome: { locale, theme: this.controller.preferences.theme, project: source?.project.name, dirty: this.workbenchDirty(), editTarget: this.workbenchEditTargetLabel(), historyUnavailable: this.workbenchHistoryUnavailable(),
        items: railItems.filter(item => item.key !== 'assets' && item.key !== 'editor'), navigate: key => { void this.navigate(key as Page).catch(actionFailed); },
        action: value => { void this.shellAction(value).catch(actionFailed); },
        preferences: value => { void this.preference(p => ({ ...p, ...value })); },
        preview: source ? () => { void this.runPlaytest('stage').catch(actionFailed); } : undefined },
      documents: this.documents, active: this.activeDocument, content: documentContent, activateScenePane, beside, retainedCompanions: companions, toolbar: documentToolbar, explorer, search: this.sceneSearch(), stage: this.stageRegion, inspector: mainInspector, problems: this.sceneProblems(), output: this.renderOutput(), status, notice,
      contextInspector: activeKind === 'character' && !this.characterAsset && !formDocument ? null : inspector,
      dock: this.dock, dockLayout: this.dockLayout, dockNotice: message => { studioToasts.add({ title: message }); },
      dockLayoutChange: layout => {
        this.dockLayout = asJson(JSON.parse(JSON.stringify(layout))); this.rememberWorkbench();
        requestAnimationFrame(() => {
          if (groups(layout.tree).some(group => (group.active.startsWith('asset:') || group.active === productionDocumentId) && !this.documentRegions.has(group.active))) this.render();
          this.syncAssetPreviews();
          this.restoreAssetLibraryScroll();
          if (layout.bottom.active === authoringDockTools.output && !layout.hidden.bottom) this.outputNode.scrollTop = this.output.scrollTop;
          this.refreshCommandTarget();
        });
      },
      namedLayouts: this.controller.preferences.namedDockLayouts,
      writeNamedLayouts: async layouts => {
        const result = await this.controller.setPreference(p => ({ ...p, namedDockLayouts: JSON.parse(JSON.stringify(layouts)) as StudioPreferences['namedDockLayouts'] }));
        if (!result.ok) throw new Error(result.error.message);
        this.render();
      },
      layout: this.controller.preferences.layout, inspectorShown: this.inspectorShown, selected: this.treeSelected, contextSelected: this.activeDocument === 'startup' ? ['startup'] : this.page === 'pages' && this.designer ? [this.designer.workbenchPage(), ...this.designer.capture().selected] : [], select: ids => { this.treeSelected = ids; this.render(); }, open: document => this.openDocument(document), pin: id => { this.documents = this.documents.map(document => document.id === id ? { ...document, preview: false } : document); this.refreshDocumentTabs(); }, close: id => this.closeDocument(id),
      rename: async (id, name) => { if (!await this.flushScript() || !this.controller.source) return '当前输入尚未应用'; return this.applyWorkbenchObject(renameWorkbenchObject(this.controller.source, id, name)); },
      move: async (ids, parent, index) => { if (!await this.flushScript() || !this.controller.source) return; const error = await this.applyWorkbenchObject(moveWorkbenchObjects(this.controller.source, ids, parent, index)); if (error) { this.message = error; this.render(); } }, create: (kind, parent) => this.createWorkbenchObject(kind, parent),
      entryPresentation: (kind, id) => { void this.openEntryPresentation(kind, id); },
      sceneDecor: id => { void this.openEntryPresentation('scene', id, undefined, true); },
      reorder: ids => {
        if (ids.length !== this.documents.length || ids.some(id => !this.documents.some(doc => doc.id === id))) return;
        this.documents = ids.flatMap(id => this.documents.find(doc => doc.id === id) ?? []);
        this.rememberWorkbench();
        this.refreshDocumentTabs();
      },
      ...this.pageWorkbenchProps(),
      preparePageDirectory: () => { if (this.designer || this.pageDirectoryRequested) return; this.pageDirectoryRequested = true; queueMicrotask(() => this.render()); },
      pageOpen: id => { void this.openDocument({ kind: 'page', objectId: id, title: this.designer?.workbenchPages().find(page => page.id === id)?.name ?? id }); },
      componentSelect: ids => { this.designer?.selectComponents(ids); this.refreshDesignerWorkbench(); }, componentMove:(ids,parent)=>{void this.designer?.moveComponents(ids,parent);},componentRename:(id,name)=>this.designer?.renameComponent(id,name)??Promise.resolve(), confirm: this.documentConfirm,
    }; flushSync(() => this.shellRoot!.render(createElement(AuthoringWorkbench, this.shellProps!)));
    this.syncAssetPreviews();
    this.restoreAssetLibraryScroll();
    completeFormHints(this.root, locale); if (!formDocument) documentContent.scrollTop = this.pageScroll.get(this.page) ?? documentContent.scrollTop;
    markAuthoringFocus(this.root); restoreAuthoringFocus(this.root,focus);
    requestAnimationFrame(()=>{if(focusRenderSequence===this.focusRenderSequence){markAuthoringFocus(this.root);if(document.activeElement===document.body)restoreAuthoringFocus(this.root,focus);}});
    this.updateStatus();
    this.rememberWorkbench();
    if (startDesigner && this.designer) { const designer = this.designer; void designer.start().then(async () => { if (this.designer !== designer) return; const active=this.documents.find(d=>d.id===this.activeDocument); if(active?.kind==='page'&&active.objectId)await designer.openPage(active.objectId); this.render(); }).catch(error => { this.message = String(error); this.render(); }); }
    else if (refreshDesigner && this.designer) void this.designer.refresh().then(() => this.render()).catch(error => { this.message = String(error); this.render(); });
    const thumbnailGeneration = ++this.thumbnailGeneration;
    if (this.controller.source) {
      void this.loadThumbnails(thumbnailGeneration);
      for(const details of this.root.querySelectorAll('details'))details.addEventListener('toggle',()=>{if(details.open)void this.loadThumbnails(thumbnailGeneration);});
    }
    else if (this.thumbnailsActive) {
      this.thumbnailsActive = false; void loadVisibleAssetThumbnails(this.services);
    }
    if (source) this.syncVisibleScenePanes(source, scriptFocused);
  }
  private syncVisibleScenePanes(source: AuthoringSource, scriptFocused: boolean): void {
    const scenes = new Map(source.scenes.map(scene => [scene.sceneId, scene]));
    const openScenes = new Set(this.documents.filter(document => document.kind === 'scene').map(document => document.objectId));
    for (const [id, toolbar] of this.sceneToolbars) {
      if (openScenes.has(id)) continue;
      toolbar.root.unmount(); this.sceneToolbars.delete(id);
    }
    for (const pane of this.root.querySelectorAll<HTMLElement>('[data-scene-id][data-scene-view]')) {
      if (pane.closest('.gc-dock-content[hidden]')) continue;
      const scene = scenes.get(pane.dataset.sceneId!);
      if (!scene) continue;
      const view = pane.dataset.sceneView as AuthoringController['view'];
      if (view === 'script') {
        const script = pane.querySelector<HTMLElement>('.authoring-script-editor');
        if (script) this.bindSceneScript(script, scene, source, scriptFocused);
        continue;
      }
      this.retainWritingInputs(pane, scene.documentId);
      const context = this.scenePaneContext(scene.sceneId, view);
      const anchors = [...pane.querySelectorAll<HTMLElement>('[data-statement-id]')];
      const anchor = anchors.find(item => item.dataset.statementId === context.scroll.statementId)
        ?? anchors.find(item => item.dataset.statementId === context.selection?.primaryId);
      if (anchor) {
        pane.scrollTop = Math.max(0, anchor.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - context.scroll.offsetPx);
      }
      pane.onscroll = () => {
        const top = pane.getBoundingClientRect().top;
        const visible = anchors.find(item => item.getBoundingClientRect().bottom > top);
        this.setScenePaneScroll(scene.sceneId, view, { statementId: visible?.dataset.statementId ?? null,
          offsetPx: visible ? visible.getBoundingClientRect().top - top : 0, scrollLeft: pane.scrollLeft });
      };
    }
  }
  private bindSceneScript(scriptContainer: HTMLElement, scene: NonNullable<AuthoringController['scene']>, source: AuthoringSource, scriptFocused: boolean): void {
    const cached = this.scriptSessions.get(scene.sceneId), pending = this.scriptMounts.get(scene.sceneId);
    const retained = cached?.node ?? pending?.container;
    if (retained && retained !== scriptContainer) { scriptContainer.replaceWith(retained); scriptContainer = retained; }
    const scriptNode = scriptContainer, context = this.scenePaneContext(scene.sceneId, 'script');
    const projectMatches = () => this.controller.source?.project.projectId === source.project.projectId;
    const revealOffset = this.scriptReveal?.documentId === scene.documentId && this.scriptReveal.revision === scene.revision ? this.scriptReveal.offset : undefined;
    if (revealOffset !== undefined) this.scriptReveal = null;
    const input: Parameters<typeof mountScriptEditor>[0] = { container: scriptContainer, scene, engineVersion: source.project.engineVersion, readOnly: !!this.controller.engineIssue,
      wordWrap: this.controller.preferences.editor.wordWrap, fontSize: this.controller.preferences.editor.fontSize,
      selectedId: context.selection?.primaryId ?? null, documentOffset: context.caret.documentOffset,
      scroll: context.scroll, revealOffset,
      initialText: this.scriptDrafts.get(scene.sceneId),
      locale: this.controller.preferences.locale,
      onDraft: text => {
        if (!projectMatches()) return;
        if (text === null) { this.scriptDrafts.delete(scene.sceneId); this.scriptDraftOrigins.delete(scene.sceneId); }
        else {
          if (!this.scriptDraftOrigins.has(scene.sceneId)) this.scriptDraftOrigins.set(scene.sceneId, this.controller.source?.scenes.find(item => item.documentId === scene.documentId)?.revision ?? scene.revision);
          this.scriptDrafts.set(scene.sceneId, text);
        }
        void this.reportAuthoringDrafts(); this.updateMiniStage();
      },
      references: [...this.references(),
        ...[...this.assetCache.values()].map(item => ({ kind: 'asset' as const, id: item.id, name: item.name, detail:[item.folder.join('/'),item.kind].filter(Boolean).join(' · ') }))],
      variables: source.variables ?? [],
      pluginCommands: this.studioPlugins?.commandSpecs() ?? [],
      pluginConditions: this.studioPlugins?.conditionMetadata() ?? [],
      onCaret: (id, documentOffset) => {
        if (this.followedScene()?.documentId !== scene.documentId || this.controller.view !== 'script') return;
        const previous = this.controller.selection?.primaryId;
        const previousEvent = this.focusedDialogueEvent?.eventId;
        const node = this.controller.parsed('script', scene)?.parsed.cst.find(item => item.id === id);
        const events = node?.command === 'say' ? node.fields.find(field => field.key === 'events')?.valueNode.items : undefined;
        const event = events?.find(item => documentOffset >= item.start && documentOffset < item.end);
        const parsedEvent = DialogueEventSchema.safeParse(event?.value);
        this.focusedDialogueEvent = id && parsedEvent.success ? { sceneId: scene.sceneId, statementId: id, eventId: parsedEvent.data.id } : null;
        this.controller.setCaret(id, documentOffset); this.studioPlugins?.publishScope(); this.updateMiniStage();
        if ((previous !== this.controller.selection?.primaryId || previousEvent !== this.focusedDialogueEvent?.eventId) && scriptNode.contains(document.activeElement)) queueMicrotask(() => this.render());
      },
      onSelection: (statementIds, textRange) => {
        if (this.followedScene()?.documentId !== scene.documentId || this.controller.view !== 'script') return;
        this.controller.setTextSelection(statementIds, textRange); this.studioPlugins?.publishScope();
      },
      onScroll: (statementId, offsetPx, scrollLeft) => this.setScenePaneScroll(scene.sceneId, 'script', { statementId, offsetPx, scrollLeft }),
      onComposition: active => this.setSceneComposition(scriptNode, active),
      onCommit: async text => {
        if (!projectMatches()) return false;
        const result = await this.controller.editScript(text, scene.sceneId, this.scriptDraftOrigins.get(scene.sceneId) ?? scene.revision);
        if (!this.notice(result)) { this.updateStatus(); return false; }
        if (this.scriptDrafts.get(scene.sceneId) === text) {
          this.scriptDrafts.delete(scene.sceneId);
          this.scriptDraftOrigins.delete(scene.sceneId);
        } else {
          const revision = result.value.documents.find(item => item.ref.id === scene.documentId)?.revision;
          if (revision !== undefined) this.scriptDraftOrigins.set(scene.sceneId, revision);
        }
        this.render(); return true;
      },
    };
    if (cached) {
      cached.editor.update(input);
      if (this.followedScene()?.sceneId === scene.sceneId) this.scriptEditor = cached.editor;
      return;
    }
    this.scriptMounts.set(scene.sceneId, input);
    if (pending) return;
    void mountScriptEditor(input).then(editor => {
      const latest = this.scriptMounts.get(scene.sceneId);
      if (!latest || latest.container !== scriptNode || !projectMatches()) {
        editor.dispose(); return;
      }
      this.scriptMounts.delete(scene.sceneId);
      this.scriptSessions.set(scene.sceneId, { node: scriptNode, editor });
      if (latest !== input) editor.update(latest);
      if (this.followedScene()?.sceneId !== scene.sceneId || !scriptNode.isConnected) return;
      this.scriptEditor = editor;
      if (scriptFocused) scriptNode.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    }).catch(error => {
      if (this.scriptMounts.get(scene.sceneId)?.container !== scriptNode) return;
      this.scriptMounts.delete(scene.sceneId);
      const status = el('p', 'field-error', String(error));
      status.setAttribute('role', 'alert');
      scriptNode.replaceChildren(status);
    });
  }
  private retainWritingInputs(pane: HTMLElement, documentId: Id): void {
    for (const input of pane.querySelectorAll<HTMLTextAreaElement>('.authoring-writing-input')) {
      const id = input.closest<HTMLElement>('[data-statement-id]')?.dataset.statementId;
      if (!id) continue;
      const key = documentId + '/' + id, previous = this.writingInputs.get(key);
      if (previous === input) continue;
      if (previous) {
        if (!this.writingDrafts.has(id) && previous.value !== input.value) { previous.value = input.value; resetWritingHistory(previous); }
        previous.disabled = input.disabled;
        input.replaceWith(previous);
      } else { this.writingInputs.set(key, input); attachWritingHistory(input); }
    }
  }
  private mountScenePanes(next: HTMLElement, previous: HTMLElement | null, previousBeside: HTMLElement | null, sameRevision: boolean): { group: HTMLElement; beside: HTMLElement | null } {
    const group = previous?.dataset.sceneDocument === next.dataset.sceneDocument ? previous ?? next : next;
    const desired = [...next.querySelectorAll<HTMLElement>(':scope > [data-scene-view]')];
    const companion = previousBeside?.dataset.sceneDocument === next.dataset.sceneDocument && previousBeside
      ? previousBeside : el('div', 'authoring-scene-beside');
    companion.dataset.sceneDocument = next.dataset.sceneDocument;
    companion.dataset.sceneRevision = group.dataset.sceneRevision = next.dataset.sceneRevision;
    const old = new Map([...group.querySelectorAll<HTMLElement>(':scope > [data-scene-view]'),
      ...companion.querySelectorAll<HTMLElement>(':scope > [data-scene-view]')].map(pane => [pane.dataset.sceneView, pane]));
    for (const pane of old.values()) if (!desired.some(item => item.dataset.sceneView === pane.dataset.sceneView)) pane.remove();
    group.dataset.split = next.dataset.split ?? 'false';
    for (const [index, pane] of desired.entries()) {
      const existing = old.get(pane.dataset.sceneView), retained = sameRevision && existing && existing !== pane;
      const active = retained ? existing : pane;
      if (retained) {
        const selected = new Set([...pane.querySelectorAll<HTMLElement>('[data-statement-id].selected')].map(card => card.dataset.statementId));
        for (const card of existing.querySelectorAll<HTMLElement>('[data-statement-id]')) card.classList.toggle('selected', selected.has(card.dataset.statementId));
        const selectedEvent = pane.querySelector<HTMLElement>('.authoring-dialogue-marker[aria-pressed="true"]')?.dataset.eventId;
        for (const marker of existing.querySelectorAll<HTMLElement>('.authoring-dialogue-marker')) marker.ariaPressed = String(marker.dataset.eventId === selectedEvent);
        for (const selector of ['.authoring-pane-title', '[data-scene-baseline]', '.authoring-selection-tools']) {
          const prior = existing.querySelector(selector), replacement = pane.querySelector(selector);
          if (prior && replacement) {
            if (!prior.isEqualNode(replacement)) prior.replaceWith(replacement);
          }
          else if (prior) prior.remove();
          else if (replacement) existing.prepend(replacement);
        }
      } else {
        if (next.dataset.sceneDocument) this.retainWritingInputs(pane, next.dataset.sceneDocument);
        if (existing && existing !== pane) existing.replaceWith(pane);
      }
      const container = index === 0 ? group : companion;
      if (active.parentElement !== container) container.append(active);
    }
    return { group, beside: desired.length > 1 ? companion : null };
  }
  private mountDockStage(source: AuthoringSource): void {
    const createStage = (animation: boolean) => new MiniStage(this.services, snapshot => {
      const edit = this.effectEditor, preview = this.fieldPreview;
      const stageTarget = animation ? this.selectedSceneSource() : this.stageStatement(this.fixedStageSource ?? this.followedStageSource());
      for (const change of [edit ? { ...edit, value: edit.draft } : null, preview]) {
        if (!change || change.sceneId !== stageTarget?.sceneId || change.statementId !== stageTarget.statementId) continue;
        const instruction = snapshot.scenes.find(scene => scene.scene.id === change.sceneId)?.instructions.find(item => item.statementId === change.statementId);
        if (!instruction) continue;
        const args = structuredClone(instruction.args) as Record<string, Json>, parts = change.field.split('.');
        let target = args;
        for (const key of parts.slice(0, -1)) { target[key] ??= {}; target = target[key] as Record<string, Json>; }
        target[parts.at(-1)!] = structuredClone(change.value); instruction.args = args;
      }
    }, this.controller.preferences.locale, this.debugRouteIntent);
    this.miniStage ??= createStage(false);
    const region = this.stageRegion ??= el('section', 'authoring-stage-region');
    region.style.setProperty('--studio-stage-aspect', String(source.project.canvas.width / source.project.canvas.height));
    const controls = this.sourceControls('stage');
    const previous = region.querySelector(':scope > [data-source-panel="stage"]');
    if (previous) previous.replaceWith(controls); else region.prepend(controls);
    if (this.miniStage.root.parentElement !== region) region.append(this.miniStage.root);
    const animationMount = this.formDocuments.get(this.activeDocument)?.node.querySelector('.animation-stage-preview');
    if (animationMount) {
      this.animationMiniStage ??= createStage(true);
      if (this.animationMiniStage.root.parentElement !== animationMount) animationMount.append(this.animationMiniStage.root);
    } else if (this.animationMiniStage) {
      this.animationMiniStage.dispose();
      this.animationMiniStage = null;
    }
    this.updateMiniStage();
  }
  private updateMiniStage() {
    const source = this.controller.source;
    if (!source || !this.miniStage) return;
    const update = (stage: MiniStage, sourceTarget: SceneStageSource | null, pinned: boolean, animation = false) => {
      const chosen = this.stageStatement(sourceTarget);
      const pending = sourceTarget ? this.scriptDrafts.has(sourceTarget.sceneId) : false;
      const resolved = !pending && chosen ? this.resolveSceneSource(chosen) : null;
      const target = chosen && resolved ? { sceneId: chosen.sceneId, statementId: chosen.statementId, documentId: chosen.documentId,
        revision: resolved.scene.revision, ...(chosen.eventId ? { eventId: chosen.eventId } : {}) } : null;
      const edit = this.effectEditor;
      const locale = this.controller.preferences.locale;
      const message = pending ? tr(locale,'脚本正在编辑，移出编辑区后更新预览。','Editing script; leave the editor to update the preview.','スクリプト編集中。編集欄を離れるとプレビューを更新します。')
        : pinned && (!this.sceneForSource(sourceTarget) || sourceTarget?.statementId && !target) ? tr(locale, '固定舞台来源已失效。', 'The pinned stage source is unavailable.', '固定した舞台の出典を利用できません。')
        : !animation && !sourceTarget ? tr(locale, '打开场景文档以恢复舞台跟随。', 'Open a scene document to resume stage following.', 'シーン文書を開くと舞台の追従を再開します。') : undefined;
      stage.update(JSON.stringify([source.project.projectId, source.projectRevision, source.scenes.map(scene => [scene.sceneId, scene.revision]), source.characters.map(character=>character.afterstory), target, message, this.fieldPreview, edit && target?.sceneId === edit.sceneId && target.statementId === edit.statementId ? edit.draft : null]), target, message);
    };
    update(this.miniStage, this.fixedStageSource ?? this.followedStageSource(), Boolean(this.fixedStageSource));
    if (this.animationMiniStage) update(this.animationMiniStage, this.selectedSceneSource(), false, true);
  }
  private openCommandCenter(mode: CommandMode) {
    const locale = this.controller.preferences.locale, t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
    const source = this.controller.source, projectReason = source ? undefined : t('请先打开作品','Open a project first','作品を開いてください');
    const targetLabel = this.workbenchEditTargetLabel();
    const historyUnavailable = this.workbenchHistoryUnavailable();
    const commands: CommandEntry[] = [
      ...(this.retainedInput||this.recoveredForms.length?[{id:'recovered-input',label:t('查看保留输入','Review retained input','保持した入力を確認'),group:t('文档','Documents','文書'),run:()=>this.openRecoveredInput()}]:[]),
       ...([['save',this.t('save'),'Ctrl+S'],['saveAll',t('保存全部','Save all','すべて保存'),'Ctrl+Shift+S'],['undo',this.t('undo'),'Ctrl+Z'],['redo',this.t('redo'),'Ctrl+Shift+Z'],['preferences',t('工作台偏好','Workbench preferences','ワークスペース設定'),''],['publish',t('检查与发行','Check and publish','検証と公開'),''],['cards',this.t('cards'),''],['writing',this.t('writing'),''],['script',this.t('script'),'']] as const).map(([id,label,shortcut]) => ({id,label,shortcut,detail: ['save', 'undo', 'redo'].includes(id) ? targetLabel : undefined,group:t('应用命令','Application commands','アプリのコマンド'),disabled:id === 'preferences' ? undefined : projectReason ?? (id === 'undo' || id === 'redo' ? historyUnavailable : undefined),run:()=>this.shellAction(id)})),
      {id:'project-settings',label:t('作品设置','Project settings','作品設定'),group:t('应用命令','Application commands','アプリのコマンド'),disabled:projectReason,run:()=>this.openDocument({kind:'project',title:t('作品设置','Project settings','作品設定')})},
       {id:'startup-home',label:t('启动与主页','Startup & home','起動とホーム'),disabled:projectReason,run:()=>this.openDocument({kind:'startup'}),group:t('工作面','Workspaces','作業スペース')},
       {id:'project-center',label:t('项目中心','Project center','作品センター'),run:()=>this.navigate('projects'),group:t('工作面','Workspaces','作業スペース')},
       {id:'project-maintenance',label:t('作品维护','Project maintenance','作品メンテナンス'),disabled:projectReason,run:()=>this.navigate('maintenance'),group:t('工作面','Workspaces','作業スペース')},
       {id:'connections',label:t('连接','Connections','接続'),disabled:projectReason,run:()=>this.navigate('connections'),group:t('工作面','Workspaces','作業スペース')},
       {id:'plugins',label:t('插件','Plugins','プラグイン'),disabled:projectReason,run:()=>this.navigate('plugins'),group:t('工作面','Workspaces','作業スペース')},
       {id:'collaboration',label:t('协作活动','Collaboration activity','連携アクティビティ'),disabled:projectReason,run:()=>this.navigate('collaboration'),group:t('工作面','Workspaces','作業スペース')},
       {id:'show-output',label:t('显示输出','Show output','出力を表示'),disabled:projectReason,run:()=>{this.dock.current?.open(authoringDockTools.output);},group:t('工作面','Workspaces','作業スペース')},
       {id:'show-problems',label:t('显示问题','Show problems','問題を表示'),disabled:projectReason,run:()=>{this.dock.current?.open(authoringDockTools.problems);},group:t('工作面','Workspaces','作業スペース')},
      {id:'new-production',label:t('新建制作','New production','新しい制作'),group:t('制作','Production','制作'),disabled:projectReason,run:async()=>{if(await this.openProductionWorkbench(true))await this.production?.startQuick('script');}},
      {id:'produce-dialogue',label:t('为所选对白制作配音','Produce voice for selected dialogue','選択した台詞の音声を制作'),group:t('制作','Production','制作'),disabled:projectReason ?? (this.page === 'editor' && this.controller.selection?.statementIds.length ? undefined : t('请先选择对白','Select dialogue first','先に台詞を選択')),run:()=>this.createWithAi('voice')},
      ...(['entry','scene','statement'] as const).map((from,index)=>({id:`playtest-${from}`,label:[t('从头试玩','Playtest from start','最初から試遊'),t('从当前场景试玩','Playtest this scene','現在の場面から試遊'),t('从此句试玩','Playtest from here','この文から試遊')][index]!,group:t('试玩','Playtest','試遊'),disabled:projectReason??(this.page!=='editor'||this.documents.find(d=>d.id===this.activeDocument)?.kind!=='scene'?t('请打开场景文档','Open a scene document','場面の文書を開いてください'):from==='statement'&&!this.controller.selection?.primaryId?t('请先选择语句','Select a statement first','文を選択してください'):undefined),run:()=>this.runPlaytest(from)})),
      {id:'delete-assets',label:t('删除所选素材','Delete selected assets','選択した素材を削除'),group:t('素材','Assets','素材'),disabled:!this.selectedAssets.size?t('请先选择素材','Select assets first','素材を選択してください'):undefined,run:()=>this.removeSelected()},
      ...([-1,1] as const).map(direction=>({id:`move-tab-${direction}`,label:direction<0?t('文档标签向左移动','Move document tab left','文書タブを左へ'):t('文档标签向右移动','Move document tab right','文書タブを右へ'),group:t('文档','Documents','文書'),disabled:!this.activeDocument||this.documents.findIndex(d=>d.id===this.activeDocument)+direction<0||this.documents.findIndex(d=>d.id===this.activeDocument)+direction>=this.documents.length?t('已在边缘或没有文档','No document or already at the edge','文書がないか端にあります'):undefined,run:()=>{const ids=this.documents.map(d=>d.id),at=ids.indexOf(this.activeDocument);[ids[at],ids[at+direction]]=[ids[at+direction]!,ids[at]!];this.shellProps?.reorder(ids);}})),
      ...(this.studioPlugins?.tools('commands.palette') ?? []).map(entry=>({id:`plugin:${entry.pluginId}:${entry.tool.key}`,label:entry.title,group:t('插件命令','Plugin commands','拡張コマンド'),detail:entry.pluginId,disabled:entry.available?undefined:entry.reason,run:()=>this.studioPlugins?.openPublicTool(entry.pluginId,entry.tool.key)})),
    ];
    showCommandCenter({mode,locale,anchor:this.root.querySelector<HTMLElement>('.shell-command-center'),error:reason=>{this.message=String(reason);this.messageTone='error';this.render();},load:async(query,kind)=>{
      const match=(items:CommandEntry[])=>items.filter(item=>`${item.label} ${item.group} ${item.detail??''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      if(kind==='commands')return match(commands); if(!source)return [];
      const objects:CommandEntry[]=[
        ...source.scenes.map(scene=>({id:`scene:${scene.sceneId}`,label:scene.name,group:t('场景','Scenes','場面'),run:()=>this.openDocument({kind:'scene',objectId:scene.sceneId})})),
        ...source.characters.map(character=>({id:`character:${character.id}`,label:character.name,group:t('角色','Characters','キャラクター'),run:()=>this.openDocument({kind:'character',objectId:character.id,title:character.name})})),
      ];
      const [assets,docs,drafts]=await Promise.all([this.services.queryAssets({kind:null,text:query,offset:0,limit:100}),this.services.bridge.documents.list(),workbenchBridge(this.services.bridge).production.overview()]);
      if(assets.ok)objects.push(...assets.value.items.map(asset=>({id:`asset:${asset.id}`,label:asset.name,group:t('素材','Assets','素材'),run:()=>this.previewAsset(asset.id,this.assetPreviewVersions.get(asset.id)??asset.activeVariantId)})));
      if(docs.ok){const template=readTemplateDocuments(docs.value);objects.push(...template.pages.map(page=>({id:`page:${page.key}`,label:template.locales[locale]?.[`page.${page.key}`]??page.key,group:t('页面','Pages','ページ'),run:()=>this.openDocument({kind:'page',objectId:page.key,title:template.locales[locale]?.[`page.${page.key}`]??page.key})})));}
      if(drafts.ok)objects.push(...drafts.value.drafts.map(draft=>({id:`draft:${draft.id}`,label:draft.name??t('制作草稿','Production draft','制作下書き'),group:t('制作草稿','Production drafts','制作下書き'),run:async()=>{if(!await this.openProductionWorkbench())return;const session=this.production!;await session.refresh();if(session===this.production)await session.openDraft(draft.id);}})));
      return match(objects).sort((a,b)=>(this.recentObjects.includes(a.id)?this.recentObjects.indexOf(a.id):Infinity)-(this.recentObjects.includes(b.id)?this.recentObjects.indexOf(b.id):Infinity)).map(item=>({...item,run:async()=>{await item.run();this.recentObjects=[item.id,...this.recentObjects.filter(id=>id!==item.id)].slice(0,50);}}));
    }});
  }
  private async shellAction(action: ShellAction): Promise<void> {
    if (action === 'quickOpen' || action === 'commands') { this.openCommandCenter(action === 'commands' ? 'commands' : 'objects'); return; }
    if (action === 'closeProject') {
      if (!this.sessionId || !this.controller.source) return;
      const choice = await this.choiceForClose('closeProject'); if (choice === 'cancel') return;
      if (!this.notice(await this.services.closeProject(this.sessionId, choice))) return;
      const cleared = await this.controller.setPreference(({ resumeProject: _resumeProject, ...prefs }) => prefs);
      if (!cleared.ok) this.notice(cleared);
      this.sessionId = null; this.controller.close(); this.scriptDrafts.clear(); this.writingDrafts.clear();
      await this.projectChanged(); return;
    }
    if (action === 'projects' || action === 'publish') return this.navigate(action);
    if (action === 'projectSettings') return this.openDocument({ kind: 'project' });
    if (action === 'startupHome') return this.openDocument({ kind: 'startup' });
    if (action === 'save' || action === 'saveAll') return this.save(action === 'saveAll');
    if (action === 'undo' || action === 'redo') {
      const historyUnavailable = this.workbenchHistoryUnavailable();
      if (historyUnavailable) { studioToasts.add({ title: historyUnavailable }); return; }
      const inspectorScene = this.fixedInspectorEditScene();
      if (!await (inspectorScene && inspectorScene.documentId !== this.controller.scene?.documentId
        ? this.flushSceneScriptDraft(inspectorScene.sceneId) : this.flushScript())) return;
      if (!inspectorScene && this.page === 'publish' && this.publishHistory?.(action)) return;
      if (!inspectorScene && this.page === 'pages' && this.designer && this.activeDocument !== 'startup' && !this.formDocuments.get(this.activeDocument)?.scope) { await this.designer.history(action); return; }
      const scope = inspectorScene ? { documentId: inspectorScene.documentId } : await this.activeHistoryScope();
      if (!scope) return;
      const result = await this.controller[action](scope);
      if (!result.ok && result.error.code === 'HISTORY_CANCELLED') return;
      if (!result.ok && ['NOTHING_TO_UNDO','NOTHING_TO_REDO'].includes(result.error.code)) {
        studioToasts.add({title: tr(this.controller.preferences.locale,action === 'undo' ? '当前范围没有可撤销的修改' : '当前范围没有可恢复的修改',action === 'undo' ? 'No changes to undo in this scope' : 'No changes to redo in this scope',action === 'undo' ? 'この範囲に元に戻す変更はありません' : 'この範囲にやり直す変更はありません')}); return;
      }
      if (this.notice(result)) {
        if (!inspectorScene && this.activeDocument.startsWith('character:') && this.characterSelected)
          this.characterHistory.set(this.characterSelected, { canUndo: action === 'redo', canRedo: action === 'undo' });
        if (this.page === 'assets' || this.focusedWorkbenchTool === authoringDockTools.assetInspector || this.assetPage?.indexRevision !== this.controller.source?.assetIndexRevision) await this.showAssets(); else this.render();
        studioToasts.add({title: `${this.t(action)}：${this.controller.historyLabel}`});
      }
      return;
    }
    if (!await this.flushScript()) return;
    if (action === 'preferences') return this.openDocument({kind:'project',id:'workbench-settings',objectId:'preferences',title:tr(this.controller.preferences.locale,'工作台偏好','Workbench preferences','ワークスペース設定')});
    if (action === 'resetLayout') { this.dock.current?.preset('balanced'); return; }
    this.chooseSceneView(action); await this.navigate('editor');
  }
  private async activeHistoryScope(): Promise<{ documentId: Id; paths?: string[] } | null> {
    const source = this.controller.source;
    if (!source || this.assetEditTarget()) return null;
    const form = this.formDocuments.get(this.activeDocument)?.scope;
    if (form) return form;
    if (this.page === 'publish') return { documentId: source.projectDocumentId, paths: PublishHistoryPaths };
    if (this.activeDocument === 'startup') return { documentId: source.projectDocumentId, paths: ['/data/display'] };
    if (this.activeDocument === 'project') return { documentId: source.projectDocumentId, paths: ['/data/player/autosave', '/data/player/name', '/data/languages'] };
    if (this.activeDocument === 'characters' || this.activeDocument.startsWith('character:')) {
      const selected = this.documents.find(document => document.id === this.activeDocument)?.objectId ?? this.characterSelected;
      const known = selected && this.characterDocumentIds.get(selected);
      if (known) return { documentId: known };
      const listed = await this.services.bridge.documents.list();
      const document = listed.ok ? listed.value.find(item => selected && `characters/${selected}.json` in item.files) : null;
      return document ? { documentId: document.documentId } : null;
    }
    const scene = this.followedScene();
    if (scene) return { documentId: scene.documentId };
    return null;
  }
  private pageWorkbenchProps(): Pick<AuthoringWorkbenchProps, 'pageNodes' | 'pageKey' | 'pageOutline' | 'componentNodes'> {
    const designer = this.designer;
    if (!designer || designer.hasWorkbenchPage('title') === null) return {};
    const pageKey = this.activeDocument.startsWith('page:') ? this.activeDocument.slice(5) : undefined;
    const pageOutline = pageKey && this.page === 'pages' ? designer.workbenchOutline(pageKey) : undefined;
    return { pageNodes: designer.workbenchPages(), pageKey, pageOutline, componentNodes: pageOutline ? designer.workbenchComponents() : undefined };
  }
  private refreshDesignerWorkbench(): void {
    if (!this.designer || !this.shellProps) return;
    this.documents = this.documents.map(document => {
      if (document.kind !== 'page') return document;
      const dirty = this.designer!.workbenchDirty(document.objectId ?? '');
      const title = this.designer!.workbenchPages().find(page => page.id === document.objectId)?.name ?? document.title;
      return { ...document, title, dirty, preview: dirty ? false : document.preview };
    });
    this.shellProps = { ...this.shellProps, source: this.controller.source, documents: this.documents,
      ...this.pageWorkbenchProps() };
    this.rememberWorkbench();
    this.refreshDocumentTabs(); this.updateStatus();
  }
  private ask(title: string, initialValue = '', multiline = false) {
    return requestDialog({ title, initialValue, multiline, input: true, locale: this.controller.preferences.locale });
  }
  private async confirm(description: string, destructive = false) {
    return (await requestDialog({ title: tr(this.controller.preferences.locale, '确认操作范围', 'Confirm scope', '操作範囲を確認'), description,
      destructive, locale: this.controller.preferences.locale })) !== null;
  }
  private confirmAction(title: string, description: string, label: string, action: () => Promise<void>): Promise<boolean> {
    return new Promise(resolve => {
      let applied = false;
      this.documentConfirm = { title, description, close: () => { this.documentConfirm = null; this.render(); resolve(applied); }, actions: [{ label, tone: 'danger', run: async () => { await action(); applied = true; } }] };
      this.render();
    });
  }
  private endingDestination(value: unknown): string {
    const target = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const locale = this.controller.preferences.locale;
    if (target.kind === 'scene') return `${enumLabel('scene', locale)} · ${this.displayParameter(target.sceneId)}`;
    if (target.kind === 'page') return `${enumLabel('page', locale)} · ${this.displayParameter(target.pageId)}`;
    return enumLabel('title', locale, 'end');
  }
  private animationSummary(args: Record<string, unknown>, stopping = false): string {
    const original = stopping ? this.controller.source?.scenes.flatMap(scene => parse({documentId:scene.documentId,revision:scene.revision,text:scene.text}).cst).find(node => ['setAnimation','setComplexAnimation'].includes(node.command) && (node.object?.value as Record<string,unknown>)?.animationId === args.animationId)?.object?.value as Record<string,unknown> | undefined : args;
    const target = (original?.target ?? args.target) as {kind?:string;id?:string;station?:string}|undefined;
    const name = target?.kind === 'stage' ? tr(this.controller.preferences.locale,'整台舞台','Stage','舞台全体') : target?.kind === 'object' ? this.references().find(item=>item.kind==='object'&&item.id===target.id)?.name ?? tr(this.controller.preferences.locale,'目标待设置','Choose target','対象未設定') : enumLabel(target?.station??'',this.controller.preferences.locale);
    const material = original?.resourceId ? this.assetCache.get(String(original.resourceId))?.name ?? tr(this.controller.preferences.locale,'动画素材缺失','Missing animation asset','アニメーション素材なし') : tr(this.controller.preferences.locale,'此处编辑的动画','Inline animation','この指令のアニメーション');
    const duration = (original?.animation as {durationMs?:number}|undefined)?.durationMs;
    return [name,material,...(!stopping&&duration!==undefined?[`${duration} ms`]:[]),...(!stopping&&original?.loop?[tr(this.controller.preferences.locale,'循环','Loop','ループ')]:[])].filter(Boolean).join(' · ');
  }
  private displayParameter(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (Array.isArray(value)) return value.map(item => this.displayParameter(item)).join(' / ');
    if (typeof value === 'object') {
      const item = value as Record<string, unknown>;
      if (typeof item.text === 'string') return item.text;
      return Object.entries(item).slice(0, 3).map(([key, value]) => `${fieldNames[key]?.[this.controller.preferences.locale === 'en' ? 1 : this.controller.preferences.locale === 'ja' ? 2 : 0] ?? key} ${key==='op'?enumLabel(String(value),this.controller.preferences.locale):this.displayParameter(value)}`).join(' · ');
    }
    const raw=String(value);return this.assetCache.get(raw)?.name ?? this.controller.source?.characters.find(c=>c.id===raw)?.name ?? this.controller.source?.scenes.find(scene=>scene.sceneId===raw)?.name ?? this.controller.source?.variables?.find(variable=>variable.id===raw)?.name ?? this.references().find(reference=>reference.id===raw)?.name ?? raw;
  }
  private updateStatus() {
    const bar=this.root.querySelector('#studio-status');if(!bar)return;const locale=this.controller.preferences.locale;
    const status=this.controller.status, dirty=status.dirty || this.writingDrafts.size > 0;
    bar.replaceChildren(el('span',dirty?'authoring-dirty':'',status.save==='failed'?this.t('failed'):dirty?this.t('dirty'):this.t('saved')),
      el('span','authoring-spacer'),el('span','',tr(locale,'预览','Preview','プレビュー')+' · '+({none:tr(locale,'未打开','Not open','未表示'),synced:tr(locale,'已同步','Synced','同期済み'),updateAvailable:tr(locale,'有更新可用','Update available','更新あり'),restartRequired:tr(locale,'需重启','Restart required','再起動が必要'),lastValid:tr(locale,'上次有效版本','Last valid version','前回の有効版')}[status.preview])),el('span','','Web / Windows'));
  }
  private ensureProductionSession(): ProductionSession | null {
    const source = this.controller.source;
    if (!source) return null;
    if (!this.production) {
      this.production = new ProductionSession(workbenchBridge(this.services.bridge), source.project.projectId, () => this.controller.preferences.locale);
      this.production.restoreRecord(this.productionDirectoryState.record);
    }
    if (this.productionGuiResume) {
      const resume = this.productionGuiResume;
      this.production.guiDraft = resume.gui;
      this.production.connectionGuiDraft = resume.connection ? { ...resume.connection, secret: '' } : null;
      this.production.workflowGuiDraft = resume.workflow ?? null;
      this.production.candidateText = new Map(resume.candidateText);
      this.productionGuiResume = null;
    }
    return this.production;
  }
  private async openProductionWorkbench(captureOrigin = false): Promise<boolean> {
    const session = this.ensureProductionSession();
    if (!session) return false;
    if (this.activeDocument === productionDocumentId) return true;
    const locale = this.controller.preferences.locale;
    const origin = { page: this.page, sceneId: this.controller.scene?.sceneId ?? null,
      statementId: this.controller.selection?.primaryId ?? null, pageIds: [], componentIds: [] };
    await this.openDocument({ id: productionDocumentId, kind: 'route', objectId: 'production', title: tr(locale, '制作', 'Production', '制作') });
    if (this.activeDocument !== productionDocumentId || session !== this.production) return false;
    if (captureOrigin && !session.draft) session.origin = origin;
    return true;
  }
  async navigate(page:Page) {
    if (page === 'assets') return this.openAssetWorkspace();
    if (page === 'production' || page === 'assistant') { await this.openProductionWorkbench(true); return; }
    if (page === 'editor' && this.controller.source) {
      const scene = this.controller.scene ?? this.controller.source.scenes[0];
      if (scene) { await this.openDocument({ kind: 'scene', objectId: scene.sceneId }); return; }
      this.activeDocument = 'empty';
    }
    if (page === 'maintenance' && this.controller.engineIssue) await this.flushInputDrafts();
    else if (!await this.flushScript()) return;
    if (page === 'projects' && this.page !== 'projects' && this.controller.source) this.projectCenterOrigin = this.activeDocument;
    this.rememberScene(); this.activeDocument = this.formDocuments.has(this.activeDocument) ? '' : this.activeDocument;
    if (!await this.flushProductionDraft()) return;
    await this.controller.flushResume();
    if(page!=='projects'&&!this.controller.source)return;
    if (page !== 'pages') this.designer?.stopBehaviorPreview();
    this.page=page;this.render();
    if (page === 'pages') this.dock.current?.openCombination([authoringDockTools.pageDirectory, authoringDockTools.pageOutline]);
  }
  private async returnToConnectionTask(): Promise<void> {
    const origin = this.connectionOrigin;
    if (!origin || !await this.openProductionWorkbench()) return;
    const session = this.production;
    if (!session) return;
    if (session.selectedRecord?.kind !== origin.kind || session.selectedRecord.id !== origin.id) {
      if (origin.kind === 'task') await session.openTask(origin.id);
      else await session.openDraft(origin.id);
    }
    this.dock.current?.focusView(productionDocumentId);
  }
  private async openPageUiAssets(scope: { pageIds: string[]; componentIds: string[] }) {
    const session = this.ensureProductionSession();
    if (!session) return;
    await session.startQuick('ui-assets', scope);
    if (session === this.production) await this.openProductionWorkbench();
  }
  private async openFigureProduction(reference: { assetId: Id; variantId: Id }, characterId?: Id, differenceId?: Id) {
    const session = this.ensureProductionSession();
    if (!session) return;
    try {
      await session.startQuick('difference', {
        reference, characterId,
        origin: characterId ? { page: 'characters', characterId, differenceId } : { page: 'assets', asset: reference },
      });
      if (session === this.production) await this.openProductionWorkbench();
    } catch (reason) {
      this.message = String(reason);
      this.messageTone = 'warning';
      this.render();
    }
  }
  private async returnToProductionOrigin(origin: import('@galcraft/authoring/production/draft').ProductionOrigin) {
    const source = this.controller.source;
    if (!source) return;
    const unavailable = () => { throw new Error(tr(this.controller.preferences.locale,
      '原制作对象已失效。制作记录与候选仍可继续查看。', 'The original object is unavailable. The production record and candidates are still available.', '元の対象を利用できません。制作履歴と候補は引き続き確認できます。')); };
    if (origin.characterId) {
      const character = source.characters.find(item => item.id === origin.characterId);
      if (!character || origin.differenceId && !character.differences?.some(item => item.id === origin.differenceId)) return unavailable();
      this.requestCharacterSection(character.id, 'figures', origin.differenceId);
      await this.openDocument({ kind: 'character', objectId: character.id, title: character.name });
      this.dock.current?.activate(`character:${character.id}`);
    } else if (origin.asset) {
      const asset = await this.services.getAsset?.(origin.asset.assetId);
      if (!asset?.ok || !asset.value?.variants.some(item => item.id === origin.asset!.variantId)) return unavailable();
      await this.previewAsset(origin.asset.assetId, origin.asset.variantId);
      this.dock.current?.activate(`asset:${origin.asset.assetId}`);
    } else if (origin.pageIds[0]) {
      const page = this.production?.data.pages.find(item => item.id === origin.pageIds[0]);
      if (!page || this.designer?.hasWorkbenchPage(page.key) === false ||
        page.components && origin.componentIds.some(id => !page.components!.some(item => item.id === id))) return unavailable();
      await this.openDocument({ kind: 'page', objectId: page.key });
      const designer = this.designer;
      if (!designer) return unavailable();
      await designer.openPage(page.key);
      if (designer !== this.designer || this.activeDocument !== `page:${page.key}`) return;
      designer.selectComponents(origin.componentIds);
      this.refreshDesignerWorkbench();
      this.dock.current?.activate(`page:${page.key}`);
    } else if (origin.sceneId) {
      const scene = source.scenes.find(item => item.sceneId === origin.sceneId);
      if (!scene || origin.statementId && !parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).cst.some(item => item.id === origin.statementId)) return unavailable();
      await this.openDocument({ kind: 'scene', objectId: scene.sceneId });
      this.dock.current?.activate(`scene:${scene.sceneId}`);
      if (origin.statementId) {
        this.controller.select(origin.statementIds?.length ? origin.statementIds : [origin.statementId], origin.statementId);
        this.render();
      }
    } else await this.navigate(origin.page as Page);
  }
  private async createWithAi(intent: 'script' | 'stage' | 'voice') {
    if (!await this.flushScript() || !this.controller.source) return;
    const session = this.ensureProductionSession()!;
    const scene = this.controller.scene, selection = this.controller.selection;
    const voiceIds = intent === 'voice' && scene ? parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).cst
      .flatMap(node => node.id && node.command === 'say' && selection?.statementIds.includes(node.id) ? [node.id] : []) : null;
    if (intent === 'voice' && !voiceIds?.length) throw new Error(tr(this.controller.preferences.locale, '请选择要制作配音的对白。', 'Select the dialogue you want to voice.', '音声を制作する台詞を選択してください。'));
    await session.startQuick(intent, { sceneId: scene?.sceneId, statementId: voiceIds?.[0] ?? selection?.primaryId,
      statementIds: voiceIds ?? selection?.statementIds, textRange: selection?.textRange });
    if (session === this.production) await this.openProductionWorkbench();
  }
  private async createAnimationWithAi(request: import('@galcraft/contracts').AnimationGenerationRequest, scope: { sceneId?: string; statementId?: string | null } = {}) {
    if (!await this.flushScript() || !this.controller.source) return;
    AnimationGenerationRequestSchema.parse(request);
    this.ensureProductionSession();
    if (!this.production) return;
    await this.production.refresh();
    const operations = this.production.data.operations?.filter(operation => operation.definition.outputs.some(output => output.type === 'animation' && output.typeVersion === 1) && operation.definition.connection?.purpose === 'text') ?? [];
    if (operations.length !== 1) throw new Error(tr(this.controller.preferences.locale, operations.length ? '请在制作工位选择要使用的动画操作。' : '请先为此作品启用 GCA 动画制作插件。', operations.length ? 'Choose an animation operation in Production.' : 'Enable the GCA animation production plugin for this project.', operations.length ? '制作画面でアニメーション操作を選択してください。' : '作品で GCA アニメーション制作プラグインを有効にしてください。'));
    await this.production.openOperation(operations[0]!);
    const origin = { page: 'editor', sceneId: scope.sceneId ?? null, statementId: scope.statementId ?? null, pageIds: [], componentIds: [] };
    this.production.origin = origin;
    this.production.draft!.origin = origin;
    const target = this.production.variant!.target;
    this.production.update({ fields: request as unknown as Record<string, Json>, target: { ...target, sceneId: scope.sceneId ?? null, statementId: scope.statementId ?? null },
      sourceVersions: request.assetId && this.controller.source.assetIndexDocumentId ? [{ ref: { kind: 'document', id: this.controller.source.assetIndexDocumentId }, revision: this.controller.source.assetIndexRevision ?? 0 }] : [] });
    await this.production.saveDraft(true);
    await this.openProductionWorkbench();
  }
  private async preference(update: (value: StudioPreferences) => StudioPreferences): Promise<void> {
    const result = await this.controller.setPreference(update); if (this.notice(result)) this.render();
  }
  private framingSize(args: Record<string, unknown>): {sourceHeight:number;canvasHeight:number} | null {
    const asset=this.assetCache.get(String(args.assetId)), variant=asset?.variants.find(item=>item.id===asset.activeVariantId);
    const sourceHeight=variant?.canvas?.height ?? variant?.metadata.height;
    return sourceHeight && sourceHeight>0 && this.controller.source ? {sourceHeight,canvasHeight:this.controller.source.project.canvas.height} : null;
  }
  private async loadThumbnails(generation: number): Promise<void> {
    this.thumbnailsActive = true;
    const resolved = await loadVisibleAssetThumbnails(this.services);
    if (generation !== this.thumbnailGeneration) return;
    if (!resolved.ok) { this.message = resolved.error.message; return; }
  }
  private async moveCards(ids: Id[], beforeId: Id | null, focusId: Id | null = null): Promise<void> {
    const before = new Map([...this.root.querySelectorAll<HTMLElement>('.authoring-card[data-statement-id]')]
      .map(card => [card.dataset.statementId!, card.getBoundingClientRect()]));
    const result = await this.controller.moveStatements(ids, beforeId);
    if (!this.notice(result)) return;
    this.render();
    if (focusId) this.root.querySelector<HTMLButtonElement>(`[data-statement-id="${CSS.escape(focusId)}"] .authoring-grip`)?.focus({ preventScroll: true });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const card of this.root.querySelectorAll<HTMLElement>('.authoring-card[data-statement-id]')) {
      const old = before.get(card.dataset.statementId!); if (!old) continue;
      const next = card.getBoundingClientRect();
      if (old.top !== next.top || old.left !== next.left) card.animate([
        { transform: `translate(${old.left - next.left}px, ${old.top - next.top}px)` },
        { transform: 'translate(0, 0)' },
      ], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
      if (ids.includes(card.dataset.statementId!)) card.animate([
        { boxShadow: '0 0 0 3px var(--accent)' }, { boxShadow: '0 0 0 3px var(--accent)', offset: .45 },
        { boxShadow: '0 0 0 0 transparent' },
      ], { duration: 1100, easing: 'ease-out' });
    }
  }
  private projects(): HTMLElement {
    this.projectsRoot ??= createRoot(this.projectsNode);
    this.projectsRoot.render(createElement(Projects, {
      onUnappliedChange: this.setProjectCreateUnapplied,
      locale: this.controller.preferences.locale, source: this.controller.source,
      recovery: { pending: this.recoveryPending, review: () => { void this.reviewRecovery(); } },
      openSettings: () => { void this.openDocument({ kind: 'project' }); },
      openMaintenance: () => { void this.navigate('maintenance'); },
      continueAuthoring: () => {
        const origin = this.documents.find(item => item.id === this.projectCenterOrigin);
        if (origin) void this.openDocument(origin);
        else void this.navigate('editor');
      },
      draft: this.projectDraft, updateDraft: draft => { this.projectDraft = draft; this.persistInputDraft(); },
      listCreationVersions: async (): Promise<Result<string[]>> => this.services.bridge.engines ? this.services.bridge.engines.listCreationVersions() : { ok: true, value: [], warnings: [] },
      navigate: page => { void this.navigate(page); },
      library: this.services.bridge.projects,
      restoreBridge: this.services.bridge,
      openRestored: async directory => this.switchProject(directory),
      openRecent: async directory => { await this.switchProject(directory); },
      open: async () => {
        const chosen = await this.services.chooseDirectory(); if (!this.notice(chosen) || !chosen.value) return;
        await this.switchProject(chosen.value);
      },
      reveal: async () => {
        if (!this.controller.source) return;
        this.notice(await this.services.revealEntity({ kind: 'project', id: this.controller.source.project.projectId }));
      },
      copy: async directory => {
        if (directory && !await this.switchProject(directory)) return;
        if (!this.services.copyProject || !await this.flushScript()) return;
        if (this.controller.source?.anyDirty || this.controller.status.dirty) { await this.save(true); if (this.controller.status.dirty || this.controller.source?.anyDirty) return; }
        const copied = await this.services.copyProject(); if (!this.notice(copied)) return;
        await this.switchProject(copied.value.directory);
      },
      backup: async directory => {
        if (directory && !await this.switchProject(directory)) return;
        if (!this.controller.source || !await this.flushScript()) return;
        if (this.controller.source.anyDirty || this.controller.status.dirty) { await this.save(true); if (this.controller.status.dirty || this.controller.source.anyDirty) return; }
        const backedUp = await this.services.bridge.projects.backup();
        if (this.notice(backedUp) && backedUp.value) {
          this.message = tr(this.controller.preferences.locale, '备份已保存：', 'Backup saved: ', 'バックアップを保存しました：') + backedUp.value.directory;
          this.messageTone = 'info'; this.render();
        }
      },
      create: async draft => {
        const chosen = await this.services.chooseDirectory(); if (!this.notice(chosen) || !chosen.value || !this.services.createProject) return false;
        const closeChoice = await this.choiceForClose('switchProject', true); if (closeChoice === 'cancel') return false;
        const result = await this.services.createProject({ ...draft, path: chosen.value, closeChoice });
        if (!this.notice(result)) return false;
        return this.openedProject(result.value.sessionId);
      },
    }));
    return this.projectsNode;
  }
  private async showCharacters(): Promise<void> {
    await this.openDocument({ kind: 'characters', title: '角色与路线' });
  }
  private projectDocument(): HTMLElement {
    const source=this.controller.source;if(!source)return this.projectNode;
    const locale=this.controller.preferences.locale;
    this.projectGeneral.replaceChildren(el('h1','',tr(locale,'作品设置','Project settings','作品設定')),el('h2','',source.project.name));
    this.projectGeneral.append(button(tr(locale,'作品资料与玩家选项','Project details and player options','作品情報とプレイヤー設定'),()=>this.openProjectSettings()));
    this.projectGeneral.append(button(tr(locale,'结构与变量','Structure and variables','構成と変数'),()=>this.openStoryStructure()));
    const hadEditor=!!this.playerNameEditor;
    this.playerNameEditor??=createPlayerNameEditor(this.controller,()=>this.render(),dirty=>{this.documents=this.documents.map(document=>document.id==='project'?{...document,dirty:dirty||!!this.controller.source?.projectDirty}:document);this.refreshDocumentTabs();},()=>{void this.openDocument({kind:'characters',title:tr(locale,'角色与路线','Characters & routes','キャラクターとルート')});},this.playerNameGuiDraft);
    if(hadEditor)this.playerNameEditor?.refresh();
    if(!this.projectNode.contains(this.projectGeneral))this.projectNode.append(this.projectGeneral);
    if(this.playerNameEditor&&!this.projectNode.contains(this.playerNameEditor.root))this.projectNode.append(this.playerNameEditor.root);
    this.languageRoot ??= createRoot(this.languageNode);
    this.languageRoot.render(createElement(ProjectLanguageEditor, { guiDraft:this.languageGuiDraft,onGuiDraftChange:this.captureLanguageGui,ref: this.languageEditor, value: source.project.languages, locale,
      apply: async languages => { const result=await this.controller.setLanguages(languages); if(!result.ok)throw new Error(issueText(result.error,locale)); this.render(); },
      pendingChanged: dirty => { this.documents=this.documents.map(document=>document.id==='project'?{...document,dirty:dirty||!!this.playerNameEditor?.dirty||!!this.controller.source?.projectDirty}:document); this.refreshDocumentTabs(); } }));
    if(!this.projectNode.contains(this.languageNode))this.projectNode.append(this.languageNode);
    return this.projectNode;
  }
  private async openProjectSettings(resume?:import('./ProjectSettingsEditor.js').ProjectSettingsGuiDraft): Promise<void> {
    if (!this.inputDraftRestoring&&!await this.flushScript()) return;
    const id='project-details',existing=this.documents.find(document=>document.id===id);
    if(existing){await this.openDocument(existing);return;}
    const listed=await this.services.bridge.documents.list();if(!listed.ok){this.notice(listed);return;}
    const node=el('section'),root=createRoot(node);let pending=false,draft=resume;
    root.render(createElement(ProjectSettingsEditor,{documents:listed.value,locale:this.controller.preferences.locale,guiDraft:resume,onGuiDraftChange:value=>{draft=value;this.persistInputDraft();},
      read:()=>this.services.bridge.documents.list(),apply:async(operation,baseline)=>{const result=await this.controller.authorOperation(operation,baseline);if(result.ok)this.render();return result;},
      pendingChanged:value=>{pending=value;this.documents=this.documents.map(document=>document.id===id?{...document,dirty:value}:document);this.refreshDocumentTabs();}}));
    this.openFormDocument(id,tr(this.controller.preferences.locale,'作品资料与玩家选项','Project details and player options','作品情報とプレイヤー設定'),node,()=>pending,()=>root.unmount());
    this.formDocuments.get(id)!.capture=()=>asJson({kind:'projectSettings',draft});
  }
  private async openStoryStructure(resume?:import('./StoryStructureEditor.js').StoryStructureGuiDraft): Promise<void> {
    if (!this.inputDraftRestoring&&!await this.flushScript()) return;
    const id = 'story-structure', existing = this.documents.find(document => document.id === id);
    if (existing) { await this.openDocument(existing); return; }
    const listed = await this.services.bridge.documents.list(); if (!listed.ok) { this.notice(listed); return; }
    const node = el('section'), root = createRoot(node); let pending = false,draft=resume;
    root.render(createElement(StoryStructureEditor, { documents: listed.value, locale: this.controller.preferences.locale,guiDraft:resume,onGuiDraftChange:value=>{draft=value;this.persistInputDraft();},
      read: () => this.services.bridge.documents.list(), apply: async (operation, baseline, resolution) => { const result = await this.controller.authorOperation(operation, baseline,resolution); if (result.ok) this.render(); return result; },
      pendingChanged: value => { pending = value; this.documents = this.documents.map(document=>document.id===id?{...document,dirty:value}:document); this.refreshDocumentTabs(); } }));
    this.openFormDocument(id, tr(this.controller.preferences.locale,'结构与变量','Structure and variables','構成と変数'), node, ()=>pending, ()=>root.unmount());
    this.formDocuments.get(id)!.capture=()=>asJson({kind:'storyStructure',draft});
  }
  private renderCharacterDirectory(): void {
    const source = this.controller.source;
    if (!source) return;
    for (const [id, document] of Object.entries(source.characterDocuments ?? {})) this.characterDocumentIds.set(id, document.documentId);
    this.characterDirectoryRoot ??= createRoot(this.characterDirectoryNode);
    this.characterDirectoryRoot.render(createElement(CharacterDirectory, {
      characters: source.characters, locale: this.controller.preferences.locale,
      selectedId: this.activeDocument.startsWith('character:') ? this.characterSelected : undefined,
      pendingIds: new Set(Object.keys(this.characterGuiDraft?.drafts ?? {})),
      search: this.characterSearch,
      onSearchChange: search => { this.characterSearch = search; this.renderCharacterDirectory(); },
      onOpen: (objectId, title) => { void this.openDocument({ kind: 'character', objectId, title }); },
      onCreate: async () => {
        const before = this.controller.source;
        if (!before) return;
        const name = newCharacterName(before.characters, this.controller.preferences.locale);
        const result = await this.controller.authorOperation({ op: 'character.create', name });
        if (!result.ok) throw new Error(result.error.message);
        const added = this.controller.source?.characters.find(character => character.name === name && !before.characters.some(item => item.id === character.id));
        if (added) {
          this.characterHistory.set(added.id, { canUndo: true, canRedo: false });
          this.characterSearch = ''; await this.openDocument({ kind: 'character', objectId: added.id, title: added.name });
        }
      },
    }));
  }
  private disposeCharacterRegions(keep?: ReadonlySet<string>): void {
    for (const [id, region] of this.characterRegions) if (!keep?.has(`character:${id}`)) {
      region.root.unmount(); this.characterRegions.delete(id);
    }
  }
  private characterDocument(objectId?: Id): HTMLElement {
    if (!this.controller.source) return this.characterNode;
    const projectId = this.controller.source.project.projectId;
    if (this.voiceConnectionProject !== projectId) { this.voiceConnectionProject = projectId; void workbenchBridge(this.services.bridge).production.overview().then(result => { if (result.ok && this.controller.source?.project.projectId === projectId) { const purposes = new Set(['speech', ...(result.value.operations ?? []).filter(operation => operation.definition.adoption.kind === 'asset' && operation.definition.adoption.usages.includes('voice')).map(operation => operation.definition.purpose)]); this.voiceConnections = result.value.connections.filter(connection => connection.purposes.some(purpose => purposes.has(purpose))); this.render(); } }); }
    let region = objectId ? this.characterRegions.get(objectId) : undefined;
    if (objectId && !region) {
      const node = el('div', 'character-document');
      region = { node, root: createRoot(node) };
      this.characterRegions.set(objectId, region);
    }
    const characterNode = region?.node ?? this.characterNode;
    const root = region?.root ?? (this.characterRoot ??= createRoot(this.characterNode));
    const session = this.characterGuiDraft, objectView = objectId && session?.views?.[objectId];
    const guiDraft = objectId && session ? { ...session, section: undefined, differenceId: undefined, ...objectView, selected: objectId } : session;
    const tabId = objectId ? 'character:' + objectId : 'characters';
    root.render(createElement(CharacterManager, { key: tabId, objectId, guiDraft, onGuiDraftChange: draft => this.captureCharacterGui(draft, objectId),
      openDirectory: () => this.dock.current?.open(authoringDockTools.characters),
      sectionRequest: this.characterSectionRequest?.characterId === objectId ? this.characterSectionRequest ?? undefined : undefined,
      historyState: objectId ? this.characterHistory.get(objectId) : undefined,
      embedded: true, explorerContainer: this.characterExplorer, selectedId: this.characterSelected,
      voiceConnections: this.voiceConnections, discardDraft: this.characterDiscardRequest,
      inspectVoiceConnection: (connectionId, model) => workbenchBridge(this.services.bridge).connections.test({ connectionId, model, purpose: 'speech', imageUsage: null, workflowBindingId: null }),
      runtimeAssets: this.services.runtimeAssets, previewScene: (id,entryId) => { this.debugRouteIntent.previewEntryId=entryId;void this.previewScene(id,entryId); },
      selectCharacter: (id, name) => { this.characterSelected=id;this.characterAsset=null;this.documents=this.documents.map(document=>document.kind==='characters'?{...document,title:name}:document);this.render(); },
      assets: [...this.assetCache.values()], inspectAsset: id => { void this.services.getAsset?.(id).then(result=>{if(this.notice(result)){this.characterAsset=result.value;this.render();this.revealInspector();}}); },
      chooseAvatar: async (characterId, currentAssetId) => { const choice=await openAssetPicker({services:this.services,projectId:this.controller.source!.project.projectId,
        allowedKinds:['image'],locale:this.controller.preferences.locale,characterId,currentAssetId,currentName:this.assetCache.get(currentAssetId??'')?.name,
        purpose:tr(this.controller.preferences.locale,'角色默认阅读头像','Default reading portrait','標準会話アバター'),mode:'compact',scope:characterNode,
        onApply:async selected=>{this.assetCache.set(selected.asset.id,selected.asset);return {ok:true,value:undefined,warnings:[]};}});return choice?.assetId;},
      previewAsset: (id, variantId) => { void this.previewAsset(id, variantId); },
      produceDifference: (characterId, differenceId, assetId, variantId) => void this.openFigureProduction({ assetId, variantId }, characterId, differenceId),
      pendingChanged: dirty => {
        this.characterDraft = dirty || Object.keys(this.characterGuiDraft?.drafts ?? {}).some(id => id !== objectId);
        this.documents = this.documents.map(document => document.id === tabId ? { ...document, dirty: dirty || !!(objectId && this.controller.source?.characterDocuments?.[objectId]?.dirty) } : document);
        this.refreshDocumentTabs(); this.renderCharacterDirectory();
      },
      source: this.controller.source, locale: this.controller.preferences.locale,
      close: () => { void this.closeDocument(tabId); },
      authorOperation:async operation=>{const result=await this.controller.authorOperation(operation);if(!result.ok)return result;if(objectId)this.characterHistory.set(objectId,{canUndo:true,canRedo:false});this.render();return {ok:true,value:this.controller.source!,warnings:result.warnings};},
      apply: async drafts => { const result = await this.controller.saveCharacters(drafts); if (!result.ok) return result;
        for (const draft of drafts) if (this.characterGuiDraft) {
          delete this.characterGuiDraft.drafts[draft.id];
          delete this.characterGuiDraft.bases?.[draft.id];
        }
        for (const draft of drafts) this.characterHistory.set(draft.id, { canUndo: true, canRedo: false });
        this.characterDraft = Boolean(Object.keys(this.characterGuiDraft?.drafts ?? {}).length);
        this.render(); return { ok: true, value: this.controller.source!, warnings: result.warnings }; },
      remove: async id => { const result = await this.controller.removeCharacter(id); if (!result.ok) return result;
        this.characterHistory.set(id, { canUndo: true, canRedo: false });
        this.render(); return { ok: true, value: this.controller.source!, warnings: result.warnings }; },
      history: async action => { const scope = objectId ? await this.discardScope({ id: tabId, kind: 'character', objectId, title: tabId }) : await this.activeHistoryScope(); if (!scope) return { ok: false, error: { code: 'NOTHING_TO_UNDO', message: '请选择角色', severity: 'error', owner: 'M01', related: [], actions: [] }, issues: [] }; const result = await this.controller[action](scope); if (!result.ok) return result;
        if (objectId) this.characterHistory.set(objectId, { canUndo: action === 'redo', canRedo: action === 'undo' });
        this.render(); return { ok: true, value: this.controller.source!, warnings: result.warnings }; },
    }));
    return characterNode;
  }
  private async runPlaytest(from: 'entry' | 'scene' | 'statement' | 'stage'): Promise<void> {
    if (!await this.flushScript()) return;
    await this.controller.flushResume();
    const scene = this.controller.scene, statement = from === 'scene' ? this.controller.parsed()?.parsed.cst.find(node => node.id)?.id : this.controller.selection?.primaryId;
    const stageSource = from === 'stage' ? this.fixedStageSource ?? this.followedStageSource() : null;
    const stage = this.stageStatement(stageSource);
    if (stageSource && (!this.sceneForSource(stageSource) || stageSource.statementId && !this.resolveSceneSource(stage))) {
      this.messageTone = 'warning';
      this.message = tr(this.controller.preferences.locale, '请选择有效的舞台来源后再试玩。', 'Select a valid stage source to playtest.', '有効な舞台ソースを選んで試遊してください。');
      this.render(); return;
    }
    const target = from === 'stage' ? stageSource && { sceneId: stageSource.sceneId, statementId: stage?.statementId ?? null }
      : from !== 'entry' && scene && statement ? { sceneId: scene.sceneId, statementId: statement } : null;
    try { await startPlaytest(this.root, this.services, target, () => this.render(), this.controller.preferences.locale, this.debugRouteIntent); }
    catch (error) { this.messageTone = 'error'; this.message = String(error); this.render(); }
  }
  private async deleteStatements(ids: Id[]): Promise<void> {
    if (!ids.length || !await this.flushScript()) return;
    const locale=this.controller.preferences.locale;
    const applied = await this.confirmAction(tr(locale,`删除 ${ids.length} 条语句？`,`Delete ${ids.length} statements?`,`${ids.length} 件の文を削除しますか？`), tr(locale,'删除所选语句，可通过作品撤销恢复。','Delete selected statements; Undo restores them.','選択した文を削除します。元に戻す操作で復元できます。'), tr(locale,'删除语句','Delete statements','文を削除'), async () => { const result = await this.controller.deleteStatements(ids); if (!result.ok) throw new Error(result.error.message); });
    const primary=this.controller.selection?.primaryId;
    if(applied && primary) requestAnimationFrame(() => this.root.querySelector<HTMLElement>(`[data-statement-id="${CSS.escape(primary)}"]`)?.focus({preventScroll:true}));
  }
  private async showSceneGraph(): Promise<void> {
    await this.openDocument({ kind: 'scene-graph', title: '场景关系图' });
  }
  private showMoveInstructions(): void {
    const source = this.controller.source, scene = this.controller.scene, selection = this.controller.selection;
    if (!source || !scene || !selection?.statementIds.length || this.controller.parsed()?.readOnly) return;
    const selected = [...selection.statementIds], primaryId = selection.primaryId, locale = this.controller.preferences.locale;
    mountMoveInstructionsDialog({ model: buildMoveInstructionsModel(source, scene.sceneId, selected, locale, this.writingDrafts), locale,
      move: async (targetSceneId, position, beforeId) => {
        const flushed = await this.flushScript();
        this.controller.select(selected, primaryId);
        if (!flushed) return tr(locale, '编辑草稿未能提交，请修正后重试。', 'The edit draft could not be applied. Fix it and retry.', '編集中の内容を適用できませんでした。修正して再試行してください。');
        const currentSource = this.controller.source;
        if (!currentSource || this.controller.scene?.sceneId !== scene.sceneId) return tr(locale, '来源场景已变化，请重新打开移动对话框。', 'The source scene changed. Open the move dialog again.', '移動元のシーンが変更されました。移動ダイアログを開き直してください。');
        const current = buildMoveInstructionsModel(currentSource, scene.sceneId, selected, locale);
        if (current.error) return current.error;
        const target = current.scenes.find(item => item.id === targetSceneId);
        if (!target) return tr(locale, '目标场景已变化，请重新选择。', 'The target scene changed. Select it again.', '移動先が変更されました。選択し直してください。');
        const resolved = resolveMovePosition(target, position, beforeId, locale); if (resolved.error) return resolved.error;
        const result = await this.controller.moveToScene(selected, targetSceneId, resolved.beforeId);
        if (!result.ok) return result.error.message;
        studioToasts.add({ title: tr(locale, `已将 ${selected.length} 条指令从「${current.sourceName}」移动到「${target.name}」`,
          `Moved ${selected.length} instructions from “${current.sourceName}” to “${target.name}”`, `「${current.sourceName}」から「${target.name}」へ ${selected.length} 件の命令を移動しました`) });
        return null;
      },
      moved: () => { this.render(); const primary = this.controller.selection?.primaryId;
        if (primary) this.root.querySelector<HTMLElement>(`[data-statement-id="${CSS.escape(primary)}"]`)?.focus({ preventScroll: true }); },
    });
  }
  private renderAuthoringToolbar(scene = this.controller.scene, view = this.controller.view): HTMLElement | null {
    if (!scene) return null;
    let toolbar = this.sceneToolbars.get(scene.sceneId);
    if (!toolbar) {
      const node = el('div', 'authoring-toolbar authoring-toolbar-host');
      toolbar = { node, root: createRoot(node) };
      this.sceneToolbars.set(scene.sceneId, toolbar);
    }
    const status = this.controller.status, parsed = this.controller.parsed(view, scene);
    const dirty = scene.dirty || this.writingDraftOrigin?.documentId === scene.documentId || this.scriptDrafts.has(scene.sceneId);
    const run = async (action: () => void | Promise<unknown>) => {
      if (!this.activateVisibleScene(`scene:${scene.sceneId}`) && !await this.openSceneTarget(scene.sceneId)) return;
      await action();
    };
    toolbar.root.render(createElement(AuthoringToolbar, {
      locale: this.controller.preferences.locale, view, dirty, saveState: status.save,
      hasSelection: Boolean(this.scenePaneContext(scene.sceneId, view).selection?.primaryId), hasStatements: Boolean(parsed?.parsed.cst.some(node => node.id)),
      readOnly: parsed?.readOnly ?? true, pluginTools: Boolean(this.studioPlugins?.tools('commands.palette').length),
      changeView: view => { void run(() => this.changeSceneView(view)); },
      sideBySide: { views: this.sceneViews(scene.sceneId), open: view => { void run(() => this.splitScene(view)); }, close: () => { void run(() => this.splitScene(null)); } },
      play: from => { void run(() => this.runPlaytest(from)); },
      action: action => { void run(() => {
        if (action === 'save' && scene) void this.save(false, scene.documentId);
        else if (action === 'undo' || action === 'redo') void this.shellAction(action);
        else if (action === 'graph') void this.showSceneGraph();
        else if (action === 'paste') void this.pasteDialog();
        else if (action === 'ai-writing' || action === 'ai-direction') void this.createWithAi(action === 'ai-writing' ? 'script' : 'stage');
        else if (action === 'plugins') void this.flushScript().then(ok => { if (ok) this.studioPlugins?.openTools('commands.palette'); });
        else {
      const dialog = el('dialog', 'authoring-command-dialog status-dialog');
      dialog.append(el('h2', '', tr(this.controller.preferences.locale,'创作状态','Authoring status','創作の状態')), el('p', '', tr(this.controller.preferences.locale,`当前场景：${scene?.name ?? '未选择'}`,`Current scene: ${scene?.name ?? 'None'}`,`現在のシーン：${scene?.name ?? '未選択'}`)),
       el('p', '', `工作修订 ${scene.revision} · 已存修订 ${scene.savedRevision}`),
       el('p', '', dirty ? tr(this.controller.preferences.locale,'修改尚未保存到磁盘','Changes are not saved to disk','変更はディスクに保存されていません') : tr(this.controller.preferences.locale,'工作内容已保存','Working content saved','作業内容は保存済みです')),
        el('p', '', `编译包含 ${status.compilation.documents.length} 份文档`));
      const technical = el('details'); technical.append(el('summary', '', '技术详情'), codeBlock(JSON.stringify(status.compilation, null, 2), 'json', this.controller.preferences.locale));
      dialog.append(technical, button('关闭', () => dialog.close())); this.root.append(dialog); dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove(), { once: true });

        }
      }); },
    }));
    return toolbar.node;
  }
  private refreshWritingStatus(): void {
    const scene = this.controller.scene;
    this.documents = this.documents.map(document => document.kind === 'scene' && document.objectId === scene?.sceneId
      ? { ...document, dirty: Boolean(scene?.dirty || this.writingDrafts.size), preview: this.writingDrafts.size ? false : document.preview } : document);
    this.refreshDocumentTabs(); this.updateStatus(); this.renderAuthoringToolbar();
  }
  private recordWritingDraft(scene: NonNullable<AuthoringController['scene']>, id: Id, text: string, base: string): void {
    if (text === base) this.writingDrafts.delete(id);
    else {
      this.writingDraftOrigin ??= { documentId: scene.documentId, revision: this.controller.scene?.documentId === scene.documentId ? this.controller.scene.revision : scene.revision };
      this.writingDrafts.set(id, text);
    }
    if (!this.writingDrafts.size) this.writingDraftOrigin = null;
  }
  private async editDialogueAt(sceneId: Id, statementId: Id, offset: number, action: DialogueEvent['kind'] | 'split' | 'merge') {
    if (!await this.flushScript()) return;
    const scene = this.controller.scene, source = this.controller.source;
    if (!scene || !source || scene.sceneId !== sceneId) return;
    const state = this.controller.parsed('writing', scene);
    const node = state?.parsed.cst.find(item => item.id === statementId && item.command === 'say');
    if (!node || state?.readOnly) return;
    const args = node.object?.value as Record<string, unknown> | undefined;
    const content = DialogueContentSchema.parse(args?.text ?? '');
    const locale = this.controller.preferences.locale, t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
    if (action !== 'merge' && !dialogueAnchorOffsets(content).has(offset)) {
      this.message = t('请把光标放在完整字符或插值的边界。', 'Place the caret at a character or interpolation boundary.', '文字または補間の境界にカーソルを置いてください。');
      this.messageTone = 'error'; this.render(); return;
    }
    const target = { projectId: source.project.projectId, sceneId, documentId: scene.documentId, revision: scene.revision, statementIds: [statementId] };
    if (action === 'split' || action === 'merge') {
      const next = state!.parsed.cst[state!.parsed.cst.indexOf(node) + 1]?.id;
      if (action === 'merge' && !next) return;
      const result = await this.controller.editDialogue(action === 'split' ? { op: 'dialogue.split', sceneId, statementId, offset }
        : { op: 'dialogue.merge', sceneId, statementId, nextStatementId: next! }, target);
      if (this.notice(result)) this.render();
      return;
    }
    const events = (Array.isArray(args?.events) ? args.events : []).map(event => DialogueEventSchema.parse(event));
    const id = createId();
    const add = async (event: DialogueEvent) => {
      const result = await this.controller.editDialogue({ op: 'dialogue.update', sceneId, statementId, events: [...events, event] }, target, id);
      if (result.ok) {
        if (this.controller.scene?.sceneId === sceneId) {
          this.focusedDialogueEvent = { sceneId, statementId, eventId: id };
          this.controller.select([statementId]);
        }
        this.render();
      }
      return result;
    };
    if (action === 'sound') {
      await openAssetPicker({ services: this.services, projectId: target.projectId, sceneId, allowedKinds: ['audio'], locale,
        purpose: t('句内短音效', 'Inline sound effect', '台詞内の効果音'), scope: this.root, remember: false,
        onApply: choice => add({ id, kind: 'sound', offset, assetId: choice.assetId, variantId: choice.variantId }) });
      return;
    }
    const caption = t(`正文位置 ${offset}`, `Text boundary ${offset}`, `本文の位置 ${offset}`);
    if (action === 'wait') {
      let wait: WaitInput = { duration: '', automatic: '' };
      await requestDialog({ title: t('插入句内等待', 'Insert inline wait', '台詞内に待機を追加'), locale, description: caption,
        content: createElement(InlineWaitFields, { initial: wait, locale, change: value => { wait = value; } }),
        confirm: async () => { const result = await add({ id, kind: 'wait', offset, ...waitEventValues(wait) });
          if (!this.notice(result)) throw new Error(result.error.message); } });
      return;
    }
    const visible = new Map<Id, { characterId?: Id; assetId?: Id; variantId?: Id }>();
    for (const previous of state!.parsed.cst) {
      if (previous === node) break;
      if (previous.command !== 'changeFigure') continue;
      const figure = previous.object?.value as Record<string, unknown> | undefined;
      if (typeof figure?.objectId !== 'string') continue;
      if (figure.op === 'exit') { visible.delete(figure.objectId); continue; }
      const prior = figure.op === 'replace' ? visible.get(figure.objectId) : undefined;
      visible.set(figure.objectId, {
        characterId: typeof figure.characterId === 'string' ? figure.characterId : prior?.characterId,
        assetId: typeof figure.assetId === 'string' ? figure.assetId : prior?.assetId,
        variantId: typeof figure.variantId === 'string' ? figure.variantId : typeof figure.assetId === 'string' ? undefined : prior?.variantId,
      });
    }
    const differences: { event: DialogueEvent; label: string }[] = [];
    for (const [objectId, figure] of visible) {
      const character = source.characters.find(item => item.id === figure.characterId);
      const cached = figure.assetId ? this.assetCache.get(figure.assetId) : undefined;
      const fetched = figure.assetId && !cached ? await this.services.getAsset?.(figure.assetId) : undefined;
      const model = cached ?? (fetched?.ok ? fetched.value : null);
      if (model) this.assetCache.set(model.id, model);
      if (model && model.kind === 'live2d') {
        const variant = model.variants.find(item => item.id === (figure.variantId ?? model.activeVariantId));
        if (variant) for (const expressionName of variant.groupCapabilities?.expressions ?? []) differences.push({
          event: { id, kind: 'live2dExpression', offset, objectId, assetId: model.id, variantId: variant.id, expressionName },
          label: `${character?.name ?? model.name} · ${expressionName} · Live2D · ${objectId}`,
        });
      } else if (character) for (const difference of character.differences ?? []) differences.push({
        event: { id, kind: 'expression', offset, objectId, characterId: character.id, differenceId: difference.id },
        label: `${character.name} · ${difference.name} · ${objectId}`,
      });
    }
    if (!differences.length) {
      this.message = t('此句前需有带图片差分或 Live2D 命名表情的在场立绘。', 'Show a figure with image variations or named Live2D expressions before this line.', 'この台詞の前に画像差分または Live2D の名前付き表情を持つ立ち絵を表示してください。');
      this.messageTone = 'error'; this.render(); return;
    }
    let selected = 0;
    await requestDialog({ title: t('插入句内表情', 'Insert inline expression', '台詞内に表情を追加'), locale, description: caption,
      content: createElement('label', { className: 'authoring-field' }, t('在场立绘与表情', 'Figure and expression', '立ち絵と表情'),
        createElement('select', { onChange: (event: React.ChangeEvent<HTMLSelectElement>) => { selected = Number(event.target.value); } },
          differences.map((item, index) => createElement('option', { key: index, value: index }, item.label)))),
      confirm: async () => {
        const result = await add(differences[selected]!.event);
        if (!this.notice(result)) throw new Error(result.error.message); } });
  }
  private scenePane(source: NonNullable<AuthoringController['source']>, scene: NonNullable<AuthoringController['scene']>, view: AuthoringController['view'], split: boolean): HTMLElement {
    const center = el('section', 'authoring-center');
    center.style.fontFamily = 'var(--studio-editor-font-family)';
    center.style.fontSize = 'var(--studio-editor-font-size)';
    const selection = this.scenePaneContext(scene.sceneId, view).selection;
    const ownsEditFocus = () => this.followedScene()?.documentId === scene.documentId;
    center.dataset.sceneView = view;
    center.dataset.sceneId = scene.sceneId;
    center.setAttribute('aria-label', this.t(view));
    center.addEventListener('focusin', () => {
      if (this.controller.scene?.documentId !== scene.documentId || this.controller.view === view) return;
      this.activateSceneView(view);
      queueMicrotask(() => this.render());
    });
    if (split) center.append(el('h2', 'authoring-pane-title', this.t(view)));
    {
      const current = this.controller.parsed(view, scene);
      if (current?.readOnly && !this.controller.engineIssue) {
        const locale = this.controller.preferences.locale, revision = current.lastValidRevision;
        const notice = el('div', 'authoring-notice');
        notice.dataset.sceneBaseline = revision === null ? 'missing' : String(revision);
        notice.setAttribute('role', 'status');
        notice.append(el('p', '', revision === null
          ? tr(locale, '源码有错误，当前没有可核验的有效版本。', 'The source has errors and has no verified valid revision.', 'ソースにエラーがあり、確認済みの有効版がありません。')
          : tr(locale, '只读 · 显示有效修订 ' + revision + ' · 已存修订 ' + scene.savedRevision, 'Read only · Showing valid revision ' + revision + ' · Saved revision ' + scene.savedRevision, '読み取り専用 · 有効なリビジョン ' + revision + ' · 保存済み ' + scene.savedRevision)));
        notice.append(button(this.t('script'), () => this.changeSceneView('script')));
        center.append(notice);
      }
      if (view === 'script') {
        const input = el('div', 'authoring-script-editor'); input.setAttribute('aria-label', this.t('script')); center.append(input);
      } else if (current && (!current.readOnly || current.lastValidRevision !== null)) {
        const list = el('div', view === 'writing' ? 'authoring-writing-list' : 'authoring-card-list');
        const gap = (beforeId: Id | null) => { const node = el('div', 'authoring-drop-gap');
          const insert = button('', () => this.commandDialog(beforeId), 'authoring-insert-icon'); insert.append(actionIcon('plus')); insert.setAttribute('aria-label', this.t('addCommand')); insert.title=beforeId ? tr(this.controller.preferences.locale, '在此行前添加指令', 'Insert before this line', 'この行の前に挿入') : tr(this.controller.preferences.locale, '在末尾添加指令', 'Insert at the end', '末尾に挿入'); insert.ariaLabel=insert.title;
          insert.append(el('span', 'authoring-insert-label', beforeId ? tr(this.controller.preferences.locale, '在此行前插入', 'Insert before this line', 'この行の前に挿入') : tr(this.controller.preferences.locale, '在末尾添加指令', 'Add at the end', '末尾に追加')));
          insert.disabled = current.readOnly; node.dataset.position = beforeId ? 'before' : 'end'; node.append(insert);
          node.addEventListener('dragover', event => event.preventDefault()); node.addEventListener('drop', event => { event.preventDefault();
            const asset = this.assetCache.get(event.dataTransfer?.getData('text/x-galcraft-asset') as Id); if (asset) void this.dropAsset(asset, 'gap', beforeId, null);
          }); return node; };
        const registry = createCommandRegistry(source.project.engineVersion, this.studioPlugins?.commandSpecs() ?? []);
        for (const node of current.parsed.cst) {
          if (!node.id) continue;
          if (!current.readOnly) list.append(gap(node.id));
          const args = node.object?.value as Record<string, unknown> | undefined;
          const card = el('article', 'authoring-card'); card.dataset.view = view; card.dataset.statementId = node.id; card.dataset.command = node.command; card.tabIndex = 0;
          if (selection?.statementIds.includes(node.id)) card.classList.add('selected');
          const handle = button('', () => {}); handle.className = 'authoring-grip'; handle.append(actionIcon('grip'));
          handle.setAttribute('aria-label', tr(this.controller.preferences.locale, '拖动排序；Alt 加方向键调整顺序', 'Drag to reorder; Alt+arrow keys to move', 'ドラッグで並べ替え。Alt＋矢印でも移動')); handle.title=handle.ariaLabel ?? '';
          handle.disabled = current.readOnly;
          handle.addEventListener('keydown', event => {
            if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const ids = current.parsed.cst.filter(item => item.id).map(item => item.id!);
            const at = ids.indexOf(node.id!);
            const before = event.key === 'ArrowUp' ? ids[at - 1] : ids[at + 2] ?? null;
            if (at < 0 || event.key === 'ArrowUp' && at === 0 || event.key === 'ArrowDown' && at === ids.length - 1) return;
            void this.moveCards([node.id!], before, node.id!);
          });
          const commandSpec=registry.get(node.command);
          const typeName = node.command === 'changeFigure' ? (this.assetCache.get(String(args?.assetId))?.kind === 'live2d' ? tr(this.controller.preferences.locale,'Live2D 立绘','Live2D character','Live2D 立ち絵') : tr(this.controller.preferences.locale,'图片立绘','Image character art','画像の立ち絵')) : commandSpec ? commandName(commandSpec,this.controller.preferences.locale) : node.command;
          const voiced = node.command === 'say' && Boolean(args?.voice || args?.voiceByLocale &&
            Object.keys(args.voiceByLocale as Record<string, unknown>).length);
          card.append(handle);
          if(view==='cards' && typeof args?.assetId==='string') {
            const asset=this.assetCache.get(args.assetId);
            if(asset?.kind==='image'){const image=el('img','authoring-direction-thumbnail');image.alt=asset.name;image.draggable=false;image.dataset.assetId=asset.id;image.dataset.variantId=asset.activeVariantId;
              const preview=button('',()=>this.previewAsset(asset.id,asset.activeVariantId),'authoring-direction-preview');preview.ariaLabel=tr(this.controller.preferences.locale,`预览 ${asset.name}`,`Preview ${asset.name}`,`${asset.name} をプレビュー`);
              const overlay=el('span','direction-preview-overlay');overlay.append(actionIcon('search'));preview.append(image,overlay);preview.addEventListener('click',event=>event.stopPropagation());card.append(preview);}
          }
          if (view !== 'writing' || node.command !== 'say') card.append(commandIcon(node.command, voiced, voiced ? '配音对白' : typeName), el('strong', '', typeName));
          if (view === 'writing' && node.command === 'say') {
            const speakerSelect = el('select', 'authoring-speaker-select');
            speakerSelect.ariaLabel = tr(this.controller.preferences.locale, '说话者', 'Speaker', '話者');
            const narrator = el('option', '', '旁白'); narrator.value = ''; speakerSelect.append(narrator);
            for (const character of source.characters) { const option = el('option', '', character.name); option.value = character.id; speakerSelect.append(option); }
            const speakerValue = args?.speaker as { kind?: string; id?: string } | undefined;
            speakerSelect.value = speakerValue?.kind === 'character' ? speakerValue.id ?? '' : '';
            speakerSelect.disabled = current.readOnly;
            speakerSelect.addEventListener('click', event => event.stopPropagation());
            speakerSelect.addEventListener('change', () => { void (async () => { if (!ownsEditFocus() || !await this.flushWriting() || !ownsEditFocus()) return; this.controller.select([node.id!]);
              const speaker: Json = speakerSelect.value ? { kind: 'character', id: speakerSelect.value } : { kind: 'narrator' };
              const result = await this.controller.editFields([{ field: 'speaker', op: 'set', value: speaker }]); if (this.notice(result)) this.render(); })();
            }); card.append(speakerSelect);
            const writing = el('textarea', 'authoring-writing-input'); writing.value = this.writingDrafts.get(node.id) ?? dialoguePlainText(DialogueContentSchema.safeParse(args?.text).data ?? ''); writing.disabled = current.readOnly; writing.ariaLabel = tr(this.controller.preferences.locale, '对白正文', 'Dialogue text', '台詞本文'); writing.placeholder = tr(this.controller.preferences.locale, '输入对白，Ctrl+Enter 继续写下一句', 'Write dialogue; Ctrl+Enter starts the next line', '台詞を入力。Ctrl+Enter で次の行へ');
            writing.addEventListener('click', event => event.stopPropagation());
            writing.addEventListener('compositionstart', () => this.setSceneComposition(writing, true));
            writing.addEventListener('compositionend', () => this.setSceneComposition(writing, false));
            const currentArgs = () => {
              const working = this.controller.source?.scenes.find(item => item.documentId === scene.documentId);
              return this.controller.parsed('writing', working ?? scene)?.parsed.cst.find(item => item.id === node.id)?.object?.value as Record<string, unknown> | undefined;
            };
            writing.addEventListener('input', () => {
              const currentText = dialoguePlainText(DialogueContentSchema.safeParse(currentArgs()?.text).data ?? '');
              if (!ownsEditFocus()) { writing.value = currentText; return; }
              this.recordWritingDraft(scene, node.id!, writing.value, currentText);
              void this.reportAuthoringDrafts(); this.refreshWritingStatus();
            });
            writing.addEventListener('change', () => { void this.flushWriting().then(ok => { if (ok) this.render(); }); });
            writing.addEventListener('keydown', event => { if (!ownsEditFocus() || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.isComposing || this.composingSceneInputs.has(writing) || event.altKey || event.shiftKey) return;
              event.stopPropagation();
              event.preventDefault(); void (async () => {
                this.controller.select([node.id!]);
                this.recordWritingDraft(scene, node.id!, writing.value, dialoguePlainText(DialogueContentSchema.safeParse(currentArgs()?.text).data ?? ''));
                if (!await this.flushWriting()) return;
                const speaker = currentArgs()?.speaker as { kind: 'character'; id: Id } | { kind: 'narrator' } | undefined;
                const inserted = await this.controller.insertDialogue([{ speaker: speaker ?? { kind: 'narrator' }, text: '' }], this.controller.nextStatementId(node.id!), true);
                if (this.notice(inserted)) { this.render();
                  this.root.querySelector<HTMLTextAreaElement>(`[data-statement-id="${this.controller.selection?.primaryId}"] textarea`)?.focus(); }
              })();
            });
            writing.rows = 1;
            const grow = () => { writing.style.height = 'auto'; writing.style.height = `${Math.max(36, writing.scrollHeight + 2)}px`; };
            writing.addEventListener('input', grow);
            requestAnimationFrame(grow);
            card.append(writing);
          } else {
            card.append(el('span', 'authoring-card-summary', node.command === 'say' ? dialoguePlainText(DialogueContentSchema.safeParse(args?.text).data ?? '') : ['setComplexAnimation','stopAnimation'].includes(node.command) ? this.animationSummary(args??{},node.command==='stopAnimation') : node.command === 'end' ?
              `${tr(this.controller.preferences.locale, '结束后前往', 'Destination after ending', '終了後の移動先')}: ${this.endingDestination(args?.target)}` :
              Object.entries(args ?? {}).filter(([key]) => !['text', 'speaker', 'objectId', 'soundId', 'effectId', 'labelId'].includes(key)).slice(0, 2)
                .map(([key, value]) => `${fieldNames[key]?.[this.controller.preferences.locale==='en'?1:this.controller.preferences.locale==='ja'?2:0]??key}: ${key==='op'?enumLabel(String(value),this.controller.preferences.locale):this.displayParameter(value)}`).join(' · ')));
            if (node.command === 'say') {
              const speaker=args?.speaker as {id?:string}|undefined;
              const name=source.characters.find(item=>item.id===speaker?.id)?.name ?? tr(this.controller.preferences.locale,'旁白','Narrator','ナレーター');
              const tag=el('span','authoring-speaker-name',name);card.querySelector('strong')?.replaceWith(tag);
              if(voiced)card.append(el('span','authoring-voice-state',tr(this.controller.preferences.locale,'已配音','Voiced','音声あり')));
            }
          }
          if (node.command === 'say' && Array.isArray(args?.events)) {
            const markers = el('div', 'authoring-dialogue-markers');
            const locale = this.controller.preferences.locale;
            const events = args.events.flatMap(raw => {
              const event = DialogueEventSchema.safeParse(raw);
              return event.success ? [event.data] : [];
            }).sort((a, b) => a.offset - b.offset);
            for (const event of events) {
              const label = event.kind === 'wait' ? event.durationMs === null
                ? tr(locale, '点击等待', 'Click wait', 'クリック待ち')
                : tr(locale, '定时等待', 'Timed wait', '時間待ち')
                : event.kind === 'sound' ? tr(locale, '音效', 'Sound effect', '効果音')
                  : event.kind === 'live2dExpression' ? `Live2D · ${event.expressionName}` : tr(locale, '表情', 'Expression', '表情');
              const marker = button(`${label} · ${event.offset}`, () => {
                this.focusedDialogueEvent = { sceneId: scene.sceneId, statementId: node.id!, eventId: event.id };
                this.controller.select([node.id!]); this.render();
              }, 'authoring-dialogue-marker');
              marker.dataset.eventId = event.id;
              marker.ariaPressed = String(this.focusedDialogueEvent?.sceneId === scene.sceneId && this.focusedDialogueEvent.eventId === event.id);
              marker.addEventListener('click', input => input.stopPropagation());
              markers.append(marker);
            }
            if (markers.childElementCount) card.append(markers);
          }
          card.addEventListener('click', event => { const selected = this.controller.selection?.statementIds ?? []; let ids: Id[];
            const visible=current.parsed.cst.flatMap(item=>item.id?[item.id]:[]),anchor=this.cardRangeAnchor?.sceneId===scene.sceneId?visible.indexOf(this.cardRangeAnchor.id):-1;
            if(event.shiftKey&&anchor>=0){const at=visible.indexOf(node.id!);ids=[...new Set([...(event.ctrlKey||event.metaKey?selected:[]),...visible.slice(Math.min(anchor,at),Math.max(anchor,at)+1)])];}
            else {ids=event.ctrlKey||event.metaKey?selected.includes(node.id!)?selected.filter(id=>id!==node.id):[...selected,node.id!]:[node.id!];this.cardRangeAnchor={sceneId:scene.sceneId,id:node.id!};}
            this.focusedDialogueEvent = null;
            this.controller.select(ids, ids.includes(node.id!) ? node.id : ids.at(-1)); this.render();
            this.root.querySelector<HTMLElement>(`[data-scene-view="${view}"] [data-statement-id="${node.id}"]`)?.focus(); });
          const openMenu = (origin: HTMLElement, point?: MouseEvent) => {
            const locale = this.controller.preferences.locale;
            const writing = card.querySelector<HTMLTextAreaElement>('textarea.authoring-writing-input');
            const offset = writing?.selectionStart ?? 0;
            const following = current.parsed.cst[current.parsed.cst.indexOf(node) + 1];
            const at = (action: Parameters<AuthoringWorkspace['editDialogueAt']>[3]) => () => this.editDialogueAt(scene.sceneId, node.id!, offset, action);
            if(!this.controller.selection?.statementIds.includes(node.id!))this.cardRangeAnchor={sceneId:scene.sceneId,id:node.id!};
            const ids = objectMenuSelection(this.controller.selection?.statementIds ?? [], node.id!); this.controller.select(ids, node.id); this.render();
            const anchor = this.root.querySelector<HTMLElement>(`[data-scene-view="${view}"] [data-statement-id="${node.id}"]${origin === card ? '' : ' .authoring-object-more'}`) ?? card;
            showObjectMenu({ element: anchor, kind: origin === card ? 'context' : 'dropdown', ...(point ? { x: point.clientX, y: point.clientY } : {}) }, [
              { label: typeName, actions: [{ label: tr(locale,'从此句试玩','Play from here','ここからテスト'), run: () => { void this.runPlaytest('statement'); } }] },
              ...(writing && !current.readOnly ? [{ label: tr(locale, '对白正文', 'Dialogue text', '台詞本文'), actions: [
                { label: tr(locale, '插入句内等待', 'Insert inline wait', '台詞内に待機を追加'), run: at('wait') },
                { label: tr(locale, '插入句内音效', 'Insert inline sound effect', '台詞内に効果音を追加'), run: at('sound') },
                { label: tr(locale, '插入句内表情', 'Insert inline expression', '台詞内に表情を追加'), run: at('expression') },
                { label: tr(locale, '在光标处拆句', 'Split at caret', 'カーソル位置で分割'), run: at('split') },
                ...(following?.command === 'say' ? [{ label: tr(locale, '与下一句合并', 'Merge with next line', '次の台詞と結合'), run: at('merge') }] : []),
              ] }] : []),
              { label: tr(locale,`所选 ${ids.length} 条语句`,`${ids.length} selected statements`,`${ids.length} 件の選択`), actions: [
                { label: this.t('copy'), disabled: current.readOnly ? '原文有错误' : undefined, run: () => { void this.controller.copyStatements(ids).then(result => { this.notice(result); this.render(); }); } },
                { label: this.t('moveScene'), disabled: current.readOnly ? '原文有错误' : undefined, run: () => { void this.showMoveInstructions(); } },
              ] },
              { label: '', actions: [{ label: tr(locale,'删除所选','Delete selected','選択項目を削除'), danger: true, disabled: current.readOnly ? '原文有错误' : undefined, run: () => { void this.deleteStatements(ids); } }] },
              ...(!current.readOnly && this.studioPlugins?.tools('context.menu').length ? [{ label: '插件', actions: [{ label: '插件对象操作', run: () => { this.studioPlugins?.publishScope(); this.studioPlugins?.openTools('context.menu'); } }] }] : []),
            ]);
          };
          card.addEventListener('contextmenu', event => { if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"],.monaco-editor')) return; event.preventDefault(); event.stopPropagation(); openMenu(card, event); });
          card.addEventListener('keydown', event => { if (event.isComposing || !isObjectMenuKey(event) || event.target !== card) return; event.preventDefault(); event.stopPropagation(); openMenu(card); });
          const more = button('', () => openMenu(more), 'authoring-object-more'); more.append(actionIcon('more')); more.ariaLabel = tr(this.controller.preferences.locale,'更多指令操作','More command actions','その他の操作'); more.addEventListener('click', event => event.stopPropagation()); card.append(more);
          card.addEventListener('keydown', event => { if (event.key !== 'Delete' || event.isComposing || current.readOnly || event.target !== card) return;
            event.preventDefault(); const ids = this.controller.selection?.statementIds.includes(node.id!) ? this.controller.selection.statementIds : [node.id!];
            void this.deleteStatements(ids);
          });
          attachCardReorder(card, list, node.id, beforeId => {
            const selected = this.controller.selection?.statementIds.includes(node.id!) ?
              this.controller.selection.statementIds : [node.id!];
            void this.moveCards(selected, beforeId);
          }, current.readOnly);
          if (!current.readOnly) {
            card.addEventListener('dragover', event => event.preventDefault());
            card.addEventListener('drop', event => { event.preventDefault();
              const assetId = event.dataTransfer?.getData('text/x-galcraft-asset') as Id; const asset = this.assetCache.get(assetId);
              if (asset) void this.dropAsset(asset, 'card', node.id!, node.command);
            });
          }
          list.append(card);
        }
        if (!current.readOnly) list.append(gap(null));
        center.append(list);
        if (current.readOnly) return center;
        const actions = el('div', 'authoring-toolbar authoring-selection-tools'); actions.append(button(this.t('addDialogue'), () => this.dialogueDialog()));
        actions.append(button(this.t('addCommand'), () => this.commandDialog()));
        if (selection?.statementIds.length) {
          actions.append(el('span', 'authoring-selection-count', tr(this.controller.preferences.locale,
            `已选 ${selection.statementIds.length} 条`, `${selection.statementIds.length} selected`, `${selection.statementIds.length} 件を選択`)));
          actions.append(button(this.t('copy'), async () => { const result = await this.controller.copyStatements(this.controller.selection!.statementIds);
            if (this.notice(result)) this.render(); }));
          const move = button(this.t('moveScene'), () => this.showMoveInstructions(), 'authoring-move-selected'); move.disabled = current.readOnly; actions.append(move);
          const remove=button(tr(this.controller.preferences.locale,'删除所选','Delete selected','選択を削除'),()=>this.deleteStatements(this.controller.selection?.statementIds??[]),'authoring-delete-selected');remove.prepend(actionIcon('trash'));remove.disabled=current.readOnly;actions.append(remove);
        }
        center.append(actions);
      }
    }
    return center;
  }
  private eventProperties(inspected: NonNullable<ReturnType<AuthoringWorkspace['resolveSceneSource']>>): HTMLElement {
    const { scene, state, node, event } = inspected;
    const project = this.controller.source!;
    const locale = this.controller.preferences.locale;
    const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
    const field = el('section', 'authoring-event-properties');
    const active = event!;
    const title = active.kind === 'wait' ? t('句内等待', 'Inline wait', '台詞内の待機')
      : active.kind === 'sound' ? t('句内音效', 'Inline sound', '台詞内の効果音')
        : active.kind === 'live2dExpression' ? t('句内 Live2D 表情', 'Inline Live2D expression', '台詞内の Live2D 表情')
          : t('句内表情', 'Inline expression', '台詞内の表情');
    field.append(el('h3', '', title), el('p', 'authoring-inspector-context', `${scene.name} · ${t('正文位置', 'Text boundary', '本文の位置')} ${active.offset}`));
    const values = node.object?.value as Record<string, unknown>;
    const events = (Array.isArray(values.events) ? values.events : []).map(item => DialogueEventSchema.safeParse(item));
    const target: StatementEditTarget = { projectId: project.project.projectId, sceneId: scene.sceneId, documentId: scene.documentId, revision: scene.revision, statementIds: [node.id!] };
    const edit = button(t('编辑句内事件', 'Edit inline event', '台詞内のイベントを編集'), async () => {
      let offset = String(active.offset);
      let wait: WaitInput = {
        duration: active.kind === 'wait' && active.durationMs !== null ? String(active.durationMs) : '',
        automatic: active.kind === 'wait' && active.autoWaitMs !== undefined ? String(active.autoWaitMs) : '',
      };
      let volume = active.kind === 'sound' && active.volume !== undefined ? String(active.volume) : '';
      let differenceId = active.kind === 'expression' ? active.differenceId : '';
      let expressionName = active.kind === 'live2dExpression' ? active.expressionName : '';
      const numberField = (label: string, value: string, min: number, update: (value: string) => void, max?: number) => createElement('label', { className: 'authoring-field' }, label,
        createElement('input', { type: 'number', defaultValue: value, min, max, step: max ? 'any' : 1,
          onChange: (input: React.ChangeEvent<HTMLInputElement>) => update(input.target.value) }));
      const choiceField = (label: string, selected: string, choices: { value: string; label: string }[], change: (value: string) => void) => {
        const options = choices.some(item => item.value === selected) ? choices : [...choices, { value: selected, label: selected }];
        return createElement('label', { className: 'authoring-field' }, label, createElement('select', {
          defaultValue: selected, onChange: (input: React.ChangeEvent<HTMLSelectElement>) => change(input.target.value),
        }, ...options.map(item => createElement('option', { key: item.value, value: item.value }, item.label))));
      };
      let details: React.ReactNode;
      if (active.kind === 'wait') details = createElement(InlineWaitFields, { initial: wait, locale, change: value => { wait = value; } });
      else if (active.kind === 'sound') details = numberField(t('音量（%）', 'Volume (%)', '音量（%）'), volume, 0, value => { volume = value; }, 100);
      else if (active.kind === 'expression') {
        const choices = project.characters.find(character => character.id === active.characterId)?.differences ?? [];
        details = choiceField(t('共同差分', 'Shared variation', '共通差分'), differenceId,
          choices.map(item => ({ value: item.id, label: item.name })), value => { differenceId = value; });
      } else {
        const cached = this.assetCache.get(active.assetId);
        const loaded = cached ? undefined : await this.services.getAsset?.(active.assetId);
        const model = cached ?? (loaded?.ok ? loaded.value : null);
        const expressions = model?.variants.find(item => item.id === (active.variantId ?? model.activeVariantId))?.groupCapabilities?.expressions ?? [];
        details = choiceField(t('模型表情', 'Model expression', 'モデル表情'), expressionName,
          expressions.map(name => ({ value: name, label: name })), value => { expressionName = value; });
      }
      await requestDialog({ title, locale, description: scene.name, content: createElement('div', {},
        numberField(t('正文位置', 'Text boundary', '本文の位置'), offset, 0, value => { offset = value; }), details),
        confirm: async () => {
          const nextOffset = offset ? Number(offset) : -1;
          const next = active.kind === 'wait' ? { id: active.id, kind: active.kind, offset: nextOffset, ...waitEventValues(wait) }
            : active.kind === 'sound' ? { ...active, offset: nextOffset, volume: volume ? Number(volume) : undefined }
              : active.kind === 'live2dExpression' ? { ...active, offset: nextOffset, expressionName }
                : { ...active, offset: nextOffset, differenceId };
          const candidate = DialogueEventSchema.safeParse(next);
          if (!candidate.success) throw new Error(t('请输入有效的句内事件参数。', 'Enter valid inline event values.', '有効なイベントの値を入力してください。'));
          const result = await this.controller.editDialogue({ op: 'dialogue.update', sceneId: target.sceneId, statementId: target.statementIds[0]!,
            events: events.flatMap(item => item.success ? [item.data.id === active.id ? candidate.data : item.data] : []) }, target, active.id);
          if (!this.notice(result)) throw new Error(issueText(result.error, locale));
          this.render();
        } });
    });
    edit.disabled = state.readOnly || events.some(item => !item.success);
    field.append(edit);
    return field;
  }
  private editor(): HTMLElement {
    const source = this.controller.source;
    const scene = this.followedScene() ?? (!this.activeDocument || this.activeDocument === 'route:editor' ? this.controller.scene : null);
    const main = el('main', 'authoring-editor');
    if (!source) { main.append(el('p', '', this.t('open'))); return main; }
    if (scene) {
      this.renderAuthoringToolbar(scene);
      main.append(this.sceneViewsNode(source, scene, this.sceneViews(scene.sceneId)));
    }
    return main;
  }
  private sceneViewsNode(source: AuthoringSource, scene: NonNullable<AuthoringController['scene']>, views: readonly AuthoringController['view'][]): HTMLElement {
    const center = el('div', 'authoring-scene-views');
    center.dataset.sceneDocument = scene.documentId;
    center.dataset.sceneRevision = String(scene.revision);
    center.dataset.sceneLocale = this.controller.preferences.locale;
    center.dataset.split = String(views.length > 1);
    for (const view of views) center.append(this.scenePane(source, scene, view, views.length > 1));
    return center;
  }
  private sceneSearch(): HTMLElement | null {
    const source = this.controller.source;
    if (!source) return null;
    const sceneId = this.followedScene()?.sceneId ?? null;
    const locale = this.controller.preferences.locale;
    if (this.sidebarView?.locale !== locale || this.sidebarView.state !== this.sidebarState) {
      this.sidebarView?.view.dispose();
      const view = createAuthoringSidebar({
        services: this.services, source, sceneId, state: this.sidebarState, locale,
        cache: asset => this.assetCache.set(asset.id, asset), locate: target => this.locateHit(target),
        changed: () => this.rememberWorkbench(),
        returnToOrigin: async () => {
          const origin = this.searchOrigin;
          if (!origin) return;
          await this.openDocument(origin.document);
          if (this.activeDocument !== origin.document.id) return;
          const scene = origin.scene;
          if (scene && this.followedScene()) {
            this.chooseSceneView(scene.view);
            this.controller.select(scene.selection?.statementIds ?? [], scene.selection?.primaryId ?? null);
            this.controller.setScroll(scene.scroll.statementId, scene.scroll.offsetPx, scene.scroll.scrollLeft);
            if (scene.caret && scene.view === 'script' && this.controller.scene?.revision === scene.revision)
              this.revealScriptOffset(scene.caret.statementId, scene.caret.documentOffset);
          }
          this.searchOrigin = null;
          this.sidebarState.located = false;
          this.render();
        },
      });
      this.sidebarView = { view, locale, state: this.sidebarState };
    } else this.sidebarView.view.update(source, sceneId);
    return this.sidebarView.view.node;
  }
  private sceneInspector(): HTMLElement | null {
    const source = this.controller.source;
    if (!source) return null;
    const inspector = el('aside', 'authoring-inspector');
    inspector.append(el('h2', '', this.t('inspector')), this.sourceControls('inspector'));
    const inspectorView = this.fixedInspectorSource ? 'cards' : this.controller.view;
    const inspected = this.resolveSceneSource(this.fixedInspectorSource ?? (this.followedScene() ? this.selectedSceneSource() : null), inspectorView);
    if (inspected?.event) inspector.append(this.eventProperties(inspected));
    else if (inspected) {
      const { scene, node } = inspected;
      const locale = this.controller.preferences.locale;
      const statementIds = this.fixedInspectorSource ? [node.id!] : this.controller.selection?.statementIds ?? [node.id!];
      const editTarget: StatementEditTarget = { projectId: source.project.projectId, sceneId: scene.sceneId, documentId: scene.documentId, revision: scene.revision, statementIds };
      const write = (changes: Parameters<AuthoringController['editFields']>[0], ids = statementIds) => this.controller.editFields(changes, ids, { ...editTarget, statementIds: ids });
      const registry = createCommandRegistry(source.project.engineVersion, this.studioPlugins?.commandSpecs() ?? []); const spec = registry.get(node.command);
      inspector.append(el('p', 'authoring-inspector-context', `${scene.name} / ${spec ? commandName(spec, locale) : ''} / ${statementIds.length} ${tr(locale,'条选中','selected','件選択')}`));
      const locate = button(tr(locale,'定位当前指令','Locate selected command','選択した命令へ'), async () => {
        if (this.controller.scene?.documentId !== scene.documentId) await this.openDocument({ kind: 'scene', objectId: scene.sceneId });
        if (this.controller.scene?.documentId !== scene.documentId) return;
        this.controller.select([node.id!]); this.render();
        this.root.querySelector<HTMLElement>(`[data-scene-view="${this.controller.view}"] [data-statement-id="${CSS.escape(node.id!)}"]`)?.scrollIntoView({ block: 'center' });
      }, 'authoring-inspector-locate'); inspector.append(locate);
      const fields = el('fieldset', 'authoring-inspector-fields');
      fields.disabled = !!this.controller.parsed('cards', scene)?.readOnly;
      inspector.append(fields);
      const args = node?.object?.value as Record<string, unknown> | undefined;
      const context = this.fieldContext(args ?? {});
      const sourceContext = this.fixedInspectorSource ? { ...context, sceneId: scene.sceneId, animationEditor: undefined, audioEditor: undefined, assetEditor: undefined, publicEditor: undefined,
        targetAvailability: (id: string) => this.miniStage?.objectAvailability(id, { sceneId: scene.sceneId, statementId: node.id! }) ?? 'unknown',
      } : context;
      if (node?.command === 'pixi') {
        const mount=el('div'), root=createRoot(mount);this.inspectorRoots.push(root);fields.append(mount);
        root.render(createElement(WeatherPresetPicker,{locale:this.controller.preferences.locale,disabled:fields.disabled||!this.services.weatherTexture,
          apply:async key=>{
            const imported=await this.services.weatherTexture!(key);if(!imported.ok)throw new Error(issueText(imported.error,this.controller.preferences.locale));
            this.assetCache.set(imported.value.id,imported.value);await this.controller.refresh();
            const preset=StageWeatherPresets[key];
            const fields={type:key,effectId:args?.effectId??createId(this.controller.source),resourceId:imported.value.id,target:args?.target??{kind:'stage'},enabled:true,density:preset.density,speed:preset.speed,directionDeg:preset.directionDeg,parameters:preset.parameters};
            const edited=await write(Object.entries(fields).map(([field,value])=>({field,op:'set' as const,value:asJson(value)})),[node.id!]);if(!edited.ok)throw new Error(issueText(edited.error,this.controller.preferences.locale));this.render();
          }}));
      }
      if(node&&['changeBg','bgm','video','unlockCg','unlockBgm','unlockVideo'].includes(node.command))fields.append(button(tr(this.controller.preferences.locale,'加入鉴赏 / 管理条目','Add to gallery / Manage items','鑑賞に追加・項目管理'),()=>{void this.navigate('pages').then(()=>this.designer?.openPage('gallery-content'));}));
      if (node?.command === 'changeFigure') {
        const modes=el('div','portrait-kind-switch'); modes.setAttribute('aria-label',tr(this.controller.preferences.locale,'立绘类型','Character art type','立ち絵の種類'));
        const current=this.assetCache.get(String(args?.assetId));
        for (const kind of ['image','live2d'] as const) { const select=button(kind==='image'?tr(this.controller.preferences.locale,'图片立绘','Image','画像'):'Live2D',async()=>{
          await openAssetPicker({ ...sourceContext, allowedKinds:[kind], locale:this.controller.preferences.locale,currentAssetId:current?.kind===kind?current.id:null,
            purpose:kind==='image'?tr(this.controller.preferences.locale,'选择图片立绘','Choose character art','立ち絵を選択'):'Live2D',mode:'compact',returnFocus:select,
            onApply:async choice=>{this.assetCache.set(choice.asset.id,choice.asset);const result=await write([{field:'assetId',op:'set',value:choice.assetId}]);if(this.notice(result))this.render();return result;} });
        },current?.kind===kind?'selected':'');select.setAttribute('aria-pressed',String(current?.kind===kind));modes.append(select); } fields.append(modes);
      }
      const more = el('details', 'command-more'); more.open = this.inspectorMoreOpen;
      more.append(el('summary', '', tr(this.controller.preferences.locale, '更多属性', 'More properties', '詳細プロパティ')));
      more.addEventListener('toggle', () => { this.inspectorMoreOpen = more.open; });
      if(inspectorView==='script'&&spec){
        fields.append(el('h3','',commandName(spec,this.controller.preferences.locale)));
        const summary=el('dl','source-command-summary');
        for(const field of spec.fields.filter(field=>field.path!=='text'&&!ownsIdentity(spec.key,field.path,args??{})&&args?.[field.path]!=null).slice(0,5)){summary.append(el('dt','',fieldLabel(field,this.controller.preferences.locale,spec.key)),el('dd','',this.displayParameter(args?.[field.path])));}
        fields.append(summary);
      }
      for (const field of spec ? commandFields(spec.key, spec.fields, args ?? {}) : []) {
        if(this.effectEditor?.sceneId===scene.sceneId&&this.effectEditor.statementId===node?.id&&field.path!=='effects')continue;
        if(inspectorView==='script'&&field.path!=='effects')continue;
        if(inspectorView==='writing'&&node?.command==='say'&&['speaker','text'].includes(field.path))continue;
        if (field.path === 'ruleImage' && node.command === 'changeBg' && args?.op === 'clear' && args?.ruleImage == null) continue;
        const row = el(field.type === 'object' || field.type === 'ref' || field.path === 'loopStartSec' || spec!.key==='say'&&field.path==='text' ? 'div' : 'label', 'authoring-field'); row.dataset.field = field.path; row.append(el('span', '', fieldLabel(field, this.controller.preferences.locale, spec!.key) + (field.required && !ownsIdentity(spec!.key,field.path,args ?? {}) ? tr(this.controller.preferences.locale, ' · 必填', ' · Required', ' · 必須') : '')));
        if(field.path==='effects'){
          if (this.effectEditor?.sceneId === scene.sceneId && this.effectEditor.statementId === node?.id) row.append(this.effectEditor.node);
          else {
            if (node?.command === 'changeBg' && inspectorView !== 'script') {
              const mount = el('div'), root = createRoot(mount); this.inspectorRoots.push(root); row.append(mount);
              const target = { sceneId: scene.sceneId, statementId: node.id! };
              const end = () => { if (this.fieldPreview?.sceneId === target.sceneId && this.fieldPreview.statementId === target.statementId) { this.fieldPreview = null; this.updateMiniStage(); } };
              root.render(createElement(SceneVisualFields, { value: (args?.effects ?? {}) as Record<string, Json>, fields: field.children ?? [], disabled: fields.disabled, locale: this.controller.preferences.locale,
                preview: (field, value) => { this.fieldPreview = { ...target, field, value }; this.updateMiniStage(); }, end,
                commit: async (field, value) => {
                  const result = await write([{ field, op: 'set', value }], [target.statementId]);
                  if (!result.ok) throw new Error(result.error.message);
                  end(); this.render();
                } }));
            }
            row.append(button(tr(this.controller.preferences.locale,'编辑视觉效果','Edit visual effects','表示効果を編集'),()=>this.effectsDialog(field,fieldValue(args??{},field.path),{ ...editTarget, statementIds: [node.id!] })));
          }
          fields.append(row);continue;
        }
        if (field.path === 'ruleImage') {
          row.append(ruleImageField(args?.ruleImage, async value => {
            const result = await write([{ field: 'ruleImage', op: value === null ? 'inherit' : 'set', value }]);
            if (result.ok) { this.notice(result); this.render(); }
            return result;
          }, [...this.assetCache.values()], locale, sourceContext));
          fields.append(row); continue;
        }
        if(node?.command==='changeBg'&&field.path==='transition') {
          const mount=el('div','background-transition-mount'),root=createRoot(mount);this.inspectorRoots.push(root);
          root.render(createElement(BackgroundTransition,{key:`${scene.documentId}/${scene.revision}`,value:fieldValue(args??{},field.path),locale:this.controller.preferences.locale,readOnly:fields.disabled,
            onCommit:async changes=>{const result=await write(changes);if(!result.ok)throw new Error(result.error.message);this.render();}}));row.append(mount);
          const advanced=el('details','background-transition-advanced');advanced.append(el('summary','',tr(this.controller.preferences.locale,'高级转场参数','Advanced transition settings','トランジションの詳細設定')),
            inputFor(field,fieldValue(args??{},field.path),value=>write([{field:field.path,op:'set',value}]).then(result=>{if(this.notice(result))this.render();return result;}),[...this.assetCache.values()],this.references(),this.controller.preferences.locale,false,undefined,{...sourceContext,command:spec!.key}));
          row.append(advanced);fields.append(row);continue;
        }
        if (node?.command === 'changeBg' && field.path === 'assetId') {
          const mount = el('div'), root = createRoot(mount); this.inspectorRoots.push(root); row.append(mount);
          root.render(createElement(BackgroundObjectField, { services: this.services, projectId: source.project.projectId, sceneId: scene.sceneId,
            asset: this.assetCache.get(String(args?.assetId)) ?? null, currentAssetId: typeof args?.assetId === 'string' ? args.assetId : null, variantId: null,
            locale: this.controller.preferences.locale, disabled: fields.disabled,
            commit: async asset => {
              if (asset.id === args?.assetId) return;
              const result = await write([{ field: 'assetId', op: 'set', value: asset.id }], [node.id!]);
              if (!result.ok) throw new Error(result.error.message);
              this.assetCache.set(asset.id, asset); this.render();
            } })); fields.append(row); continue;
        }
        if (node?.command === 'playEffect' && field.path === 'soundId' && args?.op === 'stop') {
          const mount=el('div'), root=createRoot(mount); this.inspectorRoots.push(root);
          root.render(createElement(SoundInstancePicker, { value:String(args.soundId??''), locale:this.controller.preferences.locale,
            items:soundInstances(source.scenes,scene.sceneId,node.id??undefined,[...this.assetCache.values()]), disabled:args.all===true,
            choose:async id=>{const result=await write([{field:'soundId',op:'set',value:id}],[node.id!]);if(!result.ok)throw new Error(issueText(result.error,this.controller.preferences.locale));this.render();} }));
          row.append(mount); fields.append(row); continue;
        }
        row.append(inputFor(field, fieldValue(args ?? {}, field.path), value => {
          row.querySelectorAll('.field-error').forEach(element => element.remove());
          const errors = validateFields([field], { [field.path]: value }, field => fieldLabel(field, this.controller.preferences.locale, spec!.key), this.controller.preferences.locale);
          const control = row.querySelector<HTMLElement>('input,select,textarea');
          const showError = (message: string) => {
            const feedback = el('small', 'field-error', message);
            feedback.id = `inspector-error-${field.path}`;
            feedback.setAttribute('role', 'alert');
            row.append(feedback);
            control?.setAttribute('aria-invalid','true');
            control?.setAttribute('aria-describedby',feedback.id);
          };
          if (errors.length) {
            const message = errors.map(error => error.message).join('；');
            showError(message);
            const error={code:'FIELD_REQUIRED',message,severity:'error' as const,owner:'M01' as const,related:[],actions:['edit' as const]};return {ok:false as const,error,issues:[error]};
          }
          control?.removeAttribute('aria-invalid'); control?.removeAttribute('aria-describedby');
          const edited=spec!.key==='setComplexAnimation'&&['animation','segments','resourceId'].includes(field.path)?write(animationSourceChanges(args??{},field.path,value)):field.type==='boolean'&&typeof value==='boolean'?this.controller.editBooleanField(field,value,statementIds,editTarget):write([{ field: field.path, op: 'set', value }]);
          return edited.then(result => {
            if (result.ok) { this.notice(result); this.render(); }
            else showError(issueText(result.error, locale));
            return result;
          }); }, [...this.assetCache.values()], this.references(), this.controller.preferences.locale, ownsIdentity(spec!.key,field.path,args ?? {}),()=>this.framingSize(args??{}),{...sourceContext,command:spec!.key}));
        if(spec!.key==='return' && field.path==='value')row.append(el('p','field-help',fieldHint(field,fieldLabel(field,this.controller.preferences.locale,spec!.key),this.controller.preferences.locale,spec!.key)));
        (spec!.key==='setComplexAnimation'&&['animation','resourceId'].includes(field.path) || field.required || ['voice', 'assetId', 'op', 'durationMs', 'framing','station','model'].includes(field.path) || spec!.key === 'playEffect' && ['loop','all','volume'].includes(field.path) || spec!.key === 'end' && field.path === 'target' || spec!.key === 'return' && field.path === 'value' ? fields : more).append(row);
      }
      if (more.children.length > 1) fields.append(more);
    }
    return inspector;
  }
  private workbenchPreferences(): HTMLElement {
    this.preferencesRoot ??= createRoot(this.preferencesNode);
    this.preferencesRoot.render(createElement(WorkbenchPreferences, {
      preferences: this.controller.preferences,
      onChange: async update => {
        const result = await this.controller.setPreference(update);
        if (result.ok) this.render();
        return result;
      },
      onResetLayout: () => this.shellAction('resetLayout'),
    }));
    return this.preferencesNode;
  }
  private sceneProblems(): HTMLElement | null {
    if (!this.controller.source) return null;
    const locale = this.controller.preferences.locale, status = this.controller.status;
    const issues = [...new Map([...status.issues, ...this.releaseIssues, ...(this.controller.engineIssue ? [this.controller.engineIssue] : [])].map(issue => [JSON.stringify([issue.code, issue.source, issue.message]), issue])).values()];
    const problemList = el('div', 'authoring-diagnostic-content');
    const count = el('h2', 'authoring-problem-count', `${this.t('problems')} · ${issues.length}`);
    count.setAttribute('aria-live', 'polite');
    problemList.append(count);
    if (issues.length) for (const issue of issues) {
      const text = issueText(issue, locale);
      const row = issue.source || issue.owner === 'M11' || issue.owner === 'M09' && issue.details
        ? button(text, () => this.locateProblem(issue), 'authoring-diagnostic-link')
        : el('p', '', text);
      row.dataset.issueCode = issue.code;
      row.title = issue.message;
      problemList.append(row);
    }
    else problemList.append(el('p', '', this.t('noProblems')));
    return problemList;
  }
  private renderOutput(): HTMLElement | null {
    if (!this.controller.source) return null;
    const builds = (this.services.bridge as Partial<import('../../desktop-bridge.js').DesktopBridge>).builds;
    if (!this.outputRoot) {
      this.outputRoot = createRoot(this.outputNode);
      this.outputNode.addEventListener('scroll', () => {
        if (!this.outputNode.isConnected || this.outputNode.closest('[hidden]')) return;
        this.output = { ...this.output, scrollTop: this.outputNode.scrollTop };
        this.rememberWorkbench();
      });
    }
    this.outputRoot.render(createElement(StudioOutput, {
      locale: this.controller.preferences.locale, output: { ...this.output }, failure: this.outputFailure, pendingBuild: this.pendingBuild,
      openDocument: id => {
        const document = this.documents.find(item => item.id === id);
        if (document) { void this.openDocument(document); return; }
        if (id.startsWith('scene:')) void this.openDocument({ kind: 'scene', objectId: id.slice(6) });
        else if (id.startsWith('asset:')) void this.openDocument({ kind: 'asset', objectId: id.slice(6) });
        else if (id.startsWith('route:')) void this.navigate(id.slice(6) as Page);
        else if (id === 'startup') void this.openDocument({ kind: 'startup' });
        else void this.openDocument({ kind: 'project' });
      },
      openPublish: () => { void this.navigate('publish'); },
      openInstructions: builds ? (id: string) => {
        void builds.instructions(id).then(result => { if (!this.notice(result)) this.render(); });
      } : undefined,
    }));
    return this.outputNode;
  }
  private recordBuild(planId: string, receipt: BuildReceipt): void {
    if (receipt.projectId !== this.controller.source?.project.projectId) return;
    this.pendingBuild = undefined;
    this.output = { ...this.output, built: { planId, receipt } };
    if (this.outputFailure?.kind === 'build') this.outputFailure = undefined;
    this.renderOutput();
    this.rememberWorkbench();
  }
  private effectsDialog(spec: FieldSpec, value: unknown, editTarget: StatementEditTarget) {
    this.effectEditor?.dispose(); this.effectEditor = null;
    const locale=this.controller.preferences.locale, dialog=el('section','effects-inspector-editor');
    let draft=structuredClone(value??{}) as Record<string, Json>;
    const target = { sceneId: editTarget.sceneId, statementId: editTarget.statementIds[0]! };
    const origin = document.activeElement as HTMLElement | null, roots: Root[] = [];
    const dispose = () => { roots.splice(0).forEach(root => root.unmount()); dialog.remove(); };
    const close = () => { dispose(); this.effectEditor = null; this.updateMiniStage(); this.render();
      const trigger = this.root.querySelector<HTMLButtonElement>('.authoring-inspector [data-field="effects"] button');
      (origin?.isConnected ? origin : trigger)?.focus({ preventScroll: true }); };
    const update=()=>{ if (this.effectEditor) this.effectEditor.draft=draft; this.updateMiniStage(); };
    dialog.append(el('p','',tr(locale,'调整时预览当前指令；点击应用后写入，取消不会修改指令。','Preview this command while adjusting. Apply commits the changes; Cancel leaves it unchanged.','調整中は現在の文をプレビュー。適用で確定、キャンセルで変更を破棄します。')));
    const fields=el('div','effects-fields');
    const groups = [
      { label: tr(locale,'位置与变换','Position & transform','位置と変換'), keys: ['x','y','scaleX','scaleY','rotationDeg','opacity','z','station'] },
      { label: tr(locale,'颜色与混合','Color & blending','色と合成'), keys: ['blur','brightness','contrast','saturation','gamma','rgb','blend'] },
      { label: tr(locale,'滤镜与光效','Filters & lighting','フィルターと光'), keys: ['bloom','bevel','filters'] },
    ];
    const expandedGroups=new Map<string,boolean>();
    const draw=()=>{
      roots.splice(0).forEach(root=>root.unmount()); fields.replaceChildren();
      for(const group of groups){const body=el('div','effects-group-fields');
        for(const child of spec.children??[]){if(!group.keys.includes(child.path))continue;
          const row=el('div','authoring-field');row.append(el('span','',fieldLabel(child,locale)),inputFor(child,draft[child.path],next=>{draft={...draft,[child.path]:next};if(next===null&&!child.nullable&&!child.required)delete draft[child.path];update();},[...this.assetCache.values()],this.references(),locale,false,undefined,{...this.fieldContext({},dialog,true),visualEffectField:(node,field,value,change)=>{const root=createRoot(node);roots.push(root);root.render(createElement(EffectField,{spec:field,value,locale,change:next=>{void change(next);}}));}}));body.append(row);
        }
        const mount=el('div','effects-group'),root=createRoot(mount);roots.push(root);fields.append(mount);
        const renderGroup=()=>root.render(createElement(Disclosure,{open:expandedGroups.get(group.label)??group===groups[0],onOpenChange:open=>{expandedGroups.set(group.label,open);renderGroup();},children:[createElement('span',{key:'title'},group.label),createElement(DomRegion,{key:'fields',node:body})]}));renderGroup();
      }
    };draw();dialog.append(fields);
    const errors=el('p','field-error');dialog.append(errors);
    const actions=el('footer','dialog-actions');actions.append(button(tr(locale,'重置本次调整','Reset these changes','今回の変更をリセット'),()=>{draft={};draw();update();}),button(this.t('cancel'),close),button(this.t('apply'),async()=>{
      const issues=validateFields([spec],{[spec.path]:draft},f=>fieldLabel(f,locale),locale);if(issues.length){errors.textContent=issues.map(i=>i.message).join('；');return;}
      const result=await this.controller.editFields([{field:spec.path,op:'set',value:draft}], [target.statementId], editTarget);if(this.notice(result)){close();this.render();} else errors.textContent = result.error.message;
    }, 'authoring-primary'));dialog.append(actions); this.effectEditor = { ...target, field: spec.path, draft, node: dialog, dispose };
    this.render(); update();
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); close(); } });
    requestAnimationFrame(()=>dialog.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true}));
  }
  private async chooseAssetImport(): Promise<void> {
    if (this.importingAssets) return;
    const epoch = this.assetProjectEpoch;
    const chosen = await this.services.pickAssetFiles();
    if (epoch === this.assetProjectEpoch && this.notice(chosen) && chosen.value.length) await this.importAssetPaths(chosen.value);
  }
  private async importAssetPaths(paths: string[], retry?: { id: number; result: AssetImportResult }): Promise<void> {
    if (this.importingAssets || !this.services.importAssets) return;
    const epoch = this.assetProjectEpoch;
    this.importingAssets = true; this.message = ''; this.render();
    let receiptRecorded = false;
    const updateResult = (result: AssetImportResult) => {
      receiptRecorded = true;
      if (retry) retry.result = result;
      else this.assetImportResults.push({ id: ++this.assetImportSequence, result });
    };
    try {
      const imported = await this.services.importAssets(paths);
      if (epoch !== this.assetProjectEpoch) return;
      if (!imported.ok) { updateResult({ succeeded: retry?.result.succeeded ?? 0, failed: paths.map(path => ({ path, reason: imported.error.message })) }); return; }
      updateResult(mergeAssetImportResult(imported.value, retry?.result));
      imported.value.succeeded.forEach(asset => this.assetCache.set(asset.id, asset));
      await this.controller.refresh();
      if (epoch === this.assetProjectEpoch) await this.showAssets();
    } catch (error) {
      if (epoch !== this.assetProjectEpoch) return;
      if (receiptRecorded) { this.messageTone = 'error'; this.message = String(error); }
      else updateResult({ succeeded: retry?.result.succeeded ?? 0, failed: paths.map(path => ({ path, reason: String(error) })) });
    }
    finally { if (epoch === this.assetProjectEpoch) { this.importingAssets = false; this.render(); } }
  }
  private assets(): { node: HTMLElement; tools: HTMLElement } {
    const main = el('section', 'authoring-assets');
    main.ariaBusy = String(this.assetQueryPending);
    main.addEventListener('scroll', () => {
      if (main.isConnected && !main.closest('[hidden]') && this.assetLibraryScroll !== main.scrollTop) {
        this.assetLibraryScroll = main.scrollTop; this.rememberWorkbench();
      }
    });
    const locale = this.controller.preferences.locale;
    main.ariaLabel = tr(locale, '素材库', 'Asset library', '素材ライブラリ');
    let dragDepth = 0;
    main.addEventListener('dragenter', event => { if (!event.dataTransfer?.types.includes('Files')) return; event.preventDefault(); dragDepth++; main.classList.add('asset-drag-over'); });
    main.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = this.importingAssets ? 'none' : 'copy'; } });
    main.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; main.classList.remove('asset-drag-over'); } });
    main.addEventListener('drop', event => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault(); dragDepth = 0; main.classList.remove('asset-drag-over');
      const paths = window.studioBridge?.files.pathsForFiles?.([...event.dataTransfer.files]) ?? [];
      if (!paths.length) { this.message = tr(locale, '请从本机文件夹拖入素材文件。', 'Drag asset files from a local folder.', 'ローカルの素材ファイルをドロップしてください。'); this.render(); return; }
      void this.importAssetPaths(paths);
    });
    const heading = el('header', 'assets-heading');
    const importButton = button(this.importingAssets ? tr(locale, '正在导入…', 'Importing…', '読込中…') : this.t('import'), () => this.chooseAssetImport(), 'authoring-primary');
    importButton.disabled = this.importingAssets;
    heading.append(el('span', 'asset-count', `${this.assetPage?.total ?? 0} ${tr(locale, '项素材', 'assets', '素材')}`), importButton); main.append(heading);
    for (const report of this.assetImportResults) {
      const mount = el('div', 'asset-import-result-mount'), root = createRoot(mount); this.inspectorRoots.push(root); main.append(mount);
      root.render(createElement(AssetImportSummary, { result: report.result, locale, busy: this.importingAssets,
        retry: this.services.importAssets ? () => { void this.importAssetPaths(failedAssetPaths(report.result), report); } : undefined,
        dismiss: () => { this.assetImportResults = this.assetImportResults.filter(item => item.id !== report.id); this.render(); },
      }));
    }
    const controls = el('div', 'authoring-toolbar asset-query-bar'); const search = el('input'); search.placeholder = tr(locale,'按素材名称搜索，例如雨站或立绘','Search asset names, e.g. station or character','素材名で検索（例：駅・立ち絵）'); search.value = this.assetQuery.text;
    search.dataset.dockFocus = '';
    const commitSearch = () => { if (search.value !== this.assetQuery.text) this.changeAssetQuery({ text: search.value }); };
    search.addEventListener('change', commitSearch);
    search.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); commitSearch(); } });
    controls.append(search);
    search.setAttribute('aria-label', this.t('search'));
    const sort = el('select'); sort.ariaLabel = tr(locale, '排序方式', 'Sort by', '並び替え'); for (const [value, label] of [['name', tr(locale, '名称', 'Name', '名前')], ['size', tr(locale, '大小', 'Size', 'サイズ')], ['modified', tr(locale, '修改时间', 'Modified', '更新日')]] as const) {
      const option = el('option', '', label); option.value = value; sort.append(option);
    }
    sort.value = this.assetQuery.sort ?? 'name'; sort.addEventListener('change', () => this.changeAssetQuery({
      sort: sort.value as NonNullable<AssetQuery['sort']> })); controls.append(sort);
    const direction = el('select'); direction.ariaLabel = tr(locale, '排序方向', 'Sort direction', '並び順'); for (const [value, label] of [['asc', tr(locale, '升序', 'Ascending', '昇順')], ['desc', tr(locale, '降序', 'Descending', '降順')]] as const) {
      const option = el('option', '', label); option.value = value; direction.append(option);
    }
    direction.value = this.assetQuery.direction ?? 'asc'; direction.addEventListener('change', () => this.changeAssetQuery({
      direction: direction.value as NonNullable<AssetQuery['direction']> })); controls.append(direction);
    heading.prepend(controls);
    const filtered = Boolean(this.assetQuery.text || this.assetQuery.kind || this.assetQuery.folder?.length || Object.keys(this.assetQuery.typeFields ?? {}).length);
    const clearFilters = () => this.changeAssetQuery({ text: '', kind: null, folder: null, typeFields: {} });
    if (filtered) controls.append(button(tr(locale, '清除筛选', 'Clear filters', '絞り込みを解除'), clearFilters, 'asset-clear-filters'));
    const tools = el('div', 'asset-tool-accordion'), toolBody = el('div', 'asset-tool-body');
    toolBody.append(el('p','asset-model-status',this.modelPreparationStatus || tr(locale,'准备模型后，可在图片属性中使用本机去背。首次准备需要下载模型。','Prepare the model to remove backgrounds in image properties. The first preparation downloads the model.','モデルを準備すると画像のプロパティで背景を除去できます。初回はダウンロードが必要です。')));
    const prepareModel = button(tr(locale, this.preparingModel ? '正在准备去背模型…' : '准备本机去背模型', this.preparingModel ? 'Preparing model…' : 'Prepare background removal model', this.preparingModel ? 'モデルを準備中…' : '背景除去モデルを準備'), async () => {
      if (this.preparingModel) return;
      this.preparingModel = true; this.assetToolsOpen = true; this.messageTone = 'info';
      this.message = tr(locale, '正在检查去背模型；首次使用会下载模型，请保持网络连接。', 'Checking the model. First use downloads it; keep your connection available.', 'モデルを確認中。初回はダウンロードします。'); this.modelPreparationStatus=this.message; this.render();
      const unsubscribe = this.services.bridge.operations?.subscribe(operation => {
        if (!this.preparingModel || !['downloading', 'verifying', 'ready'].includes(operation.phase)) return;
        const phase = operation.phase === 'downloading' ? tr(locale, '正在下载去背模型', 'Downloading model', 'モデルをダウンロード中') : tr(locale, '正在检查并初始化去背模型', 'Checking and initializing model', 'モデルを初期化中');
        const progress = operation.total && operation.completed !== undefined ? ` ${Math.min(100, Math.round(operation.completed / operation.total * 100))}%` : '';
        this.message = phase + progress;
        this.modelPreparationStatus=this.message;
        const status=this.root.querySelector('.asset-model-status');if(status)status.textContent=this.modelPreparationStatus;
        const notice = this.root.querySelector('.authoring-notice > span'); if (notice) notice.textContent = this.message;
      });
      try {
        const result = await this.services.prepareMattingModel?.();
        if (result?.ok) { this.messageTone = 'success'; this.message = tr(locale, '去背模型已准备好。请选择图片，在素材详情中使用「本机去背」。', 'Model ready. Select an image and use local background removal in its details.', '準備できました。画像の詳細から背景除去を実行できます。'); }
        else { this.messageTone = 'error'; this.message = tr(locale, '去背模型准备失败，请检查网络与磁盘空间后重试。', 'Could not prepare the model. Check network and disk space, then retry.', 'モデルの準備に失敗しました。接続と空き容量を確認してください。') + (result && !result.ok ? ` ${result.error.message}` : ''); }
      } catch (error) { this.messageTone = 'error'; this.message = String(error); }
      finally { unsubscribe?.(); this.preparingModel = false; this.modelPreparationStatus=this.message; this.render(); }
    }); prepareModel.disabled = this.preparingModel; toolBody.append(prepareModel);
    const toolRoot=createRoot(tools);this.inspectorRoots.push(toolRoot);
    toolRoot.render(createElement(Disclosure,{open:this.assetToolsOpen,onOpenChange:open=>{this.assetToolsOpen=open;this.render();},children:[createElement('span',{key:'title'},tr(locale,'本机去背','Local background removal','ローカル背景除去')),createElement(DomRegion,{key:'body',node:toolBody})]}));

    const selected=this.assetSelectionBar();
    main.append(selected);
    if (this.assetQueryError) {
      const error = el('div', 'authoring-toolbar');
      const message = el('span', 'field-error', this.assetQueryError); message.setAttribute('role', 'alert');
      error.append(message, button(tr(locale, '重试查询', 'Retry search', '検索を再試行'), () => this.showAssets()));
      main.append(error);
      if (!this.assetPage) return { node: main, tools };
    } else if (this.assetQueryPending && !this.assetPage) {
      const loading = el('p', 'field-help', tr(locale, '正在读取素材…', 'Loading assets…', '素材を読み込み中…'));
      loading.setAttribute('role', 'status'); main.append(loading);
      return { node: main, tools };
    }
    const dropHint = el('div', 'asset-drop-hint'); dropHint.append(actionIcon('upload'), el('span', '', tr(locale, '拖入文件即可导入 · 图像、音频、视频、字体、Live2D', 'Drop files to import · images, audio, video, fonts, Live2D', 'ファイルをドロップ · 画像・音声・動画・フォント・Live2D'))); main.append(dropHint);
    const list = el('div', 'authoring-asset-list');
    for(const id of this.assetRows.keys())if(!this.assetPage?.items.some(asset=>asset.id===id))this.assetRows.delete(id);
    for (const asset of this.assetPage?.items ?? []) {
      const cached=this.assetRows.get(asset.id);if(cached?.asset===asset&&cached.locale===locale){cached.node.classList.toggle('inspected',this.focusedAsset?.id===asset.id);cached.node.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked=this.selectedAssets.has(asset.id);list.append(cached.node);continue;}
      const row = el('article', 'authoring-asset'); row.dataset.pluginAssetId = asset.id; row.dataset.assetKind = asset.kind; const select = el('input'); select.type = 'checkbox'; select.checked = this.selectedAssets.has(asset.id); select.ariaLabel = `${this.t('selected')} ${asset.name}`;
      row.classList.toggle('inspected', this.focusedAsset?.id === asset.id);
      row.tabIndex = 0; row.setAttribute('aria-label', asset.name);
      row.addEventListener('click', event => { if (!(event.target as HTMLElement).closest('button,input')) this.selectAsset(asset.id, event); });
      row.addEventListener('dblclick', event => { const target=event.target as HTMLElement;if(target.closest('.asset-row-name'))void this.editAssetName(asset.id);else if(target.closest('.authoring-asset-thumbnail'))void this.previewAsset(asset.id); });
      const openMenu = (origin: HTMLElement, point?: MouseEvent) => {
        const anchor=this.root.querySelector<HTMLElement>(`[data-plugin-asset-id="${asset.id}"]${origin===row?'':' .authoring-object-more'}`)??row;
        const scope=[...this.selectedAssets], hidden=scope.filter(id=>!this.assetPage?.items.some(item=>item.id===id)).length;
        showObjectMenu({element:anchor,kind:point||anchor===row?'context':'dropdown',...(point?{x:point.clientX,y:point.clientY}:{})},this.assetMenuGroups(asset.id,scope,hidden));
      };
      row.addEventListener('contextmenu',event=>{if((event.target as HTMLElement).closest('input,textarea'))return;event.preventDefault();event.stopPropagation();void openMenu(row,event);});
      row.addEventListener('keydown', event => { if(event.target!==row||event.isComposing)return;if(event.key==='F2'){event.preventDefault();void this.editAssetName(asset.id);}if(event.key==='Enter'){event.preventDefault();void this.previewAsset(asset.id);}if(isObjectMenuKey(event)){event.preventDefault();event.stopPropagation();void openMenu(row);} });

      select.addEventListener('change', () => {
        if (select.checked) this.selectedAssets.add(asset.id); else this.selectedAssets.delete(asset.id);
        this.assetRangeAnchor = asset.id; this.selectedDetails = null;
        this.selectedAtIndexRevision = this.assetPage?.indexRevision ?? null;
        this.queryAtSelection = { ...this.assetQuery }; this.refreshAssetSelection();
      }); row.append(select);
      if (asset.kind === 'image') {
        const visual = el('div', 'authoring-asset-thumbnail');
        const image = el('img'); image.alt = asset.name; image.dataset.assetId = asset.id;
        image.dataset.variantId = asset.activeVariantId; visual.append(image); row.append(visual);
      }
      else { const visual = el('div', 'authoring-asset-thumbnail'); if (this.services.assetUi?.has(asset.kind, asset.variants.find(item => item.id === asset.activeVariantId)?.typeData, 'thumbnail')) { visual.dataset.assetThumbnail = asset.id; visual.dataset.variantId = asset.activeVariantId; } visual.append(assetTypeIcon(asset.kind, this.assetTypes)); row.append(visual); }
      const bytes = asset.variants.find(variant => variant.id === asset.activeVariantId)?.files.reduce((sum, file) => sum + file.bytes, 0) ?? 0;
      const size = bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
      const duration = asset.variants.find(variant => variant.id === asset.activeVariantId)?.metadata.durationSec;
      const durationLabel = typeof duration === 'number' ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')} · ` : '';
      row.append(el('strong', 'asset-row-name', asset.name), el('span', '', assetTypeName(asset.kind, this.assetTypes, locale)), el('small', '', `${durationLabel}${asset.folder.join('/') || '/'} · ${size} · ${asset.modifiedAt.slice(0,10)}`));
      const more=button('⋯',()=>openMenu(more),'authoring-object-more');more.ariaLabel=tr(locale,`更多操作 · ${asset.name}`,`More actions · ${asset.name}`,`その他の操作 · ${asset.name}`);row.append(more);
      const preview = button(this.t('preview'), () => this.previewAsset(asset.id), 'asset-row-preview'); preview.ariaLabel = tr(locale, `预览 ${asset.name}`, `Preview ${asset.name}`, `${asset.name} をプレビュー`); row.append(preview);
      row.draggable = true; row.addEventListener('dragstart', event => event.dataTransfer?.setData('text/x-galcraft-asset', asset.id));
      this.assetRows.set(asset.id,{asset,locale,node:row});list.append(row);
    }
    main.append(list);
    if (!this.assetPage?.items.length) { const empty = el('section', 'asset-empty');
      empty.append(actionIcon('upload'));
      if (filtered) empty.append(el('h2', '', tr(locale, '没有匹配的素材', 'No matching assets', '一致する素材がありません')),
        el('p', '', tr(locale, '试试其他名称、类型或目录。已选素材仍然保留。', 'Try another name, type or folder. Selected assets are retained.', '名前・種類・フォルダーを変更してください。選択した素材は保持されます。')),
        button(tr(locale, '清除筛选', 'Clear filters', '絞り込みを解除'), clearFilters));
      else empty.append(el('h2', '', tr(locale, '给故事添一些画面与声音', 'Make room for images and sound', '物語に画像と音声を')),
        el('p', '', tr(locale, '将素材拖到这里，或选择本机文件。支持批量导入。', 'Drop assets here or choose local files. Multiple files are supported.', '素材をドロップするか、ファイルを選択。複数ファイルに対応。')),
        button(tr(locale, '选择文件', 'Choose files', 'ファイルを選択'), () => this.chooseAssetImport(), 'asset-choose'));
      empty.querySelector('button')!.disabled = this.importingAssets; main.append(empty); }
    if (this.mattingCandidate) {
      const candidate = el('section', 'authoring-panel'); candidate.append(el('h2', '', tr(locale, '透明版本候选', 'Transparent version candidate', '透過バージョン候補')));
      const preview = el('img'); preview.src = this.mattingCandidate.previewUri; preview.alt = tr(locale, '透明版本预览', 'Transparent version preview', '透過バージョンのプレビュー'); candidate.append(preview);
      const current = this.mattingCandidate;
      const floating = current.references.filter(item => item.variantId === null);
      candidate.append(el('p', '', tr(locale, `“用于全部浮动引用”会让 ${floating.length} 条引用采用透明版本。`, `Use for all floating references applies the transparent version to ${floating.length} references.`, `「すべての可変参照に使用」で ${floating.length} 件の参照に透過バージョンを適用します。`)));
      for (const reference of floating) candidate.append(el('p', 'authoring-reference-impact', reference.label));
      const selected = button(tr(locale, '新建素材并转移所选引用', 'Create asset and move selected references', '新規素材を作成し選択した参照を移動'), () => {
        const sources = current.references.filter(item => current.selectedSourceKeys.has(JSON.stringify(item.source))).map(item => item.source);
        if (sources.length) void this.confirmBackground({ kind: 'newAssetSelectedRefs', sources });
      }); selected.disabled = current.selectedSourceKeys.size === 0;
      for (const reference of current.references) {
        const row = el('label', 'authoring-field'); const checkbox = el('input'); checkbox.type = 'checkbox';
        const key = JSON.stringify(reference.source);
        checkbox.checked = current.selectedSourceKeys.has(key);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) current.selectedSourceKeys.add(key); else current.selectedSourceKeys.delete(key);
          selected.disabled = current.selectedSourceKeys.size === 0;
        });
        row.append(checkbox, el('span', '', `${reference.label} · ${reference.variantId === null ? tr(locale, '浮动引用', 'Floating reference', '可変参照') : tr(locale, '固定版本引用', 'Pinned version', '固定バージョン参照')}`)); candidate.append(row);
      }
      candidate.append(button(tr(locale, `用于全部 ${floating.length} 条浮动引用`, `Use for all ${floating.length} floating references`, `${floating.length} 件すべての可変参照に使用`), () => this.confirmBackground('allFloating')));
      candidate.append(button(tr(locale, '保留当前引用', 'Keep current references', '現在の参照を保持'), () => this.confirmBackground('keepCurrent')));
      candidate.append(selected);
      candidate.append(button(this.t('cancel'), async () => { const prepared = this.mattingCandidate; if (!prepared) return;
        const result = await this.services.discardBackground?.(prepared.preparationId); if (result && this.notice(result)) { this.mattingCandidate = null; this.render(); } }));
      main.append(candidate);
    }
    const total = this.assetPage?.total ?? 0, paging = assetPagination(total, this.assetQuery.offset, this.assetQuery.limit);
    if (paging.pages <= 1) return { node: main, tools };
    const pagination = el('nav', 'authoring-toolbar asset-pagination'); pagination.ariaLabel = tr(locale, '素材分页', 'Asset pages', '素材のページ');
    pagination.append(el('span', 'asset-page-status', tr(locale, `第 ${paging.current} / ${paging.pages} 页 · 共 ${total} 项`, `Page ${paging.current} of ${paging.pages} · ${total} assets`, `${paging.current} / ${paging.pages} ページ · 全 ${total} 件`)));
    const go = (page: number) => this.changeAssetQuery({ offset: (page - 1) * this.assetQuery.limit });
    const previous = button('←', () => go(paging.current - 1)); previous.ariaLabel = tr(locale, '上一页', 'Previous page', '前のページ'); previous.disabled = !paging.previous; pagination.append(previous);
    let last = 0;
    for (const page of paging.visible) {
      if (last && page - last > 1) pagination.append(el('span', '', '…'));
      const control = button(String(page), () => go(page)); control.ariaLabel = tr(locale, `第 ${page} 页`, `Page ${page}`, `${page} ページ`); if (page === paging.current) control.setAttribute('aria-current', 'page'); pagination.append(control); last = page;
    }
    const next = button('→', () => go(paging.current + 1)); next.ariaLabel = tr(locale, '下一页', 'Next page', '次のページ'); next.disabled = !paging.next; pagination.append(next); main.append(pagination); return { node: main, tools };
  }
  private async dropAsset(asset: Asset, target: 'card' | 'stage' | 'gap', statementId: Id | null, command: string | null): Promise<void> {
    if (!await this.flushScript()) return;
    const decision = classifyAssetDrop(asset, target, command); if (!this.notice(decision)) return;
    if ((decision.value.kind === 'bindVoice' || decision.value.kind === 'replaceAsset') && statementId) {
      this.controller.select([statementId]); const result = await this.controller.editFields([{ field: decision.value.field!, op: 'set', value: asset.id }]);
      if (this.notice(result)) { await recordAssetsPicked(this.services,this.controller.source!.project.projectId,[asset.id]);this.render(); }
    } else if (decision.value.kind === 'insertCommand') {
      const choice = await this.chooseAssetUse(asset,statementId); if (!choice) return;
      const result = await this.controller.insertAssetCommand(asset, choice.kind, statementId, {characterId:choice.characterId}); if (this.notice(result)) this.render();
    }
  }
  private chooseAssetUse(asset: Asset, statementId: Id|null): Promise<{kind:'background'|'figure'|'illustration'|'voice'|'bgm'|'effect';characterId?:Id}|null> {
    if(asset.kind==='video')return Promise.resolve({kind:'background'});
    return new Promise(resolve => {
      const locale=this.controller.preferences.locale, modal=el('section','asset-use-popover');
      modal.append(el('h2','',tr(locale,'应用素材','Apply asset','素材を適用')),el('p','',asset.name));
      const target=this.controller.parsed()?.parsed.cst.find(node=>node.id===(statementId??this.controller.selection?.primaryId));
      const options: {value:'background'|'figure'|'illustration'|'voice'|'bgm'|'effect';label:string}[]=asset.kind==='audio'
        ? [...(target?.command==='say'?[{value:'voice' as const,label:tr(locale,'当前对白配音','Voice for this line','このセリフの音声')}]:[]),{value:'bgm',label:this.t('bgm')},{value:'effect',label:this.t('effect')}]
        : [...(asset.kind==='image'?[{value:'background' as const,label:tr(locale,'场景背景','Scene background','シーン背景')}]:[]),{value:'illustration',label:tr(locale,'独立演出插图','Independent illustration','独立した挿絵')},{value:'figure',label:asset.kind==='live2d'?tr(locale,'Live2D 立绘','Live2D figure','Live2D 立ち絵'):tr(locale,'图片立绘','Image figure','画像立ち絵')}];
      const use=el('select'); use.ariaLabel=tr(locale,'素材用途','Asset purpose','素材の用途');
      for(const option of options){const node=el('option','',option.label);node.value=option.value;use.append(node);}if(asset.characterId&&asset.kind!=='audio')use.value='figure';
      const characterRow=el('label','authoring-field',tr(locale,'关联角色','Character','関連キャラクター')),character=el('select');
      character.ariaLabel=tr(locale,'关联角色','Character','関連キャラクター');character.append(new Option(tr(locale,'独立立绘','Standalone figure','独立した立ち絵'),''));
      for(const item of this.controller.source?.characters??[])character.append(new Option(item.name,item.id));character.value=asset.characterId??'';characterRow.append(character);
      const update=()=>{characterRow.hidden=use.value!=='figure';};use.onchange=update;update();modal.append(use,characterRow);
      let choice:{kind:'background'|'figure'|'illustration'|'voice'|'bgm'|'effect';characterId?:Id}|null=null;
      const footer=el('footer','studio-dialog-footer dialog-actions');footer.append(button(this.t('cancel'),()=>popover.close()),button(this.t('apply'),()=>{
        choice={kind:use.value as typeof options[number]['value'],...(use.value==='figure'&&character.value?{characterId:character.value}:{})};popover.close();
      },'authoring-primary'));modal.append(footer);
      const popover=showContentPopover(modal,document.activeElement as HTMLElement,this.t('chooseUse'),()=>resolve(choice));
    });
  }
  private openFormDocument(id: string, title: string, node: HTMLElement, dirty: () => boolean, dispose?: () => void, activate?: (active: boolean) => void) {
    if (this.formDocuments.has(id)) { this.activeDocument=id;this.page=this.formDocuments.get(id)!.page;this.render();return; }
    const origin=this.formDocuments.get(this.activeDocument)?.source ?? this.activeDocument; this.formDocuments.set(id,{node,page:this.page,source:origin,dirty,dispose,activate});
    const heading=el('header','authoring-form-heading');heading.append(el('h2','',title),button('关闭文档',()=>this.closeDocument(id).then(()=>{})));node.prepend(heading);node.classList.add('authoring-form-document');
    node.addEventListener('input',()=>{this.documents=this.documents.map(item=>item.id===id?{...item,dirty:dirty()}:item);this.refreshDocumentTabs();});
    this.documents=openAuthorDocument(this.documents,{id,kind:'route',objectId:this.page,title,dirty:dirty()});this.activeDocument=id;this.render();
  }
  private finishFormDocument(id: string) { this.professionalInputs.delete(id);const form=this.formDocuments.get(id);if(!form)return; form.dispose?.();this.formDocuments.delete(id);this.documents=this.documents.filter(item=>item.id!==id);if(this.activeDocument!==id){this.refreshDocumentTabs();return;}const origin=this.documents.find(item=>item.id===form.source);if(origin)void this.openDocument(origin);else{this.activeDocument='';this.render();} }
  private async dialogueDialog(resume?: {beforeId:string|null;text:string;speaker:string}): Promise<void> {
    if (!this.inputDraftRestoring && !await this.flushScript()) return;
    const scene=this.controller.scene;if(!scene)return;const existing=this.insertions.get(scene.sceneId);if(existing){existing.node.querySelector<HTMLElement>('input,textarea,button')?.focus();return;}
    const beforeId=resume?resume.beforeId:this.controller.selection?.primaryId??null,revision=scene.revision,locale=this.controller.preferences.locale;
    const row=el('section','authoring-insertion-draft'),heading=el('strong','',tr(locale,'新增对白 · 尚未插入','New dialogue · not inserted','新しい台詞・未挿入')),text=el('textarea'),speaker=el('select'),error=el('p','authoring-form-error');error.setAttribute('role','alert');
    text.ariaLabel=this.t('dialogueText');text.placeholder=this.t('dialogueText');speaker.ariaLabel=tr(locale,'说话者','Speaker','話者');
    for(const [id,name] of [['narrator',tr(locale,'旁白','Narrator','ナレーション')],...(this.controller.source?.characters??[]).map(c=>[c.id,c.name])]){const option=el('option','',name);option.value=id!;speaker.append(option);}
    const finish=()=>{this.insertions.delete(scene.sceneId);row.remove();this.render();};let busy=false;
    const cancel=async()=>{if(busy)return;if(text.value.trim()&&await requestDialog({title:tr(locale,'放弃待插入对白？','Discard pending dialogue?','挿入待ちの台詞を破棄しますか？'),locale,destructive:true})===null)return;finish();};
    const apply=button(tr(locale,'插入对白','Insert dialogue','台詞を挿入'),async()=>{if(busy)return;if(this.controller.scene?.revision!==revision){error.textContent=tr(locale,'来源场景已变化，请保留文字并重新选择插入位置。','The source changed. Keep the text and select the insertion point again.','元のシーンが変更されました。文字を保持し、挿入位置を選び直してください。');return;}busy=true;apply.disabled=true;try{const result=await this.controller.insertDialogue([{speaker:speaker.value==='narrator'?{kind:'narrator'}:{kind:'character',id:speaker.value},text:text.value}],beforeId);if(!result.ok){error.textContent=result.error.message;return;}finish();}finally{busy=false;apply.disabled=false;}},'authoring-primary');
    row.append(heading,speaker,text,error,button(this.t('cancel'),cancel),apply);row.onkeydown=event=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void cancel();}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();apply.click();}};
    if(resume){text.value=resume.text;speaker.value=resume.speaker;}
    this.insertions.set(scene.sceneId,{beforeId,node:row,placeholder:row,dirty:()=>Boolean(text.value.trim()),capture:()=>asJson({kind:'dialogue',sceneId:scene.sceneId,beforeId,text:text.value,speaker:speaker.value})});this.render();text.focus();
  }
  private async pasteDialog(resume?: {beforeId:string|null;draft:import('./batch-dialogue.js').BatchDialogueGuiDraft}): Promise<void> {
    if(!this.inputDraftRestoring&&!await this.flushScript())return;const scene=this.controller.scene;if(!scene)return;
    const id=`paste:${scene.sceneId}`,existing=this.documents.find(document=>document.id===id);if(existing){await this.openDocument(existing);return;}
    const beforeId=resume?resume.beforeId:this.controller.selection?.primaryId??null,revision=scene.revision,projectId=this.controller.source!.project.projectId;
    const editor=createBatchDialogueEditor({guiDraft:resume?.draft,locale:this.controller.preferences.locale,characters:this.controller.source?.characters??[],apply:async(lines,newCharacters)=>{
      const current=this.controller.source?.scenes.find(item=>item.sceneId===scene.sceneId);
      if(this.controller.source?.project.projectId!==projectId||current?.revision!==revision)throw new Error('来源场景已变化，请关闭此文档并重新复核插入位置。原输入继续保留。');
      this.controller.selectScene(scene.sceneId);
      const inserted=await this.controller.insertDialogue(lines,beforeId,false,newCharacters);if(!inserted.ok)throw new Error(inserted.error.message);
      this.finishFormDocument(id);this.render();
    }});
    this.openFormDocument(id,`批量插入对白 · ${scene.name}`,editor.root,editor.dirty);this.formDocuments.get(id)!.capture=()=>asJson({kind:'paste',sceneId:scene.sceneId,beforeId,draft:editor.capture()});
  }
  private commandDialog(beforeId: Id | null = this.controller.selection?.primaryId ?? null, resume?: {command:string;args:Record<string,Json>}): void {
    const source = this.controller.source, scene = this.controller.scene; if (!source || !scene) return;
    const existing=this.insertions.get(scene.sceneId);if(existing){existing.node.querySelector<HTMLElement>('input,textarea,button')?.focus();return;}
    const revision=scene.revision,locale=this.controller.preferences.locale,origin=document.activeElement as HTMLElement|null;
    let chosen=false;
    const placeholder=el('section','authoring-insertion-draft');
    const finish=()=>{this.insertions.delete(scene.sceneId);modal.remove();placeholder.remove();this.render();};
    const registry = createCommandRegistry(source.project.engineVersion, this.studioPlugins?.commandSpecs() ?? []);
    const modal = el('section', 'authoring-command-draft'); modal.append(el('h2', '', this.t('addCommand')));
    const picker=createCommandPicker(registry,locale,()=>{
      chosen=true;updateFields();popover.close();
      placeholder.replaceChildren(el('strong','',`${commandName(registry.get(picker.value)!,locale)} · ${tr(locale,'待配置','Pending configuration','設定待ち')}`),el('p','',tr(locale,'在 Inspector 完成必填参数后插入。','Complete the required fields in Inspector to insert.','Inspector の必須項目を入力して挿入してください。')));
      this.insertions.set(scene.sceneId,{beforeId,node:modal,placeholder,dirty:()=>true,capture:()=>asJson({kind:'command',sceneId:scene.sceneId,beforeId,command:picker.value,args})});this.render();this.dock.current?.open(authoringDockTools.inspector, { focus: false });requestAnimationFrame(()=>fields.querySelector<HTMLElement>('input,textarea,select')?.focus());
    });
    const popover=showContentPopover(picker.root,origin,this.t('addCommand'),()=>picker.dispose());
    const fields = el('div', 'authoring-command-fields'); modal.append(fields);
    const error = el('p', 'authoring-form-error'); modal.append(error);
    let args: Record<string, Json> = {};
    const updateFields = (reset = true) => {
      if(reset)args = {}; fields.replaceChildren();
      const spec = registry.get(picker.value)!;
      if (reset && spec.key === 'changeBg') {
        const fade = { preset: 'fade', resourceId: null, durationMs: 400, easing: { family: 'linear', direction: 'in' }, direction: 'left' };
        args.transition = { enter: structuredClone(fade), exit: structuredClone(fade) };
      }
      if (reset && ['changeFigure','changeIllustrationDiff','characterDifference'].includes(spec.key)) {
        const fade = { preset: 'fade', resourceId: null, durationMs: 180, easing: { family: 'linear', direction: 'in' }, direction: 'left' };
        args.transition = spec.key === 'changeFigure' ? {
          enter: { ...fade, durationMs: 200, easing: { family: 'cubic', direction: 'out' } },
          exit: { ...fade, durationMs: 160, easing: { family: 'cubic', direction: 'in' } },
        } : fade;
      }
      const selectedName=commandName(spec,this.controller.preferences.locale);
      const heading=el('header','command-form-heading');heading.append(commandIcon(spec.key,false,selectedName),el('h3','',selectedName),el('small','',spec.key));fields.append(heading);
      const basic=el('section','command-basic');basic.append(el('h4','',tr(this.controller.preferences.locale,'常用参数','Common parameters','基本パラメーター')));fields.append(basic);
      const performance=el('details','command-performance');performance.append(el('summary','',tr(this.controller.preferences.locale,'演出参数','Direction parameters','演出パラメーター')));
      const more = el('details', 'command-more'); more.append(el('summary', '', tr(this.controller.preferences.locale, '高级数据', 'Advanced data', '詳細データ')));
      for (const original of commandFields(spec.key, spec.fields, args)) {
        const field = spec.key === 'changeFigure' && original.path === 'assetId' ? { ...original, assetKinds: [picker.assetKind] } : original;
        if (field.path === 'ruleImage' && spec.key === 'changeBg' && args.op === 'clear' && args.ruleImage == null) continue;
        const row = el(field.type === 'object' || field.type === 'ref' || field.path === 'loopStartSec' || spec!.key==='say'&&field.path==='text' ? 'div' : 'label', 'authoring-field'); row.dataset.field = field.path; row.append(el('span', '', fieldLabel(field, this.controller.preferences.locale, spec.key) + (field.required && !ownsIdentity(spec!.key,field.path,args ?? {}) ? tr(this.controller.preferences.locale, ' · 必填', ' · Required', ' · 必須') : '')));
        const dimensions=field.path==='framing'?this.framingSize(args):null;
        const value = args[field.path] ?? (dimensions?portraitFraming('upper',dimensions.sourceHeight,dimensions.canvasHeight):field.path === 'speaker' ? { kind: 'narrator' } : ownsIdentity(spec.key,field.path,args) ? createId(this.controller.source) : field.default);
        if (value !== null && value !== undefined) args[field.path] = value;
        row.append(inputFor(field, value, next => {
          if (field.path === 'ruleImage') { if (next === null) delete args.ruleImage; else args.ruleImage = next; updateFields(false); return; }
          if(spec.key==='setComplexAnimation'&&['animation','segments','resourceId'].includes(field.path)){for(const key of ['animation','segments','resourceId'])if(key!==field.path)delete args[key];}
          args[field.path] = next; if(field.path==='op'||field.path==='assetId'){updateFields(false);return;} row.querySelectorAll('.field-error').forEach(node => node.remove()); row.querySelectorAll('[aria-invalid]').forEach(node => { node.removeAttribute('aria-invalid'); node.removeAttribute('aria-describedby'); });
          for (const updated of commandFields(spec.key, spec.fields, args)) { const target = [...fields.querySelectorAll<HTMLElement>('[data-field]')].find(item => item.dataset.field === updated.path);
            const title = target?.querySelector(':scope > span'); if (title) title.textContent = fieldLabel(updated, this.controller.preferences.locale, spec.key) + (updated.required ? tr(this.controller.preferences.locale,' · 必填',' · Required',' · 必須') : '');
            target?.querySelector('input,textarea,select')?.setAttribute('aria-required',String(updated.required)); } }, [...this.assetCache.values()], this.references(), this.controller.preferences.locale, ownsIdentity(spec!.key,field.path,args ?? {}),()=>this.framingSize(args),{...this.fieldContext(args,modal,true,picker.assetKind,(command,next)=>{picker.select(command);args=next;updateFields(false);placeholder.querySelector('strong')!.textContent=commandName(registry.get(command)!,locale);this.render();}),command:spec.key}));
        if(spec.key==='return' && field.path==='value')row.append(el('p','field-help',fieldHint(field,fieldLabel(field,this.controller.preferences.locale,spec.key),this.controller.preferences.locale,spec.key)));
        const essential=field.required||['text','speaker','voice','assetId','op','durationMs','framing','station','model','ruleImage'].includes(field.path)||spec.key==='end'&&field.path==='target'||spec.key==='return'&&field.path==='value';
        (spec.key==='setComplexAnimation'&&['animation','resourceId','target'].includes(field.path)?basic:ownsIdentity(spec.key,field.path,args)?more:field.group==='effect'||field.group==='animation'?performance:essential?basic:more).append(row);
      }
      if(performance.children.length>1)fields.append(performance);
      if (more.children.length > 1) fields.append(more);
    };
    const actions = el('div', 'authoring-toolbar');
    actions.append(button(this.t('cancel'), async () => { if(await requestDialog({title:tr(locale,'取消这次指令插入？','Cancel this insertion?','今回の挿入をキャンセルしますか？'),locale,destructive:true})!==null)finish(); }));
    actions.append(button(this.t('apply'), async () => {
      if(!chosen)return;
      if(this.controller.scene?.sceneId!==scene.sceneId||this.controller.scene.revision!==revision){error.textContent=tr(locale,'来源场景已变化，请重新选择插入位置。当前输入已保留。','The source changed. Select the insertion point again; input is retained.','元のシーンが変更されました。入力を保持しています。挿入位置を選び直してください。');return;}
      const spec = registry.get(picker.value)!;
      fields.querySelectorAll('.field-error').forEach(node => node.remove());
      const checkedFields = commandFields(spec.key, spec.fields, args);
      const errors = validateFields(checkedFields, args, field => fieldLabel(field, this.controller.preferences.locale, spec.key), this.controller.preferences.locale);
      for (const problem of errors) {
        const row = [...fields.querySelectorAll<HTMLElement>('[data-field]')].find(row => row.dataset.field === problem.path.split('.')[0]);
        if (!row) continue;
        const message = el('small', 'field-error', problem.message); message.id = `field-error-${problem.path}`; row.append(message);
        const control = row.querySelector<HTMLElement>('input,textarea,select'); control?.setAttribute('aria-invalid', 'true'); control?.setAttribute('aria-describedby', message.id);
        const details = row.closest('details'); if (details) details.open = true;
      }
      error.textContent = errors.length ? tr(this.controller.preferences.locale, `请修正 ${errors.length} 处字段后再应用。`, `Correct ${errors.length} fields before applying.`, `${errors.length}項目を修正してください。`) : '';
      if (errors.length) { fields.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return; }
      const result = await this.controller.insertCommand(spec.key,args,beforeId);
      if (this.notice(result)) { const ids = commandAssetIds(spec.fields,args); if(ids.length)await recordAssetsPicked(this.services,source.project.projectId,ids);finish(); }
    }, 'authoring-primary'));
    modal.append(actions);
    modal.setAttribute('aria-label', this.t('addCommand'));
    if(resume){chosen=true;picker.select(resume.command);args=resume.args;updateFields(false);popover.close();placeholder.append(el('strong','',commandName(registry.get(picker.value)!,locale)));this.insertions.set(scene.sceneId,{beforeId,node:modal,placeholder,dirty:()=>true,capture:()=>asJson({kind:'command',sceneId:scene.sceneId,beforeId,command:picker.value,args})});this.render();}

  }
}

export async function mountAuthoring(root: HTMLElement, services: ShellServices): Promise<AuthoringWorkspace> {
  const workspace = new AuthoringWorkspace(root, services); await workspace.start(); return workspace;
}
