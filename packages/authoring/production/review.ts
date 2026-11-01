import { createId } from '@galcraft/contracts';

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Artifact, EditInput, Id, Result, VersionRef, Snapshot } from '@galcraft/contracts';
import { compile, parse, scriptOwnedIds, rewriteScriptReferences, type CompileInput } from '@galcraft/dsl';
import { inspectSVG } from '@galcraft/assets';
import type { Candidate } from './types.js';
import { fail, ok } from './validation.js';
import { restoreCandidateIdentities } from './context-identities.js';
import { SVGProposalSchema } from './svg.js';

export async function candidateText(candidate: Candidate): Promise<string> {
  if (candidate.editedText !== null) return restoreCandidateIdentities(candidate.editedText, candidate.idAliases ?? candidate.recipeSnapshot?.idAliases, candidate.recipeSnapshot?.purpose ?? 'script', candidate.idCommands);
  const artifact = candidate.artifacts.find(value => value.kind === 'text'); if (!artifact) throw new Error('候选无文字');
  return restoreCandidateIdentities(await readFile(artifact.localPath, 'utf8'), candidate.idAliases ?? candidate.recipeSnapshot?.idAliases, candidate.recipeSnapshot?.purpose ?? 'script', candidate.idCommands);
}
export async function reviewScript(input: { candidate: Candidate; current: CompileInput; documentId: Id; beforeStatementId: Id | null;
  replaceStatementIds: Id[]; bindings: Record<Id, Id>; expected: VersionRef[] }): Promise<Result<EditInput>> {
  try {
    if (input.candidate.partial) throw new Error('部分输出不能采用');
    const document = input.current.documents.find(value => value.documentId === input.documentId); if (!document) throw new Error('目标场景不存在');
    if (!input.expected.some(value => value.ref.id === document.documentId && value.revision === document.revision)) throw new Error('审阅来源版本未冻结');
    const candidate = { documentId: document.documentId, revision: document.revision, text: await candidateText(input.candidate) };
    const parsed = parse(document), targets = parsed.cst.filter(value => value.id && input.replaceStatementIds.includes(value.id));
    if (targets.length !== input.replaceStatementIds.length) throw new Error('替换语句已变化');
    let start = document.text.length, end = start;
    if (targets.length) { start = targets[0]!.start; end = targets.at(-1)!.end;
      if (parsed.cst.some(value => value.start >= start && value.end <= end && !targets.includes(value))) throw new Error('替换范围必须连续'); }
    else if (input.beforeStatementId) { const anchor = parsed.cst.find(value => value.id === input.beforeStatementId); if (!anchor) throw new Error('插入位置已变化'); start = end = anchor.start; }
    else { const last = parsed.cst.at(-1); if (last && ['end', 'changeScene', 'jumpLabel', 'return'].includes(last.command)) start = end = last.start; }
    const retained = new Set(scriptOwnedIds({ ...document, text: document.text.slice(start, end) }));
    const mapping = { ...input.bindings }; for (const id of scriptOwnedIds(candidate)) if (!retained.has(id)) mapping[id] = createId(input.current);
    const text = rewriteScriptReferences(candidate, mapping, input.current.engineVersion, input.current.pluginCommands);
    const after = `${text.trim()}\n`, next = document.text.slice(0, start) + after + document.text.slice(end);
    const result = compile({ ...input.current, documents: input.current.documents.map(value => value === document ? { ...value, text: next } : value) });
    if (!result.snapshot) return { ok: false, error: result.issues.find(issue => issue.severity === 'error')!, issues: result.issues };
    return ok({ label: '采用脚本候选', origin: 'candidate', expected: input.expected, preparedAssets: [], requiredRefs: [],
      patches: [{ kind: 'text', documentId: document.documentId, edits: [{ start, end, before: document.text.slice(start, end), after }] }] });
  } catch (error) { return fail('SCRIPT_REVIEW', String(error)); }
}
export async function previewScript(input: Parameters<typeof reviewScript>[0]): Promise<Result<Snapshot>> {
  const reviewed = await reviewScript(input);
  if (!reviewed.ok) return reviewed;
  const documents = input.current.documents.map(document => {
    let text = document.text;
    for (const patch of reviewed.value.patches) if (patch.kind === 'text' && patch.documentId === document.documentId)
      for (const edit of [...patch.edits].sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.after + text.slice(edit.end);
    return { ...document, text };
  });
  const result = compile({ ...input.current, documents });
  if (!result.snapshot) return { ok: false, error: result.issues.find(issue => issue.severity === 'error')!, issues: result.issues };
  const snapshot = structuredClone(result.snapshot), target = documents.find(document => document.documentId === input.documentId)!;
  if (!target.sceneId) return fail('SCRIPT_TARGET', '预览目标不是场景');
  snapshot.project.entry = { sceneId: target.sceneId, labelId: null };
  snapshot.project.display.titleMusic = null; snapshot.project.display.titleVideo = null;
  return ok(snapshot);
}
export async function prepareSVGCandidate(candidate: Candidate, directory: string,
  decode: (source: string) => Promise<Result<unknown>>): Promise<Result<Artifact>> {
  try { const proposal = SVGProposalSchema.parse(JSON.parse(await candidateText(candidate)));
    const inspected = inspectSVG({ source: proposal.source }); if (!inspected.ok) return inspected;
    const decoded = await decode(proposal.source); if (!decoded.ok) return decoded;
    await mkdir(directory, { recursive: true }); const path = join(directory, `${createId()}.svg`); await writeFile(path, proposal.source);
    return ok({ kind: 'image', localPath: path, mime: 'image/svg+xml', bytes: Buffer.byteLength(proposal.source), groupId: 'svg/0', role: 'primary',
      metadata: { width: inspected.value.intrinsic.width, height: inspected.value.intrinsic.height, svgViewBox: inspected.value.viewBox, suggestedUse: proposal.suggestedUse },
      background: { declared: 'unknown', hasAlpha: true, hasTransparency: false } });
  } catch (error) { return fail('SVG_CANDIDATE', String(error)); }
}
