import { createId } from '@galcraft/contracts';
import type { EntryMapping, FlowEntryRecord, Id, LongTerm, Result, SaveIndex, SaveRecord, Snapshot } from '@galcraft/contracts';
import { FlowEntryRecordSchema, LongTermSchema, SaveIndexSchema, SaveRecordSchema } from '@galcraft/contracts';
import type { PlayerPreferences } from './preferences.js';
import { validatePreferences, normalizeLanguagePreferences } from './preferences.js';
import type { PlayerDataService, Profile } from './data.js';
import type { RestoreCoordinator } from './restore.js';
import { clone, fail, ok } from './common.js';

export type PlayerDataPackage = { format: 'galcraft-player-data'; schemaVersion: 1; projectId: Id;
  createdAt: string; releaseVersions: string[]; records: SaveRecord[]; index: SaveIndex;
  longTerm: LongTerm | null; preferences: PlayerPreferences | null };
export const dataReleaseVersions = (records: SaveRecord[], longTerm: LongTerm | null): string[] =>
  [...new Set([...records.map(record => record.releaseVersion),
    ...Object.values(longTerm?.flowEntries ?? {}).map(entry => entry.releaseVersion)])];
export type ImportDestination = { kind: 'manual'; slotId: Id } | { kind: 'quick'|'auto'; recordId: Id | null } |
  { kind: 'continue' };
export const importDestinationKey = (target: ImportDestination, story: SaveRecord['state']['story']): string | null =>
  target.kind === 'manual' ? `manual/${target.slotId}` : target.kind === 'continue' ?
    story?.kind === 'afterstory' ? `continue/afterstory/${story.entryId}` : 'continue/main' :
    target.recordId ? `${target.kind}/${target.recordId}` : null;
export type DataImportSelection = { records: { sourceId: Id; destination: ImportDestination | null;
  action: 'keepLocal'|'overwrite'|'emptySlot' }[];
  variableChoices: Record<Id, 'keepLocal'|'import'>; preferences: 'keepLocal'|'import' };
export type DataImportPlan = { id: Id; projectId: Id; sourceLabel: string; sourceReleaseVersions: string[];
  targetSnapshotId: Id; targetReleaseVersion: string;
  expected: { indexRevision: number; longTermRevision: number; preferencesRevision: number };
  records: { sourceId: Id; kind: SaveRecord['kind']; story: SaveRecord['state']['story']; releaseVersion: string; position: SaveRecord['state']['position'];
    sourceSummary: SaveRecord['summary']; destination: ImportDestination | null; localRecordId: Id | null;
    localSummary: SaveRecord['summary'] | null; mappings: EntryMapping[];
    action: 'keepLocal'|'overwrite'|'emptySlot'; compatibility: 'readable'|'mapped'|'incompatible'|null;
    issue: string|null }[];
  flowEntries: { nodeId: Id; releaseVersion: string; position: FlowEntryRecord['state']['position'];
    action: 'keepLocal'|'import'; compatibility: 'readable'|'mapped'|'incompatible'|null; mappings: EntryMapping[];
    issue: string|null }[];
  variableIds: Id[]; localVariableIds: Id[]; sourcePreferences: boolean;
  removedLocalRecords: { recordId: Id; summary: SaveRecord['summary'] | null }[];
  variableChoices: DataImportSelection['variableChoices']; preferences: DataImportSelection['preferences'];
  canApply: boolean };
export type DataImportReceipt = { planId: Id; importedRecordIds: Id[]; importedNodeIds: Id[];
  indexRevision: number; longTermRevision: number; preferencesRevision: number };
type Frozen = { source: PlayerDataPackage; plan: DataImportPlan; selection: DataImportSelection;
  next: Profile; records: SaveRecord[]; thumbnails: Record<Id, Uint8Array>; removed: Id[] };

