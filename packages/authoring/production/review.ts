import { createId } from '@galcraft/contracts';

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Artifact, EditInput, Result, Snapshot } from '@galcraft/contracts';
import { inspectSVG } from '@galcraft/assets';
import type { Candidate } from './types.js';
import { fail, ok } from './validation.js';
import { candidateTextContent, reviewScriptText, previewScriptText, type ScriptReviewInput } from './review-text.js';
import { SVGProposalSchema } from './svg.js';

export async function candidateText(candidate: Candidate): Promise<string> {
  if (candidate.editedText !== null) return candidateTextContent(candidate, candidate.editedText);
  const artifact = candidate.artifacts.find(value => value.kind === 'text'); if (!artifact) throw new Error('候选无文字');
  return candidateTextContent(candidate, await readFile(artifact.localPath, 'utf8'));
}
export async function reviewScript(input: ScriptReviewInput): Promise<Result<EditInput>> {
  try { validateScriptTarget(input); return await reviewScriptText({ ...input, text: await candidateText(input.candidate) }); }
  catch (error) { return fail('SCRIPT_REVIEW', String(error)); }
}
export async function previewScript(input: ScriptReviewInput): Promise<Result<Snapshot>> {
  try { validateScriptTarget(input); return await previewScriptText({ ...input, text: await candidateText(input.candidate) }); }
  catch (error) { return fail('SCRIPT_REVIEW', String(error)); }
}
// Keep the Node entry's validation order before touching artifact files.
function validateScriptTarget(input: ScriptReviewInput) {
  if (input.candidate.partial) throw new Error('部分输出不能采用');
  const document = input.current.documents.find(value => value.documentId === input.documentId);
  if (!document) throw new Error('目标场景不存在');
  if (!input.expected.some(value => value.ref.id === document.documentId && value.revision === document.revision)) throw new Error('审阅来源版本未冻结');
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
