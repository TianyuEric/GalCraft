import { z } from 'zod';
import { DomainSchema, IdSchema, JsonSchema, RevisionSchema, UtcTimeSchema, VersionSchema } from './common.js';
import type { CancelResult, Id, Issue, Json, Lock, Operation, Ref, Result, Revision, Source, Target, VersionRef } from './common.js';
import type { Asset, AssetIdsResult, AssetPage, AssetPickerPage, AssetPickerQuery, AssetQuery, AssetTypeCatalogEntry, AssetTypeEditInput } from './assets.js';
import type { DocumentView, EditInput, EditPlan, EditReceipt, FileConflict, PluginDocumentInstance, SavePlan, SaveReceipt, SaveScope, UndoPlan, DiscardScope, DiscardPlan } from './documents.js';
import type { CapabilityReport, ConnectionConfig, ConnectionSelection } from './generation.js';
import type { Snapshot } from './runtime.js';
import type { NativeAnimation } from './animation.js';
import type { NamedStyle, RuntimeTemplate } from './template.js';
import type { BackupOptions, ProjectPackage, RestoreOptions, RestorePlanSummary, RestoreReceipt } from './backup.js';

const finite = z.number().finite();
export type ActionIconPreset = { key: string; names: Record<string, string>; previewUri: string };
export const StorageBatchSchema = z.strictObject({
  domain: DomainSchema, expectedRevision: RevisionSchema,
  writes: z.array(z.strictObject({ key: z.string(), bytes: z.instanceof(Uint8Array) })),
  deletes: z.array(z.string()),
});
export type StorageBatch = z.infer<typeof StorageBatchSchema>;
export const ViewportInfoSchema = z.strictObject({
  width: finite, height: finite, pixelRatio: finite,
  safeArea: z.strictObject({ top: finite, right: finite, bottom: finite, left: finite }),
  orientation: z.enum(['landscape', 'portrait']),
});
export type ViewportInfo = z.infer<typeof ViewportInfoSchema>;
export const LifecycleEventSchema = z.strictObject({
  type: z.enum(['focus', 'blur', 'foreground', 'background', 'closeRequested', 'memoryPressure', 'audioInterrupted', 'audioAvailable']),
  at: UtcTimeSchema,
});
export type LifecycleEvent = z.infer<typeof LifecycleEventSchema>;
export const HostInputSchema = z.strictObject({
  action: z.enum(['advance', 'back', 'toolbar', 'confirm', 'emergency']), phase: z.enum(['down', 'up']),
  origin: z.enum(['keyboard', 'mouse', 'touch', 'system']),
  pointer: z.strictObject({ x: finite, y: finite }).optional(), nativeCode: z.string().optional(),
});
export type HostInput = z.infer<typeof HostInputSchema>;
export interface ResourceLocation { uri: string; mime: string; bytes: number; rangeSupported: boolean; release(): void }
export interface PlayerHost {
  readonly target: Target;
  resources: { resolve(assetId: Id, variantId: Id): Promise<Result<ResourceLocation>> };
  storage: { read(key: string): Promise<Result<Uint8Array | null>>; commit(batch: StorageBatch): Promise<Result<{ revision: Revision }>> };
  transfer: {
    importFile(accept: string[]): Promise<Result<Uint8Array | null>>;
    exportFile(name: string, mime: string, bytes: Uint8Array): Promise<Result<void>>;
  };
  viewport(): ViewportInfo;
  subscribeLifecycle(fn: (event: LifecycleEvent) => void): () => void;
  subscribeInput(fn: (action: HostInput) => void): () => void;
  close(): Promise<Result<void>>;
  platform(name: string, args: Json): Promise<Result<Json>>;
}

