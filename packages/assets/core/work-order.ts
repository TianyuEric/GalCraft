import { createId } from '@galcraft/contracts';

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { AssetReference, EditInput, Id, Issue, Patch, ProductionItem, Result, VersionRef } from '@galcraft/contracts';
import { fail, issue, ok } from './result.js';
import type { PreparedIndexEdit } from './types.js';

export type WorkOrderItem = { itemId: Id; sceneId: Id; statementId: Id | null; characterId: Id | null;
  usage: ProductionItem['usage']; locale: string | null; text: string; spokenText: string;
  specification: string; sourceVersions: VersionRef[]; expectedName: string; referenceAssets: Id[] };
export type WorkOrder = { format: 'galcraft-work-order'; schemaVersion: 1; id: Id; projectId: Id;
  createdAt: string; items: WorkOrderItem[] };
export type WorkReturn = { workOrderId: Id; projectId: Id; items: { itemId: Id; file: string;
  locale: string | null; notes: string }[] };
export type MatchResult = { identityMatches: boolean;
  matched: { itemId: Id; file: string; changedInputs: VersionRef[]; observedVersions: VersionRef[] }[];
  unmatched: string[]; duplicates: { itemId: Id; files: string[] }[]; issues: Issue[] };

function versionKey(value: VersionRef): string { return `${value.ref.kind}/${value.ref.id}@${value.revision}`; }
function sameVersions(left: VersionRef[], right: VersionRef[]): boolean {
  const a = left.map(versionKey).sort();
  const b = right.map(versionKey).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function createWorkOrder(input: { projectId: Id; items: ProductionItem[];
  textByItem: ReadonlyMap<Id, string>; referencesByItem?: ReadonlyMap<Id, Id[]> }): WorkOrder {
  return { format: 'galcraft-work-order', schemaVersion: 1, id: createId(), projectId: input.projectId,
    createdAt: new Date().toISOString(), items: input.items.filter(item => item.state !== 'intentionalEmpty').map(item => ({
      itemId: item.id, sceneId: item.sceneId, statementId: item.statementId, characterId: item.characterId,
      usage: item.usage, locale: item.locale, text: input.textByItem.get(item.id) ?? '',
      spokenText: item.spokenText ?? input.textByItem.get(item.id) ?? '', specification: item.specification,
      sourceVersions: structuredClone(item.sourceVersions), expectedName: `${item.id}_${item.usage}${item.locale ? `_${item.locale}` : ''}`,
      referenceAssets: [...(input.referencesByItem?.get(item.id) ?? [])],
    })) };
}

function csvCell(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
export function exportWorkOrder(order: WorkOrder, referenceFiles: ReadonlyMap<string, Uint8Array> = new Map()): Uint8Array {
  const columns = ['itemId', 'sceneId', 'statementId', 'characterId', 'usage', 'locale', 'text', 'spokenText', 'specification', 'expectedName'];
  const csv = [columns.join(','), ...order.items.map(item => columns.map(column => csvCell(String(item[column as keyof WorkOrderItem] ?? ''))).join(','))].join('\r\n');
  const entries: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify(order, null, 2) + '\n'),
    'work-items.csv': strToU8('\uFEFF' + csv + '\r\n') };
  for (const [path, bytes] of referenceFiles) {
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..'))
      throw new Error(`Invalid reference path: ${path}`);
    entries[`references/${path}`] = bytes;
  }
  return zipSync(entries, { level: 6 });
}

export function readWorkReturn(zip: Uint8Array): Result<{ manifest: WorkReturn | null; files: Map<string, Uint8Array> }> {
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(zip); }
  catch (error) { return fail('WORK_RETURN_ZIP', `回收 ZIP 无法读取：${String(error)}`); }
  let manifest: WorkReturn | null = null;
  if (entries['manifest.json']) {
    let parsed: WorkReturn | WorkOrder;
    try { parsed = JSON.parse(strFromU8(entries['manifest.json'])) as WorkReturn | WorkOrder; }
    catch { return fail('WORK_RETURN_MANIFEST', '回收 manifest.json 无法解析'); }
    if (!parsed || !Array.isArray(parsed.items)) return fail('WORK_RETURN_MANIFEST', '回收清单格式无效');
    manifest = 'format' in parsed && parsed.format === 'galcraft-work-order'
      ? { workOrderId: parsed.id, projectId: parsed.projectId, items: [] }
      : parsed as WorkReturn;
    if (!manifest.workOrderId || !manifest.projectId) return fail('WORK_RETURN_MANIFEST', '回收清单缺少作品或制作单身份');
  }
  const files = new Map(Object.entries(entries).filter(([path]) => path !== 'manifest.json' && !path.endsWith('/')));
  return ok({ manifest, files });
}

