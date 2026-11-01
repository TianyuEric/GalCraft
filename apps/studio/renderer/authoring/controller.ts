import { DialogueContentSchema, dialoguePlainText } from '@galcraft/contracts';
import { countNameCharacters, createId, reserveIds } from '@galcraft/contracts';
import type { Asset, AssetIdsResult, Character, EditInput, EditReceipt, FieldSpec, Id, Issue, Json, Project, Ref, Result, SavePlan, SaveReceipt, SemanticPage, SemanticQuery, Snapshot, Source, SourceLocation, StudioBridge, StudioPreferences, Variable, VersionRef, WorkspaceResume } from '@galcraft/contracts';
import { DefaultStudioPreferences, IdSchema, ProjectSchema } from '@galcraft/contracts';
import { applyTextEdits, duplicateStatements, fieldAt, parse, patchFields, presentationArgs, toDocumentPatch } from '@galcraft/dsl';
import type { ParseResult, ValueNode } from '@galcraft/dsl';
import { characterEdit, neutralCharacter, removeCharacterEdit, type CharacterDraft } from './characters/model.js';
import { animationSourceChanges } from './animation-source.js';
import { prepareAuthoringEdit, rebaseAuthoringOperation, type AuthorOperation } from '@galcraft/documents/authoring';

export type AuthoringView = 'cards' | 'writing' | 'script';
export type StudioLocale = StudioPreferences['locale'];
export type SceneSource = { sceneId: Id; documentId: Id; revision: number; savedRevision: number; dirty: boolean; name: string; chapterId: Id; text: string };
export type AuthoringSource = { projectDocumentId: Id; projectRevision: number; projectSavedRevision: number; projectDirty: boolean;
  project: Project; scenes: SceneSource[]; characters: Character[]; variables?: (Variable & { declaringSceneId: Id | null })[];
  references?: (Ref & { name: string })[]; documentVersions?: {documentId:Id;revision:number}[]; anyDirty?: boolean; assetIndexDocumentId?: Id; assetIndexRevision?: number };
export type AssetQuery = { kind: string | null; text: string; offset: number; limit: number;
  typeFields?: Record<string, Json>;
  folder?: string[] | null; sort?: 'name' | 'size' | 'modified'; direction?: 'asc' | 'desc';
  allowedKinds?: Asset['kind'][]; characterId?: Id | null; sceneId?: Id | null; locale?: string | null;
  tags?: string[]; usage?: string | null; reference?: 'any' | 'used' | 'unused'; review?: 'any' | 'needsReview'; indexRevision?: number | null };
export type AssetPage = { items: Asset[]; total: number; indexRevision: number };
export type AuthoringServices = {
  assetTypeCatalog?: StudioBridge['assets']['typeCatalog'];
  editAssetTypeData?: StudioBridge['assets']['editTypeData'];
  saveAnimation?: StudioBridge['assets']['saveAnimation'];
  weatherTexture?: StudioBridge['assets']['weatherTexture'];
  assetUi?: import('../pages/Plugins/asset-ui-host.js').AssetUiHost;
  runtimeAssets?: Pick<StudioBridge['assets'], 'resolveRuntime' | 'releaseRuntime'>;
  compileStyle?: StudioBridge['templates']['compileStyle'];
  bridge: Pick<StudioBridge, 'documents' | 'authoringPreferences' | 'plugins'> & Partial<Pick<StudioBridge, 'engines' | 'operations' | 'onCloseRequested' | 'assets' | 'templates' | 'files'>> & { collaboration?: import('../../desktop-bridge.js').DesktopBridge['collaboration'] };
  read(documents?: import('@galcraft/contracts').DocumentView[]): Promise<Result<AuthoringSource>>;
  queryAssets(query: AssetQuery): Promise<Result<AssetPage>>;
  queryAssetPicker?: StudioBridge['assets']['picker'];
  recordAssetUse?: StudioBridge['assets']['recordUse'];
  removeRecentAsset?: StudioBridge['assets']['removeRecent'];
  allAssetIds?(query: Omit<AssetQuery, 'offset' | 'limit'>): Promise<Result<AssetIdsResult>>;
  importAssets?(paths: string[]): Promise<Result<{ succeeded: Asset[]; failed: { path: string; issue: Issue }[] }>>;
  pickAssetFiles?: StudioBridge['files']['pickAssets'];
  getAsset?(id: Id): ReturnType<StudioBridge['assets']['get']>;
  inspectModelAsset?: StudioBridge['assets']['inspectModel'];
  describeAssets?: StudioBridge['assets']['describe'];
  renameAssets?: StudioBridge['assets']['rename'];
  verifyAssetTarget?: StudioBridge['assets']['verifyTarget'];
  planBatchRename?: StudioBridge['assets']['planBatchRename'];
  applyBatchRename?: StudioBridge['assets']['applyBatchRename'];
  removeAssets?: StudioBridge['assets']['remove'];
  previewAsset?: StudioBridge['assets']['preview'];
  stopAssetPreview?: StudioBridge['assets']['stopPreview'];
  thumbnails?: StudioBridge['assets']['thumbnails'];
  prepareMattingModel?: StudioBridge['assets']['prepareMattingModel'];
  removeBackground?: StudioBridge['assets']['removeBackground'];
  confirmBackground?: StudioBridge['assets']['confirmBackground'];
  discardBackground?: StudioBridge['assets']['discardBackground'];
  readPreferences(): Promise<Result<StudioPreferences>>;
  writePreferences(value: StudioPreferences): Promise<Result<void>>;
  compilePreview?(saved?: boolean, documents?: import('@galcraft/contracts').DocumentView[]): Promise<Result<{ snapshot: Snapshot | null; lastValid: Snapshot | null; current: boolean; issues: Issue[] }>>;
  searchSemantic?(filter: SemanticQuery['filter'], offset: number, sceneIds?: Id[]): Promise<Result<SemanticPage>>;
  locate?(source: Source): Promise<Result<SourceLocation | null>>;
};
export type AuthoringSelection = { documentId: Id; statementIds: Id[]; primaryId: Id | null; textRange: { start: number; end: number } | null };
export type AuthoringRefresh = { documents: import('@galcraft/contracts').DocumentView[]; compilation?: Awaited<ReturnType<NonNullable<AuthoringServices['compilePreview']>>> };
export type AuthoringStatus = { dirty: boolean; save: 'idle' | 'saving' | 'failed'; savedRevision: number;
  preview: 'none' | 'synced' | 'updateAvailable' | 'restartRequired' | 'lastValid'; issues: Issue[];
  compilation: { state: 'none' | 'current' | 'lastValid' | 'failed'; snapshotId: Id | null; documents: { documentId: Id; revision: number }[] } };