/** Serializable Windows IPC port. The preload owns the resource release closure. */
export type PlayerIpc = Pick<PlayerHost, 'storage' | 'transfer'> & {
  resources: {
    resolve(assetId: Id, variantId: Id): Promise<Result<Omit<ResourceLocation, 'release'> & { token: Id }>>;
    release(token: Id): Promise<Result<void>>;
  };
  host: Pick<PlayerHost, 'close' | 'platform'>;
};
export type IpcArgs<T> = T extends (...args: infer A) => unknown ? A : never;
export type IpcReturn<T> = T extends (...args: never[]) => infer R ? R : never;
export type IpcValue<T> = Awaited<IpcReturn<T>>;
/** Keep asynchronous calls and make implemented optional bridge ports mandatory. */
export type IpcMethods<T> = { [G in keyof T as T[G] extends object ? G : never]: {
  [M in keyof T[G] as NonNullable<T[G][M]> extends (...args: never[]) => Promise<unknown> ? M : never]-?: NonNullable<T[G][M]>
} };

export const EditorAnchorSchema = z.strictObject({
  statementId: IdSchema.nullable(), field: z.string().nullable(), offset: RevisionSchema, documentOffset: RevisionSchema,
});
export type EditorAnchor = z.infer<typeof EditorAnchorSchema>;
export const WorkspaceResumeSchema = z.strictObject({
  schemaVersion: z.literal(1), projectId: IdSchema, documentId: IdSchema, sceneId: IdSchema,
  documentRevision: RevisionSchema, view: z.enum(['cards', 'writing', 'script']),
  caret: EditorAnchorSchema, previousStatementId: IdSchema.nullable(), nextStatementId: IdSchema.nullable(),
  scroll: z.strictObject({ statementId: IdSchema.nullable(), offsetPx: finite, scrollLeft: finite }), updatedAt: UtcTimeSchema,
  workbench: z.strictObject({
    documents: z.array(z.strictObject({ id: z.string(), title: z.string(), kind: z.enum(['scene', 'page', 'asset', 'project', 'characters', 'scene-graph', 'startup', 'route']), objectId: z.string().optional() })),
    active: z.string(),
  }).optional(),
});
export type WorkspaceResume = z.infer<typeof WorkspaceResumeSchema>;
/** Actual uncommitted field content belongs to M01 and is separate for each entry. */
export const AuthoringInputDraftSchema = z.strictObject({
  schemaVersion: z.literal(1), projectId: IdSchema, entry: z.enum(['desktop', 'browser']),
  clientId: IdSchema.optional(), updatedAt: UtcTimeSchema, content: JsonSchema,
});
export type AuthoringInputDraft = z.infer<typeof AuthoringInputDraftSchema>;
export const StageGuidePreferencesSchema = z.strictObject({
  schemaVersion: z.literal(1), projectId: IdSchema, uiBounds: z.boolean(), center: z.boolean(), thirds: z.boolean(),
});
export type StageGuidePreferences = z.infer<typeof StageGuidePreferencesSchema>;
export const StudioPreferencesSchema = z.strictObject({
  schemaVersion: z.literal(1), theme: z.enum(['light', 'dark']), palette: z.enum(['neutral', 'blue']).transform(() => 'blue' as const).default('blue'), locale: z.enum(['zh-CN', 'en', 'ja']),
  layout: z.strictObject({ left: finite, right: finite, bottom: finite, diagnosticsVisible: z.boolean() }),
  editor: z.strictObject({ fontFamily: z.string(), fontSize: finite, wordWrap: z.boolean(),
    view: z.enum(['cards', 'writing', 'script']), autoCollapse: z.boolean(), cascadeSeparator: z.string() }),
  onboardingDismissed: z.boolean(), recentCommands: z.array(z.string()),
});
export type StudioPreferences = z.infer<typeof StudioPreferencesSchema>;
export const DefaultStudioPreferences: StudioPreferences = {
  schemaVersion: 1, theme: 'light', palette: 'blue', locale: 'zh-CN',
  layout: { left: 240, right: 320, bottom: 200, diagnosticsVisible: false },
  editor: { fontFamily: 'system-ui', fontSize: 14, wordWrap: true, view: 'cards', autoCollapse: false, cascadeSeparator: ' / ' },
  onboardingDismissed: false, recentCommands: [],
};
export type ProjectCreationInput = { path: string; name: string; template: 'empty' | 'light' | 'standard' | 'rich';
  width: number; height: number; engineVersion: string; closeChoice?: 'save' | 'discard' };
