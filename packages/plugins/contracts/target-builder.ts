import type { BuildInput, BuildPlanSummary, Issue, Json, Project, RelativePath, Result, Target, Version } from '@galcraft/contracts';

export type TargetTool = { id: string; version: string; purpose: string; licenseUrl: string; external: true };
export type TargetBuilderProgress = { phase: 'detecting' | 'downloading' | 'installing' | 'building' | 'completed' | 'cancelled';
  message: string; completed: number; total: number | null };
export type TargetToolchain = { directory: string; javaHome?: string; sdkRoot?: string; cacheDirectory?: string; space?: { toolsBytes: number; cacheBytes: number } };
export type TargetPreparationInput = { directory: string; javaHome?: string; sdkRoot?: string; acceptLicenses: boolean };
export type TargetBuilderDescription = { key: string; version: Version; name: string; target: Target;
  architectures: string[]; environments: { os: 'win32' | 'darwin' | 'linux'; arch: 'x64' | 'arm64'; outputs: string[] }[];
  tools: TargetTool[]; optionsSchema: Json; entry: string; outputs?:{key:string;requiresTools:boolean;signingModes:string[];defaultSigningMode:string|null}[];
  availability: { available: boolean; issues: Issue[] }; toolchain?: TargetToolchain };
export type TargetBuildOutput = { entry: RelativePath; handoff: { path: RelativePath; kind: 'directory' | 'archive' | 'file' };
  artifacts: { path: RelativePath; kind: 'apk' | 'aab' | 'androidProject' | 'xcodeProject' | 'archive'; bytes: number }[];signing?:import('@galcraft/contracts').TargetSigning };
/** Service contribution: the host owns staging and final commit; the builder writes only inside stagingDirectory. */
export type TargetBuilderContribution = { key: string; version: Version; target: Target;
  describe(): Promise<TargetBuilderDescription>;
  detect(input: Omit<TargetPreparationInput, 'acceptLicenses'>): Promise<Result<TargetToolchain>>;
  prepare(input: TargetPreparationInput, context: { signal: AbortSignal; progress(event: TargetBuilderProgress): void }): Promise<Result<TargetToolchain>>;
  validate(options: Json, input: BuildInput): Promise<Issue[]>;
  build(input: { plan: BuildPlanSummary; project: Project; stagingDirectory: string; webEntry: RelativePath; options: Json },
    context: { signal: AbortSignal; progress(event: TargetBuilderProgress): void }): Promise<Result<TargetBuildOutput>>;
};