function failed<T>(code: string, message: string): Result<T> {
  const error: Issue = { code, message, severity: 'error', owner: 'M01', related: [], actions: ['retry'] };
  return { ok: false, error, issues: [error] };
}
function success<T>(value: T): Result<T> { return { ok: true, value, warnings: [] }; }
function version(documentId: Id, revision: number): VersionRef { return { ref: { kind: 'document', id: documentId }, revision }; }
function sceneOf(source: AuthoringSource, documentId: Id): SceneSource | undefined { return source.scenes.find(scene => scene.documentId === documentId); }
function sameIds(a: readonly Id[], b: readonly Id[]): boolean { return a.length === b.length && a.every((id, index) => id === b[index]); }
function fieldAtOffset(value: ValueNode, offset: number, prefix = ''): { path: string; start: number } | null {
  for (const field of value.fields ?? []) if (offset >= field.valueNode.start && offset <= field.valueNode.end) {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    return fieldAtOffset(field.valueNode, offset, path) ?? { path, start: field.valueNode.start + (field.valueNode.kind === 'string' ? 1 : 0) };
  }
  for (const [index, item] of (value.items ?? []).entries()) if (offset >= item.start && offset <= item.end)
    return fieldAtOffset(item, offset, `${prefix}.${index}`);
  return null;
}

export function resolveResume(source: AuthoringSource, resume: WorkspaceResume | null): { scene: SceneSource | null; statementId: Id | null; offset: number; documentOffset: number; field: string | null; view: AuthoringView; moved: boolean } {
  const parsed = source.scenes.map(scene => ({ scene, parsed: parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }) }));
  const byId = (id: Id | null) => id ? parsed.find(entry => entry.parsed.cst.some(node => node.valid && node.id === id)) : undefined;
  const entryScene = source.scenes.find(scene => scene.sceneId === source.project.entry.sceneId) ?? source.scenes[0] ?? null;
  if (!resume) return { scene: entryScene, statementId: null, offset: 0, documentOffset: 0, field: null, view: 'cards', moved: false };
  const sameScene = parsed.find(entry => entry.scene.sceneId === resume.sceneId);
  const neighbor = (id: Id | null) => { const found = byId(id); return found?.scene.sceneId === resume.sceneId ? found : undefined; };
  const targetId = byId(resume.caret.statementId) ? resume.caret.statementId :
    neighbor(resume.nextStatementId) ? resume.nextStatementId :
      neighbor(resume.previousStatementId) ? resume.previousStatementId : null;
  const target = byId(targetId);
  const chosen = target ?? sameScene ?? parsed.find(entry => entry.scene === entryScene);
  const node = target?.parsed.cst.find(item => item.id === targetId) ?? chosen?.parsed.cst.find(item => item.valid && item.id) ?? null;
  const scene = chosen?.scene ?? entryScene;
  const field = node?.object && resume.caret.field ? fieldAt(node.object, resume.caret.field.split('.')) : null;
  const text = field?.valueNode.value;
  let offset = node ? Math.min(resume.caret.offset, typeof text === 'string' ? text.length : node.end - node.start) : 0;
  if (typeof text === 'string' && offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset]!)) offset--;
  const invalid = chosen?.parsed.issues.some(issue => issue.severity === 'error') ?? false;
  const documentOffset = field ? field.valueNode.start + (field.valueNode.kind === 'string' ? 1 : 0) + offset :
    scene?.documentId === resume.documentId && scene.revision === resume.documentRevision ? Math.min(resume.caret.documentOffset, scene.text.length) : node?.start ?? 0;
  return { scene, statementId: node?.id ?? null, offset, documentOffset, field: field ? resume.caret.field : null, view: invalid ? 'script' : resume.view,
    moved: Boolean(resume.caret.statementId && node?.id !== resume.caret.statementId) };
}

export function reorderIds(all: readonly Id[], selected: readonly Id[], beforeId: Id | null): Id[] {
  const chosen = new Set(selected);
  const moving = all.filter(id => chosen.has(id));
  const remaining = all.filter(id => !chosen.has(id));
  const at = beforeId === null ? remaining.length : remaining.indexOf(beforeId);
  if (at < 0) return [...all];
  remaining.splice(at, 0, ...moving);
  return remaining;
}

export function classifyAssetDrop(asset: Asset, target: 'voice' | 'card' | 'gap' | 'stage', command: string | null):
  Result<{ kind: 'bindVoice' | 'replaceAsset' | 'insertCommand'; field: string | null; description: string }> {
  if (target === 'voice' || target === 'card' && command === 'say') {
    return asset.kind === 'audio' ? success({ kind: 'bindVoice', field: 'voice', description: '绑定当前对白配音' }) : failed('ASSET_KIND', '对白配音只接受音频');
  }
  if (target === 'stage') {
    return ['image', 'video', 'live2d'].includes(asset.kind) ? success({ kind: 'insertCommand', field: null,
      description: asset.kind === 'live2d' ? '插入 Live2D 立绘指令' : asset.kind === 'image' ? '选择背景或立绘用途后插入' : '插入背景指令' }) : failed('ASSET_KIND', '舞台只接受图像、视频或 Live2D 模型');
  }
  if (target === 'card' && ['changeBg', 'changeFigure', 'changeIllustration', 'changeIllustrationDiff'].includes(command ?? '')) {
    const allowed = command === 'changeBg' ? ['image', 'video'] : ['image', 'live2d'];
    return allowed.includes(asset.kind) ? success({ kind: 'replaceAsset', field: 'assetId', description: '替换当前指令素材' }) : failed('ASSET_KIND', '素材类型与当前指令不匹配');
  }
  if (target === 'gap') return ['image', 'video', 'audio', 'live2d'].includes(asset.kind)
    ? success({ kind: 'insertCommand', field: null, description: asset.kind === 'audio' ? '选择配音、背景音乐或音效用途后插入' : '选择背景或立绘用途后插入' })
    : failed('ASSET_KIND', '该素材类型没有可插入的舞台指令');
  return failed('DROP_TARGET', '该位置不能接收素材');
}

