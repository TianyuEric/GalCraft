import { describe, expect, it } from 'vitest';
import type { EntryMapping, PlayerHost, Snapshot, StorageBatch } from '@galcraft/contracts';
import { FixtureDomains, FixtureFlowEntry, FixtureIds, FixtureSaveRecord, FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { PlayerDataService } from './data.js';
import { RestoreCoordinator, type PluginRestorePort } from './restore.js';
import { DataImportService, dataReleaseVersions, type PlayerDataPackage } from './import.js';
import type { SessionController } from '@galcraft/runtime';
import type { StageController } from '@galcraft/stage';
import { readArchive, writeArchive } from './archive.js';
import { InputRouter, PageNavigator } from './navigation.js';
import { PlayerLongTermService } from './long-term.js';
import { autoReadClock, dialogueVoiceEnded, readingViewport } from './auto-reading.js';
import type { AudioMixer } from '@galcraft/stage';
import { savePreparedRecord } from './save-request.js';

const success = <T>(value: T) => ({ ok: true as const, value, warnings: [] });
function host() {
  const values = new Map<string, Uint8Array>();
  let failNext = false;
  const storage: PlayerHost['storage'] = {
    read: async key => success(values.get(key) ?? null),
    commit: async (batch: StorageBatch) => {
      const prefix = `player/${batch.domain.projectId}/${batch.domain.kind}/${encodeURIComponent(batch.domain.instance)}/`;
      const revision = values.has(prefix + 'revision') ? JSON.parse(new TextDecoder().decode(values.get(prefix + 'revision'))) as number : 0;
      if (revision !== batch.expectedRevision || failNext) { failNext = false;
        const error = { code: revision !== batch.expectedRevision ? 'STORAGE_STALE' : 'STORAGE_FAILED', message: 'injected', severity: 'error' as const,
          owner: 'M07' as const, related: [], actions: ['retry' as const] };
        return { ok: false as const, error, issues: [error] }; }
      for (const item of batch.writes) values.set(item.key, new Uint8Array(item.bytes));
      for (const key of batch.deletes) values.delete(key);
      return success({ revision: revision + 1 });
    },
  };
  return { storage, values, rejectNext() { failNext = true; } };
}

describe('PlayerDataService', () => {
  it('persists current main-story context independently of an older continue save and resets it with saves', async () => {
    const memory=host(),domain=FixtureDomains[0]!,create=()=>new PlayerDataService({target:'web',storage:memory.storage},domain,'zh-CN','zh-CN');
    const data=create();expect((await data.open()).ok).toBe(true);expect(data.current()!.currentMainStory).toBeNull();
    const current={characterId:FixtureIds.an,variableId:FixtureIds.relation,effectiveName:'春灯',completed:true};
    expect((await data.saveCurrentMainStory(current)).ok).toBe(true);
    const record=structuredClone(FixtureSaveRecord);record.kind='continue';
    expect((await data.save({kind:'continue',record,expectedIndexRevision:data.current()!.index.revision})).ok).toBe(true);
    const reopened=create();expect((await reopened.open()).ok).toBe(true);expect(reopened.current()!.currentMainStory).toEqual(current);
    memory.rejectNext();expect((await reopened.saveCurrentMainStory({...current,effectiveName:'旧档',completed:false})).ok).toBe(false);
    expect(reopened.current()!.currentMainStory).toEqual(current);
    expect((await reopened.clear(['saves'])).ok).toBe(true);expect(reopened.current()!.currentMainStory).toBeNull();
    expect((await create().open()).ok).toBe(true);
  });
  it('fills the visible page of an existing short index and saves to the selected new slot', async () => {
    const memory=host(),domain=FixtureDomains[0]!,prefix=`player/${domain.projectId}/${domain.kind}/${encodeURIComponent(domain.instance)}/`;
    memory.values.set(prefix+'index',new TextEncoder().encode(JSON.stringify({schemaVersion:1,revision:2,manual:[{slotId:'SlotAA',order:0,recordId:null}],quick:[],auto:[],continueRecordId:null})));
    const data=new PlayerDataService({target:'web',storage:memory.storage},domain,'zh-CN','zh-CN');await data.open();
    const index=data.current()!.index,slot=index.manual[7]!;expect(index.manual).toHaveLength(12);expect(index.manual[0]!.slotId).toBe('SlotAA');
    expect((await data.save({kind:'manual',slotId:slot.slotId,record:FixtureSaveRecord,expectedIndexRevision:2})).ok).toBe(true);
    const reopened=new PlayerDataService({target:'web',storage:memory.storage},domain,'zh-CN','zh-CN');await reopened.open();
    expect(reopened.current()!.index.manual[7]).toMatchObject({slotId:slot.slotId,recordId:FixtureSaveRecord.recordId});expect(reopened.current()!.index.manual[0]!.recordId).toBeNull();
  });
  it('keeps a quick save when an autosave commits during stage capture', async () => {
    const memory = host();
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    let first = true;
    const storage: PlayerHost['storage'] = { read: memory.storage.read,
      commit: async batch => { if (first) { first = false; entered(); await held; }
        return memory.storage.commit(batch); } };
    const data = new PlayerDataService({ target: 'web', storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    await data.open();
    const autoRecord = { ...FixtureSaveRecord, kind: 'auto' as const, recordId: crypto.randomUUID() };
    const quickRecord = { ...FixtureSaveRecord, kind: 'quick' as const, recordId: crypto.randomUUID() };
    const autosave = data.save({ kind: 'auto', record: autoRecord, expectedIndexRevision: 0,
      occurrenceKey: 'first/entrance' });
    await started;
    const quickSave = savePreparedRecord(data, { kind: 'quick', record: quickRecord }, null);
    release();
    expect((await autosave).ok).toBe(true);
    expect((await quickSave).ok).toBe(true);
    expect(data.current()?.index.auto).toEqual([autoRecord.recordId]);
    expect(data.current()?.index.quick).toEqual([quickRecord.recordId]);
    const stored = await data.record(quickRecord.recordId);
    expect(stored.ok && stored.value?.recordId).toBe(quickRecord.recordId);
  });
  it('keeps an entrance autosave when a user save commits first and deduplicates its occurrence', async () => {
    const memory = host();
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    let first = true;
    const storage: PlayerHost['storage'] = { read: memory.storage.read,
      commit: async batch => { if (first) { first = false; entered(); await held; }
        return memory.storage.commit(batch); } };
    const data = new PlayerDataService({ target: 'web', storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    await data.open();
    const quickRecord = { ...FixtureSaveRecord, kind: 'quick' as const, recordId: crypto.randomUUID() };
    const autoRecord = { ...FixtureSaveRecord, kind: 'auto' as const, recordId: crypto.randomUUID() };
    const quickSave = savePreparedRecord(data, { kind: 'quick', record: quickRecord }, null);
    await started;
    const autosave = savePreparedRecord(data, { kind: 'auto', record: autoRecord,
      occurrenceKey: 'session/entrance' }, null);
    release();
    expect((await quickSave).ok).toBe(true);
    expect((await autosave).ok).toBe(true);
    expect(data.current()?.index.quick).toEqual([quickRecord.recordId]);
    expect(data.current()?.index.auto).toEqual([autoRecord.recordId]);
    const repeated = await savePreparedRecord(data, { kind: 'auto',
      record: { ...autoRecord, recordId: crypto.randomUUID() }, occurrenceKey: 'session/entrance' }, null);
    expect(repeated.ok).toBe(true);
    expect(data.current()?.index.auto).toEqual([autoRecord.recordId]);
    const stored = await data.record(autoRecord.recordId);
    expect(stored.ok && stored.value?.recordId).toBe(autoRecord.recordId);
  });
  it('does not overwrite a manual slot changed while its thumbnail was captured', async () => {
    const memory = host();
    const data = new PlayerDataService({ target: 'web', storage: memory.storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    await data.open();
    const original = await data.save({ kind: 'manual', record: FixtureSaveRecord, expectedIndexRevision: 0 });
    if (!original.ok) throw original.error;
    const slotId = original.value.manual[0]!.slotId;
    const newer = { ...FixtureSaveRecord, recordId: crypto.randomUUID() };
    const replaced = await data.save({ kind: 'manual', slotId, record: newer,
      expectedIndexRevision: original.value.revision, overwriteConfirmed: true });
    if (!replaced.ok) throw replaced.error;
    const stale = await savePreparedRecord(data, { kind: 'manual', slotId,
      record: { ...FixtureSaveRecord, recordId: crypto.randomUUID() }, overwriteConfirmed: true }, FixtureSaveRecord.recordId);
    expect(stale.ok || stale.error.code).toBe('INDEX_STALE');
    expect(data.current()?.index.manual[0]?.recordId).toBe(newer.recordId);
  });
  it('keeps the previous slot and revision when an overwrite transaction fails', async () => {
    const memory = host();
    const data = new PlayerDataService({ target: 'web', storage: memory.storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    const opened = await data.open(); expect(opened.ok).toBe(true);
    const saved = await data.save({ kind: 'manual', record: FixtureSaveRecord, expectedIndexRevision: 0 });
    expect(saved.ok).toBe(true); if (!saved.ok) return;
    const slot = saved.value.manual[0]!;
    memory.rejectNext();
    const rejected = await data.save({ kind: 'manual', slotId: slot.slotId,
      record: { ...FixtureSaveRecord, recordId: crypto.randomUUID() }, expectedIndexRevision: saved.value.revision,
      overwriteConfirmed: true });
    expect(rejected.ok).toBe(false);
    expect(data.current()?.index.manual[0]?.recordId).toBe(FixtureSaveRecord.recordId);
    const reopened = new PlayerDataService({ target: 'web', storage: memory.storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    const disk = await reopened.open(); expect(disk.ok && disk.value.index.manual[0]?.recordId).toBe(FixtureSaveRecord.recordId);
  });
  it('isolates player and playtest profiles and keeps long-term data when clearing preferences', async () => {
    const memory = host();
    const player = new PlayerDataService({ target: 'web', storage: memory.storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    const playtest = new PlayerDataService({ target: 'web', storage: memory.storage }, FixtureDomains[1]!, 'zh-CN', 'zh-CN');
    await player.open(); await playtest.open();
    const preferences = player.current()!.preferences;
    const updated = await player.savePreferences({ ...preferences, menuLocale: 'ja' }, preferences.revision);
    expect(updated.ok && updated.value.menuLocale).toBe('ja');
    const longTerm = player.current()!.longTerm;
    const saved = await player.saveLongTerm({ ...longTerm, endings: ['ending-a'] }, longTerm.revision);
    expect(saved.ok).toBe(true);
    const cleared = await player.clear(['preferences']);
    expect(cleared.ok && cleared.value.preferences.menuLocale).toBe('zh-CN');
    expect(cleared.ok && cleared.value.longTerm.endings).toEqual(['ending-a']);
    expect(playtest.current()?.preferences.menuLocale).toBe('zh-CN');
  });
});

describe('DataImportService', () => {
  it('imports main and two distinct afterstory continue records together and still rejects a repeated entry target',async()=>{
    const memory=host(),data=new PlayerDataService({target:'web',storage:memory.storage},FixtureDomains[0]!,'zh-CN','zh-CN');await data.open();
    const coordinator={context:()=>success({snapshot:FixtureSnapshot,target:'web',domain:FixtureDomains[0]!,longTerm:data.current()!.longTerm,preferences:data.current()!.preferences,entryMappings:[],expectedActiveSessionId:null}),
      prepareRestore:async()=>success({compatibility:'readable'}),disposePreparedRestore:()=>{}} as unknown as RestoreCoordinator;
    const records=[undefined,'Entry1','Entry2'].map(entryId=>{const record=structuredClone(FixtureSaveRecord);record.recordId=crypto.randomUUID();record.kind='continue';record.state.story=entryId?{kind:'afterstory',entryId,characterId:'Hero01',title:entryId}:{kind:'main'};return record;});
    const importer=new DataImportService(data,coordinator,FixtureSnapshot),source:PlayerDataPackage={format:'galcraft-player-data',schemaVersion:1,projectId:FixtureSnapshot.projectId,createdAt:'2026-10-18T00:00:00Z',releaseVersions:['0.1.0'],records,index:data.current()!.index,longTerm:null,preferences:null};
    const initial=await importer.planDataImport({source:{label:'three continues',package:source}});if(!initial.ok)throw initial.error;
    const selection={records:records.map(record=>({sourceId:record.recordId,action:'emptySlot' as const,destination:{kind:'continue' as const}})),variableChoices:{},preferences:'keepLocal' as const};
    const planned=await importer.planDataImport({previousPlanId:initial.value.id,selection});if(!planned.ok)throw planned.error;expect(planned.value.canApply).toBe(true);
    const applied=await importer.applyDataImport(planned.value.id);expect(applied.ok).toBe(true);
    expect(data.current()!.index.continueRecordId).toBe(records[0]!.recordId);expect(data.current()!.index.afterstoryRecords).toEqual({Entry1:records[1]!.recordId,Entry2:records[2]!.recordId});
    const repeated=structuredClone(source);repeated.records[2]!.state.story=structuredClone(repeated.records[1]!.state.story);
    const repeatPlan=await importer.planDataImport({source:{label:'repeated entry',package:repeated}});if(!repeatPlan.ok)throw repeatPlan.error;
    expect(await importer.planDataImport({previousPlanId:repeatPlan.value.id,selection})).toMatchObject({ok:false,error:{code:'IMPORT_TARGET_DUPLICATE'}});
  });
  it('keeps an existing record when an imported record has the same identity', async () => {
    const memory = host();
    const data = new PlayerDataService({ target: 'web', storage: memory.storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    await data.open();
    const local = await data.save({ kind: 'manual', record: FixtureSaveRecord, expectedIndexRevision: 0 });
    if (!local.ok) throw local.error;
    const coordinator = { context: () => success({ snapshot: FixtureSnapshot, target: 'web',
      domain: FixtureDomains[0]!, longTerm: data.current()!.longTerm, preferences: data.current()!.preferences,
      entryMappings: [], expectedActiveSessionId: null }),
      prepareRestore: async () => success({ compatibility: 'readable' }), disposePreparedRestore: () => {},
    } as unknown as RestoreCoordinator;
    const importer = new DataImportService(data, coordinator, FixtureSnapshot);
    const source: PlayerDataPackage = { format: 'galcraft-player-data', schemaVersion: 1,
      projectId: FixtureSnapshot.projectId, createdAt: '2026-09-23T00:00:00Z', releaseVersions: ['0.1.0'],
      records: [FixtureSaveRecord], index: { schemaVersion: 1, revision: 0, manual: [], quick: [], auto: [],
        continueRecordId: null }, longTerm: null, preferences: null };
    const first = await importer.planDataImport({ source: { label: 'package', package: source } });
    if (!first.ok) throw first.error;
    const second = await importer.planDataImport({ previousPlanId: first.value.id, selection: {
      records: [{ sourceId: FixtureSaveRecord.recordId, action: 'emptySlot',
        destination: { kind: 'manual', slotId: crypto.randomUUID() } }], variableChoices: {}, preferences: 'keepLocal',
    } });
    if (!second.ok) throw second.error;
    expect(second.value.canApply).toBe(true);
    const receipt = await importer.applyDataImport(second.value.id);
    if (!receipt.ok) throw receipt.error;
    expect(receipt.value.importedRecordIds[0]).not.toBe(FixtureSaveRecord.recordId);
    const ids = data.current()!.index.manual.map(slot => slot.recordId);
    expect(ids).toContain(FixtureSaveRecord.recordId);
    expect(ids).toContain(receipt.value.importedRecordIds[0]);
  });
  it('declares flow entry release versions even when the exported package has no saves', async () => {
    const memory = host();
    const data = new PlayerDataService({ target: 'web', storage: memory.storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    await data.open();
    const longTerm = { ...data.current()!.longTerm, flowEntries: { [FixtureFlowEntry.nodeId]: FixtureFlowEntry } };
    const releases = dataReleaseVersions([], longTerm);
    expect(releases).toEqual([FixtureFlowEntry.releaseVersion]);
    const coordinator = { context: () => success({ snapshot: FixtureSnapshot, target: 'web',
      domain: FixtureDomains[0]!, longTerm: data.current()!.longTerm, preferences: data.current()!.preferences,
      entryMappings: [], expectedActiveSessionId: null }),
      prepareRestore: async () => success({ compatibility: 'readable' }), disposePreparedRestore: () => {},
    } as unknown as RestoreCoordinator;
    const importer = new DataImportService(data, coordinator, FixtureSnapshot);
    const source: PlayerDataPackage = { format: 'galcraft-player-data', schemaVersion: 1,
      projectId: FixtureSnapshot.projectId, createdAt: '2026-09-23T00:00:00Z', releaseVersions: releases,
      records: [], index: data.current()!.index, longTerm, preferences: null };
    const plan = await importer.planDataImport({ source: { label: 'round-trip', package: source } });
    expect(plan.ok).toBe(true);
  });
  it('rejects repeated overwrite targets and applies two distinct manual targets without dangling records', async () => {
    const memory = host();
    const data = new PlayerDataService({ target: 'web', storage: memory.storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    await data.open();
    const secondLocal = { ...FixtureSaveRecord, recordId: crypto.randomUUID() };
    const first = await data.save({ kind: 'manual', record: FixtureSaveRecord, expectedIndexRevision: 0 });
    if (!first.ok) throw first.error;
    const second = await data.save({ kind: 'manual', record: secondLocal, expectedIndexRevision: first.value.revision });
    if (!second.ok) throw second.error;
    const coordinator = { context: () => success({ snapshot: FixtureSnapshot, target: 'web',
      domain: FixtureDomains[0]!, longTerm: data.current()!.longTerm, preferences: data.current()!.preferences,
      entryMappings: [], expectedActiveSessionId: null }),
      prepareRestore: async () => success({ compatibility: 'readable' }), disposePreparedRestore: () => {},
    } as unknown as RestoreCoordinator;
    const importer = new DataImportService(data, coordinator, FixtureSnapshot);
    const imported = [FixtureSaveRecord, secondLocal].map(record => ({ ...record, recordId: crypto.randomUUID() }));
    const source: PlayerDataPackage = { format: 'galcraft-player-data', schemaVersion: 1,
      projectId: FixtureSnapshot.projectId, createdAt: '2026-09-23T00:00:00Z', releaseVersions: ['0.1.0'],
      records: imported, index: data.current()!.index, longTerm: null, preferences: null };
    const initial = await importer.planDataImport({ source: { label: 'two records', package: source } });
    if (!initial.ok) throw initial.error;
    const slots = data.current()!.index.manual;
    const sameTarget = await importer.planDataImport({ previousPlanId: initial.value.id, selection: {
      records: imported.map(record => ({ sourceId: record.recordId, action: 'overwrite' as const,
        destination: { kind: 'manual' as const, slotId: slots[0]!.slotId } })),
      variableChoices: {}, preferences: 'keepLocal' } });
    expect(sameTarget.ok).toBe(false);
    if (!sameTarget.ok) expect(sameTarget.error.code).toBe('IMPORT_TARGET_DUPLICATE');
    const distinct = await importer.planDataImport({ previousPlanId: initial.value.id, selection: {
      records: imported.map((record, index) => ({ sourceId: record.recordId, action: 'overwrite' as const,
        destination: { kind: 'manual' as const, slotId: slots[index]!.slotId } })),
      variableChoices: {}, preferences: 'keepLocal' } });
    if (!distinct.ok) throw distinct.error;
    expect(distinct.value.canApply).toBe(true);
    const applied = await importer.applyDataImport(distinct.value.id);
    if (!applied.ok) throw applied.error;
    for (const recordId of applied.value.importedRecordIds) {
      expect(data.current()!.index.manual.some(slot => slot.recordId === recordId)).toBe(true);
      const stored = await data.record(recordId); expect(stored.ok && stored.value?.recordId).toBe(recordId);
    }
  });
});

describe('player archive', () => {
  it('round-trips manifest and binary thumbnails and rejects damaged contents', () => {
    const files = { 'manifest.json': new TextEncoder().encode('{"schemaVersion":1}'),
      'thumbnails/one.png': new Uint8Array([0, 255, 1, 128]) };
    const archive = writeArchive(files);
    expect(readArchive(archive)).toEqual(files);
    archive[43] = archive[43]! ^ 1;
    expect(() => readArchive(archive)).toThrow();
  });
});

describe('navigation and input ownership', () => {
  it('returns to the source page and consumes one hardware event once', () => {
    const pages = new PageNavigator(); pages.replace('story');
    pages.open('settings', { focusKey: 'toolbar.settings', scroll: 120 });
    expect(pages.back()).toMatchObject({ originPage: 'story', originFocus: 'toolbar.settings', originScroll: 120 });
    expect(pages.page).toBe('story');
    const router = new InputRouter(), id = crypto.randomUUID();
    const event = { kind: 'keyboard' as const, key: 'Enter', button: null, deltaY: 0, composing: false,
      repeat: false, target: 'field' as const, origin: 'physical' as const, eventId: id };
    const state = { page: 'story', modal: false, video: false, fading: false, hiddenUI: false,
      emergency: false, movieSkip: true, rightButton: 'escape' as const,
      wheelUp: 'history' as const, wheelDown: 'advance' as const };
    expect(router.route(event, state)).toBeNull();
    expect(router.route({ ...event, target: 'stage' }, state)).toBe('advance');
    expect(router.route({ ...event, target: 'stage' }, state)).toBeNull();
    expect(router.route({ ...event, eventId: crypto.randomUUID(), key: 'Escape' }, { ...state, video: true })).toBeNull();
    expect(router.route({ ...event, eventId: crypto.randomUUID(), key: null, origin: 'mouseRight', target: 'stage' },
      { ...state, video: true })).toBe('videoSkip');
  });
});

describe('automatic reading readiness', () => {
  it('reports a short rendered paragraph at the end without a scroll event', () => {
    expect(readingViewport({ scrollTop: 0, scrollHeight: 120, clientHeight: 120 }, 18))
      .toEqual({ textAnchor: 0, atEnd: true });
    expect(readingViewport({ scrollTop: 0, scrollHeight: 360, clientHeight: 120 }, 80).atEnd).toBe(false);
  });
  it('waits for the dialogue token voice to end', () => {
    const token = { sessionId: crypto.randomUUID(), occurrence: 1, statementId: FixtureIds.statements[0]! };
    const voice = { ...FixtureSaveRecord.state.presentation.voice, assetId: FixtureIds.background } as
      NonNullable<typeof FixtureSaveRecord.state.presentation.voice>;
    const mixer = (status: string) => ({ inspect: () => success({ status }) }) as unknown as Pick<AudioMixer, 'inspect'>;
    expect(dialogueVoiceEnded(mixer('playing'), token.sessionId, token, voice)).toBe(false);
    expect(dialogueVoiceEnded(mixer('ended'), token.sessionId, token, voice)).toBe(true);
    expect(dialogueVoiceEnded(mixer('loading'), token.sessionId, token, voice)).toBe(false);
    expect(dialogueVoiceEnded(mixer('playing'), token.sessionId, token, null)).toBe(true);
  });
  it('starts the wait only after text, viewport, voice and animation are ready together', () => {
    const ready = { textComplete: true, textAtEnd: true, voiceEnded: true, animationComplete: true };
    let clock = autoReadClock(null, 0, { ...ready, voiceEnded: false });
    clock = autoReadClock(clock.readyAt, 5000, ready);
    expect(clock.elapsedMs).toBe(0);
    clock = autoReadClock(clock.readyAt, 6000, ready);
    expect(clock.elapsedMs).toBe(1000);
    clock = autoReadClock(clock.readyAt, 6100, { ...ready, textAtEnd: false });
    expect(clock).toEqual({ readyAt: null, elapsedMs: 0 });
    clock = autoReadClock(clock.readyAt, 9000, ready);
    expect(clock.elapsedMs).toBe(0);
    clock = autoReadClock(clock.readyAt, 9500, { ...ready, animationComplete: false });
    expect(clock.readyAt).toBeNull();
    clock = autoReadClock(clock.readyAt, 12000, ready);
    expect(clock.elapsedMs).toBe(0);
  });
});

describe('long-term retry', () => {
  it('rebases collection deltas over a real storage revision change without replacing unrelated unlocks',async()=>{
    const memory=host(),domain=FixtureDomains[0]!;
    const data=new PlayerDataService({target:'web',storage:memory.storage},domain,'zh-CN','zh-CN');await data.open();
    const service=new PlayerLongTermService(data),base=service.current(domain),sessionId=crypto.randomUUID();service.setActiveSession(sessionId);
    const other=new PlayerDataService({target:'web',storage:memory.storage},domain,'zh-CN','zh-CN');const opened=await other.open();if(!opened.ok)throw Error('open');
    await other.saveLongTerm({...opened.value.longTerm,endings:['external']},0);
    const input={domain,sessionId,sequence:1,expectedRevision:base.revision,base,next:{...base,readStatements:['LineAA']}};
    expect((await service.commitRuntimeLongTerm(input)).ok).toBe(true);
    expect(service.current(domain)).toMatchObject({readStatements:['LineAA'],endings:['external']});
    const revision=service.current(domain).revision;await service.commitRuntimeLongTerm(input);expect(service.current(domain).revision).toBe(revision);
  });
  it('retries the same committed delta after a storage failure', async () => {
    const memory = host();
    const data = new PlayerDataService({ target: 'web', storage: memory.storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    await data.open();
    const service = new PlayerLongTermService(data), sessionId = crypto.randomUUID();
    service.setActiveSession(sessionId);
    const next = { ...service.current(FixtureDomains[0]!), endings: ['ending-a'] };
    memory.rejectNext();
    const input = { domain: FixtureDomains[0]!, sessionId, sequence: 1, expectedRevision: 0, next };
    expect((await service.commitRuntimeLongTerm(input)).ok).toBe(false);
    expect(service.current(FixtureDomains[0]!).endings).toEqual([]);
    const retried = await service.commitRuntimeLongTerm(input);
    expect(retried.ok && retried.value.revision).toBe(1);
    const disk = new PlayerDataService({ target: 'web', storage: memory.storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    const reopened = await disk.open();
    expect(reopened.ok && reopened.value.longTerm.endings).toEqual(['ending-a']);
  });
});

describe('RestoreCoordinator', () => {
  it('retains afterstory saves but blocks every restored save kind after clearing endings until the route is completed again', async () => {
    const snapshot = structuredClone(FixtureSnapshot), character = snapshot.characters[0]!;
    character.narrativeRole = 'main'; character.personalRoute = { sceneIds: [snapshot.project.entry.sceneId], endingIds: ['route-a'] };
    character.afterstory = { id: 'Entry1', title: '后日谈', entry: snapshot.project.entry, initialProgress: {}, unlockEndingIds: ['route-a'], lockedView: 'locked' };
    const { data, coordinator, getActive } = setup(snapshot); await data.open();
    const record = structuredClone(FixtureSaveRecord); record.state.story = { kind: 'afterstory', entryId: 'Entry1', characterId: character.id, title: '后日谈' };
    const profile = data.current()!; await data.saveLongTerm({ ...profile.longTerm, endings: ['route-a'] }, profile.longTerm.revision);
    const saved = await data.save({ kind: 'manual', record, expectedIndexRevision: data.current()!.index.revision }); expect(saved.ok).toBe(true);
    const before = coordinator.context(); if (!before.ok) throw before.error;
    expect((await coordinator.prepareLoad({ requestId: crypto.randomUUID(), recordId: record.recordId, context: before.value })).ok).toBe(true);
    await data.clear(['longTerm']); expect((await data.record(record.recordId)).ok).toBe(true);
    const cleared = coordinator.context(); if (!cleared.ok) throw cleared.error;
    for (const kind of ['manual', 'quick', 'auto', 'continue'] as const) {
      const blocked = await coordinator.prepareRestore({ requestId: crypto.randomUUID(), purpose: 'activate', source: { kind: 'save', record: { ...record, kind } }, context: cleared.value });
      expect(blocked.ok || blocked.error.code).toBe('AFTERSTORY_LOCKED');
    }
    expect(getActive()).toBeNull();
    await data.saveLongTerm({ ...data.current()!.longTerm, endings: ['route-a'] }, data.current()!.longTerm.revision);
    const restored = coordinator.context(); if (!restored.ok) throw restored.error;
    expect((await coordinator.prepareLoad({ requestId: crypto.randomUUID(), recordId: record.recordId, context: restored.value })).ok).toBe(true);
  });
  function setup(snapshot: Snapshot = FixtureSnapshot, mappings: EntryMapping[] = []) {
    const memory = host();
    const data = new PlayerDataService({ target: 'web', storage: memory.storage }, FixtureDomains[0]!, 'zh-CN', 'zh-CN');
    let active: string | null = null;
    const discarded: string[] = [];
    const session = {
      inspect: () => active ? { sessionId: active } : null,
      prepareSession: async (input: { source: { state: typeof FixtureSaveRecord.state } }, key: { sessionId: string; snapshotId: string }) =>
        success({ id: crypto.randomUUID(), sessionId: key.sessionId, snapshotId: key.snapshotId,
          state: input.source.state, voiceBinding: null, reached: true, blockedAt: null, issues: [], restoreKey: key }),
      activate: (id: string) => { active = id; return success({ sessionId: id }); },
      disposePrepared: (id: string) => { discarded.push(id); },
    } as unknown as SessionController;
    const stage = {
      prepareStage: async (sessionId: string, _state: unknown, key: unknown) => success({ id: crypto.randomUUID(), sessionId,
        restoreKey: key, state: FixtureSaveRecord.state.presentation, voiceBinding: null, resources: [] }),
      commitStage: () => success(undefined), discardPrepared: (id: string) => { discarded.push(id); },
      disposeRetiredStage: (id: string) => { discarded.push(id); },
    } as unknown as StageController;
    const plugins: PluginRestorePort = { prepare: input => success({ id: crypto.randomUUID(), key: input.key,
      progress: input.progress, conversions: [] }), release: id => { discarded.push(id); } };
    const coordinator = new RestoreCoordinator(snapshot, data, session, stage, plugins, mappings);
    return { data, coordinator, discarded, getActive: () => active };
  }
  it('keeps validation in a sample domain and never activates it', async () => {
    const { data, coordinator, getActive } = setup(); await data.open();
    const context = coordinator.context(); expect(context.ok).toBe(true); if (!context.ok) return;
    const requestId = crypto.randomUUID();
    const prepared = await coordinator.prepareRestore({ requestId, purpose: 'validate',
      source: { kind: 'save', record: FixtureSaveRecord },
      context: { ...context.value, domain: { ...context.value.domain, kind: 'sample', instance: requestId },
        expectedActiveSessionId: null } });
    expect(prepared.ok).toBe(true);
    const committed = coordinator.commitLoad({ requestId, acceptMappings: true });
    expect(committed.ok || committed.error.code).toBe('RESTORE_VALIDATE_ONLY');
    coordinator.disposePreparedRestore(requestId);
    expect(getActive()).toBeNull();
    expect(data.current()?.index.revision).toBe(0);
  });
  it('allows only the newest activation request', async () => {
    const { data, coordinator, getActive, discarded } = setup(); await data.open();
    const context = coordinator.context(); if (!context.ok) throw context.error;
    const a = crypto.randomUUID(), b = crypto.randomUUID();
    expect((await coordinator.prepareRestore({ requestId: a, purpose: 'activate',
      source: { kind: 'save', record: FixtureSaveRecord }, context: context.value })).ok).toBe(true);
    expect((await coordinator.prepareRestore({ requestId: b, purpose: 'activate',
      source: { kind: 'save', record: FixtureSaveRecord }, context: context.value })).ok).toBe(true);
    const stale = coordinator.commitLoad({ requestId: a, acceptMappings: true });
    expect(stale.ok || stale.error.code).toBe('RESTORE_STALE');
    const latest = coordinator.commitLoad({ requestId: b, acceptMappings: true });
    expect(latest.ok).toBe(true);
    expect(getActive()).not.toBeNull(); expect(discarded.length).toBeGreaterThan(0);
  });
  it('reads an older release at the same position and maps only a removed statement', async () => {
    const newer = { ...FixtureSnapshot, releaseVersion: '1.1.0',
      scenes: FixtureSnapshot.scenes.map(scene => ({ ...scene, instructions: [...scene.instructions] })) };
    const { data, coordinator } = setup(newer); await data.open();
    const context = coordinator.context(); if (!context.ok) throw context.error;
    const direct = await coordinator.prepareRestore({ requestId: crypto.randomUUID(), purpose: 'activate',
      source: { kind: 'save', record: FixtureSaveRecord }, context: context.value });
    expect(direct.ok && direct.value.compatibility).toBe('readable');
    const removed = { ...newer, scenes: newer.scenes.map(scene => scene.scene.id === FixtureIds.street ?
      { ...scene, instructions: scene.instructions.filter(item => item.statementId !== FixtureIds.statements[0]) } : scene) };
    const mapping: EntryMapping = { oldRelease: '0.1.0', oldSceneId: FixtureIds.street,
      oldStatementId: FixtureIds.statements[0]!, newSceneId: FixtureIds.street,
      newStatementId: FixtureIds.statements[1]!, reason: '旧首句已移除' };
    const mappedSetup = setup(removed, [mapping]); await mappedSetup.data.open();
    const mappedContext = mappedSetup.coordinator.context(); if (!mappedContext.ok) throw mappedContext.error;
    const mapped = await mappedSetup.coordinator.prepareRestore({ requestId: crypto.randomUUID(), purpose: 'activate',
      source: { kind: 'save', record: FixtureSaveRecord }, context: mappedContext.value });
    expect(mapped.ok && mapped.value.compatibility).toBe('mapped');
    if (mapped.ok) expect(mapped.value.position.statementId).toBe(FixtureIds.statements[1]);
    const absent = await mappedSetup.coordinator.prepareRestore({ requestId: crypto.randomUUID(), purpose: 'activate',
      source: { kind: 'save', record: { ...FixtureSaveRecord,
        state: { ...FixtureSaveRecord.state, position: { sceneId: crypto.randomUUID(), statementId: null } } } },
      context: mappedContext.value });
    expect(absent.ok || absent.error.code).toBe('RESTORE_MAPPING');
  });
});