export type ProjectLibraryEntry = { projectId: Id; directory: string; name: string; description: string; engineVersion: string;
  lastOpenedAt: string | null; pinned: boolean; status: 'available' | 'missing' | 'invalid' };
export type AssetImportReceipt = { succeeded: Asset[]; failed: { path: string; issue: Issue }[] };
export type AssetVerificationProgress = { operationId: Id; projectId: Id; sessionId: string; target: Target;
  phase: 'preparing' | 'checking' | 'applying' | 'complete' | 'failed'; completed: number; total: number | null; issueCount: number;
  assetId?: Id; variantId?: Id; name?: string; message?: string };
export type SoundBankId = string;
export type SoundBankInput = { id: SoundBankId; version: '0.1.0' };
export type SoundBankDescriptor = { schemaVersion: 1; id: SoundBankId; version: '0.1.0'; name: string; upstreamVersion: string;
  format: 'sf2' | 'sf3'; bytes: number; sourceUrl: string; license: string; notices: { name: string; text: string }[] };
export type SoundBankStatus = { descriptor: SoundBankDescriptor; installed: boolean; directory: string | null;
  availability: 'ready' | 'notInstalled' | 'unreadable'; issues: Issue[] };
export type SoundBankPort = { list(): Promise<Result<SoundBankStatus[]>>; install(input: SoundBankInput): Promise<Result<SoundBankStatus>>;
  resolve(input: SoundBankInput): Promise<Result<{ url: string; expected: SoundBankDescriptor }>>;
  chooseFile(): Promise<Result<string | null>>;
  import(input: { path: string; name: string; license: string; sourceUrl: string }): Promise<Result<SoundBankStatus>> };
export const SoundBankRuntimeKeys = { 'org.galcraft.music-composition/hq': 'musescore-general-hq', 'org.galcraft.music-composition/basic': 'ms-basic' } as const;
export type AssetListIdentity = { assetId: Id; revision: Revision; name: string; kind: Asset['kind']; folder: string[];
  character: { id: Id; name: string } | null; sameNameCount: number; sourceName: string; createdAt: string;
  shownVariant: { id: Id; role: Asset['variants'][number]['role']; metadata: Asset['variants'][number]['metadata']; active: boolean; currentBinding: boolean } | null;
  currentBindingMissing: boolean };
export type SourceLocation = { documentId: Id; revision: Revision; statementId: Id | null; field: string | null;
  line: number; column: number; start: number; end: number };
export type SemanticQuery = { projectId: Id; requestId: Id; expected: VersionRef[]; expectedLock: Lock; sceneIds: Id[]; offset: number; limit?: number;
  filter: { kind: 'dialogue'; speaker: { kind: 'character'; id: Id } | { kind: 'narrator' } }
    | { kind: 'variable'; id: Id; scope: 'progress' | 'local' | 'longTerm'; declaringSceneId: Id | null; access: 'read' | 'write' | 'both' }
    | { kind: 'asset'; id: Id }
    | { kind: 'bgm'; assetId: Id | null; includeChannelStops: boolean } };
export type SemanticHit = { source: Source; sceneId: Id | null; subject: Ref | null;
  uses: ('dialogue' | 'read' | 'write' | 'assetUse' | 'bgmPlay' | 'bgmStop')[];
  binding: 'direct' | 'channel'; command: string | null; label: string;
  context: { before: string | null; current: string; after: string | null } };
export type SemanticPage = { requestId: Id; versions: VersionRef[]; items: SemanticHit[]; total: number; offset: number;
  coverage: { documentId: Id; revision: number; state: 'complete' | 'partial' | 'unavailable'; issues: Issue[] }[] };