export function previewDialoguePaste(raw: string, characters: readonly Pick<Character, 'id' | 'name'>[], mappings: Record<string, { kind: 'character'; id: Id } | { kind: 'narrator' }> = {}): Result<{ speaker: { kind: 'character'; id: Id } | { kind: 'narrator' }; text: string }[]> {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return failed('DIALOGUE_EMPTY', '没有可插入的对白');
  const result: { speaker: { kind: 'character'; id: Id } | { kind: 'narrator' }; text: string }[] = [];
  for (const line of lines) {
    const match = /^([^：:]+)[：:]\s*(.*)$/.exec(line);
    if (!match || !match[2]!.trim()) return failed('DIALOGUE_FORMAT', `请为“${line}”填写角色和正文`);
    const label = match[1]!.trim();
    const speaker = mappings[label] ?? (['旁白', 'Narrator', 'ナレーション'].includes(label) ? { kind: 'narrator' as const } :
      (() => { const character = characters.find(item => item.name === label); return character ? { kind: 'character' as const, id: character.id } : null; })());
    if (!speaker) return failed('SPEAKER_UNMAPPED', `未匹配角色“${label}”，请先映射、创建或改为旁白`);
    result.push({ speaker, text: match[2]! });
  }
  return success(result);
}
export function mergeDialoguePaste(lines: { speaker: { kind: 'character'; id: Id } | { kind: 'narrator' }; text: string }[], mergePrevious: boolean[]): Result<typeof lines> {
  if (lines.some(line => !line.text.trim())) return failed('DIALOGUE_EMPTY', '对白正文不能为空');
  const merged: typeof lines = [];
  for (const [index, line] of lines.entries()) {
    if (mergePrevious[index]) {
      const prior = merged.at(-1);
      if (!prior || JSON.stringify(prior.speaker) !== JSON.stringify(line.speaker)) return failed('DIALOGUE_SPEAKER', '只能合并同一说话者的相邻对白');
      prior.text += `\n${line.text}`;
    } else merged.push({ speaker: line.speaker, text: line.text });
  }
  return success(merged);
}
export function queryDialogueText(source: AuthoringSource, term: string, offset = 0): SemanticPage {
  const parsedScenes = source.scenes.map(scene => ({ scene, parsed: parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }) }));
  const matches = parsedScenes.flatMap(({ scene, parsed }) => parsed.cst.flatMap(node => node.valid && node.command === 'say' && node.id &&
    dialoguePlainText(DialogueContentSchema.safeParse((node.object?.value as Record<string, unknown> | undefined)?.text).data ?? '').includes(term) ? [{
      source: { documentId: scene.documentId, revision: scene.revision, statementId: node.id, field: 'text', range: { start: node.start, end: node.end } },
      sceneId: scene.sceneId, subject: null, uses: ['dialogue' as const], binding: 'direct' as const, command: 'say', label: scene.name,
      context: { before: null, current: dialoguePlainText(DialogueContentSchema.safeParse((node.object?.value as Record<string, unknown>).text).data ?? ''), after: null },
    }] : []));
  return { requestId: createId(), versions: [], items: matches.slice(offset, offset + 40), total: matches.length, offset,
    coverage: parsedScenes.map(({ scene, parsed }) => ({ documentId: scene.documentId, revision: scene.revision,
      state: parsed.issues.some(issue => issue.severity === 'error') ? 'partial' as const : 'complete' as const, issues: parsed.issues })) };
}

export class AuthoringController {
  private currentParse: { documentId: Id; revision: number; text: string; parsed: ParseResult } | null = null;
  source: AuthoringSource | null = null;
  preferences: StudioPreferences = structuredClone(DefaultStudioPreferences);
  scene: SceneSource | null = null;
  selection: AuthoringSelection | null = null;
  view: AuthoringView = 'cards';
  status: AuthoringStatus = { dirty: false, save: 'idle', savedRevision: 0, preview: 'none', issues: [],
    compilation: { state: 'none', snapshotId: null, documents: [] } };
  lastValid = new Map<Id, ParseResult>();
  lastOperationId: Id | null = null;
  lastOperationDocumentId: Id | null = null;
  caret: WorkspaceResume['caret'] = { statementId: null, field: null, offset: 0, documentOffset: 0 };
  scroll: WorkspaceResume['scroll'] = { statementId: null, offsetPx: 0, scrollLeft: 0 };
  workbench: WorkspaceResume['workbench'];
  rememberWorkbench(workbench: WorkspaceResume['workbench']): void { this.workbench = workbench; this.scheduleResume(); }
  reviewHistory?: (plan: import('@galcraft/contracts').UndoPlan) => Promise<boolean>;
  historyLabel = '';
  private booleanOrigins = new Map<string, { raw: string; changedRaw: string; value: boolean; present: boolean; leading: string }>();
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(readonly services: AuthoringServices) {}

  async open(): Promise<Result<void>> {
    const loaded = await this.services.read();
    if (!loaded.ok) return loaded;
    const valid = ProjectSchema.safeParse(loaded.value.project);
    if (!valid.success) return failed('PROJECT_INVALID', '作品配置不符合当前规格');
    reserveIds(loaded.value);
    this.source = loaded.value;
    this.lastValid.clear();
    const preferences = await this.services.readPreferences();
    if (preferences.ok) this.preferences = preferences.value;
    const resume = await this.services.bridge.authoringPreferences.readWorkspace(loaded.value.project.projectId);
    this.workbench = resume.ok ? resume.value?.workbench : undefined;
    const position = resolveResume(loaded.value, resume.ok ? resume.value : null);
    this.scene = position.scene;
    this.view = position.view;
    this.caret = { statementId: position.statementId, field: position.field, offset: position.offset, documentOffset: position.documentOffset };
    const savedScroll = resume.ok ? resume.value?.scroll : null;
    const scrollAnchorValid = Boolean(position.scene && savedScroll?.statementId &&
      parse({ documentId: position.scene.documentId, revision: position.scene.revision, text: position.scene.text }).cst
        .some(node => node.valid && node.id === savedScroll.statementId));
    this.scroll = scrollAnchorValid ? savedScroll! : { statementId: position.statementId, offsetPx: 0, scrollLeft: savedScroll?.scrollLeft ?? 0 };
    this.selection = this.scene ? { documentId: this.scene.documentId, statementIds: position.statementId ? [position.statementId] : [], primaryId: position.statementId, textRange: null } : null;
    this.refreshStatus();
    await this.refreshPreview();
    return success(undefined);
  }

