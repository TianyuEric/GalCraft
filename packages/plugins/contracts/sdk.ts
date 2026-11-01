import type {
  CommandSpec, Dependency, Domain, EditInput, EditPlan, ExecutionToken, FieldSpec, Id, Issue, Json, Lock,
  LongTerm, PresentationDelta, Ref, RelativePath, ResolvedAsset, ResourceCapabilities,
  RestoreKey, Result, RuntimeState, Target, Version, PluginChange, Snapshot,
} from '@galcraft/contracts';
import type { PluginManifest } from './manifest.js';
import type { StudioPluginContext, StudioScope } from './studio.js';
import type { GenerationProviderContribution, ResourceProcessorContribution } from './services.js';

export interface GalCraftPlugin {
  activate(context: PluginContext): Promise<Contributions>;
  deactivate(): Promise<void>;
}

export interface PluginContext {
  soundbanks?: Pick<import('@galcraft/contracts').SoundBankPort, 'list' | 'resolve'>;
  readonly pluginId: string;
  readonly target: Target;
  readonly domain: Domain;
  readonly config?: Json;
  readonly scope?: StudioScope;
  readonly studio?: StudioPluginContext;
  readonly signal?: AbortSignal;
  onDispose?(release: () => void | Promise<void>): void;
  credentials?: { read(id: Id): Promise<string | null> };
  media?: { probe(path: string, mime: string): Promise<{ metadata: Json; hasAlpha?: boolean; hasTransparency?: boolean }> };
  generation?: { acquire(config: import('@galcraft/contracts').ConnectionConfig): Promise<{adapter: import('@galcraft/contracts').GenerationAdapter; release(): void | Promise<void>}> };

  documents: { read(ref: Ref): Result<Json>; propose(input: EditInput): Result<EditPlan> };
  assets: { get?(id:Id):Promise<Result<import('@galcraft/contracts').Asset>>; resolve(ref: Ref): Promise<Result<ResolvedAsset>>;
    readText?(resource: ResolvedAsset, path: RelativePath): Promise<string>;
    readBytes?(resource: ResolvedAsset, path: RelativePath): Promise<Uint8Array> };
  runtimeDependencies?: { resolve(key: string): Promise<Result<{ url: string; expected: Json }>>;
    load?(key: string): Promise<Result<{ module: Record<string, unknown>; url: string; expected: Json }>> };
  pages: { open(key: string, input: Json): Promise<Result<Json>> };
  platform?: { invoke(key: string, action: string, args: Json): Promise<Result<Json>> };
  log(issue: Issue): void;
}

export type PluginStep = {
  progress: Json;
  longTermDelta: Json | null;
  presentation: PresentationDelta | null;
  wait: null | { page: string; input: Json; resumeData: Json };
  result: boolean | number | string | null;
};
export type PluginCommand = {
  spec: CommandSpec;
  execute(input: { args: Json; state: Json; token: ExecutionToken }): Promise<Result<PluginStep>>;
  resume?(input: { resumeData: Json; result: Json; state: Json; token: ExecutionToken }): Promise<Result<PluginStep>>;
};
export type PluginCondition = {
  key: string; fields: FieldSpec[];
  evaluate(args: Json, progress: Json, longTerm: Json): Result<boolean>;
};
export type DocumentContribution = {
  key: string; schema: Json; fields: FieldSpec[]; initial: Json;
  titleKey?: string;
  stateVersion?: number;
  instances?: 'multiple' | 'fixed';
  configMapping?: { purpose: string; mode: 'multiple' | 'fixed'; required: boolean };
  validate?(data: Json): Result<Json>;
  convert?(from: number, to: number, data: Json): Result<Json>;
  collectReferences(data: Json): Ref[];
  rewriteReferences(data: Json, mapping: Record<Id, Id>): Result<Json>;
};
export type ToolContribution = {
  key: string; titleKey: string; descriptionKey?:string; inputFields: FieldSpec[];
  locations?: ('tools.list' | 'commands.palette' | 'context.menu' | 'creation.tools' | 'assets.tools' | 'player-ui.tools' | 'production.tools')[];
  scope?: { pages?: string[]; selection?: 'none' | 'statements' | 'assets' | 'documents' };
  applicable?(scope: StudioScope): { available: boolean; reason?: string };
  external?: Omit<import('@galcraft/contracts').ExternalToolDefinition,'key'|'title'> & {targetFields:string[]};
  runExternal?(input:Json,context:PluginContext & {collaboration:import('@galcraft/contracts').CollaborationContext},signal:AbortSignal):Promise<Result<Json|EditInput|PluginToolResult|null>>;
  run(input: Json, context: PluginContext, signal: AbortSignal): Promise<Result<PluginToolResult | EditInput | null>>;
};
export type PluginToolResult =
  | { kind: 'report'; issues: Issue[]; message?: string }
  | { kind: 'edit'; input: EditInput }
  | { kind: 'task'; taskId: Id; candidateIds?: Id[] }
  | { kind: 'candidate'; candidateId: Id; taskId?: Id }
  | { kind: 'none' };