export type RemoveBackgroundInput = { assetId: Id; sourceVariantId: Id;
  choice: { enabled: boolean; provider: 'node' | 'comfy'; connectionId: Id | null; workflowBindingId: Id | null };
  declared: 'removed' | 'unchanged' | 'unknown'; recognizeAgain?: boolean };
export type BackgroundReference = { source: Source; label: string; variantId: Id | null };
export type BackgroundAdoptionScope = 'allFloating' | 'keepCurrent' | { kind: 'newAssetSelectedRefs'; sources: Source[] };
export type PageAuthoringPlan = {template:RuntimeTemplate;edit:EditInput;issues:Issue[];
  affected:{pageIds:Id[];componentIds:Id[];styleIds:Id[];animationIds:Id[]};
  created:{pages:Id[];components:Id[];styles:Id[];animations:Id[]}};
export interface StudioBridge {
  soundbanks?: SoundBankPort;
  onCloseRequested?(callback: () => Promise<'save' | 'discard' | 'cancel'>): () => void;
  engines: {
    listCreationVersions(): Promise<Result<string[]>>;
    importLive2D(withMotionSync: boolean): Promise<Result<{ sdkRelease: string; coreVersion: string; motionSyncCoreVersion: string | null } | null>>;
    resolvePreview(snapshot: Snapshot): Promise<Result<{ handleId: Id; engineVersion: string; url: string;
      live2d?: { url: string; expected: { coreVersion: string; motionSyncCoreVersion: string | null } } }>>;
    releasePreview(handleId: Id): Promise<Result<void>>;
  };
  plugins: {
    commandSpecs?():Promise<Result<import('./dsl.js').CommandSpec[]>>;
    inspectPackage(source: { kind: 'archive' | 'directory'; path: string }): Promise<Result<unknown>>;
    install(source: { kind: 'archive' | 'directory'; path: string }): Promise<Result<unknown>>;
    loadDevelopment(input: { directory: string; projectId: Id }): Promise<Result<unknown>>;
    resolve(lock: Lock): Promise<Result<{ handleId: Id; packages: { manifest: unknown; runtimeUrl: string | null; editorUrl: string | null;
      definitionUrl?: string | null; servicesUrl?: string | null }[] }>>;
    release(handleId: Id): Promise<Result<void>>;
  };
  templates: {
    library?(input: import('./template.js').TemplateLibraryInput): Promise<Result<Json>>;
    prepareTemplateSwitch?(input: import('./template.js').TemplateSwitchRequest): Promise<Result<import('./template.js').TemplateSwitchResult>>;
    restoreTemplatePage?(pageKey: string): Promise<Result<{edit:EditInput}>>;
    previewTemplateResources?(planId:string):Promise<Result<{assets:import('./assets.js').ResolvedAsset[];locations:{assetId:string;variantId:string;uri:string;mime:string;bytes:number}[];leaseIds:string[]}>>;
    preparePageEdit?(input: import('./ui-authoring.js').PageEditInput): Promise<Result<PageAuthoringPlan>>;
    preparePageStyleEdit?(input: import('./ui-authoring.js').StyleEditInput): Promise<Result<PageAuthoringPlan>>;
    pluginCatalog?(): Promise<Result<Json>>;
    pluginPrepare?(input: Json): Promise<Result<EditInput>>;
    pluginPreview?(input: Json): Promise<Result<Json>>;
    compileStyle(input: { style: NamedStyle; source: string; instanceId: Id; modules?: Record<string, string>; lastValidCss?: string }):
      Promise<Result<{ style: NamedStyle; css: string | null; source: string; sourceMap: string | null;
        declarations: { selector: string; property: string; value: string; line: number; column: number }[] }>>;
  };
  projects: {
    chooseDirectory(): Promise<Result<string | null>>;
    chooseBackupFile(): Promise<Result<string | null>>;
    supplyRestoreDependency(input: { operationDirectory: string; kind: 'engine' | 'template' | 'plugin'; id: string; version: string }): Promise<Result<RestorePlanSummary | null>>;
    listRecent(): Promise<Result<ProjectLibraryEntry[]>>;
    inspect(directory: string): Promise<Result<ProjectLibraryEntry>>;
    setPinned(input: { directory: string; pinned: boolean }): Promise<Result<void>>;
    forget(directory: string): Promise<Result<void>>;
    relocate(input: { directory: string; replacement: string }): Promise<Result<void>>;
    revealDirectory(directory: string): Promise<Result<void>>;
    backup(): Promise<Result<{ directory: string } | null>>;
    switch(input: { directory: string; choice: 'save' | 'discard' }): Promise<Result<{ projectId: Id; sessionId: Id }>>;
    create(input: ProjectCreationInput): Promise<Result<{ projectId: Id; sessionId: Id }>>;
    copy(): Promise<Result<{ projectId: Id; directory: string }>>;
    open(path: string): Promise<Result<{ projectId: Id; sessionId: Id }>>;
    close(sessionId: Id, choice: 'save' | 'discard' | 'cancel'): Promise<Result<void>>;
  };
  documents: {
    createBackup(input: BackupOptions): Promise<Result<ProjectPackage>>;
    prepareRestore(input: RestoreOptions): Promise<Result<RestorePlanSummary>>;
    checkRestore(operationDirectory: string): Promise<Result<RestorePlanSummary>>;
    commitRestore(operationDirectory: string): Promise<Result<RestoreReceipt>>;
    cancelRestore(operationDirectory: string): Promise<Result<void>>;
    list(): Promise<Result<DocumentView[]>>;
    pluginList?(input: { pluginId: string; contributionKey?: string }): Promise<Result<PluginDocumentInstance[]>>;
    pluginCreate?(input: { pluginId: string; contributionKey: string; name?: string; data?: Json }): Promise<Result<EditInput>>;
    pluginCopy?(input: { documentId: Id; name?: string }): Promise<Result<EditInput>>;
    pluginDelete?(input: { documentId: Id; expectedRevision: number }): Promise<Result<EditInput>>;
    pluginUpdate?(input: { documentId: Id; expectedRevision: number; data: Json }): Promise<Result<EditInput>>;
    planEdit(input: EditInput): Promise<Result<EditPlan>>;
    applyEdit(planId: Id, expected: VersionRef[]): Promise<Result<EditReceipt>>;
    planUndo(documentId: Id, operationId?: Id, paths?: string[]): Promise<Result<UndoPlan>>;
    planRedo(documentId: Id, paths?: string[]): Promise<Result<UndoPlan>>;
    planDiscard?(scope: DiscardScope): Promise<Result<DiscardPlan>>;
    applyDiscard?(planId: Id): Promise<Result<EditReceipt>>;
    undo(planId: Id): Promise<Result<EditReceipt>>;
    redo(planId: Id): Promise<Result<EditReceipt>>;
    planSave(scope: SaveScope): Promise<Result<SavePlan>>;
    save(planId: Id): Promise<Result<SaveReceipt>>;
    getConflict(planId: Id): Promise<Result<FileConflict[]>>;
    resolveConflict(planId: Id, choice: 'local' | 'disk' | 'copy', copyPath?: string): Promise<Result<void>>;
    listRecovery(): Promise<Result<Json | null>>;
    recover(choice: 'restore' | 'discard'): Promise<Result<Id[]>>;
    getRecoveryConflict(): Promise<Result<FileConflict[]>>;
    resolveRecoveryConflict(choice: 'local' | 'disk' | 'copy', copyPath?: string): Promise<Result<Id[]>>;
  };
  authoringPreferences: {
    readInputDraft?(input: { projectId: Id; entry: 'desktop' | 'browser'; clientId?: Id }): Promise<Result<AuthoringInputDraft | null>>;
    writeInputDraft?(draft: AuthoringInputDraft): Promise<Result<void>>;
    readPreferences(): Promise<Result<StudioPreferences>>;
    writePreferences(value: StudioPreferences): Promise<Result<void>>;
    readWorkspace(projectId: Id): Promise<Result<WorkspaceResume | null>>;
    writeWorkspace(record: WorkspaceResume): Promise<Result<void>>;
    clearWorkspace(projectId: Id): Promise<Result<void>>;
    readStageGuides(projectId: Id): Promise<Result<StageGuidePreferences>>;
    writeStageGuides(value: StageGuidePreferences): Promise<Result<void>>;
  };
  files: {
    readImport?(input:{purpose:'production'|'documents';title?:string;extensions:string[]}):Promise<Result<{path:string;text:string}|null>>;
    chooseImport?(input:{purpose:'assets'|'production'|'packages'|'documents';title?:string;extensions?:string[];directory?:boolean;multiple?:boolean}):Promise<Result<string[]>>;
    pathsForFiles?(files: File[]): string[];
    pickAssets(): Promise<Result<string[]>>;
    pickRecipes(): Promise<Result<string[]>>;
    revealEntity(ref: Ref): Promise<Result<void>>;
    openBuild(buildId: Id): Promise<Result<void>>;
  };
  assets: {
    typeCatalog(): Promise<Result<AssetTypeCatalogEntry[]>>;
    editTypeData(input: AssetTypeEditInput): Promise<Result<{ assetId: Id; variantId: Id; edit: EditReceipt }>>;
    saveAnimation(input: { name: string; animation: NativeAnimation; assetId?: Id; expectedRevision?: number }): Promise<Result<{ assetId: Id; variantId: Id; edit: EditReceipt }>>;
    weatherTexture(preset: import('./weather-presets.js').StageWeatherPresetKey): Promise<Result<Asset>>;
    iconPresets(): Promise<Result<ActionIconPreset[]>>;
    importIconPreset(input: { key: string; componentId: Id; state: 'normal' | 'hover' | 'pressed' | 'focus' | 'disabled' | 'selected' | 'locked' | 'empty' }): Promise<Result<EditReceipt | null>>;
    processorCatalog?(): Promise<Result<Json>>;
    previewResource?(preparationId: Id): Promise<Result<{ leaseId: Id; uri: string; mime: string; bytes: number }>>;
    references?(assetId: Id): Promise<Result<Json>>;
    processResource?(input: Json): Promise<Result<Json>>;
    cancelResource?(operationId: Id): Promise<Result<void>>;
    resourceCandidates?(): Promise<Result<Json>>;
    confirmResource?(input: { preparationId: Id; activate?: boolean }): Promise<Result<EditReceipt>>;
    discardResource?(preparationId: Id): Promise<Result<void>>;
    verifyTarget(target: Target, operationId?: Id): Promise<Result<{ edit: EditReceipt; issues: Issue[] }>>;
    subscribeTargetVerification?(callback: (progress: AssetVerificationProgress) => void): () => void;
    query(query: AssetQuery): Promise<Result<AssetPage>>;
    picker(input: AssetPickerQuery): Promise<Result<AssetPickerPage>>;
    recordUse(input: { projectId: Id; assetIds: Id[] }): Promise<Result<void>>;
    removeRecent(input: { projectId: Id; assetId: Id }): Promise<Result<void>>;
    allIds(query: AssetQuery): Promise<Result<AssetIdsResult>>;
    get(assetId: Id): Promise<Result<Asset | null>>;
    inspectModel(assetId: Id): Promise<Result<Asset | null>>;
    describe(input: { assetIds: Id[]; indexRevision: number; currentAssetId: Id | null; currentVariantId: Id | null }): Promise<Result<{ items: AssetListIdentity[]; missingAssetIds: Id[] }>>;
    rename(changes: { id: Id; name: string }[]): Promise<Result<EditReceipt>>;
    planBatchRename(input: { assetIds: Id[]; template: string;
      values: { assetId: Id; chapter: string; character: string; usage: string }[] }): Promise<Result<{
        planId: Id; names: { assetId: Id; before: string; after: string }[];
        conflicts: { name: string; assetIds: Id[] }[]; indexRevision: number }>>;
    applyBatchRename(planId: Id): Promise<Result<EditReceipt>>;
    remove(ids: Id[]): Promise<Result<EditReceipt>>;
    preview(assetId: Id, variantId?: Id): Promise<Result<{ uri: string; mime: string; playback: { loopStartSec: number | null; loopEndSec: number | null } }>>;
    thumbnails(requests: { assetId: Id; variantId?: Id }[]): Promise<Result<{ assetId: Id; variantId: Id; uri: string }[]>>;
    stopPreview(): Promise<Result<void>>;
    resolveRuntime(assetId: Id, variantId: Id): Promise<Result<{ leaseId: Id; uri: string; mime: string; bytes: number }>>;
    releaseRuntime(leaseId: Id): Promise<Result<void>>;
    prepareMattingModel(): Promise<Result<{ bytes: number; inputName: string; outputName: string }>>;
    removeBackground(input: RemoveBackgroundInput): Promise<Result<{ status: 'unchanged' | 'reused' | 'needsReview' | 'prepared'; preparationId?: Id; previewUri?: string; maskVariantId?: Id; transparentVariantId?: Id; references?: BackgroundReference[] }>>;
    confirmBackground(preparationId: Id, scope: BackgroundAdoptionScope): Promise<Result<{ save: SaveReceipt; transparentVariantId: Id; assetId: Id }>>;
    discardBackground(preparationId: Id): Promise<Result<void>>;
    import(paths: string[]): Promise<Result<AssetImportReceipt>>;
  };
  language: {
    pluginQuery?(input: { refs?: Ref[]; sceneId?: Id; statementIds?: Id[] }): Promise<Result<Json>>;
    pluginPrepare?(input: Json): Promise<Result<EditInput>>;
    compile(input: unknown): Promise<Result<{ snapshot: Snapshot | null; lastValid: Snapshot | null; current: boolean; issues: Issue[] }>>;
    lastValid(projectId: Id): Promise<Result<Snapshot | null>>;
    querySemantic(input: SemanticQuery): Promise<Result<SemanticPage>>;
    locate(source: Source, fieldPath?: string | null): Promise<Result<SourceLocation | null>>;
  };
  operations: {
    cancel(id: Id): Promise<CancelResult>;
    subscribe(callback: (event: Operation<Json>) => void): () => void;
  };
  connections: {
    save(config: ConnectionConfig, secret?: string): Promise<Result<Id>>;
    test(selection: ConnectionSelection): Promise<Result<CapabilityReport>>;
  };
}

export const AndroidBuildOptionsSchema = z.strictObject({
  applicationId: z.string(), versionCode: z.number().int().positive(), releaseVersion: VersionSchema,
  orientation: z.enum(['landscape', 'sensorLandscape']), minSdk: z.number().int().positive(), targetSdk: z.number().int().positive(),
  iconAssetId: IdSchema, signingProfileId: z.string().nullable(), output: z.enum(['apk', 'aab']),
});
export type AndroidBuildOptions = z.infer<typeof AndroidBuildOptionsSchema>;
export const AndroidCapabilitySchema = z.strictObject({
  webView: z.string(), audio: z.array(z.string()), video: z.array(z.string()), webGL: z.boolean(),
  storage: z.literal('private'), filePicker: z.boolean(),
  plugins: z.array(z.strictObject({ id: z.string(), supported: z.boolean(), alternative: z.string().nullable() })),
});
export type AndroidCapability = z.infer<typeof AndroidCapabilitySchema>;
