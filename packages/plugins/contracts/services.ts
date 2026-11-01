import type { Artifact, AssetKind, CancelResult, CapabilityReport, ConnectionConfig, Id, Json, Purpose,
  RemoteRef, RemoteStatus, Result, ServiceEvent, Version, RelativePath, ResourceCapabilities } from '@galcraft/contracts';

export type { MediaInput as PluginMediaInput, GenerationInput as PluginGenerationInput, SubmissionContext as PluginSubmissionContext, GenerationAdapter as PluginGenerationAdapter } from '@galcraft/contracts';
import type { GenerationAdapter as PluginGenerationAdapter } from '@galcraft/contracts';
export type GenerationProviderCapabilities = { query: boolean; refetch: boolean; cancelPerTask: boolean; resume: boolean };
export type GenerationProviderContribution = { key: string; version: Version; purposes: Purpose[];
  configFields: import('@galcraft/contracts').FieldSpec[]; inputSchema: Json; outputSchema: Json;
  capabilities: GenerationProviderCapabilities;
  protocols?: ConnectionConfig['protocol'][]; execution?: 'local' | 'remote';
  checkWorkflow?(config: ConnectionConfig, workflow: import('@galcraft/contracts').WorkflowBinding): Promise<Result<void>>;
  create(config: ConnectionConfig, frozenRuntime?: Json): PluginGenerationAdapter | Promise<PluginGenerationAdapter>;
};
export type PluginResourceSource = { rootFile: RelativePath; files: RelativePath[]; metadata: Json;
  readBytes(path: RelativePath): Promise<Uint8Array>; readText(path: RelativePath): Promise<string> };
export type ResourceProcessorContribution = { key: string; version: Version; inputKinds: AssetKind[]; outputKinds: AssetKind[];
  supportsCancel: boolean; fields: import('@galcraft/contracts').FieldSpec[];
  process(input: { source: PluginResourceSource; settings: Json; outputDirectory: string }, signal: AbortSignal): Promise<Result<{
    rootFile: RelativePath; files: { path: RelativePath; bytes: number; mime: string }[]; metadata: Json;
    capabilities?: ResourceCapabilities; kind?: AssetKind;
    derivedFrom?: { assetId: Id; variantId: Id };
  }>>;
};

export type TextPreparationContribution = {
  key: string; version: Version;
  validateInput?(input:import('@galcraft/contracts').GenerationInput):Promise<Result<void>>;
  transferOperation?: import('@galcraft/contracts').ProductionOperationDefinition['id'];
  prepare(input: import('@galcraft/contracts').GenerationInput): Extract<import('@galcraft/contracts').GenerationInput, {purpose:'text'}>;
  process(raw: string, input: import('@galcraft/contracts').GenerationInput, context: import('@galcraft/contracts').SubmissionContext): Promise<Artifact[]>;
  transfer?(result: Json, fields: Record<string, Json>, source:{candidateId:Id;taskId:Id;itemId:Id}): Result<Record<string, Json>>;
};
