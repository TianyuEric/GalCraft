import type { EditInput, EditPlan, EditReceipt, Id, Result, SavePlan, SaveReceipt, SaveScope, VersionRef } from '@galcraft/contracts';
import type { PreparedIndexEdit } from '../core/types.js';
import { ok } from '../core/result.js';

export type AssetDocumentGateway = {
  planEdit(input: EditInput): Result<EditPlan> | Promise<Result<EditPlan>>;
  applyEdit(planId: Id, expected: VersionRef[]): Result<EditReceipt> | Promise<Result<EditReceipt>>;
  planSave(scope: SaveScope): Result<SavePlan> | Promise<Result<SavePlan>>;
  save(planId: Id): Promise<Result<SaveReceipt>>;
};

export type CommittedAsset = { edit: EditReceipt; save: SaveReceipt };

export async function commitPreparedAsset(gateway: AssetDocumentGateway, edit: PreparedIndexEdit,
  lifecycle: { label: string; onApplied(): void; onRejected(): Promise<void> }): Promise<Result<CommittedAsset>> {
  const planned = await gateway.planEdit({ label: lifecycle.label, origin: 'batch', expected: edit.expected,
    patches: edit.indexPatches, preparedAssets: edit.preparedAssets, requiredRefs: edit.requiredRefs });
  if (!planned.ok) { await lifecycle.onRejected(); return planned; }
  const applied = await gateway.applyEdit(planned.value.planId, edit.expected);
  if (!applied.ok) { await lifecycle.onRejected(); return applied; }
  lifecycle.onApplied();
  const indexId = edit.expected.find(value => value.ref.kind === 'document')?.ref.id;
  const scope: SaveScope = indexId ? { kind: 'objects',
    objects: edit.preparedAssets.map(objectId => ({ documentId: indexId, kind: 'asset', objectId })),
    expected: applied.value.documents } : { kind: 'all' };
  const savePlan = await gateway.planSave(scope);
  if (!savePlan.ok) return savePlan;
  const saved = await gateway.save(savePlan.value.planId);
  if (!saved.ok) return saved;
  return ok({ edit: applied.value, save: saved.value });
}