  close(): void {
    this.currentParse = null;
    if (this.resumeTimer) { clearTimeout(this.resumeTimer); this.resumeTimer = null; }
    this.source = null; this.scene = null; this.selection = null;
    this.booleanOrigins.clear();this.historyLabel='';this.lastOperationDocumentId=null;
    this.lastValid.clear(); this.status = { dirty: false, save: 'idle', savedRevision: 0, preview: 'none', issues: [],
      compilation: { state: 'none', snapshotId: null, documents: [] } };
  }

  parsed(): { parsed: ParseResult; readOnly: boolean } | null {
    if (!this.scene) return null;
    const { documentId, revision, text } = this.scene;
    if (!this.currentParse || this.currentParse.documentId !== documentId || this.currentParse.revision !== revision || this.currentParse.text !== text)
      this.currentParse = { documentId, revision, text, parsed: parse({ documentId, revision, text }) };
    const parsed = this.currentParse.parsed;
    if (!parsed.issues.some(issue => issue.severity === 'error')) this.lastValid.set(this.scene.documentId, parsed);
    return { parsed: this.view === 'script' ? parsed : this.lastValid.get(this.scene.documentId) ?? parsed,
      readOnly: this.view !== 'script' && parsed.issues.some(issue => issue.severity === 'error') };
  }

  select(ids: Id[], primaryId: Id | null = ids[0] ?? null): void {
    if (!this.scene) return;
    const valid = new Set(this.parsed()?.parsed.cst.filter(node => node.valid).map(node => node.id) ?? []);
    const statementIds = [...new Set(ids.filter(id => valid.has(id)))];
    this.selection = { documentId: this.scene.documentId, statementIds, primaryId: primaryId && statementIds.includes(primaryId) ? primaryId : statementIds[0] ?? null, textRange: null };
    this.caret = { statementId: this.selection.primaryId, field: null, offset: 0, documentOffset: 0 };
    this.scheduleResume();
  }

  setCaret(statementId: Id | null, documentOffset: number): void {
    if (!this.scene) return;
    const node = this.parsed()?.parsed.cst.find(item => item.id === statementId);
    const field = node?.object ? fieldAtOffset(node.object, documentOffset) : null;
    this.caret = { statementId, field: field?.path ?? null, offset: Math.max(0, documentOffset - (field?.start ?? node?.start ?? 0)), documentOffset };
    if (statementId) this.selection = { documentId: this.scene.documentId, statementIds: [statementId], primaryId: statementId, textRange: null };
    this.scheduleResume();
  }
  setTextSelection(statementIds: Id[], textRange: { start: number; end: number } | null): void {
    if (!this.scene || !this.selection) return;
    this.selection = textRange ? { documentId: this.scene.documentId, statementIds: [...statementIds], primaryId: statementIds[0] ?? null, textRange: { ...textRange } } : { ...this.selection, textRange: null };
    this.scheduleResume();
  }
  setScroll(statementId: Id | null, offsetPx: number, scrollLeft: number): void {
    this.scroll = { statementId, offsetPx, scrollLeft }; this.scheduleResume();
  }

  changeView(view: AuthoringView): void { this.view = view; this.scheduleResume(); }
  selectScene(sceneId: Id): void {
    const scene = this.source?.scenes.find(item => item.sceneId === sceneId);
    if (!scene) return;
    this.scene = scene;
    this.selection = { documentId: scene.documentId, statementIds: [], primaryId: null, textRange: null };
    this.caret = { statementId: null, field: null, offset: 0, documentOffset: 0 };
    this.scroll = { statementId: null, offsetPx: 0, scrollLeft: 0 };
    this.scheduleResume();
  }

  async setPreference(update: (old: StudioPreferences) => StudioPreferences): Promise<Result<void>> {
    const next = update(structuredClone(this.preferences));
    const written = await this.services.writePreferences(next);
    if (written.ok) this.preferences = next;
    return written;
  }

  async editFields(changes: { field: string; op: 'set' | 'inherit'; value: Json }[], ids = this.selection?.statementIds ?? []): Promise<Result<EditReceipt>> {
    const current = this.scene; const state = this.parsed();
    if (!current || !state || state.readOnly) return failed('SOURCE_INVALID', '原文存在错误，字段编辑不可用');
    if (!ids.length) return failed('SELECTION_EMPTY', '请选择语句');
    const source = changes.find(change => change.op === 'set' && ['animation', 'segments', 'resourceId'].includes(change.field));
    const listed = await this.services.bridge.documents.list(); if (!listed.ok) return listed;
    const commands=await this.services.bridge.plugins?.commandSpecs?.();if(commands&&!commands.ok)return commands;
    const input: EditInput = { label: `编辑 ${changes.map(item=>item.field).join('、')}`, origin: ids.length>1?'batch':'field', expected: [], patches: [], preparedAssets: [], requiredRefs: [] };
    for (const id of ids) {
      const node = state.parsed.cst.find(item => item.id === id);
      const canonical = source && node?.command === 'setComplexAnimation'
        ? [...animationSourceChanges(node.object?.value as Record<string, unknown> ?? {}, source.field, source.value), ...changes.filter(change => !['animation', 'segments', 'resourceId'].includes(change.field))] : changes;
      const planned = prepareAuthoringEdit(listed.value,{op:'commands.fields',sceneId:current.sceneId,ids:[id],changes:canonical},commands?.value??[]);
      if (!planned.ok) return planned;
      for(const patch of planned.value.patches){const previous=input.patches.find(item=>item.kind==='text'&&item.documentId===patch.documentId);if(previous?.kind==='text'&&patch.kind==='text')previous.edits.push(...patch.edits);else input.patches.push(patch);}
      for(const expected of planned.value.expected)if(!input.expected.some(item=>item.ref.id===expected.ref.id))input.expected.push(expected);
    }
    return this.commit(input);
  }