export function matchWorkReturn(order: WorkOrder, returned: WorkReturn | null, files: Iterable<string>,
  currentVersions: ReadonlyMap<Id, VersionRef[]>): MatchResult {
  const available = [...files];
  const byId = new Map(order.items.map(item => [item.itemId, item]));
  const candidates = new Map<Id, string[]>();
  const unmatched: string[] = [];
  const issues: Issue[] = [];
  if (returned && (returned.workOrderId !== order.id || returned.projectId !== order.projectId)) {
    issues.push(issue('WORK_ORDER_MISMATCH', '回收清单与本次制作清单不匹配', ['compare']));
    return { identityMatches: false, matched: [], unmatched: available, duplicates: [], issues };
  }
  const named = new Map(returned?.items.map(item => [item.file, item.itemId]) ?? []);
  for (const file of available) {
    if (file.startsWith('references/') || file.toLowerCase().endsWith('.csv')) continue;
    let id = named.get(file);
    if (!id) {
      const prefix = file.split(/[_.-]/, 1)[0]!;
      const possible = order.items.filter(item => item.itemId.startsWith(prefix));
      if (possible.length === 1) id = possible[0]!.itemId;
    }
    if (!id || !byId.has(id)) { unmatched.push(file); continue; }
    candidates.set(id, [...(candidates.get(id) ?? []), file]);
  }
  const matched: MatchResult['matched'] = [];
  const duplicates: MatchResult['duplicates'] = [];
  for (const [id, group] of candidates) {
    if (group.length !== 1) { duplicates.push({ itemId: id, files: group }); continue; }
    const original = byId.get(id)!;
    const latest = currentVersions.get(id) ?? [];
    const changedInputs = [...latest.filter(value => !original.sourceVersions.some(old => versionKey(old) === versionKey(value))),
      ...original.sourceVersions.filter(old => !latest.some(value => versionKey(old) === versionKey(value)))];
    matched.push({ itemId: id, file: group[0]!, changedInputs, observedVersions: structuredClone(latest) });
  }
  if (duplicates.length) issues.push(issue('WORK_RETURN_DUPLICATE', '部分清单项有多个回收文件，需作者选择', ['chooseTarget']));
  if (unmatched.length) issues.push(issue('WORK_RETURN_UNMATCHED', '部分回收文件没有唯一清单身份，需作者关联', ['chooseTarget']));
  if (matched.some(item => item.changedInputs.length)) issues.push(issue('WORK_RETURN_CHANGED', '部分清单输入已改变，需预览确认', ['compare']));
  return { identityMatches: true, matched, unmatched, duplicates, issues };
}

export function prepareWorkReturnEdit(input: { index: PreparedIndexEdit; references: AssetReference[];
  referencePatches: Patch[]; expected: VersionRef[]; acceptedItemIds: Id[]; matches: MatchResult;
  currentVersions: ReadonlyMap<Id, VersionRef[]>;
  confirmedChanges: { itemId: Id; changedInputs: VersionRef[] }[] }): Result<EditInput> {
  if (!input.matches.identityMatches) return fail('WORK_ORDER_MISMATCH', '回收清单身份不匹配', ['compare']);
  const accepted = new Set(input.acceptedItemIds);
  if (accepted.size !== input.acceptedItemIds.length || input.matches.duplicates.some(item => accepted.has(item.itemId)) ||
      input.matches.matched.filter(item => accepted.has(item.itemId)).length !== accepted.size)
    return fail('WORK_RETURN_SELECTION', '选中项必须唯一匹配');
  for (const item of input.matches.matched.filter(value => accepted.has(value.itemId))) {
    if (!sameVersions(input.currentVersions.get(item.itemId) ?? [], item.observedVersions))
      return fail('WORK_RETURN_CHANGED', '制作项版本再次变化，需重新预览', ['compare']);
    if (item.changedInputs.length && !input.confirmedChanges.some(value =>
      value.itemId === item.itemId && sameVersions(value.changedInputs, item.changedInputs)))
      return fail('WORK_RETURN_CHANGED', '输入已变化的项须确认具体版本差异', ['compare']);
  }
  const expected = new Map<string, VersionRef>();
  for (const value of [...input.index.expected, ...input.expected]) expected.set(`${value.ref.kind}/${value.ref.id}`, value);
  return ok({ label: '回收制作清单', origin: 'batch', expected: [...expected.values()],
    patches: [...input.index.indexPatches, ...input.referencePatches], preparedAssets: input.index.preparedAssets,
    requiredRefs: input.index.requiredRefs });
}
