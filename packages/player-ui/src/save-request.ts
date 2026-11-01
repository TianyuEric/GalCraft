import type { Id, Result, SaveIndex } from '@galcraft/contracts';
import type { PlayerDataService, SaveInput } from './data.js';
import { fail } from './common.js';

export async function savePreparedRecord(data: PlayerDataService, input: Omit<SaveInput, 'expectedIndexRevision'>,
  confirmedManualRecordId: Id | null): Promise<Result<SaveIndex>> {
  let index = data.current()?.index;
  if (!index) return fail('PROFILE_NOT_OPEN', '资料尚未装载');
  for (let attempt = 0; attempt < 2; attempt++) {
    if (input.kind === 'manual' && input.slotId &&
      (index.manual.find(slot => slot.slotId === input.slotId)?.recordId ?? null) !== confirmedManualRecordId)
      return fail('INDEX_STALE', '存档槽已更新');
    const result = await data.save({ ...input, expectedIndexRevision: index.revision });
    if (result.ok || result.error.code !== 'INDEX_STALE') return result;
    const latest = data.current()?.index;
    if (!latest || input.kind === 'manual' && input.slotId &&
      (latest.manual.find(slot => slot.slotId === input.slotId)?.recordId ?? null) !== confirmedManualRecordId)
      return result;
    index = latest;
  }
  return fail('INDEX_STALE', '存档列表已更新');
}