  async editBooleanField(spec: FieldSpec, value: boolean, ids = this.selection?.statementIds ?? []): Promise<Result<EditReceipt>> {
    const current = this.scene, state = this.parsed();
    if (!current || !state || state.readOnly) return failed('SOURCE_INVALID', '原文存在错误，字段编辑不可用');
    if (!ids.length) return failed('SELECTION_EMPTY', '请选择语句');
    const listed=await this.services.bridge.documents.list();if(!listed.ok)return listed;
    const contracts=await this.services.bridge.plugins?.commandSpecs?.();if(contracts&&!contracts.ok)return contracts;
    const planned=prepareAuthoringEdit(listed.value,{op:'commands.fields',sceneId:current.sceneId,ids,changes:[{field:spec.path,op:'set',value}]},contracts?.value??[]);if(!planned.ok)return planned;
    const edits: { start: number; end: number; text: string; oldText: string }[] = [];
    const origins = new Map(this.booleanOrigins);
    for (const id of ids) {
      const node = state.parsed.cst.find(item => item.id === id);
      if (!node?.object) return failed('SELECTION_STALE', '所选语句已变化');
      const field = node.fields.find(item => item.key === spec.path);
      const key = `${current.documentId}/${id}/${spec.path}`, remembered = origins.get(key);
      if (remembered && value === remembered.value) {
        if (node.raw === remembered.changedRaw) edits.push({start:node.start,end:node.end,text:remembered.raw,oldText:node.raw});
        else if (!remembered.present && field && field.commaEnd === null && current.text.slice(field.start - remembered.leading.length, field.start) === remembered.leading) {
          const start = field.start - remembered.leading.length;
          edits.push({start,end:field.end,text:'',oldText:current.text.slice(start,field.end)});
        } else {
          const patched = patchFields(state.parsed, {documentId:current.documentId,revision:current.revision,statementIds:[id],changes:[{field:spec.path,op:remembered.present?'set':'inherit',value}]});
          if (!patched.ok) return patched; edits.push(...patched.value);
        }
        // Keep the source form until save: undo can bring the switched value back.
      } else {
        const patched = patchFields(state.parsed, {documentId:current.documentId,revision:current.revision,statementIds:[id],changes:[{field:spec.path,op:'set',value}]});
        if (!patched.ok) return patched;
        const changed = applyTextEdits(current.text,patched.value), next = parse({documentId:current.documentId,revision:current.revision,text:changed}).cst.find(item => item.id === id)!;
        const nextField = next.fields.find(item => item.key === spec.path)!;
        const insertion = patched.value.find(edit => edit.start === edit.end);
        if (!remembered) origins.set(key,{raw:node.raw,changedRaw:next.raw,value:(field?.valueNode.value ?? spec.default)===true,present:Boolean(field),leading:insertion?changed.slice(insertion.start,nextField.start):''});
        edits.push(...patched.value);
      }
    }
    if (!edits.length) return failed('NO_CHANGE','字段值没有变化');
    const result = await this.commit({label:`编辑 ${spec.path}`,origin:ids.length>1?'batch':'field',expected:[version(current.documentId,current.revision)],patches:[toDocumentPatch(current.documentId,edits)],preparedAssets:[],requiredRefs:[]});
    if (result.ok) this.booleanOrigins = origins;
    return result;
  }

  async editScript(text: string, sceneId: Id | null = this.scene?.sceneId ?? null): Promise<Result<EditReceipt>> {
    const current = this.source?.scenes.find(scene => scene.sceneId === sceneId);
    if (!current) return failed('SCENE_MISSING', '请选择场景');
    if (text === current.text) return failed('NO_CHANGE', '脚本没有变化');
    const result = await this.commit({ label: '编辑脚本', origin: 'script', expected: [version(current.documentId, current.revision)],
      patches: [{ kind: 'text', documentId: current.documentId, edits: [{ start: 0, end: current.text.length, before: current.text, after: text }] }], preparedAssets: [], requiredRefs: [] });
    if (result.ok) for (const key of this.booleanOrigins.keys()) if (key.startsWith(`${current.documentId}/`)) this.booleanOrigins.delete(key);
    return result;
  }

  async moveStatements(selected: Id[], beforeId: Id | null): Promise<Result<EditReceipt>> {
    if (!this.scene) return failed('SCENE_MISSING','请选择场景');
    return this.authorOperation({op:'commands.move',sceneId:this.scene.sceneId,ids:selected,targetSceneId:this.scene.sceneId,beforeId});
  }

  async moveToScene(selected: Id[], targetSceneId: Id, beforeId: Id | null = null): Promise<Result<EditReceipt>> {
    if (!this.scene) return failed('SCENE_MISSING','请选择场景');
    const result = await this.authorOperation({op:'commands.move',sceneId:this.scene.sceneId,ids:selected,targetSceneId,beforeId});
    if(result.ok){this.selectScene(targetSceneId);this.select(selected);}return result;
  }

  async deleteStatements(selected: Id[]): Promise<Result<EditReceipt>> {
    if (!this.scene) return failed('SCENE_MISSING','请选择场景');
    const ids=this.parsed()?.parsed.cst.flatMap(node=>node.id?[node.id]:[])??[],chosen=new Set(selected),first=Math.min(...selected.map(id=>ids.indexOf(id)));
    const fallback=ids.slice(first).find(id=>!chosen.has(id))??ids.slice(0,first).reverse().find(id=>!chosen.has(id))??null;
    const result=await this.authorOperation({op:'commands.remove',sceneId:this.scene.sceneId,ids:selected});
    if(result.ok){this.select(fallback?[fallback]:[]);this.setScroll(fallback,0,this.scroll.scrollLeft);}return result;
  }

  nextStatementId(id: Id): Id | null {
    const nodes = this.parsed()?.parsed.cst.filter(node => node.valid && node.id) ?? [];
    const index = nodes.findIndex(node => node.id === id);
    return index < 0 ? null : nodes[index + 1]?.id ?? null;
  }

