import type { CommandSpec, Id, Issue, Result, RuntimeState, Snapshot, Source, Variable, VersionRef } from '@galcraft/contracts';
import { createCommandRegistry } from './catalog.js';
import { compileAsync } from './compiler.js';
import type { CompileInput, CompileResult } from './compiler.js';
import { explainField, locate, patchFields } from './editing.js';
import type { FieldPatchInput } from './editing.js';
import { parse } from './parser.js';
import type { ParseInput, ParseResult } from './parser.js';
import { SemanticIndex } from './semantic.js';
import type { SemanticDocument, SemanticQuery, SemanticPage } from './semantic.js';

export type CompilationState = CompileResult & { lastValid: Snapshot | null; current: boolean };
function stale<T>(): Result<T> {
  const error: Issue = { code: 'QUERY_STALE', severity: 'error', message: 'The document revision changed', owner: 'M03', related: [], actions: ['retry'] };
  return { ok: false, error, issues: [error] };
}
export class LanguageService {
  private parsed = new Map<Id, ParseResult>();
  private generation = 0;
  private activeProjectId: Id | null = null;
  private lastSnapshot: Snapshot | null = null;
  private semantic: SemanticIndex | null = null;
  parse(input: ParseInput): ParseResult {
    const result = parse(input);
    const prior = this.parsed.get(input.documentId);
    if (!prior || input.revision >= prior.revision) this.parsed.set(input.documentId, result);
    return result;
  }
  async compile(input: CompileInput): Promise<CompilationState> {
    const generation = ++this.generation;
    if (this.activeProjectId !== input.projectId) {
      this.activeProjectId = input.projectId;
      this.parsed.clear();
      this.semantic = null;
      this.lastSnapshot = null;
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (generation !== this.generation || input.signal?.aborted) return { snapshot: null, issues: [], parses: [], symbols: { statements: {}, labels: {}, objects: {}, variables: [], assets: [] }, lastValid: this.activeProjectId === input.projectId ? this.lastSnapshot : null, current: false };
    const result = await compileAsync(input);
    const current = generation === this.generation && !input.signal?.aborted && input.documents.every(item => !this.parsed.has(item.documentId) || this.parsed.get(item.documentId)!.revision <= item.revision);
    if (!current) return { ...result, snapshot: null, lastValid: this.activeProjectId === input.projectId ? this.lastSnapshot : null, current: false };
    for (const parsed of result.parses) this.parsed.set(parsed.documentId, parsed);
    const sceneDocuments = input.documents.filter(item => item.kind === 'scene');
    const sceneOrder = input.project.chapters.flatMap(chapter => chapter.sceneIds);
    const semanticDocs: SemanticDocument[] = result.parses.map((parsed, index) => ({ parsed, sceneId: sceneDocuments[index]?.sceneId ?? null, order: sceneOrder.indexOf(sceneDocuments[index]?.sceneId ?? ''), name: input.scenes.find(item => item.id === sceneDocuments[index]?.sceneId)?.name ?? '' }));
    let registry;
    try { registry = createCommandRegistry(input.engineVersion, input.pluginCommands); }
    catch { registry = createCommandRegistry(input.engineVersion); }
    this.semantic = new SemanticIndex(input.projectId, semanticDocs, [...input.variables, ...input.scenes.flatMap(scene => scene.locals)], structuredClone(input.lock),
      [...input.documents.filter(item => item.kind !== 'scene').map(item => ({ ref: { kind: 'document' as const, id: item.documentId }, revision: item.revision })), ...(input.entityVersions ?? [])],
      result.issues, input.assetReferences, registry);
    if (result.snapshot) this.lastSnapshot = result.snapshot;
    return { ...result, lastValid: this.lastSnapshot, current: true };
  }
  patchFields(input: FieldPatchInput) { const parsed = this.parsed.get(input.documentId); return parsed ? patchFields(parsed, input) : stale(); }
  locate(source: Source, fieldPath: string | null = null) {
    if (source.statementId) for (const parsed of this.parsed.values()) if (parsed.cst.some(node => node.id === source.statementId)) return locate(parsed, source, fieldPath);
    const parsed = this.parsed.get(source.documentId);
    return parsed ? locate(parsed, source, fieldPath) : null;
  }
  explainField(source: Source, fieldPath: string, engineVersion: string, plugins: CommandSpec[], previewState: RuntimeState | null) {
    const parsed = this.parsed.get(source.documentId); return parsed ? explainField(parsed, source, fieldPath, createCommandRegistry(engineVersion, plugins), previewState) : stale();
  }
  querySemantic(input: SemanticQuery): Result<SemanticPage> { return this.semantic?.query(input) ?? stale(); }
  lastValidSnapshot(): Snapshot | null { return this.lastSnapshot; }
}
