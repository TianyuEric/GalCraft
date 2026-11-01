import { z } from 'zod';
import type { DocumentView, EditInput, EditPlan, EditReceipt, Id, Json, Result, Target, Source, VersionRef, Ref,
  Asset, AssetQuery, CancelResult } from '@galcraft/contracts';
export type { PluginDocumentInstance } from '@galcraft/contracts';

export const StudioSlotSchema = z.enum(['extensions.navigation', 'project.overview', 'creation.tools', 'assets.tools',
  'player-ui.tools', 'production.tools', 'publish.checks', 'plugins.configuration']);
export type StudioSlot = z.infer<typeof StudioSlotSchema>;
export const StudioContributionDeclarationSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+\/[A-Za-z_][A-Za-z0-9_-]*$/),
  kind: z.enum(['workbench', 'panel', 'form', 'dialog']), slot: StudioSlotSchema,
}).refine(value => (value.kind === 'workbench') === (value.slot === 'extensions.navigation'),
  '独立工作台使用 extensions.navigation，嵌入内容使用具名页面槽');
export type StudioContributionDeclaration = z.infer<typeof StudioContributionDeclarationSchema>;
export type StudioTitle = { 'zh-CN': string; en: string; ja: string };
export type StudioScope = { page: string; sceneId: Id | null; documentId: Id | null; statementIds: Id[];
  textRange: { start: number; end: number } | null; assetIds: Id[];
  insertion: { documentId: Id; offset: number } | null; versions: VersionRef[] };
export type StudioCorePage = 'overview' | 'creation' | 'assets' | 'player-ui' | 'production' | 'collaboration' | 'publish' | 'plugins';
export interface StudioPluginContext {
  soundbanks?: import('@galcraft/contracts').SoundBankPort;
  runtimeDependencies?: { resolve(key: string): Promise<Result<{ url: string; expected: Json; release(): void }>>;
    load?(key: string): Promise<Result<{ module: Record<string, unknown>; url: string; expected: Json; release(): void }>> };
  readonly pluginId: string;
  readonly projectId: Id;
  readonly target: Target;
  documents: { list(): Promise<Result<DocumentView[]>>; apply(input: EditInput): Promise<Result<EditReceipt>>;
    read?(documentId: Id): Promise<Result<DocumentView>>;
    listPlugin?(contributionKey?: string): Promise<Result<import('@galcraft/contracts').PluginDocumentInstance[]>>;
    readPlugin?(documentId: Id): Promise<Result<import('@galcraft/contracts').PluginDocumentInstance>>;
    create?(input: { contributionKey: string; data: Json }): Promise<Result<EditReceipt>>;
    copy?(documentId: Id): Promise<Result<EditReceipt>>;
    remove?(documentId: Id): Promise<Result<EditReceipt>>;
    prepare?(input: EditInput): Promise<Result<EditPlan>>;
    applyPlan?(planId: Id): Promise<Result<EditReceipt>> };
  scope?: { read(): StudioScope; subscribe(listener: (scope: StudioScope) => void): () => void };
  navigation?: { openCore(page: StudioCorePage): Promise<Result<void>>; locate(source: Source): Promise<Result<void>> };
  semantic?: { query(input: { refs?: Ref[]; sceneId?: Id; statementIds?: Id[] }): Promise<Result<Json>>;
    prepare(input: Json): Promise<Result<EditInput>> };
  assets?: { query(input: AssetQuery): Promise<Result<Asset[]>>; read(assetId: Id): Promise<Result<Asset>>;
    inspect?(assetId: Id): Promise<Result<Asset | null>>;
    resolve(ref: Ref): Promise<Result<{ url: string; release(): void }>>;
    import(input: { paths: string[] }, signal?: AbortSignal): Promise<Result<Json>>;
    process?(input: Json, signal?: AbortSignal): Promise<Result<Json>> };
  production?: { prepareOperation?(input: {sourceVersions?:VersionRef[];name?:string;operation:string;connectionId:string;model?:string;workflowId?:string;usage?:string;fields:Record<string,Json>;target?:Record<string,Json>}):Promise<Result<Json>>;
    applyAdoption?(input:{planId:Id;expected:VersionRef[]}):Promise<Result<EditReceipt>>;
    connections(): Promise<Result<Json>>; prepare(input: Json): Promise<Result<Json>>;
    submit(planId: Id): Promise<Result<Json>>; tasks(): Promise<Result<Json>>; candidate(candidateId: Id): Promise<Result<Json>>;
    cancel(taskId: Id): Promise<Result<CancelResult>>; resume(taskId: Id): Promise<Result<Json>>;
    queryRemote?(input: { taskId: Id; itemId: Id }): Promise<Result<Json>>;
    refetch?(input: { taskId: Id; itemId: Id }): Promise<Result<Json>>;
    prepareAdoption(input: Json): Promise<Result<EditPlan>> };
  playerUi?: { catalog(): Promise<Result<Json>>; prepare(input: Json): Promise<Result<EditInput>>; preview(input: Json): Promise<Result<Json>> };
  results?: { show(result: import('./sdk.js').PluginToolResult): Promise<Result<void>> };
  signal?: AbortSignal;
  onDispose?(release: () => void | Promise<void>): void;
  open(key: string, input?: Json): Promise<Result<void>>;
}
export type StudioContribution = {
  key: string; title: StudioTitle;
  mount(root: HTMLElement, context: StudioPluginContext & { locale: string; input: Json; close(): void }): void | (() => void);
};
export interface StudioPlugin {
  activateStudio(context: StudioPluginContext): Promise<StudioContribution[]>;
  deactivate(): Promise<void>;
}