  async insertDialogue(lines: { speaker: { kind: 'character'; id: Id } | { kind: 'narrator' }; text: string }[], beforeId: Id | null,
    allowEmpty = false, newCharacters: readonly { id: Id; name: string }[] = []): Promise<Result<EditReceipt>> {
    const current = this.scene; const state = this.parsed();
    if (!current || !state || state.readOnly) return failed('SOURCE_INVALID', '原文存在错误，不能插入对白');
    if (!lines.length || !allowEmpty && lines.some(line => !line.text.trim())) return failed('DIALOGUE_EMPTY', '请填写对白正文');
    const source = this.source!;
    const createdNames = new Set<string>();
    const createdIds = new Set<Id>();
    for (const item of newCharacters) {
      const name = item.name.trim();
      if (!name || source.characters.some(character => character.name === name) || createdNames.has(name) ||
        !IdSchema.safeParse(item.id).success || createdIds.has(item.id))
        return failed('CHARACTER_NAME', '新角色名称或身份无效，或与现有角色重复');
      createdNames.add(name); createdIds.add(item.id);
    }
    if (lines.some(line => {
      if (line.speaker.kind !== 'character') return false;
      const id = line.speaker.id;
      return !source.characters.some(character => character.id === id) && !createdIds.has(id);
    }))
      return failed('SPEAKER_UNMAPPED', '对白说话者未匹配角色');
    const listed=await this.services.bridge.documents.list();if(!listed.ok)return listed;
    const characters=characterEdit(source,listed.value,newCharacters.map(item=>neutralCharacter(item.id,item.name.trim(),source.project)));
    const virtual=characters.patches.flatMap(patch=>patch.kind==='document'&&patch.after?[{documentId:patch.documentId,revision:1,savedRevision:1,dirty:false,format:'json' as const,files:(patch.after as {files:Record<string,string>}).files,savedFiles:{}}]:[]);
    const contracts=await this.services.bridge.plugins?.commandSpecs?.();if(contracts&&!contracts.ok)return contracts;
    const planned=prepareAuthoringEdit([...listed.value,...virtual],{op:'commands.insert',sceneId:current.sceneId,beforeId,commands:lines.map(line=>({command:'say',args:{speaker:line.speaker,text:line.text}}))},contracts?.value??[]);if(!planned.ok)return planned;
    const text=planned.value.patches.flatMap(patch=>patch.kind==='text'?patch.edits.map(edit=>edit.after):[]).join(''),id=parse({documentId:current.documentId,revision:current.revision,text}).cst[0]?.id;
    const result=await this.commit({...planned.value,label:`插入 ${lines.length} 条对白`,origin:'batch',patches:[...characters.patches,...planned.value.patches]});
    if(result.ok&&id){this.select([id]);this.setScroll(id,0,this.scroll.scrollLeft);}return result;
  }

  async insertCommand(command: string, args: Record<string, Json>, beforeId: Id | null): Promise<Result<EditReceipt>> {
    const current = this.scene; const state = this.parsed();
    if (!current || !state || state.readOnly) return failed('SOURCE_INVALID', '原文存在错误，不能插入指令');
    const listed=await this.services.bridge.documents.list();if(!listed.ok)return listed;
    const commands=await this.services.bridge.plugins?.commandSpecs?.();if(commands&&!commands.ok)return commands;
    const planned=prepareAuthoringEdit(listed.value,{op:'commands.insert',sceneId:current.sceneId,beforeId,commands:[{command,args}]},commands?.value??[]);if(!planned.ok)return planned;
    const text=planned.value.patches.flatMap(patch=>patch.kind==='text'?patch.edits.map(edit=>edit.after):[]).join('');
    const id=parse({documentId:current.documentId,revision:current.revision,text}).cst[0]?.id;
    const result=await this.commit(planned.value);
    if(result.ok&&id){this.select([id]);this.setScroll(id,0,this.scroll.scrollLeft);}return result;
  }

  async copyStatements(selected: Id[], beforeId: Id | null = null): Promise<Result<EditReceipt>> {
    if (!this.scene) return failed('SCENE_MISSING', '请选择场景');
    return this.authorOperation({ op: 'commands.duplicate', sceneId: this.scene.sceneId, ids: selected, beforeId });
  }

  async createScene(name: string, chapterId: Id): Promise<Result<EditReceipt>> {
    const result = await this.authorOperation({ op: 'scene.create', name, chapterId });
    if (result.ok) { const created = this.source?.scenes.find(scene => scene.chapterId === chapterId && scene.name === name.trim()); if (created) this.selectScene(created.sceneId); }
    return result;
  }

  async renameScene(name: string): Promise<Result<EditReceipt>> {
    if (!this.scene) return failed('SCENE_MISSING', '请选择场景');
    return this.authorOperation({ op: 'scene.update', id: this.scene.sceneId, changes: { name } });
  }

  async insertAssetCommand(asset: Asset, kind: 'background' | 'figure' | 'illustration' | 'live2d' | 'voice' | 'bgm' | 'effect', beforeId: Id | null,
    options: { characterId?: Id | null; objectId?: Id; station?: string; locale?: string | null } = {}): Promise<Result<EditReceipt>> {
    const current = this.scene; const state = this.parsed();
    if (!current || !state || state.readOnly) return failed('SOURCE_INVALID', '原文存在错误，不能插入素材指令');
    const figure = kind === 'figure' || kind === 'live2d';
    const illustration = kind === 'illustration';
    if (kind === 'background' && !['image', 'video'].includes(asset.kind) || (figure || illustration) && !['image', 'live2d'].includes(asset.kind) ||
      !figure && !illustration && kind !== 'background' && asset.kind !== 'audio' || kind === 'live2d' && asset.kind !== 'live2d')
      return failed('ASSET_KIND', '素材类型与指令不匹配');
    const before = beforeId ? state.parsed.cst.find(node => node.id === beforeId) : undefined;
    if (beforeId && !before) return failed('SELECTION_STALE', '插入位置已变化');
    if (kind === 'voice') {
      const target = before ?? state.parsed.cst.find(node => node.id === this.selection?.primaryId);
      if (!target?.id || target.command !== 'say') return failed('VOICE_TARGET', '请选择要绑定配音的对白');
      const applied = await this.editFields([{ field: options.locale ? `voiceByLocale.${options.locale}` : 'voice', op: 'set', value: asset.id }],[target.id]);
      if (applied.ok && this.source) await this.services.recordAssetUse?.({ projectId: this.source.project.projectId, assetIds: [asset.id] });
      return applied;
    }
    const args = kind === 'background' ? { op: 'show', assetId: asset.id, fit: 'cover', positionX: 0.5, positionY: 0.5 } :
      illustration ? { op: 'show', objectId: options.objectId ?? createId(this.source), assetId: asset.id,
        illustrationFrame: { widthRatio: .5, heightRatio: .5, fit: 'contain' } } :
      figure ? { op: 'show', objectId: options.objectId ?? createId(this.source), assetId: asset.id,
        ...(options.characterId ?? asset.characterId ? { characterId: options.characterId ?? asset.characterId } : {}), station: options.station ?? 'center' } :
      kind === 'bgm' ? { op: 'play', assetId: asset.id } : { op: 'play', soundId: createId(this.source), assetId: asset.id };
    const command = kind === 'background' ? 'changeBg' : illustration ? 'changeIllustration' : figure ? 'changeFigure' : kind === 'bgm' ? 'bgm' : 'playEffect';
    const applied = await this.insertCommand(command,args as unknown as Record<string,Json>,beforeId);
    if (applied.ok && this.source) await this.services.recordAssetUse?.({ projectId: this.source.project.projectId, assetIds: [asset.id] });
    return applied;
  }