export type FieldEditorContribution = {
  key: string; contributionKey: string; fieldKey: string;
  mount(root: HTMLElement, context: { value: Json; locale: string; signal: AbortSignal;
    target?: import('./production-editor.js').ProductionFieldEditorContext;
    commit(value: Json): Promise<Result<void>>; studio: StudioPluginContext }): void | (() => void);
};
export type PublishCheckContribution = {
  key: string;
  check(input: { snapshot: Snapshot; lock: Lock; target: Target; settings: Json }, signal?: AbortSignal): Promise<Issue[]>;
};
export type PluginConfigDocument = { contribution: string; documentId: Id; revision: number; purpose: string; data: Json };
export type PluginRuntimeConfig = { schemaVersion: 1; documents: PluginConfigDocument[] };
export type PluginDefinition = { documents?: DocumentContribution[]; commands?: CommandSpec[];
  productionOperations?: import('@galcraft/contracts').ProductionOperationDefinition[];
  assetTypes?: import('./asset-types.js').AssetTypeDefinition[];
  conditions?: { key: string; fields: FieldSpec[] }[]; components?: ComponentDefinition[];
  pages?: Omit<PageContribution, 'render'>[]; runtimeConfigVersion?: number;
  messages?: Record<string, Record<string, string>>;
  convertRuntimeConfig?(from: number, to: number, config: Json): Result<Json> };
export type NativePlatformContext = { pluginId: string; target: Target; arch: 'x64' | 'arm64'; config: Json; domain: Domain;
  projectPlatform: import('@galcraft/contracts').Project['platform'];
  runtime: { releaseDirectory: string; executable: string } };
export interface NativePlatformProvider { invoke(action: string, args: Json): Promise<Result<Json>>; dispose?(): void | Promise<void> }
export type StateContribution = {
  key: string; progressSchema: Json; longTermSchema: Json;
  initialProgress(config: Json): Json; initialLongTerm(config: Json): Json;
  debugFields: FieldSpec[];
  validate(state: Json, domain: 'progress' | 'longTerm'): Result<Json>;
  convert(from: number, to: number, state: Json): Result<Json>;
  mergeLongTerm(local: Json, incoming: Json): Result<Json>;
  checkpoint(state: Json): Result<Json>;
};
export type PageContribution = {
  key: string; titleKey: string; componentKey: string; inputSchema: Json; resultSchema: Json;
  configFields: FieldSpec[]; publicParts: string[]; sampleInput: Json;
  wait?: { restorable: boolean; cancel: 'keepWaiting' | 'continue'; checkpointReason?: string };
  render(context: { input: Json; progress: Json; longTerm: Json; finish(result: Json): void;
    signal?: AbortSignal; onDispose?(release: () => void): void }): unknown;
};
export type ResourceProvider = {
  key: string; extensions: string[];
  kind?: import('@galcraft/contracts').AssetKind;
  inspect(rootFile: RelativePath, files: RelativePath[], source?: import('./services.js').PluginResourceSource): Promise<Result<{
    files: RelativePath[]; capabilities: ResourceCapabilities; metadata: Json;
    typeData?: import('@galcraft/contracts').AssetTypeData;
  }>>;
};
export type VoicePCM = { sourceId: Id; samples: Float32Array; sampleRate: 48000 };
export interface StageInstance {
  update(deltaMs: number, voiceLevel: number, pcm?: VoicePCM | null): void;
  set(command: Json): Result<void>;
  capture(): Result<Json>;
  pause(paused: boolean): void;
  renderSurface(): HTMLCanvasElement;
  dispose(): void;
}
export type StageProvider = { key: string; resourceProviderKey?: string; resourceProviderAliases?: string[]; create(resource: ResolvedAsset, initial: Json): Promise<Result<StageInstance>> };
export type PlatformContribution = {
  key: string; targets: Target[]; actions: { name: string; fields: FieldSpec[] }[];
  invoke(action: string, args: Json, domain: Domain): Promise<Result<Json>>;
  required?: boolean;
  fallback?(action: string, args: Json, domain: Domain): Promise<Result<Json>>;
};
export type ComponentRenderContext = { props: Json; input: Json; progress: Json; longTerm: Json;
  actions: { invoke(action: string, args: Json): Promise<Result<Json>> };
  signal?: AbortSignal; onDispose?(release: () => void): void };
