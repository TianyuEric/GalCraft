import { ProjectSettingsEditor } from './ProjectSettingsEditor.js';
import { Collaboration } from '../pages/Collaboration/Collaboration.js';
import { domButton } from '../components/dom-button.js';
import { AuthoringToolbar } from './AuthoringToolbar.js';
import { issueText } from '../components/issue-text.js';
import { IssueNotice } from '../components/issue-notice.js';
import { showContentPopover } from '../components/workbench/content-popover.js';
import type { DocumentWorkspace } from '../components/workbench/document-workspace.js';
import { createId, NativeAnimationSchema, StageWeatherPresets } from '@galcraft/contracts';
import { readTemplateDocuments } from '@galcraft/templates';
import { dialoguePortraitField } from './dialogue-portrait-field.js';
import { dialogueTextField } from './dialogue-text-field.js';
import { DialogueContentSchema, dialoguePlainText, replaceDialogueText } from '@galcraft/contracts';
import { createAssetInspector, disposeAssetInspector } from './asset-inspector.js';
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
import { SceneEntryEditor } from './scene-entry-editor.js';
import { SceneEntryPresentationSchema, round5AssetBindings } from '@galcraft/contracts';
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
import type { Asset, AssetKind, AssetListIdentity, BackgroundAdoptionScope, BackgroundReference, CharacterDifference, FieldSpec, Id, Json, Ref, Result, Source, StudioBridge, StudioPreferences } from '@galcraft/contracts';
import { IdSchema } from '@galcraft/contracts';
import { createCommandRegistry, parse, parseExpression, printExpression } from '@galcraft/dsl';
import { AuthoringController, classifyAssetDrop, mergeDialoguePaste, previewDialoguePaste } from './controller.js';
import type { AssetQuery, AuthoringServices, StudioLocale } from './controller.js';
import { mountScriptEditor } from './script-editor.js';
import './workspace.css';
import { configureAudioPreview, type PreviewPlayback } from './audio-preview.js';
import { attachCardReorder } from './card-reorder.js';
import { framingPresets, portraitFraming, type FramingPreset } from './framing-presets.js';
import { commandIcon } from './command-icon.js';
import { actionIcon } from '../components/action-icon.js';
import { ShellHeader, type ShellAction } from '../components/shell-header.js';
import { requestDialog } from '../components/request-dialog.js';
import { reviewFileConflicts } from '../components/document-recovery.js';
import { SaveChangeList, readableDocument } from '../components/change-list.js';
import { SaveReview, requestSaveReview } from '../components/save-review.js';
import { RailNavigation, type RailItem } from '../components/rail-navigation.js';
import { captureAuthoringFocus, hasLocalTextHistory, markAuthoringFocus, restoreAuthoringFocus } from './focus.js';
import { SceneVisualFields } from './scene-visual-fields.js';
import { EffectField } from './effect-field.js';
import { BackgroundObjectField } from './background-object-field.js';
import { BackgroundTransition } from './background-transition.js';
import { SceneGraph, mountSceneGraphDialog } from './scene-graph.js';
import { mountMoveInstructionsDialog } from './move-instructions-dialog.js';
import { buildMoveInstructionsModel, resolveMovePosition } from './move-instructions-model.js';
import { studioToasts } from '../components/toast.js';
import { validateFields, commandFields } from './field-validation.js';
import { openAssetPicker, recordAssetsPicked } from './asset-picker.js';
import { createAssetPickerPreview } from './asset-picker-preview.js';
import { loadVisibleAssetThumbnails } from './asset-picker-thumbnails.js';
import { assetTypeName, assetTypeIcon, uniqueAssetTypes } from './asset-type-catalog.js';
import { createAssetTypeFilters } from './asset-type-filters.js';
import type { AssetTypeCatalogEntry } from '@galcraft/contracts';
import { createAuthoringSidebar, initialSidebarState, runSidebarSearch } from './sidebar.js';
import { renderPortraitModel, type FieldCommit } from './portrait-model.js';
import { PageDesigner } from './page-designer.js';
import { PublishHistoryPaths } from '../pages/Publish/publish-identity.js';
import { requestHistoryReview } from '../components/history-review.js';
import { startPlaytest } from './playtest.js';
import { designerText } from './designer-strings.js';
import { designerPageName } from './designer-labels.js';
import { createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AuthoringWorkbench, DomRegion, openAuthorDocument, type AuthorDocument, type AuthoringWorkbenchProps } from './workbench-host.js';
import { ObjectTree, type WorkbenchTreeNode } from '../components/workbench/ObjectTree.js';
import './assets-workbench.css';
import { createWorkbenchChapter, moveWorkbenchObjects, renameWorkbenchObject } from './workbench-objects.js';
import type { EditInput, EditReceipt, SavePlan } from '@galcraft/contracts';
import { Production, tr } from '../pages/Production/Production.js';
import { ProductionSession } from '../pages/Production/session.js';
import { workbenchBridge } from '../pages/Production/bridge.js';
import { Plugins } from '../pages/Plugins/Plugins.js';
import { Publish, type PublishGuiDraft } from '../pages/Publish/Publish.js';
import './shell.css';
import './refinements.css';
import './creation-refinements.css';
import { Projects, type ProjectDraft } from '../pages/Projects/Projects.js';
import { CharacterManager } from './characters/CharacterManager.js';
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
  character: import('./characters/CharacterManager.js').CharacterGuiDraft | null;
  startup: import('./startup-editor.js').StartupGuiDraft | null;
  language: import('./project-languages.js').ProjectLanguageGuiDraft | null;
  playerName: import('./player-name.js').PlayerNameGuiDraft | null;
  production: { gui: ProductionSession['guiDraft']; connection: Omit<NonNullable<ProductionSession['connectionGuiDraft']>, 'secret'> | null; candidateText: [string,string][] } | null;
  projectCreate: ProjectDraft; documents: AuthorDocument[]; active: string; page: Page; sceneId: string | null; view: AuthoringController['view'];
  forms: { id: string; title: string; fields: FieldInputDraft[]; adapter?: Json }[];
  retained?: Json | null;
};

