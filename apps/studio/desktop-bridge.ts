import type {
  ConnectionConfig,
  EditPlan,
  EditReceipt,
  Result,
  StudioBridge,
  VersionRef,
  CapabilityReport,
} from "@galcraft/contracts";
import type {
  Candidate,
  ProductionFormDraft,
  Task,
  TaskPlan,
  WorkflowBinding,
  UIAuthoringPlan,
  UIPlanProposal,
  UIProductionService,
  ProductionService,
} from "@galcraft/authoring/production";
import type {
  CreationRecipe,
  RecipeLibrary,
} from "@galcraft/authoring/recipes";
import type { UIComposition, PreviewStyleMatch, StyleMatchRequest } from "@galcraft/templates";
import type { PluginManifest, PluginChangePlan } from "@galcraft/plugins";

export type Overview = {
  migrationIssues?: string[];
  tasks: Task[];
  taskSummaries?: import('@galcraft/authoring/production').TaskSummary[];
  imageCandidates?: Pick<Candidate, 'id' | 'taskId' | 'artifacts' | 'provenance'>[];
  drafts: ProductionFormDraft[];
  candidates: {
    candidate: Candidate;
    adoption: "unadopted" | "adopted" | "saved";
  }[];
  canvas: { width: number; height: number };
  characters: { id: string; name: string; voicePresets?: import('@galcraft/contracts').Character['voicePresets'] }[];
  pages: { documentId?: string; revision?: number; id: string; key: string; labels?: Record<string, string> }[];
  scenes: {
    id: string;
    documentId?: string; revision?: number;
    name: string;
    statements: { id: string; command: string; label: string; characterId?: string | null; silent?: boolean }[];
  }[];
  assets: import("@galcraft/contracts").Asset[];
  recipes: CreationRecipe[];
  connections: ConnectionConfig[];
  workflows: WorkflowBinding[];
  workflowDrafts?: import('@galcraft/authoring/production').WorkflowConfigurationDraft[];
  operations?: import('@galcraft/contracts').ProductionOperationSnapshot[];
  versions: VersionRef[];
  projectVersion?: VersionRef;
  assetsVersion?: VersionRef;
  imageRoutes?: import('@galcraft/authoring/production').ImageGenerationRoutes;
  defaults?: { connections: Partial<Record<import('@galcraft/contracts').Purpose, string>>; recipes: Record<string, string> };
  providers?: { key: string; packageVersion: string; purposes: import('@galcraft/contracts').Purpose[]; configFields: import('@galcraft/contracts').FieldSpec[]; capabilities: { query: boolean; refetch: boolean; cancelPerTask: boolean; resume: boolean } }[];
};
type Call<I, O> = (input: I) => Promise<Result<O>>;
export type ProductionBridge = {
  waitForTask: Call<{ taskId: string; timeoutMs?: number }, { task: Task; reason: 'terminal' | 'attention' | 'timeout' }>;
  inspectTaskResources: Call<{ taskId: string; itemId: string }, import('@galcraft/contracts').ResourceSnapshot>;
  releaseTaskResources: Call<{ taskId: string; itemId: string }, import('@galcraft/contracts').ResourceReleaseReceipt>;
  planOperation: Call<{sourceVersions?:import('@galcraft/contracts').VersionRef[];name?:string;operation:string;connectionId:string;model?:string;workflowId?:string;usage?:string;fields:Record<string,import('@galcraft/contracts').Json>;target?:Record<string,import('@galcraft/contracts').Json>}, TaskPlan>;
  authorizeStage: Call<{taskId:string;itemId:string},Task>;
  reprocess: Call<{taskId:string;itemId:string;text?:string;candidateId?:string},Task>;
  saveDefaults: Call<NonNullable<Overview['defaults']>, NonNullable<Overview['defaults']>>;
  removeConnection: Call<string, void>;
  deleteRecipe: RecipeLibrary['deleteRecipe'];
  planContinuation: Call<{ taskId: string; candidateId: string; instruction: string; mode: 'write' | 'performance' | 'discuss'; summary?: string }, TaskPlan & { continuationTaskId: string }>;
  submitContinuation: Call<{ taskId: string; planId: string }, Task>;
  readOutline(): Promise<Result<{ documentId: string | null; revision: number | null; outline: import('@galcraft/contracts').AuthoringOutline }>>;
  saveOutline: Call<{ outline: import('@galcraft/contracts').AuthoringOutline; expectedRevision: number | null }, EditReceipt>;
  saveImageRoutes: Call<import('@galcraft/authoring/production').ImageGenerationRoutes, import('@galcraft/authoring/production').ImageGenerationRoutes>;
  previewScript: Call<string, import('@galcraft/contracts').Snapshot>;
  assetReferences: Call<
    string,
    (import("@galcraft/assets").UIReplacementRef & { label: string })[]
  >;
  mediaInput: Call<
    { assetId: string; variantId?: string },
    import("@galcraft/authoring/production").MediaInput
  >;
  attachment: Call<
    string,
    import("@galcraft/authoring/production").TextAttachment
  >;
  context: Call<
    { sceneId: string | null; pageIds: string[]; componentIds: string[]; statementId?: string | null; characterId?: string | null; statementIds?: string[]; textRange?: { start: number; end: number } | null; usage?: ProductionFormDraft['activeUse']; performance?: boolean },
    import("@galcraft/authoring/production").ContextPart[]
  >;
  previewComposition: Call<
    {
      id: string;
      revision: number;
      keys: string[];
      substitutions?: Record<string, string>;
      previewId?: string;
      matches?: PreviewStyleMatch[];
    },
    {
      template: import("@galcraft/contracts").RuntimeTemplate;
      styles: Record<string, string>;
      previewAssets: import("@galcraft/contracts").ResolvedAsset[];
      locations: {
        assetId: string;
        variantId: string;
        uri: string;
        mime: string;
        bytes: number;
      }[];
      propertyOwners: UIComposition["propertyOwners"];
      unresolvedStyleMatches: StyleMatchRequest[];
      previewId: string;
    }
  >;
  overview(input?: { taskId: string | null }): Promise<Result<Overview>>;
  discardDraft: Call<string, void>;
  removeTaskRecord: Call<string, void>;
  saveDraft: Call<
    { draft: ProductionFormDraft; expectedRevision: number | null },
    ProductionFormDraft
  >;
  plan: Call<{ draftId: string; name: string } | import('@galcraft/authoring/production').TaskPlanInput, TaskPlan>;
  submit: Call<string, Task>;
  resume: Call<string, Task>;
  retry: Call<
    { taskId: string; itemId: string; confirmNewRequest: boolean },
    TaskPlan
  >;
  cancel: ProductionService["cancel"];
  select: Call<
    Parameters<ProductionService["selectCandidates"]>[0] & {
      adoptions?: Record<
        string,
        {
          mode: "library" | "bind" | "voicePreset";
          voicePreset?: { characterId: string; locale: string; referenceLocale: string; transcript: string; connectionId: string; model: string };
          name?: string;
          placement?: 'new' | 'replace';
          use?: 'figure' | 'illustration';
          frame?: {
            fit: "cover" | "contain" | "native";
            positionX: number;
            positionY: number;
          };
        }
      >;
    },
    Awaited<ReturnType<ProductionService["selectCandidates"]>> extends Result<
      infer T
    >
      ? T
      : never
  >;
  discardAdoption: Call<string, void>;
  apply: Call<{ planId: string; expected: VersionRef[] }, EditReceipt>;
  keepResults: Call<
    { taskId: string; itemId: string; versions: VersionRef[] },
    void
  >;
  candidateContent: Call<
    string,
    { text: string; media: { uri: string; mime: string }[] }
  >;
  editCandidate: Call<{ id: string; text: string }, Candidate>;
  transferPrompt: ProductionService["applyPromptTransfer"];
  saveRecipe: RecipeLibrary["saveRecipe"];
  copyRecipe: RecipeLibrary["copyRecipe"];
  exportRecipes: RecipeLibrary["exportRecipes"];
  planRecipeImport: RecipeLibrary["planRecipeImport"];
  applyRecipeImport: Call<string, CreationRecipe[]>;
  saveWorkflow: Call<
    { workflow: WorkflowBinding; expectedRevision: number | null },
    WorkflowBinding
  >;
  listWorkflowDrafts(): Promise<Result<import('@galcraft/authoring/production').WorkflowConfigurationDraft[]>>;
  discoverWorkflowOutputs: Call<{ connectionId: string; workflow: WorkflowBinding; historyTaskId?: string }, import('@galcraft/contracts').WorkflowOutputCandidate[]>;
  saveWorkflowDraft: Call<{ draft: import('@galcraft/authoring/production').WorkflowConfigurationDraft; expectedRevision: number | null }, import('@galcraft/authoring/production').WorkflowConfigurationDraft>;
  prepareUIPlan: Call<
    {
      candidateId: string;
      proposal: UIPlanProposal;
      expected: VersionRef[];
      scope: UIAuthoringPlan["scope"];
      selectedAssets: string[];
      draft: ProductionFormDraft;
    },
    UIAuthoringPlan
  >;
  confirmUIPlan: UIProductionService["confirmUIPlan"];
  saveComposition: Call<
    Omit<
      UIComposition,
      "id" | "revision" | "propertyOwners" | "issues" | "baseVersions"
    > & { id?: string; revision?: number },
    UIComposition
  >;
  prepareUIAdoption: UIProductionService["prepareUIAdoption"];
};
import type { BuildReceipt } from '@galcraft/contracts';
export type { BuildReceipt } from '@galcraft/contracts';
export type WorkbenchBridge = StudioBridge & {
  collaboration: import('@galcraft/collaboration/contracts').CollaborationBridge;
  production: ProductionBridge;
  plugins: StudioBridge["plugins"] & {
    list(): Promise<
      Result<{
        entries: { manifest: PluginManifest; development: boolean; studioService?: boolean }[];
        lock: import("@galcraft/contracts").Lock | null;
      }>
    >;
    planChange: Call<
      { pluginId: string; version: string | null },
      { change: PluginChangePlan; edit: EditPlan }
    >;
  };
  upgrades: {
    list(): Promise<Result<{ version: string; targets: string[]; conversions: { from: string; to: string; entry: string }[] }[]>>;
    history(): Promise<Result<{ id: string; from: string; to: string; originalCopy: string; state: string }[]>>;
    plan: Call<import('@galcraft/contracts').UpgradeInput, import('@galcraft/contracts').UpgradePlan>;
    commit: Call<string, unknown>;
    restore: Call<string, unknown>;
    cancel: Call<string, import('@galcraft/contracts').CancelResult>;
  };
  builds: {
    targets(): Promise<Result<{ builder: NonNullable<import('@galcraft/contracts').BuildInput['targetBuilder']>; description: import('@galcraft/plugins/contracts').TargetBuilderDescription }[]>>;
    detectToolchain: Call<{ builder: NonNullable<import('@galcraft/contracts').BuildInput['targetBuilder']>; input: Omit<import('@galcraft/plugins/contracts').TargetPreparationInput, 'acceptLicenses'> }, import('@galcraft/plugins/contracts').TargetToolchain>;
    prepareToolchain: Call<{ builder: NonNullable<import('@galcraft/contracts').BuildInput['targetBuilder']>; input: import('@galcraft/plugins/contracts').TargetPreparationInput; operationId: string }, import('@galcraft/plugins/contracts').TargetToolchain>;
    cancelToolchain: Call<string, { cancelled: boolean }>;
    subscribeToolchainProgress?(listener: (event: import('@galcraft/plugins/contracts').TargetBuilderProgress & { operationId: string }) => void): () => void;
    status(): Promise<Result<{ ready: boolean }>>;
    signingCertificates(): Promise<Result<{ thumbprint: string; subject: string; expiresAt: string; validFrom?:string;authorUsable?:boolean;blockedReason?:string|null }[]>>;
    planBuild: Call<
      unknown,
      { planId: string; issues: import("@galcraft/contracts").Issue[] }
    >;
    build: Call<string, BuildReceipt>;
    cancel: Call<string, unknown>;
    test: Call<string, BuildReceipt>;
    instructions: Call<string, unknown>;
    chooseOldSaves(): Promise<Result<string[]>>;
    compatibility: Call<string, import('@galcraft/contracts').CompatibilityReport | null>;
  };
};