  async setAutosave(enabled: boolean): Promise<Result<EditReceipt>> {
    const source = this.source;
    if (!source) return failed('PROJECT_MISSING', '请先打开作品');
    if (source.project.player.autosave === enabled) return failed('NO_CHANGE', '自动存档设置没有变化');
    return this.authorOperation({op:'project.update',changes:{player:{autosave:enabled}}});
  }

  async setLanguages(languages: Project['languages']): Promise<Result<EditReceipt>> {
    const source = this.source;
    if (!source) return failed('PROJECT_MISSING', '请先打开作品');
    const { ProjectLanguagesSchema, BuiltinPlayerMenuLocales } = await import('@galcraft/contracts');
    const checked = ProjectLanguagesSchema.safeParse(languages);
    if (!checked.success) return failed('PROJECT_LANGUAGES', checked.error.issues.map(issue => issue.message).join('；'));
    if (checked.data.menus.some(locale => !(BuiltinPlayerMenuLocales as readonly string[]).includes(locale))) return failed('PROJECT_MENU_LOCALE', '请选择 Player 支持的菜单语言');
    return this.commit({ label: '配置作品语言', origin: 'field', expected: [version(source.projectDocumentId, source.projectRevision)],
      preparedAssets: [], requiredRefs: [], patches: [{ kind: 'json', documentId: source.projectDocumentId,
        changes: [{ path: '/data/languages', before: source.project.languages, after: checked.data, op: 'set' }] }] });
  }

  async setPlayerName(name: Project['player']['name']): Promise<Result<EditReceipt>> {
    const source = this.source;
    if (!source) return failed('PROJECT_MISSING', '请先打开作品');
    const next = name ? structuredClone(name) : null;
    if (next && !source.characters.some(character => character.id === next.characterId && character.narrativeRole === 'viewpoint'))
      return failed('PLAYER_NAME_ROLE', '请先在“角色与路线”中将姓名所属角色设为玩家视角。');
    if (next && (!source.characters.some(character => character.id === next.characterId) || !next.defaultName.trim() ||
      !Number.isInteger(next.maxLength) || next.maxLength < 1 || next.maxLength > 100 || countNameCharacters(next.defaultName) > next.maxLength))
      return failed('PLAYER_NAME_INPUT', '请选择主角并填写有效默认姓名与长度');
    const patches: EditInput['patches'] = [];
    if (next?.allowCustom) {
      if (!next.variableId) {
        const reusable = source.variables?.find(variable => variable.name === '主角姓名' && variable.type === 'string' && variable.scope === 'progress');
        next.variableId = reusable?.id ?? createId(this.source);
        if (!reusable) {
          const documentId = createId(this.source);
          patches.push({ kind: 'document', documentId, op: 'create', before: null,
            after: { format: 'json', files: { [`variables/${next.variableId}.json`]: JSON.stringify({ schemaVersion: 1, documentId, revision: 1,
              data: { id: next.variableId, name: '主角姓名', type: 'string', scope: 'progress', initial: next.defaultName } }, null, 2) + '\n' } } });
        }
      } else if (!source.variables?.some(variable => variable.id === next.variableId && variable.type === 'string' && variable.scope === 'progress'))
        return failed('PLAYER_NAME_VARIABLE', '姓名需要绑定进度范围的字符串变量');
    } else if (next) next.variableId = null;
    if (!patches.length && JSON.stringify(source.project.player.name ?? null) === JSON.stringify(next)) return failed('NO_CHANGE', '姓名设置没有变化');
    patches.push({ kind: 'json', documentId: source.projectDocumentId, changes: [{ path: '/data/player/name', before: source.project.player.name ?? null, after: next, op: 'set' }] });
    return this.commit({ label: '设置主角姓名', origin: 'field', expected: [version(source.projectDocumentId, source.projectRevision)],
      preparedAssets: [], requiredRefs: [], patches });
  }

  async save(all = false): Promise<Result<SaveReceipt>> {
    if (!all && !this.scene) return failed('SCENE_MISSING', '请选择场景');
    this.status.save = 'saving';
    const plan = await this.services.bridge.documents.planSave(all ? { kind: 'all' } : { kind: 'current', documentId: this.scene!.documentId });
    if (!plan.ok) { this.status.save = 'failed'; this.status.issues = plan.issues; return plan; }
    return this.savePlanned(plan.value);
  }

  async savePlanned(plan: SavePlan): Promise<Result<SaveReceipt>> {
    this.status.save = 'saving';
    const saved = await this.services.bridge.documents.save(plan.planId);
    if (!saved.ok) { this.status.save = 'failed'; this.status.issues = saved.issues; return saved; }
    await this.reload();
    for (const key of this.booleanOrigins.keys()) if (saved.value.saved.some(item => key.startsWith(`${item.ref.id}/`))) this.booleanOrigins.delete(key);
    this.status.save = 'idle';
    return saved;
  }

  async saveProject(): Promise<Result<SaveReceipt>> {
    if (!this.source) return failed('PROJECT_MISSING', '请先打开作品');
    this.status.save = 'saving';
    const plan = await this.services.bridge.documents.planSave({ kind: 'current', documentId: this.source.projectDocumentId });
    if (!plan.ok) { this.status.save = 'failed'; this.status.issues = plan.issues; return plan; }
    const saved = await this.services.bridge.documents.save(plan.value.planId);
    if (!saved.ok) { this.status.save = 'failed'; this.status.issues = saved.issues; return saved; }
    await this.reload(); this.status.save = 'idle'; return saved;
  }

  async refresh(refresh?: AuthoringRefresh): Promise<void> { await this.reload(refresh); }

  async authorOperation(operation: AuthorOperation, baseline?: import('@galcraft/contracts').DocumentView[], resolution?:'draft'|'current'): Promise<Result<EditReceipt>> {
    const listed = await this.services.bridge.documents.list(); if (!listed.ok) return listed;
    const partial= ['project.update','scene.update','variable.update','character.update'].includes(operation.op);
    if(baseline&&partial){const rebased=rebaseAuthoringOperation(baseline,listed.value,operation,resolution);if(rebased.conflicts.length&&!resolution)return failed('AUTHOR_CONFLICT',`Fields changed in the workspace: ${rebased.conflicts.join(', ')}. Your input is retained; choose draft or current values.`);operation=rebased.operation;}
    const commands=await this.services.bridge.plugins?.commandSpecs?.();if(commands&&!commands.ok)return commands;
    const planned = prepareAuthoringEdit(baseline&&!partial?baseline:listed.value, operation,commands?.value ?? []); return planned.ok ? this.commit(planned.value) : planned;
  }