export class DataImportService {
  private plans = new Map<Id, Frozen>();
  constructor(readonly data: PlayerDataService, readonly restore: RestoreCoordinator, readonly snapshot: Snapshot) {}
  async planDataImport(input: { source: { label: string; package: PlayerDataPackage; thumbnails?: Record<Id, Uint8Array> } } |
    { previousPlanId: Id; selection: DataImportSelection }): Promise<Result<DataImportPlan>> {
    let source: PlayerDataPackage, label: string, selection: DataImportSelection, thumbnails: Record<Id, Uint8Array>;
    const previousPlanId = 'previousPlanId' in input ? input.previousPlanId : null;
    if ('source' in input) {
      source = clone(input.source.package); label = input.source.label;
      thumbnails = clone(input.source.thumbnails ?? {});
      selection = { records: source.records.map(record => ({ sourceId: record.recordId,
        destination: null, action: 'keepLocal' })), variableChoices: {}, preferences: 'keepLocal' };
    } else {
      const prior = this.plans.get(input.previousPlanId); if (!prior) return fail('PLAN_MISSING', '导入计划已失效');
      source = clone(prior.source); label = prior.plan.sourceLabel; selection = clone(input.selection);
      thumbnails = clone(prior.thumbnails);
    }
    if (source.format !== 'galcraft-player-data' || source.schemaVersion !== 1 || source.projectId !== this.snapshot.projectId ||
      !SaveIndexSchema.safeParse(source.index).success || source.records.some(record => !SaveRecordSchema.safeParse(record).success ||
        record.projectId !== source.projectId) ||
      source.longTerm && !LongTermSchema.safeParse(source.longTerm).success ||
      source.preferences && !validatePreferences(source.preferences).ok)
      return fail('IMPORT_PACKAGE_INVALID', '玩家资料包格式或作品身份不匹配');
    const profile = this.data.current(); if (!profile) return fail('PROFILE_NOT_OPEN', '资料尚未装载');
    const originVersions = dataReleaseVersions(source.records, source.longTerm);
    if (originVersions.some(version => !source.releaseVersions.includes(version)))
      return fail('IMPORT_VERSION_MISSING', '资料包未声明所有记录来源版本');
    if (new Set(source.records.map(record => record.recordId)).size !== source.records.length)
      return fail('IMPORT_DUPLICATE_RECORD', '资料包有重复存档身份');
    if (new Set(selection.records.map(item => item.sourceId)).size !== selection.records.length)
      return fail('IMPORT_SELECTION_DUPLICATE', '导入选择有重复存档身份');
    const destinations = new Set<string>();
    for (const item of selection.records) {
      if (item.action === 'keepLocal' || !item.destination) continue;
      const target = item.destination;
      const key = importDestinationKey(target, source.records.find(record => record.recordId === item.sourceId)?.state.story);
      if (key && destinations.has(key)) return fail('IMPORT_TARGET_DUPLICATE', '多条导入存档选择了同一目标槽');
      if (key) destinations.add(key);
    }
    const next = clone(profile), accepted: SaveRecord[] = [], acceptedThumbnails: Record<Id, Uint8Array> = {}, removed: Id[] = [];
    const localIds = new Set([...profile.index.manual.map(slot => slot.recordId), ...profile.index.quick,
      ...profile.index.auto, profile.index.continueRecordId,...Object.values(profile.index.afterstoryRecords??{})].filter((id): id is Id => id !== null));
    const planRecords: DataImportPlan['records'] = [];
    let canApply = true;
    for (const record of source.records) {
      const chosen = selection.records.find(item => item.sourceId === record.recordId);
      if (!chosen || chosen.action === 'keepLocal') {
        planRecords.push({ sourceId: record.recordId, kind: record.kind, story: clone(record.state.story), releaseVersion: record.releaseVersion,
          position: clone(record.state.position), sourceSummary: clone(record.summary),
          destination: null, localRecordId: null, localSummary: null, mappings: [],
          action: 'keepLocal', compatibility: null, issue: null }); continue;
      }
      let compatibility: 'readable'|'mapped'|'incompatible' = 'incompatible', issue: string|null = null;
      let recordMappings: EntryMapping[] = [];
      const requestId = createId();
      const current = this.restore.context();
      if (current.ok) {
        const prepared = await this.restore.prepareRestore({ requestId, purpose: 'validate',
          source: { kind: 'save', record }, context: { ...current.value, domain: { projectId: this.snapshot.projectId,
            kind: 'sample', instance: requestId }, expectedActiveSessionId: null,
            longTerm: source.longTerm ?? profile.longTerm, preferences: source.preferences ?? profile.preferences } });
        if (prepared.ok) { compatibility = prepared.value.compatibility; recordMappings = prepared.value.mappings ?? []; }
        else issue = prepared.error.message;
        this.restore.disposePreparedRestore(requestId);
      } else issue = current.error.message;
      if (compatibility === 'incompatible') canApply = false;
      const importedId = [...localIds].some(id => id.toLowerCase() === record.recordId.toLowerCase()) ? createId(localIds) : record.recordId;
      localIds.add(importedId);
      if (record.thumbnail && !thumbnails[record.recordId]) { canApply = false; issue = '资料包缺少缩略图'; }
      const destination = chosen.destination;
      const afterstoryId=record.state.story?.kind==='afterstory'?record.state.story.entryId:null;
      const localRecordId = destination?.kind === 'manual' ? profile.index.manual.find(item =>
        item.slotId === destination.slotId)?.recordId ?? null : destination?.kind === 'continue' ?
        afterstoryId?profile.index.afterstoryRecords?.[afterstoryId]??null:profile.index.continueRecordId : destination?.kind === 'quick' || destination?.kind === 'auto' ?
        destination.recordId : null;
      const localRead = localRecordId ? await this.data.record(localRecordId) : null;
      const localSummary = localRead?.ok && localRead.value ? clone(localRead.value.summary) : null;
      if (!destination || destination.kind !== record.kind) { canApply = false; issue = '导入目标类别不匹配'; }
      else if (destination.kind === 'manual') {
        const slot = next.index.manual.find(item => item.slotId === destination.slotId);
        if (chosen.action === 'overwrite' && !slot?.recordId || chosen.action === 'emptySlot' && slot?.recordId) {
          canApply = false; issue = '手动槽状态已变化';
        } else if (slot) { if (slot.recordId) removed.push(slot.recordId); slot.recordId = importedId; }
        else if (chosen.action === 'emptySlot') next.index.manual.push({ slotId: destination.slotId,
          order: next.index.manual.length, recordId: importedId });
        else { canApply = false; issue = '覆盖目标槽不存在'; }
      } else if (destination.kind === 'continue') {
        const existing=afterstoryId?next.index.afterstoryRecords?.[afterstoryId]:next.index.continueRecordId;
        if (chosen.action === 'overwrite' && !existing) { canApply = false; issue = '继续点不存在'; }
        else { if (existing) removed.push(existing);
          if(afterstoryId)(next.index.afterstoryRecords??={})[afterstoryId]=importedId;else next.index.continueRecordId = importedId; }
      } else {
        const list = destination.kind === 'quick' ? next.index.quick : next.index.auto;
        if (destination.recordId) {
          const at = list.indexOf(destination.recordId);
          if (at < 0 || chosen.action !== 'overwrite') { canApply = false; issue = '队列目标不存在'; }
          else { removed.push(destination.recordId); list.splice(at, 1, importedId); }
        } else if (chosen.action === 'emptySlot') { list.unshift(importedId);
          removed.push(...list.splice(destination.kind === 'quick' ? 12 : 3)); }
        else { canApply = false; issue = '请选择具体覆盖目标'; }
      }
      accepted.push({ ...clone(record), recordId: importedId,
        thumbnail: record.thumbnail ? `thumbnails/${importedId}.png` : null });
      if (thumbnails[record.recordId]) acceptedThumbnails[importedId] = thumbnails[record.recordId]!;
      planRecords.push({ sourceId: record.recordId, kind: record.kind, story: clone(record.state.story), releaseVersion: record.releaseVersion,
        position: clone(record.state.position), sourceSummary: clone(record.summary), destination,
        localRecordId, localSummary, mappings: recordMappings,
        action: chosen.action, compatibility, issue });
    }
    const flowEntries: DataImportPlan['flowEntries'] = [];
    for (const entry of Object.values(source.longTerm?.flowEntries ?? {})) {
      if (!FlowEntryRecordSchema.safeParse(entry).success || entry.projectId !== source.projectId) {
        canApply = false; flowEntries.push({ nodeId: entry.nodeId, releaseVersion: entry.releaseVersion,
          position: clone(entry.state.position), action: 'import', compatibility: 'incompatible', mappings: [], issue: '流程入口无效' }); continue;
      }
      if (next.longTerm.flowEntries[entry.nodeId]) {
        flowEntries.push({ nodeId: entry.nodeId, releaseVersion: entry.releaseVersion,
          position: clone(entry.state.position), action: 'keepLocal', compatibility: null, mappings: [], issue: null }); continue;
      }
      const requestId = createId(), context = this.restore.context();
      let compatibility: 'readable'|'mapped'|'incompatible' = 'incompatible', issue: string|null = null;
      let entryMappings: EntryMapping[] = [];
      if (context.ok) {
        const prepared = await this.restore.prepareRestore({ requestId, purpose: 'validate',
          source: { kind: 'flowEntry', record: entry }, context: { ...context.value,
            domain: { projectId: this.snapshot.projectId, kind: 'sample', instance: requestId },
            expectedActiveSessionId: null, longTerm: source.longTerm ?? profile.longTerm } });
        if (prepared.ok) { compatibility = prepared.value.compatibility; entryMappings = prepared.value.mappings ?? []; }
        else issue = prepared.error.message;
        this.restore.disposePreparedRestore(requestId);
      } else issue = context.error.message;
      if (compatibility === 'incompatible') canApply = false;
      next.longTerm.flowEntries[entry.nodeId] = clone(entry);
      flowEntries.push({ nodeId: entry.nodeId, releaseVersion: entry.releaseVersion,
        position: clone(entry.state.position), action: 'import', compatibility, mappings: entryMappings, issue });
    }
    for (const [id, value] of Object.entries(source.longTerm?.variables ?? {}))
      if (!next.longTerm.variables[id] || selection.variableChoices[id] === 'import') next.longTerm.variables[id] = clone(value);
    for (const [id, value] of Object.entries(source.longTerm?.plugins ?? {}))
      if (!next.longTerm.plugins[id]) next.longTerm.plugins[id] = clone(value);
    if (source.longTerm) for (const key of ['readStatements', 'endings', 'music', 'video'] as const)
      next.longTerm[key] = [...new Set([...next.longTerm[key], ...source.longTerm[key]])];
    next.longTerm.afterstoryCompleted=[...new Set([...(next.longTerm.afterstoryCompleted??[]),...(source.longTerm?.afterstoryCompleted??[])])];
    for (const [entryId, ids] of Object.entries(source.longTerm?.cg ?? {}))
      next.longTerm.cg[entryId] = [...new Set([...(next.longTerm.cg[entryId] ?? []), ...ids])];
    if (selection.preferences === 'import' && source.preferences) next.preferences = normalizeLanguagePreferences(clone(source.preferences), this.data.languages);
    if (accepted.some(record => removed.includes(record.recordId))) canApply = false;
    const removedLocalRecords: DataImportPlan['removedLocalRecords'] = [];
    for (const recordId of new Set(removed.filter(id => !accepted.some(record => record.recordId === id)))) {
      const found = await this.data.record(recordId);
      removedLocalRecords.push({ recordId, summary: found.ok && found.value ? clone(found.value.summary) : null });
    }
    const id = createId();
    const plan: DataImportPlan = { id, projectId: source.projectId, sourceLabel: label,
      sourceReleaseVersions: originVersions, targetSnapshotId: this.snapshot.snapshotId,
      targetReleaseVersion: this.snapshot.releaseVersion,
      expected: { indexRevision: profile.index.revision, longTermRevision: profile.longTerm.revision,
        preferencesRevision: profile.preferences.revision }, records: planRecords, flowEntries,
      variableIds: Object.keys(source.longTerm?.variables ?? {}),
      localVariableIds: Object.keys(profile.longTerm.variables), sourcePreferences: !!source.preferences,
      removedLocalRecords,
      variableChoices: clone(selection.variableChoices), preferences: selection.preferences, canApply };
    if (previousPlanId) this.plans.delete(previousPlanId);
    this.plans.set(id, { source, plan, selection, next, records: accepted, thumbnails: acceptedThumbnails, removed });
    return ok(clone(plan));
  }
  async applyDataImport(planId: Id): Promise<Result<DataImportReceipt>> {
    const frozen = this.plans.get(planId); if (!frozen) return fail('PLAN_MISSING', '导入计划已失效');
    if (!frozen.plan.canApply) return fail('PLAN_BLOCKED', '导入内容存在不兼容项目');
    if (frozen.plan.targetSnapshotId !== this.snapshot.snapshotId) return fail('PLAN_STALE', '当前快照已变化');
    const applied = await this.data.applyImport({ expected: frozen.plan.expected,
      next: frozen.next, records: frozen.records, thumbnails: frozen.thumbnails, removedRecordIds: frozen.removed });
    if (!applied.ok) return applied;
    this.plans.delete(planId);
    return ok({ planId, importedRecordIds: frozen.records.map(record => record.recordId),
      importedNodeIds: frozen.plan.flowEntries.filter(entry => entry.action === 'import').map(entry => entry.nodeId),
      indexRevision: applied.value.index.revision, longTermRevision: applied.value.longTerm.revision,
      preferencesRevision: applied.value.preferences.revision });
  }
  discardDataImport(planId: Id) { this.plans.delete(planId); }
}
