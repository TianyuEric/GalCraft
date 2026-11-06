import type { EditInput, Id, Issue, Ref, Result, SemanticPage, SemanticQuery, Source, SourceLocation, StudioBridge, VersionRef } from '@galcraft/contracts';
import type { CompilationState, CompileInput, FieldPatchInput, ParsedStatement } from '@galcraft/dsl';

export type PluginCompilerQuery = Parameters<NonNullable<StudioBridge['language']['pluginQuery']>>[0];
export type PluginCompilerEdit = FieldPatchInput & { label?: string };

export type CompilerRequest = { compileInput: Omit<CompileInput, 'signal'>; compiler?: string | null } & (
  | { kind: 'compile' }
  | { kind: 'query'; query: SemanticQuery }
  | { kind: 'pluginQuery'; query: PluginCompilerQuery }
  | { kind: 'pluginPrepare'; edit: PluginCompilerEdit }
  | { kind: 'locate'; source: Source; fieldPath: string | null }
);

type PluginCompilerQueryResult = {
  documents: { documentId: Id; revision: number; sceneId: Id | null; statements: ParsedStatement[]; issues: Issue[] }[];
  matches: (SemanticPage & { ref: Ref })[];
  issues: Issue[];
  versions: VersionRef[];
};

export type CompilerReplies = {
  compile: CompilationState;
  query: Result<SemanticPage>;
  pluginQuery: Result<PluginCompilerQueryResult>;
  pluginPrepare: Result<EditInput>;
  locate: Result<SourceLocation | null>;
};
