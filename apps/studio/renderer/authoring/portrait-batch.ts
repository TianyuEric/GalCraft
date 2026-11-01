import type { DialoguePortrait, EditInput, Issue, Json, Patch, Result } from '@galcraft/contracts';
import { parse, patchFields, toDocumentPatch, type TextEdit } from '@galcraft/dsl';
import type { AuthoringSource } from './controller.js';
import { defaultPortraitCrop } from './portrait-crop.js';

export type PortraitBatchPlan = { edit: EditInput; count: number };
/** Enables entries and resets while preserving replacement inheritance and explicit crops. */
export function planPortraitBatch(source: AuthoringSource): Result<PortraitBatchPlan> {
  const patches: Patch[] = [], expected: EditInput['expected'] = [];
  let count = 0;
  for (const scene of source.scenes) {
    const parsed = parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text });
    if (parsed.issues.some(issue => issue.severity === 'error')) {
      const error: Issue = { code: 'PORTRAIT_SOURCE_INVALID', severity: 'error', message: `请先修正场景“${scene.name}”的脚本错误。`, owner: 'M01',
        source: { documentId: scene.documentId, revision: scene.revision }, related: [], actions: ['edit', 'locate'] };
      return { ok: false, error, issues: [error] };
    }
    const edits: TextEdit[] = [];
    for (const statement of parsed.statements) {
      if (statement.command !== 'changeFigure' || statement.args.op === 'exit' || !statement.id) continue;
      const portrait = statement.args.portrait as DialoguePortrait | undefined;
      if (portrait?.enabled === true) continue;
      if (!portrait && statement.args.op === 'replace' && !statement.args.reset) continue;
      const changed = patchFields(parsed, { documentId: scene.documentId, revision: scene.revision, statementIds: [statement.id],
        changes: [{ field: 'portrait', op: 'set', value: { enabled: true, crop: portrait?.crop ?? { ...defaultPortraitCrop } } as unknown as Json }] });
      if (!changed.ok) return changed;
      edits.push(...changed.value); count++;
    }
    if (edits.length) {
      patches.push(toDocumentPatch(scene.documentId, edits));
      expected.push({ ref: { kind: 'document', id: scene.documentId }, revision: scene.revision });
    }
  }
  return { ok: true, value: { count, edit: { label: '批量开启立绘说话头像', origin: 'batch', expected, patches, preparedAssets: [], requiredRefs: [] } }, warnings: [] };
}