export type ComponentContribution = { key: string; componentKey: string; publicParts: string[];
  propsSchema?: Json; fields?: FieldSpec[]; sampleProps?: Json;
  stateBindings?: { property: string; domain: 'progress' | 'longTerm'; path: string }[];
  render?(context: ComponentRenderContext): unknown;
};
export type ComponentDefinition = Omit<ComponentContribution, 'render'>;
export type Contributions = {
  commands: PluginCommand[]; conditions: PluginCondition[]; documents: DocumentContribution[];
  tools: ToolContribution[]; resources: ResourceProvider[]; stages: StageProvider[];
  pages: PageContribution[]; components: ComponentContribution[]; systems: StateContribution[];
  platform: PlatformContribution[];
  generationProviders?: GenerationProviderContribution[];
  textPreparations?: import('./services.js').TextPreparationContribution[];
  resourceProcessors?: ResourceProcessorContribution[];
  fieldEditors?: FieldEditorContribution[];
  publishChecks?: PublishCheckContribution[];
  targetBuilders?: import('./target-builder.js').TargetBuilderContribution[];
  assetTypes?: import('./asset-types.js').AssetTypeDefinition[];
  productionOperations?: import('@galcraft/contracts').ProductionOperationDefinition[];
  assetEditors?: import('./asset-ui.js').AssetEditorContribution[];
  assetPreviews?: import('./asset-ui.js').AssetPreviewContribution[];
  assetThumbnails?: import('./asset-ui.js').AssetThumbnailContribution[];
};

export type PackageSource = { kind: 'archive'; path: string } | { kind: 'directory'; path: string };
export type PackageInspection = { manifest: PluginManifest; issues: Issue[]; installedVersion: Version | null; compatible: boolean };
export type { PluginChange } from '@galcraft/contracts';
export type PluginChangePlan = { planId: Id; expected: { ref: Ref; revision: number }[]; changes: PluginChange[]; targetLock: Lock; preparedDirectory: string };
export type PreparedPluginRestore = {
  id: Id; key: RestoreKey; progress: RuntimeState['plugins'];
  conversions: { provider: string; from: string; to: string }[];
};
export interface PluginService {
  inspectPackage(input: PackageSource): Promise<Result<PackageInspection>>;
  install(input: PackageSource): Promise<Result<{ id: string; version: Version; directory: string }>>;
  prepareContributions(lock: Lock, target: Target): Promise<Result<Contributions>>;
  preparePluginRestore(input: {
    key: RestoreKey; progress: RuntimeState['plugins']; longTerm: LongTerm['plugins']; targetLock: Lock;
  }): Result<PreparedPluginRestore>;
  releasePluginRestore(id: Id): void;
  planChange(input: { projectId: Id; pluginId: string; version: Version | null; expected: { ref: Ref; revision: number }[] }): Promise<Result<PluginChangePlan>>;
  loadDevelopment(input: { directory: string; projectId: Id }): Promise<Result<PackageInspection>>;
  reload(input: { pluginId: string; projectId: Id }): Promise<Result<Contributions>>;
  releaseContributions(contributions: Contributions): Promise<void>;
  acquireServices?(input: { pluginId: string; version: Version; target: Target }): Promise<Result<PluginServiceLease>>;
  packPlugin(input: { directory: string; outputDirectory: string }): Promise<Result<{ path: string; manifest: PluginManifest; issues: Issue[] }>>;
}
export type PluginServiceLease = { pluginId: string; version: Version; contributions: Contributions; release(): Promise<void> };