  async saveCharacters(drafts: CharacterDraft[]): Promise<Result<EditReceipt>> {
    if (!this.source) return failed('PROJECT_MISSING', '请先打开作品');
    const listed = await this.services.bridge.documents.list(); if (!listed.ok) return listed;
    try { return await this.commit(characterEdit(this.source, listed.value, drafts)); }
    catch (error) { return failed('CHARACTER_INPUT', error instanceof Error ? error.message : String(error)); }
  }

  async removeCharacter(id: Id): Promise<Result<EditReceipt>> {
    const listed = await this.services.bridge.documents.list(); if (!listed.ok) return listed;
    try { return await this.commit(removeCharacterEdit(listed.value, id)); }
    catch (error) { return failed('CHARACTER_REFERENCED', error instanceof Error ? error.message : String(error)); }
  }

  async undo(scope?: { documentId: Id; paths?: string[] }): Promise<Result<EditReceipt>> {
    const documentId = scope?.documentId ?? this.scene?.documentId;
    if (!documentId) return failed('SCENE_MISSING', '请选择场景');
    const plan = await this.services.bridge.documents.planUndo(documentId, undefined, scope?.paths);
    if (!plan.ok) return plan;
    if ((plan.value.members.length > 1 || plan.value.reverseOrder.length > 1) && this.reviewHistory && !await this.reviewHistory(plan.value)) return failed('HISTORY_CANCELLED', '历史操作已取消');
    const result = await this.services.bridge.documents.undo(plan.value.planId);
    if (result.ok) { this.historyLabel=plan.value.label; await this.reload(); }
    return result;
  }
  async acceptExternalEdit(receipt: EditReceipt | null, documentId: Id | null = receipt?.documents[0]?.ref.id ?? receipt?.dirty[0] ?? null, refresh?: AuthoringRefresh): Promise<void> {
    this.lastOperationId = receipt?.operationId ?? null; this.lastOperationDocumentId = documentId;
    await this.reload(refresh);
  }

  async redo(scope?: { documentId: Id; paths?: string[] }): Promise<Result<EditReceipt>> {
    const documentId = scope?.documentId ?? this.scene?.documentId;
    if (!documentId) return failed('SCENE_MISSING', '请选择场景');
    const plan = await this.services.bridge.documents.planRedo(documentId, scope?.paths);
    if (!plan.ok) return plan;
    if ((plan.value.members.length > 1 || plan.value.reverseOrder.length > 1) && this.reviewHistory && !await this.reviewHistory(plan.value)) return failed('HISTORY_CANCELLED', '历史操作已取消');
    const result = await this.services.bridge.documents.redo(plan.value.planId);
    if (result.ok) { this.historyLabel=plan.value.label; await this.reload(); }
    return result;
  }

  async flushResume(): Promise<Result<void>> {
    if (this.resumeTimer) { clearTimeout(this.resumeTimer); this.resumeTimer = null; }
    const source = this.source; const scene = this.scene;
    if (!source || !scene) return success(undefined);
    const ids = this.parsed()?.parsed.cst.filter(node => node.valid && node.id).map(node => node.id!) ?? [];
    const index = this.selection?.primaryId ? ids.indexOf(this.selection.primaryId) : -1;
    const record: WorkspaceResume = { schemaVersion: 1, projectId: source.project.projectId, documentId: scene.documentId,
      sceneId: scene.sceneId, documentRevision: scene.revision, view: this.view,
      caret: this.caret,
      previousStatementId: index > 0 ? ids[index - 1]! : null, nextStatementId: index >= 0 ? ids[index + 1] ?? null : null,
      scroll: this.scroll, updatedAt: new Date().toISOString(), ...(this.workbench ? { workbench: this.workbench } : {}) };
    return this.services.bridge.authoringPreferences.writeWorkspace(record);
  }

  private scheduleResume(): void {
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => { void this.flushResume(); }, 1000);
  }
  private async commit(input: EditInput): Promise<Result<EditReceipt>> {
    const plan = await this.services.bridge.documents.planEdit(input);
    if (!plan.ok) return plan;
    const applied = await this.services.bridge.documents.applyEdit(plan.value.planId, input.expected);
    if (applied.ok) { this.lastOperationId = applied.value.operationId; this.lastOperationDocumentId = input.patches[0]?.documentId ?? null;  await this.reload(); }
    return applied;
  }
  private async reload(refresh?: AuthoringRefresh): Promise<void> {
    const loaded = await this.services.read(refresh?.documents);
    if (!loaded.ok) { this.status.issues = loaded.issues; return; }
    const id = this.scene?.sceneId;
    reserveIds(loaded.value);
    this.source = loaded.value;
    this.scene = loaded.value.scenes.find(scene => scene.sceneId === id) ?? loaded.value.scenes[0] ?? null;
    this.refreshStatus();
    if (refresh?.compilation) this.receiveCompilation(refresh.compilation); else await this.refreshPreview();
  }
  private async refreshPreview(): Promise<void> {
    if (!this.services.compilePreview) return;
    const result = await this.services.compilePreview();
    this.receiveCompilation(result);
  }
  private receiveCompilation(result: Awaited<ReturnType<NonNullable<AuthoringServices['compilePreview']>>>): void {
    if (!result.ok) { this.status.issues = result.issues; this.status.compilation = { state: 'failed', snapshotId: null, documents: [] }; return; }
    this.status.issues = result.value.issues;
    const snapshot = result.value.snapshot ?? result.value.lastValid;
    this.status.compilation = { state: result.value.snapshot && result.value.current ? 'current' : result.value.lastValid ? 'lastValid' : result.value.issues.length ? 'failed' : 'none',
      snapshotId: snapshot?.snapshotId ?? null, documents: snapshot?.documents ?? [] };
    this.status.preview = 'none';
  }
  private refreshStatus(): void {
    const scene = this.scene;
    this.status = { dirty: Boolean(this.source?.anyDirty ?? (this.source?.scenes.some(item => item.dirty) || this.source?.projectDirty)), save: this.status.save,
      savedRevision: scene?.savedRevision ?? 0, preview: this.status.preview, issues: this.status.issues,
      compilation: this.status.compilation };
  }
}