export type DesktopBridge = WorkbenchBridge & {
  onCollaborationChanged?(listener:()=>void):()=>void;
  onCollaborationNavigate?(listener:(input:{page:string;taskId?:string;documentId?:string;candidateId?:string;sessionId?:string;projectChanged?:boolean})=>void):()=>void;
  soundbanks: import('@galcraft/contracts').SoundBankPort;
  production: ProductionBridge & {
  planTask: Call<Omit<Parameters<ProductionService['planTask']>[0], 'projectId'>, TaskPlan>;
  tasks(): Promise<Result<Task[]>>;
  candidate: Call<string | { candidateId: string }, Candidate | null>;
  connections(): Promise<Result<ConnectionConfig[]>>;
  providers(): Promise<Result<NonNullable<Overview['providers']>>>;
  connectionCapabilities: Call<{ connectionId: string; purpose: import('@galcraft/contracts').Purpose }, CapabilityReport | import('@galcraft/authoring/production').GenerationProviderSnapshot>;
  queryRemote: Call<{ taskId: string; itemId: string }, import("@galcraft/contracts").RemoteStatus>;
  refetch: Call<{ taskId: string; itemId: string }, Task>;
  };
  builds: WorkbenchBridge["builds"] & { receipt: Call<string, BuildReceipt | null> };
  connections: StudioBridge['connections'] & { list(): Promise<Result<ConnectionConfig[]>> };
};
export type StudioIpc = import('@galcraft/contracts').IpcMethods<DesktopBridge>;

