import { DialogueContentSchema, dialoguePlainText } from '@galcraft/contracts';
import type { AssetReference, CommandSpec, FieldSpec, Id, Issue, Lock, Ref, Result, SemanticHit, SemanticPage, SemanticQuery, Source, Variable, VersionRef } from '@galcraft/contracts';
import { createCommandRegistry } from './catalog.js';
import { parseExpression, variableReads } from './expression.js';
import { dialogueInterpolations } from './interpolation.js';
import { fieldAt } from './parser.js';
import type { ParseResult, StatementNode, ValueNode } from './parser.js';

export type { SemanticQuery, SemanticHit, SemanticPage } from '@galcraft/contracts';
export type SemanticDocument = { sceneId: Id | null; parsed: ParseResult; order: number; name: string };
type Fact = SemanticHit & { scope?: string; declaringSceneId?: Id | null };
const prose = (value: unknown) => dialoguePlainText(DialogueContentSchema.safeParse(value).data ?? '');
const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => equal(item, right[index]));
  if (!asRecord(left) || !asRecord(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
}
const source = (parsed: ParseResult, node: StatementNode, path: string): Source => {
  const field = node.object ? fieldAt(node.object, path.split('.')) : undefined;
  return { documentId: parsed.documentId, revision: parsed.revision, ...(node.id ? { statementId: node.id } : {}), field: path,
    range: { start: field?.valueNode.start ?? node.start, end: field?.valueNode.end ?? node.end } };
};
const clip = (text: string): string => {
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
  return graphemes.length > 80 ? graphemes.slice(0, 80).map(item => item.segment).join('') + '…' : text;
};
function fail<T>(code: string, message: string): Result<T> {
  const error: Issue = { code, severity: 'error', message, owner: 'M03', related: [], actions: ['retry'] };
  return { ok: false, error, issues: [error] };
}
export class SemanticIndex {
  readonly facts: Fact[] = [];
  readonly coverage: SemanticPage['coverage'] = [];
  readonly versions: VersionRef[];
  constructor(readonly projectId: Id, readonly documents: SemanticDocument[], readonly variables: Variable[], readonly lock: Lock, extraVersions: VersionRef[] = [], issues: Issue[] = [], assetReferences?: AssetReference[], readonly registry: ReadonlyMap<string, CommandSpec> = createCommandRegistry(lock.engine.version)) {
    this.versions = [...documents.map(item => ({ ref: { kind: 'document' as const, id: item.parsed.documentId }, revision: item.parsed.revision })), ...extraVersions];
    for (const document of documents) this.indexDocument(document);
    for (const coverage of this.coverage) {
      const related = issues.filter(issue => issue.source?.documentId === coverage.documentId);
      if (related.length) { coverage.issues.push(...related); if (related.some(issue => issue.severity === 'error')) coverage.state = 'partial'; }
    }
    for (const version of extraVersions) if (version.ref.kind === 'document' && !this.coverage.some(item => item.documentId === version.ref.id)) this.coverage.push({
      documentId: version.ref.id, revision: version.revision, state: assetReferences ? 'complete' : 'unavailable', issues: [],
    });
    const documentVersions = new Map(this.versions.filter(item => item.ref.kind === 'document').map(item => [item.ref.id, item.revision]));
    for (const reference of assetReferences ?? []) if (reference.source) {
      if (documentVersions.get(reference.source.documentId) !== reference.source.revision) {
        const coverage = this.coverage.find(item => item.documentId === reference.source!.documentId);
        if (coverage) { coverage.state = 'partial'; coverage.issues.push({ code: 'ASSET_REFERENCE_STALE', severity: 'warning', message: 'Asset reference revision changed', owner: 'M03', source: reference.source, related: [], actions: ['retry'] }); }
        continue;
      }
      if (this.facts.some(fact => fact.subject?.kind === 'asset' && fact.subject.id === reference.assetId && fact.source.documentId === reference.source!.documentId && fact.source.field === reference.source!.field && equal(fact.source.range, reference.source!.range))) continue;
      this.facts.push({ source: reference.source, sceneId: reference.owner.kind === 'scene' ? reference.owner.id : null,
      subject: { kind: 'asset', id: reference.assetId }, uses: ['assetUse'], binding: 'direct', command: null, label: reference.usage,
      context: { before: null, current: reference.usage, after: null } });
    }
  }
  private indexDocument(document: SemanticDocument): void {
    const { parsed, sceneId } = document;
    const valid = parsed.cst.filter(node => node.valid && node.object);
    const say = valid.filter(node => node.command === 'say').map(node => ({ node, text: asRecord(node.object?.value) ? prose(node.object.value.text) : '' }));
    const sayIndex = new Map(say.map((entry, index) => [entry.node, index]));
    const add = (node: StatementNode, path: string, subject: Ref | null, use: Fact['uses'][number], label: string, binding: Fact['binding'] = 'direct', variable?: { scope: string; declaringSceneId: Id | null }): void => {
      const position = sayIndex.get(node);
      const previous = position === undefined ? say.filter(entry => entry.node.start < node.start).at(-1) : position > 0 ? say[position - 1] : undefined;
      const following = position === undefined ? say.find(entry => entry.node.start > node.start) : say[position + 1];
      const fact: Fact = { source: source(parsed, node, path), sceneId, subject, uses: [use], binding, command: node.command,
        label, context: { before: previous ? clip(previous.text) : null,
          current: clip(node.command === 'say' && asRecord(node.object?.value) ? prose(node.object.value.text) : parsed.text.slice(node.start, node.end)),
          after: following ? clip(following.text) : null },
        ...(variable ? { scope: variable.scope, declaringSceneId: variable.declaringSceneId } : {}) };
      const prior = this.facts.find(item => item.source.documentId === fact.source.documentId && item.source.range?.start === fact.source.range?.start && item.subject?.id === fact.subject?.id && item.binding === binding);
      if (prior) { if (!prior.uses.includes(use)) prior.uses.push(use); }
      else this.facts.push(fact);
    };
    const reads = (node: StatementNode, value: unknown, path: string): void => {
      if (asRecord(value) && typeof value.kind === 'string' && ['literal', 'input', 'variable', 'unary', 'binary', 'call'].includes(value.kind)) {
        for (const reference of variableReads(value as never)) add(node, path, { kind: 'variable', id: reference.id }, 'read', reference.id, 'direct', { scope: reference.scope, declaringSceneId: reference.scope === 'local' ? sceneId : null });
        return;
      }
      if (typeof value === 'string' && node.command === 'say' && (path === 'text' || /^text\.segments\.\d+\.text$/.test(path))) {
        for (const match of dialogueInterpolations(value)) {
          if (match.source === null || !match.closed) continue;
          const parsedExpression = parseExpression(match.source);
          if (parsedExpression.ok) for (const reference of variableReads(parsedExpression.expr)) add(node, path, { kind: 'variable', id: reference.id }, 'read', reference.id, 'direct', { scope: reference.scope, declaringSceneId: reference.scope === 'local' ? sceneId : null });
        }
      }
      if (Array.isArray(value)) value.forEach((entry, index) => reads(node, entry, `${path}.${index}`));
      else if (asRecord(value)) for (const [key, entry] of Object.entries(value)) reads(node, entry, path ? `${path}.${key}` : key);
    };
    for (const node of valid) {
      const args = node.object!.value;
      if (!asRecord(args)) continue;
      reads(node, args, '');
      if (node.command === 'say' && asRecord(args.speaker)) add(node, 'speaker', args.speaker.kind === 'character' && typeof args.speaker.id === 'string' ? { kind: 'character', id: args.speaker.id } : null, 'dialogue', prose(args.text));
      const write = (id: unknown, path: string) => {
        if (typeof id !== 'string') return;
        const variable = this.variables.find(item => item.id === id);
        add(node, path, { kind: 'variable', id }, 'write', variable?.name ?? id, 'direct', { scope: variable?.scope ?? 'local', declaringSceneId: variable?.scope === 'local' ? sceneId : null });
      };
      if (node.command === 'setVar' || node.command === 'getUserInput') {
        write(args.variableId, 'variableId');
        if (node.command === 'setVar' && args.op !== 'assign' && typeof args.variableId === 'string') add(node, 'variableId', { kind: 'variable', id: args.variableId }, 'read', args.variableId, 'direct', { scope: this.variables.find(item => item.id === args.variableId)?.scope ?? 'local', declaringSceneId: sceneId });
      }
      if (node.command === 'callScene' && asRecord(args.receiver)) write(args.receiver.variableId, 'receiver.variableId');
      if (node.command === 'callScene' && asRecord(args.parameters)) for (const parameterId of Object.keys(args.parameters)) add(node, `parameters.${parameterId}`, { kind: 'variable', id: parameterId }, 'write', parameterId, 'direct', { scope: 'local', declaringSceneId: typeof args.sceneId === 'string' ? args.sceneId : null });
      if (node.command === 'bgm') {
        if (args.op === 'stop') add(node, 'op', null, 'bgmStop', 'BGM stop', 'channel');
        else if (typeof args.assetId === 'string') add(node, 'assetId', { kind: 'asset', id: args.assetId }, 'bgmPlay', args.assetId);
      }
      const assetFields = (value: unknown, specs: readonly FieldSpec[], prefix = ''): void => {
        if (!asRecord(value)) return;
        for (const spec of specs) {
          const path = prefix ? `${prefix}.${spec.path}` : spec.path;
          const current = value[spec.path];
          if (spec.refKind === 'asset' && typeof current === 'string') add(node, path, { kind: 'asset', id: current }, 'assetUse', current);
          if (spec.type === 'object') assetFields(current, spec.children ?? [], path);
          if (spec.type === 'array' && Array.isArray(current) && spec.item) current.forEach((entry, index) => assetFields({ [spec.item!.path]: entry }, [spec.item!], `${path}.${index}`));
        }
      };
      assetFields(args, this.registry.get(node.command)?.fields ?? []);
      if (asRecord(args.voiceByLocale)) for (const [locale, id] of Object.entries(args.voiceByLocale)) if (typeof id === 'string') add(node, `voiceByLocale.${locale}`, { kind: 'asset', id }, 'assetUse', id);
    }
    this.coverage.push({ documentId: parsed.documentId, revision: parsed.revision, state: parsed.issues.some(issue => issue.severity === 'error') || valid.some(node => node.command.includes('/')) ? 'partial' : 'complete', issues: [...parsed.issues] });
  }
  query(input: SemanticQuery): Result<SemanticPage> {
    if (input.projectId !== this.projectId) return fail('QUERY_STALE', 'The active project changed');
    if (input.offset < 0 || !Number.isSafeInteger(input.offset) || (input.limit ?? 40) < 1 || (input.limit ?? 40) > 100) return fail('QUERY_INVALID', 'Invalid semantic query');
    const actual = new Map(this.versions.map(item => [`${item.ref.kind}:${item.ref.id}`, item.revision]));
    const expected = new Map(input.expected.map(item => [`${item.ref.kind}:${item.ref.id}`, item.revision]));
    if (!equal(this.lock, input.expectedLock) || actual.size !== expected.size || [...actual].some(([key, revision]) => expected.get(key) !== revision)) return fail('QUERY_STALE', 'Document or dependency revision changed');
    const selected = this.facts.filter(fact => !input.sceneIds.length || fact.sceneId !== null && input.sceneIds.includes(fact.sceneId)).filter(fact => {
      const filter = input.filter;
      if (filter.kind === 'dialogue') return fact.uses.includes('dialogue') && (filter.speaker.kind === 'narrator' ? fact.subject === null : fact.subject?.id === filter.speaker.id);
      if (filter.kind === 'variable') return fact.subject?.kind === 'variable' && fact.subject.id === filter.id && fact.scope === filter.scope && (filter.scope !== 'local' || fact.declaringSceneId === filter.declaringSceneId) && (filter.access === 'both' || fact.uses.includes(filter.access));
      if (filter.kind === 'asset') return fact.subject?.kind === 'asset' && fact.subject.id === filter.id && fact.uses.includes('assetUse');
      return fact.uses.includes('bgmPlay') && (filter.assetId === null || fact.subject?.id === filter.assetId) || filter.includeChannelStops && fact.uses.includes('bgmStop');
    });
    const order = new Map(this.documents.map(item => [item.parsed.documentId, item.order]));
    selected.sort((a, b) => (order.get(a.source.documentId) ?? 0) - (order.get(b.source.documentId) ?? 0) || (a.source.range?.start ?? 0) - (b.source.range?.start ?? 0));
    return { ok: true, value: structuredClone({ requestId: input.requestId, versions: this.versions, items: selected.slice(input.offset, input.offset + (input.limit ?? 40)), total: selected.length, offset: input.offset, coverage: this.coverage }), warnings: [] };
  }
}