type Page = 'projects' | 'editor' | 'assets' | 'pages' | 'production' | 'assistant' | 'collaboration' | 'plugins' | 'publish' | `extension:${string}`;
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
  if (spec.path === 'model' && context) return renderPortraitModel(spec, value, context.modelAsset,
    context.modelAsset?.kind === 'live2d' ? 'live2d' : context.figureKind ?? 'image', locale,
    (field, next, commit) => inputFor(field, next, commit, assets, references, locale, false, framingSize, context), onCommit,
    context.modelAsset?.kind === 'live2d' && context.services.inspectModelAsset ? async () => {
      const result = await context.services.inspectModelAsset!(context.modelAsset!.id);
      if (result.ok && result.value) context.cache(result.value);
      return result;
    } : undefined);
  if (spec.type === 'object') {
    let current = value && typeof value === 'object' && !Array.isArray(value) ? { ...value as Record<string, Json> } : {} as Record<string, Json>;
    if (!spec.children?.length) {
      const empty = el('p', 'authoring-field-empty', tr(locale, '此指令没有可调整的自定义参数。', 'This command has no custom parameters to adjust.', 'このコマンドには調整できるカスタムパラメーターがありません。'));
      return empty;
    }
    if (['imageMouth','imageBlink'].includes(spec.path) && context && !context.draft) {
      const wrapper=el('section','image-animation-editor'),status=el('p','field-help');
      status.hidden=true;
      const content=()=>inputFor(spec,current,next=>{current=next as Record<string,Json>;status.hidden=false;apply.hidden=false;status.textContent=tr(locale,'设置尚未应用','Settings are not applied yet','設定はまだ適用されていません');},assets,references,locale,false,framingSize,{...context,draft:true});
      const apply=button(tr(locale,'应用这组设置','Apply these settings','この設定を適用'),async()=>{
        const errors=validateFields([spec],{[spec.path]:current},label,locale);
        if(errors.length){status.textContent=errors.map(error=>error.message).join(' · ');return;}
        const result=await onCommit(current);if(result?.ok){const ids=commandAssetIds(spec.children??[],current);if(ids.length)await recordAssetsPicked(context.services,context.projectId,ids);}
      });apply.hidden=true;wrapper.append(content(),status,apply);return wrapper;
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
      if (['imageMouth', 'imageBlink'].includes(spec.path) && child.path !== 'enabled' && current.enabled !== true) continue;
      if (context?.command === 'end' && spec.path === 'target' && child.path !== 'kind') {
        const kind = current.kind ?? 'title';
        if (kind === 'title' || kind === 'page' && child.path !== 'pageId' || kind === 'scene' && !['sceneId', 'labelId'].includes(child.path)) continue;
      }
      const path = child.path; const row = el(context?.visualEffectField || child.refKind === 'object' ? 'div' : 'label', 'authoring-field');
      const childLabel=child.refKind==='object'?tr(locale,'舞台对象','Stage object','舞台オブジェクト'):child.path==='enabled'&&['imageMouth','imageBlink'].includes(spec.path)?tr(locale,'启用','Enabled','有効'):label(child);
      row.append(el('span', '', childLabel + (child.required && !(child.path==='id'&&child.refKind==='statement') ? tr(locale, ' · 必填', ' · Required', ' · 必須') : ''))); row.append(inputFor(child, current[path],
        next => { current = { ...current, [path]: next }; if (next === null && !child.required && !child.nullable) delete current[path]; const result = onCommit(current);
          if (path === 'enabled' && ['imageMouth', 'imageBlink'].includes(spec.path)) group.replaceWith(inputFor(spec,current,onCommit,assets,references,locale,false,framingSize,context));
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
  private railCollapsed = localStorage.getItem('studio:railCollapsed') === 'true';
  private importingAssets = false;
  private inspectorMoreOpen = false;
  private narrowPanel: 'left'|'right'|'' = '';
  private production: ProductionSession | null = null;
  private productionUnapplied = false;
  private publishUnapplied = false;
  private publishGuiDraft:PublishGuiDraft|null=null;
  private capturePublishGui=(draft:PublishGuiDraft)=>{this.publishGuiDraft=draft;this.persistInputDraft();};
  private setPublishUnapplied = (dirty: boolean) => { this.publishUnapplied = dirty; this.documents = this.documents.map(document => document.id === 'route:publish' ? { ...document, dirty: dirty || this.controller.source?.projectDirty } : document); this.refreshDocumentTabs();void this.reportAuthoringDrafts(); };
  private productionReview = false;
  private setProductionReview = (reviewing: boolean) => { if (this.productionReview === reviewing) return; this.productionReview = reviewing; queueMicrotask(() => this.render()); };
  private setProductionUnapplied = (dirty: boolean) => { this.productionUnapplied = dirty;void this.reportAuthoringDrafts(); };
  private productionSubscription: (() => void) | null = null;
  private productionChanged=()=>{const production=this.production;if(!production)return;this.documents=this.documents.map(document=>document.kind==='route'&&['production','assistant'].includes(document.objectId??'')?{...document,dirty:production.draftDirty||production.draftSaving}:document);this.refreshDocumentTabs();};
  private closeSubscription: (() => void) | null = null;
  private studioPlugins: StudioPluginHost | null = null;
  private pluginRenderLocale = '';
  private projectsNode = el('div', 'project-mount');
  private projectsRoot: Root | null = null;
  private headerNode = el('header', 'authoring-header');
  private headerRoot: Root | null = null;
  private railNode = el('nav', 'studio-rail');
  private railRoot: Root | null = null;
  private inspectorRoots: Root[] = [];
  private resourceProcessorRoot: Root | null = null;
  private resourceProcessorUnapplied = false;
  private resourceProcessorGuiDraft:ResourceProcessorGuiDraft|null=null;
  private captureResourceProcessorGui=(draft:ResourceProcessorGuiDraft)=>{this.resourceProcessorGuiDraft=draft;this.persistInputDraft();};
  private setResourceProcessorUnapplied = (dirty: boolean) => { this.resourceProcessorUnapplied=dirty;void this.reportAuthoringDrafts(); };
  private resourceProcessorNode = el('div');
  private renderedSceneId: Id | null = null;
  private renderedView: string | null = null;
  private focusRenderSequence = 0;
  private projectCreateUnapplied = false;
  private setProjectCreateUnapplied = (dirty: boolean) => { this.projectCreateUnapplied = dirty; };
  private projectDraft: ProjectDraft = { name: '', template: 'standard', width: 1920, height: 1080, engineVersion: '' };
  private workbenchNode = el('div', 'workbench-mount');
  private workbench: Root | null = null;
  private collaborationInspector = el('div','collaboration-inspector-mount');
  private collaborationExplorer = el('div','collaboration-explorer-mount');
  private collaborationSubscriptions: (()=>void)[] = [];
  private productionInspector = el('div', 'production-inspector-mount');
  private productionExplorer = el('div', 'production-explorer-mount');
  private projectsExplorer = el('div', 'projects-explorer-mount');
  private projectsInspector = el('div', 'projects-inspector-mount');
  private pluginsExplorer = el('div', 'plugins-explorer-mount');
  private pluginsInspector = el('div', 'plugins-inspector-mount');
  private publishExplorer = el('div', 'publish-explorer-mount');
  private publishInspector = el('div', 'publish-inspector-mount');
  private shellNode = el('div', 'production-workbench-mount authoring-shell');
  private shellRoot: Root | null = null;
  private shellProps: AuthoringWorkbenchProps | null = null;
  private documents: AuthorDocument[] = [];
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
  private formDocuments = new Map<string, { node: HTMLElement; page: Page; source: string; dirty(): boolean; capture?(): Json; dispose?(): void; activate?(active: boolean): void; inspector?: HTMLElement; scope?: import('@galcraft/contracts').DiscardScope }>();
  private activeDocument = '';
  private treeSelected: string[] = [];
  private sceneContexts = new Map<Id, { view: AuthoringController['view']; selection: AuthoringController['selection']; caret: AuthoringController['caret']; scroll: AuthoringController['scroll'] }>();
  private scriptSessions = new Map<Id, { node: HTMLElement; editor: Awaited<ReturnType<typeof mountScriptEditor>> }>();
  private writingInputs = new Map<Id, HTMLTextAreaElement>();
  private renderedRevision: number | null = null;
  private projectNode = el('section', 'authoring-settings-document');
  private projectGeneral = el('div');
  private playerNameEditor: ReturnType<typeof createPlayerNameEditor> | null = null;
  private languageEditor = createRef<ProjectLanguageEditorHandle>();
  private languageNode = el('div');
  private languageRoot: Root | null = null;
  private assetRangeAnchor: Id | null = null;
  private assetInspectorView: {asset:Asset;locale:string;node:HTMLElement;summary:HTMLElement}|null=null;
  private assetRows = new Map<Id,{asset:Asset;locale:string;node:HTMLElement}>();
  private characterNode = el('div', 'character-document');
  private characterExplorer = el('div', 'character-explorer');
  private characterSelected: Id | undefined;
  private characterAsset: Asset | null = null;
  private characterRoot: Root | null = null;
  private characterDraft = false;
  private graphNode = el('div', 'scene-graph-document');
  private authoringToolbarNode = el('div', 'authoring-toolbar authoring-toolbar-host');
  private authoringToolbarRoot: Root | null = null;
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
  private characterGuiDraft: import('./characters/CharacterManager.js').CharacterGuiDraft | null = null;
  private publishHistory: ((action: 'undo' | 'redo') => boolean) | null = null;
  private setPublishHistory = (handler: ((action: 'undo' | 'redo') => boolean) | null) => { this.publishHistory = handler; };
  private startupGuiDraft: import('./startup-editor.js').StartupGuiDraft | null = null;
  private languageGuiDraft: import('./project-languages.js').ProjectLanguageGuiDraft | null = null;
  private playerNameGuiDraft: import('./player-name.js').PlayerNameGuiDraft | null = null;
  private professionalInputs = new Map<string,Json>();
  private productionGuiResume: PersistentWorkspaceInput['production'] = null;
  private captureCharacterGui = (draft: import('./characters/CharacterManager.js').CharacterGuiDraft) => { this.characterGuiDraft = draft; this.persistInputDraft(); };
  private captureStartupGui = (draft: import('./startup-editor.js').StartupGuiDraft) => { this.startupGuiDraft = draft; this.persistInputDraft(); };
  private captureLanguageGui = (draft: import('./project-languages.js').ProjectLanguageGuiDraft) => { this.languageGuiDraft = draft; this.persistInputDraft(); };
  private designer: PageDesigner | null = null;
  private designerProjectRevision: number | null = null;
  private designerSceneRevisions = new Map<Id, number>();
  readonly controller: AuthoringController;
  page: Page = 'projects';
  private readonly debugRouteIntent = new DebugRouteIntent();
  private miniStage: MiniStage | null = null;
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
  private assetQueryGeneration = 0;
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
  private focusedAsset: Asset | null = null;
  private assetNavigationFilters = el('div', 'asset-navigation-filters');
  private assetExplorerMount: { node: HTMLElement; filters: HTMLElement; heading: HTMLElement; typeRoot: Root; objectRoot: Root } | null = null;
  private preview: { uri: string; mime: string; playback: PreviewPlayback } | null = null;
  private previewMedia: HTMLMediaElement | null = null;
  private previewAudioCleanup: (() => void) | null = null;
  private thumbnailGeneration = 0;
  private inspectorShown = () => { if (this.page === 'assets') void this.loadThumbnails(this.thumbnailGeneration); };
  private thumbnailsActive = false;
  private mattingCandidate: { assetId: Id; preparationId: Id; previewUri: string; references: BackgroundReference[]; selectedSourceKeys: Set<string> } | null = null;
  private mattingBusy = false;
  private preparingModel = false;
  private sidebarState = initialSidebarState();
  private searchOrigin: { sceneId: Id; view: 'cards' | 'writing' | 'script'; statementId: Id | null } | null = null;
  private scriptEditor: Awaited<ReturnType<typeof mountScriptEditor>> | null = null;
  private scriptDrafts = new Map<Id, string>();
  private writingDrafts = new Map<Id, string>();
  private writingPending = Promise.resolve(true);
  private sessionId: Id | null = null;
  private commandShortcut = (event: KeyboardEvent) => {
    if (!this.root.isConnected || event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || hasWorkbenchModal()) return;
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
    await this.controller.open(); this.page = this.controller.source ? 'editor' : 'projects';
    if (this.controller.source) {
      const current = await this.services.bridge.service?.status();
      if (current?.project?.projectId === this.controller.source.project.projectId) this.sessionId = current.project.sessionId;
      await this.loadQuickAssets(); await this.refreshStudioPlugins();
    }
    const restored = this.controller.workbench; this.documents = restored?.documents.filter(doc => doc.kind !== 'scene' || this.controller.source?.scenes.some(scene => scene.sceneId === doc.objectId)) ?? [];
    await this.restoreInputDraft(); this.inputDraftReady = true;
    const active = this.documents.find(doc => doc.id === restored?.active); if (active && !this.activeDocument) await this.openDocument(active); else this.render();
    if (this.controller.source) void this.checkRecovery();
    const collaborationBridge=this.services.bridge as import('../../desktop-bridge.js').DesktopBridge;
    if(collaborationBridge.onCollaborationChanged)this.collaborationSubscriptions.push(collaborationBridge.onCollaborationChanged(()=>{void (async()=>{if(!await this.flushScript())return;await this.controller.refresh();this.render();})();}));
    if(collaborationBridge.onCollaborationNavigate)this.collaborationSubscriptions.push(collaborationBridge.onCollaborationNavigate(input=>{void (async()=>{if(input.projectChanged){await this.refreshCollaborationProject();return;}if(input.documentId){const scene=this.controller.source?.scenes.find(item=>item.documentId===input.documentId);if(scene){await this.openDocument({kind:'scene',objectId:scene.sceneId});return;}}await this.navigate(input.page==='creation'?'editor':input.page==='player-ui'?'pages':input.page as Page);if(input.taskId&&this.production){await this.production.refresh();this.production.taskId=input.taskId;this.production.changed();this.render();}})();}));
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
      if (asset?.dataset.pluginAssetId && !this.selectedAssets.has(asset.dataset.pluginAssetId)) { this.selectedAssets.clear(); this.selectedAssets.add(asset.dataset.pluginAssetId); }
      void (async () => { if (!await this.flushScript()) return; this.studioPlugins?.publishScope(); this.studioPlugins?.openTools('context.menu'); })();
    });
    this.root.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
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
  dispose(): void {
    void this.flushInputDrafts().catch(() => {});
    this.disposed=true;
    for(const cached of this.projectGuiDrafts.values()){cached.production?.stop();cached.startup.root?.unmount();cached.character.root?.unmount();cached.project.languageRoot?.unmount();cached.project.playerNameEditor?.dispose();for(const form of cached.forms.values())form.dispose?.();}this.projectGuiDrafts.clear();
    window.removeEventListener('keydown', this.commandShortcut, true);
    this.insertions.clear();
    for (const form of this.formDocuments.values()) form.dispose?.(); this.formDocuments.clear();
    this.assetExplorerMount?.typeRoot.unmount(); this.assetExplorerMount?.objectRoot.unmount(); this.assetExplorerMount = null;
    this.collaborationSubscriptions.splice(0).forEach(unsubscribe=>unsubscribe());
    this.closeSubscription?.(); this.closeSubscription = null; this.productionSubscription?.(); this.productionSubscription = null; this.production?.stop();
    this.stopStartup?.(); this.designer?.dispose(); this.miniStage?.dispose(); this.effectEditor?.dispose();
    for (const session of this.scriptSessions.values()) session.editor.dispose(); this.scriptSessions.clear(); this.writingInputs.clear();
    this.resourceProcessorRoot?.unmount(); this.resourceProcessorRoot = null;
    this.playerNameEditor?.dispose();this.languageRoot?.unmount(); this.startupRoot?.unmount(); this.characterRoot?.unmount(); this.graphRoot?.unmount(); this.projectsRoot?.unmount(); this.workbench?.unmount();
    this.authoringToolbarRoot?.unmount(); this.headerRoot?.unmount(); this.railRoot?.unmount(); this.shellRoot?.unmount(); this.shellRoot = null; this.controller.close(); void this.studioPlugins?.dispose();
  }
  private presetLifecycle(args: Record<string, unknown>, preset: AppliedAnimationPreset) {
    const object = this.miniStage?.animationTarget(args.target);
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
        if (animationTarget && typeof animationTarget === 'object' && (animationTarget as { kind?: string }).kind === 'object') this.miniStage?.highlightObject(String((animationTarget as { id?: string }).id));
        if (this.miniStage && this.miniStage.root.parentElement !== preview) preview.append(this.miniStage.root);
        const target = createCommandRegistry(this.controller.source!.project.engineVersion).get('setComplexAnimation')?.fields.find(field => field.path === 'target');
        if (target) targets.replaceChildren(inputFor(target, animationTarget, async next => { animationTarget = next; args.target = next;
          if (draft) return; const result = await this.controller.editFields([{ field: 'target', op: 'set', value: next }], statementId ? [statementId] : []); if (this.notice(result)) this.render(); return result;
        }, [...this.assetCache.values()], this.references(), this.controller.preferences.locale, false, undefined, this.fieldContext(args, targets, draft)));
        flushSync(() => root.render(createElement(AnimationWorkbench, { guiDraft:this.professionalInputs.get(id) as unknown as import('./professional/AnimationWorkbench.js').AnimationGuiDraft,onGuiDraftChange:state=>{this.professionalInputs.set(id,asJson(state));this.persistInputDraft();},animation: animationValue, locale: this.controller.preferences.locale, active,
          preview: createElement(DomRegion, { node: preview }), statusLabel: tr(this.controller.preferences.locale,'确认后进入作品，保存后落盘','Apply to working content; save to disk','確定して作品に適用、保存してディスクへ'),
          targetLabel: tr(this.controller.preferences.locale,'上方选择预览与执行目标','Choose the preview and execution target above','上で対象を選択'),
          presetContext: this.miniStage?.animationContext(animationTarget) ?? { stageWidth: this.controller.source!.project.canvas.width },
          onGenerate: request => { const object = this.miniStage?.animationTarget(animationTarget); return this.createAnimationWithAi({ ...request, targetContext: JSON.stringify({ canvas: this.controller.source!.project.canvas, target: animationTarget, object: object ? { id: object.id, assetId: object.assetId, variantId: object.variantId, layer: object.layer, station: object.station, current: object.current, framing: object.framing, backgroundFrame: object.backgroundFrame } : null }) }, { sceneId: scene?.sceneId, statementId }); },
          onPreset: async preset => { await this.applyComplexPreset(args,preset,draft,commit,statementId??undefined,replaceDraft); animationValue=preset.animation;editRevision=this.controller.scene?.revision; if(preset.lifecycle!=='property')this.finishFormDocument(id); },
          onDraftChange: next => { dirty = next; this.documents = this.documents.map(document => document.id === id ? { ...document, dirty: next || this.controller.scene?.dirty } : document); this.refreshDocumentTabs(); },
          onChange: async next => { if (!draft && (this.controller.scene?.sceneId !== scene?.sceneId||this.controller.scene?.revision!==editRevision)) throw new Error(tr(this.controller.preferences.locale,'请返回来源场景后重试。','Return to the source scene and retry.','元のシーンを開いて再試行してください。')); const result = await commit(next as unknown as Json); if (result && !result.ok) throw new Error(result.error.message); animationValue = next;editRevision=this.controller.scene?.revision; },
          onPreview: (next, time) => { if (active) void this.miniStage?.sampleAnimation(next, time, animationTarget); },
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
    const otherDirty=!!(this.scriptDrafts.size||this.writingDrafts.size||this.unappliedInput(true,false)||language&&(JSON.stringify(language.draft)!==language.baseline||language.additional)||playerName&&JSON.stringify(playerName.values)!==JSON.stringify(playerName.baseline)||Object.keys(this.characterGuiDraft?.drafts??{}).length||Object.keys(this.startupGuiDraft?.buffers??{}).length||Object.keys(designer?.fieldInputs??{}).length||[...this.formDocuments.values()].some(form=>form.dirty()));
    const dirty=otherDirty||this.publishUnapplied;
    if(dirty&&!this.inputOriginVersions)this.inputOriginVersions=structuredClone(currentVersions);
    if(!dirty)this.inputOriginVersions=null;
    return { version: 1, projectId: source.project.projectId, unapplied: dirty, otherUnapplied: otherDirty, recoveryReviewed: this.recoveryReviewed,
      versions: this.inputOriginVersions??currentVersions,
      scripts: [...this.scriptDrafts], writing: [...this.writingDrafts], designer: this.designer?.capture() ?? this.designerResume,
      publish: this.publishGuiDraft, resourceProcessor: this.resourceProcessorGuiDraft, character: this.characterGuiDraft,
      startup: this.startupGuiDraft, language: this.languageEditor.current?.capture() ?? this.languageGuiDraft,
      playerName: this.playerNameEditor?.capture() ?? this.playerNameGuiDraft,
      production: this.production ? { gui: this.production.guiDraft, connection: connection ? { edit: connection.edit, provider: connection.provider, advanced: connection.advanced, baseline: connection.baseline, selection: connection.selection } : null, candidateText: [...this.production.candidateText] } : this.productionGuiResume,
      projectCreate: this.projectDraft, documents: this.documents.filter(document => !this.formDocuments.has(document.id)), active: this.activeDocument, page: this.page,
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
  async flushInputDrafts(): Promise<void> { this.persistInputDraft(); await this.inputDraftStore.flush(); }
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
        this.publishGuiDraft = draft.publish; this.resourceProcessorGuiDraft = draft.resourceProcessor;
        this.characterGuiDraft = draft.character; this.characterSelected = draft.character?.selected ?? undefined;
        this.startupGuiDraft = draft.startup; this.languageGuiDraft = draft.language; this.playerNameGuiDraft = draft.playerName;
        this.productionGuiResume = draft.production; this.projectDraft = draft.projectCreate;
        this.recoveredForms = []; this.retainedInput = retainedWorkspaceInput(draft.retained, source.project);
        this.documents = draft.documents.filter(document => document.kind !== 'scene' || source.scenes.some(scene => scene.sceneId === document.objectId));
        this.activeDocument = draft.active; this.page = draft.page;
        if (draft.sceneId && source.scenes.some(scene => scene.sceneId === draft.sceneId)) this.controller.selectScene(draft.sceneId);
        this.controller.changeView(draft.view);
        for (const form of [...draft.forms ?? []].sort((a,b)=>Number(!a.id.startsWith('insertion:'))-Number(!b.id.startsWith('insertion:')))) { if (!await this.restoreFormInput(form)) this.recoveredForms.push(form); }
        if (this.documents.some(document => document.id === draft.active)) { this.activeDocument=draft.active;this.page=draft.page; }
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
    if (adapter.kind === 'entry') await this.openEntryPresentation(adapter.entryKind as 'chapter'|'scene',String(adapter.objectId),{draft:adapter.draft as unknown as import('@galcraft/contracts').SceneEntryPresentation,original:String(adapter.original)});
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
      character:{node:this.characterNode,root:this.characterRoot,explorer:this.characterExplorer,dirty:this.characterDraft,selected:this.characterSelected},
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
      this.characterNode=cached.character.node;this.characterRoot=cached.character.root;this.characterExplorer=cached.character.explorer;this.characterDraft=cached.character.dirty;this.characterSelected=cached.character.selected;
      this.projectNode=cached.project.node;this.projectGeneral=cached.project.general;this.languageNode=cached.project.languageNode;this.languageRoot=cached.project.languageRoot;this.languageEditor=cached.project.languageEditor;this.playerNameEditor=cached.project.playerNameEditor;
      this.formDocuments=cached.forms;this.insertions=cached.insertions;this.documents=cached.documents;this.activeDocument=cached.active;this.page=cached.page;this.sceneContexts=cached.scenes;this.treeSelected=cached.selected;
      if(this.production){this.productionSubscription=this.production.subscribe(this.productionChanged);this.production.start();}
      this.message=tr(this.controller.preferences.locale,'已恢复此作品的编辑位置和未应用草稿。','Restored this project’s editing position and unapplied drafts.','この作品の編集位置と未適用の下書きを復元しました。');
    }else if(oldId)this.message=tr(this.controller.preferences.locale,'已打开协作作品。原作品的未应用草稿保留在本次 Studio 会话中。','Collaboration project opened. Unapplied drafts for the previous project remain in this Studio session.','連携作品を開きました。前の作品の未適用の下書きは、この Studio セッションで保持されます。');
    if(this.page==='assets')await this.showAssets();else this.render();
    }finally{this.switchingProject=false;void this.reportAuthoringDrafts();}
  }
  private async projectChanged(): Promise<void> {
    this.inputDraftRestoredProject = null; this.professionalInputs.clear();this.inputOriginVersions=null;this.characterGuiDraft = null; this.startupGuiDraft = null; this.languageGuiDraft = null; this.playerNameGuiDraft = null; this.productionGuiResume = null; this.recoveredForms = []; this.retainedInput = null;this.recoveryReviewed=false;
    this.publishGuiDraft=null;this.publishUnapplied=false;this.resourceProcessorGuiDraft=null;this.resourceProcessorUnapplied=false;
    this.resourceProcessorRoot?.unmount(); this.resourceProcessorRoot=null; this.resourceProcessorInspector.replaceChildren();
    this.production?.stop(); this.production = null; this.designer?.dispose(); this.designer = null; this.designerResume = null; this.miniStage?.dispose(); this.miniStage = null;
    this.productionSubscription?.(); this.productionSubscription = null;
    this.designerProjectRevision = null; this.designerSceneRevisions.clear();
    this.workbench?.unmount(); this.workbench = null;
    for (const session of this.scriptSessions.values()) session.editor.dispose(); this.scriptSessions.clear(); this.scriptEditor = null;
    this.writingInputs.clear();
    for(const form of this.formDocuments.values())form.dispose?.(); this.formDocuments.clear(); this.productionUnapplied=false; this.insertions.clear(); this.recentObjects=[];this.cardRangeAnchor=null;this.treeCreateEditor=null; this.debugRouteIntent.clear(); this.characterSelected=undefined;this.characterAsset=null;
    this.documents = []; this.activeDocument = ''; this.sceneContexts.clear(); this.treeSelected = [];
    this.playerNameEditor?.dispose();this.playerNameEditor = null; this.languageRoot?.unmount(); this.languageRoot=null; this.projectNode.replaceChildren(); this.characterRoot?.unmount(); this.characterRoot = null; this.characterDraft = false; this.graphRoot?.unmount(); this.graphRoot = null;
    this.startupRoot?.unmount(); this.startupRoot = null; this.stopStartup?.(); this.stopStartup = null; this.startupDraft = false; this.startupGeneration++;
    this.effectEditor?.dispose(); this.effectEditor = null;
    await this.services.stopAssetPreview?.();
    this.assetCache.clear(); this.selectedAssets.clear(); this.assetPage = null;
    this.selectedDetails = null; this.missingSelected = []; this.focusedAsset = null; this.preview = null;
    this.assetImportResults = [];
    this.selectedAtIndexRevision = null; this.queryAtSelection = null;
    this.sidebarState = initialSidebarState(); this.searchOrigin = null;
    this.assetQuery = { kind: null, text: '', offset: 0, limit: 40 };
    await this.studioPlugins?.dispose(); this.studioPlugins = null; this.services.assetUi = undefined; this.assetTypes = []; ++this.assetQueryGeneration;
    this.assetInspectorView && disposeAssetInspector(this.assetInspectorView.node); this.assetInspectorView = null;
    if (this.controller.source) await this.loadQuickAssets();
    await this.refreshStudioPlugins(); this.page = this.controller.source ? 'editor' : 'projects'; await this.restoreInputDraft(); this.render();
  }
  private rememberScene(): void {
    if (this.controller.scene) this.sceneContexts.set(this.controller.scene.sceneId, { view: this.controller.view, selection: structuredClone(this.controller.selection), caret: { ...this.controller.caret }, scroll: { ...this.controller.scroll } });
  }
  private refreshDocumentTabs(): void {
    void this.reportAuthoringDrafts();
    queueMicrotask(() => { if (!this.shellProps || !this.shellRoot) return; this.shellProps = { ...this.shellProps, documents: this.documents }; this.shellRoot.render(createElement(AuthoringWorkbench, this.shellProps)); });
  }
  /** Public document entrypoint for core pages and plugin consumers. */
  async openDocument(document: Omit<AuthorDocument, 'id' | 'title'> & { id?: string; title?: string }): Promise<void> {
    if (!await this.flushScript()) return;
    if (!await this.flushProductionDraft()) return;
    this.rememberScene();
    const form = document.id && this.formDocuments.get(document.id);
    if (form) { this.page = form.page; this.activeDocument = document.id!; this.render(); return; }
    const id = document.id ?? (document.kind === 'scene' || document.kind === 'page' || document.kind === 'asset' ? `${document.kind}:${document.objectId}` : document.kind);
    let title = document.title ?? id;
    if (document.kind === 'scene' && document.objectId) {
      const scene = this.controller.source?.scenes.find(item => item.sceneId === document.objectId); if (!scene) return;
      title = scene.name; if (scene.sceneId !== this.controller.scene?.sceneId) {
        this.controller.selectScene(scene.sceneId); const context = this.sceneContexts.get(scene.sceneId);
        if (context) { this.controller.changeView(context.view); this.controller.caret = { ...context.caret }; this.controller.scroll = { ...context.scroll }; this.controller.selection = structuredClone(context.selection); }
      }
      this.treeSelected = [scene.sceneId]; this.page = 'editor';
    } else if (document.kind === 'page') { this.page = 'pages';
      // Publish the requested document before awaiting the first Player mount.
      this.documents=openAuthorDocument(this.documents,{...document,id,title});this.activeDocument=id;
      if (document.objectId && this.designer) await this.designer.openPage(document.objectId);
      title = this.designer?.workbenchPages().find(page => page.id === document.objectId)?.name ?? designerPageName(document.objectId ?? id.slice(5), this.controller.preferences.locale); }
    else if (document.kind === 'asset') { this.page = 'assets'; this.documents=this.documents.filter(item=>item.kind!=='asset');this.activeDocument='route:assets';await this.showAssets(); if(document.objectId)await this.focusAsset(document.objectId);return; }
    else if (document.kind === 'startup') { this.page = 'pages'; title = document.title ?? '启动与主页'; }
    else if (document.kind === 'route') this.page = document.objectId as Page;
    else this.page = 'editor';
    this.recentObjects=[id,...this.recentObjects.filter(item=>item!==id)].slice(0,50);
    const next: AuthorDocument = { ...document, id, title, preview: document.preview ?? false };
    this.documents = openAuthorDocument(this.documents, next); this.activeDocument = id; this.render();
  }
  private async discardScope(document: AuthorDocument): Promise<import('@galcraft/contracts').DiscardScope | null> {
    const formScope = this.formDocuments.get(document.id)?.scope; if (formScope) return formScope;
    const source = this.controller.source; if (!source) return null;
    if (document.kind === 'scene') { const scene = source.scenes.find(scene => scene.sceneId === document.objectId); return scene ? { documentId: scene.documentId } : null; }
    if (document.kind === 'startup') return { documentId: source.projectDocumentId, paths: ['/data/display'] };
    if (document.id === 'project') return { documentId: source.projectDocumentId, paths: ['/data/player/autosave', '/data/player/name', '/data/languages'] };
    const listed = await this.services.bridge.documents.list(); if (!listed.ok) throw new Error(listed.error.message);
    if (document.kind === 'characters') {
      const characterId = this.characterSelected ?? source.characters[0]?.id;
      const owner = listed.value.find(item => Object.keys(item.files).some(path => path === `characters/${characterId}.json`));
      return owner ? { documentId: owner.documentId } : null;
    }
    if (document.kind === 'page') { const documentId = this.designer?.workbenchDocumentId(); return documentId && listed.value.some(item => item.documentId === documentId) ? { documentId } : null; }
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
        if (document.kind === 'characters') this.characterDiscardRequest = { characterId: this.characterSelected ?? this.controller.source!.characters[0]!.id, request: (this.characterDiscardRequest?.request ?? 0) + 1 };
        if (document.id === 'project') { this.playerNameEditor?.dispose();this.playerNameEditor?.root.remove(); this.playerNameEditor = null; this.languageEditor.current?.discard(); }
        if (document.kind === 'page') { this.designer?.discardStyleDrafts(); this.designer?.dispose(); this.designer = null; this.designerResume = null; }
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
        if (this.activeDocument === id) { const next = this.documents[Math.min(index, this.documents.length - 1)]; if (next) await this.openDocument(next); else { this.activeDocument = 'empty'; this.render(); } } else this.render(); resolve(true);
      };
      const pageDraft = !!form?.dirty() || document.kind === 'page' && (Object.keys(this.designer?.capture().styleDrafts ?? {}).length > 0 || !!this.designer?.hasAnimationDraft()) || document.kind === 'characters' && this.characterDraft || document.kind === 'startup' && this.startupDraft || document.id === 'project' && (!!this.playerNameEditor?.dirty || !!this.languageEditor.current?.dirty) || document.id === 'route:publish' && this.publishUnapplied;
      if (document.dirty || pageDraft) {
        this.documentConfirm = { title: '关闭未保存的文档？', description: pageDraft ? '当前输入尚未应用。保留修改后可返回继续编辑；放弃会先展示当前对象及关联内容的实际范围。' : '修改保留在作品工作区；保存和放弃会先展示各自的完整净差异。', close: () => { this.documentConfirm = null; this.render(); resolve(false); }, actions: [{ label: '保留修改并关闭', run: () => finish(true) }, { label: '放弃修改并关闭', tone: 'danger', run: async () => { if (await this.discardDocument(document)) await finish(); } }, ...(!pageDraft ? [{ label: '保存并关闭', tone: 'primary' as const, run: async () => { const scope = await this.discardScope(document); if (!scope) throw new Error('当前文档的保存范围不可用'); this.documentConfirm = null; this.render(); await this.save(false, scope.documentId); const pending = await this.services.bridge.documents.planSave({ kind: 'current', documentId: scope.documentId }); if (!pending.ok || (scope.objectId ? pending.value.objects.some(object => object.objectId === scope.objectId) : pending.value.files.length > 0)) { resolve(false); return; } await finish(); } }] : [])] }; this.render();
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
  private async openEntryPresentation(kind: 'chapter' | 'scene', objectId: string, resume?: {draft:import('@galcraft/contracts').SceneEntryPresentation;original:string}): Promise<void> {
    if (!this.inputDraftRestoring && !await this.flushScript()) return;
    const source = this.controller.source; if (!source) return;
    const id = `entry:${kind}:${objectId}`, opened = this.documents.find(document => document.id === id); if (opened) { await this.openDocument(opened); return; }
    if (this.formDocuments.has(id)) { const locale=this.controller.preferences.locale;const retained: AuthorDocument = { id, kind: 'route', objectId: 'editor', title: `${kind==='chapter'?tr(locale,'章节开场','Chapter opening','章の開始'):tr(locale,'场景开场','Scene opening','シーンの開始')} · ${kind === 'chapter' ? source.project.chapters.find(chapter => chapter.id === objectId)?.name : source.scenes.find(scene => scene.sceneId === objectId)?.name}` }; this.documents = openAuthorDocument(this.documents, retained); await this.openDocument(retained); return; }
    const listed = await this.services.bridge.documents.list(); if (!listed.ok) throw new Error(listed.error.message);
    const scene = source.scenes.find(scene => scene.sceneId === objectId), chapter = source.project.chapters.find(chapter => chapter.id === objectId);
    const ownerId = kind === 'chapter' ? source.projectDocumentId : scene?.documentId;
    const owner = listed.value.find(document => document.documentId === ownerId); if (!owner) return;
    const rawPath = Object.keys(owner.files).find(path => path.endsWith('.json'))!, data = JSON.parse(owner.files[rawPath]!).data;
    const originalValue = kind === 'chapter' ? data.chapters.find((chapter: { id: string }) => chapter.id === objectId)?.presentation : data.presentation;
    let original = resume?.original ?? JSON.stringify(originalValue ?? null), draft = resume?.draft ?? SceneEntryPresentationSchema.parse(originalValue ?? { title: null, interlude: null }), dirty = !!resume, busy = false;
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
        if (JSON.stringify(old ?? null) !== original) throw new Error(tr(locale, '入口配置已变化，请保留输入并重新打开审阅。', 'Entry settings changed. Keep your input and reopen for review.', '入口設定が変更されました。入力を保持して再確認してください。'));
        const after = kind === 'chapter' ? { ...before, chapters: before.chapters.map((chapter: { id: string }) => chapter.id === objectId ? { ...chapter, presentation: checked.data } : chapter) } : { ...before, presentation: checked.data };
        const bindings = round5AssetBindings(kind === 'chapter' ? { project: after } : { scene: after });
        const result = await this.applyWorkbenchObject({ label: tr(locale, '修改入口演出', 'Edit entry presentation', '入口演出を変更'), origin: 'field', expected: [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }],
          patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: kind === 'chapter' ? '/data/chapters' : '/data/presentation', before: kind === 'chapter' ? before.chapters : before.presentation ?? null, after: kind === 'chapter' ? after.chapters : checked.data, op: 'set' }] }], preparedAssets: [], requiredRefs: bindings.map(binding => ({ kind: binding.variantId ? 'variant' : 'asset', id: binding.variantId ?? binding.assetId })) });
        if (result) throw new Error(result); original = JSON.stringify(checked.data); dirty = false;
        this.documents = this.documents.map(item => item.id === id ? { ...item, dirty: true } : item); this.refreshDocumentTabs();
        status.textContent = tr(locale, '已应用 · 待保存。保存作品时审阅实际差异。', 'Applied · Unsaved. Review the actual changes when saving.', '適用済み・未保存。作品の保存時に差分を確認してください。');
      } finally { busy = false; refreshActions(); }
    };
    const draw = () => react.render(createElement(SceneEntryEditor, { value: draft, assets: [...this.assetCache.values()], locale,
      change: value => { draft = value; dirty = true; status.textContent = tr(locale,'未应用 · 应用后进入工作区，保存后落盘。','Unapplied · Apply to working content, then save to disk.','未適用・作業内容に適用してから保存してください。'); this.documents = this.documents.map(item => item.id === id ? { ...item, dirty: true } : item); this.refreshDocumentTabs(); refreshActions(); draw(); } }));
    const reload = async (force = false) => {
      if (dirty && !force || busy) return;
      const current = await this.services.bridge.documents.list(); if (!current.ok || dirty && !force) return;
      const document = current.value.find(document => document.documentId === ownerId); if (!document?.files[rawPath]) return;
      const data = JSON.parse(document.files[rawPath]!).data, value = kind === 'chapter' ? data.chapters.find((chapter: { id: string }) => chapter.id === objectId)?.presentation : data.presentation;
      const next = JSON.stringify(value ?? null);
      status.textContent = document.dirty ? tr(locale,'已应用 · 待保存。','Applied · Unsaved.','適用済み・未保存。') : tr(locale,'已保存 · 当前工作区设置。','Saved · Current workspace settings.','保存済み・現在の作業設定。');
      if (this.documents.find(item => item.id === id)?.dirty !== document.dirty) { this.documents = this.documents.map(item => item.id === id ? { ...item, dirty: document.dirty } : item); this.refreshDocumentTabs(); }
      if (next === original && !force) return;
      original = next; draft = SceneEntryPresentationSchema.parse(value ?? { title: null, interlude: null }); dirty = false; error.textContent = '';
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
    this.formDocuments.get(id)!.capture = () => asJson({kind:'entry',entryKind:kind,objectId,draft,original});
    this.formDocuments.get(id)!.scope = { documentId: owner.documentId, ...(kind === 'chapter' ? { paths: ['/data/chapters'] } : { paths: ['/data/presentation'] }) };
    const inspector=el('section','authoring-inspector');inspector.append(el('h2','',chapter?.name??scene?.name??''),el('p','',kind==='chapter'?tr(locale,'章节开场 · 在本章首场景播放','Chapter opening · Plays at the first scene','章の開始・最初のシーンで再生'):tr(locale,'场景开场 · 在本场景正文前播放','Scene opening · Plays before this scene','シーンの開始・本文の前に再生')),el('p','field-help',tr(locale,'短标题卡与全屏间幕在中央设置。应用后进入工作区，保存后落盘。','Configure the title card and fullscreen interlude in the document. Apply to working content, then save to disk.','中央でタイトルと幕間を設定します。作業内容に適用してから保存してください。')));
    this.formDocuments.get(id)!.inspector=inspector;this.render();
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
        await this.production.refresh();
        const candidateIds = result.kind === 'task' ? result.candidateIds ?? [] : [result.candidateId];
        const taskId = result.kind === 'task' ? result.taskId : result.taskId ?? this.production.data.candidates.find(item => item.candidate.id === result.candidateId)?.candidate.taskId;
        if (!taskId || !this.production.data.tasks.some(item => item.id === taskId)) { const error = { code: 'PLUGIN_RESULT_MISSING', severity: 'error' as const, owner: 'M01' as const, message: '制作结果已移除或不属于当前作品', related: [], actions: [] }; return { ok: false, error, issues: [error] }; }
        this.production.taskId = taskId; this.production.selected = new Set(candidateIds); this.production.changed(); this.render();
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
        if(discardProduction&&this.production){this.production.guiDraft=null;this.production.connectionGuiDraft=null;this.production.connectionDirty=false;}
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
      const payload = draft.value as { savedAt?: string; documents?: { files: Record<string, string> }[] };
      const paths = [...new Set(payload.documents?.flatMap(item => Object.keys(item.files)) ?? [])];
      let choice = 'restore';
      const result = await requestDialog({ title: tr(locale, '恢复未保存内容', 'Recover unsaved work', '未保存の作業を復元'), locale, review: true,
        description: tr(locale, '检测到上次退出时保留的草稿。恢复后仍需审阅并保存；取消会保留草稿，稍后可继续处理。', 'A draft from the previous session is available. Review and save after restoring. Cancel keeps the draft for later.', '前回の草稿があります。復元後に内容を確認して保存してください。キャンセルすると草稿を保持します。'),
        content: createElement('div', { className: 'document-recovery' },
          createElement('p', {}, payload.savedAt ? new Date(payload.savedAt).toLocaleString(locale) : ''),
          createElement('ul', {}, paths.map(path => createElement('li', { key: path }, path))),
          createElement('label', {}, createElement('input', { type: 'radio', name: 'recovery-choice', defaultChecked: true, onChange: () => { choice = 'restore'; } }), tr(locale, '恢复草稿', 'Restore draft', '草稿を復元')),
          createElement('label', {}, createElement('input', { type: 'radio', name: 'recovery-choice', onChange: () => { choice = 'discard'; } }), tr(locale, '放弃草稿，使用已保存内容', 'Discard draft and use saved content', '草稿を破棄して保存済みの内容を使用'))),
        confirmLabel: tr(locale, '应用恢复选择', 'Apply recovery choice', '復元の選択を適用'), confirm: async () => {
          const recovered = await api.recover(choice as 'restore' | 'discard');
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
      for (const [id, text] of this.writingDrafts) {
        this.controller.select([id]);
        const previous = this.controller.parsed()?.parsed.cst.find(node => node.id === id)?.object?.value as Record<string, unknown> | undefined;
        const content = DialogueContentSchema.safeParse(previous?.text).data ?? '';
        const result = await this.controller.editFields([{ field: 'text', op: 'set', value: replaceDialogueText(content, text) }]);
        if (!this.notice(result)) return false;
        if (this.writingDrafts.get(id) === text) this.writingDrafts.delete(id);
      }
      return true;
    });
    return this.writingPending;
  }
  private async flushScript(): Promise<boolean> {
    if((this.scriptDrafts.size||this.writingDrafts.size)&&this.inputOriginVersions){const source=this.controller.source,versions=new Map(this.inputOriginVersions.map(item=>[item.documentId,item.revision]));if(source?.scenes.some(scene=>(this.scriptDrafts.has(scene.sceneId)||this.writingDrafts.size>0&&scene.sceneId===this.controller.scene?.sceneId)&&versions.get(scene.documentId)!==scene.revision)){this.messageTone='error';this.message=tr(this.controller.preferences.locale,'来源场景已变化。原输入已保留，请复核后继续。','The source scene changed. Your input is retained for review.','元のシーンが変更されました。入力を保持して確認してください。');return false;}}
    if (!await this.flushWriting()) return false;
    if (this.scriptEditor) return this.scriptEditor.flush();
    const scene = this.controller.scene;
    const cached = scene && this.scriptSessions.get(scene.sceneId);
    if (cached && this.scriptDrafts.has(scene!.sceneId)) return cached.editor.flush();
    if (!scene || !this.scriptDrafts.has(scene.sceneId)) return true;
    const result = await this.controller.editScript(this.scriptDrafts.get(scene.sceneId)!, scene.sceneId);
    if (!this.notice(result)) return false;
    this.scriptDrafts.delete(scene.sceneId); return true;
  }
  private async save(all: boolean, documentId: Id | null = null): Promise<void> {
    await this.playerNameEditor?.waitForApply();
    if(this.publishUnapplied){await this.navigate('publish');this.revealInspector();this.messageTone='info';this.message=tr(this.controller.preferences.locale,'发行配置尚未应用。先点击“应用发行配置”，再保存全部。','Release settings are unapplied. Choose Apply release settings, then Save all.','配布設定が未適用です。「配布設定を適用」を選択してからすべて保存してください。');this.render();return;}
    const pending = this.unappliedInput();
    if (pending) { this.messageTone = 'error'; this.message = `${pending}仍有未应用输入。请返回该文档应用有效内容后保存。`; for(const form of this.formDocuments.values()){if(form.dirty()){const status=form.node.querySelector<HTMLElement>(':scope > [role="status"]');if(status)status.textContent=this.message;}} this.render(); return; }
    if (!await this.flushScript()) return;
    if (!all && !documentId) {
      const active = this.documents.find(document => document.id === this.activeDocument);
      documentId = active ? (await this.discardScope(active))?.documentId ?? null : this.controller.scene?.documentId ?? null;
    }
    if (!all && !documentId) return;
    const scope = all ? { kind: 'all' as const } : { kind: 'current' as const, documentId: documentId! };
    const plan = await this.services.bridge.documents.planSave(scope);
    if (!this.notice(plan)) return;
    const listed = await this.services.bridge.documents.list();
    if (!this.notice(listed)) return;
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
    const locale = this.controller.preferences.locale;
    if (!plan.value.files.length) {
      await this.controller.refresh({ documents: listed.value }); await this.designer?.refresh(); this.render();
      studioToasts.add({ title: tr(locale, all ? '当前没有待保存的修改' : '当前文档没有待保存的修改', all ? 'No changes to save' : 'No changes to save in this document', all ? '保存する変更はありません' : '現在の文書に保存する変更はありません') }); return;
    }
    const names = Object.fromEntries(listed.value.map(document => [document.documentId, name(document.documentId)]));
    const commit = async (savePlan: SavePlan) => {
      const result = await this.controller.savePlanned(savePlan);
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
      if (this.page === 'assets') await this.showAssets(); else this.render();
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
        if (!this.selectedAssets.size) { this.selectedAtIndexRevision = null; this.queryAtSelection = null; } },
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
    selected.append(button(this.t('selectAll'), async () => { const ids = await this.services.allAssetIds?.({ kind: this.assetQuery.kind, text: this.assetQuery.text,
      folder: this.assetQuery.folder, sort: this.assetQuery.sort, direction: this.assetQuery.direction }); if (ids && this.notice(ids)) {
      ids.value.ids.forEach(id => this.selectedAssets.add(id)); this.selectedAtIndexRevision = ids.value.indexRevision;
      this.queryAtSelection = { ...this.assetQuery }; this.render(); } }));
    selected.append(button(tr(locale, '查看所选', 'Inspect selected', '選択項目を確認'), async () => { await this.inspectSelected(true); }, 'asset-inspect-selected'));
    if (this.selectedAtIndexRevision !== null && this.assetPage && this.selectedAtIndexRevision !== this.assetPage.indexRevision)
      selected.append(button(tr(locale, '重新核对所选', 'Recheck selected', '選択項目を再確認'), async () => { this.selectedAtIndexRevision = this.assetPage!.indexRevision; await this.inspectSelected(true); }));
    selected.append(button(tr(locale, '批量命名', 'Batch rename', '一括名前変更'), () => this.renameSelected()));
    selected.append(button(tr(locale, '移除所选', 'Remove selected', '選択項目を削除'), () => this.removeSelected()));
    selected.append(button(this.t('clear'), () => { this.selectedAssets.clear(); this.selectedDetails = null; this.missingSelected = [];
      this.queryAtSelection = null; this.selectedAtIndexRevision = null; this.render(); }));
    if (!this.selectedAssets.size) for (const control of [...selected.querySelectorAll('button')].slice(2)) control.hidden = true;
    for (const control of [...selected.querySelectorAll('button')].slice(0, 2)) control.disabled = !this.assetPage?.total;
    return selected;
  }
  private refreshAssetSelection(): void {
    const previousInspector=this.assetInspectorView?.node;
    for(const row of this.root.querySelectorAll<HTMLElement>('.authoring-asset')){const id=row.dataset.pluginAssetId!;row.classList.toggle('inspected',id===this.focusedAsset?.id);row.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked=this.selectedAssets.has(id);}
    this.root.querySelector('.asset-selection-bar')?.replaceWith(this.assetSelectionBar());
    if(this.shellProps&&this.shellRoot){const inspector=this.assetInspector();inspector.append(this.resourceProcessorInspector);this.shellProps={...this.shellProps,inspector,explorer:this.assetExplorer()};flushSync(()=>this.shellRoot!.render(createElement(AuthoringWorkbench,this.shellProps!)));}
    if(this.assetInspectorView?.node!==previousInspector)void this.loadThumbnails(this.thumbnailGeneration);
  }
  private async focusAsset(id: Id): Promise<void> {
    const indexed=this.assetPage?.items.find(asset=>asset.id===id)??this.assetCache.get(id);
    if(indexed)this.focusedAsset=indexed;else{const result=await this.services.getAsset?.(id);if(!result||!this.notice(result))return;this.focusedAsset=result.value;}this.preview = null;
    if(this.page==='assets'&&this.shellProps?.page==='assets'&&this.root.querySelector('.authoring-asset-list'))this.refreshAssetSelection();else this.render();
    this.revealInspector();
  }
  private revealInspector(): void {
    const toggle = this.root.querySelector<HTMLButtonElement>('.gc-wb-layout-tools button[data-workbench-action="inspector"]');
    if (toggle?.getAttribute('aria-pressed') !== 'true') toggle?.click();
  }
  private assetInspector(): HTMLElement {
    const root = el('section', 'authoring-inspector asset-workbench-inspector'), asset = this.focusedAsset, locale = this.controller.preferences.locale;
    if (!asset) {
      root.append(el('h2', '', tr(locale, '素材库概要', 'Asset library', '素材ライブラリ')), el('p', '', tr(locale, `当前筛选共 ${this.assetPage?.total ?? 0} 项素材，已选 ${this.selectedAssets.size} 项。`, `${this.assetPage?.total ?? 0} matching assets; ${this.selectedAssets.size} selected.`, `${this.assetPage?.total ?? 0} 件の素材、${this.selectedAssets.size} 件選択。`)),
        el('p', '', this.assetPage?.total ? tr(locale, '单击素材查看属性，F2 改名，双击缩略图预览。勾选素材后可跨页批量操作。', 'Select to inspect, F2 to rename, double-click a thumbnail to preview. Check assets for batch actions across pages.', 'クリックで属性、ダブルクリックで素材を開きます。チェックで複数ページを一括操作できます。') : tr(locale, '当前没有可显示的素材。调整筛选或导入文件后，可在这里查看属性。筛选外的所选素材会继续保留。', 'No assets are visible. Adjust filters or import files to inspect their properties. Selected assets outside the filters are retained.', '表示できる素材がありません。絞り込みの変更や読み込み後に属性を確認できます。非表示の選択素材は保持されます。')));
      if (this.selectedAssets.size) root.append(button(tr(locale, '查看所选', 'Inspect selected', '選択項目を確認'), () => this.inspectSelected(true).then(() => {})));
      return root;
    }
    const cached=this.assetInspectorView;
    const selectionText=tr(locale,`已选 ${this.selectedAssets.size} 项 · 当前对象：${asset.name}`,`${this.selectedAssets.size} selected · Current: ${asset.name}`,`${this.selectedAssets.size} 件選択 · 現在：${asset.name}`);
    if(cached?.asset===asset&&cached.locale===locale){cached.summary.textContent=selectionText;cached.summary.hidden=this.selectedAssets.size<2;return cached.node;}
    if (cached) disposeAssetInspector(cached.node);
    const inspector = createAssetInspector(asset, { locale, services: this.services, changed: async () => {
      await this.controller.acceptExternalEdit(null, this.controller.source?.assetIndexDocumentId ?? null);
      const found = await this.services.getAsset?.(asset.id); if (found?.ok && found.value) { this.focusedAsset = found.value; this.assetCache.set(asset.id, found.value); }
      this.assetInspectorView = null; disposeAssetInspector(inspector); await this.showAssets();
    }, rename: name => this.renameAsset(asset.id, name), preview: variantId => { void this.previewAsset(asset.id, variantId); }, reveal: () => { void this.services.revealEntity({ kind: 'asset', id: asset.id }).then(result => this.notice(result)); }, transparent: () => { void this.removeAssetBackground(asset); } });
    const character = this.controller.source?.characters.find(item => item.id === asset.characterId), scenes = this.controller.source?.scenes.filter(item => asset.sceneIds.includes(item.sceneId)) ?? [];
    inspector.append(el('p', '', [character?.name, ...scenes.map(scene => scene.name)].filter(Boolean).join(' · ')));
    inspector.append(button(tr(locale,'查看引用','View references','参照を表示'), async () => { const source=this.controller.source; if(!source)return; Object.assign(this.sidebarState,{tab:'search',mode:'asset',target:asset.id,targetLabel:asset.name,scope:'project',offset:0}); await runSidebarSearch({services:this.services,source,sceneId:this.controller.scene?.sceneId??null,state:this.sidebarState}); this.page='editor';this.render(); }));
    if (asset.kind === 'animation') inspector.append(button(tr(locale,'编辑动画素材','Edit animation asset','アニメーション素材を編集'), ()=>this.openAnimationAsset(asset)));
    const summary=el('p','',selectionText);summary.hidden=this.selectedAssets.size<2;inspector.prepend(summary);this.assetInspectorView={asset,locale,node:inspector,summary};
    return inspector;
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
      draw(); this.openFormDocument(id, asset.name, container, () => dirty, () => { disposed = true; root.unmount(); }, draw);this.formDocuments.get(id)!.capture=()=>asJson({kind:'animationAsset',assetId:asset.id,gui:this.professionalInputs.get(id)}); if (this.controller.source?.assetIndexDocumentId) this.formDocuments.get(id)!.scope = { documentId: this.controller.source.assetIndexDocumentId };
  }
  private async renameAsset(id: Id, name: string): Promise<void> {
    if (!this.services.renameAssets) throw new Error('素材改名服务不可用');
    const result = await this.services.renameAssets([{ id, name }]); if (!result.ok) throw new Error(result.error.message);
    this.selectedDetails = null; this.assetCache.delete(id); await this.controller.acceptExternalEdit(result.value); await this.loadQuickAssets();
    const found = await this.services.getAsset?.(id); if (found?.ok) { this.focusedAsset = found.value; if(this.characterAsset?.id===id)this.characterAsset=found.value; }
    if(this.page==='assets')await this.showAssets();else this.render();
  }
  private async editAssetName(id: Id): Promise<void> {
    await this.focusAsset(id); this.root.querySelector<HTMLInputElement>('[data-asset-name]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
  }
  private selectAsset(id: Id, event?: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): void {
    const visible = this.assetPage?.items.map(asset => asset.id) ?? [];
    if (event?.shiftKey && this.assetRangeAnchor && visible.includes(this.assetRangeAnchor)) { const from = visible.indexOf(this.assetRangeAnchor), to = visible.indexOf(id); for(const key of visible.slice(Math.min(from,to),Math.max(from,to)+1))this.selectedAssets.add(key); }
    else if (event?.ctrlKey || event?.metaKey) { this.selectedAssets.has(id) ? this.selectedAssets.delete(id) : this.selectedAssets.add(id); this.assetRangeAnchor=id; }
    else { this.selectedAssets.clear(); this.selectedAssets.add(id); this.assetRangeAnchor=id; }
    this.selectedDetails=null;this.selectedAtIndexRevision=this.assetPage?.indexRevision??null;this.queryAtSelection={...this.assetQuery};void this.focusAsset(id);
  }
  private assetMenuGroups(id: Id, scope: string[], hidden: number) {
    const asset = this.assetPage?.items.find(item => item.id === id) ?? this.assetCache.get(id);
    return [{ label: `当前对象：${asset?.name ?? id}`, actions: [
      { label: this.t('preview'), run: () => { void this.previewAsset(id); } }, { label: '重命名', run: () => { void this.editAssetName(id); } },
      { label: this.t('openDirectory'), run: () => { void this.services.revealEntity({kind:'asset',id}).then(result=>this.notice(result)); } },
    ] }, { label: `所选 ${scope.length} 项${hidden ? ` · 隐藏 ${hidden} 项` : ''}`, actions: [
      { label: `批量命名所选 ${scope.length} 项`, run: () => { void this.renameSelected(); } },
      { label: `移除所选 ${scope.length} 项`, danger:true, run: () => { void this.removeSelected(); } },
    ] }];
  }

  private assetExplorer(): HTMLElement {
    const locale = this.controller.preferences.locale;
    if (!this.assetExplorerMount) {
      const node = el('div', 'asset-workbench-explorer'), types = el('div'), objects = el('div'), filters = el('div'), heading = el('h3', 'gc-wb-tree-section-title');
      node.append(types, filters, heading, objects);
      this.assetExplorerMount = { node, filters, heading, typeRoot: createRoot(types), objectRoot: createRoot(objects) };
    }
    const { node, filters, heading, typeRoot, objectRoot } = this.assetExplorerMount;
    filters.replaceChildren(this.assetNavigationFilters);
    heading.textContent = tr(locale, '本页素材', 'Assets on this page', 'このページの素材');
    const types = uniqueAssetTypes(this.assetTypes), groups = new Map<string, WorkbenchTreeNode[]>();
    const nodes: WorkbenchTreeNode[] = [{ id: 'kind:', name: tr(locale, '全部素材', 'All assets', 'すべての素材'), detail: String(types.reduce((sum, item) => sum + (item.count ?? 0), 0)) }];
    for (const item of types) {
      const type = item.descriptor, node: WorkbenchTreeNode = { id: `kind:${type.key}`, name: assetTypeName(type.key, this.assetTypes, locale), detail: String(item.count ?? 0), icon: createElement('span', { className: 'asset-type-icon', title: type.icon, ref: (element: HTMLSpanElement | null) => { element?.replaceChildren(actionIcon(type.icon)); } }) };
      if (type.group) { const children = groups.get(type.group) ?? []; children.push(node); groups.set(type.group, children); } else nodes.push(node);
    }
    for (const [group, children] of groups) nodes.push({ id: `type-group:${group}`, name: group === 'unavailable' ? tr(locale, '提供方不可用', 'Provider unavailable', '提供元なし') : group, container: true, children });
    typeRoot.render(createElement(ObjectTree, { nodes, selected: [`kind:${this.assetQuery.kind ?? ''}`], label: tr(locale, '素材类型', 'Asset types', '素材の種類'), locale, onSelect: ids => { const id = ids.find(id => id.startsWith('kind:')); if (id) { this.assetQuery = { ...this.assetQuery, kind: id.slice(5) || null, typeFields: {}, offset: 0 }; this.activeDocument = 'route:assets'; void this.showAssets(); } }, onOpen: () => {} }));
    const folders = new Map<string, WorkbenchTreeNode[]>();
    for (const asset of this.assetPage?.items ?? []) { const folder = asset.folder.join('/'); const children = folders.get(folder) ?? []; children.push({ id: asset.id, name: asset.name }); folders.set(folder, children); }
    objectRoot.render(createElement(ObjectTree, { nodes: [...folders].map(([folder, children]) => ({ id: `folder:${folder}`, name: folder || tr(locale, '根目录', 'Root folder', 'ルート'), container:true, children })), selected:[...this.selectedAssets], label: tr(locale, '本页素材', 'Assets on this page', 'このページの素材'), onSelect: ids => { this.selectedAssets=new Set(ids.filter(id=>!id.startsWith('folder:')));this.selectedAtIndexRevision=this.assetPage?.indexRevision??null;this.selectedDetails=null; }, onPrimary:id=>{void this.focusAsset(id);}, onOpen:(id,pinned)=>{if(!id.startsWith('folder:')){if(pinned)void this.previewAsset(id);else void this.focusAsset(id);}}, onRename:async(id,name)=>{try{await this.renameAsset(id,name);}catch(error){return String(error instanceof Error?error.message:error);}}, menuGroups:(node,scope,hidden)=>node.container?[{label:node.name,actions:[{label:'导入素材',run:()=>{void this.chooseAssetImport();}}]}]:this.assetMenuGroups(node.id,scope,hidden) }));

    return node;
  }
  private async previewAsset(id: Id, variantId?: Id): Promise<void> {
    const result = await this.services.getAsset?.(id); if (!result || !this.notice(result) || !result.value) return;
    const asset = result.value, dialog = el('dialog'); dialog.className = 'asset-preview-dialog';
    const locale = this.controller.preferences.locale, heading = el('header');
    heading.append(el('h2', '', tr(locale, '素材预览', 'Asset preview', '素材プレビュー')));
    dialog.append(heading);
    const frame = el('div', 'asset-preview-frame'); dialog.append(frame);
    const preview = createAssetPickerPreview(frame, this.services, this.controller.preferences.locale);
    if (asset.kind === 'image') { let native = false; heading.append(button(tr(locale, '原始尺寸 / 适应窗口', 'Original size / Fit', '原寸 / 全体表示'), () => { native = !native; frame.classList.toggle('is-native', native); })); }
    const footer=el('footer','studio-dialog-footer dialog-actions');footer.append(button(tr(locale,'关闭','Close','閉じる'),()=>dialog.close()));dialog.append(footer);
    document.body.append(dialog);
    dialog.addEventListener('close', () => { preview.dispose(); dialog.remove(); });
    dialog.showModal();
    await preview.preview(asset, variantId ?? null);
  }
  private async renameSelected(resume?: {template:string}): Promise<void> {
    if (!await this.inspectSelected() || !this.services.planBatchRename || !this.services.applyBatchRename || !this.selectedDetails) return;
    const selected=[...this.selectedAssets], id=`batch-rename:${selected.join(',')}`,existing=this.documents.find(document=>document.id===id);if(existing){await this.openDocument(existing);return;}
    const items=this.selectedDetails, assets=await Promise.all(items.map(item=>this.services.getAsset?.(item.assetId)));
    const values=items.map((item,index)=>{const asset=assets[index]?.ok?assets[index].value:null,scene=asset?.sceneIds.map(id=>this.controller.source?.scenes.find(value=>value.sceneId===id)).find(Boolean),chapter=this.controller.source?.project.chapters.find(value=>value.id===scene?.chapterId);return{assetId:item.assetId,chapter:chapter?.name??'',character:item.character?.name??'',usage:item.kind};});
    const node=el('section'),scope=el('p','',`所选 ${selected.length} 项素材（包含筛选外及其他页的成员）。只修改名称主体，原后缀、素材标识、版本和文件路径保持。`),input=el('input');input.value=resume?.template??'';input.ariaLabel='批量名称模板';input.placeholder='例如：背景 {number}';
    const table=el('table','asset-rename-table'),error=el('p','field-error');error.setAttribute('role','alert');
    const initial=()=>{table.replaceChildren();const header=el('tr');header.append(el('th','','修改前'),el('th','','修改后'));table.append(header);for(const item of items){const row=el('tr');row.append(el('td','',item.name),el('td','','—'));table.append(row);}};initial();
    let plan: Awaited<ReturnType<NonNullable<AuthoringServices['planBatchRename']>>>|null=null,busy=false;
    const apply=button(`应用 ${selected.length} 项改名`,async()=>{if(busy||!plan?.ok)return;busy=true;apply.disabled=true;error.textContent='';try{const result=await this.services.applyBatchRename!(plan.value.planId);if(!result.ok)throw new Error(result.error.message);this.selectedDetails=null;this.focusedAsset=null;this.assetCache.clear();await this.controller.acceptExternalEdit(null,this.controller.source?.assetIndexDocumentId??null);await this.loadQuickAssets();this.finishFormDocument(id);await this.showAssets();}catch(reason){error.textContent=String(reason);}finally{busy=false;apply.disabled=!plan?.ok;}},'authoring-primary');apply.disabled=true;
    const preview=button('预览命名',async()=>{if(busy)return;const template=input.value.trim();if(!template){error.textContent='请输入名称模板';return;}busy=true;preview.disabled=true;error.textContent='';try{const next=await this.services.planBatchRename!({assetIds:selected,template,values});if(template!==input.value.trim())return;plan=next;if(!next.ok){error.textContent=next.error.message;return;}initial();next.value.names.forEach((item,index)=>{const row=table.rows[index+1];if(row){row.cells[0]!.textContent=item.before;row.cells[1]!.textContent=item.after;}});error.textContent=next.value.conflicts.map(item=>`名称冲突：${item.name}（${item.assetIds.length} 项）`).join('；');apply.disabled=next.value.conflicts.length>0;}catch(reason){error.textContent=String(reason);}finally{busy=false;preview.disabled=false;}});
    const controls=el('div','asset-rename-controls');controls.append(input,preview);
    input.oninput=()=>{plan=null;apply.disabled=true;};node.append(scope,controls,table,error,apply);this.openFormDocument(id,`批量命名 · ${selected.length} 项素材`,node,()=>Boolean(input.value));this.formDocuments.get(id)!.capture=()=>asJson({kind:'batchRename',ids:selected,template:input.value});
  }
  private async removeSelected(): Promise<void> {
    if (!await this.inspectSelected() || !this.services.removeAssets || !this.selectedDetails) return;
    const items = this.selectedDetails;
    await this.confirmAction(`移除所选 ${items.length} 项素材`, `${items.map(item => item.name).join('、')}。移除素材索引并保留磁盘原文件；可通过作品撤销恢复。`, '移除素材', async () => {
      const result = await this.services.removeAssets!(items.map(item => item.assetId)); if (!result.ok) throw new Error(result.error.message);
      for (const item of items) this.assetCache.delete(item.assetId);
      this.selectedAssets.clear(); this.selectedDetails = null; this.focusedAsset = null;
      await this.controller.refresh(); await this.showAssets();
    });
  }
  private async removeAssetBackground(asset: Asset): Promise<void> {
    if (!this.services.removeBackground || asset.kind !== 'image') return;
    if (this.mattingBusy) return;
    if (this.mattingCandidate) { this.message = '请先采用或取消当前透明版本候选'; this.render(); return; }
    const declared = await this.ask('透明化预期：removed / unchanged / unknown', 'unknown');
    if (declared === null) return;
    if (!['removed', 'unchanged', 'unknown'].includes(declared)) { this.message = '请选择有效预期'; this.render(); return; }
    this.mattingBusy = true;
    let result: Awaited<ReturnType<NonNullable<AuthoringServices['removeBackground']>>>;
    try {
      result = await this.services.removeBackground({ assetId: asset.id, sourceVariantId: asset.activeVariantId,
        choice: { enabled: true, provider: 'node', connectionId: null, workflowBindingId: null },
        declared: declared as 'removed' | 'unchanged' | 'unknown' });
    } finally { this.mattingBusy = false; }
    if (!this.notice(result)) return;
    if (result.value.preparationId && result.value.previewUri) this.mattingCandidate = { assetId: asset.id,
      preparationId: result.value.preparationId, previewUri: result.value.previewUri,
      references: result.value.references ?? [], selectedSourceKeys: new Set() };
    else this.message = result.value.status === 'needsReview' ? '需要人工检查素材；未采用透明版本' : result.value.status;
    this.render();
  }
  private async confirmBackground(scope: BackgroundAdoptionScope): Promise<void> {
    const candidate = this.mattingCandidate; if (!candidate || !this.services.confirmBackground) return;
    const result = await this.services.confirmBackground(candidate.preparationId, scope); if (!this.notice(result)) return;
    this.mattingCandidate = null; await this.controller.refresh(); await this.showAssets();
  }
  private async locateHit(source: Source): Promise<void> {
    if (!await this.flushScript()) return;
    if (!this.services.locate || !this.controller.scene) return;
    if (!this.searchOrigin) this.searchOrigin = { sceneId: this.controller.scene.sceneId, view: this.controller.view, statementId: this.controller.selection?.primaryId ?? null };
    const found = await this.services.locate(source); if (!this.notice(found)) return;
    const scene = this.controller.source?.scenes.find(item => item.documentId === found.value?.documentId);
    if (!scene || !found.value) { this.message = '来源已变化'; this.render(); return; }
    this.controller.selectScene(scene.sceneId);
    if (found.value.statementId) this.controller.select([found.value.statementId]);
    if (this.controller.view === 'script') this.controller.setCaret(found.value.statementId, found.value.start);
    this.render();
  }
  private async locateIssue(source: Source): Promise<void> {
    if (!await this.flushScript()) return;
    const scene = this.controller.source?.scenes.find(item => item.documentId === source.documentId);
    if (!scene || scene.revision !== source.revision) { this.message = '来源已变化'; this.render(); return; }
    this.controller.selectScene(scene.sceneId);
    this.controller.changeView('script');
    this.controller.setCaret(source.statementId ?? null, source.range?.start ?? 0);
    this.render();
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
    const catalog = await this.services.assetTypeCatalog?.();
    if (generation !== this.assetQueryGeneration || this.controller.source?.project.projectId !== projectId) return;
    if (catalog?.ok) this.assetTypes = catalog.value;
    let queried = await this.services.queryAssets(this.assetQuery);
    if (queried.ok) {
      const paging = assetPagination(queried.value.total, this.assetQuery.offset, this.assetQuery.limit);
      if (paging.offset !== this.assetQuery.offset) { this.assetQuery.offset = paging.offset; queried = await this.services.queryAssets(this.assetQuery); }
    }
    if (generation !== this.assetQueryGeneration || this.controller.source?.project.projectId !== projectId) return;
    if (this.notice(queried)) { this.assetPage = queried.value; queried.value.items.forEach(asset => this.assetCache.set(asset.id, asset)); this.page = 'assets'; this.render(); }
  }
  render(): void {
    if(this.disposed)return;
    void this.reportAuthoringDrafts();
    if (this.page !== 'assets' && this.assetInspectorView) { disposeAssetInspector(this.assetInspectorView.node); this.assetInspectorView = null; }
    const formDocumentId = this.activeDocument, formDocument = this.formDocuments.get(formDocumentId);
    for (const [id, form] of this.formDocuments) form.activate?.(id === formDocumentId);
    this.studioPlugins?.clearFieldEditors();
    this.studioPlugins?.publishScope();
    const focusRenderSequence = ++this.focusRenderSequence;
    const sameEditor = this.renderedPage === this.page && this.renderedSceneId === (this.controller.scene?.sceneId ?? null) && this.renderedView === this.controller.view;
    const focus = sameEditor ? captureAuthoringFocus(this.root) : null;
    const scriptFocused = sameEditor && Boolean(document.activeElement?.closest('.monaco-editor'));
    const previousCenter = this.root.querySelector<HTMLElement>('.authoring-center');
    const preserveCenter = sameEditor && this.pluginRenderLocale === this.controller.preferences.locale && this.renderedRevision === (this.controller.scene?.revision ?? null) && previousCenter;
    this.renderedRevision = this.controller.scene?.revision ?? null;
    this.renderedSceneId = this.controller.scene?.sceneId ?? null; this.renderedView = this.controller.view;
    for (const region of this.inspectorRoots) region.unmount(); this.inspectorRoots = [];
    const previousContent = this.root.querySelector<HTMLElement>('.studio-content');
    if (previousContent && this.renderedPage) this.pageScroll.set(this.renderedPage, previousContent.scrollTop);
    const routeChanged = this.renderedPage !== this.page; this.renderedPage = this.page;
    if (this.page !== 'production' && this.page !== 'assistant') for (const media of this.workbenchNode.querySelectorAll<HTMLMediaElement>('audio,video')) { media.pause(); media.currentTime = 0; }
    if (routeChanged || this.pluginRenderLocale !== this.controller.preferences.locale) this.studioPlugins?.unmountViews();
    this.pluginRenderLocale = this.controller.preferences.locale;
    if (this.designer) this.designerResume = this.designer.capture();
    this.scriptEditor = null;
    this.previewAudioCleanup?.(); this.previewAudioCleanup = null;
    this.previewMedia?.pause(); this.previewMedia = null;
    const locale = this.controller.preferences.locale;
    if (this.root.lang !== locale) { this.miniStage?.dispose(); this.miniStage = null; if(this.designer){this.designerResume=this.designer.capture();this.designer.dispose();this.designer=null;} }
    this.root.lang = locale; this.root.dataset.theme = this.controller.preferences.theme;
    let portals = document.getElementById('studio-portals');
    if (!portals) { portals = el('div'); portals.id = 'studio-portals'; document.body.append(portals); installTransientScrollbars(portals); observeFormHints(portals); }
    portals.dataset.theme = this.controller.preferences.theme; portals.lang = locale;
    const shell = el('div', 'authoring-shell');
    shell.dataset.railCollapsed = String(this.railCollapsed);
    this.headerRoot ??= createRoot(this.headerNode);
    this.headerRoot.render(createElement(ShellHeader, { locale, theme: this.controller.preferences.theme,
      project: this.controller.source?.project.name, dirty: this.controller.status.dirty,
      collapsed: this.railCollapsed, toggleSidebar: () => { this.railCollapsed = !this.railCollapsed; localStorage.setItem('studio:railCollapsed', String(this.railCollapsed)); this.render(); },
      preferences: value => { void this.preference(p => ({ ...p, ...value })); },
      action: value => { void this.shellAction(value).catch(error => { this.message = String(error); this.render(); }); } }));
    const body = el('div','studio-body'), rail = this.railNode; rail.ariaLabel = 'Studio';
    const routes = [['projects',this.t('projects'),'folder'],['editor',this.t('editor'),'edit'],['assets',this.t('assets'),'image'],['production',tr(locale,'制作','Produce','制作'),'spark'],['collaboration',tr(locale,'协作','Collaborate','連携'),'collaboration'],['pages',designerText('页面',locale),'layout'],['plugins',tr(locale,'插件','Plugins','拡張'),'package'],['publish',tr(locale,'发布','Publish','公開'),'publish']] as const;
    const railItems: RailItem[] = routes.map(([page,label,icon]) => ({key:page,label,icon,current:this.page===page || page==='pages'&&this.page==='assistant',disabled:page!=='projects'&&!this.controller.source}));
    const extensions = this.studioPlugins?.workbenches() ?? [];
    if (this.controller.source && extensions.length) {
      for (const extension of extensions) {
        const label = this.studioPlugins!.title(extension), key = `extension:${extension.key}` as Page;
        railItems.push({key,label,icon:'package',current:this.page===key,extension:true});
      }
    }
    this.railRoot ??= createRoot(rail); this.railRoot.render(createElement(RailNavigation,{items:railItems,locale,navigate:key=>{void this.navigate(key as Page);}}));
    const content=el('div','studio-content' + (['production','assistant','collaboration','plugins','publish'].includes(this.page) ? ' workbench-route-host' : '') + (['production','assistant'].includes(this.page) ? ' production-document-host' : '') + (routeChanged ? ' route-enter' : ''));body.append(content);shell.append(body);
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
      if(this.noticeAsset)notice.append(button(tr(locale,'查看引用','View references','参照を表示'),async()=>{
        const source=this.controller.source;if(!source)return;Object.assign(this.sidebarState,{tab:'search',mode:'asset',target:this.noticeAsset!,targetLabel:this.assetCache.get(this.noticeAsset!)?.name??'',scope:'project',offset:0});
        this.page='editor';await runSidebarSearch({services:this.services,source,sceneId:this.controller.scene?.sceneId??null,state:this.sidebarState});this.render();}));
      notice.append(actionIcon(this.messageTone === 'success' ? 'check' : 'info'), el('span', '', this.message), dismiss); content.append(notice); }
    if (this.page === 'projects') content.append(this.projects());
    if (this.page === 'editor') content.append(this.editor());
    if (this.page === 'assets') {
      content.append(this.assets()); this.resourceProcessorRoot ??= createRoot(this.resourceProcessorNode); content.append(this.resourceProcessorNode);
      this.resourceProcessorRoot.render(createElement(ResourceProcessors, { guiDraft:this.resourceProcessorGuiDraft,onGuiDraftChange:this.captureResourceProcessorGui,onUnappliedChange: this.setResourceProcessorUnapplied, bridge: (this.services.bridge as StudioBridge).assets, selectedIds: [...this.selectedAssets], locale, inspectorContainer: this.resourceProcessorInspector, workspace: this.documentWorkspace,
        indexRevision: this.assetPage?.indexRevision, changed: async receipt => { await this.controller.acceptExternalEdit(receipt); await this.showAssets(); } }));
    }
    let startDesigner = false, refreshDesigner = false;
    if (this.page === 'pages') { if (!this.designer) { this.designer = new PageDesigner(this.services, async (receipt, refresh) => { if (receipt) await this.controller.acceptExternalEdit(receipt, this.designer?.workbenchDocumentId(), refresh); else await this.controller.refresh(); this.refreshDesignerWorkbench(); }, locale, this.designerResume,
      (scope, intent) => { this.designerResume=this.designer!.capture();void this.openProduction(scope, intent); }, this.studioPlugins?.componentDefinitions() ?? [], (key, title) => { if (this.activeDocument === 'startup' || this.formDocuments.has(this.activeDocument)) return; const document: AuthorDocument = { id: `page:${key}`, kind: 'page', objectId: key, title }; this.documents = openAuthorDocument(this.documents, document); this.activeDocument = document.id; this.render(); }, () => this.save(false), source => { void this.navigate('editor').then(()=>this.locateIssue(source)); }, () => this.controller.scene&&this.controller.selection?.primaryId?{documentId:this.controller.scene.documentId,revision:this.controller.scene.revision,statementId:this.controller.selection.primaryId}:null,()=>this.render(),()=>{void this.reportAuthoringDrafts();}); startDesigner = true; } content.append(this.designer.root); }
    if (this.page === 'pages' && this.controller.source) { const source = this.controller.source; refreshDesigner = !startDesigner && (this.designerProjectRevision !== source.projectRevision || source.scenes.some(scene => this.designerSceneRevisions.get(scene.sceneId) !== scene.revision)); this.designerProjectRevision = source.projectRevision; this.designerSceneRevisions = new Map(source.scenes.map(scene => [scene.sceneId, scene.revision])); }
    const source=this.controller.source;
    this.production?.setVisible(['production','assistant'].includes(this.page));
    if(source&&(this.workbench||['production','assistant','collaboration','plugins','publish'].includes(this.page))) {
      this.production ??= new ProductionSession(workbenchBridge(this.services.bridge),source.project.projectId, () => this.controller.preferences.locale);
      if(this.productionGuiResume){const resume=this.productionGuiResume;this.production.guiDraft=resume.gui;this.production.connectionGuiDraft=resume.connection?{...resume.connection,secret:""}:null;this.production.candidateText=new Map(resume.candidateText);this.productionGuiResume=null;}
      this.productionSubscription ??= this.production.subscribe(this.productionChanged);
      this.workbench ??= createRoot(this.workbenchNode);if(['production','assistant','collaboration','plugins','publish'].includes(this.page))content.append(this.workbenchNode);
      const changed=async(receipt?: EditReceipt)=>{if(receipt)await this.controller.acceptExternalEdit(receipt);else await this.controller.refresh();this.render();};
      this.workbench.render(createElement('div',{className:'workbench-pages'},
        createElement('div',{hidden:!['production','assistant'].includes(this.page)},createElement(Production,{productionHost:this.studioPlugins,onUnappliedChange:this.setProductionUnapplied,onReviewChange:this.setProductionReview,session:this.production,services:this.services,locale,page:this.page==='assistant'?'pages':'production',navigate:(page:string)=>void this.navigate(page as Page),changed,documentActive:['production','assistant'].includes(this.page),inspectorContainer:this.productionInspector,explorerContainer:this.productionExplorer,revealInspector:()=>{ const toggle = this.root.querySelector<HTMLButtonElement>('.gc-wb-layout-tools button[data-workbench-action="inspector"]'); if (toggle?.getAttribute('aria-pressed') !== 'true') toggle?.click(); }})),
        createElement('div',{hidden:this.page!=='collaboration'},createElement(Collaboration,{bridge:(this.services.bridge as import('../../desktop-bridge.js').DesktopBridge).collaboration,locale,active:this.page==='collaboration',explorerContainer:this.collaborationExplorer,inspectorContainer:this.collaborationInspector})),
        createElement('div',{hidden:this.page!=='plugins'},createElement(Plugins,{bridge:workbenchBridge(this.services.bridge),locale,projectId:source.project.projectId,authorHost:this.studioPlugins,explorerContainer:this.pluginsExplorer,inspectorContainer:this.pluginsInspector,documentActive:this.page==='plugins',revealInspector:()=>this.revealInspector(),changed:async()=>{await this.controller.refresh();await this.refreshStudioPlugins();this.render();}})),
        createElement('div',{hidden:this.page!=='publish'},createElement(Publish,{onHistoryReady:this.setPublishHistory,key:this.publishDraftRevision,guiDraft:this.publishGuiDraft,onGuiDraftChange:this.capturePublishGui,services:this.services,source,locale,changed,onUnappliedChange:this.setPublishUnapplied,saveAll:()=>this.save(true),explorerContainer:this.publishExplorer,inspectorContainer:this.publishInspector,documentActive:this.page==='publish',revealInspector:()=>this.revealInspector()}))));
    }
    if (source && this.studioPlugins) {
      if (this.page.startsWith('extension:')) this.studioPlugins.mountWorkbench(this.page.slice('extension:'.length), content);
      else {
        const slots: Partial<Record<Page, StudioSlot>> = { projects: 'project.overview', editor: 'creation.tools', assets: 'assets.tools',
          pages: 'player-ui.tools', assistant: 'player-ui.tools', production: 'production.tools', publish: 'publish.checks', plugins: 'plugins.configuration' };
        const slot = slots[this.page]; if (slot) this.studioPlugins.mountSlot(slot, content);
      }
    }
    const status=el('div','studio-status');status.id='studio-status';
    let documentContent: HTMLElement = content, documentToolbar: HTMLElement | null = null, explorer: HTMLElement | null = null, inspector: HTMLElement | null = null, problems: HTMLElement | null = null;
    const editor = content.querySelector<HTMLElement>('.authoring-editor');
    if (editor) {
      documentToolbar = editor.querySelector<HTMLElement>(':scope > .authoring-toolbar');
      explorer = editor.querySelector<HTMLElement>('.authoring-sidebar');
      if (!explorer) { const nav = editor.querySelector<HTMLElement>('.authoring-nav'); nav?.querySelector('.authoring-scene-tree')?.remove(); explorer = nav; }
      inspector = editor.querySelector<HTMLElement>('.authoring-inspector'); problems = editor.querySelector<HTMLElement>('.authoring-diagnostic-content');
      documentContent = editor.querySelector<HTMLElement>('.authoring-center') ?? content;
      if (preserveCenter) {
        const actions = documentContent.querySelector('.authoring-selection-tools');
        documentContent = preserveCenter;
        for (const card of documentContent.querySelectorAll<HTMLElement>('[data-statement-id]')) {
          const selected = this.controller.selection?.statementIds.includes(card.dataset.statementId!) ?? false;
          card.classList.toggle('selected', selected);
        }
        // Keep text inputs and their local history, but replace selection-dependent controls.
        if (actions) documentContent.querySelector('.authoring-selection-tools')?.replaceWith(actions);
      }
      else if (this.controller.view === 'writing') {
        for (const input of documentContent.querySelectorAll<HTMLTextAreaElement>('.authoring-writing-input')) { const id = input.closest<HTMLElement>('[data-statement-id]')?.dataset.statementId; if (!id) continue; const previous = this.writingInputs.get(id); if (previous) { if (!this.writingDrafts.has(id) && previous.value !== input.value) { previous.value = input.value; resetWritingHistory(previous); } previous.disabled = input.disabled; input.replaceWith(previous); } else { this.writingInputs.set(id, input); attachWritingHistory(input); } }
      }
      const insertion = this.insertions.get(this.controller.scene?.sceneId ?? '');
      if (insertion) {
        if (insertion.node !== insertion.placeholder) inspector?.prepend(insertion.node);
        const target = insertion.beforeId ? documentContent.querySelector<HTMLElement>(`[data-statement-id="${CSS.escape(insertion.beforeId)}"]`) : null;
        if (target) target.before(insertion.placeholder); else (documentContent.querySelector('.authoring-card-list,.authoring-writing-list') ?? documentContent).append(insertion.placeholder);
      }
      const active = this.documents.find(item => item.id === this.activeDocument);
      if (active?.kind === 'project') {
        documentContent = active.objectId === 'preferences' ? inspector?.querySelector<HTMLElement>('.workbench-preferences') ?? content : this.projectDocument();
        documentToolbar = null; inspector = el('section', 'authoring-inspector'); inspector.append(el('h2','',active.title),el('p','',active.objectId === 'preferences' ? '偏好保存在本机工作台。' : `${source?.project.name} · ${source?.project.engineVersion}`));
      }
      if (active?.kind === 'characters') { documentContent = this.characterDocument(); documentToolbar = null; inspector = this.characterAsset ? createAssetInspector(this.characterAsset, { locale, rename: name => this.renameAsset(this.characterAsset!.id,name), preview: id => { void this.previewAsset(this.characterAsset!.id,id); }, reveal:()=>{void this.services.revealEntity({kind:'asset',id:this.characterAsset!.id});},transparent:()=>{void this.removeAssetBackground(this.characterAsset!);} }) : el('section','authoring-inspector',tr(locale,'选择差分、头像或声音素材查看属性。','Select a figure, portrait or voice asset to inspect.','差分、ポートレート、音声素材を選択してプロパティを表示します。')); }
      if (active?.kind === 'scene-graph' && source) { this.graphRoot ??= createRoot(this.graphNode); this.graphRoot.render(createElement(SceneGraph, { source, activeSceneId: this.controller.scene?.sceneId ?? null, locale, expanded: true, onNavigate: (sceneId, statementId) => { void this.openDocument({ kind: 'scene', objectId: sceneId }).then(() => { if (statementId) this.controller.select([statementId]); this.render(); }); } })); documentContent = this.graphNode; documentToolbar = null;
        inspector = el('section', 'authoring-inspector'); inspector.append(el('h2', '', tr(locale, '场景关系', 'Scene relationships', 'シーン関係')), el('p', '', tr(locale, '选择节点进入场景，选择连线定位对应指令。虚线表示调用。', 'Select a node to edit its scene, or a connection to locate its command. Dashed lines are calls.', 'ノードでシーンを編集し、接続で命令へ移動します。破線は呼び出しです。')));
      }
      if (this.activeDocument === 'empty') { documentContent = el('section', 'gc-wb-empty', '从对象树打开文档，继续编辑作品。'); documentToolbar = null; inspector = null; }
      else if (!active || active.kind === 'scene' || active.kind === 'route') {
        const scene = this.controller.scene; if (scene) { const document: AuthorDocument = { id: `scene:${scene.sceneId}`, kind: 'scene', objectId: scene.sceneId, title: scene.name, dirty: scene.dirty }; this.documents = openAuthorDocument(this.documents, document); this.activeDocument = document.id; if (!this.treeSelected.length) this.treeSelected = [scene.sceneId]; }
      }
    } else if (this.page === 'pages' && this.designer) { const regions = this.designer.workbenchRegions(); explorer = regions.tree; inspector = regions.inspector; if (this.activeDocument === 'startup') { documentContent = this.startupDocument(true); inspector = this.startupInspector; explorer = null; } }
    else { const title = routes.find(([page]) => page === this.page)?.[1] ?? this.studioPlugins?.workbenches().find(item => `extension:${item.key}` === this.page)?.title ?? this.page;
      const document: AuthorDocument = { id: `route:${this.page}`, title: typeof title === 'string' ? title : this.page, kind: 'route', objectId: this.page }; this.documents = openAuthorDocument(this.documents, document); this.activeDocument = document.id;
      explorer = el('div', 'gc-wb-tree-tools'); explorer.append(el('p', '', typeof title === 'string' ? title : this.page)); }
    if (this.page === 'assets') { inspector = this.assetInspector(); inspector.append(this.resourceProcessorInspector); explorer = this.assetExplorer(); }
    if (this.page === 'projects') { explorer = this.projectsExplorer; inspector = el('div', 'projects-inspector-host'); inspector.append(this.projectsInspector); }
    if (this.page === 'collaboration') {explorer=this.collaborationExplorer;inspector=this.collaborationInspector;}
    if (this.page === 'plugins') { explorer = this.pluginsExplorer; inspector = el('div', 'plugins-inspector-host'); inspector.append(this.pluginsInspector); }
    if (this.page === 'publish') { explorer = this.publishExplorer; inspector = el('div', 'publish-inspector-host'); inspector.append(this.publishInspector); }
    if (['production','assistant'].includes(this.page)) { inspector = el('div', 'production-inspector-host'); inspector.append(this.productionInspector); explorer = el('div', 'production-explorer-host'); explorer.append(this.productionExplorer); }
    for (const slot of content.querySelectorAll<HTMLElement>(':scope > .studio-plugin-slot')) { inspector ??= el('aside', 'authoring-inspector'); inspector.append(slot); }
    const noticeRegion = el('div');
    for (const notice of content.querySelectorAll<HTMLElement>(':scope > .authoring-notice,:scope > .workbench-error')) noticeRegion.append(notice);
    const notice = this.noticeIssue ? createElement(IssueNotice, { issue: this.noticeIssue, locale, dismiss: () => { this.message = ''; this.render(); }, recovery: this.noticeRecovery ?? (this.noticeAsset ? { label: tr(locale, '查看引用', 'View references', '参照を表示'), run: () => { const source = this.controller.source; if (!source) return; Object.assign(this.sidebarState, { tab: 'search', mode: 'asset', target: this.noticeAsset!, targetLabel: this.assetCache.get(this.noticeAsset!)?.name ?? '', scope: 'project', offset: 0 }); this.page = 'editor'; void runSidebarSearch({ services: this.services, source, sceneId: this.controller.scene?.sceneId ?? null, state: this.sidebarState }).then(() => this.render()); } } : this.noticeIssue.source ? { label: tr(locale, '定位问题', 'Locate issue', '問題へ移動'), run: () => { void this.locateIssue(this.noticeIssue!.source!); } } : undefined) }) : noticeRegion.childElementCount ? createElement(DomRegion, { node: noticeRegion }) : undefined;
    if (this.activeDocument !== 'startup' || this.page !== 'pages') { if (this.startupRoot) this.startupDocument(false); if (this.stopStartup) { this.startupGeneration++; this.stopStartup(); } }
    if (this.page === 'pages' && !this.documents.some(item => item.id === this.activeDocument && ['page', 'startup'].includes(item.kind))) { const capture = this.designer?.capture(); const document: AuthorDocument = { id: `page:${capture?.page ?? 'title'}`, title: capture?.page ?? '页面', kind: 'page', objectId: capture?.page }; this.documents = openAuthorDocument(this.documents, document); this.activeDocument = document.id; }
    this.documents = this.documents.map(document => {
      const scene = document.kind === 'scene' ? source?.scenes.find(item => item.sceneId === document.objectId) : null;
      if (scene) {
        const dirty = scene.dirty || scene.sceneId === this.controller.scene?.sceneId && this.writingDrafts.size > 0;
        return { ...document, title: scene.name, dirty, preview: dirty ? false : document.preview };
      }
      return document.id === 'route:publish' ? { ...document, dirty: this.publishUnapplied || !!source?.projectDirty }
        : document.kind === 'startup' ? { ...document, dirty: this.startupDraft || source?.projectDirty }
        : document.kind === 'page' ? { ...document, title: this.designer?.workbenchPages().find(page => page.id === document.objectId)?.name ?? designerPageName(document.objectId ?? document.id.slice(5), locale), dirty: this.designer?.hasWorkingChanges() ?? document.dirty } : document;
    });
    const animationPreview = formDocument?.node.querySelector('.animation-stage-preview');
    if (animationPreview && this.miniStage) animationPreview.append(this.miniStage.root);
    this.shellRoot ??= createRoot(this.shellNode); if (this.shellNode.parentNode !== this.root) this.root.append(this.shellNode);
    if (formDocument) { this.activeDocument = formDocumentId; documentContent = formDocument.node; documentToolbar = null; inspector = formDocument.inspector ?? el('section','authoring-inspector',tr(locale,'输入保留在本次编辑会话；应用后进入作品工作区，再通过保存落盘。','Input is kept in this editing session. Apply it to working content, then save to disk.','入力は今回の編集セッションに保持されます。作業内容に適用してから保存してください。')); }
    documentContent.querySelector('.document-recovery-notice')?.remove();
    if (this.recoveryPending) { const recovery = el('div', 'authoring-toolbar document-recovery-notice'); recovery.setAttribute('role', 'status'); recovery.append(el('span', '', tr(locale, '上次的未保存草稿等待处理，处理后可继续编辑。', 'Resolve the previous unsaved draft to continue editing.', '前回の未保存草稿を処理すると編集を続行できます。')), button(tr(locale, '处理恢复草稿', 'Resolve recovery draft', '復元する草稿を処理'), () => this.reviewRecovery())); documentContent.prepend(recovery); }
    const activeKind = this.documents.find(item => item.id === this.activeDocument)?.kind;
    const pilot = this.page === 'editor' && (!activeKind || activeKind === 'scene' || activeKind === 'scene-graph');
    this.root.dataset.authoringPilot = String(pilot); portals.dataset.authoringPilot = String(pilot);
    this.shellProps = { source: source ?? null, characterExplorer: this.characterExplorer, locale, page: this.page, header: this.headerNode, activity: rail, documents: this.documents, active: this.activeDocument, content: documentContent, toolbar: documentToolbar, explorer, inspector, problems, status, notice,
      layout: this.controller.preferences.layout, inspectorAvailable: !(['production','assistant'].includes(this.page) && this.productionReview), inspectorShown: this.inspectorShown, selected: this.page === 'pages' && this.activeDocument === 'startup' ? ['startup'] : this.page === 'pages' && this.designer ? [this.designer.workbenchPage(), ...this.designer.capture().selected] : this.treeSelected, select: ids => { this.treeSelected = ids; this.render(); }, open: document => { void this.openDocument(document); }, pin: id => { this.documents = this.documents.map(document => document.id === id ? { ...document, preview: false } : document); this.render(); }, close: id => this.closeDocument(id),
      rename: async (id, name) => { if (!await this.flushScript() || !this.controller.source) return '当前输入尚未应用'; return this.applyWorkbenchObject(renameWorkbenchObject(this.controller.source, id, name)); },
      move: async (ids, parent, index) => { if (!await this.flushScript() || !this.controller.source) return; const error = await this.applyWorkbenchObject(moveWorkbenchObjects(this.controller.source, ids, parent, index)); if (error) { this.message = error; this.render(); } }, create: (kind, parent) => this.createWorkbenchObject(kind, parent),
      entryPresentation: (kind, id) => { void this.openEntryPresentation(kind, id); },
      reorder: ids => { this.documents = ids.flatMap(id => this.documents.find(doc => doc.id === id) ?? []); this.render(); },
      layoutChange: layout => { void this.preference(preferences => ({ ...preferences, layout: { ...preferences.layout, ...layout } })); }, pageNodes: this.page === 'pages' ? this.designer?.workbenchPages() : undefined, pageOpen: (id, pinned) => { void this.openDocument({ kind: 'page', objectId: id, title: this.designer?.workbenchPages().find(page => page.id === id)?.name ?? id, preview: !pinned }); }, componentNodes: this.page === 'pages' ? this.designer?.workbenchComponents() : undefined, componentSelect: ids => { this.designer?.selectComponents(ids); this.render(); }, componentMove:(ids,parent)=>{void this.designer?.moveComponents(ids,parent);},componentRename:(id,name)=>this.designer?.renameComponent(id,name)??Promise.resolve(), confirm: this.documentConfirm,
    }; flushSync(() => this.shellRoot!.render(createElement(AuthoringWorkbench, this.shellProps!)));
    completeFormHints(this.root, locale); if (!formDocument) documentContent.scrollTop = this.pageScroll.get(this.page) ?? documentContent.scrollTop;
    markAuthoringFocus(this.root); restoreAuthoringFocus(this.root,focus);
    requestAnimationFrame(()=>{if(focusRenderSequence===this.focusRenderSequence){markAuthoringFocus(this.root);if(document.activeElement===document.body)restoreAuthoringFocus(this.root,focus);}});
    this.updateStatus();
    this.controller.rememberWorkbench({ documents: this.documents.filter(doc => !doc.preview && !this.formDocuments.has(doc.id)).map(({ id, title, kind, objectId }) => ({ id, title, kind, ...(objectId ? { objectId } : {}) })), active: this.formDocuments.get(this.activeDocument)?.source ?? this.activeDocument });
    if (startDesigner && this.designer) void this.designer.start().then(async () => { const active=this.documents.find(d=>d.id===this.activeDocument); if(active?.kind==='page'&&active.objectId)await this.designer!.openPage(active.objectId); this.render(); }).catch(error => { this.message = String(error); this.render(); });
    else if (refreshDesigner && this.designer) void this.designer.refresh().then(() => this.render()).catch(error => { this.message = String(error); this.render(); });
    const thumbnailGeneration = ++this.thumbnailGeneration;
    if (this.page === 'assets' || this.page === 'editor' && this.controller.view === 'cards') {
      void this.loadThumbnails(thumbnailGeneration);
      for(const details of this.root.querySelectorAll('details'))details.addEventListener('toggle',()=>{if(details.open)void this.loadThumbnails(thumbnailGeneration);});
    }
    else if (this.thumbnailsActive) {
      this.thumbnailsActive = false; void loadVisibleAssetThumbnails(this.services);
    }
    const cardScroller = this.root.querySelector<HTMLElement>('.authoring-center');
    if (cardScroller && this.controller.view !== 'script') {
      const anchors = [...cardScroller.querySelectorAll<HTMLElement>('[data-statement-id]')];
      const anchor = anchors.find(item => item.dataset.statementId === this.controller.scroll.statementId) ??
        anchors.find(item => item.dataset.statementId === this.controller.selection?.primaryId);
      if (anchor) {
        anchor.scrollIntoView({ block: 'nearest' });
        cardScroller.scrollTop = Math.max(0, anchor.getBoundingClientRect().top - cardScroller.getBoundingClientRect().top + cardScroller.scrollTop - this.controller.scroll.offsetPx);
      }
      cardScroller.addEventListener('scroll', () => {
        const top = cardScroller.getBoundingClientRect().top;
        const visible = [...cardScroller.querySelectorAll<HTMLElement>('[data-statement-id]')].find(item => item.getBoundingClientRect().bottom > top);
        this.controller.setScroll(visible?.dataset.statementId ?? null, visible ? visible.getBoundingClientRect().top - top : 0, cardScroller.scrollLeft);
      });
    }
    let scriptContainer = this.root.querySelector<HTMLElement>('.authoring-script-editor');
    const scene = this.controller.scene;
    if (scriptContainer && scene && source) {
      const cached = this.scriptSessions.get(scene.sceneId); if (cached) { scriptContainer.replaceWith(cached.node); scriptContainer = cached.node; }
      const input: Parameters<typeof mountScriptEditor>[0] = { container: scriptContainer, scene, engineVersion: source.project.engineVersion,
      wordWrap: this.controller.preferences.editor.wordWrap, fontSize: this.controller.preferences.editor.fontSize,
      selectedId: this.controller.selection?.primaryId ?? null, documentOffset: this.controller.caret.documentOffset,
      scroll: this.controller.scroll,
      initialText: this.scriptDrafts.get(scene.sceneId),
      locale: this.controller.preferences.locale,
      onDraft: text => { if (text === null) this.scriptDrafts.delete(scene.sceneId); else this.scriptDrafts.set(scene.sceneId, text); void this.reportAuthoringDrafts();this.updateMiniStage(); },
      references: [...this.references(),
        ...[...this.assetCache.values()].map(item => ({ kind: 'asset' as const, id: item.id, name: item.name, detail:[item.folder.join('/'),item.kind].filter(Boolean).join(' · ') }))],
      variables: source.variables ?? [],
        pluginCommands: this.studioPlugins?.commandSpecs() ?? [],
        pluginConditions: this.studioPlugins?.conditionMetadata() ?? [],
        onCaret: (id, documentOffset) => { this.controller.setCaret(id, documentOffset); this.studioPlugins?.publishScope(); this.updateMiniStage(); },
        onSelection: (statementIds, textRange) => { this.controller.setTextSelection(statementIds, textRange); this.studioPlugins?.publishScope(); },
      onScroll: (id, offsetPx, scrollLeft) => this.controller.setScroll(id, offsetPx, scrollLeft),
      onCommit: async text => { const result = await this.controller.editScript(text, scene.sceneId); if (this.notice(result)) {
        if (this.scriptDrafts.get(scene.sceneId) === text) this.scriptDrafts.delete(scene.sceneId); this.render(); return true; } return false; },
    };
      if (cached) { cached.editor.update(input); this.scriptEditor = cached.editor; }
      else { const container = scriptContainer; void mountScriptEditor(input).then(editor => { this.scriptSessions.set(scene.sceneId, { node: container, editor }); if (container.isConnected) { this.scriptEditor = editor; if (scriptFocused) container.querySelector<HTMLTextAreaElement>('textarea')?.focus(); } }); }
    }
  }
  private updateMiniStage() {
    const source = this.controller.source, selected = this.controller.selection;
    if (!source || !this.miniStage) return;
    const pending = this.controller.scene ? this.scriptDrafts.has(this.controller.scene.sceneId) : false;
    const target = !pending && selected?.primaryId && this.controller.scene ? { sceneId: this.controller.scene.sceneId, statementId: selected.primaryId } : null;
    const edit = this.effectEditor;
    this.miniStage.update(JSON.stringify([source.project.projectId, source.projectRevision, source.scenes.map(scene => [scene.sceneId, scene.revision]), source.characters.map(character=>character.afterstory), target, pending, this.fieldPreview, edit && target?.sceneId === edit.sceneId && target.statementId === edit.statementId ? edit.draft : null]), target, pending ? tr(this.controller.preferences.locale,'脚本正在编辑，移出编辑区后更新预览。','Editing script; leave the editor to update the preview.','スクリプト編集中。編集欄を離れるとプレビューを更新します。') : undefined);
  }
  private openCommandCenter(mode: CommandMode) {
    const locale = this.controller.preferences.locale, t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
    const source = this.controller.source, projectReason = source ? undefined : t('请先打开作品','Open a project first','作品を開いてください');
    const commands: CommandEntry[] = [
      ...(this.retainedInput||this.recoveredForms.length?[{id:'recovered-input',label:t('查看保留输入','Review retained input','保持した入力を確認'),group:t('文档','Documents','文書'),run:()=>this.openRecoveredInput()}]:[]),
      ...([['save',this.t('save'),'Ctrl+S'],['saveAll',t('保存全部','Save all','すべて保存'),'Ctrl+Shift+S'],['undo',this.t('undo'),'Ctrl+Z'],['redo',this.t('redo'),'Ctrl+Shift+Z'],['preferences',t('工作台偏好','Workbench preferences','ワークスペース設定'),''],['publish',t('检查与发行','Check and publish','検証と公開'),''],['cards',this.t('cards'),''],['writing',this.t('writing'),''],['script',this.t('script'),'']] as const).map(([id,label,shortcut]) => ({id,label,shortcut,group:t('应用命令','Application commands','アプリのコマンド'),disabled:projectReason,run:()=>this.shellAction(id)})),
      {id:'project-settings',label:t('作品设置','Project settings','作品設定'),group:t('应用命令','Application commands','アプリのコマンド'),disabled:projectReason,run:()=>this.openDocument({kind:'project',title:t('作品设置','Project settings','作品設定')})},
      {id:'new-production',label:t('新建制作','New production','新しい制作'),group:t('制作','Production','制作'),disabled:projectReason,run:async()=>{await this.navigate('production');await this.production?.startQuick('script');this.render();}},
      ...(['entry','scene','statement'] as const).map((from,index)=>({id:`playtest-${from}`,label:[t('从头试玩','Playtest from start','最初から試遊'),t('从当前场景试玩','Playtest this scene','現在の場面から試遊'),t('从此句试玩','Playtest from here','この文から試遊')][index]!,group:t('试玩','Playtest','試遊'),disabled:projectReason??(this.page!=='editor'||this.documents.find(d=>d.id===this.activeDocument)?.kind!=='scene'?t('请打开场景文档','Open a scene document','場面の文書を開いてください'):from==='statement'&&!this.controller.selection?.primaryId?t('请先选择语句','Select a statement first','文を選択してください'):undefined),run:()=>this.runPlaytest(from)})),
      {id:'delete-assets',label:t('删除所选素材','Delete selected assets','選択した素材を削除'),group:t('素材','Assets','素材'),disabled:!this.selectedAssets.size?t('请先选择素材','Select assets first','素材を選択してください'):undefined,run:()=>this.removeSelected()},
      ...([-1,1] as const).map(direction=>({id:`move-tab-${direction}`,label:direction<0?t('文档标签向左移动','Move document tab left','文書タブを左へ'):t('文档标签向右移动','Move document tab right','文書タブを右へ'),group:t('文档','Documents','文書'),disabled:!this.activeDocument||this.documents.findIndex(d=>d.id===this.activeDocument)+direction<0||this.documents.findIndex(d=>d.id===this.activeDocument)+direction>=this.documents.length?t('已在边缘或没有文档','No document or already at the edge','文書がないか端にあります'):undefined,run:()=>{const ids=this.documents.map(d=>d.id),at=ids.indexOf(this.activeDocument);[ids[at],ids[at+direction]]=[ids[at+direction]!,ids[at]!];this.shellProps?.reorder(ids);}})),
      ...(this.studioPlugins?.tools('commands.palette') ?? []).map(entry=>({id:`plugin:${entry.pluginId}:${entry.tool.key}`,label:entry.title,group:t('插件命令','Plugin commands','拡張コマンド'),detail:entry.pluginId,disabled:entry.available?undefined:entry.reason,run:()=>this.studioPlugins?.openPublicTool(entry.pluginId,entry.tool.key)})),
    ];
    showCommandCenter({mode,locale,anchor:this.root.dataset.authoringPilot === 'true' ? this.root.querySelector<HTMLElement>('.shell-command-center') : null,error:reason=>{this.message=String(reason);this.messageTone='error';this.render();},load:async(query,kind)=>{
      const match=(items:CommandEntry[])=>items.filter(item=>`${item.label} ${item.group} ${item.detail??''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      if(kind==='commands')return match(commands); if(!source)return [];
      const objects:CommandEntry[]=[
        ...source.scenes.map(scene=>({id:`scene:${scene.sceneId}`,label:scene.name,group:t('场景','Scenes','場面'),run:()=>this.openDocument({kind:'scene',objectId:scene.sceneId})})),
        ...source.characters.map(character=>({id:`character:${character.id}`,label:character.name,group:t('角色','Characters','キャラクター'),run:async()=>{this.characterSelected=character.id;await this.openDocument({kind:'characters',title:t('角色','Characters','キャラクター')});}})),
      ];
      const [assets,docs,drafts]=await Promise.all([this.services.queryAssets({kind:null,text:query,offset:0,limit:100}),this.services.bridge.documents.list(),workbenchBridge(this.services.bridge).production.overview()]);
      if(assets.ok)objects.push(...assets.value.items.map(asset=>({id:`asset:${asset.id}`,label:asset.name,group:t('素材','Assets','素材'),run:async()=>{await this.navigate('assets');this.selectedAssets.clear();this.selectedAssets.add(asset.id);await this.focusAsset(asset.id);}})));
      if(docs.ok){const template=readTemplateDocuments(docs.value);objects.push(...template.pages.map(page=>({id:`page:${page.key}`,label:template.locales[locale]?.[`page.${page.key}`]??page.key,group:t('页面','Pages','ページ'),run:()=>this.openDocument({kind:'page',objectId:page.key,title:template.locales[locale]?.[`page.${page.key}`]??page.key})})));}
      if(drafts.ok)objects.push(...drafts.value.drafts.map(draft=>({id:`draft:${draft.id}`,label:draft.name??t('制作草稿','Production draft','制作下書き'),group:t('制作草稿','Production drafts','制作下書き'),run:async()=>{await this.navigate('production');await this.production?.openDraft(draft.id);this.render();}})));
      return match(objects).sort((a,b)=>(this.recentObjects.includes(a.id)?this.recentObjects.indexOf(a.id):Infinity)-(this.recentObjects.includes(b.id)?this.recentObjects.indexOf(b.id):Infinity)).map(item=>({...item,run:async()=>{await item.run();this.recentObjects=[item.id,...this.recentObjects.filter(id=>id!==item.id)].slice(0,50);}}));
    }});
  }
  private async shellAction(action: ShellAction): Promise<void> {
    if (action === 'quickOpen' || action === 'commands') { this.openCommandCenter(action === 'commands' ? 'commands' : 'objects'); return; }
    if (action === 'closeProject') {
      if (!this.sessionId || !this.controller.source) return;
      const choice = await this.choiceForClose('closeProject'); if (choice === 'cancel') return;
      if (!this.notice(await this.services.closeProject(this.sessionId, choice))) return;
      this.sessionId = null; this.controller.close(); this.scriptDrafts.clear(); this.writingDrafts.clear();
      await this.projectChanged(); return;
    }
    if (action === 'projects' || action === 'publish') return this.navigate(action);
    if (action === 'save' || action === 'saveAll') return this.save(action === 'saveAll');
    if (!await this.flushScript()) return;
    if (action === 'undo' || action === 'redo') {
      if (this.page === 'publish' && this.publishHistory?.(action)) return;
      if (this.page === 'pages' && this.designer && this.activeDocument !== 'startup' && !this.formDocuments.get(this.activeDocument)?.scope) { await this.designer.history(action); return; }
      const scope = await this.activeHistoryScope();
      if (!scope) return;
      const result = await this.controller[action](scope);
      if (!result.ok && result.error.code === 'HISTORY_CANCELLED') return;
      if (!result.ok && ['NOTHING_TO_UNDO','NOTHING_TO_REDO'].includes(result.error.code)) {
        studioToasts.add({title: tr(this.controller.preferences.locale,action === 'undo' ? '当前范围没有可撤销的修改' : '当前范围没有可恢复的修改',action === 'undo' ? 'No changes to undo in this scope' : 'No changes to redo in this scope',action === 'undo' ? 'この範囲に元に戻す変更はありません' : 'この範囲にやり直す変更はありません')}); return;
      }
      if (this.notice(result)) { this.render(); studioToasts.add({title: `${this.t(action)}：${this.controller.historyLabel}`}); } return;
    }
    if (action === 'preferences') return this.openDocument({kind:'project',id:'workbench-settings',objectId:'preferences',title:tr(this.controller.preferences.locale,'工作台偏好','Workbench preferences','ワークスペース設定')});
    if (action === 'resetLayout') return this.preference(p => ({ ...p, layout: { ...p.layout, left: 240, right: 320, bottom: 200 } }));
    this.controller.changeView(action); await this.navigate('editor');
  }
  private async activeHistoryScope(): Promise<{ documentId: Id; paths?: string[] } | null> {
    const source = this.controller.source;
    if (!source) return null;
    const form = this.formDocuments.get(this.activeDocument)?.scope;
    if (form) return form;
    if (this.page === 'publish') return { documentId: source.projectDocumentId, paths: PublishHistoryPaths };
    if (this.activeDocument === 'startup') return { documentId: source.projectDocumentId, paths: ['/data/display'] };
    if (this.activeDocument === 'project') return { documentId: source.projectDocumentId, paths: ['/data/player/autosave', '/data/player/name', '/data/languages'] };
    if (this.activeDocument === 'characters') {
      const selected = this.characterGuiDraft?.selected ?? this.characterSelected;
      const listed = await this.services.bridge.documents.list();
      const document = listed.ok ? listed.value.find(item => selected && `characters/${selected}.json` in item.files) : null;
      return document ? { documentId: document.documentId } : null;
    }
    if (this.page === 'editor' && this.controller.scene) return { documentId: this.controller.scene.documentId };
    return null;
  }
  private refreshDesignerWorkbench(): void {
    if (!this.designer || !this.shellProps) return;
    this.documents = this.documents.map(document => document.kind === 'page' ? { ...document, dirty: this.designer!.hasWorkingChanges(), preview: false } : document);
    this.shellProps = { ...this.shellProps, source: this.controller.source, documents: this.documents,
      pageNodes: this.designer.workbenchPages(), componentNodes: this.designer.workbenchComponents() };
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
  async navigate(page:Page) {
    if (page === 'editor' && this.controller.source) {
      const scene = this.controller.scene ?? this.controller.source.scenes[0];
      if (scene) { await this.openDocument({ kind: 'scene', objectId: scene.sceneId }); return; }
      this.activeDocument = 'empty';
    }
    if(!await this.flushScript())return;
    this.rememberScene(); this.activeDocument = this.formDocuments.has(this.activeDocument) ? '' : this.activeDocument;
    if (!await this.flushProductionDraft()) return;
    await this.controller.flushResume();
    if(page!=='projects'&&!this.controller.source)return;
    if(page==='production'&&!['assistant','production'].includes(this.page)) { this.production ??=new ProductionSession(workbenchBridge(this.services.bridge),this.controller.source!.project.projectId, () => this.controller.preferences.locale);
      await this.production.refresh();
      this.production.origin={page:this.page,sceneId:this.controller.scene?.sceneId??null,statementId:this.controller.selection?.primaryId??null,pageIds:[],componentIds:[]}; }
    if(page==='assets'){await this.showAssets();return;}this.page=page;this.render();
  }
  private async openProduction(scope:{pageIds:string[];componentIds:string[]}, intent: 'assist' | 'ui-assets' = 'assist') {
    this.production ??=new ProductionSession(workbenchBridge(this.services.bridge),this.controller.source!.project.projectId, () => this.controller.preferences.locale);
    await this.production.startQuick(intent === 'ui-assets' ? 'ui-assets' : 'page', scope);
    this.page='assistant';this.render();
  }
  private async createWithAi(intent: 'script' | 'stage') {
    if (!await this.flushScript() || !this.controller.source) return;
    this.production ??=new ProductionSession(workbenchBridge(this.services.bridge),this.controller.source.project.projectId, () => this.controller.preferences.locale);
    await this.production.startQuick(intent, { sceneId: this.controller.scene?.sceneId, statementId: this.controller.selection?.primaryId,
      statementIds: this.controller.selection?.statementIds, textRange: this.controller.selection?.textRange });
    this.page='production';this.render();
  }
  private async createAnimationWithAi(request: import('@galcraft/contracts').AnimationGenerationRequest, scope: { sceneId?: string; statementId?: string | null } = {}) {
    if (!await this.flushScript() || !this.controller.source) return;
    AnimationGenerationRequestSchema.parse(request);
    this.production ??= new ProductionSession(workbenchBridge(this.services.bridge), this.controller.source.project.projectId, () => this.controller.preferences.locale);
    await this.production.refresh();
    const operations = this.production.data.operations?.filter(operation => operation.definition.outputs.some(output => output.type === 'animation' && output.typeVersion === 1) && operation.definition.connection?.purpose === 'text') ?? [];
    if (operations.length !== 1) throw new Error(tr(this.controller.preferences.locale, operations.length ? '请在制作工位选择要使用的动画操作。' : '请先为此作品启用 GCA 动画制作插件。', operations.length ? 'Choose an animation operation in Production.' : 'Enable the GCA animation production plugin for this project.', operations.length ? '制作画面でアニメーション操作を選択してください。' : '作品で GCA アニメーション制作プラグインを有効にしてください。'));
    await this.production.openOperation(operations[0]!);
    const target = this.production.variant!.target;
    this.production.update({ fields: request as unknown as Record<string, Json>, target: { ...target, sceneId: scope.sceneId ?? null, statementId: scope.statementId ?? null },
      sourceVersions: request.assetId && this.controller.source.assetIndexDocumentId ? [{ ref: { kind: 'document', id: this.controller.source.assetIndexDocumentId }, revision: this.controller.source.assetIndexRevision ?? 0 }] : [] });
    await this.production.saveDraft(true); this.page = 'production'; this.activeDocument = ''; this.render();
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
  private splitter(part: 'left' | 'right' | 'bottom', container: HTMLElement): HTMLElement {
    const vertical = part !== 'bottom';
    const min = part === 'bottom' ? 100 : 160, max = part === 'bottom' ? 400 : 520;
    const initial = this.controller.preferences.layout[part];
    const separator = el('div', `authoring-splitter ${vertical ? 'vertical' : 'horizontal'}`);
    separator.tabIndex = 0; separator.setAttribute('role', 'separator');
    separator.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
    separator.setAttribute('aria-label', part === 'left' ? '浏览区宽度' : part === 'right' ? '属性区宽度' : '问题栏高度');
    separator.setAttribute('aria-valuemin', String(min)); separator.setAttribute('aria-valuemax', String(max));
    separator.setAttribute('aria-valuenow', String(initial));
    const clamp = (value: number) => Math.max(min, Math.min(max, Math.round(value)));
    const show = (value: number) => {
      separator.setAttribute('aria-valuenow', String(value));
      if (vertical) container.style.setProperty(`--${part}`, `${value}px`);
      else container.style.setProperty('--bottom', `${value}px`);
    };
    const commit = (value: number) => void this.preference(p => ({ ...p, layout: { ...p.layout, [part]: clamp(value) } }));
    separator.addEventListener('pointerdown', event => {
      event.preventDefault(); separator.focus(); separator.setPointerCapture(event.pointerId);
      const origin = vertical ? event.clientX : event.clientY;
      let value = initial;
      const move = (next: PointerEvent) => {
        const distance = (vertical ? next.clientX : next.clientY) - origin;
        value = clamp(initial + distance * (part === 'right' || part === 'bottom' ? -1 : 1));
        show(value);
      };
      const finish = () => { separator.removeEventListener('pointermove', move); separator.removeEventListener('pointerup', release);
        separator.removeEventListener('pointercancel', cancel); if (value !== initial) commit(value); };
      const release = () => finish();
      const cancel = () => { value = initial; show(initial); finish(); };
      separator.addEventListener('pointermove', move);
      separator.addEventListener('pointerup', release);
      separator.addEventListener('pointercancel', cancel);
    });
    separator.addEventListener('keydown', event => {
      const direction = part === 'bottom' ? event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0 :
        event.key === 'ArrowLeft' ? part === 'right' ? 1 : -1 :
          event.key === 'ArrowRight' ? part === 'right' ? -1 : 1 : 0;
      const value = event.key === 'Home' ? part === 'bottom' ? 200 : part === 'left' ? 240 : 320 :
        clamp(this.controller.preferences.layout[part] + direction * (event.shiftKey ? 40 : 10));
      if (!direction && event.key !== 'Home') return;
      event.preventDefault(); commit(value);
    });
    separator.addEventListener('dblclick', () => commit(part === 'bottom' ? 200 : part === 'left' ? 240 : 320));
    return separator;
  }
  private projects(): HTMLElement {
    this.projectsRoot ??= createRoot(this.projectsNode);
    this.projectsRoot.render(createElement(Projects, {
      onUnappliedChange: this.setProjectCreateUnapplied,
      locale: this.controller.preferences.locale, source: this.controller.source,
      explorerContainer: this.projectsExplorer, inspectorContainer: this.projectsInspector, revealInspector: () => this.revealInspector(),
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
    const autosave=el('label','authoring-field',this.t('autosave')),toggle=el('input');toggle.type='checkbox';toggle.checked=source.project.player.autosave;
    toggle.onchange=()=>{void this.controller.setAutosave(toggle.checked).then(result=>{if(this.notice(result))this.render();});};autosave.append(toggle);this.projectGeneral.append(autosave);
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
  private characterDocument(): HTMLElement {
    if (!this.controller.source) return this.characterNode;
    const projectId = this.controller.source.project.projectId;
    if (this.voiceConnectionProject !== projectId) { this.voiceConnectionProject = projectId; void workbenchBridge(this.services.bridge).production.overview().then(result => { if (result.ok && this.controller.source?.project.projectId === projectId) { const purposes = new Set(['speech', ...(result.value.operations ?? []).filter(operation => operation.definition.adoption.kind === 'asset' && operation.definition.adoption.usages.includes('voice')).map(operation => operation.definition.purpose)]); this.voiceConnections = result.value.connections.filter(connection => connection.purposes.some(purpose => purposes.has(purpose))); this.render(); } }); }
    this.characterRoot ??= createRoot(this.characterNode);
    this.characterRoot.render(createElement(CharacterManager, { guiDraft:this.characterGuiDraft,onGuiDraftChange:this.captureCharacterGui,
      embedded: true, explorerContainer: this.characterExplorer, selectedId: this.characterSelected,
      voiceConnections: this.voiceConnections, discardDraft: this.characterDiscardRequest,
      inspectVoiceConnection: (connectionId, model) => workbenchBridge(this.services.bridge).connections.test({ connectionId, model, purpose: 'speech', imageUsage: null, workflowBindingId: null }),
      runtimeAssets: this.services.runtimeAssets, previewScene: (id,entryId) => { this.debugRouteIntent.previewEntryId=entryId;void this.previewScene(id,entryId); },
      selectCharacter: (id, name) => { this.characterSelected=id;this.characterAsset=null;this.documents=this.documents.map(document=>document.kind==='characters'?{...document,title:name}:document);this.render(); },
      assets: [...this.assetCache.values()], inspectAsset: id => { void this.services.getAsset?.(id).then(result=>{if(this.notice(result)){this.characterAsset=result.value;this.render();this.revealInspector();}}); },
      chooseAvatar: async (characterId, currentAssetId) => { const choice=await openAssetPicker({services:this.services,projectId:this.controller.source!.project.projectId,
        allowedKinds:['image'],locale:this.controller.preferences.locale,characterId,currentAssetId,currentName:this.assetCache.get(currentAssetId??'')?.name,
        purpose:tr(this.controller.preferences.locale,'角色默认阅读头像','Default reading portrait','標準会話アバター'),mode:'compact',scope:this.characterNode,
        onApply:async selected=>{this.assetCache.set(selected.asset.id,selected.asset);return {ok:true,value:undefined,warnings:[]};}});return choice?.assetId;},
      previewAsset: id => { void this.previewAsset(id); },
      pendingChanged: dirty => { this.characterDraft = dirty; this.documents = this.documents.map(document => document.kind === 'characters' ? { ...document, dirty } : document); this.refreshDocumentTabs(); },
      source: this.controller.source, locale: this.controller.preferences.locale,
      close: () => { void this.closeDocument('characters'); },
      authorOperation:async operation=>{const result=await this.controller.authorOperation(operation);if(!result.ok)return result;this.render();return {ok:true,value:this.controller.source!,warnings:result.warnings};},
      apply: async drafts => { const result = await this.controller.saveCharacters(drafts); if (!result.ok) return result;
        this.render(); return { ok: true, value: this.controller.source!, warnings: result.warnings }; },
      remove: async id => { const result = await this.controller.removeCharacter(id); if (!result.ok) return result;
        this.render(); return { ok: true, value: this.controller.source!, warnings: result.warnings }; },
      history: async action => { const scope = await this.activeHistoryScope(); if (!scope) return { ok: false, error: { code: 'NOTHING_TO_UNDO', message: '请选择角色', severity: 'error', owner: 'M01', related: [], actions: [] }, issues: [] }; const result = await this.controller[action](scope); if (!result.ok) return result;
        this.render(); return { ok: true, value: this.controller.source!, warnings: result.warnings }; },
    }));
    return this.characterNode;
  }
  private async runPlaytest(from: 'entry' | 'scene' | 'statement'): Promise<void> {
    if (!await this.flushScript()) return;
    await this.controller.flushResume();
    const scene = this.controller.scene, statement = from === 'scene' ? this.controller.parsed()?.parsed.cst.find(node => node.id)?.id : this.controller.selection?.primaryId;
    try { await startPlaytest(this.root, this.services, from !== 'entry' && scene && statement ? { sceneId: scene.sceneId, statementId: statement } : null, () => this.render(), this.controller.preferences.locale, this.debugRouteIntent); }
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
  private renderAuthoringToolbar(): void {
    const scene = this.controller.scene;
    const toolbar = this.authoringToolbarNode, status = this.controller.status;
    this.authoringToolbarRoot ??= createRoot(toolbar);
    this.authoringToolbarRoot.render(createElement(AuthoringToolbar, {
      locale: this.controller.preferences.locale, view: this.controller.view, dirty: status.dirty || this.writingDrafts.size > 0, saveState: status.save,
      hasSelection: Boolean(this.controller.selection?.primaryId), hasStatements: Boolean(this.controller.parsed()?.parsed.cst.some(node => node.id)),
      readOnly: this.controller.parsed()?.readOnly ?? true, pluginTools: Boolean(this.studioPlugins?.tools('commands.palette').length),
      changeView: async view => { if (!await this.flushScript()) return; this.controller.changeView(view); this.render(); },
      play: from => { void this.runPlaytest(from); },
      action: action => {
        if (action === 'save') void this.save(false);
        else if (action === 'undo' || action === 'redo') void this.shellAction(action);
        else if (action === 'graph') void this.showSceneGraph();
        else if (action === 'paste') void this.pasteDialog();
        else if (action === 'ai-writing' || action === 'ai-direction') void this.createWithAi(action === 'ai-writing' ? 'script' : 'stage');
        else if (action === 'plugins') void this.flushScript().then(ok => { if (ok) this.studioPlugins?.openTools('commands.palette'); });
        else {
      const dialog = el('dialog', 'authoring-command-dialog status-dialog');
      dialog.append(el('h2', '', tr(this.controller.preferences.locale,'创作状态','Authoring status','創作の状態')), el('p', '', tr(this.controller.preferences.locale,`当前场景：${scene?.name ?? '未选择'}`,`Current scene: ${scene?.name ?? 'None'}`,`現在のシーン：${scene?.name ?? '未選択'}`)),
        el('p', '', `工作修订 ${scene?.revision ?? 0} · 已存修订 ${status.savedRevision}`),
        el('p', '', status.dirty ? tr(this.controller.preferences.locale,'修改尚未保存到磁盘','Changes are not saved to disk','変更はディスクに保存されていません') : tr(this.controller.preferences.locale,'工作内容已保存','Working content saved','作業内容は保存済みです')),
        el('p', '', `编译包含 ${status.compilation.documents.length} 份文档`));
      const technical = el('details'); technical.append(el('summary', '', '技术详情'), codeBlock(JSON.stringify(status.compilation, null, 2), 'json', this.controller.preferences.locale));
      dialog.append(technical, button('关闭', () => dialog.close())); this.root.append(dialog); dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove(), { once: true });

        }
      },
    }));
  }
  private refreshWritingStatus(): void {
    const scene = this.controller.scene;
    this.documents = this.documents.map(document => document.kind === 'scene' && document.objectId === scene?.sceneId
      ? { ...document, dirty: Boolean(scene?.dirty || this.writingDrafts.size), preview: this.writingDrafts.size ? false : document.preview } : document);
    this.refreshDocumentTabs(); this.updateStatus(); this.renderAuthoringToolbar();
  }
  private editor(): HTMLElement {
    const source = this.controller.source; const scene = this.controller.scene;
    const main = el('main', 'authoring-editor'); if (!source) { main.append(el('p', '', this.t('open'))); return main; }
    const toolbar = this.authoringToolbarNode, status = this.controller.status;
    this.renderAuthoringToolbar();
    main.append(toolbar);
    const grid = el('div', 'authoring-grid'); grid.style.setProperty('--left', `${this.controller.preferences.layout.left}px`); grid.style.setProperty('--right', `${this.controller.preferences.layout.right}px`);
    const nav = el('nav', 'authoring-nav'),sceneTree=el('div','authoring-scene-tree'); sceneTree.append(el('h2', '', this.t('editor')));
    const characterEntry=button(tr(this.controller.preferences.locale, `角色与路线 · ${source.characters.length}`, `Characters & routes · ${source.characters.length}`, `キャラクターとルート · ${source.characters.length}`), () => void this.showCharacters(), 'character-manager-trigger'); characterEntry.prepend(actionIcon('dialogue')); sceneTree.append(characterEntry);
    for (const chapter of source.project.chapters) {
      sceneTree.append(el('h3', '', chapter.name));
      sceneTree.append(button(tr(this.controller.preferences.locale, '新建场景', 'New scene', 'シーンを追加'), async () => { if (!await this.flushScript()) return; const name = await this.ask(this.t('sceneName')); if (!name) return;
        const result = await this.controller.createScene(name, chapter.id); if (this.notice(result)) this.render(); }, 'scene-add'));
      for (const id of chapter.sceneIds) { const entry = source.scenes.find(item => item.sceneId === id); if (entry) {
        const item = button(entry.name, async () => { if (!await this.flushScript()) return; this.controller.selectScene(id); this.render(); }, `scene-row ${scene?.sceneId === id ? 'selected' : ''}`); item.dataset.sceneId=id; item.dataset.focusKey=`scene:${id}`;item.ariaCurrent=scene?.sceneId===id?'page':'false';
        item.addEventListener('dblclick', () => { void (async () => { if (!await this.flushScript()) return;
          this.controller.selectScene(id); const name = await this.ask(this.t('sceneName'), entry.name); if (!name) return;
          const result = await this.controller.renameScene(name); if (this.notice(result)) this.render(); })(); }); sceneTree.append(item);
      } }
    }
    nav.append(sceneTree,createAuthoringSidebar({services:this.services,source,sceneId:scene?.sceneId??null,state:this.sidebarState,locale:this.controller.preferences.locale,
      cache:asset=>this.assetCache.set(asset.id,asset),locate:source=>{void this.locateHit(source);},
      returnToOrigin:()=>{const origin=this.searchOrigin;if(!origin)return;this.controller.selectScene(origin.sceneId);this.controller.changeView(origin.view);
        if(origin.statementId)this.controller.select([origin.statementId]);this.searchOrigin=null;this.sidebarState.located=false;this.render();},
      applyAsset:asset=>this.dropAsset(asset,'gap',this.controller.selection?.primaryId??null,null),previewAsset:asset=>this.previewAsset(asset.id),
      browseAssets:()=>{void this.navigate('assets');}}));
    const center = el('section', 'authoring-center'); center.style.fontFamily = this.controller.preferences.editor.fontFamily;
    center.style.fontSize = `${this.controller.preferences.editor.fontSize}px`;
    if (scene) {
      const current = this.controller.parsed();
      if (current?.readOnly) center.append(el('p', 'authoring-notice', this.t('lastValid')));
      if (this.controller.view === 'script') {
        const input = el('div', 'authoring-script-editor'); input.setAttribute('aria-label', this.t('script')); center.append(input);
      } else if (current) {
        const list = el('div', this.controller.view === 'writing' ? 'authoring-writing-list' : 'authoring-card-list');
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
          list.append(gap(node.id));
          const args = node.object?.value as Record<string, unknown> | undefined;
          const card = el('article', 'authoring-card'); card.dataset.view = this.controller.view; card.dataset.statementId = node.id; card.dataset.command = node.command; card.tabIndex = 0;
          if (this.controller.selection?.statementIds.includes(node.id)) card.classList.add('selected');
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
          if(this.controller.view==='cards' && typeof args?.assetId==='string') {
            const asset=this.assetCache.get(args.assetId);
            if(asset?.kind==='image'){const image=el('img','authoring-direction-thumbnail');image.alt=asset.name;image.draggable=false;image.dataset.assetId=asset.id;image.dataset.variantId=asset.activeVariantId;
              const preview=button('',()=>this.previewAsset(asset.id,asset.activeVariantId),'authoring-direction-preview');preview.ariaLabel=tr(this.controller.preferences.locale,`预览 ${asset.name}`,`Preview ${asset.name}`,`${asset.name} をプレビュー`);
              const overlay=el('span','direction-preview-overlay');overlay.append(actionIcon('search'));preview.append(image,overlay);preview.addEventListener('click',event=>event.stopPropagation());card.append(preview);}
          }
          if (this.controller.view !== 'writing' || node.command !== 'say') card.append(commandIcon(node.command, voiced, voiced ? '配音对白' : typeName), el('strong', '', typeName));
          if (this.controller.view === 'writing' && node.command === 'say') {
            const speakerSelect = el('select', 'authoring-speaker-select');
            speakerSelect.ariaLabel = tr(this.controller.preferences.locale, '说话者', 'Speaker', '話者');
            const narrator = el('option', '', '旁白'); narrator.value = ''; speakerSelect.append(narrator);
            for (const character of source.characters) { const option = el('option', '', character.name); option.value = character.id; speakerSelect.append(option); }
            const speakerValue = args?.speaker as { kind?: string; id?: string } | undefined;
            speakerSelect.value = speakerValue?.kind === 'character' ? speakerValue.id ?? '' : '';
            speakerSelect.disabled = current.readOnly;
            speakerSelect.addEventListener('click', event => event.stopPropagation());
            speakerSelect.addEventListener('change', () => { void (async () => { if (!await this.flushWriting()) return; this.controller.select([node.id!]);
              const speaker: Json = speakerSelect.value ? { kind: 'character', id: speakerSelect.value } : { kind: 'narrator' };
              const result = await this.controller.editFields([{ field: 'speaker', op: 'set', value: speaker }]); if (this.notice(result)) this.render(); })();
            }); card.append(speakerSelect);
            const writing = el('textarea', 'authoring-writing-input'); writing.value = this.writingDrafts.get(node.id) ?? dialoguePlainText(DialogueContentSchema.safeParse(args?.text).data ?? ''); writing.disabled = current.readOnly; writing.ariaLabel = tr(this.controller.preferences.locale, '对白正文', 'Dialogue text', '台詞本文'); writing.placeholder = tr(this.controller.preferences.locale, '输入对白，Ctrl+Enter 继续写下一句', 'Write dialogue; Ctrl+Enter starts the next line', '台詞を入力。Ctrl+Enter で次の行へ');
            writing.addEventListener('click', event => event.stopPropagation());
            const currentArgs = () => this.controller.parsed()?.parsed.cst.find(item => item.id === node.id)?.object?.value as Record<string, unknown> | undefined;
            writing.addEventListener('input', () => { if (writing.value === dialoguePlainText(DialogueContentSchema.safeParse(currentArgs()?.text).data ?? '')) this.writingDrafts.delete(node.id!);
              else this.writingDrafts.set(node.id!, writing.value); void this.reportAuthoringDrafts();this.refreshWritingStatus(); });
            writing.addEventListener('change', () => { void this.flushWriting().then(ok => { if (ok) this.render(); }); });
            writing.addEventListener('keydown', event => { if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.isComposing || event.altKey || event.shiftKey) return;
              event.stopPropagation();
              event.preventDefault(); void (async () => {
                this.controller.select([node.id!]);
                if (writing.value !== dialoguePlainText(DialogueContentSchema.safeParse(currentArgs()?.text).data ?? '')) this.writingDrafts.set(node.id!, writing.value);
                if (!await this.flushWriting()) return;
                const speaker = currentArgs()?.speaker as { kind: 'character'; id: Id } | { kind: 'narrator' } | undefined;
                const inserted = await this.controller.insertDialogue([{ speaker: speaker ?? { kind: 'narrator' }, text: '' }], this.controller.nextStatementId(node.id!), true);
                if (this.notice(inserted)) { this.render();
                  this.root.querySelector<HTMLTextAreaElement>(`[data-statement-id="${this.controller.selection?.primaryId}"] textarea`)?.focus(); }
              })();
            });
            writing.rows=2; const grow=()=>{writing.style.height='auto';writing.style.height=`${Math.max(52,writing.scrollHeight)}px`;}; writing.addEventListener('input',grow); requestAnimationFrame(grow); card.append(writing);
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
          card.addEventListener('click', event => { const selected = this.controller.selection?.statementIds ?? []; let ids: Id[];
            const visible=current.parsed.cst.flatMap(item=>item.id?[item.id]:[]),anchor=this.cardRangeAnchor?.sceneId===scene.sceneId?visible.indexOf(this.cardRangeAnchor.id):-1;
            if(event.shiftKey&&anchor>=0){const at=visible.indexOf(node.id!);ids=[...new Set([...(event.ctrlKey||event.metaKey?selected:[]),...visible.slice(Math.min(anchor,at),Math.max(anchor,at)+1)])];}
            else {ids=event.ctrlKey||event.metaKey?selected.includes(node.id!)?selected.filter(id=>id!==node.id):[...selected,node.id!]:[node.id!];this.cardRangeAnchor={sceneId:scene.sceneId,id:node.id!};}
            this.controller.select(ids, ids.includes(node.id!) ? node.id : ids.at(-1)); this.render();
            this.root.querySelector<HTMLElement>(`[data-statement-id="${node.id}"]`)?.focus(); });
          const openMenu = (origin: HTMLElement, point?: MouseEvent) => {
            const locale = this.controller.preferences.locale;
            if(!this.controller.selection?.statementIds.includes(node.id!))this.cardRangeAnchor={sceneId:scene.sceneId,id:node.id!};
            const ids = objectMenuSelection(this.controller.selection?.statementIds ?? [], node.id!); this.controller.select(ids, node.id); this.render();
            const anchor = this.root.querySelector<HTMLElement>(`[data-statement-id="${node.id}"]${origin === card ? '' : ' .authoring-object-more'}`) ?? card;
            showObjectMenu({ element: anchor, kind: origin === card ? 'context' : 'dropdown', ...(point ? { x: point.clientX, y: point.clientY } : {}) }, [
              { label: typeName, actions: [{ label: tr(locale,'从此句试玩','Play from here','ここからテスト'), run: () => { void this.runPlaytest('statement'); } }] },
              { label: tr(locale,`所选 ${ids.length} 条语句`,`${ids.length} selected statements`,`${ids.length} 件の選択`), actions: [
                { label: this.t('copy'), disabled: current.readOnly ? '原文有错误' : undefined, run: () => { void this.controller.copyStatements(ids).then(result => { this.notice(result); this.render(); }); } },
                { label: this.t('moveScene'), disabled: current.readOnly ? '原文有错误' : undefined, run: () => { void this.showMoveInstructions(); } },
              ] },
              { label: '', actions: [{ label: tr(locale,'删除所选','Delete selected','選択項目を削除'), danger: true, disabled: current.readOnly ? '原文有错误' : undefined, run: () => { void this.deleteStatements(ids); } }] },
              ...(this.studioPlugins?.tools('context.menu').length ? [{ label: '插件', actions: [{ label: '插件对象操作', run: () => { this.studioPlugins?.publishScope(); this.studioPlugins?.openTools('context.menu'); } }] }] : []),
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
          card.addEventListener('dragover', event => event.preventDefault());
          card.addEventListener('drop', event => { event.preventDefault();
            const assetId = event.dataTransfer?.getData('text/x-galcraft-asset') as Id; const asset = this.assetCache.get(assetId);
            if (asset) void this.dropAsset(asset, 'card', node.id!, node.command);
          }); list.append(card);
        }
        list.append(gap(null));
        center.append(list);
        const actions = el('div', 'authoring-toolbar authoring-selection-tools'); actions.append(button(this.t('addDialogue'), () => this.dialogueDialog()));
        actions.append(button(this.t('addCommand'), () => this.commandDialog()));
        if (this.controller.selection?.statementIds.length) {
          actions.append(el('span', 'authoring-selection-count', tr(this.controller.preferences.locale,
            `已选 ${this.controller.selection.statementIds.length} 条`, `${this.controller.selection.statementIds.length} selected`, `${this.controller.selection.statementIds.length} 件を選択`)));
          actions.append(button(this.t('copy'), async () => { const result = await this.controller.copyStatements(this.controller.selection!.statementIds);
            if (this.notice(result)) this.render(); }));
          const move = button(this.t('moveScene'), () => this.showMoveInstructions(), 'authoring-move-selected'); move.disabled = current.readOnly; actions.append(move);
          const remove=button(tr(this.controller.preferences.locale,'删除所选','Delete selected','選択を削除'),()=>this.deleteStatements(this.controller.selection?.statementIds??[]),'authoring-delete-selected');remove.prepend(actionIcon('trash'));remove.disabled=current.readOnly;actions.append(remove);
        }
        center.append(actions);
      }
    }
    const inspector = el('aside', 'authoring-inspector');
    this.miniStage ??= new MiniStage(this.services, snapshot => {
      const edit = this.effectEditor, preview = this.fieldPreview;
      for (const change of [edit ? { ...edit, value: edit.draft } : null, preview]) {
        if (!change || change.sceneId !== this.controller.scene?.sceneId || change.statementId !== this.controller.selection?.primaryId) continue;
        const instruction = snapshot.scenes.find(scene => scene.scene.id === change.sceneId)?.instructions.find(item => item.statementId === change.statementId);
        if (!instruction) continue;
        const args = structuredClone(instruction.args) as Record<string, Json>, parts = change.field.split('.');
        let target = args;
        for (const key of parts.slice(0, -1)) { target[key] ??= {}; target = target[key] as Record<string, Json>; }
        target[parts.at(-1)!] = structuredClone(change.value); instruction.args = args;
      }
    }, this.controller.preferences.locale, this.debugRouteIntent); inspector.append(this.miniStage.root, el('h2', '', this.t('inspector')));
    this.updateMiniStage();
    if (scene && this.controller.selection?.primaryId) {
      const node = this.controller.parsed()?.parsed.cst.find(item => item.id === this.controller.selection?.primaryId);
      const registry = createCommandRegistry(source.project.engineVersion, this.studioPlugins?.commandSpecs() ?? []); const spec = node && registry.get(node.command);
      inspector.append(el('p', 'authoring-inspector-context', `${scene.name} / ${spec ? commandName(spec, this.controller.preferences.locale) : ''} / ${this.controller.selection.statementIds.length} ${tr(this.controller.preferences.locale,'条选中','selected','件選択')}`));
      const locate = button(tr(this.controller.preferences.locale,'定位当前指令','Locate selected command','選択した命令へ'), () => this.root.querySelector<HTMLElement>(`[data-statement-id="${CSS.escape(node?.id ?? '')}"]`)?.scrollIntoView({block:'center'}), 'authoring-inspector-locate'); inspector.append(locate);
      const args = node?.object?.value as Record<string, unknown> | undefined;
      if (node?.command === 'pixi') {
        const mount=el('div'), root=createRoot(mount);this.inspectorRoots.push(root);inspector.append(mount);
        root.render(createElement(WeatherPresetPicker,{locale:this.controller.preferences.locale,disabled:!!this.controller.parsed()?.readOnly||!this.services.weatherTexture,
          apply:async key=>{
            const imported=await this.services.weatherTexture!(key);if(!imported.ok)throw new Error(issueText(imported.error,this.controller.preferences.locale));
            if(this.controller.scene?.sceneId!==scene.sceneId)throw new Error(tr(this.controller.preferences.locale,'当前场景已变化，请返回来源指令。','The scene changed. Return to the original command.','シーンが変更されました。元の命令へ戻ってください。'));
            this.assetCache.set(imported.value.id,imported.value);await this.controller.refresh();
            const preset=StageWeatherPresets[key];
            const fields={type:key,effectId:args?.effectId??createId(this.controller.source),resourceId:imported.value.id,target:args?.target??{kind:'stage'},enabled:true,density:preset.density,speed:preset.speed,directionDeg:preset.directionDeg,parameters:preset.parameters};
            const edited=await this.controller.editFields(Object.entries(fields).map(([field,value])=>({field,op:'set' as const,value:asJson(value)})),[node.id!]);if(!edited.ok)throw new Error(issueText(edited.error,this.controller.preferences.locale));this.render();
          }}));
      }
      if(node&&['changeBg','bgm','video','unlockCg','unlockBgm','unlockVideo'].includes(node.command))inspector.append(button(tr(this.controller.preferences.locale,'加入鉴赏 / 管理条目','Add to gallery / Manage items','鑑賞に追加・項目管理'),()=>{void this.navigate('pages').then(()=>this.designer?.openPage('gallery-content'));}));
      if (node?.command === 'changeFigure') {
        const modes=el('div','portrait-kind-switch'); modes.setAttribute('aria-label',tr(this.controller.preferences.locale,'立绘类型','Character art type','立ち絵の種類'));
        const current=this.assetCache.get(String(args?.assetId));
        for (const kind of ['image','live2d'] as const) { const select=button(kind==='image'?tr(this.controller.preferences.locale,'图片立绘','Image','画像'):'Live2D',async()=>{
          await openAssetPicker({ ...this.fieldContext(args??{}), allowedKinds:[kind], locale:this.controller.preferences.locale,currentAssetId:current?.kind===kind?current.id:null,
            purpose:kind==='image'?tr(this.controller.preferences.locale,'选择图片立绘','Choose character art','立ち絵を選択'):'Live2D',mode:'compact',returnFocus:select,
            onApply:async choice=>{this.assetCache.set(choice.asset.id,choice.asset);const result=await this.controller.editFields([{field:'assetId',op:'set',value:choice.assetId}]);if(this.notice(result))this.render();return result;} });
        },current?.kind===kind?'selected':'');select.setAttribute('aria-pressed',String(current?.kind===kind));modes.append(select); } inspector.append(modes);
      }
      const more = el('details', 'command-more'); more.open = this.inspectorMoreOpen;
      more.append(el('summary', '', tr(this.controller.preferences.locale, '更多属性', 'More properties', '詳細プロパティ')));
      more.addEventListener('toggle', () => { this.inspectorMoreOpen = more.open; });
      if(this.controller.view==='script'&&spec){
        inspector.append(el('h3','',commandName(spec,this.controller.preferences.locale)));
        const summary=el('dl','source-command-summary');
        for(const field of spec.fields.filter(field=>field.path!=='text'&&!ownsIdentity(spec.key,field.path,args??{})&&args?.[field.path]!=null).slice(0,5)){summary.append(el('dt','',fieldLabel(field,this.controller.preferences.locale,spec.key)),el('dd','',this.displayParameter(args?.[field.path])));}
        inspector.append(summary);
      }
      for (const field of spec ? commandFields(spec.key, spec.fields, args ?? {}) : []) {
        if(this.effectEditor?.sceneId===scene.sceneId&&this.effectEditor.statementId===node?.id&&field.path!=='effects')continue;
        if(this.controller.view==='script'&&field.path!=='effects')continue;
        if(this.controller.view==='writing'&&node?.command==='say'&&['speaker','text'].includes(field.path))continue;
        const row = el(field.type === 'object' || field.type === 'ref' || field.path === 'loopStartSec' || spec!.key==='say'&&field.path==='text' ? 'div' : 'label', 'authoring-field'); row.dataset.field = field.path; row.append(el('span', '', fieldLabel(field, this.controller.preferences.locale, spec!.key) + (field.required && !ownsIdentity(spec!.key,field.path,args ?? {}) ? tr(this.controller.preferences.locale, ' · 必填', ' · Required', ' · 必須') : '')));
        if(field.path==='effects'){
          if (this.effectEditor?.sceneId === scene.sceneId && this.effectEditor.statementId === node?.id) row.append(this.effectEditor.node);
          else {
            if (node?.command === 'changeBg' && this.controller.view !== 'script') {
              const mount = el('div'), root = createRoot(mount); this.inspectorRoots.push(root); row.append(mount);
              const target = { sceneId: scene.sceneId, statementId: node.id! };
              const end = () => { if (this.fieldPreview?.sceneId === target.sceneId && this.fieldPreview.statementId === target.statementId) { this.fieldPreview = null; this.updateMiniStage(); } };
              root.render(createElement(SceneVisualFields, { value: (args?.effects ?? {}) as Record<string, Json>, fields: field.children ?? [], disabled: !!this.controller.parsed()?.readOnly, locale: this.controller.preferences.locale,
                preview: (field, value) => { this.fieldPreview = { ...target, field, value }; this.updateMiniStage(); }, end,
                commit: async (field, value) => {
                  if (this.controller.scene?.sceneId !== target.sceneId) throw new Error('当前场景已变化，请返回来源指令。');
                  const result = await this.controller.editFields([{ field, op: 'set', value }], [target.statementId]);
                  if (!result.ok) throw new Error(result.error.message);
                  end(); this.render();
                } }));
            }
            row.append(button(tr(this.controller.preferences.locale,'编辑视觉效果','Edit visual effects','表示効果を編集'),()=>this.effectsDialog(field,fieldValue(args??{},field.path))));
          }
          inspector.append(row);continue;
        }
        if(node?.command==='changeBg'&&field.path==='transition') {
          const mount=el('div','background-transition-mount'),root=createRoot(mount);this.inspectorRoots.push(root);
          root.render(createElement(BackgroundTransition,{key:`${scene.documentId}/${scene.revision}`,value:fieldValue(args??{},field.path),locale:this.controller.preferences.locale,readOnly:this.controller.parsed()?.readOnly,
            onCommit:async changes=>{const result=await this.controller.editFields(changes);if(!result.ok)throw new Error(result.error.message);this.render();}}));row.append(mount);
          const advanced=el('details','background-transition-advanced');advanced.append(el('summary','',tr(this.controller.preferences.locale,'高级转场参数','Advanced transition settings','トランジションの詳細設定')),
            inputFor(field,fieldValue(args??{},field.path),value=>this.controller.editFields([{field:field.path,op:'set',value}]).then(result=>{if(this.notice(result))this.render();return result;}),[...this.assetCache.values()],this.references(),this.controller.preferences.locale,false,undefined,{...this.fieldContext(args??{}),command:spec!.key}));
          row.append(advanced);inspector.append(row);continue;
        }
        if (node?.command === 'changeBg' && field.path === 'assetId') {
          const mount = el('div'), root = createRoot(mount); this.inspectorRoots.push(root); row.append(mount);
          root.render(createElement(BackgroundObjectField, { services: this.services, projectId: source.project.projectId, sceneId: scene.sceneId,
            asset: this.assetCache.get(String(args?.assetId)) ?? null, currentAssetId: typeof args?.assetId === 'string' ? args.assetId : null, variantId: null,
            locale: this.controller.preferences.locale, disabled: !!this.controller.parsed()?.readOnly,
            commit: async asset => {
              if (asset.id === args?.assetId) return;
              if (this.controller.scene?.sceneId !== scene.sceneId) throw new Error('当前场景已变化，请返回来源指令。');
              const result = await this.controller.editFields([{ field: 'assetId', op: 'set', value: asset.id }], [node.id!]);
              if (!result.ok) throw new Error(result.error.message);
              this.assetCache.set(asset.id, asset); this.render();
            } })); inspector.append(row); continue;
        }
        if (node?.command === 'playEffect' && field.path === 'soundId' && args?.op === 'stop') {
          const mount=el('div'), root=createRoot(mount); this.inspectorRoots.push(root);
          root.render(createElement(SoundInstancePicker, { value:String(args.soundId??''), locale:this.controller.preferences.locale,
            items:soundInstances(source.scenes,scene.sceneId,node.id??undefined,[...this.assetCache.values()]), disabled:args.all===true,
            choose:async id=>{const result=await this.controller.editFields([{field:'soundId',op:'set',value:id}],[node.id!]);if(!result.ok)throw new Error(issueText(result.error,this.controller.preferences.locale));this.render();} }));
          row.append(mount); inspector.append(row); continue;
        }
        row.append(inputFor(field, fieldValue(args ?? {}, field.path), value => {
          row.querySelectorAll('.field-error').forEach(element => element.remove());
          const errors = validateFields([field], { [field.path]: value }, field => fieldLabel(field, this.controller.preferences.locale, spec!.key), this.controller.preferences.locale);
          const control = row.querySelector<HTMLElement>('input,select,textarea');
          if (errors.length) { const feedback = el('small', 'field-error', errors.map(error => error.message).join('；')); feedback.id = `inspector-error-${field.path}`; row.append(feedback); control?.setAttribute('aria-invalid','true'); control?.setAttribute('aria-describedby',feedback.id);
            const error={code:'FIELD_REQUIRED',message:feedback.textContent??'',severity:'error' as const,owner:'M01' as const,related:[],actions:['edit' as const]};return {ok:false as const,error,issues:[error]}; }
          control?.removeAttribute('aria-invalid'); control?.removeAttribute('aria-describedby');
          const edited=spec!.key==='setComplexAnimation'&&['animation','segments','resourceId'].includes(field.path)?this.controller.editFields(animationSourceChanges(args??{},field.path,value)):field.type==='boolean'&&typeof value==='boolean'?this.controller.editBooleanField(field,value):this.controller.editFields([{ field: field.path, op: 'set', value }]);
          return edited.then(result => { if (this.notice(result)) this.render(); return result; }); }, [...this.assetCache.values()], this.references(), this.controller.preferences.locale, ownsIdentity(spec!.key,field.path,args ?? {}),()=>this.framingSize(args??{}),{...this.fieldContext(args??{}),command:spec!.key}));
        if(spec!.key==='return' && field.path==='value')row.append(el('p','field-help',fieldHint(field,fieldLabel(field,this.controller.preferences.locale,spec!.key),this.controller.preferences.locale,spec!.key)));
        (spec!.key==='setComplexAnimation'&&['animation','resourceId'].includes(field.path) || field.required || ['voice', 'assetId', 'op', 'durationMs', 'framing','station','model'].includes(field.path) || spec!.key === 'playEffect' && ['loop','all','volume'].includes(field.path) || spec!.key === 'end' && field.path === 'target' || spec!.key === 'return' && field.path === 'value' ? inspector : more).append(row);
      }
      if (more.children.length > 1) inspector.append(more);
    }
    const settings = el('details', 'authoring-settings'); settings.append(el('summary', '', this.t('settings')));
    const autosave = el('label', 'authoring-field', this.t('autosave')); const toggle = el('input'); toggle.type = 'checkbox'; toggle.checked = source.project.player.autosave;
    toggle.addEventListener('change', () => { void this.controller.setAutosave(toggle.checked).then(result => { if (this.notice(result)) this.render(); }); }); autosave.append(toggle); settings.append(autosave);
    const settingsActions=el('div','authoring-settings-actions');settingsActions.append(button(tr(this.controller.preferences.locale,'作品设置','Project settings','作品設定'),()=>this.openDocument({kind:'project',title:tr(this.controller.preferences.locale,'作品设置','Project settings','作品設定')})));settings.append(settingsActions);
    // Project fields live in their persistent document.
    const preferences = el('details', 'authoring-settings workbench-preferences'); preferences.open = true; preferences.append(el('summary', '', tr(this.controller.preferences.locale, '工作台偏好', 'Workbench preferences', 'ワークスペース設定')));
    const setting = (label: string, input: HTMLInputElement, unit = '') => {
      const row = el('label', 'authoring-field'); input.ariaLabel = label;
      const caption = el('span', '', label), output = el('output', '', input.type === 'range' ? `${input.value} ${unit}` : '');
      caption.append(output); row.append(caption, input); preferences.append(row);
      input.addEventListener('input', () => { if (input.type === 'range') output.value = `${input.value} ${unit}`; });
    };
    const locale = this.controller.preferences.locale;
    const font = el('input'); font.type = 'number'; font.min = '8'; font.max = '48'; font.value = String(this.controller.preferences.editor.fontSize);
    font.addEventListener('change', () => { if (font.reportValidity()) void this.preference(p => ({ ...p, editor: { ...p.editor, fontSize: Number(font.value) } })); });
    setting(tr(locale, '编辑器字号（px）', 'Editor font size (px)', 'エディター文字サイズ（px）'), font);
    const family = el('input'); family.value = this.controller.preferences.editor.fontFamily;
    family.addEventListener('change', () => { void this.preference(p => ({ ...p, editor: { ...p.editor, fontFamily: family.value } })); });
    setting(tr(locale, '编辑器字体', 'Editor font', 'エディターフォント'), family);
    const wrap = el('input'); wrap.type = 'checkbox'; wrap.checked = this.controller.preferences.editor.wordWrap;
    wrap.addEventListener('change', () => { void this.preference(p => ({ ...p, editor: { ...p.editor, wordWrap: wrap.checked } })); });
    setting(tr(locale, '自动换行', 'Word wrap', '折り返し'), wrap);
    const sizeLabels = { left: tr(locale, '左侧场景栏宽度', 'Scene panel width', 'シーンパネルの幅'), right: tr(locale, '右侧属性栏宽度', 'Inspector width', 'プロパティの幅'), bottom: tr(locale, '底部问题栏高度', 'Problems panel height', '問題パネルの高さ') };
    for (const part of ['left', 'right', 'bottom'] as const) {
      const range = el('input'); range.type = 'range'; range.min = part === 'bottom' ? '100' : '160'; range.max = part === 'bottom' ? '400' : '520'; range.step = '10';
      range.value = String(this.controller.preferences.layout[part]);
      range.addEventListener('change', () => { void this.preference(p => ({ ...p, layout: { ...p.layout, [part]: Number(range.value) } })); });
      setting(sizeLabels[part], range, 'px');
    }
    preferences.append(button(tr(locale, '恢复默认布局', 'Reset layout', 'レイアウトをリセット'), () => this.shellAction('resetLayout')));
    if(this.activeDocument==='workbench-settings')inspector.append(preferences);
    const panelShade=button('',()=>setPanel(''),'authoring-panel-shade');panelShade.setAttribute('aria-label',tr(this.controller.preferences.locale,'关闭侧栏','Close sidebar','サイドバーを閉じる'));
    const setPanel=(panel:'left'|'right'|'')=>{this.narrowPanel=panel;grid.dataset.panel=panel;leftToggle.setAttribute('aria-expanded',String(panel==='left'));rightToggle.setAttribute('aria-expanded',String(panel==='right'));};
    const leftToggle=button(tr(this.controller.preferences.locale,'场景与搜索','Scenes & search','シーン・検索'),()=>setPanel(this.narrowPanel==='left'?'':'left'),'authoring-panel-toggle');
    const rightToggle=button(tr(this.controller.preferences.locale,'属性与来源','Inspector & origin','プロパティ・出典'),()=>setPanel(this.narrowPanel==='right'?'':'right'),'authoring-panel-toggle');
    setPanel(this.narrowPanel);
    main.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.narrowPanel){const previous=this.narrowPanel;setPanel('');(previous==='left'?leftToggle:rightToggle).focus();event.stopPropagation();}});
    grid.append(nav, this.splitter('left', grid), center, this.splitter('right', grid), inspector, panelShade);
    main.append(grid);
    const dock = el('section', 'authoring-diagnostic-dock');
    dock.dataset.empty = String(status.issues.length === 0);
    const expanded = this.controller.preferences.layout.diagnosticsVisible;
    dock.classList.toggle('collapsed', !expanded);
    dock.style.setProperty('--bottom', `${this.controller.preferences.layout.bottom}px`);
    dock.append(this.splitter('bottom', dock));
    const problemList = el('div', 'authoring-diagnostic-content');
    const diagnosticToggle = button(`${this.t('problems')} · ${status.issues.length}`, () => this.preference(p => ({ ...p, layout: { ...p.layout, diagnosticsVisible: !expanded } })), 'diagnostic-toggle');
    diagnosticToggle.setAttribute('aria-expanded', String(expanded));
    problemList.append(diagnosticToggle);
    if (status.issues.length) for (const issue of status.issues) problemList.append(issue.source
      ? button(issueText(issue, locale), () => this.locateIssue(issue.source!), 'authoring-diagnostic-link')
      : el('p', '', issueText(issue, locale)));
    else problemList.append(el('p', '', this.t('noProblems')));
    dock.append(problemList); main.append(dock);
    return main;
  }
  private effectsDialog(spec: FieldSpec, value: unknown) {
    this.effectEditor?.dispose(); this.effectEditor = null;
    const locale=this.controller.preferences.locale, dialog=el('section','effects-inspector-editor');
    let draft=structuredClone(value??{}) as Record<string, Json>;
    const target=this.controller.scene&&this.controller.selection?.primaryId?{sceneId:this.controller.scene.sceneId,statementId:this.controller.selection.primaryId}:null;
    if (!target) return;
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
      if (this.controller.scene?.sceneId !== target.sceneId) { errors.textContent = '当前场景已变化，请返回来源指令后应用。'; return; }
      const issues=validateFields([spec],{[spec.path]:draft},f=>fieldLabel(f,locale),locale);if(issues.length){errors.textContent=issues.map(i=>i.message).join('；');return;}
      const result=await this.controller.editFields([{field:spec.path,op:'set',value:draft}], [target.statementId]);if(this.notice(result)){close();this.render();} else errors.textContent = result.error.message;
    }, 'authoring-primary'));dialog.append(actions); this.effectEditor = { ...target, field: spec.path, draft, node: dialog, dispose };
    this.render(); update();
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); close(); } });
    requestAnimationFrame(()=>dialog.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true}));
  }
  private async chooseAssetImport(): Promise<void> {
    if (this.importingAssets) return;
    const chosen = await this.services.pickAssetFiles();
    if (this.notice(chosen) && chosen.value.length) await this.importAssetPaths(chosen.value);
  }
  private async importAssetPaths(paths: string[], retry?: { id: number; result: AssetImportResult }): Promise<void> {
    if (this.importingAssets || !this.services.importAssets) return;
    this.importingAssets = true; this.message = ''; this.render();
    let receiptRecorded = false;
    const updateResult = (result: AssetImportResult) => {
      receiptRecorded = true;
      if (retry) retry.result = result;
      else this.assetImportResults.push({ id: ++this.assetImportSequence, result });
    };
    try {
      const imported = await this.services.importAssets(paths);
      if (!imported.ok) { updateResult({ succeeded: retry?.result.succeeded ?? 0, failed: paths.map(path => ({ path, reason: imported.error.message })) }); return; }
      updateResult(mergeAssetImportResult(imported.value, retry?.result));
      imported.value.succeeded.forEach(asset => this.assetCache.set(asset.id, asset));
      await this.controller.refresh(); await this.showAssets();
    } catch (error) {
      if (receiptRecorded) { this.messageTone = 'error'; this.message = String(error); }
      else updateResult({ succeeded: retry?.result.succeeded ?? 0, failed: paths.map(path => ({ path, reason: String(error) })) });
    }
    finally { this.importingAssets = false; this.render(); }
  }
  private assets(): HTMLElement {
    const main = el('main', 'authoring-assets');
    const locale = this.controller.preferences.locale;
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
    const heading = el('header', 'assets-heading'), title = el('div');
    title.append(el('h1', '', this.t('assets')),
      el('p', '', tr(locale, '管理画面、声音与每个故事需要的素材。', 'Images, sounds and everything your story needs.', '物語に必要な画像、音声、素材を管理。')));
    const importButton = button(this.importingAssets ? tr(locale, '正在导入…', 'Importing…', '読込中…') : this.t('import'), () => this.chooseAssetImport(), 'authoring-primary');
    importButton.disabled = this.importingAssets;
    heading.append(title, el('span', 'asset-count', `${this.assetPage?.total ?? 0} ${tr(locale, '项素材', 'assets', '素材')}`), importButton); main.append(heading);
    for (const report of this.assetImportResults) {
      const mount = el('div', 'asset-import-result-mount'), root = createRoot(mount); this.inspectorRoots.push(root); main.append(mount);
      root.render(createElement(AssetImportSummary, { result: report.result, locale, busy: this.importingAssets,
        retry: this.services.importAssets ? () => { void this.importAssetPaths(failedAssetPaths(report.result), report); } : undefined,
        dismiss: () => { this.assetImportResults = this.assetImportResults.filter(item => item.id !== report.id); this.render(); },
      }));
    }
    const controls = el('div', 'authoring-toolbar asset-query-bar'); const search = el('input'); search.placeholder = tr(locale,'按素材名称搜索，例如雨站或立绘','Search asset names, e.g. station or character','素材名で検索（例：駅・立ち絵）'); search.value = this.assetQuery.text;
    search.addEventListener('change', () => { this.assetQuery = { ...this.assetQuery, text: search.value, offset: 0 }; void this.showAssets(); }); controls.append(search);
    search.setAttribute('aria-label', this.t('search'));
    const kindLabels: Record<string, [string,string,string]> = { image: ['图像','Images','画像'], audio: ['声音','Audio','音声'], video: ['视频','Video','動画'], font: ['字体','Fonts','フォント'], live2d: ['Live2D','Live2D','Live2D'], texture: ['纹理','Textures','テクスチャ'], animation: ['动画','Animation','アニメーション'], effect: ['特效','Effects','エフェクト'] };
    const folder = el('input'); folder.placeholder = tr(locale,'按目录筛选，例如背景/雨站；留空显示全部','Filter by folder, e.g. backgrounds/station; blank shows all','フォルダーで絞り込み（例：背景/駅）。空欄ですべて表示'); folder.value = this.assetQuery.folder?.join('/') ?? '';
    folder.addEventListener('change', () => { this.assetQuery = { ...this.assetQuery,
      folder: folder.value.trim() ? folder.value.split('/').map(part => part.trim()).filter(Boolean) : null, offset: 0 }; this.activeDocument = 'route:assets'; void this.showAssets(); });
    const folderLabel = el('label'); folderLabel.append(el('span', '', tr(locale, '目录筛选', 'Filter folder', 'フォルダー絞り込み')), folder); this.assetNavigationFilters = el('div', 'asset-navigation-filters'); this.assetNavigationFilters.append(folderLabel, createAssetTypeFilters(this.assetTypes, this.assetQuery.kind as AssetKind | null, this.assetQuery.typeFields, locale, values => { this.assetQuery = { ...this.assetQuery, typeFields: values, offset: 0 }; void this.showAssets(); }));
    const sort = el('select'); sort.ariaLabel = tr(locale, '排序方式', 'Sort by', '並び替え'); for (const [value, label] of [['name', tr(locale, '名称', 'Name', '名前')], ['size', tr(locale, '大小', 'Size', 'サイズ')], ['modified', tr(locale, '修改时间', 'Modified', '更新日')]] as const) {
      const option = el('option', '', label); option.value = value; sort.append(option);
    }
    sort.value = this.assetQuery.sort ?? 'name'; sort.addEventListener('change', () => { this.assetQuery = { ...this.assetQuery,
      sort: sort.value as NonNullable<AssetQuery['sort']>, offset: 0 }; void this.showAssets(); }); controls.append(sort);
    const direction = el('select'); direction.ariaLabel = tr(locale, '排序方向', 'Sort direction', '並び順'); for (const [value, label] of [['asc', tr(locale, '升序', 'Ascending', '昇順')], ['desc', tr(locale, '降序', 'Descending', '降順')]] as const) {
      const option = el('option', '', label); option.value = value; direction.append(option);
    }
    direction.value = this.assetQuery.direction ?? 'asc'; direction.addEventListener('change', () => { this.assetQuery = { ...this.assetQuery,
      direction: direction.value as NonNullable<AssetQuery['direction']>, offset: 0 }; void this.showAssets(); }); controls.append(direction);
    main.append(controls);
    const filtered = Boolean(this.assetQuery.text || this.assetQuery.kind || this.assetQuery.folder?.length || Object.keys(this.assetQuery.typeFields ?? {}).length);
    const clearFilters = () => { this.assetQuery = { ...this.assetQuery, text: '', kind: null, folder: null, typeFields: {}, offset: 0 }; void this.showAssets(); };
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
    this.assetNavigationFilters.append(el('h3','',tr(locale,'素材工具','Asset tools','素材ツール')),tools);
    const selected=this.assetSelectionBar();
    main.append(selected);
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
      const openMenu = async (origin: HTMLElement, point?: MouseEvent) => {
        if (!this.selectedAssets.has(asset.id)) { this.selectedAssets.clear(); this.selectedAssets.add(asset.id); this.assetRangeAnchor=asset.id; }
        this.selectedDetails=null;this.selectedAtIndexRevision=this.assetPage?.indexRevision??null;this.queryAtSelection={...this.assetQuery};await this.focusAsset(asset.id);
        const anchor=this.root.querySelector<HTMLElement>(`[data-plugin-asset-id="${asset.id}"]${origin===row?'':' .authoring-object-more'}`)??row;
        const scope=[...this.selectedAssets], hidden=scope.filter(id=>!this.assetPage?.items.some(item=>item.id===id)).length;
        showObjectMenu({element:anchor,kind:point||anchor===row?'context':'dropdown',...(point?{x:point.clientX,y:point.clientY}:{})},this.assetMenuGroups(asset.id,scope,hidden));
      };
      row.addEventListener('contextmenu',event=>{if((event.target as HTMLElement).closest('input,textarea'))return;event.preventDefault();event.stopPropagation();void openMenu(row,event);});
      row.addEventListener('keydown', event => { if(event.target!==row||event.isComposing)return;if(event.key==='F2'){event.preventDefault();void this.editAssetName(asset.id);}if(event.key==='Enter'){event.preventDefault();void this.previewAsset(asset.id);}if(isObjectMenuKey(event)){event.preventDefault();event.stopPropagation();void openMenu(row);} });

      select.addEventListener('change', () => { if (select.checked) this.selectedAssets.add(asset.id); else this.selectedAssets.delete(asset.id); this.assetRangeAnchor=asset.id; this.focusedAsset=asset;
        this.selectedAtIndexRevision = this.assetPage?.indexRevision ?? null; this.queryAtSelection = { ...this.assetQuery }; this.render(); }); row.append(select);
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
    if (paging.pages <= 1) return main;
    const pagination = el('nav', 'authoring-toolbar asset-pagination'); pagination.ariaLabel = tr(locale, '素材分页', 'Asset pages', '素材のページ');
    pagination.append(el('span', 'asset-page-status', tr(locale, `第 ${paging.current} / ${paging.pages} 页 · 共 ${total} 项`, `Page ${paging.current} of ${paging.pages} · ${total} assets`, `${paging.current} / ${paging.pages} ページ · 全 ${total} 件`)));
    const go = (page: number) => { this.assetQuery.offset = (page - 1) * this.assetQuery.limit; void this.showAssets(); };
    const previous = button('←', () => go(paging.current - 1)); previous.ariaLabel = tr(locale, '上一页', 'Previous page', '前のページ'); previous.disabled = !paging.previous; pagination.append(previous);
    let last = 0;
    for (const page of paging.visible) {
      if (last && page - last > 1) pagination.append(el('span', '', '…'));
      const control = button(String(page), () => go(page)); control.ariaLabel = tr(locale, `第 ${page} 页`, `Page ${page}`, `${page} ページ`); if (page === paging.current) control.ariaCurrent = 'page'; pagination.append(control); last = page;
    }
    const next = button('→', () => go(paging.current + 1)); next.ariaLabel = tr(locale, '下一页', 'Next page', '次のページ'); next.disabled = !paging.next; pagination.append(next); main.append(pagination); return main;
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
      this.insertions.set(scene.sceneId,{beforeId,node:modal,placeholder,dirty:()=>true,capture:()=>asJson({kind:'command',sceneId:scene.sceneId,beforeId,command:picker.value,args})});this.render();this.revealInspector();requestAnimationFrame(()=>fields.querySelector<HTMLElement>('input,textarea,select')?.focus());
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
        const row = el(field.type === 'object' || field.type === 'ref' || field.path === 'loopStartSec' || spec!.key==='say'&&field.path==='text' ? 'div' : 'label', 'authoring-field'); row.dataset.field = field.path; row.append(el('span', '', fieldLabel(field, this.controller.preferences.locale, spec.key) + (field.required && !ownsIdentity(spec!.key,field.path,args ?? {}) ? tr(this.controller.preferences.locale, ' · 必填', ' · Required', ' · 必須') : '')));
        const dimensions=field.path==='framing'?this.framingSize(args):null;
        const value = args[field.path] ?? (dimensions?portraitFraming('upper',dimensions.sourceHeight,dimensions.canvasHeight):field.path === 'speaker' ? { kind: 'narrator' } : ownsIdentity(spec.key,field.path,args) ? createId(this.controller.source) : field.default);
        if (value !== null && value !== undefined) args[field.path] = value;
        row.append(inputFor(field, value, next => { if(spec.key==='setComplexAnimation'&&['animation','segments','resourceId'].includes(field.path)){for(const key of ['animation','segments','resourceId'])if(key!==field.path)delete args[key];}
          args[field.path] = next; if(field.path==='op'||field.path==='assetId'){updateFields(false);return;} row.querySelectorAll('.field-error').forEach(node => node.remove()); row.querySelectorAll('[aria-invalid]').forEach(node => { node.removeAttribute('aria-invalid'); node.removeAttribute('aria-describedby'); });
          for (const updated of commandFields(spec.key, spec.fields, args)) { const target = [...fields.querySelectorAll<HTMLElement>('[data-field]')].find(item => item.dataset.field === updated.path);
            const title = target?.querySelector(':scope > span'); if (title) title.textContent = fieldLabel(updated, this.controller.preferences.locale, spec.key) + (updated.required ? tr(this.controller.preferences.locale,' · 必填',' · Required',' · 必須') : '');
            target?.querySelector('input,textarea,select')?.setAttribute('aria-required',String(updated.required)); } }, [...this.assetCache.values()], this.references(), this.controller.preferences.locale, ownsIdentity(spec!.key,field.path,args ?? {}),()=>this.framingSize(args),{...this.fieldContext(args,modal,true,picker.assetKind,(command,next)=>{picker.select(command);args=next;updateFields(false);placeholder.querySelector('strong')!.textContent=commandName(registry.get(command)!,locale);this.render();}),command:spec.key}));
        if(spec.key==='return' && field.path==='value')row.append(el('p','field-help',fieldHint(field,fieldLabel(field,this.controller.preferences.locale,spec.key),this.controller.preferences.locale,spec.key)));
        const essential=field.required||['text','speaker','voice','assetId','op','durationMs','framing','station','model'].includes(field.path)||spec.key==='end'&&field.path==='target'||spec.key==='return'&&field.path==='value';
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
